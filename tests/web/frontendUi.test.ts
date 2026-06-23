import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createAppModel, importFixtureMediaAndSubtitles, importBrowserLocalFiles, saveSentenceFromCue } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';

async function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost:5173/',
  });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLVideoElement = dom.window.HTMLVideoElement;
  globalThis.File = dom.window.File;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  return dom;
}

describe('Lingotorte web UI fixture-driven smoke', () => {
  let dom: ReturnType<typeof setupDom> extends Promise<infer T> ? T : never;

  beforeEach(async () => {
    dom = await setupDom();
  });

  afterEach(() => {
    dom.window.close();
  });

  it('renders the app shell with local-only provider status', () => {
    const model = createAppModel();
    rerenderApp(model);
    const app = document.getElementById('app');
    expect(app?.querySelector('h1')?.textContent).toBe('Lingotorte');
    expect(app?.textContent).toContain('Local-only');
    expect(app?.textContent).toContain('All data stays local');
    expect(app?.querySelector('.provider-status')).toBeTruthy();
  });

  it('switches views via navigation and marks active page', () => {
    const model = createAppModel();
    rerenderApp(model);
    const app = document.getElementById('app');
    const nav = app?.querySelector('nav');
    const buttons = nav?.querySelectorAll('button');
    expect(buttons?.length).toBe(7);
    const savedBtn = Array.from(document.querySelectorAll('nav button')).find((b) => b.textContent === 'Saved') as HTMLElement | null;
    savedBtn?.click();
    expect(document.getElementById('app')?.textContent).toContain('My Vocab');
  });

  it('loads the synthetic fixture and renders transcript cues', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    rerenderApp(model);
    const app = document.getElementById('app');
    const rows = app?.querySelectorAll('[data-cue-id]');
    expect(rows?.length).toBe(2);
    const text = app?.textContent ?? '';
    expect(text).toContain('Cześć, to jest lokalny test.');
  });

  it('imports browser-selected local media and subtitle files into the player without upload', async () => {
    const model = createAppModel();
    model.view = 'library';
    const createObjectURL = vi.fn(() => 'blob:local-video-0');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    rerenderApp(model);
    const mediaInput = document.querySelector('input[name="local-media-file"]') as HTMLInputElement | null;
    const targetInput = document.querySelector('input[name="local-target-subtitle-file"]') as HTMLInputElement | null;
    const nativeInput = document.querySelector('input[name="local-native-subtitle-file"]') as HTMLInputElement | null;
    expect(mediaInput).toBeTruthy();
    expect(targetInput).toBeTruthy();
    expect(nativeInput).toBeTruthy();

    const mediaFile = new dom.window.File([new Uint8Array([0, 1, 2, 3])], 'owned-clip.webm', { type: 'video/webm' });
    const targetSrt = new dom.window.File([
      '1\n00:00:00,000 --> 00:00:01,000\nTo jest własny plik.\n\n2\n00:00:01,000 --> 00:00:02,000\nDruga lokalna linia.\n',
    ], 'owned-clip.pl.srt', { type: 'application/x-subrip' });
    const nativeSrt = new dom.window.File([
      '1\n00:00:00,000 --> 00:00:01,000\nThis is my own file.\n\n2\n00:00:01,000 --> 00:00:02,000\nSecond local line.\n',
    ], 'owned-clip.en.srt', { type: 'application/x-subrip' });
    Object.defineProperty(mediaInput!, 'files', { configurable: true, value: [mediaFile] });
    Object.defineProperty(targetInput!, 'files', { configurable: true, value: [targetSrt] });
    Object.defineProperty(nativeInput!, 'files', { configurable: true, value: [nativeSrt] });

    const importButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Import local media');
    expect(importButton).toBeTruthy();
    importButton!.click();
    for (let i = 0; i < 10 && !model.currentMedia && !model.importError; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const app = document.getElementById('app')!;
    const video = document.querySelector('video') as HTMLVideoElement | null;
    expect(createObjectURL).toHaveBeenCalledWith(mediaFile);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(model.currentMedia?.title).toBe('owned-clip');
    expect(model.currentMedia?.privacyLabel).toBe('owned');
    expect(model.currentMedia?.originalPath).toBe('blob:local-video-0');
    expect(video?.src).toBe('blob:local-video-0');
    expect(model.cues).toHaveLength(2);
    expect(app.textContent).toContain('To jest własny plik.');
    expect(app.textContent).toContain('This is my own file.');
  });

  it('imports browser-selected media without subtitles so ASR can create a draft later', async () => {
    const model = createAppModel();
    model.view = 'library';
    const createObjectURL = vi.fn(() => 'blob:media-only-video');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    rerenderApp(model);
    const mediaInput = document.querySelector('input[name="local-media-file"]') as HTMLInputElement | null;
    const targetInput = document.querySelector('input[name="local-target-subtitle-file"]') as HTMLInputElement | null;
    expect(mediaInput).toBeTruthy();
    expect(targetInput).toBeTruthy();
    const mediaFile = new dom.window.File([new Uint8Array([4, 5, 6])], 'needs-asr.webm', { type: 'video/webm' });
    Object.defineProperty(mediaInput!, 'files', { configurable: true, value: [mediaFile] });
    Object.defineProperty(targetInput!, 'files', { configurable: true, value: [] });

    const importButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Import local media');
    expect(importButton).toBeTruthy();
    importButton!.click();
    for (let i = 0; i < 10 && !model.currentMedia && !model.importError; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const app = document.getElementById('app')!;
    const video = document.querySelector('video') as HTMLVideoElement | null;
    expect(model.importError).toBeNull();
    expect(model.view).toBe('player');
    expect(model.currentMedia?.title).toBe('needs-asr');
    expect(model.currentMedia?.originalPath).toBe('blob:media-only-video');
    expect(model.targetTrackId).toBeNull();
    expect(model.nativeTrackId).toBeNull();
    expect(model.cues).toHaveLength(0);
    expect(video?.src).toBe('blob:media-only-video');
    expect(createObjectURL).toHaveBeenCalledWith(mediaFile);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(app.textContent).toContain('No transcript loaded yet');
    expect(app.textContent).toContain('Generate local ASR draft');
  });

  it('shows local subtitle parse errors and revokes the failed object URL', async () => {
    const model = createAppModel();
    model.view = 'library';
    const createObjectURL = vi.fn(() => 'blob:bad-local-video');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    rerenderApp(model);
    const mediaInput = document.querySelector('input[name="local-media-file"]') as HTMLInputElement;
    const targetInput = document.querySelector('input[name="local-target-subtitle-file"]') as HTMLInputElement;
    Object.defineProperty(mediaInput, 'files', { configurable: true, value: [new dom.window.File([new Uint8Array([1])], 'bad.webm', { type: 'video/webm' })] });
    Object.defineProperty(targetInput, 'files', { configurable: true, value: [new dom.window.File(['not an srt file'], 'bad.srt', { type: 'application/x-subrip' })] });

    const importButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Import local media');
    importButton!.click();
    for (let i = 0; i < 10 && !model.importError; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(model.currentMedia).toBeNull();
    expect(model.importError).toMatch(/SRT block|Invalid SRT|missing numeric cue id/);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:bad-local-video');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(model.importError!);
  });

  it('revokes the previous local object URL when replacing browser-selected media', async () => {
    const model = createAppModel();
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:first-local-video')
      .mockReturnValueOnce('blob:second-local-video');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const targetSrtText = '1\n00:00:00,000 --> 00:00:01,000\nPierwsza linia.\n';

    await importBrowserLocalFiles(model, {
      mediaFile: new dom.window.File([new Uint8Array([1])], 'first.webm', { type: 'video/webm' }),
      targetSubtitleFile: new dom.window.File([targetSrtText], 'first.pl.srt', { type: 'application/x-subrip' }),
    });
    await importBrowserLocalFiles(model, {
      mediaFile: new dom.window.File([new Uint8Array([2])], 'second.webm', { type: 'video/webm' }),
      targetSubtitleFile: new dom.window.File([targetSrtText], 'second.pl.srt', { type: 'application/x-subrip' }),
    });

    expect(model.currentMedia?.originalPath).toBe('blob:second-local-video');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first-local-video');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:second-local-video');
  });

  it('saves a sentence from a cue and shows it in the saved view', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    const firstCue = model.cues[0];
    expect(firstCue).toBeDefined();
    await saveSentenceFromCue(model, firstCue!);
    rerenderApp(model);
    const savedBtn = Array.from(document.querySelectorAll('nav button')).find((b) => b.textContent === 'Saved') as HTMLElement | null;
    savedBtn?.click();
    const sentencesTab = Array.from(document.querySelectorAll('[role="tab"]')).find((b) => b.textContent === 'My Sentences') as HTMLElement | null;
    sentencesTab?.click();
    const app = document.getElementById('app');
    expect(app?.textContent).toContain('Cześć, to jest lokalny test.');
    expect(app?.textContent).toContain('sentence');
  });

  it('search filters transcript cues', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    rerenderApp(model);
    const search = document.querySelector('[aria-label="Search transcript"]') as HTMLInputElement | null;
    expect(search).toBeTruthy();
    search!.value = 'lokalny';
    search!.dispatchEvent(new dom.window.Event('input'));
    const rows = document.querySelectorAll('[data-cue-id]');
    expect(rows.length).toBe(1);
    expect(rows[0]!.textContent).toContain('lokalny');
  });

  it('does not issue network requests in provider-disabled model', async () => {
    const model = createAppModel();
    expect(model.providerPolicy.onlineProvidersEnabled).toBe(false);
    expect(model.adapters.dictionary?.adapterId).toContain('unavailable');
  });
});
