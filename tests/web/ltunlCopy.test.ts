import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppModel, generateLocalAsrDraft, importBrowserLocalFiles, importFixtureMediaAndSubtitles, makeFakeLocalAsrProvider, saveSelection, saveSentenceFromCue, setSelection } from '../../apps/web/src/model';
import { formatRelativeDue } from '../../apps/web/src/uiTypes';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-unl: learner-facing primary text carries no jargon, hashes or token indices; provenance stays one click away.

const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';

const BANNED = [/\bcue\b/, 'token', 'chars', 'object url', 'file.text', 'handle', 'track v', 'lexeme', 'cockpit', 'co-pilot', 'sha256:'];
const HASH_LIKE = /[A-Za-z0-9+/]{20,}={0,2}/;
/** Attributes may hold path examples (placeholder); a hash-like run there must contain a digit, '+' or '='. */
const ATTR_HASH_LIKE = /(?=[A-Za-z0-9+/]*[0-9+=])[A-Za-z0-9+/]{20,}={0,2}/;

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

/** Visible-element accessible strings: aria-label, title, placeholder (outside closed details). */
function visibleAttributes(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  for (const details of Array.from(clone.querySelectorAll('details:not([open])'))) {
    for (const child of Array.from(details.childNodes)) {
      if (!(child instanceof globalThis.Element && child.tagName === 'SUMMARY')) child.remove();
    }
  }
  const values: string[] = [];
  for (const el of Array.from(clone.querySelectorAll('[aria-label],[title],[placeholder]'))) {
    if (el.closest('[hidden],[aria-hidden="true"]')) continue;
    for (const attr of ['aria-label', 'title', 'placeholder']) {
      const v = el.getAttribute(attr);
      if (v) values.push(v);
    }
  }
  return values.join(' | ');
}

function assertClean(view: string, text: string, hashLike: RegExp = HASH_LIKE) {
  const lower = text.toLowerCase();
  for (const term of BANNED) {
    const at = typeof term === 'string' ? lower.indexOf(term) : lower.search(term);
    expect(at < 0 ? null : text.slice(Math.max(0, at - 60), at + 60), `${view}: "${term}" in visible text`).toBeNull();
  }
  expect(text.match(hashLike)?.[0], `${view}: hash-like run`).toBeUndefined();
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
      assertClean(`${view} attributes`, visibleAttributes(document.getElementById('app')!), ATTR_HASH_LIKE);
    });
  }

  it('draft transcript state: player and library visible text are clean', async () => {
    const model = await loadedModel();
    await generateLocalAsrDraft(model, makeFakeLocalAsrProvider({
      engine: 'synthetic', modelName: 'synthetic-asr', language: 'pl',
      segments: [{ startMs: 0, endMs: 1500, text: 'Cześć świecie.' }, { startMs: 1500, endMs: 3000, text: 'Druga kwestia.' }],
    }));
    expect(model.store.getSubtitleTrack(model.targetTrackId!)?.transcriptStatus).toBe('draft');
    for (const view of ['player', 'library'] as const) {
      model.view = view;
      rerenderApp(model);
      const app = document.getElementById('app')!;
      assertClean(`draft ${view}`, visibleText(app));
      assertClean(`draft ${view} attributes`, visibleAttributes(app), ATTR_HASH_LIKE);
    }
    model.view = 'player';
    rerenderApp(model);
    const rail = Array.from(document.querySelectorAll('[aria-label="Study status"] .status-token')).map((c) => c.textContent);
    expect(rail[0]).toMatch(/^Transcript draft/);
  });

  it('relink placeholder state: player visible text is clean', async () => {
    const model = createAppModel();
    const file = new File([new Uint8Array([1, 2, 3])], 'lekcja.webm', { type: 'video/webm' });
    await importBrowserLocalFiles(model, { mediaFile: file });
    model.browserLocalMedia.objectUrl = null; // reload: the object URL is gone, the record needs relinking
    model.view = 'player';
    rerenderApp(model);
    const app = document.getElementById('app')!;
    assertClean('relink player', visibleText(app));
    assertClean('relink player attributes', visibleAttributes(app), ATTR_HASH_LIKE);
  });

  it('saved: context line names the video by title (real fixture loader shape), never a hash', async () => {
    const model = await loadedModel();
    // Browser fixture loader shape: originalPath is a bundler URL/data URL, the title is the learner-facing name.
    const asset = model.currentMedia!;
    const urlPath = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAMm+m4EHdaKEAM3+abc=';
    model.store.putMediaAsset({ ...asset, title: 'Synthetic Polish Dialogue', originalPath: urlPath });
    for (const occ of model.store.listSavedOccurrences()) {
      model.store.putSavedOccurrence({ ...occ, sourceContext: { ...occ.sourceContext, mediaPath: urlPath } });
    }
    model.view = 'saved';
    rerenderApp(model);
    (Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === 'My Sentences') as HTMLElement).click();
    rerenderApp(model);
    const primary = visibleText(document.querySelector('.occurrence-context')!);
    expect(primary).toContain('saved from Synthetic Polish Dialogue at');
    expect(primary.match(HASH_LIKE)?.[0]).toBeUndefined();
  });

  it('line N is the 1-based position in the cue list (VTT without ids stores cueIndex 0)', async () => {
    const model = await loadedModel();
    model.cues = model.cues.map((cue, i) => ({ ...cue, cueIndex: i }));
    model.player.currentTimeMs = model.cues[0]!.startMs;
    model.view = 'player';
    rerenderApp(model);
    const summary = document.querySelector('.source-context-primary .source-compact-summary')?.textContent ?? '';
    expect(summary).toContain('line 1');
    expect(summary).not.toContain('line 0');
    const chips = Array.from(document.querySelectorAll('.source-context-chips .source-meta-chip')).map((c) => c.textContent);
    expect(chips).toContain('line 1');
    expect(chips).not.toContain('line 0');
  });

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
    expect(headings).toEqual(expect.arrayContaining(['Player', 'Transcript', 'Save a word']));
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

  it('review: "next due" is the earliest due across active cards, not the displayed card', async () => {
    const model = await loadedModel();
    const now = new Date(2026, 9, 14, 12, 0, 0);
    model.clock = () => now;
    const snapshot = model.store.snapshot();
    const cards = Object.values(snapshot.reviewCards).filter((c) => !c.deletedAt);
    expect(cards.length).toBeGreaterThanOrEqual(1);
    const a = cards[0]!;
    model.review.activeCardId = a.id;
    model.store.putReviewCardState({ ...snapshot.reviewCardStates[a.id]!, dueAt: new Date(2026, 9, 14, 11, 0).toISOString() });
    // A second card in review due later must not move "next due" past the earliest one.
    const later = { ...a, id: '00000000-0000-4000-8000-0000000000b2' };
    model.store.putReviewCard(later);
    model.store.putReviewCardState({ ...snapshot.reviewCardStates[a.id]!, cardId: later.id, dueAt: new Date(2026, 9, 20, 9, 0).toISOString() });
    model.view = 'review';
    rerenderApp(model);
    const stats = document.querySelector('.review-card > p.meta')?.textContent ?? '';
    expect(stats).toContain('next due now');
  });
});

describe('formatRelativeDue (injected clock)', () => {
  const asOf = new Date(2026, 9, 14, 12, 0, 0);
  it('past → now', () => { expect(formatRelativeDue(new Date(2026, 9, 13, 8, 0), asOf)).toBe('now'); });
  it('exactly now → now', () => { expect(formatRelativeDue(asOf, asOf)).toBe('now'); });
  it('later today → today at HH:MM', () => { expect(formatRelativeDue(new Date(2026, 9, 14, 14, 5), asOf)).toBe('today at 14:05'); });
  it('tomorrow → tomorrow at HH:MM', () => { expect(formatRelativeDue(new Date(2026, 9, 15, 9, 0).toISOString(), asOf)).toBe('tomorrow at 09:00'); });
  it('N days → in N days', () => { expect(formatRelativeDue(new Date(2026, 9, 17, 9, 0), asOf)).toBe('in 3 days'); });
  it('invalid → unknown', () => { expect(formatRelativeDue('not-a-date', asOf)).toBe('unknown'); });
});
