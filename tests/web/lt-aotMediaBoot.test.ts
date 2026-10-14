import { pairedModel } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { importBrowserLocalFileHandles, restoreMediaAtBoot } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-aot: restore the saved browser media handle at boot without the local service.
// All files, handles and permissions are synthetic fakes.

let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, File: dom.window.File, Element: dom.window.Element,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0,
  });
  let n = 0;
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:lt-aot-${++n}`) });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  delete (globalThis as { lingotorteHandleStore?: unknown }).lingotorteHandleStore;
  dom.window.close();
});

const file = () => new dom.window.File([new Uint8Array([1, 2, 3, 4])], 'clip.webm', { type: 'video/webm' });
function makeHandle(_permission: string) {
  let state = 'granted';
  const f = file();
  return {
    name: f.name,
    getFile: vi.fn(async () => f),
    queryPermission: vi.fn(async () => state),
    requestPermission: vi.fn(async () => { state = 'granted'; return 'granted'; }),
    setState(next: string) { state = next; },
  };
}
function installHandleStore() {
  const map = new Map<string, unknown>();
  Object.defineProperty(globalThis, 'lingotorteHandleStore', { configurable: true, value: {
    open: async () => ({ get: async (k: string) => map.get(k), put: async (v: unknown, k: string) => { map.set(k, v); } }),
  } });
  return map;
}

/** Import via handle, then simulate a reload: object URL is gone. */
async function importThenReload(permission: string): Promise<{ model: AppModel; h: ReturnType<typeof makeHandle>; snapshotBefore: string }> {
  installHandleStore();
  const model = pairedModel();
  const h = makeHandle(permission);
  await importBrowserLocalFileHandles(model, { mediaHandle: h });
  h.setState(permission);
  h.requestPermission.mockClear();
  model.browserLocalMedia = { objectUrl: null, sourceLabel: 'browser-file-handle:clip.webm', handleName: 'clip.webm', permissionState: 'unknown', lastError: null };
  model.view = 'player';
  return { model, h, snapshotBefore: JSON.stringify(model.store.snapshot()) };
}

describe('lt-aot restoreMediaAtBoot', () => {
  it('granted: restores silently before first render without touching the store', async () => {
    const { model, h, snapshotBefore } = await importThenReload('granted');
    expect(await restoreMediaAtBoot(model)).toBe(true);
    expect(model.browserLocalMedia.objectUrl).toMatch(/^blob:lt-aot-/);
    expect(h.requestPermission).not.toHaveBeenCalled();
    expect(JSON.stringify(model.store.snapshot())).toBe(snapshotBefore);
    rerenderApp(model);
    expect(document.querySelector('video')).toBeTruthy();
  });

  it('prompt: never requests at boot; Reconnect button requests then restores', async () => {
    const { model, h } = await importThenReload('prompt');
    expect(await restoreMediaAtBoot(model)).toBe(false);
    expect(h.requestPermission).not.toHaveBeenCalled();
    expect(model.browserLocalMedia.permissionState).toBe('prompt');
    rerenderApp(model);
    expect(document.querySelector('video')).toBeNull();
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Reconnect clip.webm');
    expect(btn).toBeTruthy();
    btn!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(model.browserLocalMedia.objectUrl).toMatch(/^blob:lt-aot-/));
    expect(h.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('denied: keeps the existing denied error copy', async () => {
    const { model, h } = await importThenReload('denied');
    expect(await restoreMediaAtBoot(model)).toBe(false);
    expect(h.requestPermission).not.toHaveBeenCalled();
    expect(model.browserLocalMedia.lastError).toContain('was denied');
    rerenderApp(model);
    expect(document.getElementById('app')!.textContent).toContain('Relink media');
  });

  it('no handle-sourced media: does nothing', async () => {
    installHandleStore();
    const model = pairedModel();
    const before = JSON.stringify(model.browserLocalMedia);
    expect(await restoreMediaAtBoot(model)).toBe(false);
    expect(JSON.stringify(model.browserLocalMedia)).toBe(before);
  });

  it('hung handle store: resolves within the timeout', async () => {
    const { model } = await importThenReload('granted');
    Object.defineProperty(globalThis, 'lingotorteHandleStore', { configurable: true, value: { open: () => new Promise(() => {}) } });
    expect(await restoreMediaAtBoot(model, 20)).toBe(false);
    expect(model.browserLocalMedia.objectUrl).toBeNull();
  });

  it('late completion after the timeout is discarded', async () => {
    const { model, h } = await importThenReload('granted');
    const f = await h.getFile();
    h.getFile.mockImplementation(() => new Promise((resolve) => { setTimeout(() => resolve(f), 60); }));
    (URL.createObjectURL as ReturnType<typeof vi.fn>).mockClear();
    expect(await restoreMediaAtBoot(model, 20)).toBe(false);
    await new Promise((resolve) => { setTimeout(resolve, 120); });
    expect(model.browserLocalMedia.objectUrl).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('handle without queryPermission: reports prompt and never requests at boot', async () => {
    const { model, h } = await importThenReload('granted');
    (h as { queryPermission?: unknown }).queryPermission = undefined;
    expect(await restoreMediaAtBoot(model)).toBe(false);
    expect(h.requestPermission).not.toHaveBeenCalled();
    expect(model.browserLocalMedia.permissionState).toBe('prompt');
    expect(model.browserLocalMedia.objectUrl).toBeNull();
  });

  it('changed file content at boot: refuses to relink', async () => {
    const { model, h } = await importThenReload('granted');
    h.getFile.mockResolvedValue(new dom.window.File([new Uint8Array([9, 9, 9, 9])], 'clip.webm', { type: 'video/webm' }));
    expect(await restoreMediaAtBoot(model)).toBe(false);
    expect(model.browserLocalMedia.objectUrl).toBeNull();
    expect(model.browserLocalMedia.lastError).toContain('changed content');
  });

  it('a successful boot restore does not mark browser edits unsaved', async () => {
    const { model } = await importThenReload('granted');
    const before = model.localService.syncState;
    expect(await restoreMediaAtBoot(model)).toBe(true);
    expect(model.localService.syncState).toBe(before);
  });
});
