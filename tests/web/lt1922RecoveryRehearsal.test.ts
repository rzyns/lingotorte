// lt-192.2 (B): synthetic service/browser recovery rehearsal. Synthetic fixtures only, temporary SQLite files under the
// container scratch root, temporary ports, an in-memory snapshot-cache backend and allowOnlineProviders: false. No real
// learner state, media, provider, browser, iPad or Anki is used; nothing here is product code or a product safeguard.
//
// Proves, against the real local service and the real web-model sync path:
//  - an exact service checkpoint (consistent node:sqlite backup, kept closed and never reopened) plus its logical snapshot;
//  - transfer of browser-only additions over that exact baseline: bundles first, then learner state, under CAS;
//  - a lost learner-state acknowledgement resolved by reconnect readback (no blind retry, no duplicates);
//  - close/reopen of the candidate, full rehydration of ALL media before every comparison, stable Anki GUIDs;
//  - a stale-comparison sentinel (CAS conflict, sentinel survives) and an already-present divergence that the
//    FIXTURE PRECONDITION refuses before Keep browser (the product has no such safeguard; see docs/design §6.4);
//  - cache + database rollback to the isolated immutable checkpoint, with revisions compared within one lineage only.
import { captureLexeme, capturePhrase, captureSentence } from '../helpers/capture';
import { createMemoryOutboxBackend } from '../../apps/web/src/operationOutbox';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import {
  activateReviewCard, approveTranscriptTrack, archiveReviewCardsForSavedItem, connectLocalService, createAppModel,
  createCorrectedTranscriptVersion, importFixtureMediaAndSubtitles, learnerStateOf, mediaTranscriptsLoaded, openMediaAsset,
  pairLocalService, pendingTranscriptTrackIds, resolveLocalServiceConnection, saveModelToLocalService, setLocalServiceAutosave, useLearnerOperationOutbox,
  setPracticeMode, setSavedItemMeaning, submitPracticeAttempt, submitReviewRating,
} from '../../apps/web/src/model';
import { bootSnapshotCache, buildSnapshotCacheRecord, SNAPSHOT_CACHE_KEY, type SnapshotCacheBackend, type SnapshotCacheRecord } from '../../apps/web/src/browserSnapshotCache';
import { startLingotorteLocalService } from '../../apps/local-service/src/server';
import { ExportService, LocalStore } from '../../packages/storage/src';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence';
import type { LearnerStateSnapshot, LocalStoreSnapshot } from '../../packages/storage/src/localStore';
import { ankiGuidFor, buildAnkiExportPlan } from '../../packages/domain/src/ankiExport';
import type { Cue, SavedItem } from '@lingotorte/domain';
import type { AppModel } from '../../apps/web/src/uiTypes';

const MEDIA = 'fixtures/media/synthetic-polish-dialogue.webm';
const TARGET = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const NATIVE = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';
const at = '2026-10-30T12:00:00.000Z';
const FAR = (iso: string) => new Date(iso);

/** Fake IndexedDB snapshot-cache backend (structured clones, like the browser). */
class MemoryBackend implements SnapshotCacheBackend {
  data = new Map<string, unknown>();
  async get(key: string) { return this.data.has(key) ? structuredClone(this.data.get(key)) : undefined; }
  async put(key: string, value: unknown) { this.data.set(key, structuredClone(value)); }
  async delete(key: string) { this.data.delete(key); }
}
/** A fresh backend holding one recorded cache record, so no scenario can mutate a recorded checkpoint. */
function backendWith(record: SnapshotCacheRecord): MemoryBackend {
  const backend = new MemoryBackend(); backend.data.set(SNAPSHOT_CACHE_KEY, structuredClone(record)); return backend;
}

/** Fixture-level refusal (B's rehearsal precondition), deliberately distinct from any product error. */
class FixturePreconditionRefusal extends Error {}

type Service = Awaited<ReturnType<typeof startService>>;
let scratchRoot = '';
let serviceCount = 0;
const openServices = new Set<Service>();

async function startService(databasePath: string) {
  const n = ++serviceCount;
  let capability = '';
  const service = await startLingotorteLocalService({
    host: '127.0.0.1', port: 0, databasePath, scratchDir: join(scratchRoot, `scratch-${n}`), modelCacheDir: join(scratchRoot, `models-${n}`), allowOnlineProviders: false,
  }, { receiveCapability(value) { capability = value; } });
  const handle = {
    origin: service.origin,
    databasePath,
    pair(model: AppModel) { pairLocalService(model, capability, service.origin); },
    async api(path: string, init: { method?: string; body?: unknown } = {}) {
      const res = await fetch(`${service.origin}${path}`, { method: init.method ?? 'GET', headers: { authorization: `Bearer ${capability}`, ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) }, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
      return { status: res.status, json: await res.json().catch(() => undefined) as any };
    },
    async close() { if (openServices.delete(handle)) await service.close(); },
  };
  openServices.add(handle);
  return handle;
}

/** Records `actor METHOD /path status` for every request, in order; an optional hook may replace the reply. */
function recordRequests(events: string[], actor: () => string, hook?: (input: string, init: RequestInit | undefined, real: typeof fetch) => Promise<Response> | null) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const hooked = hook?.(url, init, realFetch);
    if (hooked) return hooked.then((reply) => { events.push(`${actor()} ${init?.method ?? 'GET'} ${path} ${reply.status}`); return reply; },
      (error: unknown) => { events.push(`${actor()} ${init?.method ?? 'GET'} ${path} lost`); throw error; });
    const reply = await realFetch(input, init);
    events.push(`${actor()} ${init?.method ?? 'GET'} ${path} ${reply.status}`);
    return reply;
  }));
}

const sha256File = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');
const revisionNumber = (token: string) => { const m = /^rev:(\d+)$/.exec(token); if (!m) throw new Error(`unexpected revision ${token}`); return Number(m[1]); };

/** Order-insensitive canonical form: arrays sorted by id (history, audit, observations), records compared by key. */
function canon<T extends LocalStoreSnapshot | LearnerStateSnapshot>(snapshot: T): T {
  const byId = (rows: readonly unknown[]) => [...rows].sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (Array.isArray(value)) out[key] = byId(value);
    else if (key === 'learnerAudit' && value) out[key] = { ...(value as object), reviewEvents: byId((value as { reviewEvents: unknown[] }).reviewEvents), practiceAttempts: byId((value as { practiceAttempts: unknown[] }).practiceAttempts) };
    else out[key] = value;
  }
  return structuredClone(out) as T;
}

/** Logical snapshot of a CLOSED database file: schema, revision, learner state, audit and every media's bundles. */
function logicalSnapshot(databasePath: string) {
  const db = SqliteLocalPersistence.open(databasePath);
  try {
    const status = db.status();
    const { state, revision } = db.loadLearnerState();
    const transcripts = Object.fromEntries(Object.keys(state.mediaAssets).sort().map((id) => [id, db.loadTranscripts(id).tracks]));
    return {
      schemaVersion: status.schemaVersion, appliedMigrations: status.appliedMigrations, learnerAuditRecovery: status.learnerAuditRecovery, revision,
      learner: canon(state), transcripts,
      auditReviewEvents: [...db.listAuditReviewEvents()].sort((a, b) => a.id.localeCompare(b.id)),
      auditPracticeAttempts: [...db.listAuditPracticeAttempts()].sort((a, b) => a.id.localeCompare(b.id)),
    };
  } finally { db.close(); }
}
type Logical = ReturnType<typeof logicalSnapshot>;

/** Table-level logical state of a closed file (equivalent of the file-local tableState helpers; not exported there). */
function tableState(file: string) {
  const reader = new DatabaseSync(file, { readOnly: true });
  try {
    const names = reader.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    return Object.fromEntries(names.map(({ name }) => [name, reader.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY 1`).all()]));
  } finally { reader.close(); }
}

/** Full store snapshot (learner state + every bundle) from a logical snapshot. */
function fullFromLogical(logical: Logical): LocalStoreSnapshot {
  const cues: Record<string, Cue> = {}; const transcriptWordTimings: LocalStoreSnapshot['transcriptWordTimings'] = {};
  for (const tracks of Object.values(logical.transcripts)) for (const bundle of Object.values(tracks)) {
    for (const cue of bundle.cues) cues[cue.id] = cue;
    for (const timing of bundle.wordTimings) (transcriptWordTimings as Record<string, unknown>)[timing.id] = timing;
  }
  return canon({ ...logical.learner, cues, transcriptWordTimings } as LocalStoreSnapshot);
}

/** Rehydrate before comparing: GET /api/media/{id}/transcripts for EVERY media (connect loads only the current one). */
async function hydrateAllMedia(model: AppModel): Promise<void> {
  for (const id of Object.keys(model.store.snapshot().mediaAssets).sort()) {
    expect(await openMediaAsset(model, id)).toBe(true);
    expect(mediaTranscriptsLoaded(model, id), `transcripts of ${id} loaded`).toBe(true);
  }
}

/** Key-order-independent JSON (payload equality, as toEqual would judge it, minus undefined members). */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : v));
}

const RECORD_KEYS = ['mediaAssets', 'subtitleTracks', 'cues', 'transcriptWordTimings', 'savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates', 'exportJobs', 'providerPolicies', 'importJobs'] as const;
const ARRAY_KEYS = ['mediaObservations', 'reviewEvents', 'practiceAttempts', 'importJobEvents'] as const;
type Additions = Record<string, string[]>;

/**
 * B's candidate fixture builder: the browser candidate must be the EXACT checkpoint baseline plus new ids only.
 * Any baseline id missing from the candidate, or present with a different payload (same-id conflict), is refused.
 * This is a rehearsal precondition, not a product merge or safeguard.
 */
function additionsOverBaseline(baseline: LocalStoreSnapshot, candidate: LocalStoreSnapshot): Additions {
  const added: Additions = {};
  const check = (name: string, base: Map<string, unknown>, cand: Map<string, unknown>) => {
    for (const [id, value] of base) {
      if (!cand.has(id)) throw new FixturePreconditionRefusal(`${name}/${id}: baseline record missing from candidate`);
      if (stable(cand.get(id)) !== stable(value)) throw new FixturePreconditionRefusal(`${name}/${id}: same-id conflict with baseline: ${stable(value)} vs ${stable(cand.get(id))}`);
    }
    added[name] = [...cand.keys()].filter((id) => !base.has(id)).sort();
  };
  const b = canon(baseline); const c = canon(candidate);
  const asMap = (rows: readonly { id: string }[]) => new Map(rows.map((row) => [row.id, row]));
  for (const key of RECORD_KEYS) check(key, new Map(Object.entries(b[key])), new Map(Object.entries(c[key])));
  for (const key of ARRAY_KEYS) check(key, asMap(b[key] as readonly { id: string }[]), asMap(c[key] as readonly { id: string }[]));
  check('learnerAudit.reviewEvents', asMap(b.learnerAudit!.reviewEvents), asMap(c.learnerAudit!.reviewEvents));
  check('learnerAudit.practiceAttempts', asMap(b.learnerAudit!.practiceAttempts), asMap(c.learnerAudit!.practiceAttempts));
  return added;
}

/** Expected combined state, built from the checkpoint and the candidate's recorded new-id records only. */
function combinedExpected(baseline: LocalStoreSnapshot, candidate: LocalStoreSnapshot, added: Additions): LocalStoreSnapshot {
  const b = canon(baseline); const c = canon(candidate);
  const out: Record<string, unknown> = { ...b };
  for (const key of RECORD_KEYS) out[key] = { ...b[key], ...Object.fromEntries(added[key]!.map((id) => [id, (c[key] as Record<string, unknown>)[id]])) };
  for (const key of ARRAY_KEYS) out[key] = [...(b[key] as unknown[]), ...(c[key] as { id: string }[]).filter((row) => added[key]!.includes(row.id))];
  out.learnerAudit = {
    ...b.learnerAudit!,
    reviewEvents: [...b.learnerAudit!.reviewEvents, ...c.learnerAudit!.reviewEvents.filter((row) => added['learnerAudit.reviewEvents']!.includes(row.id))],
    practiceAttempts: [...b.learnerAudit!.practiceAttempts, ...c.learnerAudit!.practiceAttempts.filter((row) => added['learnerAudit.practiceAttempts']!.includes(row.id))],
  };
  return canon(out as LocalStoreSnapshot);
}

/** Fixture precondition before Keep browser: the service must still be at the exact checkpoint learner state. */
async function refuseUnlessServiceAtCheckpoint(service: Service, checkpoint: Logical): Promise<void> {
  const state = await service.api('/api/state');
  expect(state.status).toBe(200);
  if (state.json.revision !== checkpoint.revision || JSON.stringify(canon(state.json.snapshot)) !== JSON.stringify(checkpoint.learner)) {
    throw new FixturePreconditionRefusal('Service diverged from the checkpoint baseline; the rehearsal refuses Keep browser (fixture precondition, not a product safeguard).');
  }
}

/** Every occurrence's exact source span resolves inside the hydrated store. */
function expectSpansResolve(snapshot: LocalStoreSnapshot): void {
  for (const occ of Object.values(snapshot.savedOccurrences)) {
    const ctx = occ.sourceContext;
    const cue = snapshot.cues[ctx.cueId];
    expect(cue, `cue for occurrence ${occ.id}`).toBeDefined();
    expect(cue!.trackId).toBe(ctx.subtitleTrackId);
    expect(occ.cueId).toBe(ctx.cueId);
    expect(snapshot.subtitleTracks[ctx.subtitleTrackId]?.mediaId).toBe(occ.mediaId);
    expect(snapshot.mediaAssets[occ.mediaId]?.contentSha256).toBe(ctx.mediaFingerprint);
    expect(cue!.text.slice(ctx.charSpan.start, ctx.charSpan.end)).toBe(occ.selectionText);
  }
}

function ankiPlanFor(snapshot: LocalStoreSnapshot) {
  return buildAnkiExportPlan(Object.values(snapshot.savedItems), Object.values(snapshot.savedOccurrences), (cueId) => snapshot.cues[cueId]?.text);
}
const activeGuids = (snapshot: LearnerStateSnapshot) => Object.values(snapshot.savedItems).filter((item) => !item.archivedAt).map((item) => ankiGuidFor(item.id)).sort();
const cardFor = (model: AppModel, item: SavedItem) => Object.values(model.store.snapshot().reviewCards).find((card) => card.savedItemId === item.id)!;
const wire = (snapshot: LocalStoreSnapshot) => JSON.parse(JSON.stringify(new ExportService(new LocalStore(snapshot), 'lt-192.2').buildManifest()));

// ---------------------------------------------------------------------------------------------------------------
// Shared rehearsal state (built once, in order). Each scenario works on its own disposable copy of the checkpoint.
const fx = {} as {
  originalDb: string; checkpointFile: string; checkpointSha256: string; checkpoint: Logical; checkpointTables: ReturnType<typeof tableState>;
  checkpointFull: LocalStoreSnapshot; checkpointManifestContent: unknown; checkpointCache: SnapshotCacheRecord; checkpointCacheJson: string;
  candidateCache: SnapshotCacheRecord; candidateFull: LocalStoreSnapshot; added: Additions; expected: LocalStoreSnapshot;
  ids: { m1: string; m2: string; m3: string; t1: string; t1v2: string; sentence: string; phrase: string; shared: string; disposable: string; archived: string; offlineLexeme: string; offlinePhrase: string };
  candidateRevisions: string[];
};

async function workingCopy(name: string): Promise<string> {
  const file = join(scratchRoot, `${name}.sqlite`);
  await copyFile(fx.checkpointFile, file);
  return file;
}

beforeAll(async () => {
  scratchRoot = await mkdtemp(join(process.env.LINGOTORTE_SCRATCH_DIR ?? tmpdir(), 'lt1922-rehearsal-'));
  fx.originalDb = join(scratchRoot, 'original.sqlite');
  const p0 = await startService(fx.originalDb);

  // --- Seed through the real save paths (not hand-written rows). ---
  // lt-192.3 (changed check): the seed builds its vocabulary in local (unpaired) mode and then saves it through the
  // whole-document path, which a service accepts until its first operation. A paired browser's vocabulary writes are
  // server operations now (qualified in lt1923 suites); this rehearsal keeps seeding the document path it rehearses.
  const seed = createAppModel(); p0.pair(seed); setLocalServiceAutosave(seed, false);
  await importFixtureMediaAndSubtitles(seed, MEDIA, TARGET, NATIVE);
  const m1 = seed.currentMedia!.id; const t1 = seed.targetTrackId!;
  const [c1, c2] = seed.cues as [Cue, Cue];
  expect(c1.text).toBe('Cześć, to jest lokalny test.'); expect(c2.text).toBe('Uczymy się z własnych napisów.');
  const sentence = (await captureSentence(seed, c1))!;
  seed.pendingNotes = 'phrase note (synthetic)';
  const phrase = (await capturePhrase(seed, c1, 'lokalny test', 15, 27, 3, 5))!;
  seed.pendingNotes = '';
  // Corrected version v2 of the target track with manual word timings (no provider of any kind), then approved.
  const corrected = await createCorrectedTranscriptVersion(seed, t1, [
    { cueId: c1.id, text: 'Cześć, to jest lokalny test!' },
    { cueId: c2.id, wordTimings: [
      { wordIndex: 3, text: 'własnych', charStart: 13, charEnd: 21, startMs: 1400, endMs: 1700 },
      { wordIndex: 4, text: 'napisów', charStart: 22, charEnd: 29, startMs: 1700, endMs: 1950 },
    ] },
  ]);
  approveTranscriptTrack(seed, corrected.track.id);
  const t1v2 = corrected.track.id;
  const v2c2 = corrected.cues[1]!;
  // Dictionary-suggested meaning with notes on the item later shared across both videos.
  seed.pendingMeaning = 'own (gen. pl.)';
  seed.pendingMeaningSuggestion = { text: 'own (gen. pl.)', source: { kind: 'dictionary-suggested', glossSourceId: 'synthetic-gloss', dumpDate: '2026-10-03' } };
  seed.pendingNotes = 'shared note (synthetic)';
  const shared = (await captureLexeme(seed, v2c2, 'własnych', 13, 21, 3))!;
  seed.pendingMeaning = ''; seed.pendingMeaningSuggestion = null; seed.pendingNotes = '';
  const disposable = (await captureLexeme(seed, v2c2, 'napisów', 22, 29, 4))!;
  const archived = (await captureLexeme(seed, v2c2, 'Uczymy', 0, 6, 0))!;
  await new Promise((resolve) => setTimeout(resolve, 5));
  await importFixtureMediaAndSubtitles(seed, MEDIA, TARGET, NATIVE);
  const m2 = seed.currentMedia!.id;
  expect(m2).not.toBe(m1);
  const sharedAgain = (await captureLexeme(seed, seed.cues[1]!, 'własnych', 13, 21, 3))!;
  expect(sharedAgain.id).toBe(shared.id); // one saved item, occurrences in both videos
  expect(setSavedItemMeaning(seed, sentence.id, 'Hi, this is a local test.')?.meaningSource).toEqual({ kind: 'learner' });
  // Review events and practice attempts on a kept item and on the item the restore will remove.
  setPracticeMode(seed, 'typed-input');
  activateReviewCard(seed, cardFor(seed, sentence).id);
  submitPracticeAttempt(seed, sentence.displayText, FAR('2100-01-01T00:00:00.000Z'));
  submitReviewRating(seed, cardFor(seed, sentence).id, 'good', FAR('2100-01-02T00:00:00.000Z'));
  submitReviewRating(seed, cardFor(seed, disposable).id, 'good', FAR('2100-01-01T00:00:00.000Z'));
  activateReviewCard(seed, cardFor(seed, disposable).id);
  submitPracticeAttempt(seed, disposable.displayText, FAR('2100-03-01T00:00:00.000Z'));
  // UI archive case: the Saved-view toggle only suspends the card.
  archiveReviewCardsForSavedItem(seed, phrase.id);
  expect(cardFor(seed, phrase).suspendedAt).toBeDefined();
  expect((await connectLocalService(seed, p0.origin)).ok).toBe(true); // empty service: browser work kept, unsaved
  expect((await saveModelToLocalService(seed)).ok).toBe(true);

  // --- Store/restore archive case + inactive audit: an existing Replace-all restore of a learner-state manifest that
  // omits the disposable item (its history becomes retained-only audit) and carries archivedAt on another item. ---
  const s = seed.store.snapshot();
  const disposableCard = cardFor(seed, disposable).id;
  const omit = <T>(rows: Record<string, T>, drop: (row: T) => boolean) => Object.fromEntries(Object.entries(rows).filter(([, row]) => !drop(row)));
  const manifestSource: LocalStoreSnapshot = {
    ...s,
    savedItems: { ...omit(s.savedItems, (item) => item.id === disposable.id), [archived.id]: { ...s.savedItems[archived.id]!, archivedAt: at } },
    savedOccurrences: omit(s.savedOccurrences, (occ) => occ.savedItemId === disposable.id),
    reviewCards: omit(s.reviewCards, (card) => card.id === disposableCard),
    reviewCardStates: omit(s.reviewCardStates, (state) => state.cardId === disposableCard),
    reviewEvents: s.reviewEvents.filter((event) => event.cardId !== disposableCard),
    practiceAttempts: s.practiceAttempts.filter((attempt) => attempt.cardId !== disposableCard),
  };
  const manifest = wire(manifestSource);
  const before = await p0.api('/api/state');
  const preview = await p0.api('/api/restore/preview', { method: 'POST', body: { manifest, mode: 'replace-active', expectedRevision: before.json.revision } });
  expect(preview.status).toBe(200);
  const commit = await p0.api('/api/restore/commit', { method: 'POST', body: { manifest, mode: 'replace-active', expectedRevision: before.json.revision,
    confirmation: { confirmedAt: at, confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: preview.json.preview.warnings.map((w: { kind: string }) => w.kind) } } });
  expect(commit.status).toBe(200);

  // --- Checkpoint: consistent backup of the live WAL database; the backup file is closed and never opened again. ---
  const checkpointDir = join(scratchRoot, 'checkpoint'); await mkdir(checkpointDir);
  fx.checkpointFile = join(checkpointDir, 'checkpoint.sqlite');
  const source = new DatabaseSync(fx.originalDb);
  try { await backup(source, fx.checkpointFile); } finally { source.close(); }
  expect((await readdir(checkpointDir)).sort()).toEqual(['checkpoint.sqlite']);
  fx.checkpointSha256 = await sha256File(fx.checkpointFile);
  const probe = await workingCopy('checkpoint-probe');
  fx.checkpointTables = tableState(probe);
  fx.checkpoint = logicalSnapshot(await workingCopy('checkpoint-logical'));
  fx.checkpointFull = fullFromLogical(fx.checkpoint);
  fx.checkpointManifestContent = JSON.parse(JSON.stringify(new ExportService(new LocalStore(fx.checkpointFull), 'lt-192.2').buildManifest().content));

  // --- Browser at the exact checkpoint baseline: connected, ALL media hydrated; its cache record is the cache checkpoint. ---
  const browser = createAppModel(); p0.pair(browser); setLocalServiceAutosave(browser, false);
  expect((await connectLocalService(browser, p0.origin)).ok).toBe(true);
  expect(browser.localService.revision).toBe(fx.checkpoint.revision);
  await hydrateAllMedia(browser);
  expect(canon(browser.store.snapshot())).toEqual(fx.checkpointFull);
  fx.checkpointCache = buildSnapshotCacheRecord(browser);
  fx.checkpointCacheJson = JSON.stringify(fx.checkpointCache);
  // The v2 cache strips acknowledged bundles: a cache alone cannot carry the transcripts.
  expect(fx.checkpointCache.snapshot.cues).toEqual({}); expect(fx.checkpointCache.pendingTranscriptTrackIds).toEqual([]);
  expect(fx.checkpointCache.lastAcked?.baseUrl).toBe(p0.origin);
  await p0.close(); // offline from here on
  // lt-192.3 (changed check): offline vocabulary of a browser that holds this service's operation identity is queued as
  // operations bound to that service lineage, which a transfer to a different service cannot carry. This rehearsal's
  // offline additions are document rows of a browser without an operation identity (as before C, e.g. its outbox could
  // not persist), so its cross-service transfer exercises the whole-document path it was written for.
  useLearnerOperationOutbox(browser, createMemoryOutboxBackend());

  // --- Offline browser-only additions over the baseline (new ids only). ---
  await importFixtureMediaAndSubtitles(browser, MEDIA, TARGET, NATIVE);
  const m3 = browser.currentMedia!.id;
  const offlineLexeme = (await captureLexeme(browser, browser.cues[1]!, 'się', 7, 10, 1))!;
  setSavedItemMeaning(browser, offlineLexeme.id, 'oneself (reflexive)');
  submitReviewRating(browser, cardFor(browser, offlineLexeme).id, 'good', FAR('2100-04-01T00:00:00.000Z'));
  expect(await openMediaAsset(browser, m1)).toBe(true);
  expect(browser.targetTrackId).not.toBeNull();
  const m1Cue = browser.cues.find((cue) => cue.text.startsWith('Cześć'))!;
  browser.pendingNotes = 'offline note (synthetic)';
  const offlinePhrase = (await capturePhrase(browser, m1Cue, 'to jest', 7, 14, 1, 3))!;
  browser.pendingNotes = '';
  expect(new Set([offlineLexeme.id, offlinePhrase.id]).size).toBe(2);
  fx.candidateFull = canon(browser.store.snapshot());
  fx.candidateCache = buildSnapshotCacheRecord(browser);
  const m3Tracks = Object.values(fx.candidateFull.subtitleTracks).filter((track) => track.mediaId === m3).map((track) => track.id).sort();
  expect(fx.candidateCache.pendingTranscriptTrackIds).toEqual(m3Tracks);
  expect(new Set(Object.values(fx.candidateCache.snapshot.cues).map((cue) => cue.trackId))).toEqual(new Set(m3Tracks));
  fx.ids = { m1, m2, m3, t1, t1v2, sentence: sentence.id, phrase: phrase.id, shared: shared.id, disposable: disposable.id, archived: archived.id, offlineLexeme: offlineLexeme.id, offlinePhrase: offlinePhrase.id };
  fx.added = additionsOverBaseline(fx.checkpointFull, fx.candidateFull);
  fx.expected = combinedExpected(fx.checkpointFull, fx.candidateFull, fx.added);
  fx.candidateRevisions = [];
}, 120_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  for (const service of [...openServices]) await service.close();
  if (scratchRoot) await rm(scratchRoot, { recursive: true, force: true });
});

describe('lt-192.2 synthetic recovery rehearsal', () => {
  it('checkpoint: representative seeded store, logical snapshot oracles, original preserved', () => {
    const { checkpoint: cp, ids } = fx;
    const learner = cp.learner;
    expect(Object.keys(learner.mediaAssets).sort()).toEqual([ids.m1, ids.m2].sort());
    // Two media, each with approved target + native; the target of m1 also has the approved corrected v2.
    for (const media of [ids.m1, ids.m2]) {
      const tracks = Object.values(learner.subtitleTracks).filter((track) => track.mediaId === media);
      expect(tracks.filter((t) => t.role === 'native' && t.transcriptStatus === 'approved')).toHaveLength(1);
      expect(tracks.filter((t) => t.role === 'target' && t.transcriptStatus === 'approved').length).toBeGreaterThanOrEqual(1);
    }
    const v2 = learner.subtitleTracks[ids.t1v2]!;
    expect([v2.trackVersion, v2.transcriptStatus, v2.transcriptSourceKind, v2.provenance.parentTrackId]).toEqual([2, 'approved', 'manual-edit', ids.t1]);
    expect(learner.subtitleTracks[ids.t1]!.trackVersion).toBe(1);
    const v2Bundle = cp.transcripts[ids.m1]![ids.t1v2]!;
    expect(v2Bundle.cues.map((cue) => cue.text)).toEqual(['Cześć, to jest lokalny test!', 'Uczymy się z własnych napisów.']);
    expect(v2Bundle.wordTimings.map((w) => [w.text, w.charStart, w.charEnd, w.startMs, w.endMs, w.sourceKind])).toEqual([
      ['własnych', 13, 21, 1400, 1700, 'manual-edit'], ['napisów', 22, 29, 1700, 1950, 'manual-edit']]);
    expect(cp.transcripts[ids.m1]![ids.t1]!.cues.map((cue) => cue.text)).toEqual(['Cześć, to jest lokalny test.', 'Uczymy się z własnych napisów.']);
    // Items: sentence (learner meaning), phrase (notes, UI-archived card), shared lexeme in both videos (dictionary meaning),
    // store/restore archivedAt item; the disposable item is gone from active state.
    const items = learner.savedItems;
    expect(Object.keys(items).sort()).toEqual([ids.sentence, ids.phrase, ids.shared, ids.archived].sort());
    expect([items[ids.sentence]!.meaning, items[ids.sentence]!.meaningSource]).toEqual(['Hi, this is a local test.', { kind: 'learner' }]);
    expect([items[ids.shared]!.meaning, items[ids.shared]!.meaningSource, items[ids.shared]!.notes]).toEqual(['own (gen. pl.)', { kind: 'dictionary-suggested', glossSourceId: 'synthetic-gloss', dumpDate: '2026-10-03' }, 'shared note (synthetic)']);
    expect(items[ids.phrase]!.notes).toBe('phrase note (synthetic)');
    expect(items[ids.archived]!.archivedAt).toBe(at);
    expect(Object.values(items).filter((item) => item.archivedAt).map((item) => item.id)).toEqual([ids.archived]);
    const sharedOccs = Object.values(learner.savedOccurrences).filter((occ) => occ.savedItemId === ids.shared);
    expect(sharedOccs.map((occ) => occ.mediaId).sort()).toEqual([ids.m1, ids.m2].sort());
    expect(sharedOccs.find((occ) => occ.mediaId === ids.m1)!.sourceContext).toMatchObject({ subtitleTrackId: ids.t1v2, timeRangeMs: { start: 1400, end: 1700 }, charSpan: { start: 13, end: 21 } });
    const phraseCard = Object.values(learner.reviewCards).find((card) => card.savedItemId === ids.phrase)!;
    expect(phraseCard.suspendedAt).toBeDefined();
    expect(Object.values(learner.reviewCards).filter((card) => card.suspendedAt).map((card) => card.id)).toEqual([phraseCard.id]);
    // Active history vs inactive (retained-only) audit from the Replace-all restore.
    const activeEvents = learner.reviewEvents.map((e) => e.id);
    const activeAttempts = learner.practiceAttempts.map((a) => a.id);
    expect(activeEvents).toHaveLength(2); expect(activeAttempts).toHaveLength(1);
    const auditOnlyEvents = cp.learner.learnerAudit!.reviewEvents.filter((e) => !activeEvents.includes(e.id));
    const auditOnlyAttempts = cp.learner.learnerAudit!.practiceAttempts.filter((a) => !activeAttempts.includes(a.id));
    // The disposable item's direct review plus the review event its FSRS-updating practice attempt recorded.
    expect(auditOnlyEvents).toHaveLength(2); expect(auditOnlyAttempts).toHaveLength(1);
    expect(new Set(auditOnlyEvents.map((e) => e.cardId))).toEqual(new Set([auditOnlyAttempts[0]!.cardId]));
    expect(learner.reviewCards[auditOnlyEvents[0]!.cardId]).toBeUndefined();
    expect(cp.auditReviewEvents.map((e) => e.id)).toEqual(cp.learner.learnerAudit!.reviewEvents.map((e) => e.id));
    expect(cp.auditPracticeAttempts.map((a) => a.id)).toEqual(cp.learner.learnerAudit!.practiceAttempts.map((a) => a.id));
    expectSpansResolve(fx.checkpointFull);
    expect(cp.schemaVersion).toBeGreaterThan(0);
    // Original preservation: the original database file, closed, has the same logical snapshot as the checkpoint.
    return copyFile(fx.originalDb, join(scratchRoot, 'original-probe.sqlite')).then(() => {
      expect(logicalSnapshot(join(scratchRoot, 'original-probe.sqlite'))).toEqual(cp);
    });
  });

  it('candidate fixture: exact checkpoint plus new ids only; a same-id conflict or a missing baseline record is refused', () => {
    const { added, ids } = fx;
    expect(added.savedItems).toEqual([ids.offlineLexeme, ids.offlinePhrase].sort());
    expect(added.mediaAssets).toEqual([ids.m3]);
    expect(added.subtitleTracks).toHaveLength(2);
    expect(added.reviewEvents).toHaveLength(1); expect(added.practiceAttempts).toEqual([]);
    expect(added['learnerAudit.reviewEvents']).toEqual(added.reviewEvents);
    expect(added.cues!.length).toBeGreaterThan(0);
    for (const key of RECORD_KEYS) for (const id of added[key]!) expect((fx.checkpointFull[key] as Record<string, unknown>)[id]).toBeUndefined();
    const conflict = structuredClone(fx.candidateFull) as any;
    conflict.savedItems[ids.sentence] = { ...conflict.savedItems[ids.sentence], meaning: 'changed offline' };
    expect(() => additionsOverBaseline(fx.checkpointFull, conflict)).toThrow(FixturePreconditionRefusal);
    expect(() => additionsOverBaseline(fx.checkpointFull, conflict)).toThrow(/same-id conflict/);
    const missing = structuredClone(fx.candidateFull) as any; delete missing.savedOccurrences[Object.keys(fx.checkpointFull.savedOccurrences)[0]!];
    expect(() => additionsOverBaseline(fx.checkpointFull, missing)).toThrow(/missing from candidate/);
  });

  it('transfer: bundles first under CAS, lost learner-state ack resolved by reconnect readback, no duplicates, reopen', async () => {
    const w1 = await workingCopy('candidate');
    let p1 = await startService(w1);
    const browser = createAppModel();
    expect(await bootSnapshotCache(browser, backendWith(fx.candidateCache))).toBe(true);
    p1.pair(browser); setLocalServiceAutosave(browser, false);
    const events: string[] = [];
    let lost = 0;
    recordRequests(events, () => 'browser', (url, init, real) => {
      if (!(url.endsWith('/api/state') && init?.method === 'PUT')) return null;
      return (async () => {
        const reply = await real(url, init); expect(reply.status).toBe(200); await reply.json(); lost++; // committed; ack lost
        throw new TypeError('Acknowledgement lost (synthetic).');
      })();
    });
    try {
      expect((await connectLocalService(browser, p1.origin)).ok).toBe(false);
      expect(browser.localService.syncState).toBe('choice'); // different origin: no same-origin baseline applies
      await refuseUnlessServiceAtCheckpoint(p1, fx.checkpoint); // passes: exact baseline
      expect(resolveLocalServiceConnection(browser, 'browser').ok).toBe(true);
      expect(browser.localService.revision).toBe(fx.checkpoint.revision);
      fx.candidateRevisions.push(fx.checkpoint.revision);
      const m3Tracks = fx.added.subtitleTracks!;
      expect(pendingTranscriptTrackIds(browser)).toEqual(m3Tracks);
      events.length = 0;
      const saved = await saveModelToLocalService(browser);
      expect(saved.ok).toBe(false);
      expect(browser.localService.lastSavedAt).toBeNull();
      expect(lost).toBe(1);
      expect(events).toEqual([...m3Tracks.map((id) => `browser PUT /api/tracks/${id}/transcript 200`), 'browser PUT /api/state lost']);
      // Resolve the lost ack by reconnect readback; the client does NOT retry the PUT.
      events.length = 0;
      const readback = await p1.api('/api/state');
      const browserLearner = learnerStateOf(browser.store.snapshot());
      const serviceLearner = learnerStateOf(new LocalStore(readback.json.snapshot).snapshot());
      expect(stable(serviceLearner)).toBe(stable(browserLearner)); // readback: the lost write DID commit, content-identical
      expect(pendingTranscriptTrackIds(browser)).toEqual([]); // both bundles were acknowledged; nothing would be discarded
      // lt-192.3 (changed check, the lt-192.2 finding): the reconnect comparison is key-order independent, so the
      // committed, content-identical state is recognised and adopted without a false Keep/Load choice. No PUT is retried.
      const reconnect = await connectLocalService(browser, p1.origin);
      expect(reconnect.ok).toBe(true);
      expect(events.filter((line) => line.includes(' PUT '))).toEqual([]);
      expect(browser.localService.syncState).toBe('idle');
      expect(browser.localService.revision).toBe(readback.json.revision);
      expect(canon(readback.json.snapshot)).toEqual(canon(learnerStateOf(fx.expected)));
      const finalRev = readback.json.revision as string;
      fx.candidateRevisions.push(...[1, 2, 3].map((d) => `rev:${revisionNumber(fx.checkpoint.revision) + d}`));
      expect(finalRev).toBe(fx.candidateRevisions.at(-1)); // exactly 2 bundle commits + 1 learner-state commit, no retry
      // No duplicates: exact id sets, one bundle per new track, each text saved once.
      expect(Object.keys(readback.json.snapshot.savedItems).sort()).toEqual(Object.keys(fx.expected.savedItems).sort());
      const texts = Object.values(readback.json.snapshot.savedItems as Record<string, SavedItem>).map((item) => `${item.kind}:${item.displayText}`);
      expect(new Set(texts).size).toBe(texts.length);
      expect(readback.json.snapshot.reviewEvents.map((e: { id: string }) => e.id).sort()).toEqual(fx.expected.reviewEvents.map((e) => e.id).sort());
      const m3Bundles = await p1.api(`/api/media/${fx.ids.m3}/transcripts`);
      expect(Object.keys(m3Bundles.json.tracks).sort()).toEqual(m3Tracks);
      // Fully hydrated browser equals the combined expected state.
      await hydrateAllMedia(browser);
      expect(canon(browser.store.snapshot())).toEqual(fx.expected);
    } finally { vi.unstubAllGlobals(); }

    // Close and reopen the candidate (same lineage): same revision and state; a fresh browser hydrates everything.
    await p1.close();
    p1 = await startService(w1);
    try {
      const reopened = await p1.api('/api/state');
      expect(reopened.json.revision).toBe(fx.candidateRevisions.at(-1));
      const fresh = createAppModel(); p1.pair(fresh); setLocalServiceAutosave(fresh, false);
      expect((await connectLocalService(fresh, p1.origin)).ok).toBe(true);
      // Before hydration only the current media's bundles are present, so the Anki context can silently degrade.
      expect(mediaTranscriptsLoaded(fresh, fx.ids.m1)).toBe(false);
      expect(ankiPlanFor(canon(fresh.store.snapshot()))).not.toEqual(ankiPlanFor(fx.expected));
      await hydrateAllMedia(fresh);
      const transferred = canon(fresh.store.snapshot());
      expect(transferred).toEqual(fx.expected);
      expectSpansResolve(transferred);
      // Field oracles on the transferred store.
      const item = (id: string) => transferred.savedItems[id]!;
      expect([item(fx.ids.offlineLexeme).meaning, item(fx.ids.offlineLexeme).meaningSource]).toEqual(['oneself (reflexive)', { kind: 'learner' }]);
      expect(item(fx.ids.offlinePhrase).notes).toBe('offline note (synthetic)');
      expect(item(fx.ids.archived).archivedAt).toBe(at);
      expect(Object.values(transferred.reviewCards).find((card) => card.savedItemId === fx.ids.phrase)!.suspendedAt).toBeDefined();
      expect(transferred.learnerAudit).toEqual(fx.expected.learnerAudit);
      // Anki: the checkpoint GUID set is a subset; the difference is exactly the added active items.
      const before = activeGuids(fx.checkpointFull); const after = activeGuids(transferred);
      expect(before.every((guid) => after.includes(guid))).toBe(true);
      expect(after.filter((guid) => !before.includes(guid)).sort()).toEqual([fx.ids.offlineLexeme, fx.ids.offlinePhrase].map(ankiGuidFor).sort());
      expect(after).not.toContain(ankiGuidFor(fx.ids.archived));
      const plan = ankiPlanFor(transferred);
      expect(plan).toEqual(ankiPlanFor(fx.expected));
      expect(plan.excludedArchived).toBe(1);
      expect(plan.notes.find((note) => note.guid === ankiGuidFor(fx.ids.phrase))!.contextHtml).toBe('Cześć, to jest <b>lokalny test</b>.');
      // Revisions are monotonic within this lineage only.
      const numbers = fx.candidateRevisions.map(revisionNumber);
      expect(numbers.every((n, i) => i === 0 || n > numbers[i - 1]!)).toBe(true);
    } finally { await p1.close(); }
    const closed = logicalSnapshot(w1);
    expect(closed.revision).toBe(fx.candidateRevisions.at(-1));
    expect(fullFromLogical(closed)).toEqual(fx.expected);
    expect(closed.schemaVersion).toBe(fx.checkpoint.schemaVersion);
  }, 60_000);

  it('stale comparison: choice captured, THEN a second client writes a sentinel, BEFORE the first browser PUT: conflict, sentinel survives', async () => {
    const p2 = await startService(await workingCopy('stale-sentinel'));
    const events: string[] = [];
    let actor = 'browser';
    try {
      const browser = createAppModel();
      expect(await bootSnapshotCache(browser, backendWith(fx.candidateCache))).toBe(true);
      p2.pair(browser); setLocalServiceAutosave(browser, false);
      recordRequests(events, () => actor);
      expect((await connectLocalService(browser, p2.origin)).ok).toBe(false);
      expect(browser.localService.syncState).toBe('choice');
      await refuseUnlessServiceAtCheckpoint(p2, fx.checkpoint); // at comparison time the service IS the baseline
      events.push(`choice captured at ${fx.checkpoint.revision}`);
      // Second client, no reconnect of the browser in between.
      actor = 'second';
      const second = createAppModel(); p2.pair(second); setLocalServiceAutosave(second, false);
      expect((await connectLocalService(second, p2.origin)).ok).toBe(true);
      // lt-192.3 (changed check): the sentinel meaning edit is a server OPERATION now, so it does not make the browser's
      // document basis stale; the operation fence protects it instead: the browser's save is refused at PUT /api/state
      // (409 operation-owned-rows) because it would add vocabulary rows outside operations. Its two write-once m3
      // bundles are accepted first (only an operation intervened) and stay unreferenced: m3's media is not stored.
      expect(setSavedItemMeaning(second, fx.ids.sentence, 'SENTINEL (second client)')).not.toBeNull();
      expect((await saveModelToLocalService(second)).ok).toBe(true);
      const sentinelRev = (await p2.api('/api/state')).json.revision as string;
      events.push(`sentinel written at ${sentinelRev}`);
      actor = 'browser';
      expect(resolveLocalServiceConnection(browser, 'browser').ok).toBe(true);
      const prior = browser.store.snapshot();
      expect((await saveModelToLocalService(browser)).ok).toBe(false);
      expect(browser.localService.syncState).toBe('conflict');
      expect(browser.localService.lastMessage).toMatch(/Restore \(merge\)/);
      expect(browser.store.snapshot()).toEqual(prior); // browser work kept
      const order = events.filter((line) => line.startsWith('choice') || line.startsWith('sentinel') || line.startsWith('browser PUT'));
      expect(order).toEqual([`choice captured at ${fx.checkpoint.revision}`, `sentinel written at ${sentinelRev}`,
        ...fx.added.subtitleTracks!.map((id) => `browser PUT /api/tracks/${id}/transcript 200`), 'browser PUT /api/state 409']);
      vi.unstubAllGlobals();
      const state = await p2.api('/api/state');
      expect(state.json.revision).toBe(`rev:${revisionNumber(sentinelRev) + 2}`);
      expect(state.json.snapshot.savedItems[fx.ids.sentence].meaning).toBe('SENTINEL (second client)');
      expect(state.json.snapshot.mediaAssets[fx.ids.m3]).toBeUndefined();
      expect((await p2.api(`/api/media/${fx.ids.m3}/transcripts`)).status).toBe(404);
      for (const id of fx.added.savedItems!) expect(state.json.snapshot.savedItems[id]).toBeUndefined();
    } finally { vi.unstubAllGlobals(); await p2.close(); }
  }, 60_000);

  it('already-present divergence: the FIXTURE precondition refuses Keep browser before any write (not a product safeguard)', async () => {
    const p3 = await startService(await workingCopy('present-divergence'));
    const events: string[] = [];
    try {
      const second = createAppModel(); p3.pair(second); setLocalServiceAutosave(second, false);
      expect((await connectLocalService(second, p3.origin)).ok).toBe(true);
      setSavedItemMeaning(second, fx.ids.sentence, 'SENTINEL (already present)');
      expect((await saveModelToLocalService(second)).ok).toBe(true);
      const diverged = await p3.api('/api/state');
      const browser = createAppModel();
      expect(await bootSnapshotCache(browser, backendWith(fx.candidateCache))).toBe(true);
      p3.pair(browser); setLocalServiceAutosave(browser, false);
      recordRequests(events, () => 'browser');
      expect((await connectLocalService(browser, p3.origin)).ok).toBe(false);
      expect(browser.localService.syncState).toBe('choice');
      // CAS would NOT protect the sentinel here: the comparison revision already includes it, so a product Keep browser
      // would replace (omit) it. The rehearsal never attempts that; its own precondition refuses instead.
      await expect(refuseUnlessServiceAtCheckpoint(p3, fx.checkpoint)).rejects.toThrow(FixturePreconditionRefusal);
      expect(resolveLocalServiceConnection(browser, 'cancel').ok).toBe(false);
      expect(events.filter((line) => line.includes(' PUT '))).toEqual([]);
      vi.unstubAllGlobals();
      const after = await p3.api('/api/state');
      expect(after.json).toEqual(diverged.json);
      expect(after.json.snapshot.savedItems[fx.ids.sentence].meaning).toBe('SENTINEL (already present)');
      expect(Object.keys(browser.store.snapshot().savedItems)).toEqual(expect.arrayContaining(fx.added.savedItems!)); // browser work kept
    } finally { vi.unstubAllGlobals(); await p3.close(); }
  }, 60_000);

  it('rollback: cache + DB back to the isolated immutable checkpoint; candidate-era revisions are not valid against it', async () => {
    expect(fx.candidateRevisions.length).toBeGreaterThan(1); // transfer ran first
    await rm(join(scratchRoot, 'candidate.sqlite'), { force: true }); // discard the candidate
    const w4 = await workingCopy('rollback');
    const p4 = await startService(w4);
    try {
      // Cache rollback: the recorded checkpoint cache record, unchanged, into a fresh backend; fresh origin.
      expect(JSON.stringify(fx.checkpointCache)).toBe(fx.checkpointCacheJson);
      const browser = createAppModel();
      expect(await bootSnapshotCache(browser, backendWith(fx.checkpointCache))).toBe(true);
      p4.pair(browser); setLocalServiceAutosave(browser, false);
      expect((await connectLocalService(browser, p4.origin)).ok).toBe(true);
      expect(browser.localService.revision).toBe(fx.checkpoint.revision);
      await hydrateAllMedia(browser);
      const rolledBack = canon(browser.store.snapshot());
      expect(rolledBack).toEqual(fx.checkpointFull);
      expect(activeGuids(rolledBack)).toEqual(activeGuids(fx.checkpointFull));
      expect(ankiPlanFor(rolledBack)).toEqual(ankiPlanFor(fx.checkpointFull));
      expect(JSON.parse(JSON.stringify(new ExportService(new LocalStore(rolledBack), 'lt-192.2').buildManifest().content))).toEqual(fx.checkpointManifestContent);
      // A candidate-era token is not valid against the rolled-back lineage.
      const candidateFinal = fx.candidateRevisions.at(-1)!;
      expect(candidateFinal).not.toBe(fx.checkpoint.revision);
      const stale = await p4.api('/api/state', { method: 'PUT', body: { snapshot: fx.checkpoint.learner, expectedRevision: candidateFinal } });
      expect(stale.status).toBe(409);
      expect((await p4.api('/api/state')).json.revision).toBe(fx.checkpoint.revision);
    } finally { await p4.close(); }
    // Logical equality after the reopen (not byte identity of a live database or WAL).
    const reopenedCopy = join(scratchRoot, 'rollback-probe.sqlite'); await copyFile(w4, reopenedCopy);
    expect(logicalSnapshot(reopenedCopy)).toEqual(fx.checkpoint);
    expect(tableState(w4)).toEqual(fx.checkpointTables);
    // Token reuse across lineages: the next write here gets the token the candidate used for a different state.
    const p5 = await startService(w4);
    try {
      const write = await p5.api('/api/state', { method: 'PUT', body: { snapshot: fx.checkpoint.learner, expectedRevision: fx.checkpoint.revision } });
      expect(write.status).toBe(200);
      expect(write.json.revision).toBe(fx.candidateRevisions[1]);
      expect((await p5.api(`/api/media/${fx.ids.m3}/transcripts`)).status).toBe(404); // same token, different state
    } finally { await p5.close(); }
    // The immutable checkpoint was never opened: same bytes, no WAL/SHM siblings.
    expect(await sha256File(fx.checkpointFile)).toBe(fx.checkpointSha256);
    expect((await readdir(join(scratchRoot, 'checkpoint'))).sort()).toEqual(['checkpoint.sqlite']);
  }, 60_000);
});
