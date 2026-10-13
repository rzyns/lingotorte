// lt-3bi: cross-surface learning-loop qualification. One synthetic library is driven through import,
// saving, review, practice, transcript correction/approval, SQLite restart + relink and metrics, on one
// model and one file-backed SQLite store. Unit coverage for each surface lives in the lt-3wr/lt-2rl/lt-0g9/
// lt-q3d/lt-aur.1/lt-n31/lt-8vu tests; this file checks that they compose. Synthetic bytes, fake object
// URLs, fake local-service fetch, temp SQLite; no providers, network, microphone or real learner data.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createReviewCardForSavedItem,
  fixedOffsetDayKey,
  importBrowserLocalFiles,
  learnerProgress,
  listReviewBuckets,
  pickNextDueCard,
  saveLexemeFromCue,
  saveSentenceFromCue,
  setLearningClock,
  setPracticeMode,
  setView,
  studyActionInstants,
  studyMetrics,
  STUDY_ESTIMATE_MS_PER_ACTION,
} from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import type { AppModel } from '../../apps/web/src/uiTypes';
import { validateSavedOccurrenceSourceContext } from '../../packages/domain/src/sourceContext.ts';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence';
import { pairedModel } from './pairingFixture.ts';

const T0 = new Date('2030-03-04T10:00:00.000Z');
const UTC = fixedOffsetDayKey(0);
const E = STUDY_ESTIMATE_MS_PER_ACTION;
const MEDIA = [11, 22, 33, 44, 55];
const TARGET = '1\n00:00:00,000 --> 00:00:01,000\nCześć, to jest test.\n\n2\n00:00:01,000 --> 00:00:02,000\nDruga linia dialogu.\n';
const NATIVE = '1\n00:00:00,000 --> 00:00:01,000\nHi, this is a test.\n\n2\n00:00:01,000 --> 00:00:02,000\nSecond dialogue line.\n';
const SNIP = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

let dom: JSDOM;
let root: string;
const live = new Set<string>();
let urlSeq = 0;

function installDom() {
  dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
  Object.defineProperty(dom.window.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  Object.assign(globalThis, {
    document: dom.window.document, window: dom.window, HTMLElement: dom.window.HTMLElement, HTMLVideoElement: dom.window.HTMLVideoElement,
    File: dom.window.File, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver,
    requestAnimationFrame: () => 0, CSS: { escape: (s: string) => s },
  });
}
const file = (bytes: number[], name: string) => new dom.window.File([new Uint8Array(bytes)], name, { type: 'video/webm' });
const srt = (text: string, name: string) => new dom.window.File([text], name, { type: 'application/x-subrip' });
function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find(b => b.textContent === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found as HTMLButtonElement;
}
function typeInto(selector: string, value: string) {
  const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  el.value = value; el.dispatchEvent(new window.Event('input'));
}
const promptText = () => document.querySelector('.practice-prompt')?.textContent ?? '';
const audioEl = () => document.querySelector('.practice-audio-recall audio') as HTMLAudioElement | null;
const statusText = () => document.querySelector('.practice-audio-recall [role="status"]')?.textContent ?? '';
const waitFor = (assertion: () => void) => vi.waitFor(assertion, { timeout: 8_000, interval: 10 });

/** Everything that defines library identity and learner history. */
function identity(model: AppModel) {
  const s = model.store.snapshot();
  return {
    media: Object.keys(s.mediaAssets).sort(), tracks: Object.keys(s.subtitleTracks).sort(), cues: Object.keys(s.cues).sort(),
    occurrences: s.savedOccurrences, items: s.savedItems, cards: s.reviewCards, states: s.reviewCardStates,
    reviewEvents: s.reviewEvents, practiceAttempts: s.practiceAttempts,
  };
}
function anchorsResolve(model: AppModel) {
  for (const occ of model.store.listSavedOccurrences()) {
    expect(() => validateSavedOccurrenceSourceContext(occ.sourceContext)).not.toThrow();
    const cue = model.store.getCue(occ.cueId)!;
    expect(cue.trackId).toBe(occ.sourceContext.subtitleTrackId);
    expect(model.store.getSubtitleTrack(occ.sourceContext.subtitleTrackId)).toBeTruthy();
    expect(model.store.getMediaAsset(occ.mediaId)!.contentSha256).toBe(occ.sourceContext.mediaFingerprint);
  }
}
/** Fake paired local-service fetch: one deferred snippet job. */
function fakeSnippetService() {
  let resolve!: (r: Response) => void;
  const poll = new Promise<Response>(r => { resolve = r; });
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/jobs') && init?.method === 'POST') return new Response(JSON.stringify({ job: { id: 'job0' } }), { status: 201 });
    if (url.endsWith('/api/jobs/job0')) return poll;
    if (url.includes('/api/snippets/')) return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(new Blob(['wav']), { status: 200 });
    return new Response(null, { status: 404 });
  }));
  return () => resolve(new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: SNIP(1), url: `/api/snippets/${SNIP(1)}`, mimeType: 'audio/wav' } } }), { status: 200 }));
}

describe('lt-3bi cross-surface learning loop', { timeout: 60_000 }, () => {
  beforeEach(() => {
    installDom();
    root = mkdtempSync(join(tmpdir(), 'lt-3bi-'));
    live.clear(); urlSeq = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { const u = `blob:lt-3bi-${++urlSeq}`; live.add(u); return u; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => { live.delete(u); });
  });
  afterEach(() => {
    vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
    dom.window.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('import → save → review (mature + live due) → practice → correct/approve → SQLite restart + relink → honest metrics', async () => {
    vi.useFakeTimers({ now: T0, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const model = pairedModel();

    // 1. Import owned synthetic media + subtitles, then save four items with distinct cards.
    await importBrowserLocalFiles(model, { mediaFile: file(MEDIA, 'episode.webm'), targetSubtitleFile: srt(TARGET, 'episode.pl.srt'), nativeSubtitleFile: srt(NATIVE, 'episode.en.srt') });
    const mediaId = model.currentMedia!.id;
    const v1 = model.targetTrackId!;
    const [cueA, cueB] = model.cues;
    const card = (item: NonNullable<Awaited<ReturnType<typeof saveSentenceFromCue>>>) =>
      createReviewCardForSavedItem(model, item, model.savedOccurrenceService.listOccurrencesForItem(item.id)[0]!).id;
    const mature = card((await saveSentenceFromCue(model, cueA!))!);
    const fresh = card((await saveSentenceFromCue(model, cueB!))!);
    const lexA = card(saveLexemeFromCue(model, cueA!, 'Cześć', 0, 5, 0)!);
    const lexB = card(saveLexemeFromCue(model, cueB!, 'Druga', 0, 5, 0)!);
    // Defer the two lexeme cards to later in the session; age `mature` into an overdue 30-day review card.
    const setState = (id: string, patch: object) => model.store.putReviewCardState({ ...model.store.getReviewCardState(id)!, ...patch });
    setState(mature, { state: 'review', scheduledDays: 30, dueAt: new Date(T0.valueOf() - 86_400_000).toISOString() });
    const later = new Date(T0.valueOf() + 3_600_000).toISOString();
    setState(lexA, { dueAt: later }); setState(lexB, { dueAt: later });
    expect(listReviewBuckets(model, T0).mastered.map(x => x.card.id)).toEqual([mature]);
    expect(learnerProgress(model, T0).dueCards).toBe(2);
    expect(model.reviewService.listDueCards(T0).map(x => x.card.id).sort()).toEqual([mature, fresh].sort());

    // 2. Review two successive cards on the live clock; the mature overdue card is presented, not hidden.
    setView(model, 'review'); rerenderApp(model);
    const rate = (r: 'Again' | 'Good') => { if (!document.querySelector('.review-buttons')) button('Show answer / context').click(); button(r).click(); };
    const shown: string[] = [];
    vi.advanceTimersByTime(4_000); rerenderApp(model);
    shown.push(model.review.activeCardId!); rate('Again');
    vi.advanceTimersByTime(3_000); rerenderApp(model);
    shown.push(model.review.activeCardId!); rate('Good');
    expect(shown).toEqual([fresh, mature]);
    const stamps = model.store.snapshot().reviewEvents.map(e => [e.cardId, e.reviewedAt]);
    expect(stamps).toEqual([[fresh, new Date(T0.valueOf() + 4_000).toISOString()], [mature, new Date(T0.valueOf() + 7_000).toISOString()]]);
    expect(Date.parse(model.store.getReviewCardState(mature)!.dueAt)).toBeGreaterThan(Date.now() + 86_400_000);
    // The relearning/learning `fresh` card becomes due while Review stays open, without a reload.
    const freshDue = Date.parse(model.store.getReviewCardState(fresh)!.dueAt);
    expect(document.querySelector('.review-prompt')).toBeNull();
    vi.advanceTimersByTime(freshDue - Date.now());
    expect(model.review.activeCardId).toBe(fresh);
    expect(document.querySelector('.review-prompt')).not.toBeNull();
    rate('Good');
    expect(model.store.listReviewEventsForCard(fresh).map(e => e.reviewedAt)).toHaveLength(2);
    vi.useRealTimers();

    // 3. Practice: the lexeme cards come due; source audio, masking, per-card reset and stale completion.
    let now = Date.parse(later) + 1_000;
    setLearningClock(model, () => new Date(now));
    model.localService.status = 'connected';
    model.localService.pathPolicy = { version: 1, platform: 'linux', fullyQualifiedOnly: true, uncAllowed: false };
    const resolveSnippet = fakeSnippetService();
    setPracticeMode(model, 'audio-recall'); setView(model, 'practice'); rerenderApp(model);
    const p1 = model.review.activeCardId!;
    expect([lexA, lexB]).toContain(p1);
    typeInto('#practice-audio-media-path', '/owned/episode.webm');
    button('Prepare source audio').click();
    await waitFor(() => expect(statusText()).toContain('Preparing'));
    // Changing mode while the snippet is pending must discard the late completion and leak no URL.
    setPracticeMode(model, 'typed-input'); rerenderApp(model);
    const before = live.size;
    resolveSnippet();
    for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0));
    expect(audioEl()).toBeNull();
    expect(live.size).toBe(before);
    expect([...live].every(u => u === model.browserLocalMedia.objectUrl)).toBe(true);

    const p1Expected = model.store.getSavedItem(model.store.getReviewCard(p1)!.savedItemId)!.displayText;
    expect(model.review.activeCardId).toBe(p1);
    expect(promptText()).not.toContain(p1Expected);
    typeInto('#practice-answer', p1Expected);
    now += 2_000; button('Submit attempt').click();
    const p2 = model.review.activeCardId!;
    expect(p2).not.toBe(p1);
    expect([lexA, lexB]).toContain(p2);
    expect((document.getElementById('practice-answer') as HTMLInputElement).value).toBe('');
    // Sentence-builder on the second card: fresh token pool for that card's cue, no carried-over order.
    setPracticeMode(model, 'sentence-builder'); rerenderApp(model);
    const p2Cue = model.store.getCue(model.store.getSavedOccurrence(model.store.getReviewCard(p2)!.savedOccurrenceId)!.cueId)!;
    const pool = () => Array.from(document.querySelectorAll('.sentence-builder-token--pool')).map(b => b.textContent!);
    expect([...pool()].sort()).toEqual(p2Cue.text.split(/\s+/).sort());
    expect(document.querySelectorAll('.sentence-builder-token--ordered')).toHaveLength(0);
    expect(promptText()).not.toContain(p2Cue.text);
    for (const token of p2Cue.text.split(/\s+/)) (Array.from(document.querySelectorAll('.sentence-builder-token--pool')).find(b => b.textContent === token) as HTMLButtonElement).click();
    now += 2_000; button('Submit attempt').click();
    const attempts = model.store.snapshot().practiceAttempts;
    expect(attempts.map(a => [a.cardId, a.mode, a.result, a.reviewedAt])).toEqual([
      [p1, 'typed-input', 'pass', new Date(now - 2_000).toISOString()],
      [p2, 'sentence-builder', 'pass', new Date(now).toISOString()],
    ]);
    expect(attempts.every(a => a.eventLink?.reviewEventId)).toBe(true);

    // 4. Dirty transcript edit blocks approval; Apply → approve; saved anchors keep resolving to V1.
    const anchorsBefore = structuredClone(model.store.listSavedOccurrences());
    const { createCorrectedTranscriptVersion } = await import('../../apps/web/src/model');
    const v2 = (await createCorrectedTranscriptVersion(model, v1, [{ cueId: cueB!.id, text: 'Druga linia poprawiona.' }])).track.id;
    expect(model.targetTrackId).toBe(v2);
    setView(model, 'library'); rerenderApp(model);
    typeInto('[name="transcript-correction-cue-1"]', 'Cześć, to jest poprawka.');
    expect(button('Approve transcript for study').disabled).toBe(true);
    button('Create corrected transcript version').click();
    await waitFor(() => expect(model.targetTrackId).not.toBe(v2));
    const v3 = model.targetTrackId!;
    expect(button('Approve transcript for study').disabled).toBe(false);
    button('Approve transcript for study').click();
    expect(model.store.getSubtitleTrack(v3)!.transcriptStatus).toBe('approved');
    expect(model.store.listCuesForTrack(v3).map(c => c.text)).toEqual(['Cześć, to jest poprawka.', 'Druga linia poprawiona.']);
    expect(model.store.listSavedOccurrences()).toEqual(anchorsBefore);
    anchorsResolve(model);

    // 5. Persist to file-backed SQLite, restart into a fresh model and relink a renamed identical file.
    const dbPath = join(root, 'state.sqlite');
    const db = SqliteLocalPersistence.open(dbPath);
    try { db.saveStore(model.store); } finally { db.close(); }
    const expected = identity(model);
    const metricsBefore = studyMetrics(model, new Date(now), UTC);
    dom.window.close(); installDom();
    const restarted = pairedModel();
    setLearningClock(restarted, () => new Date(now));
    const reopened = SqliteLocalPersistence.open(dbPath);
    try { restarted.store.replaceSnapshot(reopened.loadSnapshot()); } finally { reopened.close(); }
    expect(identity(restarted)).toEqual(expected);
    await importBrowserLocalFiles(restarted, { mediaFile: file(MEDIA, 'renamed-on-disk.webm') });
    expect(restarted.importError).toBeNull();
    expect(restarted.currentMedia!.id).toBe(mediaId);
    expect([v1, v2, v3]).toContain(restarted.targetTrackId);
    expect(identity(restarted)).toEqual(expected);
    anchorsResolve(restarted);
    // Relinked identical subtitles too: still no duplicate tracks/cues.
    await importBrowserLocalFiles(restarted, { mediaFile: file(MEDIA, 'renamed-on-disk.webm'), targetSubtitleFile: srt(TARGET, 'x.pl.srt'), nativeSubtitleFile: srt(NATIVE, 'x.en.srt') });
    expect(identity(restarted)).toEqual(expected);

    // 6. Honest metrics: labelled estimates; a practice attempt and its linked review event count once.
    const s = restarted.store.snapshot();
    const linked = new Set(s.practiceAttempts.map(a => a.eventLink?.reviewEventId));
    expect(s.reviewEvents).toHaveLength(5);
    expect(s.reviewEvents.filter(e => linked.has(e.id))).toHaveLength(2);
    expect(studyActionInstants(s.reviewEvents, s.practiceAttempts)).toHaveLength(5);
    const metrics = studyMetrics(restarted, new Date(now), UTC);
    expect(metrics).toEqual(metricsBefore);
    expect(metrics.totalStudyTimeMs).toBe(5 * E);
    expect(metrics.todayStudyTimeMs).toBe(5 * E);
    expect(metrics.streakDays).toBe(1);
    setView(restarted, 'player'); rerenderApp(restarted); // the study status rail lives in the Player cockpit
    const estimate = document.querySelector('[data-estimate="true"]')!;
    expect(estimate.textContent).toContain('(estimated)');
    expect(estimate.getAttribute('aria-label')).toMatch(/^Estimated study time/);

    // 7. Reload persisted state once more after the relink and recheck everything.
    const db2 = SqliteLocalPersistence.open(dbPath);
    try {
      db2.saveStore(restarted.store);
      expect(db2.loadSnapshot()).toEqual(restarted.store.snapshot());
      expect(db2.listPracticeAttempts().map(a => a.mode).sort()).toEqual(['sentence-builder', 'typed-input']);
      expect(db2.listMediaAssets().map(m => m.id)).toEqual([mediaId]);
    } finally { db2.close(); }
    // After reload the frontend queue still agrees with the backend: only the short-interval learning card is due.
    const asOf = new Date(now);
    expect(restarted.reviewService.listDueCards(asOf).map(x => x.card.id)).toEqual([fresh]);
    expect(learnerProgress(restarted, asOf).dueCards).toBe(1);
    expect(pickNextDueCard(restarted, asOf)?.card.id).toBe(fresh);
  });
});
