import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppModel, importFixtureMediaAndSubtitles, saveSentenceFromCue, createReviewCardForSavedItem, learnerProgress, listReviewBuckets, pickNextDueCard, setReviewBucketAsOf, setView } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { withNoNetwork } from '../no-network/networkTrap';

const asOf = new Date('2030-01-02T12:00:00.000Z');

async function fixture(dueAt = '2030-01-01T12:00:00.000Z', state: 'new' | 'learning' | 'review' | 'relearning' = 'review') {
  const model = createAppModel();
  await importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
  const item = await saveSentenceFromCue(model, model.cues[0]!);
  if (!item) throw new Error('Missing synthetic saved item');
  const occurrence = model.savedOccurrenceService.listOccurrencesForItem(item.id)[0]!;
  const card = createReviewCardForSavedItem(model, item, occurrence);
  const original = model.store.getReviewCardState(card.id)!;
  model.store.putReviewCardState({ ...original, state, scheduledDays: 30, dueAt });
  setReviewBucketAsOf(model, asOf);
  return { model, card };
}

describe('mature cards remain scheduled, not retired', () => {
  let dom: JSDOM;
  beforeEach(() => {
    dom = new JSDOM('<main id="app"></main>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
    Object.assign(globalThis, { document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0, CSS: { escape: (s: string) => s } });
  });
  afterEach(() => dom.window.close());

  it('agrees with the backend due queue for an overdue 30-day card and counts it once', async () => {
    const { value: { model, card }, networkAttempts } = await withNoNetwork(() => fixture());
    expect(networkAttempts).toEqual([]);
    expect(model.reviewService.listDueCards(asOf).map(x => x.card.id)).toEqual([card.id]);
    expect(model.reviewService.listBuckets(asOf).review).toHaveLength(1);
    expect(listReviewBuckets(model, asOf).mastered).toHaveLength(1);
    expect(pickNextDueCard(model, asOf)?.card.id).toBe(card.id);
    expect(learnerProgress(model, asOf).dueCards).toBe(1);
  });

  it.each(['review', 'practice'] as const)('automatically presents an overdue mature card in %s without selecting Mastered', async view => {
    const { networkAttempts } = await withNoNetwork(async () => {
      const { model, card } = await fixture();
      expect(model.review.activeCardId).toBeNull();
      setView(model, view);
      rerenderApp(model);
      // lt-0g9: Practice no longer echoes the answer-leaking promptTemplate; both views present this card.
      if (view === 'review') expect(document.querySelector(`.${view}-prompt`)?.textContent).toBe(card.promptTemplate);
      else expect(document.querySelector(`.${view}-prompt`)).not.toBeNull();
      expect(model.review.activeCardId).toBe(card.id);
      expect(document.querySelector('.empty-state')).toBeNull();
    });
    expect(networkAttempts).toEqual([]);
  });

  it('keeps a future mature card out of selection, counts and both views', async () => {
    const { networkAttempts } = await withNoNetwork(async () => {
      const { model } = await fixture('2030-01-03T12:00:00.000Z');
      expect(model.reviewService.listDueCards(asOf)).toEqual([]);
      expect(listReviewBuckets(model, asOf).mastered).toEqual([]);
      expect(pickNextDueCard(model, asOf)).toBeNull();
      expect(learnerProgress(model, asOf).dueCards).toBe(0);
      for (const view of ['review', 'practice'] as const) {
        setView(model, view);
        rerenderApp(model);
        expect(document.querySelector(`.${view}-prompt`)).toBeNull();
        expect(document.querySelector('.empty-state')?.textContent).toContain('No cards due right now.');
        expect(document.body.textContent).not.toContain('Mastered cards are hidden');
      }
    });
    expect(networkAttempts).toEqual([]);
  });

  it.each(['new', 'learning', 'review', 'relearning'] as const)('counts a mature %s card exactly once at its due instant', async state => {
    const { value: { model, card } } = await withNoNetwork(() => fixture(asOf.toISOString(), state));
    expect(pickNextDueCard(model, asOf)?.card.id).toBe(card.id);
    expect(learnerProgress(model, asOf).dueCards).toBe(1);
    const buckets = listReviewBuckets(model, asOf);
    expect(Object.values(buckets).flat().map(x => x.card.id)).toEqual([card.id]);
  });

  it('preserves FSRS priority and earliest-due ordering across presentation labels', async () => {
    const { value: { model, card } } = await withNoNetwork(() => fixture());
    const item = model.store.getSavedItem(card.savedItemId)!;
    const occurrence = model.store.getSavedOccurrence(card.savedOccurrenceId)!;
    const ordinary = createReviewCardForSavedItem(model, item, occurrence, 'production');
    const initial = model.store.getReviewCardState(ordinary.id)!;
    model.store.putReviewCardState({ ...initial, state: 'review', scheduledDays: 2, dueAt: '2030-01-02T11:00:00.000Z' });
    expect(learnerProgress(model, asOf).dueCards).toBe(2);
    expect(pickNextDueCard(model, asOf)?.card.id).toBe(card.id);
    model.store.putReviewCardState({ ...initial, state: 'learning', scheduledDays: 2, dueAt: '2030-01-02T11:00:00.000Z' });
    expect(pickNextDueCard(model, asOf)?.card.id).toBe(ordinary.id);
    expect(model.store.listReviewEventsForCard(card.id)).toEqual([]);
    expect(model.store.getReviewCardState(card.id)?.scheduledDays).toBe(30);
  });

  it.each(['suspendedAt', 'deletedAt'] as const)('does not resurrect a mature card with %s', async field => {
    const { value: { model, card } } = await withNoNetwork(() => fixture());
    model.store.putReviewCard({ ...card, [field]: asOf.toISOString() });
    expect(pickNextDueCard(model, asOf)).toBeNull();
    expect(learnerProgress(model, asOf).dueCards).toBe(0);
  });
});
