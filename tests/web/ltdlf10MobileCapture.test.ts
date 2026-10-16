import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack, makeTranscriptWordTiming } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-dlf.10: on phones the open capture form is a labelled bottom-sheet region; the page is not scrolled to it.

const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
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

function installModel(status: 'approved' | 'draft' = 'approved', text = 'Uczymy się polskiego razem.', timed = false) {
  const model = createAppModel();
  const asset = makeMediaAsset({ title: 'Capture', originalPath: 'fixtures/media/x.webm', contentSha256: sha, durationMs: 4000, container: 'webm', sizeBytes: 1, privacyLabel: 'owned' });
  model.store.putMediaAsset(asset);
  model.currentMedia = asset;
  const track = makeSubtitleTrack({ mediaId: asset.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'x.srt', contentSha256: sha, isActive: true, transcriptStatus: status });
  model.store.putSubtitleTrack(track);
  model.targetTrackId = track.id;
  const cue = makeCue({ trackId: track.id, cueIndex: 0, startMs: 2000, endMs: 4000, text, normalizedText: text.toLocaleLowerCase('pl'), textSha256: sha });
  model.store.putCue(cue);
  model.cues = [cue];
  model.view = 'player';
  if (timed) {
    model.player.activeCueId = cue.id;
    model.player.currentTimeMs = 2100;
    model.player.durationMs = 4000;
    let cursor = 0;
    text.split(' ').forEach((raw, index) => {
      const word = raw.replace(/[.,]$/, '');
      const charStart = text.indexOf(word, cursor);
      cursor = charStart + word.length;
      model.store.putTranscriptWordTiming(makeTranscriptWordTiming({
        trackId: track.id, cueId: cue.id, wordIndex: index, charStart, charEnd: cursor, text: word,
        normalizedText: word.toLocaleLowerCase('pl'), startMs: 2000 + index * 400, endMs: 2000 + index * 400 + 300,
        sourceKind: 'provider-word-timing', engine: 'test-asr', modelName: 'test-model',
      }));
    });
  }
  return { model, cue };
}

const meaning = () => document.getElementById('selection-meaning') as HTMLInputElement | null;
const row = (cueId: string) => document.querySelector(`.transcript-panel [data-cue-id="${cueId}"]`) as HTMLElement;
const words = (cueId: string) => Array.from(row(cueId).querySelectorAll('.cue-target .cue-word')) as HTMLElement[];
const word = (cueId: string, text: string) => words(cueId).find((b) => b.textContent === text)!;
function click(dom: JSDOM, el: HTMLElement, init: MouseEventInit = {}) {
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
}
function key(dom: JSDOM, el: HTMLElement, k: string, shiftKey = false) {
  const ev = new dom.window.KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}



function stubWidth(dom: JSDOM, width: number) {
  (dom.window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => {
    const max = /max-width:\s*(\d+)px/.exec(q); const min = /min-width:\s*(\d+)px/.exec(q);
    const matches = (max ? width <= Number(max[1]) : true) && (min ? width >= Number(min[1]) : true);
    return { matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false };
  };
}

describe('lt-dlf.10 mobile capture sheet', () => {
  let dom: JSDOM;
  beforeEach(() => { dom = setupDom(); });
  afterEach(() => { vi.restoreAllMocks(); dom.window.close(); });

  for (const width of [390, 1280]) {
    it(`at ${width}px a word click opens a labelled capture region and focuses Meaning with preventScroll`, () => {
      stubWidth(dom, width);
      const { model, cue } = installModel();
      rerenderApp(model);
      const focusOpts: unknown[] = [];
      const origFocus = dom.window.HTMLElement.prototype.focus;
      vi.spyOn(dom.window.HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, opts?: FocusOptions) {
        focusOpts.push({ id: this.id, opts });
        return origFocus.call(this, opts);
      });
      click(dom, word(cue.id, 'polskiego'));
      const panel = document.querySelector('.transcript-copilot.capture-open > .selection-panel') as HTMLElement;
      expect(panel.classList.contains('capture-sheet')).toBe(true);
      expect(panel.getAttribute('role')).toBe('region');
      const heading = document.getElementById(panel.getAttribute('aria-labelledby')!)!;
      expect(heading.textContent).toBe('Save a word');
      expect(panel.contains(heading)).toBe(true);
      expect(document.activeElement?.id).toBe('selection-meaning');
      expect(focusOpts).toContainEqual({ id: 'selection-meaning', opts: { preventScroll: true } });
      // Tab order reaches Cancel and Save inside the (non-modal) sheet.
      const buttons = Array.from(panel.querySelectorAll('button')).map((b) => b.textContent);
      expect(buttons).toEqual(expect.arrayContaining(['Cancel', 'Save occurrence']));
    });
  }

  it('the resting selection panel (no capture) is not a sheet', () => {
    const { model } = installModel();
    rerenderApp(model);
    const panel = document.querySelector('.artifact-workbench .selection-panel')!;
    expect(panel.classList.contains('capture-sheet')).toBe(false);
    expect(panel.hasAttribute('role')).toBe(false);
  });

  it('Escape closes the sheet and returns focus to the row', () => {
    stubWidth(dom, 390);
    const { model, cue } = installModel();
    rerenderApp(model);
    click(dom, word(cue.id, 'polskiego'));
    key(dom, meaning()!, 'Escape');
    expect(document.querySelector('.capture-sheet')).toBeNull();
    expect(document.activeElement).toBe(row(cue.id));
  });

  it('style.css renders the capture sheet fixed at the bottom only below 900px', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('apps/web/src/style.css', 'utf8');
    const block = /@media \(max-width: 899px\) \{\s*\.transcript-copilot\.capture-open > \.selection-panel\.capture-sheet \{([^}]*)\}/.exec(css);
    expect(block).toBeTruthy();
    expect(block![1]).toMatch(/position: fixed/);
    expect(block![1]).toMatch(/bottom: 0/);
    expect(block![1]).toMatch(/safe-area-inset-bottom/);
  });
});

describe('lt-dlf.10 part 2: video stays in view on phones', () => {
  let dom: JSDOM;
  beforeEach(() => { dom = setupDom(); });
  afterEach(() => { vi.restoreAllMocks(); dom.window.close(); });

  function recordScrolls() {
    const scrolls: string[] = [];
    (dom.window.Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = function (this: Element) {
      scrolls.push(this.getAttribute('data-cue-id') ?? this.id);
    };
    return scrolls;
  }

  it('at 390px an off-screen cue row (subtitle click) is not scrolled into view, so the window does not move', () => {
    stubWidth(dom, 390);
    const { model, cue } = installModel();
    rerenderApp(model);
    const scrolls = recordScrolls();
    model.selection = { kind: 'lexeme', text: 'polskiego', cueId: cue.id, tokenStart: 2, tokenEnd: 3, charStart: 10, charEnd: 19 };
    const proto = dom.window.HTMLElement.prototype as unknown as { getBoundingClientRect: () => DOMRect };
    proto.getBoundingClientRect = () => ({ top: 1300, bottom: 1340, left: 0, right: 390, width: 390, height: 40, x: 0, y: 1300, toJSON() {} }) as DOMRect;
    rerenderApp(model);
    expect(scrolls).not.toContain(cue.id);
    expect(meaning()).not.toBeNull();
  });

  it('at 390px an on-screen clicked row (transcript click) is still nudged above the sheet', () => {
    stubWidth(dom, 390);
    const { model, cue } = installModel();
    rerenderApp(model);
    const scrolls = recordScrolls();
    const proto = dom.window.HTMLElement.prototype as unknown as { getBoundingClientRect: () => DOMRect };
    proto.getBoundingClientRect = () => ({ top: 400, bottom: 440, left: 0, right: 390, width: 390, height: 40, x: 0, y: 400, toJSON() {} }) as DOMRect;
    click(dom, word(cue.id, 'polskiego'));
    expect(scrolls).toContain(cue.id);
  });

  it('at 1280px the cue row is scrolled into view as before, wherever it is', () => {
    stubWidth(dom, 1280);
    const { model, cue } = installModel();
    rerenderApp(model);
    const scrolls = recordScrolls();
    model.selection = { kind: 'lexeme', text: 'polskiego', cueId: cue.id, tokenStart: 2, tokenEnd: 3, charStart: 10, charEnd: 19 };
    rerenderApp(model);
    expect(scrolls).toContain(cue.id);
  });

  it('style.css pins a reduced-height video stage below 900px (sticky containing block via display: contents)', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('apps/web/src/style.css', 'utf8');
    const block = /@media \(max-width: 899px\) \{\s*\.artifact-workbench \{\s*display: contents;\s*\}\s*\.video-stage \{([^}]*)\}/.exec(css);
    expect(block).toBeTruthy();
    expect(block![1]).toMatch(/position: sticky/);
    expect(block![1]).toMatch(/top: 0/);
    expect(block![1]).toMatch(/max-height: 30vh/);
  });
});
