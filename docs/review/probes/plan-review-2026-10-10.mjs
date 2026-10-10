// Read-only-code exploratory review; all learner state is synthetic/in-memory.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../../node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(root);
const server = await createServer({ configFile: false, root, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const results = [];
try {
  const m = await server.ssrLoadModule('/apps/web/src/model.ts');
  const { LocalStore } = await server.ssrLoadModule('/packages/storage/src/localStore.ts');
  const { ExportService, RestoreService } = await server.ssrLoadModule('/packages/storage/src/exportRestoreService.ts');
  const { SqliteLocalPersistence } = await server.ssrLoadModule('/packages/storage/src/sqliteLocalPersistence.ts');
  async function fixture() {
    const model = m.createAppModel();
    await m.importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm', 'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
    const item = await m.saveSentenceFromCue(model, model.cues[0]);
    const occurrence = model.savedOccurrenceService.listOccurrencesForItem(item.id)[0];
    const card = m.createReviewCardForSavedItem(model, item, occurrence);
    return { model, card, occurrence };
  }
  const { model, card, occurrence } = await fixture();
  model.practiceService.submitAttempt({ cardId: card.id, mode: 'typed-input', result: 'pass', givenAnswer: 'synthetic', expectedAnswer: 'synthetic', responseMs: 100, sourceContext: occurrence.sourceContext, reviewedAt: new Date().toISOString() });
  const manifest = new ExportService(model.store, 'review-probe').buildManifest();
  const restore = new RestoreService(model.store);
  const before = model.store.snapshot();
  const preview = restore.preview(manifest);
  restore.restore(manifest, { confirmOverwrite: true, confirmReplace: false, acknowledgedWarnings: preview.warnings.map(w => w.kind) });
  const after = model.store.snapshot();
  assert.equal(after.reviewEvents.length, before.reviewEvents.length * 2);
  assert.equal(after.practiceAttempts.length, before.practiceAttempts.length * 2);
  results.push({ probe: 'identical manifest merge', before: { reviews: before.reviewEvents.length, practice: before.practiceAttempts.length }, after: { reviews: after.reviewEvents.length, practice: after.practiceAttempts.length }, finding: 'duplicates existing history' });
  const emptyManifest = new ExportService(new LocalStore(), 'review-probe').buildManifest();
  const emptyPreview = restore.preview(emptyManifest);
  restore.restore(emptyManifest, { confirmOverwrite: false, confirmReplace: true, acknowledgedWarnings: emptyPreview.warnings.map(w => w.kind) });
  const replaced = model.store.snapshot();
  assert.equal(Object.keys(replaced.savedItems).length, 0);
  assert.equal(replaced.reviewEvents.length, after.reviewEvents.length);
  assert.equal(replaced.practiceAttempts.length, after.practiceAttempts.length);
  results.push({ probe: 'replace with empty manifest', savedItems: Object.keys(replaced.savedItems).length, remainingReviews: replaced.reviewEvents.length, remainingPractice: replaced.practiceAttempts.length, finding: 'history retained despite replace' });
  const builder = await fixture();
  builder.model.practiceService.submitAttempt({ cardId: builder.card.id, mode: 'sentence-builder', result: 'pass', givenAnswer: 'synthetic', expectedAnswer: 'synthetic', responseMs: 100, sourceContext: builder.occurrence.sourceContext, reviewedAt: new Date().toISOString() });
  const db = SqliteLocalPersistence.open(':memory:');
  try {
    let failure = null;
    try { db.saveSnapshot(builder.model.store.snapshot()); } catch (e) { failure = e.message; }
    assert.match(failure ?? '', /CHECK constraint failed/);
    results.push({ probe: 'sentence-builder SQLite save', error: failure, hasSnapshotAfterFailure: db.status().hasSnapshot });
  } finally { db.close(); }
  const mature = await fixture();
  mature.model.store.putReviewCardState({ ...mature.model.store.getReviewCardState(mature.card.id), state: 'review', scheduledDays: 30, dueAt: '2026-01-01T00:00:00.000Z' });
  const asOf = new Date('2026-02-01T00:00:00.000Z');
  const backendDue = mature.model.reviewService.listBuckets(asOf).review.length;
  const uiNext = m.pickNextDueCard(mature.model, asOf);
  assert.equal(backendDue, 1);
  assert.equal(uiNext, null);
  results.push({ probe: 'overdue mature card', backendDue, frontendDue: m.learnerProgress(mature.model, asOf).dueCards, nextCard: uiNext, finding: 'due card excluded by mastered bucket' });
  console.log(JSON.stringify({ results }, null, 2));
} finally {
  await server.close();
}
