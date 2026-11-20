// lt-192.4 S7 (plan §7 "Proxy"): M1-M4 through the real Vite preview with the exact-Host public ingress and the
// /api proxy (vite.config.ts unchanged): byte parity of 200/206/416 with direct responses, Set-Cookie and Cookie
// unchanged, HEAD bodyless, client abort mid-stream frees the slot, forwarded headers stripped, wrong Host 403 at
// ingress with zero backend effects. Synthetic library/database only; loopback only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preview, type PreviewServer } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { join } from 'node:path';
import { seedManagedBlob, syntheticBytes } from '../helpers/managedMediaFixture.ts';
import { dechunk, freePort, startMediaService, until, wire, type MediaService } from '../helpers/lt1924Service.ts';

const posix = process.platform !== 'win32';
// Hundreds of raw-socket requests per test: bounded generously so a loaded full-suite run is not a false timeout.
vi.setConfig({ testTimeout: 30_000 });
const PUBLIC = 'public.test:56124';
let vite: PreviewServer | undefined;
let service: MediaService | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  await vite?.close(); vite = undefined;
  if (service) { await service.service.close().catch(() => undefined); await rm(service.root, { recursive: true, force: true }); service = undefined; }
});

async function stack() {
  const port = await freePort();
  // The backend's public authority is the browser-visible web authority (Docker same-origin profile).
  service = await startMediaService({ port, config: { publicOrigins: [`http://${PUBLIC}`], uiOrigins: [`http://${PUBLIC}`] } });
  vi.stubEnv('LINGOTORTE_API_PROXY_TARGET', `http://127.0.0.1:${port}`);
  vi.stubEnv('LINGOTORTE_PUBLIC_ORIGINS', `http://${PUBLIC}`);
  vi.stubEnv('LINGOTORTE_WEB_ALLOWED_HOSTS', 'public.test');
  const outDir = join(service.root, 'web'); await mkdir(outDir); await writeFile(join(outDir, 'index.html'), '<!doctype html><title>Synthetic preview</title>');
  vite = await preview({ configFile: 'vite.config.ts', build: { outDir }, preview: { port: 0, strictPort: false }, logLevel: 'silent' });
  const webPort = (vite.httpServer!.address() as { port: number }).port;
  const host: [string, string] = ['Host', PUBLIC];
  return { s: service, webPort, host, viaProxy: (method: string, path: string, headers: [string, string][] = [], body?: string) => wire(webPort, method, path, [host, ...headers], body),
    direct: (method: string, path: string, headers: [string, string][] = [], body?: string) => wire(port, method, path, [host, ...headers], body) };
}

describe.skipIf(!posix)('lt-192.4 proxy flows (real Vite preview + public ingress)', () => {
  it('M1 Set-Cookie passes unchanged; Cookie is forwarded; 200/206/416 have byte parity with direct responses; HEAD is bodyless', async () => {
    const { s, viaProxy, direct } = await stack();
    const bearer = s.bearer();
    const m1 = await viaProxy('POST', '/api/media/session', [bearer, ['Content-Type', 'application/json'], ['Origin', `http://${PUBLIC}`]], '{}');
    expect(m1.status).toBe(204);
    expect(m1.headers['set-cookie']).toHaveLength(1);
    expect(m1.headers['set-cookie']![0]).toMatch(/^lt_media=[A-Za-z0-9_-]{43}; Path=\/api\/media\/; HttpOnly; SameSite=Strict$/);
    const cookie: [string, string] = ['Cookie', /^(lt_media=[^;]+)/.exec(m1.headers['set-cookie']![0]!)![1]!];
    const bytes = syntheticBytes(50_000);
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, bytes);
    const path = `/api/media/${blob.mediaId}/content`;
    let rows = 0;
    for (const range of [undefined, 'bytes=0-999', 'bytes=49000-', 'bytes=-10', 'bytes=50000-', 'bytes=5-4']) {
      const headers: [string, string][] = [cookie, ...(range ? [['Range', range] as [string, string]] : [])];
      const [p, d] = [await viaProxy('GET', path, headers), await direct('GET', path, headers)];
      expect(p.status, String(range)).toBe(d.status);
      expect(dechunk(p).equals(dechunk(d)), String(range)).toBe(true);
      for (const name of ['content-range', 'content-type', 'etag', 'accept-ranges', 'x-content-type-options', 'cross-origin-resource-policy', 'cache-control']) expect(p.headers[name], `${range} ${name}`).toEqual(d.headers[name]);
      rows++;
    }
    expect(rows).toBe(6);
    const head = await viaProxy('HEAD', path, [cookie, ['Range', 'bytes=0-1']]);
    expect(head.status).toBe(200); expect(head.headers['content-length']).toEqual(['50000']); expect(head.body.length).toBe(0);
    const head401 = await viaProxy('HEAD', path, []);
    expect(head401.status).toBe(401); expect(head401.body.length).toBe(0);
    // M2 through the proxy expires the cookie unchanged.
    const m2 = await viaProxy('DELETE', '/api/media/session', [bearer, cookie]);
    expect(m2.status).toBe(204); expect(m2.headers['set-cookie']).toEqual(['lt_media=; Path=/api/media/; Max-Age=0; HttpOnly; SameSite=Strict']);
    expect((await viaProxy('GET', path, [cookie])).status).toBe(401);
  });

  it('a client abort mid-stream through the proxy drops activeMediaSlots back to 0', async () => {
    const { s, webPort } = await stack();
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(16 * 1024 * 1024));
    const cookie = await s.mint();
    const socket = connect(webPort, '127.0.0.1', () => socket.write(`GET /api/media/${blob.mediaId}/content HTTP/1.1\r\nHost: ${PUBLIC}\r\nCookie: lt_media=${cookie}\r\n\r\n`));
    socket.on('error', () => undefined);
    await new Promise<void>(resolve => socket.once('data', () => { socket.pause(); resolve(); }));
    await until(() => s.observe().liveMediaStreams === 1, 3000, 'stream live behind the proxy');
    socket.destroy();
    await until(() => s.observe().activeMediaSlots === 0, 5000, 'proxy abort propagated');
    expect(s.observe()).toMatchObject({ activeMediaSlots: 0, pendingMediaOpens: 0, liveMediaStreams: 0 });
  });

  it('forwarded headers are stripped and never repair Host; a wrong Host is 403 at ingress with zero backend effects', async () => {
    const { s, webPort } = await stack();
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(100));
    const cookie: [string, string] = ['Cookie', `lt_media=${await s.mint()}`];
    const before = JSON.stringify(s.observe());
    const wrong = await wire(webPort, 'GET', `/api/media/${blob.mediaId}/content`, [['Host', 'evil.test:56124'], ['X-Forwarded-Host', PUBLIC], ['Forwarded', `host=${PUBLIC}`], cookie]);
    expect([403, 400]).toContain(wrong.status);
    expect(JSON.stringify(s.observe())).toBe(before);
    const forwarded = await wire(webPort, 'GET', `/api/media/${blob.mediaId}/content`, [['Host', PUBLIC], ['X-Forwarded-Host', 'evil.test'], ['X-Forwarded-For', '203.0.113.9'], ['Forwarded', 'for=203.0.113.9'], cookie]);
    expect(forwarded.status).toBe(200);
  });
});
