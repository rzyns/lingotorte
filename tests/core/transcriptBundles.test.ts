import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStore, type LearnerStateSnapshot, type LocalStoreSnapshot, type TrackTranscriptBundle } from '../../packages/storage/src';
import { SqliteLocalPersistence, TranscriptBundleConflictError, DurableEntityNotFoundError, SnapshotRevisionConflictError } from '../../packages/storage/src/sqliteLocalPersistence.ts';
import { makeCue, makeMediaAsset, makeSubtitleTrack, makeTranscriptWordTiming, type SubtitleTrack } from '../../packages/domain/src';

// lt-584.4 (C3): transcript bundles are write-once per track and load per media; learner state never touches them.

const SHA = `sha256:${'b'.repeat(64)}` as const;
const AT = '2026-10-20T12:00:00.000Z';

function learner(snapshot: LocalStoreSnapshot): LearnerStateSnapshot {
  const { cues: _c, transcriptWordTimings: _w, ...state } = snapshot;
  return state;
}

function bundleFor(track: SubtitleTrack, words: string[]): TrackTranscriptBundle {
  const cues = words.map((text, cueIndex) => makeCue({ trackId: track.id, cueIndex, startMs: cueIndex * 1000, endMs: cueIndex * 1000 + 900, text, normalizedText: text.toLowerCase(), textSha256: SHA }));
  const wordTimings = cues.map(cue => makeTranscriptWordTiming({ trackId: track.id, cueId: cue.id, wordIndex: 0, charStart: 0, charEnd: cue.text.length, text: cue.text, normalizedText: cue.normalizedText,
    startMs: cue.startMs, endMs: cue.endMs, sourceKind: 'provider-word-timing', engine: 'synthetic', modelName: 'synthetic', confidence: 0.75 }));
  return { cues, wordTimings };
}

/** Two media; media A has two tracks (target + native), media B has one. Learner state only, no bundles yet. */
function seed() {
  const store = new LocalStore();
  const mediaA = makeMediaAsset({ title: 'A', originalPath: '/synthetic/a.webm', contentSha256: SHA, durationMs: 5000, container: 'webm', sizeBytes: 10, privacyLabel: 'synthetic' });
  const mediaB = makeMediaAsset({ title: 'B', originalPath: '/synthetic/b.webm', contentSha256: SHA, durationMs: 5000, container: 'webm', sizeBytes: 10, privacyLabel: 'synthetic' });
  const track = (mediaId: string, role: 'target' | 'native', language: string) => makeSubtitleTrack({ mediaId, language, role, format: 'srt', sourceKind: 'synthetic', sourcePath: `/synthetic/${language}.srt`, contentSha256: SHA, isActive: true });
  const a1 = track(mediaA.id, 'target', 'pl'); const a2 = track(mediaA.id, 'native', 'en'); const b1 = track(mediaB.id, 'target', 'pl');
  for (const media of [mediaA, mediaB]) store.putMediaAsset(media);
  for (const t of [a1, a2, b1]) store.putSubtitleTrack(t);
  store.putSavedItem({ id: 'item', kind: 'lexeme', language: 'pl', displayText: 'dzień', createdAt: AT, updatedAt: AT });
  return { store, mediaA, mediaB, a1, a2, b1 };
}

function rows(db: DatabaseSync) {
  return { cue: db.prepare('SELECT * FROM cue ORDER BY id').all(), timing: db.prepare('SELECT * FROM transcript_word_timing ORDER BY id').all() };
}

describe('lt-584.4 transcript bundles', () => {
  it('a bundle is write-once per track: the second saveTrackTranscript is a conflict and changes nothing', () => {
    const { store, a1 } = seed();
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      const r1 = db.saveLearnerState(learner(store.snapshot()), db.loadLearnerState().revision, AT);
      const bundle = bundleFor(a1, ['Dzień', 'dobry']);
      const r2 = db.saveTrackTranscript(a1.id, bundle, r1, AT);
      expect(r2).not.toBe(r1);
      expect(() => db.saveTrackTranscript(a1.id, bundleFor(a1, ['inny']), r2, AT)).toThrow(TranscriptBundleConflictError);
      expect(db.loadLearnerState().revision).toBe(r2);
      expect(db.loadTranscripts(a1.mediaId).tracks[a1.id]).toEqual(bundle);
    } finally { db.close(); }
  });

  it('accepts a bundle for a track not yet in learner state (bundle first, D-R9); rejects a stale revision (conflict), and bundle rows of another track', () => {
    const { store, a1, a2 } = seed();
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      const rev = db.saveLearnerState(learner(store.snapshot()), db.loadLearnerState().revision, AT);
      const ghost = { ...a1, id: '00000000-0000-4000-8000-000000000000' };
      expect(() => db.saveTrackTranscript(a1.id, bundleFor(a1, ['x']), 'rev:999', AT)).toThrow(SnapshotRevisionConflictError);
      expect(() => db.saveTrackTranscript(a1.id, bundleFor(a2, ['x']), rev, AT)).toThrow(TypeError);
      expect(db.loadLearnerState().revision).toBe(rev);
      const ghostBundle = bundleFor(ghost, ['x']);
      const next = db.saveTrackTranscript(ghost.id, ghostBundle, rev, AT);
      expect(next).not.toBe(rev);
      expect(db.listCuesForTrack(ghost.id)).toEqual(ghostBundle.cues);
      expect(() => db.saveTrackTranscript(ghost.id, ghostBundle, next, AT)).toThrow(TranscriptBundleConflictError);
      expect(() => db.loadTranscripts('00000000-0000-4000-8000-000000000001')).toThrow(DurableEntityNotFoundError);
    } finally { db.close(); }
  });

  it('per-media load returns every track of that media and none of another media', () => {
    const { store, mediaA, mediaB, a1, a2, b1 } = seed();
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      let rev = db.saveLearnerState(learner(store.snapshot()), db.loadLearnerState().revision, AT);
      const bundles = { a1: bundleFor(a1, ['Dzień', 'dobry']), a2: bundleFor(a2, ['Good', 'morning']), b1: bundleFor(b1, ['Cześć']) };
      rev = db.saveTrackTranscript(a1.id, bundles.a1, rev, AT);
      rev = db.saveTrackTranscript(a2.id, bundles.a2, rev, AT);
      rev = db.saveTrackTranscript(b1.id, bundles.b1, rev, AT);
      const a = db.loadTranscripts(mediaA.id);
      expect(a).toEqual({ mediaId: mediaA.id, revision: rev, tracks: { [a1.id]: bundles.a1, [a2.id]: bundles.a2 } });
      expect(db.loadTranscripts(mediaB.id).tracks).toEqual({ [b1.id]: bundles.b1 });
    } finally { db.close(); }
  });

  it('a learner-state save leaves cue and word-timing rows unchanged, and its readback equals the input', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-584-4-')); const file = join(root, 'state.db');
    const { store, a1, a2 } = seed();
    const db = SqliteLocalPersistence.open(file);
    try {
      let rev = db.saveLearnerState(learner(store.snapshot()), db.loadLearnerState().revision, AT);
      rev = db.saveTrackTranscript(a1.id, bundleFor(a1, ['Dzień', 'dobry']), rev, AT);
      rev = db.saveTrackTranscript(a2.id, bundleFor(a2, ['Good']), rev, AT);
      const raw = new DatabaseSync(file); const before = rows(raw);
      expect(before.cue).toHaveLength(3); expect(before.timing).toHaveLength(3);
      store.putSavedItem({ id: 'item-2', kind: 'phrase', language: 'pl', displayText: 'dzień dobry', meaning: 'good morning', createdAt: AT, updatedAt: AT });
      store.putSubtitleTrack({ ...a1, transcriptStatus: 'approved', trackVersion: 2 });
      const input = learner(store.snapshot());
      rev = db.saveLearnerState(input, rev, AT);
      expect(rows(raw)).toEqual(before);
      const readback = db.loadLearnerState();
      expect(readback.revision).toBe(rev);
      expect(readback.state).toEqual(learner(new LocalStore(input as LocalStoreSnapshot).snapshot()));
      expect(Object.keys(readback.state)).not.toContain('cues');
      expect(Object.keys(readback.state)).not.toContain('transcriptWordTimings');
      raw.close();
    } finally { db.close(); await rm(root, { recursive: true, force: true }); }
  });

  it.each(['cues', 'transcriptWordTimings'] as const)('saveLearnerState rejects a %s key with TypeError and writes nothing', key => {
    const { store } = seed();
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      const before = db.loadLearnerState();
      expect(() => db.saveLearnerState({ ...learner(store.snapshot()), [key]: {} } as LearnerStateSnapshot, before.revision, AT)).toThrow(TypeError);
      expect(db.loadLearnerState()).toEqual(before);
    } finally { db.close(); }
  });

  it('saveSnapshot (internal composition) writes a new bundle once, accepts the identical one, never rewrites a stored one', () => {
    const { store, a1 } = seed();
    const bundle = bundleFor(a1, ['Dzień']);
    for (const cue of bundle.cues) store.putCue(cue);
    for (const timing of bundle.wordTimings) store.putTranscriptWordTiming(timing);
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      const r1 = db.saveSnapshot(store.snapshot(), AT);
      const r2 = db.saveSnapshot(store.snapshot(), AT, r1);
      expect(r2).not.toBe(r1);
      const changed = { ...store.snapshot(), cues: { [bundle.cues[0]!.id]: { ...bundle.cues[0]!, text: 'changed' } } };
      expect(() => db.saveSnapshot(changed, AT, r2)).toThrow(TranscriptBundleConflictError);
      expect(db.loadVersionedSnapshot().revision).toBe(r2);
      expect(db.loadTranscripts(a1.mediaId).tracks[a1.id]).toEqual(bundle);
    } finally { db.close(); }
  });

  it('review follow-up: a legacy saveSnapshot with word timings but no cues for a track is refused, not inserted (no 500 on the next save)', () => {
    const { store, a1 } = seed();
    const db = SqliteLocalPersistence.open(':memory:');
    try {
      for (const timing of bundleFor(a1, ['Dzień']).wordTimings) store.putTranscriptWordTiming(timing);
      const before = db.loadLearnerState().revision;
      expect(() => db.saveSnapshot(store.snapshot(), AT, before)).toThrow(TypeError);
      expect(db.loadLearnerState().revision).toBe(before);
      expect(db.loadSnapshot().transcriptWordTimings).toEqual({});
    } finally { db.close(); }
  });

  it('review follow-up: status().hasSnapshot is true for a DB holding only non-media learner rows at revision 1', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lt-584-4-has-'));
    const file = join(dir, 'state.sqlite');
    try {
      const fresh = SqliteLocalPersistence.open(file);
      expect(fresh.status().hasSnapshot).toBe(false);
      fresh.close();
      const raw = new DatabaseSync(file);
      raw.prepare("INSERT INTO provider_policy (id, provider_id, enabled, allowed_data_classes_json, requires_confirmation, created_at, updated_at) VALUES ('p', 'youtube-caption', 0, '[]', 1, ?, ?)").run(AT, AT);
      raw.close();
      const reopened = SqliteLocalPersistence.open(file);
      try { expect(reopened.status().hasSnapshot).toBe(true); } finally { reopened.close(); }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
