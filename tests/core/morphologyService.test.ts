import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { startPairedService, pairedFetch } from '../helpers/pairedService.ts';
import { makeMorphologyService, validateMorphologyRequest, MORPHOLOGY_ROUTE } from '../../apps/local-service/src/morphology.ts';
import type { LocalServiceRuntime } from '../../apps/local-service/src/server.ts';
import { withNoNetwork } from '../no-network/networkTrap';

const ROUTE = MORPHOLOGY_ROUTE;
type Json = Record<string, any>;

function raw(origin: string, path: string, method: string, headers: string[], body?: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(origin, { path, method, headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end(body);
  });
}

describe('lt-elf local Morfeusz morphology service', () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); });

  async function start(runtime: LocalServiceRuntime = {}) {
    const root = await mkdtemp(join(tmpdir(), 'lt-elf-'));
    let token = '';
    const service = await startPairedService({ host: '127.0.0.1', port: 0, databasePath: join(root, 'state.db'),
      scratchDir: join(root, 'scratch'), modelCacheDir: join(root, 'models'), allowOnlineProviders: false },
    { ...runtime, receiveCapability: value => { token = value; } });
    cleanups.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
    return { service, token: () => token };
  }
  const post = (origin: string, body: unknown) => pairedFetch(`${origin}${ROUTE}`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('analyzes Polish fixtures with lemma, POS, ambiguity, unknown and punctuation semantics', async () => {
    const { service } = await start();
    const res = await post(service.origin, { language: 'pl', tokens: ['Kobieta', 'czyta', 'książki', 'mamy', 'xqzvbrt', '.', '2'] });
    expect(res.status).toBe(200);
    const body = await res.json() as Json;
    expect(body.status).toBe('available');
    expect(body.engine).toBe('morfeusz2-sgjp');
    const [kobieta, czyta, ksiazki, mamy, nonsense, dot, two] = body.analyses;
    expect(kobieta).toMatchObject({ tokenIndex: 0, lemma: 'kobieta', upos: 'NOUN', unknown: false });
    expect(czyta).toMatchObject({ tokenIndex: 1, lemma: 'czytać', upos: 'VERB', unknown: false });
    // SGJP also lists the proper noun 'Książki' (place name) and may order it first: the common lemma
    // must still be present as an explicit reading, and the token must be flagged ambiguous.
    expect(ksiazki.upos).toBe('NOUN');
    expect([{ lemma: ksiazki.lemma, upos: ksiazki.upos }, ...ksiazki.alternatives]).toEqual(expect.arrayContaining([{ lemma: 'książka', upos: 'NOUN' }]));
    expect(ksiazki.ambiguous).toBe(true);
    expect(ksiazki.confidence.kind).toBe('possible');
    expect(kobieta.confidence.kind).not.toBe('certain');
    // 'mamy' = mieć (verb, 1pl) or mama (noun, nom/voc pl): explicit ambiguity with alternatives.
    expect(mamy.ambiguous).toBe(true);
    expect(mamy.confidence.kind).toBe('possible');
    const readings = [{ lemma: mamy.lemma, upos: mamy.upos }, ...mamy.alternatives];
    expect(readings).toEqual(expect.arrayContaining([expect.objectContaining({ lemma: 'mieć' }), expect.objectContaining({ lemma: 'mama' })]));
    expect(nonsense).toMatchObject({ upos: 'X', unknown: true, ambiguous: false, alternatives: [] });
    expect(nonsense.confidence.kind).toBe('possible');
    expect(nonsense.confidence.value).toBeLessThanOrEqual(0.35);
    expect(dot).toMatchObject({ upos: 'PUNCT', unknown: false, confidence: { kind: 'certain' } });
    expect(two).toMatchObject({ upos: 'NUM' });
    expect(body.warnings).toEqual(['ambiguous-tokens', 'unknown-tokens']);
    for (const a of body.analyses) expect(Object.keys(a).sort()).toEqual(['alternatives', 'ambiguous', 'confidence', 'lemma', 'morph', 'tokenIndex', 'unknown', 'upos']);
  });

  it('treats real but unclassified words (się, nie, imperative zażółć) as known, not unknown', async () => {
    const { service } = await start();
    const body = await (await post(service.origin, { language: 'pl', tokens: ['się', 'nie', 'zażółć', '—', '„'] })).json() as Json;
    const [sie, nie, zazolc, dash, quote] = body.analyses;
    expect(sie).toMatchObject({ lemma: 'się', upos: 'PART', unknown: false });
    expect(sie.confidence.value).toBeGreaterThan(0.35);
    expect(nie).toMatchObject({ lemma: 'nie', upos: 'PART', unknown: false });
    expect(nie.confidence.value).toBeGreaterThan(0.35);
    expect(zazolc).toMatchObject({ lemma: 'zażółcić', upos: 'VERB', unknown: false, ambiguous: false });
    expect(zazolc.morph).toEqual(expect.arrayContaining([{ key: 'Mood', value: 'Imp' }]));
    expect(zazolc.confidence.value).toBeGreaterThan(0.35);
    expect(dash).toMatchObject({ upos: 'PUNCT', unknown: false });
    expect(quote).toMatchObject({ upos: 'PUNCT', unknown: false });
    expect(body.warnings).not.toContain('unknown-tokens');
  });

  it('never truncates the common lemma behind proper names, and ignores case-only lemma duplicates', async () => {
    const { service } = await start();
    const body = await (await post(service.origin, { language: 'pl', tokens: ['Książki', 'Warszawie'] })).json() as Json;
    const [ksiazki, warszawie] = body.analyses;
    // Lowercase (common) lemma readings rank first; capitalised proper-name readings follow.
    expect(ksiazki).toMatchObject({ lemma: 'książka', upos: 'NOUN', unknown: false });
    expect(ksiazki.alternatives).not.toEqual(expect.arrayContaining([{ lemma: 'Książka', upos: 'NOUN' }]));
    expect(warszawie).toMatchObject({ lemma: 'warszawa', upos: 'NOUN', ambiguous: false, alternatives: [], unknown: false });
    expect(warszawie.confidence.kind).not.toBe('possible');
  });

  it('reports runtime capability in /api/status without loose provider blobs', async () => {
    const { service } = await start();
    await post(service.origin, { language: 'pl', tokens: ['dom'] });
    const status = await (await pairedFetch(`${service.origin}/api/status`)).json() as Json;
    expect(status.language.morphology).toEqual({ languages: ['pl'], engine: 'morfeusz2-sgjp', state: 'available' });
    const disabled = await start({ morphology: { mode: 'disabled' } });
    const off = await (await pairedFetch(`${disabled.service.origin}/api/status`)).json() as Json;
    expect(off.language.morphology.state).toBe('unavailable');
    expect(await (await post(disabled.service.origin, { language: 'pl', tokens: ['dom'] })).json()).toEqual({ status: 'unavailable', reason: 'disabled' });
  });

  it('returns typed unsupported-language without loading for non-Polish', async () => {
    const { service } = await start();
    expect(await (await post(service.origin, { language: 'en', tokens: ['house'] })).json()).toEqual({ status: 'unavailable', reason: 'unsupported-language' });
  });

  it('rejects malformed and oversized input with fixed codes and no echo', async () => {
    const { service } = await start();
    const secret = 'ZZsecretZZ';
    const cases: [unknown, number, string][] = [
      [{ language: 'pl' }, 400, 'invalid-envelope'],
      [{ language: 'pl', tokens: [secret], extra: secret }, 400, 'invalid-envelope'],
      [{ language: 'pl-PL' + secret, tokens: ['dom'] }, 400, 'invalid-language'],
      [{ language: 7, tokens: ['dom'] }, 400, 'invalid-language'],
      [{ language: 'pl', tokens: [] }, 400, 'invalid-tokens'],
      [{ language: 'pl', tokens: secret }, 400, 'invalid-tokens'],
      [{ language: 'pl', tokens: [secret, 3] }, 400, 'invalid-tokens'],
      [{ language: 'pl', tokens: ['two words' + secret] }, 400, 'invalid-tokens'],
      [{ language: 'pl', tokens: [''] }, 400, 'invalid-tokens'],
      [{ language: 'pl', tokens: Array(65).fill('dom') }, 400, 'too-many-tokens'],
      [{ language: 'pl', tokens: [secret + 'a'.repeat(64)] }, 400, 'token-too-long'],
    ];
    for (const [body, status, code] of cases) {
      const res = await post(service.origin, body);
      const text = await res.text();
      expect(res.status, code).toBe(status);
      expect(JSON.parse(text)).toEqual({ ok: false, error: code });
      expect(text).not.toContain(secret);
    }
    const huge = await post(service.origin, { language: 'pl', tokens: ['a'], pad: 'x'.repeat(17 * 1024) });
    expect(huge.status).toBe(413);
    expect(await huge.text()).not.toContain('xxxx');
    const notJson = await post(service.origin, '{bad');
    expect(notJson.status).toBe(400);
  });

  it('returns typed unavailable when the adapter/dictionary fails to load, and stays unavailable', async () => {
    const loadAdapter = vi.fn(async () => { throw new Error('/secret/path/sgjp-a.dict missing'); });
    const { service } = await start({ morphology: { loadAdapter } });
    for (let i = 0; i < 2; i++) {
      const res = await post(service.origin, { language: 'pl', tokens: ['dom'] });
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(JSON.parse(text)).toEqual({ status: 'unavailable', reason: 'adapter-load-failed' });
      expect(text).not.toMatch(/secret|sgjp|dict/);
    }
    expect(loadAdapter).toHaveBeenCalledTimes(1);
    const status = await (await pairedFetch(`${service.origin}/api/status`)).json() as Json;
    expect(status.language.morphology.state).toBe('unavailable');
  });

  it('maps adapter throws to typed error without stack or input leakage', async () => {
    let calls = 0;
    const adapter = { adapterId: 'x', adapterVersion: '0', privacyMode: 'local' as const,
      analyze: async () => { if (calls++ === 0) return { run: {} as never, analyses: [], warnings: [] }; throw new Error('boom at /secret ZZinputZZ\n    at stack'); } };
    const { service } = await start({ morphology: { loadAdapter: async () => adapter } });
    const res = await post(service.origin, { language: 'pl', tokens: ['ZZinputZZ'] });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ status: 'error', code: 'analysis-failed' });
    expect(text).not.toMatch(/ZZinputZZ|secret|stack|boom/);
  });

  it('admits the route under the same capability/origin policy as other learner routes', async () => {
    const { service, token } = await start();
    const host = new URL(service.origin).host;
    const body = JSON.stringify({ language: 'pl', tokens: ['dom'] });
    const base = ['Host', host, 'Content-Type', 'application/json'];
    const rows: [string, string[], number][] = [
      ['missing-auth', ['Origin', 'http://127.0.0.1:5173'], 401],
      ['wrong-auth', ['Origin', 'http://127.0.0.1:5173', 'Authorization', `Bearer ${'A'.repeat(43)}`], 401],
      ['foreign-origin', ['Origin', 'http://unpaired.invalid', 'Authorization', `Bearer ${token()}`], 403],
      ['null-origin', ['Origin', 'null', 'Authorization', `Bearer ${token()}`], 403],
    ];
    for (const [name, extra, status] of rows) {
      const result = await raw(service.origin, ROUTE, 'POST', [...base, ...extra], body);
      expect(result.status, name).toBe(status);
      expect(result.body).not.toContain('dom');
    }
    expect((await raw(service.origin, ROUTE, 'GET', ['Host', host, 'Authorization', `Bearer ${token()}`])).status).toBe(405);
    expect((await raw(service.origin, ROUTE, 'POST', ['Host', host, 'Authorization', `Bearer ${token()}`, 'Content-Type', 'text/plain'], body)).status).toBe(415);
    const ok = await raw(service.origin, ROUTE, 'POST', [...base, 'Origin', 'http://127.0.0.1:5173', 'Authorization', `Bearer ${token()}`], body);
    expect(ok.status).toBe(200);
  });

  it('makes no external network calls while loading and analyzing', async () => {
    const service = makeMorphologyService();
    const { value, networkAttempts } = await withNoNetwork(() => service.analyze(validateMorphologyRequest({ language: 'pl', tokens: ['Uczymy', 'się', 'mamy', 'xqzvbrt'] })));
    expect(value.status).toBe('available');
    expect(networkAttempts).toEqual([]);
  });
});
