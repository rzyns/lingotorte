import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, setLoopRange } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-xlr: native <video controls> removed; the custom row provides seek/mute/fullscreen and Space toggles play.

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
  const cue = makeCue({ trackId: track.id, cueIndex: 0, startMs: 0, endMs: 4000, text: 'Dzień dobry.', normalizedText: 'dzień dobry.', textSha256: sha });
  model.store.putCue(cue);
  model.cues = [cue];
  model.player.durationMs = 4000;
  model.view = 'player';
  rerenderApp(model);
  return { model, cue };
}

const video = () => document.querySelector('.video-stage video') as HTMLVideoElement;
const seek = () => document.querySelector('input[aria-label="Seek"]') as HTMLInputElement;
const space = (el: EventTarget) => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

describe('lt-xlr custom video controls', () => {
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setupDom();
    play = vi.fn(() => Promise.resolve());
    pause = vi.fn();
    Object.defineProperty(dom.window.HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
    Object.defineProperty(dom.window.HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders the video without native controls or role=img, and exactly one play control', () => {
    installModel();
    expect(video().hasAttribute('controls')).toBe(false);
    expect(video().hasAttribute('role')).toBe(false);
    expect(video().getAttribute('aria-label')).toBe('Clip');
    const playButtons = Array.from(document.querySelectorAll('button')).filter((b) => /^(Play|Pause)$/.test(b.textContent ?? ''));
    expect(playButtons).toHaveLength(1);
    expect(document.querySelector('.keyboard-shortcuts .shortcut-help-button')).toBeTruthy(); // lt-dlf.8 H10: full list moved to the '?' dialog
  });

  it('seek slider updates in place on timeupdate and seeks the video on input', () => {
    installModel();
    const slider = seek();
    expect(slider.max).toBe('4');
    Object.defineProperty(video(), 'duration', { configurable: true, value: 4 });
    video().currentTime = 1.5;
    video().dispatchEvent(new dom.window.Event('timeupdate'));
    expect(seek()).toBe(slider);
    expect(Number(slider.value)).toBeCloseTo(1.5);
    expect(document.querySelector('.player-controls .timeline')?.textContent).toMatch(/^0:01/);
    slider.value = '3';
    slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(video().currentTime).toBe(3);
  });

  it('mute toggles video.muted and aria-pressed, surviving a rerender', () => {
    const { model } = installModel();
    const btn = () => document.querySelector('button.player-mute') as HTMLButtonElement;
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    expect(btn().textContent).toBe('Mute');
    btn().click();
    expect(video().muted).toBe(true);
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    expect(btn().textContent).toBe('Unmute');
    rerenderApp(model);
    btn().click();
    expect(video().muted).toBe(false);
    expect(btn().getAttribute('aria-pressed')).toBe('false');
  });

  it('fullscreen requests fullscreen on the video stage wrapper', () => {
    const request = vi.fn(() => Promise.resolve());
    Object.defineProperty(dom.window.HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request });
    const { model } = installModel();
    rerenderApp(model);
    const btn = document.querySelector('button.player-fullscreen') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(request).toHaveBeenCalledTimes(1);
    expect((request.mock.contexts[0] as HTMLElement).classList.contains('video-stage')).toBe(true);
  });

  it('Space toggles play from body but not from inputs, buttons or cue rows', () => {
    const { model, cue } = installModel();
    space(document.body);
    expect(play).toHaveBeenCalledTimes(1);
    expect(model.player.isPlaying).toBe(true);
    space(document.body);
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(model.player.isPlaying).toBe(false);

    const speed = document.getElementById('playback-speed') as HTMLInputElement;
    expect(space(speed)).toBe(true);
    expect(play, 'input').toHaveBeenCalledTimes(1);
    const muteBtn = document.querySelector('button.player-mute') as HTMLButtonElement;
    space(muteBtn);
    expect(play, 'button').toHaveBeenCalledTimes(1);
    const rowEl = document.querySelector(`.transcript-panel [data-cue-id="${cue.id}"]`) as HTMLElement;
    rowEl.focus();
    space(rowEl);
    // The row's own Space activation seeks and plays once; the global handler must not also toggle.
    expect(play).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('focused-but-not-dragging slider keeps tracking playback; a pointer drag freezes it', () => {
    installModel();
    const slider = seek();
    Object.defineProperty(video(), 'duration', { configurable: true, value: 4 });
    slider.focus();
    expect(document.activeElement).toBe(slider);
    const tick = (t: number) => { video().currentTime = t; video().dispatchEvent(new dom.window.Event('timeupdate')); };
    tick(1);
    expect(Number(slider.value)).toBeCloseTo(1);
    slider.dispatchEvent(new dom.window.Event('pointerdown'));
    tick(2);
    expect(Number(slider.value)).toBeCloseTo(1);
    slider.dispatchEvent(new dom.window.Event('pointerup'));
    tick(3);
    expect(Number(slider.value)).toBeCloseTo(3);
  });

  it('fullscreen button label follows fullscreenchange, exits when already fullscreen', () => {
    const request = vi.fn(() => Promise.resolve());
    const exit = vi.fn(() => Promise.resolve());
    Object.defineProperty(dom.window.HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
    let fsEl: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fsEl });
    const { model } = installModel();
    rerenderApp(model);
    const btn = () => document.querySelector('button.player-fullscreen') as HTMLButtonElement;
    expect(btn().textContent).toBe('Fullscreen');
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    fsEl = document.querySelector('.video-stage');
    document.dispatchEvent(new dom.window.Event('fullscreenchange'));
    expect(btn().textContent).toBe('Exit fullscreen');
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    btn().click();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    fsEl = null;
    document.dispatchEvent(new dom.window.Event('fullscreenchange'));
    expect(btn().textContent).toBe('Fullscreen');
    expect(btn().getAttribute('aria-pressed')).toBe('false');
  });

  it('fullscreen button is disabled when requestFullscreen is unsupported', () => {
    Object.defineProperty(dom.window.HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    installModel();
    expect((document.querySelector('button.player-fullscreen') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Space flips the play label in place without rerendering or replacing the <video>', () => {
    const { model } = installModel();
    const before = video();
    const controlsBefore = document.querySelector('.player-controls');
    const btn = () => document.querySelector('button.player-play') as HTMLButtonElement;
    expect(btn().textContent).toBe('Play');
    space(document.body);
    expect(model.player.isPlaying).toBe(true);
    expect(video()).toBe(before);
    expect(document.querySelector('.player-controls')).toBe(controlsBefore);
    expect(btn().textContent).toBe('Pause');
    space(document.body);
    expect(video()).toBe(before);
    expect(btn().textContent).toBe('Play');
  });

  it('Space on the focused seek slider does not toggle play', () => {
    const { model } = installModel();
    const slider = seek();
    slider.focus();
    space(slider);
    expect(play).not.toHaveBeenCalled();
    expect(model.player.isPlaying).toBe(false);
  });

  it('loop range still loops via timeupdate without native controls', () => {
    const { model } = installModel();
    setLoopRange(model, 1000, 2000);
    video().currentTime = 2.5;
    video().dispatchEvent(new dom.window.Event('timeupdate'));
    expect(video().currentTime).toBeCloseTo(1);
  });

  it('non-finite duration keeps the slider disabled until a finite durationchange', () => {
    const { model } = installModel();
    model.player.durationMs = 0;
    const proto = dom.window.HTMLMediaElement.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, 'duration')!;
    Object.defineProperty(dom.window.HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => NaN });
    rerenderApp(model);
    expect(seek().disabled).toBe(true);
    let d = Infinity;
    Object.defineProperty(video(), 'duration', { configurable: true, get: () => d });
    video().dispatchEvent(new dom.window.Event('durationchange'));
    expect(seek().disabled).toBe(true);
    d = 7;
    video().dispatchEvent(new dom.window.Event('durationchange'));
    expect(seek().disabled).toBe(false);
    expect(seek().max).toBe('7');
    Object.defineProperty(proto, 'duration', original);
  });
});
