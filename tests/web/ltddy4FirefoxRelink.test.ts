import { pairedModel } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { importBrowserLocalFiles, saveSentenceFromCue, needsMediaRelink } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-ddy.4: 'Choose media again' on the relink screen must work without showOpenFilePicker (Firefox).
// All files below are synthetic.

const TARGET = '1\n00:00:00,000 --> 00:00:01,000\nCześć, to jest test.\n\n2\n00:00:01,000 --> 00:00:02,000\nDruga linia.\n';
const NATIVE = '1\n00:00:00,000 --> 00:00:01,000\nHi, this is a test.\n';

let dom: JSDOM;
let urlCounter = 0;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, HTMLInputElement: dom.window.HTMLInputElement, File: dom.window.File,
    Element: dom.window.Element, Event: dom.window.Event,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0,
  });
  urlCounter = 0;
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:lt-ddy4-${++urlCounter}`) });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  // Firefox: no File System Access picker.
  Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, writable: true, value: undefined });
});
afterEach(() => {
  delete (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  dom.window.close();
});

const file = (bytes: number[], name: string) => new dom.window.File([new Uint8Array(bytes)], name, { type: 'video/webm' });
const srt = (text: string, name: string) => new dom.window.File([text], name, { type: 'application/x-subrip' });

async function sessionCopyThenReload(): Promise<{ model: AppModel; mediaId: string; tracks: string[]; occurrences: string }> {
  const model = pairedModel();
  await importBrowserLocalFiles(model, {
    mediaFile: file([1, 2, 3, 4], 'clip.webm'),
    targetSubtitleFile: srt(TARGET, 'clip.pl.srt'),
    nativeSubtitleFile: srt(NATIVE, 'clip.en.srt'),
  });
  expect(await saveSentenceFromCue(model, model.cues[1]!)).toBeTruthy();
  const mediaId = model.currentMedia!.id;
  const tracks = model.store.listSubtitleTracksForMedia(mediaId).map((t) => t.id).sort();
  const occurrences = JSON.stringify(model.store.listSavedOccurrences());
  // Reload: the session object URL is gone.
  model.browserLocalMedia = { ...model.browserLocalMedia, objectUrl: null };
  model.view = 'player';
  return { model, mediaId, tracks, occurrences };
}

const button = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLButtonElement | undefined;
const settle = async (until: () => boolean) => { for (let i = 0; i < 50 && !until(); i++) await new Promise((r) => setTimeout(r, 0)); };

function clickChooseAgainCapturingInput(): HTMLInputElement {
  let opened: HTMLInputElement | null = null;
  const spy = vi.spyOn(dom.window.HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { opened = this; });
  button('Choose media again')!.click();
  spy.mockRestore();
  expect(opened, 'a file input must be opened synchronously inside the click').not.toBeNull();
  return opened!;
}

function choose(input: HTMLInputElement, f: File) {
  Object.defineProperty(input, 'files', { configurable: true, value: [f] });
  input.dispatchEvent(new dom.window.Event('change'));
}

describe('lt-ddy.4 Firefox relink fallback', () => {
  it('opens a hidden file input with the picker accept list and relinks the same media so it plays', async () => {
    const { model, mediaId, tracks, occurrences } = await sessionCopyThenReload();
    rerenderApp(model);
    expect(needsMediaRelink(model)).toBe(true);
    const input = clickChooseAgainCapturingInput();
    expect(input.type).toBe('file');
    for (const ext of ['.mp4', '.webm', '.mkv', '.mp3']) expect(input.accept).toContain(ext);
    expect(document.body.textContent).not.toContain('persistent file handles');
    choose(input, file([1, 2, 3, 4], 'clip-copy.webm'));
    await settle(() => !needsMediaRelink(model));
    expect(needsMediaRelink(model)).toBe(false);
    expect(model.currentMedia!.id).toBe(mediaId);
    expect(model.store.listMediaAssets()).toHaveLength(1);
    expect(model.store.listSubtitleTracksForMedia(mediaId).map((t) => t.id).sort()).toEqual(tracks);
    expect(JSON.stringify(model.store.listSavedOccurrences())).toBe(occurrences);
    expect(model.cues.length).toBeGreaterThan(0);
    expect(model.importError).toBeNull();
    expect(document.querySelector('.video-placeholder-relink')).toBeNull();
    expect(document.querySelector('video')?.getAttribute('src')).toBe(model.browserLocalMedia.objectUrl);
  });

  it('refuses a file whose content does not match and changes nothing', async () => {
    const { model, mediaId, occurrences } = await sessionCopyThenReload();
    rerenderApp(model);
    const before = JSON.stringify(model.store.snapshot());
    const input = clickChooseAgainCapturingInput();
    choose(input, file([9, 9, 9], 'other.webm'));
    await settle(() => model.importError !== null);
    expect(model.importError).toMatch(/not the same file|does not match/i);
    expect(needsMediaRelink(model)).toBe(true);
    expect(model.currentMedia!.id).toBe(mediaId);
    expect(JSON.stringify(model.store.snapshot())).toBe(before);
    expect(JSON.stringify(model.store.listSavedOccurrences())).toBe(occurrences);
    expect(document.querySelector('.video-placeholder-relink [role="alert"]')?.textContent).toMatch(/not the same file|does not match/i);
  });

  it('keeps the Chromium path: calls showOpenFilePicker and opens no file input', async () => {
    const { model } = await sessionCopyThenReload();
    const picker = vi.fn(async () => []);
    (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker = picker;
    rerenderApp(model);
    const spy = vi.spyOn(dom.window.HTMLInputElement.prototype, 'click');
    button('Choose media again')!.click();
    expect(picker).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
