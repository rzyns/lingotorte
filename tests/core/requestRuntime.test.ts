import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { request, Server, type IncomingMessage } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createServer as createSocketServer, connect } from 'node:net';

function wire(origin: string, message: string) {
  return new Promise<string>((resolve, reject) => {
    const url = new URL(origin); let response = '';
    const socket = connect(Number(url.port), url.hostname, () => socket.end(message));
    socket.setTimeout(3000, () => socket.destroy(new Error('Raw socket timeout')));
    socket.on('data', bytes => { response += bytes.toString(); });
    socket.on('error', reject); socket.on('close', () => resolve(response));
  });
}
import { DatabaseSync } from 'node:sqlite';
import { startLingotorteLocalService } from '../../apps/local-service/src/server.ts';
import { SqliteLocalPersistence } from '../../packages/storage/src/sqliteLocalPersistence.ts';
import { makeMediaAsset } from '../../packages/domain/src/index.ts';
import { createEmptyLocalStoreSnapshot } from '../../packages/storage/src/index.ts';
import { canonicalAuthority, canonicalOrigin } from '../../apps/local-service/src/requestAdmission.ts';

async function fixture() { const root = await mkdtemp(join(tmpdir(), 'lt-sor-runtime-')); return { root, config: { host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'), scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false } }; }
async function manifest(root: string): Promise<unknown> {
  const result: Record<string, string> = {};
  const visit = async (dir: string) => { for (const entry of await readdir(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) await visit(path); else if (entry.isFile()) result[path.slice(root.length)] = createHash('sha256').update(await readFile(path)).digest('hex'); } };
  await visit(root); return result;
}
function raw(origin: string, path: string, method = 'GET', headers: string[] = [], body?: string) {
  return new Promise<{ status: number; body: string; continues: number; headers: Record<string, unknown> }>((resolve, reject) => {
    let continues = 0;
    const req = request(origin, { path, method, headers }, response => { let data = ''; response.on('data', chunk => { data += chunk; }); response.on('end', () => resolve({ status: response.statusCode!, body: data, continues, headers: response.headers })); });
    req.on('continue', () => continues++); req.on('error', reject); req.end(body);
  });
}
async function settle() { await new Promise(resolve => setTimeout(resolve, 10)); }

describe('runtime startup, owner fences and seeded dispatch qualification', () => {
  it('native Node strip-only CLI imports the admission module without a transpiler', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import('./apps/local-service/src/requestAdmission.ts').then(m=>{if(new m.AdmissionError(401).status!==401)process.exitCode=1})"], { encoding: 'utf8' });
    expect(result.status).toBe(0); expect(result.stderr).toBe('');
  });
  it('rejects every transport class during both post-bind checkpoints, never replays, and preserves preexisting roots on injected failures', async () => {
    let expanded = 0;
    for (const failureStage of [undefined, 'bound', 'authority-frozen', 'resources-ready'] as const) {
      const { root, config } = await fixture();
      await mkdir(config.scratchDir); await writeFile(join(config.scratchDir, 'sentinel'), 'preserve');
      let token = ''; let lastPort = 0; let observe: (() => any) | undefined;
      const startup = startLingotorteLocalService(config, { receiveCapability: value => { token = value; }, observeState: read => { observe = read; }, startupCheckpoint: async (stage, port) => {
        lastPort = port;
        const before = JSON.stringify(await manifest(root));
        const origin = `http://127.0.0.1:${port}`;
        const base = ['Host', `127.0.0.1:${port}`, 'Authorization', `Bearer ${token}`];
        const cases = [
          { path: '/api/health' }, { path: '/api/status' }, { path: '/api/state' },
          { path: '/api/jobs/11111111-1111-4111-8111-111111111111' },
          { path: '/api/snippets/11111111-1111-4111-8111-111111111111' },
          { path: '/api/jobs/11111111-1111-4111-8111-111111111111/cancel', method: 'POST', extra: ['Content-Type', 'application/json'], body: '{}' },
          { path: '/api/snippets/11111111-1111-4111-8111-111111111111', method: 'DELETE' },
          { path: '/api/jobs', method: 'POST', extra: ['Content-Type', 'application/json'], body: '{"kind":"noop"}' },
          { path: '/api/state', method: 'PUT', extra: ['Content-Type', 'application/json'], body: '{}' },
          { path: '/api/artifacts/cleanup', method: 'POST', extra: ['Content-Type', 'application/json'], body: '{}' },
          { path: '/api/state', method: 'OPTIONS', extra: ['Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', 'GET', 'Access-Control-Request-Headers', 'authorization'] },
          { path: '/api/jobs', method: 'POST', extra: ['Content-Type', 'application/json', 'Expect', '100-continue'], body: '{"kind":"noop"}' },
        ];
        for (const row of cases) { const response = await raw(origin, row.path, row.method, [...base, ...(row.extra ?? [])], row.body); expect(response.status).toBe(503); expect(response.body).toBe(''); expect(response.continues).toBe(0); expanded++; }
        await settle(); expect(JSON.stringify(await manifest(root))).toBe(before);
        if (stage !== 'resources-ready') expect(await readdir(root)).toEqual(['scratch']);
        else expect(observe!().jobs).toEqual([]);
        if (stage === failureStage) throw new Error('Injected startup checkpoint failure');
      } });
      if (failureStage) { await expect(startup).rejects.toThrow('Injected'); await expect(fetch(`http://127.0.0.1:${lastPort}/api/health`)).rejects.toThrow(); expect(await readFile(join(config.scratchDir, 'sentinel'), 'utf8')).toBe('preserve'); expect(await readdir(config.scratchDir)).toEqual(['sentinel']); }
      else { const service = await startup; expect((await raw(service.origin, '/api/health', 'GET', ['Host', new URL(service.origin).host])).status).toBe(200); expect(observe!().jobs).toEqual([]); await service.close(); }
      await rm(root, { recursive: true, force: true });
    }
    console.info(JSON.stringify({ startupIntervalRequests: expanded, injectedFailures: 3, replayedJobs: 0 }));
  });

  it('rechecks receiver loss after a paused JSON body before allocating a job', async () => {
    const { root, config } = await fixture(); let token = ''; let ready = true; let observe: (() => any) | undefined;
    const service = await startLingotorteLocalService(config, { receiveCapability: value => { token = value; }, deliveryReady: async () => ready, observeState: read => { observe = read; } });
    try {
      const before = JSON.stringify(observe!());
      const response = new Promise<number>((resolve, reject) => {
        const req = request(service.origin, { path: '/api/jobs', method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', expect: '100-continue' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
        req.on('error', reject); req.on('continue', () => { ready = false; req.end('{"kind":"noop"}'); }); req.flushHeaders();
      });
      expect(await response).toBe(503); expect(JSON.stringify(observe!())).toBe(before);
      ready = true;
      expect((await raw(service.origin, '/api/jobs', 'POST', ['Host', new URL(service.origin).host, 'Authorization', `Bearer ${token}`, 'Content-Type', 'application/json'], '{"kind":"noop"}')).status).toBe(201);
    } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
  });

  it('initialization rollback preserves an existing durable snapshot, scratch and model sentinels', async () => {
    const { root, config } = await fixture();
    await mkdir(config.scratchDir); await mkdir(config.modelCacheDir);
    await writeFile(join(config.scratchDir, 'unowned'), 'scratch sentinel'); await writeFile(join(config.modelCacheDir, 'unowned'), 'model sentinel');
    const persistence = SqliteLocalPersistence.open(config.databasePath);
    const snapshot = createEmptyLocalStoreSnapshot();
    const media = makeMediaAsset({ title: 'Synthetic existing learner sentinel', originalPath: 'synthetic.webm', contentSha256: `sha256:${'1'.repeat(64)}`, durationMs: 1, container: 'webm', sizeBytes: 1, privacyLabel: 'synthetic' });
    snapshot.mediaAssets[media.id] = media;
    persistence.saveSnapshot(snapshot, '2026-01-01T00:00:00.000Z', persistence.loadVersionedSnapshot().revision);
    const before = persistence.loadVersionedSnapshot(); persistence.close();
    let port = 0;
    await expect(startLingotorteLocalService(config, { receiveCapability: () => {}, startupCheckpoint: (stage, actualPort) => { port = actualPort; if (stage === 'resources-ready') throw new Error('Injected initialization failure'); } })).rejects.toThrow('Injected');
    await expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
    const reopened = SqliteLocalPersistence.open(config.databasePath); try { expect(reopened.loadVersionedSnapshot()).toEqual(before); } finally { reopened.close(); }
    expect(await readdir(config.scratchDir)).toEqual(['unowned']); expect(await readFile(join(config.modelCacheDir, 'unowned'), 'utf8')).toBe('model sentinel');
    await rm(root, { recursive: true, force: true });
  });

  it('fixed-port policy preflight refuses before delivery, listeners or mutable roots', async () => {
    const { root, config } = await fixture(); let deliveries = 0;
    for (const options of [
      { publicOrigins: [] }, { publicOrigins: ['http://*.invalid'] }, { publicOrigins: ['http://public.test'], uiOrigins: ['http://different.test'] },
      { publicOrigins: ['http://public.test'], uiOrigins: ['http://public.test'], privateNetworkOrigins: ['http://public.test'] },
      { publicOrigins: ['http://public.test'], uiOrigins: ['http://public.test'], healthAuthority: 'api:5174' }, { uiOrigins: ['http://127.1:5173'] },
    ]) {
      await expect(startLingotorteLocalService({ ...config, port: 5174, ...options }, { receiveCapability: () => { deliveries++; } })).rejects.toThrow();
      expect(await readdir(root)).toEqual([]); expect(deliveries).toBe(0);
    }
    await rm(root, { recursive: true, force: true });
  });

  it('compares full seeded snapshot/revision/tables/files/LRU/worker oracles for admission denial and releases a still-owned paused worker', async () => {
    const { root, config } = await fixture();
    // Passive boundary observation: retain only envelope fields, never authorization.
    const zeroEnvelopes: { method: string; path: string; fields: string[] }[] = [];
    const originalEmit = Server.prototype.emit;
    const boundarySpy = vi.spyOn(Server.prototype, 'emit').mockImplementation(function (this: Server, event, ...args) {
      if (event === 'request') {
        const incoming = args[0] as IncomingMessage;
        if (incoming.headers['content-length'] === '0' && ['GET', 'DELETE'].includes(incoming.method ?? '')) {
          const fields: string[] = [];
          for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
            if (['content-length', 'content-type', 'transfer-encoding'].includes(incoming.rawHeaders[i]!.toLowerCase())) fields.push(incoming.rawHeaders[i]!, incoming.rawHeaders[i + 1]!);
          }
          zeroEnvelopes.push({ method: incoming.method!, path: incoming.url!, fields });
        }
      }
      return originalEmit.call(this, event, ...args);
    });
    const other = await fixture(); let otherToken = '';
    const otherService = await startLingotorteLocalService(other.config, { receiveCapability: value => { otherToken = value; } });
    const mediaPath = join(root, 'synthetic.mkv'); await writeFile(mediaPath, 'synthetic');
    let token = ''; let observe: (() => any) | undefined; let calls = 0; let providerCalls = 0;
    let pause = false; let release!: () => void; let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }); const running = new Promise<void>(resolve => { started = resolve; });
    const saveSpy = vi.spyOn(SqliteLocalPersistence.prototype, 'saveSnapshot');
    const service = await startLingotorteLocalService(config, { receiveCapability: value => { token = value; }, observeState: read => { observe = read; },
      commandRunner: async (command, args) => {
        calls++; if (pause) { started(); await gate; }
        if (command === 'ffprobe') return { exitCode: 0, stderr: '', stdout: '{"streams":[]}' };
        if (command === 'ffmpeg') { await writeFile(args.at(-1)!, args.includes('srt') ? '1\n00:00:00,000 --> 00:00:01,000\nSynthetic cue\n' : 'RIFF-synthetic-wave'); return { exitCode: 0, stderr: '', stdout: '' }; }
        return { exitCode: 0, stderr: '', stdout: '{"engine":"faster-whisper","model_name":"base","language":"en","segments":[{"start":0,"end":1,"text":"Synthetic cue"}]}' };
      }, fetchImpl: async () => { providerCalls++; throw new Error('Unexpected fake provider'); }, elevenLabsHttpClient: async () => { providerCalls++; throw new Error('Unexpected fake provider'); },
    });
    const auth = ['Host', new URL(service.origin).host, 'Authorization', `Bearer ${token}`];
    const browserAuth = [...auth, 'Origin', 'http://127.0.0.1:5173'];
    const json = [...browserAuth, 'Content-Type', 'application/json'];
    const submit = async (kind: string, payload: unknown = {}) => { const result = await raw(service.origin, '/api/jobs', 'POST', json, JSON.stringify({ kind, payload })); expect(result.status).toBe(201); return JSON.parse(result.body).job.id as string; };
    const poll = async (id: string) => { for (let attempt = 0; attempt < 100; attempt++) { const job = JSON.parse((await raw(service.origin, `/api/jobs/${id}`, 'GET', auth)).body).job; if (['completed', 'failed'].includes(job.status)) return job; await settle(); } throw new Error('Fake job did not settle'); };
    const database = new DatabaseSync(config.databasePath, { readOnly: true });
    const tables = () => (database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map(({ name }) => [name, database.prepare(`SELECT * FROM "${name}"`).all()]);
    const oracle = async () => JSON.stringify({ state: observe!(), tables: tables(), saves: saveSpy.mock.calls.length, calls, providerCalls, files: await manifest(root) });
    try {
      let revision = JSON.parse((await raw(service.origin, '/api/state', 'GET', auth)).body).revision;
      const seededSnapshot = createEmptyLocalStoreSnapshot();
      const seededMedia = makeMediaAsset({ title: 'Private synthetic state sentinel', originalPath: 'synthetic.webm', contentSha256: `sha256:${'1'.repeat(64)}`, durationMs: 1, container: 'webm', sizeBytes: 1, privacyLabel: 'synthetic' });
      seededSnapshot.mediaAssets[seededMedia.id] = seededMedia;
      const saved = await raw(service.origin, '/api/state', 'PUT', json, JSON.stringify({ expectedRevision: revision, snapshot: seededSnapshot }));
      expect(saved.status).toBe(200); expect(saveSpy).toHaveBeenCalledTimes(1); expect(JSON.parse(saved.body).revision).not.toBe(revision); revision = JSON.parse(saved.body).revision;
      const waiting = await submit('waiting');
      const snippetJob = await poll(await submit('source-audio-snippet', { mediaPath, startMs: 0, endMs: 1 }));
      expect(snippetJob.status).toBe('completed'); const snippet = snippetJob.result.url;
      expect((await raw(service.origin, snippet, 'GET', auth)).body).toBe('RIFF-synthetic-wave');
      for (const path of ['/api/status', '/api/state', `/api/jobs/${waiting}`, snippet]) {
        const positive = await raw(service.origin, path, 'GET', browserAuth); expect(positive.status).toBe(200);
        expect(positive.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
        if (path === snippet) { expect(positive.body).toBe('RIFF-synthetic-wave'); expect(positive.headers['content-type']).toContain('audio/wav'); }
      }
      const zeroGetPaths = ['/api/status', '/api/state', `/api/jobs/${waiting}`, snippet];
      for (const path of zeroGetPaths) {
        const expected = JSON.parse(await oracle());
        const positive = await raw(service.origin, path, 'GET', [...browserAuth, 'Content-Length', '0']);
        expect(positive.status).toBe(200);
        expect(positive.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
        if (path === snippet) {
          expect(positive.body).toBe('RIFF-synthetic-wave');
          expect(positive.headers['content-type']).toContain('audio/wav');
          expected.state.snippetAccessCounter++;
          expected.state.snippets.find(([id]: [string]) => id === snippetJob.result.snippetId)[1].lastAccess = expected.state.snippetAccessCounter;
        } else if (path === '/api/state') {
          expect(JSON.parse(positive.body).snapshot).toEqual(seededSnapshot);
          expect(JSON.parse(positive.body).revision).toBe(revision);
        } else if (path.startsWith('/api/jobs/')) expect(JSON.parse(positive.body).job.id).toBe(waiting);
        else expect(JSON.parse(positive.body).ok).toBe(true);
        await settle(); expect(JSON.parse(await oracle())).toEqual(expected);
        expect(zeroEnvelopes.at(-1)).toEqual({ method: 'GET', path, fields: ['Content-Length', '0'] });
      }
      const routes = [
        { path: '/api/status', method: 'GET' }, { path: '/api/state', method: 'GET' }, { path: `/api/jobs/${waiting}`, method: 'GET' }, { path: snippet, method: 'GET' },
        { path: '/api/state', method: 'PUT', body: JSON.stringify({ expectedRevision: revision, snapshot: createEmptyLocalStoreSnapshot() }) },
        { path: `/api/jobs/${waiting}/cancel`, method: 'POST', body: '{}' }, { path: snippet, method: 'DELETE' }, { path: '/api/artifacts/cleanup', method: 'POST', body: '{}' },
        ...Object.entries({ waiting: {}, noop: {}, 'local-transcription': { mediaPath, alignWords: false }, 'elevenlabs-scribe': { mediaPath, allowOnlineProvider: true }, 'youtube-caption': { url: 'https://www.youtube.com/watch?v=abcdefghijk', language: 'en', allowPublicRead: true }, 'embedded-subtitle-list': { mediaPath }, 'embedded-subtitle-extract': { mediaPath, streamIndex: 0, outputFormat: 'srt', role: 'target', language: 'en' }, 'source-audio-snippet': { mediaPath, startMs: 0, endMs: 1 } }).map(([kind, payload]) => ({ path: '/api/jobs', method: 'POST', body: JSON.stringify({ kind, payload }) })),
      ];
      const faults = [
        { status: 401, header: ['Host', new URL(service.origin).host, 'Authorization', `Bearer ${otherToken}`] },
        ...['Basic abc', 'bearer abc', 'Bearer abc', `Bearer ${'A'.repeat(44)}`, `Bearer ${'!'.repeat(43)}`, `Bearer ${'A'.repeat(42)}=`].map(value => ({ status: 401, header: ['Host', new URL(service.origin).host, 'Authorization', value] })),
        ...['http://127.0.0.1:5173/', 'http://127.0.0.1:5173/path'].map(value => ({ status: 403, header: [...auth, 'Origin', value] })),
        { status: 400, header: [...auth, 'Origin', 'not-an-origin'] },
        ...['127.0.0.1:1', 'localhost:5174', 'rebind.invalid:5174'].map(value => ({ status: 403, header: ['Host', value, 'Authorization', `Bearer ${token}`] })),
        { status: 401, header: ['Host', new URL(service.origin).host, 'Origin', 'http://127.0.0.1:5173', 'Referer', 'http://127.0.0.1:5173/', 'Sec-Fetch-Site', 'same-origin', 'Forwarded', `host=${new URL(service.origin).host}`, 'X-Forwarded-Host', new URL(service.origin).host] },
        { status: 401, header: ['Host', new URL(service.origin).host] },
        { status: 401, header: ['Host', new URL(service.origin).host, 'Authorization', `Bearer ${'A'.repeat(43)}`] },
        { status: 403, header: [...auth, 'Origin', 'http://foreign.invalid'] },
        { status: 403, header: [...auth, 'Origin', 'null'] },
        { status: 403, header: ['Host', 'api:5174', 'Authorization', `Bearer ${token}`, 'Forwarded', `host=${new URL(service.origin).host}`, 'X-Forwarded-Host', new URL(service.origin).host] },
        { status: 400, header: [...auth, 'Host', new URL(service.origin).host] },
        { status: 400, header: [...auth, 'Origin', 'http://127.0.0.1:5173', 'Origin', 'http://127.0.0.1:5173'] },
        { status: 400, header: [...auth, 'Authorization', `Bearer ${token}`] },
        { status: 403, header: [...auth, 'Origin', 'https://127.0.0.1:5173'] },
        { status: 403, header: [...auth, 'Origin', 'http://127.0.0.1:4173'] },
        { status: 403, header: [...auth, 'Origin', 'http://localhost:5173'] },
        { status: 400, header: [...auth, 'Origin', 'http://127.0.0.1:5173 http://foreign.invalid'] },
        { status: 400, header: [...auth, 'Content-Type', 'application/json', 'Content-Type', 'application/json'] },
        { status: 400, header: ['Host', '127.1:5174', 'Authorization', `Bearer ${token}`] },
        { status: 400, header: ['Host', 'localhost.:5174', 'Authorization', `Bearer ${token}`] },
      ];
      let expanded = 0;
      for (const fault of faults) for (const row of routes) { const before = await oracle(); const result = await raw(service.origin, row.path, row.method, [...fault.header, ...(row.body ? ['Content-Type', 'application/json'] : [])], row.body); expect(result.status).toBe(fault.status); expect(result.body).not.toContain(token); expect(result.body).not.toContain('Synthetic cue'); expect(result.body).not.toContain('snapshot'); await settle(); expect(await oracle()).toBe(before); expanded++; }
      // Raw parser failures use the same seeded dispatch oracle, not empty fixtures.
      const authority = new URL(service.origin).host;
      const prefix = `POST /api/jobs HTTP/1.1\r\nHost: ${authority}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nConnection: close\r\n`;
      const malformed = [
        `GET /api/state HTTP/1.1\r\nAuthorization: Bearer ${token}\r\nConnection: close\r\n\r\n`,
        `${prefix}Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}`,
        `${prefix}Content-Length: 2\r\nContent-Length: 3\r\n\r\n{}`,
        `${prefix}Content-Length: 2\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n`,
        `${prefix}Transfer-Encoding: chunked\r\n\r\nZ\r\n{}\r\n0\r\n\r\n`,
      ];
      for (const message of malformed) { const before = await oracle(); const reply = await wire(service.origin, message); expect(reply).toMatch(/^HTTP\/1\.1 400 /); expect(reply).not.toContain(token); expect(reply).not.toContain('Private synthetic'); await settle(); expect(await oracle()).toBe(before); expanded++; }
      const beforeConnect = await oracle(); const connectReply = await wire(service.origin, `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\nAuthorization: Bearer ${token}\r\n\r\n`); expect(connectReply).toBe(''); expect(await oracle()).toBe(beforeConnect); expanded++;
      for (const row of routes) {
        const before = await oracle();
        for (const method of ['HEAD', 'TRACE']) { expect((await raw(service.origin, row.path, method, browserAuth)).status).toBe(405); expect(await oracle()).toBe(before); expanded++; }
        const denied = await raw(service.origin, row.path, 'PATCH', browserAuth);
        expect(denied.status).toBe(405); expect(denied.headers.allow).toBe(row.path === '/api/state' ? 'GET, PUT, OPTIONS' : row.path.startsWith('/api/snippets/') ? 'GET, DELETE, OPTIONS' : row.path === '/api/jobs' || row.path.endsWith('/cancel') || row.path === '/api/artifacts/cleanup' ? 'POST, OPTIONS' : 'GET, OPTIONS'); expect(await oracle()).toBe(before); expanded++;
        const override = await raw(service.origin, row.path, 'PATCH', [...auth, 'X-HTTP-Method-Override', row.method, 'X-Method-Override', row.method]); expect(override.status).toBe(405); expect(await oracle()).toBe(before); expanded++;
        for (const path of [row.path + '#fragment', row.path.replace('/api/', '/api%2f'), row.path.replace('/api/', '/api\\')]) {
          expect((await raw(service.origin, path, row.method, json, row.body)).status).toBe(400); expect(await oracle()).toBe(before); expanded++;
        }
      }
      // Envelope negatives remain real dispatch tests against seeded resources.
      const bodyRoutes = routes.filter(row => row.method === 'POST' || row.method === 'PUT');
      for (const row of bodyRoutes) {
        for (const type of [undefined, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/vnd.test+json', 'application/json; charset=latin1', 'application/json; charset=utf-8; extra=value']) {
          const before = await oracle();
          expect((await raw(service.origin, row.path, row.method, [...auth, ...(type ? ['Content-Type', type] : [])], row.body)).status).toBe(415);
          expect(await oracle()).toBe(before); expanded++;
        }
        for (const body of ['', '{', 'null', '[]', '42']) {
          const before = await oracle(); expect((await raw(service.origin, row.path, row.method, json, body)).status).toBe(400); expect(await oracle()).toBe(before); expanded++;
        }
      }
      for (const row of routes.filter(row => row.method === 'GET' || row.method === 'DELETE')) {
        for (const header of [['Content-Type', 'application/json'], ['Content-Length', '2'], ['Transfer-Encoding', 'chunked']]) {
          const before = await oracle(); expect((await raw(service.origin, row.path, row.method, [...auth, ...header], header[0] === 'Content-Type' ? undefined : '{}')).status).toBe(header[0] === 'Content-Type' ? 415 : 400); expect(await oracle()).toBe(before); expanded++;
        }
      }
      for (const body of [' '.repeat(5 * 1024 * 1024 + 1), '{"extra":true}']) {
        const before = await oracle(); expect((await raw(service.origin, '/api/artifacts/cleanup', 'POST', json, body)).status).toBe(body.length > 5 * 1024 * 1024 ? 413 : 400); expect(await oracle()).toBe(before); expanded++;
      }
      for (const row of bodyRoutes) {
        const before = await oracle();
        const oversized = await raw(service.origin, row.path, row.method, [...json, 'Transfer-Encoding', 'chunked'], ' '.repeat(5 * 1024 * 1024 + 1));
        expect(oversized.status).toBe(413); expect(await oracle()).toBe(before); expanded++;
      }
      const beforeCancel = await oracle(); expect((await raw(service.origin, `/api/jobs/${waiting}/cancel`, 'POST', json, '{"extra":true}')).status).toBe(400); expect(await oracle()).toBe(beforeCancel); expanded++;
      const beforeEncoding = await oracle(); expect((await raw(service.origin, '/api/jobs', 'POST', [...json, 'Content-Encoding', 'gzip'], '{}')).status).toBe(415); expect(await oracle()).toBe(beforeEncoding); expanded++;
      for (const originHeaders of [[], ['Origin', 'http://127.0.0.1:5173']]) {
        const before = await oracle(); const health = await raw(service.origin, '/api/health', 'GET', ['Host', authority, ...originHeaders]);
        expect(health.status).toBe(200); expect(Object.keys(JSON.parse(health.body)).sort()).toEqual(['ok', 'service', 'version']); expect(health.headers['cache-control']).toBe('no-store'); expect(health.headers['access-control-allow-credentials']).toBeUndefined(); expect(health.body).not.toContain(token); expect(await oracle()).toBe(before);
        const preflight = await raw(service.origin, '/api/health', 'OPTIONS', ['Host', authority, 'Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', 'GET']); expect(preflight.status).toBe(204); expect(preflight.headers['access-control-allow-methods']).toBe('GET'); expect(preflight.headers['access-control-allow-headers']).toBeUndefined(); expect(await oracle()).toBe(before);
      }
      let preflightControls = 0;
      for (const row of routes) {
        const before = await oracle(); const headers = ['Host', new URL(service.origin).host, 'Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', row.method, 'Access-Control-Request-Headers', row.body ? 'authorization, content-type' : 'authorization'];
        const good = await raw(service.origin, row.path, 'OPTIONS', headers); expect(good.status).toBe(204); expect(good.body).toBe(''); expect(good.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173'); expect(good.headers['access-control-allow-methods']).toBe(row.method); expect(good.headers['access-control-allow-headers']).toBe(row.body ? 'authorization, content-type' : 'authorization'); expect(good.headers['cache-control']).toBe('no-store'); expect(good.headers.vary).toContain('Origin'); expect(good.headers['access-control-allow-credentials']).toBeUndefined(); expect(good.headers['access-control-max-age']).toBeUndefined(); expect(await oracle()).toBe(before); preflightControls++;
        expect((await raw(service.origin, row.path, 'OPTIONS', [...headers, 'Content-Length', '0'])).status).toBe(204); expect(await oracle()).toBe(before);
        expect((await raw(service.origin, row.path, 'OPTIONS', [...headers, 'Content-Type', 'application/json'])).status).toBe(415); expect(await oracle()).toBe(before); expanded++;
        expect((await raw(service.origin, row.path, row.method, ['Host', authority, 'Origin', 'http://127.0.0.1:5173', 'Authorization', `Bearer ${otherToken}`, ...(row.body ? ['Content-Type', 'application/json'] : [])], row.body)).status).toBe(401); expect(await oracle()).toBe(before); expanded++;
        for (const [extra, expected, body] of [
          [['Content-Length', '2'], 400, '{}'], [['Transfer-Encoding', 'chunked'], 400, '{}'],
          [['Access-Control-Request-Method', row.method], 400, undefined], [['Access-Control-Request-Headers', 'authorization'], 400, undefined],
        ] as [string[], number, string | undefined][]) { expect((await raw(service.origin, row.path, 'OPTIONS', [...headers, ...extra], body)).status).toBe(expected); expect(await oracle()).toBe(before); expanded++; }
        if (row.body) { expect((await raw(service.origin, row.path, 'OPTIONS', ['Host', authority, 'Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', row.method, 'Access-Control-Request-Headers', 'authorization'])).status).toBe(403); expect(await oracle()).toBe(before); expanded++; }
        if (row.body) {
          const invalidBody = '{'; // Admission-invalid JSON, independent of route business-schema defaults.
          expect((await raw(service.origin, row.path, row.method, json, invalidBody)).status).toBe(400); expect(await oracle()).toBe(before); expanded++;
        }
        expect((await raw(service.origin, row.path, 'OPTIONS', ['Host', authority, 'Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', 'PATCH', 'Access-Control-Request-Headers', 'authorization'])).status).toBe(403); expect(await oracle()).toBe(before); expanded++;
        expect((await raw(service.origin, row.path, row.method, ['Host', authority, 'Origin', 'http://foreign.invalid', 'Authorization', `Bearer ${token}`, ...(row.body ? ['Content-Type', 'application/json'] : [])], row.body)).status).toBe(403); expect(await oracle()).toBe(before); expanded++;
        expect((await raw(service.origin, row.path, 'OPTIONS', [...headers, 'Access-Control-Request-Private-Network', 'true'])).status).toBe(403); expect(await oracle()).toBe(before); expanded++;
      }
      for (const [path, method, extra, expected] of [
        ['/api/state', 'HEAD', [], 405], ['/api/state', 'TRACE', [], 405], ['/api/state', 'PATCH', [], 405], ['/api/unknown', 'GET', [], 404],
        ['http://127.0.0.1/api/state', 'GET', [], 400], ['/api/state?x=1', 'GET', [], 400], ['/api/%73tate', 'GET', [], 400], ['/api/../state', 'GET', [], 400], ['/api//state', 'GET', [], 400],
        ['/api/state', 'OPTIONS', [], 400], ['/api/unknown', 'OPTIONS', [], 404],
        ['/api/state', 'OPTIONS', ['Origin', 'http://127.0.0.1:5173'], 400],
        ['/api/state', 'OPTIONS', ['Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', 'GET', 'Access-Control-Request-Headers', 'content-type'], 403],
        ['/api/state', 'OPTIONS', ['Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', 'GET', 'Access-Control-Request-Headers', 'authorization, authorization'], 400],
        ['/api/state', 'OPTIONS', ['Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', 'GET', 'Access-Control-Request-Headers', 'authorization, cookie'], 403],
        ['/api/state', 'OPTIONS', ['Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', 'GET', 'Access-Control-Request-Headers', 'authorization', 'Access-Control-Request-Private-Network', 'false'], 400],
      ] as [string, string, string[], number][]) {
        const before = await oracle(); expect((await raw(service.origin, path, method, [...auth, ...extra])).status).toBe(expected); expect(await oracle()).toBe(before); expanded++;
      }
      for (const type of ['Application/JSON', 'application/json ; charset = UTF-8', 'application/json;charset="utf-8"']) expect((await raw(service.origin, '/api/jobs', 'POST', [...auth, 'Content-Type', type], '{"kind":"noop"}')).status).toBe(201);
      // Positive control for every kind: provider-off failure records are existing business semantics.
      for (const row of routes.filter(row => row.path === '/api/jobs')) { const spec = JSON.parse(row.body!); const job = await pollOrWaiting(spec.kind, await submit(spec.kind, spec.payload)); expect(job.status).toBe(spec.kind === 'waiting' ? 'queued' : ['elevenlabs-scribe', 'youtube-caption'].includes(spec.kind) ? 'failed' : 'completed'); }
      async function pollOrWaiting(kind: string, id: string) { return kind === 'waiting' ? JSON.parse((await raw(service.origin, `/api/jobs/${id}`, 'GET', auth)).body).job : await poll(id); }
      expect(providerCalls).toBe(0);
      pause = true; const pausedId = await submit('source-audio-snippet', { mediaPath, startMs: 2, endMs: 3 }); await running;
      const before = await oracle();
      for (const row of [{ path: `/api/jobs/${pausedId}/cancel`, method: 'POST', body: '{}' }, { path: snippet, method: 'DELETE' }, { path: snippet, method: 'GET' }, { path: '/api/artifacts/cleanup', method: 'POST', body: '{}' }]) { expect((await raw(service.origin, row.path, row.method, ['Host', new URL(service.origin).host, ...(row.body ? ['Content-Type', 'application/json'] : [])], row.body)).status).toBe(401); expect(await oracle()).toBe(before); expanded++; }
      release(); const published = await poll(pausedId); expect(published.status).toBe('completed');
      expect(published.result).toMatchObject({ startMs: 2, endMs: 3 });
      expect((await raw(service.origin, published.result.url, 'GET', auth)).body).toBe('RIFF-synthetic-wave');
      expect(await readFile(mediaPath, 'utf8')).toBe('synthetic');
      expect((await raw(service.origin, `/api/jobs/${waiting}/cancel`, 'POST', json, '{}')).status).toBe(200);
      const expectedDelete = JSON.parse(await oracle());
      const deletedEntry = expectedDelete.state.snippets.find(([id]: [string]) => id === snippetJob.result.snippetId);
      expect(deletedEntry).toBeDefined();
      expectedDelete.state.snippets = expectedDelete.state.snippets.filter(([id]: [string]) => id !== snippetJob.result.snippetId);
      delete expectedDelete.files[deletedEntry[1].path.slice(root.length)];
      const deleted = await raw(service.origin, snippet, 'DELETE', [...browserAuth, 'Content-Length', '0']);
      expect(deleted.status).toBe(204); expect(deleted.body).toBe('');
      expect(deleted.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
      await settle(); expect(JSON.parse(await oracle())).toEqual(expectedDelete);
      expect(zeroEnvelopes).toEqual([...zeroGetPaths.map(path => ({ method: 'GET', path, fields: ['Content-Length', '0'] })), { method: 'DELETE', path: snippet, fields: ['Content-Length', '0'] }]);
      console.info(JSON.stringify({ a17ExplicitZeroLength: { get: 4, delete: 1, boundaryRequests: zeroEnvelopes.length, rawEnvelope: ['Content-Length', '0'], contentTypeAbsent: true, transferEncodingAbsent: true, readOracleUnchanged: true, snippetReadOnlyLru: true, deleteOnlyMapAndFile: true } }));
      expect((await raw(service.origin, '/api/artifacts/cleanup', 'POST', json, '{}')).status).toBe(200);
      for (const type of ['Application/JSON', 'application/json ; charset = UTF-8', 'application/json;charset="utf-8"']) {
        const typed = [...browserAuth, 'Content-Type', type];
        const current = JSON.parse((await raw(service.origin, '/api/state', 'GET', browserAuth)).body);
        expect((await raw(service.origin, '/api/state', 'PUT', typed, JSON.stringify({ expectedRevision: current.revision, snapshot: seededSnapshot }))).status).toBe(200);
        const pending = JSON.parse((await raw(service.origin, '/api/jobs', 'POST', typed, '{"kind":"waiting"}')).body).job.id;
        expect((await raw(service.origin, `/api/jobs/${pending}/cancel`, 'POST', typed, '{}')).status).toBe(200);
        expect((await raw(service.origin, '/api/artifacts/cleanup', 'POST', typed, '{}')).status).toBe(200);
      }
      console.info(JSON.stringify({ seededExpandedDenials: expanded, admissionFaults: faults.length, routeClasses: routes.length, positiveJobKinds: 8, preflightControls, fullTablesFilesRevisionSaveLRU: true, pausedWorkerDenials: 4, fakeProviderCalls: providerCalls }));
    } finally { boundarySpy.mockRestore(); release(); database.close(); saveSpy.mockRestore(); await service.close(); await otherService.close(); await rm(other.root, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it('configured preview and localhost origins admit real JSON/WAV/cancel/delete dispatch', async () => {
    for (const uiOrigin of ['http://127.0.0.1:4173', 'http://localhost:5173']) {
      const { root, config } = await fixture(); let token = '';
      const mediaPath = join(root, 'synthetic.webm'); await writeFile(mediaPath, 'synthetic');
      const service = await startLingotorteLocalService({ ...config, uiOrigins: [uiOrigin] }, { receiveCapability: value => { token = value; }, commandRunner: async (_command, args) => { await writeFile(args.at(-1)!, 'RIFF-synthetic-wave'); return { exitCode: 0, stdout: '', stderr: '' }; } });
      const auth = ['Host', new URL(service.origin).host, 'Authorization', `Bearer ${token}`, 'Origin', uiOrigin];
      const json = [...auth, 'Content-Type', 'Application/JSON; charset="UTF-8"'];
      try {
        for (const path of ['/api/status', '/api/state']) { const result = await raw(service.origin, path, 'GET', auth); expect(result.status).toBe(200); expect(result.headers['access-control-allow-origin']).toBe(uiOrigin); }
        const state = JSON.parse((await raw(service.origin, '/api/state', 'GET', auth)).body);
        expect((await raw(service.origin, '/api/state', 'PUT', json, JSON.stringify({ expectedRevision: state.revision, snapshot: createEmptyLocalStoreSnapshot() }))).status).toBe(200);
        const waiting = JSON.parse((await raw(service.origin, '/api/jobs', 'POST', json, '{"kind":"waiting"}')).body).job.id;
        expect((await raw(service.origin, `/api/jobs/${waiting}`, 'GET', auth)).status).toBe(200);
        const id = JSON.parse((await raw(service.origin, '/api/jobs', 'POST', json, JSON.stringify({ kind: 'source-audio-snippet', payload: { mediaPath, startMs: 0, endMs: 1 } }))).body).job.id;
        let job: any;
        for (let i = 0; i < 100; i++) { job = JSON.parse((await raw(service.origin, `/api/jobs/${id}`, 'GET', auth)).body).job; if (job.status === 'completed') break; await settle(); }
        expect(job.status).toBe('completed'); const wav = await raw(service.origin, job.result.url, 'GET', auth); expect(wav.body).toBe('RIFF-synthetic-wave'); expect(wav.headers['access-control-allow-origin']).toBe(uiOrigin);
        const removed = await raw(service.origin, job.result.url, 'DELETE', auth); expect(removed.status).toBe(204); expect(removed.body).toBe(''); expect(removed.headers['access-control-allow-origin']).toBe(uiOrigin);
        expect((await raw(service.origin, `/api/jobs/${waiting}/cancel`, 'POST', json, '{}')).status).toBe(200);
        expect((await raw(service.origin, '/api/artifacts/cleanup', 'POST', json, '{}')).status).toBe(200);
      } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
    }
  });

  it('explicit native PNA only grants the configured origin and never authenticates actual work', async () => {
    const { root, config } = await fixture();
    const service = await startLingotorteLocalService({ ...config, privateNetworkOrigins: ['http://127.0.0.1:5173'] }, { receiveCapability: () => {} });
    try {
      const host = new URL(service.origin).host;
      const result = await raw(service.origin, '/api/state', 'OPTIONS', ['Host', host, 'Origin', 'http://127.0.0.1:5173', 'Access-Control-Request-Method', 'GET', 'Access-Control-Request-Headers', 'authorization', 'Access-Control-Request-Private-Network', 'true']);
      expect(result.status).toBe(204); expect(result.headers['access-control-allow-private-network']).toBe('true');
      expect((await raw(service.origin, '/api/state', 'GET', ['Host', host, 'Origin', 'http://127.0.0.1:5173'])).status).toBe(401);
    } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
  });

  it('canonical default-port and bracket IPv6 authority have no alternate spelling enrollment', () => {
    expect(canonicalAuthority('LOCALHOST:80')).toBe('localhost'); expect(canonicalOrigin('http://localhost')).toBe('http://localhost');
    expect(canonicalAuthority('[::1]:5174')).toBe('[::1]:5174');
    for (const value of ['127.1:5174', '2130706433:5174', 'localhost:080', 'localhost.:5174', 'localhost:0', '[0:0:0:0:0:0:0:1]:5174']) expect(() => canonicalAuthority(value)).toThrow();
  });

  it('fixed public default-port policy keeps internal health authority separate from every protected route and OPTIONS', async () => {
    const { root, config } = await fixture();
    const probe = createSocketServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
    let token = '';
    const service = await startLingotorteLocalService({ ...config, port, publicOrigins: ['http://public.test'], uiOrigins: ['http://public.test'], healthAuthority: `127.0.0.1:${port}` }, { receiveCapability: value => { token = value; } });
    const origin = `http://127.0.0.1:${port}`;
    try {
      for (const host of ['public.test', 'PUBLIC.TEST:80']) expect((await raw(origin, '/api/status', 'GET', ['Host', host, 'Authorization', `Bearer ${token}`, 'Origin', 'http://public.test'])).status).toBe(200);
      expect((await raw(origin, '/api/status', 'GET', ['Host', 'public.test:5174', 'Authorization', `Bearer ${token}`])).status).toBe(403);
      expect((await raw(origin, '/api/health', 'GET', ['Host', `127.0.0.1:${port}`])).status).toBe(200);
      for (const path of ['/api/status', '/api/state', '/api/jobs/11111111-1111-4111-8111-111111111111', '/api/snippets/11111111-1111-4111-8111-111111111111']) expect((await raw(origin, path, 'GET', ['Host', `127.0.0.1:${port}`, 'Authorization', `Bearer ${token}`])).status).toBe(403);
      expect((await raw(origin, '/api/health', 'OPTIONS', ['Host', `127.0.0.1:${port}`, 'Origin', 'http://public.test', 'Access-Control-Request-Method', 'GET'])).status).toBe(403);
    } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
  });

  it('actual unavailable-host ephemeral bind failure preserves roots before mutable initialization', async () => {
    const { root, config } = await fixture();
    await mkdir(config.scratchDir); await writeFile(join(config.scratchDir, 'sentinel'), 'untouched');
    const before = JSON.stringify(await manifest(root)); let checkpoints = 0;
    try {
      await expect(startLingotorteLocalService({ ...config, host: '192.0.2.1', port: 0 }, { receiveCapability: () => {}, startupCheckpoint: () => { checkpoints++; } })).rejects.toMatchObject({ code: 'EADDRNOTAVAIL' });
      expect(JSON.stringify(await manifest(root))).toBe(before); expect(checkpoints).toBe(0);
      expect(await readdir(root)).toEqual(['scratch']);
      console.info(JSON.stringify({ actualEphemeralBindFailure: 'EADDRNOTAVAIL', mutableRootsUnchanged: true, reachedPostBindCheckpoints: checkpoints }));
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('actual native bracket IPv6 listener freezes and admits its assigned authority', async context => {
    const { root, config } = await fixture(); let token = '';
    let service;
    try { service = await startLingotorteLocalService({ ...config, host: '::1' }, { receiveCapability: value => { token = value; } }); }
    catch (error) { await rm(root, { recursive: true, force: true }); if (['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes((error as NodeJS.ErrnoException).code ?? '')) { console.info('SKIPPED_GATE: actual native IPv6 unsupported by this runtime'); context.skip(); return; } throw error; }
    try { expect(service.origin).toMatch(/^http:\/\/\[::1\]:\d+$/); expect((await raw(service.origin, '/api/state', 'GET', ['Host', new URL(service.origin).host, 'Authorization', `Bearer ${token}`])).status).toBe(200); }
    finally { await service.close(); await rm(root, { recursive: true, force: true }); }
  });
});
