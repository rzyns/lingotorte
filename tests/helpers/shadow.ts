import { expect } from 'vitest';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence.ts';
import type { LocalStoreSnapshot } from '../../packages/storage/src/localStore.ts';

// lt-584.3 (C2 shadow mode), made meaningful for lt-584.4 (C3: tables authoritative). The tables are compared with a
// reference: the snapshot a caller wrote (`expected`), else the retired legacy blob when the database still has one.

const HISTORY = new Set(['reviewEvents', 'practiceAttempts', 'learnerAudit', 'importJobEvents']);
const TRANSCRIPTS = new Set(['cues', 'transcriptWordTimings']);

export type ShadowOptions = Readonly<{
  /** Append-only history may legitimately hold more than the written snapshot (retained earlier history). */
  allowRetainedHistory?: boolean;
  /** A learner-state write carries no transcript bundles; skip those collections. */
  learnerOnly?: boolean;
  /** Transcript bundles are write-once: a snapshot write never removes stored bundles it does not mention. */
  allowRetainedTranscripts?: boolean;
}>;

/** Assert the authoritative tables equal `expected` (or, without it, the legacy blob where one exists). */
export function expectShadowEqual(db: SqliteLocalPersistence, expected?: LocalStoreSnapshot, options: ShadowOptions = {}): void {
  const diff = db.loadSnapshotShadowDiff(expected);
  const entries = Object.entries(diff.collections).filter(([name, c]) => {
    if (options.learnerOnly && TRANSCRIPTS.has(name)) return false;
    if ((options.allowRetainedHistory && HISTORY.has(name)) || (options.allowRetainedTranscripts && TRANSCRIPTS.has(name))) return c.missing !== 0 || c.changed !== 0;
    return !c.equal;
  });
  expect(entries.map(([name, c]) => `${name} (reference ${c.blob}, tables ${c.tables}, missing ${c.missing}, extra ${c.extra}, changed ${c.changed})`), `shadow tables vs ${diff.reference}`).toEqual([]);
}

const WRITES = new Set<PropertyKey>(['saveSnapshot', 'saveLearnerState', 'saveTrackTranscript', 'commitRestore']);

/** Wrap a persistence so that every SUCCESSFUL write is followed by a shadow check against what it wrote: saveSnapshot
 *  and saveLearnerState against their input; saveTrackTranscript and commitRestore against the legacy blob if any.
 *  Failing writes rethrow unchanged. */
export function withShadow(db: SqliteLocalPersistence): SqliteLocalPersistence {
  return new Proxy(db, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== 'function') return value;
      if (!WRITES.has(property)) return (value as (...args: unknown[]) => unknown).bind(target);
      return (...args: unknown[]) => {
        const result = (value as (...args: unknown[]) => unknown).apply(target, args);
        if (property === 'saveSnapshot') expectShadowEqual(target, args[0] as LocalStoreSnapshot, { allowRetainedHistory: true, allowRetainedTranscripts: true });
        else if (property === 'saveLearnerState') expectShadowEqual(target, args[0] as LocalStoreSnapshot, { allowRetainedHistory: true, learnerOnly: true });
        else if (property === 'commitRestore') expectShadowEqual(target, (result as { snapshot: LocalStoreSnapshot }).snapshot);
        else expectShadowEqual(target, target.loadSnapshot());
        return result;
      };
    },
  });
}

/** SqliteLocalPersistence.open, with every successful write shadow-checked. Opening itself is not checked: migration
 *  sites call expectShadowEqual explicitly, because some tests open deliberately corrupt state. */
export function openShadowed(databasePath: string): SqliteLocalPersistence {
  return withShadow(SqliteLocalPersistence.open(databasePath));
}
