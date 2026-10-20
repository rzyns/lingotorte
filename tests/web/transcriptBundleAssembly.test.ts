import { describe, expect, it } from 'vitest';
import {
  createAppModel, createCorrectedTranscriptVersion, generateElevenLabsScribeDraft, generateLocalAsrDraft, importFixtureMediaAndSubtitles,
  makeFakeElevenLabsScribeProvider, makeFakeLocalAsrProvider, observeLocalServiceSync,
} from '../../apps/web/src/model';
import type { SubtitleTrack } from '../../packages/domain/src';
import type { AppModel } from '../../apps/web/src/uiTypes';

// lt-584.4 (C3, decision (a) from lt-584.1): a new track's cues, word timings and final trackVersion are assembled before
// its first put/persist, so a write-once bundle PUT at track creation can carry the whole bundle.

const SEGMENTS = [{
  startMs: 0, endMs: 1500, text: 'Cześć świecie.', confidence: 0.93,
  words: [
    { wordIndex: 0, text: 'Cześć', charStart: 0, charEnd: 5, startMs: 0, endMs: 620, confidence: 0.96, speakerId: 'speaker_0' },
    { wordIndex: 1, text: 'świecie', charStart: 6, charEnd: 13, startMs: 700, endMs: 1400, confidence: 0.91, speakerId: 'speaker_0' },
  ],
}];

async function seededModel(): Promise<AppModel> {
  const model = createAppModel();
  await importFixtureMediaAndSubtitles(model, 'fixtures/media/synthetic-polish-dialogue.webm',
    'fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
  return model;
}

/** Record every track put and, at every persist point, each new track's version and stored word-timing count. */
function instrument(model: AppModel) {
  const known = new Set(Object.keys(model.store.snapshot().subtitleTracks));
  const puts: SubtitleTrack[] = [];
  const persists: { trackId: string; trackVersion: number; timings: number }[] = [];
  const put = model.store.putSubtitleTrack.bind(model.store);
  model.store.putSubtitleTrack = (track: SubtitleTrack) => { if (!known.has(track.id)) puts.push(track); return put(track); };
  observeLocalServiceSync(model, () => {
    for (const track of Object.values(model.store.snapshot().subtitleTracks)) {
      if (known.has(track.id)) continue;
      persists.push({ trackId: track.id, trackVersion: track.trackVersion, timings: model.store.listTranscriptWordTimingsForTrack(track.id).length });
    }
  });
  return { puts, persists };
}

function expectAssembledOnce(seen: ReturnType<typeof instrument>, trackId: string, trackVersion: number, timings: number) {
  expect(seen.puts.map(t => ({ id: t.id, trackVersion: t.trackVersion }))).toEqual([{ id: trackId, trackVersion }]);
  expect(seen.persists.length).toBeGreaterThan(0);
  for (const p of seen.persists) expect(p).toEqual({ trackId, trackVersion, timings });
}

describe('lt-584.4 transcript bundle assembled before the first put/persist', () => {
  it('local ASR draft: one put, every persist already carries the word timings', async () => {
    const model = await seededModel(); const seen = instrument(model);
    const result = await generateLocalAsrDraft(model, makeFakeLocalAsrProvider({ language: 'pl', engine: 'synthetic', modelName: 'synthetic', segments: SEGMENTS }), 'pl');
    expectAssembledOnce(seen, result.track.id, 1, 2);
    expect(model.store.listTranscriptWordTimingsForTrack(result.track.id)).toHaveLength(2);
  });

  it('ElevenLabs Scribe draft: one put, every persist already carries the word timings', async () => {
    const model = await seededModel(); const seen = instrument(model);
    const result = await generateElevenLabsScribeDraft(model, makeFakeElevenLabsScribeProvider({ language: 'pl', modelName: 'scribe_v2', segments: SEGMENTS }), { language: 'pl', allowOnlineProvider: true });
    expectAssembledOnce(seen, result.track.id, 1, 2);
  });

  it('corrected version: one put at parent+1 with its corrected word timings, never at version 1', async () => {
    const model = await seededModel();
    const parent = Object.values(model.store.snapshot().subtitleTracks).find(t => t.id === model.targetTrackId)!;
    const cue = model.store.listCuesForTrack(parent.id)[0]!;
    const seen = instrument(model);
    const result = await createCorrectedTranscriptVersion(model, parent.id, [{ cueId: cue.id, text: 'Poprawione zdanie', wordTimings: [{ wordIndex: 0, text: 'Poprawione', charStart: 0, charEnd: 10, startMs: cue.startMs, endMs: cue.startMs + 100 }] }]);
    expect(result.track.trackVersion).toBe(parent.trackVersion + 1);
    expectAssembledOnce(seen, result.track.id, parent.trackVersion + 1, 1);
  });
});
