import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rerenderApp } from '../../apps/web/src/app';
import { pairedModel } from './pairingFixture.ts';

// lt-dlf.12: one clearly primary "Choose video" path in Add media.
let dom: JSDOM;
const pickerText = 'Choose video (recommended — stays linked after reload)';
const sessionText = 'Pick a video for this session only';

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, File: dom.window.File, Element: dom.window.Element,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0,
    CSS: { escape: (v: string) => v },
  });
});
afterEach(() => {
  delete (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  dom.window.close();
});

function render(withPicker: boolean): HTMLElement {
  if (withPicker) Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: vi.fn() });
  const model = pairedModel();
  model.view = 'library';
  rerenderApp(model);
  return document.querySelector('.add-media-card') as HTMLElement;
}

const controls = (card: HTMLElement) => Array.from(card.querySelectorAll<HTMLElement>('button, label.file-picker-button'));
const labels = (card: HTMLElement) => controls(card).map((el) => (el.textContent ?? '').trim());
const sessionButton = (card: HTMLElement) => card.querySelector<HTMLElement>('label.file-picker-button[for="local-media-file"]')!;

describe('lt-dlf.12 Add media video choices', () => {
  for (const withPicker of [true, false]) {
    it(`has unique control labels and no bare "Choose video" (picker=${withPicker})`, () => {
      const card = render(withPicker);
      const all = labels(card);
      expect(new Set(all).size).toBe(all.length);
      expect(all).not.toContain('Choose video');
      expect(card.textContent).not.toContain('both import buttons');
      expect(sessionButton(card).textContent).toBe(sessionText);
    });
  }

  it('puts the persistent picker first and primary; the session copy is secondary', () => {
    const card = render(true);
    const picker = controls(card).find((el) => el.textContent === pickerText)!;
    const session = sessionButton(card);
    expect(picker.classList.contains('btn-primary')).toBe(true);
    expect(picker.compareDocumentPosition(session) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(session.classList.contains('file-picker-button-secondary')).toBe(true);
    expect(session.classList.contains('file-picker-button-primary')).toBe(false);
  });

  it('makes the session copy the primary-looking choice when no persistent picker exists (Firefox)', () => {
    const card = render(false);
    const session = sessionButton(card);
    expect(session.classList.contains('file-picker-button-primary')).toBe(true);
    expect(session.classList.contains('file-picker-button-secondary')).toBe(false);
  });
});
