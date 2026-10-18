import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCue } from '@lingotorte/domain';
import { createAppModel, importBrowserLocalFiles, importFixtureMediaAndSubtitles, plainSubtitleFailureReason, validateBrowserCueOrdering } from '../../apps/web/src/model.ts';
import { parseSubtitleText, SubtitleParseError } from '../../packages/subtitles/src/parse.ts';

afterEach(() => vi.unstubAllGlobals());

const digest = (text: string): `sha256:${string}` => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const srt = '17\r\n00:00:00,100 --> 00:00:01,000\r\n  Cześć   świecie\r\nDruga linia\r\n';
const vtt = '00:00.100 --> 00:01.000\n  Cześć   świecie\nDruga linia\n';
const ass = '[Events]\nFormat: Start, End, Text\nDialogue: 0:00:00.10,0:00:01.00,{\\i1}Cześć\\Nświecie, tutaj';

describe('shared subtitle parser browser adapter', () => {
  for (const [name, text, format] of [
    ['target.srt', srt, 'srt'],
    ['target.vtt', vtt, 'vtt'],
    ['target.vtt', `WEBVTT\n\n${vtt}`, 'vtt'],
    ['target.ass', ass, 'ass'],
    ['target.ssa', ass, 'ass'],
    ['target.txt', `WEBVTT\n\n${vtt}`, 'vtt'],
  ] as const) {
    it(`adapts ${name} (${text.startsWith('WEBVTT') ? 'header' : 'body'}) without changing drafts or hashes`, async () => {
      vi.stubGlobal('URL', { createObjectURL: () => 'blob:adapter', revokeObjectURL: vi.fn() });
      const model = createAppModel();
      await importBrowserLocalFiles(model, {
        mediaFile: new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], 'synthetic.webm'),
        targetSubtitleFile: new File([text], name),
      });
      expect(model.importWarning).toBeNull();
      const track = model.store.getSubtitleTrack(model.targetTrackId!)!;
      expect(track).toMatchObject({ format, language: 'pl', role: 'target', sourceKind: 'owned', isActive: true, contentSha256: digest(text) });
      const drafts = parseSubtitleText(text, format);
      expect(model.cues.map(({ cueIndex, startMs, endMs, text, normalizedText }) => ({ cueIndex, startMs, endMs, text, normalizedText }))).toEqual(drafts);
      expect(model.cues.map((cue) => cue.textSha256)).toEqual(drafts.map((cue) => digest(cue.text)));
      expect(model.cues.every((cue) => cue.trackId === track.id)).toBe(true);
    });
  }

  it('preserves synthetic sourceKind on the browser fixture path', async () => {
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
    const model = createAppModel();
    await importFixtureMediaAndSubtitles(model, 'synthetic.webm', 'target.srt', 'native.srt');
    const tracks = model.store.listSubtitleTracksForMedia(model.currentMedia!.id);
    expect(tracks).toHaveLength(2);
    expect(tracks.map((track) => track.sourceKind)).toEqual(['synthetic', 'synthetic']);
    expect(model.cues.length).toBeGreaterThan(0);
  });

  it.each([
    ['invalid-timing', 'vtt', 1, 'VTT block 0 has invalid timing line: PRIVATE', 'the timing on block 0 is not valid'],
    ['empty-text', 'vtt', 2, 'VTT block 1 has empty cue text', 'block 1 has no text'],
    ['invalid-timing', 'srt', 17, 'SRT block 17 has invalid timing line: PRIVATE', 'the timing on block 17 is not valid'],
    ['missing-cue-id', 'srt', 1, 'SRT block 0 missing numeric cue id', 'it is not a valid subtitle file'],
    ['overlap', 'ass', 2, 'PRIVATE', 'it is not a valid subtitle file'],
    ['invalid-timing', 'ass', 3, 'PRIVATE', 'the timing on block 3 is not valid'],
    ['empty-text', 'ass', 3, 'PRIVATE', 'block 3 has no text'],
    ['no-sections', 'ass', null, 'PRIVATE', 'it is not a valid subtitle file'],
  ] as const)('maps typed %s/%s without leaking subtitle text', (code, format, blockIndex, message, expected) => {
    expect(plainSubtitleFailureReason(new SubtitleParseError(code, format, blockIndex, message))).toBe(expected);
  });

  it('retains the untyped error fallback', () => {
    expect(plainSubtitleFailureReason(new TypeError('SRT block 0 has invalid timing line: PRIVATE'))).toBe('the timing on block 0 is not valid');
    expect(plainSubtitleFailureReason(new TypeError('SRT block 17 has empty cue text'))).toBe('block 17 has no text');
    expect(plainSubtitleFailureReason('PRIVATE')).toBe('it is not a valid subtitle file');
  });

  it('keeps the offset ordering guard typed with its original message', () => {
    const cues = [{ cueIndex: 7, startMs: 0, endMs: 1000 }, { cueIndex: 8, startMs: 500, endMs: 1500 }].map((timing) => makeCue({ ...timing, trackId: 'synthetic-track', text: 'Hello', normalizedText: 'hello', textSha256: digest('Hello') }));
    expect(() => validateBrowserCueOrdering(cues)).toThrow(SubtitleParseError);
    expect(() => validateBrowserCueOrdering(cues)).toThrow('Cue 8 starts at 500ms before previous cue 7 ends at 1000ms');
  });
});