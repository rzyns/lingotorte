// lt-192.4 S1: migration v14 `managed_media_blob` is additive and server-owned. Migrations 1-13 keep their
// persisted checksums; learner-state saves, snapshot saves, restore and export never read or write the table.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { LocalStore, ExportService, RestoreService } from '../../packages/storage/src';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence.ts';

const AT = '2026-10-31T00:00:00.000Z';
const HEX = (c: string) => c.repeat(64);
const roots: string[] = [];
afterEach(async () => { while (roots.length) await rm(roots.pop()!, { recursive: true, force: true }); });
async function file() { const root = await mkdtemp(join(tmpdir(), 'lt-192-4-schema-')); roots.push(root); return join(root, 'state.db'); }
function raw<T>(path: string, run: (db: DatabaseSync) => T): T { const db = new DatabaseSync(path); try { return run(db); } finally { db.close(); } }
function blobRows(path: string) { return raw(path, db => db.prepare('SELECT * FROM managed_media_blob ORDER BY sha256').all()); }
function tableState(path: string) {
  return raw(path, reader => {
    const names = reader.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    return Object.fromEntries(names.map(({ name }) => [name, reader.prepare(`SELECT * FROM "${name}" ORDER BY 1`).all()]));
  });
}
const insertBlob = (db: DatabaseSync, sha: string, size: number, mime: string) =>
  db.prepare("INSERT INTO managed_media_blob (sha256, size_bytes, mime_type, stored_at) VALUES (?, ?, ?, ?)").run(sha, size, mime, AT);
function store(sha: string) {
  const s = new LocalStore();
  s.putMediaAsset({ id: '11111111-1111-4111-8111-111111111111', title: 'synthetic', originalPath: `managed:${sha}`, contentSha256: `sha256:${sha}`, durationMs: 1000, container: 'webm', sizeBytes: 10, importedAt: AT, lastSeenAt: AT, privacyLabel: 'synthetic' });
  return s;
}

describe('lt-192.4 managed_media_blob (v14)', () => {
  it('appends v14 to the ledger; 1-13 keep their names and checksums', async () => {
    const path = await file();
    const db = SqliteLocalPersistence.open(path);
    try {
      expect(db.status().schemaVersion).toBe(14);
      const migrations = db.listMigrations();
      expect(migrations.map(m => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
      expect(migrations[13]).toMatchObject({ version: 14, name: 'managed_media_blob', result: 'applied' });
      // Pinned historical checksums (persisted in every existing ledger).
      expect(migrations[12]).toMatchObject({ version: 13, name: 'learner_operations' });
      expect(migrations.slice(0, 13).map(m => m.checksum)).toEqual(HISTORICAL_CHECKSUMS);
    } finally { db.close(); }
    expect(raw(path, d => d.prepare('SELECT schema_version FROM lingotorte_schema WHERE id=1').get())).toEqual({ schema_version: 14 });
  });

  it('enforces the shape: 64 lowercase hex key, positive size, allowlisted MIME, default probe', async () => {
    const path = await file(); SqliteLocalPersistence.open(path).close();
    raw(path, db => {
      insertBlob(db, HEX('a'), 10, 'video/webm');
      for (const mime of ['video/mp4', 'video/x-matroska', 'application/octet-stream']) insertBlob(db, createHash('sha256').update(mime).digest('hex'), 1, mime);
      for (const [sha, size, mime] of [[HEX('A'), 1, 'video/webm'], [HEX('a').slice(1), 1, 'video/webm'], [`${HEX('a').slice(1)}g`, 1, 'video/webm'],
        [HEX('b'), 0, 'video/webm'], [HEX('c'), -1, 'video/webm'], [HEX('d'), 1, 'text/html'], [HEX('e'), 1, 'video/quicktime'], [HEX('a'), 10, 'video/webm']] as const) {
        expect(() => insertBlob(db, sha, size, mime)).toThrow();
      }
      expect(db.prepare('SELECT probe_json FROM managed_media_blob WHERE sha256 = ?').get(HEX('a'))).toEqual({ probe_json: '{}' });
    });
  });

  it('upgrades a v13 database to v14 preserving every existing table byte-for-byte', async () => {
    const path = await file();
    const db = SqliteLocalPersistence.open(path);
    try { db.saveSnapshot(store(HEX('a')).snapshot(), AT); } finally { db.close(); }
    raw(path, d => d.exec('DROP TABLE managed_media_blob; DELETE FROM schema_migration WHERE version=14; UPDATE lingotorte_schema SET schema_version=13;'));
    const before = tableState(path);
    expect(Object.keys(before)).not.toContain('managed_media_blob');
    const upgraded = SqliteLocalPersistence.open(path);
    try { expect(upgraded.status().schemaVersion).toBe(14); } finally { upgraded.close(); }
    const after = tableState(path);
    expect(after.managed_media_blob).toEqual([]);
    const { managed_media_blob: _added, schema_migration: afterLedger, lingotorte_schema: afterSchema, ...rest } = after;
    const { schema_migration: beforeLedger, lingotorte_schema: _beforeSchema, ...beforeRest } = before;
    expect(rest).toEqual(beforeRest);
    expect((afterLedger as unknown[]).slice(0, 13)).toEqual(beforeLedger);
    expect(afterSchema).toEqual([{ id: 1, schema_version: 14 }]);
  });

  it('binds by contentSha256; unknown media is undefined, no row is null', async () => {
    const path = await file();
    const db = SqliteLocalPersistence.open(path);
    try {
      db.saveSnapshot(store(HEX('a')).snapshot(), AT);
      expect(db.managedBlobForMedia('22222222-2222-4222-8222-222222222222')).toBeUndefined();
      expect(db.managedBlobForMedia('11111111-1111-4111-8111-111111111111')).toBeNull();
      raw(path, d => insertBlob(d, HEX('b'), 10, 'video/webm'));
      expect(db.managedBlobForMedia('11111111-1111-4111-8111-111111111111')).toBeNull();
      raw(path, d => insertBlob(d, HEX('a'), 10, 'video/mp4'));
      expect(db.managedBlobForMedia('11111111-1111-4111-8111-111111111111')).toEqual({ sha256: HEX('a'), sizeBytes: 10, mimeType: 'video/mp4' });
    } finally { db.close(); }
  });

  it('is never touched by learner-state saves, snapshot saves, restore or export', async () => {
    const path = await file();
    const db = SqliteLocalPersistence.open(path);
    try {
      db.saveSnapshot(store(HEX('a')).snapshot(), AT);
      raw(path, d => { insertBlob(d, HEX('a'), 10, 'video/webm'); insertBlob(d, HEX('f'), 7, 'video/mp4'); });
      const rows = blobRows(path);
      // Whole-document learner-state save that drops every media asset.
      const { state, revision } = db.loadLearnerState();
      expect(Object.keys(state.mediaAssets)).toHaveLength(1);
      db.saveLearnerState({ ...state, mediaAssets: {} }, revision, AT);
      expect(blobRows(path)).toEqual(rows);
      expect(db.managedBlobForMedia('11111111-1111-4111-8111-111111111111')).toBeUndefined();
      db.saveSnapshot(new LocalStore().snapshot(), AT);
      expect(blobRows(path)).toEqual(rows);
      // Export: the manifest is built from learner state only and carries no blob row or digest of the table.
      const source = store(HEX('a'));
      const manifest = RestoreService.validateManifest(JSON.parse(JSON.stringify(new ExportService(source, 'test').buildManifest())));
      expect(JSON.stringify(manifest)).not.toMatch(/managed_media_blob|probe_json|stored_at/);
      // Restore (replace-active), then rebinding by identical contentSha256 makes the same blob ready again.
      const expectedRevision = db.loadVersionedSnapshot().revision;
      const preview = db.previewRestore(manifest, 'replace-active', expectedRevision);
      db.commitRestore({ manifest, mode: 'replace-active', expectedRevision, confirmation: { confirmedAt: AT, confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: preview.preview.warnings.map(w => w.kind) } } as never);
      expect(blobRows(path)).toEqual(rows);
      expect(JSON.stringify(db.loadSnapshot())).not.toContain(HEX('f'));
      // An asset with the identical contentSha256 saved again binds to the untouched ready row (derived binding).
      const after = db.loadLearnerState();
      db.saveLearnerState({ ...after.state, mediaAssets: store(HEX('a')).snapshot().mediaAssets }, after.revision, AT);
      expect(db.managedBlobForMedia('11111111-1111-4111-8111-111111111111')).toEqual({ sha256: HEX('a'), sizeBytes: 10, mimeType: 'video/webm' });
      expect(blobRows(path)).toEqual(rows);
    } finally { db.close(); }
  });
});

// Checksums of migrations v1-v13 as persisted in existing ledgers, read from a fresh database opened with the base
// 34487388 sources (image lingotorte:lt1924-base). Any change to historical SQL must fail here.
const HISTORICAL_CHECKSUMS = [
  'e5c052ed608f8be234b66685159046883fd69444f340b9fe030f0e8f1fc94954', '2a9e5649f693f634a12331c9a2b84873e3b575bbb2940a7b5bcd727c1924711b',
  'b490ea17a4954ac4b28d208d72e67085bb366efe50bcef975d5aead8f9b55144', 'b405a5db3ca91984c3e8da7a4e08eed7e19f8bf0a514ace4e1cb8873d684fc2c',
  '7fb5258eeff23278ef6ed88abef8f22771a50050e08e38e2517331a6a802fbdf', '55f3ad927f1bd9d0111676ba4a146bbbd60837beedc11b74c1846dd43ccb4865',
  '67a2103c79b95cbb0871921719023cbd6f8d72ccb0f9057381ec8303d0ca051b', 'e60d3a17777d1132f398403f1815c39237424b011ffe98e33a27b4f494cec2bf',
  'ab88e12d179e73403a5f0fe52cadbcbf54220b133ce026184fcf38b089638704', '659e04c186ca202de3f65f4f1c0e9566a7872a76c98cd912b8760275abd3b060',
  'c51196327d2eafd570703a7bd37284d7f6ab25a203b21707abe54592251e46b5', '47057a46a7a12748f9c45e1b6cd0ec99d2d87d4e9d42480db91af2e15d6385fd',
  'e7246e7a2114b0c7dd54f2a7eb346cda27de6a394695c7af237e49bc7a078c9c',
];
