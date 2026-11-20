// lt-192.4 S11 / N24-N25 client side (JSDOM unit evidence only): Disconnect and Forget pairing both send M2
// (DELETE, bearer, credentials 'same-origin') FIRST, while the transport is current. Forget keeps the bearer.
// An unconfirmed revocation is disclosed and never reported as ended.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSDOM } from 'jsdom';
import { rerenderApp } from '../../apps/web/src/app';
import { connectLocalService, setView } from '../../apps/web/src/model.ts';
import { capturedTransport } from '../../apps/web/src/pairedTransport.ts';
import { installRememberedPairing, noteExplicitPairing, pairingIsRemembered, setRememberPairingOptIn } from '../../apps/web/src/rememberedPairing.ts';
import { MEDIA_NOT_REVOKED, MEDIA_REVOKED, revokeMediaSession } from '../../apps/web/src/serverMedia.ts';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src/index.ts';
import { SYNTHETIC_CAPABILITY } from './pairingFixture.ts';
import { completeStorage, empty, flush, installDom, json, noteStatus, sameOriginModel, scriptedFetch, type Route } from './lt1924ClientFixture.ts';

let dom: JSDOM;
beforeEach(() => { dom = installDom(); });
afterEach(() => { vi.unstubAllGlobals(); dom.window.close(); });
const button = (name: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === name) as HTMLButtonElement;
const statusText = () => document.querySelector('#local-service-status')?.textContent ?? '';

const { cues: _cues, transcriptWordTimings: _timings, ...emptyLearner } = createEmptyLocalStoreSnapshot();
/** A real connectLocalService against a scripted same-origin service (status reports managed media available). */
async function settingsModel(route: Route, remembered = false) {
  let pairedAtM2: boolean | undefined;
  let phase: 'connect' | 'test' = 'connect';
  const recorded = scriptedFetch((method, path) => {
    if (phase === 'connect' && path === '/api/status') return json(200, { ok: true, managedMedia: { available: true }, config: {}, language: {} });
    if (phase === 'connect' && path === '/api/state') return json(200, { ok: true, snapshot: emptyLearner, revision: 'rev:1', restoreCapability: 'active-audit-restore-v1' });
    if (phase === 'connect') return ok(method, path);
    if (method === 'DELETE' && path === '/api/media/session') pairedAtM2 = (() => { try { capturedTransport(model); return true; } catch { return false; } })();
    return route(method, path);
  });
  const model = await sameOriginModel(dom);
  const records = new Map<string, unknown>();
  if (remembered) {
    installRememberedPairing(model, { get: async (k: string) => records.get(k), put: async (k: string, v: unknown) => { records.set(k, v); }, delete: async (k: string) => { records.delete(k); } } as never);
    await setRememberPairingOptIn(model, true);
    noteExplicitPairing(model, SYNTHETIC_CAPABILITY, model.localService.baseUrl);
  }
  await connectLocalService(model);
  await flush();
  const connectCalls = recorded.calls.map(c => `${c.method} ${c.path}`);
  setView(model, 'settings'); rerenderApp(model);
  phase = 'test';
  recorded.calls.length = 0;
  return { model, calls: recorded.calls, connectCalls, records, pairedAtM2: () => pairedAtM2 };
}
const ok: Route = (_method, path) => path === '/api/media/session' ? empty(204) : path.endsWith('/storage') ? completeStorage() : json(404, {});

describe('lt-192.4 revoke on Disconnect / Forget', () => {
  it('connect (status OK, same-origin, available) mints M1 with same-origin credentials without blocking connect', async () => {
    const { connectCalls, calls } = await settingsModel(ok);
    expect(connectCalls.slice(0, 3)).toEqual(['GET /api/status', 'POST /api/media/session', 'GET /api/state']);
    expect(calls).toEqual([]);
  });
  it('Disconnect: M2 first (DELETE, bearer, same-origin credentials) while paired, then the bearer is cleared; success is stated', async () => {
    const { model, calls, pairedAtM2 } = await settingsModel(ok);
    button('Disconnect local service').click();
    await flush();
    expect(calls.map(c => `${c.method} ${c.path}`)).toEqual(['DELETE /api/media/session']);
    expect(calls[0]).toMatchObject({ credentials: 'same-origin', bearer: true });
    expect(pairedAtM2()).toBe(true);
    expect(() => capturedTransport(model)).toThrow();
    rerenderApp(model);
    expect(statusText()).toContain(MEDIA_REVOKED);
    expect(statusText()).not.toContain(MEDIA_NOT_REVOKED);
  });
  it('Disconnect while the service is unreachable or M2 fails: pairing still cleared, the disclosure is shown, nothing claims revocation', async () => {
    for (const route of [(() => 'unreachable') as Route, (() => json(500, {})) as Route]) {
      const { model, calls } = await settingsModel(route);
      button('Disconnect local service').click();
      await flush();
      expect(calls.map(c => c.method)).toEqual(['DELETE']);
      expect(() => capturedTransport(model)).toThrow();
      rerenderApp(model);
      expect(statusText()).toContain(MEDIA_NOT_REVOKED);
      expect(statusText()).not.toContain(MEDIA_REVOKED);
      // No URL token or any other credential is tried afterwards.
      expect(calls).toHaveLength(1);
      document.querySelector('main')!.innerHTML = '';
    }
  });
  it('no managed library (404) or a known-unavailable service: no disclosure and no false claim', async () => {
    const { model } = await settingsModel(() => json(404, {}));
    expect(await revokeMediaSession(model)).toBe('not-applicable');
    const second = await settingsModel(ok);
    await noteStatus(second.model, false);
    expect(await revokeMediaSession(second.model)).toBe('not-applicable');
    expect(second.calls).toHaveLength(0);
  });
  it('Forget pairing (the real button) revokes first, deletes the record and keeps the bearer; unreachable is disclosed', async () => {
    for (const [route, sentence] of [[ok, MEDIA_REVOKED], [(() => 'unreachable') as Route, MEDIA_NOT_REVOKED]] as const) {
      const { model, calls, records, pairedAtM2 } = await settingsModel(route, true);
      expect(pairingIsRemembered(model)).toBe(true); expect(records.size).toBe(1);
      button('Forget pairing').click();
      await flush(10);
      expect(calls).toEqual([expect.objectContaining({ method: 'DELETE', path: '/api/media/session', credentials: 'same-origin', bearer: true })]);
      expect(pairedAtM2()).toBe(true);
      expect(records.size).toBe(0); expect(pairingIsRemembered(model)).toBe(false);
      expect(() => capturedTransport(model)).not.toThrow();
      rerenderApp(model);
      expect(statusText()).toContain(sentence);
      if (sentence === MEDIA_NOT_REVOKED) expect(statusText()).not.toContain(MEDIA_REVOKED);
      document.querySelector('main')!.innerHTML = '';
    }
  });
  it('M2 is refused by the transport for a cross-origin pairing (cookie operations are tied to the exact page origin)', async () => {
    const { calls } = scriptedFetch(ok);
    const model = await sameOriginModel(dom, { origin: 'http://127.0.0.1:5174' });
    await noteStatus(model, true);
    expect(await revokeMediaSession(model)).toBe('not-applicable');
    expect(calls).toHaveLength(0);
  });
});
