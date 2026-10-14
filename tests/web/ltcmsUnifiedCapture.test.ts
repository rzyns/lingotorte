import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-cms: every collect gesture opens one capture state; nothing persists until Save occurrence / Enter.

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

function installModel(status: 'approved' | 'draft' = 'approved') {
  const model = createAppModel();
  const asset = makeMediaAsset({ title: 'Capture', originalPath: 'fixtures/media/x.webm', contentSha256: sha, durationMs: 4000, container: 'webm', sizeBytes: 1, privacyLabel: 'owned' });
  model.store.putMediaAsset(asset);
  model.currentMedia = asset;
  const track = makeSubtitleTrack({ mediaId: asset.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'x.srt', contentSha256: sha, isActive: true, transcriptStatus: status });
  model.store.putSubtitleTrack(track);
  model.targetTrackId = track.id;
  const text = 'Uczymy się polskiego razem.';
  const cue = makeCue({ trackId: track.id, cueIndex: 0, startMs: 2000, endMs: 4000, text, normalizedText: text.toLocaleLowerCase('pl'), textSha256: sha });
  model.store.putCue(cue);
  model.cues = [cue];
  model.view = 'player';
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
    const save = btn('Save occurrence')!;
    expect(save.disabled).toBe(true);
    expect(save.title).toBe('Approve this transcript before saving learner study items.');
    key(dom, meaning()!, 'Enter');
    await new Promise((r) => setTimeout(r, 10));
    expect(savedItems(model)).toHaveLength(0);
  });
});
