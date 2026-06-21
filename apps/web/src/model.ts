import { LocalStore } from '../../../packages/storage/src/localStore';
import { SavedOccurrenceService } from '../../../packages/storage/src/savedOccurrenceService';
import { PracticeService } from '../../../packages/storage/src/practiceService';
import { ExportService, RestoreService } from '../../../packages/storage/src/exportRestoreService';
import { defaultProviderPolicy, makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';
import { resolveLocalAdapters, makeWhitespaceTokenizer, makeUnavailableDictionaryAdapter } from '@lingotorte/language';
import { ReviewService, defaultFsrsConfig } from '@lingotorte/review';
import type { Cue, SavedItem, SavedOccurrence, ReviewCard, LookupOutput, SubtitleTrack, ReviewCardState, Rating, Sha256Digest } from '@lingotorte/domain';
import type { AppModel, PlayerState, ReviewBucketConfig } from './uiTypes';
import { buildSourceContext, defaultReviewBucketConfig } from './uiTypes';
import browserFixtureMediaUrl from '../../../fixtures/media/synthetic-polish-dialogue.webm?url';
import browserFixtureTargetSrt from '../../../fixtures/subtitles/synthetic-polish-dialogue.target.srt?raw';
import browserFixtureNativeSrt from '../../../fixtures/subtitles/synthetic-polish-dialogue.native.srt?raw';

export const CUE_SYNC_TOLERANCE_MS = 100;
export const MIN_PLAYBACK_RATE = 0.5;
export const MAX_PLAYBACK_RATE = 1.5;
export const PLAYBACK_RATE_STEP = 0.1;

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
  };
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
}): Promise<{ track: SubtitleTrack; cues: Cue[] }> {
  const track = makeSubtitleTrack({
    mediaId: input.mediaId,
    language: input.language,
    role: input.role,
    format: 'srt',
    sourceKind: 'synthetic',
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
}

export async function saveSelection(model: AppModel): Promise<SavedItem | null> {
  if (!model.selection || !model.currentMedia || !model.targetTrackId) return null;
  const cue = model.cues.find((c) => c.id === model.selection?.cueId);
  if (!cue || !model.selection) return null;

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
  );

  const result = model.savedOccurrenceService.saveSelection({
    kind: model.selection.kind,
    language: 'pl',
    displayText: model.selection.text,
    ...(model.pendingMeaning ? { meaning: model.pendingMeaning } : {}),
    ...(model.pendingNotes ? { notes: model.pendingNotes } : {}),
    mediaId: model.currentMedia.id,
    cueId: cue.id,
    startMs: cue.startMs,
    endMs: cue.endMs,
    sourceContext,
  });
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
  return result.item;
}

export function saveSelectedPhraseFromCue(model: AppModel, cue: Cue, text: string, charStart: number, charEnd: number, tokenStart: number, tokenEnd: number): SavedItem | null {
  if (!model.currentMedia || !model.targetTrackId) return null;
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
  );

  const result = model.savedOccurrenceService.saveSelection({
    kind: 'phrase',
    language: 'pl',
    displayText: text,
    mediaId: model.currentMedia.id,
    cueId: cue.id,
    startMs: cue.startMs,
    endMs: cue.endMs,
    sourceContext,
  });
  return result.item;
}

export function createReviewCardForSavedItem(
  model: AppModel,
  item: SavedItem,
  occurrence: SavedOccurrence,
  cardType: 'recognition' | 'production' = 'recognition',
): ReviewCard {
  return model.reviewService.createCard({
    savedItem: item,
    savedOccurrence: occurrence,
    cardType,
    promptTemplate: cardType === 'recognition' ? `Recognize: ${item.displayText}` : `Produce: ${item.meaning ?? item.displayText}`,
  }).card;
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

export function exportLearnerState(model: AppModel): { manifest: import('@lingotorte/domain').LearnerExportManifest; filePath: string } {
  const result = model.exportService.exportToFile('/tmp/lingotorte');
  model.exportImport.lastExport = {
    filePath: result.filePath,
    recordCount: result.manifest.integrity.recordCount,
    warningCount: result.manifest.privacyWarnings.length,
  };
  model.exportImport.lastError = null;
  return result;
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
