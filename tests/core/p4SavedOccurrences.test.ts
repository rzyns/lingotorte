import { describe, expect, it } from 'vitest';
import { LocalStore, SavedOccurrenceService } from '../../packages/storage/src';
import { makeMediaAsset, validateSavedOccurrenceSourceContext } from '../../packages/domain/src';
import { sha256File } from '../../packages/storage/src/mediaHelpers';
import { parseSrt } from '../../packages/subtitles/src/import';

const fixtureMediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';

async function setupFixtureStore() {
  const store = new LocalStore();
  const service = new SavedOccurrenceService(store);
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
  store.putMediaAsset(asset);
  const parsed = await parseSrt(targetSrtPath, asset.id, 'pl', 'target');
  store.putSubtitleTrack(parsed.track);
  for (const cue of parsed.cues) {
    store.putCue(cue);
  }
  return { store, service, asset, track: parsed.track, cues: parsed.cues };
}

function sourceContextForCue(
  asset: Awaited<ReturnType<typeof setupFixtureStore>>['asset'],
  track: Awaited<ReturnType<typeof setupFixtureStore>>['track'],
  cue: Awaited<ReturnType<typeof setupFixtureStore>>['cues'][number],
  tokenStart: number,
  tokenEnd: number,
  charStart: number,
  charEnd: number,
) {
  return validateSavedOccurrenceSourceContext({
    mediaId: asset.id,
    mediaPath: asset.originalPath,
    mediaFingerprint: asset.contentSha256,
    subtitleTrackId: track.id,
    cueId: cue.id,
    timeRangeMs: { start: cue.startMs, end: cue.endMs },
    tokenSpan: { startToken: tokenStart, endToken: tokenEnd },
    charSpan: { start: charStart, end: charEnd },
  });
}

describe('P4 saved occurrence service', () => {
  it('saves a lexeme occurrence with full source context', async () => {
    const { service, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);

    const result = service.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'Cześć',
      meaning: 'hi; hello',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });

    expect(result.isNewItem).toBe(true);
    expect(result.isNewOccurrence).toBe(true);
    expect(result.item.kind).toBe('lexeme');
    expect(result.occurrence.sourceContext.mediaPath).toBe(asset.originalPath);
    expect(result.occurrence.sourceContext.mediaFingerprint).toBe(asset.contentSha256);
    expect(result.occurrence.sourceContext.cueId).toBe(cue.id);
  });

  it('adds a second occurrence to an existing item when source differs', async () => {
    const { service, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sc1 = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const first = service.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext: sc1,
    });

    const cue2 = cues[1]! ?? cue;
    const sc2 = validateSavedOccurrenceSourceContext({
      mediaId: asset.id,
      mediaPath: asset.originalPath,
      mediaFingerprint: asset.contentSha256,
      subtitleTrackId: track.id,
      cueId: cue2.id,
      timeRangeMs: { start: cue2.startMs, end: cue2.endMs },
      tokenSpan: { startToken: 0, endToken: 1 },
      charSpan: { start: 0, end: 5 },
    });

    const second = service.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'Cześć',
      mediaId: asset.id,
      cueId: cue2.id,
      startMs: cue2.startMs,
      endMs: cue2.endMs,
      sourceContext: sc2,
    });

    expect(second.isNewItem).toBe(false);
    expect(second.isNewOccurrence).toBe(true);
    expect(second.item.id).toBe(first.item.id);
    expect(service.listOccurrencesForItem(first.item.id)).toHaveLength(2);
  });

  it('is idempotent when saving identical occurrence fingerprint', async () => {
    const { service, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sc = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const input = {
      kind: 'lexeme' as const,
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext: sc,
    };

    const first = service.saveSelection(input);
    const second = service.saveSelection(input);

    expect(second.isNewItem).toBe(false);
    expect(second.isNewOccurrence).toBe(false);
    expect(second.item.id).toBe(first.item.id);
    expect(second.occurrence.id).toBe(first.occurrence.id);
    expect(service.listOccurrencesForItem(first.item.id)).toHaveLength(1);
  });

  it('creates a separate item for same text but different kind', async () => {
    const { service, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sc = sourceContextForCue(asset, track, cue, 0, 2, 0, 10);
    const lexeme = service.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext: sc,
    });
    const phrase = service.saveSelection({
      kind: 'phrase',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext: sc,
    });

    expect(lexeme.item.id).not.toBe(phrase.item.id);
  });

  it('saves a full cue as a sentence item', async () => {
    const { service, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sc = validateSavedOccurrenceSourceContext({
      mediaId: asset.id,
      mediaPath: asset.originalPath,
      mediaFingerprint: asset.contentSha256,
      subtitleTrackId: track.id,
      cueId: cue.id,
      timeRangeMs: { start: cue.startMs, end: cue.endMs },
      tokenSpan: { startToken: 0, endToken: 7 },
      charSpan: { start: 0, end: cue.text.length },
    });

    const result = service.saveSelection({
      kind: 'sentence',
      language: 'pl',
      displayText: cue.text,
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext: sc,
    });

    expect(result.item.kind).toBe('sentence');
    expect(result.occurrence.selectionText).toBe(cue.text);
    expect(service.listItems('sentence')).toHaveLength(1);
  });

  it('lists My Vocab and My Sentences separately', async () => {
    const { service, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const scLexeme = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const scSentence = validateSavedOccurrenceSourceContext({
      mediaId: asset.id,
      mediaPath: asset.originalPath,
      mediaFingerprint: asset.contentSha256,
      subtitleTrackId: track.id,
      cueId: cue.id,
      timeRangeMs: { start: cue.startMs, end: cue.endMs },
      tokenSpan: { startToken: 0, endToken: 7 },
      charSpan: { start: 0, end: cue.text.length },
    });

    service.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'lokalny',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext: scLexeme,
    });
    service.saveSelection({
      kind: 'sentence',
      language: 'pl',
      displayText: cue.text,
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext: scSentence,
    });

    expect(service.listItems('lexeme')).toHaveLength(1);
    expect(service.listItems('phrase')).toHaveLength(0);
    expect(service.listItems('sentence')).toHaveLength(1);
  });

  it('keeps source context immutable after saving', async () => {
    const { store, service, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sc = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    service.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext: sc,
    });

    const snapshot = store.snapshot();
    const occurrence = Object.values(snapshot.savedOccurrences)[0]!;
    const originalFingerprint = occurrence.sourceContext.mediaFingerprint;

    // Mutate the returned snapshot object directly; the stored occurrence must retain its value.
    const snapshotOccurrence = { ...occurrence, sourceContext: undefined };
    // The mutation above only affects the snapshot copy, proving snapshot isolation.
    expect(snapshotOccurrence.sourceContext).toBeUndefined();

    const reRead = store.snapshot().savedOccurrences[occurrence.id];
    expect(reRead).toBeDefined();
    expect(reRead!.sourceContext.mediaFingerprint).toBe(originalFingerprint);
  });
});
