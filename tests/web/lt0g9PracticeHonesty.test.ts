import { captureLexeme, captureSentence } from '../helpers/capture';
import { JSDOM } from 'jsdom';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, importFixtureMediaAndSubtitles, setPracticeMode, setView, submitPracticeAttempt } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence';
import { withNoNetwork } from '../no-network/networkTrap';

// lt-0g9: practice prompts must not leak the expected answer, grading must match the prompt per mode,
// and per-card UI state must not carry over to the next card. Synthetic fixtures only.

const T0 = new Date('2030-03-04T10:00:00.000Z');
const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';
type Model = ReturnType<typeof createAppModel>;
type Mode = 'typed-input' | 'multiple-choice' | 'sentence-builder' | 'audio-recall';

async function twoSentenceCards(): Promise<{ model: Model; texts: Record<string, string> }> {
  const model = createAppModel();
  await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
  const texts: Record<string, string> = {};
  for (const cue of model.cues.slice(0, 2)) {
    const item = (await captureSentence(model, cue))!;

    texts[model.capture.cardsFor(item.id).active[0]!.id] = cue.text;
  }
  return { model, texts };
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find(b => b.textContent === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found as HTMLButtonElement;
}
const shown = (model: Model) => model.review.activeCardId!;
const promptText = () => document.querySelector('.practice-prompt')?.textContent ?? '';
const practiceText = () => document.querySelector('.practice-card')?.textContent ?? '';
const events = (model: Model) => model.store.snapshot().reviewEvents;
function render(model: Model) { setView(model, 'practice'); rerenderApp(model); }
function type(value: string) {
  const input = document.getElementById('practice-answer') as HTMLInputElement;
  input.value = value; input.dispatchEvent(new window.Event('input'));
}
function placeTokens(tokens: readonly string[]) {
  for (const token of tokens) {
    const btn = Array.from(document.querySelectorAll('.sentence-builder-token--pool')).find(b => b.textContent === token) as HTMLButtonElement;
    btn.click();
  }
}
function answerCorrectly(mode: Mode, expected: string) {
  if (mode === 'multiple-choice') {
    (Array.from(document.querySelectorAll('button[data-choice-index]')).find(b => b.textContent === expected) as HTMLButtonElement).click();
  } else if (mode === 'sentence-builder') {
    placeTokens(expected.split(/\s+/)); button('Submit attempt').click();
  } else { type(expected); button('Submit attempt').click(); }
}
function persistedRoundTrip(model: Model) {
  const root = mkdtempSync(join(tmpdir(), 'lt-0g9-')); const file = join(root, 'state.sqlite');
  try {
    const first = SqliteLocalPersistence.open(file); try { first.saveSnapshot(model.store.snapshot()); } finally { first.close(); }
    const reopened = SqliteLocalPersistence.open(file);
    try { return reopened.listPracticeAttempts(); } finally { reopened.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe('lt-0g9 practice honesty', () => {
  let dom: JSDOM;
  beforeEach(() => {
    vi.useFakeTimers({ now: T0, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    dom = new JSDOM('<main id="app"></main>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
    Object.assign(globalThis, { document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0, CSS: { escape: (s: string) => s } });
  });
  afterEach(() => { vi.useRealTimers(); dom.window.close(); });

  it.each(['typed-input', 'multiple-choice', 'sentence-builder', 'audio-recall'] as const)('%s: two cards without pre-answer leakage, matching grading, FSRS effect, persistence', async mode => {
    const { networkAttempts } = await withNoNetwork(async () => {
      const { model, texts } = await twoSentenceCards();
      setPracticeMode(model, mode); render(model);
      const first = shown(model); const firstText = texts[first]!;
      expect(promptText()).not.toContain(firstText);
      if (mode !== 'multiple-choice') expect(practiceText()).not.toContain(firstText);
      if (mode === 'sentence-builder') {
        const pool = Array.from(document.querySelectorAll('.sentence-builder-token--pool')).map(b => b.textContent).join(' ');
        expect(pool).not.toBe(firstText);
      }
      if (mode === 'multiple-choice') {
        const order = () => Array.from(document.querySelectorAll('button[data-choice-index]')).map(b => b.textContent);
        const before = order();
        for (let i = 0; i < 5; i++) { rerenderApp(model); expect(order()).toEqual(before); }
      }
      answerCorrectly(mode, firstText);
      const a1 = model.store.listPracticeAttemptsForCard(first);
      expect(a1.map(a => [a.mode, a.result, a.expectedAnswer, a.givenAnswer])).toEqual([[mode, 'pass', firstText, firstText]]);
      expect(events(model).map(e => [e.cardId, e.rating])).toEqual([[first, 'good']]);

      const second = shown(model); const secondText = texts[second]!;
      expect(second).not.toBe(first);
      expect(promptText()).not.toContain(secondText);
      if (mode !== 'multiple-choice') expect(practiceText().replace(firstText, '')).not.toContain(secondText);
      expect(document.querySelector('.practice-feedback')?.textContent).toContain('Previous card');
      if (mode === 'sentence-builder') {
        const pool = Array.from(document.querySelectorAll('.sentence-builder-token--pool')).map(b => b.textContent).sort();
        expect(pool).toEqual(secondText.split(/\s+/).sort());
        expect(document.querySelectorAll('.sentence-builder-token--ordered')).toHaveLength(0);
      } else if (mode !== 'multiple-choice') {
        expect((document.getElementById('practice-answer') as HTMLInputElement).value).toBe('');
      }
      const stateBefore = model.store.getReviewCardState(second);
      button('Skip').click();
      expect(model.store.listPracticeAttemptsForCard(second).map(a => [a.mode, a.result, a.expectedAnswer])).toEqual([[mode, 'skipped', secondText]]);
      expect(events(model)).toHaveLength(1);
      expect(model.store.getReviewCardState(second)).toEqual(stateBefore);

      const reopened = persistedRoundTrip(model);
      expect(reopened.map(a => [a.cardId, a.mode, a.result, a.expectedAnswer]).sort()).toEqual([[first, mode, 'pass', firstText], [second, mode, 'skipped', secondText]].sort());
    });
    expect(networkAttempts).toEqual([]);
  });

  it('sentence-builder: partially placed tokens of card A never appear on card B', async () => {
    const { model, texts } = await twoSentenceCards();
    setPracticeMode(model, 'sentence-builder'); render(model);
    const first = shown(model);
    placeTokens(texts[first]!.split(/\s+/).slice(0, 2));
    button('Skip').click();
    const second = shown(model);
    const pool = Array.from(document.querySelectorAll('.sentence-builder-token--pool')).map(b => b.textContent).sort();
    expect(pool).toEqual(texts[second]!.split(/\s+/).sort());
    expect(document.querySelectorAll('.sentence-builder-token--ordered')).toHaveLength(0);
  });

  it('typed-input: an unsubmitted answer for card A is not prefilled on card B', async () => {
    const { model, texts } = await twoSentenceCards();
    render(model);
    const first = shown(model);
    type('niedokończone');
    // Card A stops being the presented card (e.g. answered in Review) while Practice keeps its draft.
    model.reviewService.submitReview(first, 'good', new Date());
    model.review.activeCardId = null;
    render(model);
    expect(shown(model)).not.toBe(first);
    expect(texts[shown(model)]).toBeDefined();
    expect((document.getElementById('practice-answer') as HTMLInputElement).value).toBe('');
  });

  it('a practice reveal on card A does not reveal card B, and a submit after reveal is graded fail', async () => {
    const { model, texts } = await twoSentenceCards();
    setPracticeMode(model, 'audio-recall'); render(model);
    const first = shown(model);
    button('Reveal answer').click();
    expect(practiceText()).toContain(texts[first]!);
    type(texts[first]!); button('Submit attempt').click();
    expect(model.store.listPracticeAttemptsForCard(first).map(a => a.result)).toEqual(['fail']);
    expect(events(model).map(e => e.rating)).toEqual(['again']);
    const second = shown(model);
    expect(practiceText()).not.toContain(texts[second]!);
    expect(() => button('Reveal answer')).not.toThrow();
  });

  it('review reveal on card A does not reveal card B after rating', async () => {
    const { model, texts } = await twoSentenceCards();
    setView(model, 'review'); rerenderApp(model);
    button('Show answer / context').click();
    button('Good').click();
    const second = shown(model);
    expect(texts[second]).toBeDefined();
    expect(document.querySelector('.review-reveal')).toBeNull();
    expect(document.querySelector('.review-buttons')).toBeNull();
  });

  it('distinguishes cue transcription (audio-recall) from saved-word response (typed-input) for a lexeme card', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    const cue = model.cues[0]!; const word = 'lokalny'; const start = cue.text.indexOf(word);
    const item = (await captureLexeme(model, cue, word, start, start + word.length, 3))!;

    const card = model.capture.cardsFor(item.id).active[0]!;
    render(model);
    expect(promptText()).not.toMatch(/lokalny/i);
    expect(promptText()).toContain('Cześć, to jest ____ test.');
    type(word); button('Submit attempt').click();
    vi.setSystemTime(Date.parse(model.store.getReviewCardState(card.id)!.dueAt) + 1);
    setPracticeMode(model, 'audio-recall'); render(model);
    type(cue.text); button('Submit attempt').click();
    expect(model.store.listPracticeAttemptsForCard(card.id).map(a => [a.mode, a.result, a.expectedAnswer])).toEqual([
      ['typed-input', 'pass', word],
      ['audio-recall', 'pass', cue.text],
    ]);
  });

  it('speaking stays visibly unavailable: no microphone request, no submission, no attempt', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(dom.window.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const { model, texts } = await twoSentenceCards();
    setPracticeMode(model, 'speaking'); render(model);
    const first = shown(model);
    expect(practiceText()).toMatch(/Speaking is not available/);
    expect(promptText()).not.toContain(texts[first]!);
    expect(document.getElementById('practice-answer')).toBeNull();
    expect(button('Submit attempt').disabled).toBe(true);
    expect(button('Skip').disabled).toBe(true);
    expect(() => submitPracticeAttempt(model, 'x', new Date())).toThrow(/unavailable/);
    expect(model.store.snapshot().practiceAttempts).toHaveLength(0);
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
