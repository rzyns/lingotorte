import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, importBrowserLocalFiles } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-ddy.3: the persistent picker imports the selected subtitle files too. All files and handles are synthetic fakes.
const targetSrt = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'utf8');
const nativeSrt = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.native.srt', 'utf8');
const pickerText = 'Choose video (recommended — stays linked after reload)';
let dom: JSDOM;
let n = 0;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, File: dom.window.File, Element: dom.window.Element,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0,
    CSS: { escape: (v: string) => v },
  });
  const proto = dom.window.HTMLMediaElement.prototype as any;
  Object.defineProperty(proto, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) });
  Object.defineProperty(proto, 'pause', { configurable: true, value: vi.fn() });
  Object.defineProperty(proto, 'load', { configurable: true, value: vi.fn() });
  n = 0;
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:ddy3-${++n}`) });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  delete (globalThis as { lingotorteHandleStore?: unknown }).lingotorteHandleStore;
  delete (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  dom.window.close();
  vi.restoreAllMocks();
});

const webm = (bytes: number[], name: string) => new dom.window.File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...bytes])], name, { type: 'video/webm' });
const srt = (text: string, name: string) => new dom.window.File([text], name, { type: 'application/x-subrip' });
function makeHandle(f: File) {
  return { name: f.name, getFile: vi.fn(async () => f), queryPermission: vi.fn(async () => 'granted'), requestPermission: vi.fn(async () => 'granted') };
}
function installHandleStore() {
  const map = new Map<string, unknown>();
  Object.defineProperty(globalThis, 'lingotorteHandleStore', { configurable: true, value: {
    open: async () => ({ get: async (k: string) => map.get(k), put: async (v: unknown, k: string) => { map.set(k, v); }, delete: async (k: string) => { map.delete(k); } }),
  } });
  return map;
}
const findBtn = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLButtonElement | undefined;
const setFiles = (id: string, files: File[]) => Object.defineProperty(document.getElementById(id)!, 'files', { configurable: true, value: files });
async function until(cond: () => boolean) { for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 0)); }
function libraryWithPicker(model: AppModel, handle: ReturnType<typeof makeHandle>) {
  const picker = vi.fn(async () => [handle]);
  Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: picker });
  model.view = 'library';
  rerenderApp(model);
  return picker;
}

describe('lt-ddy.3 picker imports selected subtitles', () => {
  it('imports target and native tracks with the picked video and stores the handle under the media id', async () => {
    const map = installHandleStore();
    const model = createAppModel();
    const handle = makeHandle(webm([1, 2, 3], 'dialogue.webm'));
    const picker = libraryWithPicker(model, handle);
    setFiles('local-target-subtitle-file', [srt(targetSrt, 'dialogue.target.srt')]);
    setFiles('local-native-subtitle-file', [srt(nativeSrt, 'dialogue.native.srt')]);
    findBtn(pickerText)!.click();
    await until(() => model.view === 'player');
    expect(picker).toHaveBeenCalledOnce();
    expect(model.importError).toBeNull();
    const id = model.currentMedia!.id;
    const kinds = model.store.listSubtitleTracksForMedia(id).map((t) => t.role).sort();
    expect(kinds).toEqual(['native', 'target']);
    expect(model.cues.length).toBeGreaterThan(0);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Cześć, to jest lokalny test.');
    expect(text).toContain('Hello, this is a local test.');
    expect(map.get(`media-handle:${id}`)).toEqual({ handle, mediaId: id });
  });

  it('imports video only, without error, when no subtitles are selected', async () => {
    const map = installHandleStore();
    const model = createAppModel();
    const handle = makeHandle(webm([4, 5], 'bare.webm'));
    libraryWithPicker(model, handle);
    findBtn(pickerText)!.click();
    await until(() => model.view === 'player');
    expect(model.importError).toBeNull();
    const id = model.currentMedia!.id;
    expect(model.store.listSubtitleTracksForMedia(id)).toHaveLength(0);
    expect(map.has(`media-handle:${id}`)).toBe(true);
  });

  it('keeps the subtitles on the name-conflict Import as new retry', async () => {
    const map = installHandleStore();
    const model = createAppModel();
    await importBrowserLocalFiles(model, { mediaFile: webm([9, 9], 'clash.webm') });
    const firstId = model.currentMedia!.id;
    const handle = makeHandle(webm([7, 7, 7], 'clash.webm'));
    libraryWithPicker(model, handle);
    setFiles('local-target-subtitle-file', [srt(targetSrt, 'clash.target.srt')]);
    setFiles('local-native-subtitle-file', [srt(nativeSrt, 'clash.native.srt')]);
    findBtn(pickerText)!.click();
    await until(() => !!document.querySelector('.media-name-conflict'));
    const box = document.querySelector('.media-name-conflict')!;
    (Array.from(box.querySelectorAll('button')).find((b) => b.textContent === 'Import as new media') as HTMLButtonElement).click();
    await until(() => model.currentMedia?.id !== firstId && model.cues.length > 0);
    const id = model.currentMedia!.id;
    expect(id).not.toBe(firstId);
    expect(model.store.listSubtitleTracksForMedia(id).map((t) => t.role).sort()).toEqual(['native', 'target']);
    expect(model.cues.length).toBeGreaterThan(0);
    expect(map.get(`media-handle:${id}`)).toEqual({ handle, mediaId: id });
  });
});
