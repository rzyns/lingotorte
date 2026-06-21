import { LocalStore, SavedOccurrenceService } from '@lingotorte/storage';
import { defaultProviderPolicy, isoNow, makeReviewCard, makeReviewCardState, makeReviewEvent } from '@lingotorte/domain';
import { resolveLocalAdapters, makeWhitespaceTokenizer, makeUnavailableDictionaryAdapter } from '@lingotorte/language';
import { importSubtitle } from '@lingotorte/subtitles';
import type { Cue, SavedItem, SavedOccurrence, ReviewCard, LookupOutput, SubtitleTrack } from '@lingotorte/domain';
import type { AppModel, PlayerState } from './uiTypes';
import { buildSourceContext } from './uiTypes';

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

export async function importTargetOnlyFixture(model: AppModel, mediaPath: string, targetSrtPath: string): Promise<void> {
  const { sha256File, probeMediaFile } = await import('@lingotorte/storage');
  const fingerprint = await sha256File(mediaPath);
  const probe = await probeMediaFile(mediaPath);
  const { makeMediaAsset } = await import('@lingotorte/domain');
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
  const { sha256File, probeMediaFile } = await import('@lingotorte/storage');
  const fingerprint = await sha256File(mediaPath);
  const probe = await probeMediaFile(mediaPath);
  const { makeMediaAsset } = await import('@lingotorte/domain');
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
  const card = makeReviewCard({
    savedItemId: item.id,
    savedOccurrenceId: occurrence.id,
    cardType,
    promptTemplate: cardType === 'recognition' ? `Recognize: ${item.displayText}` : `Produce: ${item.meaning ?? item.displayText}`,
  });
  const initialState = makeReviewCardState({ cardId: card.id, fsrsVersion: 'local-placeholder' });
  model.store.putReviewCard(card);
  model.store.putReviewCardState(initialState);
  return card;
}

export type TokenInfo = { tokenIndex: number; charStart: number; charEnd: number; surface: string };

export async function tokenizeCueText(model: AppModel, cue: Cue): Promise<TokenInfo[]> {
  const adapter = model.adapters.tokenizer ?? makeWhitespaceTokenizer('pl');
  const result = await adapter.tokenize({ language: 'pl', cueId: cue.id, text: cue.text, preserveCharOffsets: true });
  return result.tokens.map((t) => ({ tokenIndex: t.tokenIndex, charStart: t.charStart, charEnd: t.charEnd, surface: t.surface }));
}

export function recordReviewEvent(
  model: AppModel,
  card: ReviewCard,
  rating: 'again' | 'hard' | 'good' | 'easy',
): void {
  const state = model.store.getReviewCardState(card.id);
  const previousStateJson = JSON.stringify(state ?? { state: 'new', dueAt: isoNow() });
  const nextStateJson = JSON.stringify({ ...(state ?? { state: 'new' }), reps: (state?.reps ?? 0) + 1, lastReviewedAt: isoNow() });
  const event = makeReviewEvent({
    cardId: card.id,
    reviewedAt: isoNow(),
    rating,
    previousStateJson,
    nextStateJson,
  });
  model.store.addReviewEvent(event);
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
