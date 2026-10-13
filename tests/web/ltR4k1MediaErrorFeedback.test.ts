import { pairedModel } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { importBrowserLocalFiles } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-r4k.1: an undecodable imported media file must produce visible, accessible feedback.
// JSDOM cannot decode media, so the 'error' event and MediaError code are stubbed; the
// real-browser check is lt-3kk journey-12. All files below are synthetic bytes.

const JOURNEY_PATTERN = /decod|codec|format|cannot be played|could not (load|play)|unsupported|not supported/i;

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
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:lt-r4k1-${++urlCounter}`) });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => { dom.window.close(); });

const file = (bytes: number[], name: string) => new dom.window.File([new Uint8Array(bytes)], name, { type: 'video/webm' });
const video = () => document.querySelector('.video-stage video') as HTMLVideoElement;
// The error banner: role=alert on first render after the error, role=status on later re-renders (no re-announcement).
const alerts = () => Array.from(document.querySelectorAll('.video-stage .media-error-alert')) as HTMLElement[];

function fireMediaError(el: HTMLVideoElement, code: number) {
  Object.defineProperty(el, 'error', { configurable: true, value: { code, message: '' } });
  el.dispatchEvent(new dom.window.Event('error'));
}
function fireLoaded(el: HTMLVideoElement) {
  Object.defineProperty(el, 'duration', { configurable: true, value: 2 });
  el.dispatchEvent(new dom.window.Event('loadedmetadata'));
}

async function importedModel(bytes = [7, 7, 7, 7], name = 'broken.webm'): Promise<AppModel> {
  const model = pairedModel();
  await importBrowserLocalFiles(model, { mediaFile: file(bytes, name) });
  rerenderApp(model);
  return model;
}

describe('lt-r4k.1 media error feedback', () => {
  it('shows a role=alert matching the journey pattern on MEDIA_ERR_SRC_NOT_SUPPORTED and keeps the record', async () => {
    const model = await importedModel();
    const mediaId = model.currentMedia!.id;
    expect(alerts()).toHaveLength(0);
    fireMediaError(video(), 4);
    const [alert] = alerts();
    expect(alert).toBeTruthy();
    expect(alert!.getAttribute('role')).toBe('alert');
    expect(alert!.textContent).toMatch(JOURNEY_PATTERN);
    expect(alert!.textContent).toContain('could not be played');
    expect(model.currentMedia!.id).toBe(mediaId);
    expect(model.store.listMediaAssets().map((m) => m.id)).toContain(mediaId);
  });

  it('adapts the message per MediaError code', async () => {
    const model = await importedModel();
    const texts: string[] = [];
    for (const code of [1, 2, 3, 4]) {
      fireMediaError(video(), code);
      texts.push(alerts()[0]!.textContent ?? '');
      model.player.mediaError = null; rerenderApp(model);
    }
    expect(new Set(texts).size).toBe(4);
    for (const t of texts) expect(t).toMatch(JOURNEY_PATTERN);
    expect(texts[2]).toMatch(/decod/i);
  });

  it('persists the alert across rerender with a single error listener per element', async () => {
    const model = await importedModel();
    fireMediaError(video(), 3);
    expect(alerts()[0]!.getAttribute('role')).toBe('alert');
    rerenderApp(model); rerenderApp(model);
    expect(alerts()).toHaveLength(1);
    // Unrelated re-renders keep the message visible but stop re-announcing it assertively.
    expect(alerts()[0]!.getAttribute('role')).toBe('status');
    expect(document.querySelectorAll('.video-stage video')).toHaveLength(1);
    expect(model.player.mediaError?.message).toMatch(JOURNEY_PATTERN);
  });

  it('clears on successful loadedmetadata of the current element', async () => {
    const model = await importedModel();
    fireMediaError(video(), 4);
    expect(alerts()).toHaveLength(1);
    fireLoaded(video());
    expect(alerts()).toHaveLength(0);
    expect(model.player.mediaError ?? null).toBeNull();
  });

  it('clears when a different media item is selected', async () => {
    const model = await importedModel();
    fireMediaError(video(), 4);
    await importBrowserLocalFiles(model, { mediaFile: file([1, 2, 3, 4, 5], 'other.webm') });
    rerenderApp(model);
    expect(alerts()).toHaveLength(0);
  });

  it('ignores errors from a stale (replaced) element or a previous media item', async () => {
    const model = await importedModel();
    const stale = video();
    await importBrowserLocalFiles(model, { mediaFile: file([9, 9, 9], 'next.webm') });
    rerenderApp(model);
    expect(video()).not.toBe(stale);
    fireMediaError(stale, 4);
    expect(model.player.mediaError ?? null).toBeNull();
    expect(alerts()).toHaveLength(0);
    // A stale success must not clear a current error either.
    fireMediaError(video(), 4);
    fireLoaded(stale);
    expect(model.player.mediaError?.code).toBe(4);
    expect(alerts()).toHaveLength(1);
  });
});
