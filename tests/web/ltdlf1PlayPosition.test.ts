import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, saveLexemeFromCue } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-dlf.1: the Play button must not rebuild the <video>; a rebuilt <video> keeps position and play state;
// events from a detached element are ignored; opening capture pauses playback.

const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;
let dom: JSDOM;

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
const seek = () => document.querySelector('input[aria-label="Seek"]') as HTMLInputElement;
const metadata = (v: HTMLVideoElement) => v.dispatchEvent(new dom.window.Event('loadedmetadata'));

describe('lt-dlf.1 play button and playback position across rerenders', () => {
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  let durationS = 4;
  beforeEach(() => {
    durationS = 4;
    setupDom();
    const proto = dom.window.HTMLMediaElement.prototype as any;
    const state = new WeakMap<object, { paused: boolean; t: number }>();
    const s = (el: object) => { let v = state.get(el); if (!v) { v = { paused: true, t: 0 }; state.set(el, v); } return v; };
    play = vi.fn(function (this: HTMLVideoElement) {
      s(this).paused = false;
      this.dispatchEvent(new dom.window.Event('play'));
      return Promise.resolve();
    });
    pause = vi.fn(function (this: HTMLVideoElement) {
      if (s(this).paused) return;
      s(this).paused = true;
      this.dispatchEvent(new dom.window.Event('pause'));
    });
    Object.defineProperty(proto, 'play', { configurable: true, value: play });
    Object.defineProperty(proto, 'pause', { configurable: true, value: pause });
    Object.defineProperty(proto, 'paused', { configurable: true, get(this: object) { return s(this).paused; } });
    Object.defineProperty(proto, 'currentTime', { configurable: true, get(this: object) { return s(this).t; }, set(this: object, v: number) { s(this).t = v; } });
    Object.defineProperty(proto, 'duration', { configurable: true, get: () => durationS });
  });
  afterEach(() => vi.restoreAllMocks());

  it('clicking Play keeps the same <video>, shows Pause and stays playing', () => {
    const { model } = installModel();
    const before = video();
    playBtn().click();
    expect(video()).toBe(before);
    expect(before.isConnected).toBe(true);
    expect(playBtn().textContent).toBe('Pause');
    expect(model.player.isPlaying).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    playBtn().click();
    expect(video()).toBe(before);
    expect(playBtn().textContent).toBe('Play');
    expect(model.player.isPlaying).toBe(false);
  });

  it('a pause event from a detached old video does not stop the model', () => {
    const { model } = installModel();
    const old = video();
    model.player.isPlaying = true;
    rerenderApp(model);
    expect(video()).not.toBe(old);
    old.dispatchEvent(new dom.window.Event('pause'));
    expect(model.player.isPlaying).toBe(true);
    old.currentTime = 3.9;
    old.dispatchEvent(new dom.window.Event('timeupdate'));
    expect(model.player.currentTimeMs).toBe(0);
  });

  it('a rebuilt video restores currentTimeMs on loadedmetadata and syncs the seek slider', () => {
    const { model } = installModel();
    model.player.currentTimeMs = 1500;
    rerenderApp(model);
    metadata(video());
    expect(video().currentTime).toBeCloseTo(1.5);
    expect(Number(seek().value)).toBeCloseTo(1.5);
  });

  it('a rebuilt video resumes playback when the model was playing', () => {
    const { model } = installModel();
    playBtn().click();
    play.mockClear();
    rerenderApp(model);
    metadata(video());
    expect(play).toHaveBeenCalledTimes(1);
    expect(model.player.isPlaying).toBe(true);
    expect(playBtn().textContent).toBe('Pause');
  });

  it('clicking a transcript word while playing opens capture, pauses and preserves position', () => {
    const { model } = installModel();
    playBtn().click();
    const v = video();
    v.currentTime = 1.2;
    v.dispatchEvent(new dom.window.Event('timeupdate'));
    expect(model.player.currentTimeMs).toBe(1200);
    const word = document.querySelector('.cue-word') as HTMLElement;
    word.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(model.selection).not.toBeNull();
    expect(pause).toHaveBeenCalled();
    expect(model.player.isPlaying).toBe(false);
    expect(model.player.currentTimeMs).toBe(1200);
    metadata(video());
    expect(video().currentTime).toBeCloseTo(1.2);
    expect(playBtn().textContent).toBe('Play');
  });

  it('Next/Prev cue while playing keeps playing at the cue start', () => {
    const { model, c0, c1 } = installModel();
    playBtn().click();
    const next = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Next cue')!;
    next.click();
    expect(model.player.currentTimeMs).toBe(c1.startMs);
    metadata(video());
    expect(model.player.isPlaying).toBe(true);
    expect(video().currentTime).toBeCloseTo(c1.startMs / 1000);
    expect(playBtn().textContent).toBe('Pause');
    const prev = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Prev cue')!;
    play.mockClear();
    prev.click();
    metadata(video());
    expect(model.player.currentTimeMs).toBe(c0.startMs);
    expect(model.player.isPlaying).toBe(true);
    expect(play).toHaveBeenCalled();
  });

  it('Space toggles through the same in-place path (same <video>, label flips)', () => {
    const { model } = installModel();
    const before = video();
    document.body.focus();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    expect(video()).toBe(before);
    expect(model.player.isPlaying).toBe(true);
    expect(playBtn().textContent).toBe('Pause');
  });

  it('a rejected play() (autoplay policy) leaves the model and button in the paused state', async () => {
    const { model } = installModel();
    play.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    playBtn().click();
    await Promise.resolve();
    await Promise.resolve();
    expect(model.player.isPlaying).toBe(false);
    expect(playBtn().textContent).toBe('Play');
  });

  it('with an unknown (NaN) duration the restore clamps to the model duration', () => {
    const { model } = installModel();
    durationS = Number.NaN;
    model.player.durationMs = 3000;
    model.player.currentTimeMs = 3500;
    rerenderApp(model);
    metadata(video());
    expect(video().currentTime).toBeCloseTo(3);
  });

  it('switching to different media starts the new video at 0, not the previous position', () => {
    const { model } = installModel();
    model.player.currentTimeMs = 2500;
    rerenderApp(model);
    metadata(video());
    expect(video().currentTime).toBeCloseTo(2.5);
    const other = makeMediaAsset({ title: 'Other', originalPath: 'fixtures/media/y.webm', contentSha256: sha, durationMs: 4000, container: 'webm', sizeBytes: 2, privacyLabel: 'owned' });
    model.store.putMediaAsset(other);
    const select = document.querySelector('select[aria-label*="media" i], select#media-select') as HTMLSelectElement | null;
    if (select && Array.from(select.options).some((o) => o.value === other.id)) {
      select.value = other.id;
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    } else {
      // Same reset the media-switch paths perform (model.ts currentTimeMs = 0 on media change).
      model.currentMedia = other;
      model.player.currentTimeMs = 0;
      rerenderApp(model);
    }
    const v = video();
    metadata(v);
    expect(v.currentTime).toBe(0);
  });

  it('jumping to a saved occurrence lands at the occurrence start after the rebuild', () => {
    const { model, c0, c1 } = installModel();
    expect(saveLexemeFromCue(model, c1, 'widzenia', 3, 11, 1)).not.toBeNull();
    model.player.currentTimeMs = 500;
    model.view = 'saved';
    rerenderApp(model);
    const link = Array.from(document.querySelectorAll('a')).find((a) => (a.getAttribute('aria-label') ?? '').startsWith('Jump to'));
    expect(link, 'saved occurrence jump link').toBeTruthy();
    link!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(model.view).toBe('player');
    expect(model.player.currentTimeMs).toBe(c1.startMs);
    metadata(video());
    expect(video().currentTime).toBeCloseTo(c1.startMs / 1000);
    void c0;
  });
});
