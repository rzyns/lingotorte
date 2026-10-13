// lt-elf: bounded, typed local Morfeusz morphology service. No network, no provider, no new dictionary.
import type { MorphologyAdapter, TokenizerOutputToken } from '@lingotorte/domain';
import { makeMorfeuszMorphologyAdapter } from '../../../packages/language/src/adapters.ts';

export const MORPHOLOGY_ROUTE = '/api/language/morphology';
export const MORPHOLOGY_MAX_BODY_BYTES = 16 * 1024;
export const MORPHOLOGY_MAX_TOKENS = 64;
export const MORPHOLOGY_MAX_TOKEN_CHARS = 64;
export const MORPHOLOGY_MAX_ALTERNATIVES = 3;
export const MORPHOLOGY_ENGINE = 'morfeusz2-sgjp' as const;

export type MorphologyCapabilityState = 'not-loaded' | 'loading' | 'available' | 'unavailable';
export type MorphologyUnavailableReason = 'disabled' | 'adapter-load-failed' | 'unsupported-language';
export type MorphologyErrorCode = 'analysis-failed' | 'internal';
export type MorphologyValidationCode = 'invalid-envelope' | 'invalid-language' | 'invalid-tokens' | 'too-many-tokens' | 'token-too-long';
export type MorphologyWarningCode = 'ambiguous-tokens' | 'unknown-tokens';
export type MorphologyConfidence = Readonly<{ kind: 'certain' | 'probable' | 'possible'; value: number }>;
export type MorphologyAlternative = Readonly<{ lemma: string; upos: string }>;
export type MorphologyTokenAnalysis = Readonly<{
  tokenIndex: number;
  lemma: string;
  upos: string;
  morph: readonly Readonly<{ key: string; value: string }>[];
  confidence: MorphologyConfidence;
  ambiguous: boolean;
  unknown: boolean;
  alternatives: readonly MorphologyAlternative[];
}>;
export type MorphologyResponse =
  | Readonly<{ status: 'available'; engine: typeof MORPHOLOGY_ENGINE; analyses: readonly MorphologyTokenAnalysis[]; warnings: readonly MorphologyWarningCode[] }>
  | Readonly<{ status: 'unavailable'; reason: MorphologyUnavailableReason }>
  | Readonly<{ status: 'error'; code: MorphologyErrorCode }>;
export type MorphologyCapability = Readonly<{ languages: readonly ['pl']; engine: typeof MORPHOLOGY_ENGINE; state: MorphologyCapabilityState }>;

export type MorphologyRuntimeOptions = Readonly<{
  /** 'disabled' turns the route into a typed unavailable without loading anything. */
  mode?: 'enabled' | 'disabled';
  /** Injectable loader (tests). Default: vendored Morfeusz SGJP adapter, loaded from local files only. */
  loadAdapter?: () => Promise<MorphologyAdapter>;
}>;

export class MorphologyValidationError extends Error {
  readonly code: MorphologyValidationCode;
  constructor(code: MorphologyValidationCode) { super(code); this.code = code; }
}

type Validated = Readonly<{ language: string; tokens: readonly string[] }>;

export function validateMorphologyRequest(body: unknown): Validated {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MorphologyValidationError('invalid-envelope');
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes('language') || !keys.includes('tokens')) throw new MorphologyValidationError('invalid-envelope');
  if (typeof record.language !== 'string' || !/^[a-z]{2,3}$/.test(record.language)) throw new MorphologyValidationError('invalid-language');
  const tokens = record.tokens;
  if (!Array.isArray(tokens) || tokens.length === 0) throw new MorphologyValidationError('invalid-tokens');
  if (tokens.length > MORPHOLOGY_MAX_TOKENS) throw new MorphologyValidationError('too-many-tokens');
  for (const token of tokens) {
    if (typeof token !== 'string' || token.length === 0 || /[\s\u0000-\u001f\u007f]/u.test(token)) throw new MorphologyValidationError('invalid-tokens');
    if ([...token].length > MORPHOLOGY_MAX_TOKEN_CHARS) throw new MorphologyValidationError('token-too-long');
  }
  return { language: record.language, tokens: tokens as string[] };
}

function tokenKind(surface: string): TokenizerOutputToken['tokenKind'] {
  if (/^\d+(?:[,.]\d+)?$/.test(surface)) return 'number';
  if (/^[\p{L}\p{M}]/u.test(surface)) return 'word';
  if (/^[.,!?;:…\-–—„”“"'«»()]+$/u.test(surface)) return 'punctuation';
  return 'symbol';
}

const bounded = (value: string): string => [...value].slice(0, MORPHOLOGY_MAX_TOKEN_CHARS).join('');
// Server-side whitelist of UD feature keys that may leave the service.
const MORPH_KEYS = new Set(['Case', 'Number', 'Gender', 'Degree', 'Mood', 'Tense', 'Person', 'Aspect', 'Polarity', 'NumType', 'PronType', 'Reflex', 'VerbForm']);

export function makeMorphologyService(options: MorphologyRuntimeOptions = {}) {
  const disabled = options.mode === 'disabled';
  const loadAdapter = options.loadAdapter ?? (async () => makeMorfeuszMorphologyAdapter());
  let state: MorphologyCapabilityState = disabled ? 'unavailable' : 'not-loaded';
  let loading: Promise<MorphologyAdapter | null> | null = null;
  // Load once: adapter construction plus one probe analysis forces the local dictionary read.
  const ensure = (): Promise<MorphologyAdapter | null> => {
    if (disabled) return Promise.resolve(null);
    if (!loading) {
      state = 'loading';
      loading = (async () => {
        try {
          const adapter = await loadAdapter();
          await adapter.analyze({ language: 'pl', cueId: 'morphology-probe', text: 'test', tokens: [
            { tokenIndex: 0, charStart: 0, charEnd: 4, surface: 'test', normalizedSurface: 'test', tokenKind: 'word', joinToPrevious: false, joinToNext: false }] });
          state = 'available';
          return adapter;
        } catch {
          state = 'unavailable';
          return null;
        }
      })();
    }
    return loading;
  };
  return {
    capability(): MorphologyCapability {
      return { languages: ['pl'], engine: MORPHOLOGY_ENGINE, state };
    },
    warm(): void { void ensure(); },
    async analyze(input: Validated): Promise<MorphologyResponse> {
      if (disabled) return { status: 'unavailable', reason: 'disabled' };
      if (input.language !== 'pl') return { status: 'unavailable', reason: 'unsupported-language' };
      const adapter = await ensure();
      if (!adapter) return { status: 'unavailable', reason: 'adapter-load-failed' };
      let charStart = 0;
      const tokens: TokenizerOutputToken[] = input.tokens.map((surface, tokenIndex) => {
        const kind = tokenKind(surface);
        const token: TokenizerOutputToken = { tokenIndex, charStart, charEnd: charStart + surface.length, surface,
          normalizedSurface: kind === 'word' ? surface.toLocaleLowerCase('pl') : surface, tokenKind: kind, joinToPrevious: false, joinToNext: false };
        charStart += surface.length + 1;
        return token;
      });
      let output;
      try {
        output = await adapter.analyze({ language: 'pl', cueId: 'morphology-request', text: input.tokens.join(' '), tokens });
      } catch {
        return { status: 'error', code: 'analysis-failed' };
      }
      try {
        if (output.analyses.length !== tokens.length) return { status: 'error', code: 'analysis-failed' };
        const analyses: MorphologyTokenAnalysis[] = output.analyses.map((analysis, index) => {
          const upos = typeof analysis.upos === 'string' ? analysis.upos : 'X';
          const kind = analysis.confidence.kind;
          // Unknown only on Morfeusz's own no-reading signal ('ign' / zero readings → adapter xpos 'ign').
          // A mapped-but-unclassified reading (upos 'X', e.g. brev) is known and keeps normal confidence.
          const unknown = analysis.xpos === 'ign';
          const primaryLemma = bounded(analysis.lemma ?? tokens[index]!.normalizedSurface);
          // Only lemma/POS-distinct readings count as ambiguity; case syncretism of one lemma/POS is not,
          // and neither are lemmas differing only in letter case (warszawa vs Warszawa).
          const keyOf = (lemma: string, pos: string) => `${lemma.toLocaleLowerCase('pl')}\u0000${pos}`;
          const seen = new Set([keyOf(primaryLemma, upos)]);
          const alternatives = unknown ? [] : analysis.alternatives
            .map(alt => ({ lemma: bounded(alt.lemma ?? ''), upos: alt.upos ?? 'X' }))
            .filter(alt => {
              const key = keyOf(alt.lemma, alt.upos);
              if (alt.lemma.length === 0 || seen.has(key)) return false;
              seen.add(key); return true;
            })
            .slice(0, MORPHOLOGY_MAX_ALTERNATIVES);
          // Unknown caps at possible/0.35; any lemma/POS-distinct alternative caps at possible/0.55.
          const cap = unknown ? 0.35 : alternatives.length > 0 ? 0.55 : 1;
          const confidence: MorphologyConfidence = kind === 'certain' || kind === 'probable' || kind === 'possible'
            ? { kind: cap < 1 ? 'possible' : kind, value: Math.max(0, Math.min(cap, analysis.confidence.value)) }
            : { kind: 'possible', value: 0 };
          return {
            tokenIndex: index,
            lemma: primaryLemma,
            upos,
            morph: analysis.morph.filter(feature => MORPH_KEYS.has(feature.key) && typeof feature.value === 'string').slice(0, 16).map(feature => ({ key: feature.key, value: bounded(feature.value) })),
            confidence,
            ambiguous: alternatives.length > 0,
            unknown,
            alternatives,
          };
        });
        const warnings: MorphologyWarningCode[] = [];
        if (analyses.some(a => a.ambiguous)) warnings.push('ambiguous-tokens');
        if (analyses.some(a => a.unknown)) warnings.push('unknown-tokens');
        return { status: 'available', engine: MORPHOLOGY_ENGINE, analyses, warnings };
      } catch {
        return { status: 'error', code: 'internal' };
      }
    },
  };
}
export type MorphologyService = ReturnType<typeof makeMorphologyService>;
