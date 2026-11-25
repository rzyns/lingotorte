import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeSubtitleTrack, type PracticeResult, type Rating } from '../../packages/domain/src';
import { LocalStore, SavedOccurrenceService } from '../../packages/storage/src';
import { PracticeService, ReviewService, defaultFsrsConfig, type FsrsSchedulerConfig } from '../../packages/review/src';

const DIGEST = `sha256:${'a'.repeat(64)}` as const;
const AT = '2026-11-25T01:00:00.000Z';

afterEach(() => vi.useRealTimers());

function seedCard(config: FsrsSchedulerConfig) {
  const store = new LocalStore();
  const reviewService = new ReviewService(store, config);
  const practiceService = new PracticeService(store, reviewService);
  const sourceContext = {
    mediaId: 'media',
    mediaPath: '/synthetic/media.webm',
    mediaFingerprint: DIGEST,
    subtitleTrackId: 'track',
    cueId: 'cue',
    timeRangeMs: { start: 0, end: 1000 },
    tokenSpan: { startToken: 0, endToken: 1 },
    charSpan: { start: 0, end: 5 },
  };
  store.putSubtitleTrack({
    ...makeSubtitleTrack({
      mediaId: 'media',
      language: 'pl',
      role: 'target',
      format: 'srt',
      sourceKind: 'synthetic',
      sourcePath: '/synthetic/track.srt',
      contentSha256: DIGEST,
      isActive: true,
    }),
    id: 'track',
  });
  const saved = new SavedOccurrenceService(store).saveSelection({
    kind: 'lexeme',
    language: 'pl',
    displayText: 'cześć',
    mediaId: 'media',
    cueId: 'cue',
    startMs: 0,
    endMs: 1000,
    sourceContext,
  });
  const { card } = reviewService.createCard({
    savedItem: saved.item,
    savedOccurrence: saved.occurrence,
    cardType: 'recognition',
  });
  return { store, reviewService, practiceService, card, sourceContext };
}

describe('lt-5lb.8 PracticeService & ReviewService unification', () => {
  it('refuses mismatched stores at construction', () => {
    const storeA = new LocalStore();
    const storeB = new LocalStore();
    expect(() => new PracticeService(storeA, new ReviewService(storeB, defaultFsrsConfig()))).toThrow(/same LocalStore/);
  });

  it.each<[PracticeResult, Rating]>([
    ['pass', 'good'],
    ['pass-with-hesitation', 'hard'],
    ['fail', 'again'],
  ])('routes %s through injected ReviewService config identically to direct submitReview (%s)', (resultKind, expectedRating) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(AT));

    const customConfig: FsrsSchedulerConfig = {
      ...defaultFsrsConfig(),
      requestRetention: 0.75,
      maximumIntervalDays: 90,
      enableFuzz: false,
      learningSteps: ['2m', '12m'],
    };
    const practiceSide = seedCard(customConfig);
    const reviewSide = seedCard(customConfig);
    const defaultSide = seedCard(defaultFsrsConfig());
    const initialBefore = practiceSide.store.getReviewCardState(practiceSide.card.id)!;

    const practiceResult = practiceSide.practiceService.submitAttempt({
      cardId: practiceSide.card.id,
      mode: 'typed-input',
      result: resultKind,
      givenAnswer: 'cześć',
      expectedAnswer: 'cześć',
      responseMs: 650,
      sourceContext: practiceSide.sourceContext,
      reviewedAt: AT,
    });
    const directResult = reviewSide.reviewService.submitReview(
      reviewSide.card.id,
      expectedRating,
      new Date(AT),
      650,
    );
    const defaultDirectResult = defaultSide.reviewService.submitReview(
      defaultSide.card.id,
      expectedRating,
      new Date(AT),
      650,
    );

    const practiceNextState = practiceSide.store.getReviewCardState(practiceSide.card.id)!;
    const practiceEvents = practiceSide.store.listReviewEventsForCard(practiceSide.card.id);
    const directEvents = reviewSide.store.listReviewEventsForCard(reviewSide.card.id);

    expect(practiceEvents).toHaveLength(1);
    expect(directEvents).toHaveLength(1);
    expect(practiceResult.reviewEventId).toBe(practiceEvents[0]!.id);
    expect(practiceResult.attempt.eventLink.reviewEventId).toBe(practiceEvents[0]!.id);
    expect(directResult.reviewEventId).toBe(directEvents[0]!.id);

    const { cardId: _pCardId, ...pStateFields } = practiceNextState;
    const { cardId: _dCardId, ...dStateFields } = directResult.state;
    expect(pStateFields).toEqual(dStateFields);
    expect(practiceNextState.dueAt).not.toBe(defaultDirectResult.state.dueAt);

    expect(JSON.parse(practiceEvents[0]!.previousStateJson)).toEqual(initialBefore);
    expect(JSON.parse(practiceEvents[0]!.nextStateJson)).toEqual(practiceNextState);
    expect(practiceEvents[0]!.rating).toBe(expectedRating);
    expect(practiceEvents[0]!.responseMs).toBe(650);
    expect(practiceEvents[0]!.reviewedAt).toBe(AT);
  });

  it.each([
    { result: 'skipped' as const, updateFsrs: undefined },
    { result: 'abandoned' as const, updateFsrs: undefined },
    { result: 'pass' as const, updateFsrs: false },
  ])('records non-rating / updateFsrs:false attempt ($result, updateFsrs=$updateFsrs) without review event or state change', ({ result, updateFsrs }) => {
    const { store, practiceService, card, sourceContext } = seedCard({ ...defaultFsrsConfig(), requestRetention: 0.75, maximumIntervalDays: 90, enableFuzz: false });
    const stateBefore = store.getReviewCardState(card.id)!;

    const reply = practiceService.submitAttempt({
      cardId: card.id,
      mode: 'multiple-choice',
      result,
      sourceContext,
      reviewedAt: AT,
      ...(updateFsrs !== undefined ? { updateFsrs } : {}),
    });

    expect(reply.reviewEventId).toBeUndefined();
    expect('reviewEventId' in reply).toBe(false);
    expect(reply.attempt.eventLink).toEqual({});
    expect(store.listReviewEventsForCard(card.id)).toHaveLength(0);
    expect(store.getReviewCardState(card.id)).toEqual(stateBefore);
    expect(store.listPracticeAttemptsForCard(card.id)).toHaveLength(1);
  });

  it('refuses missing card or missing state even when skipped or updateFsrs is false', () => {
    const { store, practiceService, card, sourceContext } = seedCard(defaultFsrsConfig());
    expect(() =>
      practiceService.submitAttempt({
        cardId: '00000000-0000-4000-8000-000000000999',
        mode: 'typed-input',
        result: 'skipped',
        sourceContext,
        reviewedAt: AT,
      }),
    ).toThrow(/not found/);
    expect(store.listPracticeAttempts()).toHaveLength(0);

    store.removeReviewCardState(card.id);
    expect(() =>
      practiceService.submitAttempt({
        cardId: card.id,
        mode: 'typed-input',
        result: 'pass',
        updateFsrs: false,
        sourceContext,
        reviewedAt: AT,
      }),
    ).toThrow(/has no state/);
    expect(store.listPracticeAttempts()).toHaveLength(0);
  });
});
