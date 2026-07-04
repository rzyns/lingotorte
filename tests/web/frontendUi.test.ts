import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createAppModel, importFixtureMediaAndSubtitles, importBrowserLocalFiles, importBrowserLocalFileHandles, saveSentenceFromCue } from '../../apps/web/src/model';
import { makeMediaAsset } from '@lingotorte/domain';
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
    delete (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker;
    delete (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker;
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
    expect(text).toContain('We study from our own subtitles.');
  });

  it('presents a source-backed study cockpit with transcript and status tokens', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    rerenderApp(model);

    const cockpit = document.querySelector('.study-cockpit');
    expect(cockpit).toBeTruthy();
    expect(cockpit?.querySelector('.artifact-workbench .video-stage')).toBeTruthy();
    expect(cockpit?.querySelector('.artifact-workbench .player-controls')).toBeTruthy();
    expect(cockpit?.querySelector('.transcript-copilot .transcript-panel')).toBeTruthy();

    const statusTokens = Array.from(cockpit?.querySelectorAll('.status-token') ?? []).map((token) => token.textContent?.trim());
    expect(statusTokens).toContain('local/private');
    expect(statusTokens).toContain('approved');

    const sourceContext = cockpit?.querySelector('.source-context-row');
    expect(sourceContext?.textContent).toContain('fixtures/media/synthetic-polish-dialogue.webm');
    expect(sourceContext?.textContent).toContain('cue 1');
    expect(sourceContext?.textContent).toContain('0:00–0:02');
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

  it('imports browser persistent file handles with a stable source label and transient playback URL', async () => {
    const model = createAppModel();
    const createObjectURL = vi.fn(() => 'blob:persistent-handle-video');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const mediaFile = new dom.window.File([new Uint8Array([9, 8, 7])], 'persistent-clip.webm', { type: 'video/webm' });
    const targetSrt = new dom.window.File([
      '1\n00:00:00,000 --> 00:00:01,000\nStały uchwyt pliku.\n',
    ], 'persistent-clip.pl.srt', { type: 'application/x-subrip' });
    const mediaHandle = { name: 'persistent-clip.webm', getFile: vi.fn(async () => mediaFile) };
    const targetSubtitleHandle = { name: 'persistent-clip.pl.srt', getFile: vi.fn(async () => targetSrt) };

    await importBrowserLocalFileHandles(model, { mediaHandle, targetSubtitleHandle });
    rerenderApp(model);

    const video = document.querySelector('video') as HTMLVideoElement | null;
    expect(mediaHandle.getFile).toHaveBeenCalledTimes(1);
    expect(targetSubtitleHandle.getFile).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(mediaFile);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(model.currentMedia?.title).toBe('persistent-clip');
    expect(model.currentMedia?.originalPath).toBe('browser-file-handle:persistent-clip.webm');
    expect(video?.src).toBe('blob:persistent-handle-video');
    expect(document.getElementById('app')?.textContent).toContain('Stały uchwyt pliku.');
  });

  it('offers a browser persistent media-handle picker in the Library when supported', async () => {
    const model = createAppModel();
    model.view = 'library';
    const createObjectURL = vi.fn(() => 'blob:persistent-picker-video');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const mediaFile = new dom.window.File([new Uint8Array([3, 2, 1])], 'picker-clip.webm', { type: 'video/webm' });
    const mediaHandle = { name: 'picker-clip.webm', getFile: vi.fn(async () => mediaFile) };
    const showOpenFilePicker = vi.fn(async () => [mediaHandle]);
    Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: showOpenFilePicker });

    rerenderApp(model);
    const persistentButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Import persistent media handle');
    expect(persistentButton).toBeTruthy();
    persistentButton!.click();
    for (let i = 0; i < 10 && !model.currentMedia && !model.importError; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    rerenderApp(model);

    const video = document.querySelector('video') as HTMLVideoElement | null;
    expect(showOpenFilePicker).toHaveBeenCalledTimes(1);
    expect(mediaHandle.getFile).toHaveBeenCalledTimes(1);
    expect(model.importError).toBeNull();
    expect(model.currentMedia?.originalPath).toBe('browser-file-handle:picker-clip.webm');
    expect(video?.src).toBe('blob:persistent-picker-video');
    expect(document.getElementById('app')?.textContent).toContain('No transcript loaded yet');
  });

  it('shows a relink prompt when a hydrated handle-sourced media has no active object URL', () => {
    const model = createAppModel();
    const store = model.store;
    const asset = makeMediaAsset({
      title: 'relinked-clip',
      originalPath: 'browser-file-handle:relinked-clip.webm',
      contentSha256: 'sha256:deadbeef',
      durationMs: 5000,
      container: 'video/webm',
      sizeBytes: 1024,
      privacyLabel: 'owned',
    });
    store.putMediaAsset(asset);
    model.currentMedia = asset;
    model.browserLocalMedia = { objectUrl: null, sourceLabel: 'browser-file-handle:relinked-clip.webm', handleName: 'relinked-clip.webm' };
    model.view = 'player';

    rerenderApp(model);

    const video = document.querySelector('video') as HTMLVideoElement | null;
    const app = document.getElementById('app')!;
    expect(video).toBeNull();
    expect(app.textContent).toContain('Relink media');
    expect(app.textContent).toContain('relinked-clip.webm');
    const relinkButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Relink media');
    expect(relinkButton).toBeTruthy();
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

  it('offers a File System Access save-file picker for export when supported and verifies writeback integrity', async () => {
    const model = createAppModel();
    model.view = 'export-import';
    const createObjectURL = vi.fn(() => 'blob:export-download');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    let savedText: string | null = null;
    const writable = {
      write: vi.fn(async (data: unknown) => {
        savedText = typeof data === 'string' ? data : String(data);
      }),
      close: vi.fn(async () => undefined),
    };
    const handle = {
      createWritable: vi.fn(async () => writable),
      getFile: vi.fn(async () => new dom.window.File([savedText ?? ''], 'lingotorte-export.json', { type: 'application/json' })),
    };
    const showSaveFilePicker = vi.fn(async () => handle);
    Object.defineProperty(globalThis, 'showSaveFilePicker', { configurable: true, value: showSaveFilePicker });

    rerenderApp(model);
    const generateBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Generate local export');
    expect(generateBtn).toBeTruthy();
    generateBtn!.click();
    rerenderApp(model);

    const saveBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Save export to chosen file');
    expect(saveBtn).toBeTruthy();
    saveBtn!.click();
    for (let i = 0; i < 10 && !model.exportImport.lastError && model.exportImport.lastExport !== null && !savedText; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    rerenderApp(model);

    expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(handle.createWritable).toHaveBeenCalledTimes(1);
    expect(writable.write).toHaveBeenCalledTimes(1);
    expect(writable.close).toHaveBeenCalledTimes(1);
    expect(savedText).not.toBeNull();
    expect(savedText).toContain('"schemaVersion"');
    expect(model.exportImport.lastError).toBeNull();
    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('Verified');
  });
});
