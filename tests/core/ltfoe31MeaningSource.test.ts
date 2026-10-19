import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeSavedItem, validateLearnerExportManifest, type SavedItem } from '../../packages/domain/src';
import { LocalStore } from '../../packages/storage/src';
import { ExportService } from '../../packages/storage/src/exportRestoreService';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence';

// lt-foe.3.1: SavedItem.meaningSource provenance through SQLite (v10), snapshot and export manifest.
vi.setConfig({ testTimeout: 30_000 });

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function dbPath() { const root = mkdtempSync(join(tmpdir(), 'ltfoe31-')); roots.push(root); return join(root, 'state.sqlite'); }

const suggested = { kind: 'dictionary-suggested', glossSourceId: 'wiktextract-pl', dumpDate: '2026-09-01' } as const;
function storeWith(...items: SavedItem[]): LocalStore {
  const store = new LocalStore();
  for (const item of items) store.putSavedItem(item);
  return store;
}
const learnerItem = () => ({ ...makeSavedItem({ kind: 'lexeme', language: 'pl', displayText: 'dom', meaning: 'house' }), meaningSource: { kind: 'learner' } }) as SavedItem;
const suggestedItem = () => ({ ...makeSavedItem({ kind: 'lexeme', language: 'pl', displayText: 'kot', meaning: 'cat' }), meaningSource: suggested }) as SavedItem;
const legacyItem = () => makeSavedItem({ kind: 'lexeme', language: 'pl', displayText: 'pies', meaning: 'dog' });

describe('lt-foe.3.1 SQLite meaningSource', () => {
  it('round-trips learner, dictionary-suggested and absent sources through close/reopen', () => {
    const items = [learnerItem(), suggestedItem(), legacyItem()];
    const store = storeWith(...items);
    const file = dbPath();
    const first = SqliteLocalPersistence.open(file);
    try { first.saveStore(store); } finally { first.close(); }
    const reopened = SqliteLocalPersistence.open(file);
    try {
      expect(reopened.status().schemaVersion).toBe(11);
      const byId = new Map(reopened.listSavedItems().map((i) => [i.id, i]));
      expect(byId.get(items[0]!.id)?.meaningSource).toEqual({ kind: 'learner' });
      expect(byId.get(items[1]!.id)?.meaningSource).toEqual(suggested);
      expect(byId.get(items[2]!.id)).not.toHaveProperty('meaningSource');
      expect(reopened.loadSnapshot()).toEqual(store.snapshot());
    } finally { reopened.close(); }
  });

  it('migrates a populated v9 database to v10, preserving meanings with no source; reopen is idempotent', () => {
    const items = [legacyItem(), makeSavedItem({ kind: 'sentence', language: 'pl', displayText: 'Ala ma kota' })];
    const store = storeWith(...items);
    const file = dbPath();
    const v10 = SqliteLocalPersistence.open(file);
    try { v10.saveStore(store); } finally { v10.close(); }
    // Rewind to an exact v9 shape: drop the v10 column, ledger row and versions.
    const raw = new DatabaseSync(file);
    raw.exec("DROP TABLE durable_state; DELETE FROM schema_migration WHERE version=11; ALTER TABLE saved_item DROP COLUMN meaning_source_json; DELETE FROM schema_migration WHERE version=10; UPDATE lingotorte_schema SET schema_version=9; UPDATE lingotorte_snapshots SET schema_version=9;");
    expect((raw.prepare('PRAGMA table_info(saved_item)').all() as { name: string }[]).map((c) => c.name)).not.toContain('meaning_source_json');
    raw.close();
    for (let pass = 0; pass < 2; pass += 1) {
      const db = SqliteLocalPersistence.open(file);
      try {
        expect(db.listMigrations().map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        expect(db.listMigrations()[9]).toMatchObject({ name: 'saved_item_meaning_source', result: 'applied' });
        expect(db.status().schemaVersion).toBe(11);
        const listed = db.listSavedItems();
        expect(listed.find((i) => i.id === items[0]!.id)).toMatchObject({ meaning: 'dog' });
        expect(listed.every((i) => !('meaningSource' in i))).toBe(true);
        expect(db.loadSnapshot()).toEqual(store.snapshot());
      } finally { db.close(); }
    }
    const check = new DatabaseSync(file);
    try {
      expect(check.prepare('SELECT schema_version FROM lingotorte_snapshots').get()).toEqual({ schema_version: 11 });
      expect(check.prepare('SELECT COUNT(*) AS n FROM saved_item WHERE meaning_source_json IS NOT NULL').get()).toEqual({ n: 0 });
    } finally { check.close(); }
  });
});

describe('lt-foe.3.1 SQLite meaningSource fail-closed', () => {
  it.each([
    ['invalid JSON', '{not json'],
    ['unknown kind', '{"kind":"llm"}'],
    ['extra key', '{"kind":"learner","x":1}'],
  ])('listSavedItems throws on a corrupt meaning_source_json row: %s', (_label, raw) => {
    const item = learnerItem();
    const file = dbPath();
    const db = SqliteLocalPersistence.open(file);
    try { db.saveStore(storeWith(item)); } finally { db.close(); }
    const sql = new DatabaseSync(file);
    try { sql.prepare('UPDATE saved_item SET meaning_source_json = ? WHERE id = ?').run(raw, item.id); } finally { sql.close(); }
    const reopened = SqliteLocalPersistence.open(file);
    try { expect(() => reopened.listSavedItems()).toThrow(); } finally { reopened.close(); }
  });
});

describe('lt-foe.3.1 export manifest meaningSource', () => {
  it('round-trips with and without meaningSource', () => {
    const items = [learnerItem(), suggestedItem(), legacyItem()];
    const manifest = new ExportService(storeWith(...items), 'test').buildManifest();
    const validated = validateLearnerExportManifest(JSON.parse(JSON.stringify(manifest)));
    const byId = new Map(validated.content.savedItems.map((i) => [i.id, i]));
    expect(byId.get(items[0]!.id)?.meaningSource).toEqual({ kind: 'learner' });
    expect(byId.get(items[1]!.id)?.meaningSource).toEqual(suggested);
    expect(byId.get(items[2]!.id)).not.toHaveProperty('meaningSource');
  });

  it.each([
    ['unknown kind', { kind: 'llm' }],
    ['extra key on learner', { kind: 'learner', glossSourceId: 'x' }],
    ['missing dumpDate', { kind: 'dictionary-suggested', glossSourceId: 'x' }],
    ['empty glossSourceId', { kind: 'dictionary-suggested', glossSourceId: '', dumpDate: '2026-09-01' }],
    ['extra key on suggestion', { kind: 'dictionary-suggested', glossSourceId: 'x', dumpDate: '2026-09-01', url: 'https://x' }],
    ['non-object', 'learner'],
    ['source without meaning', null],
  ])('rejects malformed meaningSource: %s', (_label, source) => {
    const base = makeSavedItem({ kind: 'lexeme', language: 'pl', displayText: 'dom', meaning: 'house' });
    const item = (source === null
      ? { ...makeSavedItem({ kind: 'lexeme', language: 'pl', displayText: 'dom' }), meaningSource: { kind: 'learner' } }
      : { ...base, meaningSource: source }) as unknown as SavedItem;
    const manifest = new ExportService(storeWith(item), 'test').buildManifest();
    expect(() => validateLearnerExportManifest(JSON.parse(JSON.stringify(manifest)))).toThrow();
  });
});
