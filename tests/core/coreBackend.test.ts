import { describe, expect, it } from 'vitest';
import { LocalStore } from '../../packages/storage/src/localStore';
import { makeMediaAsset, makeSavedItem, makeSavedOccurrence, makeReviewCard, makeReviewCardState, makeReviewEvent, validateSavedOccurrenceSourceContext } from '../../packages/domain/src';
import { sha256File, sha256Text, probeMediaFile } from '../../packages/storage/src/mediaHelpers';
import { parseSrt, importSubtitle } from '../../packages/subtitles/src/import';
import { makeWhitespaceTokenizer, resolveLocalAdapters, assertProvidersDisabled } from '../../packages/language/src/adapters';
import { defaultProviderPolicy } from '../../packages/domain/src/providerPolicy';

const fixtureMediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const transcriptPath = 'fixtures/transcripts/synthetic-polish-dialogue.transcript.json';

describe('core local storage and import pipeline', () => {
  it('imports a media asset with fingerprint, path, and duration', async () => {
    const sha256 = await sha256File(fixtureMediaPath);
    const probe = await probeMediaFile(fixtureMediaPath);
    const asset = makeMediaAsset({
      title: 'Synthetic Polish Dialogue',
      originalPath: fixtureMediaPath,
      contentSha256: sha256,
      durationMs: probe.durationMs,
      container: probe.container,
      sizeBytes: probe.sizeBytes,
      privacyLabel: 'synthetic',
    });

    expect(asset.originalPath).toBe(fixtureMediaPath);
    expect(asset.contentSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(asset.durationMs).toBeGreaterThan(0);

    const store = new LocalStore();
    store.putMediaAsset(asset);
    expect(store.getMediaAsset(asset.id)).toEqual(asset);
  });

  it('persists subtitle track and cues with stable ids', async () => {
    const mediaSha256 = await sha256File(fixtureMediaPath);
    const asset = makeMediaAsset({
      title: 'Synthetic Polish Dialogue',
      originalPath: fixtureMediaPath,
      contentSha256: mediaSha256,
      durationMs: 2000,
      container: 'webm',
      sizeBytes: 1024,
      privacyLabel: 'synthetic',
    });

    const store = new LocalStore();
    store.putMediaAsset(asset);
    const parsed = await parseSrt(targetSrtPath, asset.id, 'pl', 'target');
    store.putSubtitleTrack(parsed.track);
    for (const cue of parsed.cues) {
      store.putCue(cue);
    }

    expect(store.getSubtitleTrack(parsed.track.id)?.mediaId).toBe(asset.id);
    const trackCues = store.listCuesForTrack(parsed.track.id);
    expect(trackCues).toHaveLength(2);
    expect(trackCues[0]!.text).toBe('Cześć, to jest lokalny test.');
  });

  it('rejects malformed SRT with clear error', async () => {
    await expect(importSubtitle({ mediaId: 'm1', language: 'pl', role: 'target', path: 'fixtures/subtitles/malformed.srt' })).rejects.toThrow(/SRT/);
  });

  it('imports transcript JSON with schema version check', async () => {
    const parsed = await importSubtitle({ mediaId: 'm1', language: 'pl', role: 'target', path: transcriptPath });
    expect(parsed.cues).toHaveLength(2);
    expect(parsed.track.format).toBe('json');
    const firstCue = parsed.cues[0]!;
    expect(firstCue.text).toBe('Cześć, to jest lokalny test.');
  });

  it('round-trips saved occurrence with full source context', async () => {
    const mediaSha256 = await sha256File(fixtureMediaPath);
    const asset = makeMediaAsset({
      title: 'Synthetic Polish Dialogue',
      originalPath: fixtureMediaPath,
      contentSha256: mediaSha256,
      durationMs: 2000,
      container: 'webm',
      sizeBytes: 1024,
      privacyLabel: 'synthetic',
    });
    const store = new LocalStore();
    store.putMediaAsset(asset);
    const parsed = await parseSrt(targetSrtPath, asset.id, 'pl', 'target');
    const cue = parsed.cues[0]!;

    const sourceContext = validateSavedOccurrenceSourceContext({
      mediaId: asset.id,
      mediaPath: asset.originalPath,
      mediaFingerprint: asset.contentSha256,
      subtitleTrackId: parsed.track.id,
      cueId: cue.id,
      timeRangeMs: { start: cue.startMs, end: cue.endMs },
      tokenSpan: { startToken: 0, endToken: 1 },
      charSpan: { start: 0, end: 5 },
    });

    const item = makeSavedItem({ kind: 'lexeme', language: 'pl', displayText: 'Cześć' });
    const occurrence = makeSavedOccurrence({
      savedItemId: item.id,
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      selectionKind: 'lexeme',
      selectionText: 'Cześć',
      sourceContext,
    });

    store.putSavedItem(item);
    store.putSavedOccurrence(occurrence);

    const stored = store.listSavedOccurrencesForItem(item.id)[0];
    expect(stored).toBeDefined();
    const sc = stored!.sourceContext;
    expect(sc.mediaPath).toBe(asset.originalPath);
    expect(sc.mediaFingerprint).toBe(asset.contentSha256);
    expect(sc.cueId).toBe(cue.id);
  });

  it('creates review card and append-only event deterministically', () => {
    const item = makeSavedItem({ kind: 'lexeme', language: 'pl', displayText: 'test' });
    const occurrence = makeSavedOccurrence({
      savedItemId: item.id,
      mediaId: 'media-1',
      cueId: 'cue-1',
      startMs: 0,
      endMs: 1000,
      selectionKind: 'lexeme',
      selectionText: 'test',
      sourceContext: validateSavedOccurrenceSourceContext({
        mediaId: 'media-1',
        mediaPath: 'fixtures/media/test.webm',
        mediaFingerprint: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        subtitleTrackId: 'track-1',
        cueId: 'cue-1',
        timeRangeMs: { start: 0, end: 1000 },
        tokenSpan: { startToken: 0, endToken: 1 },
        charSpan: { start: 0, end: 4 },
      }),
    });

    const card = makeReviewCard({
      savedItemId: item.id,
      savedOccurrenceId: occurrence.id,
      cardType: 'recognition',
      promptTemplate: 'Recognize {{displayText}}',
    });
    const initialState = makeReviewCardState({ cardId: card.id, fsrsVersion: 'ts-fsrs-placeholder' });
    const event = makeReviewEvent({
      cardId: card.id,
      reviewedAt: new Date().toISOString(),
      rating: 'good',
      previousStateJson: JSON.stringify(initialState),
      nextStateJson: JSON.stringify({ ...initialState, state: 'review', dueAt: '2026-06-21T00:00:00.000Z' }),
    });

    const store = new LocalStore();
    store.putSavedItem(item);
    store.putSavedOccurrence(occurrence);
    store.putReviewCard(card);
    store.putReviewCardState(initialState);
    store.addReviewEvent(event);

    expect(store.listReviewEventsForCard(card.id)).toHaveLength(1);
    const firstEvent = store.listReviewEventsForCard(card.id)[0]!;
    expect(firstEvent.rating).toBe('good');
  });

  it('local tokenizer produces char-offset roundtripping tokens', async () => {
    const tokenizer = makeWhitespaceTokenizer('pl');
    const result = await tokenizer.tokenize({ language: 'pl', cueId: 'cue-1', text: 'Uczymy się z własnych napisów.', preserveCharOffsets: true });
    expect(result.tokens.length).toBeGreaterThan(0);
    const first = result.tokens[0]!;
    expect('Uczymy się z własnych napisów.'.slice(first.charStart, first.charEnd)).toBe(first.surface);
    expect(first.normalizedSurface).toBe(first.surface.toLowerCase());
  });

  it('provider-disabled dictionary returns empty entries and no network', async () => {
    const policy = defaultProviderPolicy();
    const adapters = resolveLocalAdapters(policy, 'pl');
    assertProvidersDisabled(policy);
    const result = await adapters.dictionary!.lookup({
      target: { kind: 'token', tokenOccurrenceId: 'tok-1' },
      sourceLanguage: 'pl',
      learnerLanguage: 'en',
      context: { cueText: 'Cześć' },
    });
    expect(result.entries).toHaveLength(0);
    expect(result.warnings.some((w: string) => w.toLowerCase().includes('unavailable'))).toBe(true);
  });

  it('sha256Text produces stable hex digest', async () => {
    const a = await sha256Text('hello');
    const b = await sha256Text('hello');
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
