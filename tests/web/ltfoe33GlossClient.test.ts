import { describe, expect, it, vi } from 'vitest';
import { pairTransport } from '../../apps/web/src/pairedTransport.ts';
import { parseGlossResponse, requestLocalGloss } from '../../apps/web/src/glossClient.ts';

const cap = 'A'.repeat(42) + 'E';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const source = { id: 'kaikki-enwiktionary-pl-2026-10-03', name: 'Wiktionary', licence: 'CC BY-SA 4.0 and GFDL', url: 'https://kaikki.org/', attribution: 'Word meanings from English Wiktionary', dumpDate: '2026-10-03' };
const good = { status: 'available', source, results: [
  { queryIndex: 0, found: true, via: 'form-of', lemma: 'dom', upos: null, formOf: 'domu', senses: [{ gloss: 'house', pos: 'noun', upos: 'NOUN', tags: ['inanimate'] }],
    otherReadings: [{ lemma: 'cześć', upos: 'INTJ', via: 'lemma', senses: [{ gloss: 'hi', pos: 'intj', upos: 'INTJ', tags: [] }] }] },
  { queryIndex: 1, found: false, via: null, lemma: 'xq', upos: 'X', senses: [], otherReadings: [] }] };
const altViaFormOf = { status: 'available', source, results: [
  { queryIndex: 0, found: true, via: 'alternative', lemma: 'dom', upos: 'NOUN', formOf: 'domu', senses: [{ gloss: 'house', pos: 'noun', upos: 'NOUN', tags: [] }],
    otherReadings: [{ lemma: 'dom', upos: 'VERB', via: 'form-of', formOf: 'domu', senses: [{ gloss: 'x', pos: 'verb', upos: 'VERB', tags: [] }] }] }] };

describe('lt-foe.3.3 gloss client', () => {
  it('posts a bounded body through the paired transport and parses available results', async () => {
    const t = pairTransport({}, 'http://127.0.0.1:5174', cap);
    const fetcher = vi.fn<typeof fetch>(async () => json(good));
    const result = await requestLocalGloss(t, 'pl', [{ lemma: 'domu' }, { lemma: 'xq', upos: 'X', alternatives: [{ lemma: 'a', upos: 'NOUN' }] }], fetcher);
    expect(result).toEqual(good);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:5174/api/language/gloss');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ language: 'pl', queries: [{ lemma: 'domu' }, { lemma: 'xq', upos: 'X', alternatives: [{ lemma: 'a', upos: 'NOUN' }] }] });
  });

  it('maps unpaired, unreachable, 404, non-2xx, 401 and service states to typed results', async () => {
    expect(await requestLocalGloss(null, 'pl', [{ lemma: 'dom' }])).toEqual({ status: 'unavailable', reason: 'not-paired' });
    const t = pairTransport({}, 'http://127.0.0.1:5174', cap);
    const q = [{ lemma: 'dom' }];
    expect(await requestLocalGloss(t, 'pl', q, vi.fn(async () => { throw new TypeError('ECONNREFUSED'); }))).toEqual({ status: 'unavailable', reason: 'service-unreachable' });
    expect(await requestLocalGloss(t, 'pl', q, vi.fn(async () => json({}, 404)))).toEqual({ status: 'unavailable', reason: 'service-unreachable' });
    expect(await requestLocalGloss(t, 'pl', q, vi.fn(async () => json({ ok: false, error: 'invalid-queries' }, 400)))).toEqual({ status: 'error', code: 'rejected' });
    expect(await requestLocalGloss(t, 'pl', q, vi.fn(async () => new Response('<html>')))).toEqual({ status: 'error', code: 'invalid-response' });
    for (const reason of ['not-installed', 'disabled', 'unsupported-language', 'invalid-dictionary']) {
      expect(await requestLocalGloss(t, 'pl', q, vi.fn(async () => json({ status: 'unavailable', reason })))).toEqual({ status: 'unavailable', reason });
    }
    expect(await requestLocalGloss(t, 'pl', q, vi.fn(async () => json({ status: 'error', code: 'lookup-failed' })))).toEqual({ status: 'error', code: 'lookup-failed' });
    expect(await requestLocalGloss(t, 'pl', q, vi.fn(async () => json({}, 401)))).toEqual({ status: 'unavailable', reason: 'not-paired' });
  });

  it('strictly rejects shapes outside the contract', () => {
    const bad = (patch: (v: any) => void) => { const v = structuredClone(good); patch(v); return parseGlossResponse(v, 2); };
    const invalid = { status: 'error', code: 'invalid-response' };
    expect(parseGlossResponse(good, 2)).toEqual(good);
    expect(parseGlossResponse(good, 3)).toEqual(invalid);
    expect(parseGlossResponse({ status: 'unavailable', reason: 'whatever' }, 1)).toEqual(invalid);
    expect(parseGlossResponse({ status: 'error', code: 'boom' }, 1)).toEqual(invalid);
    expect(bad(v => { v.results[0].via = 'magic'; })).toEqual(invalid);
    expect(bad(v => { v.results[0].queryIndex = 1; })).toEqual(invalid);
    expect(bad(v => { v.results[1].senses = [{ gloss: 'x', pos: 'n', upos: null, tags: [] }]; })).toEqual(invalid);
    expect(bad(v => { v.results[0].senses[0].tags = [3]; })).toEqual(invalid);
    expect(bad(v => { v.results[0].senses[0].gloss = 'x'.repeat(501); })).toEqual(invalid);
    expect(bad(v => { v.results[0].senses = Array(6).fill(v.results[0].senses[0]); })).toEqual(invalid);
    expect(bad(v => { delete v.source.attribution; })).toEqual(invalid);
    expect(bad(v => { v.source.url = 'javascript:alert(1)'; })).toEqual(invalid);
    expect(bad(v => { v.results[0].found = 'yes'; })).toEqual(invalid);
    expect(bad(v => { delete v.results[0].otherReadings; })).toEqual(invalid);
    expect(bad(v => { v.results[0].otherReadings = Array(4).fill(v.results[0].otherReadings[0]); })).toEqual(invalid);
    expect(bad(v => { v.results[0].otherReadings[0].via = 'alternative'; })).toEqual(invalid);
    expect(bad(v => { v.results[0].otherReadings[0].senses = []; })).toEqual(invalid);
    expect(bad(v => { v.results[0].otherReadings[0].formOf = 'x'; })).toEqual(invalid); // formOf only with via 'form-of'
    expect(bad(v => { delete v.results[0].formOf; })).toEqual(invalid); // form-of requires formOf
    expect(bad(v => { v.results[0].via = 'lemma'; })).toEqual(invalid); // lemma forbids formOf
    expect(bad(v => { v.results[1].formOf = 'x'; })).toEqual(invalid);
    // maxSenses bound: more senses than requested is outside the contract.
    const two: any = structuredClone(good); two.results[0].senses = Array(2).fill(two.results[0].senses[0]);
    expect(parseGlossResponse(two, 2, 1)).toEqual(invalid);
    expect(parseGlossResponse(two, 2, 2)).toEqual(two);
  });

  it('accepts an alternative (and another reading) resolved through a form-of hop', async () => {
    expect(parseGlossResponse(altViaFormOf, 1)).toEqual(altViaFormOf);
    const t = pairTransport({}, 'http://127.0.0.1:5174', cap);
    expect(await requestLocalGloss(t, 'pl', [{ lemma: 'mieć', upos: 'VERB', alternatives: [{ lemma: 'domu', upos: 'NOUN' }] }], vi.fn(async () => json(altViaFormOf)))).toEqual(altViaFormOf);
  });

  it('accepts via form-of-text (result and other reading) and rejects formOf with it', () => {
    const sense = { gloss: 'Form of synthetic greeting; hi (synthetic)', pos: 'intj', upos: 'INTJ', tags: ['form-of'] };
    const ok = { status: 'available', source, results: [{ queryIndex: 0, found: true, via: 'form-of-text', lemma: 'witajka', upos: 'INTJ', senses: [sense],
      otherReadings: [{ lemma: 'witajka', upos: 'INTJ', via: 'form-of-text', senses: [sense] }] }] };
    expect(parseGlossResponse(ok, 1)).toEqual(ok);
    const invalid = { status: 'error', code: 'invalid-response' };
    const a: any = structuredClone(ok); a.results[0].formOf = 'x';
    expect(parseGlossResponse(a, 1)).toEqual(invalid);
    const b: any = structuredClone(ok); b.results[0].otherReadings[0].formOf = 'x';
    expect(parseGlossResponse(b, 1)).toEqual(invalid);
  });

  it('passes maxSenses through and validates it locally', async () => {
    const t = pairTransport({}, 'http://127.0.0.1:5174', cap);
    const fetcher = vi.fn<typeof fetch>(async () => json(good));
    await requestLocalGloss(t, 'pl', [{ lemma: 'domu' }, { lemma: 'xq' }], fetcher, 5);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({ language: 'pl', maxSenses: 5, queries: [{ lemma: 'domu' }, { lemma: 'xq' }] });
    const none = vi.fn<typeof fetch>();
    for (const m of [0, 6, 1.5, Number.NaN]) expect(await requestLocalGloss(t, 'pl', [{ lemma: 'a' }], none, m)).toEqual({ status: 'error', code: 'invalid-request' });
    expect(none).not.toHaveBeenCalled();
  });

  it('refuses out-of-bound requests before any egress', async () => {
    const t = pairTransport({}, 'http://127.0.0.1:5174', cap);
    const fetcher = vi.fn<typeof fetch>();
    const cases = [[], Array(17).fill({ lemma: 'a' }), [{ lemma: '' }], [{ lemma: 'x'.repeat(65) }], [{ lemma: ' a' }], [{ lemma: 'a', upos: 'noun' }],
      [{ lemma: 'a', alternatives: Array(4).fill({ lemma: 'b' }) }]];
    for (const queries of cases) expect(await requestLocalGloss(t, 'pl', queries as never, fetcher)).toEqual({ status: 'error', code: 'invalid-request' });
    expect(await requestLocalGloss(t, 'pl-PL', [{ lemma: 'a' }], fetcher)).toEqual({ status: 'error', code: 'invalid-request' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
