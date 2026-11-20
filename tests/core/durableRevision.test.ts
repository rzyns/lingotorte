import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LocalStore, ExportService, createEmptyLocalStoreSnapshot } from '../../packages/storage/src';
import { SqliteLocalPersistence, SnapshotRevisionConflictError } from '../../packages/storage/src/sqliteLocalPersistence.ts';
import { makeMediaAsset } from '../../packages/domain/src';

// lt-584.2 (ADR-0003 Decision 2): the durable revision is an opaque monotonic token, rev:<n>,
// bumped once inside every committed write transaction. Equivalent content no longer implies an equal revision.

const AT = '2026-06-21T12:00:00.000Z';
const snapshot = (title: string) => {
  const value = createEmptyLocalStoreSnapshot();
  const media = makeMediaAsset({ title, originalPath: 'fixtures/media/synthetic-polish-dialogue.webm', contentSha256: `sha256:${'1'.repeat(64)}`, durationMs: 1000, container: 'webm', sizeBytes: 1024, privacyLabel: 'synthetic' });
  value.mediaAssets[media.id] = media;
  return value;
};
function learnerFixture(suffix: string) {
  const store = new LocalStore();
  store.putSavedItem({ id: `synthetic-item-${suffix}`, kind: 'lexeme', language: 'pl', displayText: `synthetic ${suffix}`, createdAt: AT, updatedAt: AT });
  return store;
}
function restoreRequest(db: SqliteLocalPersistence, manifest: unknown, expectedRevision = db.loadVersionedSnapshot().revision) {
  const preview = db.previewRestore(manifest, 'replace-active', expectedRevision);
  return { manifest, mode: 'replace-active' as const, expectedRevision, confirmation: { confirmedAt: AT, confirmReplace: true, confirmOverwrite: false, acknowledgedWarnings: preview.preview.warnings.map(w => w.kind) } };
}
const revisionRow = (file: string) => {
  const raw = new DatabaseSync(file);
  try { return raw.prepare('SELECT id, revision FROM durable_state').all(); } finally { raw.close(); }
};
async function withFile<T>(run: (file: string) => Promise<T> | T): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'lt-584-2-'));
  try { return await run(join(root, 'state.db')); } finally { await rm(root, { recursive: true, force: true }); }
}

describe('lt-584.2 durable revision token', () => {
  it('starts at rev:1, is stable across reads and reopen, and matches the opaque grammar', async () => {
    await withFile(file => {
      let db = SqliteLocalPersistence.open(file);
      try {
        const first = db.loadVersionedSnapshot().revision;
        expect(first).toBe('rev:1');
        expect(first).toMatch(/^[A-Za-z0-9:_-]{1,128}$/);
        expect(db.loadVersionedSnapshot().revision).toBe('rev:1');
        db.previewRestore(new ExportService(new LocalStore(), 'test').buildManifest(), 'replace-active', first);
        expect(db.loadVersionedSnapshot().revision).toBe('rev:1');
        db.close(); db = SqliteLocalPersistence.open(file);
        expect(db.loadVersionedSnapshot().revision).toBe('rev:1');
      } finally { db.close(); }
      expect(revisionRow(file)).toEqual([{ id: 1, revision: 1 }]);
    });
  });

  it('increments exactly once per committed save and per committed restore', () => {
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      const r1 = db.saveSnapshot(snapshot('one'), AT, 'rev:1');
      expect(r1).toBe('rev:2');
      expect(db.loadVersionedSnapshot().revision).toBe('rev:2');
      const r2 = db.saveSnapshot(snapshot('two'), AT); // trusted save without CAS still bumps
      expect(r2).toBe('rev:3');
      const restored = db.commitRestore(restoreRequest(db, new ExportService(learnerFixture('a'), 'test').buildManifest()));
      expect(restored.revision).toBe('rev:4');
      expect(db.loadVersionedSnapshot().revision).toBe('rev:4');
      const r3 = db.saveSnapshot(restored.snapshot, AT, restored.revision);
      expect(r3).toBe('rev:5');
    } finally { db.close(); }
  });

  it('identical content saved twice yields two different tokens (equivalence => same revision is dropped)', () => {
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      const content = snapshot('same');
      const a = db.saveSnapshot(content, AT, db.loadVersionedSnapshot().revision);
      const afterA = db.loadVersionedSnapshot();
      const b = db.saveSnapshot(content, AT, a);
      const afterB = db.loadVersionedSnapshot();
      expect(afterB.snapshot).toEqual(afterA.snapshot);
      expect(b).not.toBe(a);
      expect([a, b]).toEqual(['rev:2', 'rev:3']);
    } finally { db.close(); }
  });

  it('rejects a stale token with SnapshotRevisionConflictError on save, preview and commit, without bumping', () => {
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      const stale = db.loadVersionedSnapshot().revision;
      const current = db.saveSnapshot(snapshot('first'), AT, stale);
      const before = db.loadVersionedSnapshot();
      expect(() => db.saveSnapshot(snapshot('stale'), AT, stale)).toThrow(SnapshotRevisionConflictError);
      const manifest = new ExportService(learnerFixture('b'), 'test').buildManifest();
      expect(() => db.previewRestore(manifest, 'replace-active', stale)).toThrow(SnapshotRevisionConflictError);
      const fresh = restoreRequest(db, manifest, current);
      expect(() => db.commitRestore({ ...fresh, expectedRevision: stale })).toThrow(SnapshotRevisionConflictError);
      expect(db.loadVersionedSnapshot()).toEqual(before);
      // A well-formed but unknown token is a conflict; a malformed one is still a TypeError with the same message.
      expect(() => db.previewRestore(manifest, 'replace-active', 'rev:999')).toThrow(SnapshotRevisionConflictError);
      expect(() => db.previewRestore(manifest, 'replace-active', 'bad token!')).toThrow(/^Invalid durable state revision$/);
      expect(() => db.previewRestore(manifest, 'replace-active', 'x'.repeat(129))).toThrow(/^Invalid durable state revision$/);
      expect(db.commitRestore(fresh).revision).toBe(`rev:${Number(current.slice(4)) + 1}`);
    } finally { db.close(); }
  });

  it('a save failing inside the write transaction does not bump the token or change state', async () => {
    await withFile(file => {
      let db = SqliteLocalPersistence.open(file);
      try {
        db.saveSnapshot(snapshot('valid'), AT);
        const before = db.loadVersionedSnapshot();
        const broken = snapshot('invalid'); const media = Object.values(broken.mediaAssets)[0]!;
        broken.mediaAssets[media.id] = { ...media, durationMs: -1 }; // projection CHECK failure inside the transaction
        expect(() => db.saveSnapshot(broken, AT, before.revision)).toThrow();
        expect(db.loadVersionedSnapshot()).toEqual(before);
        db.close(); db = SqliteLocalPersistence.open(file);
        expect(db.loadVersionedSnapshot()).toEqual(before);
      } finally { db.close(); }
    });
  });

  it.each(['save', 'restore'] as const)('a %s whose COMMIT fails after the bump rolls the bump back with the write', async kind => {
    await withFile(file => {
      let db = SqliteLocalPersistence.open(file);
      try {
        db.saveSnapshot(snapshot('valid'), AT);
        const before = db.loadVersionedSnapshot();
        const input = kind === 'restore' ? restoreRequest(db, new ExportService(learnerFixture('c'), 'test').buildManifest()) : undefined;
        // A deferred foreign-key violation raised by the bump itself only fails at COMMIT, i.e. after every write and the bump ran.
        const raw = new DatabaseSync(file);
        raw.exec(`CREATE TABLE commit_probe (ref INTEGER REFERENCES durable_state(id) DEFERRABLE INITIALLY DEFERRED);
          CREATE TRIGGER fail_at_commit AFTER UPDATE ON durable_state BEGIN INSERT INTO commit_probe (ref) VALUES (-1); END;`);
        raw.close();
        if (kind === 'save') expect(() => db.saveSnapshot(snapshot('changed'), AT, before.revision)).toThrow(/FOREIGN KEY/);
        else expect(() => db.commitRestore(input!)).toThrow(/FOREIGN KEY/);
        expect(db.loadVersionedSnapshot()).toEqual(before);
        db.close();
        const check = new DatabaseSync(file);
        try {
          expect(check.prepare('SELECT COUNT(*) AS n FROM commit_probe').get()).toEqual({ n: 0 });
          check.exec('DROP TRIGGER fail_at_commit; DROP TABLE commit_probe;');
        } finally { check.close(); }
        db = SqliteLocalPersistence.open(file);
        expect(db.loadVersionedSnapshot()).toEqual(before);
        const next = kind === 'save' ? db.saveSnapshot(snapshot('changed'), AT, before.revision) : db.commitRestore(input!).revision;
        expect(next).toBe(`rev:${Number(before.revision.slice(4)) + 1}`);
      } finally { db.close(); }
    });
  });

  it('migrates a populated v10 database to v11 at rev:1 without changing the snapshot', async () => {
    await withFile(file => {
      const first = SqliteLocalPersistence.open(file);
      let expected;
      try { first.saveSnapshot(snapshot('v10 content'), AT); expected = first.loadSnapshot(); } finally { first.close(); }
      const raw = new DatabaseSync(file);
      // lt-584.4: undo v12 too, and put back the blob row a v10 binary always kept (C3 no longer writes one).
      raw.exec('DROP TABLE managed_media_blob; DELETE FROM schema_migration WHERE version=14; DROP TABLE learner_operation_state; DROP TABLE learner_operation_receipt; DROP TABLE operation_owned_row; DELETE FROM schema_migration WHERE version=13; ALTER TABLE legacy_snapshot_json RENAME TO lingotorte_snapshots; DELETE FROM schema_migration WHERE version=12; DROP TABLE durable_state; DELETE FROM schema_migration WHERE version=11; UPDATE lingotorte_schema SET schema_version=10;');
      raw.prepare('INSERT INTO lingotorte_snapshots VALUES (?, ?, ?, ?)').run('default', 10, JSON.stringify(expected), AT);
      raw.close();
      for (let pass = 0; pass < 2; pass += 1) {
        const db = SqliteLocalPersistence.open(file);
        try {
          expect(db.listMigrations().map(m => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
          expect(db.listMigrations()[10]).toMatchObject({ name: 'durable_state_revision', result: 'applied' });
          expect(db.status().schemaVersion).toBe(14);
          expect(db.loadVersionedSnapshot()).toEqual({ snapshot: expected, revision: 'rev:1' });
        } finally { db.close(); }
      }
      const check = new DatabaseSync(file);
      try { expect(check.prepare('SELECT schema_version FROM legacy_snapshot_json').get()).toEqual({ schema_version: 11 }); } finally { check.close(); }
    });
  });
});
