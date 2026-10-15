import { pairedModel } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearLoopRange, importFixtureMediaAndSubtitles, setLoopRange, setVisualSourceRange } from '../../apps/web/src/model.ts';
import { rerenderApp } from '../../apps/web/src/app.ts';

const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.CSS = { escape: (value: string) => value.replace(/"/g, '\\"') } as unknown as typeof CSS;
  return dom;
}

const disclosure = () => document.querySelector('details.source-tools-disclosure') as HTMLDetailsElement;

async function playerModel() {
  const model = pairedModel();
  await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
  rerenderApp(model);
  return model;
}

describe('lt-dlf.6 source tools disclosure', () => {
  let dom: JSDOM;
  beforeEach(() => { dom = setupDom(); });
  afterEach(() => dom.window.close());

  it('is closed by default, last in the left column after the selection panel, with a plain summary', async () => {
    await playerModel();
    const d = disclosure();
    expect(d).not.toBeNull();
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')?.textContent).toBe('Clip and audio tools (loop a range, prepare audio for practice)');
    const left = document.querySelector('.artifact-workbench')!;
    expect(left.lastElementChild).toBe(d);
    expect(d.previousElementSibling?.classList.contains('selection-panel')).toBe(true);
    expect(d.querySelector('[data-testid="source-range-panel"]')).not.toBeNull();
  });

  it('keeps ids and uses plain-language labels', async () => {
    await playerModel();
    const d = disclosure();
    expect(d.querySelector('#source-range-media-path')).not.toBeNull();
    expect(d.textContent).toContain('Video file path on the local service');
    expect(d.textContent).not.toContain('Owned local media path');
    expect([...d.querySelectorAll('button')].some((b) => b.textContent === 'Prepare audio for practice')).toBe(true);
    expect(d.textContent).not.toContain('Prepare source audio');
  });

  it('opens when a loop range or source range is active', async () => {
    const model = await playerModel();
    setLoopRange(model, 100, 900); rerenderApp(model);
    expect(disclosure().open).toBe(true);
    clearLoopRange(model); rerenderApp(model);
    expect(disclosure().open).toBe(false);
    setVisualSourceRange(model, 100, 1000); rerenderApp(model);
    expect(disclosure().open).toBe(true);
  });

  it('remembers a genuine user toggle and ignores the programmatic toggle event', async () => {
    const model = await playerModel();
    let d = disclosure();
    d.open = true; d.dispatchEvent(new window.Event('toggle'));
    rerenderApp(model);
    d = disclosure();
    expect(d.open).toBe(true);
    // A toggle event fired for the rendered state (programmatic) must not flip memory.
    d.dispatchEvent(new window.Event('toggle'));
    rerenderApp(model);
    expect(disclosure().open).toBe(true);
    d = disclosure(); d.open = false; d.dispatchEvent(new window.Event('toggle'));
    rerenderApp(model);
    expect(disclosure().open).toBe(false);
  });

  // jsdom does not fire 'toggle' when open is set, so user toggles are dispatched by hand.
  it('an active range opens it even after the user closed it; clearing the range restores the user choice', async () => {
    const model = await playerModel();
    let d = disclosure(); d.open = true; d.dispatchEvent(new window.Event('toggle'));
    rerenderApp(model);
    d = disclosure(); d.open = false; d.dispatchEvent(new window.Event('toggle'));
    rerenderApp(model);
    expect(disclosure().open).toBe(false);
    setLoopRange(model, 100, 900); rerenderApp(model);
    expect(disclosure().open).toBe(true);
    clearLoopRange(model); rerenderApp(model);
    expect(disclosure().open).toBe(false);
  });

  it('a user-opened panel stays open after the range is cleared', async () => {
    const model = await playerModel();
    const d = disclosure(); d.open = true; d.dispatchEvent(new window.Event('toggle'));
    setLoopRange(model, 100, 900); rerenderApp(model);
    clearLoopRange(model); rerenderApp(model);
    expect(disclosure().open).toBe(true);
  });
});
