export type SourceKind = 'synthetic' | 'owned' | 'licensed';
export type SubtitleRole = 'target' | 'native' | 'other';
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'json';
export type PrivacyMode = 'local' | 'explicit-online';
export type ProviderKind = 'dictionary' | 'translation' | 'llm' | 'asr' | 'pronunciation' | 'sync';
export type Sha256Digest = `sha256:${string}`;

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

export type SavedOccurrenceSourceContext = Readonly<{
  mediaId: string;
  mediaPath: string;
  mediaFingerprint: Sha256Digest;
  subtitleTrackId: string;
  cueId: string;
  timeRangeMs: TimeRangeMs;
  tokenSpan: TokenSpan;
  charSpan: CharacterSpan;
}>;

export type FixtureMediaRecord = Readonly<{
  id: string;
  path: string;
  sourceKind: SourceKind;
  container: string;
  durationMs: number;
  sha256: Sha256Digest;
  generation: string;
}>;

export type FixtureSubtitleTrack = Readonly<{
  id: string;
  role: SubtitleRole;
  language: string;
  format: SubtitleFormat;
  path: string;
  sha256: Sha256Digest;
}>;

export type FixtureTranscriptCue = Readonly<{
  cueId: string;
  startMs: number;
  endMs: number;
  targetText: string;
  nativeText?: string;
}>;

export type FixtureTranscript = Readonly<{
  schemaVersion: 'lingotorte.fixture-transcript.v1';
  mediaId: string;
  targetTrackId: string;
  nativeTrackId?: string;
  cues: readonly FixtureTranscriptCue[];
}>;

export type NegativeFixtureRecord = Readonly<{
  id: string;
  purpose: string;
  path: string;
  sha256: Sha256Digest;
}>;

export type FixtureCatalog = Readonly<{
  schemaVersion: 'lingotorte.fixture-catalog.v1';
  generatedUtc: string;
  provenance: string;
  prohibitedSourceMarkers: readonly string[];
  media: FixtureMediaRecord;
  subtitleTracks: readonly FixtureSubtitleTrack[];
  negativeFixtures: readonly NegativeFixtureRecord[];
  transcript: FixtureTranscript & Readonly<{ path: string; sha256: Sha256Digest }>;
}>;

export type ProviderPolicy = Readonly<{
  onlineProvidersEnabled: false;
  allowedDataClasses: readonly [];
}>;

export type LookupTokenInput = Readonly<{
  token: string;
  language: string;
  cueId: string;
}>;

export type DisabledLookupResult = Readonly<{
  status: 'disabled';
  adapterId: 'lingotorte.disabled-lookup';
  privacyMode: 'local';
  reason: 'online-providers-disabled';
}>;

export type DisabledLookupAdapter = Readonly<{
  adapterId: 'lingotorte.disabled-lookup';
  privacyMode: PrivacyMode;
  lookupToken(input: LookupTokenInput): Promise<DisabledLookupResult>;
}>;
