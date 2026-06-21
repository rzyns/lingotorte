import {
  isoNow,
  uuid,
  type AdapterKind,
  type AdapterRunRef,
  type Cue,
  type LanguageAnalysis,
  type MediaAsset,
  type MediaFileObservation,
  type PrivacyMode,
  type ReviewCard,
  type ReviewCardState,
  type ReviewEvent,
  type SavedItem,
  type SavedOccurrence,
  type SubtitleTrack,
  type TokenOccurrence,
} from './coreTypes';

export * from './coreTypes';
export * from './guards';
export * from './sourceContext';
export * from './providerPolicy';
export * from './privacyScan';

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
  input: Pick<import('./coreTypes').CueAlignment, 'mediaId' | 'targetTrackId' | 'nativeTrackId' | 'targetCueId' | 'nativeCueId' | 'method' | 'confidence'>,
): import('./coreTypes').CueAlignment {
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
    sourceContext: import('./coreTypes').SavedOccurrenceSourceContext;
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

export function makeAdapterRunRef(
  adapterKind: AdapterKind,
  adapterId: string,
  adapterVersion: string,
  inputHash: string,
  privacyMode: PrivacyMode,
): AdapterRunRef {
  return {
    id: uuid(),
    adapterKind,
    adapterId,
    adapterVersion,
    configHash: 'local',
    inputHash,
    createdAt: isoNow(),
    privacyMode,
  };
}

export function makeLanguageAnalysis(
  input: Pick<LanguageAnalysis, 'tokenOccurrenceId' | 'runId' | 'language' | 'lemma' | 'upos' | 'xpos' | 'morph' | 'confidence' | 'alternatives'>,
): LanguageAnalysis {
  return {
    id: uuid(),
    ...input,
  };
}
