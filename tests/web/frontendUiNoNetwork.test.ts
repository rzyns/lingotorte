import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createAppModel, importFixtureMediaAndSubtitles, importBrowserLocalFiles, tokenizeCueText, lookupToken } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { withNoNetwork } from '../../tests/no-network/networkTrap';

async function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost:5173/',
  });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.File = dom.window.File;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  return dom;
}

describe('Lingotorte web UI no-network enforcement', () => {
  let dom: ReturnType<typeof setupDom> extends Promise<infer T> ? T : never;

  beforeEach(async () => {
    dom = await setupDom();
  });

  afterEach(() => {
    dom.window.close();
  });

  it('renders without any network attempts and shows local-only status', async () => {
    const { value: model, networkAttempts } = await withNoNetwork(() => {
      const m = createAppModel();
      rerenderApp(m);
      return m;
    });
    expect(networkAttempts).toHaveLength(0);
    expect(model.providerPolicy.onlineProvidersEnabled).toBe(false);
    const app = document.getElementById('app');
    expect(app?.textContent).toContain('Local-only');
    expect(app?.textContent).toContain('All data stays local');
  });

  it('imports local fixtures and renders cues without network', async () => {
    const { value: model, networkAttempts } = await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(
        m,
        'fixtures/media/synthetic-polish-dialogue.webm',
        'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
        'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
      );
      rerenderApp(m);
      return m;
    });
    expect(networkAttempts).toHaveLength(0);
    expect(model.cues.length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-cue-id]').length).toBe(model.cues.length);
  });

  it('imports browser-selected local files without network', async () => {
    const createdObjectUrls: unknown[] = [];
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      configurable: true,
      value: (file: unknown) => {
        createdObjectUrls.push(file);
        return 'blob:no-network-local-video';
      },
    });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: () => undefined });

    const { value: model, networkAttempts } = await withNoNetwork(async () => {
      const m = createAppModel();
      await importBrowserLocalFiles(m, {
        mediaFile: new dom.window.File([new Uint8Array([1, 2, 3])], 'owned.webm', { type: 'video/webm' }),
        targetSubtitleFile: new dom.window.File([
          '1\n00:00:00,000 --> 00:00:01,000\nLokalny napis.\n',
        ], 'owned.pl.srt', { type: 'application/x-subrip' }),
      });
      rerenderApp(m);
      return m;
    });

    expect(networkAttempts).toHaveLength(0);
    expect(createdObjectUrls).toHaveLength(1);
    expect(model.currentMedia?.originalPath).toBe('blob:no-network-local-video');
    expect(document.getElementById('app')?.textContent).toContain('Lokalny napis.');
  });

  it('tokenizes a cue locally without network attempts', async () => {
    const { value: tokens, networkAttempts } = await withNoNetwork(async () => {
      const m = createAppModel();
      await importFixtureMediaAndSubtitles(
        m,
        'fixtures/media/synthetic-polish-dialogue.webm',
        'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
        'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
      );
      const firstCue = m.cues[0];
      if (!firstCue) throw new Error('Expected at least one cue');
      return tokenizeCueText(m, firstCue);
    });
    expect(networkAttempts).toHaveLength(0);
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('returns disabled lookup result and records no network activity', async () => {
    const { value: result, networkAttempts } = await withNoNetwork(async () => {
      const m = createAppModel();
      const cueId = m.cues[0]?.id ?? 'cue-1';
      return lookupToken(m, 'Cześć', cueId);
    });
    expect(networkAttempts).toHaveLength(0);
    expect(result.entries).toHaveLength(0);
    expect(result.warnings.some((w: string) => w.includes('unavailable') || w.includes('disabled'))).toBe(true);
    expect(result.run.adapterId).toContain('unavailable');
    expect(result.run.privacyMode).toBe('local');
  });
});
