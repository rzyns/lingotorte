import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureLexeme } from '../helpers/capture';
import {
  OUTBOX_FULL_MESSAGE, addSavedItemsToReview, archiveReviewCardsForSavedItem, bootLearnerOperations, connectLocalService, createAppModel, discardLearnerOperation,
  importFixtureMediaAndSubtitles, learnerOperationsActive, learnerOperationsIdle, pairLocalService, reapplyLearnerOperation, resolveLocalServiceConnection,
  saveModelToLocalService, saveSelectionWithReceipt, setLocalServiceAutosave, setSavedItemMeaning, submitReviewRating, undoSave, useLearnerOperationOutbox,
  unappliedDraftOutcomes, dismissUnappliedDraft, applyUnappliedDraftMeaning,
} from '../../apps/web/src/model';
import { createMemoryOutboxBackend, OUTBOX_CAP, OUTBOX_DISPATCH_LEASE_MS, OUTBOX_RESOLVED_RETENTION_MS } from '../../apps/web/src/operationOutbox';
import { renderSavedView } from '../../apps/web/src/views/saved';
import { startLingotorteLocalService } from '../../apps/local-service/src/server';
import { LocalStore } from '../../packages/storage/src/localStore';
import { ExportService } from '../../packages/storage/src/exportRestoreService';
import type { AppModel } from '../../apps/web/src/uiTypes';
import type { SaveReceipt } from '../../apps/web/src/model';

// lt-192.3 (ADR-0004): browser vocabulary writers integrated with server-owned operations against the REAL local
// service and SQLite store. Outbox durability here uses the in-memory backend with the same transition semantics;
// real IndexedDB, reload and same-origin two-tab behaviour are qualified in the Chromium lane (docs/dev result).

const roots: string[] = [];
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  while (closers.length) await closers.pop()!();
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

async function startService(root?: string, port = 0) {
  const dir = root ?? await mkdtemp(join(process.env.LINGOTORTE_SCRATCH_DIR ?? tmpdir(), 'lt-192-3-web-'));
  if (!root) roots.push(dir);
  let capability = '';
  const config = { host: '127.0.0.1', port, databasePath: join(dir, 'state.db'), scratchDir: join(dir, 'scratch'), modelCacheDir: join(dir, 'models'), allowOnlineProviders: false } as const;
  const service = await startLingotorteLocalService(config, { receiveCapability(value) { capability = value; } });
  let open = true;
  const close = async () => { if (open) { open = false; await service.close(); } };
  closers.push(close);
  const fetchJson = async (path: string, method = 'GET', body?: unknown) => {
    const r = await fetch(`${service.origin}${path}`, { method, headers: { authorization: `Bearer ${capability}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, json: await r.json() as Record<string, any> };
  };
  return { root: dir, origin: service.origin, port: Number(new URL(service.origin).port), close, fetchJson, pair(model: AppModel) { pairLocalService(model, capability, service.origin); } };
}
type Service = Awaited<ReturnType<typeof startService>>;

async function seedService(service: Service): Promise<AppModel> {
  const seed = createAppModel(); service.pair(seed);
  await importFixtureMediaAndSubtitles(seed, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
  expect((await saveModelToLocalService(seed, service.origin)).ok).toBe(true);
  return seed;
}
async function client(service: Service, backend = createMemoryOutboxBackend()) {
  const model = createAppModel(); useLearnerOperationOutbox(model, backend); service.pair(model);
  expect((await connectLocalService(model, service.origin)).ok).toBe(true);
  expect(learnerOperationsActive(model)).toBe(true);
  return model;
}
const word = (model: AppModel, cueIndex: number, wordIndex: number) => {
  const cue = model.cues[cueIndex]!;
  const parts = [...cue.text.matchAll(/\S+/g)];
  const m = parts[wordIndex]!;
  const text = m[0].replace(/[.,!?;:]+$/, '');
  return { cue, text, start: m.index!, end: m.index! + text.length, token: wordIndex };
};
async function capture(model: AppModel, cueIndex: number, wordIndex: number, meaning = '') {
  const w = word(model, cueIndex, wordIndex);
  model.selection = { kind: 'lexeme', text: w.text, cueId: w.cue.id, tokenStart: w.token, tokenEnd: w.token + 1, charStart: w.start, charEnd: w.end };
  model.pendingMeaning = meaning; model.pendingNotes = '';
  try { return (await saveSelectionWithReceipt(model))!; } finally { model.selection = null; model.pendingMeaning = ''; }
}
const serverItems = async (service: Service) => Object.values((await service.fetchJson('/api/state')).json.snapshot.savedItems as Record<string, any>);
const pendingText = (r: SaveReceipt) => { if (!r.pending) throw new Error('expected pending'); return r.displayText; };
const done = (r: SaveReceipt) => { if (r.pending) throw new Error(`still pending: ${r.displayText}`); return r; };
const texts = (items: { displayText: string }[]) => items.map(i => i.displayText).sort();
const opPosts = (calls: unknown[][]) => calls.filter(([url, init]) => String(url).endsWith('/api/learner/operations') && (init as RequestInit | undefined)?.method === 'POST');

describe('lt-192.3 browser vocabulary operations (real service)', () => {
  it('two clients: independent captures and meaning edits both survive; a same-item meaning edit is shown as a conflict, not overwritten', async () => {
    const service = await startService(); await seedService(service);
    const a = await client(service); const b = await client(service);
    const ra = done(await capture(a, 0, 0)); const rb = done(await capture(b, 1, 0));
    expect(texts(await serverItems(service))).toEqual(texts([ra.item, rb.item]));
    // B reloads the service view (sees A's item without a meaning); then both edit different items.
    expect((await connectLocalService(b, service.origin)).ok).toBe(true);
    setSavedItemMeaning(a, ra.item.id, 'hello'); setSavedItemMeaning(b, rb.item.id, 'and');
    await learnerOperationsIdle(a); await learnerOperationsIdle(b);
    // B, still showing A's item without a meaning, edits it: a stored conflict, visible, A's meaning kept.
    expect(b.store.getSavedItem(ra.item.id)?.meaning).toBeUndefined();
    setSavedItemMeaning(b, ra.item.id, 'overwrite?');
    await learnerOperationsIdle(b);
    const conflicts = b.learnerOperations.records.filter(r => r.status === 'conflict');
    expect(conflicts.map(r => r.error?.code)).toEqual(['meaning-changed']);
    const items = await serverItems(service);
    expect(items.find(i => i.id === ra.item.id)).toMatchObject({ meaning: 'hello' });
    expect(items.find(i => i.id === rb.item.id)).toMatchObject({ meaning: 'and' });
    expect(b.localService.syncState).not.toBe('saved');
    // "Apply mine anyway" is an explicit new operation against the service's current value.
    expect((await connectLocalService(b, service.origin)).ok).toBe(true);
    expect(await reapplyLearnerOperation(b, conflicts[0]!.operationId)).toBe(true);
    await learnerOperationsIdle(b);
    expect(b.learnerOperations.records).toHaveLength(0);
    expect((await serverItems(service)).find(i => i.id === ra.item.id)).toMatchObject({ meaning: 'overwrite?' });
  });

  it('a capture of an already-saved normalized word joins the canonical item and discloses the unapplied meaning', async () => {
    const service = await startService(); await seedService(service);
    const a = await client(service); const b = await client(service);
    const first = done(await capture(a, 0, 0, 'first meaning'));
    const again = done(await capture(b, 0, 0, 'second meaning'));
    expect(again.item.id).toBe(first.item.id);
    expect(again.unappliedDraft).toMatchObject({ meaning: 'second meaning', existingMeaning: 'first meaning' });
    expect(again.isNewItem).toBe(false);
    expect(b.store.getSavedItem(first.item.id)).toMatchObject({ meaning: 'first meaning' });
    expect(await serverItems(service)).toHaveLength(1);
  });

  it('autosave off queues durably and sends only on explicit Save; cancel-before-send never reaches the service', async () => {
    const service = await startService(); await seedService(service);
    const a = await client(service);
    setLocalServiceAutosave(a, false);
    const spy = vi.fn(fetch); vi.stubGlobal('fetch', spy);
    const queued = await capture(a, 0, 0);
    expect(queued.pending).toBe(true);
    expect(a.learnerOperations.records.map(r => r.status)).toEqual(['pending']);
    expect(opPosts(spy.mock.calls)).toHaveLength(0);
    // Undo before send cancels the intent atomically.
    expect(await undoSave(a, queued)).toBe(true);
    expect(a.learnerOperations.records).toHaveLength(0);
    const kept = await capture(a, 1, 0);
    expect(kept.pending).toBe(true);
    expect(await serverItems(service)).toHaveLength(0);
    expect(await saveModelToLocalService(a)).toMatchObject({ ok: true });
    expect(opPosts(spy.mock.calls)).toHaveLength(1);
    expect(texts(await serverItems(service))).toEqual([pendingText(kept)]);
    expect(a.localService.syncState).toBe('saved');
  });

  it('a lost acknowledgement survives a browser reload and a service restart: the same id is re-sent and applied once', async () => {
    const service = await startService(); await seedService(service);
    const backend = createMemoryOutboxBackend(); // stands in for the per-origin IndexedDB outbox across a reload
    const a = await client(service, backend);
    const realFetch = globalThis.fetch;
    let dropped = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const reply = await realFetch(input, init);
      if (String(input).endsWith('/api/learner/operations') && dropped === 0) { dropped++; expect(reply.status).toBe(200); await reply.json(); throw new TypeError('ack lost'); }
      return reply;
    }));
    const lost = await capture(a, 0, 0, 'cat');
    expect(lost.pending).toBe(true); // never "Saved" without the acknowledgement
    expect(dropped).toBe(1);
    expect([...backend.records.values()].map(r => r.status)).toEqual(['sending']); // may-have-sent, durable
    vi.unstubAllGlobals();
    expect(await serverItems(service)).toHaveLength(1); // the service DID commit
    await service.close();
    const restarted = await startService(service.root, service.port); // same origin, new capability and incarnation
    expect(restarted.origin).toBe(service.origin);
    // Reload: a fresh page over the same outbox, paired again with the restarted service.
    const reloaded = createAppModel(); useLearnerOperationOutbox(reloaded, backend);
    reloaded.localService.baseUrl = restarted.origin;
    await bootLearnerOperations(reloaded);
    expect(reloaded.learnerOperations.records.map(r => r.status)).toEqual(['sending']); // visible before connecting
    // A different page may re-send only after the dispatch lease of the page that claimed it expired (no two pages
    // send one operation concurrently). A reloaded browser tab keeps its id (Web Locks + sessionStorage, proven in the
    // real-browser proof); jsdom has no Web Locks, so here the lease is aged instead.
    for (const [id, r] of backend.records) backend.records.set(id, { ...r, dispatch: { owner: r.dispatch!.owner, at: Date.now() - OUTBOX_DISPATCH_LEASE_MS - 1 } });
    setLocalServiceAutosave(reloaded, false);
    restarted.pair(reloaded);
    expect((await connectLocalService(reloaded, restarted.origin)).ok).toBe(true);
    expect(await saveModelToLocalService(reloaded)).toMatchObject({ ok: true });
    const items = await serverItems(restarted);
    expect(texts(items)).toEqual([pendingText(lost)]); // exactly once
    expect([...backend.records.values()].map(r => [r.status, r.receipt?.seq])).toEqual([['acked', 1]]);
    expect(reloaded.store.getSavedItem(items[0].id)).toMatchObject({ meaning: 'cat' });
  });

  it('an operation never sent before a service restart is blocked (not applied) and can be reapplied explicitly', async () => {
    const service = await startService(); await seedService(service);
    const backend = createMemoryOutboxBackend();
    const a = await client(service, backend);
    setLocalServiceAutosave(a, false);
    const queued = await capture(a, 0, 0);
    expect(queued.pending).toBe(true);
    await service.close();
    const restarted = await startService(service.root, service.port);
    const b = createAppModel(); useLearnerOperationOutbox(b, backend); b.localService.baseUrl = restarted.origin; await bootLearnerOperations(b);
    setLocalServiceAutosave(b, false);
    restarted.pair(b); await connectLocalService(b, restarted.origin);
    expect((await saveModelToLocalService(b)).ok).toBe(false);
    expect(b.learnerOperations.records.map(r => [r.status, r.error?.code])).toEqual([['blocked', 'incarnation-changed']]);
    expect(await serverItems(restarted)).toHaveLength(0);
    expect(await reapplyLearnerOperation(b, b.learnerOperations.records[0]!.operationId)).toBe(true);
    expect(await saveModelToLocalService(b)).toMatchObject({ ok: true });
    expect(texts(await serverItems(restarted))).toEqual([pendingText(queued)]);
  });

  it('Undo of a capture whose outcome is unknown reads the receipt back and then applies a trusted undo', async () => {
    const service = await startService(); await seedService(service);
    const a = await client(service);
    const realFetch = globalThis.fetch;
    let drop = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const reply = await realFetch(input, init);
      if (String(input).endsWith('/api/learner/operations') && drop) { drop = false; await reply.json(); throw new TypeError('ack lost'); }
      return reply;
    }));
    const unknown = await capture(a, 0, 0);
    expect(unknown.pending).toBe(true);
    expect(await serverItems(service)).toHaveLength(1);
    // The sent capture cannot simply be cancelled; Undo re-sends it (receipt), then sends undo-capture.
    expect(await undoSave(a, unknown)).toBe(true);
    expect(await serverItems(service)).toHaveLength(0);
    expect(a.learnerOperations.records).toHaveLength(0);
  });

  it('Load service state keeps visible pending intents; discarding them is a separate explicit action', async () => {
    const service = await startService(); await seedService(service);
    const a = await client(service); const other = await client(service);
    setLocalServiceAutosave(a, false);
    const queued = await capture(a, 0, 0);
    // A document-level divergence forces the Keep/Load choice on reconnect.
    a.store.putMediaAsset({ ...a.currentMedia!, title: 'browser title' });
    other.store.putMediaAsset({ ...other.currentMedia!, title: 'service title' });
    expect((await saveModelToLocalService(other)).ok).toBe(true);
    expect((await connectLocalService(a, service.origin)).ok).toBe(false);
    expect(a.localService.syncState).toBe('choice');
    expect(resolveLocalServiceConnection(a, 'service').ok).toBe(true);
    expect(a.store.getMediaAsset(a.currentMedia!.id)?.title).toBe('service title');
    expect(a.learnerOperations.records.map(r => [r.operationId, r.status])).toEqual([[queued.pending ? queued.operationId : '', 'pending']]);
    expect(await discardLearnerOperation(a, a.learnerOperations.records[0]!.operationId)).toBe(true);
    expect(a.learnerOperations.records).toHaveLength(0);
    expect(await saveModelToLocalService(a)).toMatchObject({ ok: true });
    expect(await serverItems(service)).toHaveLength(0);
  });

  it('review ratings (document) and remote vocabulary operations both survive; an older paired document save is reconciled, not refused', async () => {
    const service = await startService(); await seedService(service);
    const a = await client(service); const b = await client(service);
    const ra = done(await capture(a, 0, 0)); const extra = done(await capture(a, 1, 0));
    await connectLocalService(b, service.origin);
    setLocalServiceAutosave(b, false);
    // B rates A's card (document change, not yet saved), while A captures and archives (operations).
    submitReviewRating(b, ra.card.id, 'good', new Date());
    const late = done(await capture(a, 1, 2));
    archiveReviewCardsForSavedItem(a, extra.item.id); await learnerOperationsIdle(a);
    expect(await saveModelToLocalService(b)).toMatchObject({ ok: true });
    const s = (await service.fetchJson('/api/state')).json.snapshot;
    expect(s.reviewCardStates[ra.card.id].reps).toBeGreaterThan(0);
    expect(s.reviewEvents.some((e: any) => e.cardId === ra.card.id)).toBe(true);
    expect(Object.keys(s.savedItems)).toEqual(expect.arrayContaining([ra.item.id, extra.item.id, late.item.id]));
    expect(s.reviewCards[extra.card.id].suspendedAt).toBeDefined();
    // B's store now shows A's later capture and archive (installed from the reconciled save), with its own rating.
    expect(b.store.getSavedItem(late.item.id)).toBeDefined();
    expect(b.store.getReviewCard(extra.card.id)?.suspendedAt).toBeDefined();
    expect(b.store.getReviewCardState(ra.card.id)?.reps).toBeGreaterThan(0);
    expect(b.localService.syncState).toBe('saved');
  });

  it('bulk "Add all to review" sends one enrolment operation per item and reports pending until confirmed', async () => {
    const service = await startService(); await seedService(service);
    const a = await client(service);
    const one = done(await capture(a, 0, 0)); const two = done(await capture(a, 1, 0));
    archiveReviewCardsForSavedItem(a, one.item.id); await learnerOperationsIdle(a);
    archiveReviewCardsForSavedItem(a, two.item.id); await learnerOperationsIdle(a);
    expect(a.store.getReviewCard(one.card.id)?.suspendedAt).toBeDefined();
    setLocalServiceAutosave(a, false);
    expect(addSavedItemsToReview(a, [one.item, two.item])).toBe(2);
    await learnerOperationsIdle(a);
    expect(a.learnerOperations.records.map(r => [r.request.kind, r.status])).toEqual([['set-review-enrolment', 'pending'], ['set-review-enrolment', 'pending']]);
    expect(await saveModelToLocalService(a)).toMatchObject({ ok: true });
    const s = (await service.fetchJson('/api/state')).json.snapshot;
    expect(Object.values(s.reviewCards as Record<string, any>).filter(c => c.suspendedAt === undefined)).toHaveLength(2);
  });

  it('an older browser holding vocabulary created outside operations is refused visibly and keeps its work', async () => {
    const service = await startService(); await seedService(service);
    const a = await client(service);
    await capture(a, 0, 0); // protection is now active on the service
    // A browser that never learned the operation identity (unpaired work) captures locally, then keeps it.
    const legacy = createAppModel(); service.pair(legacy);
    await importFixtureMediaAndSubtitles(legacy, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
    const w = word(legacy, 1, 0);
    expect(learnerOperationsActive(legacy)).toBe(false);
    await captureLexeme(legacy, w.cue, w.text, w.start, w.end, w.token);
    const local = legacy.store.snapshot();
    // It connects (differs → choice) and keeps browser work; the save is refused with a recoverable explanation.
    expect((await connectLocalService(legacy, service.origin)).ok).toBe(false);
    resolveLocalServiceConnection(legacy, 'browser');
    const result = await saveModelToLocalService(legacy);
    expect(result.ok).toBe(false);
    expect(legacy.localService.syncState).toBe('conflict');
    expect(result.message).toMatch(/Restore \(merge\)/);
    expect(legacy.store.snapshot().savedItems).toEqual(local.savedItems);
    expect(texts(await serverItems(service))).toEqual([word(a, 0, 0).text]);
  });

  it('refuses a new intent at the outbox cap without evicting any unresolved one', async () => {
    const service = await startService(); await seedService(service);
    const backend = createMemoryOutboxBackend();
    const a = await client(service, backend);
    setLocalServiceAutosave(a, false);
    const item = (await capture(a, 0, 0)); // pending capture #1
    expect(item.pending).toBe(true);
    for (let i = 1; i < OUTBOX_CAP; i++) {
      await backend.add({ ...[...backend.records.values()][0]!, operationId: crypto.randomUUID(), order: i, status: 'pending' });
    }
    await expect(capture(a, 1, 0)).rejects.toThrow(OUTBOX_FULL_MESSAGE);
    expect([...backend.records.values()].filter(r => r.status === 'pending')).toHaveLength(OUTBOX_CAP);
  });

  it('two tabs over one outbox never both send one operation (claim is atomic)', async () => {
    const service = await startService(); await seedService(service);
    const backend = createMemoryOutboxBackend();
    const tab1 = await client(service, backend); const tab2 = await client(service, backend);
    setLocalServiceAutosave(tab1, false); setLocalServiceAutosave(tab2, false);
    await capture(tab1, 0, 0);
    const spy = vi.fn(fetch); vi.stubGlobal('fetch', spy);
    const [r1, r2] = await Promise.all([saveModelToLocalService(tab1), saveModelToLocalService(tab2)]);
    expect(opPosts(spy.mock.calls)).toHaveLength(1);
    expect([r1, r2].filter(r => r.ok).length, JSON.stringify([r1, r2])).toBeGreaterThan(0);
    expect(await serverItems(service)).toHaveLength(1);
  });

  it('a restore committed by another client blocks intents made before it (new lineage), visibly', async () => {
    const service = await startService(); await seedService(service);
    const a = await client(service);
    setLocalServiceAutosave(a, false);
    await capture(a, 0, 0);
    const state = (await service.fetchJson('/api/state')).json;
    const manifest = new ExportService(new LocalStore({ ...state.snapshot, cues: {}, transcriptWordTimings: {} }), 'test').buildManifest();
    const preview = await service.fetchJson('/api/restore/preview', 'POST', { manifest, mode: 'replace-active', expectedRevision: state.revision });
    expect(preview.status).toBe(200);
    const commit = await service.fetchJson('/api/restore/commit', 'POST', { manifest, mode: 'replace-active', expectedRevision: state.revision,
      confirmation: { confirmedAt: new Date().toISOString(), confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: preview.json.preview.warnings.map((w: any) => w.kind) } });
    expect(commit.status).toBe(200);
    expect((await saveModelToLocalService(a)).ok).toBe(false);
    expect(a.learnerOperations.records.map(r => [r.status, r.error?.code])).toEqual([['blocked', 'generation-changed']]);
    expect(await serverItems(service)).toHaveLength(0);
  });
});

describe('lt-192.3 review correction R3: a dedup capture\'s unapplied draft stays visible until resolved', () => {
  it('a queued capture acknowledged later never reports "all saved", survives prune/reload/other tabs, and is only applied on explicit choice', async () => {
    const dom = new JSDOM('<!doctype html><body></body>'); vi.stubGlobal('document', dom.window.document);
    const service = await startService(); await seedService(service);
    const a = await client(service);
    done(await capture(a, 0, 0, 'first authoritative meaning'));
    const backend = createMemoryOutboxBackend();
    const b = await client(service, backend);
    setLocalServiceAutosave(b, false);
    const queued = await capture(b, 0, 0, 'second unapplied draft');
    expect(queued.pending).toBe(true);
    const result = await saveModelToLocalService(b); // explicit Save; the acknowledgement arrives here, not at capture time
    expect(result.ok).toBe(false);
    expect(result.message).not.toMatch(/All changes saved/);
    expect(result.message).toMatch(/not applied/);
    expect(b.learnerOperations.message).toMatch(/not applied/);
    const record = [...backend.records.values()][0]!;
    expect(record.status).toBe('acked');
    expect(record.receipt?.result.unappliedDraft).toMatchObject({ meaning: 'second unapplied draft', existingMeaning: 'first authoritative meaning' });
    expect(unappliedDraftOutcomes(b).map(r => r.operationId)).toEqual([record.operationId]);
    expect(renderSavedView(b).textContent).toContain('second unapplied draft');
    // Never silently applied: the service keeps the authoritative meaning.
    const itemId = record.receipt!.result.savedItemId as string;
    expect((await serverItems(service)).find(i => i.id === itemId)).toMatchObject({ meaning: 'first authoritative meaning' });
    // Resolved-record pruning does not remove an unresolved disclosure; a reload and another tab both still show it.
    await backend.prune(Date.now() + OUTBOX_RESOLVED_RETENTION_MS * 10);
    expect(backend.records.has(record.operationId)).toBe(true);
    const reloaded = createAppModel(); useLearnerOperationOutbox(reloaded, backend); reloaded.localService.baseUrl = service.origin;
    await bootLearnerOperations(reloaded);
    expect(unappliedDraftOutcomes(reloaded).map(r => r.operationId)).toEqual([record.operationId]);
    service.pair(reloaded); expect((await connectLocalService(reloaded, service.origin)).ok).toBe(true);
    setLocalServiceAutosave(reloaded, false);
    expect(renderSavedView(reloaded).textContent).toContain('second unapplied draft');
    const saved = await saveModelToLocalService(reloaded);
    expect(saved.ok).toBe(false);
    expect(saved.message).toMatch(/not applied/);
    // Explicit choice 1: dismiss (keep the service meaning). Gone everywhere, and prunable afterwards.
    expect(await dismissUnappliedDraft(reloaded, record.operationId)).toBe(true);
    expect(unappliedDraftOutcomes(reloaded)).toHaveLength(0);
    expect(renderSavedView(reloaded).textContent).not.toContain('second unapplied draft');
    expect(await saveModelToLocalService(reloaded)).toMatchObject({ ok: true });
    await bootLearnerOperations(b);
    expect(unappliedDraftOutcomes(b)).toHaveLength(0);
    await backend.prune(Date.now() + OUTBOX_RESOLVED_RETENTION_MS * 10);
    expect(backend.records.has(record.operationId)).toBe(false);
    expect((await serverItems(service)).find(i => i.id === itemId)).toMatchObject({ meaning: 'first authoritative meaning' });
    // Explicit choice 2: apply mine, as a new meaning operation expecting the service's current meaning.
    const third = await capture(reloaded, 0, 0, 'third draft');
    expect(third.pending).toBe(true);
    expect((await saveModelToLocalService(reloaded)).ok).toBe(false);
    const [outcome] = unappliedDraftOutcomes(reloaded);
    expect(outcome!.receipt?.result.unappliedDraft).toMatchObject({ meaning: 'third draft' });
    expect(await applyUnappliedDraftMeaning(reloaded, outcome!.operationId)).toBe(true);
    expect(await saveModelToLocalService(reloaded)).toMatchObject({ ok: true });
    expect(unappliedDraftOutcomes(reloaded)).toHaveLength(0);
    expect((await serverItems(service)).find(i => i.id === itemId)).toMatchObject({ meaning: 'third draft' });
  });
});

describe('lt-192.3: a failed durable outbox write (e.g. quota) is visible and stores/sends nothing', () => {
  it('an add rejected with an empty-message QuotaExceededError surfaces a clear error, keeps nothing pending and sends nothing', async () => {
    const service = await startService(); await seedService(service);
    const memory = createMemoryOutboxBackend();
    let failing = true;
    const backend = { ...memory, add: async (record: Parameters<typeof memory.add>[0]) => { if (failing) throw new DOMException('', 'QuotaExceededError'); return memory.add(record); } };
    const a = await client(service, backend);
    const spy = vi.fn(fetch); vi.stubGlobal('fetch', spy);
    await expect(capture(a, 0, 0, 'meaning')).rejects.toThrow(/could not store the vocabulary change \(QuotaExceededError\)/);
    expect(memory.records.size).toBe(0);
    expect(opPosts(spy.mock.calls)).toHaveLength(0);
    expect(a.learnerOperations.records).toHaveLength(0);
    expect(await serverItems(service)).toHaveLength(0);
    failing = false; // storage freed: the same capture now saves
    expect(done(await capture(a, 0, 0, 'meaning')).item.meaning).toBe('meaning');
  });
});

// lt-192.3 re-review R3a/R3b: "Use my meaning" hands the draft off to its replacement operation atomically, and never
// resolves the notes draft. Every backend call below is one IndexedDB readwrite transaction in production, so the
// outbox contents before/after each call are exactly the states a killed page can leave behind.
describe('lt-192.3 re-review R3: draft handoff is crash-atomic and keeps unapplied notes', () => {
  type Records = Map<string, any>;
  /** Wrap a memory backend: record the durable outbox contents at every transaction boundary. */
  function boundaryRecorder(memory: ReturnType<typeof createMemoryOutboxBackend>) {
    const boundaries: { at: string; records: Records }[] = [];
    let recording = false;
    const snap = (at: string) => { if (recording) boundaries.push({ at, records: structuredClone(memory.records) }); };
    const backend: any = { ...memory };
    for (const name of ['add', 'transition', 'prune', 'putMeta', 'handoff'] as const) {
      const original = (memory as any)[name];
      if (typeof original !== 'function') continue;
      backend[name] = async (...args: unknown[]) => { snap(`before ${name}`); try { return await original(...args); } finally { snap(`after ${name}`); } };
    }
    return { backend, boundaries, start() { recording = true; snap('start'); }, stop() { recording = false; } };
  }
  async function captureWithNotes(model: AppModel, meaning: string, notes: string) {
    const w = word(model, 0, 0);
    model.selection = { kind: 'lexeme', text: w.text, cueId: w.cue.id, tokenStart: w.token, tokenEnd: w.token + 1, charStart: w.start, charEnd: w.end };
    model.pendingMeaning = meaning; model.pendingNotes = notes;
    try { return (await saveSelectionWithReceipt(model))!; } finally { model.selection = null; model.pendingMeaning = ''; model.pendingNotes = ''; }
  }
  /** One service item with meaning+notes, and a delayed dedup capture of it in `b` carrying a different meaning+notes draft. */
  async function delayedDraft(backend?: any, memoryIn?: ReturnType<typeof createMemoryOutboxBackend>) {
    const service = await startService(); await seedService(service);
    const a = await client(service);
    done(await captureWithNotes(a, 'first meaning', 'first notes'));
    const memory = memoryIn ?? createMemoryOutboxBackend();
    const b = await client(service, backend ?? memory);
    setLocalServiceAutosave(b, false);
    expect((await captureWithNotes(b, 'draft meaning', 'UNAPPLIED NOTES')).pending).toBe(true);
    expect((await saveModelToLocalService(b)).ok).toBe(false);
    const [draft] = unappliedDraftOutcomes(b);
    expect(draft!.receipt?.result.unappliedDraft).toMatchObject({ meaning: 'draft meaning', notes: 'UNAPPLIED NOTES', existingMeaning: 'first meaning', existingNotes: 'first notes' });
    const itemId = draft!.receipt!.result.savedItemId as string;
    return { service, a, b, memory, draftId: draft!.operationId, itemId, serviceItem: async () => (await serverItems(service)).find(i => i.id === itemId) };
  }
  async function reloadOver(service: Service, records: Records) {
    const backend = createMemoryOutboxBackend();
    for (const [id, r] of records) backend.records.set(id, structuredClone(r));
    const model = createAppModel(); useLearnerOperationOutbox(model, backend); model.localService.baseUrl = service.origin;
    await bootLearnerOperations(model);
    service.pair(model); expect((await connectLocalService(model, service.origin)).ok).toBe(true);
    setLocalServiceAutosave(model, false);
    return { model, backend };
  }
  const replacements = (records: Iterable<any>, itemId: string) => [...records].filter(r => r.request.kind === 'set-meaning' && r.request.payload.savedItemId === itemId);
  const pendingMeaning = (model: AppModel, itemId: string) => model.learnerOperations.records.find(r => r.request.kind === 'set-meaning' && r.request.payload.savedItemId === itemId && (r.status === 'pending' || r.status === 'sending'))?.request.payload.meaning;

  it('R3a: a page killed at ANY durable boundary of "Use my meaning" leaves the open meaning draft or its durable replacement, never neither; notes stay open throughout', async () => {
    const dom = new JSDOM('<!doctype html><body></body>'); vi.stubGlobal('document', dom.window.document);
    const memory = createMemoryOutboxBackend();
    const recorder = boundaryRecorder(memory);
    const { service, b, draftId, itemId, serviceItem } = await delayedDraft(recorder.backend, memory);
    recorder.start();
    expect(await applyUnappliedDraftMeaning(b, draftId)).toBe(true);
    recorder.stop();
    expect(recorder.boundaries.length).toBeGreaterThanOrEqual(2);
    for (const { at, records } of recorder.boundaries) {
      const original = records.get(draftId);
      const handedOff = replacements(records.values(), itemId);
      const meaningOpen = original.draftReview === 'open' && original.draftResolved?.meaning === undefined;
      // Atomic: exactly one of {open meaning draft, durable replacement} at every boundary; never both, never neither.
      expect({ at, meaningOpen, handedOff: handedOff.length }).toEqual({ at, meaningOpen: handedOff.length === 0, handedOff: meaningOpen ? 0 : 1 });
      if (!meaningOpen) expect(handedOff[0].request.payload.meaning).toBe('draft meaning');
      // The notes draft is never resolved by the meaning action.
      expect({ at, review: original.draftReview, notes: original.draftResolved?.notes }).toEqual({ at, review: 'open', notes: undefined });
      // A reload from this boundary still shows the notes (and the meaning unless handed off) and never claims all saved.
      const { model: reloaded } = await reloadOver(service, records);
      expect(unappliedDraftOutcomes(reloaded).map(r => r.operationId)).toEqual([draftId]);
      const text = renderSavedView(reloaded).textContent ?? '';
      expect(text).toContain('UNAPPLIED NOTES');
      expect(text.includes('Use my meaning')).toBe(meaningOpen);
      expect(meaningOpen || pendingMeaning(reloaded, itemId) === 'draft meaning').toBe(true);
      const saved = await saveModelToLocalService(reloaded);
      expect(saved.ok).toBe(false);
      expect(saved.message).not.toMatch(/All changes saved/);
      if (!meaningOpen) expect(await serviceItem()).toMatchObject({ meaning: 'draft meaning', notes: 'first notes' });
    }
  });

  it('R3b: "Use my meaning" applies only the meaning; the unapplied notes stay visible, unprunable and block "all saved" across reloads until "Keep saved notes"', async () => {
    const dom = new JSDOM('<!doctype html><body></body>'); vi.stubGlobal('document', dom.window.document);
    const { service, b, memory, draftId, serviceItem } = await delayedDraft();
    const before = renderSavedView(b);
    expect(before.textContent).toContain('UNAPPLIED NOTES');
    expect([...before.querySelectorAll('.unapplied-draft button')].map(x => x.textContent)).toEqual(['Use my meaning', 'Keep saved meaning', 'Keep saved notes']);
    expect(await applyUnappliedDraftMeaning(b, draftId)).toBe(true);
    const saved = await saveModelToLocalService(b);
    expect(saved).toMatchObject({ ok: false });
    expect(saved.message).toMatch(/not applied/);
    expect(await serviceItem()).toMatchObject({ meaning: 'draft meaning', notes: 'first notes' });
    // Reload and resolved-record pruning: the notes draft is still open and visible; only notes actions remain.
    const reloaded = createAppModel(); useLearnerOperationOutbox(reloaded, memory); reloaded.localService.baseUrl = service.origin;
    await bootLearnerOperations(reloaded);
    await memory.prune(Date.now() + OUTBOX_RESOLVED_RETENTION_MS * 10);
    expect(memory.records.get(draftId)).toMatchObject({ status: 'acked', draftReview: 'open', draftResolved: { meaning: 'applied' } });
    service.pair(reloaded); expect((await connectLocalService(reloaded, service.origin)).ok).toBe(true);
    setLocalServiceAutosave(reloaded, false);
    const after = renderSavedView(reloaded);
    expect(after.textContent).toContain('UNAPPLIED NOTES');
    expect([...after.querySelectorAll('.unapplied-draft button')].map(x => x.textContent)).toEqual(['Keep saved notes']);
    expect((await saveModelToLocalService(reloaded)).ok).toBe(false);
    // Applying the meaning again (stale tab) is refused; it cannot create a second replacement. (The acknowledged
    // replacement itself was legitimately pruned above, so no new operation of any kind may appear.)
    const recordsBefore = [...memory.records.keys()].sort();
    expect(await applyUnappliedDraftMeaning(reloaded, draftId)).toBe(false);
    expect([...memory.records.keys()].sort()).toEqual(recordsBefore);
    expect(replacements(memory.records.values(), memory.records.get(draftId)!.receipt!.result.savedItemId as string)).toHaveLength(0);
    // Explicit notes decision: the disclosure closes, Save is all saved, and only then is the record prunable.
    expect(await dismissUnappliedDraft(reloaded, draftId, 'notes')).toBe(true);
    expect(unappliedDraftOutcomes(reloaded)).toHaveLength(0);
    expect(await saveModelToLocalService(reloaded)).toMatchObject({ ok: true });
    expect(await serviceItem()).toMatchObject({ meaning: 'draft meaning', notes: 'first notes' });
    await memory.prune(Date.now() + OUTBOX_RESOLVED_RETENTION_MS * 10);
    expect(memory.records.has(draftId)).toBe(false);
  });

  it('R3b: "Keep saved meaning" resolves only the meaning; the notes draft stays open', async () => {
    const dom = new JSDOM('<!doctype html><body></body>'); vi.stubGlobal('document', dom.window.document);
    const { b, memory, draftId, serviceItem } = await delayedDraft();
    expect(await dismissUnappliedDraft(b, draftId, 'meaning')).toBe(true);
    expect(memory.records.get(draftId)).toMatchObject({ draftReview: 'open', draftResolved: { meaning: 'dismissed' } });
    const text = renderSavedView(b).textContent ?? '';
    expect(text).toContain('UNAPPLIED NOTES');
    expect(text).not.toContain('Use my meaning');
    expect((await saveModelToLocalService(b)).ok).toBe(false);
    expect(await applyUnappliedDraftMeaning(b, draftId)).toBe(false); // a resolved meaning cannot be applied afterwards
    expect(await dismissUnappliedDraft(b, draftId, 'notes')).toBe(true);
    expect(memory.records.get(draftId)).toMatchObject({ draftReview: 'dismissed' });
    expect(await saveModelToLocalService(b)).toMatchObject({ ok: true });
    expect(await serviceItem()).toMatchObject({ meaning: 'first meaning', notes: 'first notes' });
  });

  it('a refused handoff (storage failure or full outbox) changes nothing: the meaning draft stays open, nothing is stored or sent', async () => {
    const dom = new JSDOM('<!doctype html><body></body>'); vi.stubGlobal('document', dom.window.document);
    const memory = createMemoryOutboxBackend();
    let failing = false;
    const quota = () => { throw new DOMException('', 'QuotaExceededError'); };
    const backend: any = { ...memory, records: memory.records, add: async (r: any) => { if (failing) quota(); return memory.add(r); } };
    if (typeof (memory as any).handoff === 'function') backend.handoff = async (...args: unknown[]) => { if (failing) quota(); return (memory as any).handoff(...args); };
    const { b, draftId, itemId, serviceItem } = await delayedDraft(backend, memory);
    const original = structuredClone(memory.records.get(draftId))!;
    const spy = vi.fn(fetch); vi.stubGlobal('fetch', spy);
    failing = true;
    await expect(applyUnappliedDraftMeaning(b, draftId)).rejects.toThrow(/could not store the vocabulary change \(QuotaExceededError\)/);
    expect(memory.records.get(draftId)).toEqual(original);
    expect(replacements(memory.records.values(), itemId)).toHaveLength(0);
    expect(opPosts(spy.mock.calls)).toHaveLength(0);
    expect(renderSavedView(b).textContent).toContain('Use my meaning');
    failing = false;
    // Cap: unresolved operations elsewhere fill the outbox; the handoff is refused without evicting or resolving anything.
    for (let i = 0; i < OUTBOX_CAP; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      const { draftReview: _review, receipt: _receipt, ...unresolved } = structuredClone(original);
      memory.records.set(id, { ...unresolved, operationId: id, baseUrl: 'http://127.0.0.1:1', status: 'pending', request: { ...original.request, operationId: id } });
    }
    await expect(applyUnappliedDraftMeaning(b, draftId)).rejects.toThrow(OUTBOX_FULL_MESSAGE);
    expect(memory.records.get(draftId)).toEqual(original);
    expect(memory.records.size).toBe(OUTBOX_CAP + 1);
    expect(opPosts(spy.mock.calls)).toHaveLength(0);
    for (const id of [...memory.records.keys()]) if (id !== draftId) memory.records.delete(id);
    vi.unstubAllGlobals(); vi.stubGlobal('document', dom.window.document);
    expect(await applyUnappliedDraftMeaning(b, draftId)).toBe(true);
    expect(await saveModelToLocalService(b)).toMatchObject({ ok: false }); // notes still open
    expect(await serviceItem()).toMatchObject({ meaning: 'draft meaning' });
  });

  it('two tabs: one replacement only; a stale tab cannot re-apply or reopen; a conflicting or cancelled replacement stays explicit', async () => {
    const dom = new JSDOM('<!doctype html><body></body>'); vi.stubGlobal('document', dom.window.document);
    const { service, a, b, memory, draftId, itemId, serviceItem } = await delayedDraft();
    const tab2 = createAppModel(); useLearnerOperationOutbox(tab2, memory); tab2.localService.baseUrl = service.origin;
    await bootLearnerOperations(tab2);
    service.pair(tab2); expect((await connectLocalService(tab2, service.origin)).ok).toBe(true); setLocalServiceAutosave(tab2, false);
    expect(unappliedDraftOutcomes(tab2).map(r => r.operationId)).toEqual([draftId]);
    // Both tabs act on the same open draft concurrently: exactly one handoff wins.
    const results = await Promise.all([applyUnappliedDraftMeaning(b, draftId), applyUnappliedDraftMeaning(tab2, draftId)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(replacements(memory.records.values(), itemId)).toHaveLength(1);
    // Another device changes the meaning first: the replacement becomes a visible conflict, never an overwrite.
    expect((await connectLocalService(a, service.origin)).ok).toBe(true);
    setSavedItemMeaning(a, itemId, 'third device meaning'); await learnerOperationsIdle(a);
    await bootLearnerOperations(b);
    const saved = await saveModelToLocalService(b);
    expect(saved.ok).toBe(false);
    expect(b.learnerOperations.records.map(r => [r.request.kind, r.status, r.error?.code, r.request.payload.meaning])).toEqual([['set-meaning', 'conflict', 'meaning-changed', 'draft meaning']]);
    expect(await serviceItem()).toMatchObject({ meaning: 'third device meaning', notes: 'first notes' });
    // Explicit discard of the conflicting replacement does not reopen the meaning draft; the notes stay open.
    expect(await discardLearnerOperation(b, b.learnerOperations.records[0]!.operationId)).toBe(true);
    expect(memory.records.get(draftId)).toMatchObject({ draftReview: 'open', draftResolved: { meaning: 'applied' } });
    expect((await saveModelToLocalService(b)).ok).toBe(false);
    // Tab 2 resolves the notes; stale tab b cannot resurrect anything afterwards.
    await bootLearnerOperations(tab2);
    expect(await dismissUnappliedDraft(tab2, draftId, 'notes')).toBe(true);
    const closed = structuredClone(memory.records.get(draftId));
    expect(closed).toMatchObject({ draftReview: 'applied' });
    expect(await applyUnappliedDraftMeaning(b, draftId)).toBe(false);
    expect(await dismissUnappliedDraft(b, draftId, 'notes')).toBe(false);
    expect(await dismissUnappliedDraft(b, draftId, 'meaning')).toBe(false);
    expect(await dismissUnappliedDraft(b, draftId)).toBe(false);
    expect(memory.records.get(draftId)).toEqual(closed);
    expect(replacements(memory.records.values(), itemId).map(r => r.status)).toEqual(['cancelled']);
    expect(await saveModelToLocalService(b)).toMatchObject({ ok: true });
  });
});
