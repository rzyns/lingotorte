import { captureSentence } from '../helpers/capture';
// lt-r4k.2 — keyboard focus continuity after actions that remove the activated control (synthetic, offline, JSDOM).
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, generateLocalAsrDraft, importFixtureMediaAndSubtitles, makeFakeLocalAsrProvider, setPracticeMode, setView } from '../../apps/web/src/model';
import { requestFocusAfterRender, rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

const T0 = new Date('2030-03-04T10:00:00.000Z');
const MEDIA = 'fixtures/media/synthetic-polish-dialogue.webm';
const TARGET = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const NATIVE = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';

async function cards(n: number): Promise<AppModel> {
  const model = createAppModel();
  await importFixtureMediaAndSubtitles(model, MEDIA, TARGET, NATIVE);
  for (const cue of model.cues.slice(0, n)) {
    await captureSentence(model, cue);
  }
  return model;
}
function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found as HTMLButtonElement;
}
type Activation = 'click' | 'enter';
/** Focus the control, then activate it: click, or Enter keydown followed by the click a browser synthesises. */
function activate(el: HTMLElement, how: Activation): void {
  el.focus();
  expect(document.activeElement).toBe(el);
  if (how === 'enter') el.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  el.click();
}
function expectFocus(id: string): void {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement?.id).toBe(id);
  expect((document.activeElement as HTMLElement).isConnected).toBe(true);
}

describe('lt-r4k.2 focus successors', () => {
  let dom: JSDOM;
  beforeEach(() => {
    vi.useFakeTimers({ now: T0, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    dom = new JSDOM('<main id="app"></main>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
    Object.assign(globalThis, { document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0, CSS: { escape: (s: string) => s } });
  });
  afterEach(() => { vi.useRealTimers(); dom.window.close(); });

  it.each(['click', 'enter'] as const)('transcript Approve (%s) focuses the transcript status region', async (how) => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(model, MEDIA, TARGET, NATIVE);
    await generateLocalAsrDraft(model, makeFakeLocalAsrProvider({ engine: 'synthetic', modelName: 'synthetic-asr', language: 'pl', segments: [{ startMs: 0, endMs: 1500, text: 'Cześć świecie.' }] }));
    model.view = 'library'; rerenderApp(model);
    activate(button('Approve transcript for study'), how);
    expect(model.store.getSubtitleTrack(model.targetTrackId!)!.transcriptStatus).toBe('approved');
    expectFocus('transcript-lifecycle-status');
    expect(document.activeElement?.textContent).toContain('Transcript approved for study');
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
  });

  for (const rating of ['Again', 'Hard', 'Good', 'Easy']) {
    it.each(['click', 'enter'] as const)(`review Rate ${rating} (%s) focuses the next card's Show answer, then the no-cards region`, async (how) => {
      const model = await cards(2);
      setView(model, 'review'); rerenderApp(model);
      activate(button('Show answer / context'), how);
      expectFocus('review-reveal-toggle');
      activate(button(rating), how);
      expectFocus('review-reveal-toggle');
      expect(document.activeElement?.textContent).toBe('Show answer / context');
      activate(button('Show answer / context'), how);
      activate(button(rating), how);
      if (document.getElementById('review-empty')) expectFocus('review-empty');
      else expectFocus('review-reveal-toggle');
    });
  }

  it('review Rate on the last due card focuses the no-cards region', async () => {
    const model = await cards(1);
    setView(model, 'review'); rerenderApp(model);
    activate(button('Show answer / context'), 'click');
    activate(button('Easy'), 'click');
    expectFocus('review-empty');
  });

  it.each(['click', 'enter'] as const)('practice Submit attempt (%s) focuses the result region', async (how) => {
    const model = await cards(2);
    setPracticeMode(model, 'typed-input'); setView(model, 'practice'); rerenderApp(model);
    activate(button('Submit attempt'), how);
    expectFocus('practice-feedback');
    // No aria-label on the status region: screen readers read its verdict text when focus lands.
    expect(document.activeElement?.hasAttribute('aria-label')).toBe(false);
    expect((document.activeElement?.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it.each(['click', 'enter'] as const)('multiple-choice answer (%s) focuses the result region', async (how) => {
    const model = await cards(2);
    setPracticeMode(model, 'multiple-choice'); setView(model, 'practice'); rerenderApp(model);
    activate(document.querySelector('button[data-choice-index="0"]') as HTMLButtonElement, how);
    expectFocus('practice-feedback');
  });

  it('practice Skip and Reveal answer keep focus on a successor', async () => {
    const model = await cards(2);
    setPracticeMode(model, 'typed-input'); setView(model, 'practice'); rerenderApp(model);
    activate(button('Reveal answer'), 'click');
    expectFocus('practice-revealed-answer');
    activate(button('Skip'), 'click');
    expectFocus('practice-feedback');
  });

  it('a non-user render (wake/autosave) never moves focus', async () => {
    const model = await cards(2);
    setView(model, 'review'); rerenderApp(model);
    activate(button('Show answer / context'), 'click');
    activate(button('Good'), 'click');
    expectFocus('review-reveal-toggle');
    (document.activeElement as HTMLElement).blur();
    rerenderApp(model); // timer-driven render: no pending request
    expect(document.activeElement).toBe(document.body);
  });
  it('a pending request is consumed by exactly one render', async () => {
    const model = await cards(2); setView(model, 'review'); rerenderApp(model);
    requestFocusAfterRender(model, 'review-reveal-toggle');
    rerenderApp(model); expectFocus('review-reveal-toggle');
    (document.activeElement as HTMLElement).blur();
    rerenderApp(model); expect(document.activeElement).toBe(document.body);
  });
});
