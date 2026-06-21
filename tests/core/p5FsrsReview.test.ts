import { describe, expect, it } from 'vitest';
import { LocalStore, SavedOccurrenceService } from '../../packages/storage/src';
import { makeMediaAsset, validateSavedOccurrenceSourceContext } from '../../packages/domain/src';
import { sha256File } from '../../packages/storage/src/mediaHelpers';
import { parseSrt } from '../../packages/subtitles/src/import';
import { ReviewService, recomputeStateFromEvents, defaultFsrsConfig, ReviewScheduler } from '../../packages/review/src';

const fixtureMediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';

async function setupFixtureStore() {
  const store = new LocalStore();
  const savedService = new SavedOccurrenceService(store);
  const reviewService = new ReviewService(store, defaultFsrsConfig());
  const mediaSha256 = await sha256File(fixtureMediaPath);
  const asset = makeMediaAsset({
    title: 'Synthetic Polish Dialogue',
    originalPath: fixtureMediaPath,
    contentSha256: mediaSha256,
    durationMs: 2000,
    container: 'webm',
    sizeBytes: 1024,
    privacyLabel: 'synthetic',
  });
  store.putMediaAsset(asset);
  const parsed = await parseSrt(targetSrtPath, asset.id, 'pl', 'target');
  store.putSubtitleTrack(parsed.track);
  for (const cue of parsed.cues) {
    store.putCue(cue);
  }
  return { store, savedService, reviewService, asset, track: parsed.track, cues: parsed.cues };
}

function sourceContextForCue(
  asset: Awaited<ReturnType<typeof setupFixtureStore>>['asset'],
  track: Awaited<ReturnType<typeof setupFixtureStore>>['track'],
  cue: Awaited<ReturnType<typeof setupFixtureStore>>['cues'][number],
  tokenStart: number,
  tokenEnd: number,
  charStart: number,
  charEnd: number,
) {
  return validateSavedOccurrenceSourceContext({
    mediaId: asset.id,
    mediaPath: asset.originalPath,
    mediaFingerprint: asset.contentSha256,
    subtitleTrackId: track.id,
    cueId: cue.id,
    timeRangeMs: { start: cue.startMs, end: cue.endMs },
    tokenSpan: { startToken: tokenStart, endToken: tokenEnd },
    charSpan: { start: charStart, end: charEnd },
  });
}

function dueAsOf(reviewService: ReviewService, cardId: string): Date {
  const state = reviewService['store'].getReviewCardState(cardId);
  if (!state) throw new Error(`Expected review state for card ${cardId}`);
  return new Date(new Date(state.dueAt).valueOf() + 1);
}

describe('P5 FSRS review core', () => {
  it('creates a new review card in new state with current due timestamp', async () => {
    const { savedService, reviewService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    const { card, state } = reviewService.createCard({
      savedItem: saved.item,
      savedOccurrence: saved.occurrence,
      cardType: 'recognition',
    });
    expect(card.savedItemId).toBe(saved.item.id);
    expect(card.savedOccurrenceId).toBe(saved.occurrence.id);
    expect(state.state).toBe('new');
    expect(state.reps).toBe(0);
    expect(state.lapses).toBe(0);
    expect(state.fsrsVersion).toBe('5.4.0');
  });

  it('appends an Again review event and transitions to learning', async () => {
    const { savedService, reviewService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    const { card, state: initialState } = reviewService.createCard({
      savedItem: saved.item,
      savedOccurrence: saved.occurrence,
      cardType: 'recognition',
    });

    const reviewedAt = new Date(Date.parse(initialState.dueAt) + 1000);
    const result = reviewService.submitReview(card.id, 'again', reviewedAt, 1234);

    expect(result.state.state).toBe('learning');
    expect(result.state.reps).toBe(1);
    const events = result.card.id ? reviewService['store'].listReviewEventsForCard(card.id) : [];
    expect(events).toHaveLength(1);
    expect(events[0]!.rating).toBe('again');
    expect(events[0]!.responseMs).toBe(1234);
  });

  it('appends all four ratings deterministically with fixed clock', async () => {
    const { savedService, reviewService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    const { card } = reviewService.createCard({
      savedItem: saved.item,
      savedOccurrence: saved.occurrence,
      cardType: 'recognition',
    });

    const t0 = new Date('2026-06-21T12:00:00.000Z');
    const afterAgain = reviewService.submitReview(card.id, 'again', t0).state;
    const afterHard = reviewService.submitReview(card.id, 'hard', new Date(t0.valueOf() + 60_000)).state;
    const afterGood = reviewService.submitReview(card.id, 'good', new Date(t0.valueOf() + 120_000)).state;
    const afterEasy = reviewService.submitReview(card.id, 'easy', new Date(t0.valueOf() + 180_000)).state;

    expect(afterAgain.state).toBe('learning');
    expect(afterHard.state).toBe('learning');
    expect(afterGood.state).toBe('learning');
    expect(afterEasy.state).toBe('review');
    expect(reviewService['store'].listReviewEventsForCard(card.id)).toHaveLength(4);
  });

  it('recomputes state identically from events', async () => {
    const { savedService, reviewService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    const { card } = reviewService.createCard({
      savedItem: saved.item,
      savedOccurrence: saved.occurrence,
      cardType: 'recognition',
    });

    const t0 = new Date('2026-06-21T12:00:00.000Z');
    reviewService.submitReview(card.id, 'good', t0);
    reviewService.submitReview(card.id, 'good', new Date(t0.valueOf() + 86_400_000));

    const storedState = reviewService['store'].getReviewCardState(card.id);
    const recomputed = reviewService.recomputeCardState(card.id);
    expect(recomputed.state).toBe(storedState!.state);
    expect(recomputed.dueAt).toBe(storedState!.dueAt);
    expect(recomputed.stability).toBe(storedState!.stability);
    expect(recomputed.reps).toBe(storedState!.reps);
  });

  it('preview returns deterministic next states for each rating', () => {
    const scheduler = new ReviewScheduler(defaultFsrsConfig());
    const state = scheduler.createInitialState('card-preview-1');
    const now = new Date('2026-06-21T12:00:00.000Z');
    const preview = scheduler.preview('card-preview-1', state, now);
    expect(preview.again).toBeDefined();
    expect(preview.hard).toBeDefined();
    expect(preview.good).toBeDefined();
    expect(preview.easy).toBeDefined();
    expect(new Date(preview.good!.dueAt).valueOf()).toBeGreaterThan(now.valueOf());
  });

  it('lists due buckets deterministically by local time', async () => {
    const { savedService, reviewService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    const { card } = reviewService.createCard({
      savedItem: saved.item,
      savedOccurrence: saved.occurrence,
      cardType: 'recognition',
    });

    const now = dueAsOf(reviewService, card.id);
    const bucketsBefore = reviewService.listBuckets(now);
    expect(bucketsBefore.newCards).toHaveLength(1);
    expect(bucketsBefore.learning).toHaveLength(0);
    expect(bucketsBefore.review).toHaveLength(0);

    reviewService.submitReview(card.id, 'good', now);
    const bucketsAfterImmediate = reviewService.listBuckets(now);
    expect(bucketsAfterImmediate.newCards).toHaveLength(0);
    expect(bucketsAfterImmediate.learning).toHaveLength(0);

    const bucketsAfterWindow = reviewService.listBuckets(new Date(now.valueOf() + 11 * 60_000));
    expect(bucketsAfterWindow.learning).toHaveLength(1);
  });

  it('ignores suspended cards in due queries', async () => {
    const { savedService, reviewService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    const { card } = reviewService.createCard({
      savedItem: saved.item,
      savedOccurrence: saved.occurrence,
      cardType: 'recognition',
    });

    const now = dueAsOf(reviewService, card.id);
    expect(reviewService.listDueCards(now)).toHaveLength(1);

    // Directly mutate store snapshot to suspend card; this is a test-only shortcut.
    const store = reviewService['store'] as LocalStore;
    const suspendedCard = { ...card, suspendedAt: now.toISOString() };
    store.putReviewCard(suspendedCard);
    expect(reviewService.listDueCards(now)).toHaveLength(0);
  });

  it('recomputeStateFromEvents produces the same final state as live reviews', () => {
    const scheduler = new ReviewScheduler(defaultFsrsConfig());
    const cardId = 'recompute-card-1';
    const t0 = new Date('2026-06-21T12:00:00.000Z');
    let state = scheduler.createInitialState(cardId);
    state = scheduler.applyRating(cardId, state, 'good', t0).nextState;
    state = scheduler.applyRating(cardId, state, 'again', new Date(t0.valueOf() + 600_000)).nextState;
    state = scheduler.applyRating(cardId, state, 'good', new Date(t0.valueOf() + 606_000)).nextState;

    const recomputed = recomputeStateFromEvents(cardId, [
      { reviewedAt: t0.toISOString(), rating: 'good' },
      { reviewedAt: new Date(t0.valueOf() + 600_000).toISOString(), rating: 'again' },
      { reviewedAt: new Date(t0.valueOf() + 606_000).toISOString(), rating: 'good' },
    ]);

    expect(recomputed.state).toBe(state.state);
    expect(recomputed.dueAt).toBe(state.dueAt);
    expect(recomputed.stability).toBe(state.stability);
    expect(recomputed.reps).toBe(state.reps);
    expect(recomputed.lapses).toBe(state.lapses);
  });
});
