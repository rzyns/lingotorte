import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, saveLexemeFromCue } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-2zm: the video stage is mounted once per media identity; rerenders reuse the same <video>.

const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;
let dom: JSDOM;
let srcSets: Array<{ el: object; value: string }>;
let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
let load: ReturnType<typeof vi.fn>;

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
  const proto = dom.window.HTMLMediaElement.prototype as any;
  const state = new WeakMap<object, { paused: boolean; t: number; src: string }>();
  const s = (el: object) => { let v = state.get(el); if (!v) { v = { paused: true, t: 0, src: '' }; state.set(el, v); } return v; };
  srcSets = [];
  play = vi.fn(function (this: HTMLVideoElement) { s(this).paused = false; this.dispatchEvent(new dom.window.Event('play')); return Promise.resolve(); });
  pause = vi.fn(function (this: HTMLVideoElement) { if (s(this).paused) return; s(this).paused = true; this.dispatchEvent(new dom.window.Event('pause')); });
  load = vi.fn();
  Object.defineProperty(proto, 'play', { configurable: true, value: play });
  Object.defineProperty(proto, 'pause', { configurable: true, value: pause });
  Object.defineProperty(proto, 'load', { configurable: true, value: load });
  Object.defineProperty(proto, 'paused', { configurable: true, get(this: object) { return s(this).paused; } });
  Object.defineProperty(proto, 'currentTime', { configurable: true, get(this: object) { return s(this).t; }, set(this: object, v: number) { s(this).t = v; } });
  Object.defineProperty(proto, 'duration', { configurable: true, get: () => 4 });
  Object.defineProperty(proto, 'src', {
    configurable: true,
    get(this: HTMLVideoElement) { return this.getAttribute('src') ?? ''; },
    set(this: HTMLVideoElement, v: string) { srcSets.push({ el: this, value: v }); this.setAttribute('src', v); },
  });
}

function installModel() {
  const model = createAppModel();
  const asset = makeMediaAsset({ title: 'Clip', originalPath: 'fixtures/media/x.webm', contentSha256: sha, durationMs: 4000, container: 'webm', sizeBytes: 1, privacyLabel: 'owned' });
  model.store.putMediaAsset(asset);
  model.currentMedia = asset;
  const track = makeSubtitleTrack({ mediaId: asset.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'x.srt', contentSha256: sha, isActive: true, transcriptStatus: 'approved' });
  model.store.putSubtitleTrack(track);
  model.targetTrackId = track.id;
  const c0 = makeCue({ trackId: track.id, cueIndex: 0, startMs: 0, endMs: 2000, text: 'Dzień dobry.', normalizedText: 'dzień dobry.', textSha256: sha });
  const c1 = makeCue({ trackId: track.id, cueIndex: 1, startMs: 2000, endMs: 4000, text: 'Do widzenia.', normalizedText: 'do widzenia.', textSha256: sha });
  model.store.putCue(c0);
  model.store.putCue(c1);
  model.cues = [c0, c1];
  model.player.durationMs = 4000;
  model.view = 'player';
  rerenderApp(model);
  return { model, c0, c1 };
}

const video = () => document.querySelector('.video-stage video') as HTMLVideoElement;
const playBtn = () => document.querySelector('.player-controls button.player-play') as HTMLButtonElement;
const otherAsset = () => makeMediaAsset({ title: 'Other', originalPath: 'fixtures/media/y.webm', contentSha256: sha, durationMs: 4000, container: 'webm', sizeBytes: 2, privacyLabel: 'owned' });

describe('lt-2zm video stage mounted once', () => {
  beforeEach(setupDom);
  afterEach(() => vi.restoreAllMocks());

  it('rerendering with the same media keeps the same <video> and assigns src exactly once', () => {
    const { model } = installModel();
    const v = video();
    const stage = v.parentElement;
    rerenderApp(model);
    rerenderApp(model);
    expect(video()).toBe(v);
    expect(v.parentElement).toBe(stage);
    expect(srcSets.filter((x) => x.el === v)).toHaveLength(1);
    expect(srcSets).toHaveLength(1);
  });

  it('a media change creates a new element with a new src and releases the old one', () => {
    const { model } = installModel();
    const old = video();
    playBtn().click();
    const other = otherAsset();
    model.store.putMediaAsset(other);
    model.currentMedia = other;
    model.player.currentTimeMs = 0;
    rerenderApp(model);
    const v = video();
    expect(v).not.toBe(old);
    expect(v.getAttribute('src')).toBe('fixtures/media/y.webm');
    expect(old.paused).toBe(true);
    expect(old.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalled();
    expect(srcSets).toHaveLength(2);
  });

  it('a Save keeps the playback position on the same element', () => {
    const { model, c1 } = installModel();
    const v = video();
    v.currentTime = 2.7;
    v.dispatchEvent(new dom.window.Event('timeupdate'));
    expect(saveLexemeFromCue(model, c1, 'widzenia', 3, 11, 1)).not.toBeNull();
    rerenderApp(model);
    expect(video()).toBe(v);
    expect(v.currentTime).toBeCloseTo(2.7);
  });

  it('typing in transcript search while playing keeps the element and play state', () => {
    const { model } = installModel();
    playBtn().click();
    const v = video();
    pause.mockClear();
    const input = document.getElementById('transcript-search') as HTMLInputElement;
    for (const ch of ['d', 'o']) {
      input.value += ch;
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }
    expect(video()).toBe(v);
    expect(pause).not.toHaveBeenCalled();
    expect(model.player.isPlaying).toBe(true);
    expect(v.paused).toBe(false);
    expect(playBtn().textContent).toBe('Pause');
  });

  it('a pause fired while the element is detached during a rerender does not flip isPlaying, and playback resumes', () => {
    const { model } = installModel();
    playBtn().click();
    const v = video();
    // Real Chrome may pause a media element removed from the document; emulate it on every detaching insert.
    const proto = dom.window.Node.prototype as any;
    const origAppend = proto.appendChild;
    let emulatedPauses = 0;
    proto.appendChild = function (this: Node, n: Node) {
      const r = origAppend.call(this, n);
      if (!v.isConnected && !v.paused) { emulatedPauses += 1; (v as any).pause(); }
      return r;
    };
    try {
      rerenderApp(model);
    } finally {
      proto.appendChild = origAppend;
    }
    expect(emulatedPauses).toBeGreaterThan(0);
    expect(model.player.isPlaying).toBe(true);
    expect(video()).toBe(v);
    expect(v.paused).toBe(false);
  });

  it('a speed change keeps the element and updates playbackRate', () => {
    const { model } = installModel();
    const v = video();
    const speed = document.getElementById('playback-speed') as HTMLInputElement;
    speed.value = '1.5';
    speed.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    rerenderApp(model);
    expect(video()).toBe(v);
    expect(v.playbackRate).toBe(1.5);
  });

  it('leaving Player pauses; returning reattaches the same element at the same time', () => {
    const { model } = installModel();
    playBtn().click();
    const v = video();
    v.currentTime = 1.3;
    v.dispatchEvent(new dom.window.Event('timeupdate'));
    model.view = 'saved';
    rerenderApp(model);
    expect(video()).toBeNull();
    expect(v.paused).toBe(true);
    expect(model.player.isPlaying).toBe(false);
    model.view = 'player';
    rerenderApp(model);
    expect(video()).toBe(v);
    expect(v.currentTime).toBeCloseTo(1.3);
    expect(srcSets).toHaveLength(1);
  });

  it('a relink (new object URL) creates a new element', () => {
    const { model } = installModel();
    const old = video();
    model.browserLocalMedia = { ...model.browserLocalMedia, objectUrl: 'blob:lt-2zm-1' };
    rerenderApp(model);
    const v = video();
    expect(v).not.toBe(old);
    expect(v.getAttribute('src')).toBe('blob:lt-2zm-1');
    model.browserLocalMedia = { ...model.browserLocalMedia, objectUrl: 'blob:lt-2zm-2' };
    rerenderApp(model);
    expect(video()).not.toBe(v);
    expect(video().getAttribute('src')).toBe('blob:lt-2zm-2');
  });

  it('the subtitle overlay and media-error alert still update on the persistent stage', () => {
    const { model } = installModel();
    const v = video();
    v.currentTime = 2.5;
    v.dispatchEvent(new dom.window.Event('timeupdate'));
    expect(document.querySelector('.subtitle-overlay')?.textContent).toContain('widzenia');
    Object.defineProperty(v, 'error', { configurable: true, get: () => ({ code: 4 }) });
    v.dispatchEvent(new dom.window.Event('error'));
    expect(video()).toBe(v);
    expect(document.querySelectorAll('.media-error-alert')).toHaveLength(1);
    rerenderApp(model);
    expect(document.querySelectorAll('.media-error-alert')).toHaveLength(1);
    v.dispatchEvent(new dom.window.Event('loadedmetadata'));
    expect(document.querySelector('.media-error-alert')).toBeNull();
    rerenderApp(model);
    expect(document.querySelector('.media-error-alert')).toBeNull();
  });
});
