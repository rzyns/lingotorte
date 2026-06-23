import { LocalStore, type LocalStoreSnapshot } from '../../../packages/storage/src/localStore';
import { SavedOccurrenceService } from '../../../packages/storage/src/savedOccurrenceService';
import { PracticeService } from '../../../packages/storage/src/practiceService';
import { ExportService, RestoreService } from '../../../packages/storage/src/exportRestoreService';
import { defaultProviderPolicy, makeCue, makeMediaAsset, makeSubtitleTrack, makeTranscriptWordTiming } from '@lingotorte/domain';
import { resolveLocalAdapters, makeWhitespaceTokenizer, makeUnavailableDictionaryAdapter } from '@lingotorte/language';
import { ReviewService, defaultFsrsConfig } from '@lingotorte/review';
import type {
  Cue,
  MediaAsset,
  SavedItem,
  SavedOccurrence,
  ReviewCard,
  LookupOutput,
  SubtitleTrack,
  ReviewCardState,
  Rating,
  Sha256Digest,
  SourceKind,
  TranscriptQualityReport,
  TranscriptSourceKind,
  TranscriptWarningFlag,
  TranscriptWordTimingSourceKind,
} from '@lingotorte/domain';
import type { AppModel, PlayerState, ReviewBucketConfig } from './uiTypes';
import { buildSourceContext, defaultReviewBucketConfig } from './uiTypes';
import browserFixtureMediaUrl from '../../../fixtures/media/synthetic-polish-dialogue.webm?url';
import browserFixtureTargetSrt from '../../../fixtures/subtitles/synthetic-polish-dialogue.target.srt?raw';
import browserFixtureNativeSrt from '../../../fixtures/subtitles/synthetic-polish-dialogue.native.srt?raw';

export const CUE_SYNC_TOLERANCE_MS = 100;
export const MIN_PLAYBACK_RATE = 0.5;
export const MAX_PLAYBACK_RATE = 1.5;
export const PLAYBACK_RATE_STEP = 0.1;
export const DEFAULT_LOCAL_SERVICE_BASE_URL = 'http://127.0.0.1:5174';

export function createAppModel(): AppModel {
  const policy = defaultProviderPolicy();
  const store = new LocalStore();
  return {
    store,
    savedOccurrenceService: new SavedOccurrenceService(store),
    reviewService: new ReviewService(store, defaultFsrsConfig()),
    practiceService: new PracticeService(store),
    exportService: new ExportService(store, '0.0.0-p6'),
    restoreService: new RestoreService(store),
    providerPolicy: policy,
    adapters: resolveLocalAdapters(policy, 'pl'),
    player: {
      currentTimeMs: 0,
      durationMs: 0,
      isPlaying: false,
      playbackRate: 1,
      loopCue: false,
      activeCueId: null,
    },
    currentMedia: null,
    targetTrackId: null,
    nativeTrackId: null,
    cues: [],
    selection: null,
    importError: null,
    pendingMeaning: '',
    pendingNotes: '',
    view: 'player',
    transcriptQuery: '',
    transcriptLifecycle: {
      youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      youtubeLanguage: 'pl',
      publicReadAuthorized: false,
      elevenLabsAuthorized: false,
      localAsrMediaPath: '',
      pendingCueEdits: {},
      pendingCueTimingEdits: {},
      pendingWordTimingEdits: {},
      lastMessage: null,
    },
    review: {
      currentCardId: null,
      activeCardId: null,
      revealed: false,
      bucketAsOf: new Date(),
    },
    practice: {
      mode: 'typed-input',
      pendingAnswer: '',
      lastAttemptResult: null,
      typedAttemptsEnabled: true,
    },
    exportImport: {
      manifestJson: null,
      preview: null,
      lastError: null,
      acknowledgedWarnings: [],
      confirmOverwrite: false,
      lastExport: null,
    },
    localService: {
      baseUrl: DEFAULT_LOCAL_SERVICE_BASE_URL,
      status: 'disconnected',
      lastMessage: 'Local service not connected.',
      lastSavedAt: null,
      autosaveEnabled: false,
    },
  };
}

export type LocalServiceSyncResult = Readonly<{
  ok: boolean;
  message: string;
}>;

function normalizeLocalServiceBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim() || DEFAULT_LOCAL_SERVICE_BASE_URL;
  return trimmed.replace(/\/+$/, '');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function fetchLocalServiceJson(baseUrl: string, path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`${normalizeLocalServiceBaseUrl(baseUrl)}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  const value: unknown = await response.json();
  if (!isPlainObject(value)) {
    throw new TypeError('Local service returned a non-object JSON response.');
  }
  if (!response.ok || value.ok === false) {
    throw new TypeError(typeof value.error === 'string' ? value.error : `Local service request failed with HTTP ${response.status}`);
  }
  return value;
}

function newestFirst<T extends { importedAt?: string; createdAt?: string; lastSeenAt?: string }>(a: T, b: T): number {
  const aStamp = a.lastSeenAt ?? a.importedAt ?? a.createdAt ?? '';
  const bStamp = b.lastSeenAt ?? b.importedAt ?? b.createdAt ?? '';
  return bStamp.localeCompare(aStamp);
}

function chooseActiveTrack(tracks: SubtitleTrack[], role: 'target' | 'native'): SubtitleTrack | null {
  const candidates = tracks
    .filter((track) => track.role === role && track.isActive)
    .sort((a, b) => b.trackVersion - a.trackVersion || newestFirst(a, b));
  return candidates[0] ?? null;
}

function snapshotHasDurableContent(snapshot: LocalStoreSnapshot): boolean {
  return Object.values(snapshot.mediaAssets).length > 0
    || Object.values(snapshot.subtitleTracks).length > 0
    || Object.values(snapshot.cues).length > 0
    || Object.values(snapshot.savedItems).length > 0
    || Object.values(snapshot.savedOccurrences).length > 0
    || Object.values(snapshot.reviewCards).length > 0
    || Object.values(snapshot.reviewCardStates).length > 0
    || Object.values(snapshot.practiceAttempts).length > 0
    || Object.values(snapshot.transcriptWordTimings).length > 0;
}

function projectHydratedSnapshotIntoModel(model: AppModel, snapshot: LocalStoreSnapshot): void {
  const hydrated = model.store.replaceSnapshot(snapshot);
  const media = Object.values(hydrated.mediaAssets).sort(newestFirst)[0] ?? null;
  model.currentMedia = media;
  if (!media) {
    model.targetTrackId = null;
    model.nativeTrackId = null;
    model.cues = [];
    model.player.durationMs = 0;
    model.player.activeCueId = null;
    return;
  }

  const tracks = Object.values(hydrated.subtitleTracks).filter((track) => track.mediaId === media.id);
  const targetTrack = chooseActiveTrack(tracks, 'target');
  const nativeTrack = chooseActiveTrack(tracks, 'native');
  model.targetTrackId = targetTrack?.id ?? null;
  model.nativeTrackId = nativeTrack?.id ?? null;
  model.cues = targetTrack ? model.store.listCuesForTrack(targetTrack.id) : [];
  model.player.durationMs = media.durationMs;
  model.player.currentTimeMs = 0;
  model.player.activeCueId = model.cues[0]?.id ?? null;
}

export async function saveModelToLocalService(model: AppModel, baseUrl = model.localService.baseUrl): Promise<LocalServiceSyncResult> {
  const normalizedBaseUrl = normalizeLocalServiceBaseUrl(baseUrl);
  model.localService.baseUrl = normalizedBaseUrl;
  try {
    await fetchLocalServiceJson(normalizedBaseUrl, '/api/state', {
      method: 'PUT',
      body: JSON.stringify({ snapshot: model.store.snapshot() }),
    });
    const savedAt = new Date().toISOString();
    model.localService.status = 'connected';
    model.localService.lastSavedAt = savedAt;
    model.localService.lastMessage = `Saved local state at ${savedAt}`;
    return { ok: true, message: model.localService.lastMessage };
  } catch (error) {
    model.localService.status = 'error';
    model.localService.lastMessage = error instanceof Error ? error.message : String(error);
    return { ok: false, message: model.localService.lastMessage };
  }
}

export async function connectLocalService(model: AppModel, baseUrl = model.localService.baseUrl): Promise<LocalServiceSyncResult> {
  const normalizedBaseUrl = normalizeLocalServiceBaseUrl(baseUrl);
  model.localService.baseUrl = normalizedBaseUrl;
  model.localService.status = 'connecting';
  model.localService.lastMessage = 'Connecting to local service...';
  try {
    await fetchLocalServiceJson(normalizedBaseUrl, '/api/status');
    const state = await fetchLocalServiceJson(normalizedBaseUrl, '/api/state');
    const serviceSnapshot = state.snapshot as LocalStoreSnapshot;
    if (snapshotHasDurableContent(serviceSnapshot) || !snapshotHasDurableContent(model.store.snapshot())) {
      projectHydratedSnapshotIntoModel(model, serviceSnapshot);
      model.localService.lastMessage = 'Connected to local service and loaded durable state.';
    } else {
      model.localService.lastMessage = 'Connected to empty local service; current browser state was kept until you save.';
    }
    model.localService.status = 'connected';
    return { ok: true, message: model.localService.lastMessage };
  } catch (error) {
    model.localService.status = 'error';
    model.localService.lastMessage = error instanceof Error ? error.message : String(error);
    return { ok: false, message: model.localService.lastMessage };
  }
}

export function setLocalServiceBaseUrl(model: AppModel, baseUrl: string): void {
  model.localService.baseUrl = baseUrl;
}

export function setLocalServiceAutosave(model: AppModel, enabled: boolean): void {
  model.localService.autosaveEnabled = enabled;
}

export function persistIfLocalServiceAutosaveEnabled(model: AppModel): void {
  if (model.localService.autosaveEnabled && model.localService.status === 'connected') {
    void saveModelToLocalService(model);
  }
}

export function activeCueAtTime(cues: readonly Cue[], timeMs: number): Cue | null {
  return cues.find((c) => c.startMs <= timeMs && c.endMs > timeMs) ?? null;
}

export function clampPlaybackRate(rate: number): number {
  const clamped = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
  return Math.round(clamped / PLAYBACK_RATE_STEP) * PLAYBACK_RATE_STEP;
}

export function setPlaybackRate(model: AppModel, rate: number): void {
  model.player.playbackRate = clampPlaybackRate(rate);
}

export function cueIndex(cues: readonly Cue[], cueId: string): number {
  return cues.findIndex((c) => c.id === cueId);
}

export function previousCue(cues: readonly Cue[], cueId: string): Cue | null {
  const idx = cueIndex(cues, cueId);
  return cues[idx - 1] ?? null;
}

export function nextCue(cues: readonly Cue[], cueId: string): Cue | null {
  const idx = cueIndex(cues, cueId);
  return cues[idx + 1] ?? null;
}

export function seekToCue(model: AppModel, cue: Cue): void {
  model.player.currentTimeMs = cue.startMs;
  model.player.activeCueId = cue.id;
}

export function seekToTime(model: AppModel, timeMs: number): void {
  model.player.currentTimeMs = Math.max(0, timeMs);
}

export function togglePlay(model: AppModel): void {
  model.player.isPlaying = !model.player.isPlaying;
}

export function toggleLoopCue(model: AppModel): void {
  model.player.loopCue = !model.player.loopCue;
}

export function nativeTextForCue(cue: Cue, nativeTrack: SubtitleTrack | null | undefined, nativeCues: readonly Cue[]): string | undefined {
  if (!nativeTrack) return undefined;
  // Find best native cue overlapping target cue, with tolerance.
  const best = nativeCues.find((nc) => nc.startMs <= cue.endMs + CUE_SYNC_TOLERANCE_MS && nc.endMs > cue.startMs - CUE_SYNC_TOLERANCE_MS);
  return best?.text;
}

export function projectPlayerState(
  player: PlayerState,
  cues: readonly Cue[],
  nativeTrack: SubtitleTrack | null | undefined,
  nativeCues: readonly Cue[],
): {
  currentCue: Cue | null;
  nativeText: string | undefined;
  canPrev: boolean;
  canNext: boolean;
  isLooping: boolean;
} {
  const currentCue = activeCueAtTime(cues, player.currentTimeMs);
  const nativeText = currentCue ? nativeTextForCue(currentCue, nativeTrack, nativeCues) : undefined;
  const currentIdx = currentCue ? cueIndex(cues, currentCue.id) : -1;
  return {
    currentCue,
    nativeText,
    canPrev: currentCue ? currentIdx > 0 : cues.length > 0,
    canNext: currentCue ? currentIdx < cues.length - 1 : cues.length > 0,
    isLooping: player.loopCue,
  };
}

export function applyLoopTolerance(videoCurrentMs: number, currentCue: Cue | null, loopEnabled: boolean): number | null {
  if (!loopEnabled || !currentCue) return null;
  const isPastCue = videoCurrentMs > currentCue.endMs + CUE_SYNC_TOLERANCE_MS;
  const isBeforeCue = videoCurrentMs < currentCue.startMs - CUE_SYNC_TOLERANCE_MS;
  if (isPastCue || isBeforeCue) {
    return currentCue.startMs;
  }
  return null;
}

function isNodeRuntime(): boolean {
  const maybeProcess = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return typeof maybeProcess?.versions?.node === 'string';
}

function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Bytes(bytes: ArrayBuffer | Uint8Array): Promise<Sha256Digest> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new TypeError('Browser fixture import requires Web Crypto SHA-256 support.');
  }
  const input: ArrayBuffer = bytes instanceof Uint8Array ? (bytes.slice().buffer as ArrayBuffer) : bytes;
  const digest = await subtle.digest('SHA-256', input);
  return `sha256:${hexFromBytes(new Uint8Array(digest))}` as Sha256Digest;
}

async function sha256BrowserText(text: string): Promise<Sha256Digest> {
  return sha256Bytes(new TextEncoder().encode(text));
}

function normalizeBrowserCueText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const srtTimestampPattern = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/;

function parseBrowserSrtTimestamp(value: string): number {
  const match = srtTimestampPattern.exec(value);
  if (!match) {
    throw new TypeError(`Invalid SRT timestamp: ${value}`);
  }
  return (
    Number.parseInt(match[1]!, 10) * 3_600_000 +
    Number.parseInt(match[2]!, 10) * 60_000 +
    Number.parseInt(match[3]!, 10) * 1_000 +
    Number.parseInt(match[4]!, 10)
  );
}

async function parseBrowserSrtText(input: {
  mediaId: string;
  language: string;
  role: 'target' | 'native' | 'other';
  path: string;
  text: string;
  isActive?: boolean;
  sourceKind?: SourceKind;
}): Promise<{ track: SubtitleTrack; cues: Cue[] }> {
  const track = makeSubtitleTrack({
    mediaId: input.mediaId,
    language: input.language,
    role: input.role,
    format: 'srt',
    sourceKind: input.sourceKind ?? 'synthetic',
    sourcePath: input.path,
    contentSha256: await sha256BrowserText(input.text),
    isActive: input.isActive ?? true,
  });

  const blocks = input.text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  const cues: Cue[] = [];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;
    const lines = block.split('\n').map((line) => line.trim());
    const firstLine = lines[0] ?? '';
    if (!/^\d+$/.test(firstLine)) {
      throw new TypeError(`SRT block ${index} missing numeric cue id`);
    }
    const cueIndex = Number.parseInt(firstLine, 10);
    const timingLine = lines[1] ?? '';
    const timingMatch = /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/.exec(timingLine);
    if (!timingMatch) {
      throw new TypeError(`SRT block ${cueIndex} has invalid timing line: ${timingLine}`);
    }
    const startMs = parseBrowserSrtTimestamp(timingMatch[1]!);
    const endMs = parseBrowserSrtTimestamp(timingMatch[2]!);
    if (endMs <= startMs) {
      throw new TypeError(`SRT block ${cueIndex} end time must be after start time`);
    }
    const text = normalizeBrowserCueText(lines.slice(2).join('\n'));
    if (text.length === 0) {
      throw new TypeError(`SRT block ${cueIndex} has empty cue text`);
    }
    cues.push(
      makeCue({
        trackId: track.id,
        cueIndex,
        startMs,
        endMs,
        text,
        normalizedText: text.toLowerCase(),
        textSha256: await sha256BrowserText(text),
      }),
    );
  }

  for (let i = 1; i < cues.length; i++) {
    const prev = cues[i - 1]!;
    const curr = cues[i]!;
    if (curr.startMs < prev.endMs) {
      throw new TypeError(
        `SRT cue ${curr.cueIndex} starts at ${curr.startMs}ms before previous cue ${prev.cueIndex} ends at ${prev.endMs}ms`,
      );
    }
  }

  return { track, cues };
}

async function importBrowserSyntheticFixture(
  model: AppModel,
  mediaPath: string,
  targetSrtPath: string,
  nativeSrtPath?: string,
): Promise<void> {
  const response = await fetch(browserFixtureMediaUrl);
  if (!response.ok) {
    throw new TypeError(`Unable to load browser synthetic media fixture: ${response.status} ${response.statusText}`);
  }
  const mediaBytes = await response.arrayBuffer();
  const container = mediaPath.split('.').pop()?.toLowerCase() ?? 'webm';
  const durationMs = Math.max(1000, Math.round(mediaBytes.byteLength / 50_000) * 1000);
  const asset = makeMediaAsset({
    title: 'Synthetic Polish Dialogue',
    originalPath: browserFixtureMediaUrl,
    contentSha256: await sha256Bytes(mediaBytes),
    durationMs,
    container,
    sizeBytes: mediaBytes.byteLength,
    privacyLabel: 'synthetic',
  });

  const targetParsed = await parseBrowserSrtText({
    mediaId: asset.id,
    language: 'pl',
    role: 'target',
    path: targetSrtPath,
    text: browserFixtureTargetSrt,
  });
  const nativeParsed = nativeSrtPath
    ? await parseBrowserSrtText({
        mediaId: asset.id,
        language: 'en',
        role: 'native',
        path: nativeSrtPath,
        text: browserFixtureNativeSrt,
      })
    : null;

  model.store.putMediaAsset(asset);
  model.store.putSubtitleTrack(targetParsed.track);
  if (nativeParsed) model.store.putSubtitleTrack(nativeParsed.track);
  for (const cue of targetParsed.cues) {
    model.store.putCue(cue);
  }
  if (nativeParsed) {
    for (const cue of nativeParsed.cues) {
      model.store.putCue(cue);
    }
  }

  model.currentMedia = asset;
  model.targetTrackId = targetParsed.track.id;
  model.nativeTrackId = nativeParsed?.track.id ?? null;
  model.cues = model.store.listCuesForTrack(targetParsed.track.id);
  model.player.durationMs = durationMs;
  model.player.activeCueId = model.cues[0]?.id ?? null;
  model.importError = null;
}

export type BrowserLocalFileImportInput = Readonly<{
  mediaFile: File;
  targetSubtitleFile?: File | null;
  nativeSubtitleFile?: File | null;
  targetLanguage?: string;
  nativeLanguage?: string;
}>;

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName || 'Imported local media';
}

function containerFromFile(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension) return extension;
  return file.type.split('/').pop()?.toLowerCase() || 'unknown';
}

function revokeCurrentMediaObjectUrl(model: AppModel): void {
  const currentPath = model.currentMedia?.originalPath;
  if (currentPath?.startsWith('blob:')) {
    URL.revokeObjectURL(currentPath);
  }
}

export async function importBrowserLocalFiles(model: AppModel, input: BrowserLocalFileImportInput): Promise<void> {
  if (typeof URL.createObjectURL !== 'function') {
    throw new TypeError('Browser local media import requires URL.createObjectURL support.');
  }
  const mediaBytes = await input.mediaFile.arrayBuffer();
  const objectUrl = URL.createObjectURL(input.mediaFile);
  try {
    const targetText = input.targetSubtitleFile ? await input.targetSubtitleFile.text() : null;
    const nativeText = input.nativeSubtitleFile ? await input.nativeSubtitleFile.text() : null;
    const asset = makeMediaAsset({
      title: titleFromFileName(input.mediaFile.name),
      originalPath: objectUrl,
      contentSha256: await sha256Bytes(mediaBytes),
      durationMs: 1000,
      container: containerFromFile(input.mediaFile),
      sizeBytes: input.mediaFile.size,
      privacyLabel: 'owned',
    });
    const targetParsed = input.targetSubtitleFile && targetText !== null
      ? await parseBrowserSrtText({
          mediaId: asset.id,
          language: input.targetLanguage ?? 'pl',
          role: 'target',
          path: input.targetSubtitleFile.name,
          text: targetText,
          sourceKind: 'owned',
        })
      : null;
    const nativeParsed = nativeText && input.nativeSubtitleFile
      ? await parseBrowserSrtText({
          mediaId: asset.id,
          language: input.nativeLanguage ?? 'en',
          role: 'native',
          path: input.nativeSubtitleFile.name,
          text: nativeText,
          sourceKind: 'owned',
        })
      : null;
    const allParsedCues = [...(targetParsed?.cues ?? []), ...(nativeParsed?.cues ?? [])];
    const durationMs = Math.max(1000, ...allParsedCues.map((cue) => cue.endMs));
    const assetWithDuration = { ...asset, durationMs };

    revokeCurrentMediaObjectUrl(model);
    model.store.putMediaAsset(assetWithDuration);
    if (targetParsed) model.store.putSubtitleTrack(targetParsed.track);
    if (nativeParsed) model.store.putSubtitleTrack(nativeParsed.track);
    if (targetParsed) {
      for (const cue of targetParsed.cues) {
        model.store.putCue(cue);
      }
    }
    if (nativeParsed) {
      for (const cue of nativeParsed.cues) {
        model.store.putCue(cue);
      }
    }

    model.currentMedia = assetWithDuration;
    model.targetTrackId = targetParsed?.track.id ?? null;
    model.nativeTrackId = nativeParsed?.track.id ?? null;
    model.cues = targetParsed ? model.store.listCuesForTrack(targetParsed.track.id) : [];
    model.player.durationMs = durationMs;
    model.player.currentTimeMs = 0;
    model.player.activeCueId = model.cues[0]?.id ?? null;
    model.importError = null;
    persistIfLocalServiceAutosaveEnabled(model);
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

export type TranscriptSegmentDraft = Readonly<{
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
  words?: readonly TranscriptWordTimingDraft[];
}>;

type TranscriptWordTimingDraft = Readonly<{
  wordIndex: number;
  text: string;
  charStart: number;
  charEnd: number;
  startMs: number;
  endMs: number;
  confidence?: number;
  speakerId?: string;
  sourceKind?: TranscriptWordTimingSourceKind;
}>;

export type YouTubeCaptionProviderResult = Readonly<{
  videoId: string;
  language: string;
  isAutoGenerated: boolean;
  segments: readonly TranscriptSegmentDraft[];
}>;

export type YouTubeCaptionProvider = Readonly<{
  providerId: string;
  privacyMode: 'local' | 'explicit-online';
  readonly calls: number;
  fetchCaptions(input: { url: string; language: string }): Promise<YouTubeCaptionProviderResult>;
}>;

export type LocalAsrProviderResult = Readonly<{
  engine: string;
  modelName: string;
  modelVersion?: string;
  language: string;
  segments: readonly TranscriptSegmentDraft[];
}>;

export type LocalAsrProvider = Readonly<{
  providerId: string;
  privacyMode: 'local';
  readonly calls: number;
  transcribe(input: { media: MediaAsset; language: string }): Promise<LocalAsrProviderResult>;
}>;

export type ElevenLabsScribeProviderResult = Readonly<{
  language: string;
  modelName: 'scribe_v2' | string;
  modelVersion?: string;
  segments: readonly TranscriptSegmentDraft[];
}>;

export type ElevenLabsScribeProvider = Readonly<{
  providerId: string;
  privacyMode: 'explicit-online';
  readonly calls: number;
  transcribe(input: { media: MediaAsset; language: string }): Promise<ElevenLabsScribeProviderResult>;
}>;

export type TranscriptImportResult = Readonly<{ track: SubtitleTrack; cues: Cue[] }>;

export function makeFakeYouTubeCaptionProvider(seed: YouTubeCaptionProviderResult): YouTubeCaptionProvider {
  let callCount = 0;
  return {
    providerId: 'lingotorte.fake-youtube-caption-provider',
    privacyMode: 'local',
    get calls() {
      return callCount;
    },
    async fetchCaptions() {
      callCount += 1;
      return seed;
    },
  };
}

export function makeFakeLocalAsrProvider(seed: LocalAsrProviderResult): LocalAsrProvider {
  let callCount = 0;
  return {
    providerId: 'lingotorte.fake-local-asr-provider',
    privacyMode: 'local',
    get calls() {
      return callCount;
    },
    async transcribe() {
      callCount += 1;
      return seed;
    },
  };
}

export type LocalServiceAsrProviderOptions = Readonly<{
  mediaPath?: string;
  modelName?: string;
  alignWords?: boolean;
  pollAttempts?: number;
  pollDelayMs?: number;
}>;

export type LocalServiceYouTubeCaptionProviderOptions = Readonly<{
  allowPublicRead?: boolean;
  pollAttempts?: number;
  pollDelayMs?: number;
}>;

export type LocalServiceElevenLabsScribeProviderOptions = Readonly<{
  mediaPath?: string;
  modelId?: 'scribe_v2' | string;
  allowOnlineProvider?: boolean;
  pollAttempts?: number;
  pollDelayMs?: number;
}>;

function recordField(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalStringField(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return stringField(value, label);
}

function numberField(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function optionalNumberField(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return numberField(value, label);
}

function transcriptWordTimingSourceKind(value: unknown): TranscriptWordTimingSourceKind | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'provider-word-timing' || value === 'forced-alignment' || value === 'manual-edit') return value;
  throw new TypeError(`Unsupported transcript word timing source kind: ${String(value)}`);
}

function transcriptWordTimingDraftFromJson(value: unknown, index: number): TranscriptWordTimingDraft {
  const word = recordField(value, `local service transcript word ${index + 1}`);
  const confidence = optionalNumberField(word.confidence, 'word confidence');
  const speakerId = optionalStringField(word.speakerId, 'word speakerId');
  const sourceKind = transcriptWordTimingSourceKind(word.sourceKind);
  return {
    wordIndex: numberField(word.wordIndex, 'wordIndex'),
    text: stringField(word.text, 'word text'),
    charStart: numberField(word.charStart, 'word charStart'),
    charEnd: numberField(word.charEnd, 'word charEnd'),
    startMs: numberField(word.startMs, 'word startMs'),
    endMs: numberField(word.endMs, 'word endMs'),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(speakerId !== undefined ? { speakerId } : {}),
    ...(sourceKind !== undefined ? { sourceKind } : {}),
  };
}

function transcriptSegmentDraftFromJson(value: unknown, index: number): TranscriptSegmentDraft {
  const segment = recordField(value, `local service transcript segment ${index + 1}`);
  const wordsValue = segment.words;
  const words = wordsValue === undefined
    ? undefined
    : Array.isArray(wordsValue)
      ? wordsValue.map(transcriptWordTimingDraftFromJson)
      : (() => { throw new TypeError('local service transcript segment words must be an array.'); })();
  const confidence = optionalNumberField(segment.confidence, 'segment confidence');
  return {
    startMs: numberField(segment.startMs, 'segment startMs'),
    endMs: numberField(segment.endMs, 'segment endMs'),
    text: stringField(segment.text, 'segment text'),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(words !== undefined ? { words } : {}),
  };
}

function localServiceAsrResultFromJson(value: unknown): LocalAsrProviderResult {
  const transcript = recordField(value, 'local service transcription result');
  const segments = transcript.segments;
  if (!Array.isArray(segments)) {
    throw new TypeError('local service transcription result segments must be an array.');
  }
  const modelVersion = optionalStringField(transcript.modelVersion, 'transcription modelVersion');
  return {
    engine: stringField(transcript.engine, 'transcription engine'),
    modelName: stringField(transcript.modelName, 'transcription modelName'),
    ...(modelVersion !== undefined ? { modelVersion } : {}),
    language: stringField(transcript.language, 'transcription language'),
    segments: segments.map(transcriptSegmentDraftFromJson),
  };
}

function youtubeCaptionResultFromJson(value: unknown): YouTubeCaptionProviderResult {
  const caption = recordField(value, 'local service YouTube caption result');
  const segments = caption.segments;
  if (!Array.isArray(segments)) {
    throw new TypeError('local service YouTube caption result segments must be an array.');
  }
  return {
    videoId: stringField(caption.videoId, 'YouTube caption videoId'),
    language: stringField(caption.language, 'YouTube caption language'),
    isAutoGenerated: Boolean(caption.isAutoGenerated),
    segments: segments.map(transcriptSegmentDraftFromJson),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function makeLocalServiceAsrProvider(baseUrl: string, options: LocalServiceAsrProviderOptions = {}): LocalAsrProvider {
  let callCount = 0;
  return {
    providerId: 'lingotorte.loopback-local-service-asr',
    privacyMode: 'local',
    get calls() {
      return callCount;
    },
    async transcribe(input) {
      callCount += 1;
      const mediaPath = options.mediaPath?.trim() || input.media.originalPath;
      if (!mediaPath.startsWith('/')) {
        throw new TypeError('Local service ASR requires a durable absolute local media path. Browser blob media must be reselected or imported through the loopback service before transcription.');
      }
      const createResponse = await fetchLocalServiceJson(baseUrl, '/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'local-transcription',
          payload: {
            mediaPath,
            language: input.language,
            modelName: options.modelName ?? 'tiny',
            alignWords: options.alignWords ?? true,
          },
        }),
      });
      const createdJob = recordField(createResponse.job, 'local service created job');
      const jobId = stringField(createdJob.id, 'local service job id');
      const attempts = options.pollAttempts ?? 120;
      const delayMs = options.pollDelayMs ?? 1000;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const jobResponse = await fetchLocalServiceJson(baseUrl, `/api/jobs/${encodeURIComponent(jobId)}`);
        const job = recordField(jobResponse.job, 'local service transcription job');
        const status = stringField(job.status, 'local service transcription job status');
        if (status === 'completed') {
          const result = recordField(job.result, 'local service transcription job result');
          return localServiceAsrResultFromJson(result.transcript);
        }
        if (status === 'failed' || status === 'cancelled') {
          const message = optionalStringField(job.message, 'local service transcription job message') ?? `status ${status}`;
          throw new TypeError(`Local service transcription job did not complete: ${message}`);
        }
        if (delayMs > 0) await sleep(delayMs);
      }
      throw new TypeError(`Local service transcription job ${jobId} did not finish before the polling deadline.`);
    },
  };
}

export function makeLocalServiceElevenLabsScribeProvider(baseUrl: string, options: LocalServiceElevenLabsScribeProviderOptions = {}): ElevenLabsScribeProvider {
  let callCount = 0;
  return {
    providerId: 'lingotorte.loopback-local-service-elevenlabs-scribe',
    privacyMode: 'explicit-online',
    get calls() {
      return callCount;
    },
    async transcribe(input) {
      callCount += 1;
      const mediaPath = options.mediaPath?.trim() || input.media.originalPath;
      if (!mediaPath.startsWith('/')) {
        throw new TypeError('ElevenLabs Scribe requires a durable absolute local media path. Browser blob media must be reselected or imported through the loopback service before transcription.');
      }
      const createResponse = await fetchLocalServiceJson(baseUrl, '/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'elevenlabs-scribe',
          payload: {
            mediaPath,
            language: input.language,
            modelId: options.modelId ?? 'scribe_v2',
            allowOnlineProvider: options.allowOnlineProvider === true,
          },
        }),
      });
      const createdJob = recordField(createResponse.job, 'local service created ElevenLabs Scribe job');
      const jobId = stringField(createdJob.id, 'local service ElevenLabs Scribe job id');
      const attempts = options.pollAttempts ?? 120;
      const delayMs = options.pollDelayMs ?? 1000;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const jobResponse = await fetchLocalServiceJson(baseUrl, `/api/jobs/${encodeURIComponent(jobId)}`);
        const job = recordField(jobResponse.job, 'local service ElevenLabs Scribe job');
        const status = stringField(job.status, 'local service ElevenLabs Scribe job status');
        if (status === 'completed') {
          const result = recordField(job.result, 'local service ElevenLabs Scribe job result');
          const transcript = localServiceAsrResultFromJson(result.transcript);
          return {
            language: transcript.language,
            modelName: transcript.modelName,
            ...(transcript.modelVersion !== undefined ? { modelVersion: transcript.modelVersion } : {}),
            segments: transcript.segments,
          };
        }
        if (status === 'failed' || status === 'cancelled') {
          const message = optionalStringField(job.message, 'local service ElevenLabs Scribe job message') ?? `status ${status}`;
          throw new TypeError(`Local service ElevenLabs Scribe job did not complete: ${message}`);
        }
        if (delayMs > 0) await sleep(delayMs);
      }
      throw new TypeError(`Local service ElevenLabs Scribe job ${jobId} did not finish before the polling deadline.`);
    },
  };
}

export function makeLocalServiceYouTubeCaptionProvider(baseUrl: string, options: LocalServiceYouTubeCaptionProviderOptions = {}): YouTubeCaptionProvider {
  let callCount = 0;
  return {
    providerId: 'lingotorte.loopback-local-service-youtube-caption',
    privacyMode: 'explicit-online',
    get calls() {
      return callCount;
    },
    async fetchCaptions(input) {
      callCount += 1;
      const createResponse = await fetchLocalServiceJson(baseUrl, '/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'youtube-caption',
          payload: {
            url: input.url,
            language: input.language,
            allowPublicRead: options.allowPublicRead === true,
          },
        }),
      });
      const createdJob = recordField(createResponse.job, 'local service created YouTube caption job');
      const jobId = stringField(createdJob.id, 'local service YouTube caption job id');
      const attempts = options.pollAttempts ?? 60;
      const delayMs = options.pollDelayMs ?? 1000;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const jobResponse = await fetchLocalServiceJson(baseUrl, `/api/jobs/${encodeURIComponent(jobId)}`);
        const job = recordField(jobResponse.job, 'local service YouTube caption job');
        const status = stringField(job.status, 'local service YouTube caption job status');
        if (status === 'completed') {
          const result = recordField(job.result, 'local service YouTube caption job result');
          return youtubeCaptionResultFromJson(result.caption);
        }
        if (status === 'failed' || status === 'cancelled') {
          const message = optionalStringField(job.message, 'local service YouTube caption job message') ?? `status ${status}`;
          throw new TypeError(`Local service YouTube caption job did not complete: ${message}`);
        }
        if (delayMs > 0) await sleep(delayMs);
      }
      throw new TypeError(`Local service YouTube caption job ${jobId} did not finish before the polling deadline.`);
    },
  };
}

export function makeFakeElevenLabsScribeProvider(seed: ElevenLabsScribeProviderResult): ElevenLabsScribeProvider {
  let callCount = 0;
  return {
    providerId: 'lingotorte.fake-elevenlabs-scribe-provider',
    privacyMode: 'explicit-online',
    get calls() {
      return callCount;
    },
    async transcribe() {
      callCount += 1;
      return seed;
    },
  };
}

function videoIdFromYouTubeUrl(url: string): string {
  const trimmed = url.trim();
  const direct = /^[A-Za-z0-9_-]{11}$/.exec(trimmed);
  if (direct) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').slice(0, 11);
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }
    const queryId = parsed.searchParams.get('v');
    if (queryId && /^[A-Za-z0-9_-]{11}$/.test(queryId)) return queryId;
  } catch {
    // Fall through to the explicit error below.
  }
  throw new TypeError('YouTube caption import requires a public YouTube URL or 11-character video id.');
}

function qualityReportForSegments(
  segments: readonly TranscriptSegmentDraft[],
  warningFlags: readonly TranscriptWarningFlag[],
  manualCorrectionCount = 0,
): TranscriptQualityReport {
  let overlappingCueCount = 0;
  let suspiciousGapCount = 0;
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1]!;
    const curr = segments[i]!;
    if (curr.startMs < prev.endMs) overlappingCueCount += 1;
    if (curr.startMs - prev.endMs > 5000) suspiciousGapCount += 1;
  }
  return {
    segmentCount: segments.length,
    coverageDurationMs: Math.max(0, ...segments.map((segment) => segment.endMs)),
    emptyCueCount: segments.filter((segment) => segment.text.trim().length === 0).length,
    overlongCueCount: segments.filter((segment) => segment.text.length > 180).length,
    overlappingCueCount,
    suspiciousGapCount,
    warningFlags,
    manualCorrectionCount,
  };
}

async function putTranscriptSegments(model: AppModel, input: {
  media: MediaAsset;
  language: string;
  role: 'target' | 'native' | 'other';
  sourcePath: string;
  sourceKind: SourceKind;
  transcriptStatus: SubtitleTrack['transcriptStatus'];
  transcriptSourceKind: TranscriptSourceKind;
  provenance: SubtitleTrack['provenance'];
  qualityReport: TranscriptQualityReport;
  segments: readonly TranscriptSegmentDraft[];
}): Promise<TranscriptImportResult> {
  if (input.segments.length === 0) {
    throw new TypeError('Transcript candidate contains no caption segments.');
  }
  const contentText = input.segments.map((segment) => `${segment.startMs}-${segment.endMs}:${segment.text}`).join('\n');
  const track = makeSubtitleTrack({
    mediaId: input.media.id,
    language: input.language,
    role: input.role,
    format: 'json',
    sourceKind: input.sourceKind,
    sourcePath: input.sourcePath,
    contentSha256: await sha256BrowserText(contentText),
    isActive: true,
    transcriptStatus: input.transcriptStatus,
    transcriptSourceKind: input.transcriptSourceKind,
    provenance: input.provenance,
    qualityReport: input.qualityReport,
  });
  const cues: Cue[] = [];
  for (let index = 0; index < input.segments.length; index++) {
    const segment = input.segments[index]!;
    const text = normalizeBrowserCueText(segment.text);
    if (!text) throw new TypeError(`Transcript segment ${index + 1} has empty cue text`);
    if (segment.endMs <= segment.startMs) throw new TypeError(`Transcript segment ${index + 1} end time must be after start time`);
    cues.push(makeCue({
      trackId: track.id,
      cueIndex: index + 1,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text,
      normalizedText: text.toLowerCase(),
      textSha256: await sha256BrowserText(text),
    }));
  }
  model.store.putMediaAsset(input.media);
  model.store.putSubtitleTrack(track);
  for (const cue of cues) model.store.putCue(cue);
  model.currentMedia = input.media;
  model.targetTrackId = track.id;
  model.cues = model.store.listCuesForTrack(track.id);
  model.player.durationMs = Math.max(input.media.durationMs, input.qualityReport.coverageDurationMs);
  model.player.currentTimeMs = 0;
  model.player.activeCueId = model.cues[0]?.id ?? null;
  model.importError = null;
  persistIfLocalServiceAutosaveEnabled(model);
  return { track, cues };
}

function putTranscriptWordTimingsForSegments(model: AppModel, input: {
  imported: TranscriptImportResult;
  segments: readonly TranscriptSegmentDraft[];
  sourceKind: TranscriptWordTimingSourceKind;
  engine: string;
  modelName: string;
  modelVersion?: string;
}): void {
  for (let segmentIndex = 0; segmentIndex < input.segments.length; segmentIndex++) {
    const segment = input.segments[segmentIndex]!;
    const cue = input.imported.cues[segmentIndex];
    if (!cue) throw new TypeError(`Transcript word timings reference missing cue for segment ${segmentIndex + 1}`);
    for (const word of segment.words ?? []) {
      const text = normalizeBrowserCueText(word.text);
      if (!text) throw new TypeError(`Transcript word timing ${word.wordIndex} has empty text`);
      if (word.endMs <= word.startMs) throw new TypeError(`Transcript word timing ${word.wordIndex} end time must be after start time`);
      model.store.putTranscriptWordTiming(makeTranscriptWordTiming({
        trackId: input.imported.track.id,
        cueId: cue.id,
        wordIndex: word.wordIndex,
        charStart: word.charStart,
        charEnd: word.charEnd,
        text,
        normalizedText: text.toLowerCase(),
        startMs: word.startMs,
        endMs: word.endMs,
        sourceKind: word.sourceKind ?? input.sourceKind,
        engine: input.engine,
        modelName: input.modelName,
        ...(word.confidence !== undefined ? { confidence: word.confidence } : {}),
        ...(word.speakerId !== undefined ? { speakerId: word.speakerId } : {}),
        ...(input.modelVersion !== undefined ? { modelVersion: input.modelVersion } : {}),
      }));
    }
  }
}

export async function importYouTubeCaptionCandidate(
  model: AppModel,
  input: { url: string; language: string; allowPublicRead: boolean },
  provider: YouTubeCaptionProvider,
): Promise<TranscriptImportResult> {
  if (!input.allowPublicRead) {
    throw new TypeError('YouTube caption import disabled: explicit public-read authorization is required.');
  }
  const expectedVideoId = videoIdFromYouTubeUrl(input.url);
  const result = await provider.fetchCaptions({ url: input.url, language: input.language });
  const videoId = result.videoId || expectedVideoId;
  const warningFlags: TranscriptWarningFlag[] = result.isAutoGenerated
    ? ['providerCaption', 'autoCaption', 'timingUnverified']
    : ['providerCaption', 'timingUnverified'];
  const contentHashInput = JSON.stringify({ url: input.url, videoId, segments: result.segments });
  const media = makeMediaAsset({
    title: `YouTube caption candidate ${videoId}`,
    originalPath: `youtube:${videoId}`,
    contentSha256: await sha256BrowserText(contentHashInput),
    durationMs: Math.max(1000, ...result.segments.map((segment) => segment.endMs)),
    container: 'caption-candidate',
    sizeBytes: new TextEncoder().encode(contentHashInput).byteLength,
    privacyLabel: 'licensed',
  });
  return putTranscriptSegments(model, {
    media,
    language: result.language,
    role: 'target',
    sourcePath: `youtube:${videoId}:${result.language}`,
    sourceKind: 'licensed',
    transcriptStatus: 'draft',
    transcriptSourceKind: result.isAutoGenerated ? 'youtube-auto-caption' : 'youtube-caption',
    provenance: {
      sourceUrl: input.url,
      sourceVideoId: videoId,
      retrievedAt: new Date().toISOString(),
      language: result.language,
      isAutoGenerated: result.isAutoGenerated,
      warningFlags,
    },
    qualityReport: qualityReportForSegments(result.segments, warningFlags),
    segments: result.segments,
  });
}

export async function generateLocalAsrDraft(model: AppModel, provider: LocalAsrProvider, language = 'pl'): Promise<TranscriptImportResult> {
  if (!model.currentMedia) {
    throw new TypeError('Local ASR draft generation requires a current local/owned media asset.');
  }
  const result = await provider.transcribe({ media: model.currentMedia, language });
  const warningFlags: TranscriptWarningFlag[] = ['asrDraft', 'timingUnverified', 'qualityUnreviewed'];
  const imported = await putTranscriptSegments(model, {
    media: model.currentMedia,
    language: result.language,
    role: 'target',
    sourcePath: `local-asr:${model.currentMedia.id}:${provider.providerId}`,
    sourceKind: model.currentMedia.privacyLabel,
    transcriptStatus: 'draft',
    transcriptSourceKind: 'local-asr',
    provenance: {
      generatedAt: new Date().toISOString(),
      language: result.language,
      engine: result.engine,
      modelName: result.modelName,
      ...(result.modelVersion !== undefined ? { modelVersion: result.modelVersion } : {}),
      warningFlags,
    },
    qualityReport: qualityReportForSegments(result.segments, warningFlags),
    segments: result.segments,
  });
  putTranscriptWordTimingsForSegments(model, {
    imported,
    segments: result.segments,
    sourceKind: 'provider-word-timing',
    engine: result.engine,
    modelName: result.modelName,
    ...(result.modelVersion !== undefined ? { modelVersion: result.modelVersion } : {}),
  });
  persistIfLocalServiceAutosaveEnabled(model);
  return imported;
}

export async function generateElevenLabsScribeDraft(
  model: AppModel,
  provider: ElevenLabsScribeProvider,
  input: { language: string; allowOnlineProvider: boolean },
): Promise<TranscriptImportResult> {
  if (!input.allowOnlineProvider) {
    throw new TypeError('ElevenLabs Scribe draft generation disabled: explicit provider consent is required.');
  }
  if (!model.currentMedia) {
    throw new TypeError('ElevenLabs Scribe draft generation requires a current local/owned media asset.');
  }
  const result = await provider.transcribe({ media: model.currentMedia, language: input.language });
  const warningFlags: TranscriptWarningFlag[] = ['asrDraft', 'qualityUnreviewed'];
  const imported = await putTranscriptSegments(model, {
    media: model.currentMedia,
    language: result.language,
    role: 'target',
    sourcePath: `online-asr:elevenlabs:${model.currentMedia.id}:${provider.providerId}`,
    sourceKind: model.currentMedia.privacyLabel,
    transcriptStatus: 'draft',
    transcriptSourceKind: 'online-asr',
    provenance: {
      generatedAt: new Date().toISOString(),
      language: result.language,
      engine: 'elevenlabs',
      modelName: result.modelName,
      ...(result.modelVersion !== undefined ? { modelVersion: result.modelVersion } : {}),
      warningFlags,
    },
    qualityReport: qualityReportForSegments(result.segments, warningFlags),
    segments: result.segments,
  });

  putTranscriptWordTimingsForSegments(model, {
    imported,
    segments: result.segments,
    sourceKind: 'provider-word-timing',
    engine: 'elevenlabs',
    modelName: result.modelName,
    ...(result.modelVersion !== undefined ? { modelVersion: result.modelVersion } : {}),
  });

  persistIfLocalServiceAutosaveEnabled(model);
  return imported;
}

export type TranscriptCorrectionWordTimingEdit = Readonly<{
  wordIndex: number;
  text: string;
  charStart: number;
  charEnd: number;
  startMs: number;
  endMs: number;
  confidence?: number;
  speakerId?: string;
}>;

export type TranscriptCorrectionEdit = Readonly<{
  cueId: string;
  text?: string;
  startMs?: number;
  endMs?: number;
  wordTimings?: readonly TranscriptCorrectionWordTimingEdit[];
}>;

export async function createCorrectedTranscriptVersion(
  model: AppModel,
  parentTrackId: string,
  edits: readonly TranscriptCorrectionEdit[],
): Promise<TranscriptImportResult> {
  const parent = model.store.getSubtitleTrack(parentTrackId);
  if (!parent) throw new TypeError(`Cannot correct missing transcript track ${parentTrackId}`);
  const parentCues = model.store.listCuesForTrack(parentTrackId);
  if (parentCues.length === 0) throw new TypeError('Cannot correct transcript track with no cues.');
  const editsByCueId = new Map(edits.map((edit) => [edit.cueId, edit]));
  const segments = parentCues.map((cue) => {
    const edit = editsByCueId.get(cue.id);
    return {
      startMs: edit?.startMs ?? cue.startMs,
      endMs: edit?.endMs ?? cue.endMs,
      text: edit?.text ?? cue.text,
    };
  });
  const manualCorrectionCount = parentCues.filter((cue, index) => {
    const segment = segments[index]!;
    return segment.text !== cue.text || segment.startMs !== cue.startMs || segment.endMs !== cue.endMs;
  }).length;
  const warningFlags: TranscriptWarningFlag[] = ['qualityUnreviewed'];
  const media = model.store.getMediaAsset(parent.mediaId);
  if (!media) throw new TypeError(`Cannot correct transcript without media asset ${parent.mediaId}`);
  const result = await putTranscriptSegments(model, {
    media,
    language: parent.language,
    role: parent.role,
    sourcePath: `${parent.sourcePath}#manual-edit-v${parent.trackVersion + 1}`,
    sourceKind: parent.sourceKind,
    transcriptStatus: 'correcting',
    transcriptSourceKind: 'manual-edit',
    provenance: {
      language: parent.language,
      parentTrackId: parent.id,
      parentTrackSha256: parent.contentSha256,
      warningFlags,
    },
    qualityReport: qualityReportForSegments(segments, warningFlags, manualCorrectionCount),
    segments,
  });
  const correctedTrack = { ...result.track, trackVersion: parent.trackVersion + 1 };
  model.store.putSubtitleTrack(correctedTrack);
  for (let cueIndex = 0; cueIndex < parentCues.length; cueIndex++) {
    const parentCue = parentCues[cueIndex]!;
    const correctedCue = result.cues[cueIndex];
    const edit = editsByCueId.get(parentCue.id);
    if (!correctedCue || !edit?.wordTimings || edit.wordTimings.length === 0) continue;
    for (const word of edit.wordTimings) {
      const text = normalizeBrowserCueText(word.text);
      if (!text) throw new TypeError(`Corrected word timing ${word.wordIndex} has empty text`);
      if (word.endMs <= word.startMs) throw new TypeError(`Corrected word timing ${word.wordIndex} end time must be after start time`);
      model.store.putTranscriptWordTiming(makeTranscriptWordTiming({
        trackId: correctedTrack.id,
        cueId: correctedCue.id,
        wordIndex: word.wordIndex,
        charStart: word.charStart,
        charEnd: word.charEnd,
        text,
        normalizedText: text.toLowerCase(),
        startMs: word.startMs,
        endMs: word.endMs,
        sourceKind: 'manual-edit',
        engine: 'manual-correction',
        modelName: 'correction-editor',
        ...(word.confidence !== undefined ? { confidence: word.confidence } : {}),
        ...(word.speakerId !== undefined ? { speakerId: word.speakerId } : {}),
      }));
    }
  }
  model.targetTrackId = correctedTrack.id;
  persistIfLocalServiceAutosaveEnabled(model);
  return { track: correctedTrack, cues: result.cues };
}

function splitCueTextForCorrection(text: string): readonly [string, string] {
  const normalized = normalizeBrowserCueText(text);
  if (!normalized) return ['', ''];
  const midpoint = Math.floor(normalized.length / 2);
  const afterMidpoint = normalized.indexOf(' ', midpoint);
  const beforeMidpoint = normalized.lastIndexOf(' ', midpoint);
  const splitAt = afterMidpoint > 0
    ? afterMidpoint
    : beforeMidpoint > 0
      ? beforeMidpoint
      : midpoint;
  const first = normalizeBrowserCueText(normalized.slice(0, splitAt));
  const second = normalizeBrowserCueText(normalized.slice(splitAt));
  if (first && second) return [first, second];
  const tokens = normalized.split(/\s+/);
  if (tokens.length > 1) {
    const tokenMidpoint = Math.ceil(tokens.length / 2);
    return [tokens.slice(0, tokenMidpoint).join(' '), tokens.slice(tokenMidpoint).join(' ')];
  }
  return [normalized, normalized];
}

async function createStructuralCorrectedTranscriptVersion(
  model: AppModel,
  parentTrackId: string,
  segments: readonly TranscriptSegmentDraft[],
  manualCorrectionCount: number,
): Promise<TranscriptImportResult> {
  const parent = model.store.getSubtitleTrack(parentTrackId);
  if (!parent) throw new TypeError(`Cannot correct missing transcript track ${parentTrackId}`);
  const warningFlags: TranscriptWarningFlag[] = ['qualityUnreviewed'];
  const media = model.store.getMediaAsset(parent.mediaId);
  if (!media) throw new TypeError(`Cannot correct transcript without media asset ${parent.mediaId}`);
  const result = await putTranscriptSegments(model, {
    media,
    language: parent.language,
    role: parent.role,
    sourcePath: `${parent.sourcePath}#manual-structure-v${parent.trackVersion + 1}`,
    sourceKind: parent.sourceKind,
    transcriptStatus: 'correcting',
    transcriptSourceKind: 'manual-edit',
    provenance: {
      language: parent.language,
      parentTrackId: parent.id,
      parentTrackSha256: parent.contentSha256,
      warningFlags,
    },
    qualityReport: qualityReportForSegments(segments, warningFlags, manualCorrectionCount),
    segments,
  });
  const correctedTrack = { ...result.track, trackVersion: parent.trackVersion + 1 };
  model.store.putSubtitleTrack(correctedTrack);
  model.targetTrackId = correctedTrack.id;
  model.cues = model.store.listCuesForTrack(correctedTrack.id);
  persistIfLocalServiceAutosaveEnabled(model);
  return { track: correctedTrack, cues: model.cues };
}

export async function splitTranscriptCueInCorrectedVersion(
  model: AppModel,
  parentTrackId: string,
  cueId: string,
): Promise<TranscriptImportResult> {
  const parentCues = model.store.listCuesForTrack(parentTrackId);
  const target = parentCues.find((cue) => cue.id === cueId);
  if (!target) throw new TypeError(`Cannot split missing cue ${cueId}`);
  const [firstText, secondText] = splitCueTextForCorrection(target.text);
  if (!firstText || !secondText) throw new TypeError(`Cannot split cue ${cueId} into two non-empty cues`);
  const splitMs = Math.max(target.startMs + 1, Math.min(target.endMs - 1, Math.round((target.startMs + target.endMs) / 2)));
  const segments = parentCues.flatMap((cue) => {
    if (cue.id !== cueId) return [{ startMs: cue.startMs, endMs: cue.endMs, text: cue.text }];
    return [
      { startMs: cue.startMs, endMs: splitMs, text: firstText },
      { startMs: splitMs, endMs: cue.endMs, text: secondText },
    ];
  });
  return createStructuralCorrectedTranscriptVersion(model, parentTrackId, segments, 1);
}

export async function mergeTranscriptCueWithNextInCorrectedVersion(
  model: AppModel,
  parentTrackId: string,
  cueId: string,
): Promise<TranscriptImportResult> {
  const parentCues = model.store.listCuesForTrack(parentTrackId);
  const targetIndex = parentCues.findIndex((cue) => cue.id === cueId);
  if (targetIndex < 0) throw new TypeError(`Cannot merge missing cue ${cueId}`);
  const target = parentCues[targetIndex]!;
  const next = parentCues[targetIndex + 1];
  if (!next) throw new TypeError(`Cannot merge cue ${cueId} because it has no next cue`);
  const segments: TranscriptSegmentDraft[] = [];
  for (let index = 0; index < parentCues.length; index++) {
    const cue = parentCues[index]!;
    if (index === targetIndex) {
      segments.push({
        startMs: target.startMs,
        endMs: next.endMs,
        text: normalizeBrowserCueText(`${target.text} ${next.text}`),
      });
      index++;
      continue;
    }
    segments.push({ startMs: cue.startMs, endMs: cue.endMs, text: cue.text });
  }
  return createStructuralCorrectedTranscriptVersion(model, parentTrackId, segments, 1);
}

export function approveTranscriptTrack(model: AppModel, trackId: string, approvedAt = new Date().toISOString()): SubtitleTrack {
  const track = model.store.getSubtitleTrack(trackId);
  if (!track) throw new TypeError(`Cannot approve missing transcript track ${trackId}`);
  const segments = model.store.listCuesForTrack(trackId).map((cue) => ({ startMs: cue.startMs, endMs: cue.endMs, text: cue.text }));
  const qualityReport = {
    ...(track.qualityReport ?? qualityReportForSegments(segments, track.provenance.warningFlags)),
    approvedAt,
  };
  const approved = { ...track, transcriptStatus: 'approved' as const, qualityReport };
  model.store.putSubtitleTrack(approved);
  persistIfLocalServiceAutosaveEnabled(model);
  return approved;
}

export type YtDlpMediaAcquisitionPlan = Readonly<{
  argv: readonly string[];
  command: string;
  effect: 'plan-only';
}>;

export function planYtDlpMediaAcquisition(input: {
  url: string;
  outputDirectory: string;
  includeMedia: boolean;
  allowMediaDownload: boolean;
}): YtDlpMediaAcquisitionPlan {
  if (!input.outputDirectory.startsWith('/')) {
    throw new TypeError('yt-dlp output directory must be an absolute local path, not a repo-relative path.');
  }
  if (input.outputDirectory.includes('..')) {
    throw new TypeError('yt-dlp output directory must not contain parent traversal.');
  }
  videoIdFromYouTubeUrl(input.url);
  if (input.includeMedia && !input.allowMediaDownload) {
    throw new TypeError('YouTube media download requires rights/permission confirmation.');
  }
  const argv = [
    'yt-dlp',
    '--no-playlist',
    ...(!input.includeMedia ? ['--skip-download'] : []),
    '--write-subs',
    '--write-auto-subs',
    '--sub-format',
    'srt/vtt',
    '--paths',
    input.outputDirectory,
    input.url,
  ];
  return {
    argv,
    command: argv.map((part) => (/[\s'\"]/.test(part) ? JSON.stringify(part) : part)).join(' '),
    effect: 'plan-only',
  };
}

export async function importTargetOnlyFixture(model: AppModel, mediaPath: string, targetSrtPath: string): Promise<void> {
  if (!isNodeRuntime()) {
    await importBrowserSyntheticFixture(model, mediaPath, targetSrtPath);
    return;
  }

  const { sha256File, probeMediaFile } = await import(/* @vite-ignore */ '../../../packages/storage/src/mediaHelpers');
  const { importSubtitle } = await import(/* @vite-ignore */ '../../../packages/subtitles/src/import');
  const fingerprint = await sha256File(mediaPath);
  const probe = await probeMediaFile(mediaPath);
  const asset = makeMediaAsset({
    title: 'Imported local media',
    originalPath: mediaPath,
    contentSha256: fingerprint,
    durationMs: probe.durationMs,
    container: probe.container,
    sizeBytes: probe.sizeBytes,
    privacyLabel: mediaPath.includes('fixtures/') ? 'synthetic' : 'owned',
  });

  const targetParsed = await importSubtitle({ mediaId: asset.id, language: 'pl', role: 'target', path: targetSrtPath });

  model.store.putMediaAsset(asset);
  model.store.putSubtitleTrack(targetParsed.track);
  for (const cue of targetParsed.cues) {
    model.store.putCue(cue);
  }

  model.currentMedia = asset;
  model.targetTrackId = targetParsed.track.id;
  model.nativeTrackId = null;
  model.cues = model.store.listCuesForTrack(targetParsed.track.id);
  model.player.durationMs = probe.durationMs;
  model.player.activeCueId = model.cues[0]?.id ?? null;
  model.importError = null;
  persistIfLocalServiceAutosaveEnabled(model);
}

export async function importFixtureMediaAndSubtitles(
  model: AppModel,
  mediaPath: string,
  targetSrtPath: string,
  nativeSrtPath: string,
): Promise<void> {
  if (!isNodeRuntime()) {
    await importBrowserSyntheticFixture(model, mediaPath, targetSrtPath, nativeSrtPath);
    return;
  }

  const { sha256File, probeMediaFile } = await import(/* @vite-ignore */ '../../../packages/storage/src/mediaHelpers');
  const { importSubtitle } = await import(/* @vite-ignore */ '../../../packages/subtitles/src/import');
  const fingerprint = await sha256File(mediaPath);
  const probe = await probeMediaFile(mediaPath);
  const asset = makeMediaAsset({
    title: 'Imported local media',
    originalPath: mediaPath,
    contentSha256: fingerprint,
    durationMs: probe.durationMs,
    container: probe.container,
    sizeBytes: probe.sizeBytes,
    privacyLabel: mediaPath.includes('fixtures/') ? 'synthetic' : 'owned',
  });

  const targetParsed = await importSubtitle({ mediaId: asset.id, language: 'pl', role: 'target', path: targetSrtPath });
  const nativeParsed = await importSubtitle({ mediaId: asset.id, language: 'en', role: 'native', path: nativeSrtPath });

  model.store.putMediaAsset(asset);
  model.store.putSubtitleTrack(targetParsed.track);
  model.store.putSubtitleTrack(nativeParsed.track);
  for (const cue of targetParsed.cues) {
    model.store.putCue(cue);
  }
  for (const cue of nativeParsed.cues) {
    model.store.putCue(cue);
  }

  model.currentMedia = asset;
  model.targetTrackId = targetParsed.track.id;
  model.nativeTrackId = nativeParsed.track.id;
  model.cues = model.store.listCuesForTrack(targetParsed.track.id);
  model.player.durationMs = probe.durationMs;
  model.player.activeCueId = model.cues[0]?.id ?? null;
  model.importError = null;
  persistIfLocalServiceAutosaveEnabled(model);
}

function selectionTimeRangeForCue(model: AppModel, cue: Cue, charStart: number, charEnd: number): { start: number; end: number } {
  const overlappingWords = model.store
    .listTranscriptWordTimingsForCue(cue.id)
    .filter((word) => word.charStart < charEnd && word.charEnd > charStart);
  if (overlappingWords.length === 0) {
    return { start: cue.startMs, end: cue.endMs };
  }
  return {
    start: Math.min(...overlappingWords.map((word) => word.startMs)),
    end: Math.max(...overlappingWords.map((word) => word.endMs)),
  };
}

export async function saveSelection(model: AppModel): Promise<SavedItem | null> {
  if (!model.selection || !model.currentMedia || !model.targetTrackId) return null;
  const cue = model.cues.find((c) => c.id === model.selection?.cueId);
  if (!cue || !model.selection) return null;
  const selectionTimeRange = selectionTimeRangeForCue(model, cue, model.selection.charStart, model.selection.charEnd);

  const sourceContext = buildSourceContext(
    model.currentMedia.id,
    model.currentMedia.originalPath,
    model.currentMedia.contentSha256,
    model.targetTrackId,
    cue,
    model.selection.tokenStart,
    model.selection.tokenEnd,
    model.selection.charStart,
    model.selection.charEnd,
    selectionTimeRange,
  );

  const result = model.savedOccurrenceService.saveSelection({
    kind: model.selection.kind,
    language: 'pl',
    displayText: model.selection.text,
    ...(model.pendingMeaning ? { meaning: model.pendingMeaning } : {}),
    ...(model.pendingNotes ? { notes: model.pendingNotes } : {}),
    mediaId: model.currentMedia.id,
    cueId: cue.id,
    startMs: selectionTimeRange.start,
    endMs: selectionTimeRange.end,
    sourceContext,
  });
  persistIfLocalServiceAutosaveEnabled(model);
  return result.item;
}

export async function saveSentenceFromCue(model: AppModel, cue: Cue): Promise<SavedItem | null> {
  if (!model.currentMedia || !model.targetTrackId) return null;
  const sourceContext = buildSourceContext(
    model.currentMedia.id,
    model.currentMedia.originalPath,
    model.currentMedia.contentSha256,
    model.targetTrackId,
    cue,
    0,
    cue.text.split(/\s+/).filter(Boolean).length,
    0,
    cue.text.length,
  );

  const result = model.savedOccurrenceService.saveSelection({
    kind: 'sentence',
    language: 'pl',
    displayText: cue.text,
    mediaId: model.currentMedia.id,
    cueId: cue.id,
    startMs: cue.startMs,
    endMs: cue.endMs,
    sourceContext,
  });
  persistIfLocalServiceAutosaveEnabled(model);
  return result.item;
}

export function saveSelectedPhraseFromCue(model: AppModel, cue: Cue, text: string, charStart: number, charEnd: number, tokenStart: number, tokenEnd: number): SavedItem | null {
  if (!model.currentMedia || !model.targetTrackId) return null;
  const selectionTimeRange = selectionTimeRangeForCue(model, cue, charStart, charEnd);
  const sourceContext = buildSourceContext(
    model.currentMedia.id,
    model.currentMedia.originalPath,
    model.currentMedia.contentSha256,
    model.targetTrackId,
    cue,
    tokenStart,
    tokenEnd,
    charStart,
    charEnd,
    selectionTimeRange,
  );

  const result = model.savedOccurrenceService.saveSelection({
    kind: 'phrase',
    language: 'pl',
    displayText: text,
    mediaId: model.currentMedia.id,
    cueId: cue.id,
    startMs: selectionTimeRange.start,
    endMs: selectionTimeRange.end,
    sourceContext,
  });
  persistIfLocalServiceAutosaveEnabled(model);
  return result.item;
}

export function createReviewCardForSavedItem(
  model: AppModel,
  item: SavedItem,
  occurrence: SavedOccurrence,
  cardType: 'recognition' | 'production' = 'recognition',
): ReviewCard {
  const card = model.reviewService.createCard({
    savedItem: item,
    savedOccurrence: occurrence,
    cardType,
    promptTemplate: cardType === 'recognition' ? `Recognize: ${item.displayText}` : `Produce: ${item.meaning ?? item.displayText}`,
  }).card;
  persistIfLocalServiceAutosaveEnabled(model);
  return card;
}

export function listReviewBuckets(model: AppModel, asOf: Date, bucketConfig?: ReviewBucketConfig): {
  newCards: { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence }[];
  learning: { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence }[];
  review: { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence }[];
  relearning: { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence }[];
  mastered: { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence }[];
} {
  const config = bucketConfig ?? defaultReviewBucketConfig;
  const base = model.reviewService.listBuckets(asOf);
  const enrich = (cs: { card: ReviewCard; state: ReviewCardState }[]) =>
    cs
      .map((cs) => {
        const savedItem = model.store.getSavedItem(cs.card.savedItemId);
        const occurrence = model.store.getSavedOccurrence(cs.card.savedOccurrenceId);
        if (!savedItem || !occurrence) return null;
        return { card: cs.card, state: cs.state, savedItem, occurrence };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

  const isMastered = (state: ReviewCardState) => state.scheduledDays >= config.masteredIntervalDays;

  return {
    newCards: enrich(base.newCards),
    learning: enrich(base.learning).filter((cs) => !isMastered(cs.state)),
    review: enrich(base.review).filter((cs) => !isMastered(cs.state)),
    relearning: enrich(base.relearning).filter((cs) => !isMastered(cs.state)),
    mastered: enrich([...base.newCards, ...base.learning, ...base.review, ...base.relearning]).filter((cs) => isMastered(cs.state)),
  };
}

export function projectReviewBucketCounts(model: AppModel, asOf: Date): Record<'newCards' | 'learning' | 'review' | 'relearning' | 'mastered', number> {
  const buckets = listReviewBuckets(model, asOf);
  return {
    newCards: buckets.newCards.length,
    learning: buckets.learning.length,
    review: buckets.review.length,
    relearning: buckets.relearning.length,
    mastered: buckets.mastered.length,
  };
}

export function pickNextDueCard(model: AppModel, asOf: Date): { card: ReviewCard; state: ReviewCardState; savedItem: SavedItem; occurrence: SavedOccurrence } | null {
  const buckets = listReviewBuckets(model, asOf);
  const candidates = [...buckets.newCards, ...buckets.learning, ...buckets.relearning, ...buckets.review];
  return candidates[0] ?? null;
}

export function submitReviewRating(model: AppModel, cardId: string, rating: Rating, reviewedAt: Date): ReviewCardState {
  const { state } = model.reviewService.submitReview(cardId, rating, reviewedAt);
  persistIfLocalServiceAutosaveEnabled(model);
  return state;
}

export type TokenInfo = { tokenIndex: number; charStart: number; charEnd: number; surface: string };

export function projectPracticeAttempt(
  active: NonNullable<ReturnType<typeof pickNextDueCard>>,
  answer: string,
): {
  result: import('@lingotorte/domain').PracticeResult;
  correct: boolean;
  expected: string;
} {
  const expected = active.savedItem.displayText;
  const normalizedAnswer = answer.trim().toLowerCase();
  const normalizedExpected = expected.trim().toLowerCase();
  const exact = normalizedAnswer === normalizedExpected;
  const contains = normalizedAnswer.length > 0 && normalizedExpected.includes(normalizedAnswer);

  let result: import('@lingotorte/domain').PracticeResult;
  let correct: boolean;
  if (exact) {
    result = 'pass';
    correct = true;
  } else if (contains && normalizedAnswer.length >= Math.min(3, normalizedExpected.length)) {
    result = 'pass-with-hesitation';
    correct = true;
  } else if (answer.trim().length === 0) {
    result = 'skipped';
    correct = false;
  } else {
    result = 'fail';
    correct = false;
  }
  return { result, correct, expected };
}

export function submitPracticeAttempt(model: AppModel, answer: string, reviewedAt: Date): import('@lingotorte/domain').PracticeAttempt {
  const active = pickNextDueCard(model, model.review.bucketAsOf);
  if (!active) throw new TypeError('No active card for practice attempt');
  const { result, expected } = projectPracticeAttempt(active, answer);
  const responseMs = 0;
  const { attempt } = model.practiceService.submitAttempt({
    cardId: active.card.id,
    mode: model.practice.mode,
    result,
    ...(answer.trim().length > 0 ? { givenAnswer: answer.trim() } : {}),
    expectedAnswer: expected,
    responseMs,
    sourceContext: active.occurrence.sourceContext,
    reviewedAt: reviewedAt.toISOString(),
    updateFsrs: true,
  });
  model.practice.lastAttemptResult = { result, correct: result === 'pass' || result === 'pass-with-hesitation' };
  model.practice.pendingAnswer = '';
  model.review.activeCardId = null;
  persistIfLocalServiceAutosaveEnabled(model);
  return attempt;
}

export function setPracticeMode(model: AppModel, mode: import('@lingotorte/domain').PracticeMode): void {
  model.practice.mode = mode;
}

export function setPracticePendingAnswer(model: AppModel, value: string): void {
  model.practice.pendingAnswer = value;
}

export function clearPracticeLastResult(model: AppModel): void {
  model.practice.lastAttemptResult = null;
}

function makeBrowserExportFileName(exportedAt: string): string {
  const date = new Date(exportedAt);
  if (Number.isNaN(date.valueOf())) {
    const safeTimestamp = exportedAt.replace(/[^0-9A-Za-z]+/g, '-').replace(/^-|-$/g, '');
    return `lingotorte-learner-state-${safeTimestamp}.json`;
  }
  const timestamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}${String(date.getUTCSeconds()).padStart(2, '0')}`;
  return `lingotorte-learner-state-${timestamp}.json`;
}

export function exportLearnerState(model: AppModel): { manifest: import('@lingotorte/domain').LearnerExportManifest; fileName: string; manifestJson: string } {
  const manifest = model.exportService.buildManifest();
  const fileName = makeBrowserExportFileName(manifest.exportedAt);
  const manifestJson = JSON.stringify(manifest, null, 2);
  model.exportImport.lastExport = {
    fileName,
    manifestJson,
    recordCount: manifest.integrity.recordCount,
    warningCount: manifest.privacyWarnings.length,
  };
  model.exportImport.lastError = null;
  return { manifest, fileName, manifestJson };
}

export function previewRestoreManifest(model: AppModel, manifestJson: string): import('@lingotorte/domain').RestorePreview {
  const parsed = JSON.parse(manifestJson) as unknown;
  const manifest = RestoreService.validateManifest(parsed);
  const preview = model.restoreService.preview(manifest);
  model.exportImport.manifestJson = manifestJson;
  model.exportImport.preview = preview;
  model.exportImport.lastError = null;
  model.exportImport.acknowledgedWarnings = [];
  model.exportImport.confirmOverwrite = false;
  return preview;
}

export function confirmRestore(model: AppModel): void {
  const preview = model.exportImport.preview;
  if (!preview) throw new TypeError('No restore preview available');
  const manifestJson = model.exportImport.manifestJson;
  if (!manifestJson) throw new TypeError('No restore manifest JSON available');
  const manifest = RestoreService.validateManifest(JSON.parse(manifestJson) as unknown);
  const confirmation = RestoreService.requireConfirmation({
    confirmedAt: new Date().toISOString(),
    confirmOverwrite: model.exportImport.confirmOverwrite,
    acknowledgedWarnings: model.exportImport.acknowledgedWarnings,
  });
  model.restoreService.restore(manifest, confirmation);
  model.exportImport.manifestJson = null;
  model.exportImport.preview = null;
  model.exportImport.lastError = null;
  model.exportImport.acknowledgedWarnings = [];
  model.exportImport.confirmOverwrite = false;
  model.exportImport.lastExport = null;
  persistIfLocalServiceAutosaveEnabled(model);
}

export function setExportImportAcknowledgedWarning(model: AppModel, kind: import('@lingotorte/domain').PrivacyWarningKind, acknowledged: boolean): void {
  const current = new Set(model.exportImport.acknowledgedWarnings);
  if (acknowledged) {
    current.add(kind);
  } else {
    current.delete(kind);
  }
  model.exportImport.acknowledgedWarnings = [...current];
}

export function setExportImportConfirmOverwrite(model: AppModel, value: boolean): void {
  model.exportImport.confirmOverwrite = value;
}

export function setExportImportError(model: AppModel, error: string | null): void {
  model.exportImport.lastError = error;
}

export async function tokenizeCueText(model: AppModel, cue: Cue): Promise<TokenInfo[]> {
  const adapter = model.adapters.tokenizer ?? makeWhitespaceTokenizer('pl');
  const result = await adapter.tokenize({ language: 'pl', cueId: cue.id, text: cue.text, preserveCharOffsets: true });
  return result.tokens.map((t) => ({ tokenIndex: t.tokenIndex, charStart: t.charStart, charEnd: t.charEnd, surface: t.surface }));
}

export async function lookupToken(model: AppModel, token: string, cueId: string): Promise<LookupOutput> {
  const adapter = model.adapters.dictionary ?? makeUnavailableDictionaryAdapter();
  return adapter.lookup({
    target: { kind: 'sentence', cueId, text: token },
    sourceLanguage: 'pl',
    learnerLanguage: 'en',
    context: { cueText: token },
  });
}

export function setTranscriptQuery(model: AppModel, query: string): void {
  model.transcriptQuery = query;
}

export function setView(model: AppModel, view: import('./uiTypes').ViewName): void {
  model.view = view;
}

export type SelectionNonNull = NonNullable<import('./uiTypes').Selection>;

export function setSelection(model: AppModel, selection: NonNullable<import('./uiTypes').Selection>): void {
  model.selection = selection;
}

export function clearSelection(model: AppModel): void {
  model.selection = null;
  model.pendingMeaning = '';
  model.pendingNotes = '';
}

export function setPendingMeaning(model: AppModel, value: string): void {
  model.pendingMeaning = value;
}

export function setPendingNotes(model: AppModel, value: string): void {
  model.pendingNotes = value;
}

export function activateReviewCard(model: AppModel, cardId: string | null): void {
  model.review.activeCardId = cardId;
  model.review.revealed = false;
}

export function toggleReviewReveal(model: AppModel): void {
  model.review.revealed = !model.review.revealed;
}

export function setReviewBucketAsOf(model: AppModel, asOf: Date): void {
  model.review.bucketAsOf = asOf;
}
