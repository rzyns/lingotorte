import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderApp } from '../../apps/web/src/app';
import { createAppModel } from '../../apps/web/src/model';

// JSDOM does not lay out CSS grid, so this pins the contract instead: one
// explicit row per app-shell child, with <main> on the only 1fr track. A real
// browser check is recorded in the lt-4he evidence.
const css = readFileSync(new URL('../../apps/web/src/style.css', import.meta.url), 'utf8');
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  expect(match, selector).toBeTruthy();
  return match?.[2] ?? '';
};

let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><main id="app"></main>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
  for (const key of ['document', 'window', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'MutationObserver'] as const) vi.stubGlobal(key, dom.window[key]);
  vi.stubGlobal('requestAnimationFrame', () => 0);
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

it('gives the sync banner its own auto row so <main> keeps the 1fr row (lt-4he)', () => {
  const root = renderApp(createAppModel());
  // lt-e0j: the toast region is position:fixed (not a grid row), so it is excluded here.
  const children = [...root.children].filter((child) => !child.classList.contains('toast-region')).map((child) =>
    child.classList.contains('lingotorte-header') ? '.lingotorte-header'
      : child.hasAttribute('data-local-service-sync') ? '[data-local-service-sync]'
        : child.classList.contains('lingotorte-main') ? '.lingotorte-main'
          : child.classList.contains('lingotorte-footer') ? '.lingotorte-footer' : child.outerHTML.slice(0, 40));
  expect(children).toEqual(['.lingotorte-header', '[data-local-service-sync]', '.lingotorte-main', '.lingotorte-footer']);

  const template = /grid-template-rows:\s*([^;]+);/.exec(rule('.lingotorte-app'))?.[1];
  expect(template).toBeDefined();
  const tracks = (template ?? '').trim().split(/\s+/);
  expect(tracks).toHaveLength(children.length);
  expect(tracks.filter((track) => track === '1fr')).toHaveLength(1);
  children.forEach((selector, index) => {
    expect(rule(`.lingotorte-app > ${selector}`)).toMatch(new RegExp(`grid-row:\\s*${index + 1}\\s*;`));
  });
  expect(tracks[children.indexOf('.lingotorte-main')]).toBe('1fr');
});
