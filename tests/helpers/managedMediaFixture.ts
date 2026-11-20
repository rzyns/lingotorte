// lt-192.4 (plan §6), TEST-ONLY: registers synthetic managed blobs without any production writer or endpoint.
// Bytes are written content-addressed to <library>/blobs/<sha256 hex> (mode 0400) and the ready row (plus an
// optional synthetic media_asset bound through contentSha256) is inserted through a separate DatabaseSync
// connection on the synthetic test database. Nothing here is imported by application code.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type SeededBlob = Readonly<{ mediaId: string; sha256: string; size: number; bytes: Buffer; path: string }>;

export const sha256Hex = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export const syntheticBytes = (size: number) => randomBytes(size);

/** A fresh, owned, real library directory (mode 0700) inside a test-owned temporary root. */
export async function makeLibrary(root: string, name = 'library'): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { mode: 0o700 });
  return dir;
}

export function insertMediaAsset(databasePath: string, input: { mediaId?: string; sha256: string; size: number; originalPath?: string; title?: string }): string {
  const mediaId = input.mediaId ?? randomUUID();
  const now = '2026-10-31T00:00:00.000Z';
  const db = new DatabaseSync(databasePath);
  try {
    db.prepare(`INSERT INTO media_asset (id, title, original_path, content_sha256, duration_ms, container, size_bytes, imported_at, last_seen_at, privacy_label)
      VALUES (?, ?, ?, ?, 1000, 'webm', ?, ?, ?, 'synthetic')`).run(mediaId, input.title ?? 'Synthetic managed media', input.originalPath ?? `managed:${input.sha256}`,
      `sha256:${input.sha256}`, input.size, now, now);
  } finally { db.close(); }
  return mediaId;
}

export function insertBlobRow(databasePath: string, sha256: string, size: number, mimeType = 'video/webm'): void {
  const db = new DatabaseSync(databasePath);
  try {
    db.prepare("INSERT INTO managed_media_blob (sha256, size_bytes, mime_type, probe_json, stored_at) VALUES (?, ?, ?, '{}', '2026-10-31T00:00:00.000Z')")
      .run(sha256, size, mimeType);
  } finally { db.close(); }
}

export async function writeBlobFile(libraryDir: string, bytes: Buffer): Promise<string> {
  const blobs = join(libraryDir, 'blobs');
  await mkdir(blobs, { recursive: true, mode: 0o700 });
  const path = join(blobs, sha256Hex(bytes));
  await writeFile(path, bytes, { mode: 0o400, flag: 'wx' });
  await chmod(path, 0o400);
  return path;
}

/** Blob file + ready row + a synthetic media asset bound by contentSha256. */
export async function seedManagedBlob(libraryDir: string, databasePath: string, bytes: Buffer,
  options: { mimeType?: string; mediaId?: string; originalPath?: string; title?: string } = {}): Promise<SeededBlob> {
  const sha256 = sha256Hex(bytes);
  const path = await writeBlobFile(libraryDir, bytes);
  insertBlobRow(databasePath, sha256, bytes.length, options.mimeType);
  const mediaId = insertMediaAsset(databasePath, { sha256, size: bytes.length, ...options });
  return { mediaId, sha256, size: bytes.length, bytes, path };
}
