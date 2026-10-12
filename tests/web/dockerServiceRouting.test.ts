import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareSourceAudioSnippet } from '../../apps/web/src/sourceAudioSnippet';
import { nativePathPolicy } from '../../packages/domain/src/nativePaths';

// Import the candidate model after selecting its Vite build-time setting.
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('Docker browser service selection', () => {
  it('routes snippet creation, polling, audio retrieval and deletion through the same origin', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: 'synthetic-job' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { status: 'completed', result: { snippetId: 'synthetic-snippet', url: '/api/snippets/synthetic-snippet', mimeType: 'audio/wav' } } })))
      .mockResolvedValueOnce(new Response(new Blob(['synthetic audio'], { type: 'audio/wav' })))
      .mockResolvedValueOnce(new Response('{}'));
    await prepareSourceAudioSnippet({ baseUrl: '/', mediaPath: '/media/synthetic.wav', pathPolicy: nativePathPolicy('linux'), startMs: 0, endMs: 1000, fetchImpl: fetchMock, createObjectURL: () => 'blob:synthetic-snippet', lifecycle: { objectUrl: null } });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/jobs', '/api/jobs/synthetic-job', '/api/snippets/synthetic-snippet', '/api/snippets/synthetic-snippet']);
    expect(fetchMock.mock.calls[3]![1]?.method).toBe('DELETE');
  });

  it('retains the direct localhost baseline when the build setting is absent', async () => {
    vi.stubEnv('VITE_LOCAL_SERVICE_BASE_URL', undefined);
    vi.resetModules();
    const { createAppModel } = await import('../../apps/web/src/model');
    expect(createAppModel().localService.baseUrl).toBe('http://127.0.0.1:5174');
  });

  it.each(['/', 'http://selected-private-host:7514'])('routes state through the selected %s base without substituting browser localhost', async (baseUrl) => {
    vi.stubEnv('VITE_LOCAL_SERVICE_BASE_URL', baseUrl);
    vi.resetModules();
    const { createAppModel, saveModelToLocalService } = await import('../../apps/web/src/model');
    const { createEmptyLocalStoreSnapshot } = await import('../../packages/storage/src');
    const revision = `sha256:${'1'.repeat(64)}`;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === 'PUT'
      ? { ok: true, revision, savedAt: '2026-01-01T00:00:00.000Z' }
      : { ok: true, config: {}, snapshot: createEmptyLocalStoreSnapshot(), revision }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const model = createAppModel();
    expect(model.localService.baseUrl).toBe(baseUrl);
    expect((await saveModelToLocalService(model)).ok).toBe(true);
    const prefix = baseUrl === '/' ? '' : baseUrl;
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${prefix}/api/status`, `${prefix}/api/state`, `${prefix}/api/state`]);
    expect(fetchMock.mock.calls[2]![1]!.method).toBe('PUT');
    expect(JSON.parse(fetchMock.mock.calls[2]![1]!.body as string).expectedRevision).toBe(revision);
  });
});
