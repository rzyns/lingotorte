import { afterEach, expect, it, vi } from 'vitest';
import { pairedModel } from './pairingFixture.ts';
import { connectLocalService, pairLocalService, previewRestoreManifest, previewDurableRestore, previewPendingSessionRestore, confirmRestore, saveModelToLocalService, setLocalServiceBaseUrl, resolveLocalServiceConnection, setExportImportConfirmReplace, listEmbeddedSubtitleTracksFromService, markUnsavedBrowserEdits } from '../../apps/web/src/model';
import { makeSubtitleTrack } from '../../packages/domain/src';
import { LocalStore, ExportService } from '../../packages/storage/src';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence.ts';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src';
const revision = `sha256:${'1'.repeat(64)}`;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => vi.unstubAllGlobals());
it('empty versioned audit is not dirty browser content', async () => {
 const model = pairedModel();
 const remote = { ...createEmptyLocalStoreSnapshot(), providerPolicies: { synthetic: { ...model.providerPolicy } } };
 vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/api/status') ? { ok: true, config: {} } : { ok: true, snapshot: remote, revision, restoreCapability: 'active-audit-restore-v1' })));
 expect((await connectLocalService(model)).ok).toBe(true);
 expect(model.localService.syncState).toBe('idle');
});
it('connected restore refuses missing capability without local mutation or unsafe PUT', async () => {
 const model = pairedModel();
 vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.endsWith('/api/status') ? { ok: true, config: {} } : { ok: true, snapshot: createEmptyLocalStoreSnapshot(), revision })));
 await connectLocalService(model);
 const wire = JSON.stringify(model.exportService.buildManifest());
 previewRestoreManifest(model, wire);
 model.exportImport.confirmOverwrite = true;
 model.exportImport.acknowledgedWarnings = model.exportImport.preview!.warnings.map(w => w.kind);
 const before = model.store.snapshot();
 await expect(Promise.resolve().then(() => confirmRestore(model))).rejects.toThrow(/capability|update/i);
 expect(model.store.snapshot()).toEqual(before);
 expect(model.exportImport.manifestJson).toBe(wire);
 expect(model.exportImport.lastRestore).toBeNull();
});
it('pending session replacement cannot be converted into ordinary PUT', async () => {
 const model = pairedModel();
 const wire = JSON.stringify(model.exportService.buildManifest());
 previewRestoreManifest(model, wire); model.exportImport.confirmReplace = true;
 // Obtain mode-specific session warnings.
 model.exportImport.acknowledgedWarnings = model.restoreService.preview(model.exportService.buildManifest(), 'replace-active').warnings.map(w => w.kind);
 await confirmRestore(model);
 const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => response(url.endsWith('/api/status') ? { config: {} } : { snapshot: createEmptyLocalStoreSnapshot(), revision, restoreCapability: 'active-audit-restore-v1' }));
 vi.stubGlobal('fetch', fetchMock);
 await connectLocalService(model);
 await saveModelToLocalService(model);
 expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit | undefined)?.method === 'PUT')).toBe(false);
 expect(model.store.snapshotPendingRestoreIntent()).not.toBeNull();
});
const databases: SqliteLocalPersistence[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function syntheticStore() {
 const store = new LocalStore(); const at = '2026-06-21T12:00:00.000Z';
 store.putSubtitleTrack({ ...makeSubtitleTrack({ mediaId: 'media', language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: '/synthetic/track.srt', contentSha256: `sha256:${'a'.repeat(64)}`, isActive: true }), id: 'track', createdAt: at });
 store.putSavedItem({ id: 'synthetic-item', kind: 'lexeme', language: 'pl', displayText: 'synthetic', createdAt: at, updatedAt: at });
 const sourceContext = { mediaId: 'media', mediaPath: '/synthetic/media.webm', mediaFingerprint: `sha256:${'a'.repeat(64)}` as const, cueId: 'cue', subtitleTrackId: 'track', timeRangeMs: { start: 0, end: 1000 }, tokenSpan: { startToken: 0, endToken: 1 }, charSpan: { start: 0, end: 5 } };
 store.putSavedOccurrence({ id: 'synthetic-occurrence', savedItemId: 'synthetic-item', mediaId: 'media', cueId: 'cue', startMs: 0, endMs: 1000, selectionKind: 'lexeme', selectionText: 'synthetic', sourceContext, createdAt: at });
 store.putReviewCard({ id: 'synthetic-card', savedItemId: 'synthetic-item', savedOccurrenceId: 'synthetic-occurrence', cardType: 'recognition', promptTemplate: 'synthetic', createdAt: at });
 store.addReviewEvent({ id: 'synthetic-review', cardId: 'synthetic-card', rating: 'good', reviewedAt: at, createdAt: at, previousStateJson: '{}', nextStateJson: '{}' });
 store.addPracticeAttempt({ id: 'synthetic-attempt', cardId: 'synthetic-card', mode: 'typed-input', result: 'pass', sourceContext, reviewedAt: at, createdAt: at, givenAnswer: 'synthetic', expectedAnswer: 'synthetic', eventLink: { reviewEventId: 'synthetic-review' } });
 return store;
}
function service(seed = syntheticStore()) {
 const db = SqliteLocalPersistence.open(':memory:'); databases.push(db); db.saveSnapshot(seed.snapshot());
 const calls: { path: string; body?: Record<string, unknown>; method: string }[] = [];
 const handle = async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname; const method = init?.method ?? 'GET'; const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ path, method, body });
  if (path === '/api/status') return response({ ok: true, config: {} });
  if (path === '/api/state' && method === 'GET') return response({ ok: true, ...db.loadVersionedSnapshot(), restoreCapability: 'active-audit-restore-v1' });
  if (path === '/api/state' && method === 'PUT') { db.saveSnapshot(body.snapshot, undefined, body.expectedRevision); return response({ ok: true, revision: db.loadVersionedSnapshot().revision, savedAt: '2026-06-21T12:00:00.000Z' }); }
  if (path === '/api/restore/preview') return response({ ok: true, ...db.previewRestore(body.manifest, body.mode, body.expectedRevision, body.learnerAudit) });
  if (path === '/api/restore/commit') return response({ ok: true, ...db.commitRestore(body) });
  throw new Error('Unexpected synthetic route.');
 };
 vi.stubGlobal('fetch', vi.fn(handle)); return { db, calls, handle };
}
async function prepared() {
 const remote = service(); const model = pairedModel(); expect((await connectLocalService(model)).ok).toBe(true);
 const wire = JSON.stringify(new ExportService(new LocalStore(), 'synthetic').buildManifest());
 previewRestoreManifest(model, wire); setExportImportConfirmReplace(model, true);
 await previewDurableRestore(model); model.exportImport.acknowledgedWarnings = model.exportImport.preview!.warnings.map(w => w.kind);
 return { ...remote, model, wire };
}
it('actual SQLite replacement waits for acknowledgement AND readback; audit retained and unrelated player preserved', async () => {
 const { model, db, handle, calls } = await prepared(); const before = model.store.snapshot();
 model.player.currentTimeMs = 777; model.review.currentCardId = 'synthetic-card'; model.practice.pendingAnswer = 'synthetic answer';
 let release!: (r: Response) => void; const waiting = new Promise<Response>(r => { release = r; });
 let committed!: Response;
 vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { const reply = await handle(url, init); if (url.endsWith('/api/restore/commit')) { committed = reply; return waiting; } return reply; }));
 const restoring = confirmRestore(model);
 await vi.waitFor(() => expect(db.loadSnapshot().reviewEvents).toHaveLength(0));
 expect(model.store.snapshot()).toEqual(before); expect(model.exportImport.lastRestore).toBeNull();
 release(committed); await restoring;
 expect(model.store.snapshot()).toEqual(db.loadSnapshot()); expect(model.exportImport.lastRestore!.durablySaved).toBe(true);
 expect(model.exportImport.lastRestore!.effects!.reviewEvents.removedFromActive).toBe(1);
 expect(model.exportImport.lastRestore!.auditEffects!.reviewEvents.inactiveAfter).toBe(1);
 expect(model.player.currentTimeMs).toBe(777); expect(model.review.currentCardId).toBeNull(); expect(model.practice.pendingAnswer).toBe('');
 expect(calls.filter(c => c.path === '/api/restore/commit')).toHaveLength(1);
 expect((await saveModelToLocalService(model)).ok).toBe(true); expect(db.loadSnapshot().reviewEvents).toHaveLength(0); expect(db.listAuditReviewEvents()).toEqual(before.reviewEvents);
});
it.each(['acknowledgement', 'readback'] as const)('reconnect during pending restore %s preserves before-state and the original owner', async gate => {
 const { model, db, handle, calls, wire } = await prepared(); const before = model.store.snapshot();
 const connection = { ...model.localService }; const intent = model.store.snapshotPendingRestoreIntent();
 let release!: (r: Response) => void; const waiting = new Promise<Response>(r => { release = r; }); let held!: Response;
 vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
  const reply = await handle(url, init);
  if (!held && url.endsWith(gate === 'acknowledgement' ? '/api/restore/commit' : '/api/state')) { held = reply; return waiting; }
  return reply;
 }));
 const restoring = Promise.resolve(confirmRestore(model)).catch(e => e);
 await vi.waitFor(() => expect(held).toBeDefined());
 expect(db.loadSnapshot().reviewEvents).toHaveLength(0);
 const count = calls.length; const pendingConnection = { ...model.localService };
 const reconnect = await connectLocalService(model);
 expect(() => pairLocalService(model, 'A'.repeat(43))).toThrow(/restore.*pending/i);
 for (const choice of ['browser', 'service', 'cancel'] as const) expect(resolveLocalServiceConnection(model, choice).ok).toBe(false);
 const preserved = model.store.snapshot(); const pendingWire = model.exportImport.manifestJson;
 const connectionAfter = { ...model.localService }; const receiptBefore = model.exportImport.lastRestore;
 release(held); const result = await restoring;
 expect(reconnect.ok).toBe(false); expect(reconnect.message).toMatch(/restore.*pending/i);
 expect(preserved).toEqual(before); expect(pendingWire).toBe(wire); expect(receiptBefore).toBeNull();
 expect(connectionAfter).toEqual(pendingConnection); expect(model.store.snapshotPendingRestoreIntent()).toEqual(intent);
 expect(calls.slice(count).filter(c => c.path === '/api/status')).toHaveLength(0);
 expect(result).toBeUndefined(); expect(model.store.snapshot()).toEqual(db.loadSnapshot());
 expect(model.exportImport.lastRestore!.durablySaved).toBe(true);
 expect(calls.filter(c => c.path === '/api/restore/commit')).toHaveLength(1);
 expect(model.localService.baseUrl).toBe(connection.baseUrl);
 expect((await connectLocalService(model)).ok).toBe(true);
});
it.each(['wire', 'mode', 'local-edit', 'revision'] as const)('rejects captured preview after %s changes without dispatch or mutation', async change => {
 const { model, calls } = await prepared(); const before = model.store.snapshot();
 if (change === 'wire') model.exportImport.manifestJson += ' ';
 if (change === 'mode') { model.exportImport.confirmReplace = false; model.exportImport.confirmOverwrite = true; }
 if (change === 'local-edit') model.store.putSavedItem({ ...Object.values(model.store.snapshot().savedItems)[0]!, notes: 'new synthetic edit' });
 if (change === 'revision') model.localService.revision = revision;
 expect(() => confirmRestore(model)).toThrow(/preview/i);
 expect(calls.filter(c => c.path === '/api/restore/commit')).toHaveLength(0);
 if (change !== 'local-edit') expect(model.store.snapshot()).toEqual(before);
});
it.each(['lost-response', 'invalid-ack', 'lost-readback', 'rejected-readback'] as const)('retains before-state/input for %s and reconciles by GET with no blind retry', async fault => {
 const { model, db, handle, calls, wire } = await prepared(); const before = model.store.snapshot(); let committed = false;
 vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
  const reply = await handle(url, init);
  if (url.endsWith('/api/restore/commit')) { committed = true; if (fault === 'lost-response') throw new Error('synthetic transport loss'); if (fault === 'invalid-ack') return response({ ok: true }); }
  if (committed && url.endsWith('/api/state') && fault === 'lost-readback') throw new Error('synthetic readback loss');
  if (committed && url.endsWith('/api/state') && fault === 'rejected-readback') return response({ ok: false, error: 'Synthetic readback failed.' }, 500);
  return reply;
 }));
 await expect(confirmRestore(model)).rejects.toThrow(/outcome unknown/i);
 expect(model.store.snapshot()).toEqual(before); expect(model.exportImport.manifestJson).toBe(wire); expect(model.exportImport.lastRestore).toBeNull();
 expect((await saveModelToLocalService(model)).ok).toBe(false);
 vi.stubGlobal('fetch', vi.fn(handle)); expect((await connectLocalService(model)).ok).toBe(true);
 expect(model.store.snapshot()).toEqual(db.loadSnapshot()); expect(model.exportImport.lastRestore!.durablySaved).toBe(true);
 expect(calls.filter(c => c.path === '/api/restore/commit')).toHaveLength(1);
});
it.each([400, 409, 428, 500])('explicit HTTP %s rejection has no success/local mutation and retains input', async status => {
 const { model, wire } = await prepared(); const before = model.store.snapshot();
 vi.stubGlobal('fetch', vi.fn(async () => response({ ok: false, error: 'Synthetic rejected before commit.' }, status)));
 await expect(confirmRestore(model)).rejects.toThrow(/rejected/i);
 expect(model.store.snapshot()).toEqual(before); expect(model.exportImport.manifestJson).toBe(wire); expect(model.exportImport.lastRestore).toBeNull();
 expect(model.exportImport.lastError).not.toMatch(/outcome unknown/i);
});
it('owner supersession after dispatch never installs a stale acknowledgement', async () => {
 const { model, handle } = await prepared(); const before = model.store.snapshot(); let release!: (r: Response) => void; const waiting = new Promise<Response>(r => { release = r; }); let reply!: Response;
 vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { reply = await handle(url, init); return waiting; }));
 const restoring = confirmRestore(model); const observed = Promise.resolve(restoring).catch(e => e);
 await vi.waitFor(() => expect(reply).toBeDefined()); setLocalServiceBaseUrl(model, 'http://127.0.0.1:5999'); release(reply);
 expect(await observed).toBeInstanceOf(Error); expect(model.store.snapshot()).toEqual(before); expect(model.exportImport.lastRestore).toBeNull(); expect(model.localService.baseUrl).toBe('http://127.0.0.1:5999');
});
it('late browser mutation during commit keeps newer work and reports unknown rather than overwriting it', async () => {
 const { model, handle } = await prepared(); let release!: (r: Response) => void; const waiting = new Promise<Response>(r => { release = r; }); let reply!: Response;
 vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { reply = await handle(url, init); return waiting; }));
 const restoring = confirmRestore(model); const observed = Promise.resolve(restoring).catch(e => e);
 await vi.waitFor(() => expect(reply).toBeDefined()); model.store.putSavedItem({ ...Object.values(model.store.snapshot().savedItems)[0]!, notes: 'new synthetic work' }); const newer = model.store.snapshot(); release(reply);
 expect(String(await observed)).toMatch(/outcome unknown/i); expect(model.store.snapshot()).toEqual(newer); expect(model.exportImport.lastRestore).toBeNull();
});
it('session pending intent stages audit and uses explicit fresh durable preview/commit, never PUT', async () => {
 const model = pairedModel(); const seed = syntheticStore(); model.store.replaceSnapshot(seed.snapshot());
 const wire = JSON.stringify(new ExportService(new LocalStore(), 'synthetic').buildManifest()); previewRestoreManifest(model, wire); setExportImportConfirmReplace(model, true);
 model.exportImport.acknowledgedWarnings = model.exportImport.preview!.warnings.map(w => w.kind); await confirmRestore(model);
 expect(model.exportImport.lastRestore!.durablySaved).toBe(false); expect(model.store.snapshot().reviewEvents).toHaveLength(0);
 const { db, calls } = service(new LocalStore()); expect((await connectLocalService(model)).ok).toBe(false);
 expect(resolveLocalServiceConnection(model, 'browser').ok).toBe(true);
 previewPendingSessionRestore(model); await previewDurableRestore(model); model.exportImport.acknowledgedWarnings = model.exportImport.preview!.warnings.map(w => w.kind); await confirmRestore(model);
 expect(db.loadSnapshot().reviewEvents).toHaveLength(0); expect(db.listAuditReviewEvents()).toEqual(seed.snapshot().reviewEvents);
 expect(model.store.snapshotPendingRestoreIntent()).toBeUndefined(); expect(calls.some(c => c.method === 'PUT')).toBe(false);
});

it('preview drains an earlier ordinary save and binds its acknowledged revision', async () => {
 const { model, handle, calls } = await prepared(); let release!: (r: Response) => void;
 const waiting = new Promise<Response>(r => { release = r; }); let ack!: Response;
 vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { const reply = await handle(url, init); if (init?.method === 'PUT') { ack = reply; return waiting; } return reply; }));
 const saving = saveModelToLocalService(model); await vi.waitFor(() => expect(ack).toBeDefined());
 const previewsBefore = calls.filter(c => c.path === '/api/restore/preview').length;
 const previewing = previewDurableRestore(model); await Promise.resolve();
 expect(calls.filter(c => c.path === '/api/restore/preview')).toHaveLength(previewsBefore);
 release(ack); expect((await saving).ok).toBe(true); await previewing;
 expect(calls.filter(c => c.path === '/api/restore/preview')).toHaveLength(previewsBefore + 1);
});
it('a full owned service job including terminal polling precedes restore preview on the same queue', async () => {
 const { model, handle, calls } = await prepared();
 model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
 model.transcriptLifecycle.embeddedSubtitle.mediaPath = '/synthetic/media.mkv';
 let release!: (r: Response) => void; const waiting = new Promise<Response>(r => { release = r; }); let polled = false;
 vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
  if (url.endsWith('/api/jobs')) return response({ ok: true, job: { id: 'synthetic-list' } });
  if (url.endsWith('/api/jobs/synthetic-list')) { polled = true; return waiting; }
  return handle(url, init);
 }));
 const listing = listEmbeddedSubtitleTracksFromService(model, { pollAttempts: 1, pollDelayMs: 0 });
 await vi.waitFor(() => expect(polled).toBe(true)); const before = calls.length;
 const previewing = previewDurableRestore(model); await Promise.resolve(); expect(calls).toHaveLength(before);
 release(response({ ok: true, job: { status: 'completed', result: { listing: { effect: 'embedded-subtitles-listed', streamCount: 0, supportedCount: 0, tracks: [] } } } }));
 expect(await listing).toEqual([]); await previewing;
 expect(calls.length).toBeGreaterThan(before);
});
it('readback is a separate success gate; no receipt/live swap while readback is pending', async () => {
 const { model, handle } = await prepared(); const before = model.store.snapshot();
 let release!: (r: Response) => void; const waiting = new Promise<Response>(r => { release = r; }); let read!: Response;
 vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { const reply = await handle(url, init); if (url.endsWith('/api/state')) { read = reply; return waiting; } return reply; }));
 const restoring = confirmRestore(model); await vi.waitFor(() => expect(read).toBeDefined());
 expect(model.store.snapshot()).toEqual(before); expect(model.exportImport.lastRestore).toBeNull(); expect((await saveModelToLocalService(model)).ok).toBe(false);
 release(read); await restoring; expect(model.exportImport.lastRestore!.durablySaved).toBe(true);
});
it('an edit generation invalidates preview even when edited snapshot returns to identical bytes', async () => {
 const { model, calls } = await prepared(); markUnsavedBrowserEdits(model);
 expect(() => confirmRestore(model)).toThrow(/preview/i); expect(calls.filter(c => c.path === '/api/restore/commit')).toHaveLength(0);
});
it('session intent with later learner edits requires explicit resolution; service discard retains audit and clears intent', async () => {
 const model = pairedModel(); const seed = syntheticStore(); model.store.replaceSnapshot(seed.snapshot());
 previewRestoreManifest(model, JSON.stringify(new ExportService(new LocalStore(), 'synthetic').buildManifest())); setExportImportConfirmReplace(model, true);
 model.exportImport.acknowledgedWarnings = model.exportImport.preview!.warnings.map(w => w.kind); await confirmRestore(model);
 model.store.putSavedItem({ ...Object.values(seed.snapshot().savedItems)[0]!, notes: 'later synthetic edit' });
 expect(() => previewPendingSessionRestore(model)).toThrow(/edits changed/i);
 service(new LocalStore()); await connectLocalService(model); expect(resolveLocalServiceConnection(model, 'service').ok).toBe(true);
 expect(model.store.snapshotPendingRestoreIntent()).toBeUndefined(); expect(model.store.listAuditReviewEvents()).toEqual(seed.snapshot().reviewEvents);
});
