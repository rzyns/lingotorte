import { describe, expect, it } from 'vitest';
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
  validateSavedOccurrenceSourceContext,
} from '../../packages/domain/src';
import { LocalStore, createEmptyLocalStoreSnapshot } from '../../packages/storage/src';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence';

const fingerprint = 'sha256:0000000000000000000000000000000000000000000000000000000000000000' as const;

function populatedStore(): LocalStore {
  const store = new LocalStore();
  const media = makeMediaAsset({
    title: 'Durable test media',
    originalPath: 'fixtures/media/synthetic-polish-dialogue.webm',
    contentSha256: fingerprint,
    durationMs: 2000,
    container: 'webm',
    sizeBytes: 1024,
    privacyLabel: 'synthetic',
  });
  const sourceContext = validateSavedOccurrenceSourceContext({
    mediaId: media.id,
    mediaPath: media.originalPath,
    mediaFingerprint: media.contentSha256,
    subtitleTrackId: 'track-1',
    cueId: 'cue-1',
    timeRangeMs: { start: 0, end: 1000 },
    tokenSpan: { startToken: 0, endToken: 1 },
    charSpan: { start: 0, end: 5 },
  });
  const item = makeSavedItem({ kind: 'lexeme', language: 'pl', displayText: 'Cześć', meaning: 'hi' });
  const occurrence = makeSavedOccurrence({
    savedItemId: item.id,
    mediaId: media.id,
    cueId: 'cue-1',
    startMs: 0,
    endMs: 1000,
    selectionKind: 'lexeme',
    selectionText: 'Cześć',
    sourceContext,
  });

  store.putMediaAsset(media);
  store.putSavedItem(item);
  store.putSavedOccurrence(occurrence);
  return store;
}

describe('durable local persistence', () => {
  it('hydrates a fresh LocalStore from a snapshot without sharing mutable arrays', () => {
    const original = populatedStore();
    const restored = new LocalStore(original.snapshot());

    expect(restored.snapshot()).toEqual(original.snapshot());

    restored.addReviewEvent({
      id: 'event-1',
      cardId: 'card-1',
      reviewedAt: '2026-06-22T00:00:00.000Z',
      rating: 'good',
      previousStateJson: '{}',
      nextStateJson: '{}',
      createdAt: '2026-06-22T00:00:00.000Z',
    });

    expect(original.snapshot().reviewEvents).toHaveLength(0);
    expect(restored.snapshot().reviewEvents).toHaveLength(1);
  });

  it('round-trips a LocalStoreSnapshot through SQLite-backed persistence', () => {
    const store = populatedStore();
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot());
    const loaded = persistence.loadSnapshot();

    expect(loaded).toEqual(store.snapshot());
    expect(new LocalStore(loaded).snapshot()).toEqual(store.snapshot());
    persistence.close();
  });

  it('returns an empty typed snapshot from a new SQLite database', () => {
    const persistence = SqliteLocalPersistence.open(':memory:');

    expect(persistence.loadSnapshot()).toEqual(createEmptyLocalStoreSnapshot());
    persistence.close();
  });

  it('applies an auditable forward-only migration ledger to an empty SQLite database', () => {
    const persistence = SqliteLocalPersistence.open(':memory:');

    expect(persistence.status()).toMatchObject({
      schemaVersion: 7,
      hasSnapshot: false,
      appliedMigrations: [
        {
          version: 1,
          name: 'create_snapshot_store',
          result: 'applied',
        },
        {
          version: 2,
          name: 'create_media_asset_projection',
          result: 'applied',
        },
        {
          version: 3,
          name: 'create_transcript_projections',
          result: 'applied',
        },
        {
          version: 4,
          name: 'create_learner_source_projections',
          result: 'applied',
        },
        {
          version: 5,
          name: 'create_review_practice_job_projections',
          result: 'applied',
        },
        {
          version: 6,
          name: 'create_export_job_projection',
          result: 'applied',
        },
        {
          version: 7,
          name: 'create_provider_policy_projection',
          result: 'applied',
        },
      ],
    });
    expect(persistence.listMigrations()).toEqual([
      expect.objectContaining({
        version: 1,
        name: 'create_snapshot_store',
        result: 'applied',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        appliedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
      expect.objectContaining({
        version: 2,
        name: 'create_media_asset_projection',
        result: 'applied',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        appliedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
      expect.objectContaining({
        version: 3,
        name: 'create_transcript_projections',
        result: 'applied',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        appliedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
      expect.objectContaining({
        version: 4,
        name: 'create_learner_source_projections',
        result: 'applied',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        appliedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
      expect.objectContaining({
        version: 5,
        name: 'create_review_practice_job_projections',
        result: 'applied',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        appliedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
      expect.objectContaining({
        version: 6,
        name: 'create_export_job_projection',
        result: 'applied',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        appliedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
      expect.objectContaining({
        version: 7,
        name: 'create_provider_policy_projection',
        result: 'applied',
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        appliedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    ]);
    persistence.close();
  });

  it('maintains a typed media asset projection from the latest saved snapshot', () => {
    const store = populatedStore();
    const media = Object.values(store.snapshot().mediaAssets)[0]!;
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot(), '2026-07-04T02:40:00.000Z');

    expect(persistence.listMediaAssets()).toEqual([
      {
        id: media.id,
        title: media.title,
        originalPath: media.originalPath,
        contentSha256: media.contentSha256,
        durationMs: media.durationMs,
        container: media.container,
        sizeBytes: media.sizeBytes,
        importedAt: media.importedAt,
        lastSeenAt: media.lastSeenAt,
        privacyLabel: media.privacyLabel,
      },
    ]);

    persistence.saveSnapshot(createEmptyLocalStoreSnapshot(), '2026-07-04T02:41:00.000Z');

    expect(persistence.listMediaAssets()).toEqual([]);
    persistence.close();
  });

  it('maintains typed subtitle, cue, and word timing projections from the latest saved snapshot', () => {
    const store = populatedStore();
    const media = Object.values(store.snapshot().mediaAssets)[0]!;
    const track = makeSubtitleTrack({
      mediaId: media.id,
      language: 'pl',
      role: 'target',
      format: 'json',
      sourceKind: 'owned',
      sourcePath: 'fixtures/transcripts/synthetic-polish-dialogue.corrected.json',
      contentSha256: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      isActive: true,
      transcriptStatus: 'correcting',
      transcriptSourceKind: 'manual-edit',
      provenance: {
        language: 'pl',
        generatedAt: '2026-07-04T03:10:00.000Z',
        engine: 'lingotorte-correction-editor',
        modelName: 'manual',
        parentTrackId: 'track-parent',
        warningFlags: ['timingUnverified'],
      },
      qualityReport: {
        segmentCount: 1,
        coverageDurationMs: 900,
        emptyCueCount: 0,
        overlongCueCount: 0,
        overlappingCueCount: 0,
        suspiciousGapCount: 0,
        confidenceSummary: 'manual correction pending approval',
        comparisonSummary: '1 corrected cue',
        warningFlags: ['timingUnverified'],
        manualCorrectionCount: 1,
      },
    });
    const cue = makeCue({
      trackId: track.id,
      cueIndex: 2,
      startMs: 100,
      endMs: 1000,
      text: 'Cześć wszystkim',
      normalizedText: 'cześć wszystkim',
      textSha256: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    });
    const timing = makeTranscriptWordTiming({
      trackId: track.id,
      cueId: cue.id,
      wordIndex: 1,
      charStart: 6,
      charEnd: 15,
      text: 'wszystkim',
      normalizedText: 'wszystkim',
      startMs: 420,
      endMs: 900,
      confidence: 0.91,
      speakerId: 'speaker-1',
      sourceKind: 'manual-edit',
      engine: 'lingotorte-correction-editor',
      modelName: 'manual',
      modelVersion: '2026-07-04',
    });
    store.putSubtitleTrack(track);
    store.putCue(cue);
    store.putTranscriptWordTiming(timing);
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot(), '2026-07-04T03:11:00.000Z');

    expect(persistence.listSubtitleTracks()).toEqual([track]);
    expect(persistence.listCuesForTrack(track.id)).toEqual([cue]);
    expect(persistence.listTranscriptWordTimingsForCue(cue.id)).toEqual([timing]);

    persistence.saveSnapshot(createEmptyLocalStoreSnapshot(), '2026-07-04T03:12:00.000Z');

    expect(persistence.listSubtitleTracks()).toEqual([]);
    expect(persistence.listCuesForTrack(track.id)).toEqual([]);
    expect(persistence.listTranscriptWordTimingsForCue(cue.id)).toEqual([]);
    persistence.close();
  });

  it('preserves saved learner anchors and missing-media observations without cascading deletes', () => {
    const store = populatedStore();
    const snapshot = store.snapshot();
    const media = Object.values(snapshot.mediaAssets)[0]!;
    const savedItem = Object.values(snapshot.savedItems)[0]!;
    const savedOccurrence = Object.values(snapshot.savedOccurrences)[0]!;
    const missingObservation = makeMediaFileObservation({
      mediaId: media.id,
      path: media.originalPath,
      sizeBytes: 0,
      mtimeMs: 0,
      contentSha256: media.contentSha256,
      exists: false,
    });
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(
      {
        ...snapshot,
        mediaAssets: {},
        mediaObservations: [missingObservation],
      },
      '2026-07-04T03:20:00.000Z',
    );

    expect(persistence.listMediaAssets()).toEqual([]);
    expect(persistence.listMediaFileObservations(media.id)).toEqual([missingObservation]);
    expect(persistence.listSavedItems()).toEqual([savedItem]);
    expect(persistence.listSavedOccurrences()).toEqual([savedOccurrence]);
    persistence.close();
  });

  it('maintains review, practice, and import job projections from learner state', () => {
    const store = populatedStore();
    const snapshot = store.snapshot();
    const savedItem = Object.values(snapshot.savedItems)[0]!;
    const savedOccurrence = Object.values(snapshot.savedOccurrences)[0]!;
    const card = makeReviewCard({
      savedItemId: savedItem.id,
      savedOccurrenceId: savedOccurrence.id,
      cardType: 'recognition',
      promptTemplate: 'What does the source segment mean?',
    });
    const state = makeReviewCardState({
      cardId: card.id,
      state: 'review',
      dueAt: '2026-07-05T00:00:00.000Z',
      stability: 2.5,
      difficulty: 4.25,
      elapsedDays: 1,
      scheduledDays: 2,
      reps: 3,
      lapses: 1,
      lastReviewedAt: '2026-07-04T03:30:00.000Z',
      fsrsVersion: 'fsrs-6',
      updatedAt: '2026-07-04T03:31:00.000Z',
    });
    const event = makeReviewEvent({
      cardId: card.id,
      reviewedAt: '2026-07-04T03:30:00.000Z',
      rating: 'good',
      responseMs: 1200,
      previousStateJson: '{"state":"learning"}',
      nextStateJson: '{"state":"review"}',
      deviceId: 'local-test-device',
    });
    const attempt = makePracticeAttempt({
      cardId: card.id,
      mode: 'typed-input',
      result: 'pass',
      givenAnswer: 'Cześć',
      expectedAnswer: 'Cześć',
      responseMs: 900,
      sourceContext: savedOccurrence.sourceContext,
      reviewedAt: '2026-07-04T03:32:00.000Z',
      eventLink: { reviewEventId: event.id },
    });
    const importJob = {
      id: 'import-job-1',
      status: 'completed' as const,
      sourceKind: 'transcript' as const,
      startedAt: '2026-07-04T03:00:00.000Z',
      completedAt: '2026-07-04T03:01:00.000Z',
      inputManifestJson: '{"schemaVersion":"test.import.v1"}',
    };
    const importJobEvent = {
      id: 'import-job-event-1',
      jobId: importJob.id,
      level: 'info' as const,
      message: 'Imported transcript projection fixture',
      createdAt: '2026-07-04T03:01:00.000Z',
      dataJson: '{"cueCount":1}',
    };
    store.putReviewCard(card);
    store.putReviewCardState(state);
    store.addReviewEvent(event);
    store.addPracticeAttempt(attempt);
    store.putImportJob(importJob);
    store.addImportJobEvent(importJobEvent);
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot(), '2026-07-04T03:33:00.000Z');

    expect(persistence.listReviewCards()).toEqual([card]);
    expect(persistence.listReviewCardStates()).toEqual([state]);
    expect(persistence.listReviewEvents()).toEqual([event]);
    expect(persistence.listPracticeAttempts()).toEqual([attempt]);
    expect(persistence.listImportJobs()).toEqual([importJob]);
    expect(persistence.listImportJobEvents()).toEqual([importJobEvent]);
    persistence.close();
  });

  it('maintains export job projections from learner export state', () => {
    const store = populatedStore();
    const exportJob = {
      id: 'export-job-1',
      kind: 'learner-json-manifest' as const,
      status: 'completed' as const,
      startedAt: '2026-07-04T05:00:00.000Z',
      completedAt: '2026-07-04T05:00:02.000Z',
      destinationKind: 'browser-download' as const,
      destinationLabel: 'lingotorte-learner-state-20260704-050002.json',
      manifestSha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const,
      contentSummaryJson: '{"schemaVersion":"lingotorte.export-job-summary.v1","recordCount":6,"warningCount":3}',
    };
    store.putExportJob(exportJob);
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot(), '2026-07-04T05:01:00.000Z');

    expect(persistence.listExportJobs()).toEqual([exportJob]);
    expect(persistence.loadSnapshot().exportJobs).toEqual({ [exportJob.id]: exportJob });

    persistence.saveSnapshot(createEmptyLocalStoreSnapshot(), '2026-07-04T05:02:00.000Z');

    expect(persistence.listExportJobs()).toEqual([]);
    expect(persistence.loadSnapshot().exportJobs).toEqual({});
    persistence.close();
  });

  it('maintains provider policy projections from local provider consent state', () => {
    const store = populatedStore();
    const policy = {
      id: 'provider-policy-elevenlabs-scribe',
      providerId: 'elevenlabs-scribe' as const,
      enabled: true,
      allowedDataClasses: ['owned-media-audio', 'transcript-text'] as const,
      requiresConfirmation: true,
      firstApprovedAt: '2026-07-04T06:00:00.000Z',
      createdAt: '2026-07-04T05:59:00.000Z',
      updatedAt: '2026-07-04T06:01:00.000Z',
    };
    store.putProviderPolicy(policy);
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot(), '2026-07-04T06:02:00.000Z');

    expect(persistence.listProviderPolicies()).toEqual([policy]);
    expect(persistence.loadSnapshot().providerPolicies).toEqual({ [policy.id]: policy });

    persistence.saveSnapshot(createEmptyLocalStoreSnapshot(), '2026-07-04T06:03:00.000Z');

    expect(persistence.listProviderPolicies()).toEqual([]);
    expect(persistence.loadSnapshot().providerPolicies).toEqual({});
    persistence.close();
  });

  it('replays review events from the authoritative append-only event table', () => {
    const store = populatedStore();
    const snapshot = store.snapshot();
    const savedItem = Object.values(snapshot.savedItems)[0]!;
    const savedOccurrence = Object.values(snapshot.savedOccurrences)[0]!;
    const card = makeReviewCard({
      savedItemId: savedItem.id,
      savedOccurrenceId: savedOccurrence.id,
      cardType: 'recognition',
      promptTemplate: 'What does the source segment mean?',
    });
    const event = makeReviewEvent({
      cardId: card.id,
      reviewedAt: '2026-07-04T04:00:00.000Z',
      rating: 'good',
      previousStateJson: '{"state":"learning"}',
      nextStateJson: '{"state":"review"}',
    });
    store.putReviewCard(card);
    store.addReviewEvent(event);
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot(), '2026-07-04T04:01:00.000Z');
    persistence.saveSnapshot({ ...store.snapshot(), reviewEvents: [] }, '2026-07-04T04:02:00.000Z');

    expect(persistence.listReviewEvents()).toEqual([event]);
    expect(persistence.loadSnapshot().reviewEvents).toEqual([event]);
    persistence.close();
  });

  it('treats duplicate review event snapshot writes as idempotent appends', () => {
    const store = populatedStore();
    const snapshot = store.snapshot();
    const savedItem = Object.values(snapshot.savedItems)[0]!;
    const savedOccurrence = Object.values(snapshot.savedOccurrences)[0]!;
    const card = makeReviewCard({
      savedItemId: savedItem.id,
      savedOccurrenceId: savedOccurrence.id,
      cardType: 'recognition',
      promptTemplate: 'What does the source segment mean?',
    });
    const event = makeReviewEvent({
      cardId: card.id,
      reviewedAt: '2026-07-04T04:10:00.000Z',
      rating: 'easy',
      previousStateJson: '{"state":"review"}',
      nextStateJson: '{"state":"review"}',
    });
    store.putReviewCard(card);
    store.addReviewEvent(event);
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot(), '2026-07-04T04:11:00.000Z');
    persistence.saveSnapshot(store.snapshot(), '2026-07-04T04:12:00.000Z');

    expect(persistence.listReviewEvents()).toEqual([event]);
    persistence.close();
  });

  it('rejects attempts to rewrite an existing append-only review event', () => {
    const store = populatedStore();
    const snapshot = store.snapshot();
    const savedItem = Object.values(snapshot.savedItems)[0]!;
    const savedOccurrence = Object.values(snapshot.savedOccurrences)[0]!;
    const card = makeReviewCard({
      savedItemId: savedItem.id,
      savedOccurrenceId: savedOccurrence.id,
      cardType: 'recognition',
      promptTemplate: 'What does the source segment mean?',
    });
    const event = makeReviewEvent({
      cardId: card.id,
      reviewedAt: '2026-07-04T04:20:00.000Z',
      rating: 'good',
      previousStateJson: '{"state":"learning"}',
      nextStateJson: '{"state":"review"}',
    });
    store.putReviewCard(card);
    store.addReviewEvent(event);
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot(), '2026-07-04T04:21:00.000Z');

    expect(() =>
      persistence.saveSnapshot(
        {
          ...store.snapshot(),
          reviewEvents: [{ ...event, rating: 'again' }],
        },
        '2026-07-04T04:22:00.000Z',
      ),
    ).toThrow(/append-only review event/);
    expect(persistence.listReviewEvents()).toEqual([event]);
    persistence.close();
  });

  it('replays import job events from the authoritative append-only event table', () => {
    const store = populatedStore();
    const importJob = {
      id: 'import-job-authoritative-1',
      status: 'completed' as const,
      sourceKind: 'transcript' as const,
      startedAt: '2026-07-04T04:30:00.000Z',
      completedAt: '2026-07-04T04:31:00.000Z',
      inputManifestJson: '{"schemaVersion":"test.import.v1"}',
    };
    const importJobEvent = {
      id: 'import-job-event-authoritative-1',
      jobId: importJob.id,
      level: 'info' as const,
      message: 'Imported transcript projection fixture',
      createdAt: '2026-07-04T04:31:00.000Z',
      dataJson: '{"cueCount":1}',
    };
    store.putImportJob(importJob);
    store.addImportJobEvent(importJobEvent);
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot(), '2026-07-04T04:32:00.000Z');
    persistence.saveSnapshot({ ...store.snapshot(), importJobEvents: [] }, '2026-07-04T04:33:00.000Z');

    expect(persistence.listImportJobEvents()).toEqual([importJobEvent]);
    expect(persistence.loadSnapshot().importJobEvents).toEqual([importJobEvent]);
    persistence.close();
  });

  it('treats duplicate import job event snapshot writes as idempotent appends', () => {
    const store = populatedStore();
    const importJob = {
      id: 'import-job-idempotent-1',
      status: 'completed' as const,
      sourceKind: 'transcript' as const,
      startedAt: '2026-07-04T04:40:00.000Z',
      completedAt: '2026-07-04T04:41:00.000Z',
      inputManifestJson: '{"schemaVersion":"test.import.v1"}',
    };
    const importJobEvent = {
      id: 'import-job-event-idempotent-1',
      jobId: importJob.id,
      level: 'warn' as const,
      message: 'Imported with warnings',
      createdAt: '2026-07-04T04:41:00.000Z',
      dataJson: '{"warningCount":1}',
    };
    store.putImportJob(importJob);
    store.addImportJobEvent(importJobEvent);
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot(), '2026-07-04T04:42:00.000Z');
    persistence.saveSnapshot(store.snapshot(), '2026-07-04T04:43:00.000Z');

    expect(persistence.listImportJobEvents()).toEqual([importJobEvent]);
    persistence.close();
  });

  it('rejects attempts to rewrite an existing append-only import job event', () => {
    const store = populatedStore();
    const importJob = {
      id: 'import-job-rewrite-1',
      status: 'completed' as const,
      sourceKind: 'transcript' as const,
      startedAt: '2026-07-04T04:50:00.000Z',
      completedAt: '2026-07-04T04:51:00.000Z',
      inputManifestJson: '{"schemaVersion":"test.import.v1"}',
    };
    const importJobEvent = {
      id: 'import-job-event-rewrite-1',
      jobId: importJob.id,
      level: 'info' as const,
      message: 'Imported transcript projection fixture',
      createdAt: '2026-07-04T04:51:00.000Z',
      dataJson: '{"cueCount":1}',
    };
    store.putImportJob(importJob);
    store.addImportJobEvent(importJobEvent);
    const persistence = SqliteLocalPersistence.open(':memory:');

    persistence.saveSnapshot(store.snapshot(), '2026-07-04T04:52:00.000Z');

    expect(() =>
      persistence.saveSnapshot(
        {
          ...store.snapshot(),
          importJobEvents: [{ ...importJobEvent, level: 'error', message: 'Rewritten event' }],
        },
        '2026-07-04T04:53:00.000Z',
      ),
    ).toThrow(/append-only import job event/);
    expect(persistence.listImportJobEvents()).toEqual([importJobEvent]);
    persistence.close();
  });
});
