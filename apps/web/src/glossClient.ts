// lt-foe.3.3: typed client for POST /api/language/gloss. No UI wiring (lt-foe.3.4 owns that).
// Every failure maps to a typed result; the parser accepts only the reviewed contract shape.
import { PairingRequiredError, type PairedTransport } from './pairedTransport.ts';

export const GLOSS_CLIENT_MAX_QUERIES = 16;
export const GLOSS_CLIENT_MAX_LEMMA_CHARS = 64;
export const GLOSS_CLIENT_MAX_ALTERNATIVES = 3;
const MAX_SENSES = 5;
const MAX_GLOSS_CHARS = 500;

export type ClientGlossQuery = Readonly<{ lemma: string; upos?: string; alternatives?: readonly Readonly<{ lemma: string; upos?: string }>[] }>;
export type ClientGlossSense = Readonly<{ gloss: string; pos: string; upos: string | null; tags: readonly string[] }>;
export type ClientGlossResult = Readonly<{
  queryIndex: number; found: boolean; via: 'lemma' | 'form-of' | 'alternative' | null;
  lemma: string; upos: string | null; formOf?: string; senses: readonly ClientGlossSense[];
}>;
export type ClientGlossSource = Readonly<{ id: string; name: string; licence: string; url: string; attribution: string; dumpDate: string }>;
export type ClientGlossResponse =
  | Readonly<{ status: 'available'; source: ClientGlossSource; results: readonly ClientGlossResult[] }>
  | Readonly<{ status: 'unavailable'; reason: 'not-installed' | 'disabled' | 'unsupported-language' | 'invalid-dictionary' | 'service-unreachable' | 'not-paired' }>
  | Readonly<{ status: 'error'; code: 'lookup-failed' | 'internal' | 'rejected' | 'invalid-response' | 'invalid-request' }>;

const UNAVAILABLE = new Set(['not-installed', 'disabled', 'unsupported-language', 'invalid-dictionary']);
const ERRORS = new Set(['lookup-failed', 'internal']);
const VIAS = new Set(['lemma', 'form-of', 'alternative']);
const UPOS = /^[A-Z]{1,5}$/;
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && [...v].length <= max;
const uposOrNull = (v: unknown): v is string | null => v === null || (typeof v === 'string' && UPOS.test(v));
const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parseSource(v: unknown): ClientGlossSource | null {
  if (!rec(v)) return null;
  const keys = ['id', 'name', 'licence', 'url', 'attribution', 'dumpDate'] as const;
  if (!keys.every(k => str(v[k], 1000))) return null;
  if (!/^https:\/\//.test(v.url as string) || !/^\d{4}-\d{2}-\d{2}$/.test(v.dumpDate as string)) return null;
  return Object.fromEntries(keys.map(k => [k, v[k]])) as ClientGlossSource;
}

function parseSense(v: unknown): ClientGlossSense | null {
  if (!rec(v) || !str(v.gloss, MAX_GLOSS_CHARS) || !str(v.pos, 32) || !uposOrNull(v.upos)) return null;
  if (!Array.isArray(v.tags) || v.tags.length > 32 || !v.tags.every(t => str(t, 64))) return null;
  return { gloss: v.gloss, pos: v.pos, upos: v.upos, tags: v.tags as string[] };
}

function parseResult(v: unknown, index: number): ClientGlossResult | null {
  if (!rec(v) || v.queryIndex !== index || typeof v.found !== 'boolean' || !str(v.lemma, GLOSS_CLIENT_MAX_LEMMA_CHARS * 2) || !uposOrNull(v.upos)) return null;
  if (!Array.isArray(v.senses) || v.senses.length > MAX_SENSES) return null;
  if (v.found ? !VIAS.has(v.via as string) || v.senses.length === 0 : v.via !== null || v.senses.length !== 0) return null;
  if (v.formOf !== undefined && (!str(v.formOf, 256) || v.via !== 'form-of')) return null;
  const senses = v.senses.map(parseSense);
  if (senses.includes(null)) return null;
  return { queryIndex: index, found: v.found, via: v.via as ClientGlossResult['via'], lemma: v.lemma, upos: v.upos,
    ...(v.formOf !== undefined ? { formOf: v.formOf as string } : {}), senses: senses as ClientGlossSense[] };
}

/** Pure parser: anything outside the reviewed contract becomes {status:'error', code:'invalid-response'}. */
export function parseGlossResponse(value: unknown, queryCount: number): ClientGlossResponse {
  const invalid = { status: 'error', code: 'invalid-response' } as const;
  if (!rec(value)) return invalid;
  if (value.status === 'unavailable') return UNAVAILABLE.has(value.reason as string) ? { status: 'unavailable', reason: value.reason as 'disabled' } : invalid;
  if (value.status === 'error') return ERRORS.has(value.code as string) ? { status: 'error', code: value.code as 'internal' } : invalid;
  if (value.status !== 'available' || !Array.isArray(value.results) || value.results.length !== queryCount) return invalid;
  const source = parseSource(value.source);
  const results = value.results.map(parseResult);
  if (!source || results.includes(null)) return invalid;
  return { status: 'available', source, results: results as ClientGlossResult[] };
}

const lemmaOk = (l: unknown) => typeof l === 'string' && l.length > 0 && l === l.trim() && !/[\u0000-\u001f\u007f-\u009f]|\s{2,}|[^\S ]/u.test(l) && [...l].length <= GLOSS_CLIENT_MAX_LEMMA_CHARS;
const uposOk = (u: unknown) => u === undefined || (typeof u === 'string' && UPOS.test(u));

export async function requestLocalGloss(transport: PairedTransport | null | undefined, language: string, queries: readonly ClientGlossQuery[], fetchImpl?: typeof fetch): Promise<ClientGlossResponse> {
  if (!transport) return { status: 'unavailable', reason: 'not-paired' };
  const valid = /^[a-z]{2,3}$/.test(language) && queries.length > 0 && queries.length <= GLOSS_CLIENT_MAX_QUERIES && queries.every(q => lemmaOk(q.lemma) && uposOk(q.upos)
    && (q.alternatives === undefined || (q.alternatives.length <= GLOSS_CLIENT_MAX_ALTERNATIVES && q.alternatives.every(a => lemmaOk(a.lemma) && uposOk(a.upos)))));
  if (!valid) return { status: 'error', code: 'invalid-request' };
  const body = { language, queries: queries.map(q => ({ lemma: q.lemma, ...(q.upos !== undefined ? { upos: q.upos } : {}),
    ...(q.alternatives !== undefined ? { alternatives: q.alternatives.map(a => ({ lemma: a.lemma, ...(a.upos !== undefined ? { upos: a.upos } : {}) })) } : {}) })) };
  let response: Response;
  try {
    response = await transport.request('/api/language/gloss', { method: 'POST', body: JSON.stringify(body) }, fetchImpl);
  } catch (error) {
    if (error instanceof PairingRequiredError) return { status: 'unavailable', reason: 'not-paired' };
    return { status: 'unavailable', reason: 'service-unreachable' };
  }
  if (response.status === 404) return { status: 'unavailable', reason: 'service-unreachable' };
  if (!response.ok) return { status: 'error', code: 'rejected' };
  let parsed: unknown;
  try { parsed = await response.json(); } catch { return { status: 'error', code: 'invalid-response' }; }
  return parseGlossResponse(parsed, queries.length);
}
