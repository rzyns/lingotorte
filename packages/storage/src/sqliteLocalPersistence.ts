import { DatabaseSync } from 'node:sqlite';
import { LocalStore, createEmptyLocalStoreSnapshot, normalizeLocalStoreSnapshot, type LocalStoreSnapshot } from './localStore';

const CURRENT_SCHEMA_VERSION = 1;
const SNAPSHOT_KEY = 'default';

type SnapshotRow = Readonly<{
  snapshot_json: string;
}>;

export type SqliteLocalPersistenceStatus = Readonly<{
  schemaVersion: number;
  hasSnapshot: boolean;
}>;

export class SqliteLocalPersistence {
  private constructor(private readonly db: DatabaseSync) {
    this.initialize();
  }

  static open(databasePath: string): SqliteLocalPersistence {
    if (databasePath !== ':memory:' && !databasePath.startsWith('/')) {
      throw new TypeError('SQLite local persistence path must be absolute, or :memory: for tests.');
    }
    return new SqliteLocalPersistence(new DatabaseSync(databasePath));
  }

  private initialize(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS lingotorte_schema (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schema_version INTEGER NOT NULL
      );
      INSERT INTO lingotorte_schema (id, schema_version)
        VALUES (1, ${CURRENT_SCHEMA_VERSION})
        ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
      CREATE TABLE IF NOT EXISTS lingotorte_snapshots (
        snapshot_key TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  status(): SqliteLocalPersistenceStatus {
    const hasSnapshot = this.db
      .prepare('SELECT 1 FROM lingotorte_snapshots WHERE snapshot_key = ? LIMIT 1')
      .get(SNAPSHOT_KEY) !== undefined;
    return { schemaVersion: CURRENT_SCHEMA_VERSION, hasSnapshot };
  }

  loadSnapshot(): LocalStoreSnapshot {
    const row = this.db
      .prepare('SELECT snapshot_json FROM lingotorte_snapshots WHERE snapshot_key = ? LIMIT 1')
      .get(SNAPSHOT_KEY) as SnapshotRow | undefined;
    if (!row) return createEmptyLocalStoreSnapshot();
    return normalizeLocalStoreSnapshot(JSON.parse(row.snapshot_json));
  }

  saveSnapshot(snapshot: LocalStoreSnapshot, updatedAt = new Date().toISOString()): void {
    const normalized = normalizeLocalStoreSnapshot(snapshot);
    this.db
      .prepare(`
        INSERT INTO lingotorte_snapshots (snapshot_key, schema_version, snapshot_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(snapshot_key) DO UPDATE SET
          schema_version = excluded.schema_version,
          snapshot_json = excluded.snapshot_json,
          updated_at = excluded.updated_at
      `)
      .run(SNAPSHOT_KEY, CURRENT_SCHEMA_VERSION, JSON.stringify(normalized), updatedAt);
  }

  saveStore(store: LocalStore, updatedAt?: string): void {
    this.saveSnapshot(store.snapshot(), updatedAt);
  }

  hydrateStore(): LocalStore {
    return new LocalStore(this.loadSnapshot());
  }

  close(): void {
    this.db.close();
  }
}
