import { ReviewScheduler, defaultFsrsConfig } from '@lingotorte/review';
import {
  makePracticeAttempt,
  makeReviewEvent,
  type PracticeAttempt,
  type PracticeMode,
  type PracticeResult,
  type Rating,
  type SavedOccurrenceSourceContext,
  type UUID,
} from '@lingotorte/domain';
import type { LocalStore } from './localStore';

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

function resultToRating(result: PracticeResult): Rating | undefined {
  switch (result) {
    case 'pass':
      return 'good';
    case 'pass-with-hesitation':
      return 'hard';
    case 'fail':
      return 'again';
    case 'skipped':
    case 'abandoned':
      return undefined;
    default:
      return undefined;
  }
}

function applyFsrsUpdate(
  store: LocalStore,
  cardId: UUID,
  state: import('@lingotorte/domain').ReviewCardState,
  rating: Rating,
  reviewedAtDate: Date,
  responseMs: number | undefined,
): UUID {
  const previousState = state;
  const scheduler = new ReviewScheduler(defaultFsrsConfig());
  const { nextState } = scheduler.applyRating(cardId, previousState, rating, reviewedAtDate);
  const event = makeReviewEvent({
    cardId,
    reviewedAt: reviewedAtDate.toISOString(),
    rating,
    previousStateJson: JSON.stringify(previousState),
    nextStateJson: JSON.stringify(nextState),
    ...(responseMs !== undefined ? { responseMs } : {}),
  });
  store.putReviewCardState(nextState);
  store.addReviewEvent(event);
  return event.id;
}

export class PracticeService {
  constructor(private readonly store: LocalStore) {}

  submitAttempt(input: SubmitPracticeAttemptInput): PracticeAttemptWithEvent {
    const card = this.store.getReviewCard(input.cardId);
    if (card === undefined) {
      throw new TypeError(`Review card ${input.cardId} not found`);
    }
    const state = this.store.getReviewCardState(input.cardId);
    if (state === undefined) {
      throw new TypeError(`Review card ${input.cardId} has no state`);
    }

    const reviewedAtIso = input.reviewedAt;
    const reviewedAtDate = new Date(reviewedAtIso);

    let reviewEventId: UUID | undefined;
    if (input.updateFsrs !== false) {
      const rating = resultToRating(input.result);
      if (rating !== undefined) {
        reviewEventId = applyFsrsUpdate(this.store, input.cardId, state, rating, reviewedAtDate, input.responseMs);
      }
    }

    const attempt = makePracticeAttempt({
      cardId: input.cardId,
      mode: input.mode,
      result: input.result,
      sourceContext: input.sourceContext,
      reviewedAt: reviewedAtIso,
      ...(input.givenAnswer !== undefined ? { givenAnswer: input.givenAnswer } : {}),
      ...(input.expectedAnswer !== undefined ? { expectedAnswer: input.expectedAnswer } : {}),
      ...(input.responseMs !== undefined ? { responseMs: input.responseMs } : {}),
      ...(reviewEventId !== undefined ? { eventLink: { reviewEventId } } : {}),
    });
    this.store.addPracticeAttempt(attempt);
    const result: PracticeAttemptWithEvent = { attempt };
    if (reviewEventId !== undefined) {
      (result as unknown as Record<string, UUID | undefined>).reviewEventId = reviewEventId;
    }
    return result;
  }

  listAttemptsForCard(cardId: UUID): PracticeAttempt[] {
    return this.store.listPracticeAttemptsForCard(cardId).sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  }

  listAllAttempts(): PracticeAttempt[] {
    return this.store.listPracticeAttempts().sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  }
}
