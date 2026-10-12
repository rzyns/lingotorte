import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppModel, createCorrectedTranscriptVersion, importBrowserLocalFiles, importFixtureMediaAndSubtitles } from '../../apps/web/src/model';

const digest = (bytes: Uint8Array | string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

afterEach(() => vi.unstubAllGlobals());

describe('plain-HTTP LAN browser import hashing', () => {
  it('imports nonempty local media, subtitle and cue bytes without crypto.subtle', async () => {
    const dom = new JSDOM('', { url: 'http://192.168.1.3:18053/' });
    try {
      // Real DOM Crypto retains random UUID support but has no SubtleCrypto.
      expect(dom.window.crypto.subtle).toBeUndefined();
      vi.stubGlobal('crypto', dom.window.crypto);
      const mediaBytes = new Uint8Array([0, 255, 128, 1, 2, 3]);
      const subtitle = '1\n00:00:00,000 --> 00:00:01,000\nZażółć gęślą jaźń.\n';
      const model = createAppModel();
      await importBrowserLocalFiles(model, {
        mediaFile: new File([mediaBytes], 'owned.webm', { type: 'video/webm' }),
        targetSubtitleFile: new File([subtitle], 'owned.pl.srt', { type: 'application/x-subrip' }),
      });
      expect(model.importError).toBeNull();
      expect(model.currentMedia?.contentSha256).toBe(digest(mediaBytes));
      expect(model.store.getSubtitleTrack(model.targetTrackId!)?.contentSha256).toBe(digest(subtitle));
      expect(model.cues).toHaveLength(1);
      expect(model.cues[0]?.textSha256).toBe(digest('Zażółć gęślą jaźń.'));
      expect(model.providerPolicy.onlineProvidersEnabled).toBe(false);
      const corrected = await createCorrectedTranscriptVersion(model, model.targetTrackId!, [
        { cueId: model.cues[0]!.id, text: 'Poprawiony napis 😀.' },
      ]);
      expect(corrected.track.contentSha256).toBe(digest('0-1000:Poprawiony napis 😀.'));
      expect(corrected.cues[0]?.textSha256).toBe(digest('Poprawiony napis 😀.'));
      expect(corrected.track.transcriptStatus).toBe('correcting');
      const beforeInvalid = model.store.snapshot();
      await expect(createCorrectedTranscriptVersion(model, corrected.track.id, [
        { cueId: corrected.cues[0]!.id, text: '   ' },
      ])).rejects.toThrow('empty cue text');
      expect(model.store.snapshot()).toEqual(beforeInvalid);
      URL.revokeObjectURL(model.currentMedia!.originalPath);
    } finally {
      dom.window.close();
    }
  });

  it('takes the actual synthetic browser path with no SubtleCrypto and retains exact fixture hashes', async () => {
    const dom = new JSDOM('', { url: 'http://192.168.1.3:18053/' });
    const media = readFileSync('fixtures/media/synthetic-polish-dialogue.webm');
    const target = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.target.srt', 'utf8');
    const native = readFileSync('fixtures/subtitles/synthetic-polish-dialogue.native.srt', 'utf8');
    const fetchFixture = vi.fn(async () => new Response(media));
    try {
      vi.stubGlobal('crypto', dom.window.crypto);
      vi.stubGlobal('fetch', fetchFixture);
      const model = createAppModel();
      // Select browser dispatch, not native storage/mediaHelpers hashing.
      vi.stubGlobal('process', { ...process, versions: {} });
      await importFixtureMediaAndSubtitles(model,
        'fixtures/media/synthetic-polish-dialogue.webm',
        'fixtures/subtitles/synthetic-polish-dialogue.target.srt',
        'fixtures/subtitles/synthetic-polish-dialogue.native.srt');
      expect(model.importError).toBeNull();
      expect(fetchFixture).toHaveBeenCalledTimes(1);
      expect(model.currentMedia?.contentSha256).toBe(digest(media));
      expect(model.store.getSubtitleTrack(model.targetTrackId!)?.contentSha256).toBe(digest(target));
      expect(model.store.getSubtitleTrack(model.nativeTrackId!)?.contentSha256).toBe(digest(native));
      expect(model.cues).toHaveLength(2);
      for (const cue of model.cues) expect(cue.textSha256).toBe(digest(cue.text));
    } finally {
      vi.unstubAllGlobals();
      dom.window.close();
    }
  });
});
