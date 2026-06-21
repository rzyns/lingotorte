import type {
  Cue,
  SavedItem,
  SavedOccurrence,
  SavedOccurrenceSourceContext,
  SubtitleTrack,
} from '@lingotorte/domain';

export type ViewName = 'player' | 'library' | 'saved' | 'review' | 'settings';

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

export type AppModel = {
  store: import('@lingotorte/storage').LocalStore;
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
  transcriptQuery: string;
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
): SavedOccurrenceSourceContext {
  return {
    mediaId,
    mediaPath,
    mediaFingerprint: mediaFingerprint as `sha256:${string}`,
    subtitleTrackId,
    cueId: cue.id,
    timeRangeMs: { start: cue.startMs, end: cue.endMs },
    tokenSpan: { startToken: tokenStart, endToken: tokenEnd },
    charSpan: { start: charStart, end: charEnd },
  };
}
