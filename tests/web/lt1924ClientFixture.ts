// lt-192.4 JSDOM fixture (unit evidence only, never browser evidence): a same-origin page, a paired model and a
// scripted fetch that records every request's method, path, credentials and bearer presence.
import { JSDOM } from 'jsdom';
import { vi } from 'vitest';
import { createAppModel, pairLocalService, captureLocalServiceTransport, importBrowserLocalFiles } from '../../apps/web/src/model.ts';
import { noteServerMediaStatus } from '../../apps/web/src/serverMedia.ts';
import type { AppModel } from '../../apps/web/src/uiTypes';
import { SYNTHETIC_CAPABILITY } from './pairingFixture.ts';

export const PAGE_ORIGIN = 'http://127.0.0.1:5173';
export type Call = { method: string; path: string; credentials: RequestCredentials | undefined; bearer: boolean };
export type Route = (method: string, path: string) => Response | Promise<Response> | 'unreachable';

export function installDom(url = `${PAGE_ORIGIN}/`) {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, location: dom.window.location, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, HTMLInputElement: dom.window.HTMLInputElement, File: dom.window.File, Element: dom.window.Element,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver })) vi.stubGlobal(key, value);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  let counter = 0;
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:${PAGE_ORIGIN}/lt1924-${++counter}`) });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  return dom;
}

export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export const empty = (status: number) => new Response(null, { status });

/** A scripted service: every request is recorded; the route decides the answer. */
export function scriptedFetch(route: Route) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push({ method, path: url.pathname, credentials: init?.credentials, bearer: new Headers(init?.headers).get('authorization') === `Bearer ${SYNTHETIC_CAPABILITY}` });
    const answer = await route(method, url.pathname);
    if (answer === 'unreachable') throw new TypeError('fetch failed');
    return answer;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export const completeStorage = (size = 4) => json(200, { ok: true, state: 'complete', sizeBytes: size, mimeType: 'video/webm' });

/** A paired same-origin model whose current media is a browser-only asset (blob label) with no object URL. */
export async function sameOriginModel(dom: JSDOM, options: { origin?: string; label?: string; keepObjectUrl?: boolean } = {}): Promise<AppModel> {
  const model = createAppModel();
  pairLocalService(model, SYNTHETIC_CAPABILITY, options.origin ?? PAGE_ORIGIN);
  await importBrowserLocalFiles(model, { mediaFile: new dom.window.File([new Uint8Array([1, 2, 3, 4])], 'synthetic.webm', { type: 'video/webm' }) });
  if (options.label) { model.currentMedia = { ...model.currentMedia!, originalPath: options.label }; model.store.putMediaAsset(model.currentMedia); }
  if (!options.keepObjectUrl) model.browserLocalMedia = { ...model.browserLocalMedia, objectUrl: null };
  return model;
}

/** What connectLocalService does after a status OK, without the rest of the connect flow. */
export async function noteStatus(model: AppModel, available: boolean) {
  await noteServerMediaStatus(model, captureLocalServiceTransport(model), { managedMedia: { available } });
}

export async function flush(times = 5) { for (let i = 0; i < times; i++) await new Promise(resolve => setTimeout(resolve, 0)); }
