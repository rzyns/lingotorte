import { describe, it, expect } from 'vitest';
import * as domain from '../../packages/domain/src';
import { canonicalJson, makeSubtitleTrack } from '../../packages/domain/src';
import { LocalStore, ExportService, RestoreService, SavedOccurrenceService, PracticeService, createEmptyLocalStoreSnapshot } from '../../packages/storage/src';
import { sameHistoryPayload } from '../../packages/storage/src/learnerAudit.ts';
import { ReviewService, defaultFsrsConfig } from '../../packages/review/src';

// lt-7lq: synthetic-only fixtures; no media files, providers or network.
const SIX = ['savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates', 'reviewEvents', 'practiceAttempts'];
const EXCLUDED = ['mediaAssets', 'mediaObservations', 'subtitleTracks', 'cues', 'transcriptWordTimings', 'learnerAudit', 'exportJobs', 'providerPolicies', 'importJobs', 'importJobEvents'];

function fixture() {
  const store = new LocalStore();
  const sourceContext = { mediaId: 'media', mediaPath: '/synthetic/media.webm', mediaFingerprint: `sha256:${'a'.repeat(64)}` as const, subtitleTrackId: 'track', cueId: 'cue', timeRangeMs: { start: 0, end: 1000 }, tokenSpan: { startToken: 0, endToken: 1 }, charSpan: { start: 0, end: 5 } };
  store.putSubtitleTrack({ ...makeSubtitleTrack({ mediaId: 'media', language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: '/synthetic/track.srt', contentSha256: sourceContext.mediaFingerprint, isActive: true }), id: 'track' });
  const saved = new SavedOccurrenceService(store).saveSelection({ kind: 'lexeme', language: 'pl', displayText: 'hello', mediaId: 'media', cueId: 'cue', startMs: 0, endMs: 1000, sourceContext });
  const { card } = new ReviewService(store, defaultFsrsConfig()).createCard({ savedItem: saved.item, savedOccurrence: saved.occurrence, cardType: 'recognition' });
  const captured = { ...sourceContext, mediaPath: '/synthetic/captured.webm' };
  const { attempt } = new PracticeService(store).submitAttempt({ cardId: card.id, mode: 'typed-input', result: 'pass', sourceContext: captured, reviewedAt: '2026-06-21T12:00:00.000Z', updateFsrs: true });
  return { store, attempt, captured };
}
const confirm = (service: RestoreService, manifest: domain.LearnerExportManifest, replace = false) =>
  ({ confirmedAt: '2026-06-21T12:00:00.000Z', confirmOverwrite: !replace, confirmReplace: replace, acknowledgedWarnings: [...service.preview(manifest).warnings.map(w => w.kind), 'restore-overwrites-local-data' as const] });

describe('lt-7lq active-only learner export scope', () => {
  it('produced manifest contains exactly the six learner collections plus supporting source contexts', () => {
    const { store } = fixture();
    const manifest = new ExportService(store, 'test').buildManifest();
    expect(Object.keys(manifest.content).sort()).toEqual([...SIX, 'sourceContexts'].sort());
    for (const name of SIX) expect((manifest.content as unknown as Record<string, unknown[]>)[name]!.length).toBeGreaterThan(0);
    const wire = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
    expect(Object.keys(wire).sort()).toEqual(['applicationVersion', 'content', 'exportedAt', 'integrity', 'privacyWarnings', 'schemaVersion']);
  });

  it('declares the exact included and excluded collection lists, covering every store collection', () => {
    const included = (domain as Record<string, unknown>).LEARNER_EXPORT_INCLUDED_COLLECTIONS;
    const excluded = (domain as Record<string, unknown>).LEARNER_EXPORT_EXCLUDED_COLLECTIONS;
    expect(included).toEqual(SIX);
    expect(excluded).toEqual(EXCLUDED);
    expect([...SIX, ...EXCLUDED].sort()).toEqual(Object.keys(createEmptyLocalStoreSnapshot()).sort());
    const { store } = fixture();
    const content = new ExportService(store, 'test').buildManifest().content as Record<string, unknown>;
    for (const name of EXCLUDED) expect(Object.hasOwn(content, name)).toBe(false);
    expect(store.snapshot().subtitleTracks.track).toBeDefined();
  });

  it('re-export after replace contains only active records; inactive audit stays local only', () => {
    const { store } = fixture();
    const original = new ExportService(store, 'test').buildManifest();
    const service = new RestoreService(store);
    const empty = new ExportService(new LocalStore(), 'test').buildManifest();
    service.restore(empty, confirm(service, empty, true));
    expect(store.listAuditReviewEvents()).toHaveLength(1);
    expect(store.listAuditPracticeAttempts()).toHaveLength(1);
    const after = new ExportService(store, 'test').buildManifest();
    for (const name of SIX) expect((after.content as unknown as Record<string, unknown[]>)[name]).toEqual([]);
    const json = JSON.stringify(after);
    expect(json).not.toContain(original.content.reviewEvents[0]!.id);
    expect(json).not.toContain(original.content.practiceAttempts[0]!.id);
    expect(json).not.toContain('learnerAudit');
  });

  it('serialized FSRS-linked practice roundtrips into a fresh store with eventLink and captured context unchanged', () => {
    const { store, attempt, captured } = fixture();
    expect(attempt.eventLink.reviewEventId).toBeDefined();
    // Mutate current track metadata after capture; export must not enrich the immutable attempt.
    store.putSubtitleTrack({ ...store.snapshot().subtitleTracks.track!, language: 'en', sourcePath: '/synthetic/renamed.srt' });
    const exported = new ExportService(store, 'test').buildManifest();
    const exportedAttempt = exported.content.practiceAttempts[0]!;
    // Wire adds only the sourceContextId dictionary reference; payload is otherwise the captured attempt.
    const { sourceContextId, ...exportedPayload } = exportedAttempt as typeof exportedAttempt & { sourceContextId?: string };
    expect(sourceContextId).toMatch(/^source-context-\d+$/);
    expect(sameHistoryPayload(exportedPayload, attempt)).toBe(true);
    expect(JSON.stringify(exportedAttempt.eventLink)).toBe(JSON.stringify(attempt.eventLink));
    expect(canonicalJson(exportedAttempt.sourceContext)).toBe(canonicalJson(captured));
    const decoded = RestoreService.validateManifest(JSON.parse(JSON.stringify(exported)));
    const fresh = new LocalStore(); const service = new RestoreService(fresh);
    service.restore(decoded, confirm(service, decoded));
    const restored = fresh.snapshot().practiceAttempts;
    expect(restored).toHaveLength(1);
    expect(sameHistoryPayload(restored[0], attempt)).toBe(true);
    expect(JSON.stringify(restored[0]!.eventLink)).toBe(JSON.stringify(attempt.eventLink));
    expect(canonicalJson(restored[0]!.sourceContext)).toBe(canonicalJson(captured));
    expect(fresh.snapshot().reviewEvents.map(e => e.id)).toEqual([attempt.eventLink.reviewEventId]);
    // Fresh app gets learner records only; no library/media is invented.
    expect(fresh.snapshot().subtitleTracks).toEqual({});
    expect(fresh.snapshot().mediaAssets).toEqual({});
    expect(fresh.snapshot().cues).toEqual({});
    const reexported = RestoreService.validateManifest(JSON.parse(JSON.stringify(new ExportService(fresh, 'test').buildManifest())));
    expect(canonicalJson(reexported.content)).toBe(canonicalJson(decoded.content));
  });
});
