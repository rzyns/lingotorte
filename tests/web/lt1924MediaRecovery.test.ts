// lt-192.4 S10 / N26 (JSDOM unit evidence only): a native <video> failure on a server source goes through
// checking-access -> M3 -> (401 pair again | missing | unreachable | complete -> one M1 -> load()), never decode or
// relink advice first; at most one re-mint per media, source and error sequence; the repeat-error check stays.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSDOM } from 'jsdom';
import { rerenderApp } from '../../apps/web/src/app';
import { CHECKING_ACCESS, MANAGED_UNREACHABLE, PAIR_AGAIN_MEDIA, SERVER_NETWORK, SERVER_UNDECODABLE, SERVER_COPY_MISSING_NOTE } from '../../apps/web/src/serverMedia.ts';
import { capturedTransport } from '../../apps/web/src/pairedTransport.ts';
import { completeStorage, empty, flush, installDom, json, noteStatus, sameOriginModel, scriptedFetch, type Route } from './lt1924ClientFixture.ts';
import type { AppModel } from '../../apps/web/src/uiTypes';

let dom: JSDOM;
beforeEach(() => { dom = installDom(); });
afterEach(() => { vi.unstubAllGlobals(); dom.window.close(); });
const stageVideo = () => document.querySelector('.video-stage video') as HTMLVideoElement;
const alertText = () => document.querySelector('.video-stage .media-error-alert')?.textContent ?? null;

async function serverStage(route: Route) {
  let current = route;
  const recorded = scriptedFetch((method, path) => current(method, path));
  const model = await sameOriginModel(dom);
  await noteStatus(model, true);
  rerenderApp(model); await flush(); rerenderApp(model);
  const video = stageVideo();
  expect(video.getAttribute('src')).toContain('/content');
  const load = vi.spyOn(video, 'load').mockImplementation(() => undefined);
  recorded.calls.length = 0;
  return { model, video, load, calls: recorded.calls, setRoute: (next: Route) => { current = next; } };
}
function fail(video: HTMLVideoElement, code: number) {
  Object.defineProperty(video, 'error', { configurable: true, value: { code, message: '' } });
  video.dispatchEvent(new dom.window.Event('error'));
}
const ok: Route = (_method, path) => path === '/api/media/session' ? empty(204) : path.endsWith('/storage') ? completeStorage() : json(404, {});

describe('lt-192.4 server playback recovery', () => {
  it('auth-looking failure: checking-access, M3 complete, ONE re-mint, reload; a second failure reports decode honestly', async () => {
    const { model, video, load, calls } = await serverStage(ok);
    fail(video, 4);
    expect(alertText()).toBe(CHECKING_ACCESS);
    await flush();
    expect(calls.map(c => `${c.method} ${c.path}`)).toEqual([`GET /api/media/${model.currentMedia!.id}/storage`, 'POST /api/media/session']);
    expect(calls.find(c => c.method === 'POST')).toMatchObject({ credentials: 'same-origin', bearer: true });
    expect(calls.find(c => c.method === 'GET')).toMatchObject({ credentials: 'omit', bearer: true });
    expect(load).toHaveBeenCalledTimes(1);
    expect(model.player.mediaError).toBeNull();
    expect(stageVideo()).toBe(video);
    fail(video, 4);
    await flush();
    expect(alertText()).toBe(SERVER_UNDECODABLE);
    expect(alertText()).not.toMatch(/relink/i);
    expect(load).toHaveBeenCalledTimes(1);
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
    // Repeat of the same code on the same source is swallowed (lt-r4k.4), no further requests.
    fail(video, 4); await flush();
    expect(calls).toHaveLength(2);
    fail(video, 2); await flush();
    expect(alertText()).toBe(SERVER_NETWORK);
  });
  it('verified playback (playing, then time advancing while not paused) ends the error sequence, so a later eviction may re-mint once again', async () => {
    const { video, load, calls } = await serverStage(ok);
    fail(video, 2); await flush();
    expect(load).toHaveBeenCalledTimes(1);
    video.dispatchEvent(new dom.window.Event('loadedmetadata'));
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 0 });
    video.dispatchEvent(new dom.window.Event('playing'));
    video.currentTime = 0.5;
    video.dispatchEvent(new dom.window.Event('timeupdate'));
    fail(video, 2); await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(2);
  });
  it('correction R5: loadedmetadata (or playing without advancing time) does NOT reset the one re-mint budget, so a metadata-readable file that fails to decode cannot loop mints', async () => {
    const { video, load, calls } = await serverStage(ok);
    fail(video, 4); await flush();
    expect(load).toHaveBeenCalledTimes(1);
    for (let cycle = 0; cycle < 3; cycle++) {
      video.dispatchEvent(new dom.window.Event('loadedmetadata'));
      video.dispatchEvent(new dom.window.Event('playing'));
      video.dispatchEvent(new dom.window.Event('timeupdate'));
      fail(video, cycle % 2 ? 4 : 3); await flush();
    }
    expect(calls.filter(c => c.method === 'POST'), 'at most one re-mint without verified playback').toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(alertText()).toBe(SERVER_UNDECODABLE);
  });
  it('restart: M3 401 clears pairing and asks to pair again, never decode advice', async () => {
    const { model, video, load, setRoute } = await serverStage(ok);
    setRoute(() => json(401, { ok: false, error: 'Pair again.' }));
    fail(video, 4);
    await flush();
    // The only load() is the stage release of the dropped element (src removed first): never a reload of M4.
    expect(load.mock.calls.length === 0 || video.getAttribute('src') === null).toBe(true);
    expect(() => capturedTransport(model)).toThrow();
    rerenderApp(model);
    expect(document.body.textContent).toContain(PAIR_AGAIN_MEDIA);
    expect(document.body.textContent).not.toMatch(/cannot decode|could not be played|unsupported codec/i);
  });
  it('browser-proof P5 finding: restart, then opening a not-yet-checked asset (M3 401 before any M4) says "pair again", not a bare Relink', async () => {
    scriptedFetch((_method, path) => path === '/api/media/session' ? empty(204) : path.endsWith('/storage') ? json(401, { ok: false, error: 'Pair again.' }) : json(404, {}));
    const model = await sameOriginModel(dom);
    await noteStatus(model, true);
    rerenderApp(model); await flush(); rerenderApp(model);
    expect(() => capturedTransport(model)).toThrow();
    expect(document.querySelector('.video-placeholder-relink')).not.toBeNull();
    expect(document.querySelector('.server-media-note')?.textContent).toBe(PAIR_AGAIN_MEDIA);
    expect(document.body.textContent).not.toMatch(/cannot decode|could not be played/i);
    // Re-pairing (a fresh status OK) forgets the lost-pairing hint.
    const { pairLocalService } = await import('../../apps/web/src/model.ts');
    const { SYNTHETIC_CAPABILITY } = await import('./pairingFixture.ts');
    pairLocalService(model, SYNTHETIC_CAPABILITY, model.localService.baseUrl);
    await noteStatus(model, false);
    rerenderApp(model);
    expect(document.querySelector('.server-media-note')).toBeNull();
  });
  it('M3 unreachable or M1 unreachable: service unreachable, no decode claim, no reload', async () => {
    for (const unreachableOn of ['storage', 'session'] as const) {
      const { video, load, setRoute } = await serverStage(ok);
      setRoute((method, path) => (unreachableOn === 'storage' ? path.endsWith('/storage') : path === '/api/media/session') ? 'unreachable' : ok(method, path));
      fail(video, 4); await flush();
      expect(document.body.textContent, unreachableOn).toContain(MANAGED_UNREACHABLE);
      expect(document.body.textContent).not.toMatch(/cannot decode|could not be played/i);
      expect(load.mock.calls.length === 0 || video.getAttribute('src') === null).toBe(true);
      document.querySelector('main')!.innerHTML = '';
    }
  });
  it('M3 bytes-missing during playback: the stage becomes the missing-bytes relink state, no src, no re-mint', async () => {
    const { model, video, load, calls, setRoute } = await serverStage(ok);
    setRoute((method, path) => path.endsWith('/storage') ? json(200, { ok: true, state: 'bytes-missing' }) : ok(method, path));
    fail(video, 4); await flush();
    rerenderApp(model);
    expect(load.mock.calls.length === 0 || video.getAttribute('src') === null).toBe(true);
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(0);
    expect(document.querySelector('.video-stage video')).toBeNull();
    expect(document.querySelector('.server-media-note')?.textContent).toBe(SERVER_COPY_MISSING_NOTE);
  });
  it('a local object URL error keeps the existing relink advice (unchanged path)', async () => {
    scriptedFetch(() => completeStorage());
    const model: AppModel = await sameOriginModel(dom, { keepObjectUrl: true });
    rerenderApp(model);
    fail(stageVideo(), 4);
    expect(alertText()).toMatch(/relink or choose another file/);
  });
});
