import { expect } from 'vitest';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence.ts';

// lt-584.3 (C2 shadow mode): the table-assembled snapshot must equal the blob-backed one.

function divergent(db: SqliteLocalPersistence) {
  const diff = db.loadSnapshotShadowDiff();
  return { diff, entries: Object.entries(diff.collections).filter(([, c]) => !c.equal) };
}

/** Assert that every collection assembled from the entity tables equals the blob-backed snapshot. */
export function expectShadowEqual(db: SqliteLocalPersistence): void {
  const { diff, entries } = divergent(db);
  expect(entries.map(([name, c]) => `${name} (blob ${c.blob}, tables ${c.tables}, missing ${c.missing}, extra ${c.extra}, changed ${c.changed})`), 'shadow tables vs blob').toEqual([]);
  expect(diff.equal).toBe(true);
}

/**
 * Migration-only opens of LEGACY fixtures: projection tables that older versions never filled stay empty until the
 * next save, so exactly `collections` lack rows. Asserts that set exactly, and that nothing present in the tables is
 * extra or changed (no row-mapping gap). C3's one-time v12 backfill must turn every such site into expectShadowEqual.
 */
export function expectShadowPendingBackfill(db: SqliteLocalPersistence, collections: readonly string[]): void {
  const { entries } = divergent(db);
  expect(entries.map(([name]) => name).sort(), 'collections awaiting the C3 backfill').toEqual([...collections].sort());
  for (const [name, c] of entries) expect({ name, extra: c.extra, changed: c.changed }).toEqual({ name, extra: 0, changed: 0 });
}

const WRITES = new Set<PropertyKey>(['saveSnapshot', 'saveStore', 'commitRestore']);

/** Wrap a persistence so that every SUCCESSFUL save/restore is followed by expectShadowEqual. Failing writes rethrow unchanged. */
export function withShadow(db: SqliteLocalPersistence): SqliteLocalPersistence {
  return new Proxy(db, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== 'function') return value;
      if (!WRITES.has(property)) return (value as (...args: unknown[]) => unknown).bind(target);
      return (...args: unknown[]) => {
        const result = (value as (...args: unknown[]) => unknown).apply(target, args);
        expectShadowEqual(target);
        return result;
      };
    },
  });
}

/** SqliteLocalPersistence.open, with every successful save/restore shadow-checked. Opening itself is not checked: migration
 *  sites call expectShadowEqual / expectShadowPendingBackfill explicitly, because some tests open deliberately corrupt state. */
export function openShadowed(databasePath: string): SqliteLocalPersistence {
  return withShadow(SqliteLocalPersistence.open(databasePath));
}
