import { captureSentence } from '../helpers/capture';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppModel, importFixtureMediaAndSubtitles } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';

// lt-dlf.13 (audit P5 + P8): details panels show learner-meaningful provenance only, and the
// capture submit reads 'Save' with a stable data hook for scripts.

const FORBIDDEN = /blob:|\btoken\b|\btokens\b|\bchars?\b|sha256/i;
const BLOB = 'blob:http://127.0.0.1:5206/0b8c7f9e-1111-4222-8333-444455556666';

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

async function loadedModel() {
  const model = createAppModel();
  await importFixtureMediaAndSubtitles(
    model,
    'fixtures/media/synthetic-polish-dialogue.webm',
    'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
    'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
  );
  return model;
}

function openAllDetails(): number {
  const all = Array.from(document.querySelectorAll('details'));
  for (const d of all) d.open = true;
  return all.length;
}

describe('lt-dlf.13 provenance in details panels', () => {
  let dom: Awaited<ReturnType<typeof setupDom>>;
  beforeEach(async () => { dom = await setupDom(); });
  afterEach(() => { dom.window.close(); });

  it('Saved: with every details open there is no blob:, token, char or hash text', async () => {
    const model = await loadedModel();
    const cue = model.cues[0]!;
    await captureSentence(model, cue);
    model.view = 'saved';
    rerenderApp(model);
    let opened = 0;
    for (const tab of ['My Vocab', 'My Sentences']) {
      (Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === tab) as HTMLElement).click();
      rerenderApp(model);
      opened += openAllDetails();
      const text = document.getElementById('app')!.textContent ?? '';
      expect(text).not.toMatch(FORBIDDEN);
    }
    expect(opened).toBeGreaterThan(0);
    const ctx = document.querySelector('.occurrence-context details')!;
    expect(ctx.textContent).toMatch(/line 1/);
    expect(ctx.textContent).toMatch(/\d:\d\d\.\d\d–\d:\d\d\.\d\d/);
  });

  it('Player: with every details open a blob: media path never appears', async () => {
    const model = await loadedModel();
    model.currentMedia = { ...model.currentMedia!, originalPath: BLOB };
    model.view = 'player';
    rerenderApp(model);
    (document.querySelector('.cue-row .cue-word') as HTMLElement).click();
    rerenderApp(model);
    expect(openAllDetails()).toBeGreaterThan(0);
    const text = document.getElementById('app')!.textContent ?? '';
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).not.toMatch(/media: |media 0/);
  });

  it('capture submit reads Save and carries the data-action hook', async () => {
    const model = await loadedModel();
    model.view = 'player';
    rerenderApp(model);
    (document.querySelector('.cue-row .cue-word') as HTMLElement).click();
    rerenderApp(model);
    const save = document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement | null;
    expect(save).not.toBeNull();
    expect(save!.textContent).toBe('Save');
    expect(Array.from(document.querySelectorAll('button')).some((b) => b.textContent === 'Save occurrence')).toBe(false);
  });
});
