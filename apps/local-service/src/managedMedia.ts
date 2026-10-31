import { close as fsClose, constants, createReadStream, fstat as fsFstat, open as fsOpen } from 'node:fs';
import { access, lstat, mkdir, realpath } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { ManagedBlobRow, ManagedMimeType } from '../../../packages/storage/src/sqliteLocalPersistence.ts';

/**
 * lt-192.4 (plan §4.1, design lt-zt0 §5): the read-only managed-blob store under LINGOTORTE_LIBRARY_DIR, the M3
 * storage status and the M4 content route. Paths are built only from a validated 64-hex digest; files are opened
 * O_RDONLY|O_NOFOLLOW|O_NONBLOCK, fstat-checked against the ready row, then streamed from that descriptor only.
 * No writer exists here: D has no production path that adds blobs (E owns uploads).
 */
export const MAX_MEDIA_SLOTS = 16;
export const MANAGED_MIME_TYPES: readonly ManagedMimeType[] = Object.freeze(['video/mp4', 'video/webm', 'video/x-matroska', 'application/octet-stream']);
export type { ManagedMimeType };
export type MediaStorageState =
  | Readonly<{ state: 'none' }> | Readonly<{ state: 'bytes-missing' }>
  | Readonly<{ state: 'complete'; sizeBytes: number; mimeType: ManagedMimeType }>;
export type BlobLookup = (mediaId: string) => ManagedBlobRow | null | undefined;
export type BlobStat = Readonly<{ isFile(): boolean; size: number }>;
/** Test-only seam (barriers and fault injection around open/fstat/close and the stream). */
export type BlobFs = Readonly<{
  open(path: string, flags: number): Promise<number>;
  fstat(fd: number): Promise<BlobStat>;
  close(fd: number): Promise<void>;
  /** A stream that owns `fd` from now on and closes it exactly once (autoClose) through `close`. */
  stream(fd: number, start: number, end: number): Readable;
}>;
export type ByteRange =
  | Readonly<{ kind: 'full' }>
  | Readonly<{ kind: 'partial'; start: number; end: number }>
  | Readonly<{ kind: 'unsatisfiable' }>;
export type ManagedMedia = Readonly<{
  /** undefined = unknown media id (404); 'busy' = no slot (503). Writes nothing to `res`. */
  storage(res: ServerResponse, mediaId: string): Promise<MediaStorageState | 'busy' | 'closing' | undefined>;
  /** Writes every M4 GET/HEAD status itself (200/206/404/416/503). */
  serveContent(req: IncomingMessage, res: ServerResponse, mediaId: string): Promise<void>;
  activeSlots(): number;
  pendingOpens(): number;
  liveStreams(): number;
  shutdown(): Promise<void>;
}>;

const HEX64 = /^[0-9a-f]{64}$/;
const DIGITS = /^\d+$/;

/** Fail closed: the protections this store depends on must exist on this platform. */
export function assertManagedLibrarySupport(flags: Readonly<{ O_NOFOLLOW?: number; O_NONBLOCK?: number }> = constants, getuid: unknown = process.getuid): void {
  if (typeof flags.O_NOFOLLOW !== 'number' || typeof flags.O_NONBLOCK !== 'number' || typeof getuid !== 'function') {
    throw new TypeError('Managed media library requires POSIX O_NOFOLLOW, O_NONBLOCK and a service uid.');
  }
}

async function assertOwnedRealDirectory(path: string, label: string): Promise<void> {
  let info;
  try { info = await lstat(path); } catch { throw new TypeError(`Managed media ${label} must be an existing directory.`); }
  if (info.isSymbolicLink() || !info.isDirectory()) throw new TypeError(`Managed media ${label} must be a real directory, not a link.`);
  if (info.uid !== process.getuid!()) throw new TypeError(`Managed media ${label} must be owned by the service user.`);
  let real: string;
  try { real = await realpath(path); } catch { throw new TypeError(`Managed media ${label} is unavailable.`); }
  if (real !== path) throw new TypeError(`Managed media ${label} must be its own canonical path.`);
  // Permissions only (EROFS/EACCES): this is not confinement evidence; confinement is assertLibraryPath.
  try { await access(path, constants.W_OK); } catch { throw new TypeError(`Managed media ${label} must be writable by the service user.`); }
}

/** Startup checks of the configured root and its blobs/ directory; creates blobs/ (0700) only after every root check. */
export async function prepareManagedLibrary(root: string): Promise<string> {
  assertManagedLibrarySupport();
  await assertOwnedRealDirectory(root, 'library root');
  const blobs = join(root, 'blobs');
  try { await lstat(blobs); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new TypeError('Managed media blobs directory is unavailable.');
    try { await mkdir(blobs, { mode: 0o700 }); } catch { throw new TypeError('Managed media blobs directory could not be created.'); }
  }
  await assertOwnedRealDirectory(blobs, 'blobs directory');
  return blobs;
}

/**
 * Pure Range selection for GET (RFC 9110 §14). One `bytes=` spec only; anything else is ignored (full).
 * Digits are compared as BigInt, so oversized numerals never overflow; clamped values are below `size`.
 */
export function selectRange(range: string | undefined, ifRange: string | undefined, etag: string, size: number): ByteRange {
  if (range === undefined) return { kind: 'full' };
  if (ifRange !== undefined && ifRange !== etag) return { kind: 'full' };
  const match = /^\s*([A-Za-z]+)=\s*(\d*)-(\d*)\s*$/.exec(range);
  if (!match || match[1]!.toLowerCase() !== 'bytes') return { kind: 'full' };
  const [first, last] = [match[2]!, match[3]!];
  const length = BigInt(size);
  if (first === '') {
    if (!DIGITS.test(last)) return { kind: 'full' };
    const suffix = BigInt(last);
    if (suffix === 0n || length === 0n) return { kind: 'unsatisfiable' };
    const start = suffix >= length ? 0n : length - suffix;
    return { kind: 'partial', start: Number(start), end: size - 1 };
  }
  const start = BigInt(first);
  if (last !== '') {
    const end = BigInt(last);
    if (end < start) return { kind: 'full' };
    if (start >= length) return { kind: 'unsatisfiable' };
    return { kind: 'partial', start: Number(start), end: Number(end >= length ? length - 1n : end) };
  }
  if (start >= length) return { kind: 'unsatisfiable' };
  return { kind: 'partial', start: Number(start), end: size - 1 };
}

const promisify1 = <T>(run: (done: (error: NodeJS.ErrnoException | null, value: T) => void) => void) =>
  new Promise<T>((resolve, reject) => run((error, value) => (error ? reject(error) : resolve(value))));

export const nodeBlobFs: BlobFs = Object.freeze({
  open: (path: string, flags: number) => promisify1<number>(done => fsOpen(path, flags, done)),
  fstat: (fd: number) => promisify1<BlobStat>(done => fsFstat(fd, done)),
  close: (fd: number) => new Promise<void>((resolve, reject) => fsClose(fd, error => (error ? reject(error) : resolve()))),
  stream: (fd: number, start: number, end: number) => createReadStream('', { fd, start, end, autoClose: true, emitClose: true }),
});

type OpenRecord = {
  aborted: boolean;
  released: boolean;
  fd: number | undefined;
  streamOwnsFd: boolean;
  stream: Readable | undefined;
  settled: Promise<void>;
  settle(): void;
};

function contentHeaders(row: ManagedBlobRow, length: number): Record<string, string | number> {
  return {
    'content-type': row.mimeType, 'content-length': length, 'accept-ranges': 'bytes', etag: `"sha256-${row.sha256}"`,
    'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin', 'cache-control': 'no-store',
  };
}

/** M4 error writer: generic JSON for GET, headers only for HEAD (RFC 9110 §9.3.2). */
function mediaError(req: IncomingMessage, res: ServerResponse, status: 404 | 503): void {
  if (res.headersSent || res.destroyed) return;
  const head = req.method === 'HEAD';
  const body = JSON.stringify({ ok: false, error: status === 404 ? 'Media content not found.' : 'Media busy; retry shortly.' });
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin', ...(status === 503 ? { 'retry-after': '1' } : {}),
    ...(head ? {} : { 'content-length': Buffer.byteLength(body) }),
  });
  res.end(head ? undefined : body);
}

export function createManagedMedia(blobsDir: string, blobFor: BlobLookup, options: { maxSlots?: number; fs?: BlobFs } = {}): ManagedMedia {
  assertManagedLibrarySupport();
  const maxSlots = options.maxSlots ?? MAX_MEDIA_SLOTS;
  if (!Number.isInteger(maxSlots) || maxSlots < 1) throw new TypeError('Invalid media slot cap.');
  const fs = options.fs ?? nodeBlobFs;
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const pending = new Set<OpenRecord>();
  const streams = new Set<{ stream: Readable; res: ServerResponse }>();
  let closing = false;

  /**
   * A client that closed while earlier awaits ran (admission, deliveryReady, dispatch) already emitted its one 'close';
   * a listener attached now would never fire, so that request must not reserve, open or stream anything. A request
   * destroyed after its body was fully read (autoDestroy) is not a client close; an unread one destroyed is.
   */
  const clientGone = (res: ServerResponse) => res.destroyed || (res.req?.destroyed === true && !res.req.readableEnded);
  /** Step 1: synchronous reservation; no await separates the check from the take or the close listener. */
  const reserve = (res: ServerResponse): OpenRecord | 'gone' | undefined => {
    if (clientGone(res)) return 'gone';
    if (closing || pending.size >= maxSlots) return undefined;
    let settle!: () => void;
    const settled = new Promise<void>(resolve => { settle = resolve; });
    const record: OpenRecord = { aborted: false, released: false, fd: undefined, streamOwnsFd: false, stream: undefined, settled, settle };
    pending.add(record);
    res.once('close', () => { record.aborted = true; record.stream?.destroy(); });
    return record;
  };
  /** Step 5: exactly once; closes the descriptor unless the stream owns it; a close failure is never retried. */
  const release = async (record: OpenRecord): Promise<void> => {
    if (record.released) return;
    record.released = true;
    const fd = record.fd;
    record.fd = undefined;
    try { if (fd !== undefined && !record.streamOwnsFd) await fs.close(fd); }
    catch { /* the kernel already freed it (close(2)); no retry, no path in any log */ }
    finally { pending.delete(record); record.settle(); }
  };
  const stale = (record: OpenRecord) => closing || record.aborted;

  /** Steps 2-3. 'missing' covers ENOENT/ELOOP/any open error, a non-regular file and a size mismatch. */
  const openVerified = async (record: OpenRecord, row: ManagedBlobRow): Promise<'ok' | 'missing' | 'stale'> => {
    if (!HEX64.test(row.sha256)) return 'missing';
    try { record.fd = await fs.open(join(blobsDir, row.sha256), flags); }
    catch { return stale(record) ? 'stale' : 'missing'; }
    if (stale(record)) return 'stale';
    let info: BlobStat;
    try { info = await fs.fstat(record.fd); }
    catch { return stale(record) ? 'stale' : 'missing'; }
    if (stale(record)) return 'stale';
    return info.isFile() && info.size === row.sizeBytes ? 'ok' : 'missing';
  };

  return Object.freeze({
    async storage(res, mediaId) {
      const row = blobFor(mediaId);
      if (row === undefined) return undefined;
      if (row === null) return { state: 'none' } as const;
      const record = reserve(res);
      if (record === 'gone') return 'busy';
      if (!record) return closing ? 'closing' : 'busy';
      let outcome: 'ok' | 'missing' | 'stale';
      try { outcome = await openVerified(record, row); } finally { await release(record); }
      if (outcome === 'stale') return closing ? 'closing' : 'busy';
      return outcome === 'ok' ? { state: 'complete', sizeBytes: row.sizeBytes, mimeType: row.mimeType } : { state: 'bytes-missing' };
    },
    async serveContent(req, res, mediaId) {
      const row = blobFor(mediaId);
      if (!row) { mediaError(req, res, 404); return; }
      const record = reserve(res);
      if (record === 'gone') return;
      if (!record) { mediaError(req, res, 503); return; }
      let outcome: 'ok' | 'missing' | 'stale';
      try { outcome = await openVerified(record, row); }
      catch { outcome = 'missing'; }
      if (outcome !== 'ok' || req.method === 'HEAD') {
        await release(record);
        if (outcome === 'stale') { if (!record.aborted) mediaError(req, res, 503); return; }
        if (outcome === 'missing') { mediaError(req, res, 404); return; }
        // HEAD ignores Range/If-Range: always the full representation, never 206/416, never a body or stream.
        res.writeHead(200, contentHeaders(row, row.sizeBytes));
        res.end();
        return;
      }
      const etag = `"sha256-${row.sha256}"`;
      const range = selectRange(req.headers.range, req.headers['if-range'] as string | undefined, etag, row.sizeBytes);
      if (range.kind === 'unsatisfiable') {
        await release(record);
        if (record.aborted || res.destroyed) return;
        if (closing) { mediaError(req, res, 503); return; }
        res.writeHead(416, { ...contentHeaders(row, 0), 'content-range': `bytes */${row.sizeBytes}` });
        res.end();
        return;
      }
      const [start, end] = range.kind === 'partial' ? [range.start, range.end] : [0, row.sizeBytes - 1];
      // Step 4: the stream owns the descriptor from here; release happens on stream close.
      const fd = record.fd!;
      record.streamOwnsFd = true;
      let stream: Readable;
      try { stream = fs.stream(fd, start, end); }
      catch { record.streamOwnsFd = false; await release(record); mediaError(req, res, 404); return; }
      record.stream = stream;
      const live = { stream, res };
      streams.add(live);
      stream.once('close', () => { streams.delete(live); void release(record); });
      stream.on('error', () => { if (!res.headersSent) mediaError(req, res, 404); else res.destroy(); });
      if (record.aborted || closing || clientGone(res)) { stream.destroy(); if (!record.aborted) res.destroy(); return; }
      res.writeHead(range.kind === 'partial' ? 206 : 200, {
        ...contentHeaders(row, end - start + 1),
        ...(range.kind === 'partial' ? { 'content-range': `bytes ${start}-${end}/${row.sizeBytes}` } : {}),
      });
      stream.pipe(res);
    },
    activeSlots: () => pending.size,
    pendingOpens: () => [...pending].filter(record => !record.stream).length,
    liveStreams: () => streams.size,
    async shutdown() {
      closing = true;
      for (const { stream, res } of [...streams]) { stream.destroy(); res.destroy(); }
      while (pending.size > 0) await Promise.allSettled([...pending].map(record => record.settled));
    },
  });
}

/** Read the configured library only after assertLibraryPath; returns the store bound to `blobFor`. */
export async function openManagedMedia(root: string, blobFor: BlobLookup, options: { maxSlots?: number; fs?: BlobFs } = {}): Promise<ManagedMedia> {
  return createManagedMedia(await prepareManagedLibrary(root), blobFor, options);
}
