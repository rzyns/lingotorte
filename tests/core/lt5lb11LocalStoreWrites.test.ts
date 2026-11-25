import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  makeCue,
  makeMediaAsset,
  makeMediaFileObservation,
  makePracticeAttempt,
  makeReviewCard,
  makeReviewCardState,
  makeReviewEvent,
  makeSavedItem,
  makeSavedOccurrence,
  makeSubtitleTrack,
  makeTranscriptWordTiming,
  type ExportJob,
  type ImportJob,
  type ImportJobEvent,
  type ProviderPolicyEntry,
} from '../../packages/domain/src';
import { LocalStore } from '../../packages/storage/src';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence.ts';

const SHA = `sha256:${'b'.repeat(64)}` as const;
const AT = '2026-11-25T00:00:00.000Z';
const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

function buildMediaBatch(mediaIndex: number, cueCount: number, wordsPerCue: number) {
  const asset = makeMediaAsset({
    title: `Synthetic Media ${mediaIndex}`,
    originalPath: `/synthetic/media-${mediaIndex}.webm`,
    contentSha256: SHA,
    durationMs: cueCount * 1000,
    container: 'webm',
    sizeBytes: 2048,
    privacyLabel: 'synthetic',
  });
  const track = makeSubtitleTrack({
    mediaId: asset.id,
    language: 'pl',
    role: 'target',
    format: 'srt',
    sourceKind: 'synthetic',
    sourcePath: `/synthetic/media-${mediaIndex}.srt`,
    contentSha256: SHA,
    isActive: true,
    transcriptStatus: 'approved',
  });
  const cues = [];
  const timings = [];
  for (let i = 0; i < cueCount; i++) {
    const startMs = i * 1000;
    const cue = makeCue({
      trackId: track.id,
      cueIndex: i,
      startMs,
      endMs: startMs + 900,
      text: 'Ala ma kota test',
      normalizedText: 'ala ma kota test',
      textSha256: SHA,
    });
    cues.push(cue);
    for (let w = 0; w < wordsPerCue; w++) {
      timings.push(makeTranscriptWordTiming({
        trackId: track.id,
        cueId: cue.id,
        wordIndex: w,
        charStart: w * 4,
        charEnd: w * 4 + 3,
        text: 'Ala',
        normalizedText: 'ala',
        startMs: startMs + w * 200,
        endMs: startMs + (w + 1) * 200,
        confidence: 0.99,
        sourceKind: 'manual-edit',
        engine: 'synthetic',
        modelName: 'synthetic',
      }));
    }
  }
  return { asset, track, cues, timings };
}

function writeBatch(store: LocalStore, batch: ReturnType<typeof buildMediaBatch>) {
  store.putMediaAsset(batch.asset);
  store.putSubtitleTrack(batch.track);
  for (const cue of batch.cues) store.putCue(cue);
  for (const timing of batch.timings) store.putTranscriptWordTiming(timing);
}

describe('lt-5lb.11 LocalStore write-clone removal', () => {
  it('performs zero full-snapshot clones during prior-media, import, and per-media hydration writes', () => {
    const cloneSpy = vi.spyOn(globalThis, 'structuredClone');
    const store = new LocalStore();
    expect(cloneSpy).toHaveBeenCalled();
    cloneSpy.mockClear();

    const prev = buildMediaBatch(1, 30, 3);
    const imported = buildMediaBatch(2, 40, 3);
    const hydrated = buildMediaBatch(3, 40, 3);

    writeBatch(store, prev);
    writeBatch(store, imported);
    writeBatch(store, hydrated);

    // Exercise all remaining non-audit put*/add* write methods as well.
    const sampleCue = imported.cues[0]!;
    const sourceContext = {
      mediaId: imported.asset.id,
      mediaPath: imported.asset.originalPath,
      mediaFingerprint: imported.asset.contentSha256,
      subtitleTrackId: imported.track.id,
      cueId: sampleCue.id,
      timeRangeMs: { start: sampleCue.startMs, end: sampleCue.endMs },
      tokenSpan: { startToken: 0, endToken: 1 },
      charSpan: { start: 0, end: 3 },
    };
    const item = makeSavedItem({ kind: 'lexeme', language: 'pl', displayText: 'Ala' });
    const occurrence = makeSavedOccurrence({
      savedItemId: item.id,
      mediaId: imported.asset.id,
      cueId: sampleCue.id,
      startMs: sampleCue.startMs,
      endMs: sampleCue.endMs,
      selectionKind: 'lexeme',
      selectionText: 'Ala',
      sourceContext,
    });
    const card = makeReviewCard({ savedItemId: item.id, savedOccurrenceId: occurrence.id, cardType: 'recognition', promptTemplate: 'Recognize: Ala' });
    const cardState = makeReviewCardState({ cardId: card.id, fsrsVersion: 'fsrs-v6' });
    const observation = makeMediaFileObservation({
      mediaId: imported.asset.id,
      path: imported.asset.originalPath,
      sizeBytes: 2048,
      mtimeMs: 0,
      contentSha256: SHA,
      exists: true,
    });
    const exportJob: ExportJob = {
      id: randomUUID(),
      kind: 'learner-json-manifest',
      status: 'completed',
      startedAt: AT,
      completedAt: AT,
      destinationKind: 'browser-download',
      destinationLabel: 'synthetic',
      manifestSha256: SHA,
      contentSummaryJson: '{}',
    };
    const policy: ProviderPolicyEntry = {
      id: randomUUID(),
      providerId: 'elevenlabs-scribe',
      enabled: false,
      allowedDataClasses: [],
      requiresConfirmation: true,
      createdAt: AT,
      updatedAt: AT,
    };
    const importJob: ImportJob = {
      id: randomUUID(),
      status: 'completed',
      sourceKind: 'subtitle',
      startedAt: AT,
      completedAt: AT,
      inputManifestJson: '{}',
    };
    const importEvent: ImportJobEvent = {
      id: randomUUID(),
      jobId: importJob.id,
      level: 'info',
      message: 'done',
      createdAt: AT,
    };

    store.addMediaObservation(observation);
    store.putSavedItem(item);
    store.putSavedOccurrence(occurrence);
    store.putReviewCard(card);
    store.putReviewCardState(cardState);
    store.putExportJob(exportJob);
    store.putProviderPolicy(policy);
    store.putImportJob(importJob);
    store.addImportJobEvent(importEvent);

    expect(cloneSpy).toHaveBeenCalledTimes(0);

    // Read semantics and deep snapshot isolation are preserved.
    expect(store.listMediaAssets()).toHaveLength(3);
    expect(store.getLatestObservation(imported.asset.id)).toEqual(observation);
    expect(store.listCuesForTrack(prev.track.id)).toHaveLength(30);
    expect(store.listCuesForTrack(imported.track.id)).toHaveLength(40);
    expect(store.listCuesForTrack(hydrated.track.id)).toHaveLength(40);
    expect(store.listTranscriptWordTimingsForTrack(hydrated.track.id)).toHaveLength(120);
    expect(store.listTranscriptWordTimingsForCue(hydrated.cues[0]!.id)).toHaveLength(3);
    expect(store.getSavedItem(item.id)).toEqual(item);
    expect(store.getSavedOccurrence(occurrence.id)).toEqual(occurrence);
    expect(store.getReviewCard(card.id)).toEqual(card);
    expect(store.getReviewCardState(card.id)).toEqual(cardState);
    expect(store.listExportJobs()).toEqual([exportJob]);
    expect(store.listProviderPolicies()).toEqual([policy]);
    expect(store.getImportJob(importJob.id)).toEqual(importJob);
    expect(store.listImportJobEvents(importJob.id)).toEqual([importEvent]);

    const snap = store.snapshot();
    const targetCueId = hydrated.cues[0]!.id;
    (snap.cues[targetCueId] as { text: string }).text = 'mutated nested cue';
    delete (snap.cues as Record<string, unknown>)[targetCueId];
    expect(store.getCue(targetCueId)).toEqual(hydrated.cues[0]);
    expect(store.getCue(targetCueId)?.text).toBe('Ala ma kota test');
  });

  it('addReviewEvent and addPracticeAttempt avoid full-snapshot clones while preserving isolation and audit guards', () => {
    const store = new LocalStore();
    const batch = buildMediaBatch(1, 20, 2);
    writeBatch(store, batch);

    const cloneSpy = vi.spyOn(globalThis, 'structuredClone');
    const reviewEvent = makeReviewEvent({
      cardId: '00000000-0000-4000-8000-000000000001',
      reviewedAt: AT,
      rating: 'good',
      previousStateJson: '{}',
      nextStateJson: '{}',
    });
    const sourceContext = {
      mediaId: batch.asset.id,
      mediaPath: batch.asset.originalPath,
      mediaFingerprint: batch.asset.contentSha256,
      subtitleTrackId: batch.track.id,
      cueId: batch.cues[0]!.id,
      timeRangeMs: { start: 0, end: 900 },
      tokenSpan: { startToken: 0, endToken: 1 },
      charSpan: { start: 0, end: 3 },
    };
    const attempt = makePracticeAttempt({
      cardId: '00000000-0000-4000-8000-000000000001',
      mode: 'typed-input',
      result: 'pass',
      sourceContext,
      reviewedAt: '2026-11-25T00:00:01.000Z',
    });

    store.addReviewEvent(reviewEvent);
    store.addPracticeAttempt(attempt);

    const clonedFullSnapshot = cloneSpy.mock.calls.some(
      ([arg]) => typeof arg === 'object' && arg !== null && 'cues' in arg && 'mediaAssets' in arg && 'transcriptWordTimings' in arg,
    );
    expect(clonedFullSnapshot).toBe(false);

    // Mutating caller inputs after add* must not mutate stored event/attempt records.
    (reviewEvent as { rating: string }).rating = 'again';
    (attempt as { result: string }).result = 'fail';
    expect(store.listReviewEventsForCard(reviewEvent.cardId)[0]?.rating).toBe('good');
    expect(store.listPracticeAttemptsForCard(attempt.cardId)[0]?.result).toBe('pass');

    // Audit reactivation refusal after removal remains intact for identical payloads.
    (reviewEvent as { rating: string }).rating = 'good';
    (attempt as { result: string }).result = 'pass';
    store.removeReviewEvent(reviewEvent.id);
    expect(() => store.addReviewEvent(reviewEvent)).toThrow(/Explicit restore required/);
    store.removePracticeAttempt(attempt.id);
    expect(() => store.addPracticeAttempt(attempt)).toThrow(/Explicit restore required/);
  });

  it('persists imported and hydrated media transcripts and learner entities across SQLite close/reopen', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lingotorte-lt5lb11-'));
    tempDirs.push(dir);
    const dbFile = join(dir, 'state.sqlite');

    const store = new LocalStore();
    const m1 = buildMediaBatch(1, 5, 2);
    const m2 = buildMediaBatch(2, 6, 2);
    writeBatch(store, m1);
    writeBatch(store, m2);

    const sampleCue = m2.cues[0]!;
    const item = makeSavedItem({ kind: 'lexeme', language: 'pl', displayText: 'Ala' });
    const occurrence = makeSavedOccurrence({
      savedItemId: item.id,
      mediaId: m2.asset.id,
      cueId: sampleCue.id,
      startMs: sampleCue.startMs,
      endMs: sampleCue.endMs,
      selectionKind: 'lexeme',
      selectionText: 'Ala',
      sourceContext: {
        mediaId: m2.asset.id,
        mediaPath: m2.asset.originalPath,
        mediaFingerprint: m2.asset.contentSha256,
        subtitleTrackId: m2.track.id,
        cueId: sampleCue.id,
        timeRangeMs: { start: sampleCue.startMs, end: sampleCue.endMs },
        tokenSpan: { startToken: 0, endToken: 1 },
        charSpan: { start: 0, end: 3 },
      },
    });
    store.putSavedItem(item);
    store.putSavedOccurrence(occurrence);

    const db1 = SqliteLocalPersistence.open(dbFile);
    try {
      db1.saveSnapshot(store.snapshot());
    } finally {
      db1.close();
    }

    const db2 = SqliteLocalPersistence.open(dbFile);
    try {
      const reloaded = db2.loadSnapshot();
      expect(Object.keys(reloaded.mediaAssets).sort()).toEqual([m1.asset.id, m2.asset.id].sort());
      expect(Object.keys(reloaded.cues)).toHaveLength(11);
      expect(Object.keys(reloaded.transcriptWordTimings)).toHaveLength(22);
      expect(reloaded.savedItems[item.id]).toEqual(item);
      expect(reloaded.savedOccurrences[occurrence.id]).toEqual(occurrence);
      const bundle = db2.loadTranscripts(m2.asset.id);
      expect(bundle.tracks[m2.track.id]?.cues).toHaveLength(6);
      expect(bundle.tracks[m2.track.id]?.wordTimings).toHaveLength(12);
    } finally {
      db2.close();
    }
  });
});
