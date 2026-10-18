import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as parseCore from '../../packages/subtitles/src/parse';
import {
  SubtitleParseError,
  inferParsedSubtitleFormat,
  normalizeCueText,
  parseSubtitleText,
} from '../../packages/subtitles/src/parse';

const vttFixture = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.target.vtt', 'utf8');
const srtFixture = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'utf8');

const assFixture = `[Script Info]
Title: Test ASS

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,First line with {\\an1}tags.
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,Second line with \\Nline break
`;

function catchParse(text: string, format: 'srt' | 'vtt' | 'ass'): SubtitleParseError {
  try {
    parseSubtitleText(text, format);
  } catch (err) {
    expect(err).toBeInstanceOf(SubtitleParseError);
    expect(err).toBeInstanceOf(TypeError);
    return err as SubtitleParseError;
  }
  throw new Error('expected parse to throw');
}

describe('subtitle parser core (parse.ts)', () => {
  it('exports the runtime-agnostic interface', () => {
    expect(typeof parseCore.parseSubtitleText).toBe('function');
    expect(typeof parseCore.inferParsedSubtitleFormat).toBe('function');
    expect(typeof parseCore.normalizeCueText).toBe('function');
    expect(typeof parseCore.SubtitleParseError).toBe('function');
  });

  it('has no node: or @lingotorte/storage import (browser-importable seam)', () => {
    const source = readFileSync('packages/subtitles/src/parse.ts', 'utf8');
    expect(source).not.toMatch(/from ['"]node:/);
    expect(source).not.toMatch(/@lingotorte\/storage/);
  });

  it('parses SRT', () => {
    const drafts = parseSubtitleText(srtFixture, 'srt');
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts[0]!.cueIndex).toBe(1);
    expect(drafts[0]!.endMs).toBeGreaterThan(drafts[0]!.startMs);
    expect(drafts[0]!.normalizedText).toBe(drafts[0]!.text.toLowerCase());
  });

  it('parses VTT with and without the WEBVTT header to the same drafts (D-A2)', () => {
    expect(vttFixture.trimStart().startsWith('WEBVTT')).toBe(true);
    const withHeader = parseSubtitleText(vttFixture, 'vtt');
    const withoutHeader = parseSubtitleText(vttFixture.trimStart().slice('WEBVTT'.length), 'vtt');
    expect(withHeader.length).toBeGreaterThan(0);
    expect(withoutHeader).toEqual(withHeader);
  });

  it('parses ASS, stripping tags and line breaks', () => {
    const drafts = parseSubtitleText(assFixture, 'ass');
    expect(drafts).toEqual([
      { cueIndex: 1, startMs: 1000, endMs: 3500, text: 'First line with tags.', normalizedText: 'first line with tags.' },
      { cueIndex: 2, startMs: 4000, endMs: 6000, text: 'Second line with line break', normalizedText: 'second line with line break' },
    ]);
  });

  it('carries code/format/blockIndex on SubtitleParseError', () => {
    const missingId = catchParse('x\n00:00:01,000 --> 00:00:02,000\nHi', 'srt');
    expect([missingId.code, missingId.format, missingId.blockIndex]).toEqual(['missing-cue-id', 'srt', 1]);
    expect(missingId.message).toBe('SRT block 0 missing numeric cue id');

    const badTiming = catchParse('1\n00:00:02,000 --> 00:00:01,000\nHi', 'srt');
    expect([badTiming.code, badTiming.blockIndex]).toEqual(['invalid-timing', 1]);
    expect(badTiming.message).toMatch(/end time must be after start time/);

    const empty = catchParse('1\n00:00:01,000 --> 00:00:02,000\n   ', 'srt');
    expect([empty.code, empty.blockIndex]).toEqual(['empty-text', 1]);

    const overlap = catchParse('1\n00:00:01,000 --> 00:00:03,000\nA\n\n2\n00:00:02,000 --> 00:00:04,000\nB', 'srt');
    expect([overlap.code, overlap.format, overlap.blockIndex]).toEqual(['overlap', 'srt', 2]);

    const vttTiming = catchParse('WEBVTT\n\nnot a timing\nHi', 'vtt');
    expect([vttTiming.code, vttTiming.format, vttTiming.blockIndex]).toEqual(['invalid-timing', 'vtt', 1]);

    expect(catchParse('just text', 'ass').code).toBe('no-sections');
    expect(catchParse('[Script Info]\nTitle: x', 'ass').code).toBe('no-events');
    expect(catchParse('[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,x', 'ass').code).toBe('missing-header');
    const noDialogue = catchParse('[Events]\nFormat: Layer, Start, End, Text', 'ass');
    expect([noDialogue.code, noDialogue.format, noDialogue.blockIndex]).toEqual(['no-dialogue', 'ass', null]);
    expect(noDialogue.message).toMatch(/no Dialogue lines/);
  });

  it('infers formats and normalizes cue text', () => {
    expect(inferParsedSubtitleFormat('a.SRT')).toBe('srt');
    expect(inferParsedSubtitleFormat('a.vtt')).toBe('vtt');
    expect(inferParsedSubtitleFormat('a.ssa')).toBe('ass');
    expect(inferParsedSubtitleFormat('a.txt', 'WEBVTT\n\n')).toBe('vtt');
    let err: unknown;
    try {
      inferParsedSubtitleFormat('a.txt');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SubtitleParseError);
    expect((err as SubtitleParseError).code).toBe('unsupported-format');
    expect(normalizeCueText(' a\r\nb\n\n  c ')).toBe('a b c');
  });
});
