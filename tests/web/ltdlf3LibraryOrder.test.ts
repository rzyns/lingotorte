import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel } from '../../apps/web/src/model';
import { makeMediaAsset } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';
import { pairedModel } from './pairingFixture.ts';

// lt-dlf.3: picker-first Add media card; loadedmetadata corrects a stored duration guess.
const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;
let dom: JSDOM;
let durationS = 2;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, File: dom.window.File, Element: dom.window.Element,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0,
    CSS: { escape: (v: string) => v },
  });
  const proto = dom.window.HTMLMediaElement.prototype as any;
  Object.defineProperty(proto, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) });
  Object.defineProperty(proto, 'pause', { configurable: true, value: vi.fn() });
  Object.defineProperty(proto, 'load', { configurable: true, value: vi.fn() });
  Object.defineProperty(proto, 'duration', { configurable: true, get: () => durationS });
});
afterEach(() => {
  delete (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  dom.window.close();
  vi.restoreAllMocks();
});

const pickerText = 'Choose video (recommended — stays linked after reload)';
const findBtn = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text);

describe('lt-dlf.3 Add media order', () => {
  it('puts the picker before the first file input when showOpenFilePicker exists', () => {
    Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: vi.fn() });
    const model = pairedModel();
    model.view = 'library';
    rerenderApp(model);
    const picker = findBtn(pickerText)!;
    const firstInput = document.querySelector('.add-media-card input[type="file"]')!;
    expect(picker).toBeTruthy();
    expect(picker.compareDocumentPosition(firstInput) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(findBtn('Import local media')).toBeTruthy();
  });

  it('renders no picker without showOpenFilePicker', () => {
    const model = pairedModel();
    model.view = 'library';
    rerenderApp(model);
    expect(findBtn(pickerText)).toBeUndefined();
    expect(document.querySelector('#local-media-file')).toBeTruthy();
    expect(findBtn('Import local media')).toBeTruthy();
  });
});

describe('lt-dlf.3 loadedmetadata duration correction', () => {
  function install(storedMs: number) {
    const model = createAppModel();
    const asset = makeMediaAsset({ title: 'Clip', originalPath: 'fixtures/media/x.webm', contentSha256: sha, durationMs: storedMs, container: 'webm', sizeBytes: 1, privacyLabel: 'synthetic' });
    model.store.putMediaAsset(asset);
    model.currentMedia = asset;
    model.player.durationMs = storedMs;
    model.view = 'player';
    rerenderApp(model);
    return { model, asset };
  }
  const video = () => document.querySelector('.video-stage video') as HTMLVideoElement;

  it('updates a 1000 ms asset to 2000 ms once and marks unsaved', () => {
    durationS = 2;
    const { model, asset } = install(1000);
    expect(model.localService.syncState).not.toBe('unsaved');
    video().dispatchEvent(new dom.window.Event('loadedmetadata'));
    const stored = model.store.getMediaAsset(asset.id)!;
    expect(stored.durationMs).toBe(2000);
    expect(stored.id).toBe(asset.id);
    expect(stored.contentSha256).toBe(asset.contentSha256);
    expect(model.player.durationMs).toBe(2000);
    expect(model.localService.syncState).toBe('unsaved');
    const put = vi.spyOn(model.store, 'putMediaAsset');
    video().dispatchEvent(new dom.window.Event('loadedmetadata'));
    expect(put).not.toHaveBeenCalled();
  });

  it('ignores a difference under 250 ms', () => {
    durationS = 2.1;
    const { model, asset } = install(2000);
    const put = vi.spyOn(model.store, 'putMediaAsset');
    video().dispatchEvent(new dom.window.Event('loadedmetadata'));
    expect(put).not.toHaveBeenCalled();
    expect(model.store.getMediaAsset(asset.id)!.durationMs).toBe(2000);
    expect(model.localService.syncState).not.toBe('unsaved');
  });
});
