import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, win32, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNativePath, type NativePlatform } from '../../../packages/domain/src/nativePaths.ts';
import { assertNativeOutput, pathInside, resolvedNativePath } from '../../../packages/domain/src/nativePathsNode.ts';

export type MutablePaths = Readonly<{ dataDir?: string; databasePath: string; scratchDir: string; modelCacheDir: string }>;

export function mutablePathsFromEnv(env: NodeJS.ProcessEnv, platform: NativePlatform, home: string): MutablePaths {
  const paths = platform === 'win32' ? win32 : posix;
  const directory = (value: string) => validateNativePath(value, platform, 'directory');
  const dataDir = directory(env.LINGOTORTE_DATA_DIR ?? (platform === 'win32'
    ? paths.join(directory(env.LOCALAPPDATA ?? paths.join(directory(home), 'AppData', 'Local')), 'lingotorte')
    : paths.join(env.XDG_DATA_HOME !== undefined ? directory(env.XDG_DATA_HOME) : paths.join(directory(home), '.local', 'share'), 'lingotorte')));
  return {
    dataDir,
    databasePath: validateNativePath(env.LINGOTORTE_DB_PATH ?? paths.join(dataDir, 'state.db'), platform, 'output-file'),
    scratchDir: directory(env.LINGOTORTE_SCRATCH_DIR ?? paths.join(dataDir, 'scratch')),
    modelCacheDir: directory(env.LINGOTORTE_MODEL_CACHE_DIR ?? paths.join(dataDir, 'models')),
  };
}

/**
 * lt-foe.3.2: derived gloss database (scripts/import-glosses.ts). Read-only input, so it is
 * not part of MutablePaths; defaults beside the data directory when not configured.
 */
export function glossDbPathFromEnv(env: NodeJS.ProcessEnv, platform: NativePlatform, home: string): string {
  if (env.LINGOTORTE_GLOSS_DB_PATH !== undefined) return validateNativePath(env.LINGOTORTE_GLOSS_DB_PATH, platform, 'input-file');
  const paths = platform === 'win32' ? win32 : posix;
  return paths.join(mutablePathsFromEnv(env, platform, home).dataDir!, 'glosses-pl.sqlite');
}

/** Worktree gitdir metadata locates the associated primary checkout without invoking Git. */
export function repositoryRoots(checkout = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')): string[] {
  const roots = [checkout];
  const gitEntry = join(checkout, '.git');
  let common = gitEntry;
  if (statSync(gitEntry).isFile()) {
    const match = /^gitdir: (.+)\s*$/m.exec(readFileSync(gitEntry, 'utf8'));
    if (!match) throw new TypeError('Cannot establish repository path exclusions.');
    const gitDir = resolve(checkout, match[1]!.trim());
    common = resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim());
    roots.push(dirname(common));
  }
  const worktrees = join(common, 'worktrees');
  if (existsSync(worktrees)) {
    for (const name of readdirSync(worktrees)) {
      const registered = dirname(readFileSync(join(worktrees, name, 'gitdir'), 'utf8').trim());
      // Git metadata can retain stale registrations from another OS. They cannot
      // contain a host-native target; never translate them against the current drive.
      try { roots.push(validateNativePath(registered, process.platform, 'directory')); } catch { /* foreign namespace */ }
    }
  }
  return [...new Set(roots)];
}

export function assertMutablePaths(config: MutablePaths, roots = repositoryRoots(), home = homedir()): void {
  const values = [config.databasePath, config.scratchDir, config.modelCacheDir, ...(config.dataDir === undefined ? [] : [config.dataDir])];
  // Complete lexical pass before resolving any operator-supplied path.
  for (const [index, value] of values.entries()) validateNativePath(value, process.platform, index === 0 ? 'output-file' : 'directory');
  const resolvedRoots = roots.map(resolvedNativePath);
  const resolved = values.map(resolvedNativePath);
  // Missing targets still have incompatible roles: creating a directory at or
  // below the future database would turn its file path into a directory.
  if (values.slice(1).some((directory) => pathInside(config.databasePath, directory))
    || resolved.slice(1).some((directory) => pathInside(resolved[0]!, directory))) {
    throw new TypeError('Local database file must not equal or contain a configured directory path.');
  }
  for (const [index, value] of values.entries()) {
    if (roots.some((root) => pathInside(root, value)) || resolvedRoots.some((root) => pathInside(root, resolved[index]!))) {
      throw new TypeError('Mutable local paths must be outside the repository and associated worktrees.');
    }
    assertNativeOutput(value, index === 0 ? 'output-file' : 'directory');
  }
  const [db, scratch, cache] = resolved as [string, string, string, ...string[]];
  const homePath = resolvedNativePath(home);
  if (pathInside(scratch, homePath) || (config.dataDir !== undefined && pathInside(scratch, resolvedNativePath(config.dataDir)))
    || pathInside(scratch, db) || pathInside(scratch, cache) || pathInside(cache, scratch)
    || resolvedRoots.some((root) => pathInside(scratch, root))) {
    throw new TypeError('Local scratch must be dedicated: no overlap with home, data root, database, model cache or repository.');
  }
}

export function assertMediaOutsideScratch(mediaPath: string, scratchDir: string): void {
  if (pathInside(scratchDir, mediaPath) || pathInside(resolvedNativePath(scratchDir), resolvedNativePath(mediaPath))) {
    throw new TypeError('Input media path must be outside local scratch.');
  }
}
