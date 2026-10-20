import { SYNTHETIC_CAPABILITY, pairedModel } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectLocalService, createAppModel, importFixtureMediaAndSubtitles, markUnsavedBrowserEdits, pairLocalService,
  resolveLocalServiceConnection, saveModelToLocalService,
} from '../../apps/web/src/model';
import {
  RESTORED_FROM_CACHE_MESSAGE, SNAPSHOT_CACHE_KEY, SNAPSHOT_CACHE_SCHEMA_VERSION, bootSnapshotCache, clearSnapshotCache,
  readSnapshotCache, type SnapshotCacheBackend,
} from '../../apps/web/src/browserSnapshotCache';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

const revision = `sha256:${'1'.repeat(64)}`;
const revision2 = `sha256:${'2'.repeat(64)}`;
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
function stubService(getSnapshot: () => unknown, rev = () => revision) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/status')) return response({ ok: true, config: {} });
    if (init?.method === 'PUT') return response({ ok: true, revision: rev(), savedAt: '2026-01-01T00:00:00.000Z' });
    return response({ ok: true, snapshot: getSnapshot(), revision: rev() });
  }));
}
const flush = async () => { await vi.advanceTimersByTimeAsync(600); };

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('lt-0zc browser snapshot cache', () => {
  it('boots empty without a cache and proceeds immediately when IndexedDB is unavailable', async () => {
    const model = createAppModel();
    expect(await bootSnapshotCache(model, new MemoryBackend())).toBe(false);
    expect(model.currentMedia).toBeNull();
    expect(await readSnapshotCache()).toBeNull(); // no indexedDB in node env
  });

  it('writes after the 500 ms debounce and hydrates a fresh model on boot', async () => {
    vi.useFakeTimers();
    const backend = new MemoryBackend();
    const first = createAppModel();
    await bootSnapshotCache(first, backend);
    await loadFixture(first);
    markUnsavedBrowserEdits(first);
    await vi.advanceTimersByTimeAsync(400);
    expect(backend.puts).toBe(0);
    markUnsavedBrowserEdits(first);
    await vi.advanceTimersByTimeAsync(400);
    expect(backend.puts).toBe(0);
    await flush();
    expect(backend.puts).toBe(1);
    const stored = backend.data.get(SNAPSHOT_CACHE_KEY) as { schemaVersion: number; snapshot: unknown };
    expect(stored.schemaVersion).toBe(SNAPSHOT_CACHE_SCHEMA_VERSION);
    expect(stored.snapshot).toEqual(first.store.snapshot());

    const reloaded = createAppModel();
    expect(await bootSnapshotCache(reloaded, backend)).toBe(true);
    expect(reloaded.store.snapshot()).toEqual(first.store.snapshot());
    expect(reloaded.currentMedia?.id).toBe(first.currentMedia?.id);
    expect(reloaded.targetTrackId).toBe(first.targetTrackId);
    expect(reloaded.nativeTrackId).toBe(first.nativeTrackId);
    expect(reloaded.cues.length).toBeGreaterThan(0);
    expect(reloaded.localService.syncState).toBe('unsaved');
    expect(reloaded.localService.lastMessage).toBe(RESTORED_FROM_CACHE_MESSAGE);
  });

  it('lt-584.5: drops a v1 (full-snapshot) record on upgrade to v2 and starts from an empty model', async () => {
    const source = createAppModel();
    await loadFixture(source);
    const backend = new MemoryBackend();
    backend.data.set(SNAPSHOT_CACHE_KEY, { schemaVersion: 1, savedAt: 'x', snapshot: source.store.snapshot(), currentMediaId: source.currentMedia!.id, targetTrackId: source.targetTrackId, nativeTrackId: source.nativeTrackId, localService: { baseUrl: 'http://127.0.0.1:5174', autosaveEnabled: true }, lastAcked: null });
    expect(SNAPSHOT_CACHE_SCHEMA_VERSION).toBe(2);
    const model = createAppModel();
    expect(await bootSnapshotCache(model, backend)).toBe(false);
    expect(backend.data.has(SNAPSHOT_CACHE_KEY)).toBe(false);
    expect(model.currentMedia).toBeNull();
    expect(model.store.snapshot().cues).toEqual({});
  });

  it('ignores a record with a mismatched schemaVersion', async () => {
    const backend = new MemoryBackend();
    backend.data.set(SNAPSHOT_CACHE_KEY, { schemaVersion: 999, snapshot: {}, localService: {} });
    const model = createAppModel();
    expect(await bootSnapshotCache(model, backend)).toBe(false);
    expect(model.localService.syncState).toBeUndefined();
  });

  it('survives a failing backend without blocking boot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: SnapshotCacheBackend = { get: async () => { throw new Error('idb boom'); }, put: async () => { throw new Error('idb boom'); }, delete: async () => { throw new Error('idb boom'); } };
    const model = createAppModel();
    expect(await bootSnapshotCache(model, broken)).toBe(false);
    await clearSnapshotCache(broken);
    warn.mockRestore();
  });

  it('never overwrites a good cache after a timed-out or failed boot read', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = createAppModel(); await loadFixture(source);
    const good = { schemaVersion: SNAPSHOT_CACHE_SCHEMA_VERSION, savedAt: 'x', snapshot: source.store.snapshot(), currentMediaId: null, targetTrackId: null, nativeTrackId: null, localService: { baseUrl: '/', autosaveEnabled: false }, lastAcked: null };
    for (const kind of ['slow', 'error'] as const) {
      const backend = new MemoryBackend();
      backend.data.set(SNAPSHOT_CACHE_KEY, structuredClone(good));
      const original = backend.get.bind(backend);
      backend.get = kind === 'slow'
        ? (key: string) => new Promise((resolve) => { setTimeout(() => resolve(original(key)), 5000); })
        : async () => { throw new Error('idb boom'); };
      const model = createAppModel();
      const booting = bootSnapshotCache(model, backend);
      await vi.advanceTimersByTimeAsync(1600);
      expect(await booting).toBe(false);
      await loadFixture(model);
      markUnsavedBrowserEdits(model);
      await vi.advanceTimersByTimeAsync(6000);
      expect(backend.puts, kind).toBe(0);
      expect(backend.data.get(SNAPSHOT_CACHE_KEY), kind).toEqual(good);
    }
    warn.mockRestore();
  });

  it('renders a hydrated media without a playable object URL safely', async () => {
    const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
    Object.assign(globalThis, { document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement,
      Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0 });
    const backend = new MemoryBackend();
    const first = createAppModel(); await loadFixture(first);
    first.store.putMediaAsset({ ...first.currentMedia!, originalPath: 'blob:http://localhost/gone' });
    const { writeSnapshotCache } = await import('../../apps/web/src/browserSnapshotCache');
    await writeSnapshotCache(first, backend);
    const reloaded = createAppModel();
    await bootSnapshotCache(reloaded, backend);
    expect(reloaded.browserLocalMedia.objectUrl).toBeNull();
    expect(() => rerenderApp(reloaded)).not.toThrow();
    expect(dom.window.document.body.textContent).toContain(RESTORED_FROM_CACHE_MESSAGE);
  });

  it('reconnect with an unchanged cache (acked baseline) skips the choice prompt', async () => {
    vi.useFakeTimers();
    const backend = new MemoryBackend();
    const first = pairedModel(); await bootSnapshotCache(first, backend);
    let service: unknown = createEmptyFor(first);
    stubService(() => service);
    await connectLocalService(first);
    await loadFixture(first); markUnsavedBrowserEdits(first);
    expect((await saveModelToLocalService(first)).ok).toBe(true);
    service = first.store.snapshot();
    await flush();
    const reloaded = createAppModel(); await bootSnapshotCache(reloaded, backend);
    pairLocalService(reloaded, SYNTHETIC_CAPABILITY);
    expect((await connectLocalService(reloaded)).ok).toBe(true);
    expect(reloaded.localService.syncState).not.toBe('choice');
    expect(reloaded.store.snapshot()).toEqual(service);
  });

  it('reconnect with newer cached edits prompts; Load service state overwrites the cache', async () => {
    vi.useFakeTimers();
    const backend = new MemoryBackend();
    const first = pairedModel(); await bootSnapshotCache(first, backend);
    let service: unknown = createEmptyFor(first);
    stubService(() => service);
    await connectLocalService(first);
    await loadFixture(first); markUnsavedBrowserEdits(first);
    await saveModelToLocalService(first);
    service = first.store.snapshot();
    first.store.putMediaAsset({ ...first.currentMedia!, title: 'newer browser edit' }); markUnsavedBrowserEdits(first);
    await flush();
    const reloaded = createAppModel(); await bootSnapshotCache(reloaded, backend);
    expect(reloaded.currentMedia?.title).toBe('newer browser edit');
    pairLocalService(reloaded, SYNTHETIC_CAPABILITY);
    stubService(() => service, () => revision2);
    expect((await connectLocalService(reloaded)).ok).toBe(false);
    expect(reloaded.localService.syncState).toBe('choice');
    expect(resolveLocalServiceConnection(reloaded, 'service').ok).toBe(true);
    await flush();
    const stored = backend.data.get(SNAPSHOT_CACHE_KEY) as { snapshot: unknown };
    expect(stored.snapshot).toEqual(service);
  });

  it('never stores the pairing capability or secret-like keys (A28)', async () => {
    vi.useFakeTimers();
    const backend = new MemoryBackend();
    const model = pairedModel(); await bootSnapshotCache(model, backend);
    stubService(() => createEmptyFor(model));
    await connectLocalService(model);
    await loadFixture(model);
    model.transcriptLifecycle.pendingCueEdits = { x: 'draft' } as never;
    markUnsavedBrowserEdits(model);
    await saveModelToLocalService(model).catch(() => undefined);
    await flush();
    const stored = backend.data.get(SNAPSHOT_CACHE_KEY);
    expect(stored).toBeTruthy();
    const scan = (value: unknown, path: string): void => {
      if (typeof value === 'string') { expect(value.includes(SYNTHETIC_CAPABILITY), path).toBe(false); return; }
      if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
        expect(/capability|secret|token|pendingCueEdits/i.test(k), `${path}.${k}`).toBe(false);
        scan(v, `${path}.${k}`);
      }
    };
    scan(stored, 'record');
  });
});

function createEmptyFor(model: AppModel) {
  void model;
  return createAppModel().store.snapshot();
}
