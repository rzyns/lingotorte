import { describe, expect, it, vi } from 'vitest';
import { pairTransport } from '../../apps/web/src/pairedTransport.ts';
import { parseMorphologyResponse, requestLocalMorphology } from '../../apps/web/src/morphologyClient.ts';

const cap = 'A'.repeat(42) + 'E';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const good = { status: 'available', engine: 'morfeusz2-sgjp', warnings: ['ambiguous-tokens'], analyses: [
  { tokenIndex: 0, lemma: 'mieć', upos: 'VERB', morph: [{ key: 'Number', value: 'Plur' }], confidence: { kind: 'possible', value: 0.55 }, ambiguous: true, unknown: false, alternatives: [{ lemma: 'mama', upos: 'NOUN' }] }] };

describe('lt-elf morphology client', () => {
  it('posts a bounded body through the paired transport and parses available results', async () => {
    const transport = pairTransport({}, 'http://127.0.0.1:5174', cap);
    const fetcher = vi.fn<typeof fetch>(async () => json(good));
    const result = await requestLocalMorphology(transport, 'pl', ['mamy'], fetcher);
    expect(result.status).toBe('available');
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:5174/api/language/morphology');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ language: 'pl', tokens: ['mamy'] });
  });

  it('maps service-off, network failure, unpaired, non-2xx and bad payloads to typed results', async () => {
    expect(await requestLocalMorphology(null, 'pl', ['dom'])).toEqual({ status: 'unavailable', reason: 'not-paired' });
    const owner = {};
    const t = pairTransport(owner, 'http://127.0.0.1:5174', cap);
    expect(await requestLocalMorphology(t, 'pl', ['dom'], vi.fn(async () => { throw new TypeError('ECONNREFUSED'); }))).toEqual({ status: 'unavailable', reason: 'service-unreachable' });
    expect(await requestLocalMorphology(t, 'pl', ['dom'], vi.fn(async () => json({ ok: false }, 404)))).toEqual({ status: 'unavailable', reason: 'service-unreachable' });
    expect(await requestLocalMorphology(t, 'pl', ['dom'], vi.fn(async () => json({ ok: false, error: 'invalid-tokens' }, 400)))).toEqual({ status: 'error', code: 'rejected' });
    expect(await requestLocalMorphology(t, 'pl', ['dom'], vi.fn(async () => new Response('<html>', { status: 200 })))).toEqual({ status: 'error', code: 'invalid-response' });
    expect(await requestLocalMorphology(t, 'pl', ['dom'], vi.fn(async () => json({ status: 'unavailable', reason: 'adapter-load-failed' })))).toEqual({ status: 'unavailable', reason: 'adapter-load-failed' });
    expect(await requestLocalMorphology(t, 'pl', ['dom'], vi.fn(async () => json({ ok: false }, 401)))).toEqual({ status: 'unavailable', reason: 'not-paired' });
  });

  it('refuses out-of-bound requests before any egress', async () => {
    const t = pairTransport({}, 'http://127.0.0.1:5174', cap);
    const fetcher = vi.fn<typeof fetch>();
    for (const tokens of [[], Array(65).fill('a'), ['a b'], ['x'.repeat(65)]]) {
      expect(await requestLocalMorphology(t, 'pl', tokens, fetcher)).toEqual({ status: 'error', code: 'invalid-request' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects responses outside the contract (unknown enums, extra codes, count mismatch, bad confidence)', () => {
    expect(parseMorphologyResponse({ status: 'error', code: 'stack trace here' }, 1)).toEqual({ status: 'error', code: 'invalid-response' });
    expect(parseMorphologyResponse({ status: 'unavailable', reason: 'whatever' }, 1).status).toBe('error');
    expect(parseMorphologyResponse(good, 2).status).toBe('error');
    expect(parseMorphologyResponse({ ...good, warnings: ['free text'] }, 1).status).toBe('error');
    expect(parseMorphologyResponse({ ...good, analyses: [{ ...good.analyses[0], confidence: { kind: 'certain', value: 4 } }] }, 1).status).toBe('error');
    expect(parseMorphologyResponse(good, 1).status).toBe('available');
  });
});
