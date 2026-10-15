import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAppModel,
  createReviewCardForSavedItem,
  importFixtureMediaAndSubtitles,
  saveSentenceFromCue,
  setView,
} from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';

// lt-dlf.4: Review keyboard flow — Space toggles reveal, 1-4 rate Again/Hard/Good/Easy once revealed.

const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';
type Model = ReturnType<typeof createAppModel>;
let dom: JSDOM;

async function reviewModel(cards = 4): Promise<Model> {
  const model = createAppModel();
  await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
  for (const cue of model.cues.slice(0, cards)) {
    const item = (await saveSentenceFromCue(model, cue))!;
    const occurrence = model.savedOccurrenceService.listOccurrencesForItem(item.id)[0]!;
    createReviewCardForSavedItem(model, item, occurrence);
  }
  setView(model, 'review');
  rerenderApp(model);
  return model;
}

function key(k: string, target: EventTarget = document.body, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}
const revealed = () => !!document.querySelector('.review-buttons');
const events = (m: Model) => m.store.snapshot().reviewEvents;

describe('lt-dlf.4 review keyboard flow', () => {
  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
    Object.assign(globalThis, { document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0, CSS: { escape: (s: string) => s } });
  });
  afterEach(() => { vi.restoreAllMocks(); dom.window.close(); });

  it('Space reveals and hides, with preventDefault', async () => {
    const model = await reviewModel(1);
    expect(revealed()).toBe(false);
    expect(key(' ').defaultPrevented).toBe(true);
    expect(model.review.revealed).toBe(true);
    expect(revealed()).toBe(true);
    key(' ');
    expect(revealed()).toBe(false);
  });

  it('1-4 do nothing before reveal', async () => {
    const model = await reviewModel(1);
    for (const k of ['1', '2', '3', '4']) expect(key(k).defaultPrevented).toBe(false);
    expect(events(model)).toHaveLength(0);
  });

  it.each([['1', 'again'], ['2', 'hard'], ['3', 'good'], ['4', 'easy']])('key %s rates %s and advances', async (k, rating) => {
    const model = await reviewModel(2);
    const before = model.review.currentCardId;
    key(' ');
    expect(key(k).defaultPrevented).toBe(true);
    const last = events(model).at(-1) as { rating: string; cardId: string } | undefined;
    expect(events(model)).toHaveLength(1);
    expect(String(last?.rating).toLowerCase()).toBe(rating);
    expect(last?.cardId).toBe(before);
    expect(model.review.revealed).toBe(false);
    expect(revealed()).toBe(false);
    expect(document.activeElement?.isConnected).toBe(true);
    expect(document.activeElement?.id).toBe('review-reveal-toggle');
  });

  // lt-dlf.5: requestFocusAfterRender focuses with preventScroll, then reveals with block 'nearest'.
  it('a Review focus request after rating focuses the reveal toggle with preventScroll and a nearest scroll', async () => {
    const model = await reviewModel(2);
    const focusOpts: { id: string; opts: FocusOptions | undefined }[] = [];
    const origFocus = dom.window.HTMLElement.prototype.focus;
    vi.spyOn(dom.window.HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, opts?: FocusOptions) {
      focusOpts.push({ id: this.id, opts });
      return origFocus.call(this, opts);
    });
    const scrolls: { id: string; opts: unknown }[] = [];
    (dom.window.Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = function (this: Element, opts: unknown) { scrolls.push({ id: this.id, opts }); };
    key(' ');
    key('3');
    expect(model.review.revealed).toBe(false);
    expect(document.activeElement?.id).toBe('review-reveal-toggle');
    expect(focusOpts.at(-1)).toEqual({ id: 'review-reveal-toggle', opts: { preventScroll: true } });
    expect(scrolls.filter((s) => s.id === 'review-reveal-toggle').at(-1)?.opts).toEqual({ block: 'nearest' });
  });

  it('ignores keys in editable fields and with Ctrl/Meta/Alt', async () => {
    const model = await reviewModel(1);
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    document.body.append(input, area);
    key(' ', input); key(' ', area);
    key(' ', document.body, { ctrlKey: true }); key(' ', document.body, { metaKey: true }); key(' ', document.body, { altKey: true });
    expect(model.review.revealed).toBe(false);
    key(' ');
    key('3', input); key('3', area); key('3', document.body, { ctrlKey: true }); key('3', document.body, { metaKey: true });
    expect(events(model)).toHaveLength(0);
  });

  it('Space on a focused button is left to native activation (no double toggle)', async () => {
    const model = await reviewModel(1);
    const btn = document.getElementById('review-reveal-toggle')!;
    btn.focus();
    const event = key(' ', btn);
    expect(event.defaultPrevented).toBe(false);
    expect(model.review.revealed).toBe(false);
    btn.click();
    expect(model.review.revealed).toBe(true);
  });

  it('digits work while a rating button has focus', async () => {
    const model = await reviewModel(1);
    key(' ');
    const good = document.querySelector('.review-buttons button.good') as HTMLButtonElement;
    good.focus();
    key('1', good);
    expect(events(model)).toHaveLength(1);
  });

  it('no-card-due state ignores keys; hint and shortcut badges render', async () => {
    const empty = await reviewModel(0);
    expect(key(' ').defaultPrevented).toBe(false);
    expect(empty.review.revealed).toBe(false);
    const model = await reviewModel(1);
    expect(document.querySelector('.review-shortcut-hint')?.textContent).toContain('Space: show answer');
    expect(document.querySelector('.review-shortcut-hint')?.textContent).toContain('1–4: rate');
    key(' ');
    const shortcuts = Array.from(document.querySelectorAll('.review-buttons button')).map((b) => (b as HTMLElement).dataset.shortcut);
    expect(shortcuts).toEqual(['1', '2', '3', '4']);
    expect(document.querySelector('.review-buttons button.good')?.textContent).toBe('Good');
    expect(model.review.revealed).toBe(true);
  });

  it('player view Space still toggles playback; review view Space does not touch the player', async () => {
    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(dom.window.HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
    Object.defineProperty(dom.window.HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() });
    const model = await reviewModel(1);
    key(' ');
    expect(model.player.isPlaying).toBe(false);
    setView(model, 'player');
    model.review.revealed = false;
    rerenderApp(model);
    if (document.querySelector('.video-stage video')) {
      expect(key(' ').defaultPrevented).toBe(true);
      expect(model.review.revealed).toBe(false);
    }
  });

  it('auto-repeat keydowns never rate or toggle (review fix 1)', async () => {
    const model = await reviewModel(2);
    key(' ');
    expect(model.review.revealed).toBe(true);
    const e = key('3', document.body, { repeat: true });
    expect(e.defaultPrevented).toBe(true);
    expect(events(model)).toHaveLength(0);
    expect(model.review.revealed).toBe(true);
    key(' ', document.body, { repeat: true });
    expect(model.review.revealed).toBe(true);
    expect(revealed()).toBe(true);
  });

  it('Space on the focused reveal toggle after rating toggles exactly once', async () => {
    const model = await reviewModel(2);
    key(' ');
    key('3');
    expect(events(model)).toHaveLength(1);
    const toggle = document.getElementById('review-reveal-toggle') as HTMLButtonElement;
    toggle.focus();
    const e = key(' ', toggle);
    expect(e.defaultPrevented).toBe(false);
    expect(model.review.revealed).toBe(false);
    toggle.click(); // native activation of the focused button
    expect(model.review.revealed).toBe(true);
  });

  it('two quick 3 presses rate exactly one card per reveal', async () => {
    const model = await reviewModel(3);
    key(' ');
    key('3');
    const second = key('3');
    expect(second.defaultPrevented).toBe(false);
    expect(events(model)).toHaveLength(1);
  });

  it('exposes aria-keyshortcuts on toggle and rating buttons', async () => {
    await reviewModel(1);
    expect(document.getElementById('review-reveal-toggle')!.getAttribute('aria-keyshortcuts')).toBe('Space');
    key(' ');
    const shortcuts = [...document.querySelectorAll('.review-buttons button')].map((b) => b.getAttribute('aria-keyshortcuts'));
    expect(shortcuts).toEqual(['1', '2', '3', '4']);
  });
});
