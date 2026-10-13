import { pairedModel } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { importBrowserLocalFiles } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-r4k.4: a real browser fires 'error' again on every newly rendered <video> carrying the same
// undecodable src. The handler must not replace mediaError / re-render on that repeat, otherwise it
// loops forever and re-announces role=alert each time. The browser is simulated by a driver that
// fires 'error' (code 4) once on each new .video-stage video after insertion.

let dom: JSDOM;
let urlCounter = 0;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, File: dom.window.File, Element: dom.window.Element,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0,
  });
  urlCounter = 0;
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:lt-r4k4-${++urlCounter}`) });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => { dom.window.close(); });

const video = () => document.querySelector('.video-stage video') as HTMLVideoElement;
const alerts = () => Array.from(document.querySelectorAll('.video-stage .media-error-alert')) as HTMLElement[];

/** Browser simulation: every new video element errors once after insertion. Bounded at `cap` iterations. */
function simulateBrowser(code: number | (() => number), cap = 20) {
  const seen = new WeakSet<HTMLVideoElement>();
  const roles: (string | null)[] = [];
  let errors = 0;
  for (let i = 0; i < cap; i++) {
    const el = video();
    if (!el || seen.has(el)) break;
    seen.add(el);
    const c = typeof code === 'function' ? code() : code;
    Object.defineProperty(el, 'error', { configurable: true, value: { code: c, message: '' } });
    el.dispatchEvent(new dom.window.Event('error'));
    errors++;
    roles.push(alerts()[0]?.getAttribute('role') ?? null);
  }
  return { errors, roles };
}

async function importedModel(): Promise<AppModel> {
  const model = pairedModel();
  await importBrowserLocalFiles(model, { mediaFile: new dom.window.File([new Uint8Array([7, 7, 7, 7])], 'broken.webm', { type: 'video/webm' }) });
  rerenderApp(model);
  return model;
}

describe('lt-r4k.4 media error re-render loop', () => {
  it('a repeated error on the re-rendered video for the same media/source is ignored (no loop, no re-announce)', async () => {
    const model = await importedModel();
    const { errors, roles } = simulateBrowser(4);
    expect(errors).toBeLessThanOrEqual(2);
    expect(roles[0]).toBe('alert');
    const first = model.player.mediaError;
    expect(first?.announced).toBe(true);
    // Later unrelated re-renders: still status, same object, still one visible alert.
    rerenderApp(model);
    const again = simulateBrowser(4);
    expect(again.errors).toBeLessThanOrEqual(1);
    expect(model.player.mediaError).toBe(first);
    expect(model.player.mediaError?.announced).toBe(true);
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]!.getAttribute('role')).toBe('status');
    expect(alerts()[0]!.textContent).toContain('could not be played');
  });

  it('a different error code for the same media updates the message', async () => {
    const model = await importedModel();
    simulateBrowser(4);
    const msg4 = model.player.mediaError?.message;
    rerenderApp(model);
    const { errors } = simulateBrowser(3);
    expect(errors).toBeLessThanOrEqual(2);
    expect(model.player.mediaError?.code).toBe(3);
    expect(model.player.mediaError?.message).not.toBe(msg4);
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]!.textContent).toMatch(/decod/i);
  });

  it('choosing another file still clears the error', async () => {
    const model = await importedModel();
    simulateBrowser(4);
    await importBrowserLocalFiles(model, { mediaFile: new dom.window.File([new Uint8Array([1, 2, 3])], 'ok.webm', { type: 'video/webm' }) });
    rerenderApp(model);
    expect(alerts()).toHaveLength(0);
  });
});
