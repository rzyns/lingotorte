import { JSDOM } from 'jsdom';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel } from '../../apps/web/src/model';
import { makeCue, makeMediaAsset, makeSubtitleTrack } from '@lingotorte/domain';
import { rerenderApp } from '../../apps/web/src/app';
import { assignSubtitleFiles } from '../../apps/web/src/ui/fileControls';
import { openShortcutHelp } from '../../apps/web/src/ui/shortcutHelp';

// lt-dlf.8: UX cosmetic batch from the 2026-10-14 audit (N4, N5, H10, V12, residual jargon, Task A).

const sha = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, File: dom.window.File, Element: dom.window.Element,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0,
    KeyboardEvent: dom.window.KeyboardEvent, CSS: { escape: (v: string) => v },
  });
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:lt-dlf8') });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => { document.querySelector('dialog.shortcut-help')?.remove(); vi.restoreAllMocks(); dom.window.close(); });

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
  return { model };
}

const css = readFileSync(new URL('../../apps/web/src/style.css', import.meta.url), 'utf8');
const press = (target: EventTarget, key: string) => target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('lt-dlf.8 N5 file inputs', () => {
  it('keeps the inputs by id, visually hidden (not display:none) with a label and a styled button', () => {
    const model = createAppModel();
    model.view = 'library';
    rerenderApp(model);
    for (const id of ['local-media-file', 'local-target-subtitle-file', 'local-native-subtitle-file', 'local-subtitle-files']) {
      const input = document.getElementById(id) as HTMLInputElement;
      expect(input, id).toBeTruthy();
      expect(input.type).toBe('file');
      expect(input.classList.contains('file-input-hidden')).toBe(true);
      expect(input.hidden).toBe(false);
      expect(input.tabIndex).not.toBe(-1);
      expect(input.labels?.length ?? 0, id).toBeGreaterThan(0);
      expect(input.parentElement?.querySelector('.file-picker-button')).toBeTruthy();
      expect(input.parentElement?.querySelector('.file-picker-name')?.textContent).toBe('No file chosen');
    }
    const rule = css.slice(css.indexOf('.file-input-hidden {'), css.indexOf('}', css.indexOf('.file-input-hidden {')));
    expect(rule).toContain('clip: rect(0, 0, 0, 0)');
    expect(rule).not.toContain('display: none');
  });
});

describe('lt-dlf.8 H10 shortcut help', () => {
  it("'?' button opens a dialog, Escape closes it and focus returns to the button", () => {
    const { model } = playerModel();
    rerenderApp(model);
    const button = document.querySelector('.shortcut-help-button') as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.focus();
    button.click();
    const dialog = document.querySelector('dialog.shortcut-help')!;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('Replay current line');
    expect(dialog.textContent).toContain('Show answer');
    press(dialog.querySelector('button')!, 'Escape');
    expect(document.querySelector('dialog.shortcut-help')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('when the opener was re-rendered away, focus goes to the new ? button, else a heading, not body', () => {
    const { model } = playerModel();
    rerenderApp(model);
    const stale = document.querySelector('.shortcut-help-button') as HTMLButtonElement;
    stale.click();
    rerenderApp(model); // replaces the opener
    expect(stale.isConnected).toBe(false);
    press(document.querySelector('dialog.shortcut-help button')!, 'Escape');
    const fresh = document.querySelector('.shortcut-help-button');
    expect(fresh).toBeTruthy();
    expect(document.activeElement).toBe(fresh);

    document.body.innerHTML = '<main id="app"><h1>Library</h1><button id="gone">x</button></main>';
    const gone = document.getElementById('gone') as HTMLButtonElement;
    openShortcutHelp(gone);
    gone.remove();
    press(document.querySelector('dialog.shortcut-help button')!, 'Escape');
    const h1 = document.querySelector('h1')!;
    expect(document.activeElement).toBe(h1);
    expect(h1.getAttribute('tabindex')).toBe('-1');
    h1.blur();
    expect(h1.hasAttribute('tabindex')).toBe(false);
  });

  it("the '?' key opens the help, but not while typing in an input", () => {
    const { model } = playerModel();
    rerenderApp(model);
    const input = document.createElement('input');
    document.body.appendChild(input);
    press(input, '?');
    expect(document.querySelector('dialog.shortcut-help')).toBeNull();
    press(document.body, '?');
    expect(document.querySelector('dialog.shortcut-help')).toBeTruthy();
  });
});

describe('lt-dlf.8 N4 and V12 styles', () => {
  it('spaces the Saved occurrence line from its details disclosure', () => {
    expect(css).toMatch(/\.occurrence-context \{[^}]*column-gap: var\(--space-2\)/);
  });
  it('uses a local display face for h1/h2 and loads no web fonts', () => {
    expect(css).toMatch(/h1,\s*h2 \{\s*font-family: ui-serif,[^;]*Georgia/);
    expect(css).not.toMatch(/@font-face|@import|url\(\s*['"]?https?:/);
  });
});

describe('lt-dlf.8 residual jargon (source scan of visible strings)', () => {
  const files = ['views/library.ts', 'views/practice.ts', 'views/player/controls.ts', 'views/player/stage.ts', 'views/player/transcript.ts', 'ui/common.ts', 'ui/snippets.ts', 'ui/transcriptSources.ts', 'appShell.ts'];
  it('has no ASR / transient / absolute / owned local media in user-facing string literals', () => {
    for (const f of files) {
      const src = readFileSync(new URL(`../../apps/web/src/${f}`, import.meta.url), 'utf8');
      const visible = src.split('\n').filter((line) => /textContent\s*=|placeholder\s*=|createTextNode\(|message\s*=|Error\s*=|'Local .* draft'|append\('/.test(line) && !line.trim().startsWith('//'));
      for (const line of visible) expect(line, `${f}: ${line.trim()}`).not.toMatch(/\bASR\b|[Tt]ransient|absolute|owned local media/);
    }
  });

  // Explicit, short allowlist of non-user-facing string literals (exact literal -> reason). Empty today:
  // ASR is matched case-sensitively, so internal ids such as 'local-asr' / 'local-asr-media-path' never hit.
  const ALLOWED: ReadonlyMap<string, string> = new Map();
  const JARGON = /\bASR\b|[Tt]ransient|[Oo]wned (local )?media|[Aa]bsolute owned/;
  const srcRoot = fileURLToPath(new URL('../../apps/web/src/', import.meta.url));
  const listTs = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listTs(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
  it('no string literal anywhere in apps/web/src carries ASR / transient / owned media jargon', () => {
    const hits: string[] = [];
    for (const file of listTs(srcRoot)) {
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      for (const [lit] of src.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
        if (JARGON.test(lit) && !ALLOWED.has(lit)) hits.push(`${file.slice(srcRoot.length)}: ${lit}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('lt-dlf.8 Task A subtitle assignment', () => {
  const f = (name: string) => new File(['1\n00:00:00,000 --> 00:00:01,000\nx\n'], name);
  it('one file is the target', () => {
    const a = f('show.srt');
    expect(assignSubtitleFiles([a], 'pl', 'en')).toEqual({ target: a, native: null, ambiguous: false });
  });
  it('two files are assigned by language tags in either order', () => {
    const pl = f('ep1.pl.srt');
    const en = f('ep1.en.srt');
    expect(assignSubtitleFiles([en, pl], 'pl', 'en')).toEqual({ target: pl, native: en, ambiguous: false });
    expect(assignSubtitleFiles([pl, en], 'pl', 'en')).toEqual({ target: pl, native: en, ambiguous: false });
    const t = f('synthetic-polish-dialogue.target.srt');
    const n = f('synthetic-polish-dialogue.native.srt');
    expect(assignSubtitleFiles([n, t], 'pl', 'en')).toEqual({ target: t, native: n, ambiguous: false });
  });
  it('unclear or too many files are ambiguous and nothing is guessed', () => {
    expect(assignSubtitleFiles([f('a.srt'), f('b.srt')], 'pl', 'en')).toEqual({ target: null, native: null, ambiguous: true });
    expect(assignSubtitleFiles([f('a.pl.en.srt'), f('b.srt')], 'pl', 'en').ambiguous).toBe(true);
    expect(assignSubtitleFiles([f('a.pl.srt'), f('b.en.srt'), f('c.srt')], 'pl', 'en').ambiguous).toBe(true);
  });
  it('one positively identified file plus an untagged, unrecognised or same-tag file is ambiguous', () => {
    const none = { target: null, native: null, ambiguous: true };
    expect(assignSubtitleFiles([f('movie.pl.srt'), f('movie.de.srt')], 'pl', 'en')).toEqual(none);
    expect(assignSubtitleFiles([f('movie.de.srt'), f('movie.pl.srt')], 'pl', 'en')).toEqual(none);
    expect(assignSubtitleFiles([f('a.pl.srt'), f('b.pl.srt')], 'pl', 'en')).toEqual(none);
    expect(assignSubtitleFiles([f('a.en.srt'), f('b.en.srt')], 'pl', 'en')).toEqual(none);
    expect(assignSubtitleFiles([f('a.target.srt'), f('b.target.srt')], 'pl', 'en')).toEqual(none);
    expect(assignSubtitleFiles([f('ep.pl.srt'), f('ep.srt')], 'pl', 'en')).toEqual(none);
  });
  it('a single file tagged native is not made the target (ambiguous, per-role inputs open)', () => {
    const none = { target: null, native: null, ambiguous: true };
    expect(assignSubtitleFiles([f('movie.en.srt')], 'pl', 'en')).toEqual(none);
    expect(assignSubtitleFiles([f('movie.native.srt')], 'pl', 'en')).toEqual(none);
    const pl = f('movie.pl.srt');
    expect(assignSubtitleFiles([pl], 'pl', 'en')).toEqual({ target: pl, native: null, ambiguous: false });
  });
  it('the multi picker shows the assignment with a Swap, and the import uses it', () => {
    const model = createAppModel();
    model.view = 'library';
    rerenderApp(model);
    const multi = document.getElementById('local-subtitle-files') as HTMLInputElement;
    expect(multi.multiple).toBe(true);
    const files = [f('ep.en.srt'), f('ep.pl.srt')];
    Object.defineProperty(multi, 'files', { configurable: true, value: files });
    multi.dispatchEvent(new dom.window.Event('change'));
    const line = document.querySelector('.subtitle-assignment')!;
    expect(line.textContent).toContain('Target: ep.pl.srt · Native: ep.en.srt');
    (line.querySelector('.subtitle-swap') as HTMLButtonElement).click();
    expect(line.textContent).toContain('Target: ep.en.srt · Native: ep.pl.srt');
    Object.defineProperty(multi, 'files', { configurable: true, value: [f('a.srt'), f('b.srt')] });
    multi.dispatchEvent(new dom.window.Event('change'));
    expect(line.textContent).toContain('Choose them separately');
    expect((document.querySelector('details.subtitle-separate') as HTMLDetailsElement).open).toBe(true);
  });
});
