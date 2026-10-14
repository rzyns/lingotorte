import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';
import { requestFocusAfterRender, rerenderApp } from '../../apps/web/src/app';

// lt-dlf.2: a rerender while the video stage is fullscreen must not detach the stage (Chrome would exit
// fullscreen). The root swap is deferred until fullscreen exits; in-place parts still update.

const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;
let dom: JSDOM;
let fsElement: Element | null = null;

function setupDom() {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.CSS = { escape: (v: string) => v.replace(/"/g, '\\"') } as unknown as typeof CSS;
  fsElement = null;
  Object.defineProperty(dom.window.document, 'fullscreenElement', { configurable: true, get: () => fsElement });
}

function installModel() {
  const model = createAppModel();
  const asset = makeMediaAsset({ title: 'Clip', originalPath: 'fixtures/media/x.webm', contentSha256: sha, durationMs: 6000, container: 'webm', sizeBytes: 1, privacyLabel: 'owned' });
  model.store.putMediaAsset(asset);
  model.currentMedia = asset;
  const track = makeSubtitleTrack({ mediaId: asset.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'x.srt', contentSha256: sha, isActive: true, transcriptStatus: 'approved' });
  model.store.putSubtitleTrack(track);
  model.targetTrackId = track.id;
  const cues = ['Dzień dobry.', 'Do widzenia.', 'Na razie.'].map((text, i) =>
    makeCue({ trackId: track.id, cueIndex: i, startMs: i * 2000, endMs: (i + 1) * 2000, text, normalizedText: text.toLowerCase(), textSha256: sha }));
  for (const c of cues) model.store.putCue(c);
  model.cues = cues;
  model.player.durationMs = 6000;
  model.player.activeCueId = cues[0]!.id;
  model.view = 'player';
  rerenderApp(model);
  return { model, cues };
}

const stage = () => document.querySelector('.video-stage') as HTMLElement;
const video = () => document.querySelector('.video-stage video') as HTMLVideoElement;
const key = (k: string) => document.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }));
const fsChange = () => document.dispatchEvent(new dom.window.Event('fullscreenchange'));

/** Records every moment the stage leaves the document (any removal from its parent while connected). */
function watchDetach(el: HTMLElement) {
  const events: string[] = [];
  const proto = dom.window.Node.prototype as any;
  for (const name of ['removeChild', 'replaceChild', 'appendChild', 'insertBefore']) {
    const orig = proto[name];
    vi.spyOn(proto, name).mockImplementation(function (this: Node, ...args: any[]) {
      const result = orig.apply(this, args);
      if (!el.isConnected) events.push(name);
      return result;
    });
  }
  return events;
}

describe('lt-dlf.2 rerender in fullscreen keeps the stage in the document', () => {
  beforeEach(() => {
    setupDom();
    const proto = dom.window.HTMLMediaElement.prototype as any;
    const t = new WeakMap<object, number>();
    Object.defineProperty(proto, 'play', { configurable: true, value: () => Promise.resolve() });
    Object.defineProperty(proto, 'pause', { configurable: true, value: () => undefined });
    Object.defineProperty(proto, 'paused', { configurable: true, get: () => true });
    Object.defineProperty(proto, 'currentTime', { configurable: true, get(this: object) { return t.get(this) ?? 0; }, set(this: object, v: number) { t.set(this, v); } });
    Object.defineProperty(proto, 'duration', { configurable: true, get: () => 6 });
  });
  afterEach(() => vi.restoreAllMocks());

  it('a direct rerender in fullscreen never detaches the stage', () => {
    const { model } = installModel();
    const s = stage();
    fsElement = s;
    const detached = watchDetach(s);
    rerenderApp(model);
    expect(detached).toEqual([]);
    expect(s.isConnected).toBe(true);
    expect(document.fullscreenElement).toBe(s);
  });

  it("']' in fullscreen seeks to the next cue and the overlay shows its text, without detaching", () => {
    const { model, cues } = installModel();
    const s = stage();
    fsElement = s;
    const detached = watchDetach(s);
    key(']');
    expect(detached).toEqual([]);
    expect(model.player.activeCueId).toBe(cues[1]!.id);
    expect(video().currentTime).toBe(2);
    expect(s.textContent).toContain('Do widzenia.');
    expect(stage()).toBe(s);
  });

  it('a speed shortcut in fullscreen updates video.playbackRate', () => {
    const { model } = installModel();
    const s = stage();
    fsElement = s;
    const detached = watchDetach(s);
    key('.');
    expect(detached).toEqual([]);
    expect(model.player.playbackRate).toBeGreaterThan(1);
    expect(video().playbackRate).toBe(model.player.playbackRate);
  });

  it('leaving fullscreen runs exactly one deferred full rerender reflecting the new state', () => {
    const { cues } = installModel();
    const s = stage();
    const rootBefore = document.getElementById('app')!.firstElementChild;
    fsElement = s;
    key(']');
    key(']');
    expect(document.getElementById('app')!.firstElementChild).toBe(rootBefore);
    const app = document.getElementById('app')!;
    const spy = vi.spyOn(app, 'replaceChild');
    fsElement = null;
    fsChange();
    expect(spy).toHaveBeenCalledTimes(1);
    fsChange();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(stage()).toBe(s);
    const active = document.querySelector(`[data-cue-id="${cues[2]!.id}"]`);
    expect(active?.className ?? '').toMatch(/active|current/);
  });

  it('without fullscreen the root is swapped as before', () => {
    const { model } = installModel();
    const rootBefore = document.getElementById('app')!.firstElementChild;
    const detached = watchDetach(stage());
    rerenderApp(model);
    expect(document.getElementById('app')!.firstElementChild).not.toBe(rootBefore);
    expect(detached.length).toBeGreaterThan(0);
    expect(stage().isConnected).toBe(true);
  });

  it('fullscreen on the <video> inside the stage counts as stage fullscreen', () => {
    const { model } = installModel();
    const s = stage();
    fsElement = video();
    const detached = watchDetach(s);
    rerenderApp(model);
    expect(detached).toEqual([]);
    expect(stage()).toBe(s);
  });

  it('a media change during fullscreen leaves the old stage alone, keeps the new error, and exits fullscreen', () => {
    const { model } = installModel();
    const s = stage();
    fsElement = s;
    const exit = vi.fn(() => Promise.reject(new Error('no')));
    (document as any).exitFullscreen = exit;
    const other = makeMediaAsset({ title: 'Other', originalPath: 'fixtures/media/y.webm', contentSha256: sha, durationMs: 6000, container: 'webm', sizeBytes: 2, privacyLabel: 'owned' });
    model.store.putMediaAsset(other);
    model.currentMedia = other;
    const err = { mediaId: other.id, source: 'whatever', message: 'boom', announced: false };
    model.player.mediaError = err as any;
    rerenderApp(model);
    expect(video().getAttribute('aria-label')).toBe('Clip');
    expect(model.player.mediaError).toBe(err);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('a throw in the in-place refresh still defers the full rerender to fullscreen exit', () => {
    const { model } = installModel();
    fsElement = stage();
    const rate = vi.spyOn(dom.window.HTMLMediaElement.prototype as any, 'playbackRate', 'set').mockImplementation(() => { throw new Error('in-place'); });
    model.player.playbackRate = 1.5;
    expect(() => rerenderApp(model)).toThrow('in-place');
    rate.mockRestore();
    const app = document.getElementById('app')!;
    const spy = vi.spyOn(app, 'replaceChild');
    fsElement = null;
    fsChange();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a focus request made in fullscreen is honored by the deferred rerender', () => {
    const { model } = installModel();
    fsElement = stage();
    requestFocusAfterRender(model, 'no-such-id', 'transcript-search');
    rerenderApp(model);
    fsElement = null;
    fsChange();
    expect(document.activeElement?.id).toBe('transcript-search');
  });
});
