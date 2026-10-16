import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSubtitleTrack } from '@lingotorte/domain';
import { activeCueAtTime, createAppModel, importBrowserLocalFiles, nativeOnlyCues } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-ddy.7: native-only fallback for an empty target track, paused overlay, row keys, search and re-import.
const targetSrt = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'utf8');
const nativeSrt = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.native.srt', 'utf8');
const badSrt = '1\nthis is not a timing line\nHello\n';
const sha = `sha256:${'a'.repeat(64)}` as const;
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
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:ddy7-${++n}`) });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => { dom.window.close(); vi.restoreAllMocks(); });

const mediaBytes = [7, 7];
const webm = (name: string) => new dom.window.File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...mediaBytes])], name, { type: 'video/webm' });
const srt = (text: string, name: string) => new dom.window.File([text], name, { type: 'application/x-subrip' });
const nativeCues = (model: AppModel) => model.store.listCuesForTrack(model.nativeTrackId!);
const video = () => document.querySelector('.video-stage video') as HTMLVideoElement;

async function nativeOnly(): Promise<AppModel> {
  const model = createAppModel();
  await importBrowserLocalFiles(model, { mediaFile: webm('n.webm'), targetSubtitleFile: srt(badSrt, 'bad.target.srt'), nativeSubtitleFile: srt(nativeSrt, 'good.native.srt') });
  model.view = 'player';
  rerenderApp(model);
  return model;
}

/** A stored target track with no cues (e.g. an empty draft) next to the imported native track. */
async function emptyTarget(status: 'draft' | 'approved'): Promise<AppModel> {
  const model = await nativeOnly();
  const track = makeSubtitleTrack({ mediaId: model.currentMedia!.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'empty.srt', contentSha256: sha, isActive: true, transcriptStatus: status });
  model.store.putSubtitleTrack(track);
  model.targetTrackId = track.id;
  model.cues = [];
  rerenderApp(model);
  return model;
}

describe('lt-ddy.7 native-only fallback', () => {
  it.each(['draft', 'approved'] as const)('an empty %s target track falls back to read-only native lines', async (status) => {
    const model = await emptyTarget(status);
    expect(nativeOnlyCues(model).map((c) => c.id)).toEqual(nativeCues(model).map((c) => c.id));
    expect(document.querySelectorAll('.native-only-row')).toHaveLength(nativeCues(model).length);
    expect(document.querySelector('.transcript-panel')?.textContent).not.toContain('No transcript loaded yet');
    expect(model.cues).toEqual([]);
    expect(document.querySelectorAll('.cue-word, .cue-row, .analyse-words, .transcript-approval-gate')).toHaveLength(0);
  });

  it('shared active-cue helper is the one model.ts exports', async () => {
    const model = await nativeOnly();
    const second = nativeCues(model)[1]!;
    expect(activeCueAtTime(nativeOnlyCues(model), second.startMs)?.id).toBe(second.id);
    expect(activeCueAtTime(nativeOnlyCues(model), second.endMs + 1e9)).toBeNull();
  });

  it('overlay shows the current native line while paused, after a rerender and after a paused seek', async () => {
    const model = await nativeOnly();
    const [first, second] = nativeCues(model);
    model.player.currentTimeMs = first!.startMs + 10;
    rerenderApp(model);
    expect(document.querySelector('.subtitle-overlay .subtitle-native')?.textContent).toBe(first!.text);
    video().currentTime = (second!.startMs + 10) / 1000;
    video().dispatchEvent(new dom.window.Event('seeked'));
    expect(document.querySelector('.subtitle-overlay .subtitle-native')?.textContent).toBe(second!.text);
    expect(document.querySelector('.native-only-row.active')?.getAttribute('data-native-cue-id')).toBe(second!.id);
  });

  it.each(['Enter', ' '])('key %j on a native row seeks and keeps the same <video> attached', async (key) => {
    const model = await nativeOnly();
    const second = nativeCues(model)[1]!;
    const before = video();
    const row = document.querySelectorAll('.native-only-row')[1] as HTMLElement;
    const ev = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    row.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(model.player.currentTimeMs).toBe(second.startMs);
    expect(video()).toBe(before);
    expect(before.isConnected).toBe(true);
    expect(before.currentTime).toBeCloseTo(second.startMs / 1000, 2);
    expect(model.selection).toBeNull();
    expect(document.querySelector('.native-only-row.active')?.getAttribute('data-native-cue-id')).toBe(second.id);
    expect(document.querySelector('.subtitle-overlay .subtitle-native')?.textContent).toBe(second.text);
  });

  it('clicking a native row in fullscreen keeps the same <video> attached', async () => {
    const model = await nativeOnly();
    const before = video();
    const stage = document.querySelector('.video-stage') as HTMLElement;
    Object.defineProperty(dom.window.document, 'fullscreenElement', { configurable: true, get: () => stage });
    (document.querySelectorAll('.native-only-row')[1] as HTMLElement).click();
    expect(video()).toBe(before);
    expect(before.isConnected).toBe(true);
    expect(model.player.currentTimeMs).toBe(nativeCues(model)[1]!.startMs);
  });

  it('transcript search filters native-only rows', async () => {
    const model = await nativeOnly();
    const pick = nativeCues(model)[1]!;
    const word = pick.text.split(/\s+/).find((w) => w.length > 3)!.replace(/[^\p{L}]/gu, '');
    const input = document.querySelector('#transcript-search') as HTMLInputElement;
    input.value = word.toUpperCase();
    input.dispatchEvent(new dom.window.Event('input'));
    const expected = nativeCues(model).filter((c) => c.text.toLowerCase().includes(word.toLowerCase())).map((c) => c.id);
    const shown = Array.from(document.querySelectorAll('.native-only-row')).map((r) => r.getAttribute('data-native-cue-id'));
    expect(shown).toEqual(expected);
    expect(shown).toContain(pick.id);
    expect(shown.length).toBeLessThan(nativeCues(model).length);
  });

  it('re-importing the same video with a target restores the normal transcript', async () => {
    const model = await nativeOnly();
    const mediaId = model.currentMedia!.id;
    expect(document.querySelectorAll('.native-only-row').length).toBeGreaterThan(0);
    await importBrowserLocalFiles(model, { mediaFile: webm('n.webm'), targetSubtitleFile: srt(targetSrt, 'good.target.srt'), nativeSubtitleFile: srt(nativeSrt, 'good.native.srt') });
    model.view = 'player';
    rerenderApp(model);
    expect(model.currentMedia!.id).toBe(mediaId);
    expect(model.cues.length).toBeGreaterThan(0);
    expect(nativeOnlyCues(model)).toEqual([]);
    expect(document.querySelectorAll('.cue-row').length).toBeGreaterThan(0);
    expect(document.querySelector('.native-only-note, .native-only-row')).toBeNull();
  });
});
