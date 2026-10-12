import { startPairedService, pairedFetch } from '../helpers/pairedService.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertNativeOutput } from '../../packages/domain/src/nativePathsNode.ts';
import { assertMutablePaths } from '../../apps/local-service/src/nativeConfig.ts';
import { extractAudioWithFfmpeg, extractEmbeddedSubtitleTrack, extractSourceAudioSnippet, listEmbeddedSubtitleTracks } from '../../packages/local-transcription/src/index.ts';

const roots: string[] = [];
afterEach(async () => { while (roots.length) await rm(roots.pop()!, { recursive: true, force: true }); });

async function fileAncestorFixture() {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-file-ancestor-'));
  roots.push(root);
  const file = join(root, 'regular żółć.txt');
  await writeFile(file, 'synthetic regular file');
  return { root, file };
}

// Real host filesystem calls: Windows reports ENOENT (not ENOTDIR) for a
// child of a regular file. Run on Windows as well as POSIX; do not mock fs.
describe('native file-ancestor regression', () => {
  it.each(['output-file', 'directory'] as const)('allows missing %s descendants of a directory junction', async (purpose) => {
    const { root } = await fileAncestorFixture();
    const target = join(root, 'directory-target');
    const alias = join(root, 'directory-alias');
    await mkdir(target);
    await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const output = join(alias, 'missing', 'child');
    expect(assertNativeOutput(output, purpose)).toBe(output);
    expect(await readdir(target)).toEqual([]);
  });

  describe.each(['child', 'missing/child'])('unresolved suffix %s', (suffix) => {
    it.each(['output-file', 'directory'] as const)('rejects %s below a regular file', async (purpose) => {
      const { root, file } = await fileAncestorFixture();
      expect(() => assertNativeOutput(join(file, suffix), purpose)).toThrow(TypeError);
      expect(await readdir(root)).toEqual(['regular żółć.txt']);
      expect(await readFile(file, 'utf8')).toBe('synthetic regular file');
    });

    it.each(['databasePath', 'scratchDir', 'modelCacheDir', 'dataDir'] as const)('rejects %s before any startup writes', async (field) => {
      const { root, file } = await fileAncestorFixture();
      const config = {
        host: '127.0.0.1', port: 0, allowOnlineProviders: false,
        dataDir: join(root, 'data'), databasePath: join(root, 'new-db-parent', 'state.db'),
        scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'),
        [field]: join(file, suffix),
      };
      const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
      expect.soft(() => assertMutablePaths(config)).toThrow(TypeError);
      let startupError: unknown;
      try {
        const service = await startPairedService(config, { commandRunner: runner });
        await service.close();
      } catch (error) { startupError = error; }
      expect.soft(startupError).toBeInstanceOf(TypeError);
      expect.soft(runner).not.toHaveBeenCalled();
      // A rejection from mkdir is too late: even the DB parent must not exist.
      expect.soft(await readdir(root)).toEqual(['regular żółć.txt']);
      expect(await readFile(file, 'utf8')).toBe('synthetic regular file');
    });

    it.each(['audio', 'snippet', 'subtitle'] as const)('rejects %s output before the adapter runner', async (adapter) => {
      const { root, file } = await fileAncestorFixture();
      const inputPath = join(root, 'synthetic media.mkv');
      await writeFile(inputPath, 'synthetic media');
      const outputPath = join(file, suffix);
      const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
      const operation = adapter === 'audio'
        ? extractAudioWithFfmpeg({ inputPath, outputPath }, runner)
        : adapter === 'snippet'
          ? extractSourceAudioSnippet({ inputPath, outputPath, startMs: 0, endMs: 100 }, runner)
          : extractEmbeddedSubtitleTrack({ mediaPath: inputPath, outputPath, streamIndex: 0, outputFormat: 'srt' }, runner);
      await expect.soft(operation).rejects.toThrow(TypeError);
      expect.soft(runner).not.toHaveBeenCalled();
      expect((await readdir(root)).sort()).toEqual(['regular żółć.txt', 'synthetic media.mkv']);
      expect(await readFile(file, 'utf8')).toBe('synthetic regular file');
    });
  });
});

describe('future database directory-role regression', () => {
  describe.each(['direct', 'database-alias', 'directory-alias'] as const)('%s paths', (layout) => {
    describe.each(['equal', 'descendant'] as const)('directory is %s to database', (relation) => {
      it.each(['dataDir', 'scratchDir', 'modelCacheDir'] as const)('rejects %s before any startup writes', async (field) => {
        const { root, file } = await fileAncestorFixture();
        const target = join(root, 'target');
        const alias = join(root, 'alias');
        if (layout !== 'direct') {
          await mkdir(target);
          await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
        }
        // Neither the database nor the conflicting directory exists yet.
        const databasePath = join(layout === 'database-alias' ? alias : target, 'future.db');
        const directoryBase = join(layout === 'directory-alias' ? alias : target, 'future.db');
        const config = {
          host: '127.0.0.1', port: 0, allowOnlineProviders: false,
          dataDir: join(root, 'data'), databasePath,
          scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'),
          [field]: relation === 'equal' ? directoryBase : join(directoryBase, 'child'),
        };
        const before = (await readdir(root)).sort();
        const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
        expect.soft(() => assertMutablePaths(config)).toThrow(TypeError);
        let startupError: unknown;
        try {
          const service = await startPairedService(config, { commandRunner: runner });
          await service.close();
        } catch (error) { startupError = error; }
        expect.soft(startupError).toBeInstanceOf(TypeError);
        expect.soft(runner).not.toHaveBeenCalled();
        // SQLite/mkdir rejection after creating any DB parent/run child is too late.
        expect.soft((await readdir(root)).sort()).toEqual(before);
        if (layout !== 'direct') expect.soft(await readdir(target)).toEqual([]);
        expect(await readFile(file, 'utf8')).toBe('synthetic regular file');
      });
    });
  });

  describe.each(['direct', 'junction'] as const)('valid %s directory-parent layout', (layout) => {
    it.each(['dataDir', 'modelCacheDir'] as const)('allows database beneath %s with separate scratch', async (field) => {
      const { root } = await fileAncestorFixture();
      const target = join(root, 'directory-parent');
      const alias = join(root, 'directory-alias');
      if (layout === 'junction') {
        await mkdir(target);
        await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
      }
      const config = {
        host: '127.0.0.1', port: 0, allowOnlineProviders: false,
        dataDir: root, databasePath: join(target, 'state.db'),
        scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'),
        [field]: layout === 'junction' ? alias : target,
      };
      expect(() => assertMutablePaths(config)).not.toThrow();
      const service = await startPairedService(config);
      try {
        expect((await pairedFetch(`${service.origin}/api/status`)).status).toBe(200);
        expect((await readFile(config.databasePath)).length).toBeGreaterThan(0);
      } finally { await service.close(); }
    });
  });
});

describe('native path raw syntax regression', () => {
  it('rejects network syntax before normalization or a command runner', async () => {
    const runner = vi.fn(async () => ({ exitCode: 0, stdout: '{"streams":[]}', stderr: '' }));
    await expect(listEmbeddedSubtitleTracks({ mediaPath: '//server/share/clip.mp4' }, runner)).rejects.toThrow(/path/i);
    expect(runner).not.toHaveBeenCalled();
  });
});
