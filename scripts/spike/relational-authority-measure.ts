// lt-584.1 (C0) throwaway spike: measure blob-authority cost on synthetic libraries.
// Synthetic data only (domain factories); databases are :memory: or a temp file deleted afterwards.
// Usage: node scripts/spike/relational-authority-measure.ts <N> <C> <W> <memory|file>
// Prints one JSON line. Not product code; not part of the vitest suite.
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  makeCue,
  makeMediaAsset,
  makeReviewCard,
  makeReviewCardState,
  makeReviewEvent,
  makeSavedItem,
  makeSavedOccurrence,
  makeSubtitleTrack,
  makeTranscriptWordTiming,
  validateSavedOccurrenceSourceContext,
} from '../../packages/domain/src/factories.ts';
import { LocalStore, createEmptyLocalStoreSnapshot, type LocalStoreSnapshot } from '../../packages/storage/src/localStore.ts';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence.ts';

const [nArg, cArg, wArg, modeArg] = process.argv.slice(2);
const N = Number(nArg); const C = Number(cArg); const W = Number(wArg);
const mode = modeArg === 'file' ? 'file' : 'memory';
const digest = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}` as const;

// Same algorithm as the private revisionOf in packages/storage/src/sqliteLocalPersistence.ts (main 6082901).
function revisionOf(snapshot: unknown): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]))
      : value;
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex')}`;
}

const WORDS = ['dzień', 'dobry', 'proszę', 'bardzo', 'dziękuję', 'kawa', 'herbata', 'jutro', 'wczoraj', 'dom'];

// Plain-object builder: LocalStore.put* clones the whole snapshot on every call (O(n) per put), which makes
// building a large library through it quadratic. The bulk records are assembled directly instead.
type Anchor = { mediaId: string; trackId: string; cueId: string; text: string; mediaPath: string; sha: `sha256:${string}` };
function buildSnapshot(): LocalStoreSnapshot {
  const empty = createEmptyLocalStoreSnapshot();
  const s = {
    mediaAssets: {} as Record<string, any>, subtitleTracks: {} as Record<string, any>, cues: {} as Record<string, any>,
    transcriptWordTimings: {} as Record<string, any>, savedItems: {} as Record<string, any>, savedOccurrences: {} as Record<string, any>,
    reviewCards: {} as Record<string, any>, reviewCardStates: {} as Record<string, any>, reviewEvents: [] as any[],
  };
  const store = { putMediaAsset: (v: any) => { s.mediaAssets[v.id] = v; }, putSubtitleTrack: (v: any) => { s.subtitleTracks[v.id] = v; },
    putCue: (v: any) => { s.cues[v.id] = v; }, putTranscriptWordTiming: (v: any) => { s.transcriptWordTimings[v.id] = v; },
    putSavedItem: (v: any) => { s.savedItems[v.id] = v; }, putSavedOccurrence: (v: any) => { s.savedOccurrences[v.id] = v; },
    putReviewCard: (v: any) => { s.reviewCards[v.id] = v; }, putReviewCardState: (v: any) => { s.reviewCardStates[v.cardId] = v; },
    addReviewEvent: (v: any) => { s.reviewEvents.push(v); } };
  let first: Anchor | null = null;
  for (let m = 0; m < N; m++) {
    const media = makeMediaAsset({
      title: `Synthetic media ${m}`,
      originalPath: `fixtures/media/synthetic-${m}.webm`,
      contentSha256: digest(`media-${m}`),
      durationMs: C * 3000,
      container: 'webm',
      sizeBytes: 1024 * 1024,
      privacyLabel: 'synthetic',
    });
    store.putMediaAsset(media);
    const track = makeSubtitleTrack({
      mediaId: media.id, language: 'pl', role: 'target', format: 'srt', sourceKind: 'synthetic',
      sourcePath: `fixtures/subtitles/synthetic-${m}.pl.srt`, contentSha256: digest(`track-${m}`), isActive: true,
    });
    store.putSubtitleTrack(track);
    for (let c = 0; c < C; c++) {
      const words = Array.from({ length: W }, (_, w) => WORDS[(m + c + w) % WORDS.length]!);
      const text = words.join(' ');
      const cue = makeCue({
        trackId: track.id, cueIndex: c + 1, startMs: c * 3000, endMs: c * 3000 + 2500,
        text, normalizedText: text.toLowerCase(), textSha256: digest(text),
      });
      store.putCue(cue);
      if (!first) first = { mediaId: media.id, trackId: track.id, cueId: cue.id, text, mediaPath: media.originalPath, sha: media.contentSha256 };
      let charStart = 0;
      for (let w = 0; w < W; w++) {
        const word = words[w]!;
        store.putTranscriptWordTiming(makeTranscriptWordTiming({
          trackId: track.id, cueId: cue.id, wordIndex: w, charStart, charEnd: charStart + word.length,
          text: word, normalizedText: word, startMs: c * 3000 + w * 300, endMs: c * 3000 + w * 300 + 250,
          sourceKind: 'provider-word-timing', engine: 'synthetic', modelName: 'synthetic-spike', confidence: 0.9,
        }));
        charStart += word.length + 1;
      }
    }
  }
  // Fixed learner set: 200 items, 200 cards, 2,000 review events (10 per card).
  const anchor = first!;
  for (let i = 0; i < 200; i++) {
    const item = makeSavedItem({ kind: 'lexeme', language: 'pl', displayText: `słowo-${i}`, meaning: `word ${i}` });
    const sourceContext = validateSavedOccurrenceSourceContext({
      mediaId: anchor.mediaId, mediaPath: anchor.mediaPath, mediaFingerprint: anchor.sha,
      subtitleTrackId: anchor.trackId, cueId: anchor.cueId, timeRangeMs: { start: 0, end: 2500 },
      tokenSpan: { startToken: 0, endToken: 1 }, charSpan: { start: 0, end: 5 },
    });
    const occurrence = makeSavedOccurrence({
      savedItemId: item.id, mediaId: anchor.mediaId, cueId: anchor.cueId, startMs: 0, endMs: 2500,
      selectionKind: 'lexeme', selectionText: anchor.text.slice(0, 5), sourceContext,
    });
    const card = makeReviewCard({ savedItemId: item.id, savedOccurrenceId: occurrence.id, cardType: 'recognition', promptTemplate: 'What does it mean?' });
    store.putSavedItem(item);
    store.putSavedOccurrence(occurrence);
    store.putReviewCard(card);
    store.putReviewCardState(makeReviewCardState({ cardId: card.id, fsrsVersion: 'fsrs-6', state: 'review', reps: 10 }));
    for (let e = 0; e < 10; e++) {
      store.addReviewEvent(makeReviewEvent({
        cardId: card.id, reviewedAt: new Date(Date.UTC(2026, 9, 1 + e)).toISOString(), rating: 'good',
        previousStateJson: '{"state":"review"}', nextStateJson: '{"state":"review"}', responseMs: 1000,
      }));
    }
  }
  return { ...empty, ...s, learnerAudit: { version: 1, reviewEvents: [...s.reviewEvents], practiceAttempts: [] } } as LocalStoreSnapshot;
}

function time<T>(fn: () => T): { ms: number; value: T } {
  const start = performance.now(); const value = fn(); return { ms: Math.round((performance.now() - start) * 10) / 10, value };
}

const result: Record<string, unknown> = { N, C, W, mode, cues: N * C, wordTimings: N * C * W };
let dir: string | null = null;
let persistence: SqliteLocalPersistence | null = null;
try {
  const built = time(() => buildSnapshot());
  result.buildMs = built.ms;
  const snapshot = built.value;
  dir = mode === 'file' ? mkdtempSync(join(tmpdir(), 'lt-584-spike-')) : null;
  const dbPath = dir ? join(dir, 'spike.sqlite') : ':memory:';
  persistence = SqliteLocalPersistence.open(dbPath);
  // First save: empty DB -> full library (import-like). Second save: one extra review event (study-like autosave).
  const first = time(() => persistence!.saveSnapshot(snapshot, '2026-10-19T00:00:00.000Z'));
  result.firstSaveMs = first.ms;
  const loaded = time(() => persistence!.loadVersionedSnapshot());
  result.loadVersionedMs = loaded.ms;
  const card = Object.values(loaded.value.snapshot.reviewCards)[0]!;
  const studied = { ...loaded.value.snapshot, reviewEvents: [...loaded.value.snapshot.reviewEvents, makeReviewEvent({
    cardId: card.id, reviewedAt: '2026-10-19T01:00:00.000Z', rating: 'good', previousStateJson: '{}', nextStateJson: '{}',
  })] };
  const second = time(() => persistence!.saveSnapshot(studied, '2026-10-19T01:00:00.000Z', loaded.value.revision));
  result.studySaveMs = second.ms;
  const reloaded = persistence.loadVersionedSnapshot();
  const rev = time(() => revisionOf(reloaded.snapshot));
  result.revisionOfMs = rev.ms;
  const body = JSON.stringify({ ok: true, ...reloaded, restoreCapability: 'active-audit-restore-v1' });
  result.getStateBytes = Buffer.byteLength(body);
  const { cues: _c, transcriptWordTimings: _w, ...learner } = reloaded.snapshot;
  result.learnerOnlyBytes = Buffer.byteLength(JSON.stringify({ ok: true, snapshot: learner, revision: reloaded.revision, restoreCapability: 'active-audit-restore-v1' }));
  // Browser-side cost of one LocalStore.putCue at this library size (each put returns a whole-snapshot clone).
  const browserStore = new LocalStore(reloaded.snapshot);
  const anyCue = Object.values(reloaded.snapshot.cues)[0]!;
  result.localStorePutCueMs = time(() => browserStore.putCue({ ...anyCue })).ms;
  if (dir) { persistence.close(); persistence = null; result.dbFileBytes = statSync(join(dir, 'spike.sqlite')).size; }
  result.ok = true;
} catch (error) {
  result.ok = false;
  result.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
} finally {
  persistence?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
}
result.peakRssMB = Math.round(process.resourceUsage().maxRSS / 1024);
console.log(JSON.stringify(result));
