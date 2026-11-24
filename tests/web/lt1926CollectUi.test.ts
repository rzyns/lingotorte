import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  makeCue,
  makeMediaAsset,
  makeSubtitleTrack,
  type Cue,
  type MediaAsset,
  type SubtitleTrack,
} from '../../packages/domain/src/index.ts';
import type { LocalStoreSnapshot } from '../../packages/storage/src/localStore.ts';
import { startLingotorteLocalService } from '../../apps/local-service/src/server.ts';
import { rerenderApp } from '../../apps/web/src/app.ts';
import {
  addSavedItemToReview,
  bootLearnerOperations,
  connectLocalService,
  createAppModel,
  learnerOperationsIdle,
  pairLocalService,
  saveModelToLocalService,
  seekToCue,
  setLocalServiceAutosave,
  setView,
  useLearnerOperationOutbox,
} from '../../apps/web/src/model';
import { createMemoryOutboxBackend } from '../../apps/web/src/operationOutbox.ts';
import { openCapture } from '../../apps/web/src/ui/capture.ts';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-192.6: browser UI + real paired service/SQLite collect-without-enrolment acceptance tests (synthetic only).

const SHA = (c: string) => `sha256:${c.repeat(64)}` as const;
const REAL_FETCH = globalThis.fetch;

type StartedService = {
  origin: string;
  capability: string;
  close: () => Promise<void>;
  serverSnapshot: () => Promise<LocalStoreSnapshot>;
};

const closers: Array<() => Promise<void>> = [];
const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  while (closers.length > 0) {
    const fn = closers.pop()!;
    await fn();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

function installDom(): JSDOM {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost:5173/',
  });
  Object.defineProperty(dom.window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(dom.window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: () => undefined,
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
  vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement);
  vi.stubGlobal('HTMLVideoElement', dom.window.HTMLVideoElement);
  vi.stubGlobal('Element', dom.window.Element);
  vi.stubGlobal('Node', dom.window.Node);
  vi.stubGlobal('Event', dom.window.Event);
  vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent);
  vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
  vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('CSS', { escape: (v: string) => v.replace(/"/g, '\\"') });
  closers.push(async () => dom.window.close());
  return dom;
}

async function makeTempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'lingotorte-lt1926-ui-'));
  tempDirs.push(root);
  return root;
}

async function startService(root: string, dbFile: string, port = 0): Promise<StartedService> {
  let capability = '';
  const service = await startLingotorteLocalService(
    {
      host: '127.0.0.1',
      port,
      databasePath: dbFile,
      scratchDir: join(root, 'scratch'),
      modelCacheDir: join(root, 'models'),
      allowOnlineProviders: false,
    },
    {
      receiveCapability(value) {
        capability = value;
      },
      morphology: { mode: 'disabled' },
    },
  );
  let open = true;
  const close = async () => {
    if (open) {
      open = false;
      await service.close();
    }
  };
  closers.push(close);
  const serverSnapshot = async () => {
    const res = await REAL_FETCH(`${service.origin}/api/state`, {
      headers: { authorization: `Bearer ${capability}` },
    });
    expect(res.ok).toBe(true);
    return ((await res.json()) as { snapshot: LocalStoreSnapshot }).snapshot;
  };
  return { origin: service.origin, capability, close, serverSnapshot };
}

function seedMediaOnModel(
  model: AppModel,
  texts: readonly string[] = ['Kot MA dużego psa tutaj.', 'Druga linia filmu później.'],
): { media: MediaAsset; targetTrack: SubtitleTrack; cues: Cue[] } {
  const media = makeMediaAsset({
    title: 'Synthetic Film',
    originalPath: 'fixtures/media/synthetic-polish-dialogue.webm',
    contentSha256: SHA('a'),
    durationMs: 6_000,
    container: 'webm',
    sizeBytes: 256,
    privacyLabel: 'synthetic',
  });
  const targetTrack = makeSubtitleTrack({
    mediaId: media.id,
    language: 'pl',
    role: 'target',
    format: 'srt',
    sourceKind: 'synthetic',
    sourcePath: 'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
    contentSha256: SHA('b'),
    isActive: true,
    transcriptStatus: 'approved',
  });
  const cues = texts.map((text, index) =>
    makeCue({
      trackId: targetTrack.id,
      cueIndex: index + 1,
      startMs: index * 2000,
      endMs: index * 2000 + 1500,
      text,
      normalizedText: text.toLowerCase(),
      textSha256: SHA(String((index + 1) % 9 || 9)),
    }),
  );
  model.store.putMediaAsset(media);
  model.store.putSubtitleTrack(targetTrack);
  for (const cue of cues) model.store.putCue(cue);
  model.currentMedia = media;
  model.targetTrackId = targetTrack.id;
  model.nativeTrackId = null;
  model.cues = model.store.listCuesForTrack(targetTrack.id);
  model.browserLocalMedia = {
    objectUrl: 'blob:http://localhost:5173/synthetic-video',
    sourceLabel: media.title,
    handleName: null,
    permissionState: 'unavailable',
    lastError: null,
  };
  model.player.durationMs = media.durationMs;
  model.player.currentTimeMs = cues[0]!.startMs;
  model.player.activeCueId = cues[0]!.id;
  return { media, targetTrack, cues };
}

async function connectPairedModel(
  service: StartedService,
  outbox = createMemoryOutboxBackend(),
): Promise<{ model: AppModel; outbox: ReturnType<typeof createMemoryOutboxBackend> }> {
  const model = createAppModel();
  pairLocalService(model, service.capability, service.origin);
  useLearnerOperationOutbox(model, outbox);
  setLocalServiceAutosave(model, true);
  await bootLearnerOperations(model);
  const conn = await connectLocalService(model);
  expect(conn.ok).toBe(true);
  return { model, outbox };
}

async function waitUntilSettled(model: AppModel, done: () => boolean): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await learnerOperationsIdle(model);
    if (done()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  await learnerOperationsIdle(model);
  if (!done()) throw new Error('Timed out waiting for paired UI operation to settle.');
}

function advancePlaybackToCue(dom: JSDOM, model: AppModel, cue: Cue): void {
  seekToCue(model, cue);
  const video = dom.window.document.querySelector('.video-stage video') as HTMLVideoElement | null;
  if (video) {
    video.currentTime = (cue.startMs + 250) / 1000;
    video.dispatchEvent(new dom.window.Event('timeupdate'));
  }
  rerenderApp(model);
}

function stubGlossResponses(
  origin: string,
  opts: {
    morphology?: ((body: { language: string; tokens: string[] }) => unknown) | undefined;
    gloss: () => Response | Promise<Response>;
  },
): () => Promise<void> {
  const pending: Promise<unknown>[] = [];
  const track = <T>(p: Promise<T>): Promise<T> => {
    pending.push(p.then(() => undefined, () => undefined));
    return p;
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === `${origin}/api/language/morphology`) {
        return track(Promise.resolve().then(() => {
          const body = JSON.parse(String(init?.body ?? '{}')) as { language: string; tokens: string[] };
          const payload = opts.morphology
            ? opts.morphology(body)
            : {
                status: 'available',
                engine: 'morfeusz2-sgjp',
                warnings: [],
                analyses: [
                  {
                    tokenIndex: 0,
                    lemma: 'duży',
                    upos: 'ADJ',
                    morph: [],
                    confidence: { kind: 'certain', value: 1 },
                    ambiguous: false,
                    unknown: false,
                    alternatives: [],
                  },
                ],
              };
          return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
        }));
      }
      if (url === `${origin}/api/language/gloss`) {
        return track(Promise.resolve().then(() => opts.gloss()));
      }
      return REAL_FETCH(input, init);
    }),
  );
  return async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.allSettled([...pending]);
      await new Promise((r) => setTimeout(r, 0));
    }
  };
}

describe('lt-192.6: browser UI collects exact source without enrolment', () => {
  it('freezes source A on word click, drag-select, and Save sentence across playback to B, reopen, and shows unenrolled Saved/Review states', async () => {
    const dom = installDom();
    const root = await makeTempDir();
    const dbFile = join(root, 'learner.sqlite');
    const srv1 = await startService(root, dbFile);
    const { model } = await connectPairedModel(srv1);
    const { media, targetTrack, cues } = seedMediaOnModel(model);
    const cueA = cues[0]!;
    const cueB = cues[1]!;

    model.view = 'player';
    rerenderApp(model);
    expect(await saveModelToLocalService(model)).toMatchObject({ ok: true });

    // 1) Click word 'dużego' in cue A, advance playback to cue B before saving
    const wordButtons = Array.from(dom.window.document.querySelectorAll<HTMLButtonElement>(`.cue-row[data-cue-id="${cueA.id}"] .cue-word`));
    const wordBtn = wordButtons.find((btn) => btn.textContent === 'dużego');
    expect(wordBtn).toBeDefined();
    wordBtn!.click();
    expect(model.selection?.cueId).toBe(cueA.id);
    expect(dom.window.document.querySelector('.selection-source-summary')?.textContent).toContain('line 1');

    // Also switch active target track to an unapproved draft track while Cue A capture stays open
    const draftTrack = makeSubtitleTrack({
      mediaId: media.id,
      language: 'pl',
      role: 'target',
      format: 'srt',
      sourceKind: 'synthetic',
      sourcePath: 'draft.target.srt',
      contentSha256: SHA('c'),
      isActive: false,
      transcriptStatus: 'draft',
    });
    const draftCue = makeCue({
      trackId: draftTrack.id,
      cueIndex: 1,
      startMs: 3000,
      endMs: 4000,
      text: 'Roboczy napis testowy.',
      normalizedText: 'roboczy napis testowy.',
      textSha256: SHA('d'),
    });
    model.store.putSubtitleTrack(draftTrack);
    model.store.putCue(draftCue);
    model.targetTrackId = draftTrack.id;
    model.cues = [draftCue];
    advancePlaybackToCue(dom, model, cueB);
    expect(model.player.activeCueId).toBe(cueB.id);
    expect(model.selection?.cueId).toBe(cueA.id);
    expect(dom.window.document.querySelector('.selection-source-summary')?.textContent).toContain('line 1');
    expect(dom.window.document.querySelector('.selection-source-summary')?.textContent).toContain('0:00–0:01');
    expect(dom.window.document.querySelector('.selection-source-summary')?.textContent).toContain('Transcript ready');
    const firstSaveBtn = dom.window.document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement;
    expect(firstSaveBtn.disabled).toBe(false);

    firstSaveBtn.click();
    await waitUntilSettled(model, () => Object.keys(model.store.snapshot().savedItems).length === 1 && !model.selection);
    model.targetTrackId = targetTrack.id;
    model.cues = cues;

    // 2) Drag-select mixed-case multi-word span 'MA dużego' in cue A while advancing to cue B
    advancePlaybackToCue(dom, model, cueA);
    const cueATarget = dom.window.document.querySelector(`.cue-row[data-cue-id="${cueA.id}"] .cue-target`)!;
    const phraseTarget = 'MA dużego';
    const startOffset = cueA.text.indexOf(phraseTarget);
    expect(startOffset).toBeGreaterThan(0);

    // Build a DOM selection inside cueATarget covering 'MA dużego'
    const range = dom.window.document.createRange();
    let offset = 0;
    let startNode: Node | null = null;
    let startLocal = 0;
    let endNode: Node | null = null;
    let endLocal = 0;
    const walker = dom.window.document.createTreeWalker(cueATarget, dom.window.NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const len = node.textContent?.length ?? 0;
      if (!startNode && offset + len >= startOffset) {
        startNode = node;
        startLocal = startOffset - offset;
      }
      if (!endNode && offset + len >= startOffset + phraseTarget.length) {
        endNode = node;
        endLocal = startOffset + phraseTarget.length - offset;
        break;
      }
      offset += len;
    }
    range.setStart(startNode!, startLocal);
    range.setEnd(endNode!, endLocal);
    const winSel = dom.window.getSelection()!;
    winSel.removeAllRanges();
    winSel.addRange(range);
    dom.window.document.querySelector(`.cue-row[data-cue-id="${cueA.id}"]`)!.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));

    expect(model.selection?.kind).toBe('phrase');
    expect(model.selection?.text).toBe(phraseTarget);
    expect(model.selection?.charStart).toBe(startOffset);
    expect(model.selection?.charEnd).toBe(startOffset + phraseTarget.length);
    advancePlaybackToCue(dom, model, cueB);
    expect(dom.window.document.querySelector('.selection-source-summary')?.textContent).toContain('line 1');
    (dom.window.document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement).click();
    await waitUntilSettled(model, () => Object.keys(model.store.snapshot().savedItems).length === 2 && !model.selection);

    // 3) Save sentence... from cue A, advance to cue B before clicking Save
    advancePlaybackToCue(dom, model, cueA);
    const saveSentenceBtn = Array.from(
      dom.window.document.querySelectorAll<HTMLButtonElement>(`.cue-row[data-cue-id="${cueA.id}"] button`),
    ).find((b) => b.textContent === 'Save sentence…');
    expect(saveSentenceBtn).toBeDefined();
    saveSentenceBtn!.click();
    expect(model.selection?.kind).toBe('sentence');
    advancePlaybackToCue(dom, model, cueB);
    expect(dom.window.document.querySelector('.selection-source-summary')?.textContent).toContain('line 1');
    (dom.window.document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement).click();
    await waitUntilSettled(model, () => Object.keys(model.store.snapshot().savedItems).length === 3 && !model.selection);

    // Close service and reopen from SQLite into a brand-new AppModel
    await srv1.close();
    const srv2 = await startService(root, dbFile);
    const { model: model2 } = await connectPairedModel(srv2);

    const persisted = await srv2.serverSnapshot();
    const items = Object.values(persisted.savedItems);
    const occurrences = Object.values(persisted.savedOccurrences);
    expect(items).toHaveLength(3);
    expect(occurrences).toHaveLength(3);
    expect(persisted.reviewCards).toEqual({});
    expect(persisted.reviewCardStates).toEqual({});

    for (const occ of occurrences) {
      const item = persisted.savedItems[occ.savedItemId]!;
      expect(occ.mediaId).toBe(media.id);
      expect(occ.cueId).toBe(cueA.id);
      expect(occ.sourceContext.subtitleTrackId).toBe(targetTrack.id);
      expect(occ.sourceContext.timeRangeMs).toEqual({ start: cueA.startMs, end: cueA.endMs });
      const { charSpan, tokenSpan } = occ.sourceContext;
      expect(charSpan.end).toBeGreaterThan(charSpan.start);
      expect(tokenSpan.endToken).toBeGreaterThan(tokenSpan.startToken);
      expect(item.displayText).toBe(cueA.text.slice(charSpan.start, charSpan.end));
    }

    setView(model2, 'saved');
    rerenderApp(model2);
    const addButtons = Array.from(dom.window.document.querySelectorAll<HTMLButtonElement>('button')).filter(
      (b) => b.textContent === 'Add to review',
    );
    expect(addButtons).toHaveLength(2); // My Vocab tab active (lexeme + phrase); sentence under My Sentences
    for (const btn of addButtons) expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(dom.window.document.body.textContent).not.toContain('In review ✓');
    expect(dom.window.document.body.textContent).toContain('Add all to review');

    setView(model2, 'review');
    rerenderApp(model2);
    expect(dom.window.document.getElementById('review-empty')).not.toBeNull();
  }, 15_000);

  it('ignores non-matching DOM drag selection (phraseStart < 0) without suppressing an immediate word click', () => {
    const dom = installDom();
    const model = createAppModel();
    const { cues } = seedMediaOnModel(model);
    model.view = 'player';
    rerenderApp(model);

    const row = dom.window.document.querySelector(`.cue-row[data-cue-id="${cues[0]!.id}"]`)!;
    const timeText = row.querySelector('.cue-time')!.firstChild!;
    const range = dom.window.document.createRange();
    range.selectNodeContents(timeText);
    const winSel = dom.window.getSelection()!;
    winSel.removeAllRanges();
    winSel.addRange(range);
    expect(winSel.rangeCount).toBe(1);

    row.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
    expect(model.selection).toBeNull();

    // Clearing the stray range and clicking a word button immediately (< 400ms) must still open capture
    winSel.removeAllRanges();
    const wordBtn = row.querySelector<HTMLButtonElement>('.cue-word');
    expect(wordBtn).not.toBeNull();
    wordBtn!.click();
    expect(model.selection?.cueId).toBe(cues[0]!.id);
    expect(model.selection?.kind).toBe('lexeme');
  });

  it('allows paired browser Undo on 2nd occurrence even while pre-existing item card is active in Review and Practice', async () => {
    const dom = installDom();
    const root = await makeTempDir();
    const srv = await startService(root, join(root, 'learner.sqlite'));
    const { model } = await connectPairedModel(srv);
    const { cues } = seedMediaOnModel(model, ['Kot śpi tutaj.', 'Tam biega kot szybko.']);

    model.view = 'player';
    rerenderApp(model);
    expect(await saveModelToLocalService(model)).toMatchObject({ ok: true });

    // Save 1st occurrence and explicitly enrol into Review
    openCapture(model, { kind: 'lexeme', text: 'Kot', cueId: cues[0]!.id, tokenStart: 0, tokenEnd: 1, charStart: 0, charEnd: 3 });
    rerenderApp(model);
    (dom.window.document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement).click();
    await waitUntilSettled(model, () => Object.keys(model.store.snapshot().savedItems).length === 1);

    const savedItem = Object.values(model.store.snapshot().savedItems)[0]!;
    addSavedItemToReview(model, savedItem);
    await waitUntilSettled(model, () => Object.keys(model.store.snapshot().reviewCards).length === 1);

    const card = Object.values(model.store.snapshot().reviewCards)[0]!;
    model.review.activeCardId = card.id;
    model.review.currentCardId = card.id;
    model.practice.cardId = card.id;
    const beforeState = structuredClone(model.store.getReviewCardState(card.id)!);

    // Collect 2nd occurrence from cue 2 while card is active in Review and Practice
    const secondStart = cues[1]!.text.indexOf('kot');
    openCapture(model, {
      kind: 'lexeme',
      text: 'kot',
      cueId: cues[1]!.id,
      tokenStart: 2,
      tokenEnd: 3,
      charStart: secondStart,
      charEnd: secondStart + 3,
    });
    rerenderApp(model);
    (dom.window.document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement).click();
    await waitUntilSettled(model, () => model.store.listSavedOccurrences().length === 2 && !model.selection);

    // Advance playback back to cue 1 before clicking Undo: Undo must reopen cue 2 with frozen source
    advancePlaybackToCue(dom, model, cues[0]!);
    const undoBtn = dom.window.document.querySelector<HTMLButtonElement>('.toast-region button');
    expect(undoBtn?.textContent).toBe('Undo');
    undoBtn!.click();
    await waitUntilSettled(
      model,
      () => model.store.listSavedOccurrences().length === 1
        && model.selection !== null
        && dom.window.document.getElementById('selection-meaning') !== null,
    );
    expect(model.selection?.cueId).toBe(cues[1]!.id);
    expect(model.selection?.source?.cue.id).toBe(cues[1]!.id);
    expect(dom.window.document.querySelector('.selection-source-summary')?.textContent).toContain('line 2');

    const finalSnap = await srv.serverSnapshot();
    expect(Object.keys(finalSnap.savedItems)).toEqual([savedItem.id]);
    expect(Object.keys(finalSnap.savedOccurrences)).toHaveLength(1);
    expect(finalSnap.savedOccurrences[Object.keys(finalSnap.savedOccurrences)[0]!]!.cueId).toBe(cues[0]!.id);
    expect(finalSnap.reviewCards[card.id]).toEqual(card);
    expect(finalSnap.reviewCardStates[card.id]).toEqual(beforeState);
    expect(model.review.activeCardId).toBe(card.id);
    expect(model.practice.cardId).toBe(card.id);
  });

  it('handles paired outbox lost-ack + service restart + retry without duplicate occurrence or cards', async () => {
    const dom = installDom();
    const root = await makeTempDir();
    const dbFile = join(root, 'learner.sqlite');
    const sharedOutbox = createMemoryOutboxBackend();

    const srv1 = await startService(root, dbFile);
    const { model: model1 } = await connectPairedModel(srv1, sharedOutbox);
    const { cues } = seedMediaOnModel(model1);
    model1.view = 'player';
    rerenderApp(model1);
    expect(await saveModelToLocalService(model1)).toMatchObject({ ok: true });

    let droppedFirstOp = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await REAL_FETCH(input, init);
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith('/api/learner/operations') && !droppedFirstOp) {
          droppedFirstOp = true;
          expect(res.status).toBe(200);
          await res.json();
          throw new TypeError('network ack lost');
        }
        return res;
      }),
    );

    openCapture(model1, { kind: 'lexeme', text: 'Kot', cueId: cues[0]!.id, tokenStart: 0, tokenEnd: 1, charStart: 0, charEnd: 3 });
    rerenderApp(model1);
    (dom.window.document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement).click();
    await waitUntilSettled(model1, () => droppedFirstOp && sharedOutbox.records.size === 1);

    const port = Number(new URL(srv1.origin).port);
    await srv1.close();
    vi.stubGlobal('fetch', REAL_FETCH);
    const leaseExpiredAt = Date.now() + 20_000;
    vi.spyOn(Date, 'now').mockImplementation(() => leaseExpiredAt);

    const srv2 = await startService(root, dbFile, port);
    const { model: model2 } = await connectPairedModel(srv2, sharedOutbox);
    await waitUntilSettled(model2, () => [...sharedOutbox.records.values()].every((r) => r.status === 'acked'));

    const snap = await srv2.serverSnapshot();
    expect(Object.keys(snap.savedItems)).toHaveLength(1);
    expect(Object.keys(snap.savedOccurrences)).toHaveLength(1);
    expect(snap.reviewCards).toEqual({});
    expect(snap.reviewCardStates).toEqual({});
  });

  it('never guesses meaning when lookup is unpaired or fails, while preserving dictionary pre-fill on lookup success', async () => {
    const dom = installDom();
    const root = await makeTempDir();
    const dbFile = join(root, 'learner.sqlite');

    // 1) Unpaired model -> empty meaning, no guessed meaning on save
    const unpaired = createAppModel();
    const unpairedCue = seedMediaOnModel(unpaired, ['Słowo jeden tutaj.']).cues[0]!;
    unpaired.view = 'player';
    rerenderApp(unpaired);
    openCapture(unpaired, { kind: 'lexeme', text: 'Słowo', cueId: unpairedCue.id, tokenStart: 0, tokenEnd: 1, charStart: 0, charEnd: 5 });
    await Promise.resolve();
    expect(unpaired.pendingMeaning).toBe('');
    expect((dom.window.document.getElementById('selection-meaning') as HTMLInputElement).value).toBe('');
    (dom.window.document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement).click();
    await waitUntilSettled(unpaired, () => Object.keys(unpaired.store.snapshot().savedItems).length === 1);
    const unpairedSaved = Object.values(unpaired.store.snapshot().savedItems)[0]!;
    expect(unpairedSaved.meaning).toBeUndefined();
    expect(unpairedSaved.meaningSource).toBeUndefined();

    // 2) Paired lookup failure modes + final success case
    const srv = await startService(root, dbFile);
    const { model } = await connectPairedModel(srv);
    const words = ['alfa', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'kot'] as const;
    const { cues } = seedMediaOnModel(model, [words.join(' ')]);
    const cue = cues[0]!;
    model.view = 'player';
    rerenderApp(model);
    expect(await saveModelToLocalService(model)).toMatchObject({ ok: true });

    const failureCases: Array<{
      word: (typeof words)[number];
      morphology?: (body: { language: string; tokens: string[] }) => unknown;
      gloss: () => Response | Promise<Response>;
    }> = [
      {
        word: 'alfa',
        gloss: () => new Response('boom', { status: 500 }),
      },
      {
        word: 'beta',
        gloss: () => Promise.reject(new TypeError('ECONNREFUSED')),
      },
      {
        word: 'gamma',
        gloss: () => new Response(JSON.stringify({ status: 'unavailable', reason: 'not-installed' }), { status: 200 }),
      },
      {
        word: 'delta',
        gloss: () => new Response(JSON.stringify({ status: 'unavailable', reason: 'disabled' }), { status: 200 }),
      },
      {
        word: 'epsilon',
        gloss: () =>
          new Response(
            JSON.stringify({
              status: 'available',
              source: { id: 'wiktionary-synthetic', name: 'Synthetic', licence: 'CC-BY-SA', url: 'https://example.invalid', attribution: 'Wiktionary', dumpDate: '2026-06-01' },
              results: [{ queryIndex: 0, found: false, via: null, lemma: 'epsilon', upos: null, senses: [], otherReadings: [] }],
            }),
            { status: 200 },
          ),
      },
      {
        word: 'zeta',
        morphology: () => ({
          status: 'available',
          engine: 'morfeusz2-sgjp',
          warnings: ['unknown-tokens'],
          analyses: [{ tokenIndex: 0, lemma: 'zeta', upos: 'X', morph: [], confidence: { kind: 'possible', value: 0.4 }, ambiguous: false, unknown: true, alternatives: [] }],
        }),
        gloss: () => new Response(JSON.stringify({ status: 'error', code: 'lookup-failed' }), { status: 200 }),
      },
    ];

    for (const testCase of failureCases) {
      const waitLookups = stubGlossResponses(srv.origin, { morphology: testCase.morphology, gloss: testCase.gloss });
      const idx = cue.text.indexOf(testCase.word);
      const tokenIdx = words.indexOf(testCase.word);
      openCapture(model, {
        kind: 'lexeme',
        text: testCase.word,
        cueId: cue.id,
        tokenStart: tokenIdx,
        tokenEnd: tokenIdx + 1,
        charStart: idx,
        charEnd: idx + testCase.word.length,
      });
      await waitLookups();
      expect(model.pendingMeaning).toBe('');
      expect((dom.window.document.getElementById('selection-meaning') as HTMLInputElement).value).toBe('');

      const expectedCount = Object.keys(model.store.snapshot().savedItems).length + 1;
      (dom.window.document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement).click();
      await waitUntilSettled(model, () => Object.keys(model.store.snapshot().savedItems).length === expectedCount);
      const latest = Object.values(model.store.snapshot().savedItems).find((i) => i.displayText === testCase.word)!;
      expect(latest.meaning).toBeUndefined();
      expect(latest.meaningSource).toBeUndefined();
    }

    // 3) Lookup success still pre-fills dictionary meaning (lt-foe.3.4)
    const waitKotLookup = stubGlossResponses(srv.origin, {
      morphology: () => ({
        status: 'available',
        engine: 'morfeusz2-sgjp',
        warnings: [],
        analyses: [{ tokenIndex: 0, lemma: 'kot', upos: 'NOUN', morph: [], confidence: { kind: 'certain', value: 1 }, ambiguous: false, unknown: false, alternatives: [] }],
      }),
      gloss: () =>
        new Response(
          JSON.stringify({
            status: 'available',
            source: { id: 'wiktionary-synthetic', name: 'Synthetic', licence: 'CC-BY-SA', url: 'https://example.invalid', attribution: 'Wiktionary', dumpDate: '2026-06-01' },
            results: [{ queryIndex: 0, found: true, via: 'lemma', lemma: 'kot', upos: 'NOUN', senses: [{ gloss: 'feline (synthetic)', pos: 'noun', upos: 'NOUN', tags: [] }], otherReadings: [] }],
          }),
          { status: 200 },
        ),
    });
    const kotStart = cue.text.indexOf('kot');
    const kotToken = words.indexOf('kot');
    openCapture(model, {
      kind: 'lexeme',
      text: 'kot',
      cueId: cue.id,
      tokenStart: kotToken,
      tokenEnd: kotToken + 1,
      charStart: kotStart,
      charEnd: kotStart + 3,
    });
    await waitKotLookup();
    expect(model.pendingMeaning).toBe('feline');
    expect((dom.window.document.getElementById('selection-meaning') as HTMLInputElement).value).toBe('feline');
    (dom.window.document.querySelector('[data-action="save-occurrence"]') as HTMLButtonElement).click();
    await waitUntilSettled(model, () => Object.keys(model.store.snapshot().savedItems).length === failureCases.length + 1);
    const savedKot = Object.values(model.store.snapshot().savedItems).find((i) => i.displayText === 'kot')!;
    expect(savedKot.meaning).toBe('feline');
    expect(savedKot.meaningSource).toMatchObject({ kind: 'dictionary-suggested', glossSourceId: 'wiktionary-synthetic', dumpDate: '2026-06-01' });

    // Even when paired capture succeeded and pre-filled meaning, 0 review cards were created
    const finalSnap = await srv.serverSnapshot();
    expect(finalSnap.reviewCards).toEqual({});
  }, 15_000);
});
