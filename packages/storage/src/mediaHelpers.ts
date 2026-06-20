import { createHash } from 'node:crypto';
import { createReadStream, stat } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { promisify } from 'node:util';
import type { MediaAsset, MediaFileObservation, Sha256Digest, SourceKind, SubtitleFormat } from '@lingotorte/domain';

export * from '@lingotorte/domain';

const statAsync = promisify(stat);

export async function sha256File(path: string): Promise<Sha256Digest> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(`sha256:${hash.digest('hex')}` as Sha256Digest));
  });
}

export async function sha256Text(text: string): Promise<Sha256Digest> {
  const hash = createHash('sha256');
  hash.update(text, 'utf8');
  return `sha256:${hash.digest('hex')}` as Sha256Digest;
}

export async function probeMediaFile(path: string): Promise<{
  sizeBytes: number;
  durationMs: number;
  container: string;
}> {
  const stats: Stats = await statAsync(path);
  // Local-only probe: we do not shell out to ffprobe by default to avoid subprocess/dependency drift.
  // Duration and container are inferred from extension and size for the local skeleton.
  const container = path.split('.').pop()?.toLowerCase() ?? 'unknown';
  // Placeholder duration heuristic: 1 second per 50 KB for synthetic fixtures.
  const durationMs = Math.max(1000, Math.round(stats.size / 50_000) * 1000);
  return { sizeBytes: stats.size, durationMs, container };
}

export function inferSubtitleFormat(path: string): SubtitleFormat {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'srt':
      return 'srt';
    case 'vtt':
      return 'vtt';
    case 'ass':
    case 'ssa':
      return 'ass';
    case 'json':
      return 'json';
    default:
      throw new TypeError(`Unsupported subtitle format for path: ${path}`);
  }
}

export function normalizeCueText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function readLocalSubtitle(path: string): Promise<{ text: string; sha256: Sha256Digest }> {
  const text = await readFile(path, 'utf8');
  const sha256 = await sha256Text(text);
  return { text, sha256 };
}

export function sourceKindFromPath(path: string): SourceKind {
  // Heuristic only: paths under fixtures/ are trusted synthetic in tests.
  if (path.includes('fixtures/')) {
    return 'synthetic';
  }
  return 'owned';
}

export function mediaAssetFingerprint(asset: MediaAsset): string {
  // Stable fingerprint for local media identity: content hash + path + duration.
  return [asset.contentSha256, asset.originalPath, String(asset.durationMs)].join('|');
}

export function observationMatchesAsset(observation: MediaFileObservation, asset: MediaAsset): boolean {
  return observation.contentSha256 === asset.contentSha256 && observation.exists;
}

export function formatMediaMissingReason(asset: MediaAsset, observation?: MediaFileObservation): string {
  if (!observation) {
    return `Media ${asset.id} has not been observed since import at ${asset.originalPath}`;
  }
  if (!observation.exists) {
    return `Media ${asset.id} is missing at observed path ${observation.path}`;
  }
  if (observation.contentSha256 !== asset.contentSha256) {
    return `Media ${asset.id} content changed at ${observation.path}; expected ${asset.contentSha256}, observed ${observation.contentSha256}`;
  }
  return '';
}
