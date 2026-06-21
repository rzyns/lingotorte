import type {
  Cue,
  CueAlignment,
  MediaAsset,
  MediaFileObservation,
  ReviewCard,
  ReviewCardState,
  ReviewEvent,
  SavedItem,
  SavedOccurrence,
  SavedOccurrenceSourceContext,
  SubtitleTrack,
  TokenOccurrence,
  UUID,
} from './coreTypes';

export * from './coreTypes';
export * from './guards';
export * from './sourceContext';
export * from './providerPolicy';
export * from './privacyScan';

export function uuid(): UUID {
  // Simple UUID v4-ish generator for local deterministic tests.
  const hex = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      result += '-';
    } else if (i === 14) {
      result += '4';
    } else if (i === 19) {
      result += hex[(Math.random() * 4) | 8];
    } else {
      result += hex[(Math.random() * 16) | 0];
    }
  }
  return result;
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function makeMediaAsset(
  input: Pick<MediaAsset, 'title' | 'originalPath' | 'contentSha256' | 'durationMs' | 'container' | 'sizeBytes' | 'privacyLabel'>,
): MediaAsset {
  const now = isoNow();
  return {
    id: uuid(),
    ...input,
    importedAt: now,
    lastSeenAt: now,
  };
}

export function makeSubtitleTrack(
  input: Pick<SubtitleTrack, 'mediaId' | 'language' | 'role' | 'format' | 'sourceKind' | 'sourcePath' | 'contentSha256' | 'isActive'>,
): SubtitleTrack {
  const now = isoNow();
  return {
    id: uuid(),
    ...input,
    trackVersion: 1,
    createdAt: now,
  };
}

export function makeCue(input: Pick<Cue, 'trackId' | 'cueIndex' | 'startMs' | 'endMs' | 'text' | 'normalizedText' | 'textSha256'>): Cue {
  return {
    id: uuid(),
    ...input,
    createdAt: isoNow(),
  };
}

export function makeCueAlignment(
  input: Pick<CueAlignment, 'mediaId' | 'targetTrackId' | 'nativeTrackId' | 'targetCueId' | 'nativeCueId' | 'method' | 'confidence'>,
): CueAlignment {
  return {
    id: uuid(),
    ...input,
    alignmentVersion: 1,
    createdAt: isoNow(),
  };
}

export function makeTokenOccurrence(
  input: Pick<TokenOccurrence, 'cueId' | 'analysisRunId' | 'tokenIndex' | 'charStart' | 'charEnd' | 'surface' | 'normalized'>,
): TokenOccurrence {
  return {
    id: uuid(),
    ...input,
  };
}

export function makeSavedItem(
  input: Pick<SavedItem, 'kind' | 'language' | 'displayText'> & Partial<Pick<SavedItem, 'meaning' | 'notes'>>,
): SavedItem {
  const now = isoNow();
  return {
    id: uuid(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };
}

export function makeSavedOccurrence(
  input: Pick<SavedOccurrence, 'savedItemId' | 'mediaId' | 'cueId' | 'startMs' | 'endMs' | 'selectionKind' | 'selectionText'> &
    Partial<Pick<SavedOccurrence, 'contextBefore' | 'contextAfter'>> & {
    sourceContext: SavedOccurrenceSourceContext;
  },
): SavedOccurrence {
  return {
    id: uuid(),
    ...input,
    createdAt: isoNow(),
  };
}

export function makeReviewCard(input: Pick<ReviewCard, 'savedItemId' | 'savedOccurrenceId' | 'cardType' | 'promptTemplate'>): ReviewCard {
  return {
    id: uuid(),
    ...input,
    createdAt: isoNow(),
  };
}

export function makeReviewCardState(
  input: Pick<ReviewCardState, 'cardId' | 'fsrsVersion'> & Partial<Omit<ReviewCardState, 'cardId' | 'fsrsVersion'>>,
): ReviewCardState {
  const now = isoNow();
  return {
    state: 'new',
    dueAt: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    updatedAt: now,
    ...input,
  };
}

export function makeReviewEvent(
  input: Pick<ReviewEvent, 'cardId' | 'reviewedAt' | 'rating' | 'previousStateJson' | 'nextStateJson'> & Partial<Pick<ReviewEvent, 'responseMs' | 'deviceId'>>,
): ReviewEvent {
  return {
    id: uuid(),
    ...input,
    createdAt: isoNow(),
  };
}

export function makeMediaFileObservation(
  input: Pick<MediaFileObservation, 'mediaId' | 'path' | 'sizeBytes' | 'mtimeMs' | 'contentSha256' | 'exists'>,
): MediaFileObservation {
  return {
    id: uuid(),
    ...input,
    observedAt: isoNow(),
  };
}
