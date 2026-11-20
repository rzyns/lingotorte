// lt-192.4 S5/S6: M1-M4 admission and responses against the real service over raw sockets (synthetic library and
// database in a test-owned temporary root). Oracle: contract §4 zero-effect invariant via the observeState seam,
// the library file manifest and the durable revision. Expanded case counts are asserted from execution.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rm, writeFile, chmod, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createMediaSessions } from '../../apps/local-service/src/mediaSessions.ts';
import { seedManagedBlob, insertMediaAsset, insertBlobRow, syntheticBytes, sha256Hex } from '../helpers/managedMediaFixture.ts';
import { barrier, countingFs, dechunk, freePort, startMediaService, treeManifest, until, wire, type MediaService } from '../helpers/lt1924Service.ts';

const posix = process.platform !== 'win32';
// Hundreds of raw-socket requests per test: bounded generously so a loaded full-suite run is not a false timeout.
vi.setConfig({ testTimeout: 30_000 });
const services: MediaService[] = [];
afterEach(async () => {
  while (services.length) { const s = services.pop()!; await s.service.close().catch(() => undefined); await rm(s.root, { recursive: true, force: true }); }
});
async function start(options: Parameters<typeof startMediaService>[0] = {}) { const s = await startMediaService(options); services.push(s); return s; }
const content = (id: string) => `/api/media/${id}/content`;
const storage = (id: string) => `/api/media/${id}/storage`;
const UNKNOWN = '11111111-1111-4111-8111-111111111111';
const otherToken = () => randomBytes(32).toString('base64url');

async function effects(s: MediaService) {
  // A completed 200/206 releases its slot and stream a tick after the client has read the response, so a snapshot
  // taken right after a success can still show them (full-suite load made this visible). Every caller here holds no
  // request open, so wait for quiescence first: a denial that leaked a slot, stream or open still fails (timeout).
  await until(() => { const q = s.observe(); return q.activeMediaSlots === 0 && q.liveMediaStreams === 0 && q.pendingMediaOpens === 0; }, 5000, 'media counters settle to 0');
  const o = s.observe();
  return JSON.stringify({ sessions: o.mediaSessions, slots: o.activeMediaSlots, pending: o.pendingMediaOpens, streams: o.liveMediaStreams, revision: o.state.revision, library: await treeManifest(s.libraryDir!) });
}

describe('lt-192.4 routes absent without a library', () => {
  it('M1-M4 are 404 (HEAD bodyless), status reports unavailable, existing routes unchanged', async () => {
    const s = await start({ library: null });
    let rows = 0;
    for (const [method, path] of [['POST', '/api/media/session'], ['DELETE', '/api/media/session'], ['GET', storage(UNKNOWN)], ['GET', content(UNKNOWN)], ['HEAD', content(UNKNOWN)]] as const) {
      const r = await s.request(method, path, [s.bearer(), ...(method === 'POST' ? [['Content-Type', 'application/json'] as [string, string]] : [])], method === 'POST' ? '{}' : undefined);
      expect(r.status, `${method} ${path}`).toBe(404);
      if (method === 'HEAD') expect(r.body.length).toBe(0);
      expect(r.headers['set-cookie']).toBeUndefined();
      rows++;
    }
    expect(rows).toBe(5);
    const status = JSON.parse(dechunk(await s.request('GET', '/api/status', [s.bearer()])).toString());
    expect(status.managedMedia).toEqual({ available: false });
    expect((await s.request('GET', '/api/state', [s.bearer()])).status).toBe(200);
    expect(s.observe().mediaSessions).toBe(0);
  });
  it('duplicate Cookie/Range/If-Range/Sec-Fetch-Site fields are 400 on existing routes even with a valid bearer', async () => {
    const s = await start({ library: null });
    for (const name of ['Cookie', 'Range', 'If-Range', 'Sec-Fetch-Site']) {
      const r = await s.request('GET', '/api/state', [s.bearer(), [name, 'a=1'], [name, 'a=2']]);
      expect(r.status, name).toBe(400);
    }
    // A single field of each stays harmless on existing routes.
    expect((await s.request('GET', '/api/state', [s.bearer(), ['Cookie', 'a=1'], ['Range', 'bytes=0-1'], ['Sec-Fetch-Site', 'same-site']])).status).toBe(200);
  });
  it('HEAD denials carry no body on the raw socket (405 on existing routes)', async () => {
    const s = await start({ library: null });
    for (const path of ['/api/state', '/api/status', '/api/health']) {
      const r = await s.request('HEAD', path, [s.bearer()]);
      expect(r.status).toBe(405); expect(r.headers.allow?.[0]).toContain('GET'); expect(r.body.length).toBe(0);
    }
  });
});

describe.skipIf(!posix)('lt-192.4 managed media routes (POSIX)', () => {
  it('status reports availability only; M1 mints an HttpOnly SameSite=Strict path cookie; M2 revokes (N22, N24)', async () => {
    const s = await start();
    const status = JSON.parse(dechunk(await s.request('GET', '/api/status', [s.bearer()])).toString());
    expect(status.managedMedia).toEqual({ available: true });
    expect(JSON.stringify(status)).not.toContain(s.root);
    const m1 = await s.request('POST', '/api/media/session', [s.bearer(), ['Content-Type', 'application/json'], ['Origin', s.origin]], '{}');
    expect(m1.status).toBe(204); expect(m1.body.length).toBe(0);
    const cookie = m1.headers['set-cookie']!;
    expect(cookie).toHaveLength(1);
    expect(cookie[0]).toMatch(/^lt_media=[A-Za-z0-9_-]{43}; Path=\/api\/media\/; HttpOnly; SameSite=Strict$/);
    expect(m1.headers['access-control-allow-credentials']).toBeUndefined();
    expect(m1.headers['cache-control']?.[0]).toBe('no-store');
    const value = /^lt_media=([^;]+)/.exec(cookie[0]!)![1]!;
    expect(value).not.toBe(s.capability());
    expect(s.observe().mediaSessions).toBe(1);
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(4096));
    expect((await s.request('GET', content(blob.mediaId), [['Cookie', `lt_media=${value}`]])).status).toBe(200);
    // Pairing still required everywhere else: the cookie is never an API credential (N03).
    // M2 with bearer and the cookie: 204 with an expiring cookie, then the old value replays to 401 (N24).
    const m2 = await s.request('DELETE', '/api/media/session', [s.bearer(), ['Cookie', `lt_media=${value}`]]);
    expect(m2.status).toBe(204);
    expect(m2.headers['set-cookie']).toEqual(['lt_media=; Path=/api/media/; Max-Age=0; HttpOnly; SameSite=Strict']);
    expect(s.observe().mediaSessions).toBe(0);
    const replay = await s.request('GET', content(blob.mediaId), [['Cookie', `lt_media=${value}`]]);
    expect(replay.status).toBe(401); expect(replay.headers['www-authenticate']?.[0]).toBe('Bearer realm="lingotorte-local"');
    // M2 without a presented value is not an error and revokes nothing else.
    const keep = await s.mint();
    expect((await s.request('DELETE', '/api/media/session', [s.bearer()])).status).toBe(204);
    expect((await s.request('GET', content(blob.mediaId), [['Cookie', `lt_media=${keep}`]])).status).toBe(200);
  });

  it('correction R2: M1 rotates the presented lt_media value (old value 401 afterwards); a denied M1 changes nothing', async () => {
    const s = await start();
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(64));
    const old = await s.mint();
    const play = (value: string) => s.request('GET', content(blob.mediaId), [['Cookie', `lt_media=${value}`], ['Range', 'bytes=0-0']]);
    const denied = await s.request('POST', '/api/media/session', [['Content-Type', 'application/json'], ['Cookie', `lt_media=${old}`]], '{}');
    expect(denied.status).toBe(401); expect(denied.headers['set-cookie']).toBeUndefined();
    expect((await play(old)).status).toBe(206);
    const m1 = await s.request('POST', '/api/media/session', [s.bearer(), ['Content-Type', 'application/json'], ['Cookie', `lt_media=${old}`]], '{}');
    expect(m1.status).toBe(204);
    const next = /^lt_media=([A-Za-z0-9_-]{43});/.exec(m1.headers['set-cookie']![0]!)![1]!;
    expect(next).not.toBe(old);
    expect(s.observe().mediaSessions).toBe(1);
    expect((await play(old)).status).toBe(401);
    expect((await play(next)).status).toBe(206);
    // An unknown or malformed presented value rotates nothing else.
    const other = await s.mint();
    await s.request('POST', '/api/media/session', [s.bearer(), ['Content-Type', 'application/json'], ['Cookie', `lt_media=${otherToken()}`]], '{}');
    expect((await play(other)).status).toBe(206);
  });

  it('correction R3: with private delivery unready, M2 is 401 with zero effects and the value stays valid once delivery is ready again (no restart)', async () => {
    let ready = true;
    const s = await start({ runtime: { deliveryReady: async () => ready } });
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(64));
    const value = await s.mint();
    ready = false;
    const m2 = await s.request('DELETE', '/api/media/session', [s.bearer(), ['Cookie', `lt_media=${value}`]]);
    expect(m2.status).toBe(401); expect(m2.headers['set-cookie']).toBeUndefined();
    ready = true;
    expect(s.observe().mediaSessions).toBe(1);
    expect((await s.request('GET', content(blob.mediaId), [['Cookie', `lt_media=${value}`], ['Range', 'bytes=0-0']])).status).toBe(206);
  });

  it('C1: credential x Fetch Metadata x duplicate fields on M4 GET and HEAD, each denial with zero effects', async () => {
    const stale = await start();
    const staleBearer = stale.capability();
    const staleCookie = await stale.mint();
    await stale.service.close();
    const s = await start();
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(2048));
    const good = await s.mint();
    const unknownCookie = createMediaSessions().mint();
    type Cred = { name: string; headers: [string, string][]; expect: 'ok' | 401 };
    const bearer = s.bearer();
    const creds: Cred[] = [
      { name: 'valid bearer', headers: [bearer], expect: 'ok' },
      { name: 'missing-scheme bearer', headers: [['Authorization', s.capability()]], expect: 401 },
      { name: 'malformed bearer', headers: [['Authorization', 'Bearer abc']], expect: 401 },
      { name: 'wrong bearer', headers: [['Authorization', `Bearer ${otherToken()}`]], expect: 401 },
      { name: 'stale bearer', headers: [['Authorization', `Bearer ${staleBearer}`]], expect: 401 },
      { name: 'valid cookie', headers: [['Cookie', `lt_media=${good}`]], expect: 'ok' },
      { name: 'valid cookie among others', headers: [['Cookie', `theme=dark; lt_media=${good}; x=1`]], expect: 'ok' },
      { name: 'unknown cookie', headers: [['Cookie', `lt_media=${unknownCookie}`]], expect: 401 },
      { name: 'stale cookie', headers: [['Cookie', `lt_media=${staleCookie}`]], expect: 401 },
      { name: 'malformed cookie', headers: [['Cookie', 'lt_media=not-a-value']], expect: 401 },
      { name: 'two-pair cookie', headers: [['Cookie', `lt_media=${good}; lt_media=${good}`]], expect: 401 },
      { name: 'other cookie only', headers: [['Cookie', 'theme=dark']], expect: 401 },
      { name: 'valid bearer + valid cookie', headers: [bearer, ['Cookie', `lt_media=${good}`]], expect: 'ok' },
      { name: 'valid bearer + invalid cookie', headers: [bearer, ['Cookie', 'lt_media=bad']], expect: 'ok' },
      { name: 'invalid bearer + valid cookie', headers: [['Authorization', `Bearer ${otherToken()}`], ['Cookie', `lt_media=${good}`]], expect: 401 },
      { name: 'empty Authorization + valid cookie', headers: [['Authorization', ''], ['Cookie', `lt_media=${good}`]], expect: 401 },
      { name: 'no credential', headers: [], expect: 401 },
    ];
    const sites = [undefined, 'same-origin', 'same-site', 'cross-site', 'none'];
    let expanded = 0;
    const secrets = [s.capability(), good, staleBearer, staleCookie];
    for (const method of ['GET', 'HEAD']) {
      for (const cred of creds) {
        for (const site of sites) {
          const before = await effects(s);
          const r = await s.request(method, content(blob.mediaId), [...cred.headers, ...(site ? [['Sec-Fetch-Site', site] as [string, string]] : [])]);
          const expected = site !== undefined && site !== 'same-origin' ? 403 : cred.expect === 'ok' ? 200 : 401;
          expect(r.status, `${method} ${cred.name} site=${site}`).toBe(expected);
          if (method === 'HEAD') expect(r.body.length, `${method} ${cred.name} body`).toBe(0);
          if (expected !== 200) {
            expect(await effects(s), `${method} ${cred.name} site=${site} effects`).toBe(before);
            expect(r.headers['content-range']).toBeUndefined();
            for (const secret of secrets) expect(r.raw.toString('latin1')).not.toContain(secret);
          } else if (method === 'GET') {
            expect(r.body.equals(blob.bytes)).toBe(true);
          }
          expanded++;
        }
        for (const dup of ['Cookie', 'Sec-Fetch-Site', 'Range', 'If-Range']) {
          const before = await effects(s);
          const value = dup === 'Cookie' ? `lt_media=${good}` : dup === 'Sec-Fetch-Site' ? 'same-origin' : dup === 'Range' ? 'bytes=0-1' : `"sha256-${blob.sha256}"`;
          const r = await s.request(method, content(blob.mediaId), [...cred.headers, [dup, value], [dup, value]]);
          expect(r.status, `${method} ${cred.name} duplicate ${dup}`).toBe(400);
          if (method === 'HEAD') expect(r.body.length).toBe(0);
          expect(await effects(s)).toBe(before);
          expanded++;
        }
      }
    }
    expect(expanded).toBe(2 * creds.length * (sites.length + 4));
    // Controls: the duplicates with a valid bearer on /api/state and M3 are 400; same-site with a bearer is not 403 off M4.
    for (const path of ['/api/state', storage(blob.mediaId)]) for (const dup of ['Cookie', 'Sec-Fetch-Site', 'Range', 'If-Range']) {
      expect((await s.request('GET', path, [bearer, [dup, 'x'], [dup, 'y']])).status, `${path} ${dup}`).toBe(400);
    }
    expect((await s.request('GET', '/api/state', [bearer, ['Sec-Fetch-Site', 'same-site']])).status).toBe(200);
    expect((await s.request('GET', storage(blob.mediaId), [bearer, ['Sec-Fetch-Site', 'cross-site']])).status).toBe(200);
    expect((await s.request('POST', '/api/media/session', [bearer, ['Sec-Fetch-Site', 'same-site'], ['Content-Type', 'application/json']], '{}')).status).toBe(204);
    // OPTIONS on M4 is the ordinary preflight, never the Fetch Metadata rule.
    const preflight = await s.request('OPTIONS', content(blob.mediaId), [['Origin', s.origin], ['Access-Control-Request-Method', 'GET'], ['Access-Control-Request-Headers', 'authorization'], ['Sec-Fetch-Site', 'cross-site']]);
    expect(preflight.status).toBe(204);
  }, 60_000);

  it('N03/N04: the cookie is never an API credential; M1/M2 need the bearer and exact envelopes', async () => {
    const s = await start();
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(512));
    const value = await s.mint();
    const cookie: [string, string] = ['Cookie', `lt_media=${value}`];
    const json: [string, string] = ['Content-Type', 'application/json'];
    for (const [method, path, body] of [['GET', '/api/state'], ['GET', '/api/status'], ['GET', storage(blob.mediaId)], ['GET', `/api/media/${blob.mediaId}/transcripts`],
      ['POST', '/api/media/session', '{}'], ['DELETE', '/api/media/session'], ['POST', '/api/jobs', '{"kind":"noop"}'], ['POST', '/api/artifacts/cleanup', '{}']] as const) {
      const before = await effects(s);
      const r = await s.request(method, path, [cookie, ...(body ? [json] : [])], body);
      expect(r.status, `${method} ${path}`).toBe(401);
      expect(r.headers['set-cookie']).toBeUndefined();
      expect(await effects(s)).toBe(before);
    }
    expect((await s.request('GET', content(blob.mediaId), [cookie])).status).toBe(200);
    const envelopes: [string, [string, string][], string, number][] = [
      ['POST', [json], '{"x":1}', 400], ['POST', [json], '[]', 400], ['POST', [json], '', 400], ['POST', [], '{}', 415], ['POST', [['Content-Type', 'text/plain']], '{}', 415],
      ['DELETE', [json], '{}', 415], ['DELETE', [], '{}', 400],
    ];
    for (const [method, headers, body, status] of envelopes) {
      const before = await effects(s);
      const r = await s.request(method, '/api/media/session', [s.bearer(), cookie, ...headers], body);
      expect(r.status, `${method} ${JSON.stringify(headers)} ${body}`).toBe(status);
      expect(r.headers['set-cookie']).toBeUndefined();
      expect(await effects(s)).toBe(before);
    }
    expect((await s.request('GET', content(blob.mediaId), [cookie])).status).toBe(200);
    // Native direct mode: an allowed UI origin that is not this request's own origin cannot mint or revoke (exact
    // same-origin only); its own origin and an absent Origin can.
    const port = await freePort();
    const native = await start({ port, nativeUiOrigins: ['http://127.0.0.1:5173', `http://127.0.0.1:${port}`] });
    for (const method of ['POST', 'DELETE'] as const) {
      const before = await effects(native);
      const r = await native.request(method, '/api/media/session', [native.bearer(), ['Origin', 'http://127.0.0.1:5173'], ...(method === 'POST' ? [json] : [])], method === 'POST' ? '{}' : undefined);
      expect(r.status, method).toBe(403); expect(r.headers['set-cookie']).toBeUndefined(); expect(await effects(native)).toBe(before);
    }
    expect((await native.request('POST', '/api/media/session', [native.bearer(), ['Origin', native.origin], json], '{}')).status).toBe(204);
    expect((await native.request('DELETE', '/api/media/session', [native.bearer()])).status).toBe(204);
  });

  it('N05/N06/N09/N10: authority, Origin, method and target rules run first; no path lookup for bad targets', async () => {
    const { fs, events } = countingFs();
    const s = await start({ fs });
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(256));
    const cookie: [string, string] = ['Cookie', `lt_media=${await s.mint()}`];
    for (const host of ['localhost:' + s.port, 'api:5174', '127.0.0.1:5174', '127.0.0.2:' + s.port]) {
      const r = await wire(s.port, 'GET', content(blob.mediaId), [['Host', host], cookie]); expect(r.status, host).toBe(403);
    }
    const forwarded = await wire(s.port, 'GET', content(blob.mediaId), [['Host', 'api:5174'], ['X-Forwarded-Host', `127.0.0.1:${s.port}`], ['Forwarded', `host=127.0.0.1:${s.port}`], cookie]);
    expect(forwarded.status).toBe(403);
    for (const origin of ['http://evil.example', 'null', 'http://127.0.0.1:5173']) expect((await s.request('GET', content(blob.mediaId), [cookie, ['Origin', origin]])).status, origin).toBe(403);
    expect((await s.request('GET', content(blob.mediaId), [cookie, ['Origin', s.origin]])).status).toBe(200);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const r = await s.request(method, content(blob.mediaId), [s.bearer()]);
      expect(r.status, method).toBe(405); expect(r.headers.allow).toEqual(['GET, HEAD, OPTIONS']);
    }
    expect((await s.request('GET', content(blob.mediaId), [s.bearer(), ['X-HTTP-Method-Override', 'DELETE']])).status).toBe(200);
    const m1 = await s.request('GET', '/api/media/session', [s.bearer()]);
    expect(m1.status).toBe(405); expect(m1.headers.allow).toEqual(['POST, DELETE, OPTIONS']);
    expect((await s.request('HEAD', storage(blob.mediaId), [s.bearer()])).status).toBe(405);
    const opens = events.opens;
    for (const target of [`/api/media/${blob.mediaId.toUpperCase()}/content`, '/api/media/not-a-uuid/content', `/api/media/${blob.mediaId}/../content`, `/api/media/%2e%2e/content`,
      `${content(blob.mediaId)}?x=1`, `/api/media/${blob.mediaId}\\content`, `/api/media/${blob.mediaId}/content/`, `//api/media/${blob.mediaId}/content`, `/api/media/${blob.sha256}/content`]) {
      const r = await s.request('GET', target, [cookie]);
      expect([400, 404], target).toContain(r.status);
    }
    expect(events.opens).toBe(opens);
  });

  it('N11/N13: storage states, full/partial/416 bytes, HEAD always the full representation with zero body bytes', async () => {
    const s = await start();
    const bytes = syntheticBytes(10_000);
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, bytes);
    const cookie: [string, string] = ['Cookie', `lt_media=${await s.mint()}`];
    const etag = `"sha256-${blob.sha256}"`;
    // M3 states.
    const m3 = async (id: string) => { const r = await s.request('GET', storage(id), [s.bearer()]); return { status: r.status, body: r.status === 200 ? JSON.parse(dechunk(r).toString()) : null }; };
    expect(await m3(blob.mediaId)).toEqual({ status: 200, body: { ok: true, state: 'complete', sizeBytes: 10_000, mimeType: 'video/webm' } });
    expect((await m3(UNKNOWN)).status).toBe(404);
    const noBlob = insertMediaAsset(s.config.databasePath, { sha256: sha256Hex(Buffer.from('nothing')), size: 7 });
    expect(await m3(noBlob)).toEqual({ status: 200, body: { ok: true, state: 'none' } });
    const missingSha = sha256Hex(Buffer.from('missing'));
    insertBlobRow(s.config.databasePath, missingSha, 7);
    const missing = insertMediaAsset(s.config.databasePath, { sha256: missingSha, size: 7 });
    expect(await m3(missing)).toEqual({ status: 200, body: { ok: true, state: 'bytes-missing' } });
    const wrongBytes = syntheticBytes(50);
    const wrong = await seedManagedBlob(s.libraryDir!, s.config.databasePath, wrongBytes);
    const db = new (await import('node:sqlite')).DatabaseSync(s.config.databasePath);
    db.prepare('UPDATE managed_media_blob SET size_bytes = 51 WHERE sha256 = ?').run(wrong.sha256); db.close();
    expect(await m3(wrong.mediaId)).toEqual({ status: 200, body: { ok: true, state: 'bytes-missing' } });
    for (const id of [UNKNOWN, noBlob, missing, wrong.mediaId]) {
      const get = await s.request('GET', content(id), [cookie]);
      expect(get.status).toBe(404); expect(dechunk(get).toString()).toBe('{"ok":false,"error":"Media content not found."}');
      const head = await s.request('HEAD', content(id), [cookie]);
      expect(head.status).toBe(404); expect(head.body.length).toBe(0);
    }
    // GET rows.
    const get = (range?: string, ifRange?: string) => s.request('GET', content(blob.mediaId), [cookie, ...(range ? [['Range', range] as [string, string]] : []), ...(ifRange ? [['If-Range', ifRange] as [string, string]] : [])]);
    const full = await get();
    expect(full.status).toBe(200); expect(full.body.equals(bytes)).toBe(true);
    expect(full.headers).toMatchObject({ 'content-length': ['10000'], 'accept-ranges': ['bytes'], etag: [etag], 'content-type': ['video/webm'], 'x-content-type-options': ['nosniff'],
      'cross-origin-resource-policy': ['same-origin'], 'cache-control': ['no-store'] });
    expect(full.headers['content-range']).toBeUndefined(); expect(full.headers['access-control-allow-credentials']).toBeUndefined();
    const partials: [string, number, number][] = [['bytes=0-99', 0, 99], ['bytes=9000-', 9000, 9999], ['bytes=-100', 9900, 9999], ['bytes=9990-99999', 9990, 9999],
      [`bytes=0-${'9'.repeat(30)}`, 0, 9999], [`bytes=-${'9'.repeat(30)}`, 0, 9999], ['BYTES=5-5', 5, 5]];
    for (const [range, a, b] of partials) {
      const r = await get(range);
      expect(r.status, range).toBe(206);
      expect(r.headers['content-range'], range).toEqual([`bytes ${a}-${b}/10000`]);
      expect(r.headers['content-length']).toEqual([String(b - a + 1)]);
      expect(r.body.equals(bytes.subarray(a, b + 1)), range).toBe(true);
    }
    for (const range of ['bytes=10000-', `bytes=${'9'.repeat(30)}-`, 'bytes=-0', 'bytes=10000-10001']) {
      const r = await get(range);
      expect(r.status, range).toBe(416); expect(r.headers['content-range']).toEqual(['bytes */10000']); expect(r.body.length).toBe(0);
    }
    for (const range of ['bytes=5-4', 'bytes=0-1,4-5', 'items=0-1', 'bytes=x-y', 'bytes=']) {
      const r = await get(range); expect(r.status, range).toBe(200); expect(r.body.equals(bytes)).toBe(true);
    }
    expect((await get('bytes=0-1', '"sha256-other"')).status).toBe(200);
    expect((await get('bytes=0-1', etag)).status).toBe(206);
    // HEAD: always 200 + full headers, never 206/416/Content-Range, never a body.
    let heads = 0;
    for (const [range, ifRange] of [[undefined, undefined], ['bytes=0-1', undefined], ['bytes=10000-', undefined], ['bytes=5-4', undefined], ['bytes=-0', undefined],
      ['bytes=0-1,4-5', undefined], ['bytes=0-1', '"sha256-other"'], [`bytes=${'9'.repeat(30)}-`, undefined]] as const) {
      const r = await s.request('HEAD', content(blob.mediaId), [cookie, ...(range ? [['Range', range] as [string, string]] : []), ...(ifRange ? [['If-Range', ifRange] as [string, string]] : [])]);
      expect(r.status, `HEAD ${range}`).toBe(200);
      expect(r.headers['content-length']).toEqual(['10000']); expect(r.headers['content-range']).toBeUndefined();
      expect(r.headers.etag).toEqual([etag]); expect(r.headers['accept-ranges']).toEqual(['bytes']);
      expect(r.body.length).toBe(0);
      heads++;
    }
    expect(heads).toBe(8);
    // HEAD errors: 400 (duplicate), 401, 403, 404, 405 (existing non-HEAD route); all bodyless.
    for (const [headers, status] of [[[cookie, ['Range', 'a'], ['Range', 'b']], 400], [[], 401], [[cookie, ['Sec-Fetch-Site', 'cross-site']], 403]] as const) {
      const r = await s.request('HEAD', content(blob.mediaId), headers as unknown as [string, string][]);
      expect(r.status).toBe(status); expect(r.body.length).toBe(0);
    }
    const head404 = await s.request('HEAD', content(UNKNOWN), [cookie]); expect(head404.status).toBe(404); expect(head404.body.length).toBe(0);
    const head405 = await s.request('HEAD', '/api/state', [s.bearer()]); expect(head405.status).toBe(405); expect(head405.body.length).toBe(0);
    // M4 effects: none (revision, sessions, library unchanged by a GET).
    const before = await effects(s); await get('bytes=0-1'); await until(() => s.observe().activeMediaSlots === 0); expect(await effects(s)).toBe(before);
  });

  it('HEAD 503 is bodyless with Retry-After; GET 503 at the cap; slots return to zero', async () => {
    const gate = barrier();
    const { fs } = countingFs({ open: gate.wait });
    const s = await start({ fs, maxSlots: 1 });
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(64));
    const held = s.request('GET', content(blob.mediaId), [s.bearer()]);
    await until(() => gate.entered() === 1);
    const head = await s.request('HEAD', content(blob.mediaId), [s.bearer()]);
    expect(head.status).toBe(503); expect(head.headers['retry-after']).toEqual(['1']); expect(head.body.length).toBe(0);
    const get = await s.request('GET', content(blob.mediaId), [s.bearer()]);
    expect(get.status).toBe(503); expect(get.headers['retry-after']).toEqual(['1']);
    const m3 = await s.request('GET', storage(blob.mediaId), [s.bearer()]);
    expect(m3.status).toBe(503); expect(m3.headers['retry-after']).toEqual(['1']);
    gate.release();
    expect((await held).status).toBe(200);
    await until(() => s.observe().activeMediaSlots === 0);
  });

  it('N22/N23: restart rotates bearer and cookie together; no secret, path or blob name in responses or logs', async () => {
    const spies = (['log', 'error', 'warn', 'info', 'debug'] as const).map(name => vi.spyOn(console, name));
    try {
      const first = await start();
      const blob = await seedManagedBlob(first.libraryDir!, first.config.databasePath, syntheticBytes(1024));
      const oldBearer = first.capability(); const oldCookie = await first.mint();
      const bodies: string[] = [];
      const collect = async (p: Promise<{ raw: Buffer; headers: Record<string, string[]> }>, allowSetCookie = false) => {
        const r = await p; let text = r.raw.toString('latin1'); if (allowSetCookie) text = text.replace(/set-cookie: lt_media=[^\r\n]*/gi, ''); bodies.push(text); return r;
      };
      await collect(first.request('GET', storage(blob.mediaId), [first.bearer()]));
      await collect(first.request('GET', content(UNKNOWN), [['Cookie', `lt_media=${oldCookie}`]]));
      await collect(first.request('HEAD', content(blob.mediaId), [['Cookie', `lt_media=${oldCookie}`]]));
      await collect(first.request('GET', '/api/status', [first.bearer()]));
      await first.service.close();
      const restarted = await start({ root: first.root, library: first.libraryDir!, port: first.port });
      expect(restarted.capability()).not.toBe(oldBearer);
      const viaOldCookie = await collect(restarted.request('GET', content(blob.mediaId), [['Cookie', `lt_media=${oldCookie}`]]));
      expect(viaOldCookie.headers['www-authenticate']).toBeDefined();
      expect((await restarted.request('GET', content(blob.mediaId), [['Authorization', `Bearer ${oldBearer}`]])).status).toBe(401);
      expect((await restarted.request('GET', content(blob.mediaId), [['Cookie', `lt_media=${oldCookie}`]])).status).toBe(401);
      expect((await restarted.request('GET', content(blob.mediaId), [restarted.bearer()])).status).toBe(200);
      const fresh = await restarted.mint();
      expect(fresh).not.toBe(oldCookie);
      await collect(restarted.request('POST', '/api/media/session', [restarted.bearer(), ['Content-Type', 'application/json']], '{}'), true);
      await collect(restarted.request('GET', storage(blob.mediaId), [restarted.bearer()]));
      const all = bodies.join('\n');
      for (const secret of [oldBearer, oldCookie, restarted.capability(), fresh, restarted.root, restarted.libraryDir!, 'blobs/', blob.path]) expect(all).not.toContain(secret);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      services.splice(services.indexOf(first), 1);
    } finally { for (const spy of spies) spy.mockRestore(); }
  });

  it('missing bytes after startup (blob deleted or replaced by non-regular content) is bytes-missing / 404, never a crash', async () => {
    const s = await start();
    const blob = await seedManagedBlob(s.libraryDir!, s.config.databasePath, syntheticBytes(100));
    await chmod(blob.path, 0o600); await unlink(blob.path);
    expect(JSON.parse(dechunk(await s.request('GET', storage(blob.mediaId), [s.bearer()])).toString()).state).toBe('bytes-missing');
    expect((await s.request('GET', content(blob.mediaId), [s.bearer()])).status).toBe(404);
    await writeFile(blob.path, Buffer.alloc(99), { mode: 0o400 });
    expect(JSON.parse(dechunk(await s.request('GET', storage(blob.mediaId), [s.bearer()])).toString()).state).toBe('bytes-missing');
    expect(s.observe().activeMediaSlots).toBe(0);
  });
});
