import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeMediaAsset } from '../../packages/domain/src/index.ts';
import { nativePathPolicy, validateNativePath, type NativePathPolicy } from '../../packages/domain/src/nativePaths.ts';
import { createAppModel, connectLocalService, extractSelectedEmbeddedSubtitleDraft, listEmbeddedSubtitleTracksFromService, makeLocalServiceAsrProvider, makeLocalServiceElevenLabsScribeProvider, planYtDlpMediaAcquisition } from '../../apps/web/src/model.ts';
import { prepareSourceAudioSnippet } from '../../apps/web/src/sourceAudioSnippet.ts';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src/localStore.ts';

afterEach(() => vi.unstubAllGlobals());
function modelFor(path: string, policy: NativePathPolicy | null) {
  const model = createAppModel();
  model.localService.status = 'connected';
  model.localService.pathPolicy = policy;
  model.currentMedia = makeMediaAsset({ title: 'Explicit synthetic fixture', originalPath: 'browser-file-handle:clip.mp4', contentSha256: `sha256:${'7'.repeat(64)}`, durationMs: 1000, container: 'mp4', sizeBytes: 10, privacyLabel: 'synthetic' });
  model.transcriptLifecycle.embeddedSubtitle = { mediaPath: path, language: 'pl', listingStatus: 'ready', extractionStatus: 'idle', tracks: [{ streamIndex: 0, codecName: 'subrip', codecKind: 'subrip', isSupported: true }], selectedStreamIndex: 0, statusMessage: null, errorCode: null };
  return model;
}
const jobs = ['embedded-list', 'embedded-extract', 'ASR', 'Scribe', 'snippet'] as const;
async function submit(kind: typeof jobs[number], path: string, policy: NativePathPolicy | null) {
  const model = modelFor(path, policy);
  if (kind === 'embedded-list') return listEmbeddedSubtitleTracksFromService(model);
  if (kind === 'embedded-extract') return extractSelectedEmbeddedSubtitleDraft(model);
  if (kind === 'snippet') return prepareSourceAudioSnippet({ baseUrl: model.localService.baseUrl, mediaPath: path, pathPolicy: policy, startMs: 0, endMs: 1, lifecycle: { objectUrl: null } });
  const options = { mediaPath: path, pathPolicy: policy };
  const input = { media: model.currentMedia!, language: 'pl' };
  return kind === 'ASR' ? makeLocalServiceAsrProvider(model.localService.baseUrl, options).transcribe(input)
    : makeLocalServiceElevenLabsScribeProvider(model.localService.baseUrl, options).transcribe(input);
}

for (const platform of ['win32', 'linux'] as const) describe(`${platform} browser/job policy agreement`, () => {
  const policy = nativePathPolicy(platform);
  const good = platform === 'win32' ? 'C:/Synthetic Media/part/../żółć.mp4' : '/synthetic media/part/../żółć.mp4';
  for (const job of jobs) {
    it(`${job} accepts the declared service platform (not the browser/host)`, async () => {
      const fetchImpl = vi.fn(async () => new Response('{"error":"synthetic seam stop"}', { status: 400 }));
      vi.stubGlobal('fetch', fetchImpl);
      await expect(submit(job, good, policy)).rejects.toThrow();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toContain('/api/jobs');
      expect(JSON.parse(String(call[1].body)).payload.mediaPath).toBe(validateNativePath(good, platform, 'input-file'));
    });
    it.each(['relative.mp4', 'C:clip.mp4', '//server/share/clip.mp4', '\\\\server\\share\\clip.mp4', 'blob:playback', 'browser-file-handle:clip.mp4', 'https://example.invalid/clip.mp4', '~/clip.mp4', ':memory:', platform === 'win32' ? '/clip.mp4' : 'C:/Media/clip.mp4', ` ${good}`, `${good}\n`, platform === 'win32' ? 'C:/fakepath/clip.mp4' : '//clip.mp4'])(`${job} refuses %s before fetch`, async (path) => {
      const fetchImpl = vi.fn();
      vi.stubGlobal('fetch', fetchImpl);
      await expect(submit(job, path, policy)).rejects.toThrow(/path/i);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
    it(`${job} refuses missing capability before fetch`, async () => {
      const fetchImpl = vi.fn();
      vi.stubGlobal('fetch', fetchImpl);
      await expect(submit(job, good, null)).rejects.toThrow(/compatible local service path policy/);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  }
  it('requires the same capability for output plans without executing downloads', () => {
    const input = { url: 'https://www.youtube.com/watch?v=abcdefghijk', outputDirectory: good, includeMedia: false, allowMediaDownload: false };
    expect(() => planYtDlpMediaAcquisition(input)).toThrow(/compatible/);
    expect(planYtDlpMediaAcquisition({ ...input, pathPolicy: policy }).argv).toContain(validateNativePath(good, platform, 'directory'));
  });
});

it.each([undefined, { version: 2, platform: 'win32' }, nativePathPolicy('win32')])('reads status capability and keeps browser-only playback for unknown versions: %j', async (pathPolicy) => {
  const model = createAppModel();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/api/status') ? { config: { pathPolicy } } : { snapshot: createEmptyLocalStoreSnapshot() }), { status: 200 })));
  const result = await connectLocalService(model);
  expect(result.ok).toBe(true);
  expect(model.localService.status).toBe('connected');
  expect(model.localService.pathPolicy).toEqual(pathPolicy?.version === 1 ? pathPolicy : null);
  if (pathPolicy?.version !== 1) expect(result.message).toContain('compatible local service path policy');
});
