import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { MediaAsset, Sha256Digest, SourceKind } from '@lingotorte/domain';
import { LocalStore, createEmptyLocalStoreSnapshot, normalizeLocalStoreSnapshot, type LocalStoreSnapshot } from './localStore.ts';

const CURRENT_SCHEMA_VERSION = 2;
const SNAPSHOT_KEY = 'default';

const CREATE_SNAPSHOT_STORE_SQL = `
  CREATE TABLE IF NOT EXISTS lingotorte_schema (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_version INTEGER NOT NULL
  );
  INSERT INTO lingotorte_schema (id, schema_version)
    VALUES (1, 1)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
  CREATE TABLE IF NOT EXISTS lingotorte_snapshots (
    snapshot_key TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`.trim();

const CREATE_MEDIA_ASSET_PROJECTION_SQL = `
  CREATE TABLE IF NOT EXISTS media_asset (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    original_path TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    container TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    imported_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    privacy_label TEXT NOT NULL CHECK (privacy_label IN ('synthetic', 'owned', 'licensed'))
  );
  CREATE INDEX IF NOT EXISTS idx_media_asset_privacy_label ON media_asset(privacy_label);
  CREATE INDEX IF NOT EXISTS idx_media_asset_content_sha256 ON media_asset(content_sha256);
  INSERT INTO lingotorte_schema (id, schema_version)
    VALUES (1, 2)
    ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version;
`.trim();

type SnapshotRow = Readonly<{
  snapshot_json: string;
}>;

type SchemaVersionRow = Readonly<{
  schema_version: number | null;
}>;

type SchemaMigrationRow = Readonly<{
  version: number;
  name: string;
  applied_at: string;
  checksum: string;
  result: string;
}>;

type MediaAssetRow = Readonly<{
  id: string;
  title: string;
  original_path: string;
  content_sha256: string;
  duration_ms: number;
  container: string;
  size_bytes: number;
  imported_at: string;
  last_seen_at: string;
  privacy_label: string;
}>;

export type SqliteSchemaMigration = Readonly<{
  version: number;
  name: string;
  appliedAt: string;
  checksum: string;
  result: 'applied';
}>;

export type SqliteLocalPersistenceStatus = Readonly<{
  schemaVersion: number;
  hasSnapshot: boolean;
  appliedMigrations: readonly SqliteSchemaMigration[];
}>;

type MigrationDefinition = Readonly<{
  version: number;
  name: string;
  sql: string;
  checksum: string;
}>;

function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

const MIGRATIONS: readonly MigrationDefinition[] = [
  {
    version: 1,
    name: 'create_snapshot_store',
    sql: CREATE_SNAPSHOT_STORE_SQL,
    checksum: migrationChecksum(CREATE_SNAPSHOT_STORE_SQL),
  },
  {
    version: 2,
    name: 'create_media_asset_projection',
    sql: CREATE_MEDIA_ASSET_PROJECTION_SQL,
    checksum: migrationChecksum(CREATE_MEDIA_ASSET_PROJECTION_SQL),
  },
];

export class SqliteLocalPersistence {
  private readonly db: DatabaseSync;

  private constructor(db: DatabaseSync) {
    this.db = db;
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
      CREATE TABLE IF NOT EXISTS schema_migration (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT NOT NULL,
        result TEXT NOT NULL CHECK (result = 'applied')
      );
    `);
    for (const migration of MIGRATIONS) {
      this.applyMigration(migration);
    }
  }

  private applyMigration(migration: MigrationDefinition): void {
    const row = this.db
      .prepare('SELECT version, name, applied_at, checksum, result FROM schema_migration WHERE version = ? LIMIT 1')
      .get(migration.version) as SchemaMigrationRow | undefined;
    if (row !== undefined) {
      if (row.name !== migration.name || row.checksum !== migration.checksum || row.result !== 'applied') {
        throw new Error(`SQLite migration ${migration.version} does not match the expected forward-only definition.`);
      }
      return;
    }

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(migration.sql);
      this.db
        .prepare('INSERT INTO schema_migration (version, name, applied_at, checksum, result) VALUES (?, ?, ?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString(), migration.checksum, 'applied');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listMigrations(): readonly SqliteSchemaMigration[] {
    const rows = this.db
      .prepare('SELECT version, name, applied_at, checksum, result FROM schema_migration ORDER BY version ASC')
      .all() as SchemaMigrationRow[];
    return rows.map((row) => {
      if (row.result !== 'applied') {
        throw new Error(`SQLite migration ${row.version} has unsupported result ${row.result}.`);
      }
      return {
        version: row.version,
        name: row.name,
        appliedAt: row.applied_at,
        checksum: row.checksum,
        result: row.result,
      };
    });
  }

  listMediaAssets(): readonly MediaAsset[] {
    const rows = this.db
      .prepare(`
        SELECT id, title, original_path, content_sha256, duration_ms, container,
               size_bytes, imported_at, last_seen_at, privacy_label
        FROM media_asset
        ORDER BY imported_at ASC, id ASC
      `)
      .all() as MediaAssetRow[];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      originalPath: row.original_path,
      contentSha256: row.content_sha256 as Sha256Digest,
      durationMs: row.duration_ms,
      container: row.container,
      sizeBytes: row.size_bytes,
      importedAt: row.imported_at,
      lastSeenAt: row.last_seen_at,
      privacyLabel: row.privacy_label as SourceKind,
    }));
  }

  private saveMediaAssetProjection(snapshot: LocalStoreSnapshot): void {
    this.db.prepare('DELETE FROM media_asset').run();
    const insert = this.db.prepare(`
      INSERT INTO media_asset (
        id, title, original_path, content_sha256, duration_ms, container,
        size_bytes, imported_at, last_seen_at, privacy_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const asset of Object.values(snapshot.mediaAssets)) {
      insert.run(
        asset.id,
        asset.title,
        asset.originalPath,
        asset.contentSha256,
        asset.durationMs,
        asset.container,
        asset.sizeBytes,
        asset.importedAt,
        asset.lastSeenAt,
        asset.privacyLabel,
      );
    }
  }

  status(): SqliteLocalPersistenceStatus {
    const hasSnapshot = this.db
      .prepare('SELECT 1 FROM lingotorte_snapshots WHERE snapshot_key = ? LIMIT 1')
      .get(SNAPSHOT_KEY) !== undefined;
    const schemaRow = this.db
      .prepare('SELECT MAX(version) AS schema_version FROM schema_migration WHERE result = ?')
      .get('applied') as SchemaVersionRow;
    return {
      schemaVersion: schemaRow.schema_version ?? CURRENT_SCHEMA_VERSION,
      hasSnapshot,
      appliedMigrations: this.listMigrations(),
    };
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
    this.db.exec('BEGIN IMMEDIATE');
    try {
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
      this.saveMediaAssetProjection(normalized);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
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
