import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createAppModel,
  importFixtureMediaAndSubtitles,
  saveSentenceFromCue,
  saveSelectedPhraseFromCue,
} from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { withNoNetwork } from '../../tests/no-network/networkTrap';

async function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost:5173/',
  });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.CSS = { escape: (value: string) => value.replace(/"/g, '\\"') } as unknown as typeof CSS;
  return dom;
}

const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';

describe('P4 saved occurrence UI: My Vocab / My Sentences', () => {
  let dom: ReturnType<typeof setupDom> extends Promise<infer T> ? T : never;

  beforeEach(async () => {
    dom = await setupDom();
  });

  afterEach(() => {
    dom.window.close();
  });

  it('saves a sentence from a cue and shows it under My Sentences', async () => {
    const { value: model, networkAttempts } = await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      const firstCue = m.cues[0];
      expect(firstCue).toBeDefined();
      await saveSentenceFromCue(m, firstCue!);
      rerenderApp(m);
      return m;
    });

    expect(networkAttempts).toHaveLength(0);
    void model;

    const savedBtn = Array.from(document.querySelectorAll('nav button')).find((b) => b.textContent === 'Saved') as HTMLElement | null;
    savedBtn?.click();
    expect(document.getElementById('app')?.textContent).toContain('My Vocab');

    const sentencesTab = Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === 'My Sentences') as HTMLElement | null;
    sentencesTab?.click();
    rerenderApp(model);

    const app = document.getElementById('app');
    expect(app?.textContent).toContain('My Sentences');
    expect(app?.textContent).toContain('Cześć, to jest lokalny test.');
    expect(app?.textContent).toContain('sentence');
    expect(app?.textContent).toContain('tokens 0–4');
    expect(app?.textContent).toContain(mediaPath);
  });

  it('saves a selected phrase and shows it under My Vocab', async () => {
    await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      const firstCue = m.cues[0]!;
      saveSelectedPhraseFromCue(m, firstCue, 'lokalny test', firstCue.text.indexOf('lokalny test'), firstCue.text.indexOf('lokalny test') + 'lokalny test'.length, 3, 5);
      rerenderApp(m);
      return m;
    });

    const savedBtn = Array.from(document.querySelectorAll('nav button')).find((b) => b.textContent === 'Saved') as HTMLElement | null;
    savedBtn?.click();
    expect(document.getElementById('app')?.textContent).toContain('My Vocab');
    expect(document.getElementById('app')?.textContent).toContain('lokalny test');
    expect(document.getElementById('app')?.textContent).toContain('phrase');
  });

  it('saves a selected lexeme and shows it under My Vocab', async () => {
    await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      const firstCue = m.cues[0]!;
      const start = firstCue.text.indexOf('lokalny');
      saveSelectedPhraseFromCue(m, firstCue, 'lokalny', start, start + 'lokalny'.length, 3, 4);
      rerenderApp(m);
      return m;
    });

    const savedBtn = Array.from(document.querySelectorAll('nav button')).find((b) => b.textContent === 'Saved') as HTMLElement | null;
    savedBtn?.click();
    expect(document.getElementById('app')?.textContent).toContain('lokalny');
    expect(document.getElementById('app')?.textContent).toContain('phrase');

    const vocabTab = Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === 'My Vocab') as HTMLElement | null;
    expect(vocabTab?.getAttribute('aria-selected')).toBe('true');
  });

  it('deduplicates identical saved occurrences deterministically', async () => {
    const { value: model } = await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      const firstCue = m.cues[0]!;
      const start = firstCue.text.indexOf('lokalny');
      await saveSentenceFromCue(m, firstCue);
      saveSelectedPhraseFromCue(m, firstCue, 'lokalny', start, start + 'lokalny'.length, 3, 4);
      saveSelectedPhraseFromCue(m, firstCue, 'lokalny', start, start + 'lokalny'.length, 3, 4);
      rerenderApp(m);
      return m;
    });

    const savedBtn = Array.from(document.querySelectorAll('nav button')).find((b) => b.textContent === 'Saved') as HTMLElement | null;
    savedBtn?.click();

    const vocabTab = Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === 'My Vocab') as HTMLElement | null;
    vocabTab?.click();
    rerenderApp(model);

    const app = document.getElementById('app');
    const phraseCards = app?.querySelectorAll('.saved-item');
    expect(phraseCards?.length).toBe(1);
    expect(app?.textContent).toContain('1 occurrence');
  });

  it('keeps source anchors visible: cue text, time, media path, token span, char span', async () => {
    const { value: model } = await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      const firstCue = m.cues[0]!;
      await saveSentenceFromCue(m, firstCue);
      rerenderApp(m);
      return m;
    });

    const savedBtn = Array.from(document.querySelectorAll('nav button')).find((b) => b.textContent === 'Saved') as HTMLElement | null;
    savedBtn?.click();
    const sentencesTab = Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === 'My Sentences') as HTMLElement | null;
    sentencesTab?.click();
    rerenderApp(model);

    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('0:00.00');
    expect(app.textContent).toContain('Cześć, to jest lokalny test.');
    expect(app.textContent).toContain(mediaPath);
    expect(app.textContent).toContain('chars 0–28');
  });

  it('creates a review card from a saved item and navigates to review view', async () => {
    const { value: model } = await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
      const firstCue = m.cues[0]!;
      await saveSentenceFromCue(m, firstCue);
      rerenderApp(m);
      return m;
    });

    const savedBtn = Array.from(document.querySelectorAll('nav button')).find((b) => b.textContent === 'Saved') as HTMLElement | null;
    savedBtn?.click();
    const sentencesTab = Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === 'My Sentences') as HTMLElement | null;
    sentencesTab?.click();
    rerenderApp(model);

    const createCardBtn = Array.from(document.querySelectorAll('.saved-item button')).find((b) => b.textContent === 'Create review card') as HTMLElement | null;
    createCardBtn?.click();

    expect(model.view).toBe('review');
    const app = document.getElementById('app');
    expect(app?.textContent).toContain('Recognize:');
    expect(app?.textContent).toContain('Cześć, to jest lokalny test.');
  });
});
