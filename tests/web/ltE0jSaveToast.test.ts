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

/** Save through the capture form exactly like the learner: Save occurrence button or Enter in Meaning. */
async function saveViaForm(model: Model, cue: { id: string; text: string }, word: string, opts: { meaning?: string; notes?: string; enter?: boolean } = {}) {
  const selection = select(model, cue, word);
  if (opts.meaning) setPendingMeaning(model, opts.meaning);
  if (opts.notes) setPendingNotes(model, opts.notes);
  rerenderApp(model);
  if (opts.enter) document.getElementById('selection-meaning')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  else button('Save occurrence')!.click();
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

  it('Undo archives the item and its card and reopens capture with the previous values', async () => {
    const { model, cues } = installModel();
    const selection = await saveViaForm(model, cues[0]!, 'dom', { meaning: 'house', notes: 'n1' });
    const item = Object.values(model.store.snapshot().savedItems)[0]!;
    const card = Object.values(model.store.snapshot().reviewCards)[0]!;
    region()!.querySelector('button')!.click();
    expect(model.store.getSavedItem(item.id)!.archivedAt).toBeDefined();
    expect(model.store.getReviewCard(card.id)!.suspendedAt).toBeDefined();
    expect(model.store.getReviewCard(card.id)!.deletedAt).toBeUndefined();
    expect(model.selection).toEqual(selection);
    expect(model.pendingMeaning).toBe('house');
    expect(model.pendingNotes).toBe('n1');
    expect((document.getElementById('selection-meaning') as HTMLInputElement).value).toBe('house');
    expect(region()!.textContent).toBe('Removed \u201cdom\u201d');
    expect(region()!.querySelector('button')).toBeNull();
    // A re-save after Undo creates a fresh active item (the archived one is not deduped into).
    button('Save occurrence')!.click();
    await flush();
    const active = Object.values(model.store.snapshot().savedItems).filter((i) => !i.archivedAt);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).not.toBe(item.id);
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
    expect(model.store.getSavedItem(item.id)!.archivedAt).toBeUndefined();
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
    expect(model.store.getSavedItem(item.id)!.archivedAt).toBeUndefined();
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
});
