// lt-192.4 S4 (plan §5 N12, permissions, F1). POSIX only: run in the Linux container (Node 26.7.0). On a Windows
// host these rows are a NAMED skip (the store fails startup there because O_NOFOLLOW/O_NONBLOCK are absent).
// Confinement rows: library equal to / inside / containing each excluded root, lexically and through symlink
// aliases in both directions; every one fails startup before ANY mutation. Permissions rows are separate.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmod, mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer as createNetServer, type Server } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLingotorteLocalService, type LocalServiceConfig } from '../../apps/local-service/src/server.ts';
import { assertManagedLibrarySupport } from '../../apps/local-service/src/managedMedia.ts';
import { assertLibraryPath, repositoryRoots } from '../../apps/local-service/src/nativeConfig.ts';
import { insertBlobRow, insertMediaAsset, makeLibrary, seedManagedBlob, sha256Hex, syntheticBytes } from '../helpers/managedMediaFixture.ts';
import { dechunk, startMediaService, treeManifest, until, type MediaService } from '../helpers/lt1924Service.ts';

const posix = process.platform !== 'win32';
// Hundreds of raw-socket requests per test: bounded generously so a loaded full-suite run is not a false timeout.
vi.setConfig({ testTimeout: 30_000 });
const roots: string[] = [];
const services: MediaService[] = [];
afterEach(async () => {
  while (services.length) await services.pop()!.service.close().catch(() => undefined);
  while (roots.length) { const root = roots.pop()!; await chmod(root, 0o700).catch(() => undefined); await rm(root, { recursive: true, force: true }); }
});
async function tempRoot(prefix = 'lt-192-4-lib-') { const root = await mkdtemp(join(tmpdir(), prefix)); roots.push(root); return root; }
function baseConfig(root: string, libraryDir: string, extra: Partial<LocalServiceConfig> = {}): LocalServiceConfig {
  return { host: '127.0.0.1', port: 0, dataDir: join(root, 'data'), databasePath: join(root, 'data', 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'),
    allowOnlineProviders: false, libraryDir, ...extra };
}
async function expectStartupRefused(config: LocalServiceConfig, watched: string[], pattern: RegExp) {
  const before = JSON.stringify(await Promise.all(watched.map(treeManifest)));
  let delivered = false;
  await expect(startLingotorteLocalService(config, { receiveCapability: () => { delivered = true; } })).rejects.toThrow(pattern);
  expect(JSON.stringify(await Promise.all(watched.map(treeManifest)))).toBe(before);
  return delivered;
}
const fdCount = async () => (await readdir('/proc/self/fd')).length;
const withinMs = async <T>(ms: number, work: Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`exceeded ${ms} ms`)), ms); })]); }
  finally { clearTimeout(timer); }
};

describe('lt-192.4 managed library: unsupported platform fails closed (any host)', () => {
  it('missing O_NOFOLLOW, O_NONBLOCK or uid support is a startup TypeError, never a degraded fallback', () => {
    expect(() => assertManagedLibrarySupport({ O_NONBLOCK: 2048 }, () => 1000)).toThrow(TypeError);
    expect(() => assertManagedLibrarySupport({ O_NOFOLLOW: 131072 }, () => 1000)).toThrow(TypeError);
    expect(() => assertManagedLibrarySupport({ O_NOFOLLOW: 131072, O_NONBLOCK: 2048 }, null)).toThrow(TypeError);
    expect(() => assertManagedLibrarySupport({ O_NOFOLLOW: 131072, O_NONBLOCK: 2048 }, () => 1000)).not.toThrow();
  });
  it.skipIf(posix)('named skip on POSIX / runs on Windows: a configured library refuses startup on win32', () => {
    expect(() => assertLibraryPath('C:\\library', { databasePath: 'C:\\x\\s.db', scratchDir: 'C:\\x\\s', modelCacheDir: 'C:\\x\\m' })).toThrow(/POSIX/);
  });
});

describe.skipIf(!posix)('lt-192.4 managed library confinement (N12, plan G3)', () => {
  it('library equal to, inside or containing each excluded root fails startup before any mutation (lexical)', async () => {
    const root = await tempRoot();
    const cfg = baseConfig(root, '');
    const home = homedir();
    const repo = repositoryRoots()[0]!;
    const cases: [string, string][] = [
      ['state data root', cfg.dataDir!], ['inside state', join(cfg.dataDir!, 'library')], ['containing state', root],
      ['database path', cfg.databasePath], ['inside database', join(cfg.databasePath, 'lib')],
      ['scratch', cfg.scratchDir], ['inside scratch', join(cfg.scratchDir, 'lib')], ['models', cfg.modelCacheDir], ['inside models', join(cfg.modelCacheDir, 'lib')],
      ['home', home], ['inside home', join(home, 'lt-192-4-library')], ['containing home', join(home, '..')],
      ['repository', repo], ['inside repository', join(repo, 'lt-192-4-library')], ['containing repository', join(repo, '..')],
      ['/media', '/media'], ['inside /media', '/media/library'], ['containing /media', '/'],
    ];
    for (const [label, library] of cases) {
      const delivered = await expectStartupRefused({ ...cfg, libraryDir: library }, [root], /Managed media library|path/i);
      expect(delivered, label).toBe(false);
      expect(await readdir(root), label).toEqual([]);
      if (!library.startsWith(root)) await expect(stat(join(library, 'blobs')), label).rejects.toMatchObject({ code: 'ENOENT' });
    }
    expect(cases).toHaveLength(18);
  });

  it('symlink aliases in both directions fail on the resolved pass, before any mutation', async () => {
    const root = await tempRoot();
    const library = await makeLibrary(root);
    const elsewhere = await mkdtemp(join(tmpdir(), 'lt-192-4-alias-')); roots.push(elsewhere);
    // (a) another root aliased INTO the library: scratch is a link whose target lies inside the library.
    await mkdir(join(library, 'inner'));
    await symlink(join(library, 'inner'), join(elsewhere, 'scratch-link'));
    const a = baseConfig(root, library, { scratchDir: join(elsewhere, 'scratch-link') });
    expect(() => assertLibraryPath(library, a)).toThrow(/\(resolved\)/);
    await expectStartupRefused(a, [root, elsewhere], /\(resolved\)/);
    // (b) the library aliased INTO another root: the library path is a link into the data root.
    const dataTarget = join(root, 'data', 'aliased'); await mkdir(dataTarget, { recursive: true });
    await symlink(dataTarget, join(elsewhere, 'library-link'));
    const b = baseConfig(root, join(elsewhere, 'library-link'));
    expect(() => assertLibraryPath(b.libraryDir!, b)).toThrow(/\(resolved\)/);
    await expectStartupRefused(b, [root, elsewhere], /\(resolved\)/);
    // (c) the library aliased onto a parent of the models directory.
    await symlink(root, join(elsewhere, 'root-link'));
    const c = baseConfig(root, join(elsewhere, 'root-link'));
    await expectStartupRefused(c, [root, elsewhere], /\(resolved\)/);
    expect(await readdir(library)).toEqual(['inner']);
    expect(await readdir(join(root))).toEqual(['data', 'library']);
  });

  it('a disjoint library passes confinement and the service creates only blobs/ (0700) inside it', async () => {
    const root = await tempRoot();
    const library = await makeLibrary(root);
    const s = await startMediaService({ root, library }); services.push(s);
    expect(await readdir(library)).toEqual(['blobs']);
    expect((await stat(join(library, 'blobs'))).mode & 0o777).toBe(0o700);
  });
});

describe.skipIf(!posix)('lt-192.4 managed library permissions (separate from confinement)', () => {
  it('a symlinked root, a symlinked blobs/, a non-directory and a missing root fail startup with no blobs/ and no database', async () => {
    const root = await tempRoot();
    const real = await makeLibrary(root, 'real-library');
    await symlink(real, join(root, 'library-link'));
    await expectStartupRefused(baseConfig(root, join(root, 'library-link')), [root], /real directory, not a link/);
    const withLinkedBlobs = await makeLibrary(root, 'linked-blobs');
    await mkdir(join(root, 'blob-target'));
    await symlink(join(root, 'blob-target'), join(withLinkedBlobs, 'blobs'));
    await expectStartupRefused(baseConfig(root, withLinkedBlobs), [root], /blobs directory must be a real directory/);
    await writeFile(join(root, 'plain-file'), 'x');
    await expectStartupRefused(baseConfig(root, join(root, 'plain-file')), [root], /directory/);
    await expectStartupRefused(baseConfig(root, join(root, 'missing')), [root], /existing directory/);
    expect((await readdir(root)).sort()).toEqual(['blob-target', 'library-link', 'linked-blobs', 'plain-file', 'real-library']);
  });
  it('a 0500 root (EACCES) and a root not owned by the service uid fail startup', async () => {
    const root = await tempRoot();
    const library = await makeLibrary(root);
    await chmod(library, 0o500);
    await expectStartupRefused(baseConfig(root, library), [root], /writable by the service user/);
    await chmod(library, 0o700);
    // A directory owned by another uid (root-owned system directory, not an excluded root, never written).
    const foreign = '/opt';
    expect((await stat(foreign)).uid).not.toBe(process.getuid!());
    await expectStartupRefused(baseConfig(root, foreign), [root], /owned by the service user/);
  });
  it.skipIf(!process.env.LT1924_READONLY_LIBRARY)('read-only file system root (EROFS) fails startup [needs LT1924_READONLY_LIBRARY in a --read-only container]', async () => {
    const library = process.env.LT1924_READONLY_LIBRARY!;
    const root = await tempRoot();
    await expect(writeFile(join(library, 'probe'), 'x')).rejects.toMatchObject({ code: 'EROFS' });
    await expectStartupRefused(baseConfig(root, library), [root], /writable by the service user/);
  });
});

describe.skipIf(!posix)('lt-192.4 blob confinement and FIFO without a writer (N12, F1)', () => {
  it('symlinked blob, directory, socket and FIFO entries are bytes-missing / 404 (HEAD bodyless), bounded, with no leaked fds or slots', async () => {
    const s = await startMediaService(); services.push(s);
    const cookie: [string, string] = ['Cookie', `lt_media=${await s.mint()}`];
    const blobs = join(s.libraryDir!, 'blobs');
    const outside = join(s.root, 'outside.bin'); const outsideBytes = syntheticBytes(32); await writeFile(outside, outsideBytes);
    const planted: Record<string, () => Promise<{ sha: string; size: number }>> = {
      'symlink to a regular file of the right size': async () => { const sha = sha256Hex(outsideBytes); await symlink(outside, join(blobs, sha)); return { sha, size: 32 }; },
      directory: async () => { const sha = sha256Hex(Buffer.from('dir')); await mkdir(join(blobs, sha)); return { sha, size: 4096 }; },
      'unix socket': async () => { const sha = sha256Hex(Buffer.from('sock')); await new Promise<void>(resolve => { const server: Server = createNetServer(); server.listen(join(blobs, sha), resolve); sockets.push(server); }); return { sha, size: 1 }; },
      'FIFO with no writer': async () => { const sha = sha256Hex(Buffer.from('fifo')); execFileSync('mkfifo', [join(blobs, sha)]); return { sha, size: 1 }; },
    };
    const sockets: Server[] = [];
    try {
      for (const [label, plant] of Object.entries(planted)) {
        const { sha, size } = await plant();
        insertBlobRow(s.config.databasePath, sha, size);
        const mediaId = insertMediaAsset(s.config.databasePath, { sha256: sha, size });
        const baseline = await fdCount();
        const m3 = await withinMs(2000, s.request('GET', `/api/media/${mediaId}/storage`, [s.bearer()]));
        expect(JSON.parse(dechunk(m3).toString()), label).toEqual({ ok: true, state: 'bytes-missing' });
        const get = await withinMs(2000, s.request('GET', `/api/media/${mediaId}/content`, [cookie]));
        expect(get.status, label).toBe(404);
        expect(get.raw.toString('latin1')).not.toContain(sha);
        const head = await withinMs(2000, s.request('HEAD', `/api/media/${mediaId}/content`, [cookie]));
        expect(head.status, label).toBe(404); expect(head.body.length).toBe(0);
        expect(s.observe(), label).toMatchObject({ activeMediaSlots: 0, pendingMediaOpens: 0, liveMediaStreams: 0 });
        // Socket teardown of the finished requests is asynchronous: a leaked descriptor never returns, so poll.
        await until(async () => await fdCount() <= baseline, 2000, `${label}: /proc/self/fd count back to ${baseline}`);
      }
      // A regular blob in the same store still serves.
      const good = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(64));
      expect((await s.request('GET', `/api/media/${good.mediaId}/content`, [cookie])).status).toBe(200);
      // close() with the FIFO present, and with an M4 request to it in flight, resolves within the same bound.
      const fifo = sha256Hex(Buffer.from('fifo'));
      const fifoMedia = insertMediaAsset(s.config.databasePath, { sha256: fifo, size: 1, title: 'second asset on the same fifo' });
      const inFlight = s.request('GET', `/api/media/${fifoMedia}/content`, [cookie]).catch(error => error);
      await withinMs(2000, s.service.close());
      services.pop();
      const outcome = await inFlight;
      expect(outcome instanceof Error || [404, 503].includes(outcome.status)).toBe(true);
    } finally { for (const server of sockets) server.close(); }
  }, 15_000);
});
