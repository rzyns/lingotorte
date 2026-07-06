import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { connectLocalService, createAppModel, importFixtureMediaAndSubtitles, importBrowserLocalFiles, importBrowserLocalFileHandles, saveSentenceFromCue, learnerProgress, restoreBrowserMediaHandle } from '../../apps/web/src/model';
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
    delete (globalThis as { lingotorteHandleStore?: unknown }).lingotorteHandleStore;
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
    model.browserLocalMedia = { objectUrl: null, sourceLabel: 'browser-file-handle:relinked-clip.webm', handleName: 'relinked-clip.webm', permissionState: 'unknown', lastError: null };
    model.view = 'player';

    rerenderApp(model);

    const video = document.querySelector('video') as HTMLVideoElement | null;
    const app = document.getElementById('app')!;
    expect(video).toBeNull();
    expect(app.textContent).toContain('Relink media');
    expect(app.textContent).toContain('relinked-clip.webm');
    expect(app.textContent).toContain('Browser permission: unknown');
    const relinkButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Relink media');
    expect(relinkButton).toBeTruthy();
    const chooseAgainButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Choose media again');
    expect(chooseAgainButton).toBeTruthy();
  });

  it('persists and restores a browser file handle through IndexedDB on reload', async () => {
    const model = createAppModel();
    const createObjectURL = vi.fn(() => 'blob:restored-handle-video');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const mediaFile = new dom.window.File([new Uint8Array([7, 6, 5])], 'persisted-clip.webm', { type: 'video/webm' });
    const mediaHandle = { name: 'persisted-clip.webm', getFile: vi.fn(async () => mediaFile), requestPermission: vi.fn(async () => 'granted') };
    const showOpenFilePicker = vi.fn(async () => [mediaHandle]);
    Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: showOpenFilePicker });

    // Mock IndexedDB handle store (flat get/put interface)
    const idbStore = new Map<string, unknown>();
    const mockHandleStore = {
      open: vi.fn(async () => ({
        get: vi.fn(async (key: string) => idbStore.get(key)),
        put: vi.fn(async (value: unknown, key: string) => { idbStore.set(key, value); }),
      })),
    };
    Object.defineProperty(globalThis, 'lingotorteHandleStore', { configurable: true, value: mockHandleStore });

    model.view = 'library';
    rerenderApp(model);
    const persistentButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Import persistent media handle');
    expect(persistentButton).toBeTruthy();
    persistentButton!.click();
    for (let i = 0; i < 10 && !model.currentMedia && !model.importError; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    rerenderApp(model);

    expect(model.currentMedia?.originalPath).toBe('browser-file-handle:persisted-clip.webm');
    expect(model.browserLocalMedia.handleName).toBe('persisted-clip.webm');

    // Simulate reload: create fresh model, hydrate from stored handle
    const restoredModel = createAppModel();
    const asset = makeMediaAsset({
      title: 'persisted-clip',
      originalPath: 'browser-file-handle:persisted-clip.webm',
      contentSha256: 'sha256:abc123',
      durationMs: 1000,
      container: 'video/webm',
      sizeBytes: 3,
      privacyLabel: 'owned',
    });
    restoredModel.store.putMediaAsset(asset);
    restoredModel.currentMedia = asset;
    restoredModel.browserLocalMedia = { objectUrl: null, sourceLabel: 'browser-file-handle:persisted-clip.webm', handleName: 'persisted-clip.webm', permissionState: 'unknown', lastError: null };
    restoredModel.view = 'player';

    // Call the restore function
    await restoreBrowserMediaHandle(restoredModel);
    rerenderApp(restoredModel);

    const video = document.querySelector('video') as HTMLVideoElement | null;
    expect(mediaHandle.requestPermission).toHaveBeenCalledWith({ mode: 'read' });
    expect(mediaHandle.getFile).toHaveBeenCalledTimes(2); // once on import, once on restore
    expect(createObjectURL).toHaveBeenCalledTimes(2); // once on import, once on restore
    expect(restoredModel.browserLocalMedia.objectUrl).toBe('blob:restored-handle-video');
    expect(restoredModel.browserLocalMedia.permissionState).toBe('granted');
    expect(video?.src).toBe('blob:restored-handle-video');
  });

  it('records denied browser handle permission and explains the regrant path', async () => {
    const model = createAppModel();
    const mediaHandle = {
      name: 'denied-clip.webm',
      getFile: vi.fn(async () => new dom.window.File([new Uint8Array([1])], 'denied-clip.webm', { type: 'video/webm' })),
      queryPermission: vi.fn(async () => 'denied'),
      requestPermission: vi.fn(async () => 'denied'),
    };
    const idbStore = new Map<string, unknown>([['current-media-handle', mediaHandle]]);
    Object.defineProperty(globalThis, 'lingotorteHandleStore', {
      configurable: true,
      value: { open: vi.fn(async () => ({ get: vi.fn(async (key: string) => idbStore.get(key)), put: vi.fn() })) },
    });
    const asset = makeMediaAsset({
      title: 'denied-clip',
      originalPath: 'browser-file-handle:denied-clip.webm',
      contentSha256: 'sha256:denied',
      durationMs: 1000,
      container: 'video/webm',
      sizeBytes: 1,
      privacyLabel: 'owned',
    });
    model.store.putMediaAsset(asset);
    model.currentMedia = asset;
    model.browserLocalMedia = { objectUrl: null, sourceLabel: 'browser-file-handle:denied-clip.webm', handleName: 'denied-clip.webm', permissionState: 'unknown', lastError: null };

    const restored = await restoreBrowserMediaHandle(model);
    rerenderApp(model);

    expect(restored).toBe(false);
    expect(mediaHandle.getFile).not.toHaveBeenCalled();
    expect(model.browserLocalMedia.permissionState).toBe('denied');
    expect(document.getElementById('app')?.textContent).toContain('Browser permission: denied');
    expect(document.getElementById('app')?.textContent).toContain('Regrant the saved handle');
  });

  it('reports a clear error when the saved browser handle is missing from the store', async () => {
    const model = createAppModel();
    const idbStore = new Map<string, unknown>();
    Object.defineProperty(globalThis, 'lingotorteHandleStore', {
      configurable: true,
      value: { open: vi.fn(async () => ({ get: vi.fn(async (key: string) => idbStore.get(key)), put: vi.fn() })) },
    });
    const asset = makeMediaAsset({
      title: 'missing-handle-clip',
      originalPath: 'browser-file-handle:missing-handle-clip.webm',
      contentSha256: 'sha256:missing',
      durationMs: 1000,
      container: 'video/webm',
      sizeBytes: 1,
      privacyLabel: 'owned',
    });
    model.store.putMediaAsset(asset);
    model.currentMedia = asset;
    model.browserLocalMedia = { objectUrl: null, sourceLabel: 'browser-file-handle:missing-handle-clip.webm', handleName: 'missing-handle-clip.webm', permissionState: 'unknown', lastError: null };

    const restored = await restoreBrowserMediaHandle(model);
    rerenderApp(model);

    expect(restored).toBe(false);
    expect(model.browserLocalMedia.permissionState).toBe('unknown');
    expect(model.browserLocalMedia.lastError).toContain('No saved browser handle found');
    expect(model.browserLocalMedia.lastError).toContain('missing-handle-clip.webm');
    expect(document.getElementById('app')?.textContent).toContain('Relink media');
  });

  it('reports a clear error when browser handle storage is unavailable', async () => {
    const model = createAppModel();
    // No lingotorteHandleStore set — simulates no IndexedDB
    const asset = makeMediaAsset({
      title: 'no-store-clip',
      originalPath: 'browser-file-handle:no-store-clip.webm',
      contentSha256: 'sha256:nostore',
      durationMs: 1000,
      container: 'video/webm',
      sizeBytes: 1,
      privacyLabel: 'owned',
    });
    model.store.putMediaAsset(asset);
    model.currentMedia = asset;
    model.browserLocalMedia = { objectUrl: null, sourceLabel: 'browser-file-handle:no-store-clip.webm', handleName: 'no-store-clip.webm', permissionState: 'unknown', lastError: null };

    const restored = await restoreBrowserMediaHandle(model);
    rerenderApp(model);

    expect(restored).toBe(false);
    expect(model.browserLocalMedia.permissionState).toBe('unavailable');
    expect(model.browserLocalMedia.lastError).toContain('handle storage is unavailable');
    expect(document.getElementById('app')?.textContent).toContain('Relink media');
  });

  it('detects a stale stored handle whose name does not match the current media', async () => {
    const model = createAppModel();
    const staleHandle = {
      name: 'old-clip.webm',
      getFile: vi.fn(async () => new dom.window.File([new Uint8Array([1])], 'old-clip.webm', { type: 'video/webm' })),
      queryPermission: vi.fn(async () => 'granted'),
    };
    const idbStore = new Map<string, unknown>([['current-media-handle', staleHandle]]);
    Object.defineProperty(globalThis, 'lingotorteHandleStore', {
      configurable: true,
      value: { open: vi.fn(async () => ({ get: vi.fn(async (key: string) => idbStore.get(key)), put: vi.fn() })) },
    });
    const asset = makeMediaAsset({
      title: 'current-clip',
      originalPath: 'browser-file-handle:current-clip.webm',
      contentSha256: 'sha256:current',
      durationMs: 1000,
      container: 'video/webm',
      sizeBytes: 1,
      privacyLabel: 'owned',
    });
    model.store.putMediaAsset(asset);
    model.currentMedia = asset;
    model.browserLocalMedia = { objectUrl: null, sourceLabel: 'browser-file-handle:current-clip.webm', handleName: 'current-clip.webm', permissionState: 'unknown', lastError: null };

    const restored = await restoreBrowserMediaHandle(model);
    rerenderApp(model);

    expect(restored).toBe(false);
    expect(staleHandle.getFile).not.toHaveBeenCalled();
    expect(model.browserLocalMedia.permissionState).toBe('error');
    expect(model.browserLocalMedia.lastError).toContain('old-clip.webm');
    expect(model.browserLocalMedia.lastError).toContain('current-clip.webm');
    expect(document.getElementById('app')?.textContent).toContain('Relink media');
  });

  it('shows the local-service absolute-path boundary note in the relink placeholder', () => {
    const model = createAppModel();
    const store = model.store;
    const asset = makeMediaAsset({
      title: 'boundary-clip',
      originalPath: 'browser-file-handle:boundary-clip.webm',
      contentSha256: 'sha256:boundary',
      durationMs: 5000,
      container: 'video/webm',
      sizeBytes: 1024,
      privacyLabel: 'owned',
    });
    store.putMediaAsset(asset);
    model.currentMedia = asset;
    model.browserLocalMedia = { objectUrl: null, sourceLabel: 'browser-file-handle:boundary-clip.webm', handleName: 'boundary-clip.webm', permissionState: 'unknown', lastError: null };
    model.view = 'player';

    rerenderApp(model);

    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('Relink media');
    expect(app.textContent).toContain('playback and relink identity only');
    expect(app.textContent).toContain('absolute owned local media path');
  });

  it('restores a persisted browser media handle after loading local-service durable state', async () => {
    const model = createAppModel();
    const sourceModel = createAppModel();
    const asset = makeMediaAsset({
      title: 'service-clip',
      originalPath: 'browser-file-handle:service-clip.webm',
      contentSha256: 'sha256:service',
      durationMs: 1000,
      container: 'video/webm',
      sizeBytes: 1,
      privacyLabel: 'owned',
    });
    sourceModel.store.putMediaAsset(asset);
    const mediaFile = new dom.window.File([new Uint8Array([5])], 'service-clip.webm', { type: 'video/webm' });
    const mediaHandle = { name: 'service-clip.webm', getFile: vi.fn(async () => mediaFile), queryPermission: vi.fn(async () => 'granted') };
    const createObjectURL = vi.fn(() => 'blob:service-restored-video');
    Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    const idbStore = new Map<string, unknown>([['current-media-handle', mediaHandle]]);
    Object.defineProperty(globalThis, 'lingotorteHandleStore', {
      configurable: true,
      value: { open: vi.fn(async () => ({ get: vi.fn(async (key: string) => idbStore.get(key)), put: vi.fn() })) },
    });
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (url: string) => ({
        ok: true,
        json: async () => url.endsWith('/api/state')
          ? { ok: true, snapshot: sourceModel.store.snapshot() }
          : { ok: true, status: 'ok' },
      })),
    });

    try {
      const result = await connectLocalService(model, 'http://127.0.0.1:5174');

      expect(result.ok).toBe(true);
      expect(model.currentMedia?.originalPath).toBe('browser-file-handle:service-clip.webm');
      expect(model.browserLocalMedia.objectUrl).toBe('blob:service-restored-video');
      expect(model.browserLocalMedia.permissionState).toBe('granted');
      expect(model.localService.lastMessage).toContain('restored the browser media handle');
      expect(mediaHandle.getFile).toHaveBeenCalledTimes(1);
      expect(createObjectURL).toHaveBeenCalledWith(mediaFile);
    } finally {
      Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    }
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
    model.view = 'library';
    rerenderApp(model);
    expect(document.getElementById('app')?.textContent).toContain('Browser handles and blob URLs are playback-only');
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

  it('shows learner progress counts in the study cockpit status rail', async () => {
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    const firstCue = model.cues[0]!;
    await saveSentenceFromCue(model, firstCue);

    const progress = learnerProgress(model, new Date('2026-07-04T09:00:00.000Z'));
    expect(progress.savedItems).toBe(1);
    expect(progress.reviewCards).toBe(0);
    expect(progress.dueCards).toBe(0);
    expect(progress.totalReviews).toBe(0);
    expect(progress.practiceAttempts).toBe(0);

    model.view = 'player';
    rerenderApp(model);
    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('1 saved');
  });

  it('surfaces metadata-only export and restore schema/integrity copy without stale preview state', () => {
    const model = createAppModel();
    model.view = 'export-import';
    rerenderApp(model);

    const generateBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Generate local export');
    expect(generateBtn).toBeTruthy();
    generateBtn!.click();

    let app = document.getElementById('app')!;
    expect(app.textContent).toContain('Metadata backup v1 ready');
    expect(app.textContent).toContain('no media files copied');
    expect(app.textContent).toContain('Schema');
    expect(app.textContent).toContain('lingotorte.learner-export.v1');
    expect(app.textContent).toContain('App version');
    expect(app.textContent).toContain(model.exportImport.lastExport!.applicationVersion);
    expect(app.textContent).toContain('Integrity root hash');
    expect(app.textContent).toContain('browser downloads are not read back');
    expect(app.textContent).not.toContain('Verified:');

    const manifestJson = model.exportImport.lastExport!.manifestJson;
    const importTextarea = document.querySelector('#import-manifest') as HTMLTextAreaElement | null;
    expect(importTextarea).toBeTruthy();
    importTextarea!.value = manifestJson;
    const previewBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Preview restore');
    expect(previewBtn).toBeTruthy();
    previewBtn!.click();

    app = document.getElementById('app')!;
    expect(app.textContent).toContain('Restore preview');
    expect(app.textContent).toContain('Metadata-only restore preview');
    expect(app.textContent).toContain('no media files are copied or restored');
    expect(app.textContent).toContain('Integrity records');
    expect(app.textContent).toContain('Manifest integrity verified');

    const badTextarea = document.querySelector('#import-manifest') as HTMLTextAreaElement | null;
    expect(badTextarea).toBeTruthy();
    badTextarea!.value = '{"schemaVersion":"unsupported.v2"}';
    const badPreviewBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Preview restore');
    expect(badPreviewBtn).toBeTruthy();
    badPreviewBtn!.click();

    app = document.getElementById('app')!;
    expect(app.textContent).not.toContain('Restore preview');
    expect(app.textContent).toContain('Unsupported learner export schema version');
    expect(model.exportImport.preview).toBeNull();
    expect(model.exportImport.confirmOverwrite).toBe(false);
    expect(model.exportImport.confirmReplace).toBe(false);
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
    expect(app.textContent).toContain('JSON backup file only');
  });

  it('shows a post-restore receipt with mode, integrity, counts, and no-media note after merge restore', () => {
    const model = createAppModel();
    model.view = 'export-import';
    rerenderApp(model);

    // Generate an export from an empty store
    const generateBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Generate local export');
    generateBtn!.click();
    const manifestJson = model.exportImport.lastExport!.manifestJson;

    // Preview the restore (empty local state => safe to restore, no conflict)
    const importTextarea = document.querySelector('#import-manifest') as HTMLTextAreaElement | null;
    importTextarea!.value = manifestJson;
    const previewBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Preview restore');
    previewBtn!.click();
    rerenderApp(model);

    // Acknowledge privacy warnings
    const warningCheckboxes = document.querySelectorAll('input[name="restore-warning"]') as NodeListOf<HTMLInputElement>;
    for (const cb of warningCheckboxes) {
      cb.checked = true;
      cb.dispatchEvent(new dom.window.Event('change'));
    }
    rerenderApp(model);

    // No local data => no conflict, so a single confirm checkbox appears
    const confirmCheckbox = document.querySelector('#restore-confirm') as HTMLInputElement | null;
    if (confirmCheckbox) {
      confirmCheckbox.checked = true;
      confirmCheckbox.dispatchEvent(new dom.window.Event('change'));
      rerenderApp(model);
    }

    const restoreBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Restore now') as HTMLButtonElement | null;
    expect(restoreBtn).toBeTruthy();
    expect(restoreBtn!.disabled).toBe(false);
    restoreBtn!.click();
    rerenderApp(model);

    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('Restore complete');
    expect(app.textContent).toContain('Mode:');
    expect(app.textContent).toContain('Initial import');
    expect(app.textContent).toContain('Manifest integrity verified');
    expect(app.textContent).toContain('does not verify the browser file write');
    expect(app.textContent).toContain('Operation counts');
    expect(app.textContent).toContain('No media files were copied or restored');
    expect(model.exportImport.lastRestore).not.toBeNull();
    expect(model.exportImport.lastRestore!.mode).toBe('initial');
    expect(model.exportImport.lastRestore!.mediaCopied).toBe(false);
    expect(model.exportImport.preview).toBeNull();
  });

  it('shows a destructive-mode receipt after Replace-all restore with synthetic isolated state', async () => {
    // Source model: import fixture, save a sentence, export
    const sourceModel = createAppModel();
    await importFixtureMediaAndSubtitles(
      sourceModel,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    await saveSentenceFromCue(sourceModel, sourceModel.cues[0]!);
    sourceModel.view = 'export-import';
    rerenderApp(sourceModel);
    const generateBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Generate local export');
    generateBtn!.click();
    const manifestJson = sourceModel.exportImport.lastExport!.manifestJson;

    // Target model: import fixture, save a DIFFERENT sentence so local state exists
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(
      model,
      'fixtures/media/synthetic-polish-dialogue.webm',
      'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
      'fixtures/subtitles/synthetic-polish-dialogue.native.srt',
    );
    await saveSentenceFromCue(model, model.cues[1]!);
    model.view = 'export-import';
    rerenderApp(model);

    const importTextarea = document.querySelector('#import-manifest') as HTMLTextAreaElement | null;
    importTextarea!.value = manifestJson;
    const previewBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Preview restore');
    previewBtn!.click();
    rerenderApp(model);

    // Acknowledge warnings
    const warningCheckboxes = document.querySelectorAll('input[name="restore-warning"]') as NodeListOf<HTMLInputElement>;
    for (const cb of warningCheckboxes) {
      cb.checked = true;
      cb.dispatchEvent(new dom.window.Event('change'));
    }
    rerenderApp(model);

    // Select Replace all
    const replaceCheckbox = document.querySelector('#restore-confirm-replace') as HTMLInputElement | null;
    expect(replaceCheckbox).toBeTruthy();
    replaceCheckbox!.checked = true;
    replaceCheckbox!.dispatchEvent(new dom.window.Event('change'));
    rerenderApp(model);

    const restoreBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Restore now') as HTMLButtonElement | null;
    expect(restoreBtn!.disabled).toBe(false);
    restoreBtn!.click();
    rerenderApp(model);

    const app = document.getElementById('app')!;
    expect(app.textContent).toContain('Restore complete');
    expect(app.textContent).toContain('Replace all (destructive');
    expect(app.textContent).toContain('cannot be undone');
    expect(app.textContent).toContain('No media files were copied or restored');
    expect(model.exportImport.lastRestore!.mode).toBe('replace-all');
  });
});
