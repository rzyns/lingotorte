export type SourceAudioSnippetLifecycle = { objectUrl: string | null };

export type PrepareSourceAudioSnippetInput = Readonly<{
  baseUrl: string;
  mediaPath: string;
  startMs: number;
  endMs: number;
  fetchImpl?: typeof fetch;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  lifecycle: SourceAudioSnippetLifecycle;
}>;

export async function prepareSourceAudioSnippet(input: PrepareSourceAudioSnippetInput): Promise<{ objectUrl: string; mimeType: 'audio/wav' }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const createObjectURL = input.createObjectURL ?? URL.createObjectURL.bind(URL);
  const revokeObjectURL = input.revokeObjectURL ?? URL.revokeObjectURL.bind(URL);
  releaseSourceAudioSnippet(input.lifecycle, revokeObjectURL);
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  const created = await fetchImpl(`${baseUrl}/api/jobs`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'source-audio-snippet', payload: { mediaPath: input.mediaPath, startMs: input.startMs, endMs: input.endMs } }),
  });
  if (!created.ok) throw new Error('Local source snippet request failed.');
  const createdBody = await created.json() as { job: { id: string } };
  let result: { snippetId: string; url: string; mimeType: 'audio/wav' } | undefined;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetchImpl(`${baseUrl}/api/jobs/${createdBody.job.id}`);
    const body = await response.json() as { job: { status: string; message?: string; result?: typeof result } };
    if (body.job.status === 'completed') { result = body.job.result; break; }
    if (body.job.status === 'failed' || body.job.status === 'cancelled') throw new Error(body.job.message ?? 'Source snippet preparation failed.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (!result) throw new Error('Source snippet preparation timed out.');
  const audioResponse = await fetchImpl(`${baseUrl}${result.url}`);
  if (!audioResponse.ok) throw new Error('Source snippet retrieval failed.');
  const blob = await audioResponse.blob();
  await fetchImpl(`${baseUrl}${result.url}`, { method: 'DELETE' });
  const objectUrl = createObjectURL(blob);
  input.lifecycle.objectUrl = objectUrl;
  return { objectUrl, mimeType: 'audio/wav' };
}

export function releaseSourceAudioSnippet(lifecycle: SourceAudioSnippetLifecycle, revokeObjectURL: (url: string) => void = URL.revokeObjectURL.bind(URL)): void {
  if (lifecycle.objectUrl !== null) revokeObjectURL(lifecycle.objectUrl);
  lifecycle.objectUrl = null;
}
