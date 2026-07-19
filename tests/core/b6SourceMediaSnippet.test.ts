import { afterEach, describe, expect, it, vi } from 'vitest';
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CommandRunner } from '../../packages/local-transcription/src/index.ts';
import { extractSourceAudioSnippet } from '../../packages/local-transcription/src/index.ts';
import { startLingotorteLocalService } from '../../apps/local-service/src/server.ts';
import { prepareSourceAudioSnippet, releaseSourceAudioSnippet } from '../../apps/web/src/sourceAudioSnippet.ts';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

async function temporaryConfig() {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-b6-'));
  roots.push(root);
  return { root, config: { host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false } };
}

async function waitForJob(origin: string, id: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const body = await fetch(`${origin}/api/jobs/${id}`).then((response) => response.json()) as { job: Record<string, unknown> };
    if (['completed', 'failed', 'cancelled'].includes(String(body.job.status))) return body.job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('job timeout');
}

describe('source audio snippet adapter', () => {
  it('uses an exact cue-bounded mono PCM WAV ffmpeg command', async () => {
    const calls: { command: string; args: readonly string[]; cwd?: string }[] = [];
    const runner: CommandRunner = async (command, args, options) => {
      calls.push({ command, args, ...(options.cwd !== undefined ? { cwd: options.cwd } : {}) });
      return { exitCode: 0, stdout: '', stderr: '' };
    };
    const result = await extractSourceAudioSnippet({ inputPath: '/owned/movie.mkv', outputPath: '/scratch/clip.wav', startMs: 1250, endMs: 3500 }, runner);
    expect(calls).toEqual([{ command: 'ffmpeg', cwd: '/scratch', args: ['-hide_banner', '-y', '-ss', '1.250', '-i', '/owned/movie.mkv', '-t', '2.250', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', '/scratch/clip.wav'] }]);
    expect(result).toMatchObject({ effect: 'source-audio-snippet-extracted', durationMs: 2250, mimeType: 'audio/wav', sampleRateHz: 16000, channels: 1 });
  });

  it.each([
    [{ inputPath: 'relative.mkv', outputPath: '/scratch/a.wav', startMs: 0, endMs: 1 }, /absolute/],
    [{ inputPath: '/a.mkv', outputPath: '/a.mkv', startMs: 0, endMs: 1 }, /differ/],
    [{ inputPath: '/a.mkv', outputPath: '/b.wav', startMs: -1, endMs: 1 }, /non-negative integer/],
    [{ inputPath: '/a.mkv', outputPath: '/b.wav', startMs: 2, endMs: 2 }, /greater/],
    [{ inputPath: '/a.mkv', outputPath: '/b.wav', startMs: 0, endMs: 30001 }, /30,000/],
  ])('rejects invalid bounded ranges and paths', async (input, message) => {
    await expect(extractSourceAudioSnippet(input, async () => ({ exitCode: 0, stdout: '', stderr: '' }))).rejects.toThrow(message);
  });
});

describe('loopback snippet service', () => {
  it('returns opaque WAV bytes, redacts paths, and deletes explicitly', async () => {
    const { root, config } = await temporaryConfig();
    const mediaPath = join(root, 'owned movie.mkv');
    await writeFile(mediaPath, 'synthetic');
    const runner: CommandRunner = async (_command, args) => {
      await writeFile(args.at(-1)!, Buffer.from('RIFF-synthetic-wave'));
      return { exitCode: 0, stdout: '', stderr: '' };
    };
    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    try {
      const created = await fetch(`${service.origin}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'source-audio-snippet', payload: { mediaPath, startMs: 100, endMs: 600 } }) }).then((response) => response.json()) as { job: Record<string, unknown> };
      const completed = await waitForJob(service.origin, String(created.job.id));
      const serialized = JSON.stringify({ created, completed });
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain(mediaPath);
      expect(completed).toMatchObject({ status: 'completed', result: { mimeType: 'audio/wav', startMs: 100, endMs: 600, durationMs: 500 } });
      const result = completed.result as { snippetId: string; url: string };
      expect(result.snippetId).toMatch(/^[0-9a-f-]{36}$/);
      const persistedState = await fetch(`${service.origin}/api/state`).then((response) => response.text());
      expect(persistedState).not.toContain(result.snippetId);
      expect(persistedState).not.toContain(mediaPath);
      const audio = await fetch(`${service.origin}${result.url}`);
      expect(audio.headers.get('content-type')).toBe('audio/wav');
      expect(await audio.text()).toBe('RIFF-synthetic-wave');
      expect((await fetch(`${service.origin}${result.url}`, { method: 'DELETE' })).status).toBe(204);
      expect((await fetch(`${service.origin}${result.url}`)).status).toBe(404);
      expect((await fetch(`${service.origin}/api/snippets/not-an-opaque-id`)).status).toBe(404);
    } finally {
      await service.close();
    }
  });

  it('enforces a 16-entry LRU and cleans startup and close scratch files', async () => {
    const { root, config } = await temporaryConfig();
    const snippetsDir = join(config.scratchDir, 'source-audio-snippets');
    await writeFile(join(root, 'owned.mkv'), 'synthetic');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(snippetsDir, { recursive: true }));
    await writeFile(join(snippetsDir, 'stale.wav'), 'stale');
    const runner: CommandRunner = async (_command, args) => { await writeFile(args.at(-1)!, 'wav'); return { exitCode: 0, stdout: '', stderr: '' }; };
    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    expect(await readdir(snippetsDir)).toEqual([]);
    const ids: string[] = [];
    for (let index = 0; index < 17; index += 1) {
      const created = await fetch(`${service.origin}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'source-audio-snippet', payload: { mediaPath: join(root, 'owned.mkv'), startMs: index, endMs: index + 1 } }) }).then((response) => response.json()) as { job: { id: string } };
      const completed = await waitForJob(service.origin, created.job.id);
      ids.push((completed.result as { snippetId: string }).snippetId);
    }
    expect((await fetch(`${service.origin}/api/snippets/${ids[0]}`)).status).toBe(404);
    expect((await readdir(snippetsDir))).toHaveLength(16);
    await service.close();
    expect(await readdir(snippetsDir)).toEqual([]);
    await expect(access(join(snippetsDir, `${ids[16]}.wav`))).rejects.toThrow();
  });
});

describe('browser snippet lifecycle', () => {
  it('fetches a full blob, deletes service bytes, and revokes superseded URLs', async () => {
    const createObjectURL = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const revokeObjectURL = vi.fn();
    const responses = [
      new Response(JSON.stringify({ job: { id: 'job-1' } }), { status: 201, headers: { 'content-type': 'application/json' } }),
      new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: '11111111-1111-4111-8111-111111111111', url: '/api/snippets/11111111-1111-4111-8111-111111111111', mimeType: 'audio/wav' } } }), { status: 200, headers: { 'content-type': 'application/json' } }),
      new Response(new Blob(['wav'], { type: 'audio/wav' }), { status: 200, headers: { 'content-type': 'audio/wav' } }),
      new Response(null, { status: 204 }),
    ];
    const fetchCalls: { input: string | URL | Request; init?: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      fetchCalls.push({ input, ...(init !== undefined ? { init } : {}) });
      return responses.shift()!;
    };
    const lifecycle = { objectUrl: null as string | null };
    const first = await prepareSourceAudioSnippet({ baseUrl: 'http://127.0.0.1:5174', mediaPath: '/owned/movie.mkv', startMs: 1, endMs: 2, fetchImpl, createObjectURL, revokeObjectURL, lifecycle });
    expect(first.objectUrl).toBe('blob:first');
    expect(fetchCalls[2]!.init).toBeUndefined();
    expect(fetchCalls[3]!.init).toMatchObject({ method: 'DELETE' });
    lifecycle.objectUrl = first.objectUrl;
    releaseSourceAudioSnippet(lifecycle, revokeObjectURL);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');
  });
});
