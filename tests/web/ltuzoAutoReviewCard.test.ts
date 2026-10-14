import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAppModel,
  importFixtureMediaAndSubtitles,
  listReviewBuckets,
  saveSelection,
  setSelection,
} from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-uzo: saving creates one recognition card per saved item; Saved toggles archive (suspend) / re-add.

const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;
const T0 = new Date('2030-01-01T00:00:00.000Z');

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

/** Two approved cues sharing the word 'dom'; no native track, so there is no native cue line. */
function installModel() {
  const model = createAppModel();
  model.clock = () => T0;
  const asset = makeMediaAsset({ title: 'Uzo', originalPath: 'fixtures/media/x.webm', contentSha256: sha, durationMs: 8000, container: 'webm', sizeBytes: 1, privacyLabel: 'owned' });
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

async function saveWord(model: ReturnType<typeof createAppModel>, cue: { id: string; text: string }, word: string) {
  const charStart = cue.text.indexOf(word);
  const tokenStart = cue.text.slice(0, charStart).split(/\s+/).filter(Boolean).length;
  setSelection(model, { kind: 'lexeme', text: word, cueId: cue.id, tokenStart, tokenEnd: tokenStart + 1, charStart, charEnd: charStart + word.length });
  return (await saveSelection(model))!;
}

const cards = (model: ReturnType<typeof createAppModel>) => Object.values(model.store.snapshot().reviewCards);
const dueIds = (model: ReturnType<typeof createAppModel>) => {
  const b = listReviewBuckets(model, model.clock());
  return [...b.newCards, ...b.learning, ...b.review, ...b.relearning, ...b.mastered].map((x) => x.card.id);
};
const button = (label: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === label) as HTMLButtonElement | undefined;
const buttonsStarting = (prefix: string) => Array.from(document.querySelectorAll('button')).filter((b) => b.textContent?.startsWith(prefix));

describe('lt-uzo auto review card', () => {
  beforeEach(() => { setupDom(); });

  it('saving an occurrence creates exactly one new recognition card, still one after another occurrence', async () => {
    const { model, cues } = installModel();
    const item = await saveWord(model, cues[0]!, 'dom');
    expect(cards(model)).toHaveLength(1);
    const card = cards(model)[0]!;
    expect(card).toMatchObject({ savedItemId: item.id, cardType: 'recognition', promptTemplate: 'Recognize: dom', createdAt: T0.toISOString() });
    expect(model.store.getReviewCardState(card.id)).toMatchObject({ state: 'new', dueAt: T0.toISOString() });
    const again = await saveWord(model, cues[1]!, 'dom');
    expect(again.id).toBe(item.id);
    expect(model.savedOccurrenceService.listOccurrencesForItem(item.id)).toHaveLength(2);
    expect(cards(model)).toHaveLength(1);
    expect(model.localService.syncState).toBe('unsaved');
  });

  it('toggle off archives without deleting; toggle on re-activates the same card', async () => {
    const { model, cues } = installModel();
    await saveWord(model, cues[0]!, 'dom');
    const [card] = cards(model);
    model.view = 'saved';
    rerenderApp(model);
    button('In review ✓')!.click();
    expect(cards(model)).toHaveLength(1);
    expect(model.store.getReviewCard(card!.id)?.suspendedAt).toBe(T0.toISOString());
    expect(model.store.getReviewCard(card!.id)?.deletedAt).toBeUndefined();
    expect(model.store.getReviewCardState(card!.id)).toBeDefined();
    expect(dueIds(model)).not.toContain(card!.id);
    // Saving another occurrence does not silently re-add an opted-out item.
    await saveWord(model, cues[1]!, 'dom');
    expect(cards(model)).toHaveLength(1);
    expect(model.store.getReviewCard(card!.id)?.suspendedAt).toBeDefined();
    rerenderApp(model);
    button('Add to review')!.click();
    expect(cards(model)).toHaveLength(1);
    expect(model.store.getReviewCard(card!.id)?.suspendedAt).toBeUndefined();
    expect(dueIds(model)).toContain(card!.id);
    expect(button('In review ✓')).toBeDefined();
  });

  it('Review deck count excludes archived cards and reports them separately', async () => {
    const { model, cues } = installModel();
    await saveWord(model, cues[0]!, 'dom');
    await saveWord(model, cues[1]!, 'stoi');
    model.view = 'saved';
    rerenderApp(model);
    buttonsStarting('In review')[0]!.click();
    model.view = 'review';
    rerenderApp(model);
    expect(document.querySelector('.review-card > p.meta')?.textContent).toBe('1 card in local deck (1 archived)');
    expect(dueIds(model)).toHaveLength(1);
  });

  it('toggle on creates a card for an item that has none (pre-lt-uzo data)', () => {
    const { model, cues } = installModel();
    const cue = cues[0]!;
    // Service-level save bypasses saveSelection: models an item saved before auto-cards existed.
    const { item, occurrence } = model.savedOccurrenceService.saveSelection({ kind: 'lexeme', language: 'pl', displayText: 'dom', mediaId: model.currentMedia!.id, cueId: cue.id, startMs: cue.startMs, endMs: cue.endMs, sourceContext: { mediaId: model.currentMedia!.id, mediaPath: 'fixtures/media/x.webm', mediaFingerprint: sha, subtitleTrackId: model.targetTrackId!, cueId: cue.id, cueIndex: 0, cueTextSha256: sha, tokenSpan: { startToken: 0, endToken: 1 }, charSpan: { start: 0, end: 3 } } as never });
    expect(cards(model)).toHaveLength(0);
    model.view = 'saved';
    rerenderApp(model);
    expect(button('Add all to review (1)')).toBeDefined();
    button('Add to review')!.click();
    expect(cards(model)).toMatchObject([{ savedItemId: item.id, savedOccurrenceId: occurrence.id, cardType: 'recognition' }]);
    expect(button('In review ✓')).toBeDefined();
  });

  it("'Add all to review (N)' creates cards only for items lacking an active card", async () => {
    const { model, cues } = installModel();
    await saveWord(model, cues[0]!, 'dom');
    await saveWord(model, cues[0]!, 'duży');
    await saveWord(model, cues[1]!, 'stoi');
    expect(cards(model)).toHaveLength(3);
    model.view = 'saved';
    rerenderApp(model);
    expect(buttonsStarting('Add all to review')).toHaveLength(0);
    buttonsStarting('In review ✓')[0]!.click();
    buttonsStarting('In review ✓')[0]!.click();
    expect(button('Add all to review (2)')).toBeDefined();
    button('Add all to review (2)')!.click();
    expect(cards(model)).toHaveLength(3);
    expect(cards(model).every((c) => c.suspendedAt === undefined)).toBe(true);
    expect(buttonsStarting('Add all to review')).toHaveLength(0);
    expect(buttonsStarting('In review ✓')).toHaveLength(3);
  });

  it('Review reveal of a meaning-less item with a native line shows the native line, no Add-meaning input', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
    const cue = model.cues[0]!;
    setSelection(model, { kind: 'sentence', text: cue.text, cueId: cue.id, tokenStart: 0, tokenEnd: cue.text.split(/\s+/).length, charStart: 0, charEnd: cue.text.length });
    const item = (await saveSelection(model))!;
    expect(item.meaning).toBeUndefined();
    expect(cards(model)).toHaveLength(1);
    model.view = 'review';
    rerenderApp(model);
    button('Show answer / context')!.click();
    const native = document.querySelector('.review-native-context')?.textContent ?? '';
    expect(native.length).toBeGreaterThan(0);
    expect(native).not.toBe(cue.text);
    expect(document.querySelector('.add-meaning-input')).toBeNull();
  });

  it('with neither meaning nor native line, Saved and Review offer Add meaning, which persists', async () => {
    const { model, cues } = installModel();
    const item = await saveWord(model, cues[0]!, 'dom');
    model.view = 'saved';
    rerenderApp(model);
    expect(document.querySelector('.saved-item .add-meaning-input')).not.toBeNull();
    model.view = 'review';
    rerenderApp(model);
    button('Show answer / context')!.click();
    const input = document.querySelector('.review-reveal .add-meaning-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    model.localService.syncState = 'saved';
    input.value = '  house ';
    (input.closest('form') as HTMLFormElement).requestSubmit();
    expect(model.store.getSavedItem(item.id)?.meaning).toBe('house');
    expect(model.localService.syncState).toBe('unsaved');
    expect(document.querySelector('.review-meaning')?.textContent).toBe('Meaning: house');
    expect(document.querySelector('.add-meaning-input')).toBeNull();
  });

  it('scheduling state/due sit behind a details disclosure with formatted due', async () => {
    const { model, cues } = installModel();
    await saveWord(model, cues[0]!, 'dom');
    model.view = 'review';
    rerenderApp(model);
    const details = document.querySelector('details.review-scheduling')!;
    expect(details.querySelector('summary')?.textContent).toBe('scheduling');
    expect(details.textContent).toContain('state: new • due: 2030-01-01 00:00:00 UTC');
    expect(document.querySelector('.review-card > p.meta')?.textContent).toBe('1 card in local deck');
  });
});
