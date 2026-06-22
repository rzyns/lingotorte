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
  type TranscriptWordTiming,
} from './coreTypes';

export * from './coreTypes';
export * from './guards';
export * from './sourceContext';
export * from './exportManifest';
export * from './providerPolicy';

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
  input: Pick<SubtitleTrack, 'mediaId' | 'language' | 'role' | 'format' | 'sourceKind' | 'sourcePath' | 'contentSha256' | 'isActive'> &
    Partial<Pick<SubtitleTrack, 'transcriptStatus' | 'transcriptSourceKind' | 'provenance' | 'qualityReport'>>,
): SubtitleTrack {
  const now = isoNow();
  const transcriptSourceKind = input.transcriptSourceKind ?? (input.sourceKind === 'synthetic' ? 'synthetic-fixture' : 'user-subtitle-file');
  return {
    id: uuid(),
    ...input,
    trackVersion: 1,
    transcriptStatus: input.transcriptStatus ?? 'approved',
    transcriptSourceKind,
    provenance: input.provenance ?? {
      language: input.language,
      warningFlags: [],
    },
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

export function makeTranscriptWordTiming(
  input: Pick<TranscriptWordTiming, 'trackId' | 'cueId' | 'wordIndex' | 'charStart' | 'charEnd' | 'text' | 'normalizedText' | 'startMs' | 'endMs' | 'sourceKind' | 'engine' | 'modelName'> &
    Partial<Pick<TranscriptWordTiming, 'analysisRunId' | 'confidence' | 'speakerId' | 'modelVersion'>>,
): TranscriptWordTiming {
  return {
    id: uuid(),
    ...input,
    createdAt: isoNow(),
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

export function makePracticeAttempt(
  input: Pick<import('./coreTypes').PracticeAttempt, 'cardId' | 'mode' | 'result' | 'sourceContext' | 'reviewedAt'> &
    Partial<Pick<import('./coreTypes').PracticeAttempt, 'givenAnswer' | 'expectedAnswer' | 'responseMs' | 'eventLink'>>,
): import('./coreTypes').PracticeAttempt {
  return {
    id: uuid(),
    ...input,
    eventLink: input.eventLink ?? {},
    createdAt: isoNow(),
  };
}

export function makeLearnerExportManifest(
  input: Pick<import('./coreTypes').LearnerExportManifest, 'applicationVersion' | 'deviceId' | 'privacyWarnings' | 'content' | 'integrity'> &
    Partial<Pick<import('./coreTypes').LearnerExportManifest, 'exportedAt'>>,
): import('./coreTypes').LearnerExportManifest {
  return {
    schemaVersion: 'lingotorte.learner-export.v1',
    exportedAt: input.exportedAt ?? isoNow(),
    ...input,
  };
}

export function makePrivacyWarning(
  kind: import('./coreTypes').PrivacyWarningKind,
  severity: import('./coreTypes').PrivacyWarning['severity'],
  message: string,
): import('./coreTypes').PrivacyWarning {
  return { kind, severity, message };
}

export function makeExportIntegrity(
  rootHash: import('./coreTypes').Sha256Digest,
  recordCount: number,
): import('./coreTypes').ExportIntegrity {
  return { algorithm: 'sha256-per-record', rootHash, recordCount };
}

export function makeRestoreConfirmation(
  input: Pick<import('./coreTypes').RestoreConfirmation, 'confirmedAt' | 'confirmOverwrite' | 'acknowledgedWarnings'>,
): import('./coreTypes').RestoreConfirmation {
  return { ...input };
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
