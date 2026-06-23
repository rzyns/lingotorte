import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { makeMediaAsset } from '../../packages/domain/src';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src';
import { startLingotorteLocalService } from '../../apps/local-service/src/server';
import type { CommandRunner, ElevenLabsHttpClient } from '../../packages/local-transcription/src';

const fingerprint = 'sha256:1111111111111111111111111111111111111111111111111111111111111111' as const;

async function makeTempConfig() {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-local-service-'));
  return {
    root,
    config: {
      host: '127.0.0.1',
      port: 0,
      databasePath: join(root, 'state.db'),
      scratchDir: join(root, 'scratch'),
      modelCacheDir: join(root, 'models'),
      allowOnlineProviders: false,
    },
  } as const;
}

async function waitForJob(origin: string, id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 20; i++) {
    const body = await fetch(`${origin}/api/jobs/${id}`).then((response) => response.json()) as Record<string, unknown>;
    const job = body.job as Record<string, unknown> | undefined;
    if (job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled') return body;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  }
  throw new Error(`Timed out waiting for local job ${id}`);
}

describe('Lingotorte loopback local service', () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()!();
    }
  });

  it('refuses non-loopback bind hosts before opening a server', async () => {
    const { root, config } = await makeTempConfig();
    cleanups.push(() => rm(root, { recursive: true, force: true }));

    await expect(startLingotorteLocalService({ ...config, host: '0.0.0.0' })).rejects.toThrow(/loopback/i);
  });

  it('serves health and redacted status on loopback', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    expect(service.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const health = await fetch(`${service.origin}/api/health`).then((response) => response.json());
    expect(health).toMatchObject({ ok: true, service: 'lingotorte-local-service' });

    const status = await fetch(`${service.origin}/api/status`).then((response) => response.json());
    expect(status.ok).toBe(true);
    expect(status.config.host).toBe('127.0.0.1');
    expect(status.config.databasePath).toBe('[local-sqlite]');
    expect(JSON.stringify(status)).not.toContain(root);
  });

  it('persists a LocalStoreSnapshot through the HTTP state API and SQLite restart', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => rm(root, { recursive: true, force: true }));

    const snapshot = createEmptyLocalStoreSnapshot();
    const media = makeMediaAsset({
      title: 'HTTP persisted media',
      originalPath: 'fixtures/media/synthetic-polish-dialogue.webm',
      contentSha256: fingerprint,
      durationMs: 2000,
      container: 'webm',
      sizeBytes: 1024,
      privacyLabel: 'synthetic',
    });
    snapshot.mediaAssets[media.id] = media;

    const saveResponse = await fetch(`${service.origin}/api/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snapshot }),
    });
    expect(saveResponse.status).toBe(200);
    await service.close();

    const restarted = await startLingotorteLocalService(config);
    cleanups.push(() => restarted.close());
    const loaded = await fetch(`${restarted.origin}/api/state`).then((response) => response.json());

    expect(loaded.snapshot.mediaAssets[media.id]).toEqual(media);
  });

  it('creates, reads, and cancels local jobs without external side effects', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'waiting', payload: { label: 'test job' } }),
    }).then((response) => response.json());
    expect(created.job).toMatchObject({ kind: 'waiting', status: 'queued' });

    const read = await fetch(`${service.origin}/api/jobs/${created.job.id}`).then((response) => response.json());
    expect(read.job.id).toBe(created.job.id);

    const cancelled = await fetch(`${service.origin}/api/jobs/${created.job.id}/cancel`, { method: 'POST' }).then((response) => response.json());
    expect(cancelled.job.status).toBe('cancelled');
  });

  it('runs public YouTube caption reads only with explicit local-service online and public-read opt-in', async () => {
    const { root, config } = await makeTempConfig();
    const requestedUrls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({
        events: [
          { tStartMs: 0, dDurationMs: 1200, segs: [{ utf8: 'Public ' }, { utf8: 'caption.' }] },
          { tStartMs: 1200, dDurationMs: 800, segs: [{ utf8: 'Second cue.' }] },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const disabled = await startLingotorteLocalService(config, { fetchImpl });
    let disabledClosed = false;
    cleanups.push(async () => {
      if (!disabledClosed) await disabled.close();
      await rm(root, { recursive: true, force: true });
    });

    const disabledCreated = await fetch(`${disabled.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'youtube-caption',
        payload: { url: 'https://www.youtube.com/watch?v=abcdefghijk', language: 'pl', allowPublicRead: true },
      }),
    }).then((response) => response.json());
    const disabledResult = await waitForJob(disabled.origin, disabledCreated.job.id);
    expect(disabledResult.job).toMatchObject({ kind: 'youtube-caption', status: 'failed' });
    expect(JSON.stringify(disabledResult)).toMatch(/disabled/i);
    expect(requestedUrls).toHaveLength(0);

    await disabled.close();
    disabledClosed = true;
    const enabled = await startLingotorteLocalService({ ...config, allowOnlineProviders: true }, { fetchImpl });
    cleanups.push(() => enabled.close());
    const created = await fetch(`${enabled.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'youtube-caption',
        payload: { url: 'https://www.youtube.com/watch?v=abcdefghijk', language: 'pl', allowPublicRead: true },
      }),
    }).then((response) => response.json());
    expect(created.job.payloadSummary).toMatchObject({ source: '[public-youtube-url]', publicReadAuthorized: true });
    const completed = await waitForJob(enabled.origin, created.job.id);
    const completedJob = completed.job as Record<string, unknown>;
    const jobResult = completedJob.result as Record<string, unknown>;

    expect(completed.job).toMatchObject({ kind: 'youtube-caption', status: 'completed' });
    expect(requestedUrls[0]).toContain('timedtext');
    expect(JSON.stringify(created)).not.toContain('abcdefghijk');
    expect(jobResult.caption).toMatchObject({
      videoId: 'abcdefghijk',
      language: 'pl',
      isAutoGenerated: true,
      segments: [
        { startMs: 0, endMs: 1200, text: 'Public caption.' },
        { startMs: 1200, endMs: 2000, text: 'Second cue.' },
      ],
    });
  });

  it('runs ElevenLabs Scribe jobs only with service online and provider consent without echoing secrets or paths', async () => {
    const { root, config } = await makeTempConfig();
    const mediaPath = join(root, 'owned-scribe-media.webm');
    await writeFile(mediaPath, 'owned media bytes');
    const requests: Parameters<ElevenLabsHttpClient>[0][] = [];
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      if (command === 'ffmpeg') {
        await writeFile(args[args.length - 1]!, 'fake wav bytes');
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };
    const elevenLabsHttpClient: ElevenLabsHttpClient = async (request) => {
      requests.push(request);
      return {
        status: 200,
        json: {
          text: 'Hello world.',
          language_code: 'eng',
          language_probability: 0.99,
          words: [
            { type: 'word', text: 'Hello', start: 0.08, end: 0.34, logprob: -0.01, speaker_id: 'speaker_0' },
            { type: 'word', text: 'world', start: 0.42, end: 0.76, logprob: -0.02, speaker_id: 'speaker_0' },
          ],
        },
      };
    };

    const disabled = await startLingotorteLocalService(config, {
      commandRunner: runner,
      elevenLabsApiKey: 'test-elevenlabs-key',
      elevenLabsHttpClient,
    });
    let disabledClosed = false;
    cleanups.push(async () => {
      if (!disabledClosed) await disabled.close();
      await rm(root, { recursive: true, force: true });
    });
    const disabledCreated = await fetch(`${disabled.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'elevenlabs-scribe',
        payload: { mediaPath, language: 'en', modelId: 'scribe_v2', allowOnlineProvider: true },
      }),
    }).then((response) => response.json());
    const disabledResult = await waitForJob(disabled.origin, disabledCreated.job.id);
    expect(disabledResult.job).toMatchObject({ kind: 'elevenlabs-scribe', status: 'failed' });
    expect(JSON.stringify(disabledResult)).toMatch(/disabled/i);
    expect(requests).toHaveLength(0);
    expect(calls).toHaveLength(0);

    await disabled.close();
    disabledClosed = true;

    const enabled = await startLingotorteLocalService({ ...config, allowOnlineProviders: true }, {
      commandRunner: runner,
      elevenLabsApiKey: 'test-elevenlabs-key',
      elevenLabsHttpClient,
    });
    cleanups.push(() => enabled.close());
    const denied = await fetch(`${enabled.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'elevenlabs-scribe',
        payload: { mediaPath, language: 'en', modelId: 'scribe_v2', allowOnlineProvider: false },
      }),
    }).then((response) => response.json());
    const deniedResult = await waitForJob(enabled.origin, denied.job.id);
    expect(deniedResult.job).toMatchObject({ kind: 'elevenlabs-scribe', status: 'failed' });
    expect(JSON.stringify(deniedResult)).toMatch(/consent|authorization|disabled/i);
    expect(requests).toHaveLength(0);
    expect(calls).toHaveLength(0);

    const created = await fetch(`${enabled.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'elevenlabs-scribe',
        payload: { mediaPath, language: 'en', modelId: 'scribe_v2', allowOnlineProvider: true },
      }),
    }).then((response) => response.json());
    expect(created.job.payloadSummary).toMatchObject({
      mediaPath: '[local-media-path]',
      language: 'en',
      modelId: 'scribe_v2',
      providerConsent: true,
    });
    const completed = await waitForJob(enabled.origin, created.job.id);
    const completedJob = completed.job as Record<string, unknown>;
    const jobResult = completedJob.result as Record<string, unknown>;
    const serialized = JSON.stringify(completed);

    expect(completed.job).toMatchObject({ kind: 'elevenlabs-scribe', status: 'completed' });
    expect(calls.map((call) => call.command)).toEqual(['ffmpeg']);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers['xi-api-key']).toBe('test-elevenlabs-key');
    expect(requests[0]?.form).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'model_id', value: 'scribe_v2' }),
      expect.objectContaining({ name: 'timestamps_granularity', value: 'word' }),
      expect.objectContaining({ name: 'diarize', value: 'true' }),
      expect.objectContaining({ name: 'language_code', value: 'en' }),
    ]));
    expect(jobResult.transcript).toMatchObject({
      engine: 'elevenlabs',
      modelName: 'scribe_v2',
      language: 'eng',
      segments: [expect.objectContaining({
        text: 'Hello world.',
        words: expect.arrayContaining([expect.objectContaining({
          text: 'Hello',
          startMs: 80,
          endMs: 340,
          sourceKind: 'provider-word-timing',
          speakerId: 'speaker_0',
        })]),
      })],
    });
    expect(serialized).not.toContain(mediaPath);
    expect(serialized).not.toContain(resolve(root));
    expect(serialized).not.toContain('test-elevenlabs-key');
  });

  it('runs local transcription jobs through ffmpeg, faster-whisper, and optional WhisperX alignment without echoing private paths', async () => {
    const { root, config } = await makeTempConfig();
    const mediaPath = join(root, 'owned-local-media.webm');
    await writeFile(mediaPath, 'owned media bytes');
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      if (command === 'ffmpeg') {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (args[0]?.endsWith('faster_whisper_transcribe.py')) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            engine: 'faster-whisper',
            model_name: 'tiny',
            model_version: 'fake-fw-1',
            language: 'pl',
            segments: [{ start: 0, end: 1.4, text: 'Cześć świecie.' }],
          }),
          stderr: '',
        };
      }
      if (args[0]?.endsWith('whisperx_align.py')) {
        const transcriptPath = args[args.indexOf('--transcript-json') + 1]!;
        const handoff = JSON.parse(await readFile(transcriptPath, 'utf-8')) as Record<string, unknown>;
        expect(handoff).toMatchObject({ engine: 'faster-whisper', modelName: 'tiny', language: 'pl' });
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            engine: 'whisperx',
            model_name: 'whisperx-align-pl',
            model_version: 'fake-whisperx-1',
            language: 'pl',
            segments: [{
              start: 0,
              end: 1.4,
              text: 'Cześć świecie.',
              words: [
                { word: 'Cześć', start: 0.05, end: 0.62, score: 0.97, speaker: 'speaker_0' },
                { word: 'świecie', start: 0.7, end: 1.3, score: 0.93, speaker: 'speaker_0' },
              ],
            }],
          }),
          stderr: '',
        };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };
    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'local-transcription',
        payload: {
          mediaPath,
          language: 'pl',
          modelName: 'tiny',
          alignWords: true,
        },
      }),
    }).then((response) => response.json());
    const completed = await waitForJob(service.origin, created.job.id);
    const completedJob = completed.job as Record<string, unknown>;
    const jobResult = completedJob.result as Record<string, unknown>;
    const serialized = JSON.stringify(completed);

    expect(completed.job).toMatchObject({ kind: 'local-transcription', status: 'completed' });
    expect(serialized).not.toContain(mediaPath);
    expect(serialized).not.toContain(resolve(root));
    expect(calls.map((call) => call.command)).toEqual(['ffmpeg', 'python3', 'python3']);
    expect(jobResult.transcript).toMatchObject({
      engine: 'whisperx',
      modelName: 'whisperx-align-pl',
      modelVersion: 'fake-whisperx-1',
      language: 'pl',
      segments: [{
        startMs: 0,
        endMs: 1400,
        text: 'Cześć świecie.',
        words: [{
          text: 'Cześć',
          startMs: 50,
          endMs: 620,
          confidence: 0.97,
          speakerId: 'speaker_0',
          sourceKind: 'forced-alignment',
        }, {
          text: 'świecie',
          startMs: 700,
          endMs: 1300,
          confidence: 0.93,
          speakerId: 'speaker_0',
          sourceKind: 'forced-alignment',
        }],
      }],
    });
  });

  it('redacts private media paths when local transcription jobs fail', async () => {
    const { root, config } = await makeTempConfig();
    const mediaPath = join(root, 'private-failure-media.webm');
    await writeFile(mediaPath, 'owned media bytes');
    const runner: CommandRunner = async () => {
      throw new Error(`ffmpeg could not open ${mediaPath} in ${resolve(root)}`);
    };
    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'local-transcription',
        payload: {
          mediaPath,
          language: 'pl',
          modelName: 'tiny',
          alignWords: false,
        },
      }),
    }).then((response) => response.json());
    const failed = await waitForJob(service.origin, created.job.id);
    const serialized = JSON.stringify(failed);

    expect(failed.job).toMatchObject({ kind: 'local-transcription', status: 'failed' });
    expect(serialized).toContain('[local-path]');
    expect(serialized).not.toContain(mediaPath);
    expect(serialized).not.toContain(resolve(root));
  });

  it('cleans declared scratch artifacts without touching paths outside the scratch root', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const scratchFile = join(config.scratchDir, 'temporary-artifact.txt');
    const outsideFile = join(root, 'outside.txt');
    await writeFile(scratchFile, 'scratch');
    await writeFile(outsideFile, 'outside');

    const result = await fetch(`${service.origin}/api/artifacts/cleanup`, { method: 'POST' }).then((response) => response.json());

    expect(result).toMatchObject({ ok: true });
    expect(result.deletedFiles).toBeGreaterThanOrEqual(1);
    await expect(stat(scratchFile)).rejects.toThrow();
    await expect(stat(outsideFile)).resolves.toBeTruthy();
  });
});
