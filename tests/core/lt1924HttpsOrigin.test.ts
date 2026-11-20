// lt-192.4 HTTPS-origin prerequisite (docs/dev/lt-192.4-https-qualification.md). The service stays plain HTTP behind
// an operator TLS terminator; the exact configured public origin (http: or https:) is selected by the validated Host
// alone. These raw-socket Node tests prove that mapping: per-request cookie `Secure`, exact same-origin M1/M2 across
// schemes, ignored forwarded/Tailscale headers and the unchanged guards. They are NOT TLS or browser evidence; real
// TLS + Chromium behaviour is proven only by scripts/qualification/lt-192-4/browser-proof.mjs in its HTTPS mode.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preview, type PreviewServer } from 'vite';
import { admit, canonicalAuthority, canonicalOrigin, deny, freezePolicy } from '../../apps/local-service/src/requestAdmission.ts';
import { startLingotorteLocalService } from '../../apps/local-service/src/server.ts';
import { seedManagedBlob, syntheticBytes } from '../helpers/managedMediaFixture.ts';
import { dechunk, freePort, startMediaService, until, wire, type MediaService } from '../helpers/lt1924Service.ts';

const posix = process.platform !== 'win32';
vi.setConfig({ testTimeout: 30_000 });
const HTTPS = 'https://ts.test';
const HTTPS_PORTED = 'https://ts8443.test:8443';
const HTTP = 'http://lan.test:56125';
const PUBLIC = [HTTPS, HTTPS_PORTED, HTTP];
const JSON_TYPE: [string, string] = ['Content-Type', 'application/json'];
// Headers a TLS terminator (or an attacker) might add; none of them may select the scheme, authority or identity.
const SPOOF_HTTPS: [string, string][] = [['X-Forwarded-Proto', 'https'], ['Forwarded', 'for=192.0.2.1;proto=https;host=ts.test'], ['X-Forwarded-Host', 'ts.test'],
  ['X-Forwarded-Port', '443'], ['X-Forwarded-Ssl', 'on'], ['Front-End-Https', 'on'], ['Tailscale-User-Login', 'synthetic@example.invalid'], ['Tailscale-User-Name', 'Synthetic']];
const SPOOF_HTTP: [string, string][] = [['X-Forwarded-Proto', 'http'], ['Forwarded', 'proto=http;host=lan.test:56125'], ['X-Forwarded-Host', 'lan.test:56125'], ['X-Forwarded-Port', '56125'],
  ['Tailscale-User-Login', 'synthetic@example.invalid']];

const services: MediaService[] = [];
let vitePreview: PreviewServer | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  await vitePreview?.close(); vitePreview = undefined;
  while (services.length) { const s = services.pop()!; await s.service.close().catch(() => undefined); await rm(s.root, { recursive: true, force: true }); }
});
/**
 * Fixed-port start on a probed free port. freePort() closes its probe before the service binds, so a parallel test can
 * take the port in between (EADDRINUSE seen once in a full run); retry boundedly on a fresh root, nothing else.
 */
async function startOnFreePort(configFor: (port: number) => { publicOrigins: string[]; uiOrigins: string[]; healthAuthority?: string }) {
  for (let attempt = 1; ; attempt++) {
    const port = await freePort();
    const root = await mkdtemp(join(process.env.LINGOTORTE_SCRATCH_DIR ?? tmpdir(), 'lt-192-4-https-'));
    try {
      const s = await startMediaService({ root, port, config: configFor(port) });
      services.push(s);
      return s;
    } catch (error) {
      await rm(root, { recursive: true, force: true });
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt === 5) throw error;
    }
  }
}
const start = (origins = PUBLIC) => startOnFreePort(port => ({ publicOrigins: origins, uiOrigins: origins, healthAuthority: `127.0.0.1:${port}` }));
const at = (s: MediaService, host: string) => (method: string, path: string, headers: [string, string][] = [], body?: string) => wire(s.port, method, path, [['Host', host], ...headers], body);
const secureSuffix = (secure: boolean) => (secure ? '; Secure' : '');
async function oracle(s: MediaService) {
  await until(() => { const q = s.observe(); return q.activeMediaSlots === 0 && q.liveMediaStreams === 0 && q.pendingMediaOpens === 0; }, 5000, 'media counters settle');
  const o = s.observe(); return JSON.stringify({ sessions: o.mediaSessions, revision: o.state.revision, slots: o.activeMediaSlots });
}

describe('lt-192.4 HTTPS origin configuration (exact http: and https:, no aliases)', () => {
  it('canonicalOrigin accepts exact https origins and keeps every alias/shape refusal', () => {
    for (const good of ['https://ts.test', 'https://ts8443.test:8443', 'https://127.0.0.1:8443', 'https://[::1]:8443', 'http://lan.test:56125']) expect(canonicalOrigin(good)).toBe(good);
    for (const bad of ['https://ts.test:443', 'https://TS.test', 'HTTPS://ts.test', 'https://user@ts.test', 'https://ts.test/', 'https://ts.test/path', 'https://ts.test?x=1',
      'https://ts.test#x', 'https://ts.test.', 'https://*.test', 'https://127.1:8443', 'https://0x7f000001', 'https://127.0.0.1:08443', 'wss://ts.test',
      'ftp://ts.test', 'https:ts.test', 'https:///ts.test', 'http://localhost:80', 'null']) expect(() => canonicalOrigin(bad), bad).toThrow(TypeError);
  });
  it('freezePolicy maps each Host authority to exactly one origin; same-authority different-scheme configurations are refused', () => {
    const policy = freezePolicy(PUBLIC, PUBLIC);
    // https default port: the browser omits :443 in Host; an explicit :443 is the same authority (native Host canonicalizer).
    expect([...policy.authorities].sort()).toEqual(['lan.test:56125', 'ts.test', 'ts.test:443', 'ts8443.test:8443']);
    expect(policy.originByAuthority.get('ts.test')).toBe(HTTPS);
    expect(policy.originByAuthority.get('ts.test:443')).toBe(HTTPS);
    expect(policy.originByAuthority.get('ts8443.test:8443')).toBe(HTTPS_PORTED);
    expect(policy.originByAuthority.get('lan.test:56125')).toBe(HTTP);
    // http default port keeps its existing behaviour: Host `x:80` canonicalizes to `x`.
    expect(canonicalAuthority('lan.test:80')).toBe('lan.test');
    expect(freezePolicy(['http://lan.test'], ['http://lan.test']).originByAuthority.get('lan.test')).toBe('http://lan.test');
    let refusals = 0;
    for (const ambiguous of [['http://ts.test', 'https://ts.test'], ['http://ts.test:443', 'https://ts.test'], ['http://ts.test:8443', 'https://ts.test:8443'], ['https://ts.test:80']]) {
      expect(() => freezePolicy(ambiguous, ambiguous), ambiguous.join(',')).toThrow(TypeError); refusals++;
    }
    expect(refusals).toBe(4);
  });
  it('startup refuses https outside the explicit public profile and ambiguous public sets before delivery or mutable roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lt-192-4-https-'));
    try {
      const base = { host: '127.0.0.1', port: 5174, databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false };
      let deliveries = 0;
      for (const options of [{ uiOrigins: [HTTPS] }, { port: 0, uiOrigins: ['http://127.0.0.1:5173', HTTPS] },
        { publicOrigins: ['http://ts.test', HTTPS], uiOrigins: ['http://ts.test', HTTPS] }, { publicOrigins: ['https://ts.test:80'], uiOrigins: ['https://ts.test:80'] },
        { publicOrigins: [HTTPS], uiOrigins: [HTTP] }, { publicOrigins: [HTTPS], uiOrigins: [HTTPS], privateNetworkOrigins: [HTTPS] }]) {
        await expect(startLingotorteLocalService({ ...base, ...options }, { receiveCapability: () => { deliveries++; } }), JSON.stringify(options)).rejects.toThrow(TypeError);
        expect(await readdir(root)).toEqual([]);
      }
      expect(deliveries).toBe(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('admit layer (defense in depth): M1/M2 compare the whole origin, so an allowlisted same-authority other-scheme Origin is 403', async () => {
    // The service refuses this policy shape at startup (Docker needs public == UI origins); admit must not rely on that.
    const policy = freezePolicy([HTTPS], [HTTPS, 'http://ts.test'], undefined, [], { managedMedia: true });
    const capability = randomBytes(32);
    const server = createServer((request, response) => {
      admit(request, response, policy, capability, async () => true).then(admitted => { response.writeHead(204, { 'x-public-origin': admitted.publicOrigin ?? '' }); response.end(); }, error => deny(response, error));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const bearer: [string, string] = ['Authorization', `Bearer ${capability.toString('base64url')}`];
      const m1 = (origin: string) => wire(port, 'POST', '/api/media/session', [['Host', 'ts.test'], bearer, JSON_TYPE, ['Origin', origin]], '{}');
      expect((await m1('http://ts.test')).status).toBe(403);
      expect((await wire(port, 'DELETE', '/api/media/session', [['Host', 'ts.test'], bearer, ['Origin', 'http://ts.test']])).status).toBe(403);
      const ok = await m1(HTTPS);
      expect(ok.status).toBe(204); expect(ok.headers['x-public-origin']).toEqual([HTTPS]);
      // Another route keeps the independent allowlist rule for the same Origin.
      expect((await wire(port, 'GET', '/api/state', [['Host', 'ts.test:443'], bearer, ['Origin', 'http://ts.test']])).headers['x-public-origin']).toEqual([HTTPS]);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});

describe.skipIf(!posix)('lt-192.4 HTTPS origin runtime (plain HTTP behind a TLS terminator; Node raw sockets, not TLS evidence)', () => {
  it('M1/M2 Set-Cookie Secure follows the origin mapped from each request Host, not the first public origin or forwarded headers', async () => {
    const s = await start();
    let rows = 0;
    for (const [host, origin, secure] of [['ts.test', HTTPS, true], ['ts.test:443', HTTPS, true], ['TS.TEST', undefined, true], ['ts8443.test:8443', HTTPS_PORTED, true],
      ['ts8443.test:8443', undefined, true], ['lan.test:56125', HTTP, false], ['lan.test:56125', undefined, false]] as const) {
      const request = at(s, host);
      const originHeader: [string, string][] = origin ? [['Origin', origin]] : [];
      for (const spoof of [[], secure ? SPOOF_HTTP : SPOOF_HTTPS]) {
        const m1 = await request('POST', '/api/media/session', [s.bearer(), JSON_TYPE, ...originHeader, ...spoof], '{}');
        expect(m1.status, `${host} ${origin}`).toBe(204);
        expect(m1.headers['set-cookie']).toHaveLength(1);
        expect(m1.headers['set-cookie']![0], `${host} ${origin} spoof=${spoof.length}`).toMatch(new RegExp(`^lt_media=[A-Za-z0-9_-]{43}; Path=/api/media/; HttpOnly; SameSite=Strict${secureSuffix(secure)}$`));
        const value = /^lt_media=([^;]+)/.exec(m1.headers['set-cookie']![0]!)![1]!;
        const m2 = await request('DELETE', '/api/media/session', [s.bearer(), ['Cookie', `lt_media=${value}`], ...originHeader, ...spoof]);
        expect(m2.status).toBe(204);
        expect(m2.headers['set-cookie']).toEqual([`lt_media=; Path=/api/media/; Max-Age=0; HttpOnly; SameSite=Strict${secureSuffix(secure)}`]);
        rows++;
      }
    }
    expect(rows).toBe(14);
    expect(s.observe().mediaSessions).toBe(0);
  });

  it('M1/M2 refuse a configured origin of another scheme or authority (403, no Set-Cookie, zero effects), even though both are allowlisted', async () => {
    const s = await start();
    const held = await s.mint();
    let rows = 0;
    for (const [host, origin] of [['ts.test', HTTP], ['ts.test:443', HTTP], ['lan.test:56125', HTTPS], ['lan.test:56125', HTTPS_PORTED], ['ts.test', HTTPS_PORTED], ['ts8443.test:8443', HTTPS],
      // Not configured at all: the wrong-scheme twin of a configured authority and noncanonical spellings.
      ['ts.test', 'http://ts.test'], ['ts.test', 'https://ts.test:443'], ['lan.test:56125', 'https://lan.test:56125'], ['lan.test:56125', 'null']] as const) {
      for (const spoof of [[], SPOOF_HTTPS, SPOOF_HTTP]) {
        const before = await oracle(s);
        const m1 = await at(s, host)('POST', '/api/media/session', [s.bearer(), JSON_TYPE, ['Origin', origin], ...spoof], '{}');
        const m2 = await at(s, host)('DELETE', '/api/media/session', [s.bearer(), ['Cookie', `lt_media=${held}`], ['Origin', origin], ...spoof]);
        for (const r of [m1, m2]) { expect(r.status, `${host} ${origin}`).toBe(403); expect(r.headers['set-cookie']).toBeUndefined(); }
        expect(await oracle(s)).toBe(before);
        rows++;
      }
    }
    expect(rows).toBe(30);
    // The held value survived every refused M2.
    expect((await at(s, 'ts.test')('HEAD', '/api/media/00000000-0000-4000-8000-000000000000/content', [['Cookie', `lt_media=${held}`]])).status).toBe(404);
  });

  it('other routes keep their independent Host/Origin allowlists; the health authority stays separate', async () => {
    const s = await start();
    // Unchanged existing rule: a bearer request from any allowlisted UI origin to any public authority (exact CORS grant).
    const cross = await at(s, 'ts.test')('GET', '/api/state', [s.bearer(), ['Origin', HTTP]]);
    expect(cross.status).toBe(200); expect(cross.headers['access-control-allow-origin']).toEqual([HTTP]);
    for (const origin of ['http://ts.test', 'https://ts.test:443', 'https://lan.test:56125']) {
      const r = await at(s, 'ts.test')('GET', '/api/state', [s.bearer(), ['Origin', origin]]);
      expect(r.status, origin).toBe(403); expect(r.headers['access-control-allow-origin']).toBeUndefined();
    }
    for (const host of ['ts.test:8443', 'ts8443.test', 'lan.test', 'lan.test:443', 'api:5174', `127.0.0.1:${s.port}`]) {
      expect((await at(s, host)('GET', '/api/state', [s.bearer()])).status, host).toBe(403);
      expect((await at(s, host)('POST', '/api/media/session', [s.bearer(), JSON_TYPE], '{}')).status, host).toBe(403);
    }
    expect((await at(s, `127.0.0.1:${s.port}`)('GET', '/api/health')).status).toBe(200);
    expect((await at(s, 'ts.test')('OPTIONS', '/api/media/session', [['Origin', HTTPS], ['Access-Control-Request-Method', 'POST'], ['Access-Control-Request-Headers', 'authorization, content-type']])).status).toBe(204);
    expect(s.observe().mediaSessions).toBe(0);
  });

  it('M4 under the https authority: cookie GET/HEAD/Range, Fetch Metadata, no invalid-bearer fallback, duplicate fields', async () => {
    const s = await start();
    const bytes = syntheticBytes(40_000);
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, bytes);
    const path = `/api/media/${blob.mediaId}/content`;
    const https = at(s, 'ts.test');
    const m1 = await https('POST', '/api/media/session', [s.bearer(), JSON_TYPE, ['Origin', HTTPS]], '{}');
    const cookie: [string, string] = ['Cookie', /^(lt_media=[^;]+)/.exec(m1.headers['set-cookie']![0]!)![1]!];
    const ranged = await https('GET', path, [cookie, ['Range', 'bytes=100-199'], ['Sec-Fetch-Site', 'same-origin'], ...SPOOF_HTTP]);
    expect(ranged.status).toBe(206); expect(ranged.headers['content-range']).toEqual(['bytes 100-199/40000']);
    expect(dechunk(ranged).equals(bytes.subarray(100, 200))).toBe(true);
    const head = await https('HEAD', path, [cookie, ['Range', 'bytes=0-1']]);
    expect(head.status).toBe(200); expect(head.headers['content-length']).toEqual(['40000']); expect(head.body.length).toBe(0);
    const before = await oracle(s);
    expect((await https('GET', path, [cookie, ['Sec-Fetch-Site', 'same-site']])).status).toBe(403);
    expect((await https('GET', path, [cookie, ['Authorization', 'Bearer invalid']])).status).toBe(401);
    expect((await https('GET', path, [])).status).toBe(401);
    expect((await https('GET', path, [cookie, cookie])).status).toBe(400);
    expect((await at(s, 'lan.test:56125')('GET', path, [cookie, ['Range', 'bytes=0-0']])).status).toBe(206); // cookies are not isolated by port/scheme (accepted limit)
    expect((await at(s, 'ts.test:8443')('GET', path, [cookie])).status).toBe(403);
    expect(await oracle(s)).toBe(before);
  });

  it('through the real Vite preview ingress (HTTP hop behind TLS): exact https Host admitted, forwarded headers stripped, Secure unchanged', async () => {
    const s = await startOnFreePort(() => ({ publicOrigins: [HTTPS, HTTP], uiOrigins: [HTTPS, HTTP] }));
    vi.stubEnv('LINGOTORTE_API_PROXY_TARGET', `http://127.0.0.1:${s.port}`);
    vi.stubEnv('LINGOTORTE_PUBLIC_ORIGINS', `${HTTPS},${HTTP}`);
    vi.stubEnv('LINGOTORTE_WEB_ALLOWED_HOSTS', 'ts.test,lan.test');
    const outDir = join(s.root, 'web'); await mkdir(outDir); await writeFile(join(outDir, 'index.html'), '<!doctype html><title>Synthetic preview</title>');
    vitePreview = await preview({ configFile: 'vite.config.ts', build: { outDir }, preview: { port: 0, strictPort: false }, logLevel: 'silent' });
    const webPort = (vitePreview.httpServer!.address() as { port: number }).port;
    const via = (host: string) => (method: string, path: string, headers: [string, string][] = [], body?: string) => wire(webPort, method, path, [['Host', host], ...headers], body);
    for (const host of ['ts.test', 'ts.test:443']) {
      const m1 = await via(host)('POST', '/api/media/session', [s.bearer(), JSON_TYPE, ['Origin', HTTPS], ...SPOOF_HTTP], '{}');
      expect(m1.status, host).toBe(204); expect(m1.headers['set-cookie']![0]).toMatch(/; HttpOnly; SameSite=Strict; Secure$/);
    }
    const lan = await via('lan.test:56125')('POST', '/api/media/session', [s.bearer(), JSON_TYPE, ['Origin', HTTP], ...SPOOF_HTTPS], '{}');
    expect(lan.status).toBe(204); expect(lan.headers['set-cookie']![0]).toMatch(/; HttpOnly; SameSite=Strict$/);
    expect((await via('ts.test')('POST', '/api/media/session', [s.bearer(), JSON_TYPE, ['Origin', HTTP]], '{}')).status).toBe(403);
    expect((await via('ts.test:8443')('GET', '/api/state', [s.bearer()])).status).toBe(403);
    expect(s.observe().mediaSessions).toBe(3);
  });
});
