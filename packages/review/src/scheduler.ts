import {
  createEmptyCard,
  fsrs,
  type Card,
  type FSRSParameters,
  type RecordLogItem,
  Rating as FsrsRating,
  State as FsrsState,
} from 'ts-fsrs';
import {
  isoNow,
  type ISODateTime,
  type Rating,
  type ReviewCardState,
  type ReviewEvent,
  type UUID,
} from '@lingotorte/domain';

export const FSRS_LIBRARY = 'ts-fsrs';
export const FSRS_VERSION = '5.4.0';
export const FSRS_PARAMETERS_VERSION = 'fsrs-v6';

export type FsrsSchedulerConfig = Readonly<{
  requestRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: readonly (`${number}m` | `${number}h` | `${number}d`)[];
  relearningSteps: readonly (`${number}m` | `${number}h` | `${number}d`)[];
}>;

export function defaultFsrsConfig(): FsrsSchedulerConfig {
  return {
    requestRetention: 0.9,
    maximumIntervalDays: 36500,
    enableFuzz: false,
    enableShortTerm: true,
    learningSteps: ['1m' as `${number}m`, '10m' as `${number}m`],
    relearningSteps: ['10m' as `${number}m`],
  };
}

function toFsrsParameters(config: FsrsSchedulerConfig): FSRSParameters {
  return {
    request_retention: config.requestRetention,
    maximum_interval: config.maximumIntervalDays,
    enable_fuzz: config.enableFuzz,
    enable_short_term: config.enableShortTerm,
    learning_steps: [...config.learningSteps],
    relearning_steps: [...config.relearningSteps],
    w: [
      0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05,
      0.34, 1.26, 0.29, 2.61,
    ],
  };
}

const ratingToFsrs: Record<Rating, FsrsRating> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

const fsrsStateToDomain: Record<FsrsState, ReviewCardState['state']> = {
  [FsrsState.New]: 'new',
  [FsrsState.Learning]: 'learning',
  [FsrsState.Review]: 'review',
  [FsrsState.Relearning]: 'relearning',
};

const domainStateToFsrs: Record<ReviewCardState['state'], FsrsState> = {
  new: FsrsState.New,
  learning: FsrsState.Learning,
  review: FsrsState.Review,
  relearning: FsrsState.Relearning,
};

function cardFromState(state: ReviewCardState, dueOverride?: Date): Card {
  const due = dueOverride ?? new Date(state.dueAt);
  const card: Card = {
    due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    reps: state.reps,
    lapses: state.lapses,
    state: domainStateToFsrs[state.state],
    learning_steps: 0,
  };
  if (state.lastReviewedAt !== undefined) {
    (card as Card & { last_review?: Date }).last_review = new Date(state.lastReviewedAt);
  }
  return card;
}

function stateFromCard(cardId: UUID, card: Card, fsrsVersion: string, reviewedAt?: ISODateTime): ReviewCardState {
  const base: Omit<ReviewCardState, 'lastReviewedAt'> = {
    cardId,
    state: fsrsStateToDomain[card.state],
    dueAt: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    fsrsVersion,
    updatedAt: isoNow(),
  };
  if (reviewedAt === undefined) {
    return base;
  }
  return { ...base, lastReviewedAt: reviewedAt };
}

export class ReviewScheduler {
  private readonly scheduler: ReturnType<typeof fsrs>;

  constructor(private readonly config: FsrsSchedulerConfig = defaultFsrsConfig()) {
    this.scheduler = fsrs(toFsrsParameters(config));
  }

  get versionRecord(): Readonly<{ library: string; libraryVersion: string; parametersVersion: string; config: FsrsSchedulerConfig }> {
    return {
      library: FSRS_LIBRARY,
      libraryVersion: FSRS_VERSION,
      parametersVersion: FSRS_PARAMETERS_VERSION,
      config: this.config,
    };
  }

  createInitialState(cardId: UUID): ReviewCardState {
    const emptyCard = createEmptyCard(new Date());
    return stateFromCard(cardId, emptyCard, this.versionRecord.libraryVersion);
  }

  preview(cardId: UUID, state: ReviewCardState, now: Date): Readonly<Record<Rating, ReviewCardState | undefined>> {
    const card = cardFromState(state, now);
    const previews = [...this.scheduler.repeat(card, now)];
    const result: Record<Rating, ReviewCardState | undefined> = {
      again: undefined,
      hard: undefined,
      good: undefined,
      easy: undefined,
    };
    const domainRatings: Rating[] = ['again', 'hard', 'good', 'easy'];
    for (let i = 0; i < domainRatings.length; i += 1) {
      const rating = domainRatings[i]!;
      const item = previews[i];
      if (!item) continue;
      result[rating] = stateFromCard(cardId, item.card, this.versionRecord.libraryVersion);
    }
    return result;
  }

  applyRating(cardId: UUID, state: ReviewCardState, rating: Rating, now: Date): { nextState: ReviewCardState; log: RecordLogItem } {
    const card = cardFromState(state, now);
    const recordLogItem = this.scheduler.next(card, now, ratingToFsrs[rating] as unknown as Exclude<FsrsRating, FsrsRating.Manual>);
    const nextState = stateFromCard(cardId, recordLogItem.card, this.versionRecord.libraryVersion, now.toISOString());
    return { nextState, log: recordLogItem };
  }

  eventFromRating(
    cardId: UUID,
    previousState: ReviewCardState,
    nextState: ReviewCardState,
    rating: Rating,
    reviewedAt: ISODateTime,
    responseMs?: number,
  ): Pick<ReviewEvent, 'cardId' | 'reviewedAt' | 'rating' | 'responseMs' | 'previousStateJson' | 'nextStateJson'> {
    const event: Pick<ReviewEvent, 'cardId' | 'reviewedAt' | 'rating' | 'responseMs' | 'previousStateJson' | 'nextStateJson'> = {
      cardId,
      reviewedAt,
      rating,
      ...(responseMs !== undefined ? { responseMs } : {}),
      previousStateJson: JSON.stringify(previousState),
      nextStateJson: JSON.stringify(nextState),
    };
    return event;
  }
}

export function recomputeStateFromEvents(
  cardId: UUID,
  events: readonly Pick<ReviewEvent, 'reviewedAt' | 'rating'>[],
  config: FsrsSchedulerConfig = defaultFsrsConfig(),
): ReviewCardState {
  const scheduler = new ReviewScheduler(config);
  let state = scheduler.createInitialState(cardId);
  for (const event of events) {
    const result = scheduler.applyRating(cardId, state, event.rating, new Date(event.reviewedAt));
    state = result.nextState;
  }
  return state;
}
