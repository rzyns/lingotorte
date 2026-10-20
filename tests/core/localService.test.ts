import { startPairedService, pairedFetch } from '../helpers/pairedService.ts';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { makeCue, makeMediaAsset, makeSubtitleTrack, makeTranscriptWordTiming } from '../../packages/domain/src';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence.ts';
import {
  ALLOWED_ASR_MODEL_NAMES,
  resolveDefaultAsrModelName,
} from '../../apps/local-service/src/server';
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
    const body = await pairedFetch(`${origin}/api/jobs/${id}`).then((response) => response.json()) as Record<string, unknown>;
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

  it('resolves the bounded ASR model setting without invoking runtime work or exposing rejected input', () => {
    const warnings: string[] = [];
    const warn = (message: string) => warnings.push(message);

    expect(resolveDefaultAsrModelName(undefined, warn)).toBe('base');
    expect(resolveDefaultAsrModelName('   ', warn)).toBe('base');
    for (const modelName of ALLOWED_ASR_MODEL_NAMES) {
      expect(resolveDefaultAsrModelName(` ${modelName} `, warn)).toBe(modelName);
    }
    expect(warnings).toEqual([]);

    const rejected = 'private-rejected-model-sentinel';
    expect(resolveDefaultAsrModelName(rejected, warn)).toBe('base');
    expect(warnings).toEqual([
      'LINGOTORTE_ASR_MODEL is unsupported; using base. Allowed values: tiny, base, small, medium, large-v3.',
    ]);
    expect(warnings[0]).not.toContain(rejected);
  });

  it('serves a wildcard listener through loopback while retaining private provider defaults', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startPairedService({ ...config, host: '0.0.0.0', serviceHostname: '127.0.0.1' });
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });
    const origin = `http://127.0.0.1:${service.config.port}`;
    expect(await pairedFetch(`${origin}/api/health`).then((response) => response.json())).toMatchObject({ ok: true });
    expect(await pairedFetch(`${origin}/api/status`).then((response) => response.json())).toMatchObject({ config: { host: '0.0.0.0', allowOnlineProviders: false } });
  });

  it('serves health and redacted status on loopback', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startPairedService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    expect(service.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const health = await pairedFetch(`${service.origin}/api/health`).then((response) => response.json());
    expect(health).toMatchObject({ ok: true, service: 'lingotorte-local-service' });

    const status = await pairedFetch(`${service.origin}/api/status`).then((response) => response.json());
    expect(status.ok).toBe(true);
    expect(status.config.host).toBe('127.0.0.1');
    expect(status.config.databasePath).toBe('[local-sqlite]');
    expect(status.config.defaultAsrModelName).toBe('base');
    expect(JSON.stringify(status)).not.toContain(root);
  });

  it('persists a LocalStoreSnapshot through the HTTP state API and SQLite restart', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startPairedService(config);
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
    // lt-584.5 (C4): /api/state carries learner state only; transcript keys are refused.
    const { cues: _cues, transcriptWordTimings: _timings, ...learnerState } = snapshot;

    const saveResponse = await pairedFetch(`${service.origin}/api/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snapshot: learnerState, expectedRevision: (await pairedFetch(`${service.origin}/api/state`).then(r => r.json())).revision }),
    });
    expect(saveResponse.status).toBe(200);
    await service.close();

    const restarted = await startPairedService(config);
    cleanups.push(() => restarted.close());
    const loaded = await pairedFetch(`${restarted.origin}/api/state`).then((response) => response.json());

    expect(loaded.snapshot.mediaAssets[media.id]).toEqual(media);
  });

  it('creates, reads, and cancels local jobs without external side effects', async () => {
    const { root, config } = await makeTempConfig();
    const service = await startPairedService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const created = await pairedFetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'waiting', payload: { label: 'test job' } }),
    }).then((response) => response.json());
    expect(created.job).toMatchObject({ kind: 'waiting', status: 'queued' });

    const read = await pairedFetch(`${service.origin}/api/jobs/${created.job.id}`).then((response) => response.json());
    expect(read.job.id).toBe(created.job.id);

    const cancelled = await pairedFetch(`${service.origin}/api/jobs/${created.job.id}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then((response) => response.json());
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
    const disabled = await startPairedService(config, { fetchImpl });
    let disabledClosed = false;
    cleanups.push(async () => {
      if (!disabledClosed) await disabled.close();
      await rm(root, { recursive: true, force: true });
    });

    const disabledCreated = await pairedFetch(`${disabled.origin}/api/jobs`, {
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
    const enabled = await startPairedService({ ...config, allowOnlineProviders: true }, { fetchImpl });
    cleanups.push(() => enabled.close());
    const created = await pairedFetch(`${enabled.origin}/api/jobs`, {
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

    const disabled = await startPairedService(config, {
      commandRunner: runner,
      elevenLabsApiKey: 'test-elevenlabs-key',
      elevenLabsHttpClient,
    });
    let disabledClosed = false;
    cleanups.push(async () => {
      if (!disabledClosed) await disabled.close();
      await rm(root, { recursive: true, force: true });
    });
    const disabledCreated = await pairedFetch(`${disabled.origin}/api/jobs`, {
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

    const enabled = await startPairedService({ ...config, allowOnlineProviders: true }, {
      commandRunner: runner,
      elevenLabsApiKey: 'test-elevenlabs-key',
      elevenLabsHttpClient,
    });
    cleanups.push(() => enabled.close());
    const denied = await pairedFetch(`${enabled.origin}/api/jobs`, {
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

    const created = await pairedFetch(`${enabled.origin}/api/jobs`, {
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
        await writeFile(args.at(-1)!, 'synthetic wav bytes');
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (args[0]?.endsWith('faster_whisper_transcribe.py')) {
        const modelName = args[args.indexOf('--model') + 1]!;
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            engine: 'faster-whisper',
            model_name: modelName,
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
        expect(handoff).toMatchObject({ engine: 'faster-whisper', modelName: 'base', language: 'pl' });
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
    const service = await startPairedService(config, { commandRunner: runner });
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const created = await pairedFetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'local-transcription',
        payload: {
          mediaPath,
          language: 'pl',
          alignWords: true,
        },
      }),
    }).then((response) => response.json());
    const completed = await waitForJob(service.origin, created.job.id);
    const completedJob = completed.job as Record<string, unknown>;
    const jobResult = completedJob.result as Record<string, unknown>;
    const serialized = JSON.stringify(completed);

    expect(completed.job).toMatchObject({ kind: 'local-transcription', status: 'completed' });
    expect(created.job.payloadSummary).toMatchObject({ modelName: 'base' });
    expect(serialized).not.toContain(mediaPath);
    expect(serialized).not.toContain(resolve(root));
    const expectedPython = process.env.LINGOTORTE_PYTHON_PATH ?? (process.platform === 'win32' ? 'python' : 'python3');
    expect(calls.map((call) => call.command)).toEqual(['ffmpeg', expectedPython, expectedPython]);
    expect(calls.find((call) => call.args.includes('--model'))?.args).toEqual(expect.arrayContaining(['--model', 'base']));
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

  it('uses an injected service ASR default, permits tiny override, and rejects unsupported models before runner execution', async () => {
    const { root, config } = await makeTempConfig();
    const mediaPath = join(root, 'owned-model-selection-media.webm');
    await writeFile(mediaPath, 'owned media bytes');
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      if (command === 'ffmpeg') { await writeFile(args.at(-1)!, 'synthetic wav'); return { exitCode: 0, stdout: '', stderr: '' }; }
      const modelName = args[args.indexOf('--model') + 1]!;
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          engine: 'faster-whisper', model_name: modelName, language: 'pl',
          segments: [{ start: 0, end: 1, text: 'Model test.' }],
        }),
        stderr: '',
      };
    };
    const service = await startPairedService(config, {
      commandRunner: runner,
      defaultModelName: 'small',
    });
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const status = await pairedFetch(`${service.origin}/api/status`).then((response) => response.json());
    expect(status.config.defaultAsrModelName).toBe('small');

    const create = async (payload: Record<string, unknown>) => pairedFetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'local-transcription', payload: { mediaPath, alignWords: false, ...payload } }),
    });
    const defaultCreated = await create({}).then((response) => response.json());
    expect(defaultCreated.job.payloadSummary.modelName).toBe('small');
    await waitForJob(service.origin, defaultCreated.job.id);

    const overrideCreated = await create({ modelName: 'tiny' }).then((response) => response.json());
    expect(overrideCreated.job.payloadSummary.modelName).toBe('tiny');
    await waitForJob(service.origin, overrideCreated.job.id);
    expect(calls.filter((call) => call.args.includes('--model')).map((call) => call.args[call.args.indexOf('--model') + 1])).toEqual(['small', 'tiny']);

    const callCount = calls.length;
    const rejected = 'private-invalid-model-sentinel';
    const invalidResponse = await create({ modelName: rejected });
    const invalid = await invalidResponse.json();
    expect(invalidResponse.status).toBe(400);
    expect(invalid.error).toBe('modelName must be one of: tiny, base, small, medium, large-v3.');
    expect(JSON.stringify(invalid)).not.toContain(rejected);
    expect(JSON.stringify(invalid)).not.toContain(mediaPath);
    expect(calls).toHaveLength(callCount);
  });

  it('redacts private media paths when local transcription jobs fail', async () => {
    const { root, config } = await makeTempConfig();
    const mediaPath = join(root, 'private-failure-media.webm');
    await writeFile(mediaPath, 'owned media bytes');
    const runner: CommandRunner = async () => {
      throw new Error(`ffmpeg could not open ${mediaPath} in ${resolve(root)}`);
    };
    const service = await startPairedService(config, { commandRunner: runner });
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const created = await pairedFetch(`${service.origin}/api/jobs`, {
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
    const service = await startPairedService(config);
    cleanups.push(async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
    });

    const scratchFile = join(service.config.scratchDir, 'temporary-artifact.txt');
    const outsideFile = join(root, 'outside.txt');
    await writeFile(scratchFile, 'scratch');
    await writeFile(outsideFile, 'outside');

    const result = await pairedFetch(`${service.origin}/api/artifacts/cleanup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then((response) => response.json());

    expect(result).toMatchObject({ ok: true });
    expect(result.deletedFiles).toBeGreaterThanOrEqual(1);
    await expect(stat(scratchFile)).rejects.toThrow();
    await expect(stat(outsideFile)).resolves.toBeTruthy();
  });

  // lt-584.4 (C3): learner state and per-track transcript bundles travel separately.
  describe('transcript bundle routes and the learner-state contract', () => {
    async function seeded() {
      const { root, config } = await makeTempConfig();
      const media = makeMediaAsset({ title: 'synthetic', originalPath: 'fixtures/media/synthetic-polish-dialogue.webm', contentSha256: fingerprint, durationMs: 2000, container: 'webm', sizeBytes: 1024, privacyLabel: 'synthetic' });
      const other = makeMediaAsset({ title: 'other', originalPath: 'fixtures/media/other.webm', contentSha256: fingerprint, durationMs: 2000, container: 'webm', sizeBytes: 1024, privacyLabel: 'synthetic' });
      const track = (mediaId: string, transcriptStatus: 'approved' | 'candidate') => makeSubtitleTrack({ mediaId, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'fixtures/t.srt', contentSha256: fingerprint, isActive: true, transcriptStatus });
      const target = track(media.id, 'candidate'); const otherTrack = track(other.id, 'candidate');
      // Seed learner state directly (tracks are candidates, so they may be bundle-less).
      const seed = SqliteLocalPersistence.open(config.databasePath);
      try {
        const { cues: _c, transcriptWordTimings: _w, ...state } = { ...createEmptyLocalStoreSnapshot(), mediaAssets: { [media.id]: media, [other.id]: other }, subtitleTracks: { [target.id]: target, [otherTrack.id]: otherTrack } };
        seed.saveLearnerState(state, seed.loadLearnerState().revision);
      } finally { seed.close(); }
      const service = await startPairedService(config);
      cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
      const cue = makeCue({ trackId: target.id, cueIndex: 0, startMs: 0, endMs: 900, text: 'Dzień dobry', normalizedText: 'dzień dobry', textSha256: fingerprint });
      const timing = makeTranscriptWordTiming({ trackId: target.id, cueId: cue.id, wordIndex: 0, charStart: 0, charEnd: 5, text: 'Dzień', normalizedText: 'dzień', startMs: 0, endMs: 400, sourceKind: 'provider-word-timing', engine: 'synthetic', modelName: 'synthetic', confidence: 0.5 });
      const state = async () => pairedFetch(`${service.origin}/api/state`).then(r => r.json());
      const putBundle = (trackId: string, body: unknown) => pairedFetch(`${service.origin}/api/tracks/${trackId}/transcript`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { service, media, other, target, otherTrack, cue, timing, state, putBundle };
    }

    it('GET /api/state (strict, C4) carries learner state without transcript keys and the revision; status reports it too', async () => {
      const { service, media, target, cue, timing, state, putBundle } = await seeded();
      expect((await putBundle(target.id, { cues: [cue], wordTimings: [timing], expectedRevision: (await state()).revision })).status).toBe(200);
      const body = await state();
      expect(body).toMatchObject({ ok: true, revision: expect.stringMatching(/^rev:\d+$/), restoreCapability: 'active-audit-restore-v1' });
      expect(Object.hasOwn(body.snapshot, 'cues')).toBe(false);
      expect(Object.hasOwn(body.snapshot, 'transcriptWordTimings')).toBe(false);
      expect(body.snapshot.subtitleTracks[target.id]).toEqual(target);
      const transcripts = await pairedFetch(`${service.origin}/api/media/${media.id}/transcripts`).then(r => r.json());
      expect(transcripts.tracks[target.id]).toEqual({ cues: [cue], wordTimings: [timing] });
      const status = await pairedFetch(`${service.origin}/api/status`).then(r => r.json());
      expect(status.persistence.revision).toBe(body.revision);
    });

    it('PUT /api/tracks/{id}/transcript writes once (200, then 409), 409 on a stale revision, 400 for a malformed bundle', async () => {
      const { target, cue, timing, state, putBundle } = await seeded();
      const before = await state();
      expect((await putBundle(target.id, { cues: [cue], wordTimings: [timing], expectedRevision: 'rev:999' })).status).toBe(409);
      expect((await putBundle(target.id, { cues: [{ ...cue, trackId: '00000000-0000-4000-8000-000000000000' }], wordTimings: [], expectedRevision: before.revision })).status).toBe(400);
      expect((await putBundle(target.id, { cues: [cue], wordTimings: [timing], expectedRevision: before.revision, extra: 1 })).status).toBe(400);
      expect((await putBundle(target.id, { cues: [{ ...cue, startMs: -1 }], wordTimings: [], expectedRevision: before.revision })).status).toBe(400);
      expect((await putBundle(target.id, { cues: [cue], wordTimings: [timing] })).status).toBe(428);
      expect((await state()).revision).toBe(before.revision);
      const ok = await putBundle(target.id, { cues: [cue], wordTimings: [timing], expectedRevision: before.revision });
      expect(ok.status).toBe(200);
      const written = await ok.json();
      expect(written).toMatchObject({ ok: true, trackId: target.id, revision: expect.stringMatching(/^rev:\d+$/) });
      expect(written.revision).not.toBe(before.revision);
      expect((await putBundle(target.id, { cues: [cue], wordTimings: [timing], expectedRevision: written.revision })).status).toBe(409);
      expect((await state()).revision).toBe(written.revision);
    });

    it('GET /api/media/{id}/transcripts returns that media\'s tracks only, 404 for an unknown media', async () => {
      const { service, media, other, target, otherTrack, cue, timing, state, putBundle } = await seeded();
      expect((await putBundle(target.id, { cues: [cue], wordTimings: [timing], expectedRevision: (await state()).revision })).status).toBe(200);
      const body = await pairedFetch(`${service.origin}/api/media/${media.id}/transcripts`).then(r => r.json());
      expect(body).toEqual({ ok: true, mediaId: media.id, revision: (await state()).revision, tracks: { [target.id]: { cues: [cue], wordTimings: [timing] } } });
      const otherBody = await pairedFetch(`${service.origin}/api/media/${other.id}/transcripts`).then(r => r.json());
      expect(otherBody.tracks).toEqual({ [otherTrack.id]: { cues: [], wordTimings: [] } });
      expect((await pairedFetch(`${service.origin}/api/media/00000000-0000-4000-8000-000000000000/transcripts`)).status).toBe(404);
      expect((await pairedFetch(`${service.origin}/api/media/not-a-uuid/transcripts`)).status).toBe(404);
    });

    it('new routes require pairing (401) and an allowed origin (403) like /api/state', async () => {
      const { service, media, target, cue } = await seeded();
      const unpaired = await fetch(`${service.origin}/api/media/${media.id}/transcripts`);
      expect(unpaired.status).toBe(401);
      const unpairedPut = await fetch(`${service.origin}/api/tracks/${target.id}/transcript`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cues: [cue], wordTimings: [], expectedRevision: 'rev:1' }) });
      expect(unpairedPut.status).toBe(401);
      const evil = await pairedFetch(`${service.origin}/api/media/${media.id}/transcripts`, { headers: { origin: 'http://evil.invalid' } });
      expect(evil.status).toBe(403);
      expect((await pairedFetch(`${service.origin}/api/media/${media.id}/transcripts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(405);
    });

    it('PUT /api/state (strict, C4): 400 on transcript keys and on a non-candidate track without a stored bundle; bundle first, then 200', async () => {
      const { service, media, target, cue, timing, state, putBundle } = await seeded();
      const put = (snapshot: unknown, expectedRevision: string) => pairedFetch(`${service.origin}/api/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot, expectedRevision }) });
      const transcripts = async () => (await pairedFetch(`${service.origin}/api/media/${media.id}/transcripts`).then(r => r.json())).tracks[target.id];
      const before = await state();
      // A learner-state body is saved (candidate tracks may be bundle-less).
      const saved = await put(before.snapshot, before.revision);
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ ok: true, revision: expect.stringMatching(/^rev:\d+$/), savedAt: expect.any(String), persistence: expect.any(Object) });
      const current = await state();
      const approved = { ...current.snapshot, subtitleTracks: { ...current.snapshot.subtitleTracks, [target.id]: { ...target, transcriptStatus: 'approved' } } };
      // D-R7: a stale client that still sends transcript keys is refused, even with empty collections.
      for (const extra of [{ cues: {} }, { transcriptWordTimings: {} }, { cues: { [cue.id]: cue }, transcriptWordTimings: { [timing.id]: timing } }]) {
        const refused = await put({ ...current.snapshot, ...extra }, current.revision);
        expect(refused.status).toBe(400);
        expect((await refused.json()).error).toMatch(/cues or transcriptWordTimings/);
      }
      // Plan 2.4: a non-candidate track without a stored bundle is refused.
      const unbundled = await put(approved, current.revision);
      expect(unbundled.status).toBe(400);
      expect((await unbundled.json()).error).toMatch(/no stored transcript/);
      expect(await state()).toEqual(current);
      expect(await transcripts()).toEqual({ cues: [], wordTimings: [] });
      // Bundle first, then the same learner state is accepted; the bundle stays as written.
      expect((await putBundle(target.id, { cues: [cue], wordTimings: [timing], expectedRevision: current.revision })).status).toBe(200);
      const afterBundle = await state();
      expect((await put(approved, afterBundle.revision)).status).toBe(200);
      const after = await state();
      expect(after.snapshot.subtitleTracks[target.id].transcriptStatus).toBe('approved');
      expect(await transcripts()).toEqual({ cues: [cue], wordTimings: [timing] });
      expect((await put(approved, afterBundle.revision)).status).toBe(409);
      const exists = await putBundle(target.id, { cues: [cue], wordTimings: [timing], expectedRevision: after.revision });
      expect(exists.status).toBe(409);
      expect(await exists.json()).toMatchObject({ ok: false, code: 'transcript-bundle-exists' });
    });

    it('PUT /api/state (strict, C4) still accepts a non-candidate track that was stored without a bundle before the flip', async () => {
      const { config, root } = await makeTempConfig();
      const media = makeMediaAsset({ title: 'legacy', originalPath: 'fixtures/media/synthetic-polish-dialogue.webm', contentSha256: fingerprint, durationMs: 2000, container: 'webm', sizeBytes: 1024, privacyLabel: 'synthetic' });
      const legacyTrack = makeSubtitleTrack({ mediaId: media.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'fixtures/legacy.srt', contentSha256: fingerprint, isActive: true, transcriptStatus: 'approved' });
      const seed = SqliteLocalPersistence.open(config.databasePath);
      try {
        const { cues: _c, transcriptWordTimings: _w, ...learner } = { ...createEmptyLocalStoreSnapshot(), mediaAssets: { [media.id]: media }, subtitleTracks: { [legacyTrack.id]: legacyTrack } };
        seed.saveLearnerState(learner, seed.loadLearnerState().revision);
      } finally { seed.close(); }
      const service = await startPairedService(config);
      cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
      const current = await pairedFetch(`${service.origin}/api/state`).then(r => r.json());
      const renamed = { ...current.snapshot, mediaAssets: { [media.id]: { ...media, title: 'legacy renamed' } } };
      expect((await pairedFetch(`${service.origin}/api/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot: renamed, expectedRevision: current.revision }) })).status).toBe(200);
    });

    it('bundle first (D-R9): PUT a bundle for a new track id, then PUT /api/state referencing it as approved, then GET transcripts returns it', async () => {
      const { service, media, state, putBundle } = await seeded();
      const fresh = makeSubtitleTrack({ mediaId: media.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'fixtures/new.srt', contentSha256: fingerprint, isActive: false, transcriptStatus: 'approved' });
      const cue = makeCue({ trackId: fresh.id, cueIndex: 0, startMs: 0, endMs: 900, text: 'Cześć', normalizedText: 'cześć', textSha256: fingerprint });
      const bundled = await putBundle(fresh.id, { cues: [cue], wordTimings: [], expectedRevision: (await state()).revision });
      expect(bundled.status).toBe(200);
      const current = await state();
      const { cues: _c, transcriptWordTimings: _w, ...learner } = current.snapshot;
      const saved = await pairedFetch(`${service.origin}/api/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot: { ...learner, subtitleTracks: { ...learner.subtitleTracks, [fresh.id]: fresh } }, expectedRevision: current.revision }) });
      expect(saved.status).toBe(200);
      const body = await pairedFetch(`${service.origin}/api/media/${media.id}/transcripts`).then(r => r.json());
      expect(body.tracks[fresh.id]).toEqual({ cues: [cue], wordTimings: [] });
    });
  });
});
