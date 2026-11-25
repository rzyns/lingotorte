import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonicalJson,
  makeCue,
  makeMediaAsset,
  makeSubtitleTrack,
  type Cue,
  type MediaAsset,
  type SavedItemKind,
  type SavedOccurrence,
  type SubtitleTrack,
} from '../../packages/domain/src/index.ts';
import { captureTokenSpan } from '../../packages/language/src/adapters.ts';
import { CaptureService, PracticeService, ReviewService, defaultFsrsConfig } from '../../packages/review/src/index.ts';
import {
  LocalStore,
  SavedOccurrenceService,
  createEmptyLocalStoreSnapshot,
  type LocalStoreSnapshot,
} from '../../packages/storage/src/index.ts';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence.ts';
import { startPairedService, pairedFetch } from '../helpers/pairedService.ts';

// lt-192.6: collect exact occurrences without automatic study enrolment (synthetic data only).

const AT = '2026-11-24T12:00:00.000Z';
const AT_LATER = '2026-11-24T12:05:00.000Z';
const SHA = (c: string) => `sha256:${c.repeat(64)}` as const;

type MutableSnapshot = { -readonly [K in keyof LocalStoreSnapshot]: LocalStoreSnapshot[K] };
type SeedFixture = {
  snapshot: MutableSnapshot;
  media: MediaAsset;
  track: SubtitleTrack;
  cues: Cue[];
};

const closers: Array<() => Promise<void>> = [];
const tempDirs: string[] = [];

afterEach(async () => {
  while (closers.length > 0) {
    const fn = closers.pop()!;
    await fn();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

async function makeTempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-lt1926-core-'));
  tempDirs.push(root);
  return root;
}

function buildSeedFixture(
  texts: readonly string[] = [
    'Ala ma kota i małego psa',
    'Kot ma Alę w dużym domu',
    'Stary pies śpi na ciepłym dywanie',
  ],
): SeedFixture {
  const snapshot = createEmptyLocalStoreSnapshot() as MutableSnapshot;
  const media = makeMediaAsset({
    title: 'Synthetic dialogue',
    originalPath: 'fixtures/media/synthetic-polish-dialogue.webm',
    contentSha256: SHA('a'),
    durationMs: 12_000,
    container: 'webm',
    sizeBytes: 256,
    privacyLabel: 'synthetic',
  });
  const track = makeSubtitleTrack({
    mediaId: media.id,
    language: 'pl',
    role: 'target',
    format: 'srt',
    sourceKind: 'synthetic',
    sourcePath: 'synthetic.target.srt',
    contentSha256: SHA('b'),
    isActive: true,
    transcriptStatus: 'approved',
  });
  const cues = texts.map((text, idx) =>
    makeCue({
      trackId: track.id,
      cueIndex: idx + 1,
      startMs: idx * 2500 + 100,
      endMs: idx * 2500 + 2000,
      text,
      normalizedText: text.toLowerCase(),
      textSha256: SHA(String((idx + 1) % 9 || 9)),
    }),
  );
  snapshot.mediaAssets[media.id] = media;
  snapshot.subtitleTracks[track.id] = track;
  for (const cue of cues) snapshot.cues[cue.id] = cue;
  return { snapshot, media, track, cues };
}

function buildCaptureInput(
  fixture: SeedFixture,
  cue: Cue,
  kind: SavedItemKind,
  targetText: string,
  extra: { meaning?: string; notes?: string } = {},
) {
  const isSentence = kind === 'sentence';
  const charStart = isSentence ? 0 : cue.text.indexOf(targetText);
  if (charStart < 0) throw new Error(`Target "${targetText}" not found in cue "${cue.text}"`);
  const charEnd = isSentence ? cue.text.length : charStart + targetText.length;
  const displayText = cue.text.slice(charStart, charEnd);
  const tokens = isSentence
    ? { startToken: 0, endToken: cue.text.split(/\s+/).filter(Boolean).length }
    : captureTokenSpan(cue.text, charStart, charEnd);
  if (!tokens) throw new Error(`No tokens for "${displayText}"`);
  const sourceContext: SavedOccurrence['sourceContext'] = {
    mediaId: fixture.media.id,
    mediaPath: fixture.media.originalPath,
    mediaFingerprint: fixture.media.contentSha256,
    subtitleTrackId: fixture.track.id,
    cueId: cue.id,
    timeRangeMs: { start: cue.startMs, end: cue.endMs },
    tokenSpan: tokens,
    charSpan: { start: charStart, end: charEnd },
  };
  return {
    kind,
    language: 'pl',
    displayText,
    ...(extra.meaning !== undefined ? { meaning: extra.meaning, meaningSource: { kind: 'learner' as const } } : {}),
    ...(extra.notes !== undefined ? { notes: extra.notes } : {}),
    mediaId: fixture.media.id,
    cueId: cue.id,
    startMs: cue.startMs,
    endMs: cue.endMs,
    sourceContext,
  };
}

function createCoreCapture(snapshot: LocalStoreSnapshot, clockIso = AT) {
  const store = new LocalStore(snapshot);
  const saved = new SavedOccurrenceService(store);
  const review = new ReviewService(store, defaultFsrsConfig());
  const practice = new PracticeService(store, review);
  let now = clockIso;
  const capture = new CaptureService(store, saved, review, () => new Date(now));
  return {
    store,
    saved,
    review,
    practice,
    capture,
    setClock: (iso: string) => {
      now = iso;
    },
  };
}

async function startSqliteHttpService(root: string, dbFile: string) {
  const service = await startPairedService({
    host: '127.0.0.1',
    port: 0,
    databasePath: dbFile,
    scratchDir: join(root, 'scratch'),
    modelCacheDir: join(root, 'models'),
    allowOnlineProviders: false,
  });
  let open = true;
  const close = async () => {
    if (open) {
      open = false;
      await service.close();
    }
  };
  closers.push(close);
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const res = await pairedFetch(`${service.origin}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return { status: res.status, json: (await res.json()) as Record<string, any> };
  };
  const state = async () => (await call('/api/state')).json;
  const op = async (kind: string, payload: unknown, basis?: unknown, operationId: string = randomUUID()) => {
    const b = basis ?? (await state()).operations;
    const response = await call('/api/learner/operations', 'POST', {
      operationId,
      kind,
      basis: { generation: b.generation, incarnation: b.incarnation, receiptSeq: b.receiptSeq },
      payload,
    });
    return { operationId, ...response };
  };
  return { origin: service.origin, close, call, state, op };
}

function readDbSnapshot(dbFile: string): LocalStoreSnapshot {
  const persistence = SqliteLocalPersistence.open(dbFile);
  try {
    return persistence.loadSnapshot();
  } finally {
    persistence.close();
  }
}

describe('lt-192.6: collect exact occurrences without automatic enrolment', () => {
  it('creates 0 review cards or states across lexeme, phrase, and sentence collection (CaptureService + SQLite reopen)', async () => {
    const fixture = buildSeedFixture();
    const core = createCoreCapture(fixture.snapshot);

    const lexeme = core.capture.capture(buildCaptureInput(fixture, fixture.cues[0]!, 'lexeme', 'kota', { meaning: 'cat' }));
    const phrase = core.capture.capture(buildCaptureInput(fixture, fixture.cues[1]!, 'phrase', 'w dużym domu', { meaning: 'in a big house' }));
    const sentence = core.capture.capture(buildCaptureInput(fixture, fixture.cues[2]!, 'sentence', fixture.cues[2]!.text));

    for (const receipt of [lexeme, phrase, sentence]) {
      expect(receipt.isNewItem).toBe(true);
      expect(receipt.isNewOccurrence).toBe(true);
      expect(receipt.card).toBeNull();
      expect(receipt.createdCardId).toBeNull();
    }
    const unitSnap = core.store.snapshot();
    expect(Object.keys(unitSnap.savedItems)).toHaveLength(3);
    expect(Object.keys(unitSnap.savedOccurrences)).toHaveLength(3);
    expect(unitSnap.reviewCards).toEqual({});
    expect(unitSnap.reviewCardStates).toEqual({});
    expect(unitSnap.reviewEvents).toEqual([]);

    const root = await makeTempDir();
    const dbFile = join(root, 'learner.sqlite');
    const seedDb = SqliteLocalPersistence.open(dbFile);
    seedDb.saveSnapshot(fixture.snapshot, AT);
    seedDb.close();

    const srv1 = await startSqliteHttpService(root, dbFile);
    const httpLexeme = await srv1.op('capture', buildCaptureInput(fixture, fixture.cues[0]!, 'lexeme', 'kota', { meaning: 'cat' }));
    const httpPhrase = await srv1.op('capture', buildCaptureInput(fixture, fixture.cues[1]!, 'phrase', 'w dużym domu'));
    const httpSentence = await srv1.op('capture', buildCaptureInput(fixture, fixture.cues[2]!, 'sentence', fixture.cues[2]!.text));
    for (const r of [httpLexeme, httpPhrase, httpSentence]) {
      expect(r.status).toBe(200);
      expect(r.json.receipt.status).toBe('applied');
      expect(r.json.receipt.result.cardId).toBeNull();
      expect(r.json.receipt.result.createdCardId).toBeNull();
    }
    await srv1.close();

    const reopenedDbSnap = readDbSnapshot(dbFile);
    expect(Object.keys(reopenedDbSnap.savedItems)).toHaveLength(3);
    expect(Object.keys(reopenedDbSnap.savedOccurrences)).toHaveLength(3);
    expect(reopenedDbSnap.reviewCards).toEqual({});
    expect(reopenedDbSnap.reviewCardStates).toEqual({});
    expect(reopenedDbSnap.reviewEvents).toEqual([]);

    const srv2 = await startSqliteHttpService(root, dbFile);
    const afterReopen = (await srv2.state()).snapshot;
    expect(Object.keys(afterReopen.savedItems)).toHaveLength(3);
    expect(Object.keys(afterReopen.savedOccurrences)).toHaveLength(3);
    expect(afterReopen.reviewCards).toEqual({});
    expect(afterReopen.reviewCardStates).toEqual({});
  });

  it('preserves pre-existing active and archived cards, FSRS schedules, review events, and practice attempts bit-for-bit', async () => {
    const fixture = buildSeedFixture([
      'Ala ma psa tutaj',
      'Dzisiaj Ala widzi kota',
      'Kot śpi spokojnie',
      'Czarny kot biegnie',
    ]);

    const prep = createCoreCapture(fixture.snapshot);
    const activeSeed = prep.capture.capture(buildCaptureInput(fixture, fixture.cues[0]!, 'lexeme', 'Ala', { meaning: 'proper name' }));
    const activeCard = prep.capture.reactivate(activeSeed.item)!;
    expect(activeCard).not.toBeNull();
    prep.review.submitReview(activeCard.id, 'good', new Date('2026-11-24T12:01:00.000Z'), 850);
    prep.practice.submitAttempt({
      cardId: activeCard.id,
      mode: 'typed-input',
      result: 'pass',
      givenAnswer: 'Ala',
      expectedAnswer: 'Ala',
      responseMs: 640,
      sourceContext: activeSeed.occurrence.sourceContext,
      reviewedAt: '2026-11-24T12:02:00.000Z',
    });

    const archivedSeed = prep.capture.capture(buildCaptureInput(fixture, fixture.cues[2]!, 'lexeme', 'Kot', { meaning: 'cat' }));
    const archivedCard = prep.capture.reactivate(archivedSeed.item)!;
    prep.review.submitReview(archivedCard.id, 'hard', new Date('2026-11-24T12:03:00.000Z'), 1100);
    prep.setClock(AT_LATER);
    expect(prep.capture.archiveCards(archivedSeed.item.id)).toEqual([archivedCard.id]);

    const baselineSnap = prep.store.snapshot();
    const expectedCards = structuredClone(baselineSnap.reviewCards);
    const expectedStates = structuredClone(baselineSnap.reviewCardStates);
    const expectedEvents = structuredClone(baselineSnap.reviewEvents);
    const expectedAttempts = structuredClone(baselineSnap.practiceAttempts);
    expect(expectedCards[archivedCard.id]?.suspendedAt).toBe(AT_LATER);
    expect(expectedStates[activeCard.id]!.reps).toBe(2);

    // 1) In-memory second occurrences
    const dupActive = prep.capture.capture(buildCaptureInput(fixture, fixture.cues[1]!, 'lexeme', 'Ala'));
    const dupArchived = prep.capture.capture(buildCaptureInput(fixture, fixture.cues[3]!, 'lexeme', 'kot'));
    expect(dupActive.isNewItem).toBe(false);
    expect(dupActive.isNewOccurrence).toBe(true);
    expect(dupActive.card).toBeNull();
    expect(dupArchived.isNewItem).toBe(false);
    expect(dupArchived.isNewOccurrence).toBe(true);
    expect(dupArchived.card).toBeNull();

    const afterUnitSnap = prep.store.snapshot();
    expect(afterUnitSnap.reviewCards).toEqual(expectedCards);
    expect(afterUnitSnap.reviewCardStates).toEqual(expectedStates);
    expect(afterUnitSnap.reviewEvents).toEqual(expectedEvents);
    expect(afterUnitSnap.practiceAttempts).toEqual(expectedAttempts);

    // 2) Full SQLite + HTTP reopen path
    const root = await makeTempDir();
    const dbFile = join(root, 'learner.sqlite');
    const db = SqliteLocalPersistence.open(dbFile);
    db.saveSnapshot(baselineSnap, AT_LATER);
    db.close();

    const srv1 = await startSqliteHttpService(root, dbFile);
    const res1 = await srv1.op('capture', buildCaptureInput(fixture, fixture.cues[1]!, 'lexeme', 'Ala'));
    const res2 = await srv1.op('capture', buildCaptureInput(fixture, fixture.cues[3]!, 'lexeme', 'kot'));
    expect(res1.json.receipt.result).toMatchObject({ savedItemId: activeSeed.item.id, cardId: null, createdCardId: null, isNewItem: false, isNewOccurrence: true });
    expect(res2.json.receipt.result).toMatchObject({ savedItemId: archivedSeed.item.id, cardId: null, createdCardId: null, isNewItem: false, isNewOccurrence: true });
    await srv1.close();

    const persisted = readDbSnapshot(dbFile);
    expect(Object.keys(persisted.savedItems)).toHaveLength(2);
    expect(Object.keys(persisted.savedOccurrences)).toHaveLength(4);
    expect(persisted.reviewCards).toEqual(expectedCards);
    expect(persisted.reviewCardStates).toEqual(expectedStates);
    expect(persisted.reviewEvents).toEqual(expectedEvents);
    expect(persisted.practiceAttempts).toEqual(expectedAttempts);
    expect(persisted.reviewCards[archivedCard.id]?.suspendedAt).toBe(AT_LATER);
  });

  it('replays a lost-response capture retry across service restart with no duplicate occurrence and 0 cards', async () => {
    const fixture = buildSeedFixture();
    const root = await makeTempDir();
    const dbFile = join(root, 'learner.sqlite');
    const db = SqliteLocalPersistence.open(dbFile);
    db.saveSnapshot(fixture.snapshot, AT);
    db.close();

    const opId = randomUUID();
    const payload = buildCaptureInput(fixture, fixture.cues[0]!, 'lexeme', 'kota', { meaning: 'cat' });

    const srv1 = await startSqliteHttpService(root, dbFile);
    const initialState = await srv1.state();
    const basis = initialState.operations;
    // Simulate caller sending the request and dropping the response before persistence ack arrives client-side.
    const lost = await srv1.op('capture', payload, basis, opId);
    expect(lost.status).toBe(200);
    await srv1.close();

    const srv2 = await startSqliteHttpService(root, dbFile);
    const retry = await srv2.op('capture', payload, basis, opId);
    expect(retry.status).toBe(200);
    expect(retry.json.replayed).toBe(true);
    expect(retry.json.receipt).toEqual(lost.json.receipt);
    expect(retry.json.receipt.result.cardId).toBeNull();
    expect(retry.json.receipt.result.createdCardId).toBeNull();

    const finalSnap = (await srv2.state()).snapshot;
    expect(Object.keys(finalSnap.savedItems)).toHaveLength(1);
    expect(Object.keys(finalSnap.savedOccurrences)).toHaveLength(1);
    expect(finalSnap.reviewCards).toEqual({});
    expect(finalSnap.reviewCardStates).toEqual({});
  });

  it('keeps Undo action-scoped, blocks duplicate/mutated/enrolled undos, and preserves pre-F SQLite receipt compatibility', async () => {
    const fixture = buildSeedFixture([
      'Ala ma kota tutaj',
      'Ala widzi psa tutaj',
      'Pies ma kość dzisiaj',
      'Kot ma mleko dzisiaj',
    ]);

    // 1) Action-scoped Undo on new item preserves unrelated enrolled item + history,
    //    and exact duplicate capture returns canUndo=false / undo=false.
    const core = createCoreCapture(fixture.snapshot);
    const unrelated = core.capture.capture(buildCaptureInput(fixture, fixture.cues[2]!, 'lexeme', 'Pies', { meaning: 'dog' }));
    const unrelatedCard = core.capture.reactivate(unrelated.item)!;
    core.review.submitReview(unrelatedCard.id, 'good', new Date('2026-11-24T12:01:00.000Z'));

    const fresh = core.capture.capture(buildCaptureInput(fixture, fixture.cues[0]!, 'lexeme', 'kota', { meaning: 'cat' }));
    expect(core.capture.undo(fresh, { activeCardIds: [unrelatedCard.id] })).toBe(true);
    expect(core.store.getSavedItem(fresh.item.id)).toBeUndefined();
    expect(core.store.getSavedItem(unrelated.item.id)).toBeDefined();
    expect(core.store.getReviewCard(unrelatedCard.id)).toEqual(unrelatedCard);
    expect(core.store.listReviewEventsForCard(unrelatedCard.id)).toHaveLength(1);

    // Exact duplicate capture on existing item refuses Undo
    const exactDup = core.capture.capture(buildCaptureInput(fixture, fixture.cues[2]!, 'lexeme', 'Pies'));
    expect(exactDup.isNewItem).toBe(false);
    expect(exactDup.isNewOccurrence).toBe(false);
    expect(core.capture.canUndo(exactDup, { activeCardIds: [] })).toBe(false);
    expect(core.capture.undo(exactDup, { activeCardIds: [] })).toBe(false);
    expect(core.store.listSavedOccurrencesForItem(unrelated.item.id)).toHaveLength(1);

    // Undo after subsequent explicit enrolment refuses in CaptureService
    const toEnrol = core.capture.capture(buildCaptureInput(fixture, fixture.cues[3]!, 'lexeme', 'mleko'));
    expect(core.capture.reactivate(toEnrol.item)).not.toBeNull();
    expect(core.capture.canUndo(toEnrol, { activeCardIds: [] })).toBe(false);
    expect(core.capture.undo(toEnrol, { activeCardIds: [] })).toBe(false);

    // 2) Full HTTP/SQLite tests:
    //    (a) Undo 2nd occurrence while pre-existing item's card is active + has history
    //    (b) Exact-dup HTTP undo-capture returns conflict('nothing-to-undo')
    //    (c) Edit meaning or opt-in enrolment refuses undo-capture with 'changed-since-capture'
    //    (d) Pre-F SQLite receipt with non-null createdCardId removes legacy item, occurrence, and card
    const root = await makeTempDir();
    const dbFile = join(root, 'learner.sqlite');
    const seed = createCoreCapture(fixture.snapshot);
    const enrolledBase = seed.capture.capture(buildCaptureInput(fixture, fixture.cues[0]!, 'lexeme', 'Ala', { meaning: 'Ala' }));
    const enrolledCard = seed.capture.reactivate(enrolledBase.item)!;
    seed.review.submitReview(enrolledCard.id, 'good', new Date('2026-11-24T12:01:00.000Z'), 700);
    seed.practice.submitAttempt({
      cardId: enrolledCard.id,
      mode: 'typed-input',
      result: 'pass',
      givenAnswer: 'Ala',
      expectedAnswer: 'Ala',
      responseMs: 500,
      sourceContext: enrolledBase.occurrence.sourceContext,
      reviewedAt: '2026-11-24T12:02:00.000Z',
    });
    const baseState = seed.store.getReviewCardState(enrolledCard.id)!;
    const baseEvents = seed.store.listReviewEventsForCard(enrolledCard.id);
    const baseAttempts = seed.store.listPracticeAttemptsForCard(enrolledCard.id);

    const db = SqliteLocalPersistence.open(dbFile);
    db.saveSnapshot(seed.store.snapshot(), AT);

    // Seed a real pre-lt-192.6 capture receipt (createdCardId !== null) through the operation API
    const legacyOpId = randomUUID();
    const legacyBasis = db.loadLearnerStateWithOperations().operations;
    const legacyInput = buildCaptureInput(fixture, fixture.cues[3]!, 'lexeme', 'mleko', { meaning: 'milk' });
    db.applyLearnerOperation(
      {
        operationId: legacyOpId,
        kind: 'capture',
        basis: { generation: legacyBasis.generation, incarnation: legacyBasis.incarnation, receiptSeq: legacyBasis.receiptSeq },
        payload: legacyInput,
      },
      (context) => {
        const savedSvc = new SavedOccurrenceService(context.store);
        const revSvc = new ReviewService(context.store, defaultFsrsConfig());
        const savedRes = savedSvc.saveSelection(legacyInput);
        const created = revSvc.createCard({
          savedItem: savedRes.item,
          savedOccurrence: savedRes.occurrence,
          cardType: 'recognition',
          promptTemplate: `Recognize: ${savedRes.item.displayText}`,
        });
        return {
          status: 'applied',
          result: {
            savedItemId: savedRes.item.id,
            occurrenceId: savedRes.occurrence.id,
            cardId: created.card.id,
            isNewItem: true,
            isNewOccurrence: true,
            createdCardId: created.card.id,
            undoBaseline: { itemCanonical: canonicalJson(savedRes.item), occurrenceCount: 1 },
            unappliedDraft: null,
          },
        };
      },
      new Date(AT),
    );
    db.close();

    const srv = await startSqliteHttpService(root, dbFile);

    // (a) Collect 2nd occurrence on enrolled item -> Undo removes ONLY 2nd occurrence
    const secondAla = await srv.op('capture', buildCaptureInput(fixture, fixture.cues[1]!, 'lexeme', 'Ala'));
    expect(secondAla.json.receipt.result.isNewItem).toBe(false);
    expect(secondAla.json.receipt.result.isNewOccurrence).toBe(true);
    expect(secondAla.json.receipt.result.createdCardId).toBeNull();
    const undoSecond = await srv.op('undo-capture', { captureOperationId: secondAla.operationId });
    expect(undoSecond.json.receipt.status).toBe('applied');
    expect(undoSecond.json.receipt.result).toMatchObject({
      removedItemId: null,
      removedOccurrenceId: secondAla.json.receipt.result.occurrenceId,
      removedCardId: null,
    });
    const afterUndoSnap = (await srv.state()).snapshot;
    expect(afterUndoSnap.savedItems[enrolledBase.item.id]).toBeDefined();
    expect(afterUndoSnap.savedOccurrences[enrolledBase.occurrence.id]).toBeDefined();
    expect(afterUndoSnap.savedOccurrences[secondAla.json.receipt.result.occurrenceId]).toBeUndefined();
    expect(afterUndoSnap.reviewCards[enrolledCard.id]).toEqual(enrolledCard);
    expect(afterUndoSnap.reviewCardStates[enrolledCard.id]).toEqual(baseState);
    expect(afterUndoSnap.reviewEvents).toEqual(baseEvents);
    expect(afterUndoSnap.practiceAttempts).toEqual(baseAttempts);

    // (b) Exact-duplicate capture via HTTP -> undo-capture returns conflict nothing-to-undo
    const httpExactDup = await srv.op('capture', buildCaptureInput(fixture, fixture.cues[0]!, 'lexeme', 'Ala'));
    expect(httpExactDup.json.receipt.result.isNewItem).toBe(false);
    expect(httpExactDup.json.receipt.result.isNewOccurrence).toBe(false);
    const undoExactDup = await srv.op('undo-capture', { captureOperationId: httpExactDup.operationId });
    expect(undoExactDup.json.receipt.status).toBe('conflict');
    expect(undoExactDup.json.receipt.result.reason).toBe('nothing-to-undo');

    // (c1) Edit meaning blocks undo
    const capEdited = await srv.op('capture', buildCaptureInput(fixture, fixture.cues[1]!, 'lexeme', 'psa', { meaning: 'dog' }));
    const editedItemId = capEdited.json.receipt.result.savedItemId;
    const setMeaning = await srv.op('set-meaning', {
      savedItemId: editedItemId,
      meaning: 'hound',
      expected: { meaning: 'dog', meaningSource: { kind: 'learner' } },
    });
    expect(setMeaning.json.receipt.status).toBe('applied');
    const undoAfterEdit = await srv.op('undo-capture', { captureOperationId: capEdited.operationId });
    expect(undoAfterEdit.json.receipt.status).toBe('conflict');
    expect(undoAfterEdit.json.receipt.result.reason).toBe('changed-since-capture');

    // (c2) Explicit enrolment blocks undo
    const capEnrolledAfter = await srv.op('capture', buildCaptureInput(fixture, fixture.cues[2]!, 'lexeme', 'kość'));
    const enrolledItemId = capEnrolledAfter.json.receipt.result.savedItemId;
    const enrol = await srv.op('set-review-enrolment', {
      savedItemId: enrolledItemId,
      enrolled: true,
      expected: { activeCardIds: [], archivedCardIds: [] },
    });
    expect(enrol.json.receipt.status).toBe('applied');
    const undoAfterEnrol = await srv.op('undo-capture', { captureOperationId: capEnrolledAfter.operationId });
    expect(undoAfterEnrol.json.receipt.status).toBe('conflict');
    expect(undoAfterEnrol.json.receipt.result.reason).toBe('changed-since-capture');

    // (d) Pre-F SQLite capture receipt with createdCardId !== null undoes cleanly (item, occurrence, and card removed)
    const undoLegacy = await srv.op('undo-capture', { captureOperationId: legacyOpId });
    expect(undoLegacy.json.receipt.status).toBe('applied');
    expect(undoLegacy.json.receipt.result.removedItemId).toBeTruthy();
    expect(undoLegacy.json.receipt.result.removedCardId).toBeTruthy();
    const afterLegacySnap = (await srv.state()).snapshot;
    expect(afterLegacySnap.savedItems[undoLegacy.json.receipt.result.removedItemId]).toBeUndefined();
    expect(afterLegacySnap.savedOccurrences[undoLegacy.json.receipt.result.removedOccurrenceId]).toBeUndefined();
    expect(afterLegacySnap.reviewCards[undoLegacy.json.receipt.result.removedCardId]).toBeUndefined();
    expect(afterLegacySnap.reviewCardStates[undoLegacy.json.receipt.result.removedCardId]).toBeUndefined();
  });
});
