import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAppModel,
  saveSelection,
  saveSelectionWithReceipt,
  setSavedItemMeaning,
  setSelection,
  undoSave,
} from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack, type SavedItem } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-foe.3.1: edit an existing meaning in Saved and Review reveal; meaningSource provenance at model level.

const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;
const T0 = new Date('2030-01-01T00:00:00.000Z');
const suggestion = { kind: 'dictionary-suggested', glossSourceId: 'wiktextract-pl', dumpDate: '2026-09-01' } as const;

let dom: JSDOM;
function setupDom() {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.CSS = { escape: (v: string) => v.replace(/"/g, '\\"') } as unknown as typeof CSS;
}

function installModel() {
  const model = createAppModel();
  model.clock = () => T0;
  const asset = makeMediaAsset({ title: 'Foe', originalPath: 'fixtures/media/x.webm', contentSha256: sha, durationMs: 8000, container: 'webm', sizeBytes: 1, privacyLabel: 'owned' });
  model.store.putMediaAsset(asset);
  model.currentMedia = asset;
  const track = makeSubtitleTrack({ mediaId: asset.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'x.srt', contentSha256: sha, isActive: true, transcriptStatus: 'approved' });
  model.store.putSubtitleTrack(track);
  model.targetTrackId = track.id;
  const texts = ['dom jest duży', 'mój dom stoi'];
  const cues = texts.map((text, i) => makeCue({ trackId: track.id, cueIndex: i, startMs: i * 4000, endMs: i * 4000 + 3000, text, normalizedText: text, textSha256: sha }));
  for (const c of cues) model.store.putCue(c);
  model.cues = cues;
  return { model, cues };
}
type Model = ReturnType<typeof createAppModel>;

function select(model: Model, cue: { id: string; text: string }, word: string) {
  const charStart = cue.text.indexOf(word);
  const tokenStart = cue.text.slice(0, charStart).split(/\s+/).filter(Boolean).length;
  setSelection(model, { kind: 'lexeme', text: word, cueId: cue.id, tokenStart, tokenEnd: tokenStart + 1, charStart, charEnd: charStart + word.length });
}
async function saveWord(model: Model, cue: { id: string; text: string }, word: string, meaning = '') {
  select(model, cue, word);
  model.pendingMeaning = meaning;
  return (await saveSelection(model))!;
}
const button = (label: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label) as HTMLButtonElement | undefined;
const key = (el: Element, k: string) => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const item = (model: Model, id: string) => model.store.getSavedItem(id) as SavedItem;

describe('lt-foe.3.1 meaning source at model level', () => {
  beforeEach(() => { setupDom(); });

  it('a typed meaning records a learner source; no meaning records no source', async () => {
    const { model, cues } = installModel();
    const typed = await saveWord(model, cues[0]!, 'dom', 'house');
    expect(item(model, typed.id)).toMatchObject({ meaning: 'house', meaningSource: { kind: 'learner' } });
    const bare = await saveWord(model, cues[0]!, 'duży');
    expect(item(model, bare.id)).not.toHaveProperty('meaningSource');
  });

  it('records dictionary-suggested only when the suggestion is accepted unchanged', async () => {
    const { model, cues } = installModel();
    select(model, cues[0]!, 'dom');
    model.pendingMeaningSuggestion = { text: 'house', source: suggestion };
    model.pendingMeaning = 'house';
    const accepted = (await saveSelection(model))!;
    expect(item(model, accepted.id).meaningSource).toEqual(suggestion);

    select(model, cues[0]!, 'duży');
    model.pendingMeaningSuggestion = { text: 'big', source: suggestion };
    model.pendingMeaning = 'big, large';
    const edited = (await saveSelection(model))!;
    expect(item(model, edited.id)).toMatchObject({ meaning: 'big, large', meaningSource: { kind: 'learner' } });
  });

  it('a later save of the same item never overwrites its meaning or source', async () => {
    const { model, cues } = installModel();
    select(model, cues[0]!, 'dom');
    model.pendingMeaningSuggestion = { text: 'house', source: suggestion };
    model.pendingMeaning = 'house';
    const first = (await saveSelection(model))!;
    const again = await saveWord(model, cues[1]!, 'dom', 'home');
    expect(again.id).toBe(first.id);
    expect(item(model, first.id)).toMatchObject({ meaning: 'house', meaningSource: suggestion });
  });

  it('setSavedItemMeaning records learner; an empty edit clears meaning and source', async () => {
    const { model, cues } = installModel();
    select(model, cues[0]!, 'dom');
    model.pendingMeaningSuggestion = { text: 'house', source: suggestion };
    model.pendingMeaning = 'house';
    const saved = (await saveSelection(model))!;
    expect(setSavedItemMeaning(model, saved.id, ' home ')).toMatchObject({ meaning: 'home', meaningSource: { kind: 'learner' } });
    const cleared = setSavedItemMeaning(model, saved.id, '   ', { allowClear: true })!;
    expect(cleared).not.toHaveProperty('meaning');
    expect(cleared).not.toHaveProperty('meaningSource');
    // Add-meaning keeps requiring a non-empty value.
    expect(setSavedItemMeaning(model, saved.id, '  ')).toBeNull();
  });

  it('undo still works after a save with a meaning', async () => {
    const { model, cues } = installModel();
    select(model, cues[0]!, 'dom');
    model.pendingMeaning = 'house';
    const receipt = (await saveSelectionWithReceipt(model))!;
    expect(item(model, receipt.item.id).meaningSource).toEqual({ kind: 'learner' });
    expect(undoSave(model, receipt)).toBe(true);
    expect(model.store.getSavedItem(receipt.item.id)).toBeUndefined();
  });
});

describe('lt-foe.3.1 Edit meaning UI', () => {
  beforeEach(() => { setupDom(); });

  it('Saved: Edit meaning opens a prefilled input; Enter saves, focus returns to Edit', async () => {
    const { model, cues } = installModel();
    const saved = await saveWord(model, cues[0]!, 'dom', 'house');
    model.view = 'saved';
    rerenderApp(model);
    expect(document.querySelector('.saved-item .meaning')?.textContent).toContain('Meaning: house');
    expect(document.querySelector('.meaning-source-label')).toBeNull();
    const edit = button('Edit meaning')!;
    expect(edit.getAttribute('aria-label')).toBe('Edit meaning for dom');
    edit.click();
    const input = document.querySelector('.saved-item .edit-meaning-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('house');
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-label')).toBe('Edit meaning for dom');
    input.value = 'home';
    key(input, 'Enter');
    expect(item(model, saved.id)).toMatchObject({ meaning: 'home', meaningSource: { kind: 'learner' } });
    expect(document.querySelector('.edit-meaning-input')).toBeNull();
    expect(document.querySelector('.saved-item .meaning')?.textContent).toContain('Meaning: home');
    expect(document.activeElement?.textContent).toBe('Edit meaning');
  });

  it('Saved: Escape and Cancel leave the meaning unchanged and restore focus', async () => {
    const { model, cues } = installModel();
    const saved = await saveWord(model, cues[0]!, 'dom', 'house');
    model.view = 'saved';
    rerenderApp(model);
    button('Edit meaning')!.click();
    let input = document.querySelector('.edit-meaning-input') as HTMLInputElement;
    input.value = 'changed';
    key(input, 'Escape');
    expect(item(model, saved.id).meaning).toBe('house');
    expect(document.querySelector('.edit-meaning-input')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Edit meaning');
    button('Edit meaning')!.click();
    input = document.querySelector('.edit-meaning-input') as HTMLInputElement;
    input.value = 'changed';
    button('Cancel')!.click();
    expect(item(model, saved.id).meaning).toBe('house');
    expect(document.activeElement?.textContent).toBe('Edit meaning');
  });

  it('Saved: clearing via edit removes meaning and source and falls back to Add meaning', async () => {
    const { model, cues } = installModel();
    const saved = await saveWord(model, cues[0]!, 'dom', 'house');
    model.view = 'saved';
    rerenderApp(model);
    button('Edit meaning')!.click();
    const input = document.querySelector('.edit-meaning-input') as HTMLInputElement;
    input.value = '  ';
    button('Save meaning')!.click();
    expect(item(model, saved.id)).not.toHaveProperty('meaning');
    expect(item(model, saved.id)).not.toHaveProperty('meaningSource');
    expect(document.querySelector('.saved-item .add-meaning-input')).not.toBeNull();
  });

  it('shows a dictionary-suggestion label only for suggested meanings', async () => {
    const { model, cues } = installModel();
    select(model, cues[0]!, 'dom');
    model.pendingMeaningSuggestion = { text: 'house', source: suggestion };
    model.pendingMeaning = 'house';
    await saveSelection(model);
    model.view = 'saved';
    rerenderApp(model);
    expect(document.querySelector('.saved-item .meaning-source-label')?.textContent).toBe('(dictionary suggestion)');
  });

  it('Review reveal: Edit meaning saves with Enter and keeps the reveal open', async () => {
    const { model, cues } = installModel();
    const saved = await saveWord(model, cues[0]!, 'dom', 'house');
    model.view = 'review';
    rerenderApp(model);
    button('Show answer / context')!.click();
    expect(document.querySelector('.review-meaning')?.textContent).toContain('Meaning: house');
    button('Edit meaning')!.click();
    const input = document.querySelector('.review-reveal .edit-meaning-input') as HTMLInputElement;
    expect(input.value).toBe('house');
    expect(document.activeElement).toBe(input);
    input.value = 'building';
    key(input, 'Enter');
    expect(item(model, saved.id)).toMatchObject({ meaning: 'building', meaningSource: { kind: 'learner' } });
    expect(document.querySelector('.review-meaning')?.textContent).toContain('Meaning: building');
    expect(document.activeElement?.textContent).toBe('Edit meaning');
    button('Edit meaning')!.click();
    key(document.querySelector('.edit-meaning-input')!, 'Escape');
    expect(item(model, saved.id).meaning).toBe('building');
    expect(document.activeElement?.textContent).toBe('Edit meaning');
  });
});
