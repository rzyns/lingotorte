import { pairedModel } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as modelModule from '../../apps/web/src/model';
import { importBrowserLocalFiles, importBrowserLocalFileHandles, restoreBrowserMediaHandle, saveSentenceFromCue } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-n31: reselecting media must relink by content fingerprint, never by file name alone.
// All files, handles and permissions below are synthetic fakes.

const TARGET = '1\n00:00:00,000 --> 00:00:01,000\nCześć, to jest test.\n\n2\n00:00:01,000 --> 00:00:02,000\nDruga linia.\n';
const NATIVE = '1\n00:00:00,000 --> 00:00:01,000\nHi, this is a test.\n';

let dom: JSDOM;
let urlCounter = 0;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, File: dom.window.File, Element: dom.window.Element,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0,
  });
  urlCounter = 0;
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:lt-n31-${++urlCounter}`) });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  delete (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  delete (globalThis as { lingotorteHandleStore?: unknown }).lingotorteHandleStore;
  dom.window.close();
});

const file = (bytes: number[], name: string) => new dom.window.File([new Uint8Array(bytes)], name, { type: 'video/webm' });
const srt = (text: string, name: string) => new dom.window.File([text], name, { type: 'application/x-subrip' });
const handle = (f: File, permission = 'granted') => ({
  name: f.name,
  getFile: vi.fn(async () => f),
  queryPermission: vi.fn(async () => permission),
  requestPermission: vi.fn(async () => permission),
});
function installHandleStore() {
  const map = new Map<string, unknown>();
  Object.defineProperty(globalThis, 'lingotorteHandleStore', { configurable: true, value: {
    open: async () => ({ get: async (k: string) => map.get(k), put: async (v: unknown, k: string) => { map.set(k, v); } }),
  } });
  return map;
}

async function importWithAnchors(model: AppModel) {
  await importBrowserLocalFiles(model, {
    mediaFile: file([1, 2, 3, 4], 'clip.webm'),
    targetSubtitleFile: srt(TARGET, 'clip.pl.srt'),
    nativeSubtitleFile: srt(NATIVE, 'clip.en.srt'),
  });
  const saved = await saveSentenceFromCue(model, model.cues[1]!);
  expect(saved).toBeTruthy();
  return snapshotIdentity(model);
}
function snapshotIdentity(model: AppModel) {
  const media = model.currentMedia!;
  const tracks = model.store.listSubtitleTracksForMedia(media.id).map((t) => t.id).sort();
  const cues = tracks.flatMap((id) => model.store.listCuesForTrack(id).map((c) => c.id)).sort();
  return {
    mediaId: media.id, targetTrackId: model.targetTrackId, nativeTrackId: model.nativeTrackId, tracks, cues,
    occurrences: JSON.stringify(model.store.listSavedOccurrences()),
    reviewCards: JSON.stringify(model.store.snapshot().reviewCards),
    mediaCount: model.store.listMediaAssets().length,
  };
}

describe('lt-n31 media relink identity', () => {
  it('(a,e) same-content reselection via plain input relinks the existing asset and keeps track/cue/occurrence anchors', async () => {
    const model = pairedModel();
    const before = await importWithAnchors(model);
    // Simulate loss of the session object URL (reload) and reselect the identical bytes without subtitles.
    model.targetTrackId = null; model.nativeTrackId = null; model.cues = [];
    await importBrowserLocalFiles(model, { mediaFile: file([1, 2, 3, 4], 'clip.webm') });
    const after = snapshotIdentity(model);
    expect(after).toEqual(before);
    expect(model.browserLocalMedia.objectUrl).toBe('blob:lt-n31-2');
    expect(model.importError).toBeNull();
  });

  it('(a) reselecting identical media and identical subtitles creates no duplicate tracks or cues', async () => {
    const model = pairedModel();
    const before = await importWithAnchors(model);
    await importBrowserLocalFiles(model, {
      mediaFile: file([1, 2, 3, 4], 'clip.webm'),
      targetSubtitleFile: srt(TARGET, 'clip.pl.srt'),
      nativeSubtitleFile: srt(NATIVE, 'clip.en.srt'),
    });
    expect(snapshotIdentity(model)).toEqual(before);
  });

  it('(b) same file name with different content is refused without any data change until explicit choice', async () => {
    const model = pairedModel();
    const before = await importWithAnchors(model);
    const createObjectURL = globalThis.URL.createObjectURL as ReturnType<typeof vi.fn>;
    const calls = createObjectURL.mock.calls.length;
    await expect(importBrowserLocalFiles(model, { mediaFile: file([9, 9, 9], 'clip.webm') }))
      .rejects.toMatchObject({ name: 'BrowserMediaNameConflictError' });
    expect(snapshotIdentity(model)).toEqual(before);
    expect(createObjectURL.mock.calls.length).toBe(calls);
    await importBrowserLocalFiles(model, { mediaFile: file([9, 9, 9], 'clip.webm') }, { onNameConflict: 'import-new' });
    expect(model.store.listMediaAssets()).toHaveLength(2);
    expect(model.currentMedia!.id).not.toBe(before.mediaId);
    expect(JSON.stringify(model.store.listSavedOccurrences())).toBe(before.occurrences);
    expect(model.store.getMediaAsset(before.mediaId)!.contentSha256).not.toBe(model.currentMedia!.contentSha256);
  });

  it('(b) UI offers explicit Import as new / Cancel; Cancel leaves data unchanged', async () => {
    const model = pairedModel();
    const before = await importWithAnchors(model);
    model.view = 'library';
    rerenderApp(model);
    const input = document.getElementById('local-media-file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file([5, 5], 'clip.webm')] });
    Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Import local media')!.click();
    for (let i = 0; i < 20 && !document.querySelector('.media-name-conflict'); i++) await new Promise((r) => setTimeout(r, 0));
    const box = document.querySelector('.media-name-conflict');
    expect(box?.textContent).toContain('same name as existing media but different content');
    expect(box?.textContent).toContain('Nothing was changed');
    (Array.from(box!.querySelectorAll('button')).find((b) => b.textContent === 'Cancel') as HTMLButtonElement).click();
    expect(document.querySelector('.media-name-conflict')).toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Existing media was not changed');
    expect(snapshotIdentity(model)).toEqual(before);
  });

  it('(c) different file name with identical fingerprint relinks the existing asset (content identity wins)', async () => {
    const model = pairedModel();
    const before = await importWithAnchors(model);
    await importBrowserLocalFiles(model, { mediaFile: file([1, 2, 3, 4], 'renamed-copy.webm') });
    expect(snapshotIdentity(model)).toEqual(before);
    expect(model.currentMedia!.title).toBe('clip');
  });

  it('(a) persistent-handle reselection of same content keeps the media ID and updates the handle label', async () => {
    installHandleStore();
    const model = pairedModel();
    const f = file([1, 2, 3, 4], 'clip.webm');
    await importBrowserLocalFileHandles(model, { mediaHandle: handle(f) });
    const id = model.currentMedia!.id;
    await importBrowserLocalFileHandles(model, { mediaHandle: handle(file([1, 2, 3, 4], 'moved.webm')) });
    expect(model.currentMedia!.id).toBe(id);
    expect(model.store.listMediaAssets()).toHaveLength(1);
    expect(model.currentMedia!.originalPath).toBe('browser-file-handle:moved.webm');
  });

  it('(d) stored handle whose file content changed fails safe with visible state and no relink', async () => {
    const map = installHandleStore();
    const model = pairedModel();
    const before = await importWithAnchors(model);
    // Pretend the asset was handle-sourced, then the file on disk changed under the same name.
    const asset = model.currentMedia!;
    const handled = { ...asset, originalPath: 'browser-file-handle:clip.webm' };
    model.store.putMediaAsset(handled);
    model.currentMedia = handled;
    model.browserLocalMedia = { objectUrl: null, sourceLabel: handled.originalPath, handleName: 'clip.webm', permissionState: 'unknown', lastError: null };
    map.set('current-media-handle', handle(file([7, 7, 7], 'clip.webm')));
    const restored = await restoreBrowserMediaHandle(model);
    expect(restored).toBe(false);
    expect(model.browserLocalMedia.objectUrl).toBeNull();
    expect(model.browserLocalMedia.lastError).toContain('changed content');
    expect(snapshotIdentity(model).occurrences).toBe(before.occurrences);
    expect(model.currentMedia!.id).toBe(before.mediaId);
  });

  it('(d) denied permission on stored handle fails safe without data change', async () => {
    const map = installHandleStore();
    const model = pairedModel();
    const before = await importWithAnchors(model);
    const handled = { ...model.currentMedia!, originalPath: 'browser-file-handle:clip.webm' };
    model.store.putMediaAsset(handled);
    model.currentMedia = handled;
    model.browserLocalMedia = { objectUrl: null, sourceLabel: handled.originalPath, handleName: 'clip.webm', permissionState: 'unknown', lastError: null };
    const h = handle(file([1, 2, 3, 4], 'clip.webm'), 'denied');
    map.set('current-media-handle', h);
    expect(await restoreBrowserMediaHandle(model)).toBe(false);
    expect(h.getFile).not.toHaveBeenCalled();
    expect(model.browserLocalMedia.permissionState).toBe('denied');
    model.view = 'player';
    rerenderApp(model);
    expect(document.querySelector('.relink-permission-state')?.textContent).toContain('denied');
    const after = snapshotIdentity(model);
    expect(after.occurrences).toBe(before.occurrences);
    expect(after.tracks).toEqual(before.tracks);
  });

  it('(d) non-handle origin: Choose media again without showOpenFilePicker opens a plain file chooser and changes nothing until a file is chosen', async () => {
    const model = pairedModel();
    const before = await importWithAnchors(model);
    model.browserLocalMedia = { ...model.browserLocalMedia, objectUrl: null };
    model.view = 'player';
    rerenderApp(model);
    // lt-ddy.4 replaced the former dead-end message with a hidden <input type=file> fallback.
    const clickSpy = vi.spyOn(dom.window.HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Choose media again')!.click();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
    expect(model.importError).toBeNull();
    expect(document.getElementById('app')?.textContent).not.toContain('persistent file handles');
    expect(snapshotIdentity(model)).toEqual(before);
  });

  it('exports the name-conflict error type', () => {
    expect(typeof (modelModule as Record<string, unknown>).BrowserMediaNameConflictError).toBe('function');
  });
});
