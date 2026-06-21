import {
  makeReviewCard,
  makeReviewEvent,
  type CardType,
  type Rating,
  type ReviewCard,
  type ReviewCardState,
  type SavedItem,
  type SavedOccurrence,
  type UUID,
} from '@lingotorte/domain';
import type { LocalStore } from '@lingotorte/storage';
import { ReviewScheduler, recomputeStateFromEvents, defaultFsrsConfig } from './scheduler';
import type { FsrsSchedulerConfig } from './scheduler';

export type CreateCardInput = Readonly<{
  savedItem: SavedItem;
  savedOccurrence: SavedOccurrence;
  cardType: CardType;
  promptTemplate?: string;
  config?: FsrsSchedulerConfig;
}>;

export type ReviewCardWithState = Readonly<{
  card: ReviewCard;
  state: ReviewCardState;
}>;

export class ReviewService {
  constructor(private readonly store: LocalStore, private readonly config: FsrsSchedulerConfig = defaultFsrsConfig()) {}

  createCard(input: CreateCardInput): ReviewCardWithState {
    const promptTemplate =
      input.promptTemplate ??
      (input.cardType === 'recognition'
        ? 'Recognize "{{displayText}}" and recall its meaning.'
        : 'Produce "{{displayText}}" from the prompt/context.');
    const card = makeReviewCard({
      savedItemId: input.savedItem.id,
      savedOccurrenceId: input.savedOccurrence.id,
      cardType: input.cardType,
      promptTemplate,
    });
    const scheduler = new ReviewScheduler(this.config);
    const state = scheduler.createInitialState(card.id);
    this.store.putReviewCard(card);
    this.store.putReviewCardState(state);
    return { card, state };
  }

  submitReview(cardId: UUID, rating: Rating, reviewedAt: Date, responseMs?: number): ReviewCardWithState {
    const card = this.store.getReviewCard(cardId);
    if (!card) {
      throw new TypeError(`Review card ${cardId} not found`);
    }
    const currentState = this.store.getReviewCardState(cardId);
    if (!currentState) {
      throw new TypeError(`Review card ${cardId} has no state`);
    }
    const scheduler = new ReviewScheduler(this.config);
    const { nextState } = scheduler.applyRating(cardId, currentState, rating, reviewedAt);
    const eventInput: Parameters<typeof makeReviewEvent>[0] = {
      cardId,
      reviewedAt: reviewedAt.toISOString(),
      rating,
      ...(responseMs !== undefined ? { responseMs } : {}),
      previousStateJson: JSON.stringify(currentState),
      nextStateJson: JSON.stringify(nextState),
    };
    const event = makeReviewEvent(eventInput);
    this.store.putReviewCardState(nextState);
    this.store.addReviewEvent(event);
    return { card, state: nextState };
  }

  recomputeCardState(cardId: UUID): ReviewCardState {
    const card = this.store.getReviewCard(cardId);
    if (!card) {
      throw new TypeError(`Review card ${cardId} not found`);
    }
    const events = this.store.listReviewEventsForCard(cardId).sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
    const recomputed = recomputeStateFromEvents(
      cardId,
      events.map((e) => ({ reviewedAt: e.reviewedAt, rating: e.rating })),
      this.config,
    );
    this.store.putReviewCardState(recomputed);
    return recomputed;
  }

  listDueCards(asOf: Date): ReviewCardWithState[] {
    const snapshot = this.store.snapshot();
    const result: ReviewCardWithState[] = [];
    for (const card of Object.values(snapshot.reviewCards)) {
      if (card.suspendedAt !== undefined || card.deletedAt !== undefined) continue;
      const state = snapshot.reviewCardStates[card.id];
      if (state === undefined) continue;
      if (new Date(state.dueAt).valueOf() > asOf.valueOf()) continue;
      result.push({ card, state });
    }
    result.sort((a, b) => new Date(a.state.dueAt).valueOf() - new Date(b.state.dueAt).valueOf());
    return result;
  }

  listBuckets(asOf: Date): Readonly<{
    newCards: ReviewCardWithState[];
    learning: ReviewCardWithState[];
    review: ReviewCardWithState[];
    relearning: ReviewCardWithState[];
  }> {
    const all = this.listDueCards(asOf);
    return {
      newCards: all.filter((cs) => cs.state.state === 'new'),
      learning: all.filter((cs) => cs.state.state === 'learning'),
      review: all.filter((cs) => cs.state.state === 'review'),
      relearning: all.filter((cs) => cs.state.state === 'relearning'),
    };
  }
}

export { ReviewScheduler, recomputeStateFromEvents, defaultFsrsConfig };
export type { FsrsSchedulerConfig } from './scheduler';
