import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAppModel,
  createReviewCardForSavedItem,
  importFixtureMediaAndSubtitles,
  learnerProgress,
  listReviewBuckets,
  pickNextDueCard,
  saveSentenceFromCue,
  setView,
} from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { withNoNetwork } from '../no-network/networkTrap';

// lt-2rl: review and practice must read a live, injectable clock at every
// query/submission boundary instead of one timestamp captured at session start.

const T0 = new Date('2030-03-04T10:00:00.000Z');
const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';

type Model = ReturnType<typeof createAppModel>;

async function modelWithCards(count: number): Promise<{ model: Model; cardIds: string[] }> {
  const model = createAppModel();
  await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
  const cardIds: string[] = [];
  for (const cue of model.cues.slice(0, count)) {
    const item = await saveSentenceFromCue(model, cue);
    if (!item) throw new Error('Missing synthetic saved item');
    const occurrence = model.savedOccurrenceService.listOccurrencesForItem(item.id)[0]!;
    cardIds.push(createReviewCardForSavedItem(model, item, occurrence).id);
  }
  return { model, cardIds };
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find(b => b.textContent === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found as HTMLButtonElement;
}

function rateCurrentReviewCard(rating: 'Again' | 'Good'): void {
  // Reveal state carrying across cards is lt-0g9 scope; reveal only when the ratings are hidden.
  if (!document.querySelector('.review-buttons')) button('Show answer / context').click();
  button(rating).click();
}

function failCurrentPracticeCard(): void {
  // A failed typed answer records an attempt and applies an FSRS "again" update.
  const input = document.getElementById('practice-answer') as HTMLInputElement;
  input.value = 'zzz-wrong';
  input.dispatchEvent(new window.Event('input'));
  button('Submit attempt').click();
}

function dueAtMs(model: Model, cardId: string): number {
  return Date.parse(model.store.getReviewCardState(cardId)!.dueAt);
}

describe('lt-2rl live review/practice clock', () => {
  let dom: JSDOM;
  beforeEach(() => {
    vi.useFakeTimers({ now: T0, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    dom = new JSDOM('<main id="app"></main>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
    Object.assign(globalThis, { document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0, CSS: { escape: (s: string) => s } });
  });
  afterEach(() => {
    vi.useRealTimers();
    dom.window.close();
  });

  it('stamps each review rating with the clock at the click, not the session start', async () => {
    const { networkAttempts } = await withNoNetwork(async () => {
      const { model, cardIds: [card] } = await modelWithCards(1);
      setView(model, 'review');
      vi.advanceTimersByTime(5_000);
      rerenderApp(model);
      const firstClick = new Date();
      rateCurrentReviewCard('Again');
      const first = model.store.listReviewEventsForCard(card!);
      expect(first.map(e => e.reviewedAt)).toEqual([firstClick.toISOString()]);
      expect(firstClick.valueOf()).toBe(T0.valueOf() + 5_000);

      vi.setSystemTime(dueAtMs(model, card!) + 30_000);
      rerenderApp(model);
      const secondClick = new Date();
      rateCurrentReviewCard('Good');
      const events = model.store.listReviewEventsForCard(card!).map(e => e.reviewedAt).sort();
      expect(events).toEqual([firstClick.toISOString(), secondClick.toISOString()]);
      expect(Date.parse(events[1]!)).toBeGreaterThan(Date.parse(events[0]!));
    });
    expect(networkAttempts).toEqual([]);
  });

  it('presents a learning card in the open Review view when it becomes due, without reload', async () => {
    const { networkAttempts } = await withNoNetwork(async () => {
      const { model, cardIds: [card] } = await modelWithCards(1);
      setView(model, 'review');
      rerenderApp(model);
      rateCurrentReviewCard('Again');
      const due = dueAtMs(model, card!);
      expect(due).toBeGreaterThan(Date.now());
      expect(document.querySelector('.review-prompt')).toBeNull();
      expect(document.querySelector('.empty-state')).not.toBeNull();

      vi.advanceTimersByTime(due - Date.now() - 1);
      expect(Date.now()).toBe(due - 1);
      expect(document.querySelector('.review-prompt')).toBeNull();

      vi.advanceTimersByTime(1);
      expect(Date.now()).toBe(due);
      expect(document.querySelector('.empty-state')).toBeNull();
      expect(document.querySelector('.review-prompt')?.textContent).toBe(model.store.getReviewCard(card!)!.promptTemplate);
      const learningCount = Array.from(document.querySelectorAll('.bucket-chip'))
        .find(chip => chip.querySelector('.bucket-label')?.textContent === 'Learning')
        ?.querySelector('.bucket-count')?.textContent;
      expect(learningCount).toBe('1');
    });
    expect(networkAttempts).toEqual([]);
  });

  it('stamps practice attempts at submission time and resurfaces the card in open Practice', async () => {
    const { networkAttempts } = await withNoNetwork(async () => {
      const { model, cardIds: [card] } = await modelWithCards(1);
      setView(model, 'practice');
      vi.advanceTimersByTime(7_000);
      rerenderApp(model);
      const firstSubmit = new Date();
      failCurrentPracticeCard();
      const attempts = model.store.listPracticeAttemptsForCard(card!);
      expect(attempts.map(a => a.reviewedAt)).toEqual([firstSubmit.toISOString()]);
      const due = dueAtMs(model, card!);
      expect(due).toBeGreaterThan(Date.now());
      expect(document.querySelector('.practice-prompt')).toBeNull();

      vi.advanceTimersByTime(due - Date.now());
      expect(document.querySelector('.practice-prompt')?.textContent).toBe(model.store.getReviewCard(card!)!.promptTemplate);
      vi.advanceTimersByTime(2_000);
      const secondSubmit = new Date();
      failCurrentPracticeCard();
      const stamps = model.store.listPracticeAttemptsForCard(card!).map(a => a.reviewedAt).sort();
      expect(stamps).toEqual([firstSubmit.toISOString(), secondSubmit.toISOString()]);
    });
    expect(networkAttempts).toEqual([]);
  });

  it('keeps selection, buckets, due counts and the backend queue in agreement across the due boundary', async () => {
    const { model, cardIds: [card] } = await modelWithCards(1);
    const state = model.store.getReviewCardState(card!)!;
    const due = Date.parse('2030-03-05T00:00:00.000Z');
    model.store.putReviewCardState({ ...state, state: 'learning', dueAt: new Date(due).toISOString() });
    let now = due - 1;
    model.clock = () => new Date(now);
    const agree = (expected: number) => {
      const asOf = model.clock();
      expect(model.reviewService.listDueCards(asOf)).toHaveLength(expected);
      expect(listReviewBuckets(model, asOf).learning).toHaveLength(expected);
      expect(learnerProgress(model, asOf).dueCards).toBe(expected);
      expect(pickNextDueCard(model, asOf)?.card.id ?? null).toBe(expected ? card : null);
      for (const view of ['review', 'practice'] as const) {
        setView(model, view);
        rerenderApp(model);
        expect(document.querySelector(`.${view}-prompt`) !== null).toBe(expected === 1);
      }
    };
    agree(0);
    now = due;
    agree(1);
    now = due + 1;
    agree(1);
  });

  it('grades the practice card that was displayed even if a higher-priority card becomes due before submit', async () => {
    const { model, cardIds: [shown, later] } = await modelWithCards(2);
    const shownState = model.store.getReviewCardState(shown!)!;
    model.store.putReviewCardState({ ...shownState, state: 'review', scheduledDays: 3, dueAt: new Date(T0.valueOf() - 60_000).toISOString() });
    const laterState = model.store.getReviewCardState(later!)!;
    model.store.putReviewCardState({ ...laterState, state: 'learning', dueAt: new Date(T0.valueOf() + 5_000).toISOString() });
    setView(model, 'practice');
    rerenderApp(model);
    expect(document.querySelector('.practice-prompt')?.textContent).toBe(model.store.getReviewCard(shown!)!.promptTemplate);
    vi.setSystemTime(T0.valueOf() + 10_000);
    button('Skip').click();
    expect(model.store.listPracticeAttemptsForCard(shown!)).toHaveLength(1);
    expect(model.store.listPracticeAttemptsForCard(later!)).toHaveLength(0);
  });

  it('does not wake-rerender the Player view (keeps the video element) when a card becomes due', async () => {
    const { model, cardIds: [card] } = await modelWithCards(1);
    setView(model, 'review');
    rerenderApp(model);
    rateCurrentReviewCard('Again');
    setView(model, 'player');
    rerenderApp(model);
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    vi.advanceTimersByTime(dueAtMs(model, card!) - Date.now() + 1);
    expect(document.querySelector('video')).toBe(video);
  });
});
