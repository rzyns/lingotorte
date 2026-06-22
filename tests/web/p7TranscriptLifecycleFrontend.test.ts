import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeMediaAsset } from '@lingotorte/domain';
import { approveTranscriptTrack, createAppModel } from '../../apps/web/src/model';
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
  for (let i = 0; i < 20; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(predicate()).toBe(true);
}

describe('P7 transcript lifecycle frontend', () => {
  let dom: ReturnType<typeof setupDom> extends Promise<infer T> ? T : never;
  let previousFetch: typeof globalThis.fetch | undefined;

  beforeEach(async () => {
    previousFetch = globalThis.fetch;
    dom = await setupDom();
  });

  afterEach(() => {
    if (previousFetch) {
      globalThis.fetch = previousFetch;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as Partial<typeof globalThis>).fetch;
    }
    dom.window.close();
  });

  it('keeps provider captions in draft state until the learner corrects and approves them', async () => {
    const model = createAppModel();
    model.view = 'library';
    rerenderApp(model);

    expect(document.getElementById('app')?.textContent).toContain('Transcript lifecycle');
    const importWithoutAuth = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Import fake YouTube caption draft') as HTMLButtonElement | null;
    expect(importWithoutAuth).toBeTruthy();
    importWithoutAuth!.click();
    await waitFor(() => Boolean(model.importError));
    expect(model.importError).toMatch(/authorization/i);
    expect(model.cues).toHaveLength(0);

    const urlInput = document.querySelector('input[name="youtube-caption-url"]') as HTMLInputElement | null;
    const authCheckbox = document.querySelector('input[name="youtube-public-read-auth"]') as HTMLInputElement | null;
    expect(urlInput).toBeTruthy();
    expect(authCheckbox).toBeTruthy();
    urlInput!.value = 'https://www.youtube.com/watch?v=abcdefghijk';
    urlInput!.dispatchEvent(new dom.window.Event('input'));
    authCheckbox!.checked = true;
    authCheckbox!.dispatchEvent(new dom.window.Event('change'));

    const importWithAuth = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Import fake YouTube caption draft') as HTMLButtonElement;
    importWithAuth.click();
    await waitFor(() => model.cues.length === 2);

    expect(model.store.getSubtitleTrack(model.targetTrackId!)?.transcriptStatus).toBe('draft');
    expect(document.getElementById('app')?.textContent).toContain('Draft transcript imported');
    expect(model.currentMedia?.originalPath).toBe('youtube:abcdefghijk');

    const playerButton = Array.from(document.querySelectorAll('nav button')).find((button) => button.textContent === 'Player') as HTMLButtonElement | null;
    playerButton?.click();
    expect(document.getElementById('app')?.textContent).toContain('Draft transcript: correct and approve before study use.');
    const draftSave = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Save sentence') as HTMLButtonElement | null;
    expect(draftSave?.disabled).toBe(true);

    const libraryButton = Array.from(document.querySelectorAll('nav button')).find((button) => button.textContent === 'Library') as HTMLButtonElement | null;
    libraryButton?.click();
    const correction = document.querySelector('textarea[name="transcript-correction-cue-1"]') as HTMLTextAreaElement | null;
    expect(correction).toBeTruthy();
    const startTiming = document.querySelector('input[name="transcript-correction-cue-1-start-ms"]') as HTMLInputElement | null;
    const endTiming = document.querySelector('input[name="transcript-correction-cue-1-end-ms"]') as HTMLInputElement | null;
    expect(startTiming).toBeTruthy();
    expect(endTiming).toBeTruthy();
    correction!.value = 'Corrected provider caption.';
    correction!.dispatchEvent(new dom.window.Event('input'));
    startTiming!.value = '100';
    startTiming!.dispatchEvent(new dom.window.Event('input'));
    endTiming!.value = '1900';
    endTiming!.dispatchEvent(new dom.window.Event('input'));

    const correctButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Create corrected transcript version') as HTMLButtonElement | null;
    correctButton?.click();
    await waitFor(() => model.store.getSubtitleTrack(model.targetTrackId!)?.transcriptStatus === 'correcting');
    expect(document.getElementById('app')?.textContent).toContain('Corrected transcript version created');
    expect(model.cues[0]).toMatchObject({ text: 'Corrected provider caption.', startMs: 100, endMs: 1900 });
    const sourceComparison = document.querySelector('.source-comparison');
    expect(sourceComparison?.textContent).toContain('Source comparison');
    expect(sourceComparison?.textContent).toContain('Provider caption draft.');

    const approveButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Approve transcript for study') as HTMLButtonElement | null;
    approveButton?.click();
    await waitFor(() => model.store.getSubtitleTrack(model.targetTrackId!)?.transcriptStatus === 'approved');
    expect(document.getElementById('app')?.textContent).toContain('Transcript approved for study');

    playerButton?.click();
    const approvedSave = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Save sentence') as HTMLButtonElement | null;
    expect(approvedSave?.disabled).toBe(false);
    approvedSave?.click();
    await waitFor(() => Object.values(model.store.snapshot().savedItems).length === 1);
    expect(Object.values(model.store.snapshot().savedItems)[0]?.displayText).toBe('Corrected provider caption.');
  });

  it('generates local ASR drafts through the loopback service job API', async () => {
    const model = createAppModel();
    model.view = 'library';
    const ownedMedia = makeMediaAsset({
      title: 'Owned local clip',
      originalPath: '/home/openclaw/private/owned-local-clip.webm',
      contentSha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      durationMs: 2000,
      container: 'webm',
      sizeBytes: 1234,
      privacyLabel: 'owned',
    });
    model.store.putMediaAsset(ownedMedia);
    model.currentMedia = ownedMedia;
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === 'http://127.0.0.1:5174/api/jobs' && init?.method === 'POST') {
        return new Response(JSON.stringify({
          ok: true,
          job: { id: 'job-local-asr-1', kind: 'local-transcription', status: 'queued' },
        }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      if (url === 'http://127.0.0.1:5174/api/jobs/job-local-asr-1') {
        return new Response(JSON.stringify({
          ok: true,
          job: {
            id: 'job-local-asr-1',
            kind: 'local-transcription',
            status: 'completed',
            result: {
              transcript: {
                engine: 'whisperx',
                modelName: 'whisperx-align-pl',
                modelVersion: 'fake-service-1',
                language: 'pl',
                segments: [{
                  startMs: 0,
                  endMs: 1300,
                  text: 'Serwis lokalny.',
                  words: [{
                    wordIndex: 0,
                    text: 'Serwis',
                    charStart: 0,
                    charEnd: 6,
                    startMs: 50,
                    endMs: 610,
                    confidence: 0.96,
                    speakerId: 'speaker_0',
                    sourceKind: 'forced-alignment',
                  }, {
                    wordIndex: 1,
                    text: 'lokalny',
                    charStart: 7,
                    charEnd: 14,
                    startMs: 700,
                    endMs: 1250,
                    confidence: 0.94,
                    speakerId: 'speaker_0',
                    sourceKind: 'forced-alignment',
                  }],
                }],
              },
            },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: false, error: `Unexpected ${url}` }), { status: 500 });
    }) as typeof fetch;

    rerenderApp(model);
    const asrButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Generate local ASR draft') as HTMLButtonElement | null;
    expect(asrButton).toBeTruthy();
    asrButton!.click();
    await waitFor(() => model.cues.length === 1);

    const createBody = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>;
    expect(createBody).toMatchObject({
      kind: 'local-transcription',
      payload: {
        mediaPath: ownedMedia.originalPath,
        language: 'pl',
        modelName: 'tiny',
        alignWords: true,
      },
    });
    expect(requests.map((request) => request.url)).toEqual([
      'http://127.0.0.1:5174/api/jobs',
      'http://127.0.0.1:5174/api/jobs/job-local-asr-1',
    ]);
    expect(model.store.getSubtitleTrack(model.targetTrackId!)?.transcriptStatus).toBe('draft');
    expect(model.cues[0]?.text).toBe('Serwis lokalny.');
    expect(model.store.listTranscriptWordTimingsForTrack(model.targetTrackId!)[0]).toMatchObject({
      text: 'Serwis',
      sourceKind: 'forced-alignment',
      engine: 'whisperx',
      modelName: 'whisperx-align-pl',
      modelVersion: 'fake-service-1',
    });
    expect(document.getElementById('app')?.textContent).toContain('Local service ASR draft generated');

    const secondWordStart = document.querySelector('input[name="transcript-word-timing-cue-1-word-1-start-ms"]') as HTMLInputElement | null;
    const secondWordEnd = document.querySelector('input[name="transcript-word-timing-cue-1-word-1-end-ms"]') as HTMLInputElement | null;
    expect(secondWordStart).toBeTruthy();
    expect(secondWordEnd).toBeTruthy();
    secondWordStart!.value = '650';
    secondWordStart!.dispatchEvent(new dom.window.Event('input'));
    secondWordEnd!.value = '1260';
    secondWordEnd!.dispatchEvent(new dom.window.Event('input'));
    const correctButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Create corrected transcript version') as HTMLButtonElement | null;
    expect(correctButton).toBeTruthy();
    correctButton!.click();
    await waitFor(() => model.store.getSubtitleTrack(model.targetTrackId!)?.transcriptStatus === 'correcting');
    const correctedTimings = model.store.listTranscriptWordTimingsForTrack(model.targetTrackId!);
    expect(correctedTimings[1]).toMatchObject({
      text: 'lokalny',
      startMs: 650,
      endMs: 1260,
      sourceKind: 'manual-edit',
      engine: 'manual-correction',
      modelName: 'correction-editor',
    });

    approveTranscriptTrack(model, model.targetTrackId!);
    const playerButton = Array.from(document.querySelectorAll('nav button')).find((button) => button.textContent === 'Player') as HTMLButtonElement | null;
    playerButton?.click();

    const timedWordButtons = Array.from(document.querySelectorAll('button.timed-word')) as HTMLButtonElement[];
    expect(timedWordButtons.map((button) => button.textContent)).toEqual(['Serwis', 'lokalny']);
    const lokalnyButton = timedWordButtons.find((button) => button.textContent === 'lokalny')!;
    lokalnyButton.click();
    expect(model.player.currentTimeMs).toBe(650);
    expect(model.selection).toMatchObject({ text: 'lokalny', charStart: 7, charEnd: 14 });

    const saveOccurrenceButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Save occurrence') as HTMLButtonElement | null;
    expect(saveOccurrenceButton).toBeTruthy();
    saveOccurrenceButton!.click();
    await waitFor(() => Object.values(model.store.snapshot().savedOccurrences).length === 1);
    const occurrence = Object.values(model.store.snapshot().savedOccurrences)[0]!;
    expect(occurrence.selectionText).toBe('lokalny');
    expect(occurrence.startMs).toBe(650);
    expect(occurrence.endMs).toBe(1260);
    expect(occurrence.sourceContext.timeRangeMs).toEqual({ start: 650, end: 1260 });
  });

  it('splits and merges transcript cues into immutable corrected versions', async () => {
    const model = createAppModel();
    model.view = 'library';
    rerenderApp(model);

    const urlInput = document.querySelector('input[name="youtube-caption-url"]') as HTMLInputElement;
    const authCheckbox = document.querySelector('input[name="youtube-public-read-auth"]') as HTMLInputElement;
    urlInput.value = 'https://www.youtube.com/watch?v=abcdefghijk';
    urlInput.dispatchEvent(new dom.window.Event('input'));
    authCheckbox.checked = true;
    authCheckbox.dispatchEvent(new dom.window.Event('change'));
    const importWithAuth = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Import fake YouTube caption draft') as HTMLButtonElement;
    importWithAuth.click();
    await waitFor(() => model.cues.length === 2);
    const parentTrackId = model.targetTrackId!;

    await waitFor(() => Boolean(Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Split cue 1')));
    const splitButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Split cue 1') as HTMLButtonElement | null;
    expect(splitButton).toBeTruthy();
    splitButton!.click();
    await waitFor(() => model.cues.length === 3);
    expect(model.store.getSubtitleTrack(model.targetTrackId!)?.transcriptStatus).toBe('correcting');
    expect(model.store.getSubtitleTrack(model.targetTrackId!)?.provenance.parentTrackId).toBe(parentTrackId);
    expect(model.cues.map((cue) => cue.cueIndex)).toEqual([1, 2, 3]);
    expect(model.cues[0]!.endMs).toBeLessThanOrEqual(model.cues[1]!.startMs);
    expect(model.cues[0]!.text.length).toBeGreaterThan(0);
    expect(model.cues[1]!.text.length).toBeGreaterThan(0);

    const splitTrackId = model.targetTrackId!;
    const mergeButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Merge cue 1 with next') as HTMLButtonElement | null;
    expect(mergeButton).toBeTruthy();
    mergeButton!.click();
    await waitFor(() => model.targetTrackId !== splitTrackId && model.cues.length === 2);
    expect(model.store.getSubtitleTrack(model.targetTrackId!)?.transcriptStatus).toBe('correcting');
    expect(model.store.getSubtitleTrack(model.targetTrackId!)?.provenance.parentTrackId).toBe(splitTrackId);
    expect(model.cues[0]!.text).toContain('Provider caption draft.');
  });
});
