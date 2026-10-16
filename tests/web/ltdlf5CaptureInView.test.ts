import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack, makeTranscriptWordTiming } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-dlf.5: capturing a word keeps the video and the clicked line in view (jsdom: structural checks).

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


describe('lt-dlf.5 / lt-foe.4 capture form keeps the video and the clicked line in view', () => {
  let dom: JSDOM;
  beforeEach(() => { dom = setupDom(); });
  afterEach(() => { vi.restoreAllMocks(); dom.window.close(); });

  it('renders the selection panel in the left column at rest, after the controls', () => {
    const { model } = installModel();
    rerenderApp(model);
    const left = document.querySelector('.artifact-workbench')!;
    expect(left.querySelector('.selection-panel')).toBeTruthy();
    expect(document.querySelector('.transcript-copilot .selection-panel')).toBeNull();
    expect(document.querySelector('.transcript-copilot')!.classList.contains('capture-open')).toBe(false);
  });

  it('lt-foe.4: keeps the open capture form in the main column under the controls, focusing Meaning without a page jump', async () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    const focusOpts: unknown[] = [];
    const origFocus = dom.window.HTMLElement.prototype.focus;
    vi.spyOn(dom.window.HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, opts?: FocusOptions) {
      focusOpts.push({ id: this.id, opts });
      return origFocus.call(this, opts);
    });
    const scrolls: { cls: string; id: string; cue: string | null; opts: ScrollIntoViewOptions }[] = [];
    (dom.window.Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = function (this: Element, opts: ScrollIntoViewOptions) {
      scrolls.push({ cls: (this as HTMLElement).className, id: this.id, cue: this.getAttribute('data-cue-id'), opts });
    };
    click(dom, word(cue.id, 'polskiego'));
    const aside = document.querySelector('.transcript-copilot')!;
    // lt-foe.4: the aside keeps its normal layout; the common grid ancestor carries capture-open.
    expect(aside.classList.contains('capture-open')).toBe(false);
    expect(aside.querySelector('.selection-panel')).toBeNull();
    expect(document.querySelector('.player-layout')!.classList.contains('capture-open')).toBe(true);
    const workbench = document.querySelector('.artifact-workbench')!;
    const panel = workbench.querySelector(':scope > .selection-panel.capture-sheet')!;
    expect(panel).toBeTruthy();
    // Directly after the player controls.
    expect(panel.previousElementSibling?.classList.contains('player-controls')).toBe(true);
    expect(document.activeElement?.id).toBe('selection-meaning');
    expect(focusOpts).toContainEqual({ id: 'selection-meaning', opts: { preventScroll: true } });
    // Desktop: the clicked row is kept visible in the aside with a minimal ('nearest') scroll; Meaning likewise.
    const cueScroll = scrolls.find((s) => s.cue === cue.id)!;
    expect(cueScroll).toBeTruthy();
    expect(aside.contains(document.querySelector(`[data-cue-id="${cue.id}"]`))).toBe(true);
    expect(cueScroll.opts.block).toBe('nearest');
    expect(scrolls.filter((s) => s.id === 'selection-meaning').map((s) => s.opts)).toEqual([{ block: 'nearest' }]);
    expect(scrolls.every((s) => s.cue !== null || s.opts.block === 'nearest')).toBe(true);
    // Typing then Enter saves and the panel returns to the left column.
    meaning()!.value = 'Polish';
    meaning()!.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    key(dom, meaning()!, 'Enter');
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(model.selection).toBeNull();
    expect(document.querySelector('.toast-region')?.textContent ?? '').toContain('Saved');
    expect(document.querySelector('.artifact-workbench .selection-panel')).toBeTruthy();
    expect(document.querySelector('.player-layout')!.classList.contains('capture-open')).toBe(false);
  });

  // Finding 4 / audit N10: closing the form must not drop focus to <body>.
  const closePaths: [string, (d: JSDOM) => void][] = [
    ['Enter in Meaning', (d) => { key(d, meaning()!, 'Enter'); }],
    ['Save', () => { (document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement).click(); }],
    ['Cancel', () => { (Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Cancel') as HTMLButtonElement).click(); }],
    ['Escape', (d) => { key(d, meaning()!, 'Escape'); }],
  ];
  for (const [name, close] of closePaths) {
    it(`${name} closes the form and returns focus to the clicked cue row without a page jump`, async () => {
      const { model, cue } = installModel();
      rerenderApp(model);
      const focusOpts: { el: Element; opts: FocusOptions | undefined }[] = [];
      const origFocus = dom.window.HTMLElement.prototype.focus;
      vi.spyOn(dom.window.HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, opts?: FocusOptions) {
        focusOpts.push({ el: this, opts });
        return origFocus.call(this, opts);
      });
      click(dom, word(cue.id, 'polskiego'));
      close(dom);
      for (let i = 0; i < 10; i++) await Promise.resolve();
      expect(model.selection).toBeNull();
      expect(document.activeElement).toBe(row(cue.id));
      expect(focusOpts.at(-1)).toEqual({ el: row(cue.id), opts: { preventScroll: true } });
      // The toast's Undo never takes focus.
      expect(document.activeElement?.closest('.toast-region')).toBeNull();
    });
  }

  // Finding 3 / lt-foe.4: every capture entry point puts the form in the main column and focuses Meaning.
  const inMainColumn = () => {
    expect(document.querySelector('.player-layout.capture-open > .artifact-workbench > .selection-panel.capture-sheet')).toBeTruthy();
    expect(document.querySelector('.transcript-copilot .selection-panel')).toBeNull();
    expect(document.querySelector('.transcript-copilot.capture-open')).toBeNull();
    expect(document.activeElement?.id).toBe('selection-meaning');
  };
  it('Shift+click extend keeps the form in the main column', () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    click(dom, word(cue.id, 'Uczymy'));
    click(dom, word(cue.id, 'polskiego'), { shiftKey: true });
    expect(model.selection).toMatchObject({ kind: 'phrase', tokenStart: 0, tokenEnd: 3 });
    inMainColumn();
  });
  it('drag-select opens the form in the main column', () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    vi.spyOn(dom.window, 'getSelection').mockImplementation(() => ({ toString: () => 'się polskiego', removeAllRanges: () => undefined }) as unknown as Selection);
    row(cue.id).dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
    expect(model.selection).toMatchObject({ text: 'się polskiego' });
    inMainColumn();
  });
  it('Enter on a focused word (lt-z8s) opens the form in the main column', () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    row(cue.id).focus();
    key(dom, row(cue.id), 'ArrowLeft');
    key(dom, document.activeElement as HTMLElement, 'Enter');
    expect(model.selection).toMatchObject({ kind: 'lexeme', text: 'razem' });
    inMainColumn();
  });
  it('Save sentence… opens the form in the main column', () => {
    const { model } = installModel();
    rerenderApp(model);
    (Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Save sentence…') as HTMLButtonElement).click();
    expect(model.selection).toMatchObject({ kind: 'sentence' });
    inMainColumn();
  });
  it('an overlay subtitle word opens the form in the main column', () => {
    const { model } = installModel('approved', undefined, true);
    rerenderApp(model);
    (Array.from(document.querySelectorAll('.subtitle-overlay .subtitle-word')).find((b) => b.textContent === 'razem') as HTMLElement).click();
    expect(model.selection).toMatchObject({ text: 'razem' });
    inMainColumn();
  });
  it('lt-e0j Undo reopens the form in the main column', async () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    click(dom, word(cue.id, 'razem'));
    (document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement).click();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(model.selection).toBeNull();
    document.querySelector<HTMLButtonElement>('.toast-region button')!.click();
    expect(model.selection).toMatchObject({ text: 'razem' });
    inMainColumn();
  });

  it('lt-foe.4: no desktop pinning of the form or aside; the mobile sheet hangs off .player-layout.capture-open', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('apps/web/src/style.css', 'utf8');
    expect(css).not.toMatch(/\.transcript-copilot\.capture-open/);
    expect(css).not.toMatch(/max-height: 55vh/);
    expect(css).not.toMatch(/scroll-margin-top: 55vh/);
    const desktop = [...css.matchAll(/@media \(min-width: 900px\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
    expect(desktop).not.toMatch(/capture-open|capture-sheet/);
    expect(css).toMatch(/@media \(max-width: 899px\) \{\s*\.player-layout\.capture-open \.selection-panel\.capture-sheet \{[^}]*position: fixed;/);
  });
});
