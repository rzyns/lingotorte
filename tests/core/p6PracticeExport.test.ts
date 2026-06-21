import { describe, expect, it } from 'vitest';
import { LocalStore, SavedOccurrenceService, PracticeService, ExportService, RestoreService } from '../../packages/storage/src';
import { makeMediaAsset, validateSavedOccurrenceSourceContext } from '../../packages/domain/src';
import { sha256File } from '../../packages/storage/src/mediaHelpers';
import { parseSrt } from '../../packages/subtitles/src/import';
import { ReviewService, defaultFsrsConfig } from '../../packages/review/src';

const fixtureMediaPath = 'fixtures/media/synthetic-polish-dialogue.webm';
const targetSrtPath = 'fixtures/subtitles/synthetic-polish-dialogue.target.srt';

async function setupFixtureStore() {
  const store = new LocalStore();
  const savedService = new SavedOccurrenceService(store);
  const reviewService = new ReviewService(store, defaultFsrsConfig());
  const practiceService = new PracticeService(store);
  const exportService = new ExportService(store, '0.0.0-p6', 'test-device');
  const restoreService = new RestoreService(store);
  const mediaSha256 = await sha256File(fixtureMediaPath);
  const asset = makeMediaAsset({
    title: 'Synthetic Polish Dialogue',
    originalPath: fixtureMediaPath,
    contentSha256: mediaSha256,
    durationMs: 2000,
    container: 'webm',
    sizeBytes: 1024,
    privacyLabel: 'synthetic',
  });
  store.putMediaAsset(asset);
  const parsed = await parseSrt(targetSrtPath, asset.id, 'pl', 'target');
  store.putSubtitleTrack(parsed.track);
  for (const cue of parsed.cues) {
    store.putCue(cue);
  }
  return { store, savedService, reviewService, practiceService, exportService, restoreService, asset, track: parsed.track, cues: parsed.cues };
}

function sourceContextForCue(
  asset: Awaited<ReturnType<typeof setupFixtureStore>>['asset'],
  track: Awaited<ReturnType<typeof setupFixtureStore>>['track'],
  cue: Awaited<ReturnType<typeof setupFixtureStore>>['cues'][number],
  tokenStart: number,
  tokenEnd: number,
  charStart: number,
  charEnd: number,
) {
  return validateSavedOccurrenceSourceContext({
    mediaId: asset.id,
    mediaPath: asset.originalPath,
    mediaFingerprint: asset.contentSha256,
    subtitleTrackId: track.id,
    cueId: cue.id,
    timeRangeMs: { start: cue.startMs, end: cue.endMs },
    tokenSpan: { startToken: tokenStart, endToken: tokenEnd },
    charSpan: { start: charStart, end: charEnd },
  });
}

describe('P6 local practice attempts', () => {
  it('records a typed-input pass attempt and updates FSRS', async () => {
    const { savedService, reviewService, practiceService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    const { card } = reviewService.createCard({ savedItem: saved.item, savedOccurrence: saved.occurrence, cardType: 'recognition' });
    const reviewedAt = new Date('2026-06-21T12:00:00.000Z').toISOString();

    const result = practiceService.submitAttempt({
      cardId: card.id,
      mode: 'typed-input',
      result: 'pass',
      givenAnswer: 'cześć',
      expectedAnswer: 'cześć',
      responseMs: 1200,
      sourceContext,
      reviewedAt,
    });

    expect(result.attempt.cardId).toBe(card.id);
    expect(result.attempt.mode).toBe('typed-input');
    expect(result.attempt.result).toBe('pass');
    expect(result.reviewEventId).toBeDefined();
    expect(practiceService.listAttemptsForCard(card.id)).toHaveLength(1);
    const state = reviewService['store'].getReviewCardState(card.id);
    expect(state!.reps).toBe(1);
  });

  it('records a skipped attempt without FSRS update', async () => {
    const { savedService, reviewService, practiceService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    const { card } = reviewService.createCard({ savedItem: saved.item, savedOccurrence: saved.occurrence, cardType: 'recognition' });
    const reviewedAt = new Date('2026-06-21T12:00:00.000Z').toISOString();

    const result = practiceService.submitAttempt({
      cardId: card.id,
      mode: 'multiple-choice',
      result: 'skipped',
      sourceContext,
      reviewedAt,
    });

    expect(result.attempt.result).toBe('skipped');
    expect(result.reviewEventId).toBeUndefined();
    const state = reviewService['store'].getReviewCardState(card.id);
    expect(state!.reps).toBe(0);
  });

  it('appends attempts deterministically and links to review events', async () => {
    const { savedService, reviewService, practiceService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    const { card } = reviewService.createCard({ savedItem: saved.item, savedOccurrence: saved.occurrence, cardType: 'recognition' });
    const t0 = new Date('2026-06-21T12:00:00.000Z');

    practiceService.submitAttempt({ cardId: card.id, mode: 'typed-input', result: 'pass', sourceContext, reviewedAt: t0.toISOString() });
    practiceService.submitAttempt({
      cardId: card.id,
      mode: 'typed-input',
      result: 'fail',
      sourceContext,
      reviewedAt: new Date(t0.valueOf() + 60_000).toISOString(),
    });

    const attempts = practiceService.listAttemptsForCard(card.id);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.result).toBe('pass');
    expect(attempts[1]!.result).toBe('fail');
    expect(attempts[0]!.eventLink.reviewEventId).toBeDefined();
  });

  it('preserves source context on every attempt', async () => {
    const { savedService, reviewService, practiceService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    const { card } = reviewService.createCard({ savedItem: saved.item, savedOccurrence: saved.occurrence, cardType: 'recognition' });

    practiceService.submitAttempt({
      cardId: card.id,
      mode: 'speaking',
      result: 'pass-with-hesitation',
      sourceContext,
      reviewedAt: new Date('2026-06-21T12:00:00.000Z').toISOString(),
    });

    const attempt = practiceService.listAllAttempts()[0]!;
    expect(attempt.sourceContext.mediaFingerprint).toBe(asset.contentSha256);
    expect(attempt.sourceContext.cueId).toBe(cue.id);
  });
});

describe('P6 export/restore manifest', () => {
  it('builds an export manifest with privacy warnings and integrity', async () => {
    const { savedService, reviewService, exportService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    reviewService.createCard({ savedItem: saved.item, savedOccurrence: saved.occurrence, cardType: 'recognition' });

    const { manifest, filePath } = exportService.exportToFile('/tmp/lingotorte');

    expect(manifest.schemaVersion).toBe('lingotorte.learner-export.v1');
    expect(manifest.applicationVersion).toBe('0.0.0-p6');
    expect(manifest.privacyWarnings.length).toBeGreaterThan(0);
    expect(manifest.integrity.recordCount).toBeGreaterThan(0);
    expect(filePath).toContain('lingotorte-learner-export-');
  });

  it('round-trips learner state through export validation and restore', async () => {
    const { savedService, reviewService, exportService, asset, track, cues } = await setupFixtureStore();
    const restoreService = new RestoreService(new LocalStore());
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    const { card } = reviewService.createCard({ savedItem: saved.item, savedOccurrence: saved.occurrence, cardType: 'recognition' });

    const { manifest } = exportService.exportToFile('/tmp/lingotorte');

    const targetStore = new LocalStore();
    const targetRestoreService = new RestoreService(targetStore);
    const preview = targetRestoreService.preview(manifest);
    expect(preview.safeToRestore).toBe(true);
    expect(preview.overwriteConfirmationRequired).toBe(false);

    const confirmation = {
      confirmedAt: new Date().toISOString(),
      confirmOverwrite: true,
      acknowledgedWarnings: preview.warnings.map((w) => w.kind),
    };
    restoreService.restore(manifest, confirmation);

    expect(Object.values(restoreService['store'].snapshot().savedItems)).toHaveLength(1);
    expect(Object.values(restoreService['store'].snapshot().reviewCards)).toHaveLength(1);
    const restoredCard = restoreService['store'].getReviewCard(card.id)!;
    expect(restoredCard.savedItemId).toBe(saved.item.id);
  });

  it('refuses restore when local data exists without confirmation', async () => {
    const { savedService, reviewService, exportService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    reviewService.createCard({ savedItem: saved.item, savedOccurrence: saved.occurrence, cardType: 'recognition' });

    const { manifest } = exportService.exportToFile('/tmp/lingotorte');
    const restoreService = new RestoreService(new LocalStore());
    expect(() =>
      restoreService.restore(manifest, {
        confirmedAt: new Date().toISOString(),
        confirmOverwrite: false,
        acknowledgedWarnings: [],
      }),
    ).toThrow(/overwrite/);
  });

  it('refuses restore when warnings are not acknowledged', async () => {
    const { savedService, reviewService, exportService, asset, track, cues } = await setupFixtureStore();
    const cue = cues[0]!;
    const sourceContext = sourceContextForCue(asset, track, cue, 0, 1, 0, 5);
    const saved = savedService.saveSelection({
      kind: 'lexeme',
      language: 'pl',
      displayText: 'cześć',
      mediaId: asset.id,
      cueId: cue.id,
      startMs: cue.startMs,
      endMs: cue.endMs,
      sourceContext,
    });
    reviewService.createCard({ savedItem: saved.item, savedOccurrence: saved.occurrence, cardType: 'recognition' });

    const { manifest } = exportService.exportToFile('/tmp/lingotorte');
    const restoreService = new RestoreService(new LocalStore());
    expect(() =>
      restoreService.restore(manifest, {
        confirmedAt: new Date().toISOString(),
        confirmOverwrite: true,
        acknowledgedWarnings: [],
      }),
    ).toThrow(/not acknowledged/);
  });

  it('validates schema version and integrity on import', async () => {
    const { exportService } = await setupFixtureStore();
    const { manifest } = exportService.exportToFile('/tmp/lingotorte');

    const serialized = JSON.parse(JSON.stringify(manifest));
    expect(() => RestoreService.validateManifest(serialized)).not.toThrow();

    serialized.schemaVersion = 'unsupported.v2';
    expect(() => RestoreService.validateManifest(serialized)).toThrow(/schema version/);
  });
});
