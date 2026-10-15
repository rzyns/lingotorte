import { pairedModel } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, importBrowserLocalFiles } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-dlf.7: UX polish batch from the 2026-10-14 audit (N2, N8/H3, N9/H7, H6).

const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, File: dom.window.File, Element: dom.window.Element,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0,
    CSS: { escape: (v: string) => v },
  });
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:lt-dlf7') });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); dom.window.close(); });

function playerModel() {
  const model = createAppModel();
  const text = 'Uczymy się polskiego razem.';
  const asset = makeMediaAsset({ title: 'Polish', originalPath: 'fixtures/media/x.webm', contentSha256: sha, durationMs: 4000, container: 'webm', sizeBytes: 1, privacyLabel: 'owned' });
  model.store.putMediaAsset(asset);
  model.currentMedia = asset;
  const track = makeSubtitleTrack({ mediaId: asset.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: 'x.srt', contentSha256: sha, isActive: true, transcriptStatus: 'approved' });
  model.store.putSubtitleTrack(track);
  model.targetTrackId = track.id;
  const cue = makeCue({ trackId: track.id, cueIndex: 0, startMs: 0, endMs: 4000, text, normalizedText: text.toLocaleLowerCase('pl'), textSha256: sha });
  model.store.putCue(cue);
  model.cues = [cue];
  model.player.activeCueId = cue.id;
  model.view = 'player';
  return { model, cue, text };
}

const visibleText = () => document.body.textContent ?? '';

describe('lt-dlf.7 N2 capture form order and heading', () => {
  it('puts Meaning directly after the heading, grammar block below the form', () => {
    const { model, cue } = playerModel();
    model.selection = { kind: 'lexeme', text: 'polskiego', cueId: cue.id, tokenStart: 2, tokenEnd: 3, charStart: 11, charEnd: 20 };
    rerenderApp(model);
    const panel = document.querySelector('.selection-panel')!;
    expect(panel.querySelector('h2')?.textContent).toBe('Save a word');
    const meaning = panel.querySelector('#selection-meaning')!;
    const morph = panel.querySelector('.morphology-panel')!;
    expect(morph).toBeTruthy();
    expect(meaning.compareDocumentPosition(morph) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says "Save a sentence" for a sentence and "Save a phrase" for a phrase', () => {
    const { model, cue, text } = playerModel();
    model.selection = { kind: 'sentence', text, cueId: cue.id, tokenStart: 0, tokenEnd: 4, charStart: 0, charEnd: text.length };
    rerenderApp(model);
    expect(document.querySelector('.selection-panel h2')?.textContent).toBe('Save a sentence');
    model.selection = { kind: 'phrase', text: 'Uczymy się', cueId: cue.id, tokenStart: 0, tokenEnd: 2, charStart: 0, charEnd: 10 };
    rerenderApp(model);
    expect(document.querySelector('.selection-panel h2')?.textContent).toBe('Save a phrase');
  });
});

describe('lt-dlf.7 H6 loop-range button labels the action', () => {
  it('reads "Loop selection" then "Stop looping" with aria-pressed, without quoting an old label', () => {
    const { model, cue } = playerModel();
    model.selection = { kind: 'lexeme', text: 'Uczymy', cueId: cue.id, tokenStart: 0, tokenEnd: 1, charStart: 0, charEnd: 6 };
    rerenderApp(model);
    const btn = () => document.querySelector('[data-testid="loop-range-btn"]') as HTMLButtonElement;
    expect(btn().textContent).toBe('Loop selection');
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    expect(visibleText()).not.toMatch(/Loop range (on|off)/);
    btn().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    rerenderApp(model);
    expect(btn().textContent).toBe('Stop looping');
    expect(btn().getAttribute('aria-pressed')).toBe('true');
  });
});

describe('lt-dlf.7 N8/H3 residual jargon', () => {
  it('Player shows none of the audited jargon terms', () => {
    const { model } = playerModel();
    rerenderApp(model);
    for (const d of Array.from(document.querySelectorAll('details'))) d.open = true;
    rerenderApp(model);
    const html = document.body.innerHTML;
    for (const term of ['Local storage service', 'Snippets are transient', 'Absolute path (session only)', 'Owned local media path', 'Prepare source audio']) {
      expect(html).not.toContain(term);
    }
  });

  it('Library Transcript tools summary avoids "ASR drafts"', () => {
    const model = pairedModel();
    model.view = 'library';
    rerenderApp(model);
    expect(document.querySelector('details.transcript-lifecycle-disclosure summary')?.textContent).not.toContain('ASR');
  });
});

describe('lt-dlf.7 N9/H7 empty Library', () => {
  it('keeps Transcript tools closed when no media is loaded', () => {
    const model = pairedModel();
    model.view = 'library';
    rerenderApp(model);
    expect((document.querySelector('details.transcript-lifecycle-disclosure') as HTMLDetailsElement).open).toBe(false);
  });

  it('still opens them for loaded media without a transcript', async () => {
    const model = pairedModel();
    await importBrowserLocalFiles(model, { mediaFile: new dom.window.File([new Uint8Array([1])], 'a.webm', { type: 'video/webm' }) });
    model.view = 'library';
    rerenderApp(model);
    expect((document.querySelector('details.transcript-lifecycle-disclosure') as HTMLDetailsElement).open).toBe(true);
  });
});

describe('lt-dlf.7 N3 mobile Player compaction', () => {
  it('style.css hides the tagline, Player intro and duplicate source chips below 600px', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../../apps/web/src/style.css', import.meta.url), 'utf8');
    const block = css.match(/@media \(max-width: 599px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    for (const sel of ['.lingotorte-header p', '.study-cockpit-header > div > p', '.source-context-row .source-context-chips']) expect(block).toContain(sel);
  });
});
