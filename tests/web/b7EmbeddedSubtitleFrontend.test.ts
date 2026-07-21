import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeMediaAsset } from '@lingotorte/domain';
import {
  approveTranscriptTrack,
  createAppModel,
  createCorrectedTranscriptVersion,
  exportLearnerState,
  extractSelectedEmbeddedSubtitleDraft,
  listEmbeddedSubtitleTracksFromService,
  setEmbeddedSubtitleMediaPath,
} from '../../apps/web/src/model';
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
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  return dom;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(predicate()).toBe(true);
}

function ownedMedia() {
  return makeMediaAsset({
    title: 'Synthetic owned clip',
    originalPath: 'browser-file-handle:synthetic-owned.mkv',
    contentSha256: 'sha256:7777777777777777777777777777777777777777777777777777777777777777',
    durationMs: 8000,
    container: 'mkv',
    sizeBytes: 1234,
    privacyLabel: 'owned',
  });
}

function button(label: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent === label);
  expect(match, `missing button ${label}`).toBeTruthy();
  return match as HTMLButtonElement;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function prepareExtractionModel(mediaPath = '/synthetic/extract-owned.mkv') {
  const model = createAppModel();
  model.localService.status = 'connected';
  const media = ownedMedia();
  model.store.putMediaAsset(media);
  model.currentMedia = media;
  model.transcriptLifecycle.embeddedSubtitle = {
    mediaPath, language: 'pl', listingStatus: 'ready', extractionStatus: 'idle',
    tracks: [{ streamIndex: 2, codecName: 'subrip', codecKind: 'subrip', isSupported: true }],
    selectedStreamIndex: 2, statusMessage: null, errorCode: null,
  };
  return model;
}

function validExtractionResult(overrides: Record<string, unknown> = {}) {
  return {
    extract: { effect: 'embedded-subtitle-extracted', outputPath: '[local-scratch]', outputFormat: 'srt', streamIndex: 2 },
    track: {
      role: 'target', format: 'srt', transcriptStatus: 'draft', transcriptSourceKind: 'user-subtitle-file', cueCount: 1,
      provenance: { warningFlags: ['timingUnverified', 'qualityUnreviewed'] },
    },
    cues: [{ cueIndex: 1, startMs: 1000, endMs: 2000, text: 'Syntetyczna kwestia.' }],
    ...overrides,
  };
}

describe('B7 embedded subtitle transcript lifecycle UI', () => {
  let dom: Awaited<ReturnType<typeof setupDom>>;
  let previousFetch: typeof globalThis.fetch | undefined;

  beforeEach(async () => {
    previousFetch = globalThis.fetch;
    dom = await setupDom();
  });

  afterEach(() => {
    if (previousFetch) globalThis.fetch = previousFetch;
    else delete (globalThis as Partial<typeof globalThis>).fetch;
    dom.window.close();
  });

  it.each(['', 'relative/movie.mkv', 'blob:synthetic', 'browser-file-handle:synthetic.mkv', 'https://example.invalid/movie.mkv', '~'])('rejects non-absolute embedded media path %j before fetch', async (mediaPath) => {
    const model = createAppModel();
    model.view = 'library';
    model.localService.status = 'connected';
    model.currentMedia = ownedMedia();
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return jsonResponse({ ok: false }, 500);
    }) as typeof fetch;

    rerenderApp(model);
    const pathInput = document.querySelector('input[name="embedded-subtitle-media-path"]') as HTMLInputElement;
    expect(pathInput).toBeTruthy();
    pathInput.value = mediaPath;
    pathInput.dispatchEvent(new dom.window.Event('input'));
    button('List embedded subtitle tracks').click();
    await waitFor(() => document.body.textContent?.includes('An explicit absolute owned local media path is required. Browser blob and handle labels do not qualify.') === true);
    expect(fetchCalls).toBe(0);
  });

  it('shows a distinct unreachable-service state and an exact zero-track state', async () => {
    const disconnected = createAppModel();
    disconnected.view = 'library';
    disconnected.currentMedia = ownedMedia();
    rerenderApp(disconnected);
    button('List embedded subtitle tracks').click();
    await waitFor(() => document.body.textContent?.includes('Local service unreachable. Connect the loopback service and retry.') === true);

    const model = createAppModel();
    model.view = 'library';
    model.localService.status = 'connected';
    model.currentMedia = ownedMedia();
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ ok: true, job: { id: 'list-empty' } }, 201);
      if (String(input).endsWith('/api/jobs/list-empty')) {
        return jsonResponse({ ok: true, job: { status: 'completed', result: { listing: { effect: 'embedded-subtitles-listed', streamCount: 0, supportedCount: 0, tracks: [] } } } });
      }
      return jsonResponse({ ok: false, error: 'unexpected' }, 500);
    }) as typeof fetch;
    rerenderApp(model);
    const pathInput = document.querySelector('input[name="embedded-subtitle-media-path"]') as HTMLInputElement;
    pathInput.value = '/synthetic/owned-empty.mkv';
    pathInput.dispatchEvent(new dom.window.Event('input'));
    button('List embedded subtitle tracks').click();
    await waitFor(() => document.body.textContent?.includes('No embedded subtitle tracks found.') === true);
  });

  it('normalizes an actually unreachable configured loopback service without exposing fetch details', async () => {
    const model = createAppModel();
    model.localService.status = 'connected';
    model.transcriptLifecycle.embeddedSubtitle.mediaPath = '/synthetic/unreachable-owned.mkv';
    globalThis.fetch = (async () => { throw new TypeError('fetch failed ECONNREFUSED 127.0.0.1'); }) as typeof fetch;

    await expect(listEmbeddedSubtitleTracksFromService(model, { pollAttempts: 1, pollDelayMs: 0 })).rejects.toThrow(
      'Local service unreachable. Connect the loopback service and retry.',
    );
    expect(model.transcriptLifecycle.embeddedSubtitle.statusMessage).toBe('Local service unreachable. Connect the loopback service and retry.');
  });

  it('polls queued and running list jobs through to a strictly decoded completion', async () => {
    const model = createAppModel();
    model.localService.status = 'connected';
    model.transcriptLifecycle.embeddedSubtitle.mediaPath = '/synthetic/polling-owned.mkv';
    let polls = 0;
    const waits: number[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ ok: true, job: { id: 'poll-list' } }, 201);
      polls += 1;
      if (polls === 1) return jsonResponse({ ok: true, job: { status: 'queued' } });
      if (polls === 2) return jsonResponse({ ok: true, job: { status: 'running' } });
      return jsonResponse({ ok: true, job: { status: 'completed', result: { listing: {
        effect: 'embedded-subtitles-listed', streamCount: 1, supportedCount: 1,
        tracks: [{ streamIndex: 3, codecName: 'webvtt', codecKind: 'webvtt', isSupported: true }],
      } } } });
    }) as typeof fetch;

    const tracks = await listEmbeddedSubtitleTracksFromService(model, {
      pollAttempts: 3,
      pollDelayMs: 7,
      sleep: async (ms) => { waits.push(ms); },
    });
    expect(tracks).toHaveLength(1);
    expect(polls).toBe(3);
    expect(waits).toEqual([7, 7]);
  });

  it('ignores an in-flight listing completion after the embedded media path changes', async () => {
    const model = createAppModel();
    model.localService.status = 'connected';
    setEmbeddedSubtitleMediaPath(model, '/owned/old.mkv');
    const pendingPoll = deferred<Response>();
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ ok: true, job: { id: 'old-list' } }, 201);
      return pendingPoll.promise;
    }) as typeof fetch;

    const listing = listEmbeddedSubtitleTracksFromService(model, { pollAttempts: 1, pollDelayMs: 0 });
    await waitFor(() => model.transcriptLifecycle.embeddedSubtitle.listingStatus === 'listing');
    setEmbeddedSubtitleMediaPath(model, '/owned/new.mkv');
    pendingPoll.resolve(jsonResponse({ ok: true, job: { status: 'completed', result: { listing: {
      effect: 'embedded-subtitles-listed', streamCount: 1, supportedCount: 1,
      tracks: [{ streamIndex: 7, codecName: 'subrip', codecKind: 'subrip', isSupported: true }],
    } } } }));

    await expect(listing).rejects.toThrow('Embedded subtitle operation was superseded by a media context change.');
    expect(model.transcriptLifecycle.embeddedSubtitle).toMatchObject({
      mediaPath: '/owned/new.mkv', listingStatus: 'idle', tracks: [], selectedStreamIndex: null,
      statusMessage: null, errorCode: null,
    });
  });

  it('ignores an in-flight listing failure after the embedded media path changes', async () => {
    const model = createAppModel();
    model.localService.status = 'connected';
    setEmbeddedSubtitleMediaPath(model, '/owned/old.mkv');
    const pendingPoll = deferred<Response>();
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
      ? jsonResponse({ ok: true, job: { id: 'old-list-failure' } }, 201)
      : pendingPoll.promise) as typeof fetch;

    const listing = listEmbeddedSubtitleTracksFromService(model, { pollAttempts: 1, pollDelayMs: 0 });
    await waitFor(() => model.transcriptLifecycle.embeddedSubtitle.listingStatus === 'listing');
    setEmbeddedSubtitleMediaPath(model, '/owned/new.mkv');
    pendingPoll.resolve(jsonResponse({ ok: true, job: { status: 'failed', message: 'old listing failed' } }));

    await expect(listing).rejects.toThrow('Embedded subtitle operation was superseded by a media context change.');
    expect(model.transcriptLifecycle.embeddedSubtitle).toMatchObject({
      mediaPath: '/owned/new.mkv', listingStatus: 'idle', tracks: [], selectedStreamIndex: null,
      statusMessage: null, errorCode: null,
    });
  });

  it.each([
    ['failed', 'ffprobe failed for /private/list-sentinel.mkv', 'ffprobe failed for [local-path]'],
    ['cancelled', 'status cancelled', 'status cancelled'],
  ])('reports an explicit path-safe %s listing job state', async (status, message, safeMessage) => {
    const model = createAppModel();
    model.localService.status = 'connected';
    setEmbeddedSubtitleMediaPath(model, '/private/list-sentinel.mkv');
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
      ? jsonResponse({ ok: true, job: { id: `${status}-list` } }, 201)
      : jsonResponse({ ok: true, job: { status, ...(status === 'failed' ? { message } : {}) } })) as typeof fetch;
    await expect(listEmbeddedSubtitleTracksFromService(model, { pollAttempts: 1, pollDelayMs: 0 })).rejects.toThrow(safeMessage);
    expect(model.transcriptLifecycle.embeddedSubtitle).toMatchObject({ listingStatus: 'failed', errorCode: 'listing-failed' });
    expect(model.transcriptLifecycle.embeddedSubtitle.statusMessage).not.toContain('/private/list-sentinel.mkv');
  });

  it('reports an explicit bounded polling deadline', async () => {
    const model = createAppModel();
    model.localService.status = 'connected';
    setEmbeddedSubtitleMediaPath(model, '/private/deadline-sentinel.mkv');
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
      ? jsonResponse({ ok: true, job: { id: 'deadline-list' } }, 201)
      : jsonResponse({ ok: true, job: { status: 'running' } })) as typeof fetch;
    await expect(listEmbeddedSubtitleTracksFromService(model, { pollAttempts: 2, pollDelayMs: 0 })).rejects.toThrow(
      'embedded subtitle listing job did not finish before the polling deadline.',
    );
    expect(model.transcriptLifecycle.embeddedSubtitle.listingStatus).toBe('failed');
  });

  it('ignores an in-flight extraction after its path and current-media context change', async () => {
    const model = prepareExtractionModel('/owned/old.mkv');
    const originalMediaId = model.currentMedia!.id;
    const pendingPoll = deferred<Response>();
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
      ? jsonResponse({ ok: true, job: { id: 'old-extract' } }, 201)
      : pendingPoll.promise) as typeof fetch;
    const extraction = extractSelectedEmbeddedSubtitleDraft(model, { pollAttempts: 1, pollDelayMs: 0 });
    await waitFor(() => model.transcriptLifecycle.embeddedSubtitle.extractionStatus === 'extracting');
    setEmbeddedSubtitleMediaPath(model, '/owned/new.mkv');
    model.currentMedia = { ...ownedMedia(), id: 'media:new-context' };
    pendingPoll.resolve(jsonResponse({ ok: true, job: { status: 'completed', result: validExtractionResult() } }));
    await expect(extraction).rejects.toThrow('Embedded subtitle operation was superseded by a media context change.');
    expect(model.targetTrackId).toBeNull();
    expect(model.cues).toHaveLength(0);
    expect(model.store.listSubtitleTracksForMedia(originalMediaId)).toHaveLength(0);
    expect(model.transcriptLifecycle.embeddedSubtitle).toMatchObject({ mediaPath: '/owned/new.mkv', extractionStatus: 'idle' });
  });

  it('ignores an in-flight extraction failure after the current-media context changes', async () => {
    const model = prepareExtractionModel('/owned/current.mkv');
    const pendingPoll = deferred<Response>();
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
      ? jsonResponse({ ok: true, job: { id: 'old-extract-failure' } }, 201)
      : pendingPoll.promise) as typeof fetch;

    const extraction = extractSelectedEmbeddedSubtitleDraft(model, { pollAttempts: 1, pollDelayMs: 0 });
    await waitFor(() => model.transcriptLifecycle.embeddedSubtitle.extractionStatus === 'extracting');
    model.currentMedia = { ...ownedMedia(), id: 'media:new-context' };
    const currentState = { ...model.transcriptLifecycle.embeddedSubtitle };
    pendingPoll.resolve(jsonResponse({ ok: true, job: { status: 'failed', message: 'old extraction failed' } }));

    await expect(extraction).rejects.toThrow('Embedded subtitle operation was superseded by a media context change.');
    expect(model.transcriptLifecycle.embeddedSubtitle).toEqual(currentState);
    expect(model.targetTrackId).toBeNull();
    expect(model.cues).toHaveLength(0);
  });

  it.each([
    ['empty cues', { cues: [], track: { ...validExtractionResult().track, cueCount: 0 } }],
    ['non-draft track', { track: { ...validExtractionResult().track, transcriptStatus: 'approved' } }],
    ['stream mismatch', { extract: { ...validExtractionResult().extract, streamIndex: 9 } }],
    ['format mismatch', { extract: { ...validExtractionResult().extract, outputFormat: 'vtt' } }],
    ['missing warning flags', { track: { ...validExtractionResult().track, provenance: { warningFlags: ['timingUnverified'] } } }],
  ])('fails closed for completed extraction with %s', async (_label, overrides) => {
    const model = prepareExtractionModel();
    const priorSnapshot = JSON.stringify(model.store.snapshot());
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
      ? jsonResponse({ ok: true, job: { id: 'invalid-extract' } }, 201)
      : jsonResponse({ ok: true, job: { status: 'completed', result: validExtractionResult(overrides) } })) as typeof fetch;
    await expect(extractSelectedEmbeddedSubtitleDraft(model, { pollAttempts: 1, pollDelayMs: 0 })).rejects.toThrow(
      'Extracted subtitle data could not be imported as a draft.',
    );
    expect(model.targetTrackId).toBeNull();
    expect(model.cues).toHaveLength(0);
    expect(JSON.stringify(model.store.snapshot())).toBe(priorSnapshot);
  });

  it('keeps the private path out of persistence/export and re-enables learner save only after correction and approval', async () => {
    const privatePath = '/private/import-export-sentinel.mkv';
    const model = prepareExtractionModel(privatePath);
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
      ? jsonResponse({ ok: true, job: { id: 'valid-extract' } }, 201)
      : jsonResponse({ ok: true, job: { status: 'completed', result: validExtractionResult() } })) as typeof fetch;
    await extractSelectedEmbeddedSubtitleDraft(model, { pollAttempts: 1, pollDelayMs: 0 });
    const draftId = model.targetTrackId!;
    model.view = 'player';
    rerenderApp(model);
    expect(button('Save sentence').disabled).toBe(true);
    const corrected = await createCorrectedTranscriptVersion(model, draftId, [{ cueId: model.cues[0]!.id, text: 'Poprawiona kwestia.' }]);
    approveTranscriptTrack(model, corrected.track.id);
    rerenderApp(model);
    expect(button('Save sentence').disabled).toBe(false);
    expect(JSON.stringify(model.store.snapshot())).not.toContain(privatePath);
    expect(exportLearnerState(model).manifestJson).not.toContain(privatePath);
  });

  it('routes list and extraction requests only through the configured loopback base URL', async () => {
    const model = prepareExtractionModel('/owned/routing.mkv');
    model.localService.baseUrl = 'http://127.0.0.1:49174/custom/';
    const urls: string[] = [];
    let phase: 'list' | 'extract' = 'list';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input));
      if (init?.method === 'POST') return jsonResponse({ ok: true, job: { id: phase } }, 201);
      if (phase === 'list') return jsonResponse({ ok: true, job: { status: 'completed', result: { listing: {
        effect: 'embedded-subtitles-listed', streamCount: 1, supportedCount: 1,
        tracks: [{ streamIndex: 2, codecName: 'subrip', codecKind: 'subrip', isSupported: true }],
      } } } });
      return jsonResponse({ ok: true, job: { status: 'completed', result: validExtractionResult() } });
    }) as typeof fetch;
    await listEmbeddedSubtitleTracksFromService(model, { pollAttempts: 1, pollDelayMs: 0 });
    model.transcriptLifecycle.embeddedSubtitle.selectedStreamIndex = 2;
    phase = 'extract';
    await extractSelectedEmbeddedSubtitleDraft(model, { pollAttempts: 1, pollDelayMs: 0 });
    expect(urls).toEqual([
      'http://127.0.0.1:49174/custom/api/jobs', 'http://127.0.0.1:49174/custom/api/jobs/list',
      'http://127.0.0.1:49174/custom/api/jobs', 'http://127.0.0.1:49174/custom/api/jobs/extract',
    ]);
    expect(urls.every((url) => new URL(url).hostname === '127.0.0.1')).toBe(true);
  });

  it('lists metadata without auto-selection, extracts an explicit supported selection, and imports a path-safe draft', async () => {
    const model = createAppModel();
    model.view = 'library';
    model.localService.status = 'connected';
    const media = ownedMedia();
    model.store.putMediaAsset(media);
    model.currentMedia = media;
    const requests: { url: string; body: Record<string, unknown> | null }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
      requests.push({ url, body });
      if (init?.method === 'POST' && body?.kind === 'embedded-subtitle-list') {
        return jsonResponse({ ok: true, job: { id: 'list-ready' } }, 201);
      }
      if (url.endsWith('/api/jobs/list-ready')) {
        return jsonResponse({ ok: true, job: { status: 'completed', result: { listing: {
          effect: 'embedded-subtitles-listed', streamCount: 2, supportedCount: 1, tracks: [
            { streamIndex: 2, codecName: 'subrip', codecKind: 'subrip', isSupported: true, language: 'pl', title: 'Polski', isDefault: true, isForced: true },
            { streamIndex: 4, codecName: 'hdmv_pgs_subtitle', codecKind: 'hdmv_pgs_subtitle', isSupported: false, extractionHint: 'Bitmap subtitle is not directly importable.' },
          ],
        } } } });
      }
      if (init?.method === 'POST' && body?.kind === 'embedded-subtitle-extract') {
        return jsonResponse({ ok: true, job: { id: 'extract-ready' } }, 201);
      }
      if (url.endsWith('/api/jobs/extract-ready')) {
        return jsonResponse({ ok: true, job: { status: 'completed', result: {
          extract: { effect: 'embedded-subtitle-extracted', outputPath: '[local-scratch]', outputFormat: 'srt', streamIndex: 2 },
          track: { language: 'eng', role: 'target', format: 'srt', transcriptStatus: 'draft', transcriptSourceKind: 'user-subtitle-file', cueCount: 2, provenance: { language: 'eng', generatedAt: '2026-07-21T13:00:00.000Z', engine: 'ffmpeg-embedded-subtitle', warningFlags: ['timingUnverified', 'qualityUnreviewed'] } },
          cues: [
            { cueIndex: 1, startMs: 1000, endMs: 3000, text: 'Pierwsza syntetyczna kwestia.', style: 'must-not-persist' },
            { cueIndex: 2, startMs: 3500, endMs: 6000, text: 'Druga syntetyczna kwestia.' },
          ],
        } } });
      }
      return jsonResponse({ ok: false, error: `Unexpected ${url}` }, 500);
    }) as typeof fetch;

    rerenderApp(model);
    const pathInput = document.querySelector('input[name="embedded-subtitle-media-path"]') as HTMLInputElement;
    pathInput.value = '/synthetic/private-sentinel-owned.mkv';
    pathInput.dispatchEvent(new dom.window.Event('input'));
    button('List embedded subtitle tracks').click();
    await waitFor(() => document.body.textContent?.includes('stream 2') === true);

    expect(document.body.textContent).toContain('subrip');
    expect(document.body.textContent).toContain('Polski');
    expect(document.body.textContent).toContain('default');
    expect(document.body.textContent).toContain('forced');
    expect(document.body.textContent).toContain('hdmv_pgs_subtitle');
    expect(document.body.textContent).toContain('unsupported');
    expect(button('Extract selected track as draft').disabled).toBe(true);
    expect(requests.filter((request) => request.body?.kind === 'embedded-subtitle-extract')).toHaveLength(0);

    const supported = document.querySelector('input[name="embedded-subtitle-track"][value="2"]') as HTMLInputElement;
    const unsupported = document.querySelector('input[name="embedded-subtitle-track"][value="4"]') as HTMLInputElement;
    expect(supported.checked).toBe(false);
    expect(unsupported.disabled).toBe(true);
    supported.checked = true;
    supported.dispatchEvent(new dom.window.Event('change'));
    const language = document.querySelector('input[name="embedded-subtitle-language"]') as HTMLInputElement;
    language.value = 'eng';
    language.dispatchEvent(new dom.window.Event('input'));
    expect(button('Extract selected track as draft').disabled).toBe(false);
    button('Extract selected track as draft').click();
    await waitFor(() => model.cues.length === 2);

    const extractRequest = requests.find((request) => request.body?.kind === 'embedded-subtitle-extract');
    expect(extractRequest?.body).toEqual({ kind: 'embedded-subtitle-extract', payload: {
      mediaPath: '/synthetic/private-sentinel-owned.mkv', streamIndex: 2, outputFormat: 'srt', language: 'eng', role: 'target',
    } });
    const track = model.store.getSubtitleTrack(model.targetTrackId!);
    expect(track).toMatchObject({
      mediaId: media.id,
      language: 'eng',
      role: 'target',
      format: 'srt',
      sourceKind: 'owned',
      transcriptStatus: 'draft',
      transcriptSourceKind: 'user-subtitle-file',
    });
    expect(track?.sourcePath).toBe(`embedded-subtitle:${media.id}:stream-2:subrip:srt`);
    expect(track?.sourcePath).not.toContain('/synthetic/');
    expect(track?.provenance).toMatchObject({ engine: 'ffmpeg-embedded-subtitle', warningFlags: ['timingUnverified', 'qualityUnreviewed'] });
    expect(model.cues.map((cue) => ({ startMs: cue.startMs, endMs: cue.endMs, text: cue.text }))).toEqual([
      { startMs: 1000, endMs: 3000, text: 'Pierwsza syntetyczna kwestia.' },
      { startMs: 3500, endMs: 6000, text: 'Druga syntetyczna kwestia.' },
    ]);
    expect(JSON.stringify(model.store.snapshot())).not.toContain('/synthetic/private-sentinel-owned.mkv');
    expect(document.body.textContent).toContain('Embedded subtitle track imported as a draft; correct and approve it before study use.');
    model.view = 'player';
    rerenderApp(model);
    expect(button('Save sentence').disabled).toBe(true);
  });

  it('clears stale selection after a path change and redacts echoed extraction failures', async () => {
    const model = createAppModel();
    model.view = 'library';
    model.localService.status = 'connected';
    model.currentMedia = ownedMedia();
    const privatePath = '/synthetic/private-echo-sentinel.mkv';
    let phase: 'list' | 'extract' = 'list';
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        if (phase === 'list') return jsonResponse({ ok: true, job: { id: 'list-one' } }, 201);
        return jsonResponse({ ok: true, job: { id: 'extract-fail' } }, 201);
      }
      if (phase === 'list') {
        return jsonResponse({ ok: true, job: { status: 'completed', result: { listing: { effect: 'embedded-subtitles-listed', streamCount: 1, supportedCount: 1, tracks: [{ streamIndex: 1, codecName: 'ass', codecKind: 'ass', isSupported: true, language: 'pl' }] } } } });
      }
      return jsonResponse({ ok: true, job: { status: 'failed', message: `ffmpeg failed for ${privatePath}` } });
    }) as typeof fetch;

    rerenderApp(model);
    const pathInput = document.querySelector('input[name="embedded-subtitle-media-path"]') as HTMLInputElement;
    pathInput.value = privatePath;
    pathInput.dispatchEvent(new dom.window.Event('input'));
    button('List embedded subtitle tracks').click();
    await waitFor(() => Boolean(document.querySelector('input[name="embedded-subtitle-track"]')));
    const supported = document.querySelector('input[name="embedded-subtitle-track"]') as HTMLInputElement;
    supported.checked = true;
    supported.dispatchEvent(new dom.window.Event('change'));
    const currentPathInput = document.querySelector('input[name="embedded-subtitle-media-path"]') as HTMLInputElement;
    currentPathInput.value = '/synthetic/changed-owned.mkv';
    currentPathInput.dispatchEvent(new dom.window.Event('input'));
    expect(button('Extract selected track as draft').disabled).toBe(true);

    currentPathInput.value = privatePath;
    currentPathInput.dispatchEvent(new dom.window.Event('input'));
    button('List embedded subtitle tracks').click();
    await waitFor(() => model.transcriptLifecycle.embeddedSubtitle.listingStatus === 'ready');
    const supportedAgain = document.querySelector('input[name="embedded-subtitle-track"]') as HTMLInputElement;
    supportedAgain.checked = true;
    supportedAgain.dispatchEvent(new dom.window.Event('change'));
    phase = 'extract';
    button('Extract selected track as draft').click();
    await waitFor(() => document.body.textContent?.includes('Embedded subtitle extraction failed.') === true);
    expect(document.body.textContent).not.toContain(privatePath);
    expect(model.importError).not.toContain(privatePath);
    expect(model.cues).toHaveLength(0);
  });

  it('fails closed with the import-validation state when completed extraction cues are malformed', async () => {
    const model = createAppModel();
    model.localService.status = 'connected';
    const media = ownedMedia();
    model.store.putMediaAsset(media);
    model.currentMedia = media;
    model.transcriptLifecycle.embeddedSubtitle = {
      mediaPath: '/synthetic/malformed-owned.mkv',
      language: 'pl',
      listingStatus: 'ready',
      extractionStatus: 'idle',
      tracks: [{ streamIndex: 2, codecName: 'subrip', codecKind: 'subrip', isSupported: true }],
      selectedStreamIndex: 2,
      statusMessage: null,
      errorCode: null,
    };
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ ok: true, job: { id: 'malformed-extract' } }, 201);
      return jsonResponse({ ok: true, job: { status: 'completed', result: {
        extract: { effect: 'embedded-subtitle-extracted', outputPath: '[local-scratch]', outputFormat: 'srt', streamIndex: 2 },
        track: { role: 'target', format: 'srt', transcriptStatus: 'draft', transcriptSourceKind: 'user-subtitle-file', cueCount: 1, provenance: { warningFlags: ['timingUnverified', 'qualityUnreviewed'] } },
        cues: [{ cueIndex: 1, startMs: 2000, endMs: 1000, text: 'Invalid timing.' }],
      } } });
    }) as typeof fetch;

    await expect(extractSelectedEmbeddedSubtitleDraft(model, { pollAttempts: 1, pollDelayMs: 0 })).rejects.toThrow(
      'Extracted subtitle data could not be imported as a draft.',
    );
    expect(model.transcriptLifecycle.embeddedSubtitle.statusMessage).toContain('Extracted subtitle data could not be imported as a draft.');
    expect(model.targetTrackId).toBeNull();
    expect(model.cues).toHaveLength(0);
  });
});
