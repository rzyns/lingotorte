import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createAppModel,
  importFixtureMediaAndSubtitles,
  saveSentenceFromCue,
  createReviewCardForSavedItem,
  listReviewBuckets,
  submitReviewRating,
  setReviewBucketAsOf,
  setView,
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

describe('P5 frontend review buckets and video-backed FSRS prompts', () => {
  let dom: Awaited<ReturnType<typeof setupDom>>;

  beforeEach(async () => {
    dom = await setupDom();
  });

  afterEach(() => {
    dom.window.close();
  });

  function renderReview(m: ReturnType<typeof createAppModel>) {
    setView(m, 'review');
    rerenderApp(m);
  }

  function dueAsOf(m: ReturnType<typeof createAppModel>, ...cardIds: string[]): Date {
    const maxDueAt = Math.max(
      ...cardIds.map((cardId) => {
        const state = m.store.getReviewCardState(cardId);
        if (!state) throw new Error(`Expected review state for card ${cardId}`);
        return new Date(state.dueAt).valueOf();
      }),
    );
    return new Date(maxDueAt + 1);
  }

  async function createDueCard() {
    return await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      const firstCue = m.cues[0]!;
      const item = await saveSentenceFromCue(m, firstCue);
      if (!item) throw new Error('Expected saved item');
      const occurrence = m.savedOccurrenceService.listOccurrencesForItem(item.id)[0];
      if (!occurrence) throw new Error('Expected saved occurrence');
      const card = createReviewCardForSavedItem(m, item, occurrence, 'recognition');
      return { model: m, card, item, occurrence, firstCue };
    });
  }

  it('renders review bucket counts including new and mastered with fixed clock', async () => {
    const { value: { model, card } } = await createDueCard();
    const asOf = dueAsOf(model, card.id);
    setReviewBucketAsOf(model, asOf);
    renderReview(model);
    const app = document.getElementById('app');
    expect(app?.textContent).toContain('New');
    expect(app?.textContent).toContain('Learning');
    expect(app?.textContent).toContain('Review');
    expect(app?.textContent).toContain('Relearning');
    expect(app?.textContent).toContain('Mastered');
    expect(app?.textContent).toContain('1'); // new count
  });

  it('presents a due card in the review view and shows the source cue context when revealed', async () => {
    const { value: { model, card } } = await createDueCard();
    const asOf = dueAsOf(model, card.id);
    setReviewBucketAsOf(model, asOf);
    renderReview(model);

    const revealBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Show answer'));
    expect(revealBtn).toBeTruthy();
    revealBtn?.click();
    renderReview(model);

    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('Cześć, to jest lokalny test.');
    expect(app.textContent).toContain(mediaPath);
    expect(app.textContent).toContain('Source:');
    expect(app.textContent).toMatch(/due: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/);
    expect(app.textContent).not.toMatch(/due: \d{4,}:/);
    expect(app.textContent).toContain('Hello, this is a local test.');
  });

  it('wires rating controls to append review events and update projected schedule state', async () => {
    const { value: { model, card } } = await createDueCard();
    const asOf = dueAsOf(model, card.id);
    setReviewBucketAsOf(model, asOf);
    renderReview(model);

    const revealBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Show answer'));
    revealBtn?.click();
    renderReview(model);

    const goodBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Good');
    expect(goodBtn).toBeTruthy();
    goodBtn?.click();
    renderReview(model);

    const events = model.store.listReviewEventsForCard(card.id);
    expect(events).toHaveLength(1);
    expect(events[0]!.rating).toBe('good');

    const state = model.store.getReviewCardState(card.id);
    expect(state?.reps).toBe(1);
    expect(state?.state).not.toBe('new');
  });

  it('does not mutate saved occurrence sourceContext when reviewing', async () => {
    const { value: { model, card, occurrence } } = await createDueCard();
    const originalMediaPath = occurrence.sourceContext.mediaPath;
    const originalCueId = occurrence.sourceContext.cueId;
    const originalCharSpan = { ...occurrence.sourceContext.charSpan };
    const originalTokenSpan = { ...occurrence.sourceContext.tokenSpan };

    const asOf = dueAsOf(model, card.id);
    setReviewBucketAsOf(model, asOf);
    renderReview(model);

    const revealBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Show answer'));
    revealBtn?.click();
    renderReview(model);

    const againBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Again');
    againBtn?.click();

    const reloaded = model.store.getSavedOccurrence(occurrence.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.sourceContext.mediaPath).toBe(originalMediaPath);
    expect(reloaded!.sourceContext.cueId).toBe(originalCueId);
    expect(reloaded!.sourceContext.charSpan).toEqual(originalCharSpan);
    expect(reloaded!.sourceContext.tokenSpan).toEqual(originalTokenSpan);
  });

  it('advances to the next due card after a rating and hides mastered cards by default', async () => {
    const { value: { model, card, firstCue } } = await createDueCard();
    const secondCue = model.cues[1];
    if (!secondCue) throw new Error('This test needs at least two cues');
    const secondItem = await saveSentenceFromCue(model, secondCue);
    if (!secondItem) throw new Error('Expected second saved item');
    const secondOccurrence = model.savedOccurrenceService.listOccurrencesForItem(secondItem.id)[0];
    if (!secondOccurrence) throw new Error('Expected second occurrence');
    const secondCard = createReviewCardForSavedItem(model, secondItem, secondOccurrence, 'recognition');

    const asOf = dueAsOf(model, card.id, secondCard.id);
    setReviewBucketAsOf(model, asOf);
    renderReview(model);

    const revealBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Show answer'));
    revealBtn?.click();
    renderReview(model);

    const goodBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Good');
    goodBtn?.click();
    renderReview(model);

    const app = document.getElementById('app')!;
    expect(app.textContent).toContain(secondCue.text);
    expect(app.textContent).not.toContain(firstCue.text);
  });

  it('uses backend due queue projection and does not invent hidden FSRS state', async () => {
    const { value: { model, card } } = await createDueCard();
    const asOf = dueAsOf(model, card.id);
    setReviewBucketAsOf(model, asOf);

    const buckets = listReviewBuckets(model, asOf);
    expect(buckets.newCards).toHaveLength(1);
    expect(buckets.learning).toHaveLength(0);
    expect(buckets.review).toHaveLength(0);
    expect(buckets.mastered).toHaveLength(0);

    submitReviewRating(model, card.id, 'good', asOf);
    const after = listReviewBuckets(model, asOf);
    expect(after.newCards).toHaveLength(0);
  });

  it('video replay button jumps back to the source cue in the player view', async () => {
    const { value: { model, card, firstCue } } = await createDueCard();
    const asOf = dueAsOf(model, card.id);
    setReviewBucketAsOf(model, asOf);
    renderReview(model);

    const revealBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Show answer'));
    revealBtn?.click();
    renderReview(model);

    const replayBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Replay source cue'));
    expect(replayBtn).toBeTruthy();
    replayBtn?.click();

    expect(model.view).toBe('player');
    expect(model.player.activeCueId).toBe(firstCue.id);
    expect(model.player.currentTimeMs).toBe(firstCue.startMs);
  });

  it('has zero network activity in the review flow with providers disabled', async () => {
    const { networkAttempts } = await withNoNetwork(async () => {
      const { model, card } = await createDueCard().then((r) => r.value);
      const asOf = dueAsOf(model, card.id);
      setReviewBucketAsOf(model, asOf);
      renderReview(model);
      submitReviewRating(model, card.id, 'easy', asOf);
      return { model, card };
    });
    expect(networkAttempts).toHaveLength(0);
  });
});
