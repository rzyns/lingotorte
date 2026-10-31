// lt-192.4 correction R2/R3 (JSDOM unit evidence only, never browser evidence): M1 (mint) and M2 (revoke) are
// serialised per model. A background or recovery M1 that is still outstanding when Disconnect/Forget is clicked must
// settle BEFORE the final M2 is sent; "revoked" is claimed only when that M2 confirmed it and no M1 outcome stayed
// uncertain (timeout/unresolved). An M2 401 or a pairing already lost to an earlier 401 after a mint is disclosed as an
// unconfirmed revocation (a 401 can come from unready private delivery without any cookie rotation).
//
// The fake service models the browser cookie jar and the server's in-memory value set: Set-Cookie lands in the jar
// when the M1 response is delivered; `credentials: 'same-origin'` sends the jar value; the server rotates (revokes
// the presented value) on M1 and revokes the presented value on M2 204.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSDOM } from 'jsdom';
import { rerenderApp } from '../../apps/web/src/app';
import { connectLocalService, setView } from '../../apps/web/src/model.ts';
import { capturedTransport } from '../../apps/web/src/pairedTransport.ts';
import { installRememberedPairing, noteExplicitPairing, setRememberPairingOptIn } from '../../apps/web/src/rememberedPairing.ts';
import { MEDIA_NOT_REVOKED, MEDIA_REVOKED } from '../../apps/web/src/serverMedia.ts';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src/index.ts';
import { SYNTHETIC_CAPABILITY } from './pairingFixture.ts';
import { completeStorage, empty, flush, installDom, json, sameOriginModel } from './lt1924ClientFixture.ts';

vi.setConfig({ testTimeout: 20_000 });
let dom: JSDOM;
beforeEach(() => { dom = installDom(); });
afterEach(() => { vi.unstubAllGlobals(); dom.window.close(); });
const button = (name: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === name) as HTMLButtonElement;
const statusText = () => document.querySelector('#local-service-status')?.textContent ?? '';
const { cues: _cues, transcriptWordTimings: _timings, ...emptyLearner } = createEmptyLocalStoreSnapshot();

/** commit: request held before the server mints; response: minted, Set-Cookie not yet delivered; resolve: delivered,
 *  client continuation held; hang: like response but ignores the abort signal (never settles until released). */
type MintHold = 'commit' | 'response' | 'resolve' | 'hang';
function cookieService() {
  const valid = new Set<string>();
  const delivered: string[] = [];
  let jar: string | undefined;
  let minted = 0;
  const holds: MintHold[] = [];
  let release: () => void = () => undefined;
  let deleteAnswer: 204 | 401 | 'unreachable' = 204;
  let storageAnswer: 200 | 401 = 200;
  const calls: { method: string; path: string; cookie?: string; t: number }[] = [];
  let clock = 0;
  const abortable = (gate: Promise<void>, signal: AbortSignal | null | undefined) => new Promise<void>((resolve, reject) => {
    gate.then(resolve);
    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')), { once: true });
  });
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const cookie = init?.credentials === 'same-origin' && url.pathname.startsWith('/api/media/') ? jar : undefined;
    calls.push({ method, path: url.pathname, ...(cookie ? { cookie } : {}), t: ++clock });
    if (url.pathname === '/api/status') return json(200, { ok: true, managedMedia: { available: true }, config: {}, language: {} });
    if (url.pathname === '/api/state') return json(200, { ok: true, snapshot: emptyLearner, revision: 'rev:1', restoreCapability: 'active-audit-restore-v1' });
    if (url.pathname.endsWith('/storage')) return storageAnswer === 401 ? json(401, { ok: false }) : completeStorage();
    if (url.pathname === '/api/media/session' && method === 'POST') {
      const hold = holds.shift();
      const gate = hold ? new Promise<void>(resolve => { release = resolve; }) : Promise.resolve();
      if (hold === 'commit') await abortable(gate, init?.signal);
      if (cookie) valid.delete(cookie); // server rotation of the presented value
      const value = `value-${++minted}`;
      valid.add(value);
      if (hold === 'response') await abortable(gate, init?.signal);
      if (hold === 'hang') await gate;
      jar = value; delivered.push(value);
      if (hold === 'resolve') await gate;
      return empty(204);
    }
    if (url.pathname === '/api/media/session' && method === 'DELETE') {
      if (deleteAnswer === 'unreachable') throw new TypeError('fetch failed');
      if (deleteAnswer === 401) return json(401, { ok: false, error: 'Pair again.' });
      if (cookie) valid.delete(cookie);
      jar = undefined;
      return empty(204);
    }
    return json(404, {});
  }));
  return {
    valid, delivered, calls,
    hold: (kind: MintHold) => holds.push(kind),
    release: () => release(),
    answerDelete: (answer: 204 | 401 | 'unreachable') => { deleteAnswer = answer; },
    answerStorage: (answer: 200 | 401) => { storageAnswer = answer; },
    methods: () => calls.filter(c => c.path === '/api/media/session').map(c => c.method),
  };
}

async function pairedSettings(remembered = false) {
  const service = cookieService();
  const model = await sameOriginModel(dom);
  if (remembered) {
    const records = new Map<string, unknown>();
    installRememberedPairing(model, { get: async (k: string) => records.get(k), put: async (k: string, v: unknown) => { records.set(k, v); }, delete: async (k: string) => { records.delete(k); } } as never);
    await setRememberPairingOptIn(model, true);
    noteExplicitPairing(model, SYNTHETIC_CAPABILITY, model.localService.baseUrl);
  }
  await connectLocalService(model);
  await flush();
  setView(model, 'settings'); rerenderApp(model);
  expect(service.delivered).toHaveLength(1);
  return { model, service };
}

describe('lt-192.4 M1/M2 serialisation (revocation race)', () => {
  for (const hold of ['commit', 'response', 'resolve'] as const) {
    it(`a background M1 delayed before ${hold === 'commit' ? 'the server commit' : hold === 'response' ? 'its response' : 'the client continuation'} settles before the final M2; old and late values are invalid once "revoked" is shown`, async () => {
      const { model, service } = await pairedSettings();
      const [old] = service.delivered;
      service.hold(hold);
      void connectLocalService(model); // reconnect: its background M1 is held
      await flush();
      expect(service.methods()).toEqual(['POST', 'POST']);
      button('Disconnect local service').click();
      await flush(10);
      expect(service.methods(), 'no M2 while an M1 is outstanding').toEqual(['POST', 'POST']);
      rerenderApp(model);
      expect(statusText()).not.toContain(MEDIA_REVOKED);
      service.release();
      await flush(20);
      rerenderApp(model);
      expect(service.methods()).toEqual(['POST', 'POST', 'DELETE']);
      expect(statusText()).toContain(MEDIA_REVOKED);
      expect(statusText()).not.toContain(MEDIA_NOT_REVOKED);
      expect(service.delivered).toHaveLength(2);
      for (const value of [old!, ...service.delivered]) expect(service.valid.has(value), `${value} still valid after "revoked"`).toBe(false);
      expect(() => capturedTransport(model)).toThrow();
    });
  }

  it('Disconnect and Forget clicked together while an M1 is held: one M2 after it settles, no M1 afterwards, both report the same confirmed result', async () => {
    const { model, service } = await pairedSettings(true);
    service.hold('response');
    void connectLocalService(model);
    await flush();
    rerenderApp(model);
    button('Forget pairing').click();
    button('Disconnect local service').click();
    await flush(10);
    expect(service.methods()).toEqual(['POST', 'POST']);
    service.release();
    await flush(30);
    rerenderApp(model);
    expect(service.methods()).toEqual(['POST', 'POST', 'DELETE']);
    expect(statusText()).toContain(MEDIA_REVOKED);
    expect(statusText()).not.toContain(MEDIA_NOT_REVOKED);
    for (const value of service.delivered) expect(service.valid.has(value)).toBe(false);
  });

  it('an M1 that times out (abort) is uncertain: M2 still runs, but the result is the unconfirmed disclosure', async () => {
    const { model, service } = await pairedSettings();
    service.hold('response'); // never released: the 5 s M1 timeout aborts it
    void connectLocalService(model);
    await flush();
    button('Disconnect local service').click();
    await new Promise(resolve => setTimeout(resolve, 5600));
    await flush(10);
    rerenderApp(model);
    expect(service.methods()).toEqual(['POST', 'POST', 'DELETE']);
    expect(statusText()).toContain(MEDIA_NOT_REVOKED);
    expect(statusText()).not.toContain(MEDIA_REVOKED);
  });

  it('an M1 that never settles (ignores abort) is bounded: M2 runs after the drain bound and the result is unconfirmed; the late value is then honestly still valid', async () => {
    const { model, service } = await pairedSettings();
    service.hold('hang');
    void connectLocalService(model);
    await flush();
    button('Disconnect local service').click();
    await new Promise(resolve => setTimeout(resolve, 6800));
    await flush(10);
    rerenderApp(model);
    expect(service.methods()).toEqual(['POST', 'POST', 'DELETE']);
    expect(statusText()).toContain(MEDIA_NOT_REVOKED);
    expect(statusText()).not.toContain(MEDIA_REVOKED);
    service.release(); await flush(10);
    expect(service.valid.has(service.delivered.at(-1)!)).toBe(true);
    expect(service.methods().filter(m => m === 'POST')).toHaveLength(2);
  });

  it('Forget keeps the bearer: no background M1 afterwards, but a later explicit playback recovery may mint', async () => {
    const { model, service } = await pairedSettings(true);
    rerenderApp(model);
    button('Forget pairing').click();
    await flush(20);
    expect(service.methods()).toEqual(['POST', 'DELETE']);
    expect(() => capturedTransport(model)).not.toThrow();
    // Explicit playback: the server <video> fails (revoked cookie) -> checking access -> M3 complete -> one M1.
    setView(model, 'player'); rerenderApp(model); await flush(); rerenderApp(model);
    const video = document.querySelector('.video-stage video') as HTMLVideoElement;
    expect(video?.getAttribute('src')).toContain('/content');
    vi.spyOn(video, 'load').mockImplementation(() => undefined);
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 4, message: '' } });
    video.dispatchEvent(new dom.window.Event('error'));
    await flush(20);
    expect(service.methods()).toEqual(['POST', 'DELETE', 'POST']);
  });
});

describe('lt-192.4 M2 401 is not proof of revocation', () => {
  it('M2 answered 401 (e.g. private delivery temporarily unready, no restart): the unconfirmed disclosure is shown, never "revoked"', async () => {
    const { model, service } = await pairedSettings();
    service.answerDelete(401);
    button('Disconnect local service').click();
    await flush(20);
    rerenderApp(model);
    expect(service.methods()).toEqual(['POST', 'DELETE']);
    expect(statusText()).toContain(MEDIA_NOT_REVOKED);
    expect(statusText()).not.toContain(MEDIA_REVOKED);
    expect(service.valid.has(service.delivered[0]!)).toBe(true);
  });

  it('pairing already cleared by an earlier 401 after a mint: Disconnect still discloses the unconfirmed revocation (no request is possible)', async () => {
    const { model, service } = await pairedSettings();
    service.answerStorage(401);
    setView(model, 'player'); rerenderApp(model); await flush(10);
    expect(() => capturedTransport(model)).toThrow();
    setView(model, 'settings'); rerenderApp(model);
    button('Disconnect local service').click();
    await flush(20);
    rerenderApp(model);
    expect(service.methods()).toEqual(['POST']);
    expect(statusText()).toContain(MEDIA_NOT_REVOKED);
    expect(statusText()).not.toContain(MEDIA_REVOKED);
  });
});
