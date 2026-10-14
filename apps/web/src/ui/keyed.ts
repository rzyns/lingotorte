import type { AppModel } from '../uiTypes';

/**
 * lt-2zm: keep one DOM element alive across full-app rerenders.
 *
 * rerenderApp rebuilds the whole tree on every state change. Elements that own live state (a playing
 * <video>, later the toast region lt-e0j and the transcript list) can opt out by going through keyed():
 *
 *   keyed(model, 'slot-name', key, create, update, release?)
 *
 * - The cache is per model (WeakMap) and per slot name, so a fresh model (tests) never sees stale nodes.
 * - Same key: the cached element is returned after update(el) refreshes whatever changed. Callers append
 *   it into the new tree, which moves it out of the old (soon discarded) root.
 * - Different key: release(oldEl) runs (free resources), then create() builds and caches a new element.
 * - Listeners must be attached in create() only and must read model state at event time.
 */
type Entry = { key: string; el: HTMLElement; release: ((el: HTMLElement) => void) | undefined };

const caches = new WeakMap<AppModel, Map<string, Entry>>();

export function keyed<T extends HTMLElement>(
  model: AppModel,
  slot: string,
  key: string,
  create: () => T,
  update: (el: T) => void,
  release?: (el: T) => void,
): T {
  let cache = caches.get(model);
  if (!cache) {
    cache = new Map();
    caches.set(model, cache);
  }
  const entry = cache.get(slot);
  if (entry && entry.key === key) {
    update(entry.el as T);
    return entry.el as T;
  }
  if (entry) entry.release?.(entry.el);
  const el = create();
  cache.set(slot, { key, el, release: release as ((el: HTMLElement) => void) | undefined });
  return el;
}

/** The cached element for a slot, if any (no create, no update). */
export function peekKeyed<T extends HTMLElement>(model: AppModel, slot: string): T | null {
  return (caches.get(model)?.get(slot)?.el as T | undefined) ?? null;
}

/** The key the slot's cached element was built for, if any. */
export function peekKeyedKey(model: AppModel, slot: string): string | null {
  return caches.get(model)?.get(slot)?.key ?? null;
}

/** Release and forget a slot (e.g. the media was cleared). */
export function dropKeyed(model: AppModel, slot: string): void {
  const cache = caches.get(model);
  const entry = cache?.get(slot);
  if (!cache || !entry) return;
  cache.delete(slot);
  entry.release?.(entry.el);
}
