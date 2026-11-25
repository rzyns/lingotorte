import {
  makePracticeAttempt,
  type PracticeAttempt,
  type PracticeMode,
  type PracticeResult,
  type Rating,
  type SavedOccurrenceSourceContext,
  type UUID,
} from '@lingotorte/domain';
import type { LocalStore } from '@lingotorte/storage';
import type { ReviewService } from './reviewService.ts';

export type SubmitPracticeAttemptInput = Readonly<{
  cardId: UUID;
  mode: PracticeMode;
  result: PracticeResult;
  givenAnswer?: string;
  expectedAnswer?: string;
  responseMs?: number;
  sourceContext: SavedOccurrenceSourceContext;
  reviewedAt: string;
  updateFsrs?: boolean;
}>;

export type PracticeAttemptWithEvent = Readonly<{
  attempt: PracticeAttempt;
  reviewEventId?: UUID;
}>;

const PRACTICE_RESULT_RATINGS: Readonly<Record<PracticeResult, Rating | undefined>> = {
  pass: 'good',
  'pass-with-hesitation': 'hard',
  fail: 'again',
  skipped: undefined,
  abandoned: undefined,
};

export class PracticeService {
  private readonly store: LocalStore;
  private readonly reviewService: ReviewService;

  constructor(store: LocalStore, reviewService: ReviewService) {
    if (!reviewService.usesStore(store)) {
      throw new TypeError('PracticeService and ReviewService must share the same LocalStore');
    }
    this.store = store;
    this.reviewService = reviewService;
  }

  submitAttempt(input: SubmitPracticeAttemptInput): PracticeAttemptWithEvent {
    const card = this.store.getReviewCard(input.cardId);
    if (card === undefined) {
      throw new TypeError(`Review card ${input.cardId} not found`);
    }
    const state = this.store.getReviewCardState(input.cardId);
    if (state === undefined) {
      throw new TypeError(`Review card ${input.cardId} has no state`);
    }

    let reviewEventId: UUID | undefined;
    if (input.updateFsrs !== false) {
      const rating = PRACTICE_RESULT_RATINGS[input.result];
      if (rating !== undefined) {
        reviewEventId = this.reviewService.submitReview(
          input.cardId,
          rating,
          new Date(input.reviewedAt),
          input.responseMs,
        ).reviewEventId;
      }
    }

    const attempt = makePracticeAttempt({
      cardId: input.cardId,
      mode: input.mode,
      result: input.result,
      sourceContext: input.sourceContext,
      reviewedAt: input.reviewedAt,
      ...(input.givenAnswer !== undefined ? { givenAnswer: input.givenAnswer } : {}),
      ...(input.expectedAnswer !== undefined ? { expectedAnswer: input.expectedAnswer } : {}),
      ...(input.responseMs !== undefined ? { responseMs: input.responseMs } : {}),
      ...(reviewEventId !== undefined ? { eventLink: { reviewEventId } } : {}),
    });
    this.store.addPracticeAttempt(attempt);

    return {
      attempt,
      ...(reviewEventId !== undefined ? { reviewEventId } : {}),
    };
  }
}
