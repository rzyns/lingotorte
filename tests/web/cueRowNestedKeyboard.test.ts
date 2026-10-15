import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-r4k.3: Enter/Space on a button nested in a transcript cue row (role=button) must
// activate that button, not be swallowed by the row's seek handler.

const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost:5173/',
  });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.CSS = { escape: (v: string) => v.replace(/"/g, '\\"') } as unknown as typeof CSS;
  return dom;
}

function installModel() {
  const model = createAppModel();
  const asset = makeMediaAsset({
    title: 'Cue row keyboard', originalPath: 'fixtures/media/x.webm', contentSha256: sha,
    durationMs: 4000, container: 'webm', sizeBytes: 1, privacyLabel: 'owned',
  });
  model.store.putMediaAsset(asset);
  model.currentMedia = asset;
  const track = makeSubtitleTrack({
    mediaId: asset.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic',
    sourcePath: 'x.srt', contentSha256: sha, isActive: true, transcriptStatus: 'approved',
  });
  model.store.putSubtitleTrack(track);
  model.targetTrackId = track.id;
  const text = 'Uczymy się polskiego razem.';
  const cue = makeCue({
    trackId: track.id, cueIndex: 0, startMs: 2000, endMs: 4000, text,
    normalizedText: text.toLocaleLowerCase('pl'), textSha256: sha,
  });
  model.store.putCue(cue);
  model.cues = [cue];
  model.player.activeCueId = null;
  model.player.currentTimeMs = 777;
  model.player.durationMs = 4000;
  return { model, cue };
}

/** Dispatch keydown like a browser; synthesize the button's click only when not cancelled. */
function pressKey(dom: JSDOM, el: HTMLElement, key: string) {
  el.focus();
  const ev = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  if (!ev.defaultPrevented) el.click();
  return ev;
}

describe('lt-r4k.3 cue row nested button keyboard activation', () => {
  let dom: JSDOM;
  beforeEach(() => { dom = setupDom(); });
  afterEach(() => { dom.window.close(); });

  for (const key of ['Enter', ' ']) {
    it(`${JSON.stringify(key)} on Save sentence… opens the capture form, saves via Save occurrence, and does not seek`, async () => {
      const { model, cue } = installModel();
      rerenderApp(model);
      const btn = document.querySelector(`[data-cue-id="${cue.id}"] .cue-actions button`) as HTMLButtonElement;
      expect(btn.textContent).toBe('Save sentence…');
      expect(btn.disabled).toBe(false);
      const ev = pressKey(dom, btn, key);
      expect(ev.defaultPrevented).toBe(false);
      expect(model.player.activeCueId).toBeNull();
      expect(model.player.currentTimeMs).toBe(777);
      // lt-cms: the button opens the capture state instead of persisting immediately.
      expect(model.selection?.kind).toBe('sentence');
      expect(Object.values(model.store.snapshot().savedItems).length).toBe(0);
      const save = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Save occurrence') as HTMLButtonElement;
      const saveEv = pressKey(dom, save, key);
      expect(saveEv.defaultPrevented).toBe(false);
      await vi.waitFor(() => {
        expect(Object.values(model.store.snapshot().savedItems).length).toBeGreaterThan(0);
      });
    });

    it(`${JSON.stringify(key)} on Show words tokenizes and does not seek`, async () => {
      const { model, cue } = installModel();
      rerenderApp(model);
      const btn = Array.from(document.querySelectorAll(`[data-cue-id="${cue.id}"] .cue-actions button`))
        .find((b) => b.textContent === 'Show words') as HTMLButtonElement;
      const ev = pressKey(dom, btn, key);
      expect(ev.defaultPrevented).toBe(false);
      expect(model.player.activeCueId).toBeNull();
      expect(model.player.currentTimeMs).toBe(777);
      await vi.waitFor(() => { expect(model.player.lastTokenPreview).toBeTruthy(); });
    });
  }

  it('Enter/Space on the row itself still seeks', () => {
    for (const key of ['Enter', ' ']) {
      const { model, cue } = installModel();
      rerenderApp(model);
      const row = document.querySelector(`[data-cue-id="${cue.id}"]`) as HTMLElement;
      const ev = pressKey(dom, row, key);
      expect(ev.defaultPrevented).toBe(true);
      expect(model.player.activeCueId).toBe(cue.id);
      expect(model.player.currentTimeMs).toBe(2000);
    }
  });
});
