import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LocalStore, PracticeService } from '../../packages/storage/src';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence';
import { makeSavedItem, makeSavedOccurrence, makeReviewCard, makeReviewCardState, validateSavedOccurrenceSourceContext, type PracticeMode } from '../../packages/domain/src';

const legacy = JSON.parse(readFileSync(new URL('../fixtures/sqlite-v7-migrations.json', import.meta.url), 'utf8'));
const modes = ['typed-input', 'multiple-choice', 'audio-recall', 'speaking', 'sentence-builder'] as const satisfies readonly PracticeMode[];
// A new domain mode must be added to the executable matrix.
const exhaustive: Record<PracticeMode, true> = { 'typed-input': true, 'multiple-choice': true, 'audio-recall': true, speaking: true, 'sentence-builder': true };
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function path() { const root = mkdtempSync(join(tmpdir(), 'practice-sqlite-')); roots.push(root); return join(root, 'state.sqlite'); }
function fixture() {
  const store = new LocalStore();
  const sourceContext = validateSavedOccurrenceSourceContext({ mediaId: 'media', mediaPath: 'fixtures/synthetic.webm', mediaFingerprint: `sha256:${'0'.repeat(64)}`, subtitleTrackId: 'track', cueId: 'cue', timeRangeMs: { start: 0, end: 1000 }, tokenSpan: { startToken: 0, endToken: 2 }, charSpan: { start: 0, end: 10 } });
  const item = makeSavedItem({ kind: 'sentence', language: 'pl', displayText: 'Ala ma kota' });
  const occurrence = makeSavedOccurrence({ savedItemId: item.id, mediaId: 'media', cueId: 'cue', startMs: 0, endMs: 1000, selectionKind: 'sentence', selectionText: item.displayText, sourceContext });
  const card = makeReviewCard({ savedItemId: item.id, savedOccurrenceId: occurrence.id, cardType: 'production', promptTemplate: 'synthetic' });
  store.putSavedItem(item); store.putSavedOccurrence(occurrence); store.putReviewCard(card); store.putReviewCardState(makeReviewCardState({ cardId: card.id, fsrsVersion: 'synthetic-test' }));
  return { store, card, sourceContext };
}
function submit(f: ReturnType<typeof fixture>, mode: PracticeMode) {
  return new PracticeService(f.store).submitAttempt({ cardId: f.card.id, mode, result: 'pass', givenAnswer: 'Ala ma kota', expectedAnswer: 'Ala ma kota', responseMs: 1200, sourceContext: f.sourceContext, reviewedAt: '2026-10-11T12:00:00.000Z' });
}
function rows(db: DatabaseSync) {
  return Object.fromEntries(['lingotorte_snapshots', 'saved_item', 'saved_occurrence', 'review_card', 'review_card_state', 'review_event', 'practice_attempt'].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
}
describe('SQLite practice mode forward migration', () => {
  it.each(modes)('submits %s through PracticeService and survives close/reopen', mode => {
    expect(Object.keys(exhaustive).sort()).toEqual([...modes].sort());
    const f = fixture(); const result = submit(f, mode); const file = path();
    const first = SqliteLocalPersistence.open(file);
    try { first.saveStore(f.store); } finally { first.close(); }
    const reopened = SqliteLocalPersistence.open(file);
    try {
      expect(reopened.loadSnapshot()).toEqual(f.store.snapshot());
      expect(reopened.listPracticeAttempts()).toEqual([result.attempt]);
      expect(reopened.listReviewEvents().map(e => e.id)).toEqual([result.reviewEventId]);
    } finally { reopened.close(); }
  });
  it('migrates independently frozen v7 rows and ledger without losing any column or snapshot', () => {
    const file = path(); const db = new DatabaseSync(file);
    db.exec("CREATE TABLE schema_migration (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL, checksum TEXT NOT NULL, result TEXT NOT NULL CHECK(result = 'applied'))");
    for (const migration of legacy.migrations) {
      expect(createHash('sha256').update(migration.sql).digest('hex')).toBe(migration.checksum);
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migration VALUES (?, ?, ?, ?, ?)').run(migration.version, migration.name, '2026-10-10T00:00:00.000Z', migration.checksum, 'applied');
    }
    const insert = db.prepare('INSERT INTO practice_attempt VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const [i, mode] of modes.slice(0, 4).entries()) insert.run(`legacy-${i}`, 'card', mode, 'pass-with-hesitation', i === 0 ? null : 'answer', 'expected', i === 0 ? null : 12, '{"synthetic":true}', 'reviewed', 'created', '{"reviewEventId":"legacy-event"}');
    db.prepare('INSERT INTO lingotorte_snapshots VALUES (?, ?, ?, ?)').run('default', 7, JSON.stringify(new LocalStore().snapshot()), 'unchanged');
    const before = rows(db); const ledger = db.prepare('SELECT * FROM schema_migration ORDER BY version').all(); db.close();
    const migrated = SqliteLocalPersistence.open(file);
    try { expect(migrated.status().schemaVersion).toBe(8); expect(migrated.listMigrations()).toHaveLength(8); } finally { migrated.close(); }
    const check = new DatabaseSync(file);
    try {
      expect(rows(check)).toEqual(before);
      expect(check.prepare('SELECT * FROM schema_migration WHERE version <= 7 ORDER BY version').all()).toEqual(ledger);
      expect(check.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' });
      expect(check.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_practice_attempt_card_time'").get()).toBeDefined();
      const invalidMode = check.prepare('INSERT INTO practice_attempt SELECT ?, card_id, ?, result, given_answer, expected_answer, response_ms, source_context_json, reviewed_at, created_at, event_link_json FROM practice_attempt LIMIT 1');
      expect(() => invalidMode.run('invalid-mode', 'unknown')).toThrow(/CHECK constraint failed/);
      invalidMode.run('new-sentence-builder', 'sentence-builder');
      expect(check.prepare("SELECT mode FROM practice_attempt WHERE id = 'new-sentence-builder'").get()).toMatchObject({ mode: 'sentence-builder' });
    } finally { check.close(); }
    const reopened = SqliteLocalPersistence.open(file); try { expect(reopened.listMigrations()).toHaveLength(8); } finally { reopened.close(); }
  });
  it.each(['mode', 'result', 'responseMs'] as const)('rolls back the entire snapshot and projections for invalid %s', field => {
    const f = fixture(); submit(f, 'typed-input'); const file = path(); const persistence = SqliteLocalPersistence.open(file);
    const baseline = f.store.snapshot();
    try {
      persistence.saveStore(f.store); const reader = new DatabaseSync(file); const before = rows(reader);
      try {
        submit(f, 'sentence-builder'); const snapshot = f.store.snapshot();
        const invalid = { ...snapshot.practiceAttempts[1]!, [field]: field === 'responseMs' ? -1 : 'invalid' };
        expect(() => persistence.saveSnapshot({ ...snapshot, practiceAttempts: [snapshot.practiceAttempts[0]!, invalid] } as typeof snapshot)).toThrow(/CHECK constraint failed/);
        expect(persistence.loadSnapshot()).toEqual(baseline); expect(rows(reader)).toEqual(before);
      } finally { reader.close(); }
    } finally { persistence.close(); }
    const reopened = SqliteLocalPersistence.open(file); try { expect(reopened.loadSnapshot()).toEqual(baseline); expect(reopened.loadSnapshot().practiceAttempts).toHaveLength(1); } finally { reopened.close(); }
  });
});
