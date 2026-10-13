// Test-owned fixture runtime for the browser batch (lt-2t4 / lt-n31 / lt-13i).
// Pattern: scripts/qualification/lt-sor/runtime-live-v2.mjs. Private attached stdin/stdout pipe only;
// container runs with --log-driver none. The capability is written ONLY in the private pipe line that
// the controller consumes in memory; it is never logged, written to a file, put in argv/env or a URL.
// Providers are forced off and any provider call is counted and refused.
import { createServer as createViteServer } from '/app/node_modules/vite/dist/node/index.js';
import { createServer, request, Agent, Server as HttpServer } from 'node:http';
import { createInterface } from 'node:readline';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const origins = JSON.parse(process.env.QUALIFICATION_ORIGINS ?? '["http://127.0.0.1:18442"]');
const foreignOrigin = process.env.QUALIFICATION_FOREIGN ?? 'http://127.0.0.1:18449';
const SERVICE_PORT = 18441, GATE_PORT = 18445, DEV_PORT = 18442, FOREIGN_PORT = 18449;
const compiler = await createViteServer({ configFile: '/app/vite.config.ts', envFile: false, server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
const { startLingotorteLocalService: start } = await compiler.ssrLoadModule('/@fs/app/apps/local-service/src/server.ts');
const domain = await compiler.ssrLoadModule('/@fs/app/packages/domain/src/index.ts');
const storage = await compiler.ssrLoadModule('/@fs/app/packages/storage/src/index.ts');
const seeds = await import('/kit/seed-batch.mjs');

let capability = '', observe, service, providers = 0, commands = 0, stopping = false, serviceUp = false;
let commitMode = null; // null | 'drop-ack-after-commit'
let commitBarrier = { seen: 0, upstreamStatus: null, dropped: 0 };
const trace = [], socketSets = new Map();
function track(server, label) { const set = new Set(); socketSets.set(label, set); server.on('connection', (s) => { set.add(s); s.on('close', () => set.delete(s)); }); }
const originalListen = HttpServer.prototype.listen;
HttpServer.prototype.listen = function (...args) { if (args[0] === SERVICE_PORT) track(this, 'service'); return originalListen.apply(this, args); };
async function commandRunner() { commands++; throw new Error('CommandsDisabledInBatch'); }
await mkdir('/state', { recursive: true }); await mkdir('/scratch', { recursive: true });
async function boot() {
  service = await start({ host: '127.0.0.1', port: SERVICE_PORT, publicOrigins: origins, uiOrigins: origins, databasePath: '/state/batch.db', scratchDir: '/scratch/jobs', modelCacheDir: '/scratch/models', allowOnlineProviders: false },
    { receiveCapability: (v) => { capability = v; }, observeState: (r) => { observe = r; }, commandRunner,
      fetchImpl: async () => { providers++; throw new Error('ProviderForbidden'); }, elevenLabsHttpClient: async () => { providers++; throw new Error('ProviderForbidden'); } });
  serviceUp = true;
}
await boot();
let upstream = new Agent({ keepAlive: false });
async function killService() { serviceUp = false; upstream.destroy(); for (const s of socketSets.get('service') ?? []) s.destroy(); await service.close(); upstream = new Agent({ keepAlive: false }); }

const SAFE = /^\/api\/(health|status|state|restore\/(preview|commit)|language\/morphology|jobs(?:\/[a-zA-Z0-9_-]+)?)$/;
const gate = createServer((req, res) => {
  const path = req.url ?? ''; const method = req.method ?? 'GET';
  const row = { method, path: SAFE.test(path) ? path : 'unclassified', origin: req.headers.origin ?? null, status: null, privateAbsent: true, corsGranted: false, credentialsGrant: false, dropped: false };
  res.on('finish', () => { row.status = res.statusCode; row.corsGranted = res.hasHeader('access-control-allow-origin'); row.credentialsGrant = res.hasHeader('access-control-allow-credentials'); });
  res.on('close', () => trace.push(row));
  if (stopping || !serviceUp) { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"Fixture unavailable"}'); return; }
  const isCommit = method === 'POST' && path === '/api/restore/commit' && (req.headers.origin ?? null) !== null && origins.includes(req.headers.origin);
  const next = request({ hostname: '127.0.0.1', port: SERVICE_PORT, path, method, headers: req.headers, agent: upstream }, (response) => {
    const chunks = []; response.on('data', (c) => chunks.push(c));
    response.on('end', async () => {
      const bytes = Buffer.concat(chunks);
      row.privateAbsent = ![capability, 'bqb-item', 'bqt-item', '"snapshot"'].filter(Boolean).some((v) => bytes.includes(v)) || (response.statusCode === 200 && origins.includes(req.headers.origin ?? ''));
      if (isCommit && commitMode === 'drop-ack-after-commit') {
        // Deterministic lost-ACK: the service has committed (upstream status observed), the browser never
        // receives the response, and the service is killed before any retry could arrive.
        commitBarrier.seen++; commitBarrier.upstreamStatus = response.statusCode; commitBarrier.dropped++; row.dropped = true; commitMode = null;
        await killService(); res.destroy(); return;
      }
      res.writeHead(response.statusCode ?? 502, response.headers); res.end(bytes);
    });
  });
  next.on('error', () => { if (!res.headersSent) { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"Fixture unavailable"}'); } else res.destroy(); });
  req.pipe(next);
});
track(gate, 'gate'); await new Promise((r) => gate.listen(GATE_PORT, '127.0.0.1', r));
process.env.LINGOTORTE_WEB_HOST = '0.0.0.0';
process.env.LINGOTORTE_WEB_ALLOWED_HOSTS = [...new Set(origins.map((o) => new URL(o).hostname))].join(',');
process.env.LINGOTORTE_PUBLIC_ORIGINS = origins.join(','); process.env.LINGOTORTE_UI_ORIGINS = origins.join(',');
process.env.LINGOTORTE_API_PROXY_TARGET = 'http://127.0.0.1:' + GATE_PORT;
const dev = await createViteServer({ configFile: '/app/vite.config.ts', server: { host: '0.0.0.0', port: DEV_PORT, strictPort: true }, logLevel: 'silent' });
track(dev.httpServer, 'dev'); await dev.listen();
// Owned foreign origin: serves a blank page only; it never proxies /api.
const foreign = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>Owned synthetic foreign origin</title><body>Owned qualification</body>'); });
track(foreign, 'foreign'); await new Promise((r) => foreign.listen(FOREIGN_PORT, '0.0.0.0', r));

async function files(root) { const out = {}; for (const e of await readdir(root, { withFileTypes: true })) { const p = root + '/' + e.name; if (e.isDirectory()) Object.assign(out, await files(p)); else if (e.isFile() && !p.endsWith('-wal') && !p.endsWith('-shm')) out[p] = createHash('sha256').update(await readFile(p)).digest('hex'); } return out; }
function tables() { const db = new DatabaseSync('/state/batch.db', { readOnly: true }); const t = {}; try { for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()) t[name] = db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all(); } finally { db.close(); } return t; }
const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const internal = (path, method = 'GET', body) => new Promise((resolve, reject) => {
  const q = request({ hostname: '127.0.0.1', port: SERVICE_PORT, path, method, agent: upstream, headers: { Host: new URL(origins[0]).host, Origin: origins[0], Authorization: 'Bearer ' + capability, ...(body ? { 'Content-Type': 'application/json' } : {}) } },
    (r) => { const c = []; r.on('data', (x) => c.push(x)); r.on('end', () => { let value; try { value = JSON.parse(Buffer.concat(c)); } catch {} resolve({ status: r.statusCode, value }); }); });
  q.on('error', reject); q.end(body);
});
// Server oracle: full SQLite table digest + revision + fixed projections. Raw rows never leave the container.
async function oracle() {
  const t = tables(); const st = (await internal('/api/state')).value ?? {};
  // v9 schema: full history in practice_attempt/review_event; active subset in active_practice_attempt/active_review_event.
  const audit = Object.fromEntries(['practice_attempt', 'review_event', 'active_practice_attempt', 'active_review_event'].map((k) => [k, t[k]?.length ?? -1]));
  return { tablesSha256: digest(t), tableCounts: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.length])), auditCounts: audit, revision: st.revision ?? null, learner: seeds.learnerCounts(st.snapshot), anchors: digest(seeds.anchorDigest(st.snapshot)), mediaIds: Object.keys(st.snapshot?.mediaAssets ?? {}).sort(), trackIds: Object.keys(st.snapshot?.subtitleTracks ?? {}).sort(), trackStatus: Object.fromEntries(Object.entries(st.snapshot?.subtitleTracks ?? {}).map(([k, v]) => [k, v?.transcriptStatus ?? null])), journey: seeds.journeyProjection(st.snapshot), providers, commands, serviceUp };
}
// Replace learner/transcript collections in the service snapshot with a synthetic store (CAS on revision).
async function seedSnapshot(kind) {
  const store = kind === 'transcript' ? seeds.transcriptStore({ storage, domain }) : seeds.learnerStore({ storage, domain });
  const cur = (await internal('/api/state')).value; const snap = { ...cur.snapshot, ...store.snapshot() };
  const r = await internal('/api/state', 'PUT', JSON.stringify({ snapshot: snap, expectedRevision: cur.revision }));
  if (r.status !== 200) throw new Error('SeedSave');
  return { seeded: kind, revision: r.value?.revision ?? null };
}
const reply = (row) => process.stdout.write(JSON.stringify(row) + '\n');
const settle = (set, ms) => new Promise((r) => { const end = Date.now() + ms; const tick = () => (!set || set.size === 0 || Date.now() > end ? r() : setTimeout(tick, 10)); tick(); });
async function shutdown() {
  stopping = true; commitMode = null; const out = {};
  // Idle keep-alive sockets (browser pool, Vite proxy agent) must not hold a close past its window.
  for (const s of [dev.httpServer, foreign, gate]) { try { s.closeIdleConnections?.(); } catch {} }
  for (const [label, fn] of [['dev', () => dev.close()], ['foreign', () => new Promise((r) => foreign.close(r))], ['gate', () => new Promise((r) => gate.close(r))], ['service', () => (serviceUp ? service.close() : null)], ['compiler', () => compiler.close()]]) {
    const graceful = await Promise.race([Promise.resolve().then(fn).then(() => true, () => false), new Promise((r) => { const t = setTimeout(() => r(false), 1500); t.unref(); })]);
    if (!graceful) for (const s of socketSets.get(label) ?? []) s.destroy();
    await settle(socketSets.get(label), 500); // socket 'close' events are async after destroy()
    out[label] = { graceful, remainingSockets: socketSets.get(label)?.size ?? 0 };
  }
  upstream.destroy();
  return { stopped: true, closures: out, providers, strictPass: Object.values(out).every((v) => v.graceful && v.remainingSockets === 0) && providers === 0 };
}
async function op(msg) {
  switch (msg.op) {
    case 'oracle': return await oracle();
    case 'seed-learner': return await seedSnapshot('learner');
    case 'seed-transcript': return await seedSnapshot('transcript');
    case 'manifest-seeded': return { manifestJson: seeds.manifestOf({ storage }, seeds.learnerStore({ storage, domain })) };
    case 'manifest-empty': return { manifestJson: seeds.emptyManifest({ storage, domain }) };
    case 'trace-since': return { trace: trace.slice(msg.index ?? 0), traceCount: trace.length };
    case 'trace-count': return { traceCount: trace.length };
    case 'commit-mode': commitMode = msg.mode === 'drop-ack-after-commit' ? msg.mode : null; commitBarrier = { seen: 0, upstreamStatus: null, dropped: 0 }; return { armed: commitMode };
    case 'commit-barrier': return { ...commitBarrier, armed: commitMode, serviceUp };
    case 'restart': if (serviceUp) await killService(); await boot(); return { restarted: true, capabilityRotated: true };
    case 'start-service': if (!serviceUp) await boot(); return { serviceUp };
    case 'kill-service': if (serviceUp) await killService(); return { serviceUp };
    default: throw new Error('UnknownBatchIPC');
  }
}
// Ready line carries the capability; the controller pops it before anything is queued/recorded.
reply({ ready: true, capability, origins, foreign: foreignOrigin });
const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  let msg; try { msg = JSON.parse(line); } catch { reply({ errorClass: 'InvalidIPC' }); continue; }
  const seq = Number.isInteger(msg.seq) ? msg.seq : null; // echoed so a late reply can never satisfy a later request
  if (msg.op === 'stop') { let v; try { v = await shutdown(); } catch { v = { stopped: false, strictPass: false, errorStage: 'shutdown' }; } reply({ ...v, seq }); break; }
  try { const v = await op(msg); reply({ ...(msg.op === 'restart' || msg.op === 'start-service' ? { ...v, capability } : v), seq }); }
  catch (e) { reply({ errorClass: e?.constructor?.name === 'Error' ? 'FixtureOperation' : 'FixtureException', seq }); }
}
rl.close(); process.exit(0);
