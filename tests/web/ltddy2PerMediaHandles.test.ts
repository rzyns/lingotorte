import { pairedModel } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { importBrowserLocalFileHandles, importBrowserLocalFiles, restoreMediaAtBoot } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-ddy.2: one stored browser file handle per media id. All files, handles and permissions are synthetic fakes.
let dom: JSDOM;
let n = 0;
const urlFor = new Map<string, unknown>();
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, File: dom.window.File, Element: dom.window.Element,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0,
  });
  n = 0;
  urlFor.clear();
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn((f: unknown) => { const u = `blob:ddy2-${++n}`; urlFor.set(u, f); return u; }) });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  delete (globalThis as { lingotorteHandleStore?: unknown }).lingotorteHandleStore;
  delete (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  dom.window.close();
});

function makeHandle(bytes: number[], name: string) {
  let state = 'granted';
  const f = new dom.window.File([new Uint8Array(bytes)], name, { type: 'video/webm' });
  return {
    name, file: f,
    getFile: vi.fn(async () => f),
    queryPermission: vi.fn(async () => state),
    requestPermission: vi.fn(async () => { state = 'granted'; return 'granted'; }),
    setState(next: string) { state = next; },
  };
}
function installHandleStore() {
  const map = new Map<string, unknown>();
  Object.defineProperty(globalThis, 'lingotorteHandleStore', { configurable: true, value: {
    open: async () => ({
      get: async (k: string) => map.get(k),
      put: async (v: unknown, k: string) => { map.set(k, v); },
      delete: async (k: string) => { map.delete(k); },
    }),
  } });
  return map;
}
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('.media-row'));
const btn = (scope: ParentNode, text: string) => Array.from(scope.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLButtonElement | undefined;
const rowFor = (id: string) => rows().find((r) => r.dataset.mediaId === id)!;
const library = (model: AppModel) => { model.view = 'library'; rerenderApp(model); };

/** Two handle-backed media; then a reload (no live object URL). */
async function twoHandleMedia() {
  const map = installHandleStore();
  const model = pairedModel();
  const a = makeHandle([1, 2, 3], 'alpha.webm');
  const b = makeHandle([4, 5, 6], 'beta.webm');
  await importBrowserLocalFileHandles(model, { mediaHandle: a });
  const alpha = model.currentMedia!;
  await importBrowserLocalFileHandles(model, { mediaHandle: b });
  const beta = model.currentMedia!;
  model.browserLocalMedia = { objectUrl: null, sourceLabel: 'browser-file-handle:beta.webm', handleName: 'beta.webm', permissionState: 'unknown', lastError: null };
  for (const h of [a, b]) { h.requestPermission.mockClear(); h.getFile.mockClear(); }
  return { map, model, a, b, alpha, beta };
}

describe('lt-ddy.2 per-media browser handles', () => {
  it('stores each handle under its media id without clobbering the other', async () => {
    const { map, alpha, beta, a, b } = await twoHandleMedia();
    expect(map.get(`media-handle:${alpha.id}`)).toEqual({ handle: a, mediaId: alpha.id });
    expect(map.get(`media-handle:${beta.id}`)).toEqual({ handle: b, mediaId: beta.id });
    expect(map.has('current-media-handle')).toBe(false);
  });

  it('opening either media from the Library restores its own handle silently when granted', async () => {
    const { model, a, b, alpha, beta } = await twoHandleMedia();
    library(model);
    btn(rowFor(alpha.id), 'Relink')!.click();
    await vi.waitFor(() => expect(model.browserLocalMedia.objectUrl).toMatch(/^blob:ddy2-/));
    expect(model.currentMedia?.id).toBe(alpha.id);
    expect(urlFor.get(model.browserLocalMedia.objectUrl!)).toBe(a.file);
    expect((document.querySelector('video') as HTMLVideoElement).src).toBe(model.browserLocalMedia.objectUrl);
    library(model);
    btn(rowFor(beta.id), 'Open')!.click();
    await vi.waitFor(() => expect(urlFor.get(model.browserLocalMedia.objectUrl ?? '')).toBe(b.file));
    expect(model.currentMedia?.id).toBe(beta.id);
    expect(a.requestPermission).not.toHaveBeenCalled();
    expect(b.requestPermission).not.toHaveBeenCalled();
  });

  it('prompt: shows the relink placeholder; Reconnect requests permission once then loads', async () => {
    const { model, a, alpha } = await twoHandleMedia();
    a.setState('prompt');
    const picker = vi.fn(async () => []);
    Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: picker });
    library(model);
    btn(rowFor(alpha.id), 'Relink')!.click();
    await vi.waitFor(() => expect(model.browserLocalMedia.permissionState).toBe('prompt'));
    expect(picker).not.toHaveBeenCalled();
    expect(a.requestPermission).not.toHaveBeenCalled();
    rerenderApp(model);
    btn(document, 'Reconnect alpha.webm')!.click();
    await vi.waitFor(() => expect(urlFor.get(model.browserLocalMedia.objectUrl ?? '')).toBe(a.file));
    expect(a.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('no stored handle for that media: falls back to the picker', async () => {
    const { map, model, alpha } = await twoHandleMedia();
    map.delete(`media-handle:${alpha.id}`);
    const picker = vi.fn(async () => []);
    Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: picker });
    library(model);
    btn(rowFor(alpha.id), 'Relink')!.click();
    await vi.waitFor(() => expect(picker).toHaveBeenCalledTimes(1));
    expect(model.currentMedia?.id).toBe(alpha.id);
  });

  it('denied: falls back to the picker without requesting', async () => {
    const { model, a, alpha } = await twoHandleMedia();
    a.setState('denied');
    const picker = vi.fn(async () => []);
    Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: picker });
    library(model);
    btn(rowFor(alpha.id), 'Relink')!.click();
    await vi.waitFor(() => expect(picker).toHaveBeenCalledTimes(1));
    expect(a.requestPermission).not.toHaveBeenCalled();
  });

  it('media switched during an await: the late result is ignored', async () => {
    const { model, a, alpha, beta } = await twoHandleMedia();
    let release!: (v: string) => void;
    a.queryPermission.mockImplementation(() => new Promise<string>((r) => { release = r; }));
    const picker = vi.fn(async () => []);
    Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: picker });
    library(model);
    btn(rowFor(alpha.id), 'Relink')!.click();
    await vi.waitFor(() => expect(a.queryPermission).toHaveBeenCalled());
    library(model);
    btn(rowFor(beta.id), 'Relink')!.click();
    await vi.waitFor(() => expect(model.currentMedia?.id).toBe(beta.id));
    release('granted');
    await new Promise((r) => { setTimeout(r, 20); });
    expect(a.getFile).not.toHaveBeenCalled();
    expect(urlFor.get(model.browserLocalMedia.objectUrl ?? '')).not.toBe(a.file);
    expect(model.currentMedia?.id).toBe(beta.id);
  });

  it('migrates a legacy record with mediaId to the per-id key; boot restore still works; twice is a no-op', async () => {
    const { map, model, b, beta } = await twoHandleMedia();
    map.delete(`media-handle:${beta.id}`);
    map.set('current-media-handle', { handle: b, mediaId: beta.id });
    expect(await restoreMediaAtBoot(model)).toBe(true);
    expect(urlFor.get(model.browserLocalMedia.objectUrl!)).toBe(b.file);
    expect(map.has('current-media-handle')).toBe(false);
    expect(map.get(`media-handle:${beta.id}`)).toEqual({ handle: b, mediaId: beta.id });
    const before = new Map(map);
    model.browserLocalMedia = { ...model.browserLocalMedia, objectUrl: null };
    await Promise.all([restoreMediaAtBoot(model), restoreMediaAtBoot(model)]);
    expect(map).toEqual(before);
    expect(b.requestPermission).not.toHaveBeenCalled();
  });

  it('migrates a bare legacy handle to the current media when its name matches', async () => {
    const { map, model, b, beta } = await twoHandleMedia();
    map.delete(`media-handle:${beta.id}`);
    map.set('current-media-handle', b);
    expect(await restoreMediaAtBoot(model)).toBe(true);
    expect(map.has('current-media-handle')).toBe(false);
    expect(map.get(`media-handle:${beta.id}`)).toEqual({ handle: b, mediaId: beta.id });
  });

  it('boot never prompts even when the stored handle needs permission', async () => {
    const { model, b } = await twoHandleMedia();
    b.setState('prompt');
    expect(await restoreMediaAtBoot(model)).toBe(false);
    expect(b.requestPermission).not.toHaveBeenCalled();
    expect(model.browserLocalMedia.permissionState).toBe('prompt');
  });

  it('never stores a handle for blob/session-only imports', async () => {
    const map = installHandleStore();
    const model = pairedModel();
    await importBrowserLocalFiles(model, { mediaFile: new dom.window.File([new Uint8Array([9])], 'x.webm', { type: 'video/webm' }) });
    expect(map.size).toBe(0);
  });
});
