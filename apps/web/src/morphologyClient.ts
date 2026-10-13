// lt-elf: typed client for POST /api/language/morphology. No UI wiring (lt-e8z owns that).
// Every failure maps to a typed result so callers can fall back to the browser heuristic.
import { PairingRequiredError, type PairedTransport } from './pairedTransport.ts';

export const MORPHOLOGY_CLIENT_MAX_TOKENS = 64;
export const MORPHOLOGY_CLIENT_MAX_TOKEN_CHARS = 64;

export type ClientMorphologyAnalysis = Readonly<{
  tokenIndex: number;
  lemma: string;
  upos: string;
  morph: readonly Readonly<{ key: string; value: string }>[];
  confidence: Readonly<{ kind: 'certain' | 'probable' | 'possible'; value: number }>;
  ambiguous: boolean;
  unknown: boolean;
  alternatives: readonly Readonly<{ lemma: string; upos: string }>[];
}>;
export type ClientMorphologyResult =
  | Readonly<{ status: 'available'; analyses: readonly ClientMorphologyAnalysis[]; warnings: readonly ('ambiguous-tokens' | 'unknown-tokens')[] }>
  | Readonly<{ status: 'unavailable'; reason: 'disabled' | 'adapter-load-failed' | 'unsupported-language' | 'service-unreachable' | 'not-paired' }>
  | Readonly<{ status: 'error'; code: 'analysis-failed' | 'internal' | 'rejected' | 'invalid-response' | 'invalid-request' }>;

const UNAVAILABLE = new Set(['disabled', 'adapter-load-failed', 'unsupported-language']);
const ERRORS = new Set(['analysis-failed', 'internal']);
const KINDS = new Set(['certain', 'probable', 'possible']);
const WARNINGS = new Set(['ambiguous-tokens', 'unknown-tokens']);
const isStr = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && [...v].length <= max;

function parseAnalysis(value: unknown, index: number): ClientMorphologyAnalysis | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  const c = a.confidence as Record<string, unknown> | undefined;
  if (a.tokenIndex !== index || !isStr(a.lemma) || !isStr(a.upos, 8) || typeof a.ambiguous !== 'boolean' || typeof a.unknown !== 'boolean') return null;
  if (!c || !KINDS.has(c.kind as string) || typeof c.value !== 'number' || !(c.value >= 0 && c.value <= 1)) return null;
  if (!Array.isArray(a.morph) || a.morph.length > 16 || !Array.isArray(a.alternatives) || a.alternatives.length > 3) return null;
  const morph = a.morph.map(f => (f && isStr((f as Record<string, unknown>).key, 32) && isStr((f as Record<string, unknown>).value, 32))
    ? { key: (f as Record<string, string>).key!, value: (f as Record<string, string>).value! } : null);
  const alternatives = a.alternatives.map(x => (x && isStr((x as Record<string, unknown>).lemma) && isStr((x as Record<string, unknown>).upos, 8))
    ? { lemma: (x as Record<string, string>).lemma!, upos: (x as Record<string, string>).upos! } : null);
  if (morph.includes(null) || alternatives.includes(null)) return null;
  return { tokenIndex: index, lemma: a.lemma, upos: a.upos, morph: morph as { key: string; value: string }[],
    confidence: { kind: c.kind as 'certain' | 'probable' | 'possible', value: c.value }, ambiguous: a.ambiguous, unknown: a.unknown,
    alternatives: alternatives as { lemma: string; upos: string }[] };
}

/** Pure parser: anything outside the reviewed contract becomes {status:'error', code:'invalid-response'}. */
export function parseMorphologyResponse(value: unknown, tokenCount: number): ClientMorphologyResult {
  const invalid = { status: 'error', code: 'invalid-response' } as const;
  if (!value || typeof value !== 'object') return invalid;
  const v = value as Record<string, unknown>;
  if (v.status === 'unavailable') return UNAVAILABLE.has(v.reason as string) ? { status: 'unavailable', reason: v.reason as 'disabled' } : invalid;
  if (v.status === 'error') return ERRORS.has(v.code as string) ? { status: 'error', code: v.code as 'internal' } : invalid;
  if (v.status !== 'available' || !Array.isArray(v.analyses) || v.analyses.length !== tokenCount || !Array.isArray(v.warnings)) return invalid;
  if (v.warnings.some(w => !WARNINGS.has(w as string))) return invalid;
  const analyses = v.analyses.map(parseAnalysis);
  if (analyses.includes(null)) return invalid;
  return { status: 'available', analyses: analyses as ClientMorphologyAnalysis[], warnings: v.warnings as ('ambiguous-tokens' | 'unknown-tokens')[] };
}

export async function requestLocalMorphology(transport: PairedTransport | null | undefined, language: string, tokens: readonly string[], fetchImpl?: typeof fetch): Promise<ClientMorphologyResult> {
  if (!transport) return { status: 'unavailable', reason: 'not-paired' };
  if (tokens.length === 0 || tokens.length > MORPHOLOGY_CLIENT_MAX_TOKENS || tokens.some(t => !t || /\s/.test(t) || [...t].length > MORPHOLOGY_CLIENT_MAX_TOKEN_CHARS)) {
    return { status: 'error', code: 'invalid-request' };
  }
  let response: Response;
  try {
    response = await transport.request('/api/language/morphology', { method: 'POST', body: JSON.stringify({ language, tokens }) }, fetchImpl);
  } catch (error) {
    if (error instanceof PairingRequiredError) return { status: 'unavailable', reason: 'not-paired' };
    return { status: 'unavailable', reason: 'service-unreachable' };
  }
  if (response.status === 404) return { status: 'unavailable', reason: 'service-unreachable' };
  if (!response.ok) return { status: 'error', code: 'rejected' };
  let body: unknown;
  try { body = await response.json(); } catch { return { status: 'error', code: 'invalid-response' }; }
  return parseMorphologyResponse(body, tokens.length);
}
