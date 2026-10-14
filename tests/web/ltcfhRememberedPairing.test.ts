import { SYNTHETIC_CAPABILITY } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectLocalService, createAppModel, importFixtureMediaAndSubtitles, markUnsavedBrowserEdits, pairLocalService,
  saveModelToLocalService, setLocalServiceBaseUrl,
} from '../../apps/web/src/model';
import { SNAPSHOT_CACHE_KEY, bootSnapshotCache, type SnapshotCacheBackend } from '../../apps/web/src/browserSnapshotCache';
import {
  REMEMBERED_PAIRING_KEY, bootRememberedPairing, forgetRememberedPairing, installRememberedPairing, noteExplicitPairing,
  pairingIsRemembered, setRememberPairingOptIn, type RememberedPairingBackend,
} from '../../apps/web/src/rememberedPairing';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

const revision = `sha256:${'1'.repeat(64)}`;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

class MemoryBackend implements RememberedPairingBackend, SnapshotCacheBackend {
  data = new Map<string, unknown>();
  puts = 0;
  async get(key: string) { return this.data.has(key) ? structuredClone(this.data.get(key)) : undefined; }
  async put(key: string, value: unknown) { this.puts++; this.data.set(key, structuredClone(value)); }
  async delete(key: string) { this.data.delete(key); }
}
type Mode = 'ok' | '401' | 'down';
function stubService(getSnapshot: () => unknown, mode: () => Mode = () => 'ok') {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (mode() === 'down') throw new TypeError('network down');
    if (mode() === '401') return response({ ok: false, error: 'unauthorized' }, 401);
    if (url.endsWith('/api/status')) return response({ ok: true, config: {} });
    if (init?.method === 'PUT') return response({ ok: true, revision, savedAt: '2026-01-01T00:00:00.000Z' });
    return response({ ok: true, snapshot: getSnapshot(), revision });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const empty = () => createAppModel().store.snapshot();
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

async function explicitPair(model: AppModel, backend: MemoryBackend, optIn: boolean) {
  installRememberedPairing(model, backend);
  if (optIn) await setRememberPairingOptIn(model, true);
  pairLocalService(model, SYNTHETIC_CAPABILITY);
  noteExplicitPairing(model, SYNTHETIC_CAPABILITY, model.localService.baseUrl);
  const result = await connectLocalService(model);
  await settle();
  return result;
}
function stored(backend: MemoryBackend) { return backend.data.get(REMEMBERED_PAIRING_KEY) as { origin: string; capability: string; savedAt: string } | undefined; }

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('lt-cfh remembered pairing', () => {
  it('never writes without the opt-in', async () => {
    const backend = new MemoryBackend(); stubService(empty);
    const model = createAppModel();
    expect((await explicitPair(model, backend, false)).ok).toBe(true);
    expect(backend.puts).toBe(0);
    expect(pairingIsRemembered(model)).toBe(false);
  });

  it('writes exactly {origin, capability, savedAt} only after a successful status', async () => {
    const backend = new MemoryBackend(); stubService(empty);
    const model = createAppModel();
    expect((await explicitPair(model, backend, true)).ok).toBe(true);
    const record = stored(backend)!;
    expect(Object.keys(record).sort()).toEqual(['capability', 'origin', 'savedAt']);
    expect(record).toMatchObject({ origin: model.localService.baseUrl, capability: SYNTHETIC_CAPABILITY });
    expect(pairingIsRemembered(model)).toBe(true);
  });

  it('does not write when the connect fails (401 or network)', async () => {
    for (const mode of ['401', 'down'] as const) {
      const backend = new MemoryBackend(); stubService(empty, () => mode);
      const model = createAppModel();
      expect((await explicitPair(model, backend, true)).ok).toBe(false);
      expect(backend.puts).toBe(0);
    }
  });

  it('a later 401 removes the record', async () => {
    const backend = new MemoryBackend(); let mode: Mode = 'ok'; stubService(empty, () => mode);
    const model = createAppModel();
    await explicitPair(model, backend, true);
    expect(stored(backend)).toBeTruthy();
    mode = '401';
    await connectLocalService(model).catch(() => undefined);
    await saveModelToLocalService(model).catch(() => undefined);
    await settle();
    expect(stored(backend)).toBeUndefined();
    expect(pairingIsRemembered(model)).toBe(false);
  });

  it('Forget, unticking and origin change each remove the record', async () => {
    for (const action of ['forget', 'untick', 'origin'] as const) {
      const backend = new MemoryBackend(); stubService(empty);
      const model = createAppModel();
      await explicitPair(model, backend, true);
      expect(stored(backend)).toBeTruthy();
      if (action === 'forget') await forgetRememberedPairing(model);
      if (action === 'untick') await setRememberPairingOptIn(model, false);
      if (action === 'origin') await bootRememberedPairing((() => { const m = createAppModel(); setLocalServiceBaseUrl(m, 'http://127.0.0.1:5999'); return m; })(), backend);
      expect(stored(backend), action).toBeUndefined();
    }
  });

  it('boot with a record pairs and connects without Settings and without a Keep/Load prompt on a clean cache', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pairing = new MemoryBackend(); const cache = new MemoryBackend();
    let service: unknown = empty();
    stubService(() => service);
    const first = createAppModel(); await bootSnapshotCache(first, cache);
    await explicitPair(first, pairing, true).catch(() => undefined);
    await importFixtureMediaAndSubtitles(first, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
    markUnsavedBrowserEdits(first);
    expect((await saveModelToLocalService(first)).ok).toBe(true);
    service = first.store.snapshot();
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();
    expect(stored(pairing)).toBeTruthy();

    const reloaded = createAppModel(); await bootSnapshotCache(reloaded, cache);
    const boot = await bootRememberedPairing(reloaded, pairing);
    expect(boot).not.toBeNull();
    expect(reloaded.localService.status).toBe('connecting');
    await boot!.connect;
    expect(reloaded.localService.status).toBe('connected');
    expect(reloaded.localService.syncState).not.toBe('choice');
    expect(pairingIsRemembered(reloaded)).toBe(true);
  });

  it('boot with a stale record (401) disconnects, removes it, and explicit Settings pairing still works', async () => {
    const backend = new MemoryBackend();
    backend.data.set(REMEMBERED_PAIRING_KEY, { origin: createAppModel().localService.baseUrl, capability: SYNTHETIC_CAPABILITY, savedAt: 'x' });
    let mode: Mode = '401'; stubService(empty, () => mode);
    const model = createAppModel();
    const boot = await bootRememberedPairing(model, backend);
    await boot!.connect; await settle();
    expect(model.localService.status).toBe('error');
    expect(stored(backend)).toBeUndefined();
    mode = 'ok';
    pairLocalService(model, SYNTHETIC_CAPABILITY);
    expect((await connectLocalService(model)).ok).toBe(true);
  });

  it('boot keeps the record on a network error', async () => {
    const backend = new MemoryBackend();
    backend.data.set(REMEMBERED_PAIRING_KEY, { origin: createAppModel().localService.baseUrl, capability: SYNTHETIC_CAPABILITY, savedAt: 'x' });
    stubService(empty, () => 'down');
    const model = createAppModel();
    const boot = await bootRememberedPairing(model, backend);
    await boot!.connect;
    expect(model.localService.status).toBe('error');
    expect(stored(backend)).toBeTruthy();
  });

  it('swallows backend errors with one warning and never rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: RememberedPairingBackend = { get: async () => { throw new Error('boom'); }, put: async () => { throw new Error('boom'); }, delete: async () => { throw new Error('boom'); } };
    const model = createAppModel();
    expect(await bootRememberedPairing(model, broken)).toBeNull();
    await forgetRememberedPairing(model);
    for (const call of warn.mock.calls) expect(JSON.stringify(call)).not.toContain(SYNTHETIC_CAPABILITY);
    warn.mockRestore();
  });

  it('deep scan: capability only in the pairing record, never in the snapshot cache, localStorage or sessionStorage', async () => {
    const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('localStorage', dom.window.localStorage); vi.stubGlobal('sessionStorage', dom.window.sessionStorage);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pairing = new MemoryBackend(); const cache = new MemoryBackend();
    stubService(empty);
    const model = createAppModel(); await bootSnapshotCache(model, cache);
    await explicitPair(model, pairing, true).catch(() => undefined);
    markUnsavedBrowserEdits(model);
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();
    expect(JSON.stringify(cache.data.get(SNAPSHOT_CACHE_KEY))).not.toContain(SYNTHETIC_CAPABILITY);
    expect(JSON.stringify(model.store.snapshot())).not.toContain(SYNTHETIC_CAPABILITY);
    for (const storage of [dom.window.localStorage, dom.window.sessionStorage]) {
      for (let i = 0; i < storage.length; i++) expect(storage.getItem(storage.key(i)!) ?? '').not.toContain(SYNTHETIC_CAPABILITY);
    }
    expect(stored(pairing)?.capability).toBe(SYNTHETIC_CAPABILITY);
  });

  it('Settings shows the opt-in (off by default), then the remembered note and Forget button', async () => {
    const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
    for (const [k, v] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver })) vi.stubGlobal(k, v);
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const backend = new MemoryBackend(); stubService(empty);
    const model = createAppModel();
    installRememberedPairing(model, backend);
    model.view = 'settings';
    rerenderApp(model);
    const box = () => dom.window.document.querySelector<HTMLInputElement>('#local-service-remember-pairing')!;
    expect(box().checked).toBe(false);
    expect(dom.window.document.body.textContent).toContain('Reload requires fresh pairing.');
    await explicitPair(model, backend, true);
    rerenderApp(model);
    expect(box().checked).toBe(true);
    expect(dom.window.document.body.textContent).toContain('Remembered on this device until the service restarts');
    const forget = [...dom.window.document.querySelectorAll('button')].find((b) => b.textContent === 'Forget pairing')!;
    forget.click(); await settle();
    expect(stored(backend)).toBeUndefined();
  });
});
