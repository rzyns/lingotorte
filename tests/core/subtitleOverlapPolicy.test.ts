import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { importSubtitle } from '../../packages/subtitles/src/import.ts';
import { parseSubtitleText, SubtitleParseError } from '../../packages/subtitles/src/parse.ts';

// Same two overlapping dialogue cues used by the real browser File import regression.
const ass = '[Events]\nFormat: Start, End, Text\nDialogue: 0:00:00.10,0:00:01.00,{\\i1}Cześć\\Nświecie, tutaj\nDialogue: 0:00:00.50,0:00:01.50,Second voice';

describe('ASS-only browser compatibility policy', () => {
  it('keeps core defaults strict and requires explicit ASS opt-in', () => {
    for (const options of [undefined, {}, { allowAssOverlap: false }]) {
      expect(() => parseSubtitleText(ass, 'ass', options)).toThrow(expect.objectContaining({ code: 'overlap', blockIndex: 2 }));
    }
    expect(parseSubtitleText(ass, 'ass', { allowAssOverlap: true })).toHaveLength(2);
  });

  it.each(['ass', 'ssa'])('keeps the real Node .%s file adapter strict', async (extension) => {
    const directory = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), 'lt2se2-overlap-'));
    try {
      const path = join(directory, `target.${extension}`);
      await writeFile(path, ass);
      await expect(importSubtitle({ path, mediaId: 'synthetic-media', language: 'pl', role: 'target' }))
        .rejects.toMatchObject({ name: 'SubtitleParseError', code: 'overlap', format: 'ass', blockIndex: 2 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['srt', '1\n00:00:00,100 --> 00:00:01,000\nFirst\n\n2\n00:00:00,500 --> 00:00:01,500\nSecond'],
    ['vtt', 'WEBVTT\n\n00:00.100 --> 00:01.000\nFirst\n\n00:00.500 --> 00:01.500\nSecond'],
  ] as const)('never relaxes %s overlap even with ASS opt-in', (format, text) => {
    expect(() => parseSubtitleText(text, format, { allowAssOverlap: true }))
      .toThrow(expect.objectContaining({ code: 'overlap', format, blockIndex: 2 }));
  });

  it.each([
    [ass.replace('0:00:00.50', 'INVALID'), 'invalid-timing'],
    [ass.replace('0:00:01.50', '0:00:00.40'), 'invalid-timing'],
    [ass.replace('Second voice', '{\\i1}'), 'empty-text'],
    [ass.replace('Format: Start, End, Text', 'Format: Start, Text'), 'missing-header'],
  ] as const)('still rejects malformed ASS with opt-in (%s)', (text, code) => {
    expect(() => parseSubtitleText(text, 'ass', { allowAssOverlap: true })).toThrow(SubtitleParseError);
    expect(() => parseSubtitleText(text, 'ass', { allowAssOverlap: true })).toThrow(expect.objectContaining({ code }));
  });
});
