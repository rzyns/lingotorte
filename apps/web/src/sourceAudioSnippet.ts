import { requireServiceNativePath, type NativePathPolicy } from '../../../packages/domain/src/nativePaths.ts';
import { type PairedTransport } from './pairedTransport.ts';

export type SourceAudioSnippetLifecycle = { objectUrl: string | null };
export type PrepareSourceAudioSnippetInput = Readonly<{
  transport: PairedTransport;
  mediaPath: string;
  pathPolicy?: NativePathPolicy | null | undefined;
  startMs: number;
  endMs: number;
  fetchImpl?: typeof fetch;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  lifecycle: SourceAudioSnippetLifecycle;
}>;
const releases = new WeakMap<SourceAudioSnippetLifecycle, () => void>();
export function redactSourceAudioSnippetError(error: unknown): string {
  if (error instanceof Error && error.message === 'Source snippet deletion failed.') return error.message;
  return 'Local source audio preparation failed. Check the connection and pair again if required.';
}
export async function prepareSourceAudioSnippet(input: PrepareSourceAudioSnippetInput): Promise<{ objectUrl: string; mimeType: 'audio/wav' }> {
  const owner = input.transport;
  owner.assertCurrent();
  const mediaPath = requireServiceNativePath(input.mediaPath, input.pathPolicy);
  const createObjectURL = input.createObjectURL ?? URL.createObjectURL.bind(URL);
  const revokeObjectURL = input.revokeObjectURL ?? URL.revokeObjectURL.bind(URL);
  releaseSourceAudioSnippet(input.lifecycle, revokeObjectURL);
  let current = true;
  const unsubscribe = owner.onInvalidate(() => { current = false; releaseSourceAudioSnippet(input.lifecycle, revokeObjectURL); });
  releases.set(input.lifecycle, () => { current = false; unsubscribe(); });
  const assertCurrent = () => { owner.assertCurrent(); if (!current) throw new Error('Source audio operation superseded.'); };
  const request = async (path: string, init?: RequestInit) => {
    assertCurrent();
    const response = await owner.request(path, init, input.fetchImpl);
    assertCurrent();
    if (!response.ok) throw new Error('Local source audio request failed.');
    return response;
  };
  try {
    const created = await request('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ kind: 'source-audio-snippet', payload: { mediaPath, startMs: input.startMs, endMs: input.endMs } }),
    });
    const createdBody = await created.json() as { job: { id: string } };
    assertCurrent();
    if (!/^[A-Za-z0-9_-]+$/.test(createdBody.job.id)) throw new Error('Invalid snippet job identifier.');
    let result: { snippetId: string; url: string; mimeType: 'audio/wav' } | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await request(`/api/jobs/${createdBody.job.id}`);
      const body = await response.json() as { job: { status: string; result?: typeof result } };
      assertCurrent();
      if (body.job.status === 'completed') { result = body.job.result; break; }
      if (body.job.status !== 'queued' && body.job.status !== 'running') throw new Error('Source snippet preparation failed.');
      await new Promise(resolve => setTimeout(resolve, 20));
      assertCurrent();
    }
    if (!result || !/^\/api\/snippets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(result.url)
      || result.url !== `/api/snippets/${result.snippetId}` || result.mimeType !== 'audio/wav') throw new Error('Invalid source snippet result.');
    const audioResponse = await request(result.url);
    const blob = await audioResponse.blob();
    assertCurrent();
    try { await request(result.url, { method: 'DELETE' }); }
    catch { assertCurrent(); throw new Error('Source snippet deletion failed.'); }
    assertCurrent();
    const objectUrl = createObjectURL(blob);
    try { assertCurrent(); } catch (error) { revokeObjectURL(objectUrl); throw error; }
    input.lifecycle.objectUrl = objectUrl;
    return { objectUrl, mimeType: 'audio/wav' };
  } catch (error) {
    if (current) releaseSourceAudioSnippet(input.lifecycle, revokeObjectURL);
    throw error;
  }
}
export function releaseSourceAudioSnippet(lifecycle: SourceAudioSnippetLifecycle, revokeObjectURL: (url: string) => void = URL.revokeObjectURL.bind(URL)): void {
  releases.get(lifecycle)?.();
  releases.delete(lifecycle);
  if (lifecycle.objectUrl !== null) revokeObjectURL(lifecycle.objectUrl);
  lifecycle.objectUrl = null;
}
