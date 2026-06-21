export type UUID = string;
export type ISODateTime = string;
export type Sha256Digest = `sha256:${string}`;
export type SourceKind = 'synthetic' | 'owned' | 'licensed';
export type SubtitleRole = 'target' | 'native' | 'other';
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'json';
export type PrivacyMode = 'local' | 'explicit-online';
export type ProviderKind = 'dictionary' | 'translation' | 'llm' | 'asr' | 'pronunciation' | 'sync';
export type SavedItemKind = 'lexeme' | 'phrase' | 'sentence';
export type CardType = 'recognition' | 'production';
export type Rating = 'again' | 'hard' | 'good' | 'easy';

export type TimeRangeMs = Readonly<{
  start: number;
  end: number;
}>;

export type TokenSpan = Readonly<{
  startToken: number;
  endToken: number;
}>;

export type CharacterSpan = Readonly<{
  start: number;
  end: number;
}>;

export type MediaAsset = Readonly<{
  id: UUID;
  title: string;
  originalPath: string;
  contentSha256: Sha256Digest;
  durationMs: number;
  container: string;
  sizeBytes: number;
  importedAt: ISODateTime;
  lastSeenAt: ISODateTime;
  privacyLabel: SourceKind;
}>;

export type MediaFileObservation = Readonly<{
  id: UUID;
  mediaId: UUID;
  path: string;
  sizeBytes: number;
  mtimeMs: number;
  contentSha256: Sha256Digest;
  observedAt: ISODateTime;
  exists: boolean;
}>;

export type SubtitleTrack = Readonly<{
  id: UUID;
  mediaId: UUID;
  language: string;
  role: SubtitleRole;
  format: SubtitleFormat;
  sourceKind: SourceKind;
  sourcePath: string;
  contentSha256: Sha256Digest;
  trackVersion: number;
  isActive: boolean;
  createdAt: ISODateTime;
}>;

export type Cue = Readonly<{
  id: UUID;
  trackId: UUID;
  cueIndex: number;
  startMs: number;
  endMs: number;
  text: string;
  normalizedText: string;
  textSha256: Sha256Digest;
  createdAt: ISODateTime;
}>;

export type CueAlignment = Readonly<{
  id: UUID;
  mediaId: UUID;
  targetTrackId: UUID;
  nativeTrackId: UUID;
  targetCueId: UUID;
  nativeCueId: UUID;
  method: 'timestamp' | 'text_similarity' | 'manual';
  confidence: number;
  alignmentVersion: number;
  createdAt: ISODateTime;
}>;

export type TokenOccurrence = Readonly<{
  id: UUID;
  cueId: UUID;
  analysisRunId?: UUID;
  tokenIndex: number;
  charStart: number;
  charEnd: number;
  surface: string;
  normalized: string;
  lemma?: string;
  upos?: string;
  confidence?: number;
}>;

export type SavedOccurrenceSourceContext = Readonly<{
  mediaId: UUID;
  mediaPath: string;
  mediaFingerprint: Sha256Digest;
  subtitleTrackId: UUID;
  cueId: UUID;
  timeRangeMs: TimeRangeMs;
  tokenSpan: TokenSpan;
  charSpan: CharacterSpan;
}>;

export type SavedItem = Readonly<{
  id: UUID;
  kind: SavedItemKind;
  language: string;
  displayText: string;
  meaning?: string;
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt?: ISODateTime;
}>;

export type SavedOccurrence = Readonly<{
  id: UUID;
  savedItemId: UUID;
  mediaId: UUID;
  cueId: UUID;
  startMs: number;
  endMs: number;
  selectionKind: SavedItemKind;
  selectionText: string;
  contextBefore?: string;
  contextAfter?: string;
  createdAt: ISODateTime;
  sourceContext: SavedOccurrenceSourceContext;
}>;

export type SavedOccurrenceToken = Readonly<{
  id: UUID;
  savedOccurrenceId: UUID;
  tokenOccurrenceId?: UUID;
  ordinal: number;
}>;

export type ReviewCard = Readonly<{
  id: UUID;
  savedItemId: UUID;
  savedOccurrenceId: UUID;
  cardType: CardType;
  promptTemplate: string;
  createdAt: ISODateTime;
  suspendedAt?: ISODateTime;
  deletedAt?: ISODateTime;
}>;

export type ReviewCardState = Readonly<{
  cardId: UUID;
  state: 'new' | 'learning' | 'review' | 'relearning';
  dueAt: ISODateTime;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReviewedAt?: ISODateTime;
  fsrsVersion: string;
  updatedAt: ISODateTime;
}>;

export type ReviewEvent = Readonly<{
  id: UUID;
  cardId: UUID;
  reviewedAt: ISODateTime;
  rating: Rating;
  responseMs?: number;
  previousStateJson: string;
  nextStateJson: string;
  deviceId?: string;
  createdAt: ISODateTime;
}>;

export type ProviderPolicy = Readonly<{
  onlineProvidersEnabled: boolean;
  allowedDataClasses: readonly string[];
}>;

export type Confidence = Readonly<
  | { kind: 'certain'; value: number }
  | { kind: 'probable'; value: number }
  | { kind: 'possible'; value: number }
  | { kind: 'unavailable'; value: 0 }
>;

export type AdapterKind =
  | 'tokenizer'
  | 'lemmatizer'
  | 'pos-morph'
  | 'dictionary'
  | 'translation'
  | 'sentence-explanation'
  | 'asr'
  | 'forced-alignment'
  | 'pronunciation-scoring';

export type AdapterRunRef = Readonly<{
  id: UUID;
  adapterKind: AdapterKind;
  adapterId: string;
  adapterVersion: string;
  modelName?: string;
  modelVersion?: string;
  configHash: string;
  inputHash: string;
  createdAt: ISODateTime;
  privacyMode: PrivacyMode;
}>;

export type MorphFeature = Readonly<{
  key: string;
  value: string;
  source: 'universal-dependencies' | 'language-specific' | 'adapter-specific';
}>;

export type AnalysisAlternative = Readonly<{
  lemma?: string;
  upos?: string;
  morph?: MorphFeature[];
  score?: number;
  note?: string;
}>;

export type LanguageAnalysis = Readonly<{
  id: UUID;
  tokenOccurrenceId: UUID;
  runId: UUID;
  language: string;
  lemma?: string;
  upos?: string;
  xpos?: string;
  morph: MorphFeature[];
  confidence: Confidence;
  alternatives: AnalysisAlternative[];
}>;

export type TokenizerInput = Readonly<{
  language: string;
  cueId: UUID;
  text: string;
  preserveCharOffsets: true;
}>;

export type TokenizerOutputToken = Readonly<{
  tokenIndex: number;
  charStart: number;
  charEnd: number;
  surface: string;
  normalizedSurface: string;
  tokenKind: 'word' | 'punctuation' | 'whitespace' | 'number' | 'symbol' | 'other';
  joinToPrevious?: boolean;
  joinToNext?: boolean;
}>;

export type TokenizerOutput = Readonly<{
  run: AdapterRunRef;
  tokens: TokenizerOutputToken[];
  warnings: string[];
}>;

export type MorphologyInput = Readonly<{
  language: string;
  cueId: UUID;
  text: string;
  tokens: TokenizerOutput['tokens'];
  sentenceContext?: string;
}>;

export type MorphologyOutputAnalysis = Readonly<{
  tokenIndex: number;
  lemma?: string;
  upos?: string;
  xpos?: string;
  morph: MorphFeature[];
  confidence: Confidence;
  alternatives: AnalysisAlternative[];
}>;

export type MorphologyOutput = Readonly<{
  run: AdapterRunRef;
  analyses: MorphologyOutputAnalysis[];
  dependencies?: {
    tokenIndex: number;
    headTokenIndex: number | null;
    relation: string;
  }[];
  warnings: string[];
}>;

export type LookupTarget =
  | { kind: 'token'; tokenOccurrenceId: UUID }
  | { kind: 'phrase'; cueId: UUID; tokenStart: number; tokenEnd: number; text: string }
  | { kind: 'sentence'; cueId: UUID; text: string };

export type LookupInput = Readonly<{
  target: LookupTarget;
  sourceLanguage: string;
  learnerLanguage: string;
  context: {
    cueText: string;
    nativeCueText?: string;
    mediaTitle?: string;
    precedingCueText?: string;
    followingCueText?: string;
  };
  analysis?: LanguageAnalysis;
}>;

export type LookupOutputEntry = Readonly<{
  headword: string;
  lemma?: string;
  partOfSpeech?: string;
  shortGloss: string;
  senses: {
    gloss: string;
    examples?: string[];
    register?: string;
    confidence: Confidence;
  }[];
  sourceName: string;
  sourceLicense?: string;
}>;

export type LookupOutput = Readonly<{
  run: AdapterRunRef;
  entries: LookupOutputEntry[];
  machineTranslation?: {
    text: string;
    provider: string;
    confidence: Confidence;
    warning?: string;
  };
  warnings: string[];
}>;

export type ImportJob = Readonly<{
  id: UUID;
  status: 'pending' | 'running' | 'completed' | 'failed';
  sourceKind: 'media' | 'subtitle' | 'transcript';
  startedAt: ISODateTime;
  completedAt?: ISODateTime;
  errorCode?: string;
  inputManifestJson: string;
}>;

export type ImportJobEvent = Readonly<{
  id: UUID;
  jobId: UUID;
  level: 'info' | 'warn' | 'error';
  message: string;
  createdAt: ISODateTime;
  dataJson?: string;
}>;
