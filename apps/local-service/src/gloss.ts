// lt-foe.3.3: bounded, typed local gloss lookup over the derived Wiktextract SQLite (DECISIONS §16a).
// Read-only, local file only, no network. Mirrors the lt-elf morphology route contract.
import { GlossStoreError, openGlossStore, type GlossLookupResult, type GlossStore } from '../../../packages/language/src/glossStore.ts';

export const GLOSS_ROUTE = '/api/language/gloss';
export const GLOSS_MAX_BODY_BYTES = 16 * 1024;
export const GLOSS_MAX_QUERIES = 16;
export const GLOSS_MAX_LEMMA_CHARS = 64;
export const GLOSS_MAX_ALTERNATIVES = 3;
export const GLOSS_MAX_SENSES = 5;
export const GLOSS_DEFAULT_SENSES = 3;
export const GLOSS_RECHECK_MS = 30_000;

export type GlossCapabilityState = 'available' | 'not-installed' | 'disabled' | 'invalid-dictionary';
export type GlossUnavailableReason = 'not-installed' | 'disabled' | 'unsupported-language' | 'invalid-dictionary';
export type GlossErrorCode = 'lookup-failed' | 'internal';
export type GlossValidationCode = 'invalid-envelope' | 'invalid-max-senses' | 'invalid-language' | 'invalid-queries' | 'too-many-queries' | 'lemma-too-long';
export type GlossRouteSense = Readonly<{ gloss: string; pos: string; upos: string | null; tags: readonly string[] }>;
export type GlossRouteResult = Readonly<{
  queryIndex: number;
  found: boolean;
  via: 'lemma' | 'form-of' | 'form-of-text' | 'alternative' | null;
  /** Present iff via is 'alternative': how the chosen alternative's own lookup resolved. */
  hop?: GlossHop;
  lemma: string;
  upos: string | null;
  /** The queried form when the glosses came through a form-of hop (lemma is then the hop target). */
  formOf?: string;
  senses: readonly GlossRouteSense[];
  /** Other found readings among the query's alternatives (request order, deduped by (lemma, upos)). */
  otherReadings: readonly GlossOtherReading[];
}>;
/** How a store lookup resolved: real glosses, one form-of hop (formOf set), or unresolved form-of rows' own text. */
export type GlossHop = 'lemma' | 'form-of' | 'form-of-text';
/** Other readings are always alternatives, so they carry only `hop` (no `via`). */
export type GlossOtherReading = Readonly<{ lemma: string; upos: string | null; hop: GlossHop; formOf?: string; senses: readonly GlossRouteSense[] }>;
export type GlossRouteSource = Readonly<{ id: string; name: string; licence: string; url: string; attribution: string; dumpDate: string }>;
export type GlossResponse =
  | Readonly<{ status: 'available'; source: GlossRouteSource; results: readonly GlossRouteResult[] }>
  | Readonly<{ status: 'unavailable'; reason: GlossUnavailableReason }>
  | Readonly<{ status: 'error'; code: GlossErrorCode }>;
export type GlossCapability = Readonly<{
  languages: readonly ['pl'];
  state: GlossCapabilityState;
  source?: Readonly<{ id: string; dumpDate: string; attribution: string }>;
}>;

export type GlossRuntimeOptions = Readonly<{
  /** Derived gloss DB path (server: glossDbPathFromEnv). Never leaves the service. */
  dbPath?: string;
  /** 'disabled' (or LINGOTORTE_GLOSS=disabled) returns typed unavailable and never opens the DB. */
  mode?: 'enabled' | 'disabled';
  openStore?: (path: string) => GlossStore;
  /** Milliseconds clock for the missing-DB re-check window (tests). */
  clock?: () => number;
}>;

export class GlossValidationError extends Error {
  readonly code: GlossValidationCode;
  constructor(code: GlossValidationCode) { super(code); this.code = code; }
}

type Alt = Readonly<{ lemma: string; upos?: string }>;
type Query = Readonly<{ lemma: string; upos?: string; alternatives: readonly Alt[] }>;
export type ValidatedGlossRequest = Readonly<{ language: string; queries: readonly Query[]; maxSenses: number }>;

const UPOS_RE = /^[A-Z]{1,5}$/;
const exactKeys = (record: Record<string, unknown>, required: readonly string[], optional: readonly string[]) => {
  const keys = Object.keys(record);
  return required.every(k => keys.includes(k)) && keys.every(k => required.includes(k) || optional.includes(k));
};
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function lemmaOf(value: unknown): string {
  // No control chars, no leading/trailing whitespace, no runs of whitespace (single internal spaces allowed).
  if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)
    || value !== value.trim() || /\s{2,}|[^\S ]/u.test(value)) throw new GlossValidationError('invalid-queries');
  if ([...value].length > GLOSS_MAX_LEMMA_CHARS) throw new GlossValidationError('lemma-too-long');
  return value;
}
function uposOf(record: Record<string, unknown>): string | undefined {
  if (record.upos === undefined) return undefined;
  if (typeof record.upos !== 'string' || !UPOS_RE.test(record.upos)) throw new GlossValidationError('invalid-queries');
  return record.upos;
}

export function validateGlossRequest(body: unknown): ValidatedGlossRequest {
  if (!isRecord(body) || !exactKeys(body, ['language', 'queries'], ['maxSenses'])) throw new GlossValidationError('invalid-envelope');
  if (body.maxSenses !== undefined && (!Number.isInteger(body.maxSenses) || (body.maxSenses as number) < 1 || (body.maxSenses as number) > GLOSS_MAX_SENSES)) {
    throw new GlossValidationError('invalid-max-senses');
  }
  if (typeof body.language !== 'string' || !/^[a-z]{2,3}$/.test(body.language)) throw new GlossValidationError('invalid-language');
  const queries = body.queries;
  if (!Array.isArray(queries) || queries.length === 0) throw new GlossValidationError('invalid-queries');
  if (queries.length > GLOSS_MAX_QUERIES) throw new GlossValidationError('too-many-queries');
  const parsed = queries.map((q): Query => {
    if (!isRecord(q) || !exactKeys(q, ['lemma'], ['upos', 'alternatives'])) throw new GlossValidationError('invalid-queries');
    const lemma = lemmaOf(q.lemma);
    const upos = uposOf(q);
    let alternatives: Alt[] = [];
    if (q.alternatives !== undefined) {
      if (!Array.isArray(q.alternatives) || q.alternatives.length > GLOSS_MAX_ALTERNATIVES) throw new GlossValidationError('invalid-queries');
      alternatives = q.alternatives.map((a): Alt => {
        if (!isRecord(a) || !exactKeys(a, ['lemma'], ['upos'])) throw new GlossValidationError('invalid-queries');
        const altLemma = lemmaOf(a.lemma);
        const altUpos = uposOf(a);
        return altUpos === undefined ? { lemma: altLemma } : { lemma: altLemma, upos: altUpos };
      });
    }
    return { lemma, ...(upos !== undefined ? { upos } : {}), alternatives };
  });
  return { language: body.language, queries: parsed, maxSenses: (body.maxSenses as number | undefined) ?? GLOSS_DEFAULT_SENSES };
}

const uposMatches = (result: GlossLookupResult, upos: string | undefined) => upos !== undefined && result.senses.some(s => s.upos === upos);

/**
 * Resolution rule (deterministic):
 * 1. Look up the primary {lemma, upos} (glossStore: direct glosses first, else one form-of hop).
 * 2. Keep the primary if it was found and either the query has no upos or some returned sense has that upos.
 * 3. Otherwise walk the alternatives in request order and take the first one that is found AND has a
 *    sense matching its own upos; when the primary was not found at all, a found alternative without
 *    upos also qualifies.
 * 4. Otherwise return the primary as-is (found with mismatched POS, or found:false).
 * 'form-of-text' (store branch c: unresolved form-of rows' own gloss text) passes through as the via, never with formOf.
 * hop: with via 'alternative' (and on every other reading) the alternative's own store via; formOf iff hop 'form-of'.
 * otherReadings: every found alternative whose (lemma, upos) differs from the chosen result's, in request
 * order, deduped, at most GLOSS_MAX_ALTERNATIVES.
 */
const senseOut = (s: GlossLookupResult['senses'][number]): GlossRouteSense => ({ gloss: s.gloss, pos: s.pos, upos: s.upos, tags: [...s.tags] });
const hop = (r: GlossLookupResult) => (r.found && r.via === 'form-of' && r.formOf ? r.formOf : undefined);
function resolve(store: GlossStore, q: Query, maxSenses: number, queryIndex: number): GlossRouteResult {
  const find = (lemma: string, upos: string | undefined) => store.lookup([{ lemma, ...(upos ? { upos } : {}) }], { maxSenses })[0]!;
  const primary = find(q.lemma, q.upos);
  const alts = q.alternatives.map(alt => ({ alt, r: find(alt.lemma, alt.upos) }));
  const shape = (r: GlossLookupResult, queried: string, via: GlossRouteResult['via'], upos: string | undefined) => {
    const target = hop(r);
    return {
      queryIndex,
      found: r.found,
      via: r.found ? via : null,
      ...(r.found && via === 'alternative' ? { hop: r.via as GlossHop } : {}),
      lemma: target ?? queried,
      upos: (r.found ? r.senses[0]?.upos : upos) ?? null,
      ...(target ? { formOf: queried } : {}),
      senses: r.senses.slice(0, maxSenses).map(senseOut),
    };
  };
  let chosen: Omit<GlossRouteResult, 'otherReadings'> | undefined;
  if (primary.found && (q.upos === undefined || uposMatches(primary, q.upos))) chosen = shape(primary, q.lemma, primary.via, q.upos);
  for (const { alt, r } of alts) {
    if (chosen) break;
    if (r.found && (uposMatches(r, alt.upos) || (!primary.found && alt.upos === undefined))) chosen = shape(r, alt.lemma, 'alternative', alt.upos);
  }
  chosen ??= shape(primary, q.lemma, primary.via, q.upos);
  const seen = new Set<string>([JSON.stringify([chosen.lemma, chosen.upos])]);
  const otherReadings: GlossOtherReading[] = [];
  for (const { alt, r } of alts) {
    if (!r.found || otherReadings.length >= GLOSS_MAX_ALTERNATIVES) continue;
    const target = hop(r);
    const lemma = target ?? alt.lemma;
    // A reading is about its own POS: keep only matching senses when the alternative names a UPOS that has any.
    const own = alt.upos !== undefined && uposMatches(r, alt.upos) ? r.senses.filter(s => s.upos === alt.upos) : r.senses;
    const upos = own[0]?.upos ?? null;
    const key = JSON.stringify([lemma, upos]);
    if (seen.has(key)) continue;
    seen.add(key);
    otherReadings.push({ lemma, upos, hop: r.via as GlossHop, ...(target ? { formOf: alt.lemma } : {}), senses: own.slice(0, maxSenses).map(senseOut) });
  }
  return { ...chosen, otherReadings };
}

export function makeGlossService(options: GlossRuntimeOptions = {}) {
  const disabled = options.mode === 'disabled';
  const open = options.openStore ?? openGlossStore;
  const clock = options.clock ?? Date.now;
  let store: GlossStore | null = null;
  let state: GlossCapabilityState = disabled ? 'disabled' : 'not-installed';
  let lastAttempt: number | null = null;
  const ensure = (): GlossStore | null => {
    if (disabled || store) return store;
    const now = clock();
    if (lastAttempt !== null && now - lastAttempt < GLOSS_RECHECK_MS) return null;
    lastAttempt = now;
    if (!options.dbPath) { state = 'not-installed'; return null; }
    let opened: GlossStore | null = null;
    try {
      opened = open(options.dbPath);
      opened.source();
      store = opened;
      state = 'available';
    } catch (error) {
      try { opened?.close(); } catch { /* ignore */ }
      state = error instanceof GlossStoreError && error.code === 'missing' ? 'not-installed' : 'invalid-dictionary';
    }
    return store;
  };
  /** A store whose source() fails after open is closed and dropped; the 30 s re-check then applies. */
  const sourceOf = (): GlossRouteSource | null => {
    if (!store) return null;
    try {
      const s = store.source();
      return { id: s.id, name: s.name, licence: s.licence, url: s.url, attribution: s.attribution, dumpDate: s.dumpDate };
    } catch {
      try { store.close(); } catch { /* ignore */ }
      store = null;
      state = 'invalid-dictionary';
      lastAttempt = clock();
      return null;
    }
  };
  return {
    capability(): GlossCapability {
      if (state === 'available' && store) {
        const s = sourceOf();
        if (s) return { languages: ['pl'], state: 'available', source: { id: s.id, dumpDate: s.dumpDate, attribution: s.attribution } };
      }
      return { languages: ['pl'], state };
    },
    warm(): void { ensure(); },
    async lookup(input: ValidatedGlossRequest): Promise<GlossResponse> {
      if (disabled) return { status: 'unavailable', reason: 'disabled' };
      if (input.language !== 'pl') return { status: 'unavailable', reason: 'unsupported-language' };
      const current = ensure();
      const source = current ? sourceOf() : null;
      if (!current || !source) return { status: 'unavailable', reason: state === 'invalid-dictionary' ? 'invalid-dictionary' : 'not-installed' };
      try {
        return { status: 'available', source, results: input.queries.map((q, i) => resolve(current, q, input.maxSenses, i)) };
      } catch {
        return { status: 'error', code: 'lookup-failed' };
      }
    },
    close(): void { store?.close(); store = null; },
  };
}
export type GlossService = ReturnType<typeof makeGlossService>;
