import { describe, expect, it } from 'vitest';
import { makeMediaAsset, makeSavedItem, makeSavedOccurrence, validateSavedOccurrenceSourceContext } from '../../packages/domain/src';
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
      schemaVersion: 2,
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
});
