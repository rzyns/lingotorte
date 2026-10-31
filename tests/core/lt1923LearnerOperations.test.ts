import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createEmptyLocalStoreSnapshot, LocalStore, type LocalStoreSnapshot } from '../../packages/storage/src/localStore.ts';
import { ExportService } from '../../packages/storage/src/exportRestoreService.ts';
import { SqliteLocalPersistence, OperationIneligibleError, OperationIdReusedError } from '../../packages/storage/src/sqliteLocalPersistence.ts';
import { LEARNER_OPERATION_RECEIPT_CAP, LEARNER_OPERATION_RECEIPT_TTL_MS, OperationOwnedConflictError, type LearnerOperationRequest } from '../../packages/storage/src/learnerOperations.ts';
import { learnerOperationApplier } from '../../apps/local-service/src/learnerOperations.ts';
import { makeCue, makeMediaAsset, makeSubtitleTrack, type Cue } from '../../packages/domain/src/index.ts';
import { startPairedService, pairedFetch } from '../helpers/pairedService.ts';

// lt-192.3 (ADR-0004): server-owned vocabulary operations against the real service and SQLite store. Synthetic only.

const AT = '2026-10-30T12:00:00.000Z';
const SHA = (c: string) => `sha256:${c.repeat(64)}` as const;
type Fixture = ReturnType<typeof fixtureSnapshot>;

function fixtureSnapshot(texts: readonly string[] = ['Ala ma kota', 'Kot ma Alę', 'ala ma psa']) {
  const snapshot = createEmptyLocalStoreSnapshot() as { -readonly [K in keyof LocalStoreSnapshot]: LocalStoreSnapshot[K] };
  const media = makeMediaAsset({ title: 'synthetic', originalPath: 'fixtures/media/synthetic-polish-dialogue.webm', contentSha256: SHA('a'), durationMs: 10_000, container: 'webm', sizeBytes: 10, privacyLabel: 'synthetic' });
  const track = makeSubtitleTrack({ mediaId: media.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'synthetic.target.srt', contentSha256: SHA('b'), isActive: true });
  const draft = makeSubtitleTrack({ mediaId: media.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'draft.srt', contentSha256: SHA('c'), isActive: false, transcriptStatus: 'draft' });
  const cues = texts.map((text, i) => makeCue({ trackId: track.id, cueIndex: i, startMs: i * 1000, endMs: i * 1000 + 900, text, normalizedText: text.toLowerCase(), textSha256: SHA('d') }));
  const draftCue = makeCue({ trackId: draft.id, cueIndex: 0, startMs: 0, endMs: 900, text: 'Ala ma kota', normalizedText: 'ala ma kota', textSha256: SHA('e') });
  snapshot.mediaAssets = { [media.id]: media };
  snapshot.subtitleTracks = { [track.id]: track, [draft.id]: draft };
  snapshot.cues = Object.fromEntries([...cues, draftCue].map(c => [c.id, c]));
  return { snapshot: snapshot as LocalStoreSnapshot, media, track, draft, cues, draftCue };
}

function capturePayload(f: Fixture, cue: Cue, text: string, extra: Record<string, unknown> = {}, trackId = f.track.id) {
  const charStart = cue.text.indexOf(text); const charEnd = charStart + text.length;
  const tokenStart = cue.text.slice(0, charStart).split(/\s+/).filter(Boolean).length;
  const tokenEnd = tokenStart + text.split(/\s+/).filter(Boolean).length;
  const sourceContext = { mediaId: f.media.id, mediaPath: f.media.originalPath, mediaFingerprint: f.media.contentSha256, subtitleTrackId: trackId, cueId: cue.id,
    timeRangeMs: { start: cue.startMs, end: cue.endMs }, tokenSpan: { startToken: tokenStart, endToken: tokenEnd }, charSpan: { start: charStart, end: charEnd } };
  return { kind: 'lexeme', language: 'pl', displayText: text, mediaId: f.media.id, cueId: cue.id, startMs: cue.startMs, endMs: cue.endMs, sourceContext, ...extra };
}

const roots: string[] = [];
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});
async function seededFile() {
  const root = await mkdtemp(join(process.env.LINGOTORTE_SCRATCH_DIR ?? tmpdir(), 'lt-192-3-'));
  roots.push(root);
  const file = join(root, 'state.db');
  const f = fixtureSnapshot();
  const db = SqliteLocalPersistence.open(file);
  try { db.saveSnapshot(f.snapshot, AT, 'rev:1'); } finally { db.close(); }
  return { root, file, f };
}
async function service(root: string, file: string) {
  const s = await startPairedService({ host: '127.0.0.1', port: 0, databasePath: file, scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false });
  let open = true;
  const close = async () => { if (open) { open = false; await s.close(); } };
  closers.push(close);
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const r = await pairedFetch(`${s.origin}${path}`, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    return { status: r.status, json: await r.json() as Record<string, any> };
  };
  const state = async () => (await call('/api/state')).json;
  const op = async (kind: string, payload: unknown, basis?: unknown, operationId: string = randomUUID()) => {
    const b = basis ?? (await state()).operations;
    return { operationId, ...(await call('/api/learner/operations', 'POST', { operationId, kind, basis: { generation: b.generation, incarnation: b.incarnation, receiptSeq: b.receiptSeq }, payload })) };
  };
  return { origin: s.origin, call, state, op, close };
}
const itemsByText = (snapshot: any) => Object.values(snapshot.savedItems as Record<string, any>).map(i => i.displayText).sort();

describe('lt-192.3 server learner operations', () => {
  it('applies a capture exactly once: same id + same request replays the receipt; same id + changed payload is refused', async () => {
    const { root, file, f } = await seededFile();
    const svc = await service(root, file);
    const s0 = await svc.state();
    expect(s0.operations).toMatchObject({ receiptSeq: 0, prunedThroughSeq: 0, protectionActive: false });
    const payload = capturePayload(f, f.cues[0]!, 'kota', { meaning: 'cat', meaningSource: { kind: 'learner' } });
    const first = await svc.op('capture', payload, s0.operations);
    expect(first.status).toBe(200);
    expect(first.json.replayed).toBe(false);
    const receipt = first.json.receipt;
    expect(receipt).toMatchObject({ operationId: first.operationId, kind: 'capture', status: 'applied', seq: 1, generation: s0.operations.generation });
    expect(receipt.result).toMatchObject({ isNewItem: true, isNewOccurrence: true, unappliedDraft: null });
    expect(receipt.result.createdCardId).toBe(receipt.result.cardId);
    expect(Object.keys(receipt.rows.savedItems)).toEqual([receipt.result.savedItemId]);
    const s1 = await svc.state();
    expect(s1.revision).toBe(receipt.revision);
    expect(s1.operations).toMatchObject({ receiptSeq: 1, protectionActive: true });
    // The server stamps time and validates; the stored item carries the learner's meaning.
    expect(s1.snapshot.savedItems[receipt.result.savedItemId]).toMatchObject({ displayText: 'kota', meaning: 'cat', meaningSource: { kind: 'learner' } });
    // Retry of the identical request (lost acknowledgement): the historical receipt, no second effect.
    const retry = await svc.op('capture', payload, s0.operations, first.operationId);
    expect(retry.status).toBe(200);
    expect(retry.json.replayed).toBe(true);
    expect(retry.json.receipt).toEqual(receipt);
    const s2 = await svc.state();
    expect(s2.revision).toBe(s1.revision);
    expect(Object.keys(s2.snapshot.savedOccurrences)).toHaveLength(1);
    expect(Object.keys(s2.snapshot.reviewCards)).toHaveLength(1);
    // The same id with a changed payload or basis is refused, nothing applied.
    const changed = await svc.op('capture', { ...payload, meaning: 'kitty' }, s0.operations, first.operationId);
    expect(changed.status).toBe(409);
    expect(changed.json.code).toBe('operation-id-reused');
    const rebased = await svc.op('capture', payload, s1.operations, first.operationId);
    expect(rebased.json.code).toBe('operation-id-reused');
    expect((await svc.state()).revision).toBe(s1.revision);
  });

  it('validates the complete capture source against the stored approved transcript; refusals apply nothing and leave no receipt', async () => {
    const { root, file, f } = await seededFile();
    const svc = await service(root, file);
    const s0 = await svc.state();
    const cue = f.cues[0]!;
    const good = capturePayload(f, cue, 'kota');
    const cases: [string, unknown, string][] = [
      ['text', { ...good, displayText: 'kotb' }, 'source-mismatch'],
      ['span', { ...good, sourceContext: { ...good.sourceContext, charSpan: { start: 0, end: 4 } } }, 'source-mismatch'],
      ['media fingerprint', { ...good, sourceContext: { ...good.sourceContext, mediaFingerprint: SHA('f') } }, 'source-mismatch'],
      ['time range', { ...good, startMs: 1 }, 'source-mismatch'],
      ['draft track', capturePayload(f, f.draftCue, 'kota', {}, f.draft.id), 'source-mismatch'],
      ['unknown track', { ...good, sourceContext: { ...good.sourceContext, subtitleTrackId: randomUUID() } }, 'source-unavailable'],
    ];
    for (const [label, payload, code] of cases) {
      const reply = await svc.op('capture', payload, s0.operations);
      expect(reply.status, label).toBe(409);
      expect(reply.json.code, label).toBe(code);
    }
    const malformed = await svc.op('capture', { ...good, extra: 1 }, s0.operations);
    expect(malformed.status).toBe(400);
    const s1 = await svc.state();
    expect(s1.revision).toBe(s0.revision);
    expect(s1.operations.receiptSeq).toBe(0);
    expect(itemsByText(s1.snapshot)).toEqual([]);
  });

  it('two clients: independent meaning edits both survive; a same-item edit is a visible stored conflict, never an overwrite', async () => {
    const { root, file, f } = await seededFile();
    const svc = await service(root, file);
    const s0 = await svc.state();
    const a = (await svc.op('capture', capturePayload(f, f.cues[0]!, 'kota'), s0.operations)).json.receipt.result.savedItemId;
    const b = (await svc.op('capture', capturePayload(f, f.cues[1]!, 'Kot'), s0.operations)).json.receipt.result.savedItemId;
    const basis = (await svc.state()).operations; // both clients read this
    const empty = { meaning: null, meaningSource: null };
    const clientA = await svc.op('set-meaning', { savedItemId: a, meaning: 'cat (acc.)', expected: empty }, basis);
    const clientB = await svc.op('set-meaning', { savedItemId: b, meaning: 'cat', expected: empty }, basis);
    expect(clientA.json.receipt.status).toBe('applied');
    expect(clientB.json.receipt.status).toBe('applied');
    // Client B, still believing item A has no meaning, edits it: conflict receipt with the current value.
    const clash = await svc.op('set-meaning', { savedItemId: a, meaning: 'kitty', expected: empty }, basis);
    expect(clash.status).toBe(200);
    expect(clash.json.receipt).toMatchObject({ status: 'conflict', result: { reason: 'meaning-changed', current: { meaning: 'cat (acc.)', meaningSource: { kind: 'learner' } } } });
    const retried = await svc.op('set-meaning', { savedItemId: a, meaning: 'kitty', expected: empty }, basis, clash.operationId);
    expect(retried.json).toMatchObject({ replayed: true, receipt: clash.json.receipt });
    // Provenance is part of the expectation: a matching meaning with a different source also conflicts.
    const provenance = await svc.op('set-meaning', { savedItemId: a, meaning: 'x', expected: { meaning: 'cat (acc.)', meaningSource: { kind: 'dictionary-suggested', glossSourceId: 's', dumpDate: '2026-01-01' } } }, basis);
    expect(provenance.json.receipt.status).toBe('conflict');
    const s = (await svc.state()).snapshot;
    expect(s.savedItems[a]).toMatchObject({ meaning: 'cat (acc.)' });
    expect(s.savedItems[b]).toMatchObject({ meaning: 'cat' });
  });

  it('dedups a capture of the same normalized text to the canonical item and discloses the unapplied draft', async () => {
    const { root, file, f } = await seededFile();
    const svc = await service(root, file);
    const s0 = await svc.state();
    const first = (await svc.op('capture', capturePayload(f, f.cues[0]!, 'Ala', { meaning: 'Ala (name)', notes: 'first' }), s0.operations)).json.receipt;
    // Another client, unaware of the first, saves "ala" from a different cue with its own draft meaning/notes.
    const second = (await svc.op('capture', capturePayload(f, f.cues[2]!, 'ala', { meaning: 'other meaning', notes: 'second' }), s0.operations)).json.receipt;
    expect(second.result).toMatchObject({ savedItemId: first.result.savedItemId, cardId: first.result.cardId, isNewItem: false, isNewOccurrence: true, createdCardId: null,
      unappliedDraft: { meaning: 'other meaning', notes: 'second', existingMeaning: 'Ala (name)', existingNotes: 'first' } });
    const s = (await svc.state()).snapshot;
    expect(Object.keys(s.savedItems)).toEqual([first.result.savedItemId]);
    expect(s.savedItems[first.result.savedItemId]).toMatchObject({ meaning: 'Ala (name)', notes: 'first' });
    const spans = Object.values(s.savedOccurrences as Record<string, any>).map(o => [o.cueId, o.sourceContext.charSpan.start, o.sourceContext.charSpan.end]).sort();
    expect(spans).toEqual([[f.cues[0]!.id, 0, 3], [f.cues[2]!.id, 0, 3]].sort());
    expect(Object.keys(s.reviewCards)).toEqual([first.result.cardId]);
  });

  it('fences document saves: a GET-latest stale body cannot overwrite operation rows; an operations-only gap reconciles and keeps document edits', async () => {
    const { root, file, f } = await seededFile();
    const svc = await service(root, file);
    const old = await svc.state(); // a stale client's view: no vocabulary yet
    const cap = (await svc.op('capture', capturePayload(f, f.cues[0]!, 'kota', { meaning: 'cat' }), old.operations)).json.receipt;
    const itemId = cap.result.savedItemId;
    // (1) Old client reads the latest revision but PUTs its old rows (the captured vocabulary missing): refused.
    const latest = await svc.state();
    const getLatestStale = await svc.call('/api/state', 'PUT', { snapshot: old.snapshot, expectedRevision: latest.revision });
    expect(getLatestStale.status).toBe(409);
    expect(getLatestStale.json.code).toBe('operation-owned-rows');
    expect(getLatestStale.json.conflicts).toEqual(expect.arrayContaining([{ collection: 'savedItems', id: itemId, change: 'removed' }]));
    // (2) Same with a modified operation row (meaning reverted) at the latest revision: refused.
    const tampered = structuredClone(latest.snapshot); tampered.savedItems[itemId].meaning = 'dog';
    expect((await svc.call('/api/state', 'PUT', { snapshot: tampered, expectedRevision: latest.revision })).json.code).toBe('operation-owned-rows');
    // (3) The stale client's own document edit (media title) on its old basis: only operations happened since, so it is
    //     accepted; the operation rows are reconciled from the authoritative tables and returned.
    const edited = structuredClone(old.snapshot); edited.mediaAssets[f.media.id].title = 'renamed by stale client';
    const gap = await svc.call('/api/state', 'PUT', { snapshot: edited, expectedRevision: old.revision });
    expect(gap.status).toBe(200);
    expect(Object.keys(gap.json.operationOwned.savedItems)).toEqual([itemId]);
    const after = await svc.state();
    expect(after.snapshot.mediaAssets[f.media.id].title).toBe('renamed by stale client');
    expect(after.snapshot.savedItems[itemId]).toMatchObject({ meaning: 'cat' });
    // (4) Any non-operation write since the basis still conflicts exactly as before (whole-document CAS).
    const stale = await svc.call('/api/state', 'PUT', { snapshot: edited, expectedRevision: old.revision });
    expect(stale.status).toBe(409);
    expect(stale.json.code).toBeUndefined();
    // (5) A stale gap body that ADDS a vocabulary row (old-client local capture) is refused, not silently dropped.
    const s5 = await svc.state();
    const added = structuredClone(s5.snapshot);
    added.savedItems['5d1b7c1e-0000-4000-8000-000000000001'] = { ...added.savedItems[itemId], id: '5d1b7c1e-0000-4000-8000-000000000001', displayText: 'pies' };
    const c5 = (await svc.op('set-meaning', { savedItemId: itemId, meaning: 'cat!', expected: { meaning: 'cat', meaningSource: null } }, s5.operations)).json.receipt;
    expect(c5.status).toBe('applied');
    const addedReply = await svc.call('/api/state', 'PUT', { snapshot: added, expectedRevision: s5.revision });
    expect(addedReply.status).toBe(409);
    expect(addedReply.json.conflicts).toEqual([{ collection: 'savedItems', id: '5d1b7c1e-0000-4000-8000-000000000001', change: 'added' }]);
    expect(itemsByText((await svc.state()).snapshot)).toEqual(['kota']);
  });

  it('keeps dirty review schedule and history across remote capture/archive, and refuses history for a remotely undone card', async () => {
    const { root, file, f } = await seededFile();
    const svc = await service(root, file);
    const s0 = await svc.state();
    const keep = (await svc.op('capture', capturePayload(f, f.cues[0]!, 'kota'), s0.operations)).json.receipt.result;
    const doomed = (await svc.op('capture', capturePayload(f, f.cues[1]!, 'Kot'), s0.operations));
    const base = await svc.state(); // client B studies offline from here
    // Client A: another capture, archive of `keep`, and Undo of `doomed`.
    await svc.op('capture', capturePayload(f, f.cues[2]!, 'psa'), base.operations);
    const archive = await svc.op('set-review-enrolment', { savedItemId: keep.savedItemId, enrolled: false, expected: { activeCardIds: [keep.cardId], archivedCardIds: [] } }, base.operations);
    expect(archive.json.receipt.status).toBe('applied');
    // Client B rated `keep` (schedule + review event) before seeing A's operations.
    const rated = structuredClone(base.snapshot);
    const state = rated.reviewCardStates[keep.cardId];
    rated.reviewCardStates[keep.cardId] = { ...state, state: 'learning', reps: 1, dueAt: '2026-10-31T00:00:00.000Z', updatedAt: AT };
    const event = { id: randomUUID(), cardId: keep.cardId, reviewedAt: AT, rating: 'good', previousStateJson: JSON.stringify(state), nextStateJson: JSON.stringify(rated.reviewCardStates[keep.cardId]), createdAt: AT };
    rated.reviewEvents = [...rated.reviewEvents, event]; rated.learnerAudit.reviewEvents = [...rated.learnerAudit.reviewEvents, event];
    const save = await svc.call('/api/state', 'PUT', { snapshot: rated, expectedRevision: base.revision });
    expect(save.status).toBe(200);
    const s1 = await svc.state();
    expect(s1.snapshot.reviewCardStates[keep.cardId]).toMatchObject({ state: 'learning', reps: 1 });
    expect(s1.snapshot.reviewEvents.map((e: any) => e.id)).toEqual([event.id]);
    expect(s1.snapshot.reviewCards[keep.cardId].suspendedAt).toBeDefined(); // A's archive survived
    expect(itemsByText(s1.snapshot)).toEqual(['Kot', 'kota', 'psa']);
    // Now A undoes `doomed` while B rated it offline: B's save is a dependency conflict, nothing written.
    const s2 = await svc.state();
    const undo = await svc.op('undo-capture', { captureOperationId: doomed.operationId }, s2.operations);
    expect(undo.json.receipt).toMatchObject({ status: 'applied', result: { removedItemId: doomed.json.receipt.result.savedItemId } });
    const offline = structuredClone(s2.snapshot);
    const dState = offline.reviewCardStates[doomed.json.receipt.result.cardId];
    const dEvent = { id: randomUUID(), cardId: dState.cardId, reviewedAt: AT, rating: 'again', previousStateJson: JSON.stringify(dState), nextStateJson: JSON.stringify(dState), createdAt: AT };
    offline.reviewEvents = [...offline.reviewEvents, dEvent]; offline.learnerAudit.reviewEvents = [...offline.learnerAudit.reviewEvents, dEvent];
    const dep = await svc.call('/api/state', 'PUT', { snapshot: offline, expectedRevision: s2.revision });
    expect(dep.status).toBe(409);
    expect(dep.json).toMatchObject({ code: 'operation-dependency', cardIds: [dState.cardId] });
    expect((await svc.state()).revision).toBe(undo.json.receipt.revision);
  });

  it('undo uses the stored capture receipt and current guards; review enrolment checks the expected card identity', async () => {
    const { root, file, f } = await seededFile();
    const svc = await service(root, file);
    const s0 = await svc.state();
    const cap = await svc.op('capture', capturePayload(f, f.cues[0]!, 'kota'), s0.operations);
    const r = cap.json.receipt.result;
    // An edit after the capture makes Undo refuse (never removes changed or pre-existing work).
    await svc.op('set-meaning', { savedItemId: r.savedItemId, meaning: 'cat', expected: { meaning: null, meaningSource: null } }, s0.operations);
    const refused = await svc.op('undo-capture', { captureOperationId: cap.operationId }, s0.operations);
    expect(refused.json.receipt).toMatchObject({ status: 'conflict', result: { reason: 'changed-since-capture' } });
    // A dedup capture's Undo removes only its own occurrence.
    const dup = await svc.op('capture', capturePayload(f, f.cues[1]!, 'Kot'), s0.operations);
    const dup2 = await svc.op('capture', capturePayload(f, f.cues[2]!, 'psa'), s0.operations);
    const undo = await svc.op('undo-capture', { captureOperationId: dup2.operationId }, s0.operations);
    expect(undo.json.receipt.status).toBe('applied');
    const again = await svc.op('undo-capture', { captureOperationId: dup2.operationId }, s0.operations);
    expect(again.json.receipt).toMatchObject({ status: 'conflict', result: { reason: 'changed-since-capture' } });
    expect((await svc.op('undo-capture', { captureOperationId: randomUUID() }, s0.operations)).json.receipt.result.reason).toBe('capture-receipt-unavailable');
    const s = (await svc.state()).snapshot;
    expect(itemsByText(s)).toEqual(['Kot', 'kota']);
    expect(dup.json.receipt.status).toBe('applied');
    // Enrolment: stale expectation conflicts; matching expectation archives then reactivates the same card.
    const stale = await svc.op('set-review-enrolment', { savedItemId: r.savedItemId, enrolled: false, expected: { activeCardIds: [], archivedCardIds: [r.cardId] } }, s0.operations);
    expect(stale.json.receipt).toMatchObject({ status: 'conflict', result: { reason: 'enrolment-changed', current: { activeCardIds: [r.cardId], archivedCardIds: [] } } });
    const off = await svc.op('set-review-enrolment', { savedItemId: r.savedItemId, enrolled: false, expected: { activeCardIds: [r.cardId], archivedCardIds: [] } }, s0.operations);
    expect(off.json.receipt.result).toMatchObject({ activeCardIds: [], archivedCardIds: [r.cardId] });
    const on = await svc.op('set-review-enrolment', { savedItemId: r.savedItemId, enrolled: true, expected: { activeCardIds: [], archivedCardIds: [r.cardId] } }, s0.operations);
    expect(on.json.receipt.result).toMatchObject({ activeCardIds: [r.cardId], archivedCardIds: [] });
  });

  it('after a committed-but-lost acknowledgement and a service restart, the retry replays once; unknown old-incarnation and pre-restore operations are refused', async () => {
    const { root, file, f } = await seededFile();
    let svc = await service(root, file);
    const s0 = await svc.state();
    const payload = capturePayload(f, f.cues[0]!, 'kota');
    const committed = await svc.op('capture', payload, s0.operations); // response "lost" by the client
    expect(committed.json.receipt.status).toBe('applied');
    const neverSent = randomUUID();
    await svc.close();
    svc = await service(root, file); // ordinary restart: new incarnation, same lineage
    const s1 = await svc.state();
    expect(s1.operations.incarnation).not.toBe(s0.operations.incarnation);
    expect(s1.operations.generation).toBe(s0.operations.generation);
    const replay = await svc.op('capture', payload, s0.operations, committed.operationId);
    expect(replay.json).toMatchObject({ replayed: true, receipt: committed.json.receipt });
    const unknown = await svc.op('capture', capturePayload(f, f.cues[1]!, 'Kot'), s0.operations, neverSent);
    expect(unknown.status).toBe(409);
    expect(unknown.json.code).toBe('incarnation-changed');
    expect(itemsByText((await svc.state()).snapshot)).toEqual(['kota']);
  });

  it('a restore commit rotates the lineage generation: pre-restore unknown operations are refused; retained receipts keep their own generation', () => {
    const f = fixtureSnapshot();
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      db.saveSnapshot(f.snapshot, AT, 'rev:1');
      const id0 = db.loadLearnerStateWithOperations().operations;
      const mk = (payload: Record<string, unknown>, operationId = randomUUID()): LearnerOperationRequest => ({ operationId, kind: 'capture', basis: { generation: id0.generation, incarnation: id0.incarnation, receiptSeq: id0.receiptSeq }, payload });
      const first = mk(capturePayload(f, f.cues[0]!, 'kota'));
      const applied = db.applyLearnerOperation(first, learnerOperationApplier(first)).receipt;
      const loaded = db.loadLearnerStateWithOperations();
      const store = new LocalStore({ ...loaded.state, cues: {}, transcriptWordTimings: {} });
      const manifest = new ExportService(store, 'test').buildManifest();
      const preview = db.previewRestore(manifest, 'replace-active', loaded.revision);
      db.commitRestore({ manifest, mode: 'replace-active', expectedRevision: loaded.revision, confirmation: { confirmedAt: AT, confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: preview.preview.warnings.map(w => w.kind) } });
      const id1 = db.loadLearnerStateWithOperations().operations;
      expect(id1.generation).not.toBe(id0.generation);
      expect(id1.incarnation).toBe(id0.incarnation);
      const pending = mk(capturePayload(f, f.cues[1]!, 'Kot'));
      expect(() => db.applyLearnerOperation(pending, learnerOperationApplier(pending))).toThrow(/restored or replaced/);
      const replay = db.applyLearnerOperation(first, learnerOperationApplier(first));
      expect(replay).toMatchObject({ replayed: true, receipt: { generation: id0.generation, seq: applied.seq } });
      expect(replay.operations.generation).toBe(id1.generation);
      // A trusted Undo across the restore boundary cannot use the old lineage's capture receipt.
      const undo: LearnerOperationRequest = { operationId: randomUUID(), kind: 'undo-capture', basis: { generation: id1.generation, incarnation: id1.incarnation, receiptSeq: id1.receiptSeq }, payload: { captureOperationId: first.operationId } };
      expect(db.applyLearnerOperation(undo, learnerOperationApplier(undo)).receipt).toMatchObject({ status: 'conflict', result: { reason: 'capture-receipt-unavailable' } });
      expect(Object.values(db.loadLearnerState().state.savedItems).map(i => i.displayText)).toEqual(['kota']);
    } finally { db.close(); }
  });

  it('prunes receipts by TTL and by cap, and refuses (never re-applies) an unknown request older than the boundary', () => {
    const f = fixtureSnapshot();
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      db.saveSnapshot(f.snapshot, AT, 'rev:1');
      const id0 = db.loadLearnerStateWithOperations().operations;
      const mk = (operationId: string, payload: Record<string, unknown>, basis: { generation: string; incarnation: string; receiptSeq: number } = id0, kind: LearnerOperationRequest['kind'] = 'capture'): LearnerOperationRequest =>
        ({ operationId, kind, basis: { generation: basis.generation, incarnation: basis.incarnation, receiptSeq: basis.receiptSeq }, payload });
      const t0 = new Date('2026-10-01T00:00:00.000Z');
      const old = mk(randomUUID(), capturePayload(f, f.cues[0]!, 'kota'));
      db.applyLearnerOperation(old, learnerOperationApplier(old), t0);
      const notSent = mk(randomUUID(), capturePayload(f, f.cues[1]!, 'Kot')); // created at basis seq 0, never delivered
      // Past the TTL, the next operation prunes the old receipt and moves the boundary past it.
      const later = new Date(t0.valueOf() + LEARNER_OPERATION_RECEIPT_TTL_MS + 1000);
      const id1 = db.loadLearnerStateWithOperations().operations;
      const fresh = mk(randomUUID(), capturePayload(f, f.cues[2]!, 'psa'), id1);
      db.applyLearnerOperation(fresh, learnerOperationApplier(fresh), later);
      expect(db.loadLearnerStateWithOperations().operations).toMatchObject({ receiptSeq: 2, prunedThroughSeq: 1 });
      // The pruned request is unknown now and its basis predates the boundary: refused, not applied a second time.
      expect(() => db.applyLearnerOperation(old, learnerOperationApplier(old), later)).toThrow(OperationIneligibleError);
      expect(() => db.applyLearnerOperation(notSent, learnerOperationApplier(notSent), later)).toThrow(/older than the service keeps records/);
      expect(Object.values(db.loadLearnerState().state.savedItems).map(i => i.displayText).sort()).toEqual(['kota', 'psa']);
      // Cap: conflict receipts are cheap; after CAP more, the boundary covers the earliest of them.
      let basis = db.loadLearnerStateWithOperations().operations;
      let firstOfMany: LearnerOperationRequest | undefined;
      for (let i = 0; i < LEARNER_OPERATION_RECEIPT_CAP + 1; i++) {
        const r = mk(randomUUID(), { savedItemId: randomUUID(), meaning: 'x', expected: { meaning: null, meaningSource: null } }, basis, 'set-meaning');
        db.applyLearnerOperation(r, learnerOperationApplier(r), later);
        if (i === 0) { firstOfMany = r; basis = db.loadLearnerStateWithOperations().operations; }
      }
      const after = db.loadLearnerStateWithOperations().operations;
      expect(after.receiptSeq).toBe(LEARNER_OPERATION_RECEIPT_CAP + 3);
      expect(after.prunedThroughSeq).toBe(3);
      const raw = (db as unknown as { db: DatabaseSync }).db;
      expect((raw.prepare('SELECT COUNT(*) AS n FROM learner_operation_receipt').get() as { n: number }).n).toBe(LEARNER_OPERATION_RECEIPT_CAP);
      // Its exact retry (basis seq 2 < boundary 3) is refused; a request based on seq 3 is still decidable and applies.
      expect(() => db.applyLearnerOperation(firstOfMany!, learnerOperationApplier(firstOfMany!), later)).toThrow(OperationIneligibleError);
      const decidable = mk(randomUUID(), { savedItemId: randomUUID(), meaning: 'x', expected: { meaning: null, meaningSource: null } }, { ...basis, receiptSeq: 3 }, 'set-meaning');
      expect(db.applyLearnerOperation(decidable, learnerOperationApplier(decidable), later).replayed).toBe(false);
      // Id reuse with a different request is refused while the receipt is retained.
      expect(() => db.applyLearnerOperation({ ...decidable, payload: { ...decidable.payload, meaning: 'y' } }, learnerOperationApplier(decidable), later)).toThrow(OperationIdReusedError);
    } finally { db.close(); }
  }, 120_000);

  it('rolls back everything when the receipt insert or the COMMIT fails; the retry then applies exactly once', async () => {
    const { file, f } = await seededFile();
    let db = SqliteLocalPersistence.open(file);
    try {
      const raw = (db as unknown as { db: DatabaseSync }).db;
      const id0 = db.loadLearnerStateWithOperations();
      const req: LearnerOperationRequest = { operationId: randomUUID(), kind: 'capture', basis: { generation: id0.operations.generation, incarnation: id0.operations.incarnation, receiptSeq: 0 }, payload: capturePayload(f, f.cues[0]!, 'kota') };
      raw.exec("CREATE TEMP TRIGGER fail_receipt BEFORE INSERT ON learner_operation_receipt BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;");
      expect(() => db.applyLearnerOperation(req, learnerOperationApplier(req))).toThrow(/injected receipt failure/);
      expect(db.loadLearnerStateWithOperations()).toMatchObject({ revision: id0.revision, operations: { receiptSeq: 0, protectionActive: false } });
      expect(Object.keys(db.loadLearnerState().state.savedItems)).toEqual([]);
      raw.exec('DROP TRIGGER fail_receipt');
      // A deferred foreign-key violation makes the COMMIT itself fail. The gate references an EXISTING (empty) main-schema
      // parent, so every statement inside the transaction succeeds and only the COMMIT's deferred check fails.
      raw.exec(`CREATE TABLE commit_parent (id INTEGER PRIMARY KEY);
        CREATE TABLE commit_gate (x INTEGER REFERENCES commit_parent(id) DEFERRABLE INITIALLY DEFERRED);
        CREATE TRIGGER fail_commit AFTER INSERT ON learner_operation_receipt BEGIN INSERT INTO commit_gate (x) VALUES (1); END;`);
      const before = db.loadLearnerStateWithOperations();
      const exec = raw.exec.bind(raw); const statements: string[] = [];
      raw.exec = ((sql: string) => { statements.push(sql); return exec(sql); }) as typeof raw.exec;
      let commitError: unknown;
      try { db.applyLearnerOperation(req, learnerOperationApplier(req)); } catch (error) { commitError = error; } finally { raw.exec = exec; }
      // The failure happened AT the COMMIT (reached exactly once, then rolled back), not earlier in the transaction.
      expect(statements).toEqual(['BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK']);
      expect(String((commitError as Error | undefined)?.message)).toMatch(/FOREIGN KEY constraint failed/);
      expect(db.loadLearnerStateWithOperations()).toEqual(before);
      expect(Object.keys(db.loadLearnerState().state.savedItems)).toEqual([]);
      raw.exec('DROP TRIGGER fail_commit; DROP TABLE commit_gate; DROP TABLE commit_parent;');
      // The same request (same process) now applies exactly once; its retry replays.
      expect(db.applyLearnerOperation(req, learnerOperationApplier(req)).replayed).toBe(false);
      expect(db.applyLearnerOperation(req, learnerOperationApplier(req)).replayed).toBe(true);
      expect(Object.values(db.loadLearnerState().state.savedItems).map(i => i.displayText)).toEqual(['kota']);
      const neverCommitted: LearnerOperationRequest = { ...req, operationId: randomUUID(), payload: capturePayload(f, f.cues[1]!, 'Kot') };
      db.close(); db = SqliteLocalPersistence.open(file);
      // New process incarnation: the committed request still replays (no second effect); an unknown request from the old
      // incarnation is refused, and its rebuilt request applies once.
      expect(db.applyLearnerOperation(req, learnerOperationApplier(req)).replayed).toBe(true);
      expect(() => db.applyLearnerOperation(neverCommitted, learnerOperationApplier(neverCommitted))).toThrow(OperationIneligibleError);
      const id1 = db.loadLearnerStateWithOperations().operations;
      const again = { ...neverCommitted, operationId: randomUUID(), basis: { generation: id1.generation, incarnation: id1.incarnation, receiptSeq: id1.receiptSeq } };
      expect(db.applyLearnerOperation(again, learnerOperationApplier(again)).replayed).toBe(false);
      expect(db.applyLearnerOperation(again, learnerOperationApplier(again)).replayed).toBe(true);
      expect(Object.values(db.loadLearnerState().state.savedItems).map(i => i.displayText).sort()).toEqual(['Kot', 'kota']);
    } finally { db.close(); }
  });

  it('v13 is additive: an upgraded database keeps whole-document semantics until the first operation', async () => {
    const { file, f } = await seededFile();
    const db = SqliteLocalPersistence.open(file);
    try {
      expect(db.status().schemaVersion).toBe(14);
      expect(db.listMigrations().map(m => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
      const { state, revision, operations } = db.loadLearnerStateWithOperations();
      expect(operations.protectionActive).toBe(false);
      // Before any operation, a document save may still create vocabulary rows (historical contract, unpaired import).
      const withItem = structuredClone(state) as any;
      withItem.savedItems['5d1b7c1e-0000-4000-8000-000000000002'] = { id: '5d1b7c1e-0000-4000-8000-000000000002', kind: 'lexeme', language: 'pl', displayText: 'legacy', createdAt: AT, updatedAt: AT };
      const r2 = db.saveLearnerState(withItem, revision, AT);
      expect(Object.keys(db.loadLearnerState().state.savedItems)).toEqual(['5d1b7c1e-0000-4000-8000-000000000002']);
      // ...and still conflicts on any stale basis.
      expect(() => db.saveLearnerState(withItem, revision, AT)).toThrow(/Durable state changed/);
      expect(r2).toBe('rev:3');
      expect(f.track.transcriptStatus).toBe('approved');
    } finally { db.close(); }
  });
});

// lt-192.3 independent-review corrections (R1, R2, R4, R5). Each case first establishes the positive control.
describe('lt-192.3 review corrections: ownership and validation', () => {
  function memoryDb() {
    const f = fixtureSnapshot();
    const db = SqliteLocalPersistence.open(':memory:');
    db.saveSnapshot(f.snapshot, AT, 'rev:1');
    const request = (kind: LearnerOperationRequest['kind'], payload: Record<string, unknown>): LearnerOperationRequest => {
      const { generation, incarnation, receiptSeq } = db.loadLearnerStateWithOperations().operations;
      return { operationId: randomUUID(), kind, basis: { generation, incarnation, receiptSeq }, payload };
    };
    const apply = (kind: LearnerOperationRequest['kind'], payload: Record<string, unknown>) => { const r = request(kind, payload); return db.applyLearnerOperation(r, learnerOperationApplier(r)).receipt; };
    return { f, db, request, apply };
  }
  const restoreRequest = (manifest: unknown, expectedRevision: string, warnings: ReturnType<SqliteLocalPersistence['previewRestore']>['preview']['warnings']) =>
    ({ manifest, mode: 'replace-active' as const, expectedRevision, confirmation: { confirmedAt: AT, confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: warnings.map(w => w.kind) } });

  it('R1: a restore preview/confirmation is bound to the exact revision it previewed; an intervening operation forces a fresh preview', () => {
    const { f, db, apply } = memoryDb();
    try {
      const s = db.loadLearnerState();
      const manifest = new ExportService(new LocalStore({ ...s.state, cues: {}, transcriptWordTimings: {} }), 'test').buildManifest();
      const preview = db.previewRestore(manifest, 'replace-active', s.revision);
      const cap = apply('capture', capturePayload(f, f.cues[0]!, 'kota'));
      const afterCapture = db.loadLearnerStateWithOperations();
      // The stale confirmation and a stale preview are refused; nothing changes; the captured item survives.
      expect(() => db.commitRestore(restoreRequest(manifest, s.revision, preview.preview.warnings))).toThrow(/Durable state changed/);
      expect(() => db.previewRestore(manifest, 'replace-active', s.revision)).toThrow(/Durable state changed/);
      expect(db.loadLearnerStateWithOperations()).toEqual(afterCapture);
      expect(db.loadLearnerState().state.savedItems[cap.result.savedItemId as string]).toBeDefined();
      // Positive control: a fresh preview at the current revision shows the removal and its confirmation commits.
      const fresh = db.previewRestore(manifest, 'replace-active', afterCapture.revision);
      db.commitRestore(restoreRequest(manifest, afterCapture.revision, fresh.preview.warnings));
      expect(Object.keys(db.loadLearnerState().state.savedItems)).toEqual([]);
    } finally { db.close(); }
  });

  it('R2: a stale document body that changed an operation-touched row is refused (local edit kept); unchanged historical images still rebase', () => {
    const { f, db, apply } = memoryDb();
    try {
      const cap = apply('capture', capturePayload(f, f.cues[0]!, 'kota'));
      const id = cap.result.savedItemId as string;
      const basis = db.loadLearnerState();
      const local = structuredClone(basis.state) as any;
      local.savedItems[id].meaning = 'MY UNSAVED LOCAL EDIT';
      const remote = apply('set-meaning', { savedItemId: id, meaning: 'REMOTE EDIT', expected: { meaning: null, meaningSource: null } });
      expect(remote.status).toBe('applied');
      const beforeSave = db.loadLearnerStateWithOperations();
      const fence: { reconciled?: boolean } = {};
      expect(() => db.saveLearnerState(local, basis.revision, AT, fence)).toThrow(OperationOwnedConflictError);
      expect(db.loadLearnerStateWithOperations()).toEqual(beforeSave);
      expect(db.loadLearnerState().state.savedItems[id]!.meaning).toBe('REMOTE EDIT');
      // The same edit after a further operation (two touches since the basis) is refused too.
      apply('set-meaning', { savedItemId: id, meaning: 'REMOTE 2', expected: { meaning: 'REMOTE EDIT', meaningSource: { kind: 'learner' } } });
      expect(() => db.saveLearnerState(local, basis.revision, AT)).toThrow(OperationOwnedConflictError);
      // Positive controls on the same basis: the unchanged basis image, and the intermediate image a client installed from
      // an acknowledged receipt, both rebase onto the authoritative row and keep the document edit.
      const stale = structuredClone(basis.state) as any; stale.mediaAssets[f.media.id].title = 'stale document edit';
      const ok: { reconciled?: boolean; operationOwned?: any } = {};
      const rev = db.saveLearnerState(stale, basis.revision, AT, ok);
      expect(ok.reconciled).toBe(true);
      expect(ok.operationOwned.savedItems[id].meaning).toBe('REMOTE 2');
      const after = db.loadLearnerState();
      expect(after.revision).toBe(rev);
      expect(after.state.mediaAssets[f.media.id]!.title).toBe('stale document edit');
      const b2 = db.loadLearnerState();
      const installed = structuredClone(b2.state) as any;
      apply('set-meaning', { savedItemId: id, meaning: 'REMOTE 3', expected: { meaning: 'REMOTE 2', meaningSource: { kind: 'learner' } } });
      const own = apply('set-meaning', { savedItemId: id, meaning: 'REMOTE 4', expected: { meaning: 'REMOTE 3', meaningSource: { kind: 'learner' } } });
      const mid = (own.rows.savedItems as any)[id]; // receipt image this client installed
      installed.savedItems[id] = mid;
      apply('set-meaning', { savedItemId: id, meaning: 'REMOTE 5', expected: { meaning: 'REMOTE 4', meaningSource: { kind: 'learner' } } });
      expect(() => db.saveLearnerState(installed, b2.revision, AT)).not.toThrow();
      expect(db.loadLearnerState().state.savedItems[id]!.meaning).toBe('REMOTE 5');
    } finally { db.close(); }
  });

  it('R2: a stale body that deletes or resurrects an operation-touched row differently from its history is refused', () => {
    const { f, db, apply } = memoryDb();
    try {
      const cap = apply('capture', capturePayload(f, f.cues[0]!, 'kota'));
      const id = cap.result.savedItemId as string;
      const basis = db.loadLearnerState();
      // Local deletion of a row that existed at the basis, while a remote operation changed it: refused.
      const deleted = structuredClone(basis.state) as any; delete deleted.savedItems[id];
      apply('set-meaning', { savedItemId: id, meaning: 'remote', expected: { meaning: null, meaningSource: null } });
      expect(() => db.saveLearnerState(deleted, basis.revision, AT)).toThrow(OperationOwnedConflictError);
      expect(db.loadLearnerState().state.savedItems[id]!.meaning).toBe('remote');
    } finally { db.close(); }
  });

  it('R5: every document writer, including the internal saveSnapshot, is fenced: a stale snapshot cannot delete operation rows', () => {
    const { f, db, apply } = memoryDb();
    try {
      const before = db.loadVersionedSnapshot();
      const cap = apply('capture', capturePayload(f, f.cues[0]!, 'kota'));
      const itemId = cap.result.savedItemId as string;
      const afterCapture = db.loadLearnerStateWithOperations();
      // Without an expected revision the basis is the current revision: any operation-row difference is refused.
      expect(() => db.saveSnapshot(before.snapshot, AT)).toThrow(OperationOwnedConflictError);
      // A stale snapshot that edits (or deletes) the captured row on its old basis is refused.
      apply('set-meaning', { savedItemId: itemId, meaning: 'remote', expected: { meaning: null, meaningSource: null } });
      const afterMeaning = db.loadLearnerStateWithOperations();
      const mine = db.loadVersionedSnapshot(); const tampered = structuredClone(afterCapture.state) as any;
      tampered.savedItems[itemId].meaning = 'local';
      expect(() => db.saveSnapshot({ ...mine.snapshot, savedItems: tampered.savedItems }, AT, afterCapture.revision)).toThrow(OperationOwnedConflictError);
      expect(db.loadLearnerStateWithOperations()).toEqual(afterMeaning);
      expect(afterMeaning.state.savedItems[itemId]!.meaning).toBe('remote');
      // The reviewer's probe: the pre-capture snapshot at its own (operation-only stale) basis no longer deletes the
      // captured item; it is an unmodified historical view and rebases onto the authoritative rows.
      db.saveSnapshot(before.snapshot, AT, before.revision);
      expect(db.loadLearnerState().state.savedItems[itemId]).toMatchObject({ meaning: 'remote' });
      // Positive control: the current snapshot (operation rows included) still saves through the fixture writer.
      const current = db.loadVersionedSnapshot();
      expect(db.saveSnapshot(current.snapshot, AT, current.revision)).toBe(`rev:${Number(current.revision.slice(4)) + 1}`);
      // ...and a fixture snapshot with a document edit on a stale-but-operation-only basis rebases.
      const s2 = db.loadVersionedSnapshot();
      apply('set-meaning', { savedItemId: cap.result.savedItemId, meaning: 'cat', expected: { meaning: 'remote', meaningSource: { kind: 'learner' } } });
      const edited = structuredClone(s2.snapshot) as any; edited.mediaAssets[f.media.id].title = 'fixture edit';
      db.saveSnapshot(edited, AT, s2.revision);
      const s3 = db.loadLearnerState().state;
      expect(s3.mediaAssets[f.media.id]!.title).toBe('fixture edit');
      expect(s3.savedItems[cap.result.savedItemId as string]!.meaning).toBe('cat');
    } finally { db.close(); }
  });

  it('R4: capture spans must agree with the authoritative segmentation; contradictory spans are refused with nothing stored', async () => {
    const { root, file, f } = await seededFile();
    const svc = await service(root, file);
    const s0 = await svc.state();
    const cue = f.cues[0]!; // "Ala ma kota"
    const good = capturePayload(f, cue, 'kota');
    expect(good.sourceContext.tokenSpan).toEqual({ startToken: 2, endToken: 3 });
    const bad = (tokenSpan: unknown, charSpan: unknown = good.sourceContext.charSpan) => ({ ...good, sourceContext: { ...good.sourceContext, tokenSpan, charSpan } });
    const cases: [string, unknown][] = [
      ['kota chars, Ala tokens', bad({ startToken: 0, endToken: 1 })],
      ['kota chars, ma tokens', bad({ startToken: 1, endToken: 2 })],
      ['kota chars, ma+kota tokens', bad({ startToken: 1, endToken: 3 })],
    ];
    for (const [label, payload] of cases) {
      const reply = await svc.op('capture', payload, s0.operations);
      expect(reply.status, label).toBe(409);
      expect(reply.json.code, label).toBe('source-mismatch');
    }
    const s1 = await svc.state();
    expect(s1.revision).toBe(s0.revision);
    expect(s1.operations.receiptSeq).toBe(0);
    expect(itemsByText(s1.snapshot)).toEqual([]);
    // Positive control: the agreeing span applies.
    expect((await svc.op('capture', good, s0.operations)).json.receipt.status).toBe('applied');
  });

  it('R4: spans follow the browser capture segmentation (punctuation is a token); whitespace word indices are refused', () => {
    const f = fixtureSnapshot(['Cześć, Ala ma kota.']);
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      db.saveSnapshot(f.snapshot, AT, 'rev:1');
      const cue = f.cues[0]!;
      const run = (payload: Record<string, unknown>) => {
        const { generation, incarnation, receiptSeq } = db.loadLearnerStateWithOperations().operations;
        const r: LearnerOperationRequest = { operationId: randomUUID(), kind: 'capture', basis: { generation, incarnation, receiptSeq }, payload };
        try { return db.applyLearnerOperation(r, learnerOperationApplier(r)).receipt.status; } catch (error) { return (error as { code?: string }).code ?? (error as Error).message; }
      };
      const span = (kind: string, text: string, start: number, tokens: [number, number]) => {
        const p = capturePayload(f, cue, text);
        return { ...p, kind, sourceContext: { ...p.sourceContext, charSpan: { start, end: start + text.length }, tokenSpan: { startToken: tokens[0], endToken: tokens[1] } } };
      };
      // "Cześć" 0, "," 1, "Ala" 2, "ma" 3, "kota" 4, "." 5 (cueWordTokens). Whitespace word indices disagree and are refused.
      expect(run(span('lexeme', 'Ala', 7, [1, 2]))).toBe('source-mismatch');
      expect(run(span('phrase', 'Ala ma', 7, [1, 3]))).toBe('source-mismatch');
      expect(run(span('lexeme', 'kota', 14, [4, 6]))).toBe('source-mismatch');
      expect(Object.keys(db.loadLearnerState().state.savedItems)).toEqual([]);
      expect(run(span('lexeme', 'Ala', 7, [2, 3]))).toBe('applied');
      expect(run(span('phrase', 'Ala ma', 7, [2, 4]))).toBe('applied');
      expect(run(span('phrase', 'Cześć, Ala', 0, [0, 3]))).toBe('applied');
      expect(run(span('lexeme', 'kota', 14, [4, 5]))).toBe('applied');
    } finally { db.close(); }
  });

  it('R4: typed ids and expected values are validated before execution: invalid bodies are 400 with no receipt, row or revision', async () => {
    const { root, file, f } = await seededFile();
    const svc = await service(root, file);
    const s0 = await svc.state();
    const cap = (await svc.op('capture', capturePayload(f, f.cues[0]!, 'kota'), s0.operations)).json.receipt;
    const id = cap.result.savedItemId;
    const s1 = await svc.state();
    const empty = { meaning: null, meaningSource: null };
    const good = capturePayload(f, f.cues[1]!, 'Kot');
    const sc = good.sourceContext;
    const cases: [string, string, unknown][] = [
      ['numeric savedItemId (set-meaning)', 'set-meaning', { savedItemId: 42, meaning: 'x', expected: empty }],
      ['missing-ish savedItemId (set-meaning)', 'set-meaning', { savedItemId: null, meaning: 'x', expected: empty }],
      ['numeric savedItemId (enrolment)', 'set-review-enrolment', { savedItemId: 42, enrolled: false, expected: { activeCardIds: [], archivedCardIds: [] } }],
      ['empty meaning (use null to clear)', 'set-meaning', { savedItemId: id, meaning: '   ', expected: empty }],
      ['expected.meaning number', 'set-meaning', { savedItemId: id, meaning: 'x', expected: { meaning: 5, meaningSource: null } }],
      ['expected.meaningSource invalid', 'set-meaning', { savedItemId: id, meaning: 'x', expected: { meaning: null, meaningSource: { kind: 'oracle' } } }],
      ['expected.meaningSource without meaning', 'set-meaning', { savedItemId: id, meaning: 'x', expected: { meaning: null, meaningSource: { kind: 'learner' } } }],
      ['enrolled string', 'set-review-enrolment', { savedItemId: id, enrolled: 'no', expected: { activeCardIds: [], archivedCardIds: [] } }],
      ['capture kind', 'capture', { ...good, kind: 'word' }],
      ['capture language number', 'capture', { ...good, language: 7 }],
      ['capture displayText empty', 'capture', { ...good, displayText: ' ' }],
      ['capture mediaId number', 'capture', { ...good, mediaId: 1 }],
      ['capture startMs string', 'capture', { ...good, startMs: '0' }],
      ['capture negative endMs', 'capture', { ...good, endMs: -1 }],
      ['capture meaning number', 'capture', { ...good, meaning: 3 }],
      ['capture meaningSource without meaning', 'capture', { ...good, meaningSource: { kind: 'learner' } }],
      ['capture meaningSource invalid', 'capture', { ...good, meaning: 'cat', meaningSource: { kind: 'oracle' } }],
      ['capture notes number', 'capture', { ...good, notes: 1 }],
      ['sourceContext missing key', 'capture', { ...good, sourceContext: { ...sc, charSpan: undefined } }],
      ['sourceContext extra key', 'capture', { ...good, sourceContext: { ...sc, extra: 1 } }],
      ['sourceContext mediaPath number', 'capture', { ...good, sourceContext: { ...sc, mediaPath: 1 } }],
      ['sourceContext mediaFingerprint number', 'capture', { ...good, sourceContext: { ...sc, mediaFingerprint: 1 } }],
      ['sourceContext subtitleTrackId bad', 'capture', { ...good, sourceContext: { ...sc, subtitleTrackId: 'nope' } }],
      ['sourceContext timeRange string', 'capture', { ...good, sourceContext: { ...sc, timeRangeMs: { start: '0', end: 900 } } }],
      ['sourceContext tokenSpan float', 'capture', { ...good, sourceContext: { ...sc, tokenSpan: { startToken: 0.5, endToken: 1 } } }],
      ['sourceContext charSpan extra', 'capture', { ...good, sourceContext: { ...sc, charSpan: { start: 0, end: 3, x: 1 } } }],
      ['sourceContext ids disagree', 'capture', { ...good, sourceContext: { ...sc, cueId: f.cues[2]!.id } }],
    ];
    for (const [label, kind, payload] of cases) {
      const reply = await svc.op(kind, payload, s1.operations);
      expect(reply.status, label).toBe(400);
      expect(reply.json.code, label).toBe('invalid-operation');
    }
    const s2 = await svc.state();
    expect(s2.revision).toBe(s1.revision);
    expect(s2.operations.receiptSeq).toBe(s1.operations.receiptSeq);
    expect(s2.snapshot).toEqual(s1.snapshot);
    // Positive controls: the valid forms of the same operations apply.
    expect((await svc.op('set-meaning', { savedItemId: id, meaning: 'cat', expected: empty }, s1.operations)).json.receipt.status).toBe('applied');
    expect((await svc.op('capture', good, s1.operations)).json.receipt.status).toBe('applied');
  });
});
