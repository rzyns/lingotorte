import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CommandRunner } from '../../packages/local-transcription/src/index.ts';
import {
  extractEmbeddedSubtitleTrack,
  listEmbeddedSubtitleTracks,
} from '../../packages/local-transcription/src/index.ts';
import { startLingotorteLocalService } from '../../apps/local-service/src/server';

const DUMMY_MEDIA = join(tmpdir(), 'lingotorte-b7-test-media.mp4');

// ---------------------------------------------------------------------------
// Unit-level tests for the command adapters (no server/HTTP involved)
// ---------------------------------------------------------------------------

describe('listEmbeddedSubtitleTracks', () => {
  it('normalizes ffprobe JSON subtitle streams into typed tracks sorted by index', async () => {
    const runner: CommandRunner = async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        streams: [
          {
            index: 2,
            codec_name: 'subrip',
            codec_type: 'subtitle',
            tags: { language: 'pol', title: 'Polish subs' },
            disposition: { default: 1, forced: 0 },
          },
          {
            index: 3,
            codec_name: 'hdmv_pgs_subtitle',
            codec_type: 'subtitle',
            tags: { language: 'eng' },
            disposition: { default: 0, forced: 1 },
          },
          {
            index: 0,
            codec_name: 'h264',
            codec_type: 'video',
          },
          {
            index: 1,
            codec_name: 'aac',
            codec_type: 'audio',
          },
        ],
      }),
      stderr: '',
    });

    const result = await listEmbeddedSubtitleTracks({ mediaPath: DUMMY_MEDIA }, runner);
    expect(result.effect).toBe('embedded-subtitles-listed');
    expect(result.streamCount).toBe(2);
    expect(result.supportedCount).toBe(1);
    expect(result.tracks).toHaveLength(2);
    // Sorted by streamIndex ascending
    expect(result.tracks[0]!.streamIndex).toBe(2);
    expect(result.tracks[1]!.streamIndex).toBe(3);
    // Track 0 — SRT at index 2, supported
    // isForced=false and codecName are omitted from the object (codecName not in EmbeddedSubtitleTrack shape)
    expect(result.tracks[0]!).toMatchObject({
      codecKind: 'subrip',
      isSupported: true,
      language: 'pol',
      title: 'Polish subs',
      isDefault: true,
    });
    // Track 1 — PGS at index 3, unsupported (isDefault=false and isSupported=false are omitted)
    expect(result.tracks[1]!).toMatchObject({
      codecKind: 'hdmv_pgs_subtitle',
      isSupported: false,
      language: 'eng',
      isForced: true,
    });
    expect(result.tracks[1]!.extractionHint).toContain("'hdmv_pgs_subtitle'");
  });

  it('rejects ffprobe output missing the streams array', async () => {
    const runner: CommandRunner = async () => ({ exitCode: 0, stdout: '{}', stderr: '' });
    await expect(listEmbeddedSubtitleTracks({ mediaPath: DUMMY_MEDIA }, runner)).rejects.toThrow(/streams/);
  });

  it('throws when ffprobe exits non-zero', async () => {
    const runner: CommandRunner = async () => ({ exitCode: 1, stdout: '', stderr: 'moo' });
    await expect(listEmbeddedSubtitleTracks({ mediaPath: DUMMY_MEDIA }, runner)).rejects.toThrow(/exit code 1/);
  });

  it('requires an absolute media path', async () => {
    const runner: CommandRunner = async () => ({ exitCode: 0, stdout: '{}', stderr: '' });
    await expect(listEmbeddedSubtitleTracks({ mediaPath: 'relative/path.mp4' }, runner)).rejects.toThrow(/absolute/);
  });

  it('handles tracks with no language or title tags', async () => {
    const runner: CommandRunner = async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        streams: [
          { index: 0, codec_name: 'webvtt', codec_type: 'subtitle' },
        ],
      }),
      stderr: '',
    });
    const result = await listEmbeddedSubtitleTracks({ mediaPath: DUMMY_MEDIA }, runner);
    expect(result.tracks[0]!).toMatchObject({
      streamIndex: 0,
      codecName: 'webvtt',
      codecKind: 'webvtt',
      isSupported: true,
      // language/title/default/forced are omitted when undefined/false
    });
  });

  it('normalizes ass and ssa codecs correctly', async () => {
    const runner: CommandRunner = async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        streams: [
          { index: 0, codec_name: 'ass', codec_type: 'subtitle' },
          { index: 1, codec_name: 'ssa', codec_type: 'subtitle' },
        ],
      }),
      stderr: '',
    });
    const result = await listEmbeddedSubtitleTracks({ mediaPath: DUMMY_MEDIA }, runner);
    expect(result.tracks[0]!.codecKind).toBe('ass');
    expect(result.tracks[1]!.codecKind).toBe('ssa');
    expect(result.supportedCount).toBe(2);
  });
});

describe('extractEmbeddedSubtitleTrack', () => {
  const fakeOutput = join(tmpdir(), 'lingotorte-b7-fake-output.srt');

  it('calls ffmpeg with correct args for srt extraction', async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      await writeFile(args[args.length - 1]!, '1\n00:00:00,000 --> 00:00:02,000\nTest.\n', 'utf8');
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    await extractEmbeddedSubtitleTrack({
      mediaPath: DUMMY_MEDIA,
      streamIndex: 2,
      outputPath: fakeOutput,
      outputFormat: 'srt',
    }, runner);

    expect(calls[0]!.command).toBe('ffmpeg');
    expect(calls[0]!.args).toContain('-map');
    expect(calls[0]!.args).toContain('0:2');
    expect(calls[0]!.args).toContain('-f');
    expect(calls[0]!.args).toContain('srt');
  });

  it('calls ffmpeg with correct args for vtt extraction', async () => {
    const vttOutput = join(tmpdir(), 'lingotorte-b7-fake-output.vtt');
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      await writeFile(args[args.length - 1]!, 'WEBVTT\n', 'utf8');
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    await extractEmbeddedSubtitleTrack({
      mediaPath: DUMMY_MEDIA,
      streamIndex: 3,
      outputPath: vttOutput,
      outputFormat: 'vtt',
    }, runner);

    expect(calls[0]!.args).toContain('0:3');
    expect(calls[0]!.args).toContain('webvtt');
  });

  it('calls ffmpeg with correct args for ass extraction', async () => {
    const assOutput = join(tmpdir(), 'lingotorte-b7-fake-output.ass');
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      await writeFile(args[args.length - 1]!, '[Script Info]\n', 'utf8');
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    await extractEmbeddedSubtitleTrack({
      mediaPath: DUMMY_MEDIA,
      streamIndex: 1,
      outputPath: assOutput,
      outputFormat: 'ass',
    }, runner);

    expect(calls[0]!.args).toContain('0:1');
    expect(calls[0]!.args).toContain('ass');
  });

  it('throws when output path equals input path', async () => {
    const runner: CommandRunner = async () => ({ exitCode: 0, stdout: '', stderr: '' });
    await expect(extractEmbeddedSubtitleTrack({
      mediaPath: DUMMY_MEDIA,
      streamIndex: 0,
      outputPath: DUMMY_MEDIA,
      outputFormat: 'srt',
    }, runner)).rejects.toThrow(/must differ/);
  });

  it('throws when stream index is negative', async () => {
    const runner: CommandRunner = async () => ({ exitCode: 0, stdout: '', stderr: '' });
    await expect(extractEmbeddedSubtitleTrack({
      mediaPath: DUMMY_MEDIA,
      streamIndex: -1,
      outputPath: fakeOutput,
      outputFormat: 'srt',
    }, runner)).rejects.toThrow(/non-negative integer/);
  });

  it('throws when ffmpeg exits non-zero', async () => {
    const runner: CommandRunner = async () => ({ exitCode: 2, stdout: '', stderr: 'Invalid stream' });
    await expect(extractEmbeddedSubtitleTrack({
      mediaPath: DUMMY_MEDIA,
      streamIndex: 0,
      outputPath: fakeOutput,
      outputFormat: 'srt',
    }, runner)).rejects.toThrow(/exit code 2/);
  });

  it('requires an absolute input path', async () => {
    const runner: CommandRunner = async () => ({ exitCode: 0, stdout: '', stderr: '' });
    await expect(extractEmbeddedSubtitleTrack({
      mediaPath: 'relative.mp4',
      streamIndex: 0,
      outputPath: fakeOutput,
      outputFormat: 'srt',
    }, runner)).rejects.toThrow(/absolute/);
  });
});

// ---------------------------------------------------------------------------
// Local-service HTTP-level tests
// ---------------------------------------------------------------------------

async function makeTempServiceConfig() {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-b7-svc-'));
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
  };
}

async function waitForJob(origin: string, id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 40; i++) {
    const body = await fetch(`${origin}/api/jobs/${id}`).then((r) => r.json()) as Record<string, unknown>;
    const job = body.job as Record<string, unknown> | undefined;
    if (job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled') return body;
    await new Promise((p) => setTimeout(p, 10));
  }
  throw new Error('Timed out waiting for job');
}

describe('Lingotorte embedded-subtitle local service jobs', () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()!();
    }
  });

  it('embedded-subtitle-list: completes successfully with synthetic ffprobe output and reverts private paths in result', async () => {
    const { root, config } = await makeTempServiceConfig();
    const mediaPath = join(root, 'owned-media.mkv');
    await writeFile(mediaPath, 'video+subtitle bytes');

    const ffprobeCalls: { command: string; args: readonly string[] }[] = [];
    const runner: CommandRunner = async (command, args) => {
      ffprobeCalls.push({ command, args });
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          streams: [
            { index: 2, codec_name: 'subrip', codec_type: 'subtitle', tags: { language: 'pl' }, disposition: { default: 1, forced: 0 } },
            { index: 3, codec_name: 'mov_text', codec_type: 'subtitle', tags: { language: 'en' }, disposition: { default: 0, forced: 0 } },
            { index: 4, codec_name: 'hdmv_pgs_subtitle', codec_type: 'subtitle', tags: {}, disposition: {} },
          ],
        }),
        stderr: '',
      };
    };

    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'embedded-subtitle-list', payload: { mediaPath } }),
    }).then((r) => r.json());

    expect(created.job).toMatchObject({ kind: 'embedded-subtitle-list', status: 'queued' });

    const completed = await waitForJob(service.origin, created.job.id);
    const job = completed.job as Record<string, unknown>;
    const result = job.result as Record<string, unknown>;
    const listing = result.listing as Record<string, unknown>;
    const tracks = listing.tracks as Record<string, unknown>[];

    expect(job).toMatchObject({ status: 'completed' });
    expect(listing.effect).toBe('embedded-subtitles-listed');
    expect(tracks).toHaveLength(3);
    expect(tracks[0]!).toMatchObject({ streamIndex: 2, codecName: 'subrip', isSupported: true });
    expect(tracks[1]!).toMatchObject({ streamIndex: 3, codecName: 'mov_text', isSupported: true });
    expect(tracks[2]!).toMatchObject({ streamIndex: 4, codecName: 'hdmv_pgs_subtitle', isSupported: false });

    // ffprobe was called with the right args
    expect(ffprobeCalls[0]!.command).toBe('ffprobe');
    expect(ffprobeCalls[0]!.args).toContain('-show_streams');
    expect(ffprobeCalls[0]!.args).toContain('-select_streams');
    expect(ffprobeCalls[0]!.args).toContain('s');

    // Private paths are redacted in job payload summary and result
    const serialized = JSON.stringify(completed);
    expect(serialized).not.toContain(mediaPath);
    expect(serialized).not.toContain(root);
    expect(created.job.payloadSummary).toMatchObject({ mediaPath: '[local-media-path]' });
  });

  it('embedded-subtitle-list: fails when ffprobe exits non-zero and does not leak private paths', async () => {
    const { root, config } = await makeTempServiceConfig();
    const mediaPath = join(root, 'private-media.mkv');
    await writeFile(mediaPath, 'private bytes');

    const runner: CommandRunner = async () => ({ exitCode: 1, stdout: '', stderr: `ffprobe error in ${mediaPath}` });
    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'embedded-subtitle-list', payload: { mediaPath } }),
    }).then((r) => r.json());

    const failed = await waitForJob(service.origin, created.job.id);
    expect(failed.job).toMatchObject({ status: 'failed' });
    const serialized = JSON.stringify(failed);
    expect(serialized).not.toContain(mediaPath);
    expect(serialized).not.toContain(root);
    expect(serialized).toContain('[local-path]');
  });

  it('embedded-subtitle-list: rejects a relative media path', async () => {
    const { root, config } = await makeTempServiceConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'embedded-subtitle-list', payload: { mediaPath: 'relative/path.mkv' } }),
    }).then((r) => r.json());

    // The job itself is queued but the runner will fail with absolute-path error
    const failed = await waitForJob(service.origin, created.job.id);
    expect(failed.job).toMatchObject({ status: 'failed' });
    expect(JSON.stringify(failed)).toContain('absolute');
  });

  it('embedded-subtitle-extract: completes successfully, imports as draft, and redacts scratch paths', async () => {
    const { root, config } = await makeTempServiceConfig();
    const mediaPath = join(root, 'owned-media-with-subs.mkv');
    await writeFile(mediaPath, 'video+subtitle bytes');

    const srtContent = `1
00:00:01,000 --> 00:00:03,500
Pierwsza linia dialogu.

2
00:00:04,000 --> 00:00:06,000
Druga linia dialogu.
`;
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args });
      if (command === 'ffmpeg') {
        const outputPath = args[args.length - 1] as string;
        await writeFile(outputPath, srtContent, 'utf8');
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'embedded-subtitle-extract',
        payload: {
          mediaPath,
          streamIndex: 2,
          outputFormat: 'srt',
          language: 'pl',
          role: 'target',
        },
      }),
    }).then((r) => r.json());

    expect(created.job.payloadSummary).toMatchObject({
      mediaPath: '[local-media-path]',
      streamIndex: 2,
      outputFormat: 'srt',
      language: 'pl',
      role: 'target',
    });

    const completed = await waitForJob(service.origin, created.job.id);
    const job = completed.job as Record<string, unknown>;
    const result = job.result as Record<string, unknown>;
    const extract = result.extract as Record<string, unknown>;
    const track = result.track as Record<string, unknown>;

    expect(job).toMatchObject({ status: 'completed' });
    expect(extract.effect).toBe('embedded-subtitle-extracted');
    expect(extract.outputPath).toBe('[local-scratch]'); // redacted
    expect(track.transcriptStatus).toBe('draft'); // embedded extraction enters as draft with provenance/warningFlags
    expect((track.provenance as Record<string, unknown>).warningFlags).toMatchObject(
      expect.arrayContaining(['timingUnverified']),
    );
    expect(track.format).toBe('srt');
    expect(track.cueCount).toBe(2);

    // ffmpeg was called
    const ffmpegCalls = calls.filter((c) => c.command === 'ffmpeg');
    expect(ffmpegCalls).toHaveLength(1);
    expect(ffmpegCalls[0]!.args).toContain('0:2');
    expect(ffmpegCalls[0]!.args).toContain('-f');
    expect(ffmpegCalls[0]!.args).toContain('srt');

    // No private paths leaked
    const serialized = JSON.stringify(completed);
    expect(serialized).not.toContain(mediaPath);
    expect(serialized).not.toContain(root);
    // Verify scratch dir path is redacted in outputPath field; raw 'scratch' may appear in [local-scratch] sentinel
    expect(serialized).not.toContain(join(root, 'scratch'));
  });

  it('embedded-subtitle-extract: fails when ffmpeg extraction fails and redacts private paths', async () => {
    const { root, config } = await makeTempServiceConfig();
    const mediaPath = join(root, 'private-failure.mkv');
    await writeFile(mediaPath, 'private bytes');

    const runner: CommandRunner = async (command, _args) => {
      if (command === 'ffmpeg') {
        throw new Error(`ffmpeg could not open ${mediaPath} in ${root}`);
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'embedded-subtitle-extract',
        payload: { mediaPath, streamIndex: 0, outputFormat: 'srt', language: 'pl', role: 'target' },
      }),
    }).then((r) => r.json());

    const failed = await waitForJob(service.origin, created.job.id);
    expect(failed.job).toMatchObject({ status: 'failed' });
    const serialized = JSON.stringify(failed);
    expect(serialized).not.toContain(mediaPath);
    expect(serialized).not.toContain(root);
    expect(serialized).toContain('[local-path]');
  });

  it('embedded-subtitle-extract: rejects a relative media path', async () => {
    const { root, config } = await makeTempServiceConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'embedded-subtitle-extract',
        payload: { mediaPath: 'relative.mkv', streamIndex: 0, outputFormat: 'srt', language: 'pl', role: 'target' },
      }),
    }).then((r) => r.json());

    const failed = await waitForJob(service.origin, created.job.id);
    expect(failed.job).toMatchObject({ status: 'failed' });
    expect(JSON.stringify(failed)).toContain('absolute');
  });

  it('embedded-subtitle-extract: rejects invalid outputFormat', async () => {
    const { root, config } = await makeTempServiceConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'embedded-subtitle-extract',
        payload: { mediaPath: '/abs/path.mkv', streamIndex: 0, outputFormat: 'mkv', language: 'pl', role: 'target' },
      }),
    }).then((r) => r.json());

    // Validation error should cause the job to fail asynchronously
    const result = await waitForJob(service.origin, created.job.id);
    expect((result.job as Record<string, unknown>).status).toBe('failed');
  });

  it('embedded-subtitle-extract: rejects invalid streamIndex', async () => {
    const { root, config } = await makeTempServiceConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'embedded-subtitle-extract',
        payload: { mediaPath: '/abs/path.mkv', streamIndex: -1, outputFormat: 'srt', language: 'pl', role: 'target' },
      }),
    }).then((r) => r.json());

    const result = await waitForJob(service.origin, created.job.id);
    expect((result.job as Record<string, unknown>).status).toBe('failed');
  });

  it('embedded-subtitle-extract: rejects invalid role', async () => {
    const { root, config } = await makeTempServiceConfig();
    const service = await startLingotorteLocalService(config);
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });

    const created = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'embedded-subtitle-extract',
        payload: { mediaPath: '/abs/path.mkv', streamIndex: 0, outputFormat: 'srt', language: 'pl', role: 'assistant' },
      }),
    }).then((r) => r.json());

    const result = await waitForJob(service.origin, created.job.id);
    expect((result.job as Record<string, unknown>).status).toBe('failed');
  });

  it('embedded-subtitle-list and extract: do not affect the persistence layer', async () => {
    const { root, config } = await makeTempServiceConfig();
    const mediaPath = join(root, 'media.mkv');
    await writeFile(mediaPath, 'bytes');

    const runner: CommandRunner = async (command, args) => {
      if (command === 'ffprobe') {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            streams: [{ index: 0, codec_name: 'subrip', codec_type: 'subtitle' }],
          }),
          stderr: '',
        };
      }
      if (command === 'ffmpeg') {
        await writeFile(args[args.length - 1] as string, '1\n00:00:00,000 --> 00:00:01,000\nTest.\n', 'utf8');
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });

    const listCreated = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'embedded-subtitle-list', payload: { mediaPath } }),
    }).then((r) => r.json());
    await waitForJob(service.origin, listCreated.job.id);

    const extractCreated = await fetch(`${service.origin}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'embedded-subtitle-extract', payload: { mediaPath, streamIndex: 0, outputFormat: 'srt', language: 'pl', role: 'target' } }),
    }).then((r) => r.json());
    await waitForJob(service.origin, extractCreated.job.id);

    // Verify state is unchanged
    const state = await fetch(`${service.origin}/api/state`).then((r) => r.json());
    // No media assets or tracks were persisted — extraction produces draft in scratch, not in DB
    expect(Object.keys(state.snapshot?.mediaAssets ?? {})).toHaveLength(0);
    expect(Object.keys(state.snapshot?.subtitleTracks ?? {})).toHaveLength(0);
  });
});
