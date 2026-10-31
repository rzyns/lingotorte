import { afterEach, describe, expect, it, vi } from 'vitest';
import { pairTransport, clearPairing, exactServiceOrigin } from '../../apps/web/src/pairedTransport.ts';
import { createAppModel, pairLocalService, captureLocalServiceTransport, connectLocalService, saveModelToLocalService, setLocalServiceBaseUrl, listEmbeddedSubtitleTracksFromService, extractSelectedEmbeddedSubtitleDraft, makeLocalServiceAsrProvider, makeLocalServiceElevenLabsScribeProvider, makeLocalServiceYouTubeCaptionProvider, generateLocalAsrDraft } from '../../apps/web/src/model.ts';
import { prepareSourceAudioSnippet, releaseSourceAudioSnippet } from '../../apps/web/src/sourceAudioSnippet.ts';
import { SYNTHETIC_CAPABILITY } from './pairingFixture.ts';
import { makeMediaAsset } from '../../packages/domain/src/index.ts';
import { nativePathPolicy } from '../../packages/domain/src/nativePaths.ts';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src/index.ts';

const origin = 'http://127.0.0.1:5174';
const replacement = 'http://selected-private-host:7514';
const uuid = '00000000-0000-4000-8000-000000000001';
const revision = `sha256:${'1'.repeat(64)}`;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function modelWithPair() {
  const model = createAppModel(); pairLocalService(model, SYNTHETIC_CAPABILITY);
  model.localService.status = 'connected'; model.localService.pathPolicy = nativePathPolicy('linux');
  model.currentMedia = makeMediaAsset({ title: 'Synthetic', originalPath: '/media/synthetic.wav', contentSha256: 'sha256:' + '0'.repeat(64) as never, durationMs: 1000, container: 'wav', sizeBytes: 10, privacyLabel: 'synthetic' });
  model.transcriptLifecycle.embeddedSubtitle.mediaPath = '/media/synthetic.wav';
  model.transcriptLifecycle.embeddedSubtitle.tracks = [{ streamIndex: 1, codecName: 'subrip', codecKind: 'subrip', isSupported: true }];
  model.transcriptLifecycle.embeddedSubtitle.selectedStreamIndex = 1;
  return model;
}
afterEach(() => vi.unstubAllGlobals());
describe('captured memory-only transport', () => {
  it.each(['http://127.1:5174','http://0177.0.0.1:5174','http://0x7f000001:5174','http://127.0.0.1:05174','http://user@127.0.0.1:5174','http://127.0.0.1:5174/path','http://127.0.0.1:5174?x=1','http://127.0.0.1:5174#x','http://*.local:5174','http://host.local.:5174','https://127.0.0.1:5174','file:///private','//evil.local'])('rejects deceptive destination %s before pairing or egress', bad => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(() => pairTransport({}, bad, SYNTHETIC_CAPABILITY)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('captures Docker page origin rather than resolving a mutable relative URL', async () => {
    vi.stubGlobal('location', { origin: replacement });
    const transport = pairTransport({}, '/', SYNTHETIC_CAPABILITY);
    vi.stubGlobal('location', { origin: 'http://other-private-host:8080' });
    const fetcher = vi.fn<typeof fetch>(async () => json({ ok: true }));
    await transport.request('/api/status', undefined, fetcher);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${replacement}/api/status`);
    expect(exactServiceOrigin('http://[::1]:5174')).toBe('http://[::1]:5174');
  });
  it('enforces authenticated omitted-credentials redirect-error on every request', async () => {
    const transport = pairTransport({}, origin, SYNTHETIC_CAPABILITY);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true }));
    for (const [path, method] of [['/api/status','GET'],['/api/state','GET'],['/api/state','PUT'],['/api/jobs','POST'],['/api/jobs/test','GET'],['/api/jobs/test/cancel','POST'],[`/api/snippets/${uuid}`,'GET'],[`/api/snippets/${uuid}`,'DELETE'],['/api/artifacts/cleanup','POST'],['/api/language/morphology','POST']]) {
      await transport.request(path!, { method: method!, ...(['POST','PUT'].includes(method!) ? { body: '{}' } : {}) }, fetcher);
    }
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.credentials).toBe('omit'); expect(init?.redirect).toBe('error');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SYNTHETIC_CAPABILITY}`);
      expect(new Headers(init?.headers).has('origin')).toBe(false);
    }
    expect(JSON.stringify(transport)).not.toContain(SYNTHETIC_CAPABILITY);
  });
  it('lt-192.4: only M1/M2 (/api/media/session) use same-origin credentials, and only for the exact page origin; M3 stays omit; M4 is never a transport path', async () => {
    vi.stubGlobal('location', { origin });
    const transport = pairTransport({}, origin, SYNTHETIC_CAPABILITY);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    for (const [path, method] of [['/api/media/session', 'POST'], ['/api/media/session', 'DELETE'], [`/api/media/${uuid}/storage`, 'GET'], [`/api/media/${uuid}/transcripts`, 'GET'], ['/api/state', 'GET']] as const) {
      await transport.request(path, { method, ...(method === 'POST' ? { body: '{}' } : {}), credentials: 'include' }, fetcher);
    }
    expect(fetcher.mock.calls.map(([, init]) => init?.credentials)).toEqual(['same-origin', 'same-origin', 'omit', 'omit', 'omit']);
    for (const [, init] of fetcher.mock.calls) expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SYNTHETIC_CAPABILITY}`);
    await expect(transport.request(`/api/media/${uuid}/content`, undefined, fetcher)).rejects.toThrow('Invalid local service API path');
    // Another page origin (native direct mode): the cookie route is refused before any egress.
    vi.stubGlobal('location', { origin: 'http://127.0.0.1:5173' });
    const before = fetcher.mock.calls.length;
    await expect(transport.request('/api/media/session', { method: 'POST', body: '{}' }, fetcher)).rejects.toThrow('same-origin');
    await expect(transport.request('/api/media/session', { method: 'DELETE' }, fetcher)).rejects.toThrow('same-origin');
    expect(fetcher.mock.calls.length).toBe(before);
    await transport.request(`/api/media/${uuid}/storage`, undefined, fetcher);
    expect(fetcher.mock.calls.at(-1)?.[1]?.credentials).toBe('omit');
  });
  it('refuses redirects without a second request', async () => {
    const transport = pairTransport({}, origin, SYNTHETIC_CAPABILITY);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://foreign.local/private' } }));
    await expect(transport.request('/api/state', undefined, fetcher)).rejects.toThrow('redirect');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('clears authority on disconnect; old closures cannot send again', async () => {
    const owner = {}; const transport = pairTransport(owner, origin, SYNTHETIC_CAPABILITY); clearPairing(owner);
    const fetcher = vi.fn(); await expect(transport.request('/api/state', undefined, fetcher)).rejects.toThrow('superseded'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('401 keeps the autosave preference but requires fresh explicit pairing without replay', async () => {
    const model = modelWithPair(); model.localService.autosaveEnabled = true;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: false }, 401)); vi.stubGlobal('fetch', fetcher);
    await connectLocalService(model);
    expect(model.localService.lastMessage).toContain('Pair again'); expect(model.localService.autosaveEnabled).toBe(true);
    await saveModelToLocalService(model); await connectLocalService(model);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(model)).not.toContain(SYNTHETIC_CAPABILITY);
    expect(() => captureLocalServiceTransport(createAppModel())).toThrow();
  });
});
const kinds = ['list','extract','asr','scribe','youtube','snippet'] as const;
function run(kind: typeof kinds[number], model: ReturnType<typeof modelWithPair>) {
  const transport = captureLocalServiceTransport(model);
  const options = { mediaPath: '/media/synthetic.wav', pathPolicy: nativePathPolicy('linux'), pollAttempts: 3, pollDelayMs: 0 };
  switch (kind) {
    case 'list': return listEmbeddedSubtitleTracksFromService(model, options);
    case 'extract': return extractSelectedEmbeddedSubtitleDraft(model, options);
    case 'asr': return makeLocalServiceAsrProvider(transport, options).transcribe({ media: model.currentMedia!, language: 'pl' });
    case 'scribe': return makeLocalServiceElevenLabsScribeProvider(transport, { ...options, allowOnlineProvider: true }).transcribe({ media: model.currentMedia!, language: 'pl' });
    case 'youtube': return makeLocalServiceYouTubeCaptionProvider(transport, { pollAttempts: 3, pollDelayMs: 0, allowPublicRead: true }).fetchCaptions({ url: 'https://www.youtube.com/watch?v=abcdefghijk', language: 'pl' });
    case 'snippet': return prepareSourceAudioSnippet({ transport, ...options, startMs: 0, endMs: 1000, lifecycle: { objectUrl: null } });
  }
}
describe('awaited ownership through real client flows', () => {
  it.each(['asr','scribe','youtube'] as const)('still-owned %s provider jobs create and poll with explicit consent unchanged', async kind => {
    const model = modelWithPair(); const transcript = { engine: 'fake', modelName: 'fake', language: 'pl', segments: [{ startMs: 0, endMs: 1000, text: 'Synthetic text.' }] };
    const result = kind === 'youtube' ? { caption: { videoId: 'abcdefghijk', language: 'pl', isAutoGenerated: false, segments: transcript.segments } } : { transcript };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ job: { id: 'owned-job' } })).mockResolvedValueOnce(json({ job: { status: 'completed', result } })); vi.stubGlobal('fetch', fetcher);
    await expect(run(kind, model)).resolves.toMatchObject({ language: 'pl' }); expect(fetcher).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string).payload;
    if (kind === 'scribe') expect(payload.allowOnlineProvider).toBe(true);
    if (kind === 'youtube') expect(payload.allowPublicRead).toBe(true);
    for (const [, init] of fetcher.mock.calls) expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SYNTHETIC_CAPABILITY}`);
  });
  it.each(kinds)('%s cannot poll, publish or retarget after a suspended creation loses pairing', async kind => {
    const model = modelWithPair(); const waiting = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>(() => waiting.promise); vi.stubGlobal('fetch', fetcher);
    const pending = run(kind, model); const rejected = expect(pending).rejects.toThrow('superseded');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    pairLocalService(model, SYNTHETIC_CAPABILITY, replacement); const snapshot = model.store.snapshot(); const state = JSON.stringify(model.localService);
    waiting.resolve(json({ job: { id: 'captured-job' } })); await rejected;
    expect(fetcher).toHaveBeenCalledTimes(1); expect(String(fetcher.mock.calls[0]?.[0])).toBe(`${origin}/api/jobs`);
    expect(model.store.snapshot()).toEqual(snapshot); expect(JSON.stringify(model.localService)).toBe(state);
  });
  it.each(kinds)('%s stops its poll loop on 401 without tokenless retry', async kind => {
    const model = modelWithPair(); const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ job: { id: 'owned-job' } })).mockResolvedValue(json({ ok: false }, 401)); vi.stubGlobal('fetch', fetcher);
    await expect(run(kind, model)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(2); expect(model.localService.lastMessage).toContain('Pair again');
  });
  it('fences transcript commit after the provider completed but an awaited hash loses ownership', async () => {
    const model = modelWithPair(); const hash = deferred<ArrayBuffer>();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ job: { id: 'owned-job' } })).mockResolvedValueOnce(json({ job: { status: 'completed', result: { transcript: { engine: 'fake', modelName: 'fake', language: 'pl', segments: [{ startMs: 0, endMs: 1000, text: 'Synthetic text.' }] } } } })); vi.stubGlobal('fetch', fetcher);
    const digest = vi.fn(() => hash.promise); vi.stubGlobal('crypto', { subtle: { digest } });
    const prior = model.store.snapshot(); const pending = generateLocalAsrDraft(model, makeLocalServiceAsrProvider(captureLocalServiceTransport(model), { pathPolicy: nativePathPolicy('linux'), pollDelayMs: 0 })); const rejected = expect(pending).rejects.toThrow('superseded');
    await vi.waitFor(() => expect(digest).toHaveBeenCalled()); setLocalServiceBaseUrl(model, replacement); hash.resolve(new Uint8Array(32).buffer); await rejected;
    expect(model.store.snapshot()).toEqual(prior); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not issue state GET after awaited status JSON loses owner', async () => {
    const model = modelWithPair(); const body = deferred<unknown>(); const response = json({}); response.json = () => body.promise;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response); vi.stubGlobal('fetch', fetcher);
    const pending = connectLocalService(model); await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1)); setLocalServiceBaseUrl(model, replacement);
    body.resolve({ config: {} }); expect((await pending).ok).toBe(false); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('still-owned connection and durable save retain expectedRevision ACK semantics', async () => {
    const model = modelWithPair(); const fetcher = vi.fn<typeof fetch>(async (_url, init) => json(init?.method === 'PUT' ? { ok: true, revision, savedAt: '2026-01-01T00:00:00.000Z' } : { ok: true, config: { pathPolicy: nativePathPolicy('linux') }, snapshot: createEmptyLocalStoreSnapshot(), revision })); vi.stubGlobal('fetch', fetcher);
    expect((await connectLocalService(model)).ok).toBe(true); expect((await saveModelToLocalService(model)).ok).toBe(true);
    expect(JSON.parse(fetcher.mock.calls[2]?.[1]?.body as string).expectedRevision).toBe(revision); expect(model.localService.syncState).toBe('saved');
  });
});
describe('source audio result and Blob ownership', () => {
  it.each(['http://foreign.local/audio','//foreign.local/audio','/api/snippets/opaque',`/api/snippets/${uuid}?bearer=bad`,`/api/snippets/${uuid}#bad`])('rejects hostile snippet result %s before byte egress', async url => {
    const transport = pairTransport({}, origin, SYNTHETIC_CAPABILITY); const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ job: { id: 'job' } })).mockResolvedValueOnce(json({ job: { status: 'completed', result: { snippetId: uuid, url, mimeType: 'audio/wav' } } }));
    await expect(prepareSourceAudioSnippet({ transport, mediaPath: '/media/synthetic.wav', pathPolicy: nativePathPolicy('linux'), startMs: 0, endMs: 1000, fetchImpl: fetcher, lifecycle: { objectUrl: null } })).rejects.toThrow('Invalid'); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('deletes service WAV before Blob promotion and revokes prepared audio on pairing loss', async () => {
    const owner = {}; const transport = pairTransport(owner, origin, SYNTHETIC_CAPABILITY); const lifecycle = { objectUrl: null as string | null }; const calls: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => { calls.push(init?.method ?? 'GET'); if (String(url).endsWith('/api/jobs')) return json({ job: { id: 'job' } }); if (String(url).includes('/api/jobs/')) return json({ job: { status: 'completed', result: { snippetId: uuid, url: `/api/snippets/${uuid}`, mimeType: 'audio/wav' } } }); return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(new Blob(['wav'], { type: 'audio/wav' })); });
    const revoke = vi.fn(); await prepareSourceAudioSnippet({ transport, mediaPath: '/media/synthetic.wav', pathPolicy: nativePathPolicy('linux'), startMs: 0, endMs: 1000, fetchImpl: fetcher, lifecycle, createObjectURL: () => { calls.push('Blob'); return 'blob:synthetic'; }, revokeObjectURL: revoke });
    expect(calls).toEqual(['POST','GET','GET','DELETE','Blob']); clearPairing(owner); expect(revoke).toHaveBeenCalledWith('blob:synthetic'); expect(lifecycle.objectUrl).toBeNull(); releaseSourceAudioSnippet(lifecycle, revoke); expect(revoke).toHaveBeenCalledTimes(1);
  });
  it('cannot promote after DELETE acknowledgement loses pairing', async () => {
    const owner = {}; const transport = pairTransport(owner, origin, SYNTHETIC_CAPABILITY); const deletion = deferred<Response>();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ job: { id: 'job' } })).mockResolvedValueOnce(json({ job: { status: 'completed', result: { snippetId: uuid, url: `/api/snippets/${uuid}`, mimeType: 'audio/wav' } } })).mockResolvedValueOnce(new Response(new Blob(['wav']))).mockImplementationOnce(() => deletion.promise);
    const create = vi.fn(() => 'blob:synthetic'); const lifecycle = { objectUrl: null }; const pending = prepareSourceAudioSnippet({ transport, mediaPath: '/media/synthetic.wav', pathPolicy: nativePathPolicy('linux'), startMs: 0, endMs: 1000, fetchImpl: fetcher, lifecycle, createObjectURL: create }); const rejected = expect(pending).rejects.toThrow('superseded');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4)); clearPairing(owner); deletion.resolve(new Response(null, { status: 204 })); await rejected; expect(create).not.toHaveBeenCalled(); expect(lifecycle.objectUrl).toBeNull();
  });
  it.each([2, 3])('401 on source WAV/deletion request index %s stops without promotion', async index => {
    const model = modelWithPair(); const responses = [json({ job: { id: 'job' } }), json({ job: { status: 'completed', result: { snippetId: uuid, url: `/api/snippets/${uuid}`, mimeType: 'audio/wav' } } }), new Response(new Blob(['wav'])), new Response(null, { status: 204 })]; responses[index] = json({ ok: false }, 401);
    const fetcher = vi.fn<typeof fetch>(); for (const response of responses) fetcher.mockResolvedValueOnce(response);
    const create = vi.fn(() => 'blob:synthetic'); await expect(prepareSourceAudioSnippet({ transport: captureLocalServiceTransport(model), mediaPath: '/media/synthetic.wav', pathPolicy: nativePathPolicy('linux'), startMs: 0, endMs: 1000, fetchImpl: fetcher, lifecycle: { objectUrl: null }, createObjectURL: create })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(index + 1); expect(create).not.toHaveBeenCalled(); expect(model.localService.lastMessage).toContain('Pair again');
  });
  it('cannot DELETE or promote after awaited WAV Blob loses pairing', async () => {
    const owner = {}; const transport = pairTransport(owner, origin, SYNTHETIC_CAPABILITY); const bytes = deferred<Blob>(); const wav = new Response(); wav.blob = () => bytes.promise;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ job: { id: 'job' } })).mockResolvedValueOnce(json({ job: { status: 'completed', result: { snippetId: uuid, url: `/api/snippets/${uuid}`, mimeType: 'audio/wav' } } })).mockResolvedValueOnce(wav);
    const create = vi.fn(() => 'blob:synthetic'); const lifecycle = { objectUrl: null }; const pending = prepareSourceAudioSnippet({ transport, mediaPath: '/media/synthetic.wav', pathPolicy: nativePathPolicy('linux'), startMs: 0, endMs: 1000, fetchImpl: fetcher, lifecycle, createObjectURL: create }); const rejected = expect(pending).rejects.toThrow('superseded');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3)); clearPairing(owner); bytes.resolve(new Blob(['wav'])); await rejected; expect(fetcher).toHaveBeenCalledTimes(3); expect(create).not.toHaveBeenCalled();
  });
});
