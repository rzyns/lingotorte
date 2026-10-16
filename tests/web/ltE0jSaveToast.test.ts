import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';

// lt-e0j: point-of-action save toast with Undo, and the actionable unsaved banner.

vi.mock('../../apps/web/src/model', async (original) => {
  const actual = await original<typeof import('../../apps/web/src/model')>();
  return { ...actual, saveModelToLocalService: vi.fn(async () => ({ ok: true })) };
});

import * as modelModule from '../../apps/web/src/model';
import { createAppModel, markUnsavedBrowserEdits, setSelection, setPendingMeaning, setPendingNotes } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';

const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;
let now = new Date('2030-01-01T00:00:00.000Z').valueOf();
let dom: JSDOM;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  for (const key of ['document', 'window', 'HTMLElement', 'HTMLInputElement', 'HTMLVideoElement', 'Element', 'Node', 'MutationObserver', 'KeyboardEvent'] as const) vi.stubGlobal(key, dom.window[key]);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('CSS', { escape: (v: string) => v.replace(/"/g, '\\"') });
  now = new Date('2030-01-01T00:00:00.000Z').valueOf();
  vi.mocked(modelModule.saveModelToLocalService).mockClear();
});
afterEach(() => { vi.useRealTimers(); dom.window.close(); vi.unstubAllGlobals(); });

function installModel() {
  const model = createAppModel();
  model.clock = () => new Date(now);
  const asset = makeMediaAsset({ title: 'E0j', originalPath: 'fixtures/media/x.webm', contentSha256: sha, durationMs: 8000, container: 'webm', sizeBytes: 1, privacyLabel: 'owned' });
  model.store.putMediaAsset(asset);
  model.currentMedia = asset;
  const track = makeSubtitleTrack({ mediaId: asset.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'x.srt', contentSha256: sha, isActive: true, transcriptStatus: 'approved' });
  model.store.putSubtitleTrack(track);
  model.targetTrackId = track.id;
  const texts = ['dom jest duży', 'mój dom stoi'];
  const cues = texts.map((text, i) => makeCue({ trackId: track.id, cueIndex: i, startMs: i * 4000, endMs: i * 4000 + 3000, text, normalizedText: text, textSha256: sha }));
  for (const c of cues) model.store.putCue(c);
  model.cues = cues;
  model.player.activeCueId = cues[0]!.id;
  return { model, cues };
}

type Model = ReturnType<typeof createAppModel>;
function select(model: Model, cue: { id: string; text: string }, word: string) {
  const charStart = cue.text.indexOf(word);
  const tokenStart = cue.text.slice(0, charStart).split(/\s+/).filter(Boolean).length;
  const selection = { kind: 'lexeme' as const, text: word, cueId: cue.id, tokenStart, tokenEnd: tokenStart + 1, charStart, charEnd: charStart + word.length };
  setSelection(model, selection);
  return selection;
}
const button = (label: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label) as HTMLButtonElement | undefined;
const region = () => document.querySelector('.toast-region') as HTMLElement | null;
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

/** Save through the capture form exactly like the learner: Save button or Enter in Meaning. */
async function saveViaForm(model: Model, cue: { id: string; text: string }, word: string, opts: { meaning?: string; notes?: string; enter?: boolean } = {}) {
  const selection = select(model, cue, word);
  if (opts.meaning) setPendingMeaning(model, opts.meaning);
  if (opts.notes) setPendingNotes(model, opts.notes);
  rerenderApp(model);
  if (opts.enter) document.getElementById('selection-meaning')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  else (document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement | null)!.click();
  await flush();
  return selection;
}

describe('lt-e0j save toast', () => {
  it('saving shows the toast with the item text inside a role=status aria-live=polite region', async () => {
    const { model, cues } = installModel();
    await saveViaForm(model, cues[0]!, 'dom');
    const r = region();
    expect(r).not.toBeNull();
    expect(r!.getAttribute('role')).toBe('status');
    expect(r!.getAttribute('aria-live')).toBe('polite');
    expect(r!.textContent).toContain('Saved \u201cdom\u201d');
    expect(r!.querySelector('button')!.textContent).toBe('Undo');
    expect(model.ui.toast?.text).toBe('Saved \u201cdom\u201d');
  });

  it('Enter in Meaning also shows the toast', async () => {
    const { model, cues } = installModel();
    await saveViaForm(model, cues[0]!, 'jest', { meaning: 'is', enter: true });
    expect(region()!.textContent).toContain('Saved \u201cjest\u201d');
  });

  it('the region is the same element across rerenders and is not rebuilt while the toast is unchanged', async () => {
    const { model, cues } = installModel();
    await saveViaForm(model, cues[0]!, 'dom');
    const first = region()!;
    const inner = first.firstElementChild;
    rerenderApp(model);
    rerenderApp(model);
    expect(region()).toBe(first);
    expect(first.firstElementChild).toBe(inner);
    expect(document.querySelectorAll('.toast-region')).toHaveLength(1);
    expect(model.ui.toast).not.toBeNull();
  });

  it('Undo removes the new item, its occurrence, card and card state and reopens capture with the previous values', async () => {
    const { model, cues } = installModel();
    const selection = await saveViaForm(model, cues[0]!, 'dom', { meaning: 'house', notes: 'n1' });
    const item = Object.values(model.store.snapshot().savedItems)[0]!;
    const card = Object.values(model.store.snapshot().reviewCards)[0]!;
    region()!.querySelector('button')!.click();
    const snap = model.store.snapshot();
    expect(snap.savedItems).toEqual({});
    expect(snap.savedOccurrences).toEqual({});
    expect(snap.reviewCards).toEqual({});
    expect(model.store.getReviewCardState(card.id)).toBeUndefined();
    expect(model.store.getSavedItem(item.id)).toBeUndefined();
    expect(model.selection).toEqual(selection);
    expect(model.pendingMeaning).toBe('house');
    expect(model.pendingNotes).toBe('n1');
    expect((document.getElementById('selection-meaning') as HTMLInputElement).value).toBe('house');
    expect(region()!.textContent).toBe('Removed \u201cdom\u201d');
    expect(region()!.querySelector('button')).toBeNull();
    (document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement | null)!.click();
    await flush();
    const active = Object.values(model.store.snapshot().savedItems);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).not.toBe(item.id);
  });

  it('Undo of a new item leaves no trace in the review queue, practice data or export snapshot', async () => {
    const { model, cues } = installModel();
    await saveViaForm(model, cues[0]!, 'dom');
    const card = Object.values(model.store.snapshot().reviewCards)[0]!;
    const dueIds = (at: number) => model.reviewService.listDueCards(new Date(at)).map((c) => c.card.id);
    expect(dueIds(now)).toContain(card.id);
    region()!.querySelector('button')!.click();
    expect(dueIds(now + 86_400_000)).not.toContain(card.id);
    expect(model.savedOccurrenceService.listItems()).toHaveLength(0);
    const serialized = JSON.stringify(model.store.snapshot());
    expect(serialized).not.toContain(card.id);
    expect(serialized).not.toContain('\u201cdom');
  });

  it('Undo is refused when the card got a review after the save', async () => {
    const { model, cues } = installModel();
    await saveViaForm(model, cues[0]!, 'dom');
    const card = Object.values(model.store.snapshot().reviewCards)[0]!;
    now += 1_000;
    model.reviewService.submitReview(card.id, 'good' as never, new Date(now));
    const before = JSON.stringify(model.store.snapshot());
    region()!.querySelector('button')!.click();
    expect(JSON.stringify(model.store.snapshot())).toBe(before);
    expect(region()!.textContent).toBe('Can\u2019t undo \u2014 \u201cdom\u201d changed since it was saved');
    expect(region()!.querySelector('button')).toBeNull();
  });

  it('Undo is refused when the item was edited after the save', async () => {
    const { model, cues } = installModel();
    await saveViaForm(model, cues[0]!, 'dom');
    const item = Object.values(model.store.snapshot().savedItems)[0]!;
    model.store.putSavedItem({ ...item, meaning: 'edited' });
    const before = JSON.stringify(model.store.snapshot());
    region()!.querySelector('button')!.click();
    expect(JSON.stringify(model.store.snapshot())).toBe(before);
    expect(region()!.textContent).toContain('Can\u2019t undo');
  });

  it('Undo of the first save is refused once the item got another occurrence', async () => {
    const { model, cues } = installModel();
    await saveViaForm(model, cues[0]!, 'dom');
    const undoFirst = model.ui.toast!.undo!;
    await saveViaForm(model, cues[1]!, 'dom');
    const before = JSON.stringify(model.store.snapshot());
    undoFirst();
    expect(JSON.stringify(model.store.snapshot())).toBe(before);
    expect(model.ui.toast!.text).toContain('Can\u2019t undo');
  });

  it('Undo is refused while the created card is on screen in Review', async () => {
    const { model, cues } = installModel();
    await saveViaForm(model, cues[0]!, 'dom');
    model.review.activeCardId = Object.values(model.store.snapshot().reviewCards)[0]!.id;
    region()!.querySelector('button')!.click();
    expect(Object.values(model.store.snapshot().savedItems)).toHaveLength(1);
    expect(model.ui.toast!.text).toContain('Can\u2019t undo');
  });

  it('Undo marks the model dirty and autosaves when connected', async () => {
    const { model, cues } = installModel();
    model.localService.status = 'connected';
    model.localService.autosaveEnabled = true;
    model.localService.revision = 'r1' as never;
    await saveViaForm(model, cues[0]!, 'dom');
    vi.mocked(modelModule.saveModelToLocalService).mockClear();
    model.localService.syncState = 'saved';
    region()!.querySelector('button')!.click();
    expect(model.localService.syncState).toBe('unsaved');
  });

  it('Undo during a pending conflict mutates locally but does not autosave', async () => {
    const { model, cues } = installModel();
    model.localService.status = 'connected';
    model.localService.autosaveEnabled = true;
    model.localService.revision = 'r1' as never;
    await saveViaForm(model, cues[0]!, 'dom');
    model.localService.syncState = 'conflict';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    region()!.querySelector('button')!.click();
    expect(model.store.snapshot().savedItems).toEqual({});
    expect(model.localService.syncState).toBe('conflict');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Undo after a dedupe save removes only the new occurrence and never the pre-existing item or card', async () => {
    const { model, cues } = installModel();
    await saveViaForm(model, cues[0]!, 'dom');
    const item = Object.values(model.store.snapshot().savedItems)[0]!;
    const card = Object.values(model.store.snapshot().reviewCards)[0]!;
    await saveViaForm(model, cues[1]!, 'dom');
    expect(model.savedOccurrenceService.listOccurrencesForItem(item.id)).toHaveLength(2);
    const original = model.savedOccurrenceService.listOccurrencesForItem(item.id)[0]!;
    region()!.querySelector('button')!.click();
    expect(model.store.getSavedItem(item.id)).toBeDefined();
    expect(model.store.getReviewCard(card.id)!.suspendedAt).toBeUndefined();
    expect(Object.values(model.store.snapshot().reviewCards)).toHaveLength(1);
    expect(model.savedOccurrenceService.listOccurrencesForItem(item.id).map((o) => o.id)).toEqual([original.id]);
  });

  it('Undo of a dedupe save that created the first card for the item removes that card and the occurrence only', async () => {
    const { model, cues } = installModel();
    // Simulate a pre-lt-uzo item (no card): save, then drop its card from the store.
    await saveViaForm(model, cues[0]!, 'dom');
    const item = Object.values(model.store.snapshot().savedItems)[0]!;
    const oldCard = Object.values(model.store.snapshot().reviewCards)[0]!;
    model.store.removeReviewCard(oldCard.id);
    model.store.removeReviewCardState(oldCard.id);
    await saveViaForm(model, cues[1]!, 'dom');
    expect(Object.values(model.store.snapshot().reviewCards)).toHaveLength(1);
    region()!.querySelector('button')!.click();
    expect(Object.values(model.store.snapshot().reviewCards)).toHaveLength(0);
    expect(model.store.getSavedItem(item.id)).toBeDefined();
    expect(model.savedOccurrenceService.listOccurrencesForItem(item.id)).toHaveLength(1);
  });

  it('the toast disappears after expiry with an injected clock and fake timers', async () => {
    const { model, cues } = installModel();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await saveViaForm(model, cues[0]!, 'dom');
    const r = region()!;
    expect(r.textContent).toContain('Saved');
    // Timer fires but the clock has not advanced: still shown (re-checks the clock).
    vi.advanceTimersByTime(5_000);
    expect(model.ui.toast).not.toBeNull();
    now += 5_000;
    vi.advanceTimersByTime(5_000);
    expect(model.ui.toast).toBeNull();
    expect(r.textContent).toBe('');
    expect(region()).toBe(r);
  });

  it('a new save replaces the toast', async () => {
    const { model, cues } = installModel();
    await saveViaForm(model, cues[0]!, 'dom');
    const firstId = model.ui.toast!.id;
    await saveViaForm(model, cues[0]!, 'jest');
    expect(model.ui.toast!.id).not.toBe(firstId);
    expect(region()!.querySelectorAll('.toast')).toHaveLength(1);
    expect(region()!.textContent).toContain('Saved \u201cjest\u201d');
    expect(region()!.textContent).not.toContain('\u201cdom\u201d');
  });

  it('Undo is a Tab-reachable button that does not take focus on show', async () => {
    const { model, cues } = installModel();
    await saveViaForm(model, cues[0]!, 'dom');
    const undo = region()!.querySelector('button')!;
    expect(undo.tagName).toBe('BUTTON');
    expect(undo.textContent).toBe('Undo');
    expect(undo.tabIndex).toBe(0);
    expect(undo.hasAttribute('tabindex')).toBe(false);
    expect(document.activeElement).not.toBe(undo);
  });
});

describe('lt-e0j actionable unsaved banner', () => {
  const banner = () => document.querySelector('[data-local-service-sync]') as HTMLElement;

  it('disconnected: says to connect in Settings, has no Save now, and Settings navigates', () => {
    const { model } = installModel();
    markUnsavedBrowserEdits(model);
    rerenderApp(model);
    expect(banner().textContent).toBe('Changes not yet saved to the local service \u2014 connect in Settings to save');
    expect(button('Save now')).toBeUndefined();
    banner().querySelector('button')!.click();
    expect(model.view).toBe('settings');
    expect(modelModule.saveModelToLocalService).not.toHaveBeenCalled();
  });

  it('connected: Save now calls saveModelToLocalService and keeps the [data-local-service-save] hook', async () => {
    const { model } = installModel();
    markUnsavedBrowserEdits(model);
    model.localService.status = 'connected';
    rerenderApp(model);
    expect(banner().textContent).toBe('Changes not yet saved to the local service \u2014 Save now \u00b7 Settings');
    const save = banner().querySelector('[data-local-service-save]') as HTMLButtonElement;
    expect(save.textContent).toBe('Save now');
    expect(save.disabled).toBe(false);
    save.click();
    await flush();
    expect(modelModule.saveModelToLocalService).toHaveBeenCalledTimes(1);
    expect(modelModule.saveModelToLocalService).toHaveBeenCalledWith(model, model.localService.baseUrl);
  });
  it('Save now failure leaves the banner in an error state and re-enables the button', async () => {
    const { model } = installModel();
    markUnsavedBrowserEdits(model);
    model.localService.status = 'connected';
    rerenderApp(model);
    vi.mocked(modelModule.saveModelToLocalService).mockRejectedValueOnce(new Error('boom'));
    const save = banner().querySelector('[data-local-service-save]') as HTMLButtonElement;
    save.click();
    expect(save.disabled).toBe(true);
    save.click();
    await flush();
    expect(modelModule.saveModelToLocalService).toHaveBeenCalledTimes(1);
    expect(banner().dataset.syncState).toBe('error');
    expect(banner().textContent).toContain('Save failed: boom');
    const retry = banner().querySelector('[data-local-service-save]') as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
  });

  it('Save now is not offered while a save is in flight', () => {
    const { model } = installModel();
    model.localService.status = 'connected';
    model.localService.syncState = 'saving';
    rerenderApp(model);
    expect(banner().querySelector('[data-local-service-save]')).toBeNull();
  });
});

describe('lt-e0j reduced motion', () => {
  it('the toast animation is disabled under prefers-reduced-motion', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../../apps/web/src/style.css', import.meta.url), 'utf8');
    const blocks = css.split('@media (prefers-reduced-motion: reduce)').slice(1);
    expect(blocks.some((b) => /\.toast\s*\{[^}]*animation:\s*none/.test(b.slice(0, b.indexOf('\n}'))))).toBe(true);
  });
});
