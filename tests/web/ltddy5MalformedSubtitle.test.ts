import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, importBrowserLocalFiles } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-ddy.5: a malformed subtitle file must not block the video import. All files and handles are synthetic fakes.
const targetSrt = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'utf8');
const nativeSrt = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.native.srt', 'utf8');
const badSrt = '1\nthis is not a timing line\nHello\n';
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
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:ddy5-${++n}`) });
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
}
const findBtn = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLButtonElement | undefined;
const setFiles = (id: string, files: File[]) => Object.defineProperty(document.getElementById(id)!, 'files', { configurable: true, value: files });
async function until(cond: () => boolean) { for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 0)); }
function library(model: AppModel) { model.view = 'library'; rerenderApp(model); }
function installPicker(handle: ReturnType<typeof makeHandle>) {
  Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: vi.fn(async () => [handle]) });
}
const tracks = (model: AppModel) => model.store.listSubtitleTracksForMedia(model.currentMedia!.id);
const warningText = () => document.querySelector('.import-subtitle-warning')?.textContent ?? '';

function expectPlayable(model: AppModel) {
  expect(model.view).toBe('player');
  expect(model.importError).toBeNull();
  expect(model.currentMedia).not.toBeNull();
  const video = document.querySelector('video') as HTMLVideoElement | null;
  expect(video?.getAttribute('src') ?? video?.src).toMatch(/^blob:ddy5-/);
}

describe('lt-ddy.5 malformed subtitle does not block the video import', () => {
  for (const button of ['Import local media', pickerText] as const) {
    describe(button, () => {
      async function run(model: AppModel, target: File | null, native: File | null, video = webm([1, 2, 3], 'dialogue.webm')) {
        if (button === pickerText) { installHandleStore(); installPicker(makeHandle(video)); }
        library(model);
        if (button === 'Import local media') setFiles('local-media-file', [video]);
        setFiles('local-target-subtitle-file', target ? [target] : []);
        setFiles('local-native-subtitle-file', native ? [native] : []);
        findBtn(button)!.click();
        await until(() => model.view === 'player' || model.importError !== null);
      }

      it('imports the video and valid native track when the target .srt is malformed, and warns naming the file', async () => {
        const model = createAppModel();
        await run(model, srt(badSrt, 'bad.target.srt'), srt(nativeSrt, 'good.native.srt'));
        expectPlayable(model);
        expect(tracks(model).map((t) => t.role)).toEqual(['native']);
        expect(model.targetTrackId).toBeNull();
        expect(model.nativeTrackId).toBe(tracks(model)[0]!.id);
        // No partial track: no cue belongs to a track that is not stored.
        expect(model.store.listCuesForTrack(model.nativeTrackId!).length).toBeGreaterThan(0);
        expect(model.importWarning).toContain('"bad.target.srt" (target subtitles) could not be read');
        expect(model.importWarning).toContain('invalid timing line');
        expect(warningText()).toContain('bad.target.srt');
        expect(warningText()).toContain('The video was imported without it.');
      });

      it('imports the video alone when both subtitle files are malformed and names both', async () => {
        const model = createAppModel();
        await run(model, srt(badSrt, 'bad.target.srt'), srt('garbage', 'bad.native.srt'));
        expectPlayable(model);
        expect(tracks(model)).toEqual([]);
        expect(model.cues).toEqual([]);
        expect(warningText()).toContain('"bad.target.srt" (target subtitles)');
        expect(warningText()).toContain('"bad.native.srt" (native subtitles)');
      });

      it('dedupe path: same video already present keeps existing tracks, adds valid native, warns about bad target', async () => {
        const model = createAppModel();
        const video = webm([7, 7, 7], 'same.webm');
        await importBrowserLocalFiles(model, { mediaFile: video, targetSubtitleFile: srt(targetSrt, 'orig.target.srt') });
        const mediaId = model.currentMedia!.id;
        const before = model.store.listSubtitleTracksForMedia(mediaId);
        expect(before.map((t) => t.role)).toEqual(['target']);
        await run(model, srt(badSrt, 'bad.target.srt'), srt(nativeSrt, 'good.native.srt'), webm([7, 7, 7], 'same.webm'));
        expectPlayable(model);
        expect(model.currentMedia!.id).toBe(mediaId);
        expect(tracks(model).map((t) => t.role).sort()).toEqual(['native', 'target']);
        expect(model.targetTrackId).toBe(before[0]!.id);
        expect(warningText()).toContain('"bad.target.srt" (target subtitles) could not be read');
      });

      it('a clean import shows no warning', async () => {
        const model = createAppModel();
        await run(model, srt(targetSrt, 't.srt'), srt(nativeSrt, 'n.srt'));
        expectPlayable(model);
        expect(model.importWarning).toBeNull();
        expect(warningText()).toBe('');
      });
    });
  }

  it('Import as new (name-conflict retry) keeps the skip-and-warn behaviour', async () => {
    const model = createAppModel();
    await importBrowserLocalFiles(model, { mediaFile: webm([1], 'clip.webm') });
    library(model);
    setFiles('local-media-file', [webm([2], 'clip.webm')]);
    setFiles('local-target-subtitle-file', [srt(badSrt, 'bad.target.srt')]);
    setFiles('local-native-subtitle-file', [srt(nativeSrt, 'good.native.srt')]);
    findBtn('Import local media')!.click();
    await until(() => findBtn('Import as new media') !== undefined);
    findBtn('Import as new media')!.click();
    await until(() => model.view === 'player');
    expectPlayable(model);
    expect(model.store.listMediaAssets()).toHaveLength(2);
    expect(tracks(model).map((t) => t.role)).toEqual(['native']);
    expect(warningText()).toContain('"bad.target.srt" (target subtitles) could not be read');
  });
});
