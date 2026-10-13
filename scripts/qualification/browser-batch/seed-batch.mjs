// Synthetic seed builders for the browser batch. Pure: no listener, no file, no network.
// `domain` / `storage` are the app's own modules loaded by the caller (Vite SSR).
export const AT = '2026-06-21T12:00:00.000Z';
export const MODES = ['typed-input', 'multiple-choice', 'audio-recall', 'speaking', 'sentence-builder'];
const FP = 'sha256:' + 'b'.repeat(64);

// lt-2t4 step 2: one linked record chain per practice mode (mirrors tests/core/lt2t4IntegratedQualification.test.ts).
export function learnerStore({ storage, domain }) {
  const store = new storage.LocalStore();
  const mediaId = 'bqb-media'; const trackId = 'bqb-track'; const cueId = 'bqb-cue';
  store.putMediaAsset({ id: mediaId, title: 'bqb synthetic', originalPath: '/media/bqb.webm', contentSha256: FP, durationMs: 1000, container: 'webm', sizeBytes: 123, importedAt: AT, lastSeenAt: AT, privacyLabel: 'synthetic' });
  store.putSubtitleTrack({ ...domain.makeSubtitleTrack({ mediaId, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: '/media/bqb.srt', contentSha256: FP, isActive: true }), id: trackId, createdAt: AT });
  MODES.forEach((mode, i) => {
    const s = String(i);
    const sourceContext = { mediaId, mediaPath: '/media/bqb.webm', mediaFingerprint: FP, subtitleTrackId: trackId, cueId, timeRangeMs: { start: 0, end: 1000 }, tokenSpan: { startToken: 0, endToken: 1 }, charSpan: { start: 0, end: 5 } };
    store.putSavedItem({ id: 'bqb-item-' + s, kind: 'lexeme', language: 'pl', displayText: 'bqb' + s, createdAt: AT, updatedAt: AT });
    store.putSavedOccurrence({ id: 'bqb-occ-' + s, savedItemId: 'bqb-item-' + s, mediaId, cueId, startMs: 0, endMs: 1000, selectionKind: 'lexeme', selectionText: 'bqb' + s, sourceContext, createdAt: AT });
    store.putReviewCard({ id: 'bqb-card-' + s, savedItemId: 'bqb-item-' + s, savedOccurrenceId: 'bqb-occ-' + s, cardType: 'recognition', promptTemplate: 'bqb', createdAt: AT });
    store.putReviewCardState({ cardId: 'bqb-card-' + s, state: 'review', dueAt: AT, stability: 2, difficulty: 3, elapsedDays: 1, scheduledDays: 1, reps: 1, lapses: 0, fsrsVersion: 'synthetic', updatedAt: AT });
    store.addReviewEvent({ id: 'bqb-review-' + s, cardId: 'bqb-card-' + s, rating: 'good', reviewedAt: AT, createdAt: AT, previousStateJson: '{"state":"new"}', nextStateJson: '{"state":"review"}' });
    store.addPracticeAttempt({ id: 'bqb-attempt-' + s, cardId: 'bqb-card-' + s, mode, result: 'pass', sourceContext, reviewedAt: AT, createdAt: AT, givenAnswer: 'bqb', expectedAnswer: 'bqb', responseMs: 100, eventLink: { reviewEventId: 'bqb-review-' + s } });
  });
  return store;
}

export const manifestOf = ({ storage }, store) => JSON.stringify(new storage.ExportService(store, 'browser-batch').buildManifest());
export const emptyManifest = (mods) => manifestOf(mods, new mods.storage.LocalStore());

// lt-13i: one draft target transcript (2 cues, word timings) + one saved occurrence anchored on cue 0.
export function transcriptStore({ storage, domain }) {
  const store = new storage.LocalStore();
  const mediaId = 'bqt-media'; const trackId = 'bqt-track';
  store.putMediaAsset({ id: mediaId, title: 'bqt synthetic', originalPath: '/media/bqt.webm', contentSha256: FP, durationMs: 4000, container: 'webm', sizeBytes: 123, importedAt: AT, lastSeenAt: AT, privacyLabel: 'synthetic' });
  store.putSubtitleTrack({ ...domain.makeSubtitleTrack({ mediaId, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic', sourcePath: '/media/bqt.srt', contentSha256: FP, isActive: true, transcriptStatus: 'draft' }), id: trackId, createdAt: AT });
  const cues = [['dzien dobry', 0, 1500], ['do widzenia', 2000, 3500]];
  cues.forEach(([text, startMs, endMs], i) => {
    const cueId = 'bqt-cue-' + i;
    store.putCue({ ...domain.makeCue({ trackId, cueIndex: i, startMs, endMs, text, normalizedText: text, textSha256: FP }), id: cueId });
    text.split(' ').forEach((word, w) => {
      const charStart = text.indexOf(word);
      store.putTranscriptWordTiming({ ...domain.makeTranscriptWordTiming({ trackId, cueId, wordIndex: w, charStart, charEnd: charStart + word.length, text: word, normalizedText: word, startMs: startMs + w * 600, endMs: startMs + w * 600 + 500, sourceKind: 'synthetic', engine: 'synthetic', modelName: 'synthetic' }), id: cueId + '-w' + w });
    });
  });
  // Saved occurrence anchored on the original (V1) cue 0; must survive Apply/Approve unchanged.
  const sourceContext = { mediaId, mediaPath: '/media/bqt.webm', mediaFingerprint: FP, subtitleTrackId: trackId, cueId: 'bqt-cue-0', timeRangeMs: { start: 0, end: 1500 }, tokenSpan: { startToken: 0, endToken: 1 }, charSpan: { start: 0, end: 5 } };
  store.putSavedItem({ id: 'bqt-item', kind: 'lexeme', language: 'pl', displayText: 'dzien', createdAt: AT, updatedAt: AT });
  store.putSavedOccurrence({ id: 'bqt-occ', savedItemId: 'bqt-item', mediaId, cueId: 'bqt-cue-0', startMs: 0, endMs: 1500, selectionKind: 'lexeme', selectionText: 'dzien', sourceContext, createdAt: AT });
  return store;
}

// Anchor projection compared before/after transcript phases (fixed fields only).
export function anchorDigest(snapshot) {
  const occ = Array.isArray(snapshot?.savedOccurrences) ? snapshot.savedOccurrences : Object.values(snapshot?.savedOccurrences ?? {});
  return occ.map((o) => ({ id: o.id, cueId: o.cueId, startMs: o.startMs, endMs: o.endMs, track: o.sourceContext?.subtitleTrackId, span: o.sourceContext?.charSpan, tokens: o.sourceContext?.tokenSpan, fp: o.sourceContext?.mediaFingerprint })).sort((a, b) => (a.id < b.id ? -1 : 1));
}

// Pure projection used by oracles: active learner counts + practice modes present.
export function learnerCounts(snapshot) {
  const n = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);
  const keys = ['savedItems', 'savedOccurrences', 'reviewCards', 'reviewCardStates', 'reviewEvents', 'practiceAttempts'];
  const counts = Object.fromEntries(keys.map((k) => [k, n(snapshot?.[k])]));
  const attempts = Array.isArray(snapshot?.practiceAttempts) ? snapshot.practiceAttempts : Object.values(snapshot?.practiceAttempts ?? {});
  counts.modes = [...new Set(attempts.map((a) => a.mode))].sort();
  return counts;
}
