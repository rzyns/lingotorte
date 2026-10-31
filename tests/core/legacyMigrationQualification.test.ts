// lt-3f1: populated synthetic legacy SQLite migration qualification (contract §5, §7 T11–T14).
// Fixtures are built from the independently frozen v1–v7 migration SQL; only test-owned temp files are touched.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { ExportService, LocalStore, RestoreService } from '../../packages/storage/src';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence';
import type { PracticeAttempt, PracticeMode, ReviewEvent, ImportJobEvent } from '../../packages/domain/src';
import { expectShadowEqual, openShadowed } from '../helpers/shadow.ts';

// File-backed SQLite migrations do real disk I/O (~0.3-0.5 s per test alone); under full-suite parallel load
// they occasionally exceeded vitest's default 5 s (observed on main 8d82a99, 2/3 runs). Raise the budget only.
vi.setConfig({ testTimeout: 30_000 });

type Migration = { version: number; name: string; sql: string; checksum: string };
const frozen = JSON.parse(readFileSync(new URL('../fixtures/sqlite-v7-migrations.json', import.meta.url), 'utf8')) as { migrations: Migration[] };
const AT = '2026-06-21T12:00:00.000Z';
const SECRET = 'synthetic-private-answer-zq9';
const NOTE = 'synthetic-private-note-zq9';
const CUE_TEXT = 'synthetic private cue text zq9';
const MEDIA_PATH = '/synthetic/private-zq9/media.webm';
const roots: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function tempFile(name = 'state.sqlite') { const root = mkdtempSync(join(tmpdir(), 'lt-3f1-')); roots.push(root); return join(root, name); }

const sourceContext = { mediaId: 'media-1', mediaPath: MEDIA_PATH, mediaFingerprint: `sha256:${'b'.repeat(64)}` as const, subtitleTrackId: 'track-1', cueId: 'cue-1', timeRangeMs: { start: 0, end: 1000 }, tokenSpan: { startToken: 0, endToken: 2 }, charSpan: { start: 0, end: 10 } };
const review = (id: string, rating: ReviewEvent['rating'] = 'good', extra: Partial<ReviewEvent> = {}): ReviewEvent => ({ id, cardId: 'card-1', reviewedAt: AT, rating, previousStateJson: '{"state":"new"}', nextStateJson: `{"state":"review","id":"${id}"}`, createdAt: AT, ...extra });
const attempt = (id: string, mode: PracticeMode, link?: string, extra: Partial<PracticeAttempt> = {}, omit: readonly ('givenAnswer' | 'responseMs')[] = []): PracticeAttempt => {
  const value: Record<string, unknown> = { id, cardId: 'card-1', mode, result: 'pass', givenAnswer: SECRET, expectedAnswer: 'expected', responseMs: 900, sourceContext, reviewedAt: AT, createdAt: AT, eventLink: link ? { reviewEventId: link } : {}, ...extra };
  for (const key of omit) delete value[key];
  return value as PracticeAttempt;
};
const jobEvent = (id: string): ImportJobEvent => ({ id, jobId: 'job-1', level: 'info', message: `synthetic ${id}`, createdAt: AT });

/** Learner + unrelated collections as an old binary would have serialized them (no learnerAudit section). */
function legacySnapshot(history: { reviewEvents: ReviewEvent[]; practiceAttempts: PracticeAttempt[]; importJobEvents: ImportJobEvent[] }) {
  const store = new LocalStore();
  store.putMediaAsset({ id: 'media-1', title: 'synthetic', originalPath: MEDIA_PATH, contentSha256: sourceContext.mediaFingerprint, durationMs: 1000, container: 'webm', sizeBytes: 10, importedAt: AT, lastSeenAt: AT, privacyLabel: 'synthetic' });
  store.addMediaObservation({ id: 'obs-1', mediaId: 'media-1', path: MEDIA_PATH, sizeBytes: 10, mtimeMs: 1, contentSha256: sourceContext.mediaFingerprint, observedAt: AT, exists: true });
  store.putSubtitleTrack({ id: 'track-1', mediaId: 'media-1', language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: '/synthetic/track.srt', contentSha256: sourceContext.mediaFingerprint, trackVersion: 1, transcriptStatus: 'approved', transcriptSourceKind: 'synthetic-fixture', provenance: { kind: 'synthetic' } as never, isActive: true, createdAt: AT });
  store.putCue({ id: 'cue-1', trackId: 'track-1', cueIndex: 0, startMs: 0, endMs: 1000, text: CUE_TEXT, normalizedText: CUE_TEXT, textSha256: sourceContext.mediaFingerprint, createdAt: AT });
  store.putSavedItem({ id: 'item-1', kind: 'sentence', language: 'pl', displayText: 'Ala ma kota', notes: NOTE, createdAt: AT, updatedAt: AT });
  store.putSavedOccurrence({ id: 'occ-1', savedItemId: 'item-1', mediaId: 'media-1', cueId: 'cue-1', startMs: 0, endMs: 1000, selectionKind: 'sentence', selectionText: 'Ala ma kota', sourceContext, createdAt: AT });
  store.putReviewCard({ id: 'card-1', savedItemId: 'item-1', savedOccurrenceId: 'occ-1', cardType: 'production', promptTemplate: 'synthetic', createdAt: AT });
  store.putReviewCardState({ cardId: 'card-1', state: 'review', dueAt: AT, stability: 2.5, difficulty: 4.25, elapsedDays: 1, scheduledDays: 3, reps: 2, lapses: 0, lastReviewedAt: AT, fsrsVersion: 'synthetic', updatedAt: AT });
  store.putImportJob({ id: 'job-1', sourceKind: 'subtitle', status: 'completed', startedAt: AT, completedAt: AT, inputManifestJson: '{}' });
  store.putExportJob({ id: 'export-1', kind: 'learner-json-manifest', status: 'completed', startedAt: AT, completedAt: AT, destinationKind: 'browser-download', destinationLabel: 'synthetic', manifestSha256: sourceContext.mediaFingerprint, contentSummaryJson: '{}' });
  store.putProviderPolicy({ id: 'policy-1', providerId: 'elevenlabs-scribe', enabled: false, requiresConfirmation: true, allowedDataClasses: [], createdAt: AT, updatedAt: AT });
  const snapshot: Record<string, unknown> = { ...store.snapshot(), ...history };
  delete snapshot.learnerAudit;
  return snapshot;
}

function buildLegacy(file: string, upTo: 4 | 7, snapshot: Record<string, unknown>, tables: { reviews?: ReviewEvent[]; attempts?: PracticeAttempt[]; jobEvents?: ImportJobEvent[] } = {}) {
  const db = new DatabaseSync(file);
  try {
    db.exec("CREATE TABLE schema_migration (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL, checksum TEXT NOT NULL, result TEXT NOT NULL CHECK(result = 'applied'))");
    for (const m of frozen.migrations.filter(m => m.version <= upTo)) {
      expect(createHash('sha256').update(m.sql).digest('hex')).toBe(m.checksum);
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migration VALUES (?, ?, ?, ?, ?)').run(m.version, m.name, '2026-01-01T00:00:00.000Z', m.checksum, 'applied');
    }
    db.prepare('INSERT INTO lingotorte_snapshots VALUES (?, ?, ?, ?)').run('default', upTo, JSON.stringify(snapshot), AT);
    // Projection rows an old binary also wrote (v2/v4 tables), to check they survive untouched.
    db.prepare('INSERT INTO media_asset VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('media-1', 'synthetic', MEDIA_PATH, sourceContext.mediaFingerprint, 1000, 'webm', 10, AT, AT, 'synthetic');
    db.prepare('INSERT INTO saved_item VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('item-1', 'sentence', 'pl', 'Ala ma kota', null, NOTE, AT, AT, null);
    if (upTo === 7) {
      const r = db.prepare('INSERT INTO review_event VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const e of tables.reviews ?? []) r.run(e.id, e.cardId, e.reviewedAt, e.rating, e.responseMs ?? null, e.previousStateJson, e.nextStateJson, e.deviceId ?? null, e.createdAt);
      const p = db.prepare('INSERT INTO practice_attempt VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const a of tables.attempts ?? []) p.run(a.id, a.cardId, a.mode, a.result, a.givenAnswer ?? null, a.expectedAnswer ?? null, a.responseMs ?? null, JSON.stringify(a.sourceContext), a.reviewedAt, a.createdAt, JSON.stringify(a.eventLink));
      const j = db.prepare('INSERT INTO import_job_event VALUES (?, ?, ?, ?, ?, ?)');
      for (const e of tables.jobEvents ?? []) j.run(e.id, e.jobId, e.level, e.message, e.createdAt, e.dataJson ?? null);
      db.prepare("INSERT INTO provider_policy VALUES ('policy-1', 'elevenlabs-scribe', 0, '[]', 1, NULL, ?, ?)").run(AT, AT);
    }
  } finally { db.close(); }
}

function tableState(file: string) {
  const reader = new DatabaseSync(file);
  try {
    const names = reader.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    const tables = reader.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    return { objects: names.map(n => n.name), rows: Object.fromEntries(tables.map(({ name }) => [name, reader.prepare(`SELECT * FROM "${name}" ORDER BY 1`).all()])) };
  } finally { reader.close(); }
}
const ledgerVersions = (file: string) => { const r = new DatabaseSync(file); try { return (r.prepare('SELECT version FROM schema_migration ORDER BY version').all() as { version: number }[]).map(x => x.version); } finally { r.close(); } };
const sortById = <T extends { id: string }>(xs: readonly T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
function expectRedacted(error: unknown) {
  const message = String((error as Error)?.message ?? error);
  for (const secret of [SECRET, NOTE, CUE_TEXT, MEDIA_PATH, 'private-zq9']) expect(message).not.toContain(secret);
  return message;
}
function refusal(fn: () => unknown): string { try { fn(); } catch (error) { return expectRedacted(error); } throw new Error('expected refusal'); }
function restoreRequest(db: SqliteLocalPersistence, manifest: unknown, mode: 'merge' | 'replace-active' = 'replace-active') {
  const expectedRevision = db.loadVersionedSnapshot().revision;
  const preview = db.previewRestore(manifest, mode, expectedRevision);
  return { manifest, mode, expectedRevision, confirmation: { confirmedAt: AT, confirmReplace: mode === 'replace-active', confirmOverwrite: mode === 'merge', acknowledgedWarnings: preview.preview.warnings.map(w => w.kind) } };
}
function withoutAudit<T extends { learnerAudit?: unknown }>(snapshot: T): T { const copy = { ...snapshot }; delete copy.learnerAudit; return copy; }
const UNRELATED = ['mediaAssets', 'mediaObservations', 'subtitleTracks', 'cues', 'transcriptWordTimings', 'savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates', 'importJobs', 'exportJobs', 'providerPolicies'] as const;

// ---------- fixtures ----------
const ALL_MODES = ['typed-input', 'multiple-choice', 'audio-recall', 'speaking', 'sentence-builder'] as const satisfies readonly PracticeMode[];
function preV5() {
  // Pre-v5: no event tables existed; all history lived only in the snapshot JSON.
  const reviewEvents = [review('r-a', 'good', { responseMs: 1500, deviceId: 'device-1' }), review('r-b', 'again')];
  const practiceAttempts = ALL_MODES.map((mode, i) => attempt(`p-${mode}`, mode, i % 2 === 0 ? 'r-a' : undefined, {}, i === 1 ? ['givenAnswer', 'responseMs'] : []));
  const importJobEvents = [jobEvent('e-a'), { ...jobEvent('e-b'), level: 'warn' as const, dataJson: '{"k":1}' }];
  return { reviewEvents, practiceAttempts, importJobEvents };
}
function mixedV7() {
  // v5/v7 mixed: some history in both (identical), some table-only (old replay), some snapshot-only.
  const both = { r: review('r-both'), p: attempt('p-both', 'typed-input', 'r-both'), e: jobEvent('e-both') };
  const tableOnly = { r: review('r-table', 'hard'), p: attempt('p-table', 'speaking', 'r-table'), e: jobEvent('e-table') };
  const snapOnly = { r: review('r-snap', 'easy'), p: attempt('p-snap', 'multiple-choice'), e: jobEvent('e-snap') };
  return {
    snapshot: { reviewEvents: [both.r, snapOnly.r], practiceAttempts: [both.p, snapOnly.p], importJobEvents: [both.e, snapOnly.e] },
    tables: { reviews: [both.r, tableOnly.r], attempts: [both.p, tableOnly.p, attempt('p-audio', 'audio-recall')], jobEvents: [both.e, tableOnly.e] },
    union: { reviews: [both.r, tableOnly.r, snapOnly.r], attempts: [both.p, tableOnly.p, attempt('p-audio', 'audio-recall'), snapOnly.p], jobEvents: [both.e, tableOnly.e, snapOnly.e] },
  };
}

describe('lt-3f1 T11 — populated legacy upgrade', () => {
  it('pre-v5 snapshot-only history (all modes, linked/unlinked) is backfilled once, active, and stable across two reopens', () => {
    const file = tempFile(); const h = preV5(); const legacy = legacySnapshot(h);
    buildLegacy(file, 4, legacy); const pre = tableState(file);
    let afterFirst: ReturnType<typeof tableState> | undefined; let revision = '';
    for (let i = 0; i < 3; i++) {
      const db = openShadowed(file);
      try {
        expectShadowEqual(db);
        const s = db.loadVersionedSnapshot();
        expect(sortById(s.snapshot.reviewEvents)).toEqual(sortById(h.reviewEvents));
        expect(sortById(s.snapshot.practiceAttempts)).toEqual(sortById(h.practiceAttempts));
        expect(sortById(db.listAuditPracticeAttempts())).toEqual(sortById(h.practiceAttempts));
        expect(sortById(s.snapshot.importJobEvents)).toEqual(sortById(h.importJobEvents));
        for (const name of UNRELATED) expect(s.snapshot[name], name).toEqual(legacy[name]);
        expect(s.snapshot.practiceAttempts.find(a => a.id === 'p-typed-input')?.eventLink).toEqual({ reviewEventId: 'r-a' });
        expect(s.snapshot.practiceAttempts.find(a => a.id === 'p-multiple-choice')?.eventLink).toEqual({});
        expect(db.status().learnerAuditRecovery).toMatchObject({ snapshotOnlyReviews: 2, tableOnlyReviews: 0, snapshotOnlyAttempts: 5, tableOnlyAttempts: 0, orphanReviews: 0, orphanAttempts: 0, unresolvedAttemptLinks: 0 });
        expect(db.listMigrations().map(m => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
        if (i === 0) revision = s.revision; else expect(s.revision).toBe(revision);
      } finally { db.close(); }
      const state = tableState(file);
      if (i === 0) afterFirst = state; else expect(state).toEqual(afterFirst); // no second backfill / marker rewrite
    }
    // Historical ledger rows and pre-existing projection rows are preserved byte-for-byte.
    expect(afterFirst!.rows.schema_migration!.slice(0, 4)).toEqual(pre.rows.schema_migration);
    expect(afterFirst!.rows.media_asset).toEqual(pre.rows.media_asset);
    // v10 only adds the nullable meaning_source_json column; every legacy value is unchanged.
    expect(afterFirst!.rows.saved_item).toEqual(pre.rows.saved_item!.map(row => ({ ...row, meaning_source_json: null })));
    expect(afterFirst!.rows.import_job_event).toHaveLength(2);
  });

  it('v7 mixed snapshot + table history merges identical IDs, recovers both one-sided sets, and preserves unrelated collections', () => {
    const file = tempFile(); const f = mixedV7(); const legacy = legacySnapshot(f.snapshot);
    buildLegacy(file, 7, legacy, f.tables); const pre = tableState(file);
    const opened: ReturnType<typeof tableState>[] = [];
    for (let i = 0; i < 3; i++) {
      const db = openShadowed(file);
      try {
        expectShadowEqual(db);
        const s = db.loadSnapshot();
        expect(sortById(s.reviewEvents)).toEqual(sortById(f.union.reviews));
        expect(sortById(s.practiceAttempts)).toEqual(sortById(f.union.attempts));
        expect(sortById(s.importJobEvents)).toEqual(sortById(f.union.jobEvents));
        expect(sortById(db.listAuditReviewEvents())).toEqual(sortById(f.union.reviews));
        for (const name of UNRELATED) expect(s[name], name).toEqual(legacy[name]);
        expect(db.status().learnerAuditRecovery).toMatchObject({ snapshotOnlyReviews: 1, tableOnlyReviews: 1, snapshotOnlyAttempts: 1, tableOnlyAttempts: 2 });
      } finally { db.close(); }
      opened.push(tableState(file));
    }
    expect(opened[1]).toEqual(opened[0]); expect(opened[2]).toEqual(opened[0]);
    // Legacy table rows are never rewritten, only appended to.
    for (const table of ['review_event', 'practice_attempt', 'import_job_event', 'media_asset', 'saved_item', 'provider_policy']) {
      // v10 adds a nullable saved_item.meaning_source_json column; legacy rows keep every value and gain NULL.
      for (const row of pre.rows[table]!) expect(opened[0]!.rows[table]!).toContainEqual(table === 'saved_item' ? { ...row, meaning_source_json: null } : row);
    }
    expect(opened[0]!.rows.schema_migration!.slice(0, 7)).toEqual(pre.rows.schema_migration);
  });

  it('reopening twice does not reactivate intentionally inactive (replaced) legacy audit', () => {
    const file = tempFile(); const f = mixedV7(); buildLegacy(file, 7, legacySnapshot(f.snapshot), f.tables);
    let db = openShadowed(file);
    let committed: string;
    try {
      const result = db.commitRestore(restoreRequest(db, new ExportService(new LocalStore(), 'test').buildManifest()));
      expect(result.snapshot.reviewEvents).toEqual([]); expect(result.snapshot.practiceAttempts).toEqual([]);
      committed = result.revision;
      db.saveSnapshot(result.snapshot, undefined, result.revision); // ordinary save after replace
    } finally { db.close(); }
    for (let i = 0; i < 2; i++) {
      db = openShadowed(file);
      try {
        const s = db.loadVersionedSnapshot();
        expect(s.revision).toBe(`rev:${Number(committed.slice(4)) + 1}`);
        expect(s.snapshot.reviewEvents).toEqual([]); expect(s.snapshot.practiceAttempts).toEqual([]);
        expect(db.listReviewEvents()).toEqual([]); expect(db.listPracticeAttempts()).toEqual([]);
        expect(sortById(db.listAuditReviewEvents())).toEqual(sortById(f.union.reviews));
        expect(sortById(db.listAuditPracticeAttempts())).toEqual(sortById(f.union.attempts));
        expect(sortById(s.snapshot.importJobEvents)).toEqual(sortById(f.union.jobEvents));
      } finally { db.close(); }
    }
  });
});

describe('lt-584.4 v12 — tables become authoritative', () => {
  it('a populated v10 database (blob authoritative, entity tables stale) migrates through v11 and v12 to tables equal to its blob, at rev:1', () => {
    const file = tempFile(); const h = preV5();
    const blob = { ...legacySnapshot(h), transcriptWordTimings: { 'wt-1': { id: 'wt-1', trackId: 'track-1', cueId: 'cue-1', wordIndex: 0, charStart: 0, charEnd: 9, text: 'synthetic', normalizedText: 'synthetic', startMs: 0, endMs: 400,
      confidence: 0.5, sourceKind: 'provider-word-timing', engine: 'synthetic', modelName: 'synthetic', createdAt: AT } } } as Record<string, unknown>;
    // Current build writes the history tables; then rewind the file to what a v10 binary left on disk.
    const seed = SqliteLocalPersistence.open(file); seed.saveSnapshot(new LocalStore(blob as never).snapshot(), AT); const full = seed.loadSnapshot(); seed.close();
    const v10Blob = { ...full };
    const raw = new DatabaseSync(file);
    raw.exec('DROP TABLE learner_operation_state; DROP TABLE learner_operation_receipt; DROP TABLE operation_owned_row; DELETE FROM schema_migration WHERE version=13; ALTER TABLE legacy_snapshot_json RENAME TO lingotorte_snapshots; DELETE FROM schema_migration WHERE version=12; DROP TABLE durable_state; DELETE FROM schema_migration WHERE version=11; UPDATE lingotorte_schema SET schema_version=10;');
    raw.prepare('INSERT INTO lingotorte_snapshots VALUES (?, ?, ?, ?)').run('default', 10, JSON.stringify(v10Blob), AT);
    // A v10 binary rewrote these from the blob on every save; leave them stale/empty so only the v12 backfill can fill them.
    for (const table of ['media_asset', 'media_file_observation', 'subtitle_track', 'cue', 'transcript_word_timing', 'saved_item', 'saved_occurrence', 'review_card', 'review_card_state', 'export_job', 'provider_policy', 'import_job']) raw.exec(`DELETE FROM ${table}`);
    raw.close();
    expect(ledgerVersions(file)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (let i = 0; i < 2; i++) {
      const db = openShadowed(file);
      try {
        expect(db.listMigrations().map(m => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
        expect(db.status()).toMatchObject({ schemaVersion: 13, revision: 'rev:1' });
        expectShadowEqual(db);
        const loaded = db.loadSnapshot();
        for (const name of ['reviewEvents', 'practiceAttempts', 'importJobEvents', 'mediaObservations'] as const) expect(sortById(loaded[name] as { id: string }[]), name).toEqual(sortById(v10Blob[name] as { id: string }[]));
        for (const name of UNRELATED) if (name !== 'mediaObservations') expect(loaded[name], name).toEqual(v10Blob[name]);
        expect(sortById(loaded.learnerAudit!.reviewEvents)).toEqual(sortById(v10Blob.learnerAudit!.reviewEvents));
        expect(sortById(loaded.learnerAudit!.practiceAttempts)).toEqual(sortById(v10Blob.learnerAudit!.practiceAttempts));
        expect(Object.keys(loaded.transcriptWordTimings)).toEqual(['wt-1']);
        expect(db.loadTranscripts('media-1').tracks['track-1']!.cues.map(c => c.id)).toEqual(['cue-1']);
      } finally { db.close(); }
    }
    // The blob is kept (renamed) as rollback evidence and never rewritten.
    const after = tableState(file);
    expect(after.objects).toContain('legacy_snapshot_json'); expect(after.objects).not.toContain('lingotorte_snapshots');
    expect(after.rows.legacy_snapshot_json).toEqual([{ snapshot_key: 'default', schema_version: 11, snapshot_json: JSON.stringify(v10Blob), updated_at: AT }]);
  });
});

describe('lt-3f1 T12 — bad or failed upgrade fails closed and retries forward', () => {
  it.each(['reviewEvents', 'practiceAttempts', 'importJobEvents'] as const)('conflicting same-ID legacy %s payload refuses v9 with a redacted diagnostic and leaves sources intact', name => {
    const file = tempFile(); const f = mixedV7();
    const snapshot = { ...f.snapshot };
    if (name === 'reviewEvents') snapshot.reviewEvents = [review('r-table', 'again'), ...f.snapshot.reviewEvents];
    if (name === 'practiceAttempts') snapshot.practiceAttempts = [attempt('p-table', 'speaking', 'r-table', { givenAnswer: `${SECRET}-changed` }), ...f.snapshot.practiceAttempts];
    if (name === 'importJobEvents') snapshot.importJobEvents = [{ ...jobEvent('e-table'), message: 'changed' }, ...f.snapshot.importJobEvents];
    buildLegacy(file, 7, legacySnapshot(snapshot), f.tables); const pre = tableState(file);
    const message = refusal(() => openShadowed(file));
    expect(message).toMatch(/conflict/i);
    expect(message).toMatch(name === 'reviewEvents' ? /review/i : name === 'practiceAttempts' ? /practice/i : /import-job/i);
    // Contract §5.2: redacted collection/ID diagnostic — the conflicting record ID is named, its payload is not.
    expect(message).toContain(name === 'reviewEvents' ? 'r-table' : name === 'practiceAttempts' ? 'p-table' : 'e-table');
    const after = tableState(file);
    expect(after.objects).not.toContain('learner_audit_format'); expect(after.objects).not.toContain('active_review_event');
    expect(ledgerVersions(file)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const table of ['lingotorte_snapshots', 'review_event', 'practice_attempt', 'import_job_event', 'media_asset', 'saved_item', 'provider_policy']) expect(after.rows[table], table).toEqual(pre.rows[table]);
    // Second attempt refuses identically (no partial state accumulated).
    refusal(() => openShadowed(file));
    expect(tableState(file)).toEqual(after);
  });

  it.each([
    ['unparseable JSON', '{not-json'],
    ['non-object root', '[]'],
    ['history not an array', JSON.stringify({ mediaAssets: {}, reviewEvents: { 'r-1': {} } })],
    ['invalid history payload', JSON.stringify({ mediaAssets: {}, reviewEvents: [{ id: 'r-x', rating: 'not-a-rating', notes: NOTE }] })],
  ])('corrupt legacy snapshot (%s) refuses without normalizing to an empty successful database', (_, json) => {
    const file = tempFile(); buildLegacy(file, 4, legacySnapshot(preV5()));
    const raw = new DatabaseSync(file); raw.prepare('UPDATE lingotorte_snapshots SET snapshot_json=?').run(json); raw.close();
    refusal(() => openShadowed(file));
    const after = tableState(file);
    expect(after.objects).not.toContain('learner_audit_format');
    expect(ledgerVersions(file)).not.toContain(9);
    expect(after.rows.lingotorte_snapshots).toEqual([expect.objectContaining({ snapshot_json: json })]);
    expect(after.rows.review_event).toEqual([]);
  });

  it.each([
    ['changed historical checksum', (db: DatabaseSync) => db.prepare("UPDATE schema_migration SET checksum='0' WHERE version=3").run()],
    ['changed historical name', (db: DatabaseSync) => db.prepare("UPDATE schema_migration SET name='renamed' WHERE version=2").run()],
    ['ledger gap', (db: DatabaseSync) => db.prepare('DELETE FROM schema_migration WHERE version=2').run()],
    ['schema/ledger disagreement', (db: DatabaseSync) => db.prepare('UPDATE lingotorte_schema SET schema_version=3').run()],
  ])('pre-v5 fixture with %s refuses before any forward migration', (_, mutate) => {
    const file = tempFile(); buildLegacy(file, 4, legacySnapshot(preV5()));
    const raw = new DatabaseSync(file); mutate(raw); raw.close(); const pre = tableState(file);
    expect(refusal(() => openShadowed(file))).toMatch(/ledger|schema/i);
    expect(tableState(file)).toEqual(pre);
  });

  it.each([
    ['future ledger row', (db: DatabaseSync) => db.prepare("INSERT INTO schema_migration VALUES (14, 'future_migration', ?, 'f', 'applied')").run(AT)],
    ['future schema marker', (db: DatabaseSync) => db.prepare('UPDATE lingotorte_schema SET schema_version=14').run()],
  ])('upgraded populated DB with %s is refused at open without mutation (no in-place downgrade)', (_, mutate) => {
    const file = tempFile(); const f = mixedV7(); buildLegacy(file, 7, legacySnapshot(f.snapshot), f.tables);
    openShadowed(file).close();
    const raw = new DatabaseSync(file); mutate(raw); raw.close(); const pre = tableState(file);
    expect(refusal(() => openShadowed(file))).toMatch(/future|ledger|unsupported/i);
    expect(tableState(file)).toEqual(pre);
  });

  // lt-584.4: the blob is retired at v12 and no longer read on load/save; a future-schema blob row is refused by the
  // migration that still reads it, before any forward step mutates the file.
  it('future snapshot schema row is refused at migration without mutation', () => {
    const file = tempFile(); const f = mixedV7(); buildLegacy(file, 7, legacySnapshot(f.snapshot), f.tables);
    const raw = new DatabaseSync(file); raw.prepare('UPDATE lingotorte_snapshots SET schema_version=13').run(); raw.close(); const pre = tableState(file);
    // v8 commits before v9 reads the blob; everything from v9 on rolls back.
    expect(refusal(() => openShadowed(file))).toMatch(/unsupported|future/i);
    const after = tableState(file);
    expect(ledgerVersions(file)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(after.rows.lingotorte_snapshots).toEqual(pre.rows.lingotorte_snapshots);
    expect(after.objects).not.toContain('learner_audit_format');
    refusal(() => openShadowed(file)); expect(tableState(file)).toEqual(after);
  });

  it.each([
    ['after audit backfill (review_event insert)', 'CREATE TRIGGER inject BEFORE INSERT ON review_event BEGIN SELECT RAISE(ABORT, \'synthetic failure\'); END'],
    ['after import-job backfill', 'CREATE TRIGGER inject BEFORE INSERT ON import_job_event BEGIN SELECT RAISE(ABORT, \'synthetic failure\'); END'],
    // lt-584.4: v9 no longer rewrites the blob; the last v9 step before ledger success is the marker insert.
    ['after marker insert (before ledger success)', 'CREATE TRIGGER inject AFTER INSERT ON schema_migration WHEN NEW.version = 9 BEGIN SELECT RAISE(ABORT, \'synthetic failure\'); END'],
  ])('injected v9 failure %s leaves no partial marker/membership/backfill; forward retry backfills once', (_, trigger) => {
    const file = tempFile(); const f = mixedV7(); buildLegacy(file, 7, legacySnapshot(f.snapshot), f.tables);
    // Bring the fixture to v8 first so the injected failure isolates v9.
    let raw = new DatabaseSync(file); raw.exec(trigger.replace('inject', 'inject_probe').replace(/BEFORE (INSERT|UPDATE) ON \w+/, 'BEFORE INSERT ON schema_migration WHEN NEW.version = 9')); raw.close();
    expect(() => openShadowed(file)).toThrow(/synthetic failure/);
    raw = new DatabaseSync(file); raw.exec('DROP TRIGGER inject_probe'); raw.exec(trigger); raw.close();
    expect(ledgerVersions(file)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const pre = tableState(file);
    expect(() => openShadowed(file)).toThrow(/synthetic failure/);
    const failed = tableState(file);
    expect(failed).toEqual(pre);
    expect(failed.objects).not.toContain('learner_audit_format');
    expect(failed.objects).not.toContain('active_practice_attempt');
    raw = new DatabaseSync(file); raw.exec('DROP TRIGGER inject'); raw.close();
    for (let i = 0; i < 2; i++) {
      const db = openShadowed(file);
      try {
        expectShadowEqual(db);
        expect(db.listMigrations().map(m => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
        expect(sortById(db.loadSnapshot().reviewEvents)).toEqual(sortById(f.union.reviews));
        expect(sortById(db.loadSnapshot().practiceAttempts)).toEqual(sortById(f.union.attempts));
        expect(sortById(db.loadSnapshot().importJobEvents)).toEqual(sortById(f.union.jobEvents));
      } finally { db.close(); }
    }
    const done = tableState(file);
    expect(done.rows.review_event).toHaveLength(3); expect(done.rows.practice_attempt).toHaveLength(4); expect(done.rows.import_job_event).toHaveLength(3);
  });

  it('injected v8 practice-table rebuild failure rolls back the rebuild and keeps every legacy practice row; retry succeeds', () => {
    const file = tempFile(); const f = mixedV7(); buildLegacy(file, 7, legacySnapshot(f.snapshot), f.tables);
    let raw = new DatabaseSync(file); raw.exec("CREATE TRIGGER inject BEFORE UPDATE ON lingotorte_schema WHEN NEW.schema_version = 8 BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END"); raw.close();
    const pre = tableState(file);
    expect(() => openShadowed(file)).toThrow(/synthetic failure/);
    expect(tableState(file)).toEqual(pre);
    raw = new DatabaseSync(file); raw.exec('DROP TRIGGER inject'); raw.close();
    const db = openShadowed(file);
    try { expectShadowEqual(db); expect(sortById(db.listAuditPracticeAttempts())).toEqual(sortById(f.union.attempts)); expect(db.status().schemaVersion).toBe(13); } finally { db.close(); }
  });
});

describe('lt-3f1 T13 — consistent backup copy and downgrade boundary', () => {
  it('consistent SQLite backup of a populated upgraded DB (with uncheckpointed WAL writes) opens independently with equal active/audit/metadata/unrelated', async () => {
    const file = tempFile(); const f = mixedV7(); buildLegacy(file, 7, legacySnapshot(f.snapshot), f.tables);
    const db = openShadowed(file);
    const copy = tempFile('backup.sqlite');
    try {
      // Make active ≠ audit and leave writes in the WAL before taking the backup.
      const s0 = db.loadSnapshot();
      const manifest = RestoreService.validateManifest(JSON.parse(JSON.stringify(new ExportService(new LocalStore(withoutAudit({ ...s0, reviewEvents: s0.reviewEvents.filter(e => e.id === 'r-both'), practiceAttempts: s0.practiceAttempts.filter(a => a.id === 'p-both') })), 'test').buildManifest())));
      db.commitRestore(restoreRequest(db, manifest));
      const source = new DatabaseSync(file);
      try { await backup(source, copy); } finally { source.close(); }
      const original = { versioned: db.loadVersionedSnapshot(), auditR: db.listAuditReviewEvents(), auditP: db.listAuditPracticeAttempts(), migrations: db.listMigrations(), status: db.status(), jobs: db.listImportJobEvents(), media: db.listMediaAssets() };
      const restored = openShadowed(copy);
      try {
        expect(restored.loadVersionedSnapshot()).toEqual(original.versioned);
        expect(restored.listAuditReviewEvents()).toEqual(original.auditR);
        expect(restored.listAuditPracticeAttempts()).toEqual(original.auditP);
        expect(restored.listMigrations()).toEqual(original.migrations);
        expect(restored.status()).toEqual(original.status);
        expect(restored.listImportJobEvents()).toEqual(original.jobs);
        expect(restored.listMediaAssets()).toEqual(original.media);
        expect(restored.listReviewEvents().map(e => e.id)).toEqual(['r-both']);
        expect(original.auditR).toHaveLength(3);
      } finally { restored.close(); }
    } finally { db.close(); }
    const a = tableState(file); const b = tableState(copy); expect(b).toEqual(a);
  });

  it('pre-upgrade backup copy keeps the old v7 ledger/schema for old-binary recovery while the upgraded original and its later writes stay intact', async () => {
    const file = tempFile(); const f = mixedV7(); buildLegacy(file, 7, legacySnapshot(f.snapshot), f.tables);
    const preCopy = tempFile('pre-upgrade.sqlite');
    const src = new DatabaseSync(file); try { await backup(src, preCopy); } finally { src.close(); }
    const legacyState = tableState(file);
    const db = openShadowed(file);
    try { db.commitRestore(restoreRequest(db, new ExportService(new LocalStore(), 'test').buildManifest())); } finally { db.close(); }
    const upgraded = tableState(file);
    expect(tableState(preCopy)).toEqual(legacyState);
    expect(ledgerVersions(preCopy)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(upgraded.objects).toContain('learner_audit_format');
    // Recovery inspection of the copy never touches the upgraded file.
    const inspect = new DatabaseSync(preCopy); inspect.prepare('SELECT * FROM review_event').all(); inspect.close();
    expect(tableState(file)).toEqual(upgraded);
    // No in-place downgrade: the upgraded file presented as a "newer" schema to this binary is refused (simulated by future marker above);
    // here, the upgraded file must not be readable as a v7 database: its ledger already records v8/v9.
    expect(ledgerVersions(file)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});

describe('lt-3f1 T14 — practice modes and privacy across retained-audit migration', () => {
  it('all supported modes survive pre-v5 migration, empty replace, explicit restore/reactivation and reopen, with no network or policy change', () => {
    const fetchSpy = vi.fn(() => { throw new Error('network forbidden in lt-3f1'); }); vi.stubGlobal('fetch', fetchSpy);
    const file = tempFile(); const h = preV5(); const legacy = legacySnapshot(h); buildLegacy(file, 4, legacy);
    let db = openShadowed(file);
    try {
      expectShadowEqual(db);
      const migrated = db.loadSnapshot();
      expect(new Set(migrated.practiceAttempts.map(a => a.mode))).toEqual(new Set(ALL_MODES));
      const manifest = RestoreService.validateManifest(JSON.parse(JSON.stringify(new ExportService(new LocalStore(withoutAudit(migrated)), 'test').buildManifest())));
      db.commitRestore(restoreRequest(db, new ExportService(new LocalStore(), 'test').buildManifest()));
      expect(db.listPracticeAttempts()).toEqual([]);
      const restored = db.commitRestore(restoreRequest(db, manifest));
      expect(restored.receipt.effects.practiceAttempts.reactivated).toBe(ALL_MODES.length);
      expect(restored.receipt.auditEffects.practiceAttempts.appended).toBe(0);
    } finally { db.close(); }
    db = openShadowed(file);
    try {
      expect(sortById(db.loadSnapshot().practiceAttempts)).toEqual(sortById(h.practiceAttempts));
      expect(sortById(db.listAuditPracticeAttempts())).toEqual(sortById(h.practiceAttempts));
      expect(db.loadSnapshot().providerPolicies).toEqual(legacy.providerPolicies);
      expect(db.listMediaAssets()).toEqual(Object.values(legacy.mediaAssets as object)); // only the pre-existing synthetic reference; no media copied/discovered
    } finally { db.close(); }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
