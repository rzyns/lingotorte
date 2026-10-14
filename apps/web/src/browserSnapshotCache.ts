/**
 * lt-0zc: browser-side crash/reload buffer for the learner LocalStoreSnapshot.
 *
 * NOT a second source of truth. The local service remains authoritative; this
 * cache only lets a reload show the last browser state, flagged 'unsaved' until
 * the service confirms it.
 *
 * Storage: a sibling IndexedDB database `lingotorte-snapshot-cache` (object
 * store `snapshots`, key `current`) rather than bumping the handle-store DB to
 * version 2. A sibling DB avoids upgrade coupling with browserHandleStore (an
 * older tab holding v1 open would block a v2 upgrade) and keeps this record
 * strictly separate from the handle store and from any future remembered-
 * pairing record (lt-cfh).
 *
 * Contract A28: the record holds only the LocalStoreSnapshot, track ids, base
 * URL, autosave preference and the last acknowledged serialized snapshot. It
 * never contains the pairing capability, pendingCueEdits, or anything from the
 * paired transport. Every backend call is wrapped; failures log once and the
 * app continues without the cache.
 */
import type { LocalStoreSnapshot } from '../../../packages/storage/src/localStore';
import type { AppModel } from './uiTypes';
import {
  lastAckedSnapshotBaseline,
  observeSnapshotCacheChanges,
  projectHydratedSnapshotIntoModel,
  seedCachedAckBaseline,
} from './model';

export const SNAPSHOT_CACHE_DB_NAME = 'lingotorte-snapshot-cache';
export const SNAPSHOT_CACHE_STORE_NAME = 'snapshots';
export const SNAPSHOT_CACHE_KEY = 'current';
export const SNAPSHOT_CACHE_SCHEMA_VERSION = 1;
export const SNAPSHOT_CACHE_DEBOUNCE_MS = 500;
export const SNAPSHOT_CACHE_READ_TIMEOUT_MS = 1500;
export const RESTORED_FROM_CACHE_MESSAGE = "Restored from this browser's cache; not yet confirmed by the local service.";

export type SnapshotCacheRecord = {
  schemaVersion: number;
  savedAt: string;
  snapshot: LocalStoreSnapshot;
  currentMediaId: string | null;
  targetTrackId: string | null;
  nativeTrackId: string | null;
  localService: { baseUrl: string; autosaveEnabled: boolean };
  lastAcked: { baseUrl: string; serialized: string } | null;
};

/** Injectable storage backend (IndexedDB in browsers; in-memory fake in tests). */
export type SnapshotCacheBackend = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

let warned = false;
function warnOnce(error: unknown): void {
  if (warned) return;
  warned = true;
  console.warn('Lingotorte browser snapshot cache unavailable; continuing without it.', error);
}
/** Test helper. */
export function resetSnapshotCacheWarningForTests(): void { warned = false; }

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

/** IndexedDB backend, or null when IndexedDB is unavailable (e.g. JSDOM). */
export function createIndexedDbSnapshotBackend(): SnapshotCacheBackend | null {
  if (typeof indexedDB === 'undefined' || indexedDB === null) return null;
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () => dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(SNAPSHOT_CACHE_DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(SNAPSHOT_CACHE_STORE_NAME)) req.result.createObjectStore(SNAPSHOT_CACHE_STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error('Snapshot cache database open blocked.')); };
  });
  const tx = async (mode: IDBTransactionMode) => (await open()).transaction(SNAPSHOT_CACHE_STORE_NAME, mode).objectStore(SNAPSHOT_CACHE_STORE_NAME);
  return {
    async get(key) { return request((await tx('readonly')).get(key)); },
    async put(key, value) { await request((await tx('readwrite')).put(value, key)); },
    async delete(key) { await request((await tx('readwrite')).delete(key)); },
  };
}

let defaultBackend: SnapshotCacheBackend | null | undefined;
function backendOrDefault(backend?: SnapshotCacheBackend | null): SnapshotCacheBackend | null {
  if (backend !== undefined) return backend;
  if (defaultBackend === undefined) {
    try { defaultBackend = createIndexedDbSnapshotBackend(); } catch (error) { warnOnce(error); defaultBackend = null; }
  }
  return defaultBackend;
}

/** Build the cache record from model state. Allow-list only (A28). Structured clone, no JSON round trip. */
export function buildSnapshotCacheRecord(model: AppModel): SnapshotCacheRecord {
  const lastAcked = lastAckedSnapshotBaseline(model);
  return {
    schemaVersion: SNAPSHOT_CACHE_SCHEMA_VERSION,
    savedAt: model.clock().toISOString(),
    snapshot: structuredClone(model.store.snapshot()),
    currentMediaId: model.currentMedia?.id ?? null,
    targetTrackId: model.targetTrackId,
    nativeTrackId: model.nativeTrackId,
    localService: { baseUrl: model.localService.baseUrl, autosaveEnabled: model.localService.autosaveEnabled },
    lastAcked: lastAcked ? { baseUrl: lastAcked.baseUrl, serialized: lastAcked.serialized } : null,
  };
}

function isRecord(value: unknown): value is SnapshotCacheRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<SnapshotCacheRecord>;
  return v.schemaVersion === SNAPSHOT_CACHE_SCHEMA_VERSION && typeof v.snapshot === 'object' && v.snapshot !== null
    && typeof v.localService === 'object' && v.localService !== null;
}

export async function writeSnapshotCache(model: AppModel, backend?: SnapshotCacheBackend | null): Promise<void> {
  const target = backendOrDefault(backend);
  if (!target) return;
  try { await target.put(SNAPSHOT_CACHE_KEY, buildSnapshotCacheRecord(model)); } catch (error) { warnOnce(error); }
}

/**
 * Outcome of the boot read. `unknown` (timeout or backend error) means the
 * stored record may still hold good state, so the caller must not overwrite it.
 */
export type SnapshotCacheReadResult =
  | { status: 'hit'; record: SnapshotCacheRecord }
  | { status: 'miss' }
  | { status: 'unknown' };

export async function readSnapshotCacheResult(backend?: SnapshotCacheBackend | null, timeoutMs = SNAPSHOT_CACHE_READ_TIMEOUT_MS): Promise<SnapshotCacheReadResult> {
  const target = backendOrDefault(backend);
  if (!target) return { status: 'unknown' };
  const timedOut = Symbol('timeout');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      target.get(SNAPSHOT_CACHE_KEY),
      new Promise<typeof timedOut>((resolve) => { timer = setTimeout(() => resolve(timedOut), timeoutMs); }),
    ]);
    if (value === timedOut) { warnOnce(new Error('Snapshot cache read timed out.')); return { status: 'unknown' }; }
    return isRecord(value) ? { status: 'hit', record: value } : { status: 'miss' };
  } catch (error) { warnOnce(error); return { status: 'unknown' }; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Read the cached record; resolves null on absence, mismatch, error or timeout. Never rejects. */
export async function readSnapshotCache(backend?: SnapshotCacheBackend | null, timeoutMs = SNAPSHOT_CACHE_READ_TIMEOUT_MS): Promise<SnapshotCacheRecord | null> {
  const result = await readSnapshotCacheResult(backend, timeoutMs);
  return result.status === 'hit' ? result.record : null;
}

/** Remove the cached record (for the deferred Settings "Clear this browser's cached state" button). */
export async function clearSnapshotCache(backend?: SnapshotCacheBackend | null): Promise<void> {
  const target = backendOrDefault(backend);
  if (!target) return;
  try { await target.delete(SNAPSHOT_CACHE_KEY); } catch (error) { warnOnce(error); }
}

/** Project a cached record into a freshly created model (before first render). */
export function hydrateModelFromSnapshotCache(model: AppModel, record: SnapshotCacheRecord): boolean {
  try {
    projectHydratedSnapshotIntoModel(model, structuredClone(record.snapshot));
    const tracks = model.store.snapshot().subtitleTracks;
    // Media selection follows projectHydratedSnapshotIntoModel (newest media); cached track ids apply only if they belong to it.
    const ownTrack = (id: string | null) => (id && tracks[id] && tracks[id].mediaId === model.currentMedia?.id ? id : null);
    const target = ownTrack(record.targetTrackId);
    if (target) {
      model.targetTrackId = target;
      model.cues = model.store.listCuesForTrack(target);
      model.player.activeCueId = model.cues[0]?.id ?? null;
    }
    const native = ownTrack(record.nativeTrackId);
    if (native) model.nativeTrackId = native;
    if (typeof record.localService.baseUrl === 'string' && record.localService.baseUrl) model.localService.baseUrl = record.localService.baseUrl;
    // lt-4ji: records written before the preference defaulted on, or lacking it, restore the default (on).
    model.localService.autosaveEnabled = record.localService.autosaveEnabled !== false;
    if (record.lastAcked && typeof record.lastAcked.serialized === 'string' && typeof record.lastAcked.baseUrl === 'string') {
      try { seedCachedAckBaseline(model, record.lastAcked.baseUrl, record.lastAcked.serialized); } catch { /* invalid origin: ignore baseline */ }
    }
    model.localService.syncState = 'unsaved';
    model.localService.lastMessage = RESTORED_FROM_CACHE_MESSAGE;
    return true;
  } catch (error) { warnOnce(error); return false; }
}

/**
 * Debounced writer: every model change signal schedules one write 500 ms later.
 * A pending write is flushed best-effort on pagehide / hidden visibility so the
 * last edits before a tab close are not lost. Single record: with several tabs
 * open, the last tab to write wins (documented limitation of a crash buffer).
 */
export function installSnapshotCacheWriter(model: AppModel, backend?: SnapshotCacheBackend | null, delayMs = SNAPSHOT_CACHE_DEBOUNCE_MS): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer); timer = undefined;
    void writeSnapshotCache(model, backend);
  };
  observeSnapshotCacheChanges(model, () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void writeSnapshotCache(model, backend); }, delayMs);
  });
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }
}

/**
 * Boot sequence used by main.ts: bounded read, hydrate, then install the writer.
 * If the read timed out or failed, the stored record may still hold the
 * learner's only copy of unsaved edits, so the writer is NOT installed for this
 * page load: an empty model must never overwrite a good cache.
 */
export async function bootSnapshotCache(model: AppModel, backend?: SnapshotCacheBackend | null): Promise<boolean> {
  const result = await readSnapshotCacheResult(backend);
  if (result.status === 'unknown') return false;
  const hydrated = result.status === 'hit' ? hydrateModelFromSnapshotCache(model, result.record) : false;
  installSnapshotCacheWriter(model, backend);
  return hydrated;
}
