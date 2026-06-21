import {
  asRecord,
  requireArray,
  requireBoolean,
  requireInSet,
  requireNonNegativeInteger,
  requireNumber,
  requireOptionalString,
  requireSha256,
  requireString,
  requireStringInSet,
} from './guards';
import type {
  ExportIntegrity,
  LearnerExportContent,
  LearnerExportManifest,
  PracticeAttempt,
  PrivacyWarning,
  PrivacyWarningKind,
  RestoreConfirmation,
  RestorePreview,
  ReviewCard,
  ReviewCardState,
  ReviewEvent,
  SavedItem,
  SavedOccurrence,
  SavedOccurrenceSourceContext,
  Sha256Digest,
} from './coreTypes';
import { validateSavedOccurrenceSourceContext } from './sourceContext';

const CURRENT_SCHEMA_VERSION = 'lingotorte.learner-export.v1' as const;
const PRACTICE_MODES: PracticeAttempt['mode'][] = ['typed-input', 'multiple-choice', 'audio-recall', 'speaking'];
const PRACTICE_RESULTS: PracticeAttempt['result'][] = ['pass', 'fail', 'pass-with-hesitation', 'skipped', 'abandoned'];
const CARD_TYPES: ReviewCard['cardType'][] = ['recognition', 'production'];
const RATINGS: ReviewEvent['rating'][] = ['again', 'hard', 'good', 'easy'];
const STATES: ReviewCardState['state'][] = ['new', 'learning', 'review', 'relearning'];
const ITEM_KINDS: SavedItem['kind'][] = ['lexeme', 'phrase', 'sentence'];

const SHA256_INITIAL_HASH = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
] as const;

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98,
  0x71374491,
  0xb5c0fbcf,
  0xe9b5dba5,
  0x3956c25b,
  0x59f111f1,
  0x923f82a4,
  0xab1c5ed5,
  0xd807aa98,
  0x12835b01,
  0x243185be,
  0x550c7dc3,
  0x72be5d74,
  0x80deb1fe,
  0x9bdc06a7,
  0xc19bf174,
  0xe49b69c1,
  0xefbe4786,
  0x0fc19dc6,
  0x240ca1cc,
  0x2de92c6f,
  0x4a7484aa,
  0x5cb0a9dc,
  0x76f988da,
  0x983e5152,
  0xa831c66d,
  0xb00327c8,
  0xbf597fc7,
  0xc6e00bf3,
  0xd5a79147,
  0x06ca6351,
  0x14292967,
  0x27b70a85,
  0x2e1b2138,
  0x4d2c6dfc,
  0x53380d13,
  0x650a7354,
  0x766a0abb,
  0x81c2c92e,
  0x92722c85,
  0xa2bfe8a1,
  0xa81a664b,
  0xc24b8b70,
  0xc76c51a3,
  0xd192e819,
  0xd6990624,
  0xf40e3585,
  0x106aa070,
  0x19a4c116,
  0x1e376c08,
  0x2748774c,
  0x34b0bcb5,
  0x391c0cb3,
  0x4ed8aa4a,
  0x5b9cca4f,
  0x682e6ff3,
  0x748f82ee,
  0x78a5636f,
  0x84c87814,
  0x8cc70208,
  0x90befffa,
  0xa4506ceb,
  0xbef9a3f7,
  0xc67178f2,
] as const;

function rotateRight32(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256HexUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 1 + 8) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0: number = SHA256_INITIAL_HASH[0];
  let h1: number = SHA256_INITIAL_HASH[1];
  let h2: number = SHA256_INITIAL_HASH[2];
  let h3: number = SHA256_INITIAL_HASH[3];
  let h4: number = SHA256_INITIAL_HASH[4];
  let h5: number = SHA256_INITIAL_HASH[5];
  let h6: number = SHA256_INITIAL_HASH[6];
  let h7: number = SHA256_INITIAL_HASH[7];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      words[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotateRight32(words[i - 15]!, 7) ^ rotateRight32(words[i - 15]!, 18) ^ (words[i - 15]! >>> 3);
      const s1 = rotateRight32(words[i - 2]!, 17) ^ rotateRight32(words[i - 2]!, 19) ^ (words[i - 2]! >>> 10);
      words[i] = (words[i - 16]! + s0 + words[i - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = rotateRight32(e, 6) ^ rotateRight32(e, 11) ^ rotateRight32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_ROUND_CONSTANTS[i]! + words[i]!) >>> 0;
      const s0 = rotateRight32(a, 2) ^ rotateRight32(a, 13) ^ rotateRight32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => word.toString(16).padStart(8, '0')).join('');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value as object).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
  return '{' + entries.join(',') + '}';
}

function rootHashFromRecords(records: readonly object[]): Sha256Digest {
  let canonicalRecords = '';
  for (const record of records) {
    canonicalRecords += canonicalJson(record);
  }
  return `sha256:${sha256HexUtf8(canonicalRecords)}` as Sha256Digest;
}

function sourceContextById(content: LearnerExportContent): Map<string, SavedOccurrenceSourceContext> {
  return new Map(content.sourceContexts.map((sc, index) => [`source-context-${index}`, sc]));
}

function normalizeExportRecord(record: object, contexts: Map<string, SavedOccurrenceSourceContext>): object {
  const r = record as Record<string, unknown>;
  const contextId = r.sourceContextId;
  if (typeof contextId === 'string' && contexts.has(contextId)) {
    const { sourceContextId: _, ...rest } = r;
    return { ...rest, sourceContext: contexts.get(contextId) };
  }
  return record;
}

export function computeExportIntegrity(content: LearnerExportContent): ExportIntegrity {
  const contexts = sourceContextById(content);
  const records: object[] = [
    ...content.savedItems,
    ...content.savedOccurrences.map((o) => normalizeExportRecord(o, contexts)),
    ...content.reviewCards,
    ...content.reviewCardStates,
    ...content.reviewEvents,
    ...content.practiceAttempts.map((a) => normalizeExportRecord(a, contexts)),
    ...content.sourceContexts,
  ];
  return { algorithm: 'sha256-per-record', rootHash: rootHashFromRecords(records), recordCount: records.length };
}

export function defaultPrivacyWarnings(exporting: boolean): PrivacyWarning[] {
  const warnings: PrivacyWarning[] = [
    {
      kind: 'learner-state-contains-timestamps',
      severity: 'info',
      message: 'Learner state includes review and practice timestamps.',
    },
    {
      kind: 'learner-state-contains-media-paths',
      severity: 'warning',
      message: 'Saved occurrences reference local media file paths.',
    },
    {
      kind: 'learner-state-contains-content-hashes',
      severity: 'info',
      message: 'Content fingerprints (SHA-256) are included for integrity.',
    },
    {
      kind: 'export-file-is-unencrypted',
      severity: 'critical',
      message: 'The export file is stored unencrypted. Protect it like any sensitive local file.',
    },
  ];
  if (!exporting) {
    warnings.push({
      kind: 'restore-overwrites-local-data',
      severity: 'critical',
      message: 'Restoring will merge/update imported learner-state records into current local state; unrelated local records are not cleared.',
    });
  }
  return warnings;
}

function validateSavedItem(value: unknown): SavedItem {
  const record = asRecord(value, 'savedItem');
  const meaning = requireOptionalString(record, 'meaning');
  const notes = requireOptionalString(record, 'notes');
  const archivedAt = requireOptionalString(record, 'archivedAt');
  const base: Omit<SavedItem, 'meaning' | 'notes' | 'archivedAt'> = {
    id: requireString(record, 'id'),
    kind: requireInSet(record, 'kind', ITEM_KINDS),
    language: requireString(record, 'language'),
    displayText: requireString(record, 'displayText'),
    createdAt: requireString(record, 'createdAt'),
    updatedAt: requireString(record, 'updatedAt'),
  };
  const result: SavedItem = base as SavedItem;
  if (meaning !== undefined) (result as unknown as Record<string, string>).meaning = meaning;
  if (notes !== undefined) (result as unknown as Record<string, string>).notes = notes;
  if (archivedAt !== undefined) (result as unknown as Record<string, string>).archivedAt = archivedAt;
  return result;
}

function validateSavedOccurrence(value: unknown, sourceContexts: Record<string, SavedOccurrenceSourceContext>): SavedOccurrence {
  const record = asRecord(value, 'savedOccurrence');
  const sourceContextId = requireString(record, 'sourceContextId');
  const sourceContext = sourceContexts[sourceContextId];
  if (sourceContext === undefined) {
    throw new TypeError(`savedOccurrence references unknown sourceContext ${sourceContextId}`);
  }
  const contextBefore = requireOptionalString(record, 'contextBefore');
  const contextAfter = requireOptionalString(record, 'contextAfter');
  const base: Omit<SavedOccurrence, 'contextBefore' | 'contextAfter'> = {
    id: requireString(record, 'id'),
    savedItemId: requireString(record, 'savedItemId'),
    mediaId: requireString(record, 'mediaId'),
    cueId: requireString(record, 'cueId'),
    startMs: requireNonNegativeInteger(record, 'startMs'),
    endMs: requireNonNegativeInteger(record, 'endMs'),
    selectionKind: requireInSet(record, 'selectionKind', ITEM_KINDS),
    selectionText: requireString(record, 'selectionText'),
    createdAt: requireString(record, 'createdAt'),
    sourceContext,
  };
  const result: SavedOccurrence = base as SavedOccurrence;
  if (contextBefore !== undefined) (result as unknown as Record<string, string>).contextBefore = contextBefore;
  if (contextAfter !== undefined) (result as unknown as Record<string, string>).contextAfter = contextAfter;
  return result;
}

function validateReviewCard(value: unknown): ReviewCard {
  const record = asRecord(value, 'reviewCard');
  const suspendedAt = requireOptionalString(record, 'suspendedAt');
  const deletedAt = requireOptionalString(record, 'deletedAt');
  const base: Omit<ReviewCard, 'suspendedAt' | 'deletedAt'> = {
    id: requireString(record, 'id'),
    savedItemId: requireString(record, 'savedItemId'),
    savedOccurrenceId: requireString(record, 'savedOccurrenceId'),
    cardType: requireInSet(record, 'cardType', CARD_TYPES),
    promptTemplate: requireString(record, 'promptTemplate'),
    createdAt: requireString(record, 'createdAt'),
  };
  const result: ReviewCard = base as ReviewCard;
  if (suspendedAt !== undefined) (result as unknown as Record<string, string>).suspendedAt = suspendedAt;
  if (deletedAt !== undefined) (result as unknown as Record<string, string>).deletedAt = deletedAt;
  return result;
}

function validateReviewCardState(value: unknown): ReviewCardState {
  const record = asRecord(value, 'reviewCardState');
  const lastReviewedAt = requireOptionalString(record, 'lastReviewedAt');
  const base: Omit<ReviewCardState, 'lastReviewedAt'> = {
    cardId: requireString(record, 'cardId'),
    state: requireInSet(record, 'state', STATES),
    dueAt: requireString(record, 'dueAt'),
    stability: requireNumber(record, 'stability'),
    difficulty: requireNumber(record, 'difficulty'),
    elapsedDays: requireNonNegativeInteger(record, 'elapsedDays'),
    scheduledDays: requireNonNegativeInteger(record, 'scheduledDays'),
    reps: requireNonNegativeInteger(record, 'reps'),
    lapses: requireNonNegativeInteger(record, 'lapses'),
    fsrsVersion: requireString(record, 'fsrsVersion'),
    updatedAt: requireString(record, 'updatedAt'),
  };
  const result: ReviewCardState = base as ReviewCardState;
  if (lastReviewedAt !== undefined) (result as unknown as Record<string, string>).lastReviewedAt = lastReviewedAt;
  return result;
}

function validateReviewEvent(value: unknown): ReviewEvent {
  const record = asRecord(value, 'reviewEvent');
  const responseMs = record.responseMs === undefined ? undefined : requireNonNegativeInteger(record, 'responseMs');
  const deviceId = requireOptionalString(record, 'deviceId');
  const base: Omit<ReviewEvent, 'responseMs' | 'deviceId'> = {
    id: requireString(record, 'id'),
    cardId: requireString(record, 'cardId'),
    reviewedAt: requireString(record, 'reviewedAt'),
    rating: requireInSet(record, 'rating', RATINGS),
    previousStateJson: requireString(record, 'previousStateJson'),
    nextStateJson: requireString(record, 'nextStateJson'),
    createdAt: requireString(record, 'createdAt'),
  };
  const result: ReviewEvent = base as ReviewEvent;
  if (responseMs !== undefined) (result as unknown as Record<string, number>).responseMs = responseMs;
  if (deviceId !== undefined) (result as unknown as Record<string, string>).deviceId = deviceId;
  return result;
}

function validatePracticeAttempt(
  value: unknown,
  sourceContexts: Record<string, SavedOccurrenceSourceContext>,
): PracticeAttempt {
  const record = asRecord(value, 'practiceAttempt');
  const sourceContextId = requireString(record, 'sourceContextId');
  const sourceContext = sourceContexts[sourceContextId];
  if (sourceContext === undefined) {
    throw new TypeError(`practiceAttempt references unknown sourceContext ${sourceContextId}`);
  }
  const givenAnswer = requireOptionalString(record, 'givenAnswer');
  const expectedAnswer = requireOptionalString(record, 'expectedAnswer');
  const responseMs = record.responseMs === undefined ? undefined : requireNonNegativeInteger(record, 'responseMs');
  const reviewEventId = requireOptionalString(record, 'eventLink_reviewEventId');
  const base: Omit<PracticeAttempt, 'givenAnswer' | 'expectedAnswer' | 'responseMs' | 'eventLink'> = {
    id: requireString(record, 'id'),
    cardId: requireString(record, 'cardId'),
    mode: requireInSet(record, 'mode', PRACTICE_MODES),
    result: requireInSet(record, 'result', PRACTICE_RESULTS),
    sourceContext,
    reviewedAt: requireString(record, 'reviewedAt'),
    createdAt: requireString(record, 'createdAt'),
  };
  const result: PracticeAttempt = base as PracticeAttempt;
  if (givenAnswer !== undefined) (result as unknown as Record<string, string>).givenAnswer = givenAnswer;
  if (expectedAnswer !== undefined) (result as unknown as Record<string, string>).expectedAnswer = expectedAnswer;
  if (responseMs !== undefined) (result as unknown as Record<string, number>).responseMs = responseMs;
  if (reviewEventId !== undefined) (result as unknown as Record<string, { reviewEventId?: string }>).eventLink = { reviewEventId };
  return result;
}

function validateIntegrity(value: unknown): ExportIntegrity {
  const record = asRecord(value, 'integrity');
  return {
    algorithm: requireInSet(record, 'algorithm', ['sha256-per-record']),
    rootHash: requireSha256(record, 'rootHash'),
    recordCount: requireNonNegativeInteger(record, 'recordCount'),
  };
}

export function buildLearnerExportContent(input: {
  savedItems: SavedItem[];
  savedOccurrences: SavedOccurrence[];
  reviewCards: ReviewCard[];
  reviewCardStates: ReviewCardState[];
  reviewEvents: ReviewEvent[];
  practiceAttempts: PracticeAttempt[];
}): LearnerExportContent {
  const sourceContexts = [...new Map(input.savedOccurrences.map((o) => [JSON.stringify(o.sourceContext), o.sourceContext])).values()];
  const contextIdByKey = new Map(sourceContexts.map((sc, index) => [JSON.stringify(sc), `source-context-${index}`]));
  const contextIdFor = (sc: SavedOccurrenceSourceContext) => contextIdByKey.get(JSON.stringify(sc))!;

  return {
    savedItems: input.savedItems,
    savedOccurrences: input.savedOccurrences.map((o) => ({ ...o, sourceContextId: contextIdFor(o.sourceContext) })),
    reviewCards: input.reviewCards,
    reviewCardStates: input.reviewCardStates,
    reviewEvents: input.reviewEvents,
    practiceAttempts: input.practiceAttempts.map((a) => ({ ...a, sourceContextId: contextIdFor(a.sourceContext) })),
    sourceContexts,
  } as unknown as LearnerExportContent;
}

export function validateLearnerExportManifest(value: unknown): LearnerExportManifest {
  const record = asRecord(value, 'learner export manifest');
  const schemaVersion = requireString(record, 'schemaVersion');
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported learner export schema version: ${schemaVersion}`);
  }

  const contentRaw = asRecord(record.content, 'content');
  const sourceContextsRaw = requireArray(contentRaw, 'sourceContexts');
  const sourceContexts: SavedOccurrenceSourceContext[] = sourceContextsRaw.map((sc, index) =>
    validateSavedOccurrenceSourceContext({ ...asRecord(sc, `sourceContext[${index}]`), sourceContextId: `source-context-${index}` }),
  );
  const sourceContextsById = Object.fromEntries(sourceContexts.map((sc, index) => [`source-context-${index}`, sc]));

  const savedItems = requireArray(contentRaw, 'savedItems').map(validateSavedItem);
  const savedOccurrences = requireArray(contentRaw, 'savedOccurrences').map((o) => validateSavedOccurrence(o, sourceContextsById));
  const reviewCards = requireArray(contentRaw, 'reviewCards').map(validateReviewCard);
  const reviewCardStates = requireArray(contentRaw, 'reviewCardStates').map(validateReviewCardState);
  const reviewEvents = requireArray(contentRaw, 'reviewEvents').map(validateReviewEvent);
  const practiceAttempts = requireArray(contentRaw, 'practiceAttempts').map((a) => validatePracticeAttempt(a, sourceContextsById));

  const content: LearnerExportContent = {
    savedItems,
    savedOccurrences,
    reviewCards,
    reviewCardStates,
    reviewEvents,
    practiceAttempts,
    sourceContexts,
  };

  const integrity = validateIntegrity(record.integrity);
  const recomputed = computeExportIntegrity(content);
  if (recomputed.rootHash !== integrity.rootHash || recomputed.recordCount !== integrity.recordCount) {
    throw new TypeError('Export integrity check failed: manifest content does not match integrity root hash');
  }

  const deviceId = requireOptionalString(record, 'deviceId');
  const base: Omit<LearnerExportManifest, 'deviceId'> = {
    schemaVersion,
    exportedAt: requireString(record, 'exportedAt'),
    applicationVersion: requireString(record, 'applicationVersion'),
    privacyWarnings: requireArray(record, 'privacyWarnings').map(validatePrivacyWarning),
    content,
    integrity,
  };
  const result: LearnerExportManifest = base as LearnerExportManifest;
  if (deviceId !== undefined) (result as unknown as Record<string, string>).deviceId = deviceId;
  return result;
}

function validatePrivacyWarning(value: unknown): PrivacyWarning {
  const kinds: PrivacyWarningKind[] = [
    'learner-state-contains-timestamps',
    'learner-state-contains-media-paths',
    'learner-state-contains-content-hashes',
    'restore-overwrites-local-data',
    'export-file-is-unencrypted',
  ];
  const record = asRecord(value, 'privacyWarning');
  return {
    kind: requireInSet(record, 'kind', kinds),
    severity: requireInSet(record, 'severity', ['info', 'warning', 'critical']),
    message: requireString(record, 'message'),
  };
}

export function buildRestorePreview(manifest: LearnerExportManifest, localHasData: boolean): RestorePreview {
  const counts = {
    savedItems: manifest.content.savedItems.length,
    savedOccurrences: manifest.content.savedOccurrences.length,
    reviewCards: manifest.content.reviewCards.length,
    reviewCardStates: manifest.content.reviewCardStates.length,
    reviewEvents: manifest.content.reviewEvents.length,
    practiceAttempts: manifest.content.practiceAttempts.length,
    sourceContexts: manifest.content.sourceContexts.length,
  };
  const overwriteConfirmationRequired = localHasData;
  const safeToRestore = !overwriteConfirmationRequired;
  const warnings = manifest.privacyWarnings.filter((w) => w.kind !== 'export-file-is-unencrypted');
  return { manifestSchemaVersion: manifest.schemaVersion, counts, warnings, safeToRestore, overwriteConfirmationRequired };
}

export function requireRestoreConfirmation(value: unknown): RestoreConfirmation {
  const record = asRecord(value, 'restoreConfirmation');
  return {
    confirmedAt: requireString(record, 'confirmedAt'),
    confirmOverwrite: requireBoolean(record, 'confirmOverwrite'),
    acknowledgedWarnings: requireArray(record, 'acknowledgedWarnings').map((w) =>
      requireStringInSet(w, 'acknowledgedWarning', [
        'learner-state-contains-timestamps',
        'learner-state-contains-media-paths',
        'learner-state-contains-content-hashes',
        'restore-overwrites-local-data',
        'export-file-is-unencrypted',
      ] as PrivacyWarningKind[]),
    ),
  };
}

export function makeExportFilePath(directory: string, exportedAt: string): string {
  const safeTimestamp = exportedAt.replace(/[:.]/g, '-');
  return `${directory}/lingotorte-learner-export-${safeTimestamp}.json`;
}

export { CURRENT_SCHEMA_VERSION };
