import { pairedModel } from './pairingFixture.ts';
import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { importBrowserLocalFiles, approveTranscriptTrack } from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-1ur: Library lists every imported media asset and collapses the transcript lifecycle tools.
const SRT = '1\n00:00:00,000 --> 00:00:01,000\nCześć.\n';
let dom: JSDOM;
let n = 0;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement,
    HTMLVideoElement: dom.window.HTMLVideoElement, File: dom.window.File, Element: dom.window.Element,
    Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, requestAnimationFrame: () => 0,
  });
  n = 0;
  Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: vi.fn(() => `blob:lt-1ur-${++n}`) });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => {
  delete (globalThis as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  dom.window.close();
});

const media = (bytes: number[], name: string) => new dom.window.File([new Uint8Array(bytes)], name, { type: 'video/webm' });
const srt = (name: string) => new dom.window.File([SRT], name, { type: 'application/x-subrip' });
const clockModel = (): AppModel => pairedModel();
async function importTwo(model: AppModel) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  await importBrowserLocalFiles(model, { mediaFile: media([1, 2, 3], 'older.webm'), targetSubtitleFile: srt('older.srt') });
  const older = model.currentMedia!;
  vi.setSystemTime(new Date('2026-10-14T12:05:00Z'));
  await importBrowserLocalFiles(model, { mediaFile: media([4, 5, 6], 'newer.webm') });
  vi.useRealTimers();
  const newer = model.currentMedia!;
  return { older, newer };
}
const library = (model: AppModel) => { model.view = 'library'; rerenderApp(model); };
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('.media-row'));
const btn = (scope: ParentNode, text: string) => Array.from(scope.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLButtonElement | undefined;
const details = () => document.querySelector('details.transcript-lifecycle-disclosure') as HTMLDetailsElement;

describe('lt-1ur Library media list', () => {
  it('lists every imported asset newest first with title, duration, status and privacy', async () => {
    const model = clockModel();
    const { older, newer } = await importTwo(model);
    library(model);
    expect(rows().map((r) => r.dataset.mediaId)).toEqual([newer.id, older.id]);
    const [first, second] = rows();
    expect(first!.querySelector('.media-row-title')?.textContent).toBe('newer');
    expect(first!.querySelector('.media-row-duration')?.textContent).toMatch(/\d/);
    expect(first!.querySelector('.media-row-status')?.textContent).toBe('transcript: none');
    expect(second!.querySelector('.media-row-status')?.textContent).toMatch(/transcript: (draft|approved)/);
    expect(first!.querySelector('.media-row-privacy')?.textContent).toBe(newer.privacyLabel);
  });

  it('shows the empty message when nothing is imported', () => {
    const model = pairedModel();
    library(model);
    expect(rows()).toHaveLength(0);
  });

  it('Open switches currentMedia and tracks, clears loop, and lands in the player at 0', async () => {
    const model = clockModel();
    const { older } = await importTwo(model);
    model.player.currentTimeMs = 4200;
    model.player.loopRange = { startMs: 0, endMs: 500 };
    library(model);
    btn(rows()[1]!, 'Open')!.click();
    expect(model.currentMedia?.id).toBe(older.id);
    expect(model.targetTrackId).not.toBeNull();
    expect(model.cues.map((c) => c.text)).toEqual(['Cześć.']);
    expect(model.player.currentTimeMs).toBe(0);
    expect(model.player.loopRange).toBeNull();
    expect(model.view).toBe('player');
  });

  it('marks only the current row with aria-current', async () => {
    const model = clockModel();
    const { newer } = await importTwo(model);
    library(model);
    const current = rows().filter((r) => r.getAttribute('aria-current') === 'true');
    expect(current.map((r) => r.dataset.mediaId)).toEqual([newer.id]);
    expect(current[0]!.classList.contains('active')).toBe(true);
  });

  it('offers Relink only for assets without a live playback URL', async () => {
    const model = clockModel();
    await importTwo(model);
    library(model);
    // Current (newer) has a live object URL; the older blob-backed one would need relinking.
    expect(btn(rows()[0]!, 'Relink')).toBeUndefined();
    expect(btn(rows()[1]!, 'Relink')).toBeTruthy();
    model.browserLocalMedia = { ...model.browserLocalMedia, objectUrl: null };
    library(model);
    expect(btn(rows()[0]!, 'Relink')).toBeTruthy();
  });
});

describe('lt-1ur transcript tools disclosure', () => {
  it('is open with no target track, open for a draft and closed once approved', async () => {
    const model = clockModel();
    await importBrowserLocalFiles(model, { mediaFile: media([7], 'solo.webm') });
    library(model);
    expect(details().open).toBe(true);
    expect(details().querySelector('summary')?.textContent).toBe('Transcript tools (ASR drafts, captions, embedded tracks)');
    expect(details().querySelector('.transcript-lifecycle-panel')).toBeTruthy();

    const approved = clockModel();
    await importBrowserLocalFiles(approved, { mediaFile: media([8], 'ok.webm'), targetSubtitleFile: srt('ok.srt') });
    const track = approved.store.getSubtitleTrack(approved.targetTrackId!)!;
    if (track.transcriptStatus !== 'approved') approveTranscriptTrack(approved, track.id);
    library(approved);
    expect(details().open).toBe(false);

    approved.store.putSubtitleTrack({ ...approved.store.getSubtitleTrack(approved.targetTrackId!)!, transcriptStatus: 'draft' });
    library(approved);
    expect(details().open).toBe(true);
  });

  it('remembers the user toggle across rerenders', async () => {
    const model = clockModel();
    await importBrowserLocalFiles(model, { mediaFile: media([9], 'x.webm') });
    library(model);
    expect(details().open).toBe(true);
    details().open = false;
    details().dispatchEvent(new dom.window.Event('toggle'));
    library(model);
    expect(details().open).toBe(false);
  });
});

describe('lt-1ur Add media card', () => {
  it('renders the error banner directly after the Add media card', () => {
    const model = pairedModel();
    model.importError = 'Synthetic import failure';
    library(model);
    const card = document.querySelector('.add-media-card')!;
    const next = card.nextElementSibling as HTMLElement;
    expect(next.classList.contains('status-banner')).toBe(true);
    expect(next.textContent).toBe('Synthetic import failure');
    expect(card.compareDocumentPosition(details()) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the persistent picker first with the recommended label when available', () => {
    Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: vi.fn() });
    const model = pairedModel();
    library(model);
    const buttons = Array.from(document.querySelectorAll('.local-import-actions button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Choose video (recommended — stays linked after reload)', 'Import local media']);
    expect(document.querySelector('label[for="local-media-file"]')?.textContent).toBe('Import copy for this session only');
  });
});

describe('lt-1ur review fixes', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  it('programmatic open at render is not remembered as a user choice (empty -> approved closes)', async () => {
    const model = clockModel();
    library(model);
    expect(details().open).toBe(true);
    // Browsers fire 'toggle' asynchronously when open is set programmatically.
    details().dispatchEvent(new dom.window.Event('toggle'));
    await tick();
    await importBrowserLocalFiles(model, { mediaFile: media([11], 'a.webm'), targetSubtitleFile: srt('a.srt') });
    const track = model.store.getSubtitleTrack(model.targetTrackId!)!;
    if (track.transcriptStatus !== 'approved') approveTranscriptTrack(model, track.id);
    library(model);
    expect(details().open).toBe(false);
    // A genuine user toggle is still remembered.
    details().open = true;
    details().dispatchEvent(new dom.window.Event('toggle'));
    library(model);
    expect(details().open).toBe(true);
  });

  it('puts Load synthetic fixture inside the Add media card', () => {
    const model = pairedModel();
    library(model);
    expect(btn(document.querySelector('.add-media-card')!, 'Load synthetic fixture')).toBeTruthy();
  });

  it('shows a Library-specific empty message', () => {
    const model = pairedModel();
    library(model);
    const list = document.querySelector('.media-list')!;
    expect(list.textContent).toContain('No media yet. Add a video below.');
    expect(list.querySelector('.video-placeholder')).toBeNull();
  });

  it('current row needing relink shows only Relink; Relink clears importError', async () => {
    const model = clockModel();
    await importTwo(model);
    model.browserLocalMedia = { ...model.browserLocalMedia, objectUrl: null };
    model.importError = 'stale';
    library(model);
    expect(btn(rows()[0]!, 'Open')).toBeUndefined();
    btn(rows()[0]!, 'Relink')!.click();
    expect(model.importError).toBeNull();
    expect(model.view).toBe('player');
  });

  it('non-current Relink with no stored handle falls back to the choose-again picker (lt-ddy.2)', async () => {
    const model = clockModel();
    const { older } = await importTwo(model);
    const picker = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(globalThis, 'showOpenFilePicker', { configurable: true, value: picker });
    library(model);
    btn(rows()[1]!, 'Relink')!.click();
    await vi.waitFor(() => expect(picker).toHaveBeenCalledTimes(1));
    expect(model.currentMedia?.id).toBe(older.id);
  });

  it('re-opening current media keeps its object URL; switching revokes the old one', async () => {
    const model = clockModel();
    const { older } = await importTwo(model);
    const url = model.browserLocalMedia.objectUrl;
    const revoke = URL.revokeObjectURL as unknown as ReturnType<typeof vi.fn>;
    revoke.mockClear();
    library(model);
    btn(rows()[0]!, 'Open')!.click();
    expect(model.browserLocalMedia.objectUrl).toBe(url);
    expect(revoke).not.toHaveBeenCalledWith(url);
    library(model);
    btn(rows()[1]!, 'Open')!.click();
    expect(model.currentMedia?.id).toBe(older.id);
    expect(revoke).toHaveBeenCalledWith(url);
  });
});
