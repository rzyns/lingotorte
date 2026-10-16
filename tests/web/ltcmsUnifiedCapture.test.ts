import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, saveSentenceFromCue } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack, makeTranscriptWordTiming } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-cms: every collect gesture opens one capture state; nothing persists until Save / Enter.

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

const savedItems = (model: ReturnType<typeof createAppModel>) => Object.values(model.store.snapshot().savedItems);
const btn = (label: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label) as HTMLButtonElement | undefined;
const meaning = () => document.getElementById('selection-meaning') as HTMLInputElement | null;

function dragSelect(dom: JSDOM, cueId: string, text: string) {
  const row = document.querySelector(`[data-cue-id="${cueId}"]`) as HTMLElement;
  const original = dom.window.getSelection.bind(dom.window);
  vi.spyOn(dom.window, 'getSelection').mockImplementation(() => ({ toString: () => text, removeAllRanges: () => undefined }) as unknown as Selection);
  row.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
  return original;
}

function key(dom: JSDOM, el: HTMLElement, k: string) {
  el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

describe('lt-cms unified capture state', () => {
  let dom: JSDOM;
  beforeEach(() => { dom = setupDom(); });
  afterEach(() => { vi.restoreAllMocks(); dom.window.close(); });

  it('drag-select creates a selection with meaning focused and does not save', async () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    dragSelect(dom, cue.id, 'polskiego razem');
    await vi.waitFor(() => expect(model.selection).not.toBeNull());
    expect(model.selection).toMatchObject({ kind: 'phrase', text: 'polskiego razem', cueId: cue.id });
    expect(savedItems(model)).toHaveLength(0);
    expect(document.activeElement?.id).toBe('selection-meaning');
  });

  it('drag-select of one word yields a lexeme selection', async () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    dragSelect(dom, cue.id, 'polskiego');
    await vi.waitFor(() => expect(model.selection?.kind).toBe('lexeme'));
    expect(savedItems(model)).toHaveLength(0);
  });

  it('Save sentence… opens the form with meaning focused; Enter saves with the meaning and it shows in My Sentences', async () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    btn('Save sentence…')!.click();
    expect(model.selection).toMatchObject({ kind: 'sentence', text: cue.text, charStart: 0, charEnd: cue.text.length, tokenStart: 0, tokenEnd: 4 });
    expect(savedItems(model)).toHaveLength(0);
    expect(document.activeElement?.id).toBe('selection-meaning');
    const input = meaning()!;
    input.value = 'We learn Polish together.';
    input.dispatchEvent(new dom.window.Event('input'));
    key(dom, input, 'Enter');
    await vi.waitFor(() => expect(savedItems(model)).toHaveLength(1));
    const item = savedItems(model)[0]!;
    expect(item).toMatchObject({ kind: 'sentence', displayText: cue.text, meaning: 'We learn Polish together.' });
    const occurrences = model.savedOccurrenceService.listOccurrencesForItem(item.id);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({ cueId: cue.id, startMs: 2000, endMs: 4000 });
    expect(model.selection).toBeNull();
    model.view = 'saved';
    model.savedViewTab = 'sentences';
    rerenderApp(model);
    expect(document.getElementById('app')?.textContent).toContain(cue.text);
  });

  it('Esc in the form cancels without saving', async () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    dragSelect(dom, cue.id, 'razem');
    await vi.waitFor(() => expect(meaning()).not.toBeNull());
    key(dom, meaning()!, 'Escape');
    expect(model.selection).toBeNull();
    expect(meaning()).toBeNull();
    expect(savedItems(model)).toHaveLength(0);
  });

  it('draft track blocks capture and save', async () => {
    const { model, cue } = installModel('draft');
    rerenderApp(model);
    expect(btn('Save sentence…')!.disabled).toBe(true);
    model.selection = { kind: 'sentence', text: cue.text, cueId: cue.id, tokenStart: 0, tokenEnd: 4, charStart: 0, charEnd: cue.text.length };
    rerenderApp(model);
    const save = (document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement | null)!;
    expect(save.disabled).toBe(true);
    expect(save.title).toBe('Approve this transcript before saving learner study items.');
    key(dom, meaning()!, 'Enter');
    await new Promise((r) => setTimeout(r, 10));
    expect(savedItems(model)).toHaveLength(0);
  });

  it('timed-word click opens the form with meaning focused (no seek; lt-z8s moved replay to Alt+click), and resets a prior pending meaning', () => {
    const { model, cue } = installModel('approved', undefined, true);
    model.pendingMeaning = 'stale meaning';
    model.pendingNotes = 'stale notes';
    rerenderApp(model);
    const timed = Array.from(document.querySelectorAll('.timed-word')).find((b) => b.textContent === 'polskiego') as HTMLButtonElement;
    expect(timed).toBeTruthy();
    timed.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, altKey: true }));
    expect(model.player.currentTimeMs).toBe(2800);
    expect(model.selection).toBeNull();
    (Array.from(document.querySelectorAll('.timed-word')).find((b) => b.textContent === 'polskiego') as HTMLButtonElement).click();
    expect(model.player.currentTimeMs).toBe(2800);
    expect(model.selection).toMatchObject({ kind: 'lexeme', text: 'polskiego', cueId: cue.id, tokenStart: 2 });
    expect(model.pendingMeaning).toBe('');
    expect(model.pendingNotes).toBe('');
    expect(meaning()!.value).toBe('');
    expect(document.activeElement?.id).toBe('selection-meaning');
    expect(savedItems(model)).toHaveLength(0);
  });

  it('timed-word Alt+click on a draft track still seeks but opens no capture', () => {
    const { model } = installModel('draft', undefined, true);
    rerenderApp(model);
    (Array.from(document.querySelectorAll('.timed-word')).find((b) => b.textContent === 'razem') as HTMLButtonElement)
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, altKey: true }));
    expect(model.player.currentTimeMs).toBe(3200);
    expect(model.selection).toBeNull();
  });

  it('overlay-word click opens the form; nothing is saved until Save', async () => {
    const { model, cue } = installModel('approved', undefined, true);
    rerenderApp(model);
    const word = Array.from(document.querySelectorAll('.subtitle-overlay .subtitle-word')).find((b) => b.textContent === 'razem') as HTMLButtonElement;
    expect(word.getAttribute('aria-label')).toBe('Capture razem');
    word.click();
    expect(model.selection).toMatchObject({ kind: 'lexeme', text: 'razem', cueId: cue.id });
    expect(document.activeElement?.id).toBe('selection-meaning');
    expect(savedItems(model)).toHaveLength(0);
    (document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement | null)!.click();
    await vi.waitFor(() => expect(savedItems(model)).toHaveLength(1));
    expect(savedItems(model)[0]).toMatchObject({ kind: 'lexeme', displayText: 'razem' });
  });

  it('a zero-length mouseup opens nothing', async () => {
    const { model, cue } = installModel();
    rerenderApp(model);
    dragSelect(dom, cue.id, '   ');
    await new Promise((r) => setTimeout(r, 10));
    expect(model.selection).toBeNull();
    expect(meaning()).toBeNull();
  });

  it('Enter in Notes does not save', async () => {
    const { model } = installModel();
    rerenderApp(model);
    btn('Save sentence…')!.click();
    const notes = document.getElementById('selection-notes') as HTMLTextAreaElement;
    key(dom, notes, 'Enter');
    await new Promise((r) => setTimeout(r, 10));
    expect(savedItems(model)).toHaveLength(0);
    expect(model.selection).not.toBeNull();
  });

  it('saving the same sentence twice dedupes exactly like saveSentenceFromCue', async () => {
    const { model } = installModel();
    rerenderApp(model);
    for (let i = 1; i <= 2; i += 1) {
      btn('Save sentence…')!.click();
      (document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement | null)!.click();
      await vi.waitFor(() => expect(model.selection).toBeNull());
    }
    // Reference: the direct saveSentenceFromCue path, twice, on a fresh model.
    const ref = installModel();
    await saveSentenceFromCue(ref.model, ref.cue);
    await saveSentenceFromCue(ref.model, ref.cue);
    const refItems = savedItems(ref.model);
    expect(savedItems(model)).toHaveLength(refItems.length);
    expect(model.savedOccurrenceService.listOccurrencesForItem(savedItems(model)[0]!.id)).toHaveLength(
      ref.model.savedOccurrenceService.listOccurrencesForItem(refItems[0]!.id).length,
    );
    expect(savedItems(model)).toHaveLength(1);
  });

  it('drag-select of a repeated word anchors to the selected (second) occurrence via Range offsets', async () => {
    const { model, cue } = installModel('approved', 'tak i tak');
    rerenderApp(model);
    const row = document.querySelector(`[data-cue-id="${cue.id}"]`) as HTMLElement;
    const textEl = row.querySelector('.cue-target') as HTMLElement;
    // lt-z8s: words are buttons now; select the text inside the second 'tak' button (cue offset 6–9).
    const textNode = textEl.querySelectorAll('.cue-word')[2]!.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 3);
    const sel = dom.window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    row.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
    await vi.waitFor(() => expect(model.selection).not.toBeNull());
    expect(model.selection).toMatchObject({ kind: 'lexeme', text: 'tak', charStart: 6, charEnd: 9 });
  });

  it('drag-select on a draft track shows the approval help message', async () => {
    const { model, cue } = installModel('draft');
    rerenderApp(model);
    dragSelect(dom, cue.id, 'razem');
    await vi.waitFor(() => expect(model.importError).toBe('Approve the transcript before saving from it.'));
    expect(model.selection).toBeNull();
    expect(document.getElementById('app')?.textContent).toContain('Approve the transcript before saving from it.');
  });
});
