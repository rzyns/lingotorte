import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startPairedService, pairedFetch } from '../helpers/pairedService.ts';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence';
import { makeMediaAsset } from '../../packages/domain/src';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });
const snapshot = (title: string) => {
  const value = createEmptyLocalStoreSnapshot();
  const media = makeMediaAsset({ title, originalPath: 'fixtures/media/synthetic-polish-dialogue.webm', contentSha256: `sha256:${'1'.repeat(64)}`, durationMs: 1000, container: 'webm', sizeBytes: 1024, privacyLabel: 'synthetic' });
  value.mediaAssets[media.id] = media;
  return value;
};

it('rejects two stale HTTP writers and missing revisions without replacing durable state; reopens SQLite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lt-save-safety-'));
  const config = { host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false };
  let service = await startPairedService(config);
  cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const get = () => pairedFetch(`${service.origin}/api/state`).then(r => r.json());
  const put = (value: unknown, expectedRevision?: unknown) => pairedFetch(`${service.origin}/api/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot: value, expectedRevision }) });
  const a = await get(); const b = await get();
  const first = snapshot('first'); const stale = snapshot('stale');
  expect((await put(first, a.revision)).status).toBe(200);
  const acknowledged = await get();
  expect((await put(stale, b.revision)).status).toBe(409);
  expect((await put(stale)).status).toBe(428);
  expect((await put(stale, 'bad token!')).status).toBe(400);
  const invalid = snapshot('invalid'); const media = Object.values(invalid.mediaAssets)[0]!;
  invalid.mediaAssets[media.id] = { ...media, durationMs: -1 };
  const failed = await put(invalid, acknowledged.revision);
  expect(failed.status).toBe(400); expect(await failed.json()).toMatchObject({ ok: false });
  expect(await get()).toEqual(acknowledged);
  await service.close(); service = await startPairedService(config);
  expect(await get()).toEqual(acknowledged);
  expect((await put(stale, b.revision)).status).toBe(409);
});

it('rolls back failed saves, preserving revision and durable state across reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lt-save-rollback-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'state.db');
  let persistence = SqliteLocalPersistence.open(file);
  persistence.saveSnapshot(snapshot('valid'));
  const before = persistence.loadVersionedSnapshot();
  // A projection CHECK failure occurs after the snapshot write, within the real transaction.
  const broken = snapshot('invalid'); const invalidMedia = Object.values(broken.mediaAssets)[0]!;
  broken.mediaAssets[invalidMedia.id] = { ...invalidMedia, durationMs: -1 };
  expect(() => persistence.saveSnapshot(broken, undefined, before.revision)).toThrow();
  expect(persistence.loadVersionedSnapshot()).toEqual(before);
  persistence.close(); persistence = SqliteLocalPersistence.open(file);
  expect(persistence.loadVersionedSnapshot()).toEqual(before); persistence.close();
});

it('enforces CAS across independent SQLite connections and direct trusted persistence writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lt-two-writers-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'state.db');
  const a = SqliteLocalPersistence.open(file); const b = SqliteLocalPersistence.open(file);
  try {
    const stale = b.loadVersionedSnapshot();
    const revision = a.saveSnapshot(snapshot('first'), undefined, stale.revision);
    expect(() => b.saveSnapshot(snapshot('stale'), undefined, stale.revision)).toThrow(/Durable state changed/);
    expect(b.loadVersionedSnapshot().revision).toBe(revision);
    const fresh = b.loadVersionedSnapshot();
    a.saveSnapshot(snapshot('trusted internal change'));
    expect(() => b.saveSnapshot(snapshot('stale after internal write'), undefined, fresh.revision)).toThrow(/Durable state changed/);
    const equivalent = a.loadVersionedSnapshot();
    expect(a.saveSnapshot(equivalent.snapshot, undefined, equivalent.revision)).toBe(`rev:${Number(equivalent.revision.slice(4)) + 1}`);
  } finally { a.close(); b.close(); }
});

it('accepts exactly one competing HTTP snapshot from the same durable revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lt-http-race-'));
  const config = { host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false };
  const a = await startPairedService(config); const b = await startPairedService(config);
  cleanups.push(async () => { await a.close(); await b.close(); await rm(root, { recursive: true, force: true }); });
  const state = await pairedFetch(`${a.origin}/api/state`).then(r => r.json());
  const candidates = [snapshot('a'), snapshot('b')];
  const replies = await Promise.all([a, b].map((service, index) => pairedFetch(`${service.origin}/api/state`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot: candidates[index], expectedRevision: state.revision }),
  })));
  expect(replies.map(r => r.status).sort()).toEqual([200, 409]);
  const winner = replies.findIndex(r => r.status === 200); const ack = await replies[winner]!.json();
  const loaded = await pairedFetch(`${a.origin}/api/state`).then(r => r.json());
  expect(loaded.snapshot).toEqual(candidates[winner]); expect(loaded.revision).toBe(ack.revision);
});
