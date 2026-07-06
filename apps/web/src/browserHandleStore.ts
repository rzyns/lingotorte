/**
 * Browser File System Access handle persistence store.
 *
 * Stores the current media FileSystemHandle in IndexedDB so it can be
 * revalidated and used to recreate the playback object URL after a page
 * reload or local-service state hydration. Handles are structured-clone
 * serializable in browsers that support the File System Access API.
 *
 * This module is intentionally small and defensive: if IndexedDB or the
 * structured-clone of a handle is unavailable, every method degrades to a
 * no-op rather than throwing. The model layer treats a null store as
 * "unavailable" and surfaces the relink affordance.
 */

const DB_NAME = 'lingotorte-handle-store';
const STORE_NAME = 'handles';
const DB_VERSION = 1;
const KEY_NAME = 'current-media-handle';

export type BrowserHandleStore = Readonly<{
  open(): Promise<BrowserHandleStoreDb>;
}>;

export type BrowserHandleStoreDb = Readonly<{
  get(key: string): Promise<unknown>;
  put(value: unknown, key: string): Promise<void>;
}>;

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/**
 * Open the handle-store database and create the object store on first run.
 * Resolves to a flat get/put interface matching what the model layer expects
 * under `globalThis.lingotorteHandleStore`.
 */
function openHandleDb(): Promise<BrowserHandleStoreDb> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const api: BrowserHandleStoreDb = {
        get(key: string): Promise<unknown> {
          return new Promise((resolveGet, rejectGet) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const getReq = store.get(key);
            getReq.onsuccess = () => resolveGet(getReq.result);
            getReq.onerror = () => rejectGet(getReq.error);
          });
        },
        put(value: unknown, key: string): Promise<void> {
          return new Promise((resolvePut, rejectPut) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const putReq = store.put(value, key);
            putReq.onsuccess = () => resolvePut();
            putReq.onerror = () => rejectPut(putReq.error);
          });
        },
      };
      resolve(api);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Install the handle store on `globalThis.lingotorteHandleStore` if IndexedDB
 * is available and the global is not already set. Called once at app startup
 * before model creation so the model layer can persist and restore handles.
 *
 * Returns true if the store is available (or already installed); false if
 * IndexedDB is unavailable (in which case the app falls back to relink).
 */
export function installBrowserHandleStore(): boolean {
  const globalRef = globalThis as { lingotorteHandleStore?: BrowserHandleStore };
  if (globalRef.lingotorteHandleStore) return true;
  if (!isIndexedDBAvailable()) return false;
  globalRef.lingotorteHandleStore = {
    open: openHandleDb,
  };
  return true;
}

/** Exposed for tests that need to reset the global between cases. */
export const HANDLE_STORE_KEY = KEY_NAME;