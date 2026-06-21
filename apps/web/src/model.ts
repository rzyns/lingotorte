import { LocalStore } from '@lingotorte/storage';
import { defaultProviderPolicy, isoNow, makeSavedItem, makeSavedOccurrence, makeReviewCard, makeReviewCardState, makeReviewEvent, validateSavedOccurrenceSourceContext } from '@lingotorte/domain';
import { resolveLocalAdapters, makeWhitespaceTokenizer, makeUnavailableDictionaryAdapter } from '@lingotorte/language';
import { importSubtitle } from '@lingotorte/subtitles';
import type { Cue, SavedItem, SavedOccurrence, ReviewCard, LookupOutput } from '@lingotorte/domain';
import type { AppModel } from './uiTypes';
import { buildSourceContext } from './uiTypes';

export function createAppModel(): AppModel {
  const policy = defaultProviderPolicy();
  return {
    store: new LocalStore(),
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
  const validated = validateSavedOccurrenceSourceContext(sourceContext);

  const item = makeSavedItem({
    kind: model.selection.kind,
    language: 'pl',
    displayText: model.selection.text,
    ...(model.pendingMeaning ? { meaning: model.pendingMeaning } : {}),
    ...(model.pendingNotes ? { notes: model.pendingNotes } : {}),
  });
  const occurrence = makeSavedOccurrence({
    savedItemId: item.id,
    mediaId: model.currentMedia.id,
    cueId: cue.id,
    startMs: cue.startMs,
    endMs: cue.endMs,
    selectionKind: model.selection.kind,
    selectionText: model.selection.text,
    sourceContext: validated,
  });

  model.store.putSavedItem(item);
  model.store.putSavedOccurrence(occurrence);
  return item;
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
  const validated = validateSavedOccurrenceSourceContext(sourceContext);

  const item = makeSavedItem({
    kind: 'sentence',
    language: 'pl',
    displayText: cue.text,
  });
  const occurrence = makeSavedOccurrence({
    savedItemId: item.id,
    mediaId: model.currentMedia.id,
    cueId: cue.id,
    startMs: cue.startMs,
    endMs: cue.endMs,
    selectionKind: 'sentence',
    selectionText: cue.text,
    sourceContext: validated,
  });

  model.store.putSavedItem(item);
  model.store.putSavedOccurrence(occurrence);
  return item;
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
