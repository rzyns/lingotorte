import {
  LookupInput,
  LookupOutput,
  MorphologyInput,
  MorphologyOutput,
  ProviderPolicy,
  TokenizerInput,
  TokenizerOutput,
  TokenOccurrence,
  UUID,
} from '@lingotorte/domain';
import { isoNow, uuid } from '@lingotorte/domain';

// Local/default-off language adapter interfaces for P3.
// These adapters return typed local results or explicit unavailable/disabled states.
// No online provider calls are made unless explicitly enabled by a future opt-in policy.

export type TokenizerAdapter = Readonly<{
  adapterId: string;
  adapterVersion: string;
  privacyMode: 'local';
  tokenize(input: TokenizerInput): Promise<TokenizerOutput>;
}>;

export type MorphologyAdapter = Readonly<{
  adapterId: string;
  adapterVersion: string;
  privacyMode: 'local';
  analyze(input: MorphologyInput): Promise<MorphologyOutput>;
}>;

export type DictionaryAdapter = Readonly<{
  adapterId: string;
  adapterVersion: string;
  privacyMode: 'local';
  lookup(input: LookupInput): Promise<LookupOutput>;
}>;

export type LanguageAdapters = Readonly<{
  tokenizer?: TokenizerAdapter;
  morphology?: MorphologyAdapter;
  dictionary?: DictionaryAdapter;
}>;

function localRunRef(adapterId: string, adapterVersion: string, inputHash: string): {
  id: UUID;
  adapterKind: 'tokenizer';
  adapterId: string;
  adapterVersion: string;
  configHash: string;
  inputHash: string;
  createdAt: string;
  privacyMode: 'local';
} {
  return {
    id: uuid(),
    adapterKind: 'tokenizer',
    adapterId,
    adapterVersion,
    configHash: 'local',
    inputHash,
    createdAt: isoNow(),
    privacyMode: 'local',
  };
}

export function makeWhitespaceTokenizer(language: string): TokenizerAdapter {
  const adapterId = 'lingotorte.whitespace-tokenizer';
  const adapterVersion = '0.0.0-p3';
  return {
    adapterId,
    adapterVersion,
    privacyMode: 'local',
    async tokenize(input: TokenizerInput): Promise<TokenizerOutput> {
      if (input.language !== language) {
        throw new TypeError(`${adapterId} does not support language ${input.language}`);
      }
      const warnings: string[] = [];
      if (!/\s/.test(input.text) && input.text.length > 10) {
        warnings.push('Input text contains no whitespace; tokenization may be inaccurate');
      }
      const tokens: TokenizerOutput['tokens'] = [];
      const regex = /\S+/g;
      let match: RegExpExecArray | null;
      let tokenIndex = 0;
      while ((match = regex.exec(input.text)) !== null) {
        const surface = match[0];
        const charStart = match.index;
        const charEnd = charStart + surface.length;
        tokens.push({
          tokenIndex,
          charStart,
          charEnd,
          surface,
          normalizedSurface: surface.toLowerCase(),
          tokenKind: 'word',
          joinToPrevious: false,
          joinToNext: false,
        });
        tokenIndex += 1;
      }
      if (tokens.length === 0) {
        warnings.push('No tokens produced from input text');
      }
      return {
        run: localRunRef(adapterId, adapterVersion, await sha256Text(input.text + input.cueId)),
        tokens,
        warnings,
      };
    },
  };
}

export function makeUnavailableDictionaryAdapter(): DictionaryAdapter {
  const adapterId = 'lingotorte.unavailable-dictionary';
  const adapterVersion = '0.0.0-p3';
  return {
    adapterId,
    adapterVersion,
    privacyMode: 'local',
    async lookup(input: LookupInput): Promise<LookupOutput> {
      return {
        run: localRunRef(adapterId, adapterVersion, await sha256Text(JSON.stringify(input))),
        entries: [],
        warnings: [`Dictionary unavailable for target ${input.target.kind}`],
      };
    },
  };
}

export function makeDisabledMorphologyAdapter(): MorphologyAdapter {
  const adapterId = 'lingotorte.disabled-morphology';
  const adapterVersion = '0.0.0-p3';
  return {
    adapterId,
    adapterVersion,
    privacyMode: 'local',
    async analyze(input: MorphologyInput): Promise<MorphologyOutput> {
      const analyses: MorphologyOutput['analyses'] = input.tokens.map((t: TokenizerOutput['tokens'][number]) => ({
        tokenIndex: t.tokenIndex,
        lemma: t.surface.toLowerCase(),
        upos: 'X',
        morph: [],
        confidence: { kind: 'unavailable', value: 0 },
        alternatives: [],
      }));
      return {
        run: localRunRef(adapterId, adapterVersion, await sha256Text(input.text + input.cueId)),
        analyses,
        warnings: ['Morphology adapter disabled; returning placeholder analyses'],
      };
    },
  };
}

export function assertProvidersDisabled(policy: ProviderPolicy): void {
  if (policy.onlineProvidersEnabled !== false || policy.allowedDataClasses.length !== 0) {
    throw new TypeError('Online providers must be disabled for local-only adapter pipeline');
  }
}

export function resolveLocalAdapters(_policy: ProviderPolicy, language: string): LanguageAdapters {
  return {
    tokenizer: makeWhitespaceTokenizer(language),
    morphology: makeDisabledMorphologyAdapter(),
    dictionary: makeUnavailableDictionaryAdapter(),
  };
}

async function sha256Text(text: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256');
  hash.update(text, 'utf8');
  return hash.digest('hex');
}

export function makeTokenOccurrenceFromTokenizer(
  cueId: UUID,
  runId: UUID,
  token: TokenizerOutput['tokens'][number],
): TokenOccurrence {
  return {
    id: uuid(),
    cueId,
    analysisRunId: runId,
    tokenIndex: token.tokenIndex,
    charStart: token.charStart,
    charEnd: token.charEnd,
    surface: token.surface,
    normalized: token.normalizedSurface,
  };
}
