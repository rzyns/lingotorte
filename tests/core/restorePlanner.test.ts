import { describe, it, expect } from 'vitest';
import { LocalStore, ExportService, RestoreService, SavedOccurrenceService, PracticeService } from '../../packages/storage/src';
import { ReviewService, defaultFsrsConfig } from '../../packages/review/src';
import { makeSubtitleTrack, computeExportIntegrity } from '../../packages/domain/src';

function fixture() {
  const store = new LocalStore();
  const sourceContext = { mediaId: 'media', mediaPath: '/synthetic/media.webm', mediaFingerprint: `sha256:${'a'.repeat(64)}` as const, subtitleTrackId: 'track', cueId: 'cue', timeRangeMs: { start: 0, end: 1000 }, tokenSpan: { startToken: 0, endToken: 1 }, charSpan: { start: 0, end: 5 } };
  store.putSubtitleTrack({ ...makeSubtitleTrack({ mediaId: 'media', language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: '/synthetic/track.srt', contentSha256: sourceContext.mediaFingerprint, isActive: true }), id: 'track' });
  const saved = new SavedOccurrenceService(store).saveSelection({ kind: 'lexeme', language: 'pl', displayText: 'hello', mediaId: 'media', cueId: 'cue', startMs: 0, endMs: 1000, sourceContext });
  const { card } = new ReviewService(store, defaultFsrsConfig()).createCard({ savedItem: saved.item, savedOccurrence: saved.occurrence, cardType: 'recognition' });
  new PracticeService(store).submitAttempt({ cardId: card.id, mode: 'typed-input', result: 'pass', sourceContext: { ...sourceContext, mediaPath: '/synthetic/captured.webm' }, reviewedAt: '2026-06-21T12:00:00.000Z' });
  return store;
}
function confirm(service: RestoreService, manifest: ReturnType<ExportService['buildManifest']>, replace = false) {
  return { confirmedAt: '2026-06-21T12:00:00.000Z', confirmOverwrite: !replace, confirmReplace: replace, acknowledgedWarnings: service.preview(manifest).warnings.map(w => w.kind) };
}
describe('lt-3xg restore boundary', () => {
  it.each([false, true].flatMap(replace => ['constructor', '__proto__', 'ordinary-missing'].flatMap(missing => ['occurrence', 'card', 'state', 'review', 'practice', 'practice-review'].map(kind => ({ replace, missing, kind })))) )('rejects absent $missing $kind reference atomically (replace=$replace)', ({ replace, missing, kind }) => {
    const source = fixture(); const original = new ExportService(source, 'test').buildManifest();
        const target = fixture(); const service = new RestoreService(target);
        const empty = new ExportService(new LocalStore(), 'test').buildManifest();
        service.restore(empty, confirm(service, empty, true));
        const before = target.snapshot(); const audit = target.snapshotRestoreAudit(); const pending = target.snapshotPendingRestoreIntent();
        const content = { ...structuredClone(empty.content), sourceContexts: original.content.sourceContexts };
        if (kind === 'occurrence') content.savedOccurrences = [{ ...original.content.savedOccurrences[0]!, savedItemId: missing }];
        if (kind === 'card') content.reviewCards = [{ ...original.content.reviewCards[0]!, savedItemId: missing, savedOccurrenceId: missing }];
        if (kind === 'state') content.reviewCardStates = [{ ...original.content.reviewCardStates[0]!, cardId: missing }];
        if (kind === 'review') content.reviewEvents = [{ ...original.content.reviewEvents[0]!, cardId: missing }];
        if (kind === 'practice') content.practiceAttempts = [{ ...original.content.practiceAttempts[0]!, cardId: missing, eventLink: {} }];
        if (kind === 'practice-review') {
          Object.assign(content, { savedItems: original.content.savedItems, savedOccurrences: original.content.savedOccurrences, reviewCards: original.content.reviewCards });
          content.practiceAttempts = [{ ...original.content.practiceAttempts[0]!, eventLink: { reviewEventId: missing } }];
        }
        const bad = { ...empty, content, integrity: computeExportIntegrity(content) };
        expect(() => service.restoreWithReceipt(bad, { confirmedAt: '2026-06-21T12:00:00.000Z', confirmOverwrite: !replace, confirmReplace: replace, acknowledgedWarnings: ['restore-overwrites-local-data', ...original.privacyWarnings.map(w => w.kind)] })).toThrow(/reference/);
        expect(target.snapshot()).toEqual(before); expect(target.snapshotRestoreAudit()).toEqual(audit); expect(target.snapshotPendingRestoreIntent()).toEqual(pending);
  });
  it.each(['constructor', '__proto__'])('preserves real own-entry identifier %s through store/export/restore', id => {
    const source = fixture(); const snapshot = source.snapshot();
    const item = { ...Object.values(snapshot.savedItems)[0]!, id };
    const occurrence = { ...Object.values(snapshot.savedOccurrences)[0]!, id, savedItemId: id };
    const card = { ...Object.values(snapshot.reviewCards)[0]!, id, savedItemId: id, savedOccurrenceId: id };
    const state = { ...Object.values(snapshot.reviewCardStates)[0]!, cardId: id };
    const special = new LocalStore();
    expect(special.getSavedItem(id)).toBeUndefined(); expect(special.getSavedOccurrence(id)).toBeUndefined(); expect(special.getReviewCard(id)).toBeUndefined(); expect(special.getReviewCardState(id)).toBeUndefined();
    special.putSavedItem(item); special.putSavedOccurrence(occurrence); special.putReviewCard(card); special.putReviewCardState(state);
    special.addReviewEvent({ ...snapshot.reviewEvents[0]!, id, cardId: id });
    special.addPracticeAttempt({ ...snapshot.practiceAttempts[0]!, id, cardId: id, eventLink: { reviewEventId: id } });
    expect(special.getSavedItem(id)).toEqual(item); expect(Object.keys(special.snapshot().savedItems)).toEqual([id]);
    const manifest = new ExportService(special, 'test').buildManifest();
    for (const replace of [false, true]) {
      const target = new LocalStore(); const service = new RestoreService(target);
      expect(service.plan(manifest).preview.details.savedItems[0]?.action).toBe('added');
      service.restore(manifest, confirm(service, manifest, replace));
      expect(target.snapshot().savedItems).toEqual(special.snapshot().savedItems);
      expect(service.plan(manifest).effects.reviewEvents.skippedIdentical).toBe(1);
      expect(service.plan(manifest).preview.details.reviewEvents[0]?.action).toBe('skipped-identical');
      expect(service.plan(manifest).preview.details.reviewCardStates[0]?.action).toBe('skipped-identical');
    }
  });
  it.each([false, true])('rejects identity rebinding and audit-only review conflict atomically (replace=%s)', replace => {
    const target = fixture(); const service = new RestoreService(target); const original = new ExportService(target, 'test').buildManifest();
    const assertRejected = (content: typeof original.content, reason: RegExp) => {
      const before = target.snapshot(); const audit = target.snapshotRestoreAudit(); const pending = target.snapshotPendingRestoreIntent();
      expect(() => service.restoreWithReceipt({ ...original, content, integrity: computeExportIntegrity(content) }, { confirmedAt: '2026-06-21T12:00:00.000Z', confirmOverwrite: !replace, confirmReplace: replace, acknowledgedWarnings: [] })).toThrow(reason);
      expect(target.snapshot()).toEqual(before); expect(target.snapshotRestoreAudit()).toEqual(audit); expect(target.snapshotPendingRestoreIntent()).toEqual(pending);
    };
    assertRejected({ ...original.content, savedItems: original.content.savedItems.map(i => ({ ...i, language: 'en' })) }, /identity anchor/);
    assertRejected({ ...original.content, savedOccurrences: original.content.savedOccurrences.map(o => ({ ...o, savedItemId: 'other' })) }, /identity anchor/);
    assertRejected({ ...original.content, reviewCards: original.content.reviewCards.map(c => ({ ...c, savedOccurrenceId: 'other' })) }, /identity anchor/);
    const empty = new ExportService(new LocalStore(), 'test').buildManifest(); service.restore(empty, confirm(service, empty, true));
    assertRejected({ ...original.content, reviewEvents: original.content.reviewEvents.map(e => ({ ...e, rating: 'again' as const })) }, /immutable.*reviewEvents/);
  });
  it.each([false, true])('rejects late mutable/practice duplicates without any active/audit mutation (replace=%s)', replace => {
    for (const name of ['savedItems', 'practiceAttempts'] as const) {
      const target = fixture(); const service = new RestoreService(target);
      const manifest = new ExportService(target, 'test').buildManifest();
      const before = target.snapshot(); const audit = target.snapshotRestoreAudit();
      const records = manifest.content[name];
      const conflict = name === 'savedItems' ? { ...records[0], notes: 'conflict' } : { ...records[0], givenAnswer: 'conflict' };
      const content = { ...manifest.content, [name]: [...records, conflict] };
      const bad = { ...manifest, content, integrity: computeExportIntegrity(content) };
      expect(() => service.restore(bad, confirm(service, manifest, replace))).toThrow(/conflict/i);
      expect(target.snapshot()).toEqual(before); expect(target.snapshotRestoreAudit()).toEqual(audit);
    }
  });
  it('retains audit on empty session replacement and rejects audit-only conflicts', () => {
    const target = fixture(); const service = new RestoreService(target);
    const original = new ExportService(target, 'test').buildManifest();
    const empty = new ExportService(new LocalStore(), 'test').buildManifest();
    const before = target.snapshot();
    const result = service.restoreWithReceipt(empty, confirm(service, empty, true));
    expect(result.receipt.durability).toBe('session-only'); expect(result.receipt.durablySaved).toBe(false);
    expect(result.snapshot.reviewEvents).toEqual([]); expect(result.snapshot.practiceAttempts).toEqual([]);
    expect(result.snapshot.subtitleTracks).toEqual(before.subtitleTracks);
    expect(target.snapshotRestoreAudit()).toEqual({ reviewEvents: before.reviewEvents, practiceAttempts: before.practiceAttempts });
    const content = { ...original.content, practiceAttempts: original.content.practiceAttempts.map(a => ({ ...a, result: 'fail' as const })) };
    const bad = { ...original, content, integrity: computeExportIntegrity(content) };
    for (const replace of [false, true]) expect(() => service.restore(bad, { confirmedAt: '2026-06-21T12:00:00.000Z', confirmOverwrite: !replace, confirmReplace: replace, acknowledgedWarnings: [] })).toThrow(/immutable.*practiceAttempts/);
    const plan = service.plan(original);
    expect(service.preview(original)).toEqual(plan.preview);
    const restored = service.restoreWithReceipt(original, confirm(service, original));
    expect(restored.snapshot.practiceAttempts).toEqual(before.practiceAttempts);
    expect(restored.receipt.effects.practiceAttempts.reactivated).toBe(1);
    expect(restored.receipt.effects.reviewEvents.updated).toBe(0);
  });
  it('rejects contradictory nested link and source context spellings', () => {
    const store = fixture(); const manifest = new ExportService(store, 'test').buildManifest();
    const attempt = manifest.content.practiceAttempts[0]!;
    const raw = { ...attempt, eventLink_reviewEventId: 'other-review' };
    const content = { ...manifest.content, practiceAttempts: [raw] };
    expect(() => RestoreService.validateManifest({ ...manifest, content, integrity: computeExportIntegrity(content) })).toThrow(/spellings/);
  });
  it('decodes legacy flat links without replacing supplied integrity, and revalidates before merge', () => {
    const source = fixture(); const manifest = new ExportService(source, 'test').buildManifest();
    const content = { ...manifest.content, practiceAttempts: manifest.content.practiceAttempts.map(a => {
      const { eventLink, ...rest } = a;
      return { ...rest, eventLink_reviewEventId: eventLink.reviewEventId };
    }) };
    const wire = { ...manifest, content, integrity: computeExportIntegrity(content as unknown as typeof manifest.content) };
    const decoded = RestoreService.validateManifest(JSON.parse(JSON.stringify(wire)));
    expect(decoded.integrity).toEqual(wire.integrity);
    const target = new LocalStore(); const service = new RestoreService(target);
    service.restore(decoded, confirm(service, decoded)); service.restore(decoded, confirm(service, decoded));
    expect(target.snapshot().practiceAttempts).toEqual(source.snapshot().practiceAttempts);
    expect(() => RestoreService.validateManifest(target.snapshotPendingRestoreIntent()!.manifest)).not.toThrow();
    const changed = { ...decoded, content: { ...decoded.content, practiceAttempts: decoded.content.practiceAttempts.map(a => ({ ...a, givenAnswer: 'tampered' })) } };
    expect(() => service.preview(changed)).toThrow(/integrity/);
  });
  it('serialized linked practice merges twice without rerating or context loss', () => {
    const source = fixture();
    const manifest = RestoreService.validateManifest(JSON.parse(JSON.stringify(new ExportService(source, 'test').buildManifest())));
    const target = new LocalStore(); const service = new RestoreService(target);
    service.restore(manifest, confirm(service, manifest));
    const once = target.snapshot();
    expect(once.practiceAttempts).toEqual(source.snapshot().practiceAttempts);
    expect(once.reviewEvents).toEqual(source.snapshot().reviewEvents);
    service.restore(manifest, confirm(service, manifest));
    expect(target.snapshot()).toEqual(once);
  });
  it('rejects service-entry hash tampering before mutation', () => {
    const target = fixture(); const service = new RestoreService(target);
    const manifest = new ExportService(target, 'test').buildManifest();
    const confirmation = confirm(service, manifest); const before = target.snapshot();
    const bad = { ...manifest, integrity: { ...manifest.integrity, recordCount: 0 } };
    expect(() => service.restore(bad, confirmation)).toThrow(/integrity/);
    expect(target.snapshot()).toEqual(before);
  });
  it('stages nested data independently', () => {
    const target = fixture(); const snapshot = target.snapshot();
    (snapshot.practiceAttempts[0]!.sourceContext.timeRangeMs as { start: number }).start = 900;
    expect(target.snapshot().practiceAttempts[0]!.sourceContext.timeRangeMs.start).toBe(0);
  });
  it.each([false, true])('coalesces identical input and rejects immutable conflicts atomically (replace=%s)', replace => {
    const target = fixture(); const service = new RestoreService(target);
    const manifest = new ExportService(target, 'test').buildManifest();
    const content = { ...manifest.content, savedItems: [...manifest.content.savedItems, manifest.content.savedItems[0]!] };
    const duplicate = { ...manifest, content, integrity: computeExportIntegrity(content) };
    const preview = service.preview(duplicate);
    expect(preview.counts.savedItems).toBe(1);
    service.restore(duplicate, confirm(service, duplicate, replace));
    const before = target.snapshot();
    const badContent = { ...manifest.content, reviewEvents: manifest.content.reviewEvents.map(e => ({ ...e, rating: 'again' as const })) };
    const bad = { ...manifest, content: badContent, integrity: computeExportIntegrity(badContent) };
    expect(() => service.restore(bad, { ...confirm(service, manifest, replace) })).toThrow(/conflict/i);
    expect(target.snapshot()).toEqual(before);
  });
});
