import { accessSync, constants, lstatSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { validateNativePath, type NativePathPurpose } from './nativePaths.ts';

export function hostNativePath(value: unknown, purpose: NativePathPurpose): string {
  return validateNativePath(value, process.platform, purpose);
}

/** Segment-aware, host-native comparison (including Windows case/volume semantics). */
export function pathInside(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

/** Resolve existing ancestors even for a not-yet-created output. Never hide access errors. */
export function resolvedNativePath(value: string): string {
  const path = hostNativePath(value, 'output-file');
  const suffix: string[] = [];
  let current = path;
  while (true) {
    try {
      lstatSync(current);
      const resolved = realpathSync(current);
      // Windows may report ENOENT for a child of a regular file. An existing
      // ancestor must be a directory when components remain; inspect its
      // resolved target so dedicated directory symlinks/junctions still work.
      if (suffix.length > 0 && !statSync(resolved).isDirectory()) throw new TypeError('Local path ancestor must be a directory.');
      // The root ancestor is permitted internally, never as a configured target.
      return hostNativePath(join(resolved, ...suffix), 'output-file');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new TypeError('Local path target is unavailable.');
      const parent = dirname(current);
      if (parent === current) throw new TypeError('Local path ancestor is unavailable.');
      suffix.unshift(current.slice(parent.length).replace(/^[\\/]/, ''));
      current = parent;
    }
  }
}

export function assertReadableNativeFile(value: string): string {
  const path = hostNativePath(value, 'input-file');
  try {
    const target = resolvedNativePath(path);
    if (!statSync(target).isFile()) throw new Error('not regular');
    accessSync(target, constants.R_OK);
    return path;
  } catch { throw new TypeError('Input path must name an existing readable regular local file.'); }
}

export function assertNativeOutput(value: string, purpose: 'output-file' | 'directory' = 'output-file'): string {
  const path = hostNativePath(value, purpose);
  resolvedNativePath(path);
  try {
    const info = statSync(path);
    if (purpose === 'directory' ? !info.isDirectory() : !info.isFile()) throw new TypeError('Local output path has an incompatible type.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new TypeError('Local output path has an incompatible type or is unavailable.');
  }
  return path;
}

/** Bare executable names use PATH; explicit paths remain single native tokens. */
export function nativeExecutable(value: string): string {
  if (/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(value) && value !== '.' && value !== '..') return value;
  return hostNativePath(value, 'input-file');
}
