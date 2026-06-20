import { describe, expect, it } from 'vitest';
import { validateSavedOccurrenceSourceContext } from '../../packages/domain/src/sourceContext';

describe('source-context schema placeholders', () => {
  it('accepts exact media, path, cue, time, token, and char span context', () => {
    const context = validateSavedOccurrenceSourceContext({
      mediaId: 'media.synthetic-polish-dialogue',
      mediaPath: 'fixtures/media/synthetic-polish-dialogue.webm',
      mediaFingerprint: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      subtitleTrackId: 'track.synthetic-polish-dialogue.pl',
      cueId: 'cue.pl.0001',
      timeRangeMs: { start: 0, end: 1000 },
      tokenSpan: { startToken: 0, endToken: 1 },
      charSpan: { start: 0, end: 5 },
    });

    expect(context.cueId).toBe('cue.pl.0001');
    expect(context.mediaPath).toBe('fixtures/media/synthetic-polish-dialogue.webm');
    expect(context.tokenSpan.endToken).toBe(1);
  });

  it('rejects saved-item context that lacks the local media path', () => {
    expect(() =>
      validateSavedOccurrenceSourceContext({
        mediaId: 'media.synthetic-polish-dialogue',
        mediaFingerprint: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        subtitleTrackId: 'track.synthetic-polish-dialogue.pl',
        cueId: 'cue.pl.0001',
        timeRangeMs: { start: 0, end: 1000 },
        tokenSpan: { startToken: 0, endToken: 1 },
        charSpan: { start: 0, end: 5 },
      }),
    ).toThrow(/mediaPath/);
  });

  it('rejects detached saved-item context that lacks token span provenance', () => {
    expect(() =>
      validateSavedOccurrenceSourceContext({
        mediaId: 'media.synthetic-polish-dialogue',
        mediaPath: 'fixtures/media/synthetic-polish-dialogue.webm',
        mediaFingerprint: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        subtitleTrackId: 'track.synthetic-polish-dialogue.pl',
        cueId: 'cue.pl.0001',
        timeRangeMs: { start: 0, end: 1000 },
        charSpan: { start: 0, end: 5 },
      }),
    ).toThrow(/tokenSpan/);
  });
});
