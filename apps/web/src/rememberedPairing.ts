/**
 * lt-cfh (DECISIONS.md §14a, lt-z41 option C): opt-in remembered pairing.
 *
 * Storage: a sibling IndexedDB database `lingotorte-remembered-pairing`
 * (object store `pairing`, key `current`) holding exactly
 * `{ origin, capability, savedAt }`. It is separate from the snapshot cache
 * (`lingotorte-snapshot-cache`) and the handle store, and never written to
 * snapshots, exports, localStorage, sessionStorage or logs.
 *
 * Opt-in lives in memory per model; presence of the record means "opted in"
 * on the next boot. The record is written only when the learner opted in AND
 * an authenticated /api/status succeeded for the same exact origin. It is
 * deleted on 401, Forget pairing, unticking the opt-in, URL change and
 * Disconnect. A network failure at boot keeps the record (transient blips must
 * not forget a valid pairing); a 401 removes it. Every backend error is
 * swallowed with one console warning; reads are bounded and never block render.
 */
import type { AppModel } from './uiTypes';
import { connectLocalService, observePairingLifecycle, pairLocalService } from './model';
import { exactServiceOrigin } from './pairedTransport';

export const REMEMBERED_PAIRING_DB_NAME = 'lingotorte-remembered-pairing';
export const REMEMBERED_PAIRING_STORE_NAME = 'pairing';
export const REMEMBERED_PAIRING_KEY = 'current';
export const REMEMBERED_PAIRING_READ_TIMEOUT_MS = 1500;
export const REMEMBER_PAIRING_LABEL = 'Remember this pairing on this device until the service restarts';
export const REMEMBERED_PAIRING_NOTE = 'Remembered on this device until the service restarts';

export type RememberedPairingRecord = { origin: string; capability: string; savedAt: string };
export type RememberedPairingBackend = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

let warned = false;
function warnOnce(): void {
  if (warned) return;
  warned = true;
  // Never log the error object: it could carry the stored record.
  console.warn('Lingotorte remembered pairing unavailable; continuing without it.');
}
export function resetRememberedPairingWarningForTests(): void { warned = false; }

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

export function createIndexedDbRememberedPairingBackend(): RememberedPairingBackend | null {
  if (typeof indexedDB === 'undefined' || indexedDB === null) return null;
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () => dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(REMEMBERED_PAIRING_DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(REMEMBERED_PAIRING_STORE_NAME)) req.result.createObjectStore(REMEMBERED_PAIRING_STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error('Remembered pairing database open blocked.')); };
  });
  const tx = async (mode: IDBTransactionMode) => (await open()).transaction(REMEMBERED_PAIRING_STORE_NAME, mode).objectStore(REMEMBERED_PAIRING_STORE_NAME);
  return {
    async get(key) { return request((await tx('readonly')).get(key)); },
    async put(key, value) { await request((await tx('readwrite')).put(value, key)); },
    async delete(key) { await request((await tx('readwrite')).delete(key)); },
  };
}

type State = { installed: boolean; backend: RememberedPairingBackend | null; optIn: boolean; remembered: boolean; pending: { origin: string; capability: string } | null; onChange?: () => void };
const states = new WeakMap<AppModel, State>();
let defaultBackend: RememberedPairingBackend | null | undefined;
function resolveBackend(backend?: RememberedPairingBackend | null): RememberedPairingBackend | null {
  if (backend !== undefined) return backend;
  if (defaultBackend === undefined) { try { defaultBackend = createIndexedDbRememberedPairingBackend(); } catch { warnOnce(); defaultBackend = null; } }
  return defaultBackend;
}
function state(model: AppModel): State {
  let s = states.get(model);
  if (!s) { s = { installed: false, backend: null, optIn: false, remembered: false, pending: null }; states.set(model, s); }
  return s;
}

function isRecord(value: unknown): value is RememberedPairingRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<RememberedPairingRecord>;
  return typeof v.origin === 'string' && typeof v.capability === 'string' && typeof v.savedAt === 'string';
}

/** Bounded read; resolves null on absence, malformed record, error or timeout. Never rejects. */
export async function readRememberedPairing(backend: RememberedPairingBackend | null, timeoutMs = REMEMBERED_PAIRING_READ_TIMEOUT_MS): Promise<RememberedPairingRecord | null> {
  if (!backend) return null;
  const timedOut = Symbol('timeout');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([backend.get(REMEMBERED_PAIRING_KEY), new Promise<typeof timedOut>((resolve) => { timer = setTimeout(() => resolve(timedOut), timeoutMs); })]);
    if (value === timedOut) { warnOnce(); return null; }
    return isRecord(value) ? value : null;
  } catch { warnOnce(); return null; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Wire the model's pairing lifecycle (status OK / 401) to the record. Idempotent per model. */
export function installRememberedPairing(model: AppModel, backend?: RememberedPairingBackend | null, onChange?: () => void): void {
  const s = state(model);
  s.backend = resolveBackend(backend);
  s.installed = true;
  if (onChange) s.onChange = onChange;
  observePairingLifecycle(model, {
    statusOk(origin) {
      const pending = s.pending;
      if (!s.optIn || !pending || pending.origin !== origin || !s.backend) return;
      s.pending = null;
      const record: RememberedPairingRecord = { origin, capability: pending.capability, savedAt: model.clock().toISOString() };
      s.remembered = true;
      void s.backend.put(REMEMBERED_PAIRING_KEY, record).catch(() => { s.remembered = false; warnOnce(); s.onChange?.(); });
    },
    unauthorized() { void forgetRememberedPairing(model); },
  });
}

/** Called by Settings on an explicit pair: keep the candidate in memory until status succeeds. */
export function noteExplicitPairing(model: AppModel, capability: string, origin: string): void {
  const s = state(model);
  if (!s.installed) installRememberedPairing(model);
  s.pending = s.optIn ? { origin: exactServiceOrigin(origin), capability } : null;
}
export function rememberPairingOptedIn(model: AppModel): boolean { return state(model).optIn; }
export function pairingIsRemembered(model: AppModel): boolean { return state(model).remembered; }

export async function setRememberPairingOptIn(model: AppModel, enabled: boolean): Promise<void> {
  const s = state(model);
  if (!s.installed) installRememberedPairing(model);
  s.optIn = enabled;
  if (!enabled) await forgetRememberedPairing(model);
}

/** Delete the record (401, Forget, opt-out, URL change, Disconnect). Clears the in-memory candidate too. */
export async function forgetRememberedPairing(model: AppModel): Promise<void> {
  const s = state(model);
  s.pending = null;
  const was = s.remembered;
  s.remembered = false;
  if (was) s.onChange?.();
  if (!s.backend) return;
  try { await s.backend.delete(REMEMBERED_PAIRING_KEY); } catch { warnOnce(); }
}

/**
 * Boot: after the snapshot cache and media restore. If a record exists for the
 * current exact service origin, pair and start connecting without awaiting.
 * Returns `{ connect }` (wrapped so the async boot does not await it) or null.
 */
export async function bootRememberedPairing(model: AppModel, backend?: RememberedPairingBackend | null, onChange?: () => void): Promise<{ connect: Promise<unknown> } | null> {
  installRememberedPairing(model, backend, onChange);
  const s = state(model);
  const record = await readRememberedPairing(s.backend);
  if (!record) return null;
  let origin: string;
  let current: string;
  try { origin = exactServiceOrigin(record.origin); current = exactServiceOrigin(model.localService.baseUrl); }
  catch { await forgetRememberedPairing(model); return null; }
  if (origin !== current || record.origin !== origin) { await forgetRememberedPairing(model); return null; }
  s.optIn = true;
  try { pairLocalService(model, record.capability, origin); }
  catch { await forgetRememberedPairing(model); return null; }
  s.remembered = true;
  // 401 deletes through the unauthorized hook; network errors keep the record.
  return { connect: connectLocalService(model).then((result) => { onChange?.(); return result; }) };
}
