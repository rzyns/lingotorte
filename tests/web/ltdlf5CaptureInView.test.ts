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


describe('lt-dlf.5 capture form stays beside the clicked line', () => {
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

  it('moves the open capture form to the top of the transcript aside, focusing Meaning without a page jump', async () => {
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
    expect(aside.classList.contains('capture-open')).toBe(true);
    expect(document.querySelector('.artifact-workbench .selection-panel')).toBeNull();
    const panel = aside.querySelector('.selection-panel')!;
    expect(panel).toBeTruthy();
    // Directly under the heading, before the transcript panel.
    expect(aside.children[1]).toBe(panel);
    expect(panel.compareDocumentPosition(aside.querySelector('.transcript-panel')!) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement?.id).toBe('selection-meaning');
    expect(focusOpts).toContainEqual({ id: 'selection-meaning', opts: { preventScroll: true } });
    // Cue scroll targets the clicked row inside the aside; the field is revealed with 'nearest' only.
    const cueScroll = scrolls.find((s) => s.cue === cue.id)!;
    expect(cueScroll).toBeTruthy();
    expect(aside.contains(document.querySelector(`[data-cue-id="${cue.id}"]`))).toBe(true);
    expect(cueScroll.opts.block).toBe('end');
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
    expect(aside.isConnected ? aside.classList.contains('capture-open') : document.querySelector('.transcript-copilot')!.classList.contains('capture-open')).toBe(false);
  });

  it('pins the open form only on desktop and keeps tokenised CSS', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('apps/web/src/style.css', 'utf8');
    expect(css).toMatch(/@media \(min-width: 900px\) \{\s*\.transcript-copilot\.capture-open > \.selection-panel \{[^}]*position: sticky;/);
  });
});
