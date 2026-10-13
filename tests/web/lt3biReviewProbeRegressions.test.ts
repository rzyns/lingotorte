// lt-3bi: positive regressions replacing docs/review/probes/plan-review-2026-10-10.mjs.
// The original probe asserted four DEFECTIVE observations; each test below runs the same scenario and
// asserts the corrected behaviour, so it fails if the defect returns. Synthetic fixtures, in-memory/temp stores.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAppModel,
  createReviewCardForSavedItem,
  importFixtureMediaAndSubtitles,
  learnerProgress,
  pickNextDueCard,
  saveSentenceFromCue,
} from '../../apps/web/src/model';
import { LocalStore } from '../../packages/storage/src/localStore';
import { ExportService, RestoreService } from '../../packages/storage/src/exportRestoreService';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence';
import type { PracticeMode } from '../../packages/domain/src';

async function fixture() {
  const model = createAppModel();
  await importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
  const item = (await saveSentenceFromCue(model, model.cues[0]!))!;
  const occurrence = model.savedOccurrenceService.listOccurrencesForItem(item.id)[0]!;
  const card = createReviewCardForSavedItem(model, item, occurrence);
  return { model, card, occurrence };
}
function attempt(f: Awaited<ReturnType<typeof fixture>>, mode: PracticeMode) {
  return f.model.practiceService.submitAttempt({ cardId: f.card.id, mode, result: 'pass', givenAnswer: 'synthetic', expectedAnswer: 'synthetic', responseMs: 100, sourceContext: f.occurrence.sourceContext, reviewedAt: '2030-01-01T00:00:00.000Z' });
}
function confirmation(restore: RestoreService, manifest: ReturnType<ExportService['buildManifest']>, replace: boolean) {
  return { confirmedAt: '2030-01-01T00:00:00.000Z', confirmOverwrite: !replace, confirmReplace: replace, acknowledgedWarnings: restore.preview(manifest).warnings.map(w => w.kind) };
}

describe('lt-3bi plan-review probe replacements (corrected behaviour)', () => {
  it('probe 1: merging an identical manifest does not duplicate review or practice history', async () => {
    const f = await fixture();
    attempt(f, 'typed-input');
    const manifest = new ExportService(f.model.store, 'lt-3bi').buildManifest();
    const restore = new RestoreService(f.model.store);
    const before = f.model.store.snapshot();
    expect(before.reviewEvents).toHaveLength(1);
    expect(before.practiceAttempts).toHaveLength(1);
    restore.restore(manifest, confirmation(restore, manifest, false));
    restore.restore(manifest, confirmation(restore, manifest, false));
    const after = f.model.store.snapshot();
    expect(after.reviewEvents).toEqual(before.reviewEvents);
    expect(after.practiceAttempts).toEqual(before.practiceAttempts);
  });

  it('probe 2: replace with an empty manifest removes active reviews/practice (kept only as audit)', async () => {
    const f = await fixture();
    attempt(f, 'typed-input');
    const before = f.model.store.snapshot();
    const restore = new RestoreService(f.model.store);
    const empty = new ExportService(new LocalStore(), 'lt-3bi').buildManifest();
    restore.restore(empty, confirmation(restore, empty, true));
    const replaced = f.model.store.snapshot();
    expect(Object.keys(replaced.savedItems)).toHaveLength(0);
    expect(replaced.reviewEvents).toEqual([]);
    expect(replaced.practiceAttempts).toEqual([]);
    expect(f.model.store.snapshotRestoreAudit()).toEqual({ reviewEvents: before.reviewEvents, practiceAttempts: before.practiceAttempts });
  });

  it('probe 3: a sentence-builder attempt saves to SQLite and survives file-backed reopen', async () => {
    const f = await fixture();
    const result = attempt(f, 'sentence-builder');
    const root = mkdtempSync(join(tmpdir(), 'lt-3bi-probe-'));
    try {
      const file = join(root, 'state.sqlite');
      const db = SqliteLocalPersistence.open(file);
      try { expect(() => db.saveSnapshot(f.model.store.snapshot())).not.toThrow(); expect(db.status().hasSnapshot).toBe(true); } finally { db.close(); }
      const reopened = SqliteLocalPersistence.open(file);
      try {
        expect(reopened.listPracticeAttempts()).toEqual([result.attempt]);
        expect(reopened.loadSnapshot().practiceAttempts.map(a => a.mode)).toEqual(['sentence-builder']);
      } finally { reopened.close(); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('probe 4: an overdue mature card is due in the backend, the frontend count and the next-card pick', async () => {
    const f = await fixture();
    f.model.store.putReviewCardState({ ...f.model.store.getReviewCardState(f.card.id)!, state: 'review', scheduledDays: 30, dueAt: '2026-01-01T00:00:00.000Z' });
    const asOf = new Date('2026-02-01T00:00:00.000Z');
    expect(f.model.reviewService.listBuckets(asOf).review).toHaveLength(1);
    expect(learnerProgress(f.model, asOf).dueCards).toBe(1);
    expect(pickNextDueCard(f.model, asOf)?.card.id).toBe(f.card.id);
  });
});
