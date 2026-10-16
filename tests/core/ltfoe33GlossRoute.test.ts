import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { request } from 'node:http';
import { startPairedService, pairedFetch } from '../helpers/pairedService.ts';
import { GLOSS_ROUTE, makeGlossService, validateGlossRequest } from '../../apps/local-service/src/gloss.ts';
import type { LocalServiceRuntime } from '../../apps/local-service/src/server.ts';
import { GLOSS_ATTRIBUTION, openGlossStore } from '../../packages/language/src/glossStore.ts';
import { withNoNetwork } from '../no-network/networkTrap';

// lt-foe.3.3: local POST /api/language/gloss over the derived gloss SQLite (synthetic fixture only).
vi.setConfig({ testTimeout: 60_000 });

const repo = resolve(import.meta.dirname, '../..');
const fixture = join(repo, 'tests/fixtures/gloss/synthetic-gloss-route.jsonl');
type Json = Record<string, any>;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function tempDir() { const root = mkdtempSync(join(tmpdir(), 'ltfoe33-')); roots.push(root); return root; }
let built: string | undefined;
function glossDb(): string {
  if (!built) {
    const dir = mkdtempSync(join(tmpdir(), 'ltfoe33-db-'));
    built = join(dir, 'glosses-pl.sqlite');
    const r = spawnSync(process.execPath, [join(repo, 'scripts/import-glosses.ts'), '--input', fixture, '--output', built, '--dump-date', '2026-10-03'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`import failed: ${r.stderr}`);
  }
  const copy = join(tempDir(), 'glosses-pl.sqlite');
  copyFileSync(built, copy);
  return copy;
}

function raw(origin: string, path: string, method: string, headers: string[], body?: string) {
  return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>((ok, fail) => {
    const req = request(origin, { path, method, headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => ok({ status: res.statusCode!, body: Buffer.concat(chunks).toString(), headers: res.headers }));
    });
    req.on('error', fail); req.end(body);
  });
}

describe('lt-foe.3.3 local gloss route', () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });

  async function start(runtime: LocalServiceRuntime = {}) {
    const root = await mkdtemp(join(tmpdir(), 'ltfoe33-svc-'));
    let token = '';
    const service = await startPairedService({ host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'),
      scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false },
    { ...runtime, receiveCapability: value => { token = value; } });
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
    return { service, token: () => token, root };
  }
  const post = (origin: string, body: unknown) => pairedFetch(`${origin}${GLOSS_ROUTE}`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const status = async (origin: string) => (await (await pairedFetch(`${origin}/api/status`)).json() as Json).language.gloss;

  it('returns available results with exact source/attribution: lemma, form-of, alternative and no-entry', async () => {
    const dbPath = glossDb();
    const { service } = await start({ gloss: { dbPath } });
    const res = await post(service.origin, { language: 'pl', queries: [
      { lemma: 'dom', upos: 'NOUN' },
      { lemma: 'domu' },
      { lemma: 'mieć', upos: 'VERB', alternatives: [{ lemma: 'mama', upos: 'NOUN' }] },
      { lemma: 'stać', upos: 'VERB', alternatives: [{ lemma: 'stanąć', upos: 'VERB' }] },
      { lemma: 'kot', upos: 'VERB' },
      { lemma: 'xqzvbrt', upos: 'X', alternatives: [{ lemma: 'zzz' }] },
    ] });
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as Json;
    expect(body.status).toBe('available');
    expect(body.source).toEqual({ id: 'kaikki-enwiktionary-pl-2026-10-03', name: expect.any(String), licence: 'CC BY-SA 4.0 and GFDL',
      url: expect.stringMatching(/^https:\/\//), attribution: GLOSS_ATTRIBUTION, dumpDate: '2026-10-03' });
    const [dom, domu, mamy, stac, kot, none] = body.results;
    expect(dom).toMatchObject({ queryIndex: 0, found: true, via: 'lemma', lemma: 'dom', upos: 'NOUN' });
    expect(dom.senses.map((s: Json) => s.gloss)).toEqual(['house (synthetic)', 'home (synthetic)', 'household (synthetic)']);
    expect(dom.senses[0]).toEqual({ gloss: 'house (synthetic)', pos: 'noun', upos: 'NOUN', tags: ['inanimate'] });
    expect(domu).toMatchObject({ queryIndex: 1, found: true, via: 'form-of', lemma: 'dom', formOf: 'domu', upos: 'NOUN', otherReadings: [] });
    expect(mamy).toMatchObject({ queryIndex: 2, found: true, via: 'alternative', lemma: 'mama', upos: 'NOUN' });
    expect(mamy.senses[0].gloss).toBe('mum (synthetic)');
    // Primary 'stać' has only a NOUN gloss; the VERB alternative has a VERB gloss, so the alternative wins.
    expect(stac).toMatchObject({ queryIndex: 3, found: true, via: 'alternative', lemma: 'stanąć', upos: 'VERB' });
    expect(kot).toMatchObject({ found: true, via: 'lemma', lemma: 'kot' });
    expect(kot.senses[0].upos).toBe('VERB');
    expect(none).toEqual({ queryIndex: 5, found: false, via: null, lemma: 'xqzvbrt', upos: 'X', senses: [], otherReadings: [] });
    for (const r of body.results) expect(Array.isArray(r.otherReadings), String(r.queryIndex)).toBe(true);
    expect(text).not.toMatch(/sqlite|ltfoe33|[A-Za-z]:\\|\/tmp\//);
  });

  it('keeps a primary with a mismatched POS when no alternative matches, and honours maxSenses', async () => {
    const { service } = await start({ gloss: { dbPath: glossDb() } });
    const body = await (await post(service.origin, { language: 'pl', maxSenses: 1, queries: [
      { lemma: 'stać', upos: 'VERB', alternatives: [{ lemma: 'nieznane', upos: 'VERB' }] }, { lemma: 'dom' }] })).json() as Json;
    expect(body.results[0]).toMatchObject({ found: true, via: 'lemma', lemma: 'stać' });
    expect(body.results[1].senses).toHaveLength(1);
  });

  it('returns otherReadings: the greeting reading of cześć next to the chosen NOUN reading', async () => {
    const { service } = await start({ gloss: { dbPath: glossDb() } });
    const body = await (await post(service.origin, { language: 'pl', maxSenses: 2, queries: [
      { lemma: 'cześć', upos: 'NOUN', alternatives: [{ lemma: 'cześć', upos: 'INTJ' }, { lemma: 'cześć', upos: 'NOUN' }, { lemma: 'cześć', upos: 'INTJ' }] },
      { lemma: 'kot', upos: 'NOUN', alternatives: [{ lemma: 'kot', upos: 'VERB' }, { lemma: 'nieznane' }, { lemma: 'domu', upos: 'NOUN' }] },
    ] })).json() as Json;
    const [czesc, kot] = body.results;
    expect(czesc).toMatchObject({ found: true, via: 'lemma', lemma: 'cześć', upos: 'NOUN' });
    expect(czesc.senses.map((s: Json) => s.gloss)).toEqual(['esteem (synthetic noun)', 'regard (synthetic noun)']);
    // Same (lemma, upos) as the chosen result is dropped; duplicates collapse; senses are filtered to the reading's UPOS.
    expect(czesc.otherReadings).toEqual([{ lemma: 'cześć', upos: 'INTJ', hop: 'lemma', senses: [
      { gloss: 'hiya (synthetic greeting)', pos: 'intj', upos: 'INTJ', tags: [] }, { gloss: 'byebye (synthetic farewell)', pos: 'intj', upos: 'INTJ', tags: [] }] }]);
    // Request order kept; not-found alternatives skipped; a form-of alternative carries formOf = the queried form.
    expect(kot.otherReadings.map((r: Json) => [r.lemma, r.upos, r.hop, r.formOf])).toEqual([['kot', 'VERB', 'lemma', undefined], ['dom', 'NOUN', 'form-of', 'domu']]);
    expect(kot.otherReadings[1].senses).toHaveLength(2);
  });

  it('surfaces unresolved form-of text: as a result and as another reading (cześć NOUN vs INTJ case)', async () => {
    const { service } = await start({ gloss: { dbPath: glossDb() } });
    const body = await (await post(service.origin, { language: 'pl', queries: [
      { lemma: 'witajka', upos: 'NOUN', alternatives: [{ lemma: 'witajka', upos: 'INTJ' }] },
      { lemma: 'synthfoa' },
      { lemma: 'witajka', upos: 'INTJ' },
    ] })).json() as Json;
    const [noun, foa, intj] = body.results;
    expect(noun).toMatchObject({ found: true, via: 'lemma', lemma: 'witajka', upos: 'NOUN' });
    expect(noun.otherReadings).toEqual([{ lemma: 'witajka', upos: 'INTJ', hop: 'form-of-text',
      senses: [{ gloss: 'Form of synthetic greeting; hi (synthetic)', pos: 'intj', upos: 'INTJ', tags: ['form-of'] }] }]);
    expect(foa).toEqual({ queryIndex: 1, found: true, via: 'form-of-text', lemma: 'synthfoa', upos: 'NOUN',
      senses: [{ gloss: 'genitive plural of synthfoo (synthetic)', pos: 'noun', upos: 'NOUN', tags: ['form-of', 'genitive', 'plural'] }], otherReadings: [] });
    expect(intj).toMatchObject({ found: true, via: 'form-of-text', lemma: 'witajka', upos: 'INTJ' });
    expect(intj).not.toHaveProperty('formOf');
    expect(noun).not.toHaveProperty('hop');
  });

  it('labels the chosen alternative with its own store hop (lemma, form-of, form-of-text)', async () => {
    const { service } = await start({ gloss: { dbPath: glossDb() } });
    const body = await (await post(service.origin, { language: 'pl', queries: [
      { lemma: 'mieć', upos: 'VERB', alternatives: [{ lemma: 'mama', upos: 'NOUN' }] },
      { lemma: 'mieć', upos: 'VERB', alternatives: [{ lemma: 'witajka', upos: 'INTJ' }] },
    ] })).json() as Json;
    expect(body.results[0]).toMatchObject({ via: 'alternative', hop: 'lemma', lemma: 'mama' });
    expect(body.results[0]).not.toHaveProperty('formOf');
    expect(body.results[1]).toMatchObject({ via: 'alternative', hop: 'form-of-text', lemma: 'witajka', upos: 'INTJ' });
    expect(body.results[1]).not.toHaveProperty('formOf');
  });

  it('resolves an alternative through a form-of hop: lemma = target, formOf = queried form', async () => {
    const { service } = await start({ gloss: { dbPath: glossDb() } });
    const body = await (await post(service.origin, { language: 'pl', queries: [{ lemma: 'mieć', upos: 'VERB', alternatives: [{ lemma: 'domu', upos: 'NOUN' }] }] })).json() as Json;
    expect(body.results[0]).toMatchObject({ found: true, via: 'alternative', hop: 'form-of', lemma: 'dom', formOf: 'domu', upos: 'NOUN', otherReadings: [] });
  });

  it('keeps a primary found with mismatched POS over an alternative without upos (alternative becomes another reading)', async () => {
    const { service } = await start({ gloss: { dbPath: glossDb() } });
    const body = await (await post(service.origin, { language: 'pl', queries: [{ lemma: 'stać', upos: 'VERB', alternatives: [{ lemma: 'mama' }] }] })).json() as Json;
    expect(body.results[0]).toMatchObject({ found: true, via: 'lemma', lemma: 'stać', upos: 'NOUN' });
    expect(body.results[0].otherReadings.map((r: Json) => [r.lemma, r.upos, r.hop])).toEqual([['mama', 'NOUN', 'lemma']]);
  });

  it('opens a read-only database file', async (ctx) => {
    const dbPath = glossDb();
    chmodSync(dbPath, 0o444);
    let writable = true;
    try { writeFileSync(dbPath, '', { flag: 'a' }); } catch { writable = false; }
    if (writable) { chmodSync(dbPath, 0o644); ctx.skip(); return; }
    const gloss = makeGlossService({ dbPath });
    cleanups.push(async () => gloss.close());
    const res = await gloss.lookup(validateGlossRequest({ language: 'pl', queries: [{ lemma: 'domu' }] }));
    expect(res.status).toBe('available');
    gloss.close();
    chmodSync(dbPath, 0o644);
  });

  it('rejects malformed input with fixed codes and no echo', async () => {
    const { service } = await start({ gloss: { dbPath: glossDb() } });
    const s = 'ZZsecretZZ';
    const q = (lemma: unknown) => ({ language: 'pl', queries: [{ lemma }] });
    const cases: [unknown, string][] = [
      [{ language: 'pl' }, 'invalid-envelope'],
      [{ language: 'pl', queries: [{ lemma: 'dom' }], extra: s }, 'invalid-envelope'],
      [{ language: 'pl', queries: [{ lemma: 'dom' }], maxSenses: 9 }, 'invalid-max-senses'],
      [{ language: 'pl', queries: [{ lemma: 'dom' }], maxSenses: 0 }, 'invalid-max-senses'],
      [{ language: 'pl', queries: [{ lemma: 'dom' }], maxSenses: 1.5 }, 'invalid-max-senses'],
      [{ language: 'pl', queries: [{ lemma: 'dom' }], maxSenses: '2' }, 'invalid-max-senses'],
      [{ language: 'pl-PL' + s, queries: [{ lemma: 'dom' }] }, 'invalid-language'],
      [{ language: 'pl', queries: [] }, 'invalid-queries'],
      [{ language: 'pl', queries: s }, 'invalid-queries'],
      [q(''), 'invalid-queries'],
      [q(' ' + s), 'invalid-queries'],
      [q(s + '\u0007'), 'invalid-queries'],
      [{ language: 'pl', queries: [{ lemma: s, extra: 1 }] }, 'invalid-queries'],
      [{ language: 'pl', queries: [{ lemma: s, upos: 'noun' }] }, 'invalid-queries'],
      [{ language: 'pl', queries: [{ lemma: s, alternatives: Array(4).fill({ lemma: 'a' }) }] }, 'invalid-queries'],
      [{ language: 'pl', queries: [{ lemma: 'a', alternatives: [{ lemma: s + 'x'.repeat(64) }] }] }, 'lemma-too-long'],
      [{ language: 'pl', queries: Array(17).fill({ lemma: 'dom' }) }, 'too-many-queries'],
      [q(s + 'a'.repeat(64)), 'lemma-too-long'],
    ];
    for (const [body, code] of cases) {
      const res = await post(service.origin, body);
      const text = await res.text();
      expect(res.status, code).toBe(400);
      expect(JSON.parse(text), code).toEqual({ ok: false, error: code });
      expect(text).not.toContain(s);
    }
    expect(validateGlossRequest({ language: 'pl', queries: [{ lemma: 'nowy dom' }] }).queries[0]!.lemma).toBe('nowy dom');
    // Non-object JSON never reaches the validator over HTTP (gate 400); the validator still types it.
    expect(() => validateGlossRequest([s])).toThrow('invalid-envelope');
    expect((await post(service.origin, [s])).status).toBe(400);
  });

  it('applies the shared admission gate and a 16 KiB body cap', async () => {
    const { service, token } = await start({ gloss: { dbPath: glossDb() } });
    const host = new URL(service.origin).host;
    const body = JSON.stringify({ language: 'pl', queries: [{ lemma: 'dom' }] });
    const origin = ['Origin', 'http://127.0.0.1:5173'];
    const json = ['Host', host, 'Content-Type', 'application/json'];
    expect((await raw(service.origin, GLOSS_ROUTE, 'POST', [...json, ...origin], body)).status).toBe(401);
    expect((await raw(service.origin, GLOSS_ROUTE, 'POST', [...json, 'Origin', 'http://unpaired.invalid', 'Authorization', `Bearer ${token()}`], body)).status).toBe(403);
    expect((await raw(service.origin, GLOSS_ROUTE, 'POST', ['Host', host, 'Content-Type', 'text/plain', 'Authorization', `Bearer ${token()}`], body)).status).toBe(415);
    expect((await raw(service.origin, GLOSS_ROUTE, 'GET', ['Host', host, 'Authorization', `Bearer ${token()}`])).status).toBe(405);
    const pre = await raw(service.origin, GLOSS_ROUTE, 'OPTIONS', ['Host', host, ...origin, 'Access-Control-Request-Method', 'POST',
      'Access-Control-Request-Headers', 'authorization, content-type']);
    expect(pre.status).toBe(204);
    expect(String(pre.headers['access-control-allow-methods'])).toContain('POST');
    const huge = await post(service.origin, { language: 'pl', queries: [{ lemma: 'dom' }], pad: 'x'.repeat(17 * 1024) });
    expect(huge.status).toBe(413);
    expect(await huge.text()).not.toContain('xxxx');
    expect((await raw(service.origin, GLOSS_ROUTE, 'POST', [...json, ...origin, 'Authorization', `Bearer ${token()}`], body)).status).toBe(200);
  });

  it('reports unsupported-language, disabled (never opening), not-installed and invalid-dictionary without paths', async () => {
    const dir = tempDir();
    const openStore = vi.fn(openGlossStore);
    const disabled = await start({ gloss: { dbPath: glossDb(), mode: 'disabled', openStore } });
    expect(await (await post(disabled.service.origin, { language: 'pl', queries: [{ lemma: 'dom' }] })).json()).toEqual({ status: 'unavailable', reason: 'disabled' });
    expect(await status(disabled.service.origin)).toEqual({ languages: ['pl'], state: 'disabled' });
    expect(openStore).not.toHaveBeenCalled();

    const { service } = await start({ gloss: { dbPath: glossDb() } });
    expect(await (await post(service.origin, { language: 'en', queries: [{ lemma: 'house' }] })).json()).toEqual({ status: 'unavailable', reason: 'unsupported-language' });

    const missing = await start({ gloss: { dbPath: join(dir, 'absent', 'glosses-pl.sqlite') } });
    const m = await (await post(missing.service.origin, { language: 'pl', queries: [{ lemma: 'dom' }] })).text();
    expect(JSON.parse(m)).toEqual({ status: 'unavailable', reason: 'not-installed' });
    expect(await status(missing.service.origin)).toEqual({ languages: ['pl'], state: 'not-installed' });

    const bad = join(dir, 'bad.sqlite');
    writeFileSync(bad, 'not a database at all');
    const invalid = await start({ gloss: { dbPath: bad } });
    const i = await (await post(invalid.service.origin, { language: 'pl', queries: [{ lemma: 'dom' }] })).text();
    expect(JSON.parse(i)).toEqual({ status: 'unavailable', reason: 'invalid-dictionary' });
    expect(await status(invalid.service.origin)).toEqual({ languages: ['pl'], state: 'invalid-dictionary' });
    for (const text of [m, i]) expect(text).not.toMatch(/absent|bad\.sqlite|ltfoe33/);
  });

  it('re-checks a missing database at most once per 30 s and picks it up once installed', async () => {
    const dir = tempDir();
    const dbPath = join(dir, 'glosses-pl.sqlite');
    let now = 1_000_000;
    const openStore = vi.fn(openGlossStore);
    const gloss = makeGlossService({ dbPath, openStore, clock: () => now });
    cleanups.push(async () => gloss.close());
    const req = validateGlossRequest({ language: 'pl', queries: [{ lemma: 'dom' }] });
    expect(await gloss.lookup(req)).toEqual({ status: 'unavailable', reason: 'not-installed' });
    copyFileSync(glossDb(), dbPath);
    now += 10_000;
    expect(await gloss.lookup(req)).toEqual({ status: 'unavailable', reason: 'not-installed' });
    expect(openStore).toHaveBeenCalledTimes(1);
    now += 21_000;
    const ok = await gloss.lookup(req);
    expect(ok.status).toBe('available');
    expect(gloss.capability()).toEqual({ languages: ['pl'], state: 'available', source: { id: 'kaikki-enwiktionary-pl-2026-10-03', dumpDate: '2026-10-03', attribution: GLOSS_ATTRIBUTION } });
    await gloss.lookup(req);
    expect(openStore).toHaveBeenCalledTimes(2);
    gloss.close();
  });

  it('maps lookup throws to lookup-failed with no input or path echo', async () => {
    const real = openGlossStore(glossDb());
    cleanups.push(async () => real.close());
    const store = { lookup: () => { throw new Error('boom /secret/glosses-pl.sqlite ZZinputZZ'); }, source: () => real.source(), close: () => {} };
    const { service } = await start({ gloss: { dbPath: '/unused', openStore: () => store } });
    const res = await post(service.origin, { language: 'pl', queries: [{ lemma: 'ZZinputZZ' }] });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ status: 'error', code: 'lookup-failed' });
    expect(text).not.toMatch(/ZZinputZZ|secret|boom/);
    const broken = { lookup: () => [], source: () => { throw new Error('/secret'); }, close: () => {} };
    const internal = await start({ gloss: { dbPath: '/unused', openStore: () => broken as never } });
    const t2 = await (await post(internal.service.origin, { language: 'pl', queries: [{ lemma: 'ZZinputZZ' }] })).text();
    expect(t2).toBe('{"status":"unavailable","reason":"invalid-dictionary"}');
    expect(await status(internal.service.origin)).toEqual({ languages: ['pl'], state: 'invalid-dictionary' });
  });

  it('closes and drops a store whose source() fails after open, then re-checks after 30 s', async () => {
    let now = 5_000_000;
    let fail = false;
    const real = openGlossStore(glossDb());
    cleanups.push(async () => real.close());
    const close = vi.fn();
    const store = { lookup: real.lookup, source: () => { if (fail) throw new Error('/secret'); return real.source(); }, close };
    const openStore = vi.fn(() => store);
    const gloss = makeGlossService({ dbPath: '/unused', openStore, clock: () => now });
    const req = validateGlossRequest({ language: 'pl', queries: [{ lemma: 'dom' }] });
    expect((await gloss.lookup(req)).status).toBe('available');
    fail = true;
    expect(await gloss.lookup(req)).toEqual({ status: 'unavailable', reason: 'invalid-dictionary' });
    expect(close).toHaveBeenCalledTimes(1);
    expect(gloss.capability()).toEqual({ languages: ['pl'], state: 'invalid-dictionary' });
    now += 10_000;
    expect(await gloss.lookup(req)).toEqual({ status: 'unavailable', reason: 'invalid-dictionary' });
    expect(openStore).toHaveBeenCalledTimes(1);
    fail = false; now += 21_000;
    expect((await gloss.lookup(req)).status).toBe('available');
    expect(openStore).toHaveBeenCalledTimes(2);
    expect(gloss.capability().state).toBe('available');
    // capability() itself also drops a store whose source() starts failing.
    fail = true;
    expect(gloss.capability()).toEqual({ languages: ['pl'], state: 'invalid-dictionary' });
    expect(await gloss.lookup(req)).toEqual({ status: 'unavailable', reason: 'invalid-dictionary' });
    expect(close).toHaveBeenCalledTimes(2);
    gloss.close();
  });

  it('exposes language.gloss in /api/status next to morphology, without paths', async () => {
    const { service } = await start({ gloss: { dbPath: glossDb() } });
    await post(service.origin, { language: 'pl', queries: [{ lemma: 'dom' }] });
    const res = await pairedFetch(`${service.origin}/api/status`);
    const text = await res.text();
    const body = JSON.parse(text) as Json;
    expect(Object.keys(body.language).sort()).toEqual(['gloss', 'morphology']);
    expect(body.language.gloss).toEqual({ languages: ['pl'], state: 'available', source: { id: 'kaikki-enwiktionary-pl-2026-10-03', dumpDate: '2026-10-03', attribution: GLOSS_ATTRIBUTION } });
    expect(text).not.toMatch(/glosses-pl|ltfoe33/);
  });

  it('makes no network calls while opening and looking up', async () => {
    const gloss = makeGlossService({ dbPath: glossDb() });
    cleanups.push(async () => gloss.close());
    const { value, networkAttempts } = await withNoNetwork(() => gloss.lookup(validateGlossRequest({ language: 'pl', queries: [{ lemma: 'domu' }] })));
    expect(value.status).toBe('available');
    expect(networkAttempts).toEqual([]);
    gloss.close();
  });
});
