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
  otherReadings: readonly ClientGlossOtherReading[];
}>;
export type ClientGlossOtherReading = Readonly<{ lemma: string; upos: string | null; via: 'lemma' | 'form-of'; formOf?: string; senses: readonly ClientGlossSense[] }>;
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

const LEMMA_MAX = GLOSS_CLIENT_MAX_LEMMA_CHARS * 2;
function parseSenses(v: unknown, maxSenses: number): ClientGlossSense[] | null {
  if (!Array.isArray(v) || v.length > maxSenses) return null;
  const senses = v.map(parseSense);
  return senses.includes(null) ? null : senses as ClientGlossSense[];
}
// formOf (the queried form behind a form-of hop): required with via 'form-of', optional with 'alternative', otherwise absent.
const formOfOk = (via: unknown, formOf: unknown) => formOf === undefined ? via !== 'form-of' : (via === 'form-of' || via === 'alternative') && str(formOf, LEMMA_MAX);

function parseOther(v: unknown, maxSenses: number): ClientGlossOtherReading | null {
  if (!rec(v) || !str(v.lemma, LEMMA_MAX) || !uposOrNull(v.upos) || (v.via !== 'lemma' && v.via !== 'form-of') || !formOfOk(v.via, v.formOf)) return null;
  const senses = parseSenses(v.senses, maxSenses);
  if (!senses || senses.length === 0) return null;
  return { lemma: v.lemma, upos: v.upos, via: v.via, ...(v.formOf !== undefined ? { formOf: v.formOf as string } : {}), senses };
}

function parseResult(v: unknown, index: number, maxSenses: number): ClientGlossResult | null {
  if (!rec(v) || v.queryIndex !== index || typeof v.found !== 'boolean' || !str(v.lemma, LEMMA_MAX) || !uposOrNull(v.upos)) return null;
  const senses = parseSenses(v.senses, maxSenses);
  if (!senses) return null;
  if (v.found ? !VIAS.has(v.via as string) || senses.length === 0 : v.via !== null || senses.length !== 0) return null;
  if (!formOfOk(v.via, v.formOf)) return null;
  if (!Array.isArray(v.otherReadings) || v.otherReadings.length > GLOSS_CLIENT_MAX_ALTERNATIVES) return null;
  const otherReadings = v.otherReadings.map(o => parseOther(o, maxSenses));
  if (otherReadings.includes(null)) return null;
  return { queryIndex: index, found: v.found, via: v.via as ClientGlossResult['via'], lemma: v.lemma, upos: v.upos,
    ...(v.formOf !== undefined ? { formOf: v.formOf as string } : {}), senses, otherReadings: otherReadings as ClientGlossOtherReading[] };
}

/** Pure parser: anything outside the reviewed contract becomes {status:'error', code:'invalid-response'}. */
export function parseGlossResponse(value: unknown, queryCount: number, maxSenses = MAX_SENSES): ClientGlossResponse {
  const invalid = { status: 'error', code: 'invalid-response' } as const;
  if (!rec(value)) return invalid;
  if (value.status === 'unavailable') return UNAVAILABLE.has(value.reason as string) ? { status: 'unavailable', reason: value.reason as 'disabled' } : invalid;
  if (value.status === 'error') return ERRORS.has(value.code as string) ? { status: 'error', code: value.code as 'internal' } : invalid;
  if (value.status !== 'available' || !Array.isArray(value.results) || value.results.length !== queryCount) return invalid;
  const source = parseSource(value.source);
  const results = value.results.map((r, i) => parseResult(r, i, maxSenses));
  if (!source || results.includes(null)) return invalid;
  return { status: 'available', source, results: results as ClientGlossResult[] };
}

const lemmaOk = (l: unknown) => typeof l === 'string' && l.length > 0 && l === l.trim() && !/[\u0000-\u001f\u007f-\u009f]|\s{2,}|[^\S ]/u.test(l) && [...l].length <= GLOSS_CLIENT_MAX_LEMMA_CHARS;
const uposOk = (u: unknown) => u === undefined || (typeof u === 'string' && UPOS.test(u));

/** maxSenses: optional integer 1-5 (server default 3); also bounds the parsed response. */
export async function requestLocalGloss(transport: PairedTransport | null | undefined, language: string, queries: readonly ClientGlossQuery[], fetchImpl?: typeof fetch, maxSenses?: number): Promise<ClientGlossResponse> {
  if (!transport) return { status: 'unavailable', reason: 'not-paired' };
  const valid = (maxSenses === undefined || (Number.isInteger(maxSenses) && maxSenses >= 1 && maxSenses <= MAX_SENSES)) && /^[a-z]{2,3}$/.test(language) && queries.length > 0 && queries.length <= GLOSS_CLIENT_MAX_QUERIES && queries.every(q => lemmaOk(q.lemma) && uposOk(q.upos)
    && (q.alternatives === undefined || (q.alternatives.length <= GLOSS_CLIENT_MAX_ALTERNATIVES && q.alternatives.every(a => lemmaOk(a.lemma) && uposOk(a.upos)))));
  if (!valid) return { status: 'error', code: 'invalid-request' };
  const body = { language, ...(maxSenses !== undefined ? { maxSenses } : {}), queries: queries.map(q => ({ lemma: q.lemma, ...(q.upos !== undefined ? { upos: q.upos } : {}),
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
  return parseGlossResponse(parsed, queries.length, maxSenses ?? MAX_SENSES);
}
