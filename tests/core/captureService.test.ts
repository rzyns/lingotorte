import { describe, expect, it } from 'vitest';
import { makeMediaAsset, type Cue } from '@lingotorte/domain';
import { LocalStore, SavedOccurrenceService, sha256File } from '@lingotorte/storage';
import { CaptureService, ReviewService } from '@lingotorte/review';
import { importSubtitle } from '../../packages/subtitles/src/import.ts';
import { buildSourceContext } from '../../apps/web/src/uiTypes.ts';

const clock = () => new Date('2026-10-18T12:00:00.000Z');
const guard = { activeCardIds: [] };

async function setup(transcriptStatus: 'approved' | 'draft' = 'approved') {
  const store = new LocalStore();
  const path = 'fixtures/media/synthetic-polish-dialogue.webm';
  const media = makeMediaAsset({ title: 'Synthetic capture', originalPath: path,
    contentSha256: await sha256File(path), durationMs: 2000, container: 'webm', sizeBytes: 1024, privacyLabel: 'synthetic' });
  store.putMediaAsset(media);
  const imported = [];
  // Two actual imports give distinct cue ids with the same sentence, without inventing cue/domain rows.
  for (let copy = 0; copy < 2; copy += 1) {
    const parsed = await importSubtitle({ mediaId: media.id, language: 'pl', role: 'target',
      path: 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', transcriptStatus });
    expect(parsed.track).toMatchObject({ sourceKind: 'synthetic', transcriptStatus });
    store.putSubtitleTrack(parsed.track);
    for (const cue of parsed.cues) store.putCue(cue);
    imported.push(parsed.cues[0]!);
  }
  const cues = imported;
  const review = new ReviewService(store);
  const capture = new CaptureService(store, new SavedOccurrenceService(store), review, clock);
  // Match the real whole-cue sentence save path: no invented optional context fields.
  const input = (cue: Cue = cues[0]!) => ({ kind: 'sentence' as const, language: 'pl', displayText: cue.text,
    mediaId: media.id, cueId: cue.id, startMs: cue.startMs, endMs: cue.endMs,
    sourceContext: buildSourceContext(media.id, media.originalPath, media.contentSha256, cue.trackId, cue,
      0, cue.text.split(/\s+/).filter(Boolean).length, 0, cue.text.length) });
  return { store, review, capture, input, cues };
}

describe('CaptureService', () => {
  it('(a) captures item, immutable occurrence and exactly one recognition card', async () => {
    const { store, capture, input } = await setup();
    const receipt = capture.capture(input());
    expect(receipt).toMatchObject({ isNewItem: true, isNewOccurrence: true, createdCardId: receipt.card.id });
    expect(receipt.card).toMatchObject({ savedItemId: receipt.item.id, savedOccurrenceId: receipt.occurrence.id, cardType: 'recognition' });
    expect(store.getReviewCardState(receipt.card.id)).toMatchObject({ state: 'new', dueAt: clock().toISOString() });
    expect(receipt.occurrence.sourceContext).toEqual(input().sourceContext);
    const again = capture.capture(input());
    expect(again).toMatchObject({ isNewItem: false, isNewOccurrence: false, createdCardId: null });
    expect(again.card.id).toBe(receipt.card.id);
    expect(capture.cardsFor(receipt.item.id).active).toHaveLength(1);
  });

  it('(b) deduplicates text across cues without creating another card', async () => {
    const { capture, input, cues, store } = await setup();
    const first = capture.capture(input());
    const second = capture.capture({ ...input(cues[1]!), displayText: first.item.displayText });
    expect(second).toMatchObject({ isNewItem: false, isNewOccurrence: true, createdCardId: null });
    expect(second.item.id).toBe(first.item.id);
    expect(second.card.id).toBe(first.card.id);
    expect(store.listSavedOccurrencesForItem(first.item.id)).toHaveLength(2);
    expect(capture.cardsFor(first.item.id).active).toHaveLength(1);
  });

  it('(c) saving an archived item does not resurrect its card; explicit reactivation keeps its schedule', async () => {
    const { capture, input, cues, store } = await setup();
    const first = capture.capture(input());
    const state = store.getReviewCardState(first.card.id);
    expect(capture.archiveCards(first.item.id)).toEqual([first.card.id]);
    expect(capture.archiveCards(first.item.id)).toEqual([]);
    const second = capture.capture({ ...input(cues[1]!), displayText: first.item.displayText });
    expect(second.createdCardId).toBeNull();
    expect(capture.cardsFor(first.item.id)).toMatchObject({ active: [], archived: [{ id: first.card.id }] });
    expect(capture.reactivate(first.item)).toMatchObject({ id: first.card.id });
    expect(store.getReviewCard(first.card.id)).not.toHaveProperty('suspendedAt');
    expect(store.getReviewCardState(first.card.id)).toEqual(state);
  });

  it('(d) undo removes exactly the newly created rows and leaves pre-existing rows untouched', async () => {
    const { capture, store, input, cues } = await setup();
    const before = store.snapshot();
    const first = capture.capture(input());
    expect(capture.canUndo(first, guard)).toBe(true);
    expect(capture.undo(first, guard)).toBe(true);
    expect(store.snapshot()).toEqual(before);
    const existing = capture.capture(input());
    const saved = store.snapshot();
    const added = capture.capture({ ...input(cues[1]!), displayText: existing.item.displayText });
    expect(capture.undo(added, guard)).toBe(true);
    expect(store.snapshot()).toEqual(saved);
    const duplicate = capture.capture(input());
    const unchanged = store.snapshot();
    expect(capture.undo(duplicate, guard)).toBe(false);
    expect(store.snapshot()).toEqual(unchanged);
  });

  it.each(['meaning edit', 'review event', 'active card'] as const)('(e) undo after %s returns false without mutation', async (reason) => {
    const { capture, store, input, review } = await setup();
    const receipt = capture.capture(input());
    if (reason === 'meaning edit') capture.setMeaning(receipt.item.id, 'learner meaning');
    if (reason === 'review event') review.submitReview(receipt.card.id, 'good', clock());
    const undoGuard = { activeCardIds: reason === 'active card' ? [null, receipt.card.id, null] : [] };
    const before = store.snapshot();
    expect(capture.canUndo(receipt, undoGuard)).toBe(false);
    expect(store.snapshot()).toEqual(before);
    expect(capture.undo(receipt, undoGuard)).toBe(false);
    expect(store.snapshot()).toEqual(before);
  });

  it('(f) rejects draft transcripts before writing learner rows', async () => {
    const { capture, store, input } = await setup('draft');
    const before = store.snapshot();
    expect(() => capture.capture(input())).toThrow(/approved transcript/i);
    expect(store.snapshot()).toEqual(before);
  });

  it('(g) unchanged meaning preserves provenance; allowClear removes meaning and source', async () => {
    const { capture, input } = await setup();
    const meaningSource = { kind: 'dictionary-suggested' as const, glossSourceId: 'synthetic-gloss', dumpDate: '2026-10-18' };
    const receipt = capture.capture({ ...input(), meaning: 'local meaning', meaningSource });
    expect(capture.setMeaning(receipt.item.id, ' local meaning ')?.meaningSource).toEqual(meaningSource);
    expect(capture.setMeaning(receipt.item.id, '   ')).toBeNull();
    const cleared = capture.setMeaning(receipt.item.id, '', { allowClear: true });
    expect(cleared).not.toHaveProperty('meaning');
    expect(cleared).not.toHaveProperty('meaningSource');
    expect(capture.setMeaning(receipt.item.id, 'new learner meaning')).toMatchObject({ meaning: 'new learner meaning', meaningSource: { kind: 'learner' } });
    expect(capture.setMeaning('missing', 'meaning')).toBeNull();
  });
});
