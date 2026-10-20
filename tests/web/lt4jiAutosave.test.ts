import { captureLexeme } from '../helpers/capture';
import { SYNTHETIC_CAPABILITY, pairedModel } from './pairingFixture.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectLocalService, createAppModel, importFixtureMediaAndSubtitles, pairLocalService, persistIfLocalServiceAutosaveEnabled, setLocalServiceAutosave } from '../../apps/web/src/model';
import {
  SNAPSHOT_CACHE_KEY, SNAPSHOT_CACHE_SCHEMA_VERSION, bootSnapshotCache, buildSnapshotCacheRecord, type SnapshotCacheBackend,
} from '../../apps/web/src/browserSnapshotCache';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src';
import type { AppModel } from '../../apps/web/src/uiTypes';

const revision = `sha256:${'4'.repeat(64)}`;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

class MemoryBackend implements SnapshotCacheBackend {
  data = new Map<string, unknown>();
  puts = 0;
  async get(key: string) { return this.data.has(key) ? structuredClone(this.data.get(key)) : undefined; }
  async put(key: string, value: unknown) { this.puts++; this.data.set(key, structuredClone(value)); }
  async delete(key: string) { this.data.delete(key); }
}
async function loadFixture(model: AppModel) {
  await importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
}
/** Service stub that records PUTs; `remote` is what GET /api/state returns. */
function stubService(remote: () => unknown) {
  const puts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/status')) return response({ ok: true, config: {} });
    if (init?.method === 'PUT' && /\/api\/tracks\/[^/]+\/transcript$/.test(url)) return response({ ok: true, revision, savedAt: '2026-10-14T00:00:00.000Z' });
    if (init?.method === 'PUT') { puts.push(init.body); return response({ ok: true, revision, savedAt: '2026-10-14T00:00:00.000Z' }); }
    return response({ ok: true, snapshot: remote(), revision });
  }));
  return puts;
}
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('lt-4ji autosave preference', () => {
  it('defaults on for a fresh model', () => {
    expect(createAppModel().localService.autosaveEnabled).toBe(true);
  });

  it('pairing success keeps the preference (on stays on, off stays off)', () => {
    expect(pairedModel().localService.autosaveEnabled).toBe(true);
    const model = createAppModel(); setLocalServiceAutosave(model, false);
    pairLocalService(model, SYNTHETIC_CAPABILITY);
    expect(model.localService.autosaveEnabled).toBe(false);
  });

  it('pairing failure (401) keeps the preference', async () => {
    const model = pairedModel();
    vi.stubGlobal('fetch', vi.fn(async () => response({ ok: false }, 401)));
    await connectLocalService(model);
    expect(model.localService.status).toBe('error');
    expect(model.localService.autosaveEnabled).toBe(true);
  });

  it.each([true, false])('restores a cached preference of %s', async (value) => {
    const source = createAppModel(); setLocalServiceAutosave(source, value);
    const backend = new MemoryBackend(); backend.data.set(SNAPSHOT_CACHE_KEY, buildSnapshotCacheRecord(source));
    const model = createAppModel(); setLocalServiceAutosave(model, !value);
    expect(await bootSnapshotCache(model, backend)).toBe(true);
    expect(model.localService.autosaveEnabled).toBe(value);
  });

  it('an old cached record lacking the field restores the default (on)', async () => {
    const backend = new MemoryBackend();
    backend.data.set(SNAPSHOT_CACHE_KEY, { schemaVersion: SNAPSHOT_CACHE_SCHEMA_VERSION, savedAt: 'x', snapshot: createAppModel().store.snapshot(), currentMediaId: null, targetTrackId: null, nativeTrackId: null, localService: { baseUrl: '/' }, lastAcked: null });
    const model = createAppModel();
    expect(await bootSnapshotCache(model, backend)).toBe(true);
    expect(model.localService.autosaveEnabled).toBe(true);
  });

  it('toggling the preference schedules a cache write', async () => {
    vi.useFakeTimers();
    const backend = new MemoryBackend(); const model = createAppModel();
    await bootSnapshotCache(model, backend);
    const before = backend.puts;
    setLocalServiceAutosave(model, false);
    await vi.advanceTimersByTimeAsync(600);
    expect(backend.puts).toBe(before + 1);
    expect((backend.data.get(SNAPSHOT_CACHE_KEY) as { localService: { autosaveEnabled: boolean } }).localService.autosaveEnabled).toBe(false);
  });

  it('does not autosave while a Keep/Load choice is unresolved', async () => {
    const model = pairedModel(); await loadFixture(model);
    const remote = pairedModel(); await loadFixture(remote); remote.store.putMediaAsset({ ...remote.currentMedia!, title: 'remote' });
    const puts = stubService(() => remote.store.snapshot());
    expect((await connectLocalService(model)).ok).toBe(false);
    expect(model.localService.syncState).toBe('choice');
    persistIfLocalServiceAutosaveEnabled(model); await settle();
    expect(puts).toHaveLength(0);
  });

  it('does not autosave into a conflict', async () => {
    const model = pairedModel(); await loadFixture(model);
    const puts = stubService(() => createEmptyLocalStoreSnapshot());
    await connectLocalService(model);
    model.localService.syncState = 'conflict';
    persistIfLocalServiceAutosaveEnabled(model); await settle();
    expect(puts).toHaveLength(0);
  });

  it('connected + one edit saves exactly once without visiting Settings', async () => {
    const model = pairedModel(); await loadFixture(model);
    const puts = stubService(() => createEmptyLocalStoreSnapshot());
    expect((await connectLocalService(model)).ok).toBe(true);
    expect(model.localService.status).toBe('connected');
    const savedBefore = model.localService.lastSavedAt; const putsBefore = puts.length;
    model.store.putMediaAsset({ ...model.currentMedia!, title: 'edited' });
    persistIfLocalServiceAutosaveEnabled(model); await settle();
    expect(puts.length - putsBefore).toBe(1);
    expect(model.localService.lastSavedAt).not.toBe(savedBefore);
    expect(model.localService.lastSavedAt).not.toBeNull();
  });
});

describe('lt-4ji connect never writes to the service', () => {
  it('service equal to browser: zero writes on connect', async () => {
    const model = pairedModel(); await loadFixture(model);
    const snap = model.store.snapshot();
    const puts = stubService(() => snap);
    expect((await connectLocalService(model)).ok).toBe(true); await settle();
    expect(puts).toHaveLength(0);
  });

  it('service differs: choice pending, zero writes on connect and after an edit', async () => {
    const model = pairedModel(); await loadFixture(model);
    const remote = pairedModel(); await loadFixture(remote); remote.store.putMediaAsset({ ...remote.currentMedia!, title: 'remote' });
    const puts = stubService(() => remote.store.snapshot());
    await connectLocalService(model); await settle();
    expect(model.localService.syncState).toBe('choice');
    expect(puts).toHaveLength(0);
    model.store.putMediaAsset({ ...model.currentMedia!, title: 'edit-during-choice' });
    persistIfLocalServiceAutosaveEnabled(model); await settle();
    expect(puts).toHaveLength(0);
  });

  it('service empty, browser has content: zero writes on connect, first edit writes once', async () => {
    const model = pairedModel(); await loadFixture(model);
    const puts = stubService(() => createEmptyLocalStoreSnapshot());
    await connectLocalService(model); await settle();
    expect(puts).toHaveLength(0);
    model.store.putMediaAsset({ ...model.currentMedia!, title: 'first-edit' });
    persistIfLocalServiceAutosaveEnabled(model); await settle();
    expect(puts).toHaveLength(1);
  });

  it("'unknown' cache read then non-empty service: loads service, one edit writes service content plus the edit", async () => {
    const failing: SnapshotCacheBackend = { get: async () => { throw new Error('cache down'); }, put: vi.fn(async () => {}), delete: async () => {} };
    const model = pairedModel();
    expect(await bootSnapshotCache(model, failing)).toBe(false);
    const remote = pairedModel(); await loadFixture(remote); remote.store.putMediaAsset({ ...remote.currentMedia!, title: 'service-prior' });
    const remoteSnap = remote.store.snapshot();
    const puts = stubService(() => remoteSnap);
    expect((await connectLocalService(model)).ok).toBe(true); await settle();
    expect(puts).toHaveLength(0);
    expect(JSON.stringify(model.store.snapshot())).toContain('service-prior');
    const asset = Object.values(remoteSnap.mediaAssets)[0]!;
    model.store.putMediaAsset({ ...asset, id: `${asset.id}-edit`, title: 'new-edit' });
    persistIfLocalServiceAutosaveEnabled(model); await settle();
    expect(puts).toHaveLength(1);
    expect(String(puts[0])).toContain('service-prior');
    expect(String(puts[0])).toContain('new-edit');
    expect(failing.put).not.toHaveBeenCalled();
  });

  it('acceptance: capturing a word through the Player save path writes once and updates lastSavedAt', async () => {
    const model = pairedModel(); await loadFixture(model);
    const puts = stubService(() => createEmptyLocalStoreSnapshot());
    expect((await connectLocalService(model)).ok).toBe(true); await settle();
    expect(puts).toHaveLength(0);
    expect(model.localService.lastSavedAt).toBeNull();
    const cue = model.cues[0]!; const word = cue.text.split(/\s+/)[0]!;
    expect(await captureLexeme(model, cue, word, 0, word.length, 0)).not.toBeNull();
    await settle();
    expect(puts).toHaveLength(1);
    expect(String(puts[0])).toContain(word);
    expect(model.localService.lastSavedAt).not.toBeNull();
  });
});
