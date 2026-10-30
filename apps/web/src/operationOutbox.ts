/**
 * lt-192.3 (ADR-0004 §5): durable per-operation outbox for paired vocabulary changes.
 *
 * One IndexedDB record per operation, in its own database (`lingotorte-learner-operations`), never inside the
 * last-writer snapshot-cache record. Every state change is one readwrite transaction that re-reads the record and
 * applies only an allowed transition, and resolves only after the transaction COMPLETES, so:
 * - an intent is shown as pending only once it is durable, and is sent only after `sending` (may have been sent) is
 *   durable;
 * - acknowledged/cancelled are terminal: a stale writer cannot resurrect them;
 * - two same-origin tabs cannot both claim one operation (IndexedDB serializes readwrite transactions on a store), and a
 *   cancel can never race a claim: exactly one wins;
 * - the cap counts unresolved operations in the same transaction as the add, and nothing unresolved is ever evicted;
 * - a draft handoff (resolve one field of an acknowledged capture's unapplied draft AND add its replacement operation)
 *   is ONE transaction: a killed page, a refused add (quota) or a full outbox leaves the draft open and no replacement,
 *   a committed one leaves the field resolved and the replacement durable. Never one without the other.
 */
import type { LearnerOperationBasis, LearnerOperationReceipt, LearnerOperationRequest } from '../../../packages/storage/src/learnerOperations.ts';
import type { Cue, MediaAsset, SubtitleTrack, TranscriptWordTiming } from '@lingotorte/domain';

export const OUTBOX_DB_NAME = 'lingotorte-learner-operations';
export const OUTBOX_OPERATIONS_STORE = 'operations';
export const OUTBOX_META_STORE = 'meta';
/** At most this many unresolved operations; a new intent beyond it is refused, never evicting older ones. */
export const OUTBOX_CAP = 200;
/** A `sending` claim older than this may be re-sent (same id, same request) by another tab. */
export const OUTBOX_DISPATCH_LEASE_MS = 15_000;
/** Acknowledged/cancelled records are kept briefly so other tabs can install them, then pruned. */
export const OUTBOX_RESOLVED_RETENTION_MS = 10 * 60_000;

export type OutboxStatus = 'pending' | 'sending' | 'acked' | 'conflict' | 'blocked' | 'cancelled';
export const UNRESOLVED_STATUSES: readonly OutboxStatus[] = ['pending', 'sending', 'conflict', 'blocked'];

/** What a capture needs on the service besides the intent: its unsaved media/track/bundle at capture time. */
export type CapturePrerequisites = Readonly<{ media: MediaAsset; track: SubtitleTrack; cues: Cue[]; wordTimings: TranscriptWordTiming[] }>;

export type OutboxRecord = Readonly<{
  operationId: string;
  baseUrl: string;
  /** Local creation order. */
  order: number;
  createdAt: string;
  /** Immutable: a retry sends exactly this. */
  request: LearnerOperationRequest;
  status: OutboxStatus;
  dispatch?: Readonly<{ owner: string; at: number }>;
  attempts: number;
  /** Short human label, e.g. `Save “kot”`. */
  label: string;
  savedItemId?: string;
  /** For undo-capture: the capture it depends on. */
  dependsOn?: string;
  prerequisites?: CapturePrerequisites;
  receipt?: LearnerOperationReceipt;
  error?: Readonly<{ code: string; message: string }> | undefined;
  resolvedAt?: number;
  /**
   * An acknowledged capture that joined an existing item without applying the learner's meaning/notes draft
   * (receipt.result.unappliedDraft). `open` keeps the record visible and unprunable until the learner explicitly
   * dismisses it or applies the meaning as a new operation; the draft is never applied automatically.
   */
  draftReview?: 'open' | 'dismissed' | 'applied';
  /**
   * Per-field resolution of that draft (re-review R3b): meaning and notes are decided separately. `draftReview` stays
   * `open` while any field present in the draft is unresolved; applying the meaning never resolves the notes.
   */
  draftResolved?: DraftResolution;
}>;

export type DraftResolution = Readonly<{ meaning?: 'applied' | 'dismissed'; notes?: 'dismissed' }>;
/** Computes the patch for a stored record inside the transaction, or null to refuse (leaving it unchanged). */
export type OutboxPatch = Partial<OutboxRecord> | ((record: OutboxRecord) => Partial<OutboxRecord> | null);

export type OutboxBackend = Readonly<{
  durable: boolean;
  /** Atomically add unless the unresolved count reached the cap. */
  add(record: OutboxRecord): Promise<'added' | 'full'>;
  /** Atomically apply `patch` iff the stored record's status is in `from` and `guard` (if any) accepts it. */
  transition(operationId: string, from: readonly OutboxStatus[], patch: OutboxPatch, guard?: (record: OutboxRecord) => boolean): Promise<OutboxRecord | null>;
  /**
   * In ONE transaction: compute `resolve(stored original)`; if it refuses (null) → 'refused'; if the unresolved count
   * reached the cap → 'full'; otherwise add `replacement` and only then put the patched original → 'added'. A failed
   * or interrupted transaction writes neither.
   */
  handoff(originalId: string, resolve: (record: OutboxRecord) => Partial<OutboxRecord> | null, replacement: OutboxRecord): Promise<'added' | 'full' | 'refused'>;
  list(): Promise<OutboxRecord[]>;
  /** Delete resolved records older than the retention. */
  prune(now: number): Promise<void>;
  getMeta(key: string): Promise<unknown>;
  putMeta(key: string, value: unknown): Promise<void>;
}>;

export type OutboxMeta = Readonly<{ identity: LearnerOperationBasis & { prunedThroughSeq: number } }>;

const resolved = (status: OutboxStatus) => status === 'acked' || status === 'cancelled';
const patched = (record: OutboxRecord, patch: Partial<OutboxRecord>) => ({ ...record, ...patch, operationId: record.operationId, request: record.request }) as OutboxRecord;
const patchFor = (record: OutboxRecord, patch: OutboxPatch) => typeof patch === 'function' ? patch(record) : patch;
/** Resolved and old enough to delete: never an acknowledged capture whose unapplied draft is still open. */
const prunable = (r: OutboxRecord, now: number) => resolved(r.status) && r.draftReview !== 'open' && (r.resolvedAt ?? 0) < now - OUTBOX_RESOLVED_RETENTION_MS;

/** Test/fallback backend with the same transition semantics, not durable across reloads. */
export function createMemoryOutboxBackend(): OutboxBackend & { records: Map<string, OutboxRecord> } {
  const records = new Map<string, OutboxRecord>();
  const meta = new Map<string, unknown>();
  return {
    durable: false,
    records,
    async add(record) {
      if ([...records.values()].filter(r => !resolved(r.status)).length >= OUTBOX_CAP) return 'full';
      if (records.has(record.operationId)) throw new TypeError('Duplicate operation id.');
      records.set(record.operationId, structuredClone(record)); return 'added';
    },
    async transition(id, from, patch, guard) {
      const record = records.get(id);
      if (!record || !from.includes(record.status) || (guard && !guard(record))) return null;
      const change = patchFor(record, patch);
      if (!change) return null;
      const next = structuredClone(patched(record, change));
      records.set(id, next); return structuredClone(next);
    },
    async handoff(id, resolve, replacement) {
      const record = records.get(id);
      const change = record ? resolve(structuredClone(record)) : null;
      if (!record || !change) return 'refused';
      if ([...records.values()].filter(r => !resolved(r.status)).length >= OUTBOX_CAP) return 'full';
      if (records.has(replacement.operationId)) throw new TypeError('Duplicate operation id.');
      records.set(replacement.operationId, structuredClone(replacement));
      records.set(id, structuredClone(patched(record, change)));
      return 'added';
    },
    async list() { return [...records.values()].map(r => structuredClone(r)); },
    async prune(now) { for (const [id, r] of records) if (prunable(r, now)) records.delete(id); },
    async getMeta(key) { return structuredClone(meta.get(key)); },
    async putMeta(key, value) { meta.set(key, structuredClone(value)); },
  };
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Outbox transaction aborted.'));
    tx.onerror = () => { /* surfaced through onabort */ };
  });
}
function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

/** The IndexedDB backend, or null where IndexedDB is unavailable (JSDOM, some private modes). */
export function createIndexedDbOutboxBackend(factory: IDBFactory | undefined = globalThis.indexedDB, databaseName = OUTBOX_DB_NAME): OutboxBackend | null {
  if (!factory) return null;
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () => dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_OPERATIONS_STORE)) db.createObjectStore(OUTBOX_OPERATIONS_STORE, { keyPath: 'operationId' });
      if (!db.objectStoreNames.contains(OUTBOX_META_STORE)) db.createObjectStore(OUTBOX_META_STORE);
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); dbPromise = null; }; resolve(request.result); };
    request.onerror = () => { dbPromise = null; reject(request.error); };
    request.onblocked = () => { dbPromise = null; reject(new Error('Outbox database open blocked.')); };
  });
  const write = async <T>(store: string, body: (os: IDBObjectStore, tx: IDBTransaction) => Promise<T>): Promise<T> => {
    const tx = (await open()).transaction(store, 'readwrite');
    const completion = done(tx);
    let result: T;
    try { result = await body(tx.objectStore(store), tx); }
    catch (error) { try { tx.abort(); } catch { /* already finished */ } await completion.catch(() => undefined); throw error; }
    await completion; // durable before the caller proceeds
    return result;
  };
  return {
    durable: true,
    add: (record) => write(OUTBOX_OPERATIONS_STORE, async (os) => {
      const all = await req(os.getAll()) as OutboxRecord[];
      if (all.filter(r => !resolved(r.status)).length >= OUTBOX_CAP) return 'full' as const;
      await req(os.add(record)); // `add` (not `put`): an existing id aborts the transaction
      return 'added' as const;
    }),
    transition: (id, from, patch, guard) => write(OUTBOX_OPERATIONS_STORE, async (os) => {
      const record = await req(os.get(id)) as OutboxRecord | undefined;
      if (!record || !from.includes(record.status) || (guard && !guard(record))) return null;
      const change = patchFor(record, patch);
      if (!change) return null;
      const next = patched(record, change);
      await req(os.put(next));
      return next;
    }),
    handoff: (id, resolve, replacement) => write(OUTBOX_OPERATIONS_STORE, async (os) => {
      const record = await req(os.get(id)) as OutboxRecord | undefined;
      const change = record ? resolve(record) : null;
      if (!record || !change) return 'refused' as const;
      const all = await req(os.getAll()) as OutboxRecord[];
      if (all.filter(r => !resolved(r.status)).length >= OUTBOX_CAP) return 'full' as const;
      // The replacement first: if its add fails or never completes, the original is never touched. The original's put
      // is issued only after the add succeeded, in the same transaction, so both commit or neither does.
      await req(os.add(replacement));
      await req(os.put(patched(record, change)));
      return 'added' as const;
    }),
    async list() {
      const tx = (await open()).transaction(OUTBOX_OPERATIONS_STORE, 'readonly');
      return await req(tx.objectStore(OUTBOX_OPERATIONS_STORE).getAll()) as OutboxRecord[];
    },
    prune: (now) => write(OUTBOX_OPERATIONS_STORE, async (os) => {
      for (const r of await req(os.getAll()) as OutboxRecord[]) if (prunable(r, now)) await req(os.delete(r.operationId));
    }),
    async getMeta(key) {
      const tx = (await open()).transaction(OUTBOX_META_STORE, 'readonly');
      return await req(tx.objectStore(OUTBOX_META_STORE).get(key));
    },
    putMeta: (key, value) => write(OUTBOX_META_STORE, async (os) => { await req(os.put(value, key)); }),
  };
}
