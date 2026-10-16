import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, importBrowserLocalFiles } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-ddy.6: media with only a native track shows its lines read-only; native text never becomes target text.
const targetSrt = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'utf8');
const nativeSrt = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.native.srt', 'utf8');
const badSrt = '1\nthis is not a timing line\nHello\n';
const NOTE = 'Showing your native-language subtitles only. Add target-language subtitles to study words: import the same video again with them.';
let dom: JSDOM;

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
  let n = 0;
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:ddy6-${++n}`) });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => { dom.window.close(); vi.restoreAllMocks(); });

const webm = (bytes: number[], name: string) => new dom.window.File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...bytes])], name, { type: 'video/webm' });
const srt = (text: string, name: string) => new dom.window.File([text], name, { type: 'application/x-subrip' });

async function nativeOnly(): Promise<AppModel> {
  const model = createAppModel();
  await importBrowserLocalFiles(model, { mediaFile: webm([1, 2], 'n.webm'), targetSubtitleFile: srt(badSrt, 'bad.target.srt'), nativeSubtitleFile: srt(nativeSrt, 'good.native.srt') });
  model.view = 'player';
  rerenderApp(model);
  return model;
}
const nativeCues = (model: AppModel) => model.store.listCuesForTrack(model.nativeTrackId!);

describe('lt-ddy.6 native-only media', () => {
  it('lists the native lines read-only with a note, and no study controls', async () => {
    const model = await nativeOnly();
    expect(model.targetTrackId).toBeNull();
    expect(model.cues).toEqual([]);
    const rows = Array.from(document.querySelectorAll('.native-only-row'));
    expect(rows.map((r) => r.querySelector('.cue-native')?.textContent)).toEqual(nativeCues(model).map((c) => c.text));
    expect(document.querySelector('.native-only-note')?.textContent).toBe(NOTE);
    expect(document.querySelector('.transcript-panel')?.textContent).not.toContain('No transcript loaded yet');
    expect(document.querySelectorAll('.cue-word, .cue-row, .analyse-words, .transcript-approval-gate')).toHaveLength(0);
    expect(Array.from(document.querySelectorAll('.transcript-panel button')).map((b) => b.textContent)).toEqual([]);
  });

  it('clicking a native line seeks but opens no capture', async () => {
    const model = await nativeOnly();
    const second = nativeCues(model)[1]!;
    (document.querySelectorAll('.native-only-row')[1] as HTMLElement).click();
    expect(model.selection).toBeNull();
    expect(document.querySelector('.capture-sheet, #selection-meaning')).toBeNull();
    expect((document.querySelector('.video-stage video') as HTMLVideoElement).currentTime).toBeCloseTo(second.startMs / 1000, 2);
  });

  it('overlay shows the native line as plain, non-interactive text', async () => {
    const model = await nativeOnly();
    const first = nativeCues(model)[0]!;
    const video = document.querySelector('.video-stage video') as HTMLVideoElement;
    video.currentTime = (first.startMs + 10) / 1000;
    video.dispatchEvent(new dom.window.Event('timeupdate'));
    const overlay = document.querySelector('.subtitle-overlay')!;
    expect(overlay.querySelector('.subtitle-native')?.textContent).toBe(first.text);
    expect(overlay.querySelectorAll('.cue-word, button, [role="button"], .subtitle-target')).toHaveLength(0);
    (overlay.querySelector('.subtitle-native') as HTMLElement).click();
    expect(model.selection).toBeNull();
    expect(document.querySelector('.native-only-row.active')?.getAttribute('data-native-cue-id')).toBe(first.id);
  });

  it('warning mentions the native lines are shown meanwhile', async () => {
    const model = await nativeOnly();
    expect(model.importWarning).toContain('To add it later, fix the file and import the same video again with it.');
    expect(model.importWarning).toContain('Meanwhile the Player shows your native-language subtitles, read-only.');
  });

  it('with both tracks the normal transcript returns and no native-only UI', async () => {
    const model = createAppModel();
    await importBrowserLocalFiles(model, { mediaFile: webm([3], 'b.webm'), targetSubtitleFile: srt(targetSrt, 't.target.srt'), nativeSubtitleFile: srt(nativeSrt, 'n.native.srt') });
    model.view = 'player';
    rerenderApp(model);
    expect(document.querySelectorAll('.cue-row').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.cue-word').length).toBeGreaterThan(0);
    expect(document.querySelector('.native-only-note, .native-only-row')).toBeNull();
    expect(model.importWarning).toBeNull();
  });
});
