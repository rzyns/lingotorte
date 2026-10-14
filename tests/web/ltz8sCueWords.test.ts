import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack, makeTranscriptWordTiming } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-z8s: every transcript word is a capture button, with or without word timings.

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

describe('lt-z8s clickable cue words', () => {
  let dom: JSDOM;
  beforeEach(() => { dom = setupDom(); });
  afterEach(() => { vi.restoreAllMocks(); dom.window.close(); });

  it('plain SRT cue renders words as buttons and keeps cue textContent unchanged', () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    expect(words(cue.id).map((b) => b.textContent)).toEqual(['Uczymy', 'się', 'polskiego', 'razem']);
    expect(row(cue.id).querySelector('.cue-target')!.textContent).toBe(cue.text);
    expect(row(cue.id).querySelectorAll('.timed-word')).toHaveLength(0);
    expect(words(cue.id).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('click selects a lexeme, focuses Meaning, does not seek, and marks the word pressed', () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    click(dom, word(cue.id, 'polskiego'));
    expect(model.selection).toEqual({ kind: 'lexeme', text: 'polskiego', cueId: cue.id, tokenStart: 2, tokenEnd: 3, charStart: 11, charEnd: 20 });
    expect(document.activeElement?.id).toBe('selection-meaning');
    expect(meaning()!.value).toBe('');
    expect(model.player.currentTimeMs).toBe(0);
    expect(word(cue.id, 'polskiego').getAttribute('aria-pressed')).toBe('true');
    expect(word(cue.id, 'razem').getAttribute('aria-pressed')).toBe('false');
  });

  it('Shift+click a second word extends to a phrase spanning both', () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    click(dom, word(cue.id, 'się'));
    click(dom, word(cue.id, 'razem'), { shiftKey: true });
    expect(model.selection).toEqual({ kind: 'phrase', text: 'się polskiego razem', cueId: cue.id, tokenStart: 1, tokenEnd: 4, charStart: 7, charEnd: 26 });
    expect(words(cue.id).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'true', 'true']);
    expect(Object.values(model.store.snapshot().savedItems)).toHaveLength(0);
  });

  it('ArrowRight moves focus between words; Shift+ArrowRight extends the selection', () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    const first = words(cue.id)[0]!;
    expect(first.tabIndex).toBe(0);
    first.focus();
    const ev = key(dom, first, 'ArrowRight');
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(word(cue.id, 'się'));
    key(dom, word(cue.id, 'się'), 'ArrowLeft');
    expect(document.activeElement).toBe(first);
    expect(model.selection).toBeNull();
    key(dom, first, 'ArrowRight', true);
    expect(model.selection).toMatchObject({ kind: 'phrase', text: 'Uczymy się', tokenStart: 0, tokenEnd: 2, charStart: 0, charEnd: 10 });
    expect(document.activeElement).toBe(word(cue.id, 'się'));
    key(dom, word(cue.id, 'się'), 'ArrowRight', true);
    expect(model.selection).toMatchObject({ text: 'Uczymy się polskiego', tokenStart: 0, tokenEnd: 3 });
    expect(word(cue.id, 'polskiego').getAttribute('aria-pressed')).toBe('true');
  });

  it('words are focusable role=button spans with roving tabindex', () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    const ws = words(cue.id);
    expect(ws.every((w) => w.tagName === 'SPAN' && w.getAttribute('role') === 'button' && w.hasAttribute('tabindex'))).toBe(true);
    expect(ws.filter((w) => w.tabIndex === 0)).toHaveLength(1);
    expect(row(cue.id).querySelector('button.cue-word')).toBeNull();
  });

  for (const k of ['Enter', ' ']) {
    it(`${k === ' ' ? 'Space' : k} on a word span captures it, focuses Meaning, and does not seek the row`, () => {
      const { model, cue } = installModel();
      rerenderApp(model);
      const b = word(cue.id, 'razem');
      b.focus();
      const ev = key(dom, b, k);
      expect(ev.defaultPrevented).toBe(true);
      expect(model.player.activeCueId).toBeNull();
      expect(model.selection).toMatchObject({ kind: 'lexeme', text: 'razem' });
      expect(document.activeElement).toBe(meaning());
    });
  }

  it('drag-select still resolves to the same token range', () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    vi.spyOn(dom.window, 'getSelection').mockImplementation(() => ({ toString: () => 'polskiego', removeAllRanges: () => undefined }) as unknown as Selection);
    row(cue.id).dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
    return vi.waitFor(() => {
      expect(model.selection).toMatchObject({ kind: 'lexeme', text: 'polskiego', tokenStart: 2, tokenEnd: 3, charStart: 11, charEnd: 20 });
    });
  });

  it('aligned cue highlights the current word during playback and Alt+click seeks without capturing', () => {
    const { model, cue } = installModel('approved', undefined, true);
    model.player.currentTimeMs = 2850; // polskiego: 2800–3100
    rerenderApp(model);
    const timed = Array.from(row(cue.id).querySelectorAll('.cue-word.timed-word')).map((b) => b.textContent);
    expect(timed).toEqual(['Uczymy', 'się', 'polskiego', 'razem']);
    expect(row(cue.id).querySelector('.current-word')?.textContent).toBe('polskiego');
    click(dom, word(cue.id, 'razem'), { altKey: true });
    expect(model.player.currentTimeMs).toBe(3200);
    expect(model.selection).toBeNull();
    expect(row(cue.id).querySelector('.current-word')?.textContent).toBe('razem');
  });

  it('punctuation-heavy cue: click and drag produce identical anchors for the same word', () => {
    const { model, cue } = installModel('approved', '„Tak, 2,5 zł.”');
    rerenderApp(model);
    expect(words(cue.id).map((b) => b.textContent)).toEqual(['Tak', '2,5', 'zł']);
    const anchors: unknown[] = [];
    for (const w of ['Tak', '2,5', 'zł']) {
      click(dom, word(cue.id, w));
      anchors.push(model.selection);
    }
    const dragged: unknown[] = [];
    for (const w of ['Tak', '2,5', 'zł']) {
      vi.spyOn(dom.window, 'getSelection').mockImplementation(() => ({ toString: () => w, isCollapsed: true, removeAllRanges: () => undefined }) as unknown as Selection);
      row(cue.id).dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
      dragged.push(model.selection);
    }
    expect(dragged).toEqual(anchors);
    expect(anchors[1]).toMatchObject({ text: '2,5', tokenStart: 3, tokenEnd: 4, charStart: 6, charEnd: 9 });
  });

  it('a drag that starts and ends on one word captures once (no duplicate click capture)', () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    const b = word(cue.id, 'polskiego');
    vi.spyOn(dom.window, 'getSelection').mockImplementation(() => ({ toString: () => 'polskie', isCollapsed: false, removeAllRanges: () => undefined }) as unknown as Selection);
    b.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
    const captured = model.selection;
    expect(captured).toMatchObject({ kind: 'lexeme', text: 'polskiego', tokenStart: 2 });
    click(dom, b);
    expect(model.selection).toBe(captured); // click after the drag is skipped: no second capture/rerender
  });

  it('dblclick on a timed word loops it and leaves a single lexeme selection of that word', () => {
    const { model, cue } = installModel('approved', undefined, true);
    rerenderApp(model);
    click(dom, word(cue.id, 'polskiego'), { detail: 1 });
    const first = model.selection;
    click(dom, word(cue.id, 'polskiego'), { detail: 2 });
    expect(model.selection).toBe(first); // second click is not a fresh capture
    word(cue.id, 'polskiego').dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, detail: 2 }));
    expect(model.player.loopRange).toEqual({ startMs: 2800, endMs: 3100 });
    expect(model.selection).toEqual({ kind: 'lexeme', text: 'polskiego', cueId: cue.id, tokenStart: 2, tokenEnd: 3, charStart: 11, charEnd: 20 });
    expect(document.activeElement?.id).toBe('selection-meaning');
  });

  it('adjacent words touching at a boundary highlight only the later word', () => {
    const { model, cue } = installModel('approved', undefined, true);
    for (const w of model.store.listTranscriptWordTimingsForCue(cue.id)) {
      model.store.putTranscriptWordTiming({ ...w, endMs: w.startMs + 400 }); // contiguous: się ends where polskiego starts
    }
    model.player.currentTimeMs = 2800;
    rerenderApp(model);
    expect(Array.from(row(cue.id).querySelectorAll('.current-word')).map((b) => b.textContent)).toEqual(['polskiego']);
  });

  it('Shift+click on a word in a different cue resets to a plain lexeme for that word', () => {
    const { model, cue } = installModel();
    const other = { ...cue, id: `${cue.id}-b`, cueIndex: 1, startMs: 4000, endMs: 5000, text: 'Dzień dobry.' };
    model.store.putCue(other);
    model.cues = [cue, other];
    rerenderApp(model);
    click(dom, word(cue.id, 'się'));
    click(dom, word(other.id, 'dobry'), { shiftKey: true });
    expect(model.selection).toEqual({ kind: 'lexeme', text: 'dobry', cueId: other.id, tokenStart: 1, tokenEnd: 2, charStart: 6, charEnd: 11 });
  });

  it('unapproved track: click shows the refusal message and sets no selection', () => {
    const { model, cue } = installModel('draft');
    rerenderApp(model);
    click(dom, word(cue.id, 'polskiego'));
    expect(model.selection).toBeNull();
    expect(document.querySelector('.capture-blocked')?.textContent).toBe('Approve the transcript before saving from it.');
  });
});
