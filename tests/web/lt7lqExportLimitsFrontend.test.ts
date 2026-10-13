import { JSDOM } from 'jsdom';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createAppModel,
  importFixtureMediaAndSubtitles,
  saveSentenceFromCue,
  createReviewCardForSavedItem,
  setReviewBucketAsOf,
  setView,
  submitPracticeAttempt,
  exportLearnerState,
  previewRestoreManifest,
  confirmRestore,
} from '../../apps/web/src/model';
import { rerenderApp } from '../../apps/web/src/app';
import { canonicalJson } from '../../packages/domain/src';
import { withNoNetwork } from '../../tests/no-network/networkTrap';

// lt-7lq: synthetic fixtures only; fresh in-memory app models, providers disabled, no network.
async function setupDom() {
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

const mediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';
const nativeSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.native.srt';

async function sourceModelWithLinkedPractice() {
  const m = createAppModel();
  await importFixtureMediaAndSubtitles(m, mediaPath, targetSrtPath, nativeSrtPath);
  const item = await saveSentenceFromCue(m, m.cues[0]!);
  if (!item) throw new Error('Expected saved item');
  const occurrence = m.savedOccurrenceService.listOccurrencesForItem(item.id)[0]!;
  const card = createReviewCardForSavedItem(m, item, occurrence, 'recognition');
  const due = new Date(new Date(m.store.getReviewCardState(card.id)!.dueAt).valueOf() + 1);
  setReviewBucketAsOf(m, due);
  const attempt = submitPracticeAttempt(m, 'wrong answer', due);
  return { model: m, attempt, occurrence };
}

function restoreIntoFreshApp(manifestJson: string) {
  const fresh = createAppModel();
  previewRestoreManifest(fresh, manifestJson);
  fresh.exportImport.confirmOverwrite = true;
  fresh.exportImport.acknowledgedWarnings = fresh.exportImport.preview!.warnings.map(w => w.kind);
  confirmRestore(fresh);
  return fresh;
}

describe('lt-7lq learner-subset export limits (frontend)', () => {
  let dom: Awaited<ReturnType<typeof setupDom>>;
  beforeEach(async () => { dom = await setupDom(); });
  afterEach(() => { dom.window.close(); });

  it('serialized linked practice imports into a fresh app unchanged, without inventing library/media', async () => {
    const { value, networkAttempts } = await withNoNetwork(async () => {
      const { model, attempt } = await sourceModelWithLinkedPractice();
      const { manifestJson } = exportLearnerState(model);
      const fresh = restoreIntoFreshApp(manifestJson);
      return { attempt, fresh };
    });
    expect(networkAttempts).toHaveLength(0);
    const { attempt, fresh } = value;
    expect(attempt.eventLink.reviewEventId).toBeDefined();
    const restored = fresh.store.snapshot().practiceAttempts;
    expect(restored).toHaveLength(1);
    expect(canonicalJson(restored[0])).toBe(canonicalJson(attempt));
    expect(JSON.stringify(restored[0]!.eventLink)).toBe(JSON.stringify(attempt.eventLink));
    expect(JSON.stringify(restored[0]!.sourceContext)).toBe(JSON.stringify(attempt.sourceContext));
    expect(fresh.store.snapshot().mediaAssets).toEqual({});
    expect(fresh.store.snapshot().cues).toEqual({});
    expect(fresh.currentMedia).toBeNull();
    expect(fresh.exportImport.lastRestore?.mediaCopied).toBe(false);
  });

  it('fresh-app practice and review show unresolved missing source instead of claiming playback', async () => {
    const { value: { fresh, occurrence } } = await withNoNetwork(async () => {
      const { model, occurrence } = await sourceModelWithLinkedPractice();
      const fresh = restoreIntoFreshApp(exportLearnerState(model).manifestJson);
      setReviewBucketAsOf(fresh, new Date('2100-01-01T00:00:00.000Z'));
      return { fresh, occurrence };
    });
    for (const view of ['practice', 'review'] as const) {
      setView(fresh, view);
      fresh.review.revealed = true;
      rerenderApp(fresh);
      const app = document.getElementById('app')!;
      const missing = app.querySelector('[data-testid="source-unresolved"]');
      expect(missing, view).toBeTruthy();
      expect(missing!.textContent).toContain('Source cue/media not available in this app');
      expect(missing!.textContent).toContain('playback unresolved');
      expect(missing!.textContent).toContain(occurrence.sourceContext.mediaPath);
      const replay = Array.from(app.querySelectorAll('button')).find(b => b.textContent === 'Replay source cue') as HTMLButtonElement | undefined;
      expect(replay?.disabled).toBe(true);
    }
  });

  it('export/import copy distinguishes learner subset, semantic integrity, physical file, retained audit and durable acknowledgement', async () => {
    const { value: { model, fresh } } = await withNoNetwork(async () => {
      const { model } = await sourceModelWithLinkedPractice();
      exportLearnerState(model);
      const fresh = restoreIntoFreshApp(model.exportImport.lastExport!.manifestJson);
      return { model, fresh };
    });
    setView(model, 'export-import'); rerenderApp(model);
    let text = document.getElementById('app')!.textContent!;
    expect(text).toContain('Learner-state export v1 (learner subset)');
    expect(text).toContain('saved items, saved occurrences, review cards, review-card states, active review events and active practice attempts');
    expect(text).toContain('Excluded: media files, media assets/observations, subtitle tracks, cues, word timings, retained inactive review/practice audit, import/export jobs and provider policy');
    expect(text).toContain('not a full backup or full recovery');
    expect(text).toContain('semantic integrity verified');
    expect(text).toContain('Physical-file verification');
    expect(text).not.toMatch(/Metadata backup/);
    expect(text).not.toMatch(/full backup verified|file hash verified/i);

    setView(fresh, 'export-import'); rerenderApp(fresh);
    text = document.getElementById('app')!.textContent!;
    expect(text).toContain('session-only / not durably saved');
    expect(text).toContain('Learner subset restored; not a full recovery');
    expect(text).toContain('missing source media/cues remain unresolved');
    expect(text).toContain('Retained inactive audit stays local and is not included in learner export');
  });
});
