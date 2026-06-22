import {
  confidenceProbable,
  makeAdapterRunRef,
  type LookupInput,
  type LookupOutput,
  type LookupOutputEntry,
  type MorphologyAdapter,
  type MorphologyInput,
  type MorphologyOutput,
  type TokenizerAdapter,
  type TokenizerInput,
  type TokenizerOutput,
  type TokenizerOutputToken,
  type UUID,
  uuid,
} from '@lingotorte/domain';
export type { TokenizerAdapter, MorphologyAdapter };

export type DictionaryAdapter = Readonly<{
  adapterId: string;
  adapterVersion: string;
  privacyMode: 'local';
  sourceName: string;
  sourceLicense?: string;
  lookup(input: LookupInput): Promise<LookupOutput>;
}>;

export type LanguageAdapters = Readonly<{
  tokenizer: TokenizerAdapter;
  morphology: MorphologyAdapter;
  dictionary: DictionaryAdapter;
}>;

async function sha256Text(text: string): Promise<string> {
  // Browser-safe deterministic string hash used for adapter run inputHash provenance.
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function inputHash(text: string, cueId: string): Promise<string> {
  return sha256Text(`${text}::${cueId}`);
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
      const tokens: TokenizerOutputToken[] = [];
      const tokenPattern = /[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*|\d+(?:[,.]\d+)?|[^\s\p{L}\p{M}\d]/gu;
      let match: RegExpExecArray | null;
      let tokenIndex = 0;
      while ((match = tokenPattern.exec(input.text)) !== null) {
        const surface = match[0];
        const charStart = match.index;
        const charEnd = charStart + surface.length;
        const tokenKind: TokenizerOutputToken['tokenKind'] = /^\d+(?:[,.]\d+)?$/.test(surface)
          ? 'number'
          : /^[\p{L}\p{M}]/u.test(surface)
            ? 'word'
            : /^[.,!?;:…]+$/.test(surface)
              ? 'punctuation'
              : 'symbol';
        const normalizedSurface = tokenKind === 'word' ? surface.toLocaleLowerCase(language) : surface;
        tokens.push({
          tokenIndex,
          charStart,
          charEnd,
          surface,
          normalizedSurface,
          tokenKind,
          joinToPrevious: tokenKind === 'punctuation',
          joinToNext: false,
        });
        tokenIndex += 1;
      }
      if (tokens.length === 0) {
        warnings.push('No tokens produced from input text');
      }
      return {
        run: makeAdapterRunRef('tokenizer', adapterId, adapterVersion, await inputHash(input.text, input.cueId), 'local'),
        tokens,
        warnings,
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
      const analyses: MorphologyOutput['analyses'] = input.tokens.map((t) => ({
        tokenIndex: t.tokenIndex,
        lemma: t.normalizedSurface,
        upos: 'X',
        morph: [],
        confidence: { kind: 'unavailable', value: 0 },
        alternatives: [],
      }));
      return {
        run: makeAdapterRunRef('pos-morph', adapterId, adapterVersion, await inputHash(input.text, input.cueId), 'local'),
        analyses,
        warnings: ['Morphology adapter disabled; returning placeholder analyses'],
      };
    },
  };
}

type LocalPolishMorphologyEntry = Readonly<{
  lemma: string;
  upos: string;
  morph?: readonly { key: string; value: string; source?: 'universal-dependencies' | 'language-specific' | 'adapter-specific' }[];
}>;

const localPolishMorphology: Record<string, LocalPolishMorphologyEntry> = {
  cześć: { lemma: 'cześć', upos: 'NOUN', morph: [{ key: 'Gender', value: 'Fem' }, { key: 'Number', value: 'Sing' }] },
  to: { lemma: 'to', upos: 'PRON', morph: [{ key: 'PronType', value: 'Dem' }] },
  jest: { lemma: 'być', upos: 'AUX', morph: [{ key: 'Mood', value: 'Ind' }, { key: 'Tense', value: 'Pres' }, { key: 'Person', value: '3' }, { key: 'Number', value: 'Sing' }] },
  lokalny: { lemma: 'lokalny', upos: 'ADJ', morph: [{ key: 'Case', value: 'Nom' }, { key: 'Gender', value: 'Masc' }, { key: 'Number', value: 'Sing' }, { key: 'Degree', value: 'Pos' }] },
  lokalnego: { lemma: 'lokalny', upos: 'ADJ', morph: [{ key: 'Case', value: 'Gen' }, { key: 'Gender', value: 'Masc' }, { key: 'Number', value: 'Sing' }, { key: 'Degree', value: 'Pos' }] },
  test: { lemma: 'test', upos: 'NOUN', morph: [{ key: 'Gender', value: 'Masc' }, { key: 'Number', value: 'Sing' }] },
  uczymy: { lemma: 'uczyć', upos: 'VERB', morph: [{ key: 'Aspect', value: 'Imp' }, { key: 'Mood', value: 'Ind' }, { key: 'Tense', value: 'Pres' }, { key: 'Person', value: '1' }, { key: 'Number', value: 'Plur' }] },
  uczyć: { lemma: 'uczyć', upos: 'VERB', morph: [{ key: 'VerbForm', value: 'Inf' }, { key: 'Aspect', value: 'Imp' }] },
  się: { lemma: 'się', upos: 'PRON', morph: [{ key: 'PronType', value: 'Prs' }, { key: 'Reflex', value: 'Yes' }] },
  z: { lemma: 'z', upos: 'ADP', morph: [] },
  własny: { lemma: 'własny', upos: 'ADJ', morph: [{ key: 'Degree', value: 'Pos' }] },
  własnych: { lemma: 'własny', upos: 'ADJ', morph: [{ key: 'Case', value: 'Gen' }, { key: 'Number', value: 'Plur' }, { key: 'Degree', value: 'Pos' }] },
  napis: { lemma: 'napis', upos: 'NOUN', morph: [{ key: 'Gender', value: 'Masc' }, { key: 'Number', value: 'Sing' }] },
  napisy: { lemma: 'napis', upos: 'NOUN', morph: [{ key: 'Case', value: 'Nom' }, { key: 'Number', value: 'Plur' }] },
  napisów: { lemma: 'napis', upos: 'NOUN', morph: [{ key: 'Case', value: 'Gen' }, { key: 'Number', value: 'Plur' }] },
};

function inferLocalPolishEntry(surface: string): LocalPolishMorphologyEntry {
  const exact = localPolishMorphology[surface];
  if (exact) return exact;
  if (surface.endsWith('ych')) {
    return {
      lemma: surface.replace(/ych$/, 'y'),
      upos: 'ADJ',
      morph: [{ key: 'Case', value: 'Gen' }, { key: 'Number', value: 'Plur' }, { key: 'Guess', value: 'suffix', source: 'adapter-specific' }],
    };
  }
  if (surface.endsWith('ów')) {
    return {
      lemma: surface.replace(/ów$/, ''),
      upos: 'NOUN',
      morph: [{ key: 'Case', value: 'Gen' }, { key: 'Number', value: 'Plur' }, { key: 'Guess', value: 'suffix', source: 'adapter-specific' }],
    };
  }
  return { lemma: surface, upos: 'X', morph: [] };
}

export function makeLocalPolishMorphologyAdapter(): MorphologyAdapter {
  const adapterId = 'lingotorte.local-polish-morphology';
  const adapterVersion = '0.0.0-p8';
  return {
    adapterId,
    adapterVersion,
    privacyMode: 'local',
    async analyze(input: MorphologyInput): Promise<MorphologyOutput> {
      if (input.language !== 'pl') {
        throw new TypeError(`${adapterId} does not support language ${input.language}`);
      }
      const analyses: MorphologyOutput['analyses'] = input.tokens.map((token) => {
        if (token.tokenKind === 'punctuation' || token.tokenKind === 'symbol') {
          return {
            tokenIndex: token.tokenIndex,
            lemma: token.normalizedSurface,
            upos: token.tokenKind === 'punctuation' ? 'PUNCT' : 'SYM',
            morph: [],
            confidence: confidenceProbable(0.99),
            alternatives: [],
          };
        }
        if (token.tokenKind === 'number') {
          return {
            tokenIndex: token.tokenIndex,
            lemma: token.normalizedSurface,
            upos: 'NUM',
            morph: [{ key: 'NumType', value: 'Card', source: 'universal-dependencies' as const }],
            confidence: confidenceProbable(0.95),
            alternatives: [],
          };
        }
        const entry = inferLocalPolishEntry(token.normalizedSurface);
        return {
          tokenIndex: token.tokenIndex,
          lemma: entry.lemma,
          upos: entry.upos,
          morph: (entry.morph ?? []).map((feature) => ({
            key: feature.key,
            value: feature.value,
            source: feature.source ?? 'universal-dependencies' as const,
          })),
          confidence: confidenceProbable(entry.upos === 'X' ? 0.35 : 0.82),
          alternatives: entry.upos === 'X' ? [{ lemma: token.normalizedSurface, upos: 'X', note: 'No local lexicon hit' }] : [],
        };
      });
      return {
        run: makeAdapterRunRef('pos-morph', adapterId, adapterVersion, await inputHash(input.text, input.cueId), 'local'),
        analyses,
        warnings: ['Local heuristic Polish morphology; verify learner-critical analyses'],
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
    sourceName: 'none',
    async lookup(input: LookupInput): Promise<LookupOutput> {
      const cueId = 'cueId' in input.target ? input.target.cueId : 'no-cue';
      return {
        run: makeAdapterRunRef('dictionary', adapterId, adapterVersion, await inputHash(JSON.stringify(input.target), cueId), 'local'),
        entries: [],
        warnings: [`Dictionary unavailable for target ${input.target.kind}`],
      };
    },
  };
}

type FixtureEntry = Readonly<{
  headword: string;
  partOfSpeech: string;
  shortGloss: string;
  senses: LookupOutputEntry['senses'];
}>;

export type FixtureDictionaryData = Readonly<{
  language: string;
  learnerLanguage: string;
  license: string;
  entries: Record<string, FixtureEntry>;
}>;

export function makeFixtureDictionaryAdapter(data: FixtureDictionaryData): DictionaryAdapter {
  const adapterId = 'lingotorte.fixture-dictionary';
  const adapterVersion = '0.0.0-p3';
  const sourceName = `fixture-dictionary-${data.language}-${data.learnerLanguage}`;
  const sourceLicense = data.license;
  return {
    adapterId,
    adapterVersion,
    privacyMode: 'local',
    sourceName,
    sourceLicense,
    async lookup(input: LookupInput): Promise<LookupOutput> {
      let headword: string | undefined;
      let cueId: string;
      if (input.target.kind === 'token') {
        headword = input.analysis?.lemma ?? input.target.text.toLowerCase().replace(/[.,!?;:]$/, '');
        cueId = input.target.cueId;
      } else {
        headword = input.target.text.toLowerCase().replace(/[.,!?;:]$/, '');
        cueId = input.target.cueId;
      }
      const entries: LookupOutputEntry[] = [];
      const fixture = headword ? data.entries[headword] : undefined;
      if (fixture) {
        const entry: LookupOutputEntry = {
          headword,
          lemma: fixture.headword,
          partOfSpeech: fixture.partOfSpeech,
          shortGloss: fixture.shortGloss,
          senses: fixture.senses,
          sourceName,
          sourceLicense,
        };
        entries.push(entry);
      }
      return {
        run: makeAdapterRunRef('dictionary', adapterId, adapterVersion, await inputHash(headword ?? input.target.text, cueId), 'local'),
        entries,
        warnings: entries.length === 0 ? [`No fixture entry for "${headword ?? input.target.text}"`] : [],
      };
    },
  };
}

export function makeTokenOccurrenceFromTokenizer(
  cueId: UUID,
  runId: UUID,
  token: TokenizerOutput['tokens'][number],
): {
  id: UUID;
  cueId: UUID;
  analysisRunId: UUID;
  tokenIndex: number;
  charStart: number;
  charEnd: number;
  surface: string;
  normalized: string;
} {
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

export function assertProvidersDisabled(policy: { onlineProvidersEnabled: boolean; allowedDataClasses: readonly string[] }): void {
  if (policy.onlineProvidersEnabled !== false || policy.allowedDataClasses.length !== 0) {
    throw new TypeError('Online providers must be disabled for local-only adapter pipeline');
  }
}

export function resolveLocalAdapters(
  policy: { onlineProvidersEnabled: boolean; allowedDataClasses: readonly string[] },
  language: string,
  fixtureDictionary?: FixtureDictionaryData,
): LanguageAdapters {
  assertProvidersDisabled(policy);
  return {
    tokenizer: makeWhitespaceTokenizer(language),
    morphology: language === 'pl' ? makeLocalPolishMorphologyAdapter() : makeDisabledMorphologyAdapter(),
    dictionary: fixtureDictionary ? makeFixtureDictionaryAdapter(fixtureDictionary) : makeUnavailableDictionaryAdapter(),
  };
}

export const polishFixtureDictionary: FixtureDictionaryData = {
  language: 'pl',
  learnerLanguage: 'en',
  license: 'synthetic-fixture',
  entries: {
    cześć: {
      headword: 'cześć',
      partOfSpeech: 'NOUN',
      shortGloss: 'hi; hello',
      senses: [
        { gloss: 'hi', confidence: { kind: 'probable', value: 0.9 } },
        { gloss: 'hello', confidence: { kind: 'probable', value: 0.85 } },
      ],
    },
    lokalny: {
      headword: 'lokalny',
      partOfSpeech: 'ADJ',
      shortGloss: 'local',
      senses: [{ gloss: 'local', confidence: { kind: 'probable', value: 0.95 } }],
    },
    test: {
      headword: 'test',
      partOfSpeech: 'NOUN',
      shortGloss: 'test',
      senses: [{ gloss: 'test', confidence: { kind: 'certain', value: 1.0 } }],
    },
    uczyć: {
      headword: 'uczyć',
      partOfSpeech: 'VERB',
      shortGloss: 'to learn; to teach',
      senses: [
        { gloss: 'to learn', confidence: { kind: 'probable', value: 0.8 } },
        { gloss: 'to teach', confidence: { kind: 'possible', value: 0.6 } },
      ],
    },
    własny: {
      headword: 'własny',
      partOfSpeech: 'ADJ',
      shortGloss: 'own',
      senses: [{ gloss: 'own', confidence: { kind: 'probable', value: 0.9 } }],
    },
    napis: {
      headword: 'napis',
      partOfSpeech: 'NOUN',
      shortGloss: 'caption; inscription',
      senses: [{ gloss: 'caption', confidence: { kind: 'probable', value: 0.88 } }],
    },
    napisy: {
      headword: 'napisy',
      partOfSpeech: 'NOUN',
      shortGloss: 'subtitles; captions',
      senses: [{ gloss: 'subtitles', confidence: { kind: 'probable', value: 0.9 } }],
    },
  },
};
