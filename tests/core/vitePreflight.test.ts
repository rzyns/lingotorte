import { it, expect, vi } from 'vitest';
import { createServer, preview, type ViteDevServer, type PreviewServer } from 'vite';
import { request, createServer as createHttpServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { startLingotorteLocalService } from '../../apps/local-service/src/server.ts';
import { makeMediaAsset } from '../../packages/domain/src/index.ts';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src/index.ts';

function send(port: number, path: string, method: string, headers: string[], body?: string) {
  return new Promise<{ status: number; body: string; headers: import('node:http').IncomingHttpHeaders; continues: number }>((resolve, reject) => {
    let continues = 0;
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      let data = ''; res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, body: data, headers: res.headers, continues }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('Request timeout')));
    req.on('continue', () => continues++); req.on('error', reject); req.end(body);
  });
}

for (const mode of ['dev', 'preview'] as const) it(`actual Vite ${mode} delegates API preflight to backend admission without framework CORS bypass`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lt-vite-preflight-'));
  const uiOrigin = 'http://public.test:56123';
  let capability = ''; let observe: (() => unknown) | undefined;
  const probe = createHttpServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const backendPort = (probe.address() as { port: number }).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const service = await startLingotorteLocalService({ host: '127.0.0.1', port: backendPort, publicOrigins: [uiOrigin], uiOrigins: [uiOrigin], databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false }, {
    receiveCapability: value => { capability = value; }, observeState: read => { observe = read; },
  });
  const backendTarget = `http://127.0.0.1:${service.config.port}`;
  let vite: ViteDevServer | PreviewServer | undefined;
  const auth = ['Host', 'public.test:56123', 'Origin', uiOrigin, 'Authorization', `Bearer ${capability}`];
  const files = async () => {
    const entries: Record<string, string> = {};
    async function walk(dir: string) { for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name); if (entry.isDirectory()) await walk(path);
      else entries[path.slice(root.length)] = createHash('sha256').update(await readFile(path)).digest('hex');
    } }
    await walk(root); return entries;
  };
  try {
    vi.stubEnv('LINGOTORTE_API_PROXY_TARGET', backendTarget);
    vi.stubEnv('LINGOTORTE_PUBLIC_ORIGINS', uiOrigin);
    vi.stubEnv('LINGOTORTE_WEB_ALLOWED_HOSTS', 'public.test');
    const outDir = join(root, 'web'); await mkdir(outDir); await writeFile(join(outDir, 'index.html'), '<!doctype html><title>Synthetic preview</title>');
    const config = { configFile: 'vite.config.ts', build: { outDir }, optimizeDeps: { noDiscovery: true, include: [] } };
    if (mode === 'dev') { vite = await createServer({ ...config, server: { port: 0, strictPort: false } }); await vite.listen(); }
    else vite = await preview({ ...config, preview: { port: 0, strictPort: false } });
    const port = (vite.httpServer!.address() as { port: number }).port;
    const call = (path: string, method: string, headers: string[], body?: string) => send(port, path, method, headers, body);
    const state = JSON.parse((await call('/api/state', 'GET', auth)).body);
    // lt-584.5 (C4): /api/state carries learner state only (no cues/transcriptWordTimings keys).
    const { cues: _cues, transcriptWordTimings: _timings, ...snapshot } = createEmptyLocalStoreSnapshot();
    const media = makeMediaAsset({ title: 'Private synthetic state sentinel', originalPath: 'synthetic.webm', contentSha256: `sha256:${'1'.repeat(64)}`, durationMs: 1, container: 'webm', sizeBytes: 1, privacyLabel: 'synthetic' });
    snapshot.mediaAssets[media.id] = media;
    expect((await call('/api/state', 'PUT', [...auth, 'Content-Type', 'application/json'], JSON.stringify({ expectedRevision: state.revision, snapshot }))).status).toBe(200);
    const waiting = JSON.parse((await call('/api/jobs', 'POST', [...auth, 'Content-Type', 'application/json'], '{"kind":"waiting"}')).body).job.id;
    const before = JSON.stringify({ runtime: observe!(), files: await files() });
    const oracle = async () => expect(JSON.stringify({ runtime: observe!(), files: await files() })).toBe(before);
    const rows = [
      { path: '/api/health', method: 'GET', fields: '' },
      { path: '/api/state', method: 'GET', fields: 'authorization' },
      { path: '/api/state', method: 'PUT', fields: 'authorization, content-type' },
      { path: `/api/jobs/${waiting}/cancel`, method: 'POST', fields: 'authorization, content-type' },
    ];
    let deniedPreflights = 0;
    for (const origin of ['http://foreign.invalid', 'null']) for (const row of rows) {
      const result = await call(row.path, 'OPTIONS', ['Host', 'public.test:56123', 'Origin', origin, 'Access-Control-Request-Method', row.method, ...(row.fields ? ['Access-Control-Request-Headers', row.fields] : [])]);
      // This assertion is deliberately first: original Vite default CORS returns 204.
      expect.soft(result.status, `${mode}: ${origin} ${row.method} ${row.path}`).toBe(403);
      expect(result.headers['access-control-allow-origin']).toBeUndefined(); expect(result.body).not.toContain('snapshot');
      await oracle(); deniedPreflights++;
    }
    for (const row of rows) {
      const result = await call(row.path, 'OPTIONS', ['Host', 'public.test:56123', 'Origin', uiOrigin, 'Access-Control-Request-Method', row.method, ...(row.fields ? ['Access-Control-Request-Headers', row.fields] : [])]);
      expect(result.status).toBe(204);
      expect(result.body).toBe(''); expect(result.headers['access-control-allow-origin']).toBe(uiOrigin);
      expect(result.headers['access-control-allow-methods']).toBe(row.method);
      expect(result.headers['access-control-allow-headers']).toBe(row.fields || undefined);
      expect(result.headers.vary).toContain('Origin');
      expect(result.headers.vary).toContain('Access-Control-Request-Method');
      expect(result.headers.vary).toContain('Access-Control-Request-Headers');
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['access-control-allow-credentials']).toBeUndefined(); await oracle();
    }
    expect((await call('/api/health', 'GET', ['Host', 'public.test:56123'])).status).toBe(200);
    expect((await call('/api/state', 'GET', ['Host', 'public.test:56123', 'Origin', uiOrigin, 'Authorization', `Bearer ${'A'.repeat(43)}`])).status).toBe(401);
    expect((await call('/api/state', 'PATCH', auth)).status).toBe(405);
    expect((await call('/api/state', 'PUT', [...auth, 'Content-Type', 'text/plain'], '{}')).status).toBe(415);
    expect((await call('/api/state', 'OPTIONS', ['Host', 'public.test:56123', 'Origin', uiOrigin, 'Access-Control-Request-Method', 'PATCH', 'Access-Control-Request-Headers', 'authorization'])).status).toBe(403);
    expect((await call('/api/state', 'OPTIONS', ['Host', 'public.test:56123', 'Origin', uiOrigin, 'Access-Control-Request-Method', 'GET', 'Access-Control-Request-Headers', 'authorization', 'Access-Control-Request-Private-Network', 'true'])).status).toBe(403);
    for (const extra of [[], ['Expect', '100-continue']]) {
      const badHost = await call('/api/state', 'OPTIONS', ['Host', 'evil.invalid:56123', 'Origin', uiOrigin, 'Access-Control-Request-Method', 'GET', ...extra]);
      expect(badHost.status).toBe(403); expect(badHost.continues).toBe(0);
      for (const name of ['Host', 'Origin', 'Authorization', 'Content-Type']) {
        const headers = ['Host', 'public.test:56123', name, name === 'Host' ? 'public.test:56123' : 'first', ...extra];
        if (name !== 'Host') headers.push(name, 'second');
        const result = await call('/api/state', 'OPTIONS', headers); expect(result.status).toBe(400); expect(result.continues).toBe(0);
      }
    }
    await oracle();
    console.info(JSON.stringify({ mode, deniedPreflights, backendPreflightControls: rows.length, rawIngressDenials: 10, seededRuntimeFilesUnchanged: true }));
  } finally {
    if (vite) { if ('close' in vite) await vite.close(); else await new Promise<void>(resolve => vite!.httpServer!.close(() => resolve())); }
    await service.close(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true });
  }
}, 20_000);
