/**
 * lt-192.3 (ADR-0004): the service's learner-operation semantics. Each operation runs inside the persistence's single
 * write transaction (SqliteLocalPersistence.applyLearnerOperation) against the authoritative rows, and reuses the
 * existing capture/meaning/enrolment/undo invariants (CaptureService) instead of re-implementing them. The storage
 * package never imports review: the callback is composed here.
 */
import { canonicalJson, validateMeaningSource, type MeaningSource, type SavedItem, type SavedItemKind, type SavedOccurrence } from '../../../packages/domain/src/index.ts';
import { SavedOccurrenceService } from '../../../packages/storage/src/savedOccurrenceService.ts';
import { LearnerOperationValidationError, isOperationId, type LearnerOperationRequest } from '../../../packages/storage/src/learnerOperations.ts';
import type { LearnerOperationContext, LearnerOperationOutcome } from '../../../packages/storage/src/sqliteLocalPersistence.ts';
import { CaptureService, ReviewService, defaultFsrsConfig, type CaptureReceipt } from '../../../packages/review/src/index.ts';
import { captureTokenSpan } from '../../../packages/language/src/adapters.ts';

/** The capture's source is not (yet) stored or does not match the approved transcript: nothing applied, no receipt. */
export class OperationSourceError extends Error {
  constructor(readonly code: 'source-unavailable' | 'source-mismatch', message: string) { super(message); }
}

const SELECTION_KINDS: readonly SavedItemKind[] = ['lexeme', 'phrase', 'sentence'];
const conflict = (reason: string, details: Record<string, unknown> = {}): LearnerOperationOutcome => ({ status: 'conflict', result: { reason, ...details } });

function str(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.trim().length === 0)) throw new LearnerOperationValidationError(`Invalid ${label}.`);
  return value;
}
function int(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new LearnerOperationValidationError(`Invalid ${label}.`);
  return value as number;
}
function obj(value: unknown, label: string, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LearnerOperationValidationError(`Invalid ${label}.`);
  const record = value as Record<string, unknown>;
  for (const key of keys) if (!Object.hasOwn(record, key)) throw new LearnerOperationValidationError(`Missing ${label}.${key}.`);
  for (const key of Object.keys(record)) if (!keys.includes(key) && !optional.includes(key)) throw new LearnerOperationValidationError(`Unexpected ${label}.${key}.`);
  return record;
}
function services(context: LearnerOperationContext) {
  const saved = new SavedOccurrenceService(context.store);
  return new CaptureService(context.store, saved, new ReviewService(context.store, defaultFsrsConfig()), () => context.now);
}

/** Validate the complete capture source against the authoritative approved track bundle, then capture. */
function applyCapture(payload: Record<string, unknown>, context: LearnerOperationContext): LearnerOperationOutcome {
  const kind = payload.kind as SavedItemKind;
  if (!SELECTION_KINDS.includes(kind)) throw new LearnerOperationValidationError('Invalid capture kind.');
  const language = str(payload.language, 'language', 32);
  const displayText = str(payload.displayText, 'displayText', 2000);
  const meaning = payload.meaning === undefined ? undefined : str(payload.meaning, 'meaning', 4000);
  let meaningSource: MeaningSource | undefined;
  if (payload.meaningSource !== undefined) {
    if (meaning === undefined) throw new LearnerOperationValidationError('meaningSource requires meaning.');
    try { meaningSource = validateMeaningSource(payload.meaningSource); } catch { throw new LearnerOperationValidationError('Invalid meaningSource.'); }
  }
  const notes = payload.notes === undefined ? undefined : str(payload.notes, 'notes', 8000);
  const mediaId = payload.mediaId; const cueId = payload.cueId;
  if (!isOperationId(mediaId) || !isOperationId(cueId)) throw new LearnerOperationValidationError('Invalid capture source ids.');
  const startMs = int(payload.startMs, 'startMs'); const endMs = int(payload.endMs, 'endMs');
  const sc = obj(payload.sourceContext, 'sourceContext', ['mediaId', 'mediaPath', 'mediaFingerprint', 'subtitleTrackId', 'cueId', 'timeRangeMs', 'tokenSpan', 'charSpan']);
  const time = obj(sc.timeRangeMs, 'timeRangeMs', ['start', 'end']);
  const tokens = obj(sc.tokenSpan, 'tokenSpan', ['startToken', 'endToken']);
  const chars = obj(sc.charSpan, 'charSpan', ['start', 'end']);
  if (!isOperationId(sc.subtitleTrackId) || sc.mediaId !== mediaId || sc.cueId !== cueId) throw new LearnerOperationValidationError('Capture source ids disagree.');
  const store = context.store;
  const media = store.getMediaAsset(mediaId);
  const track = store.getSubtitleTrack(sc.subtitleTrackId);
  if (!media || !track || !context.loadTrackBundle(track.id)) throw new OperationSourceError('source-unavailable', 'The video or transcript this word comes from is not saved on the service yet; nothing was applied.');
  const cue = store.getCue(cueId);
  const mismatch = (what: string) => new OperationSourceError('source-mismatch', `The saved selection does not match the service transcript (${what}); nothing was applied.`);
  if (!cue || cue.trackId !== track.id) throw mismatch('cue');
  if (track.mediaId !== media.id || track.role !== 'target') throw mismatch('track');
  if (track.transcriptStatus !== 'approved') throw mismatch('transcript not approved');
  if (sc.mediaPath !== media.originalPath || sc.mediaFingerprint !== media.contentSha256) throw mismatch('media');
  const charStart = int(chars.start, 'charSpan.start'); const charEnd = int(chars.end, 'charSpan.end');
  const tokenStart = int(tokens.startToken, 'tokenSpan.startToken'); const tokenEnd = int(tokens.endToken, 'tokenSpan.endToken');
  if (charStart >= charEnd || charEnd > cue.text.length || tokenStart >= tokenEnd) throw mismatch('span');
  if (kind === 'sentence') {
    // A whole-cue sentence keeps its historical shape: tokens counted by whitespace (transcript.ts "Save sentence").
    const wordCount = cue.text.split(/\s+/).filter(Boolean).length;
    if (displayText !== cue.text || charStart !== 0 || charEnd !== cue.text.length || tokenStart !== 0 || tokenEnd !== wordCount) throw mismatch('sentence');
  } else {
    if (cue.text.slice(charStart, charEnd) !== displayText) throw mismatch('text');
    // The token span must be exactly the tokens the character span covers under the browser's capture segmentation.
    const derived = captureTokenSpan(cue.text, charStart, charEnd);
    if (!derived || derived.startToken !== tokenStart || derived.endToken !== tokenEnd) throw mismatch('token span');
  }
  // Time range: the whole cue for a sentence, else the overlapping word timings, else the cue (the browser's rule).
  const words = store.listTranscriptWordTimingsForCue(cue.id).filter(w => w.charStart < charEnd && w.charEnd > charStart);
  const expected = kind === 'sentence' || words.length === 0 ? { start: cue.startMs, end: cue.endMs }
    : { start: Math.min(...words.map(w => w.startMs)), end: Math.max(...words.map(w => w.endMs)) };
  if (startMs !== expected.start || endMs !== expected.end || time.start !== expected.start || time.end !== expected.end) throw mismatch('time range');
  const sourceContext: SavedOccurrence['sourceContext'] = {
    mediaId: media.id, mediaPath: media.originalPath, mediaFingerprint: media.contentSha256, subtitleTrackId: track.id, cueId: cue.id,
    timeRangeMs: expected, tokenSpan: { startToken: tokenStart, endToken: tokenEnd }, charSpan: { start: charStart, end: charEnd },
  };
  const capture = services(context);
  const receipt = capture.capture({
    kind, language, displayText,
    ...(meaning !== undefined ? { meaning, ...(meaningSource ? { meaningSource } : {}) } : {}),
    ...(notes !== undefined ? { notes } : {}),
    mediaId: media.id, cueId: cue.id, startMs: expected.start, endMs: expected.end, sourceContext,
  });
  const item = store.getSavedItem(receipt.item.id)!;
  // Dedup: an existing item keeps its meaning/notes. Disclose the learner's draft rather than silently dropping it.
  const unappliedDraft = !receipt.isNewItem && (meaning !== undefined || notes !== undefined)
    ? { ...(meaning !== undefined ? { meaning } : {}), ...(notes !== undefined ? { notes } : {}), existingMeaning: item.meaning ?? null, existingNotes: item.notes ?? null }
    : null;
  return { status: 'applied', result: {
    savedItemId: item.id, occurrenceId: receipt.occurrence.id, cardId: receipt.card.id,
    isNewItem: receipt.isNewItem, isNewOccurrence: receipt.isNewOccurrence, createdCardId: receipt.createdCardId,
    undoBaseline: { itemCanonical: canonicalJson(item), occurrenceCount: receipt.baseline.occurrenceCount },
    unappliedDraft,
  } };
}

function applySetMeaning(payload: Record<string, unknown>, context: LearnerOperationContext): LearnerOperationOutcome {
  const itemId = payload.savedItemId as string;
  const meaning = payload.meaning === null ? null : str(payload.meaning, 'meaning', 4000);
  const expected = payload.expected as { meaning: unknown; meaningSource: unknown };
  const item = context.store.getSavedItem(itemId);
  if (!item) return conflict('item-missing', { savedItemId: itemId });
  const current = { meaning: item.meaning ?? null, meaningSource: item.meaningSource ?? null };
  if (canonicalJson(current.meaning) !== canonicalJson(expected.meaning) || canonicalJson(current.meaningSource) !== canonicalJson(expected.meaningSource)) {
    return conflict('meaning-changed', { savedItemId: itemId, current });
  }
  const updated = services(context).setMeaning(itemId, meaning ?? '', { allowClear: meaning === null });
  if (!updated) throw new LearnerOperationValidationError('An empty meaning needs an explicit clear.');
  return { status: 'applied', result: { savedItemId: itemId, meaning: updated.meaning ?? null, meaningSource: updated.meaningSource ?? null } };
}

function applySetEnrolment(payload: Record<string, unknown>, context: LearnerOperationContext): LearnerOperationOutcome {
  const itemId = payload.savedItemId as string;
  const expected = payload.expected as { activeCardIds: string[]; archivedCardIds: string[] };
  const capture = services(context);
  const item = context.store.getSavedItem(itemId);
  if (!item) return conflict('item-missing', { savedItemId: itemId });
  const ids = () => { const cards = capture.cardsFor(itemId); return { activeCardIds: cards.active.map(c => c.id).sort(), archivedCardIds: cards.archived.map(c => c.id).sort() }; };
  const current = ids();
  if (canonicalJson(current) !== canonicalJson({ activeCardIds: [...expected.activeCardIds].sort(), archivedCardIds: [...expected.archivedCardIds].sort() })) {
    return conflict('enrolment-changed', { savedItemId: itemId, current });
  }
  if (payload.enrolled) capture.reactivate(item); else capture.archiveCards(itemId);
  return { status: 'applied', result: { savedItemId: itemId, enrolled: payload.enrolled, ...ids() } };
}

/** Undo only what the stored, server-generated capture receipt says that capture created, under the current guards. */
function applyUndoCapture(payload: Record<string, unknown>, context: LearnerOperationContext): LearnerOperationOutcome {
  const captureOperationId = payload.captureOperationId as string;
  const stored = context.receipt(captureOperationId);
  if (!stored) return conflict('capture-receipt-unavailable', { captureOperationId });
  if (stored.kind !== 'capture' || stored.status !== 'applied') return conflict('not-an-applied-capture', { captureOperationId });
  const r = stored.result as { savedItemId: string; occurrenceId: string; cardId: string; isNewItem: boolean; isNewOccurrence: boolean; createdCardId: string | null; undoBaseline: { itemCanonical: string; occurrenceCount: number } };
  if (!r.isNewItem && !r.isNewOccurrence) return conflict('nothing-to-undo', { captureOperationId });
  const store = context.store;
  const item: SavedItem | undefined = store.getSavedItem(r.savedItemId);
  const occurrence = store.getSavedOccurrence(r.occurrenceId);
  const card = store.getReviewCard(r.cardId);
  if (!item || !occurrence || !card || canonicalJson(item) !== r.undoBaseline.itemCanonical) return conflict('changed-since-capture', { captureOperationId });
  const receipt: CaptureReceipt = {
    item, occurrence, card, isNewItem: r.isNewItem, isNewOccurrence: r.isNewOccurrence, createdCardId: r.createdCardId,
    baseline: { itemUpdatedAt: item.updatedAt, itemJson: JSON.stringify(item), occurrenceCount: r.undoBaseline.occurrenceCount },
  };
  // The service cannot see which card a browser shows; the browser refuses Undo for a card on screen before sending.
  if (!services(context).undo(receipt, { activeCardIds: [] })) return conflict('changed-since-capture', { captureOperationId });
  return { status: 'applied', result: { captureOperationId, removedItemId: r.isNewItem ? item.id : null, removedOccurrenceId: occurrence.id, removedCardId: r.createdCardId } };
}

export function learnerOperationApplier(request: LearnerOperationRequest): (context: LearnerOperationContext) => LearnerOperationOutcome {
  return (context) => {
    const payload = request.payload as Record<string, unknown>;
    switch (request.kind) {
      case 'capture': return applyCapture(payload, context);
      case 'set-meaning': return applySetMeaning(payload, context);
      case 'set-review-enrolment': return applySetEnrolment(payload, context);
      case 'undo-capture': return applyUndoCapture(payload, context);
    }
  };
}
