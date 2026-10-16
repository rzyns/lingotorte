import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { cueRowOnScreen } from '../../apps/web/src/appShell';

// lt-dlf.14: dvh with vh fallback, short-landscape layout, webkit fullscreen reset, covered-area check.
const css = readFileSync(new URL('../../apps/web/src/style.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function rule(selectorStart: string): string {
  const i = css.indexOf(selectorStart);
  expect(i).toBeGreaterThanOrEqual(0);
  return css.slice(i, css.indexOf('}', i));
}

describe('lt-dlf.14 CSS', () => {
  it('uses dvh with a preceding vh fallback for the sticky video and sheet', () => {
    expect(css).toMatch(/max-height: 30vh;[\s\S]{0,200}max-height: 30dvh;/);
    expect(css).toMatch(/max-height: 45vh;\n\s*max-height: 45dvh;/);
    expect(css).toMatch(/padding-bottom: 45vh;\n\s*padding-bottom: 45dvh;/);
  });

  it('has a short-landscape media query that moves the sheet beside the transcript', () => {
    const i = css.indexOf('@media (max-width: 899px) and (max-height: 500px)');
    expect(i).toBeGreaterThan(0);
    const block = css.slice(i, i + 1500);
    expect(block).toContain('35dvh');
    expect(block).toMatch(/capture-sheet \{[\s\S]*?width: 50%/);
    expect(block).toContain('padding-right: 50%');
  });

  it('lets the subtitle overlay grow in short landscape so the first line is not clipped (hit-test-dead)', () => {
    const i = css.indexOf('@media (max-width: 899px) and (max-height: 500px)');
    const block = css.slice(i, css.indexOf('\n}\n', i));
    expect(block).toMatch(/\.subtitle-overlay \{\s*max-height: none;/);
  });

  it('resets the stage under the prefixed WebKit fullscreen pseudo-class', () => {
    const r = rule('.video-stage:-webkit-full-screen {');
    expect(r).toContain('position: static');
    expect(r).toContain('max-height: none');
    expect(r).toContain('max-width: none');
  });

  it('restores --space-2 rhythm for workbench children under display: contents', () => {
    expect(css).toMatch(/display: contents;[\s\S]{0,900}\.player-layout \{\n\s*row-gap: var\(--space-2\);/);
  });
});

describe('lt-dlf.14 cueRowOnScreen', () => {
  let dom: JSDOM;
  afterEach(() => dom?.window.close());

  function setup(sheetLeft = 0, videoLeft = 0, videoRight = 390) {
    dom = new JSDOM(`<!doctype html><body>
      <div class="video-stage" style="position: sticky"></div>
      <div data-cue-id="c1" class="cue-row"></div>
      <section class="selection-panel capture-sheet" style="position: fixed"></section></body>`, { pretendToBeVisual: true });
    globalThis.document = dom.window.document;
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    Object.defineProperty(dom.window, 'innerHeight', { value: 844, configurable: true });
    const box = (sel: string, top: number, bottom: number, left = 0, right = 390) => {
      (dom.window.document.querySelector(sel) as HTMLElement).getBoundingClientRect = () =>
        ({ top, bottom, left, right, height: bottom - top, width: right - left, x: left, y: top, toJSON() {} }) as DOMRect;
    };
    box('.video-stage', 0, 250, videoLeft, videoRight);
    box('.selection-panel', 464, 844, sheetLeft, 390);
    return (top: number, bottom: number) => box('[data-cue-id="c1"]', top, bottom);
  }

  it('treats a row hidden under the sticky video as off-screen', () => {
    const row = setup();
    row(100, 140);
    expect(cueRowOnScreen('c1')).toBe(false);
  });

  it('treats a row hidden under the bottom sheet as off-screen', () => {
    const row = setup();
    row(600, 640);
    expect(cueRowOnScreen('c1')).toBe(false);
  });

  it('treats a row in the band between video and sheet as on-screen', () => {
    const row = setup();
    row(300, 340);
    expect(cueRowOnScreen('c1')).toBe(true);
  });

  it('ignores a sheet that sits beside the row (landscape)', () => {
    const row = setup(400);
    row(600, 640);
    expect(cueRowOnScreen('c1')).toBe(true);
  });

  it('detects short landscape (<=899px wide, <=500px tall) so a covered row is still revealed', async () => {
    const shell = await import('../../apps/web/src/appShell');
    const row = setup(400, 150, 300);
    row(-26, 119);
    dom.window.matchMedia = ((q: string) => ({ matches: /max-width/.test(q), media: q })) as unknown as typeof dom.window.matchMedia;
    expect(shell.isShortLandscapeLayout()).toBe(false); // innerHeight 844: portrait
    Object.defineProperty(dom.window, 'innerHeight', { value: 390, configurable: true });
    expect(shell.isShortLandscapeLayout()).toBe(true);
  });
});
