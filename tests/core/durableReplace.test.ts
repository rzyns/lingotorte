import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore, ExportService, RestoreService } from '../../packages/storage/src';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence.ts';

import { makeSubtitleTrack, computeExportIntegrity } from '../../packages/domain/src';
import { DatabaseSync } from 'node:sqlite';
import { startLingotorteLocalService } from '../../apps/local-service/src/server.ts';
import { expectShadowEqual, openShadowed } from '../helpers/shadow.ts';

let sequence = 0;
function fixture() {
  const store = new LocalStore();
  const suffix = ++sequence; const itemId = `synthetic-item-${suffix}`; const occurrenceId = `synthetic-occurrence-${suffix}`; const cardId = `synthetic-card-${suffix}`; const reviewId = `synthetic-review-${suffix}`;
  const at = '2026-06-21T12:00:00.000Z';
  const sourceContext = { mediaId: 'media', mediaPath: '/synthetic/media.webm', mediaFingerprint: `sha256:${'a'.repeat(64)}` as const, subtitleTrackId: 'track', cueId: 'cue', timeRangeMs: { start: 0, end: 1000 }, tokenSpan: { startToken: 0, endToken: 1 }, charSpan: { start: 0, end: 5 } };
  store.putSubtitleTrack({ ...makeSubtitleTrack({ mediaId: 'media', language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: '/synthetic/track.srt', contentSha256: sourceContext.mediaFingerprint, isActive: true }), id: 'track', createdAt: at });
  store.putSavedItem({ id: itemId, kind: 'lexeme', language: 'pl', displayText: 'synthetic', createdAt: at, updatedAt: at });
  store.putSavedOccurrence({ id: occurrenceId, savedItemId: itemId, mediaId: 'media', cueId: 'cue', startMs: 0, endMs: 1000, selectionKind: 'lexeme', selectionText: 'synthetic', sourceContext, createdAt: at });
  store.putReviewCard({ id: cardId, savedItemId: itemId, savedOccurrenceId: occurrenceId, cardType: 'recognition', promptTemplate: 'synthetic', createdAt: at });
  store.putReviewCardState({ cardId, state: 'review', dueAt: at, stability: 2, difficulty: 3, elapsedDays: 1, scheduledDays: 1, reps: 1, lapses: 0, fsrsVersion: 'synthetic', updatedAt: at });
  store.addReviewEvent({ id: reviewId, cardId, rating: 'good', reviewedAt: at, createdAt: at, previousStateJson: '{"state":"new"}', nextStateJson: '{"state":"review"}' });
  store.addPracticeAttempt({ id: `synthetic-attempt-${suffix}`, cardId, mode: 'typed-input', result: 'pass', sourceContext, reviewedAt: at, createdAt: at, givenAnswer: 'synthetic', expectedAnswer: 'synthetic', responseMs: 123, eventLink: { reviewEventId: reviewId } });
  store.putMediaAsset({ id: 'media', title: 'synthetic', originalPath: '/synthetic/media.webm', contentSha256: sourceContext.mediaFingerprint, durationMs: 1000, container: 'webm', sizeBytes: 123, importedAt: at, lastSeenAt: at, privacyLabel: 'synthetic' });
  store.putImportJob({ id: 'synthetic-job', sourceKind: 'learner-export', status: 'completed', startedAt: at, completedAt: at, inputManifestJson: '{}' });
  store.addImportJobEvent({ id: 'synthetic-existing-job-event', jobId: 'synthetic-job', level: 'info', message: 'synthetic', createdAt: at });
  store.putProviderPolicy({ id: 'synthetic-policy', providerId: 'elevenlabs-scribe', enabled: false, requiresConfirmation: true, allowedDataClasses: [], createdAt: at, updatedAt: at });
  store.putExportJob({ id: 'synthetic-export', kind: 'learner-json-manifest', status: 'completed', startedAt: at, completedAt: at, destinationKind: 'browser-download', destinationLabel: 'synthetic', manifestSha256: sourceContext.mediaFingerprint, contentSummaryJson: '{}' });
  return store;
}
const empty = () => new ExportService(new LocalStore(), 'test').buildManifest();
function tableState(file: string) {
  const reader = new DatabaseSync(file);
  try {
    const names = reader.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    return Object.fromEntries(names.map(({ name }) => [name, reader.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY 1`).all()]));
  } finally { reader.close(); }
}
function request(db: SqliteLocalPersistence, manifest: unknown, mode: 'merge' | 'replace-active' = 'replace-active') {
  const expectedRevision = db.loadVersionedSnapshot().revision;
  const preview = db.previewRestore(manifest, mode, expectedRevision);
  return { manifest, mode, expectedRevision, confirmation: { confirmedAt: '2026-06-21T12:00:00.000Z', confirmReplace: mode === 'replace-active', confirmOverwrite: mode === 'merge', acknowledgedWarnings: preview.preview.warnings.map(w => w.kind) } };
}
describe('lt-04i durable active/audit boundary', () => {
  // lt-584.4: load no longer reads the blob; its only remaining reader is the one-time v12 backfill, which must fail closed
  // (and leave the file at v11) on a corrupt legacy blob. 'missing-audit' is no longer a fault: since v9 the history is
  // relational and overlaid, so a blob without learnerAudit is accepted (pre-v9 blobs never had one).
  it.each(['future-audit', 'corrupt-json'])('fails closed on upgraded snapshot %s', async fault => {
    const root = await mkdtemp(join(tmpdir(), 'lt-04i-corrupt-')); const file = join(root, 'state.db'); const db = openShadowed(file);
    try {
      db.saveSnapshot(fixture().snapshot()); const value = db.loadSnapshot(); db.close();
      const changed = { ...value, learnerAudit: { ...value.learnerAudit, version: 2 } };
      const raw = new DatabaseSync(file);
      raw.exec('ALTER TABLE legacy_snapshot_json RENAME TO lingotorte_snapshots; DELETE FROM schema_migration WHERE version=12; UPDATE lingotorte_schema SET schema_version=11;');
      raw.prepare('INSERT INTO lingotorte_snapshots VALUES (?, ?, ?, ?)').run('default', 11, fault === 'corrupt-json' ? '{bad-json' : JSON.stringify(changed), '2026-06-21T12:00:00.000Z'); raw.close();
      expect(() => openShadowed(file)).toThrow(/audit|snapshot/i);
      const check = new DatabaseSync(file);
      try { expect((check.prepare('SELECT version FROM schema_migration ORDER BY version DESC LIMIT 1').get() as { version: number }).version).toBe(11); } finally { check.close(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.each(['typed-input', 'multiple-choice', 'audio-recall', 'speaking', 'sentence-builder'] as const)('serialized %s replacement/reactivation survives file-backed reopen with exact provenance/link', async mode => {
    const root = await mkdtemp(join(tmpdir(), 'lt-04i-mode-')); const file = join(root, 'state.db'); let db = openShadowed(file);
    const seed = { ...fixture().snapshot() };
    delete seed.learnerAudit;
    const source = new LocalStore({ ...seed, practiceAttempts: seed.practiceAttempts.map(a => ({ ...a, mode })) });
    const manifest = RestoreService.validateManifest(JSON.parse(JSON.stringify(new ExportService(source, 'test').buildManifest())));
    try {
      const first = db.commitRestore(request(db, manifest));
      expect(first.receipt.effects.practiceAttempts.added).toBe(1);
      db.commitRestore(request(db, empty()));
      const restored = db.commitRestore(request(db, manifest));
      expect(restored.receipt.effects.practiceAttempts.reactivated).toBe(1);
      db.saveSnapshot(restored.snapshot, undefined, restored.revision);
      db.close(); db = openShadowed(file);
      expect(db.loadSnapshot().practiceAttempts).toEqual(source.snapshot().practiceAttempts);
      expect(db.listAuditPracticeAttempts()).toEqual(source.snapshot().practiceAttempts);
      expect(db.loadVersionedSnapshot().revision).toBe(`rev:${Number(restored.revision.slice(4)) + 1}`);
    } finally { db.close(); await rm(root, { recursive: true, force: true }); }
  });
  it('v8 forward membership migration recovers valid snapshot-only history and import-job events once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-04i-v8-')); const file = join(root, 'state.db');
    const store = fixture(); const original = store.snapshot(); const first = openShadowed(file); first.saveSnapshot(store.snapshot()); first.close();
    const raw = new DatabaseSync(file);
    const legacy = { ...original, learnerAudit: undefined, importJobEvents: [...original.importJobEvents, { id: 'synthetic-job-event', jobId: 'synthetic-job', level: 'info', message: 'synthetic', createdAt: '2026-06-21T12:00:00.000Z' }] };
    raw.exec('ALTER TABLE legacy_snapshot_json RENAME TO lingotorte_snapshots; DELETE FROM schema_migration WHERE version=12; DROP TABLE durable_state; DELETE FROM schema_migration WHERE version=11; ALTER TABLE saved_item DROP COLUMN meaning_source_json; DELETE FROM schema_migration WHERE version=10; DROP TABLE active_review_event; DROP TABLE active_practice_attempt; DROP TABLE learner_audit_format; DELETE FROM schema_migration WHERE version=9; UPDATE lingotorte_schema SET schema_version=8; DELETE FROM review_event; DELETE FROM practice_attempt;');
    raw.prepare('INSERT INTO lingotorte_snapshots VALUES (?, ?, ?, ?)').run('default', 8, JSON.stringify(legacy), '2026-06-21T12:00:00.000Z'); raw.close();
    try {
      for (let i = 0; i < 2; i++) {
        const db = openShadowed(file);
        try {
          expectShadowEqual(db);
          const snapshot = db.loadSnapshot();
          expect(snapshot.reviewEvents).toEqual(original.reviewEvents); expect(snapshot.practiceAttempts).toEqual(original.practiceAttempts);
          expect(snapshot.importJobEvents).toEqual(legacy.importJobEvents);
          expect(snapshot.subtitleTracks).toEqual(original.subtitleTracks);
          expect(db.listMigrations()).toHaveLength(12); expect(db.listAuditReviewEvents()).toEqual(original.reviewEvents);
        } finally { db.close(); }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects conflicting legacy audit before v9 membership/ledger initialization, permitting corrected forward retry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-04i-bad-v8-')); const file = join(root, 'state.db'); const store = fixture();
    const original = store.snapshot(); const first = openShadowed(file); first.saveSnapshot(store.snapshot()); first.close();
    let raw = new DatabaseSync(file);
    raw.exec('ALTER TABLE legacy_snapshot_json RENAME TO lingotorte_snapshots; DELETE FROM schema_migration WHERE version=12; DROP TABLE durable_state; DELETE FROM schema_migration WHERE version=11; ALTER TABLE saved_item DROP COLUMN meaning_source_json; DELETE FROM schema_migration WHERE version=10; DROP TABLE active_review_event; DROP TABLE active_practice_attempt; DROP TABLE learner_audit_format; DELETE FROM schema_migration WHERE version=9; UPDATE lingotorte_schema SET schema_version=8;');
    const legacy = { ...original, learnerAudit: undefined, reviewEvents: original.reviewEvents.map(e => ({ ...e, rating: 'again' })) };
    raw.prepare('INSERT INTO lingotorte_snapshots VALUES (?, ?, ?, ?)').run('default', 8, JSON.stringify(legacy), '2026-06-21T12:00:00.000Z'); raw.close();
    try {
      expect(() => openShadowed(file)).toThrow(/conflict/i);
      raw = new DatabaseSync(file);
      expect(raw.prepare("SELECT name FROM sqlite_master WHERE name='active_review_event'").get()).toBeUndefined();
      expect(raw.prepare('SELECT version FROM schema_migration WHERE version=9').get()).toBeUndefined();
      expect(raw.prepare('SELECT snapshot_json FROM lingotorte_snapshots').get()).toEqual({ snapshot_json: JSON.stringify(legacy) });
      raw.prepare('UPDATE lingotorte_snapshots SET snapshot_json=?').run(JSON.stringify({ ...original, learnerAudit: undefined })); raw.close();
      const retried = openShadowed(file); try { expectShadowEqual(retried); expect(retried.loadSnapshot().reviewEvents).toEqual(original.reviewEvents); } finally { retried.close(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('refuses future, checksum-corrupt, and missing initialized marker instead of repopulating membership', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-04i-ledger-')); const file = join(root, 'state.db');
    const first = openShadowed(file); first.close();
    try {
      let raw = new DatabaseSync(file); raw.prepare("INSERT INTO schema_migration VALUES (13, 'future', 'synthetic', 'synthetic', 'applied')").run(); raw.close();
      expect(() => openShadowed(file)).toThrow(/ledger|future/);
      raw = new DatabaseSync(file); raw.exec('DELETE FROM schema_migration WHERE version=13'); const checksum = (raw.prepare('SELECT checksum FROM schema_migration WHERE version=1').get() as { checksum: string }).checksum; raw.prepare('UPDATE schema_migration SET checksum=? WHERE version=1').run('bad'); raw.close();
      expect(() => openShadowed(file)).toThrow(/ledger/);
      raw = new DatabaseSync(file); raw.prepare('UPDATE schema_migration SET checksum=? WHERE version=1').run(checksum); raw.exec('DELETE FROM learner_audit_format'); raw.close();
      const opened = openShadowed(file); try { expect(() => opened.loadSnapshot()).toThrow(/initialized/); } finally { opened.close(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.each(['merge', 'replace-active'] as const)('rejects audit-only practice/review conflicts and stale revisions atomically (%s)', mode => {
    const db = openShadowed(':memory:');
    try {
      const store = fixture(); const original = new ExportService(store, 'test').buildManifest(); db.saveSnapshot(store.snapshot());
      const stale = request(db, original, mode); db.commitRestore(request(db, empty()));
      const before = db.loadVersionedSnapshot();
      expect(() => db.commitRestore(stale)).toThrow(/changed/);
      for (const name of ['reviewEvents', 'practiceAttempts'] as const) {
        const content = { ...original.content, [name]: original.content[name].map(record => name === 'reviewEvents' ? { ...record, rating: 'again' } : { ...record, givenAnswer: 'synthetic-conflict' }) };
        const bad = { ...original, content, integrity: computeExportIntegrity(content) };
        expect(() => db.previewRestore(bad, mode, before.revision)).toThrow(/immutable/i);
        expect(() => db.commitRestore({ ...stale, manifest: bad, expectedRevision: before.revision })).toThrow(/immutable/i);
        expect(db.loadVersionedSnapshot()).toEqual(before);
      }
    } finally { db.close(); }
  });
  it('nonempty replacement selects only manifest history; repeats idempotently and preserves unrelated state', () => {
    const db = openShadowed(':memory:');
    try {
      const old = fixture(); const incoming = fixture(); const before = old.snapshot(); db.saveSnapshot(old.snapshot());
      const manifest = new ExportService(incoming, 'test').buildManifest();
      const result = db.commitRestore(request(db, manifest));
      expect(result.snapshot.savedItems).toEqual(incoming.snapshot().savedItems);
      expect(result.snapshot.reviewEvents).toEqual(incoming.snapshot().reviewEvents);
      expect(result.snapshot.practiceAttempts).toEqual(incoming.snapshot().practiceAttempts);
      expect(result.snapshot.subtitleTracks).toEqual(before.subtitleTracks);
      expect(result.receipt.auditEffects.reviewEvents.appended).toBe(1);
      expect(result.receipt.auditEffects.reviewEvents.retained).toBe(2);
      expect(result.receipt.auditEffects.reviewEvents.inactiveAfter).toBe(1);
      const again = db.commitRestore(request(db, manifest));
      expect(again.snapshot).toEqual(result.snapshot); expect(again.revision).toBe(`rev:${Number(result.revision.slice(4)) + 1}`);
      expect(again.receipt.effects.reviewEvents.skippedIdentical).toBe(1);
      expect(again.receipt.auditEffects.reviewEvents.appended).toBe(0);
    } finally { db.close(); }
  });
  // lt-584.4: the blob is no longer written; the last write of a restore is the durable_state revision bump.
  it.each(['review_event', 'active_review_event', 'saved_item', 'durable_state'])('rolls back complete file-backed state on injected %s failure', async table => {
    const root = await mkdtemp(join(tmpdir(), 'lt-04i-rollback-')); const file = join(root, 'state.db'); let db = openShadowed(file);
    try {
      db.saveSnapshot(fixture().snapshot()); const before = db.loadVersionedSnapshot(); const input = request(db, new ExportService(fixture(), 'test').buildManifest());
      const beforeTables = tableState(file);
      const raw = new DatabaseSync(file);
      raw.exec(`CREATE TRIGGER fail_restore ${table === 'durable_state' ? 'AFTER UPDATE' : 'BEFORE INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`); raw.close();
      expect(() => db.commitRestore(input)).toThrow(/synthetic failure/);
      expect(db.loadVersionedSnapshot()).toEqual(before);
      expect(tableState(file)).toEqual(beforeTables);
      db.close(); db = openShadowed(file);
      expect(db.loadVersionedSnapshot()).toEqual(before);
      expect(tableState(file)).toEqual(beforeTables);
    } finally { db.close(); await rm(root, { recursive: true, force: true }); }
  });
  it('stages session-only retained audit on later explicit durable restore', () => {
    const session = fixture(); const before = session.snapshot(); const manifest = empty(); const service = new RestoreService(session);
    service.restore(manifest, { confirmedAt: '2026-06-21T12:00:00.000Z', confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: service.preview(manifest, 'replace-active').warnings.map(w => w.kind) });
    const db = openShadowed(':memory:');
    try {
      const input = request(db, manifest); const learnerAudit = session.snapshot().learnerAudit!;
      const preview = db.previewRestore(manifest, input.mode, input.expectedRevision, learnerAudit);
      const result = db.commitRestore({ ...input, learnerAudit, confirmation: { ...input.confirmation, acknowledgedWarnings: preview.preview.warnings.map(w => w.kind) } });
      expect(result.snapshot.reviewEvents).toEqual([]);
      expect(db.listAuditReviewEvents()).toEqual(before.reviewEvents); expect(db.listAuditPracticeAttempts()).toEqual(before.practiceAttempts);
      expect(result.receipt.auditEffects.reviewEvents.appended).toBe(1);
    } finally { db.close(); }
  });
  it('admits restore only through common request gate and returns authoritative acknowledged/readback state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-04i-service-')); let token = '';
    const service = await startLingotorteLocalService({ host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false }, { receiveCapability: (value: string) => { token = value; } });
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const state = async () => (await (await fetch(`${service.origin}/api/state`, { headers: { authorization: headers.authorization } })).json());
    try {
      const initial = await state(); expect(initial.restoreCapability).toBe('active-audit-restore-v1');
      const put = await fetch(`${service.origin}/api/state`, { method: 'PUT', headers, body: JSON.stringify({ snapshot: fixture().snapshot(), expectedRevision: initial.revision }) }); expect(put.status).toBe(200);
      const before = await state(); const body = { manifest: empty(), mode: 'replace-active', expectedRevision: before.revision };
      for (const route of ['preview', 'commit']) {
        const denied = await fetch(`${service.origin}/api/restore/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); expect(denied.status).toBe(401);
        const originDenied = await fetch(`${service.origin}/api/restore/${route}`, { method: 'POST', headers: { ...headers, origin: 'http://evil.invalid' }, body: JSON.stringify(body) }); expect(originDenied.status).toBe(403);
      }
      expect(await state()).toEqual(before);
      const previewResponse = await fetch(`${service.origin}/api/restore/preview`, { method: 'POST', headers, body: JSON.stringify(body) }); expect(previewResponse.status).toBe(200);
      const preview = await previewResponse.json(); expect(await state()).toEqual(before);
      const commitBody = { ...body, confirmation: { confirmedAt: '2026-06-21T12:00:00.000Z', confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: preview.preview.warnings.map((w: { kind: string }) => w.kind) } };
      const committedResponse = await fetch(`${service.origin}/api/restore/commit`, { method: 'POST', headers, body: JSON.stringify(commitBody) }); expect(committedResponse.status).toBe(200);
      const committed = await committedResponse.json(); const after = await state();
      expect(after.revision).toBe(committed.revision); expect(after.snapshot).toEqual(committed.snapshot);
      expect(after.snapshot.reviewEvents).toEqual([]); expect(after.snapshot.learnerAudit.reviewEvents).toEqual(before.snapshot.reviewEvents);
      const stale = await fetch(`${service.origin}/api/state`, { method: 'PUT', headers, body: JSON.stringify({ snapshot: before.snapshot, expectedRevision: before.revision }) }); expect(stale.status).toBe(409);
      const retry = await fetch(`${service.origin}/api/restore/commit`, { method: 'POST', headers, body: JSON.stringify(commitBody) }); expect(retry.status).toBe(409);
      expect(await state()).toEqual(after);
    } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
  });
  it('serializes retained session audit through hydration without exporting it', () => {
    const store = fixture(); const before = store.snapshot(); const manifest = empty(); const service = new RestoreService(store);
    service.restore(manifest, { confirmedAt: '2026-06-21T12:00:00.000Z', confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: service.preview(manifest, 'replace-active').warnings.map(w => w.kind) });
    const hydrated = new LocalStore(JSON.parse(JSON.stringify(store.snapshot())));
    expect(hydrated.snapshotRestoreAudit()).toEqual({ reviewEvents: before.reviewEvents, practiceAttempts: before.practiceAttempts });
    expect(new ExportService(hydrated, 'test').buildManifest().content.reviewEvents).toEqual([]);
    expect(hydrated.snapshot().learnerAudit?.version).toBe(1);
  });
  it('empty replacement -> ordinary save -> file-backed close/reopen retains exact audit and empty active membership', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-04i-')); const file = join(root, 'state.db');
    let db = openShadowed(file);
    try {
      const store = fixture(); const before = store.snapshot(); db.saveSnapshot(store.snapshot());
      const result = db.commitRestore(request(db, empty()));
      expect(result.receipt.effects.reviewEvents.removedFromActive).toBe(before.reviewEvents.length);
      expect(result.receipt.auditEffects.practiceAttempts.inactiveAfter).toBe(before.practiceAttempts.length);
      expect(result.snapshot.reviewEvents).toEqual([]); expect(result.snapshot.practiceAttempts).toEqual([]);
      db.saveSnapshot(result.snapshot, undefined, result.revision);
      db.close(); db = openShadowed(file);
      const actual = db.loadVersionedSnapshot();
      for (const name of ['mediaAssets', 'subtitleTracks', 'cues', 'transcriptWordTimings', 'mediaObservations', 'importJobs', 'importJobEvents', 'exportJobs', 'providerPolicies'] as const) expect(actual.snapshot[name]).toEqual(before[name]);
      expect(actual.snapshot.reviewEvents).toEqual([]); expect(actual.snapshot.practiceAttempts).toEqual([]);
      for (const name of ['savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates'] as const) expect(actual.snapshot[name]).toEqual({});
      expect(db.listAuditReviewEvents()).toEqual(before.reviewEvents); expect(db.listAuditPracticeAttempts()).toEqual(before.practiceAttempts);
      expect(actual.revision).toBe(`rev:${Number(result.revision.slice(4)) + 1}`);
      expect(db.listReviewEvents()).toEqual([]); expect(db.listPracticeAttempts()).toEqual([]);
    } finally { db.close(); await rm(root, { recursive: true, force: true }); }
  });
  it('ordinary omission preserves both active histories; inactive IDs require explicit restore', () => {
    const db = openShadowed(':memory:');
    try {
      const store = fixture(); const original = store.snapshot(); const manifest = new ExportService(store, 'test').buildManifest(); db.saveSnapshot(store.snapshot());
      db.saveSnapshot({ ...original, reviewEvents: [], practiceAttempts: [] });
      expect(db.loadSnapshot().reviewEvents).toEqual(original.reviewEvents); expect(db.loadSnapshot().practiceAttempts).toEqual(original.practiceAttempts);
      const result = db.commitRestore(request(db, empty())); const before = db.loadVersionedSnapshot();
      expect(() => db.saveSnapshot(original, undefined, result.revision)).toThrow(/explicit restore/i);
      expect(db.loadVersionedSnapshot()).toEqual(before);
      const reactivated = db.commitRestore(request(db, manifest));
      expect(reactivated.receipt.effects.reviewEvents.reactivated).toBe(original.reviewEvents.length);
      expect(reactivated.receipt.effects.practiceAttempts.reactivated).toBe(original.practiceAttempts.length);
      expect(reactivated.receipt.auditEffects.reviewEvents.appended).toBe(0);
      expect(reactivated.snapshot.reviewEvents).toEqual(original.reviewEvents);
    } finally { db.close(); }
  });
});
