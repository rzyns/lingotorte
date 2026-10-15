import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppModel, importFixtureMediaAndSubtitles, saveSelection, saveSentenceFromCue, setSelection } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-unl: learner-facing primary text carries no jargon, hashes or token indices; provenance stays one click away.

const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';

const BANNED = ['token', 'chars', 'object url', 'file.text', 'handle', 'track v', 'lexeme', 'cockpit', 'co-pilot', 'sha256:'];
const HASH_LIKE = /[A-Za-z0-9+/]{20,}={0,2}/;

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

/** Visible text: closed <details> contribute only their <summary>. */
function visibleText(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  for (const details of Array.from(clone.querySelectorAll('details:not([open])'))) {
    for (const child of Array.from(details.childNodes)) {
      if (!(child instanceof globalThis.Element && child.tagName === 'SUMMARY')) child.remove();
    }
  }
  const walker = document.createTreeWalker(clone, 4 /* NodeFilter.SHOW_TEXT */);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.textContent ?? '');
  return parts.join(' ').replace(/\s+/g, ' ');
}

function assertClean(view: string, text: string) {
  const lower = text.toLowerCase();
  for (const term of BANNED) {
    const at = lower.indexOf(term);
    expect(at < 0 ? null : text.slice(Math.max(0, at - 60), at + 60), `${view}: "${term}" in visible text`).toBeNull();
  }
  expect(text.match(HASH_LIKE)?.[0], `${view}: hash-like run`).toBeUndefined();
}

async function loadedModel(): Promise<AppModel> {
  const model = createAppModel();
  await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
  await saveSentenceFromCue(model, model.cues[0]!);
  const cue = model.cues[0]!;
  const word = cue.text.split(/\s+/)[0]!.replace(/[^\p{L}]/gu, '');
  setSelection(model, { kind: 'lexeme', text: word, cueId: cue.id, tokenStart: 0, tokenEnd: 1, charStart: 0, charEnd: word.length });
  await saveSelection(model);
  rerenderApp(model);
  return model;
}

describe('lt-unl learner-facing copy', () => {
  let dom: JSDOM;
  beforeEach(() => { dom = setupDom(); });
  afterEach(() => { dom.window.close(); });

  for (const view of ['player', 'library', 'saved', 'review', 'settings'] as const) {
    it(`${view}: visible text has no jargon or hashes`, async () => {
      const model = await loadedModel();
      model.view = view;
      if (view === 'review') model.review.revealed = true;
      rerenderApp(model);
      if (view === 'saved') {
        (Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === 'My Sentences') as HTMLElement).click();
        rerenderApp(model);
      }
      assertClean(view, visibleText(document.getElementById('app')!));
    });
  }

  it('player: hero rail has at most 3 chips, keeps "N saved", vocabulary applied', async () => {
    const model = await loadedModel();
    model.view = 'player';
    rerenderApp(model);
    const rail = document.querySelector('[aria-label="Study status"]')!;
    const chips = Array.from(rail.querySelectorAll('.status-token')).map((c) => c.textContent ?? '');
    expect(chips.length).toBeLessThanOrEqual(3);
    expect(chips).toContain('Transcript ready');
    expect(chips.some((c) => /\b2 saved\b/.test(c))).toBe(true);
    const headings = Array.from(document.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings).toEqual(expect.arrayContaining(['Player', 'Transcript', 'Save a word or phrase']));
    expect(document.querySelector('.source-context-primary .source-compact-summary')?.textContent).toContain('line 1');
  });

  it('provenance (track version, token/char spans) still sits inside a details element', async () => {
    const model = await loadedModel();
    model.view = 'player';
    rerenderApp(model);
    const sourceDetails = document.querySelector('.source-context-row details')!;
    expect(sourceDetails.textContent).toMatch(/track v\d+/);
    model.view = 'saved';
    rerenderApp(model);
    (Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === 'My Sentences') as HTMLElement).click();
    rerenderApp(model);
    const ctx = document.querySelector('.occurrence-context')!;
    const details = ctx.querySelector('details')!;
    expect(details.textContent).toContain('chars 0–28');
    expect(details.textContent).toMatch(/tokens? \d/);
    expect(visibleText(ctx)).not.toMatch(/chars|token/);
  });

  it('review: stats line is "N cards · next due …", state/ISO kept in details', async () => {
    const model = await loadedModel();
    model.view = 'review';
    rerenderApp(model);
    const stats = document.querySelector('.review-card > p.meta')?.textContent ?? '';
    expect(stats).toMatch(/^\d+ cards? · next due /);
    expect(document.querySelector('details.review-scheduling')?.textContent).toMatch(/state: \w+ • due: \d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC/);
  });
});
