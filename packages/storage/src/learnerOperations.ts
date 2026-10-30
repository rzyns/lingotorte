/**
 * lt-192.3 (ADR-0004): server-owned learner vocabulary operations.
 *
 * Pure contract helpers shared by the SQLite persistence (which applies operations atomically) and the browser (which
 * builds immutable requests). Nothing here touches storage or the network.
 */
import { canonicalJson, validateMeaningSource } from '@lingotorte/domain';
import type { LearnerStateSnapshot } from './localStore.ts';

export const LEARNER_OPERATION_KINDS = ['capture', 'set-meaning', 'undo-capture', 'set-review-enrolment'] as const;
export type LearnerOperationKind = typeof LEARNER_OPERATION_KINDS[number];

/** Receipt retention: the service keeps at most this many receipts and none older than the TTL. */
export const LEARNER_OPERATION_RECEIPT_CAP = 5000;
export const LEARNER_OPERATION_RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The collections whose rows only operations may create, change or remove once protection is active. */
export const OPERATION_OWNED_COLLECTIONS = ['savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates'] as const;
export type OperationOwnedCollection = typeof OPERATION_OWNED_COLLECTIONS[number];
export type OperationOwnedRows = Pick<LearnerStateSnapshot, OperationOwnedCollection>;

/**
 * What the client knew when it created the operation. `generation` names the store lineage (rotated by restore),
 * `incarnation` the service process that served it, `receiptSeq` the highest receipt sequence the client had seen.
 */
export type LearnerOperationBasis = Readonly<{ generation: string; incarnation: string; receiptSeq: number }>;

export type LearnerOperationRequest = Readonly<{
  operationId: string;
  kind: LearnerOperationKind;
  basis: LearnerOperationBasis;
  payload: Readonly<Record<string, unknown>>;
}>;

export type LearnerOperationReceipt = Readonly<{
  operationId: string;
  kind: LearnerOperationKind;
  status: 'applied' | 'conflict';
  seq: number;
  /** Durable revision after this operation (unchanged for a conflict). */
  revision: string;
  generation: string;
  committedAt: string;
  /** Kind-specific outcome (ids, flags, disclosed unapplied draft) or the conflict reason and current values. */
  result: Readonly<Record<string, unknown>>;
  /** Authoritative images of the rows this operation wrote, as of `revision`; removed rows are listed by id. */
  rows: Readonly<{ [K in OperationOwnedCollection]: Readonly<Record<string, unknown>> }>;
  removed: Readonly<{ [K in OperationOwnedCollection]: readonly string[] }>;
}>;

/** The service's current operation identity, published with GET /api/state. */
export type LearnerOperationIdentity = Readonly<{
  generation: string;
  incarnation: string;
  /** Highest receipt sequence committed so far (0 when none). */
  receiptSeq: number;
  /** Requests whose basis predates this sequence may have been pruned and are refused. */
  prunedThroughSeq: number;
  protectionActive: boolean;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{8,64}$/;
export function isOperationId(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }

export class LearnerOperationValidationError extends TypeError {}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LearnerOperationValidationError(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}
function exactKeys(record: Record<string, unknown>, required: readonly string[], optional: readonly string[], label: string): void {
  for (const key of required) if (!Object.hasOwn(record, key)) throw new LearnerOperationValidationError(`Missing ${label}.${key}.`);
  for (const key of Object.keys(record)) if (!required.includes(key) && !optional.includes(key)) throw new LearnerOperationValidationError(`Unexpected ${label}.${key}.`);
}

function uuidField(value: unknown, label: string): string {
  if (!isOperationId(value)) throw new LearnerOperationValidationError(`${label} must be a UUID.`);
  return value;
}
function textField(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || value.length > max || value.trim().length === 0) throw new LearnerOperationValidationError(`Invalid ${label}.`);
  return value;
}
function countField(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new LearnerOperationValidationError(`Invalid ${label}.`);
  return value as number;
}
function meaningSourceField(value: unknown, label: string): void {
  try { validateMeaningSource(value); } catch { throw new LearnerOperationValidationError(`Invalid ${label}.`); }
}
function pairField(value: unknown, label: string, a: string, b: string): void {
  const record = plainObject(value, label);
  exactKeys(record, [a, b], [], label);
  countField(record[a], `${label}.${a}`); countField(record[b], `${label}.${b}`);
}
/** Maximum lengths shared with the service's semantic validation (apps/local-service/src/learnerOperations.ts). */
export const LEARNER_OPERATION_TEXT_LIMITS = { language: 32, displayText: 2000, meaning: 4000, notes: 8000, path: 4096 } as const;

/**
 * Strict wire validation of the POST /api/learner/operations body: exact keys, typed ids and every field's type and
 * shape, for every kind, before anything is executed or recorded. A failure is a 400 with no receipt. Semantics that
 * need stored state (source match, current meaning/enrolment) are checked on apply.
 */
export function parseLearnerOperationRequest(value: unknown): LearnerOperationRequest {
  const body = plainObject(value, 'operation request');
  exactKeys(body, ['operationId', 'kind', 'basis', 'payload'], [], 'request');
  if (!isOperationId(body.operationId)) throw new LearnerOperationValidationError('operationId must be a UUID.');
  if (!(LEARNER_OPERATION_KINDS as readonly unknown[]).includes(body.kind)) throw new LearnerOperationValidationError('Unknown operation kind.');
  const basis = plainObject(body.basis, 'basis');
  exactKeys(basis, ['generation', 'incarnation', 'receiptSeq'], [], 'basis');
  if (typeof basis.generation !== 'string' || !TOKEN.test(basis.generation) || typeof basis.incarnation !== 'string' || !TOKEN.test(basis.incarnation)
    || !Number.isSafeInteger(basis.receiptSeq) || (basis.receiptSeq as number) < 0) throw new LearnerOperationValidationError('Invalid operation basis.');
  const payload = plainObject(body.payload, 'payload');
  const kind = body.kind as LearnerOperationKind;
  const L = LEARNER_OPERATION_TEXT_LIMITS;
  if (kind === 'capture') {
    exactKeys(payload, ['kind', 'language', 'displayText', 'mediaId', 'cueId', 'startMs', 'endMs', 'sourceContext'], ['meaning', 'meaningSource', 'notes'], 'payload');
    if (!['lexeme', 'phrase', 'sentence'].includes(payload.kind as string)) throw new LearnerOperationValidationError('Invalid capture kind.');
    textField(payload.language, 'language', L.language);
    textField(payload.displayText, 'displayText', L.displayText);
    const mediaId = uuidField(payload.mediaId, 'mediaId'); const cueId = uuidField(payload.cueId, 'cueId');
    countField(payload.startMs, 'startMs'); countField(payload.endMs, 'endMs');
    if (payload.meaning !== undefined) textField(payload.meaning, 'meaning', L.meaning);
    if (payload.meaningSource !== undefined) {
      if (payload.meaning === undefined) throw new LearnerOperationValidationError('meaningSource requires meaning.');
      meaningSourceField(payload.meaningSource, 'meaningSource');
    }
    if (payload.notes !== undefined) textField(payload.notes, 'notes', L.notes);
    const sc = plainObject(payload.sourceContext, 'sourceContext');
    exactKeys(sc, ['mediaId', 'mediaPath', 'mediaFingerprint', 'subtitleTrackId', 'cueId', 'timeRangeMs', 'tokenSpan', 'charSpan'], [], 'sourceContext');
    if (uuidField(sc.mediaId, 'sourceContext.mediaId') !== mediaId || uuidField(sc.cueId, 'sourceContext.cueId') !== cueId) throw new LearnerOperationValidationError('Capture source ids disagree.');
    uuidField(sc.subtitleTrackId, 'sourceContext.subtitleTrackId');
    textField(sc.mediaPath, 'sourceContext.mediaPath', L.path);
    textField(sc.mediaFingerprint, 'sourceContext.mediaFingerprint', 128);
    pairField(sc.timeRangeMs, 'timeRangeMs', 'start', 'end');
    pairField(sc.tokenSpan, 'tokenSpan', 'startToken', 'endToken');
    pairField(sc.charSpan, 'charSpan', 'start', 'end');
  } else if (kind === 'set-meaning') {
    exactKeys(payload, ['savedItemId', 'meaning', 'expected'], [], 'payload');
    uuidField(payload.savedItemId, 'savedItemId');
    if (payload.meaning !== null) textField(payload.meaning, 'meaning', L.meaning);
    const expected = plainObject(payload.expected, 'expected');
    exactKeys(expected, ['meaning', 'meaningSource'], [], 'expected');
    if (expected.meaning !== null && typeof expected.meaning !== 'string') throw new LearnerOperationValidationError('Invalid expected.meaning.');
    if (expected.meaningSource !== null) {
      if (expected.meaning === null) throw new LearnerOperationValidationError('expected.meaningSource requires expected.meaning.');
      meaningSourceField(expected.meaningSource, 'expected.meaningSource');
    }
  } else if (kind === 'undo-capture') {
    exactKeys(payload, ['captureOperationId'], [], 'payload');
    uuidField(payload.captureOperationId, 'captureOperationId');
  } else {
    exactKeys(payload, ['savedItemId', 'enrolled', 'expected'], [], 'payload');
    uuidField(payload.savedItemId, 'savedItemId');
    if (typeof payload.enrolled !== 'boolean') throw new LearnerOperationValidationError('enrolled must be a boolean.');
    const expected = plainObject(payload.expected, 'expected');
    exactKeys(expected, ['activeCardIds', 'archivedCardIds'], [], 'expected');
    for (const key of ['activeCardIds', 'archivedCardIds']) if (!Array.isArray(expected[key]) || !(expected[key] as unknown[]).every(isOperationId)) throw new LearnerOperationValidationError(`Invalid expected.${key}.`);
  }
  return { operationId: body.operationId as string, kind, basis: basis as unknown as LearnerOperationBasis, payload };
}

/** The immutable identity of a request: everything except the operation id. A retry must reproduce it exactly. */
export function learnerOperationRequestDigestInput(request: LearnerOperationRequest): string {
  return canonicalJson({ kind: request.kind, basis: request.basis, payload: request.payload });
}

export function emptyOperationRows(): { rows: Record<OperationOwnedCollection, Record<string, unknown>>; removed: Record<OperationOwnedCollection, string[]> } {
  return {
    rows: { savedItems: {}, savedOccurrences: {}, reviewCards: {}, reviewCardStates: {} },
    removed: { savedItems: [], savedOccurrences: [], reviewCards: [], reviewCardStates: [] },
  };
}

/** Rows that differ between two views of the operation-owned collections (changed or added), and removed ids. */
export function diffOperationOwned(before: OperationOwnedRows, after: OperationOwnedRows) {
  const out = emptyOperationRows();
  for (const name of OPERATION_OWNED_COLLECTIONS) {
    const a = before[name] as Record<string, unknown>; const b = after[name] as Record<string, unknown>;
    for (const [id, row] of Object.entries(b)) if (!Object.hasOwn(a, id) || canonicalJson(a[id]) !== canonicalJson(row)) out.rows[name][id] = row;
    for (const id of Object.keys(a)) if (!Object.hasOwn(b, id)) out.removed[name].push(id);
    out.removed[name].sort();
  }
  return out;
}

export type OperationOwnedConflict = Readonly<{ collection: OperationOwnedCollection; id: string; change: 'added' | 'changed' | 'removed' }>;

/** A document save tried to create, change or remove operation-owned rows (HTTP 409 `operation-owned-rows`). */
export class OperationOwnedConflictError extends Error {
  constructor(readonly conflicts: readonly OperationOwnedConflict[]) {
    super('Vocabulary rows are owned by server operations; this document save would overwrite or add them. Browser work was kept and nothing was saved.');
  }
}
/** A document save carries new history for a card that an operation removed meanwhile (HTTP 409 `operation-dependency`). */
export class OperationDependencyConflictError extends Error {
  constructor(readonly cardIds: readonly string[]) {
    super('Another device removed vocabulary that this browser studied. Browser work was kept and nothing was saved; resolve the conflict before saving.');
  }
}

/**
 * The authoritative images an operation-touched row has had since a document writer's basis: the image AT the basis
 * (the row as the writer could have read it; `null` when absent) followed by the image after each later operation.
 * `undefined` when no operation touched the row after the basis. An empty list means the history is unavailable.
 */
export type OperationRowImagesSinceBasis = (collection: OperationOwnedCollection, id: string) => readonly (string | null)[] | undefined;

/**
 * lt-192.3 document-save fence. Called only once protection is active, inside the write transaction.
 *
 * `body` is the incoming learner state; `current` the authoritative tables. A body row that differs from the
 * authoritative row is accepted as a stale view ONLY when it is provably unmodified: an operation touched that row after
 * the body's basis and the body row (or its absence) equals one of the row's stored authoritative images since that
 * basis (`imagesSinceBasis`). Anything else — a local edit, deletion or addition of an operation-owned row, or a row
 * whose history is unavailable — refuses the whole save (HTTP 409) and the browser keeps its work. Card-state VALUES are
 * the review schedule and stay document-owned; their membership (created/removed with the card) is operation-owned.
 * New review/practice history for a card an operation removed is a dependency conflict, never silently dropped.
 */
export function reconcileOperationOwned(
  body: LearnerStateSnapshot,
  current: LearnerStateSnapshot,
  imagesSinceBasis: OperationRowImagesSinceBasis,
): { candidate: LearnerStateSnapshot; reconciled: boolean } {
  const conflicts: OperationOwnedConflict[] = [];
  let reconciled = false;
  for (const name of ['savedItems', 'savedOccurrences', 'reviewCards'] as const) {
    const b = body[name] as Record<string, unknown>; const c = current[name] as Record<string, unknown>;
    for (const id of new Set([...Object.keys(b), ...Object.keys(c)])) {
      const inB = Object.hasOwn(b, id); const inC = Object.hasOwn(c, id);
      if (inB && inC && canonicalJson(b[id]) === canonicalJson(c[id])) continue;
      const images = imagesSinceBasis(name, id);
      if (images?.includes(inB ? canonicalJson(b[id]) : null)) { reconciled = true; continue; }
      conflicts.push({ collection: name, id, change: inB ? (inC ? 'changed' : 'added') : 'removed' });
    }
  }
  const states: Record<string, unknown> = {};
  const removedCards = new Set<string>();
  const bs = body.reviewCardStates as Record<string, unknown>; const cs = current.reviewCardStates as Record<string, unknown>;
  for (const id of new Set([...Object.keys(bs), ...Object.keys(cs)])) {
    const inB = Object.hasOwn(bs, id); const inC = Object.hasOwn(cs, id);
    if (inB && inC) { states[id] = bs[id]; continue; }
    // Membership only: the body's presence must match a stored membership since its basis.
    if (imagesSinceBasis('reviewCardStates', id)?.some(image => (image !== null) === inB)) {
      reconciled = true;
      if (inC) states[id] = cs[id]; else removedCards.add(id);
      continue;
    }
    conflicts.push({ collection: 'reviewCardStates', id, change: inB ? 'added' : 'removed' });
  }
  if (conflicts.length) throw new OperationOwnedConflictError(conflicts);
  const knownReviews = new Set([...(current.learnerAudit?.reviewEvents ?? []), ...current.reviewEvents].map(e => e.id));
  const knownAttempts = new Set([...(current.learnerAudit?.practiceAttempts ?? []), ...current.practiceAttempts].map(a => a.id));
  const cards = current.reviewCards as Record<string, unknown>;
  const orphaned = new Set<string>();
  for (const event of [...body.reviewEvents, ...(body.learnerAudit?.reviewEvents ?? [])]) if (!knownReviews.has(event.id) && !Object.hasOwn(cards, event.cardId)) orphaned.add(event.cardId);
  for (const attempt of [...body.practiceAttempts, ...(body.learnerAudit?.practiceAttempts ?? [])]) if (!knownAttempts.has(attempt.id) && !Object.hasOwn(cards, attempt.cardId)) orphaned.add(attempt.cardId);
  if (orphaned.size) throw new OperationDependencyConflictError([...orphaned].sort());
  return {
    candidate: { ...body, savedItems: current.savedItems, savedOccurrences: current.savedOccurrences, reviewCards: current.reviewCards, reviewCardStates: states as LearnerStateSnapshot['reviewCardStates'] },
    reconciled,
  };
}
