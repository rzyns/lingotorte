import { captureSentence } from '../helpers/capture';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, exportLearnerState, importFixtureMediaAndSubtitles, pairLocalService, setLocalServiceBaseUrl, setPracticeMode, setReviewBucketAsOf, setView, syncPracticeCard } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { SYNTHETIC_CAPABILITY } from './pairingFixture.ts';

// lt-q3d: Practice audio-recall source-snippet races and cleanup. Synthetic fixtures, fake transport fetch,
// fake object URLs; no providers, no network, no microphone.

const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';
const SNIP = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
type Model = ReturnType<typeof createAppModel>;
// lt-41v: pin the clock; a backward wall-clock step after capture would leave no due card to practise.
const PRACTICE_NOW = new Date('2026-01-15T12:00:00.000Z');

async function practiceModel(cards = 2): Promise<Model> {
  const model = createAppModel();
  setReviewBucketAsOf(model, PRACTICE_NOW);
  await importFixtureMediaAndSubtitles(model, mediaPath, targetSrtPath, nativeSrtPath);
  for (const cue of model.cues.slice(0, cards)) {
    await captureSentence(model, cue);
  }
  pairLocalService(model, SYNTHETIC_CAPABILITY);
  model.localService.status = 'connected';
  model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
  setPracticeMode(model, 'audio-recall');
  setView(model, 'practice');
  rerenderApp(model);
  return model;
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find(b => b.textContent === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found as HTMLButtonElement;
}
function setPath(value: string) {
  const input = document.getElementById('practice-audio-media-path') as HTMLInputElement;
  input.value = value; input.dispatchEvent(new window.Event('input'));
}
const audioEl = () => document.querySelector('.practice-audio-recall audio') as HTMLAudioElement | null;
const statusText = () => document.querySelector('.practice-audio-recall [role="status"]')?.textContent ?? '';

type Job = { poll: Promise<Response> | (() => Response); blob?: string; snippet: number; deleteFails?: boolean; blobFails?: boolean };
function deferred() { let resolve!: (r: Response) => void; let reject!: (e: Error) => void; const promise = new Promise<Response>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const completed = (n: number) => new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: SNIP(n), url: `/api/snippets/${SNIP(n)}`, mimeType: 'audio/wav' } } }), { status: 200 });

/** Fake local-service transport fetch: each POST /api/jobs takes the next queued job. */
function fakeService(jobs: Job[]) {
  let created = 0;
  const byId = new Map<string, Job>();
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/jobs') && init?.method === 'POST') {
      const id = `job${created}`; byId.set(id, jobs[created++]!);
      return new Response(JSON.stringify({ job: { id } }), { status: 201 });
    }
    const jobMatch = /\/api\/jobs\/(job\d+)$/.exec(url);
    if (jobMatch) { const job = byId.get(jobMatch[1]!)!; return typeof job.poll === 'function' ? job.poll() : job.poll; }
    const snip = /\/api\/snippets\/(.+)$/.exec(url);
    if (snip) {
      const job = jobs.find(j => SNIP(j.snippet) === snip[1])!;
      if (init?.method === 'DELETE') return new Response(null, { status: job.deleteFails ? 500 : 204 });
      return job.blobFails ? new Response(null, { status: 404 }) : new Response(new Blob([job.blob ?? 'wav']), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchImpl);
  return fetchImpl;
}

function fakeObjectUrls(names: string[]) {
  let i = 0;
  const live = new Set<string>();
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { const u = names[i++] ?? `blob:extra-${i}`; live.add(u); return u; });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => { live.delete(u); });
  return { create, revoke, live };
}

// Generous wait: the fake service has several async hops and the shared host is loaded.
const waitFor = (assertion: () => void) => vi.waitFor(assertion, { timeout: 8_000, interval: 10 });
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

describe('lt-q3d Practice source-audio guards', { timeout: 30_000 }, () => {
  let dom: JSDOM;
  let gum: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    dom = new JSDOM('<main id="app"></main>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
    gum = vi.fn();
    Object.defineProperty(dom.window.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: gum } });
    Object.assign(globalThis, { document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0, CSS: { escape: (s: string) => s } });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); dom.window.close(); });

  it('(1) out-of-order success for the same card: only the latest is installed and the stale URL revoked', async () => {
    await practiceModel();
    const old = deferred();
    fakeService([{ poll: old.promise, snippet: 1, blob: 'old' }, { poll: () => completed(2), snippet: 2, blob: 'new' }]);
    const urls = fakeObjectUrls(['blob:new', 'blob:old']);
    setPath('/owned/movie.mkv');
    button('Prepare audio for practice').click();
    await waitFor(() => expect(statusText()).toContain('Preparing'));
    button('Prepare audio for practice').click();
    await waitFor(() => expect(audioEl()?.src).toBe('blob:new'));
    old.resolve(completed(1));
    await waitFor(() => expect(urls.revoke).toHaveBeenCalledWith('blob:old'));
    await settle();
    expect(audioEl()?.src).toBe('blob:new');
    expect([...urls.live]).toEqual(['blob:new']);
  });

  it('(1b) out-of-order stale failure is ignored after newer audio is ready', async () => {
    const model = await practiceModel();
    const old = deferred();
    fakeService([{ poll: old.promise, snippet: 1 }, { poll: () => completed(2), snippet: 2 }]);
    fakeObjectUrls(['blob:new']);
    setPath('/owned/movie.mkv');
    button('Prepare audio for practice').click();
    await waitFor(() => expect(statusText()).toContain('Preparing'));
    button('Prepare audio for practice').click();
    await waitFor(() => expect(audioEl()?.src).toBe('blob:new'));
    old.reject(new Error('failed at /private/owned/movie.mkv'));
    await settle();
    expect(statusText()).toContain('Source audio ready');
    expect(document.body.textContent).not.toContain('/private/owned');
    expect(audioEl()?.src).toBe('blob:new');
    void model;
  });

  it('(2) submit/skip while preparing discards the late result', async () => {
    const model = await practiceModel();
    const pending = deferred();
    fakeService([{ poll: pending.promise, snippet: 1 }]);
    const urls = fakeObjectUrls(['blob:late']);
    setPath('/owned/movie.mkv');
    const firstCard = model.practice.cardId;
    button('Prepare audio for practice').click();
    await waitFor(() => expect(statusText()).toContain('Preparing'));
    button('Submit attempt').click(); // empty answer = skip; the queue may re-present the same card
    expect(model.store.listPracticeAttemptsForCard(firstCard!).length).toBe(1);
    pending.resolve(completed(1));
    await settle();
    expect(audioEl()).toBeNull();
    expect(urls.live.size).toBe(0);
    expect(statusText()).not.toContain('Source audio ready');
  });

  it('(2b) card change after ready (submit, syncPracticeCard) revokes the installed URL', async () => {
    const model = await practiceModel();
    fakeService([{ poll: () => completed(1), snippet: 1 }, { poll: () => completed(2), snippet: 2 }]);
    const urls = fakeObjectUrls(['blob:a', 'blob:b']);
    setPath('/owned/movie.mkv');
    button('Prepare audio for practice').click();
    await waitFor(() => expect(audioEl()?.src).toBe('blob:a'));
    button('Submit attempt').click();
    expect(urls.revoke).toHaveBeenCalledWith('blob:a');
    expect(audioEl()).toBeNull();
    // Second card ready, then an lt-0g9 syncPracticeCard reset to another card id.
    button('Prepare audio for practice').click();
    await waitFor(() => expect(audioEl()?.src).toBe('blob:b'));
    syncPracticeCard(model, null); model.review.activeCardId = null;
    rerenderApp(model);
    expect(urls.revoke).toHaveBeenCalledWith('blob:b');
    expect(urls.live.size).toBe(0);
  });

  it('(2c) lt-2rl wake rerender for the same card keeps the valid snippet; a new card revokes it', async () => {
    const model = await practiceModel();
    fakeService([{ poll: () => completed(1), snippet: 1 }]);
    const urls = fakeObjectUrls(['blob:keep']);
    setPath('/owned/movie.mkv');
    button('Prepare audio for practice').click();
    await waitFor(() => expect(audioEl()?.src).toBe('blob:keep'));
    rerenderApp(model); rerenderApp(model);
    expect(urls.revoke).not.toHaveBeenCalled();
    expect(audioEl()?.src).toBe('blob:keep');
    // Simulate the wake presenting a different due card.
    const other = Object.keys(model.store.snapshot().reviewCards).find(id => id !== model.practice.cardId)!;
    model.review.activeCardId = other;
    rerenderApp(model);
    expect(model.practice.cardId).toBe(other);
    expect(urls.revoke).toHaveBeenCalledWith('blob:keep');
  });

  it('(3) media path edit, mode change, view change and re-pair each revoke/invalidate', async () => {
    const model = await practiceModel();
    const pending = deferred();
    fakeService([
      { poll: () => completed(1), snippet: 1 }, { poll: () => completed(2), snippet: 2 },
      { poll: () => completed(3), snippet: 3 }, { poll: pending.promise, snippet: 4 },
    ]);
    const urls = fakeObjectUrls(['blob:p', 'blob:m', 'blob:v', 'blob:r']);
    setPath('/owned/movie.mkv');
    button('Prepare audio for practice').click();
    await waitFor(() => expect(audioEl()?.src).toBe('blob:p'));
    setPath('/owned/other.mkv');
    expect(urls.revoke).toHaveBeenCalledWith('blob:p');
    expect(audioEl()).toBeNull();

    button('Prepare audio for practice').click();
    await waitFor(() => expect(audioEl()?.src).toBe('blob:m'));
    setPracticeMode(model, 'typed-input'); rerenderApp(model);
    expect(urls.revoke).toHaveBeenCalledWith('blob:m');
    setPracticeMode(model, 'audio-recall'); rerenderApp(model);
    expect(audioEl()).toBeNull();

    button('Prepare audio for practice').click();
    await waitFor(() => expect(audioEl()?.src).toBe('blob:v'));
    setView(model, 'library'); rerenderApp(model);
    expect(urls.revoke).toHaveBeenCalledWith('blob:v');
    setView(model, 'practice'); rerenderApp(model);
    expect(audioEl()).toBeNull();

    button('Prepare audio for practice').click();
    await waitFor(() => expect(statusText()).toContain('Preparing'));
    setLocalServiceBaseUrl(model, 'http://127.0.0.1:7999');
    pairLocalService(model, SYNTHETIC_CAPABILITY);
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    rerenderApp(model);
    pending.resolve(completed(4));
    await settle();
    expect(audioEl()).toBeNull();
    expect(urls.live.size).toBe(0);
  });

  it('(3b) disconnect after ready revokes the snippet', async () => {
    const model = await practiceModel();
    fakeService([{ poll: () => completed(1), snippet: 1 }]);
    const urls = fakeObjectUrls(['blob:d']);
    setPath('/owned/movie.mkv');
    button('Prepare audio for practice').click();
    await waitFor(() => expect(audioEl()?.src).toBe('blob:d'));
    model.localService.status = 'disconnected';
    rerenderApp(model);
    expect(urls.revoke).toHaveBeenCalledWith('blob:d');
    expect(audioEl()).toBeNull();
  });

  it('(4) retrieval failure and server delete failure: visible state, no leaked URL, retry possible', async () => {
    const model = await practiceModel();
    fakeService([
      { poll: () => completed(1), snippet: 1, blobFails: true },
      { poll: () => completed(2), snippet: 2, deleteFails: true },
      { poll: () => completed(3), snippet: 3 },
    ]);
    const urls = fakeObjectUrls(['blob:ok']);
    setPath('/owned/movie.mkv');
    button('Prepare audio for practice').click();
    await waitFor(() => expect(statusText()).toContain('Local source audio preparation failed'));
    expect(audioEl()).toBeNull();
    button('Prepare audio for practice').click();
    await waitFor(() => expect(statusText()).toContain('Source snippet deletion failed.'));
    expect(audioEl()).toBeNull();
    expect(urls.create).not.toHaveBeenCalled();
    expect(button('Prepare audio for practice').disabled).toBe(false);
    button('Prepare audio for practice').click();
    await waitFor(() => expect(audioEl()?.src).toBe('blob:ok'));
    expect([...urls.live]).toEqual(['blob:ok']);
    void model;
  });

  it('(5) no autoplay, no getUserMedia, no provider calls, no transient state in export', async () => {
    const model = await practiceModel();
    const fetchImpl = fakeService([{ poll: () => completed(1), snippet: 1 }]);
    fakeObjectUrls(['blob:quiet']);
    const play = vi.fn();
    Object.defineProperty(dom.window.HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
    setPath('/owned/movie.mkv');
    button('Prepare audio for practice').click();
    await waitFor(() => expect(audioEl()?.src).toBe('blob:quiet'));
    expect(audioEl()!.autoplay).toBe(false);
    expect(audioEl()!.hasAttribute('autoplay')).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(gum).not.toHaveBeenCalled();
    for (const [input] of fetchImpl.mock.calls) expect(new URL(String(input)).hostname).toBe('127.0.0.1');
    const exported = exportLearnerState(model).manifestJson;
    const snapshot = JSON.stringify(model.store.snapshot());
    for (const text of [exported, snapshot]) {
      expect(text).not.toContain('blob:quiet');
      expect(text).not.toContain('/owned/movie.mkv');
      expect(text).not.toContain(SNIP(1));
    }
  });
});
