import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { nativePathPolicy } from '../../packages/domain/src/nativePaths.ts';
import { pathInside } from '../../packages/domain/src/nativePathsNode.ts';
import { mutablePathsFromEnv, assertMutablePaths, repositoryRoots } from '../../apps/local-service/src/nativeConfig.ts';
import { configFromEnv, startLingotorteLocalService } from '../../apps/local-service/src/server.ts';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence.ts';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src/localStore.ts';

const roots: string[] = [];
afterEach(async () => { while (roots.length) await rm(roots.pop()!, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-native-config-'));
  roots.push(root);
  return { root, config: { host: '127.0.0.1', port: 0, dataDir: root, databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false } };
}

describe('external mutable native configuration', () => {
  it('resolves Windows independently of HOME and uses validated LOCALAPPDATA/home', () => {
    expect(mutablePathsFromEnv({ HOME: '/ignored', LOCALAPPDATA: 'D:/Synthetic Local' }, 'win32', 'C:/Synthetic Home').dataDir).toBe('D:\\Synthetic Local\\lingotorte');
    expect(mutablePathsFromEnv({}, 'win32', 'C:/Synthetic Home').dataDir).toBe('C:\\Synthetic Home\\AppData\\Local\\lingotorte');
    expect(() => mutablePathsFromEnv({ LOCALAPPDATA: '' }, 'win32', 'C:/Synthetic Home')).toThrow();
    expect(() => mutablePathsFromEnv({}, 'win32', '')).toThrow();
  });
  it('preserves Linux defaults and honors XDG explicitly without expansion', () => {
    expect(mutablePathsFromEnv({}, 'linux', '/home/synthetic').dataDir).toBe('/home/synthetic/.local/share/lingotorte');
    expect(mutablePathsFromEnv({ XDG_DATA_HOME: '/data/synthetic' }, 'linux', '/home/synthetic').dataDir).toBe('/data/synthetic/lingotorte');
    expect(() => mutablePathsFromEnv({ XDG_DATA_HOME: '' }, 'linux', '/home/synthetic')).toThrow();
    expect(() => mutablePathsFromEnv({ XDG_DATA_HOME: 'relative' }, 'linux', '/home/synthetic')).toThrow();
  });
  it.each(['LINGOTORTE_DATA_DIR', 'LINGOTORTE_DB_PATH', 'LINGOTORTE_SCRATCH_DIR', 'LINGOTORTE_MODEL_CACHE_DIR'])('rejects blank, relative and network %s instead of falling back', (name) => {
    for (const value of ['', 'relative', '//server/share', ':memory:']) expect(() => configFromEnv({ [name]: value })).toThrow();
  });
  it('validates all explicit overrides without opening or migrating state', async () => {
    const { root } = await fixture();
    const expected = { dataDir: join(root, 'data'), databasePath: join(root, 'db', 'explicit.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'cache') };
    const config = configFromEnv({ LINGOTORTE_DATA_DIR: expected.dataDir, LINGOTORTE_DB_PATH: expected.databasePath, LINGOTORTE_SCRATCH_DIR: expected.scratchDir, LINGOTORTE_MODEL_CACHE_DIR: expected.modelCacheDir });
    expect(config).toMatchObject(expected);
    expect(await readdir(root)).toEqual([]);
  });
  it('refuses checkout/primary, roots, home and overlapping scratch before writes', async () => {
    const { root, config } = await fixture();
    for (const repo of repositoryRoots()) expect(() => assertMutablePaths({ ...config, databasePath: join(repo, 'must-not-create.db') })).toThrow(/repository/);
    for (const scratchDir of [root, homedir(), dirname(config.databasePath), config.modelCacheDir, join(config.modelCacheDir, 'child')]) {
      expect(() => assertMutablePaths({ ...config, scratchDir })).toThrow(/scratch/);
    }
    expect(() => assertMutablePaths({ ...config, modelCacheDir: join(config.scratchDir, 'child') })).toThrow(/scratch/);
    expect(await readdir(root)).toEqual([]);
  });
  it('uses resolved ancestors to reject a junction into the checkout', async () => {
    const { root, config } = await fixture();
    const link = join(root, 'repository-link');
    await symlink(resolve('.'), link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => assertMutablePaths({ ...config, databasePath: join(link, 'must-not-create.db') })).toThrow(/repository/);
  });
  it('excludes external native registered worktrees and ignores foreign registrations without translating', async () => {
    const { root, config } = await fixture();
    const primary = join(root, 'synthetic-checkout');
    const other = join(root, 'other-checkout');
    for (const name of ['native', 'foreign']) await mkdir(join(primary, '.git', 'worktrees', name), { recursive: true });
    await mkdir(other);
    await writeFile(join(primary, '.git', 'worktrees', 'native', 'gitdir'), join(other, '.git'));
    const foreign = process.platform === 'win32' ? '/foreign/linux/.git' : 'C:/foreign/windows/.git';
    await writeFile(join(primary, '.git', 'worktrees', 'foreign', 'gitdir'), foreign);
    const exclusions = repositoryRoots(primary);
    expect(exclusions).toEqual([primary, other]);
    expect(() => assertMutablePaths({ ...config, databasePath: join(other, 'state.db') }, exclusions)).toThrow(/repository/);
  });

  it('uses native segment, drive and Windows case containment', async () => {
    const { root } = await fixture();
    expect(pathInside(root, join(root, 'child'))).toBe(true);
    expect(pathInside(root, `${root}-sibling`)).toBe(false);
    if (process.platform === 'win32') {
      expect(pathInside('C:\\Scratch', 'c:\\scratch\\child')).toBe(true);
      expect(pathInside('C:\\Scratch', 'D:\\Scratch\\child')).toBe(false);
    }
  });
  it('opens, saves, closes and reopens native Unicode/spaced file-backed SQLite', async () => {
    const { root } = await fixture();
    const path = join(root, 'żółć state.db');
    const first = SqliteLocalPersistence.open(path);
    first.saveSnapshot(createEmptyLocalStoreSnapshot());
    const status = first.status();
    first.close();
    const second = SqliteLocalPersistence.open(path);
    expect(second.status().schemaVersion).toBe(status.schemaVersion);
    expect(second.loadSnapshot()).toEqual(createEmptyLocalStoreSnapshot());
    second.close();
    expect((await readFile(path)).byteLength).toBeGreaterThan(0);
  });
});

describe('service authoritative path boundary', () => {
  it('advertises capability, refuses invalid paths for every job before runners, jobs or scratch writes', async () => {
    const { root, config } = await fixture();
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '{"streams":[]}', stderr: '' }));
    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    try {
      const status = await fetch(`${service.origin}/api/status`).then((r) => r.json());
      expect(status.config.pathPolicy).toEqual(nativePathPolicy(process.platform));
      expect(JSON.stringify(status)).not.toContain(root);
      const kinds = ['local-transcription', 'elevenlabs-scribe', 'embedded-subtitle-list', 'embedded-subtitle-extract', 'source-audio-snippet'];
      const invalid = ['relative.mp4', 'C:clip.mp4', '//server/share/clip.mp4', '\\\\?\\C:\\clip.mp4', 'blob:playback', 'browser-file-handle:clip.mp4', ':memory:', process.platform === 'win32' ? '/clip.mp4' : 'C:/Media/clip.mp4'];
      for (const kind of kinds) for (const mediaPath of invalid) {
        const response = await fetch(`${service.origin}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, payload: { mediaPath, streamIndex: 0, outputFormat: 'srt', role: 'target', startMs: 0, endMs: 1 } }) });
        expect(response.status).toBe(400);
        expect(await response.json()).not.toHaveProperty('job');
      }
      expect(runner).not.toHaveBeenCalled();
      expect(await readdir(service.config.scratchDir)).toEqual(['source-audio-snippets']);
    } finally { await service.close(); }
  });
  it('rejects missing files, directories and media inside scratch without a runner bypass', async () => {
    const { root, config } = await fixture();
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '{"streams":[]}', stderr: '' }));
    const service = await startLingotorteLocalService(config, { commandRunner: runner });
    try {
      const scratchMedia = join(config.scratchDir, 'input.mp4');
      await writeFile(scratchMedia, 'synthetic');
      for (const mediaPath of [join(root, 'missing.mp4'), root, scratchMedia]) {
        const response = await fetch(`${service.origin}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'embedded-subtitle-list', payload: { mediaPath } }) });
        expect(response.status).toBe(400);
        await response.json();
      }
      expect(runner).not.toHaveBeenCalled();
    } finally { await service.close(); }
  });
  it('supports a dedicated external scratch junction using its resolved run root', async () => {
    const { root, config } = await fixture();
    const target = join(root, 'dedicated-scratch-target');
    await mkdir(target);
    await symlink(target, config.scratchDir, process.platform === 'win32' ? 'junction' : 'dir');
    const service = await startLingotorteLocalService(config);
    try {
      expect(pathInside(target, service.config.scratchDir)).toBe(true);
      const cleanup = await fetch(`${service.origin}/api/artifacts/cleanup`, { method: 'POST' });
      expect(cleanup.status).toBe(200);
      await cleanup.json();
    } finally { await service.close(); }
  });

  it('cleans only its owned run child and unlinks junctions without traversing; DB/cache survive', async () => {
    const { root, config } = await fixture();
    await mkdir(config.scratchDir);
    const parentFile = join(config.scratchDir, 'operator-file.txt');
    await writeFile(parentFile, 'keep');
    const service = await startLingotorteLocalService(config);
    try {
      const cacheFile = join(config.modelCacheDir, 'synthetic-cache.txt');
      await writeFile(cacheFile, 'cache stays');
      await writeFile(join(service.config.scratchDir, 'owned.txt'), 'delete');
      await symlink(config.modelCacheDir, join(service.config.scratchDir, 'linked-cache'), process.platform === 'win32' ? 'junction' : 'dir');
      const response = await fetch(`${service.origin}/api/artifacts/cleanup`, { method: 'POST' });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, deletedFiles: 1 });
      expect(await readFile(parentFile, 'utf8')).toBe('keep');
      expect(await readFile(cacheFile, 'utf8')).toBe('cache stays');
      expect(await readdir(service.config.scratchDir)).toEqual(['source-audio-snippets']);
      expect((await readFile(config.databasePath)).length).toBeGreaterThan(0);
      expect(root).not.toBe(service.config.scratchDir);
    } finally { await service.close(); }
  });
});
