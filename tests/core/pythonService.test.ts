import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { startLingotorteLocalService, type RunningLingotorteLocalService } from '../../apps/local-service/src/server.ts';
import { nodeCommandRunner, type CommandRunner } from '../../packages/local-transcription/src/index.ts';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); }
  finally { vi.unstubAllEnvs(); }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-python-service żółć '));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const mediaPath = join(root, 'synthetic media.webm');
  await writeFile(mediaPath, 'synthetic bytes, fake ffmpeg only');
  return { root, mediaPath, config: {
    host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'),
    scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false,
  } };
}
async function submit(service: RunningLingotorteLocalService, mediaPath: string) {
  const created = await fetch(`${service.origin}/api/jobs`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'local-transcription', payload: {
      mediaPath, alignWords: false, pythonPath: 'browser-must-not-run', ffmpegPath: 'browser-must-not-run',
    } }),
  }).then((r) => r.json());
  expect(created.job).toBeDefined();
  for (let i = 0; i < 100; i++) {
    const body = await fetch(`${service.origin}/api/jobs/${created.job.id}`).then((r) => r.json());
    if (body.job.status === 'completed' || body.job.status === 'failed') return body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Synthetic Python job did not settle within its bounded poll.');
}

describe('service-owned Python executable', () => {
  it.each([false, true])('selects operator env, injection wins=%s, ignores browser overrides and snapshots at startup', async (inject) => {
    const { root, mediaPath, config } = await fixture();
    vi.stubEnv('LINGOTORTE_PYTHON_PATH', 'operator-python');
    const calls: Parameters<CommandRunner>[] = [];
    const runner: CommandRunner = async (...args) => {
      calls.push(args);
      if (args[0] === 'ffmpeg') await writeFile(args[1].at(-1)!, 'synthetic wav');
      return { exitCode: 0, stderr: '', stdout: JSON.stringify({ engine: 'fake', model_name: 'base', language: 'pl', segments: [] }) };
    };
    const service = await startLingotorteLocalService(config, {
      commandRunner: runner, scriptRoot: resolve('.'), ...(inject ? { pythonPath: 'injected-python' } : {}),
    });
    cleanups.push(() => service.close());
    expect(calls).toEqual([]);
    vi.stubEnv('LINGOTORTE_PYTHON_PATH', 'changed-after-start');
    const result = await submit(service, mediaPath);
    expect(result.job.status).toBe('completed');
    expect(calls.map(([command]) => command)).toEqual(['ffmpeg', inject ? 'injected-python' : 'operator-python']);
    expect(JSON.stringify(result)).not.toContain(root);
    expect(JSON.stringify(result)).not.toContain('python');
  });

  it('starts core without Python and reports only Python-backed work unavailable, without fallback', async () => {
    const { root, mediaPath, config } = await fixture();
    const missing = join(root, 'missing private interpreter.exe');
    vi.stubEnv('LINGOTORTE_PYTHON_PATH', missing);
    const calls: string[] = [];
    const runner: CommandRunner = async (command, args, options) => {
      calls.push(command);
      if (command === 'ffmpeg') {
        await writeFile(args.at(-1)!, 'synthetic wav');
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return nodeCommandRunner(command, args, options);
    };
    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    cleanups.push(() => service.close());
    expect(calls).toEqual([]);
    expect(await fetch(`${service.origin}/api/health`).then((r) => r.json())).toMatchObject({ ok: true });
    const status = await fetch(`${service.origin}/api/status`).then((r) => r.json());
    expect(JSON.stringify(status)).not.toContain(root);
    const result = await submit(service, mediaPath);
    expect(result.job).toMatchObject({ status: 'failed', message: 'Python executable is unavailable. Configure LINGOTORTE_PYTHON_PATH with one installed executable.' });
    expect(calls).toEqual(['ffmpeg', missing]);
    expect(JSON.stringify(result)).not.toContain(root);
    expect(JSON.stringify(result)).not.toContain('missing private');
    expect(await fetch(`${service.origin}/api/health`).then((r) => r.json())).toMatchObject({ ok: true });
  });

  it('rejects malformed operator configuration before creating service artifacts', async () => {
    const { root, config } = await fixture();
    const before = await readdir(root);
    vi.stubEnv('LINGOTORTE_PYTHON_PATH', 'py -3');
    await expect(startLingotorteLocalService(config)).rejects.toThrow(/Python executable configuration/);
    expect(await readdir(root)).toEqual(before);
  });
});
