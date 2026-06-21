import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createAppModel, importFixtureMediaAndSubtitles, saveSentenceFromCue } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';

async function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost:5173/',
  });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  return dom;
}

describe('Lingotorte web UI fixture-driven smoke', () => {
  let dom: ReturnType<typeof setupDom> extends Promise<infer T> ? T : never;

  beforeEach(async () => {
    dom = await setupDom();
  });

  afterEach(() => {
    dom.window.close();
  });

  it('renders the app shell with local-only provider status', () => {
    const model = createAppModel();
    rerenderApp(model);
    const app = document.getElementById('app');
    expect(app?.querySelector('h1')?.textContent).toBe('Lingotorte');
    expect(app?.textContent).toContain('Local-only');
    expect(app?.textContent).toContain('All data stays local');
    expect(app?.querySelector('.provider-status')).toBeTruthy();
  });

  it('switches views via navigation and marks active page', () => {
    const model = createAppModel();
    rerenderApp(model);
    const app = document.getElementById('app');
    const nav = app?.querySelector('nav');
    const buttons = nav?.querySelectorAll('button');
    expect(buttons?.length).toBe(5);
    const savedBtn = Array.from(document.querySelectorAll('nav button')).find((b) => b.textContent === 'Saved') as HTMLElement | null;
    savedBtn?.click();
    expect(document.getElementById('app')?.textContent).toContain('My Vocab');
  });

  it('loads the synthetic fixture and renders transcript cues', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    rerenderApp(model);
    const app = document.getElementById('app');
    const rows = app?.querySelectorAll('[data-cue-id]');
    expect(rows?.length).toBe(2);
    const text = app?.textContent ?? '';
    expect(text).toContain('Cześć, to jest lokalny test.');
  });

  it('saves a sentence from a cue and shows it in the saved view', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    const firstCue = model.cues[0];
    expect(firstCue).toBeDefined();
    await saveSentenceFromCue(model, firstCue!);
    rerenderApp(model);
    const savedBtn = Array.from(document.querySelectorAll('nav button')).find((b) => b.textContent === 'Saved') as HTMLElement | null;
    savedBtn?.click();
    const sentencesTab = Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === 'My Sentences') as HTMLElement | null;
    sentencesTab?.click();
    const app = document.getElementById('app');
    expect(app?.textContent).toContain('Cześć, to jest lokalny test.');
    expect(app?.textContent).toContain('sentence');
  });

  it('search filters transcript cues', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    rerenderApp(model);
    const search = document.querySelector('[aria-label="Search transcript"]') as HTMLInputElement | null;
    expect(search).toBeTruthy();
    search!.value = 'lokalny';
    search!.dispatchEvent(new dom.window.Event('input'));
    const rows = document.querySelectorAll('[data-cue-id]');
    expect(rows.length).toBe(1);
    expect(rows[0]!.textContent).toContain('lokalny');
  });

  it('does not issue network requests in provider-disabled model', async () => {
    const model = createAppModel();
    expect(model.providerPolicy.onlineProvidersEnabled).toBe(false);
    expect(model.adapters.dictionary?.adapterId).toContain('unavailable');
  });
});
