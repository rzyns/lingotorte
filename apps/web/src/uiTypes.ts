import type {
  Cue,
  SavedItem,
  SavedOccurrence,
  SavedOccurrenceSourceContext,
  SubtitleTrack,
} from '@lingotorte/domain';

export type ViewName = 'player' | 'library' | 'saved' | 'review' | 'practice' | 'export-import' | 'settings';

export type PlayerState = {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  loopCue: boolean;
  activeCueId: string | null;
  lastTokenPreview?: string;
};

export type Selection = {
  kind: 'lexeme' | 'phrase' | 'sentence';
  text: string;
  cueId: string;
  tokenStart: number;
  tokenEnd: number;
  charStart: number;
  charEnd: number;
} | null;

export type PracticeMode = import('@lingotorte/domain').PracticeMode;
export type PracticeResult = import('@lingotorte/domain').PracticeResult;

export type AppModel = {
  store: import('@lingotorte/storage').LocalStore;
  savedOccurrenceService: import('@lingotorte/storage').SavedOccurrenceService;
  reviewService: import('@lingotorte/review').ReviewService;
  practiceService: import('@lingotorte/storage').PracticeService;
  exportService: import('@lingotorte/storage').ExportService;
  restoreService: import('@lingotorte/storage').RestoreService;
  providerPolicy: ReturnType<typeof import('@lingotorte/domain').defaultProviderPolicy>;
  adapters: ReturnType<typeof import('@lingotorte/language').resolveLocalAdapters>;
  player: PlayerState;
  currentMedia: import('@lingotorte/domain').MediaAsset | null;
  targetTrackId: string | null;
  nativeTrackId: string | null;
  cues: Cue[];
  selection: Selection;
  importError: string | null;
  pendingMeaning: string;
  pendingNotes: string;
  view: ViewName;
  savedViewTab?: 'vocab' | 'sentences';
  transcriptQuery: string;
  transcriptLifecycle: {
    youtubeUrl: string;
    youtubeLanguage: string;
    publicReadAuthorized: boolean;
    localAsrMediaPath: string;
    pendingCueEdits: Record<string, string>;
    pendingCueTimingEdits: Record<string, { startMs: number; endMs: number }>;
    pendingWordTimingEdits: Record<string, { text: string; startMs: number; endMs: number }>;
    lastMessage: string | null;
  };
  review: {
    currentCardId: string | null;
    activeCardId: string | null;
    revealed: boolean;
    bucketAsOf: Date;
  };
  practice: {
    mode: PracticeMode;
    pendingAnswer: string;
    lastAttemptResult: { result: PracticeResult; correct: boolean } | null;
    typedAttemptsEnabled: boolean;
  };
  exportImport: {
    manifestJson: string | null;
    preview: import('@lingotorte/domain').RestorePreview | null;
    lastError: string | null;
    acknowledgedWarnings: import('@lingotorte/domain').PrivacyWarningKind[];
    confirmOverwrite: boolean;
    lastExport: { fileName: string; manifestJson: string; recordCount: number; warningCount: number } | null;
  };
  localService: {
    baseUrl: string;
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    lastMessage: string | null;
    lastSavedAt: string | null;
    autosaveEnabled: boolean;
  };
};

export type ReviewBucketName = 'newCards' | 'learning' | 'review' | 'relearning' | 'mastered';

export type ReviewBucketConfig = Readonly<{
  // A card is displayed in the mastered bucket when its scheduled interval in
  // days is at least this threshold. This is a UI projection only; the FSRS
  // card core state is unchanged and recomputable from review events.
  masteredIntervalDays: number;
}>;

export const defaultReviewBucketConfig: ReviewBucketConfig = {
  masteredIntervalDays: 21,
};

export type TranscriptCueViewModel = Readonly<{
  cue: Cue;
  targetTrack: SubtitleTrack;
  nativeTrack?: SubtitleTrack;
  nativeText?: string;
  isActive: boolean;
  onClick: () => void;
  onSaveSentence: () => void;
}>;

export type SavedItemViewModel = Readonly<{
  item: SavedItem;
  occurrences: SavedOccurrence[];
  onReview: () => void;
}>;

export type ReviewCardViewModel = Readonly<{
  cardId: string;
  savedItem: SavedItem;
  occurrence: SavedOccurrence;
  stateLabel: 'new' | 'learning' | 'review' | 'relearning';
  dueAt: Date;
  promptTemplate: string;
  displayText: string;
  meaningHint?: string;
  sourceCue: Cue | null;
  sourceNativeText: string | undefined;
  onRate: (rating: 'again' | 'hard' | 'good' | 'easy') => void;
  onReplay: () => void;
}>;

export function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor((ms % 1000) / 10);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(2, '0')}`;
}

export function formatDueAt(dueAt: string | Date): string {
  const date = typeof dueAt === 'string' ? new Date(dueAt) : dueAt;
  if (Number.isNaN(date.valueOf())) {
    return typeof dueAt === 'string' ? dueAt : 'invalid due date';
  }
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

export function buildSourceContext(
  mediaId: string,
  mediaPath: string,
  mediaFingerprint: string,
  subtitleTrackId: string,
  cue: Cue,
  tokenStart: number,
  tokenEnd: number,
  charStart: number,
  charEnd: number,
  timeRangeMs?: SavedOccurrenceSourceContext['timeRangeMs'],
): SavedOccurrenceSourceContext {
  return {
    mediaId,
    mediaPath,
    mediaFingerprint: mediaFingerprint as `sha256:${string}`,
    subtitleTrackId,
    cueId: cue.id,
    timeRangeMs: timeRangeMs ?? { start: cue.startMs, end: cue.endMs },
    tokenSpan: { startToken: tokenStart, endToken: tokenEnd },
    charSpan: { start: charStart, end: charEnd },
  };
}
