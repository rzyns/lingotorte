import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createAppModel, markUnsavedBrowserEdits } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import {
  SNAPSHOT_CACHE_KEY,
  resetSnapshotCacheSuspensionForTests,
  writeSnapshotCache,
  type SnapshotCacheBackend,
} from '../../apps/web/src/browserSnapshotCache';
import {
  CLEAR_CACHE_BUTTON_LABEL,
  CLEAR_CACHE_DONE_MESSAGE,
  CLEAR_CACHE_UNSAVED_WARNING,
  clearCacheDeps,
} from '../../apps/web/src/views/settings';

class MemoryBackend implements SnapshotCacheBackend {
  data = new Map<string, unknown>();
  deletes = 0;
  async get(key: string) { return this.data.get(key); }
  async put(key: string, value: unknown) { this.data.set(key, structuredClone(value)); }
  async delete(key: string) { this.deletes++; this.data.delete(key); }
}

let dom: JSDOM;
let backend: MemoryBackend;
let reload: ReturnType<typeof vi.fn<() => void>>;
let fetchSpy: ReturnType<typeof vi.fn>;
const flush = () => new Promise((r) => setTimeout(r, 0));
const q = (sel: string) => document.querySelector(sel) as HTMLButtonElement | null;

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  backend = new MemoryBackend();
  reload = vi.fn<() => void>();
  clearCacheDeps.backend = backend;
  clearCacheDeps.reload = reload;
  fetchSpy = vi.fn(async () => { throw new Error('local service must not be called'); });
  vi.stubGlobal('fetch', fetchSpy);
  resetSnapshotCacheSuspensionForTests();
});
afterEach(() => { vi.unstubAllGlobals(); dom.window.close(); resetSnapshotCacheSuspensionForTests(); });

async function settingsWithCache() {
  const model = createAppModel();
  model.view = 'settings';
  await writeSnapshotCache(model, backend);
  expect(backend.data.has(SNAPSHOT_CACHE_KEY)).toBe(true);
  rerenderApp(model);
  return model;
}

describe('lt-ddy.1 clear browser cached state', () => {
  it('shows the secondary clear button with a precise explanation', async () => {
    await settingsWithCache();
    const btn = q('[data-clear-cache-start]');
    expect(btn?.textContent).toBe(CLEAR_CACHE_BUTTON_LABEL);
    const panel = document.querySelector('[data-clear-cache]')!.textContent!;
    expect(panel).toContain('Nothing stored in the local service is deleted');
    expect(panel).toContain('remembered pairing and remembered video files are not affected');
  });

  it('first click only reveals the confirm step; Cancel does nothing', async () => {
    await settingsWithCache();
    q('[data-clear-cache-start]')!.click();
    await flush();
    expect(q('[data-clear-cache-confirm]')?.textContent).toBe('Yes, clear it');
    expect(backend.deletes).toBe(0);
    q('[data-clear-cache-cancel]')!.click();
    await flush();
    expect(q('[data-clear-cache-confirm]')).toBeNull();
    expect(q('[data-clear-cache-start]')).not.toBeNull();
    expect(backend.deletes).toBe(0);
    expect(backend.data.has(SNAPSHOT_CACHE_KEY)).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('confirm clears the cache, blocks write-back, shows result and reloads without calling the service', async () => {
    const model = await settingsWithCache();
    q('[data-clear-cache-start]')!.click();
    q('[data-clear-cache-confirm]')!.click();
    await flush(); await flush();
    expect(backend.deletes).toBe(1);
    expect(backend.data.has(SNAPSHOT_CACHE_KEY)).toBe(false);
    expect(document.querySelector('[data-clear-cache-result]')?.textContent).toBe(CLEAR_CACHE_DONE_MESSAGE);
    expect(reload).toHaveBeenCalledTimes(1);
    await writeSnapshotCache(model, backend); // e.g. a pending debounce/pagehide flush
    expect(backend.data.has(SNAPSHOT_CACHE_KEY)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('warns explicitly about unsaved changes only when the model is dirty', async () => {
    const model = await settingsWithCache();
    q('[data-clear-cache-start]')!.click();
    await flush();
    const before = model.localService.syncState;
    expect(['unsaved', 'saving', 'choice', 'conflict', 'error']).not.toContain(before);
    expect(document.querySelector('[data-clear-cache-unsaved]')).toBeNull();
    markUnsavedBrowserEdits(model);
    rerenderApp(model);
    expect(document.querySelector('[data-clear-cache-unsaved]')?.textContent).toBe(CLEAR_CACHE_UNSAVED_WARNING);
    expect(CLEAR_CACHE_UNSAVED_WARNING).toContain('not yet saved to the local service');
  });

  it('reports failure and does not reload when storage is unavailable', async () => {
    clearCacheDeps.backend = null;
    const model = createAppModel();
    model.view = 'settings';
    rerenderApp(model);
    q('[data-clear-cache-start]')!.click();
    q('[data-clear-cache-confirm]')!.click();
    await flush(); await flush();
    expect(document.querySelector('[data-clear-cache-result]')?.getAttribute('data-clear-cache-result')).toBe('failed');
    expect(reload).not.toHaveBeenCalled();
  });
});
