import { pairedModel } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activeLoopRangeForSelection,
  clearVisualSourceRange,
  exportLearnerState,
  importFixtureMediaAndSubtitles,
  setLocalServiceBaseUrl,
  setVisualSourceRange,
} from '../../apps/web/src/model.ts';
import { rerenderApp } from '../../apps/web/src/app.ts';
import { makeTranscriptWordTiming } from '@lingotorte/domain';

const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';

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
  globalThis.CSS = { escape: (value: string) => value.replace(/"/g, '\\"') } as unknown as typeof CSS;
  return dom;
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent === text);
  if (!(button instanceof window.HTMLButtonElement)) throw new Error(`Missing button: ${text}`);
  return button;
}

describe('B6 visual source range model', () => {
  it('creates an ordered integer range, clamps it to media duration, and clears it', () => {
    const model = pairedModel();
    model.player.durationMs = 10_000;

    expect(setVisualSourceRange(model, 8_900.8, 2_100.2)).toEqual({ startMs: 2_100, endMs: 8_901 });
    expect(model.player.sourceRange).toEqual({ startMs: 2_100, endMs: 8_901 });
    expect(setVisualSourceRange(model, -500, 12_000)).toEqual({ startMs: 0, endMs: 10_000 });

    clearVisualSourceRange(model);
    expect(model.player.sourceRange).toBeNull();
  });
});

describe('B6 visual source range player UI', () => {
  let dom: Awaited<ReturnType<typeof setupDom>>;

  beforeEach(async () => {
    dom = await setupDom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it('endpoint edit fences the real Player snippet continuation and leaves replacement UI untouched', async () => {
    let complete!: (response: Response) => void;
    const waiting = new Promise<Response>(resolve => { complete = resolve; });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: 'pending' } }))).mockImplementationOnce(() => waiting);
    vi.stubGlobal('fetch', fetcher);
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:forbidden');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.localService.status = 'connected'; model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    setVisualSourceRange(model, 100, 1000); rerenderApp(model); buttonByText('Prepare audio for practice').click();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    setLocalServiceBaseUrl(model, 'http://selected-private-host:7514'); rerenderApp(model);
    const before = document.querySelector('[data-testid="source-range-panel"]')?.textContent;
    complete(new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: '00000000-0000-4000-8000-000000000001', url: '/api/snippets/00000000-0000-4000-8000-000000000001', mimeType: 'audio/wav' } } })));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(fetcher).toHaveBeenCalledTimes(2); expect(create).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="source-range-panel"] audio')).toBeNull();
    expect(document.querySelector('[data-testid="source-range-panel"]')?.textContent).toBe(before);
  });

  it('renders keyboard-operable range handles with visible start, end, duration, and separate loop actions', async () => {
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 4_000;
    setVisualSourceRange(model, 500, 2_000);

    rerenderApp(model);

    const panel = document.querySelector('[data-testid="source-range-panel"]');
    const start = panel?.querySelector('input[aria-label="Source range start"]') as HTMLInputElement | null;
    const end = panel?.querySelector('input[aria-label="Source range end"]') as HTMLInputElement | null;
    expect(start).toMatchObject({ type: 'range', value: '500' });
    expect(end).toMatchObject({ type: 'range', value: '2000' });
    expect(panel?.textContent).toContain('Start 0:00.50');
    expect(panel?.textContent).toContain('End 0:02.00');
    expect(panel?.textContent).toContain('Duration 0:01.50');
    expect(panel?.textContent).toContain('Loop selected range');
    expect(panel?.textContent).toContain('Clear loop');
    expect(model.player.loopRange).toBeNull();
  });

  it('updates the selected interval from actual range-handle input events', async () => {
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 4_000;
    rerenderApp(model);

    let start = document.querySelector('input[aria-label="Source range start"]') as HTMLInputElement;
    start.value = '750';
    start.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    let end = document.querySelector('input[aria-label="Source range end"]') as HTMLInputElement;
    end.value = '2250';
    end.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    expect(model.player.sourceRange).toEqual({ startMs: 750, endMs: 2_250 });
    expect(document.querySelector('[data-testid="source-range-panel"]')?.textContent).toContain('Duration 0:01.50');
    start = document.querySelector('input[aria-label="Source range start"]') as HTMLInputElement;
    end = document.querySelector('input[aria-label="Source range end"]') as HTMLInputElement;
    expect(start.value).toBe('750');
    expect(end.value).toBe('2250');
  });

  it('seeds only the visual range from timed transcript text and applies or clears the loop deliberately', async () => {
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    const cue = model.cues[0]!;
    model.store.putTranscriptWordTiming(makeTranscriptWordTiming({
      trackId: cue.trackId,
      cueId: cue.id,
      wordIndex: 0,
      charStart: 0,
      charEnd: 6,
      text: cue.text.slice(0, 6),
      normalizedText: cue.text.slice(0, 6).toLocaleLowerCase('pl'),
      startMs: 100,
      endMs: 700,
      sourceKind: 'provider-word-timing',
      engine: 'fake-test',
      modelName: 'fake-test',
    }));
    model.selection = {
      kind: 'phrase', text: cue.text.slice(0, 6), cueId: cue.id,
      tokenStart: 0, tokenEnd: 1, charStart: 0, charEnd: 6,
    };
    const expected = activeLoopRangeForSelection(model, cue, 0, 6);
    expect(expected).not.toBeNull();
    const originalSelection = { ...model.selection };
    rerenderApp(model);

    const seed = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Use transcript selection');
    (seed as HTMLButtonElement).click();
    expect(model.player.sourceRange).toEqual(expected);
    expect(model.player.loopRange).toBeNull();
    expect(model.selection).toEqual(originalSelection);

    const apply = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Loop selected range');
    (apply as HTMLButtonElement).click();
    expect(model.player.loopRange).toEqual(expected);
    expect(model.selection).toEqual(originalSelection);

    const clear = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Clear loop');
    (clear as HTMLButtonElement).click();
    expect(model.player.loopRange).toBeNull();
    expect(model.player.sourceRange).toEqual(expected);
  });

  it('allows a long visual loop but rejects 30,001 ms snippets before fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchImpl);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 60_000;
    setVisualSourceRange(model, 1_000, 31_000);
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    rerenderApp(model);

    let panel = document.querySelector('[data-testid="source-range-panel"]')!;
    let prepare = Array.from(panel.querySelectorAll('button')).find((button) => button.textContent === 'Prepare audio for practice') as HTMLButtonElement;
    expect(prepare.disabled).toBe(false);

    setVisualSourceRange(model, 1_000, 31_001);
    rerenderApp(model);
    panel = document.querySelector('[data-testid="source-range-panel"]')!;
    prepare = Array.from(panel.querySelectorAll('button')).find((button) => button.textContent === 'Prepare audio for practice') as HTMLButtonElement;
    const loop = Array.from(panel.querySelectorAll('button')).find((button) => button.textContent === 'Loop selected range') as HTMLButtonElement;
    expect(prepare.disabled).toBe(true);
    expect(loop.disabled).toBe(false);
    expect(panel.textContent).toContain('30-second maximum');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed before fetch for licensed or missing current media', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchImpl);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    setVisualSourceRange(model, 1_000, 2_000);
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    model.currentMedia = { ...model.currentMedia!, privacyLabel: 'licensed' };
    rerenderApp(model);

    let prepare = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Prepare audio for practice') as HTMLButtonElement;
    expect(prepare.disabled).toBe(true);
    prepare.click();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="source-range-panel"]')?.textContent).toContain('owned or synthetic');

    model.currentMedia = null;
    rerenderApp(model);
    prepare = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Prepare audio for practice') as HTMLButtonElement;
    expect(prepare.disabled).toBe(true);
    prepare.click();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['disconnected service', 'disconnected', '/owned/movie.mkv', 'not connected'],
    ['blank path', 'connected', '', 'full path to the video file'],
    ['relative path', 'connected', 'movie.mkv', 'full path to the video file'],
    ['blob path', 'connected', 'blob:private-media', 'full path to the video file'],
    ['HTTP path', 'connected', 'https://example.invalid/private.mkv', 'full path to the video file'],
  ] as const)('rejects %s before fetch', async (_label, serviceStatus, configuredPath, expectedStatus) => {
    const fetchImpl = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchImpl);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    setVisualSourceRange(model, 1_000, 2_000);
    model.localService.status = serviceStatus;
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = configuredPath;
    rerenderApp(model);

    const prepare = buttonByText('Prepare audio for practice');
    expect(prepare.disabled).toBe(true);
    prepare.click();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="source-range-panel"]')?.textContent).toContain(expectedStatus);
  });

  it.each(['service request', 'extraction', 'retrieval'] as const)('shows a redacted ordinary %s failure', async (stage) => {
    const privatePath = '/private/owned/movie.mkv';
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (init?.method === 'POST') {
        if (stage === 'service request') return new Response(privatePath, { status: 503 });
        return new Response(JSON.stringify({ job: { id: 'job-failure' } }), { status: 201 });
      }
      if (stage === 'extraction') {
        return new Response(JSON.stringify({ job: { status: 'failed', message: `ffmpeg failed at ${privatePath}` } }), { status: 200 });
      }
      if (String(input).includes('/api/jobs/')) {
        return new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: '00000000-0000-4000-8000-000000000001', url: '/api/snippets/00000000-0000-4000-8000-000000000001', mimeType: 'audio/wav' } } }), { status: 200 });
      }
      return new Response(privatePath, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    setVisualSourceRange(model, 1_000, 2_000);
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = privatePath;
    rerenderApp(model);

    buttonByText('Prepare audio for practice').click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="source-range-panel"]')?.textContent).toMatch(/failed/i));
    const visible = document.querySelector('[data-testid="source-range-panel"]')?.textContent ?? '';
    expect(visible).not.toContain(privatePath);
    expect(document.querySelector('[data-testid="source-range-panel"] audio')).toBeNull();
  });

  it('does not promote browser audio or claim deletion when DELETE fails', async () => {
    const responses = [
      new Response(JSON.stringify({ job: { id: 'job-delete-failure' } }), { status: 201 }),
      new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: '00000000-0000-4000-8000-000000000001', url: '/api/snippets/00000000-0000-4000-8000-000000000001', mimeType: 'audio/wav' } } }), { status: 200 }),
      new Response(new Blob(['wav'], { type: 'audio/wav' }), { status: 200 }),
      new Response('/private/scratch/opaque.wav', { status: 500 }),
    ];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => responses.shift()!));
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:must-not-exist');
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    setVisualSourceRange(model, 1_000, 2_000);
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    rerenderApp(model);

    buttonByText('Prepare audio for practice').click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="source-range-panel"]')?.textContent).toContain('deletion failed'));
    const panel = document.querySelector('[data-testid="source-range-panel"]')!;
    expect(panel.textContent).not.toContain('/private/scratch/opaque.wav');
    expect(panel.textContent).not.toContain('service scratch copy was deleted');
    expect(panel.querySelector('audio')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('prepares the exact selected range, renders deliberate audio, deletes service bytes, and cleans its browser URL', async () => {
    const responses = [
      new Response(JSON.stringify({ job: { id: 'job-1' } }), { status: 201 }),
      new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: '00000000-0000-4000-8000-000000000001', url: '/api/snippets/00000000-0000-4000-8000-000000000001', mimeType: 'audio/wav' } } }), { status: 200 }),
      new Response(new Blob(['wav'], { type: 'audio/wav' }), { status: 200 }),
      new Response(null, { status: 204 }),
    ];
    const fetchImpl = vi.fn<typeof fetch>(async () => responses.shift()!);
    vi.stubGlobal('fetch', fetchImpl);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:visual-range');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    setVisualSourceRange(model, 1_250, 3_500);
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    rerenderApp(model);

    const prepare = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Prepare audio for practice') as HTMLButtonElement;
    prepare.click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="source-range-panel"] audio')).toBeTruthy());

    const request = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      kind: 'source-audio-snippet',
      payload: { mediaPath: '/owned/movie.mkv', startMs: 1_250, endMs: 3_500 },
    });
    expect(fetchImpl.mock.calls[3]![1]).toMatchObject({ method: 'DELETE' });
    const audio = document.querySelector('[data-testid="source-range-panel"] audio') as HTMLAudioElement;
    expect(audio.autoplay).toBe(false);
    expect(createObjectURL).toHaveBeenCalledOnce();

    const clean = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Clean browser audio') as HTMLButtonElement;
    clean.click();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:visual-range');
    expect(document.querySelector('[data-testid="source-range-panel"] audio')).toBeNull();
  });

  it('keeps manual handles usable and reports a timed-selection miss without changing learner text selection', async () => {
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    const cue = model.cues[0]!;
    model.selection = {
      kind: 'phrase', text: cue.text.slice(0, 6), cueId: cue.id,
      tokenStart: 0, tokenEnd: 1, charStart: 0, charEnd: 6,
    };
    const originalSelection = { ...model.selection };
    rerenderApp(model);

    const seed = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Use transcript selection') as HTMLButtonElement;
    seed.click();
    const panel = document.querySelector('[data-testid="source-range-panel"]')!;
    expect(panel.textContent).toContain('no usable word timings');
    expect((panel.querySelector('input[aria-label="Source range start"]') as HTMLInputElement).disabled).toBe(false);
    expect(model.selection).toEqual(originalSelection);
  });

  it('revokes an out-of-order stale success and keeps the newer range audio installed', async () => {
    let resolveOldPoll!: (response: Response) => void;
    const oldPoll = new Promise<Response>((resolve) => { resolveOldPoll = resolve; });
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/jobs') && init?.method === 'POST') {
        const range = (JSON.parse(String(init.body)) as { payload: { startMs: number } }).payload.startMs;
        return new Response(JSON.stringify({ job: { id: range === 1_000 ? 'old' : 'new' } }), { status: 201 });
      }
      if (url.endsWith('/api/jobs/old')) return oldPoll;
      if (url.endsWith('/api/jobs/new')) return new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: '00000000-0000-4000-8000-000000000002', url: '/api/snippets/00000000-0000-4000-8000-000000000002', mimeType: 'audio/wav' } } }), { status: 200 });
      if (url.endsWith('/api/snippets/00000000-0000-4000-8000-000000000002') && init?.method !== 'DELETE') return new Response(new Blob(['new']), { status: 200 });
      if (url.endsWith('/api/snippets/00000000-0000-4000-8000-000000000003') && init?.method !== 'DELETE') return new Response(new Blob(['old']), { status: 200 });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:new')
      .mockReturnValueOnce('blob:old');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    setVisualSourceRange(model, 1_000, 2_000);
    rerenderApp(model);

    let prepare = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Prepare audio for practice') as HTMLButtonElement;
    prepare.click();
    await vi.waitFor(() => expect(fetchImpl.mock.calls.some(([input]) => String(input).endsWith('/api/jobs/old'))).toBe(true));

    setVisualSourceRange(model, 3_000, 4_000);
    rerenderApp(model);
    prepare = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Prepare audio for practice') as HTMLButtonElement;
    prepare.click();
    await vi.waitFor(() => expect((document.querySelector('[data-testid="source-range-panel"] audio') as HTMLAudioElement | null)?.src).toContain('blob:new'));

    resolveOldPoll(new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: '00000000-0000-4000-8000-000000000003', url: '/api/snippets/00000000-0000-4000-8000-000000000003', mimeType: 'audio/wav' } } }), { status: 200 }));
    await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:old'));
    expect((document.querySelector('[data-testid="source-range-panel"] audio') as HTMLAudioElement).src).toContain('blob:new');
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it('suppresses an out-of-order stale failure after newer audio is ready', async () => {
    let rejectOldPoll!: (error: Error) => void;
    const oldPoll = new Promise<Response>((_resolve, reject) => { rejectOldPoll = reject; });
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/jobs') && init?.method === 'POST') {
        const startMs = (JSON.parse(String(init.body)) as { payload: { startMs: number } }).payload.startMs;
        return new Response(JSON.stringify({ job: { id: startMs === 1_000 ? 'old-failure' : 'new-success' } }), { status: 201 });
      }
      if (url.endsWith('/api/jobs/old-failure')) return oldPoll;
      if (url.endsWith('/api/jobs/new-success')) return new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: '00000000-0000-4000-8000-000000000002', url: '/api/snippets/00000000-0000-4000-8000-000000000002', mimeType: 'audio/wav' } } }), { status: 200 });
      if (url.endsWith('/api/snippets/00000000-0000-4000-8000-000000000002') && init?.method !== 'DELETE') return new Response(new Blob(['new']), { status: 200 });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:new-success');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    setVisualSourceRange(model, 1_000, 2_000);
    rerenderApp(model);
    (Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Prepare audio for practice') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(fetchImpl.mock.calls.some(([input]) => String(input).endsWith('/api/jobs/old-failure'))).toBe(true));

    setVisualSourceRange(model, 3_000, 4_000);
    rerenderApp(model);
    (Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Prepare audio for practice') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="source-range-panel"] audio')).toBeTruthy());
    rejectOldPoll(new Error('failed at /private/owned/movie.mkv'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const panel = document.querySelector('[data-testid="source-range-panel"]')!;
    expect(panel.textContent).toContain('Source audio ready');
    expect(panel.textContent).not.toContain('/private/owned/movie.mkv');
    expect((panel.querySelector('audio') as HTMLAudioElement).src).toContain('blob:new-success');
  });

  it('revokes an in-flight success when the same media ID becomes licensed', async () => {
    let resolvePoll!: (response: Response) => void;
    const pendingPoll = new Promise<Response>((resolve) => { resolvePoll = resolve; });
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/jobs') && init?.method === 'POST') {
        return new Response(JSON.stringify({ job: { id: 'same-id-success' } }), { status: 201 });
      }
      if (url.endsWith('/api/jobs/same-id-success')) return pendingPoll;
      if (url.endsWith('/api/snippets/00000000-0000-4000-8000-000000000004') && init?.method !== 'DELETE') {
        return new Response(new Blob(['wav']), { status: 200 });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:same-id-success');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    setVisualSourceRange(model, 1_000, 2_000);
    rerenderApp(model);
    buttonByText('Prepare audio for practice').click();
    await vi.waitFor(() => expect(fetchImpl.mock.calls.some(([input]) => String(input).endsWith('/api/jobs/same-id-success'))).toBe(true));

    model.currentMedia = { ...model.currentMedia!, privacyLabel: 'licensed' };
    rerenderApp(model);
    resolvePoll(new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: '00000000-0000-4000-8000-000000000004', url: '/api/snippets/00000000-0000-4000-8000-000000000004', mimeType: 'audio/wav' } } }), { status: 200 }));
    await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:same-id-success'));

    const panel = document.querySelector('[data-testid="source-range-panel"]')!;
    expect(panel.textContent).toContain('owned or synthetic');
    expect(panel.querySelector('audio')).toBeNull();
  });

  it('suppresses an in-flight failure when the same media ID becomes licensed', async () => {
    let rejectPoll!: (error: Error) => void;
    const pendingPoll = new Promise<Response>((_resolve, reject) => { rejectPoll = reject; });
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/jobs') && init?.method === 'POST') {
        return new Response(JSON.stringify({ job: { id: 'same-id-failure' } }), { status: 201 });
      }
      if (url.endsWith('/api/jobs/same-id-failure')) return pendingPoll;
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchImpl);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    setVisualSourceRange(model, 1_000, 2_000);
    rerenderApp(model);
    buttonByText('Prepare audio for practice').click();
    await vi.waitFor(() => expect(fetchImpl.mock.calls.some(([input]) => String(input).endsWith('/api/jobs/same-id-failure'))).toBe(true));

    model.currentMedia = { ...model.currentMedia!, privacyLabel: 'licensed' };
    rerenderApp(model);
    rejectPoll(new Error('failed at /private/owned/movie.mkv'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const visible = document.querySelector('[data-testid="source-range-panel"]')?.textContent ?? '';
    expect(visible).toContain('owned or synthetic');
    expect(visible).not.toContain('/private/owned/movie.mkv');
    expect(visible).not.toContain('failed at');
  });

  it.each(['path', 'media'] as const)('suppresses a stale failure after %s invalidation', async (invalidation) => {
    let rejectPoll!: (error: Error) => void;
    const pendingPoll = new Promise<Response>((_resolve, reject) => { rejectPoll = reject; });
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/jobs') && init?.method === 'POST') {
        return new Response(JSON.stringify({ job: { id: 'stale-failure' } }), { status: 201 });
      }
      if (url.endsWith('/api/jobs/stale-failure')) return pendingPoll;
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchImpl);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    setVisualSourceRange(model, 1_000, 2_000);
    rerenderApp(model);
    buttonByText('Prepare audio for practice').click();
    await vi.waitFor(() => expect(fetchImpl.mock.calls.some(([input]) => String(input).endsWith('/api/jobs/stale-failure'))).toBe(true));

    if (invalidation === 'path') {
      const path = document.querySelector('#source-range-media-path') as HTMLInputElement;
      path.value = '/owned/other.mkv';
      path.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    } else {
      model.currentMedia = null;
      rerenderApp(model);
    }
    rejectPoll(new Error('failed at /private/owned/movie.mkv'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const visible = document.querySelector('[data-testid="source-range-panel"]')?.textContent ?? '';
    expect(visible).toContain(invalidation === 'path' ? 'Media path changed' : 'current owned or synthetic');
    expect(visible).not.toContain('/private/owned/movie.mkv');
    expect(visible).not.toContain('failed at');
  });

  it('revokes prepared audio on reprepare, path change, range change, media change, and range clear', async () => {
    let job = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/jobs') && init?.method === 'POST') {
        job += 1;
        return new Response(JSON.stringify({ job: { id: `job-${job}` } }), { status: 201 });
      }
      if (/\/api\/jobs\/job-\d+$/.test(url)) {
        const id = `00000000-0000-4000-8000-${String(job).padStart(12, '0')}`;
        return new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: id, url: `/api/snippets/${id}`, mimeType: 'audio/wav' } } }), { status: 200 });
      }
      if (url.includes('/api/snippets/') && init?.method !== 'DELETE') return new Response(new Blob(['wav']), { status: 200 });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    let urlNumber = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:lifecycle-${++urlNumber}`);
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    setVisualSourceRange(model, 1_000, 2_000);
    const prepareAndWait = async () => {
      rerenderApp(model);
      (Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Prepare audio for practice') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(document.querySelector('[data-testid="source-range-panel"] audio')).toBeTruthy());
    };

    await prepareAndWait();
    await prepareAndWait();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lifecycle-1');

    const path = document.querySelector('#source-range-media-path') as HTMLInputElement;
    path.value = '/owned/other.mkv';
    path.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lifecycle-2');

    await prepareAndWait();
    setVisualSourceRange(model, 2_000, 3_000);
    rerenderApp(model);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lifecycle-3');

    await prepareAndWait();
    model.currentMedia = null;
    rerenderApp(model);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lifecycle-4');
    expect(model.player.sourceRange).toBeNull();

    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    rerenderApp(model);
    setVisualSourceRange(model, 4_000, 5_000);
    await prepareAndWait();
    const clearRange = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Clear selected range') as HTMLButtonElement;
    clearRange.click();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lifecycle-5');
  });

  it('preserves Save source context after visual range, loop, and snippet operations', async () => {
    const responses = [
      new Response(JSON.stringify({ job: { id: 'job-save-context' } }), { status: 201 }),
      new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: '00000000-0000-4000-8000-000000000001', url: '/api/snippets/00000000-0000-4000-8000-000000000001', mimeType: 'audio/wav' } } }), { status: 200 }),
      new Response(new Blob(['wav'], { type: 'audio/wav' }), { status: 200 }),
      new Response(null, { status: 204 }),
    ];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => responses.shift()!));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:save-context');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    const media = model.currentMedia!;
    const cue = model.cues[0]!;
    model.store.putTranscriptWordTiming(makeTranscriptWordTiming({
      trackId: cue.trackId,
      cueId: cue.id,
      wordIndex: 0,
      charStart: 0,
      charEnd: 6,
      text: cue.text.slice(0, 6),
      normalizedText: cue.text.slice(0, 6).toLocaleLowerCase('pl'),
      startMs: 100,
      endMs: 700,
      sourceKind: 'provider-word-timing',
      engine: 'fake-test',
      modelName: 'fake-test',
    }));
    model.selection = {
      kind: 'phrase', text: cue.text.slice(0, 6), cueId: cue.id,
      tokenStart: 0, tokenEnd: 1, charStart: 0, charEnd: 6,
    };
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    model.transcriptLifecycle.localAsrMediaPath = '/owned/movie.mkv';
    rerenderApp(model);

    buttonByText('Use transcript selection').click();
    buttonByText('Loop selected range').click();
    buttonByText('Prepare audio for practice').click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="source-range-panel"] audio')).toBeTruthy());
    expect(model.selection).toMatchObject({ cueId: cue.id, charStart: 0, charEnd: 6 });

    (document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(Object.values(model.store.snapshot().savedOccurrences)).toHaveLength(1));
    const occurrence = Object.values(model.store.snapshot().savedOccurrences)[0]!;
    expect(occurrence).toMatchObject({
      mediaId: media.id,
      cueId: cue.id,
      selectionText: cue.text.slice(0, 6),
      startMs: 100,
      endMs: 700,
      sourceContext: {
        mediaId: media.id,
        cueId: cue.id,
        timeRangeMs: { start: 100, end: 700 },
        charSpan: { start: 0, end: 6 },
      },
    });
  });

  it('keeps visual range and snippet lifecycle out of learner snapshots and exports', async () => {
    const model = pairedModel();
    await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
    model.player.durationMs = 10_000;
    setVisualSourceRange(model, 1_000, 2_000);

    const serialized = JSON.stringify({ snapshot: model.store.snapshot(), export: exportLearnerState(model).manifest });
    expect(serialized).not.toContain('sourceRange');
    expect(serialized).not.toContain('objectUrl');
    expect(serialized).not.toContain('snippetId');
    expect(serialized).not.toContain('blob:');
  });
});
