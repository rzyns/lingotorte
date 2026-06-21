import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createAppModel,
  importFixtureMediaAndSubtitles,
  importTargetOnlyFixture,
  activeCueAtTime,
  projectPlayerState,
  applyLoopTolerance,
  previousCue,
  nextCue,
  clampPlaybackRate,
  setPlaybackRate,
} from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { withNoNetwork } from '../../tests/no-network/networkTrap';

async function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost:5173/',
  });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.CSS = { escape: (value: string) => value.replace(/"/g, '\\"') } as unknown as typeof CSS;
  return dom;
}

const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';
const targetOnlySrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target-only.srt';
const sha256Placeholder = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;

describe('P2 player dual-subtitle and transcript projection', () => {
  let dom: ReturnType<typeof setupDom> extends Promise<infer T> ? T : never;

  beforeEach(async () => {
    dom = await setupDom();
  });

  afterEach(() => {
    dom.window.close();
  });

  it('projects current cue and native text at cue time', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.currentTimeMs = 100;
    const nativeTrack = model.nativeTrackId ? model.store.getSubtitleTrack(model.nativeTrackId) : null;
    const nativeCues = model.nativeTrackId ? model.store.listCuesForTrack(model.nativeTrackId) : [];
    const projection = projectPlayerState(model.player, model.cues, nativeTrack, nativeCues);
    expect(projection.currentCue?.text).toBe('Cześć, to jest lokalny test.');
    expect(projection.nativeText).toBe('Hello, this is a local test.');
    expect(projection.canPrev).toBe(false);
    expect(projection.canNext).toBe(true);
    expect(projection.isLooping).toBe(false);
  });

  it('projects no native text for target-only fixture', async () => {
    const model = createAppModel();
    await importTargetOnlyFixture(model, mediaPath, targetOnlySrtPath);
    model.player.currentTimeMs = 100;
    const nativeTrack = model.nativeTrackId ? model.store.getSubtitleTrack(model.nativeTrackId) : null;
    const nativeCues = model.nativeTrackId ? model.store.listCuesForTrack(model.nativeTrackId) : [];
    const projection = projectPlayerState(model.player, model.cues, nativeTrack, nativeCues);
    expect(projection.currentCue?.text).toBe('Cześć, to jest lokalny test.');
    expect(projection.nativeText).toBeUndefined();
  });

  it('highlights active transcript cue and renders dual subtitle rows', async () => {
    const { value: model } = await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      m.player.currentTimeMs = 100;
      m.player.activeCueId = m.cues[0]?.id ?? null;
      rerenderApp(m);
      return m;
    });
    expect(model.player.activeCueId).toBeTruthy();
    const activeRow = document.querySelector('[data-cue-id].active');
    expect(activeRow).toBeTruthy();
    expect(activeRow?.textContent).toContain('Cześć, to jest lokalny test.');
    expect(activeRow?.textContent).toContain('Hello, this is a local test.');
    expect(activeRow?.getAttribute('aria-current')).toBe('true');
  });

  it('clicking a transcript cue seeks and marks it active', async () => {
    const { value: model } = await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      rerenderApp(m);
      return m;
    });
    const secondRow = Array.from(document.querySelectorAll('[data-cue-id]')).find((row) =>
      row.textContent?.includes('Uczymy'),
    );
    expect(secondRow).toBeTruthy();
    (secondRow as HTMLElement).click();
    expect(model.player.currentTimeMs).toBe(model.cues[1]?.startMs ?? 1000);
    expect(model.player.activeCueId).toBe(model.cues[1]?.id ?? null);
    rerenderApp(model);
    expect(document.querySelector('[data-cue-id].active')?.textContent).toContain('Uczymy');
  });

  it('keyboard Enter on transcript cue seeks to it', async () => {
    const { value: model } = await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      rerenderApp(m);
      return m;
    });
    const secondRow = Array.from(document.querySelectorAll('[data-cue-id]')).find((row) =>
      row.textContent?.includes('Uczymy'),
    );
    expect(secondRow).toBeTruthy();
    const event = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    secondRow!.dispatchEvent(event);
    expect(model.player.activeCueId).toBe(model.cues[1]?.id ?? null);
  });

  it('prev/next navigation helpers move between cues', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    const firstCue = model.cues[0]!;
    const secondCue = model.cues[1]!;
    expect(previousCue(model.cues, firstCue.id)).toBeNull();
    expect(nextCue(model.cues, firstCue.id)?.id).toBe(secondCue.id);
    expect(previousCue(model.cues, secondCue.id)?.id).toBe(firstCue.id);
    expect(nextCue(model.cues, secondCue.id)).toBeNull();
  });

  it('clamping and set playback rate enforce safe range and step', () => {
    const model = createAppModel();
    expect(clampPlaybackRate(2)).toBe(1.5);
    expect(clampPlaybackRate(0.25)).toBe(0.5);
    expect(clampPlaybackRate(0.73)).toBeCloseTo(0.7, 10);
    setPlaybackRate(model, 1.23);
    expect(model.player.playbackRate).toBeCloseTo(1.2, 10);
  });

  it('loop tolerance jumps back only after passing cue end plus tolerance', () => {
    const cue = { id: 'c1', startMs: 0, endMs: 1000, text: 'one', normalizedText: 'one', textSha256: sha256Placeholder, cueIndex: 0, trackId: 't1', createdAt: '2026-01-01T00:00:00.000Z' };
    expect(applyLoopTolerance(500, cue, true)).toBeNull();
    expect(applyLoopTolerance(1090, cue, true)).toBeNull();
    expect(applyLoopTolerance(1101, cue, true)).toBe(0);
    expect(applyLoopTolerance(-101, cue, true)).toBe(0);
    expect(applyLoopTolerance(1500, cue, false)).toBeNull();
  });

  it('activeCueAtTime returns correct cue within tolerance boundaries', () => {
    const cues = [
      { id: 'c1', startMs: 0, endMs: 1000, text: 'one', normalizedText: 'one', textSha256: sha256Placeholder, cueIndex: 0, trackId: 't1', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'c2', startMs: 1000, endMs: 2000, text: 'two', normalizedText: 'two', textSha256: sha256Placeholder, cueIndex: 1, trackId: 't1', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(activeCueAtTime(cues, 0)?.id).toBe('c1');
    expect(activeCueAtTime(cues, 999)?.id).toBe('c1');
    expect(activeCueAtTime(cues, 1000)?.id).toBe('c2');
    expect(activeCueAtTime(cues, 2500)).toBeNull();
  });

  it('rendered player controls include prev/next/play/loop/speed and enable states', async () => {
    await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      rerenderApp(m);
      const controls = document.querySelector('.player-controls');
      expect(controls).toBeTruthy();
      const labels = Array.from(controls!.querySelectorAll('button')).map((b) => b.textContent);
      expect(labels).toContain('Play');
      expect(labels).toContain('Prev cue');
      expect(labels).toContain('Next cue');
      expect(labels).toContain('Loop off');
      const prevBtn = Array.from(controls!.querySelectorAll('button')).find(
        (b) => b.textContent === 'Prev cue',
      ) as HTMLButtonElement | null;
      expect(prevBtn?.disabled).toBe(true);
      const nextBtn = Array.from(controls!.querySelectorAll('button')).find(
        (b) => b.textContent === 'Next cue',
      ) as HTMLButtonElement | null;
      expect(nextBtn?.disabled).toBe(false);
      return m;
    });
  });

  it('toggling loop updates UI and player state', async () => {
    const { value: model } = await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      rerenderApp(m);
      return m;
    });
    const loopBtn = Array.from(document.querySelectorAll('.player-controls button')).find(
      (b) => b.textContent === 'Loop off',
    ) as HTMLElement | null;
    expect(model.player.loopCue).toBe(false);
    loopBtn?.click();
    expect(model.player.loopCue).toBe(true);
    rerenderApp(model);
    const loopBtnAfter = Array.from(document.querySelectorAll('.player-controls button')).find(
      (b) => b.textContent === 'Loop on',
    ) as HTMLElement | null;
    expect(loopBtnAfter).toBeTruthy();
    expect(loopBtnAfter?.getAttribute('aria-pressed')).toBe('true');
  });

  it('transcript rows display source context for visible provenance', async () => {
    await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      rerenderApp(m);
      const rows = Array.from(document.querySelectorAll('[data-cue-id]'));
      const firstRow = rows[0];
      expect(firstRow?.textContent).toContain(mediaPath);
      expect(firstRow?.textContent).toContain('0:00.00');
      const secondRow = rows[1];
      expect(secondRow?.textContent).toContain('0:02.00');
      return m;
    });
  });
});
