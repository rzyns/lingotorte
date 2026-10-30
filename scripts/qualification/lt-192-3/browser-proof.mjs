// lt-192.3 (ADR-0004) real-browser proof: real IndexedDB outbox, reload, same-origin two-tab interleaving, lost
// acknowledgement + service restart, cancel/claim race. Runs ENTIRELY inside one disposable container started with
// `--network none` (loopback only): the real local service (through Vite SSR, as the browser-batch runtime does), a
// Vite dev origin proxying /api to it, and the image's bundled Chromium. Synthetic fixture only; providers off.
// The pairing capability lives in this process's memory: it is typed into the masked Settings field and never
// printed, logged or written. Output: one JSON line per check plus a summary; exit 1 on any failed check.
//
//   docker build --target e2e -t lingotorte:lt1923-e2e .
//   docker run --rm --init --network none --shm-size 1g --entrypoint node lingotorte:lt1923-e2e scripts/qualification/lt-192-3/browser-proof.mjs
//
// Sections 7-9 (review corrections): storage-quota failure, both SIMULATED (an injected QuotaExceededError at the
// outbox add request) and ACTUAL (Chromium's own quota enforcement under a CDP-lowered origin quota: genuine
// QuotaExceededError from the storage engine, but not natural disk exhaustion); a dedup capture's unapplied draft
// disclosure across a reload; and a duplicated tab reproduced by seeding a new tab's sessionStorage with another
// live tab's dispatch id (what Chromium's Duplicate copies), proving the Web Lock refuses that identity.
//
// Section 10 (re-review R3): "Use my meaning" with a meaning+notes draft. Tab termination at the withheld replacement
// add (the independent reviewer's discriminator) and with the single handoff transaction in flight (both writes issued,
// kept alive, then the tab closed) must leave the draft or its durable replacement; notes stay disclosed until
// "Keep saved notes".
import { createServer as createViteServer } from '/app/node_modules/vite/dist/node/index.js';
import { request as httpRequest } from 'node:http';
import { mkdir, rm } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const SVC = 18451, DEV = 18452;
const ORIGIN = `http://127.0.0.1:${DEV}`;
const ROOT = '/tmp/lt-192-3-proof';
await rm(ROOT, { recursive: true, force: true });
await mkdir(ROOT, { recursive: true });

const results = [];
const check = (name, ok, detail = {}) => { const row = { check: name, ok: Boolean(ok), ...detail }; results.push(row); console.log(JSON.stringify(row)); };

process.env.LINGOTORTE_WEB_HOST = '127.0.0.1';
process.env.LINGOTORTE_WEB_ALLOWED_HOSTS = '127.0.0.1';
process.env.LINGOTORTE_PUBLIC_ORIGINS = ORIGIN;
process.env.LINGOTORTE_API_PROXY_TARGET = `http://127.0.0.1:${SVC}`;
const compiler = await createViteServer({ configFile: '/app/vite.config.ts', envFile: false, server: { middlewareMode: true, hmr: false }, logLevel: 'silent' });
const { startLingotorteLocalService: start } = await compiler.ssrLoadModule('/@fs/app/apps/local-service/src/server.ts');

let capability = '';
let service;
let providers = 0;
const forbidden = async () => { providers++; throw new Error('ProviderForbidden'); };
async function boot() {
  service = await start({ host: '127.0.0.1', port: SVC, publicOrigins: [ORIGIN], uiOrigins: [ORIGIN], databasePath: `${ROOT}/state.db`, scratchDir: `${ROOT}/scratch`, modelCacheDir: `${ROOT}/models`, allowOnlineProviders: false },
    { receiveCapability: (value) => { capability = value; }, fetchImpl: forbidden, elevenLabsHttpClient: forbidden, commandRunner: forbidden });
}
await boot();
const dev = await createViteServer({ configFile: '/app/vite.config.ts', server: { host: '127.0.0.1', port: DEV, strictPort: true, hmr: false }, logLevel: 'silent' });
await dev.listen();

/** Direct authenticated read of the service (server oracle); never leaves this process. */
function serviceState() {
  return new Promise((resolve, reject) => {
    const q = httpRequest({ hostname: '127.0.0.1', port: SVC, path: '/api/state', method: 'GET', headers: { Host: `127.0.0.1:${DEV}`, Origin: ORIGIN, Authorization: `Bearer ${capability}` } }, (r) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); } });
    });
    q.on('error', reject); q.end();
  });
}
const itemTexts = async () => Object.values((await serviceState()).snapshot.savedItems).map((i) => i.displayText).sort();

const browser = await chromium.launch();
const context = await browser.newContext({ serviceWorkers: 'block' });
const opPosts = [];
const egress = [];
context.on('request', (r) => {
  const url = new URL(r.url());
  if (url.protocol !== 'blob:' && url.protocol !== 'data:' && url.origin !== ORIGIN) egress.push(url.origin);
  if (r.method() === 'POST' && url.pathname === '/api/learner/operations') opPosts.push(JSON.parse(r.postData() ?? '{}').operationId);
});
const opResponses = [];
context.on('response', async (r) => {
  if (r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/learner/operations') { try { opResponses.push(await r.json()); } catch { opResponses.push(null); } }
});

const nav = (page, name) => page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name, exact: true }).click();
async function pair(page) {
  await nav(page, 'Settings');
  await page.fill('#local-service-url', ORIGIN);
  await page.fill('#local-service-capability', capability);
  await page.getByRole('button', { name: 'Connect local service', exact: true }).first().click();
  await page.waitForFunction(() => /Connected/.test(document.querySelector('#local-service-status')?.textContent ?? ''), null, { timeout: 15_000 })
    .catch(async (error) => { throw new Error(`pair: ${(await page.locator('#local-service-status').innerText().catch(() => '?')).slice(0, 160)} (${error.message.split('\n')[0]})`); });
}
async function outbox(page) {
  return page.evaluate(async () => {
    const db = await new Promise((ok, ko) => { const r = indexedDB.open('lingotorte-learner-operations'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
    try {
      if (!db.objectStoreNames.contains('operations')) return [];
      const rows = await new Promise((ok, ko) => { const r = db.transaction('operations').objectStore('operations').getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
      return rows.map((row) => ({ id: row.operationId, kind: row.request.kind, status: row.status, code: row.error?.code ?? null, owner: row.dispatch?.owner ?? null, draftReview: row.draftReview ?? null,
        draftResolved: row.draftResolved ?? null, itemId: row.request.payload?.savedItemId ?? null, meaning: row.request.payload?.meaning ?? null })).sort((a, b) => a.id.localeCompare(b.id));
    } finally { db.close(); }
  });
}
async function captureWord(page, index, meaning, notes) {
  await nav(page, 'Player');
  const word = page.locator('.cue-row .cue-word').nth(index);
  const text = (await word.innerText()).trim();
  await word.click();
  const panel = page.locator('.selection-panel');
  await panel.getByLabel('Meaning (optional)').fill(meaning);
  if (notes !== undefined) await panel.getByLabel('Notes (optional)').fill(notes);
  await panel.locator('[data-action="save-occurrence"]').click();
  return text;
}
const toastText = (page) => page.locator('.toast-region').innerText();
/** The id of a NEW durable pending intent: the add resolves after the click returns, so poll instead of reading once. */
async function newPendingId(page, before) {
  for (let i = 0; i < 100; i++) { const row = (await outbox(page)).find((r) => r.status === 'pending' && !before.includes(r.id)); if (row) return row.id; await page.waitForTimeout(50); }
  throw new Error('no new durable pending intent appeared');
}
async function saveNow(page) { await nav(page, 'Settings'); await page.getByRole('button', { name: 'Save state now', exact: true }).first().click(); }

let pageA; let pageB;
try {
  // --- Setup: pair, import the synthetic fixture (autosave saves media/tracks/bundles), then autosave OFF. ---
  pageA = await context.newPage();
  await pageA.goto(ORIGIN);
  await pair(pageA);
  await nav(pageA, 'Library');
  await pageA.getByRole('button', { name: 'Load synthetic fixture' }).first().click();
  await pageA.locator('.cue-row').first().waitFor();
  await pageA.waitForFunction(() => true);
  for (let i = 0; i < 50 && Object.keys((await serviceState()).snapshot.mediaAssets).length === 0; i++) await pageA.waitForTimeout(200);
  if (Object.keys((await serviceState()).snapshot.mediaAssets).length === 0) await saveNow(pageA);
  for (let i = 0; i < 50 && Object.keys((await serviceState()).snapshot.mediaAssets).length === 0; i++) await pageA.waitForTimeout(200);
  check('setup: fixture saved to the service', Object.keys((await serviceState()).snapshot.mediaAssets).length === 1, { status: (await pageA.locator('#local-service-status').innerText().catch(() => '')).slice(0, 200) });
  await nav(pageA, 'Settings');
  await pageA.locator('#local-service-autosave').uncheck();

  // --- 1. Autosave off: the capture is a durable pending intent (real IndexedDB), nothing sent, not "Saved". ---
  const w1 = await captureWord(pageA, 0, 'proof meaning one');
  await pageA.locator('.toast-region .toast-text').first().waitFor({ timeout: 5000 }).catch(() => undefined);
  const toast1 = await toastText(pageA);
  const rows1 = await outbox(pageA);
  const op1 = rows1[0]?.id;
  check('autosave off: pending intent durable in IndexedDB before any send', rows1.length === 1 && rows1[0].status === 'pending' && opPosts.length === 0, { rows: rows1.map((r) => r.status), posts: opPosts.length });
  check('autosave off: toast says not saved yet (never "Saved")', /Not saved yet/.test(toast1) && !/^Saved/.test(toast1), { toast: toast1.slice(0, 160) });
  check('autosave off: service unchanged', (await itemTexts()).length === 0);

  // --- 2. Reload: the pending intent is visible before pairing again. ---
  await pageA.reload();
  await nav(pageA, 'Saved');
  await pageA.locator('.pending-operations').waitFor({ timeout: 10_000 });
  check('reload: pending intent visible from IndexedDB before pairing', /Not saved yet \(1\)/.test(await pageA.locator('.pending-operations').innerText()));

  // --- 3. Second same-origin tab sees the same intent; both pair; simultaneous explicit Save sends it ONCE. ---
  pageB = await context.newPage();
  await pageB.goto(ORIGIN);
  await nav(pageB, 'Saved');
  await pageB.locator('.pending-operations').waitFor({ timeout: 10_000 });
  check('two tabs: second tab shows the same pending intent', /Not saved yet \(1\)/.test(await pageB.locator('.pending-operations').innerText()));
  await pair(pageA); await pair(pageB);
  const before3 = opPosts.length;
  await nav(pageA, 'Settings'); await nav(pageB, 'Settings');
  await Promise.all([pageA.getByRole('button', { name: 'Save state now', exact: true }).first().click(), pageB.getByRole('button', { name: 'Save state now', exact: true }).first().click()]);
  for (let i = 0; i < 50 && (await outbox(pageA)).some((r) => r.status !== 'acked'); i++) await pageA.waitForTimeout(100);
  const rows3 = await outbox(pageA);
  // Pairing either tab flushes; the explicit Saves race it. Count every POST of this operation id in the run.
  check('two tabs: one operation sent once across both tabs; acknowledged', opPosts.filter((id) => id === op1).length === 1 && rows3.every((r) => r.status === 'acked'), { posts: opPosts.filter((id) => id === op1).length, rows: rows3.map((r) => `${r.status}:${r.code}`), a: (await pageA.locator('#local-service-status').innerText()).slice(0, 200), b: (await pageB.locator('#local-service-status').innerText()).slice(0, 200) });
  check('two tabs: effect applied once on the service', JSON.stringify(await itemTexts()) === JSON.stringify([w1]), { items: (await itemTexts()).length });

  // --- 4. Lost acknowledgement after commit, then service restart and page reload: same id re-sent, applied once. ---
  const known2 = (await outbox(pageA)).map((r) => r.id);
  const w2 = await captureWord(pageA, 1, 'proof meaning two');
  const pendingId = await newPendingId(pageA, known2);
  // Every POST of this operation (from either tab) reaches the service and commits, but its response is lost.
  let dropped = 0;
  await context.route('**/api/learner/operations', async (route) => {
    if (JSON.parse(route.request().postData() ?? '{}').operationId !== pendingId) return route.continue();
    dropped++; const reply = await route.fetch(); await reply.body();
    await route.abort('failed');
  });
  await saveNow(pageA);
  for (let i = 0; i < 50 && dropped === 0; i++) await pageA.waitForTimeout(100);
  await pageA.waitForTimeout(300);
  const rows4 = await outbox(pageA);
  const committed = await itemTexts();
  check('lost ack: service committed (once), browser keeps the intent as may-have-sent', committed.includes(w2) && committed.length === 2 && rows4.find((r) => r.id === pendingId)?.status === 'sending', { status: rows4.find((r) => r.id === pendingId)?.status, sends: dropped });
  check('lost ack: toast never claimed saved', !/Saved \u201c/.test(await toastText(pageA)));
  await context.unroute('**/api/learner/operations');
  await service.close(); await boot(); // restart: new capability and process incarnation, same database
  await pageA.reload();
  await pair(pageA);
  await saveNow(pageA);
  for (let i = 0; i < 50 && (await outbox(pageA)).find((r) => r.id === pendingId)?.status !== 'acked'; i++) await pageA.waitForTimeout(100);
  // Responses of the pre-restart sends were all lost, so any response for this id came after the restart.
  const replay = opResponses.find((r) => r?.receipt?.operationId === pendingId);
  check('restart+reload: the same operation id is re-sent and its retained receipt replayed', opPosts.filter((id) => id === pendingId).length === dropped + 1 && replay?.replayed === true,
    { sendsTotal: opPosts.filter((id) => id === pendingId).length, lostBeforeRestart: dropped, replayed: replay?.replayed ?? null, final: (await outbox(pageA)).find((r) => r.id === pendingId)?.status });
  check('restart+reload: applied exactly once', JSON.stringify(await itemTexts()) === JSON.stringify([w1, w2].sort()), { items: (await itemTexts()).length });

  // --- 5. Cancel (tab B Discard) racing a claim (tab A Save): exactly one wins, consistently. ---
  await pair(pageB);
  for (const page of [pageA, pageB]) {
    await nav(page, 'Settings');
    if (await page.locator('#local-service-autosave').isChecked()) await page.locator('#local-service-autosave').uncheck();
  }
  const known3 = (await outbox(pageA)).map((r) => r.id);
  const w3 = await captureWord(pageA, 2, 'proof meaning three');
  const raceId = await newPendingId(pageA, known3);
  await nav(pageB, 'Saved');
  await pageB.locator(`.pending-operation[data-operation-id="${raceId}"]`).waitFor({ timeout: 10_000 }).catch(async () => {
    throw new Error(`race setup: outbox=${JSON.stringify(await outbox(pageB))} raceId=${raceId} panelB=${(await pageB.locator('.pending-operations').innerText().catch(() => 'none')).slice(0, 200)} autosave=${await pageA.evaluate(() => document.body.innerText.includes('Autosave to local service (off)'))}`);
  });
  await nav(pageA, 'Settings');
  const before5 = opPosts.length;
  await Promise.all([
    pageB.locator(`.pending-operation[data-operation-id="${raceId}"] button`, { hasText: 'Discard' }).click(),
    pageA.getByRole('button', { name: 'Save state now', exact: true }).first().click(),
  ]);
  await pageA.waitForTimeout(1500);
  const final5 = (await outbox(pageA)).find((r) => r.id === raceId)?.status;
  const sent5 = opPosts.slice(before5).includes(raceId);
  const items5 = await itemTexts();
  const consistent = (final5 === 'cancelled' && !sent5 && !items5.includes(w3)) || (final5 === 'acked' && sent5 && items5.includes(w3));
  check('cancel/claim race: one terminal outcome, consistent with the service', consistent, { final: final5, sent: sent5, onService: items5.includes(w3) });

  // --- 6. Outbox store semantics in real IndexedDB (separate proof database), including two tabs at once. ---
  const proof = await pageA.evaluate(async () => {
    const m = await import('/src/operationOutbox.ts');
    const name = 'lt-192-3-proof-outbox';
    await new Promise((ok) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => ok(undefined); });
    const backend = m.createIndexedDbOutboxBackend(indexedDB, name);
    const rec = (i, status = 'pending') => ({ operationId: crypto.randomUUID(), baseUrl: 'http://proof', order: i, createdAt: new Date().toISOString(), request: { operationId: 'x', kind: 'set-meaning', basis: { generation: 'gggggggg', incarnation: 'iiiiiiii', receiptSeq: 0 }, payload: {} }, status, attempts: 0, label: `proof ${i}` });
    const out = {};
    const first = rec(0);
    for (let i = 0; i < m.OUTBOX_CAP; i++) { const r = i === 0 ? first : rec(i); if (await backend.add(r) !== 'added') { out.capFilledEarly = i; break; } }
    out.overCap = await backend.add(rec(999));
    out.countAtCap = (await backend.list()).length;
    const fresh = m.createIndexedDbOutboxBackend(indexedDB, name); // another connection: committed data only
    out.durableOnOtherConnection = (await fresh.list()).length;
    const [claim, cancel] = await Promise.all([backend.transition(first.operationId, ['pending'], { status: 'sending' }), fresh.transition(first.operationId, ['pending'], { status: 'cancelled' })]);
    out.exactlyOneWinner = (claim === null) !== (cancel === null);
    const acked = await backend.transition(first.operationId, ['sending', 'pending'], { status: 'acked', resolvedAt: Date.now() });
    out.noResurrection = acked ? (await backend.transition(first.operationId, ['pending', 'sending'], { status: 'sending' })) === null : (await backend.transition(first.operationId, ['pending', 'sending'], { status: 'sending' })) === null;
    // Below the cap now (one record resolved): an add with an existing id aborts its transaction and writes nothing.
    const extra = rec(1000);
    try { await backend.add({ ...extra, operationId: first.operationId }); out.duplicateAccepted = true; } catch { out.duplicateAccepted = false; }
    const afterAbort = await backend.list();
    out.countAfterAbort = afterAbort.length;
    out.firstUnchanged = afterAbort.find((r) => r.operationId === first.operationId)?.label === first.label;
    out.addAfterResolve = await backend.add(rec(1001));
    out.raceTarget = (await backend.list()).find((r) => r.status === 'pending' && r.operationId !== first.operationId).operationId;
    return out;
  });
  check('IndexedDB: cap 200 refuses the 201st without evicting', proof.overCap === 'full' && proof.countAtCap === 200 && proof.capFilledEarly === undefined, proof);
  check('IndexedDB: an aborted transaction (duplicate id) writes nothing', proof.duplicateAccepted === false && proof.countAfterAbort === 200 && proof.firstUnchanged);
  check('IndexedDB: an add resolves only after commit (visible on another connection)', proof.durableOnOtherConnection === 200);
  check('IndexedDB: concurrent claim vs cancel has exactly one winner; terminal states never resurrect', proof.exactlyOneWinner && proof.noResurrection);
  check('IndexedDB: a resolved record frees a cap slot', proof.addAfterResolve === 'added');
  const race = (page) => page.evaluate(async (id) => {
    const m = await import('/src/operationOutbox.ts');
    const backend = m.createIndexedDbOutboxBackend(indexedDB, 'lt-192-3-proof-outbox');
    return (await backend.transition(id, ['pending'], { status: 'sending', dispatch: { owner: String(Math.random()), at: Date.now() } })) !== null;
  }, proof.raceTarget);
  const [aWon, bWon] = await Promise.all([race(pageA), race(pageB)]);
  check('IndexedDB: two tabs claiming one record concurrently: exactly one wins', aWon !== bWon, { aWon, bWon });


  // --- 7. Storage quota: a failed outbox write stores nothing, sends nothing, keeps the selection, says so. ---
  const panelMeaning = () => pageA.locator('.selection-panel').getByLabel('Meaning (optional)').inputValue().catch(() => null);
  const bodyText = () => pageA.locator('body').innerText();
  {
    // 7a. SIMULATED: a QuotaExceededError injected at the outbox `add` request boundary (test-controlled).
    await pageA.evaluate(() => {
      const original = IDBObjectStore.prototype.add;
      window.__lt1923RestoreAdd = () => { IDBObjectStore.prototype.add = original; };
      IDBObjectStore.prototype.add = function (...args) {
        if (this.name === 'operations' && this.transaction.db.name === 'lingotorte-learner-operations') throw new DOMException('', 'QuotaExceededError');
        return original.apply(this, args);
      };
    });
    const rowsBefore = (await outbox(pageA)).length; const postsBefore = opPosts.length; const itemsBefore = await itemTexts();
    await captureWord(pageA, 3, 'quota simulated');
    await pageA.waitForTimeout(500);
    const text = await bodyText();
    check('quota SIMULATED (injected QuotaExceededError at the outbox add request): nothing stored or sent, selection kept, visible error',
      (await outbox(pageA)).length === rowsBefore && opPosts.length === postsBefore && JSON.stringify(await itemTexts()) === JSON.stringify(itemsBefore)
        && /could not store the vocabulary change \(QuotaExceededError\)/.test(text) && (await panelMeaning()) === 'quota simulated' && !/Not saved yet: |Saved \u201c/.test(await toastText(pageA)),
      { simulated: true, rows: (await outbox(pageA)).length - rowsBefore, posts: opPosts.length - postsBefore, meaningKept: await panelMeaning(),
        shownError: (text.match(/[^\n]*could not store[^\n]*/) ?? [null])[0]?.slice(0, 200) ?? null, toast: (await toastText(pageA)).slice(0, 120) });
    await pageA.evaluate(() => window.__lt1923RestoreAdd());
  }
  {
    // 7b. ACTUAL: Chromium's quota manager enforces a lowered origin quota (CDP Storage.overrideQuotaForOrigin) in a
    // fresh context of the same browser (own storage); incompressible filler bytes consume it; then the app's real
    // model path (paired model, real IndexedDB outbox in `lingotorte-learner-operations`) records a vocabulary change.
    const qContext = await browser.newContext({ serviceWorkers: 'block' });
    const qPosts = [];
    qContext.on('request', (r) => { const u = new URL(r.url()); if (r.method() === 'POST' && u.pathname === '/api/learner/operations') qPosts.push(1); if (u.protocol !== 'blob:' && u.protocol !== 'data:' && u.origin !== ORIGIN) egress.push(u.origin); });
    const qPage = await qContext.newPage();
    await qPage.goto(ORIGIN);
    const cdp = await qContext.newCDPSession(qPage);
    await cdp.send('Storage.overrideQuotaForOrigin', { origin: ORIGIN, quotaSize: 2 * 1024 * 1024 });
    const overridden = await cdp.send('Storage.getUsageAndQuota', { origin: ORIGIN });
    const fillQuota = (page) => page.evaluate(async () => {
      const db = await new Promise((ok, ko) => { const r = indexedDB.open('lt-192-3-quota-filler', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
      let key = 0; const errors = [];
      const put = (size) => new Promise((ok) => {
        const a = new Uint8Array(size); for (let o = 0; o < size; o += 65536) crypto.getRandomValues(a.subarray(o, Math.min(size, o + 65536)));
        const tx = db.transaction('s', 'readwrite'); tx.objectStore('s').put(a, key++);
        tx.oncomplete = () => ok(null); tx.onabort = () => ok(tx.error?.name ?? 'AbortError');
      });
      for (const size of [262144, 16384, 1024, 128]) for (let i = 0; i < 200; i++) { const e = await put(size); if (e) { errors.push(`${size}:${e}`); break; } }
      db.close();
      return { errors, writes: key };
    });
    const run = (page, phase) => page.evaluate(async ([cap, origin, phase]) => {
      const m = await import('/src/model.ts');
      const model = window.__lt1923QuotaModel ??= m.createAppModel();
      if (phase === 'connect') { m.pairLocalService(model, cap, origin); const c = await m.connectLocalService(model, origin); return { connected: c.ok, active: m.learnerOperationsActive(model), durable: model.learnerOperations.durable }; }
      const list = () => new Promise((ok, ko) => { const r = indexedDB.open('lingotorte-learner-operations'); r.onsuccess = () => { const db = r.result; const g = db.transaction('operations').objectStore('operations').getAll(); g.onsuccess = () => { db.close(); ok(g.result.length); }; g.onerror = () => ko(g.error); }; r.onerror = () => ko(r.error); });
      const item = Object.values(model.store.snapshot().savedItems)[0];
      const before = await list();
      model.learnerOperations.message = null;
      m.setLocalServiceAutosave(model, false);
      m.setSavedItemMeaning(model, item.id, `quota ${phase} ${Date.now()}`);
      await m.learnerOperationsIdle(model);
      for (let i = 0; i < 20 && model.learnerOperations.message === null && (await list()) === before; i++) await new Promise((r) => setTimeout(r, 50));
      return { stored: (await list()) - before, message: model.learnerOperations.message };
    }, [capability, ORIGIN, phase]);
    const connected = await run(qPage, 'connect');
    const fill = await fillQuota(qPage);
    const failed = await run(qPage, 'exhausted');
    const actualQuota = fill.errors.length === 4 && fill.errors.every((e) => e.endsWith(':QuotaExceededError'));
    check('quota ACTUAL (real Chromium QuotaExceededError under a CDP-lowered origin quota; not natural disk exhaustion): the real outbox write fails, nothing stored or sent, named error',
      connected.connected && connected.active && connected.durable && overridden.overrideActive && actualQuota && failed.stored === 0 && qPosts.length === 0
        && /could not store the vocabulary change \(QuotaExceededError\)/.test(failed.message ?? ''),
      { simulated: false, quotaOverride: true, quotaAfterOverride: overridden.quota, overrideActive: overridden.overrideActive, fillerErrors: fill.errors, fillerWrites: fill.writes, stored: failed.stored, posts: qPosts.length, message: (failed.message ?? '').slice(0, 160), connected });
    await qPage.evaluate(() => new Promise((ok) => { const r = indexedDB.deleteDatabase('lt-192-3-quota-filler'); r.onsuccess = r.onerror = r.onblocked = () => ok(undefined); }));
    await cdp.send('Storage.overrideQuotaForOrigin', { origin: ORIGIN });
    const recovered = await run(qPage, 'freed');
    check('quota: after freeing storage the same change is stored durably (pending intent)', recovered.stored === 1 && !/could not store/.test(recovered.message ?? ''), { stored: recovered.stored, message: (recovered.message ?? '').slice(0, 120) });
    await cdp.detach().catch(() => undefined);
    await qContext.close();
  }

  // --- 8. A dedup capture's unapplied meaning stays disclosed across Save and reload until explicitly resolved. ---
  {
    // Close the 7a selection that stayed open after its failed save, then flush anything pending.
    await nav(pageA, 'Player');
    if (await pageA.locator('.selection-panel').count()) await pageA.locator('.selection-panel').getByRole('button', { name: 'Cancel', exact: true }).click().catch(() => undefined);
    await saveNow(pageA);
    for (let i = 0; i < 50 && (await outbox(pageA)).some((r) => r.status === 'pending' || r.status === 'sending'); i++) await pageA.waitForTimeout(100);
    const known8 = (await outbox(pageA)).map((r) => r.id);
    await captureWord(pageA, 0, 'proof different meaning'); // w1 again: joins the existing item
    await newPendingId(pageA, known8);
    await saveNow(pageA);
    for (let i = 0; i < 50 && !(await outbox(pageA)).some((r) => r.draftReview === 'open'); i++) await pageA.waitForTimeout(100);
    const status = await pageA.locator('#local-service-status').innerText().catch(() => '');
    const banner = await bodyText();
    await nav(pageA, 'Saved');
    const shown = await pageA.locator('.unapplied-drafts').innerText().catch(() => '');
    check('dedup draft: Save does not claim all saved and the unapplied meaning is shown', !/All changes saved/.test(status) && /not applied/.test(banner) && shown.includes('proof different meaning'), { shown: shown.slice(0, 200) });
    await pageA.reload();
    await nav(pageA, 'Saved');
    await pageA.locator('.unapplied-drafts').waitFor({ timeout: 10_000 }).catch(() => undefined);
    const reloaded = await pageA.locator('.unapplied-drafts').innerText().catch(() => '');
    const draftId = (await outbox(pageA)).find((r) => r.draftReview === 'open')?.id;
    check('dedup draft: still disclosed after a reload (durable outbox), never auto-applied', reloaded.includes('proof different meaning') && Boolean(draftId)
      && Object.values((await serviceState()).snapshot.savedItems).find((i) => i.displayText === w1)?.meaning === 'proof meaning one');
    await pageA.locator(`.unapplied-draft[data-operation-id="${draftId}"] button`, { hasText: 'Keep saved' }).click();
    for (let i = 0; i < 30 && (await outbox(pageA)).find((r) => r.id === draftId)?.draftReview === 'open'; i++) await pageA.waitForTimeout(100);
    check('dedup draft: "Keep saved" resolves it explicitly; the service meaning is unchanged',
      (await outbox(pageA)).find((r) => r.id === draftId)?.draftReview === 'dismissed' && (await pageA.locator('.unapplied-drafts').count()) === 0
        && Object.values((await serviceState()).snapshot.savedItems).find((i) => i.displayText === w1)?.meaning === 'proof meaning one');
    await pair(pageA);
  }

  // --- 9. Duplicated tab: a new tab whose sessionStorage carries tab A's dispatch id (as Chromium's Duplicate copies
  //        it) must not take A's identity while A is alive; once A is gone, the same seeded id IS adopted. ---
  {
    const TAB_KEY = 'lingotorte-operation-tab';
    const idA = await pageA.evaluate((k) => sessionStorage.getItem(k), TAB_KEY);
    const locksA = await pageA.evaluate(async () => (await navigator.locks.query()).held.map((l) => l.name));
    // An operation A has claimed and possibly sent (lost acknowledgement): `sending`, owned by A's id.
    for (const page of [pageA]) { await nav(page, 'Settings'); if (await page.locator('#local-service-autosave').isChecked()) await page.locator('#local-service-autosave').uncheck(); }
    const known9 = (await outbox(pageA)).map((r) => r.id);
    const w9 = await captureWord(pageA, 4, 'proof meaning nine');
    const inflight = await newPendingId(pageA, known9);
    let lost = 0;
    await context.route('**/api/learner/operations', async (route) => {
      if (JSON.parse(route.request().postData() ?? '{}').operationId !== inflight) return route.continue();
      lost++; const reply = await route.fetch(); await reply.body(); await route.abort('failed');
    });
    await saveNow(pageA);
    for (let i = 0; i < 50 && lost === 0; i++) await pageA.waitForTimeout(100);
    await pageA.waitForTimeout(300);
    await context.unroute('**/api/learner/operations');
    const owned = (await outbox(pageA)).find((r) => r.id === inflight);
    // Test-controlled: keep the dispatch lease fresh so only the dispatch IDENTITY can permit an early re-send.
    const freshenLease = (page) => page.evaluate(async (id) => {
      const db = await new Promise((ok, ko) => { const r = indexedDB.open('lingotorte-learner-operations'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
      await new Promise((ok, ko) => { const tx = db.transaction('operations', 'readwrite'); const os = tx.objectStore('operations'); const g = os.get(id); g.onsuccess = () => { const row = g.result; os.put({ ...row, dispatch: { ...row.dispatch, at: Date.now() } }); }; tx.oncomplete = ok; tx.onabort = () => ko(tx.error); });
      db.close();
    }, inflight);
    const seeded = async (page) => page.addInitScript(([k, id]) => { if (sessionStorage.getItem(k) === null) sessionStorage.setItem(k, id); window.__lt1923Seeded = sessionStorage.getItem(k); }, [TAB_KEY, idA]);
    const postsOf = (page) => { const ids = []; page.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/learner/operations') ids.push(JSON.parse(r.postData() ?? '{}').operationId); }); return ids; };
    const pageC = await context.newPage(); await seeded(pageC); const postsC = postsOf(pageC);
    await freshenLease(pageA);
    await pageC.goto(ORIGIN);
    await pair(pageC);
    await nav(pageC, 'Settings'); if (await pageC.locator('#local-service-autosave').isChecked()) await pageC.locator('#local-service-autosave').uncheck();
    await freshenLease(pageC);
    await saveNow(pageC);
    await pageC.waitForTimeout(1500);
    const c = await pageC.evaluate((k) => ({ seededWith: window.__lt1923Seeded, now: sessionStorage.getItem(k) }), TAB_KEY);
    const locksC = await pageC.evaluate(async () => (await navigator.locks.query()).held.map((l) => l.name));
    check('duplicated tab: copied sessionStorage seeds A\u2019s live id, but A\u2019s Web Lock refuses it and the tab uses a fresh dispatch id',
      Boolean(idA) && owned?.owner === idA && owned?.status === 'sending' && lost >= 1 && locksA.includes(`lingotorte-operation-tab:${idA}`)
        && c.seededWith === idA && c.now !== idA && locksC.includes(`lingotorte-operation-tab:${idA}`) && locksC.includes(`lingotorte-operation-tab:${c.now}`),
      { seededEqualsA: c.seededWith === idA, adoptedDiffers: c.now !== idA, ownerIsA: owned?.owner === idA, aLockHeld: locksC.includes(`lingotorte-operation-tab:${idA}`) });
    check('duplicated tab: cannot dispatch A\u2019s in-flight operation within A\u2019s lease (no shared dispatch identity)',
      !postsC.includes(inflight) && (await outbox(pageC)).find((r) => r.id === inflight)?.owner === idA, { postsFromDuplicate: postsC.filter((id) => id === inflight).length });
    // Positive control: with A gone (its lock released), a tab seeded with the same id adopts it, like a reload, and
    // re-sends A's possibly-sent operation at once (fresh lease): the service replays its receipt, one effect.
    await pageC.close(); await pageA.close();
    const pageD = await context.newPage(); await seeded(pageD); const postsD = postsOf(pageD);
    const responsesD = []; pageD.on('response', async (r) => { if (r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/learner/operations') { try { responsesD.push(await r.json()); } catch { /* ignore */ } } });
    await pageD.goto(ORIGIN);
    const d = await pageD.evaluate((k) => ({ seededWith: window.__lt1923Seeded, now: sessionStorage.getItem(k) }), TAB_KEY);
    await freshenLease(pageD);
    await pair(pageD);
    await saveNow(pageD);
    for (let i = 0; i < 50 && (await outbox(pageD)).find((r) => r.id === inflight)?.status !== 'acked'; i++) await pageD.waitForTimeout(100);
    const replayD = responsesD.find((r) => r?.receipt?.operationId === inflight);
    check('duplicated tab control: with A closed, the seeded id is adopted and A\u2019s in-flight operation is re-sent and replayed once',
      d.seededWith === idA && d.now === idA && postsD.includes(inflight) && replayD?.replayed === true && (await itemTexts()).filter((t) => t === w9).length === 1,
      { adopted: d.now === idA, resent: postsD.filter((id) => id === inflight).length, replayed: replayD?.replayed ?? null });
    pageA = pageD;
  }

  // --- 10. Re-review R3: "Use my meaning" hands the draft off to its replacement in ONE IndexedDB transaction, and
  //         never resolves the notes draft. Tab termination at the replacement add (the independent reviewer's exact
  //         discriminator) and with the handoff transaction in flight both leave the draft or its replacement. ---
  {
    const settled = (page) => page.waitForFunction(() => /All changes saved|Saved local state|not applied|not saved|conflict/i.test(document.querySelector('#local-service-status')?.textContent ?? ''), null, { timeout: 10_000 });
    const w1Item = async () => Object.values((await serviceState()).snapshot.savedItems).find((i) => i.displayText === w1);
    const draftText = (page) => page.locator('.unapplied-drafts').innerText().catch(() => '');
    const buttonsOf = (page, id) => page.locator(`.unapplied-draft[data-operation-id="${id}"] button`).allInnerTexts();
    const openPage = async () => { const page = await context.newPage(); await page.goto(ORIGIN); await pair(page); await nav(page, 'Settings'); if (await page.locator('#local-service-autosave').isChecked()) await page.locator('#local-service-autosave').uncheck(); return page; };
    await nav(pageA, 'Settings');
    if (await pageA.locator('#local-service-autosave').isChecked()) await pageA.locator('#local-service-autosave').uncheck();
    const before = await w1Item();
    const known = (await outbox(pageA)).map((r) => r.id);
    await captureWord(pageA, 0, 'durable transfer draft', 'proof unapplied notes'); // w1 again: joins the existing item
    const id = await newPendingId(pageA, known);
    await saveNow(pageA);
    for (let i = 0; i < 50 && (await outbox(pageA)).find((r) => r.id === id)?.draftReview !== 'open'; i++) await pageA.waitForTimeout(50);
    await nav(pageA, 'Saved');
    const shown = await draftText(pageA);
    check('R3 notes+meaning draft: both disclosed with precise meaning and notes actions',
      shown.includes('durable transfer draft') && shown.includes('proof unapplied notes') && JSON.stringify(await buttonsOf(pageA, id)) === JSON.stringify(['Use my meaning', 'Keep saved meaning', 'Keep saved notes']),
      { buttons: await buttonsOf(pageA, id) });
    // 10a. The reviewer's discriminator, unchanged: withhold the replacement add request, then close the tab.
    await pageA.evaluate(() => {
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (record, ...rest) {
        if (this.transaction.db.name === 'lingotorte-learner-operations' && record.request?.kind === 'set-meaning') { window.__replacementAddReached = true; return {}; }
        return add.call(this, record, ...rest);
      };
    });
    await pageA.locator(`.unapplied-draft[data-operation-id="${id}"] button`, { hasText: 'Use my meaning' }).click();
    await pageA.waitForFunction(() => window.__replacementAddReached === true);
    await pageA.close();
    pageA = await openPage();
    const afterA = await outbox(pageA);
    const draftA = afterA.find((r) => r.id === id);
    const replacementsA = afterA.filter((r) => r.kind === 'set-meaning' && r.itemId === before.id);
    await saveNow(pageA); await settled(pageA);
    const statusA = await pageA.locator('#local-service-status').innerText();
    await nav(pageA, 'Saved');
    check('R3a real IndexedDB: tab closed at the withheld replacement add leaves the meaning AND notes draft open, no replacement, never "all saved"',
      draftA?.draftReview === 'open' && !draftA?.draftResolved && replacementsA.length === 0 && !/All changes saved/.test(statusA) && /not applied/.test(statusA)
        && (await w1Item()).meaning === before.meaning && (await draftText(pageA)).includes('proof unapplied notes') && (await buttonsOf(pageA, id)).includes('Use my meaning'),
      { draft: draftA ?? null, replacements: replacementsA.length, status: statusA.slice(0, 160) });
    // 10b. Tab killed with the handoff transaction IN FLIGHT: both writes issued (replacement add succeeded, original
    //      put issued), the transaction kept alive by further requests, then the tab is closed before it commits.
    await pageA.evaluate((draftId) => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (record, ...rest) {
        const request = put.call(this, record, ...rest);
        if (this.transaction.db.name === 'lingotorte-learner-operations' && record?.operationId === draftId && record.draftResolved?.meaning) {
          const store = this; const spin = () => { store.get('lt1923-keepalive').onsuccess = spin; }; spin();
          window.__handoffInFlight = true;
        }
        return request;
      };
    }, id);
    await pageA.locator(`.unapplied-draft[data-operation-id="${id}"] button`, { hasText: 'Use my meaning' }).click();
    await pageA.waitForFunction(() => window.__handoffInFlight === true);
    await pageA.close();
    pageA = await openPage();
    const afterB = await outbox(pageA);
    const draftB = afterB.find((r) => r.id === id);
    const replacementsB = afterB.filter((r) => r.kind === 'set-meaning' && r.itemId === before.id);
    const nothing = draftB?.draftReview === 'open' && !draftB?.draftResolved && replacementsB.length === 0;
    const both = draftB?.draftReview === 'open' && draftB?.draftResolved?.meaning === 'applied' && draftB?.draftResolved?.notes === undefined && replacementsB.length === 1 && replacementsB[0].meaning === 'durable transfer draft' && replacementsB[0].status === 'pending';
    check('R3a real IndexedDB: tab killed with the handoff transaction in flight is atomic (all or nothing); the notes stay open either way',
      (nothing || both) && (await w1Item()).meaning === before.meaning, { outcome: nothing ? 'aborted: draft open, no replacement' : both ? 'committed: replacement pending' : 'NEITHER/BOTH', draft: draftB ?? null, replacements: replacementsB.length });
    // 10c. Ordinary handoff, then Save and reload: the meaning is applied by its own operation; the notes stay disclosed.
    await nav(pageA, 'Saved');
    if (nothing) {
      await pageA.locator(`.unapplied-draft[data-operation-id="${id}"] button`, { hasText: 'Use my meaning' }).click();
      for (let i = 0; i < 50 && !(await outbox(pageA)).some((r) => r.kind === 'set-meaning' && r.itemId === before.id); i++) await pageA.waitForTimeout(50);
    }
    const handed = await outbox(pageA);
    await saveNow(pageA); await settled(pageA);
    for (let i = 0; i < 50 && (await outbox(pageA)).some((r) => r.kind === 'set-meaning' && r.itemId === before.id && r.status !== 'acked'); i++) await pageA.waitForTimeout(100);
    const statusC = await pageA.locator('#local-service-status').innerText();
    const itemC = await w1Item();
    await pageA.reload(); await pair(pageA); await nav(pageA, 'Saved');
    await pageA.locator('.unapplied-drafts').waitFor({ timeout: 10_000 }).catch(() => undefined);
    const reloadedC = await draftText(pageA);
    const draftC = (await outbox(pageA)).find((r) => r.id === id);
    check('R3b real IndexedDB: "Use my meaning" applies only the meaning; Save is not "all saved"; after reload the notes are still disclosed with only "Keep saved notes"',
      handed.filter((r) => r.kind === 'set-meaning' && r.itemId === before.id).length === 1 && !/All changes saved/.test(statusC) && /not applied/.test(statusC)
        && itemC.meaning === 'durable transfer draft' && (itemC.notes ?? null) === (before.notes ?? null)
        && draftC?.draftReview === 'open' && draftC?.draftResolved?.meaning === 'applied' && reloadedC.includes('proof unapplied notes') && JSON.stringify(await buttonsOf(pageA, id)) === JSON.stringify(['Keep saved notes']),
      { status: statusC.slice(0, 160), draft: draftC ?? null, buttons: await buttonsOf(pageA, id) });
    await pageA.locator(`.unapplied-draft[data-operation-id="${id}"] button`, { hasText: 'Keep saved notes' }).click();
    for (let i = 0; i < 30 && (await outbox(pageA)).find((r) => r.id === id)?.draftReview === 'open'; i++) await pageA.waitForTimeout(100);
    await saveNow(pageA); await settled(pageA);
    const statusD = await pageA.locator('#local-service-status').innerText();
    check('R3b real IndexedDB: only the explicit "Keep saved notes" closes the disclosure; then all saved, notes unchanged on the service',
      (await outbox(pageA)).find((r) => r.id === id)?.draftReview === 'applied' && (await pageA.locator('.unapplied-drafts').count()) === 0 && /All changes saved|Saved local state/.test(statusD)
        && ((await w1Item()).notes ?? null) === (before.notes ?? null),
      { status: statusD.slice(0, 160) });
  }

  check('no egress beyond the page origin; providers never called', egress.length === 0 && providers === 0, { egress: [...new Set(egress)], providers });
} catch (error) {
  check('proof run completed without an exception', false, { error: error instanceof Error ? `${error.name}: ${error.message.split('\n')[0]}` : 'unknown' });
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  await dev.close().catch(() => undefined);
  await service?.close().catch(() => undefined);
  await compiler.close().catch(() => undefined);
  await rm(ROOT, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ summary: { checks: results.length, passed: results.length - failed.length, failed: failed.map((r) => r.check) } }));
process.exit(failed.length ? 1 : 0);
