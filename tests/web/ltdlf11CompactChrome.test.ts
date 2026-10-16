import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';

// lt-dlf.11 (ux-audit-2026-10-15 P2+P3): compact Player chrome.
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
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:lt-dlf11') });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); dom.window.close(); });

function playerModel() {
  const model = createAppModel();
  const text = 'Uczymy się polskiego razem.';
  const asset = makeMediaAsset({ title: 'Synthetic clip', originalPath: 'fixtures/media/x.webm', contentSha256: sha, durationMs: 4000, container: 'webm', sizeBytes: 1, privacyLabel: 'owned' });
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

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ');
const css = readFileSync(new URL('../../apps/web/src/style.css', import.meta.url), 'utf8');

describe('lt-dlf.11 compact Player chrome', () => {
  it('drops the two-line hero intro but keeps a Player heading', () => {
    rerenderApp(playerModel().model);
    const header = document.querySelector('.study-cockpit-header')!;
    expect(header.querySelector('h2')?.textContent).toBe('Player');
    expect(header.querySelector(':scope > div > p')).toBeNull();
    expect(text(document.body)).not.toContain('Every word you save remembers');
  });

  it('each fact appears once between hero and source row', () => {
    rerenderApp(playerModel().model);
    const hero = text(document.querySelector('.study-cockpit-header'));
    const source = document.querySelector('.source-context-row')!;
    const visibleSource = text(source.querySelector('.source-compact-summary')) + ' ' + Array.from(source.querySelectorAll('.source-context-chips > *')).map((c) => c.textContent).join(' ');
    expect(hero).toContain('Transcript ready');
    expect(visibleSource).not.toContain('Transcript');
    expect(visibleSource.match(/line 1\b/g)?.length).toBe(1);
    expect(visibleSource).toContain('Synthetic clip');
    expect(hero).not.toContain('Synthetic clip');
  });

  it('privacy chip stays visible on the Player and is not hidden by mobile CSS', () => {
    rerenderApp(playerModel().model);
    const chips = Array.from(document.querySelectorAll('.source-context-chips .source-meta-chip')).map((c) => c.textContent);
    expect(chips).toContain('owned');
    const mobile = [...css.matchAll(/@media \(max-width: 599px\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
    expect(mobile).not.toMatch(/source-meta-chip|source-context-chips[^{]*\{[^}]*display:\s*none/);
  });

  it('nav is a single non-wrapping horizontally scrollable row with aria-current', () => {
    rerenderApp(playerModel().model);
    const current = Array.from(document.querySelectorAll('.lingotorte-nav button[aria-current="page"]')).map((b) => b.textContent);
    expect(current).toEqual(['Player']);
    const navRule = css.match(/\.lingotorte-nav \{([^}]*)\}/)?.[1] ?? '';
    expect(navRule).toMatch(/flex-wrap:\s*nowrap/);
    expect(navRule).toMatch(/overflow-x:\s*auto/);
    expect(css).toMatch(/\.lingotorte-nav button:focus-visible/);
  });

  it('desktop video stage is height-capped so the whole video fits at load', () => {
    expect(css).toMatch(/\.video-stage \{[^}]*max-height:/);
  });
});
