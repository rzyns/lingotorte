// lt-584.5 (relational-authority C4, Janusz option A 2026-10-20): per-media transcript loading, bundle-first saves and
// snapshot cache v2, driven against the REAL local service (startLingotorteLocalService) like localServiceSync.
import { captureSentence } from '../helpers/capture';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  connectLocalService, createAppModel, importFixtureMediaAndSubtitles, mediaTranscriptsLoaded, openMediaAsset, pairLocalService,
  pendingTranscriptTrackIds, resolveLocalServiceConnection, saveModelToLocalService, setLocalServiceAutosave, setReviewBucketAsOf, setView,
} from '../../apps/web/src/model';
import { bootSnapshotCache, buildSnapshotCacheRecord, SNAPSHOT_CACHE_KEY, type SnapshotCacheBackend } from '../../apps/web/src/browserSnapshotCache';
import { rerenderApp } from '../../apps/web/src/app';
import { startLingotorteLocalService } from '../../apps/local-service/src/server';
import type { AppModel } from '../../apps/web/src/uiTypes';

const media = 'fixtures/media/synthetic-polish-dialogue.webm';
const target = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const native = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';
const importFixture = (model: AppModel) => importFixtureMediaAndSubtitles(model, media, target, native);

class MemoryBackend implements SnapshotCacheBackend {
  data = new Map<string, unknown>();
  async get(key: string) { return this.data.has(key) ? structuredClone(this.data.get(key)) : undefined; }
  async put(key: string, value: unknown) { this.data.set(key, structuredClone(value)); }
  async delete(key: string) { this.data.delete(key); }
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', { pretendToBeVisual: true, url: 'http://localhost:5173/' });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.CSS = { escape: (value: string) => value.replace(/"/g, '\\"') } as unknown as typeof CSS;
  return dom;
}

async function startService() {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-transcript-loading-'));
  let capability = '';
  const service = await startLingotorteLocalService({ host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false },
    { receiveCapability(value) { capability = value; } });
  return { service, root, pair(model: AppModel) { pairLocalService(model, capability, service.origin); } };
}

/** Wraps the real fetch and records `METHOD /path status` for every service request. */
function recordRequests() {
  const realFetch = globalThis.fetch;
  const log: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const reply = await realFetch(input, init);
    log.push(`${init?.method ?? 'GET'} ${new URL(String(input)).pathname} ${reply.status}`);
    return reply;
  }));
  return log;
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.unstubAllGlobals(); while (cleanups.length > 0) await cleanups.pop()!(); });

/** Two media saved by a seeding browser: m1 (older, holds a saved sentence) and m2 (newer, the default current media). */
async function seededService() {
  const started = await startService();
  cleanups.push(async () => { await started.service.close(); await rm(started.root, { recursive: true, force: true }); });
  const seed = createAppModel(); started.pair(seed); setLocalServiceAutosave(seed, false);
  await importFixture(seed);
  const m1 = seed.currentMedia!; const m1Cue = seed.cues[0]!;
  const item = await captureSentence(seed, m1Cue);
  if (!item) throw new Error('Expected a saved sentence');
  await new Promise((resolve) => setTimeout(resolve, 5));
  await importFixture(seed);
  const m2 = seed.currentMedia!;
  expect(m2.id).not.toBe(m1.id);
  expect((await saveModelToLocalService(seed, started.service.origin)).ok).toBe(true);
  const occurrence = seed.savedOccurrenceService.listOccurrencesForItem(item.id)[0]!;
  return { ...started, seed, m1, m2, m1Cue, occurrence };
}

async function freshConnected(env: Awaited<ReturnType<typeof seededService>>) {
  const model = createAppModel(); env.pair(model); setLocalServiceAutosave(model, false);
  expect((await connectLocalService(model, env.service.origin)).ok).toBe(true);
  return model;
}

const transcriptGets = (log: readonly string[]) => log.filter((line) => /^GET \/api\/media\/[0-9a-f-]+\/transcripts /.test(line));

describe('lt-584.5 per-media transcript loading', () => {
  it('connect loads only the current media; opening another media GETs once; opening it again GETs nothing', async () => {
    const env = await seededService();
    const log = recordRequests();
    const model = await freshConnected(env);
    expect(model.currentMedia?.id).toBe(env.m2.id);
    expect(transcriptGets(log)).toEqual([`GET /api/media/${env.m2.id}/transcripts 200`]);
    expect(model.cues.length).toBeGreaterThan(0);
    expect(mediaTranscriptsLoaded(model, env.m1.id)).toBe(false);
    expect(Object.values(model.store.snapshot().cues).some((cue) => cue.id === env.m1Cue.id)).toBe(false);
    log.length = 0;
    expect(await openMediaAsset(model, env.m1.id)).toBe(true);
    expect(transcriptGets(log)).toEqual([`GET /api/media/${env.m1.id}/transcripts 200`]);
    expect(model.currentMedia?.id).toBe(env.m1.id);
    expect(model.cues.map((cue) => cue.id)).toContain(env.m1Cue.id);
    expect(model.transcriptLoading).toBeNull();
    log.length = 0;
    expect(await openMediaAsset(model, env.m1.id)).toBe(true);
    expect(await openMediaAsset(model, env.m2.id)).toBe(true);
    expect(log).toEqual([]);
    // Loading transcripts is not an edit: nothing is pending and the learner state stays clean.
    expect(pendingTranscriptTrackIds(model)).toEqual([]);
    expect(model.localService.syncState).toBe('idle');
  });

  it('unpaired: an import keeps its cues in memory and in the v2 cache across a simulated reload', async () => {
    const model = createAppModel();
    await importFixture(model);
    const cues = model.store.snapshot().cues;
    expect(Object.keys(cues).length).toBeGreaterThan(0);
    const record = buildSnapshotCacheRecord(model);
    expect(record.schemaVersion).toBe(2);
    expect(record.snapshot.cues).toEqual(cues);
    expect(record.pendingTranscriptTrackIds).toEqual([model.targetTrackId!, model.nativeTrackId!].sort());
    const backend = new MemoryBackend(); backend.data.set(SNAPSHOT_CACHE_KEY, record);
    const reloaded = createAppModel();
    expect(await bootSnapshotCache(reloaded, backend)).toBe(true);
    expect(reloaded.store.snapshot().cues).toEqual(cues);
    expect(reloaded.cues.length).toBeGreaterThan(0);
    expect(pendingTranscriptTrackIds(reloaded)).toEqual(record.pendingTranscriptTrackIds);
  });

  it('acknowledged bundles are absent from the v2 cache record; unacknowledged ones stay with the pending list', async () => {
    const env = await seededService();
    const model = await freshConnected(env);
    const loaded = buildSnapshotCacheRecord(model);
    expect(loaded.snapshot.cues).toEqual({});
    expect(loaded.snapshot.transcriptWordTimings).toEqual({});
    expect(loaded.pendingTranscriptTrackIds).toEqual([]);
    expect(Object.keys(loaded.snapshot.subtitleTracks).length).toBe(4);
    await importFixture(model); // autosave off: the new bundles are not sent yet
    const pending = buildSnapshotCacheRecord(model);
    expect(pending.pendingTranscriptTrackIds).toEqual([model.targetTrackId!, model.nativeTrackId!].sort());
    expect(new Set(Object.values(pending.snapshot.cues).map((cue) => cue.trackId))).toEqual(new Set(pending.pendingTranscriptTrackIds));
    // Seeding saved the bundles, so the seeding browser caches none of them.
    expect(buildSnapshotCacheRecord(env.seed).snapshot.cues).toEqual({});
  });

  it('new bundles are PUT before the learner state that references them', async () => {
    const env = await startService();
    cleanups.push(async () => { await env.service.close(); await rm(env.root, { recursive: true, force: true }); });
    const model = createAppModel(); env.pair(model); setLocalServiceAutosave(model, false);
    expect((await connectLocalService(model, env.service.origin)).ok).toBe(true);
    await importFixture(model);
    const log = recordRequests();
    expect((await saveModelToLocalService(model)).ok).toBe(true);
    const writes = log.filter((line) => line.startsWith('PUT '));
    expect(writes).toEqual([
      ...[model.nativeTrackId!, model.targetTrackId!].sort().map((id) => `PUT /api/tracks/${id}/transcript 200`),
      'PUT /api/state 200',
    ]);
    expect(pendingTranscriptTrackIds(model)).toEqual([]);
    expect(model.localService.syncState).toBe('saved');
  });

  it('a bundle created while unpaired is flushed on the first paired save after a simulated reload', async () => {
    const env = await startService();
    cleanups.push(async () => { await env.service.close(); await rm(env.root, { recursive: true, force: true }); });
    const offline = createAppModel();
    await importFixture(offline);
    const backend = new MemoryBackend(); backend.data.set(SNAPSHOT_CACHE_KEY, buildSnapshotCacheRecord(offline));
    const reloaded = createAppModel();
    expect(await bootSnapshotCache(reloaded, backend)).toBe(true);
    env.pair(reloaded); setLocalServiceAutosave(reloaded, false);
    expect((await connectLocalService(reloaded, env.service.origin)).ok).toBe(true);
    expect(pendingTranscriptTrackIds(reloaded)).toEqual([offline.targetTrackId!, offline.nativeTrackId!].sort());
    const log = recordRequests();
    expect((await saveModelToLocalService(reloaded)).ok).toBe(true);
    expect(log.filter((line) => line.startsWith('PUT ')).at(-1)).toBe('PUT /api/state 200');
    expect(log.filter((line) => line.startsWith('PUT /api/tracks/'))).toHaveLength(2);
    vi.unstubAllGlobals();
    const durable = createAppModel(); env.pair(durable);
    expect((await connectLocalService(durable, env.service.origin)).ok).toBe(true);
    expect(durable.store.snapshot().cues).toEqual(offline.store.snapshot().cues);
    expect(durable.store.snapshot().subtitleTracks).toEqual(offline.store.snapshot().subtitleTracks);
  });

  it('a 409 on flush is verified: an identical stored bundle is acknowledged, a different one stops the save', async () => {
    const env = await seededService();
    // A browser that cached the seed's work before it was saved: every bundle is pending here.
    const unsaved = createAppModel();
    unsaved.store.replaceSnapshot(env.seed.store.snapshot());
    const backend = new MemoryBackend(); backend.data.set(SNAPSHOT_CACHE_KEY, buildSnapshotCacheRecord(unsaved));
    const keepBrowserWork = async () => {
      const model = createAppModel();
      expect(await bootSnapshotCache(model, backend)).toBe(true);
      env.pair(model); setLocalServiceAutosave(model, false);
      await connectLocalService(model, env.service.origin);
      if (model.localService.syncState === 'choice') expect(resolveLocalServiceConnection(model, 'browser').ok).toBe(true);
      return model;
    };
    const reloaded = await keepBrowserWork();
    const allTracks = Object.keys(env.seed.store.snapshot().subtitleTracks).sort();
    expect(pendingTranscriptTrackIds(reloaded)).toEqual(allTracks);
    // A different local copy of one bundle is refused, nothing is overwritten and the learner state is not sent.
    const m1Track = Object.values(reloaded.store.snapshot().subtitleTracks).find((track) => track.mediaId === env.m1.id)!.id;
    const changed = reloaded.store.listCuesForTrack(m1Track)[0]!;
    reloaded.store.putCue({ ...changed, text: 'Zmieniony tekst' });
    let log = recordRequests();
    expect((await saveModelToLocalService(reloaded)).ok).toBe(false);
    expect(reloaded.localService.lastMessage).toMatch(/different transcript/);
    expect(log).toContain(`PUT /api/tracks/${m1Track}/transcript 409`);
    expect(log.some((line) => line.startsWith('PUT /api/state'))).toBe(false);
    expect(pendingTranscriptTrackIds(reloaded)).toContain(m1Track);
    vi.unstubAllGlobals();
    const stored = createAppModel(); env.pair(stored); await connectLocalService(stored, env.service.origin); await openMediaAsset(stored, env.m1.id);
    expect(stored.store.getCue(changed.id)?.text).toBe(changed.text);
    // Identical bundles: 409 bundle-exists, verified by GET at the same revision, acknowledged, then the learner state.
    const again = await keepBrowserWork();
    log = recordRequests();
    expect((await saveModelToLocalService(again)).ok).toBe(true);
    expect(log).toContain(`PUT /api/tracks/${m1Track}/transcript 409`);
    expect(log).toContain(`GET /api/media/${env.m1.id}/transcripts 200`);
    expect(log.at(-1)).toBe('PUT /api/state 200');
    expect(pendingTranscriptTrackIds(again)).toEqual([]);
  });
});

describe('lt-584.5 not-loaded occurrence views', () => {
  it('Saved: the not-loaded media shows Open media; the jump loads the transcript, then seeks', async () => {
    const env = await seededService();
    const model = await freshConnected(env);
    setupDom();
    model.savedViewTab = 'sentences';
    setView(model, 'saved'); rerenderApp(model);
    const note = document.querySelector('[data-testid="transcript-not-loaded"]');
    expect(note?.textContent).toContain('Open media to load transcript');
    expect(note?.querySelector('[data-action="open-media-transcript"]')?.getAttribute('data-media-id')).toBe(env.m1.id);
    const log = recordRequests();
    (document.querySelector('a.occurrence-link') as HTMLAnchorElement).click();
    await vi.waitFor(() => expect(model.view).toBe('player'));
    expect(transcriptGets(log)).toEqual([`GET /api/media/${env.m1.id}/transcripts 200`]);
    expect(model.currentMedia?.id).toBe(env.m1.id);
    expect(model.player.currentTimeMs).toBe(env.occurrence.startMs);
    expect(model.player.activeCueId).toBe(env.occurrence.cueId);
    expect(model.cues.map((cue) => cue.id)).toContain(env.occurrence.cueId);
  });

  it.each(['review', 'practice'] as const)('%s: renders the not-loaded state and the Open media action loads it', async (view) => {
    const env = await seededService();
    const model = await freshConnected(env);
    setReviewBucketAsOf(model, new Date('2100-01-01T00:00:00.000Z'));
    setupDom();
    setView(model, view); rerenderApp(model);
    if (view === 'review') (Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Show answer / context') as HTMLButtonElement).click();
    const note = document.querySelector('[data-testid="transcript-not-loaded"]');
    expect(note?.textContent).toContain('Open media to load transcript');
    expect(document.querySelector('[data-testid="source-unresolved"]')).toBeNull();
    const log = recordRequests();
    (note!.querySelector('[data-action="open-media-transcript"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(mediaTranscriptsLoaded(model, env.m1.id)).toBe(true));
    await vi.waitFor(() => expect(document.querySelector('[data-testid="transcript-not-loaded"]')).toBeNull());
    expect(transcriptGets(log)).toEqual([`GET /api/media/${env.m1.id}/transcripts 200`]);
    expect(model.view).toBe(view);
    expect(document.querySelector('.review-context')?.textContent).toContain('Source:');
  });
});
