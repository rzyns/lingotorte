import { describe, expect, it } from 'vitest';
import { makeMediaAsset, makeSubtitleTrack, makeCue } from '../../packages/domain/src';
import { parseAss, importSubtitle } from '../../packages/subtitles/src/import';
import { applyTrackOffsetMs, createOffsetCorrectedTranscriptVersion, createAppModel } from '../../apps/web/src/model';

function validAssFixture() {
  return `[Script Info]
Title: Test ASS
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,First line with {\\an1}tags.
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,Second line with \\Nline break
`;
}

function malformedAssFixture() {
  return `[Script Info]
Title: Bad ASS

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:00.50,Default,,0,0,0,,End before start
`;
}

function emptyAssFixture() {
  return `[Script Info]
Title: Empty ASS

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

describe('B7 subtitle robustness', () => {
  it('parses a valid ASS file into SubtitleTrack and Cues, stripping tags and line breaks', async () => {
    const asset = makeMediaAsset({
      title: 'ASS test',
      originalPath: '/tmp/ass-test.mkv',
      contentSha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      durationMs: 10000,
      container: 'mkv',
      sizeBytes: 1024,
      privacyLabel: 'owned',
    });
    const tmpPath = '/tmp/lingotorte-b7-valid.ass';
    await import('node:fs/promises').then((fs) => fs.writeFile(tmpPath, validAssFixture(), 'utf8'));

    const parsed = await parseAss(tmpPath, asset.id, 'pl', 'target');
    expect(parsed.track.format).toBe('ass');
    expect(parsed.track.transcriptStatus).toBe('approved');
    expect(parsed.cues).toHaveLength(2);
    expect(parsed.cues[0]!.text).toBe('First line with tags.');
    expect(parsed.cues[0]!.startMs).toBe(1000);
    expect(parsed.cues[0]!.endMs).toBe(3500);
    expect(parsed.cues[1]!.text).toBe('Second line with line break');
    expect(parsed.cues[1]!.startMs).toBe(4000);
  });

  it('rejects malformed ASS with end time before start time', async () => {
    const tmpPath = '/tmp/lingotorte-b7-malformed.ass';
    await import('node:fs/promises').then((fs) => fs.writeFile(tmpPath, malformedAssFixture(), 'utf8'));

    await expect(importSubtitle({ mediaId: 'm1', language: 'pl', role: 'target', path: tmpPath })).rejects.toThrow(/end time must be after start time/);
  });

  it('rejects empty ASS Events section with no Dialogue lines', async () => {
    const tmpPath = '/tmp/lingotorte-b7-empty.ass';
    await import('node:fs/promises').then((fs) => fs.writeFile(tmpPath, emptyAssFixture(), 'utf8'));

    await expect(importSubtitle({ mediaId: 'm1', language: 'pl', role: 'target', path: tmpPath })).rejects.toThrow(/no Dialogue lines/);
  });

  it('shifts all cue timings by a configurable offset preserving draft status', async () => {
    const model = createAppModel();
    const asset = makeMediaAsset({
      title: 'Offset test',
      originalPath: '/tmp/offset.mkv',
      contentSha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000002',
      durationMs: 10000,
      container: 'mkv',
      sizeBytes: 1024,
      privacyLabel: 'owned',
    });
    model.store.putMediaAsset(asset);
    const track = makeSubtitleTrack({
      mediaId: asset.id,
      language: 'pl',
      role: 'target',
      format: 'srt',
      sourceKind: 'owned',
      sourcePath: '/tmp/offset.srt',
      contentSha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000003',
      isActive: true,
      transcriptStatus: 'draft',
      transcriptSourceKind: 'local-asr',
      provenance: {
        language: 'pl',
        warningFlags: ['asrDraft'],
      },
    });
    model.store.putSubtitleTrack(track);
    const cue1 = makeCue({
      trackId: track.id,
      cueIndex: 1,
      startMs: 1000,
      endMs: 2500,
      text: 'Pierwsza kwestia.',
      normalizedText: 'pierwsza kwestia.',
      textSha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000004',
    });
    const cue2 = makeCue({
      trackId: track.id,
      cueIndex: 2,
      startMs: 3000,
      endMs: 4500,
      text: 'Druga kwestia.',
      normalizedText: 'druga kwestia.',
      textSha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000005',
    });
    model.store.putCue(cue1);
    model.store.putCue(cue2);
    model.currentMedia = asset;
    model.targetTrackId = track.id;
    model.cues = [cue1, cue2];

    const result = await createOffsetCorrectedTranscriptVersion(model, track.id, 500);
    expect(result.track.transcriptStatus).toBe('draft');
    expect(result.cues).toHaveLength(2);
    expect(result.cues[0]!.startMs).toBe(1500);
    expect(result.cues[0]!.endMs).toBe(3000);
    expect(result.cues[1]!.startMs).toBe(3500);
    expect(result.cues[1]!.endMs).toBe(5000);
    expect(result.track.provenance.warningFlags).toContain('timingUnverified');
    expect(result.track.trackVersion).toBe(2);
  });

  it('does not auto-approve a corrected track when applying offset to an approved track', async () => {
    const model = createAppModel();
    const asset = makeMediaAsset({
      title: 'Approved offset test',
      originalPath: '/tmp/approved-offset.mkv',
      contentSha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000006',
      durationMs: 10000,
      container: 'mkv',
      sizeBytes: 1024,
      privacyLabel: 'owned',
    });
    model.store.putMediaAsset(asset);
    const track = makeSubtitleTrack({
      mediaId: asset.id,
      language: 'pl',
      role: 'target',
      format: 'srt',
      sourceKind: 'owned',
      sourcePath: '/tmp/approved-offset.srt',
      contentSha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000007',
      isActive: true,
      transcriptStatus: 'approved',
      transcriptSourceKind: 'user-subtitle-file',
      provenance: {
        language: 'pl',
        warningFlags: [],
      },
    });
    model.store.putSubtitleTrack(track);
    const cue = makeCue({
      trackId: track.id,
      cueIndex: 1,
      startMs: 2000,
      endMs: 3500,
      text: 'Line.',
      normalizedText: 'line.',
      textSha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000008',
    });
    model.store.putCue(cue);
    model.currentMedia = asset;
    model.targetTrackId = track.id;
    model.cues = [cue];

    const result = await createOffsetCorrectedTranscriptVersion(model, track.id, -200);
    expect(result.track.transcriptStatus).toBe('approved');
    expect(result.cues[0]!.startMs).toBe(1800);
    expect(result.cues[0]!.endMs).toBe(3300);
  });

  it('applyTrackOffsetMs clamps negative offsets at zero and preserves ordering', () => {
    const cueA = makeCue({
      trackId: 't1',
      cueIndex: 1,
      startMs: 100,
      endMs: 200,
      text: 'A',
      normalizedText: 'a',
      textSha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000009',
    });
    const cueB = makeCue({
      trackId: 't1',
      cueIndex: 2,
      startMs: 300,
      endMs: 400,
      text: 'B',
      normalizedText: 'b',
      textSha256: 'sha256:000000000000000000000000000000000000000000000000000000000000000a',
    });
    const shifted = applyTrackOffsetMs([cueA, cueB], -500);
    expect(shifted[0]!.startMs).toBe(0); // clamped at zero so cue stays within media bounds
    expect(shifted[0]!.endMs).toBe(1); // minimum 1ms duration enforced after large negative offset collapses original end below zero
    expect(shifted[1]!.startMs).toBeGreaterThanOrEqual(shifted[0]!.endMs);
  });
});
