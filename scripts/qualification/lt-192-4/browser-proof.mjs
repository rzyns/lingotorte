// lt-192.4 (D) real-browser proof, plan §7 P1-P12. Runs ENTIRELY inside one disposable container started with
// `--network none` (loopback only), no mounts and no published ports: the real local service with a synthetic managed
// library in /tmp (through Vite SSR, as lt-192-3 did), a Vite dev origin proxying /api to it, and the image's bundled
// Chromium. Synthetic media only; providers off. The pairing capability and every media cookie value live in this
// process's memory only: typed into the masked field, never printed, logged or written; the run ends by scanning all
// of its own output for them. Output: one JSON line per check plus a summary; exit 1 on any failed check.
//
// Synthetic media: LT1924_PROOF_MEDIA_DIR may hold `synthetic-long.webm` (VP9/Opus) and `synthetic-long.mp4`
// (H.264/AAC), generated with ffmpeg -f lavfi in the contributor image and copied into the container (docker cp, not a
// mount). Without them the repo's 2 s synthetic fixture is used for the WebM rows and the MP4 row is a named skip.
//
//   docker build --target e2e -t lingotorte:lt1924-e2e .
//   docker create --name lt1924-proof --init --network none --shm-size 1g -e LT1924_PROOF_MEDIA_DIR=/tmp/lt1924-media \
//     --entrypoint node lingotorte:lt1924-e2e scripts/qualification/lt-192-4/browser-proof.mjs
//   docker cp <media dir> lt1924-proof:/tmp/lt1924-media && docker start -a lt1924-proof
import { createServer as createViteServer } from '/app/node_modules/vite/dist/node/index.js';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { chmod, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from '@playwright/test';

const SVC = 18461, DEV = 18462, OTHER = 18463;
const ORIGIN = `http://127.0.0.1:${DEV}`;
const LAN_HOST = 'lan.test';
const LAN_ORIGIN = `http://${LAN_HOST}:${DEV}`;
const ROOT = '/tmp/lt-192-4-proof';
const LIBRARY = `${ROOT}/library`;
const SHOTS = `${ROOT}/shots`;
const MEDIA_DIR = process.env.LT1924_PROOF_MEDIA_DIR ?? '';
await rm(ROOT, { recursive: true, force: true });
await mkdir(LIBRARY, { recursive: true, mode: 0o700 });
await mkdir(SHOTS, { recursive: true });

const printed = [];
const say = (value) => { const line = JSON.stringify(value); printed.push(line); console.log(line); };
const results = [];
const check = (name, ok, detail = {}) => { const row = { check: name, ok: Boolean(ok), ...detail }; results.push(row); say(row); return Boolean(ok); };
const secrets = new Set();

process.env.LINGOTORTE_WEB_HOST = '127.0.0.1';
process.env.LINGOTORTE_WEB_ALLOWED_HOSTS = `127.0.0.1,${LAN_HOST}`;
process.env.LINGOTORTE_PUBLIC_ORIGINS = `${ORIGIN},${LAN_ORIGIN}`;
process.env.LINGOTORTE_API_PROXY_TARGET = `http://127.0.0.1:${SVC}`;
const compiler = await createViteServer({ configFile: '/app/vite.config.ts', envFile: false, server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
const { startLingotorteLocalService: start } = await compiler.ssrLoadModule('/@fs/app/apps/local-service/src/server.ts');

let capability = '';
let service;
let observe;
let providers = 0;
const forbidden = async () => { providers++; throw new Error('ProviderForbidden'); };
let peakSlots = 0;
// Correction R3: private-delivery readiness is a runtime callback; the proof flips it without restarting the process.
let deliveryUp = true;
async function boot() {
  service = await start({ host: '127.0.0.1', port: SVC, publicOrigins: [ORIGIN, LAN_ORIGIN], uiOrigins: [ORIGIN, LAN_ORIGIN], databasePath: `${ROOT}/state.db`,
    scratchDir: `${ROOT}/scratch`, modelCacheDir: `${ROOT}/models`, libraryDir: LIBRARY, allowOnlineProviders: false },
  { receiveCapability: (value) => { capability = value; secrets.add(value); }, observeState: (read) => { observe = read; }, deliveryReady: async () => deliveryUp, fetchImpl: forbidden, elevenLabsHttpClient: forbidden, commandRunner: forbidden });
}
const stopService = async () => { await service.close(); service = undefined; };
await boot();
const sampler = setInterval(() => { try { if (service) peakSlots = Math.max(peakSlots, observe().activeMediaSlots); } catch { /* restarting */ } }, 20);
const dev = await createViteServer({ configFile: '/app/vite.config.ts', server: { host: '127.0.0.1', port: DEV, strictPort: true, hmr: false }, logLevel: 'silent' });
await dev.listen();

/** Direct request to the service (server oracle), Host = the public web authority; never leaves this process. */
function direct(method, path, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const q = httpRequest({ hostname: '127.0.0.1', port: SVC, path, method, headers: { Host: `127.0.0.1:${DEV}`, ...headers } }, (r) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }));
    });
    q.on('error', reject); q.end(body);
  });
}
const bearer = () => ({ Authorization: `Bearer ${capability}` });
const serviceState = async () => JSON.parse((await direct('GET', '/api/state', bearer())).body.toString('utf8'));
const assetFor = async (sha) => Object.values((await serviceState()).snapshot.mediaAssets).find((a) => a.contentSha256 === `sha256:${sha}`);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function seedBlob(bytes, mimeType) {
  const hex = sha256(bytes);
  await mkdir(`${LIBRARY}/blobs`, { recursive: true, mode: 0o700 });
  const path = `${LIBRARY}/blobs/${hex}`;
  if (!existsSync(path)) { await writeFile(path, bytes, { mode: 0o400 }); await chmod(path, 0o400); }
  const db = new DatabaseSync(`${ROOT}/state.db`);
  try { db.prepare("INSERT OR IGNORE INTO managed_media_blob (sha256, size_bytes, mime_type, stored_at) VALUES (?, ?, ?, '2026-10-31T00:00:00.000Z')").run(hex, bytes.length, mimeType); }
  finally { db.close(); }
  return { hex, path };
}
const effectsSnapshot = async () => { const o = observe(); return JSON.stringify({ sessions: o.mediaSessions, revision: o.state.revision, jobs: o.jobs.length }); };

const webm = MEDIA_DIR && existsSync(`${MEDIA_DIR}/synthetic-long.webm`) ? await readFile(`${MEDIA_DIR}/synthetic-long.webm`) : await readFile('/app/fixtures/media/synthetic-polish-dialogue.webm');
const mp4 = MEDIA_DIR && existsSync(`${MEDIA_DIR}/synthetic-long.mp4`) ? await readFile(`${MEDIA_DIR}/synthetic-long.mp4`) : null;
const junk = randomBytes(256 * 1024);
// Distinct short synthetic assets whose FIRST network load happens right after eviction (P6) or restart (P5):
// Chromium buffers a whole small file, so re-using an already-loaded asset would not issue any request.
const extra = async (name) => (MEDIA_DIR && existsSync(`${MEDIA_DIR}/${name}`) ? readFile(`${MEDIA_DIR}/${name}`) : null);
const evictBytes = await extra('synthetic-evict.webm');
const restartBytes = await extra('synthetic-restart.webm');
say({ media: { evictSha256: evictBytes ? sha256(evictBytes) : null, restartSha256: restartBytes ? sha256(restartBytes) : null, webmBytes: webm.length, webmSha256: sha256(webm), mp4Bytes: mp4?.length ?? null, mp4Sha256: mp4 ? sha256(mp4) : null, generated: Boolean(MEDIA_DIR) } });

const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP ${LAN_HOST} 127.0.0.1`] });
const context = await browser.newContext({ serviceWorkers: 'block' });
const egress = [];
const media = []; // M4 requests seen by the browser (no values recorded)
const sessionsCalls = [];
context.on('request', async (r) => {
  const url = new URL(r.url());
  if (url.protocol === 'blob:' || url.protocol === 'data:') return;
  if (![ORIGIN, LAN_ORIGIN, `http://127.0.0.1:${OTHER}`, `http://${LAN_HOST}:${OTHER}`].includes(url.origin)) egress.push(url.origin);
  const headers = await r.allHeaders().catch(() => ({}));
  if (/^\/api\/media\/[0-9a-f-]{36}\/content$/.test(url.pathname)) media.push({ t: Date.now(), origin: url.origin, frame: new URL(r.frame()?.url() ?? 'about:blank').origin, method: r.method(), range: headers.range ?? null, cookie: /(^|;\s*)lt_media=/.test(headers.cookie ?? ''), authorization: 'authorization' in headers, site: headers['sec-fetch-site'] ?? null, request: r });
  if (url.pathname === '/api/media/session') sessionsCalls.push({ t: Date.now(), method: r.method(), cookie: /(^|;\s*)lt_media=/.test(headers.cookie ?? '') });
});
const responseOf = async (row) => { try { const resp = await row.request.response(); return resp ? { status: resp.status(), contentRange: (await resp.allHeaders())['content-range'] ?? null } : { status: null }; } catch { return { status: null }; } };
/** Actual sent request headers and received status for /content via CDP ExtraInfo (works even when ORB/CORP blocks). */
async function wireCapture(target) {
  const cdp = await target.context().newCDPSession(target);
  await cdp.send('Network.enable');
  const urls = new Map(); const rows = new Map();
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url));
  cdp.on('Network.requestWillBeSentExtraInfo', (e) => { const h = Object.fromEntries(Object.entries(e.headers).map(([k, v]) => [k.toLowerCase(), v]));
    rows.set(e.requestId, { ...(rows.get(e.requestId) ?? {}), site: h['sec-fetch-site'] ?? null, mode: h['sec-fetch-mode'] ?? null, dest: h['sec-fetch-dest'] ?? null, cookie: /(^|;\s*)lt_media=/.test(h.cookie ?? '') }); });
  cdp.on('Network.responseReceivedExtraInfo', (e) => rows.set(e.requestId, { ...(rows.get(e.requestId) ?? {}), status: e.statusCode }));
  return () => [...rows.entries()].filter(([id]) => /\/content$/.test(urls.get(id) ?? '')).map(([, r]) => r);
}
const mediaCookie = async (origin = ORIGIN) => (await context.cookies(`${origin}/api/media/`)).find((c) => c.name === 'lt_media');

const nav = (page, name) => page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name, exact: true }).click();
async function pair(page, origin = ORIGIN) {
  await nav(page, 'Settings');
  await page.fill('#local-service-url', origin);
  await page.fill('#local-service-capability', capability);
  const minted = sessionsCalls.length;
  await page.getByRole('button', { name: 'Connect local service', exact: true }).first().click();
  await page.waitForFunction(() => /Connected|Browser work differs/.test(document.querySelector('#local-service-status')?.textContent ?? ''), null, { timeout: 15_000 });
  const choice = page.getByRole('button', { name: 'Load service state (discard browser edits)' });
  if (await choice.count()) await choice.first().click();
  for (let i = 0; i < 100 && !sessionsCalls.slice(minted).some((c) => c.method === 'POST'); i++) await page.waitForTimeout(50);
  for (let i = 0; i < 60 && !(await mediaCookie(origin)); i++) await page.waitForTimeout(50);
  const cookie = await mediaCookie(origin);
  if (cookie) secrets.add(cookie.value);
  return cookie;
}
async function importFile(page, file) {
  await nav(page, 'Library');
  await page.locator('#local-media-file').setInputFiles(file);
  await page.getByRole('button', { name: 'Import local media', exact: true }).click();
  await page.getByRole('heading', { name: 'Player', exact: true }).waitFor();
}
async function waitAsset(sha, page) {
  for (let i = 0; i < 100; i++) { const a = await assetFor(sha); if (a) return a; if (i === 30) { await nav(page, 'Settings'); await page.getByRole('button', { name: 'Save state now', exact: true }).first().click(); } await page.waitForTimeout(100); }
  return undefined;
}
async function openMedia(page, title) {
  await nav(page, 'Library');
  await page.getByRole('button', { name: `Open ${title}`, exact: true }).first().click();
  await page.getByRole('heading', { name: 'Player', exact: true }).waitFor();
}
const video = (page) => page.locator('.video-stage video');
async function videoState(page) {
  return page.evaluate(() => { const v = document.querySelector('.video-stage video'); return v ? { src: v.getAttribute('src'), readyState: v.readyState, currentTime: v.currentTime, duration: v.duration, paused: v.paused, error: v.error?.code ?? null, width: v.videoWidth, crossorigin: v.hasAttribute('crossorigin') } : null; });
}
async function playAndAdvance(page, seconds = 1) {
  await page.evaluate(async () => { const v = document.querySelector('.video-stage video'); v.muted = true; try { await v.play(); } catch { /* reported by state */ } });
  const before = (await videoState(page))?.currentTime ?? 0;
  for (let i = 0; i < 100; i++) { const s = await videoState(page); if (s && s.readyState >= 3 && s.currentTime > before + seconds) return { ok: true, before, ...s }; await page.waitForTimeout(100); }
  return { ok: false, before, ...(await videoState(page)) };
}
const stageText = (page) => page.locator('.video-stage').innerText().catch(() => '');
const DECODE_OR_RELINK_ADVICE = /cannot decode|could not be played|relink or choose another file|unsupported codec/i;
const statusText = (page) => page.locator('#local-service-status').innerText().catch(() => '');
// Correction R4: an alert counts as visible only if its box lies inside the (overflow-hidden) stage and the topmost
// element at its centre is the alert itself; innerText alone passed while the message was clipped below the video.
function alertGeometry() {
  const stage = document.querySelector('.video-stage'); const alert = stage?.querySelector('.media-error-alert');
  if (!stage || !alert) return null;
  const s = stage.getBoundingClientRect(); const a = alert.getBoundingClientRect();
  const inside = a.width > 0 && a.height > 0 && a.top >= s.top - 0.5 && a.bottom <= s.bottom + 0.5 && a.left >= s.left - 0.5 && a.right <= s.right + 0.5;
  const hitAt = document.elementFromPoint(a.left + a.width / 2, a.top + Math.min(a.height / 2, 12));
  const style = getComputedStyle(alert);
  return { text: alert.textContent, role: alert.getAttribute('role'), inside, hit: Boolean(hitAt && (hitAt === alert || alert.contains(hitAt))),
    shown: style.visibility === 'visible' && Number(style.opacity) > 0.5, top: Math.round(a.top - s.top), bottom: Math.round(a.bottom - s.top), stageHeight: Math.round(s.height) };
}
const alertVisibility = async (page) => { await page.locator('.video-stage').scrollIntoViewIfNeeded().catch(() => undefined); return page.evaluate(alertGeometry); };
const visible = (g) => Boolean(g && g.inside && g.hit && g.shown);
async function watchTexts(page) {
  await page.evaluate((geometrySource) => { const geometry = new Function(`return (${geometrySource})()`); window.__lt1924Texts = new Set(); window.__lt1924Alerts = {};
    new MutationObserver(() => { const t = document.querySelector('.video-stage')?.innerText; if (t) window.__lt1924Texts.add(t);
      const g = geometry(); if (g) { const v = g.inside && g.hit && g.shown; window.__lt1924Alerts[g.text] = Boolean(window.__lt1924Alerts[g.text]) || v; } })
      .observe(document.body, { subtree: true, childList: true, characterData: true }); }, alertGeometry.toString());
}
const seenTexts = (page) => page.evaluate(() => [...(window.__lt1924Texts ?? [])].join('\n'));
const seenAlerts = (page) => page.evaluate(() => window.__lt1924Alerts ?? {});

let page;
let exitCode = 0;
try {
  page = await context.newPage();
  await page.goto(ORIGIN);

  // --- P1 Pair: M1 204; attributes only; document.cookie lacks the value. ---
  const cookie1 = await pair(page);
  check('P1 pair mints an HttpOnly SameSite=Strict /api/media/ session cookie', cookie1 && cookie1.httpOnly && cookie1.sameSite === 'Strict' && cookie1.path === '/api/media/' && cookie1.secure === false && cookie1.expires === -1,
    { attributes: cookie1 ? { httpOnly: cookie1.httpOnly, sameSite: cookie1.sameSite, path: cookie1.path, secure: cookie1.secure, session: cookie1.expires === -1, domain: cookie1.domain } : null, serverSessions: observe().mediaSessions });
  check('P1 document.cookie never exposes lt_media', !(await page.evaluate(() => document.cookie)).includes('lt_media'));

  // --- P12 local object URL: import plays locally and makes no M4 request. ---
  // Playwright refuses in-memory buffers over 50 MB, so the generated file is passed by its in-container path.
  const webmFile = MEDIA_DIR && existsSync(`${MEDIA_DIR}/synthetic-long.webm`) ? `${MEDIA_DIR}/synthetic-long.webm` : { name: 'synthetic-long.webm', mimeType: 'video/webm', buffer: webm };
  const beforeImport = media.length;
  await importFile(page, webmFile);
  const local = await playAndAdvance(page, 0.5);
  check('P12 local object URL plays with no M4 request (N27)', local.ok && local.src?.startsWith('blob:') && media.length === beforeImport, { readyState: local.readyState, m4Requests: media.length - beforeImport });
  const webmAsset = await waitAsset(sha256(webm), page);
  check('setup: imported asset saved to the service', Boolean(webmAsset), { originalPathKind: webmAsset?.originalPath.split(':')[0] });
  const webmBlob = await seedBlob(webm, 'video/webm');
  const m3 = JSON.parse((await direct('GET', `/api/media/${webmAsset.id}/storage`, bearer())).body.toString());
  check('setup: synthetic blob registered (test-only seed) and M3 complete', m3.state === 'complete' && m3.sizeBytes === webm.length, { state: m3.state });

  const extras = {};
  for (const [key, bytes] of [['evict', evictBytes], ['restart', restartBytes]]) {
    if (!bytes) continue;
    await importFile(page, { name: `synthetic-${key}.webm`, mimeType: 'video/webm', buffer: bytes });
    extras[key] = await waitAsset(sha256(bytes), page);
    await seedBlob(bytes, 'video/webm');
  }

  // --- P2 Play from the server after a reload (no object URL): no relink placeholder. ---
  await page.reload();
  await pair(page);
  await openMedia(page, webmAsset.title);
  for (let i = 0; i < 50 && !(await video(page).count()); i++) await page.waitForTimeout(100);
  const relinkShown = await page.locator('.video-placeholder-relink').count();
  const played = await playAndAdvance(page, 1);
  const firstServerRequests = media.filter((m) => m.origin === ORIGIN && m.frame === ORIGIN);
  check('P2 server copy plays: derived M4 src, no relink placeholder, readyState>=3, time advances', played.ok && relinkShown === 0 && played.src === `${ORIGIN}/api/media/${webmAsset.id}/content` && !played.crossorigin,
    { readyState: played.readyState, advancedFrom: played.before, currentTime: played.currentTime, relinkShown });
  check('P2 native <video> M4 requests carry the cookie and no Authorization', firstServerRequests.length > 0 && firstServerRequests.every((m) => m.cookie && !m.authorization),
    { requests: firstServerRequests.length, statuses: await Promise.all(firstServerRequests.slice(0, 4).map(async (m) => (await responseOf(m)).status)) });
  await page.locator('.video-stage').screenshot({ path: `${SHOTS}/p2-server-playing.png` });

  // --- P3 Seek to 75%: a Range request appears; bytes received stay below the file size. ---
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const received = new Map(); const urls = new Map();
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url));
  cdp.on('Network.dataReceived', (e) => { if (/\/content$/.test(urls.get(e.requestId) ?? '')) received.set(e.requestId, (received.get(e.requestId) ?? 0) + e.dataLength); });
  const beforeSeek = media.length;
  await page.evaluate(() => new Promise((resolve) => { const v = document.querySelector('.video-stage video'); v.addEventListener('seeked', resolve, { once: true }); v.currentTime = v.duration * 0.75; }));
  const afterSeek = await playAndAdvance(page, 0.5);
  const seekRequests = media.slice(beforeSeek);
  const seekResponses = await Promise.all(seekRequests.map(responseOf));
  const ranged = seekRequests.map((m, i) => ({ range: m.range, ...seekResponses[i] })).filter((r) => r.range && !/^bytes=0-$/.test(r.range));
  const totalReceived = [...received.values()].reduce((a, b) => a + b, 0);
  check('P3 seek issues a non-zero Range request answered 206 and plays from there', afterSeek.ok && ranged.some((r) => r.status === 206) && afterSeek.currentTime > afterSeek.duration * 0.7,
    { ranged: ranged.slice(0, 3), currentTime: afterSeek.currentTime, duration: afterSeek.duration });
  check('P3 bytes received after the seek stay below the file size', totalReceived < webm.length, { bytesReceivedAfterSeek: totalReceived, fileSize: webm.length });

  // --- P4 Pause > 15 s (API idle socket timeout), then resume. ---
  await page.evaluate(() => { const v = document.querySelector('.video-stage video'); v.pause(); });
  await page.waitForTimeout(16_500);
  const beforeResume = media.length;
  // Resume at the start of the largest unbuffered gap so the browser must fetch again after the idle timeout.
  const target = await page.evaluate(() => { const v = document.querySelector('.video-stage video'); const r = v.buffered; let edges = [0];
    for (let i = 0; i < r.length; i++) edges.push(r.start(i), r.end(i)); edges.push(v.duration); let best = [0, 0];
    for (let i = 0; i + 1 < edges.length; i += 2) if (edges[i + 1] - edges[i] > best[1] - best[0]) best = [edges[i], edges[i + 1]];
    const t = best[0] + 1; v.currentTime = t; return { t, gap: best }; });
  const resumed = await playAndAdvance(page, 1);
  const resumeRows = await Promise.all(media.slice(beforeResume).map(async (m) => ({ range: m.range, cookie: m.cookie, ...(await responseOf(m)) })));
  check('P4 resume after a 16.5 s pause into an unbuffered region fetches again (206, cookie) and plays (E4)', resumed.ok && resumeRows.some((r) => r.status === 206 && r.cookie),
    { resumeAt: target, currentTime: resumed.currentTime, requestsAfterResume: resumeRows });

  // --- P6 Eviction: 64 bearer mints from Node evict the browser value; the next native load is 401 -> checking
  // access -> M3 complete -> exactly one browser re-mint -> plays. Uses an asset never loaded in this page. ---
  for (let i = 0; i < 64; i++) { const r = await direct('POST', '/api/media/session', { ...bearer(), 'Content-Type': 'application/json' }, '{}'); secrets.add(/^lt_media=([^;]+)/.exec(r.headers['set-cookie'][0])[1]); }
  const replayEvicted = await direct('GET', `/api/media/${webmAsset.id}/content`, { Cookie: `lt_media=${(await mediaCookie()).value}`, Range: 'bytes=0-0' });
  if (extras.evict) {
    await watchTexts(page);
    const postsBefore = sessionsCalls.filter((c) => c.method === 'POST').length;
    const loadsBefore = media.length;
    await openMedia(page, extras.evict.title);
    for (let i = 0; i < 100 && sessionsCalls.filter((c) => c.method === 'POST').length === postsBefore; i++) await page.waitForTimeout(100);
    for (let i = 0; i < 50 && !(await video(page).count()); i++) await page.waitForTimeout(100);
    const recovered = await playAndAdvance(page, 0.5);
    const remints = sessionsCalls.filter((c) => c.method === 'POST').length - postsBefore;
    const loads = await Promise.all(media.slice(loadsBefore).map(async (m) => ({ cookie: m.cookie, ...(await responseOf(m)) })));
    const seen = await seenTexts(page);
    check('P6 evicted cookie: native 401, checking-access, exactly one re-mint, plays again (N26)', replayEvicted.status === 401 && loads[0]?.status === 401 && recovered.ok && remints === 1 && /Checking access/.test(seen) && !DECODE_OR_RELINK_ADVICE.test(seen),
      { evictedReplay: replayEvicted.status, loads: loads.slice(0, 4), remints, readyState: recovered.readyState, sawChecking: /Checking access/.test(seen), adviceSeen: seen.match(DECODE_OR_RELINK_ADVICE)?.[0] ?? null });
    const alerts = await seenAlerts(page);
    const checkingKey = Object.keys(alerts).find((t) => /Checking access/.test(t));
    check('P6 the checking-access alert was rendered visibly inside the stage (box inside, topmost at its centre)', Boolean(checkingKey && alerts[checkingKey]), { alerts });
  } else check('P6 named skip: no synthetic-evict.webm supplied', true, { skipped: true, evictedReplay: replayEvicted.status });

  // --- E3 Undecodable bytes: stored, not decodable after a single re-mint; never relink advice. ---
  await importFile(page, { name: 'synthetic-undecodable.webm', mimeType: 'video/webm', buffer: junk });
  const junkAsset = await waitAsset(sha256(junk), page);
  await seedBlob(junk, 'video/webm');
  await page.reload();
  await pair(page);
  await watchTexts(page);
  const postsBeforeJunk = sessionsCalls.filter((c) => c.method === 'POST').length;
  await openMedia(page, junkAsset.title);
  for (let i = 0; i < 100 && !/Stored on the server, but this browser cannot decode/.test(await stageText(page)); i++) await page.waitForTimeout(100);
  const junkText = await stageText(page);
  const junkRemints = sessionsCalls.filter((c) => c.method === 'POST').length - postsBeforeJunk;
  check('E3 non-decodable server bytes: "stored, not decodable" after one re-mint, no relink advice', /Stored on the server, but this browser cannot decode its format; no conversion is performed/.test(junkText) && junkRemints === 1 && !/relink or choose another file/i.test(junkText),
    { remints: junkRemints, sawChecking: /Checking access/.test(await seenTexts(page)) });
  const e3Geometry = await alertVisibility(page);
  check('E3 the "stored, not decodable" alert is visible inside the stage (not clipped below the video), role alert/status', visible(e3Geometry) && /cannot decode/.test(e3Geometry.text) && ['alert', 'status'].includes(e3Geometry.role), { geometry: e3Geometry });
  await page.locator('.video-stage').screenshot({ path: `${SHOTS}/e3-stored-not-decodable.png` });

  // --- R5 Metadata-readable but undecodable server bytes: loadedmetadata must not reset the one re-mint budget.
  // Container structure and metadata are kept; only coded frame payloads are replaced with random bytes (MP4: the
  // mdat payload; WebM: each SimpleBlock payload after its 4-byte block header). A variant counts as a reproduction
  // only if the browser really reported loadedmetadata and then a media error. ---
  const corruptVariants = [];
  if (mp4) {
    const bytes = Buffer.from(mp4); const at = bytes.indexOf(Buffer.from('mdat'));
    if (at > 4) { const size = bytes.readUInt32BE(at - 4); randomBytes(Math.min(size, bytes.length - at + 4) - 8).copy(bytes, at + 4); corruptVariants.push({ name: 'mp4-mdat', mime: 'video/mp4', file: 'synthetic-metadata-only-h264.mp4', bytes }); }
  }
  if (evictBytes) {
    const bytes = Buffer.from(evictBytes);
    const vint = (at) => { const first = bytes[at]; let len = 1; while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++; let value = first & (0xff >> len); for (let i = 1; i < len; i++) value = value * 256 + bytes[at + i]; return { len, value }; };
    const idLen = (at) => { const first = bytes[at]; let len = 1; while (len <= 4 && !(first & (0x80 >> (len - 1)))) len++; return len; };
    let blocks = 0; let at = bytes.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]));
    while (at >= 0 && at < bytes.length - 8) {
      const clusterSize = vint(at + 4); const clusterEnd = Math.min(bytes.length, at + 4 + clusterSize.len + clusterSize.value);
      let child = at + 4 + clusterSize.len;
      while (child < clusterEnd - 2) {
        const il = idLen(child); const id = bytes.readUIntBE(child, il); const size = vint(child + il); const body = child + il + size.len;
        if (id === 0xa3 && size.value > 4) { randomBytes(size.value - 4).copy(bytes, body + 4); blocks++; }
        child = body + size.value;
      }
      at = bytes.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]), clusterEnd);
    }
    corruptVariants.push({ name: 'webm-simpleblocks', mime: 'video/webm', file: 'synthetic-metadata-only-vp9.webm', bytes, blocks });
  }
  const r5 = [];
  // Import every variant first: a file input set right after a reload+pair can be re-rendered away before Import.
  for (const variant of corruptVariants) {
    await importFile(page, { name: variant.file, mimeType: variant.mime, buffer: variant.bytes });
    variant.asset = await waitAsset(sha256(variant.bytes), page);
    await seedBlob(variant.bytes, variant.mime);
  }
  for (const variant of corruptVariants) {
    const asset = variant.asset;
    await page.reload();
    await pair(page);
    await page.evaluate(() => { window.__lt1924Meta = 0; window.__lt1924Errors = []; document.addEventListener('loadedmetadata', (e) => { if (e.target instanceof HTMLVideoElement) window.__lt1924Meta++; }, true);
      document.addEventListener('error', (e) => { if (e.target instanceof HTMLVideoElement) window.__lt1924Errors.push({ code: e.target.error?.code ?? null, afterMetadata: window.__lt1924Meta > 0 }); }, true); });
    const postsBefore = sessionsCalls.filter((c) => c.method === 'POST').length;
    await openMedia(page, asset.title);
    for (let i = 0; i < 50 && !(await video(page).count()); i++) await page.waitForTimeout(100);
    await page.evaluate(async () => { const v = document.querySelector('.video-stage video'); if (v) { v.muted = true; try { await v.play(); } catch { /* recorded via events */ } } });
    await page.waitForTimeout(8000);
    const counts = await page.evaluate(() => ({ metadata: window.__lt1924Meta, errors: window.__lt1924Errors }));
    const text = await stageText(page);
    const row = { variant: variant.name, blocks: variant.blocks ?? null, remints: sessionsCalls.filter((c) => c.method === 'POST').length - postsBefore, loadedmetadataEvents: counts.metadata, errors: counts.errors.slice(0, 6), errorCount: counts.errors.length,
      reproduces: counts.metadata >= 1 && counts.errors.some((e) => e.afterMetadata), finalText: text.slice(0, 120) };
    r5.push(row);
    say({ r5Variant: row });
    // A runaway metadata/error/re-mint cycle keeps re-rendering the page; a reload ends it before the next variant.
    await page.reload();
    await pair(page);
  }
  const r5Reproduced = r5.filter((r) => r.reproduces);
  check('R5 metadata-readable, undecodable server bytes: a real loadedmetadata-then-error case exists and every variant made at most one re-mint in 8 s (no metadata/error loop)',
    r5Reproduced.length > 0 && r5.every((r) => r.remints <= 1) && r5Reproduced.every((r) => /cannot decode|could not be loaded over the network|aborted/.test(r.finalText)), { variants: r5 });

  // --- P7 Bytes missing: delete the blob file; missing-bytes note, no src. ---
  await openMedia(page, webmAsset.title);
  await playAndAdvance(page, 0.2);
  await chmod(webmBlob.path, 0o600); await unlink(webmBlob.path);
  await page.evaluate(() => document.querySelector('.video-stage video')?.load());
  for (let i = 0; i < 100 && !(await page.locator('.server-media-note').count()); i++) await page.waitForTimeout(100);
  const missingNote = await page.locator('.server-media-note').innerText().catch(() => '');
  check('P7 missing bytes: honest note, no <video> src, no decode advice', /server copy is missing/.test(missingNote) && (await video(page).count()) === 0 && !/cannot decode|could not be played|unsupported codec/i.test(await stageText(page)),
    { note: missingNote, m3: JSON.parse((await direct('GET', `/api/media/${webmAsset.id}/storage`, bearer())).body.toString()).state });
  await page.locator('.video-stage').screenshot({ path: `${SHOTS}/p7-bytes-missing.png` });
  await seedBlob(webm, 'video/webm');

  // --- P11 MP4 (H.264/AAC): record canPlayType; play and seek on the server copy if "probably". ---
  const canPlay = await page.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'));
  if (mp4 && canPlay === 'probably') {
    await importFile(page, { name: 'synthetic-h264.mp4', mimeType: 'video/mp4', buffer: mp4 });
    const mp4Asset = await waitAsset(sha256(mp4), page);
    await seedBlob(mp4, 'video/mp4');
    await page.reload();
    await pair(page);
    await openMedia(page, mp4Asset.title);
    for (let i = 0; i < 50 && !(await video(page).count()); i++) await page.waitForTimeout(100);
    const mp4Play = await playAndAdvance(page, 1);
    const beforeMp4Seek = media.length;
    await page.evaluate(() => new Promise((resolve) => { const v = document.querySelector('.video-stage video'); v.addEventListener('seeked', resolve, { once: true }); v.currentTime = v.duration * 0.75; }));
    const mp4Seek = await playAndAdvance(page, 0.5);
    const mp4Ranges = await Promise.all(media.slice(beforeMp4Seek).map(async (m) => ({ range: m.range, ...(await responseOf(m)) })));
    check('P11 H.264/AAC MP4 plays and seeks from the server copy (container Chromium)', mp4Play.ok && mp4Play.width > 0 && mp4Play.src === `${ORIGIN}/api/media/${mp4Asset.id}/content` && mp4Seek.ok && mp4Seek.currentTime > mp4Seek.duration * 0.7,
      { canPlayType: canPlay, width: mp4Play.width, duration: mp4Play.duration, seekRanges: mp4Ranges.filter((r) => r.range).slice(0, 3) });
    await page.locator('.video-stage').screenshot({ path: `${SHOTS}/p11-mp4-server.png` });
    await openMedia(page, webmAsset.title);
  } else {
    check(`P11 MP4 named skip (canPlayType=${JSON.stringify(canPlay)}, generated mp4=${Boolean(mp4)})`, true, { skipped: true, canPlayType: canPlay });
  }

  // --- P5 Restart: explicitly request bytes on the active video after restart. Switching assets first would
  // only test M3 and could remove the old video before it makes any native request. ---
  await openMedia(page, webmAsset.title);
  await playAndAdvance(page, 0.2);
  await watchTexts(page);
  const activeLoadsBefore = media.length;
  await stopService(); await boot();
  await page.evaluate(() => document.querySelector('.video-stage video')?.load());
  for (let i = 0; i < 100 && !/Pair again to play server media/.test(await page.locator('#app').innerText()); i++) await page.waitForTimeout(100);
  const activeRestartText = await page.locator('#app').innerText();
  const activeSeen = await seenTexts(page);
  const activeLoads = await Promise.all(media.slice(activeLoadsBefore).map(async (m) => ({ cookie: m.cookie, ...(await responseOf(m)) })));
  check('P5 active video restart: native 401, checking-access, M3 401, then pair again without decode or relink advice',
    activeLoads.some((m) => m.status === 401) && /Pair again to play server media/.test(activeRestartText) && /Checking access/.test(activeSeen) && !DECODE_OR_RELINK_ADVICE.test(activeSeen) && !/cannot decode|could not be played/i.test(activeRestartText),
    { loads: activeLoads.slice(0, 3), sawChecking: /Checking access/.test(activeSeen) });
  if (extras.restart) {
    // Independently exercise an unchecked asset: its M3 must reject before any native src is installed.
    await pair(page);
    await stopService(); await boot();
    await watchTexts(page);
    const loadsBefore = media.length;
    await openMedia(page, extras.restart.title);
    for (let i = 0; i < 100 && !/Pair again to play server media/.test(await page.locator('#app').innerText()); i++) await page.waitForTimeout(100);
    const restartText = await page.locator('#app').innerText();
    const seen = await seenTexts(page);
    const loads = await Promise.all(media.slice(loadsBefore).map(async (m) => ({ cookie: m.cookie, ...(await responseOf(m)) })));
    check('P5 unchecked asset restart: M3 rejects before native src, then pair again without decode or relink advice', /Pair again to play server media/.test(restartText) && loads.length === 0 && !DECODE_OR_RELINK_ADVICE.test(seen) && !/cannot decode|could not be played/i.test(restartText),
      { loads: loads.slice(0, 3), sawChecking: /Checking access/.test(seen) });
    await page.locator('.video-stage').screenshot({ path: `${SHOTS}/p5-pair-again.png` });
    await pair(page);
    await openMedia(page, extras.restart.title);
  } else {
    check('P5 named skip: no synthetic-restart.webm supplied', true, { skipped: true });
    await pair(page);
    await openMedia(page, webmAsset.title);
  }
  for (let i = 0; i < 50 && !(await video(page).count()); i++) await page.waitForTimeout(100);
  const afterRepair = await playAndAdvance(page, 0.5);
  check('P5 after re-pairing the server copy plays again (E5)', afterRepair.ok && afterRepair.src?.includes('/api/media/'), { readyState: afterRepair.readyState });
  await openMedia(page, webmAsset.title);

  // --- P8 Disconnect: M2 with the cookie; server count drops; an old-value replay is 401 (N24). ---
  const held = (await mediaCookie()).value;
  const sessionsBefore = observe().mediaSessions;
  const deletesBefore = sessionsCalls.filter((c) => c.method === 'DELETE').length;
  await nav(page, 'Settings');
  await page.getByRole('button', { name: 'Disconnect local service', exact: true }).click();
  await page.waitForFunction(() => /Media access on this browser was revoked/.test(document.querySelector('#local-service-status')?.textContent ?? ''), null, { timeout: 10_000 }).catch(() => undefined);
  const deleteCall = sessionsCalls.filter((c) => c.method === 'DELETE').slice(deletesBefore)[0];
  const replay = await direct('GET', `/api/media/${webmAsset.id}/content`, { Cookie: `lt_media=${held}`, Range: 'bytes=0-0' });
  check('P8 Disconnect sends M2 with the cookie, the server value is gone, replay is 401, success is stated', deleteCall?.cookie && observe().mediaSessions === sessionsBefore - 1 && replay.status === 401 && /was revoked/.test(await statusText(page)),
    { sessions: [sessionsBefore, observe().mediaSessions], replay: replay.status });

  // --- P9 Disconnect while unreachable: disclosure; after restart the old value replays 401 (N25). ---
  await pair(page);
  const held2 = (await mediaCookie()).value;
  await stopService();
  await nav(page, 'Settings');
  await page.getByRole('button', { name: 'Disconnect local service', exact: true }).click();
  await page.waitForFunction(() => /could not be revoked/.test(document.querySelector('#local-service-status')?.textContent ?? ''), null, { timeout: 10_000 }).catch(() => undefined);
  const disclosure = await statusText(page);
  await boot();
  const replay2 = await direct('GET', `/api/media/${webmAsset.id}/content`, { Cookie: `lt_media=${held2}`, Range: 'bytes=0-0' });
  check('P9 unreachable Disconnect discloses "could not be revoked; ends at restart", never "revoked"; restart replay is 401', /could not be revoked; it ends when the service restarts/.test(disclosure) && !/was revoked/.test(disclosure) && replay2.status === 401,
    { replayAfterRestart: replay2.status });

  // --- R3 M2 answered 401 because private delivery is temporarily unready (no restart): the unconfirmed disclosure,
  // never "revoked"; once delivery is ready again the held value is indeed still valid. ---
  await pair(page);
  const heldR3 = (await mediaCookie()).value;
  deliveryUp = false;
  const r3Deletes = sessionsCalls.filter((c) => c.method === 'DELETE').length;
  await nav(page, 'Settings');
  await page.getByRole('button', { name: 'Disconnect local service', exact: true }).click();
  await page.waitForFunction(() => /could not be revoked|was revoked/.test(document.querySelector('#local-service-status')?.textContent ?? ''), null, { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(200);
  const r3Text = await statusText(page);
  deliveryUp = true;
  const r3Replay = await direct('GET', `/api/media/${webmAsset.id}/content`, { Cookie: `lt_media=${heldR3}`, Range: 'bytes=0-0' });
  check('R3 M2 401 while delivery is unready: "could not be revoked" disclosed, never "revoked"; the held value replays 206 once ready (no restart)',
    sessionsCalls.filter((c) => c.method === 'DELETE').length > r3Deletes && /could not be revoked/.test(r3Text) && !/was revoked/.test(r3Text) && r3Replay.status === 206, { replayAfterReady: r3Replay.status });

  // --- R2 Background M1 delayed before the server commit (request held in the browser), Disconnect meanwhile: no M2
  // until the M1 settled; "revoked" only afterwards; old and late values both 401. ---
  await pair(page);
  const oldR2 = (await mediaCookie()).value;
  let releaseM1; const m1Gate = new Promise((resolve) => { releaseM1 = resolve; }); let m1Held = 0;
  await page.route('**/api/media/session', async (route) => { if (route.request().method() === 'POST' && m1Held++ === 0) await m1Gate; await route.continue(); });
  const lateResponse = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/media/session'), { timeout: 20_000 });
  const r2DeletesBefore = sessionsCalls.filter((c) => c.method === 'DELETE').length;
  await pair(page); // reconnect: its background M1 is held
  await nav(page, 'Settings');
  await page.getByRole('button', { name: 'Disconnect local service', exact: true }).click();
  await page.waitForTimeout(1000);
  const r2DeletesWhileHeld = sessionsCalls.filter((c) => c.method === 'DELETE').length - r2DeletesBefore;
  const r2TextWhileHeld = await statusText(page);
  releaseM1();
  const lateSetCookie = await (await lateResponse).headerValue('set-cookie').catch(() => null);
  const lateR2 = /^lt_media=([^;]+)/.exec(lateSetCookie ?? '')?.[1];
  if (lateR2) secrets.add(lateR2);
  await page.waitForFunction(() => /could not be revoked|was revoked/.test(document.querySelector('#local-service-status')?.textContent ?? ''), null, { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  const r2Text = await statusText(page);
  const r2Replays = { old: (await direct('GET', `/api/media/${webmAsset.id}/content`, { Cookie: `lt_media=${oldR2}`, Range: 'bytes=0-0' })).status,
    late: lateR2 ? (await direct('GET', `/api/media/${webmAsset.id}/content`, { Cookie: `lt_media=${lateR2}`, Range: 'bytes=0-0' })).status : null };
  await page.unroute('**/api/media/session');
  check('R2 delayed background M1 vs Disconnect: no M2 while it is held, "revoked" only after, old and late values both 401',
    r2DeletesWhileHeld === 0 && !/was revoked/.test(r2TextWhileHeld) && /was revoked/.test(r2Text) && Boolean(lateR2) && r2Replays.old === 401 && r2Replays.late === 401,
    { deletesWhileHeld: r2DeletesWhileHeld, claimedWhileHeld: /was revoked/.test(r2TextWhileHeld), finalRevoked: /was revoked/.test(r2Text), finalDisclosed: /could not be revoked/.test(r2Text), replays: r2Replays, lateMinted: Boolean(lateR2) });

  // --- P10 Same-site page on another port embeds <video src=M4>. ---
  await pair(page);
  const other = createHttpServer((req, res) => {
    const host = req.headers.host.split(':')[0];
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><video muted autoplay src="http://${host}:${DEV}/api/media/${webmAsset.id}/content"></video>`);
  });
  await new Promise((resolve) => other.listen(OTHER, '127.0.0.1', resolve));
  try {
    const before = await effectsSnapshot();
    const embed = await context.newPage();
    const failures = []; embed.on('requestfailed', (r) => { if (/\/content$/.test(r.url())) failures.push(r.failure()?.errorText ?? ''); });
    const loopbackRows = await wireCapture(embed);
    await embed.goto(`http://127.0.0.1:${OTHER}/`);
    await embed.waitForTimeout(1500);
    const loopback = loopbackRows();
    check('P10 loopback same-site embed: Fetch Metadata same-site sent, server 403, zero effects (N08)', loopback.length > 0 && loopback.every((r) => r.site === 'same-site' && r.status === 403) && (await effectsSnapshot()) === before,
      { requests: loopback, failures });
    await embed.close();
    // LAN-HTTP-like: a non-loopback name mapped to 127.0.0.1 is not potentially trustworthy, so no Fetch Metadata.
    const lan = await context.newPage();
    await lan.goto(LAN_ORIGIN);
    await pair(lan, LAN_ORIGIN);
    const lanCookie = await mediaCookie(LAN_ORIGIN);
    const beforeLan = await effectsSnapshot();
    const lanEmbed = await context.newPage();
    const lanFailures = []; lanEmbed.on('requestfailed', (r) => { if (/\/content$/.test(r.url())) lanFailures.push(r.failure()?.errorText ?? ''); });
    const lanCapture = await wireCapture(lanEmbed);
    await lanEmbed.goto(`http://${LAN_HOST}:${OTHER}/`);
    await lanEmbed.waitForTimeout(2000);
    const lanRows = lanCapture();
    const delivered = await lanEmbed.evaluate(() => { const v = document.querySelector('video'); return { readyState: v.readyState, error: v.error?.code ?? null }; });
    check('P10 LAN-HTTP-like same-site embed: recorded (server may read; CORP blocks delivery); zero server effects', lanRows.length > 0 && (await effectsSnapshot()) === beforeLan && delivered.readyState === 0,
      { lanCookieMinted: Boolean(lanCookie), requests: lanRows, failures: lanFailures, delivered, note: 'design §3 accepted limit: no server-side read refusal on LAN HTTP' });
    await lanEmbed.close(); await lan.close();
  } finally { await new Promise((resolve) => other.close(resolve)); }

  check('no egress beyond the loopback test origins', egress.length === 0, { egress: [...new Set(egress)] });
  check('providers never invoked', providers === 0);
  say({ observedPeakActiveMediaSlots: peakSlots, m4RequestsSeen: media.length });
} catch (error) {
  await page?.screenshot({ path: `${SHOTS}/failure.png`, fullPage: true }).catch(() => undefined);
  say({ failureMain: ((await page?.locator('#app').innerText().catch(() => '')) ?? '').slice(0, 1500) });
  check('proof completed without an exception', false, { error: String(error?.stack ?? error).split('\n').slice(0, 4).join(' | ') });
} finally {
  clearInterval(sampler);
  await browser.close().catch(() => undefined);
  await dev.close().catch(() => undefined);
  await compiler.close().catch(() => undefined);
  if (service) await stopService().catch(() => undefined);
}
// Secret scan of everything this run printed (values were only ever in memory).
const leaked = [...secrets].filter((value) => value && printed.some((line) => line.includes(value)));
check('no bearer or cookie value in any proof output', leaked.length === 0, { scannedValues: secrets.size, lines: printed.length });
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ summary: { passed: results.length - failed.length, failed: failed.length, total: results.length } }));
exitCode = failed.length ? 1 : 0;
process.exit(exitCode);
