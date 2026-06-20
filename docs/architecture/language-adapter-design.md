# Language Adapter Design

Status: split-out language adapter deliverable. Planning only.

## Adapter boundary principles

## Language analysis adapters

### Adapter boundary principles

- **[DESIGN, high]** Adapters are deterministic or versioned services that take local text/cue context and return typed analysis results with provenance.
- **[DESIGN, high]** Adapters must never mutate learner state directly. They may produce candidate analyses; the application decides what to persist.
- **[DESIGN, high]** Analysis outputs are cacheable and recomputable; saved item meanings/learner notes are not silently overwritten by later adapter runs.
- **[PUBLIC, high]** Use Universal Dependencies-style `lemma`, `upos`, and `features` as the cross-language baseline, with optional language-specific tags in `xpos`.

### Adapter contracts

```ts
type AdapterRunRef = {
  id: UUID;
  adapterKind:
    | "tokenizer"
    | "lemmatizer"
    | "pos-morph"
    | "dictionary"
    | "translation"
    | "sentence-explanation"
    | "asr"
    | "forced-alignment"
    | "pronunciation-scoring";
  adapterId: string;       // stable internal id, e.g. "spacy-pl", "local-dict-pl"
  adapterVersion: string;
  modelName?: string;
  modelVersion?: string;
  configHash: string;
  inputHash: string;
  createdAt: ISODateTime;
  privacyMode: "local" | "explicit-online";
};

type LanguageAnalysis = {
  id: UUID;
  tokenOccurrenceId: UUID;
  runId: UUID;
  language: LanguageCode;
  lemma?: string;
  upos?:
    | "ADJ" | "ADP" | "ADV" | "AUX" | "CCONJ" | "DET" | "INTJ"
    | "NOUN" | "NUM" | "PART" | "PRON" | "PROPN" | "PUNCT" | "SCONJ"
    | "SYM" | "VERB" | "X";
  xpos?: string;
  morph: MorphFeature[];
  confidence: Confidence;
  alternatives: AnalysisAlternative[];
};

type MorphFeature = {
  key: string;             // e.g. "Case", "Number", "Gender", "Tense"
  value: string;           // e.g. "Acc", "Sing", "Masc"
  source: "universal-dependencies" | "language-specific" | "adapter-specific";
};

type AnalysisAlternative = {
  lemma?: string;
  upos?: LanguageAnalysis["upos"];
  morph?: MorphFeature[];
  score?: number;
  note?: string;
};
```

#### Tokenizer adapter

```ts
type TokenizerInput = {
  language: LanguageCode;
  cueId: UUID;
  text: string;
  preserveCharOffsets: true;
};

type TokenizerOutput = {
  run: AdapterRunRef;
  tokens: Array<{
    tokenIndex: number;
    charStart: number;
    charEnd: number;
    surface: string;
    normalizedSurface: string;
    tokenKind: TokenOccurrence["tokenKind"];
    joinToPrevious?: boolean;
    joinToNext?: boolean;
  }>;
  warnings: string[];
};
```

**Acceptance criteria**

- **[DESIGN, high]** Token offsets round-trip to the original cue text exactly.
- **[DESIGN, high]** Tokenizer output can represent punctuation and contractions without losing display fidelity.
- **[DESIGN, high]** Phrase and sentence saving can reference token spans by `tokenIndex` plus character offsets.

**Edge cases**

- **[DESIGN, high]** Languages without whitespace segmentation (Japanese, Chinese, Thai) require language-specific tokenizers; whitespace splitting is invalid as a universal strategy.
- **[DESIGN, high]** Clitics, contractions, hyphenated words, and multiword expressions may require one surface span to map to multiple lexical analyses or one phrase item.
- **[DESIGN, medium]** Subtitle line breaks and karaoke timing markers should not create false lexical tokens.

**Privacy notes**

- **[DESIGN, high]** Local tokenization has no special privacy risk beyond storing cue text locally; online tokenization is disallowed unless explicitly enabled.

#### Lemma/POS/morphology adapter

```ts
type MorphologyInput = {
  language: LanguageCode;
  cueId: UUID;
  text: string;
  tokens: TokenizerOutput["tokens"];
  sentenceContext?: string;
};

type MorphologyOutput = {
  run: AdapterRunRef;
  analyses: Array<{
    tokenIndex: number;
    lemma?: string;
    upos?: LanguageAnalysis["upos"];
    xpos?: string;
    morph: MorphFeature[];
    confidence: Confidence;
    alternatives: AnalysisAlternative[];
  }>;
  dependencies?: Array<{
    tokenIndex: number;
    headTokenIndex: number | null;
    relation: string;
  }>;
  warnings: string[];
};
```

**Acceptance criteria**

- **[DESIGN, high]** The UI can color tokens by UPOS even when lemma/morphology is missing.
- **[DESIGN, high]** `xpos` and language-specific morphology are optional additions, not replacements for UPOS where available.
- **[DESIGN, high]** Low-confidence or ambiguous analyses must be visible to downstream consumers; they must not be silently coerced into high-certainty values.

**Multilingual considerations**

- **[DESIGN, high]** Polish should be treated as a serious early test because rich inflection stresses lemma, case, gender, number, aspect, and animacy handling.
- **[DESIGN, high]** Romance/Germanic languages can often share a UD-style adapter shape, but dictionaries, lemmatizers, and morphology quality vary by language.
- **[DESIGN, high]** Japanese/Korean/Chinese require dedicated segmentation and dictionary pipelines; do not assume token = whitespace-delimited word.
- **[DESIGN, medium]** RTL scripts need UI tests for cue highlighting, token selection, sentence builder ordering, and Anki export rendering.
- **[DESIGN, medium]** Code-switching requires cue-level language plus optional token-level detected language.

**Edge cases**

- **[DESIGN, high]** Homographs with different lemmas/POS must preserve alternatives.
- **[DESIGN, high]** Proper names and loanwords may lack dictionary entries; allow saved items with surface-only analysis.
- **[DESIGN, medium]** Generated subtitles may contain ASR errors; downstream lookup should carry an `analysisQuality` warning.

**Privacy notes**

- **[PROJECT, high]** POS/morphology can run locally by default. Online NLP APIs expose raw subtitle text and require explicit opt-in.

#### Dictionary and translation lookup adapter

```ts
type LookupTarget =
  | { kind: "token"; tokenOccurrenceId: UUID }
  | { kind: "phrase"; cueId: UUID; tokenStart: number; tokenEnd: number; text: string }
  | { kind: "sentence"; cueId: UUID; text: string };

type LookupInput = {
  target: LookupTarget;
  sourceLanguage: LanguageCode;
  learnerLanguage: LanguageCode;
  context: {
    cueText: string;
    nativeCueText?: string;
    mediaTitle?: string;
    precedingCueText?: string;
    followingCueText?: string;
  };
  analysis?: LanguageAnalysis;
};

type LookupOutput = {
  run: AdapterRunRef;
  entries: Array<{
    headword: string;
    lemma?: string;
    partOfSpeech?: string;
    shortGloss: string;
    senses: Array<{
      gloss: string;
      examples?: string[];
      register?: string;
      confidence: Confidence;
    }>;
    sourceName: string;
    sourceLicense?: string;
  }>;
  machineTranslation?: {
    text: string;
    provider: string;
    confidence: Confidence;
    warning?: string;
  };
  warnings: string[];
};
```

**Lookup strategy**

- **[DESIGN, high]** Resolution order should be: saved learner override → local dictionary/lexicon → local translation model → optional online provider.
- **[DESIGN, high]** Token lookup should prefer lemma-based lookup when lemma confidence is high, but show surface-form fallback when lemma is unknown or ambiguous.
- **[DESIGN, high]** Phrase translation is not the same as word dictionary lookup; it should preserve selected text and cue context.
- **[DESIGN, medium]** Sentence explanations should be generated from local cue context and analysis; online LLM explanations are opt-in because they expose subtitle text.

**Acceptance criteria**

- **[DESIGN, high]** Lookup output records source name/license where known so export and redistribution boundaries are visible.
- **[DESIGN, high]** Users can save an item even if lookup fails; the item can contain manual meaning/notes.
- **[DESIGN, high]** The UI distinguishes dictionary gloss, machine translation, and learner note.

**Edge cases**

- **[DESIGN, high]** Idioms and phrasal verbs may require phrase-level lookup even if individual token lookup succeeds.
- **[DESIGN, medium]** Profanity, slang, named entities, and subtitle transcription errors may have no reliable dictionary entry.
- **[DESIGN, medium]** Multiple learner languages require lookup cache keys to include both source and learner language.

**Privacy notes**

- **[DESIGN, high]** Online lookup sends selected text and context; show a confirmation boundary and store provider provenance.
- **[DESIGN, high]** Local dictionary lookup must not require an external account or proprietary Lingopie data.

#### Sentence explanation adapter

```ts
type SentenceExplanationInput = {
  cueId: UUID;
  sourceLanguage: LanguageCode;
  learnerLanguage: LanguageCode;
  targetText: string;
  nativeText?: string;
  tokens: TokenOccurrence[];
  analyses: LanguageAnalysis[];
  learnerLevel?: "beginner" | "intermediate" | "advanced";
};

type SentenceExplanation = {
  id: UUID;
  run: AdapterRunRef;
  cueId: UUID;
  summary: string;
  literalTranslation?: string;
  naturalTranslation?: string;
  grammarPoints: Array<{
    tokenIds: UUID[];
    label: string;
    explanation: string;
    confidence: Confidence;
  }>;
  warnings: string[];
};
```

**Acceptance criteria**

- **[DESIGN, high]** Explanation output must cite whether it came from local rules, local model, or opt-in online model.
- **[DESIGN, high]** Explanations are stored as generated artifacts with adapter provenance; learner edits are stored separately.
- **[DESIGN, medium]** UI can regenerate explanations after adapter/model upgrades without deleting historical learner notes.

**Edge cases**

- **[DESIGN, medium]** Humor, idioms, subtitles split mid-sentence, and missing context can produce misleading explanations; carry warnings.
- **[DESIGN, medium]** Multi-cue sentences need explanation inputs that can span cue boundaries while preserving individual cue references.

**Privacy notes**

- **[PROJECT, high]** Sentence explanations expose full cue text and possibly neighboring cues to providers; default to local-only.



## Adapter taxonomy and privacy tradeoffs

## Adapter interfaces and privacy tradeoffs

### Adapter taxonomy

| Adapter kind | Default mode | Input data | Output | Privacy risk | MVP? |
|---|---|---|---|---|---:|
| `subtitle_parser` | Local | subtitle file text | normalized cues | Low; local file content | Yes |
| `tokenizer` | Local | cue text | token spans | Low | Yes |
| `morphology` | Local | token/cue text | lemma/POS/morph | Low | Recommended |
| `dictionary` | Local first | token/lemma | definitions/translations | Low local; medium online | Yes, local/fixture fallback |
| `phrase_translation` | Local/offline optional | selected phrase/cue | translation | Medium if online | V1 opt-in |
| `grammar_explainer` | Local LLM optional | cue + parse | explanation | Medium/high if online | V1/V2 opt-in |
| `asr` | Local optional | media/audio | generated transcript | High if online; media leaves device | V1 local; online gated |
| `forced_alignment` | Local optional | audio + text | cue timing | High if online | V1/V2 local |
| `pronunciation_scorer` | Local optional | learner recording | score/feedback | High biometric/audio sensitivity | V2, explicit opt-in |



## Required adapter interfaces

Implement adapters for:

| Interface | Input | Output | Default |
|---|---|---|---|
| Tokenization | cue text, language, cue id | token spans with stable offsets | local |
| Lemma/POS/morphology | tokenized cue + language | lemma, UPOS, XPOS, morph features, confidence | local |
| Dictionary lookup | token/lemma/phrase + learner language | entries/glosses/source/license | local/offline or unavailable |
| Phrase translation | phrase/cue context | translation candidates + provenance | disabled/local by default |
| Grammar explanation | cue, parse, learner level | explanation sections + warnings | disabled/local by default |
| ASR/transcription | owned media/audio | generated cues/timestamps/confidence | optional local spike |
| Forced alignment | audio + transcript/subtitle | aligned cue/word timing | optional local spike |
| Pronunciation scoring | learner recording + prompt | local comparison/feedback | optional V2, explicit microphone gate |

## Polish-first recommendations

- Use Polish fixtures early because rich inflection stresses lemma, case, gender, number, aspect, animacy, and ambiguity.
- Require char-offset roundtrip tests for Polish tokenization.
- Treat lemma/POS/morph confidence as visible; do not silently merge inflected forms.
- Keep dictionary lookup source/license visible in the output model.

## Generalization path for other languages

- Use BCP-47 language codes at media/track/cue/token levels.
- Keep UPOS as cross-language baseline while allowing language-specific `xpos` and morph features.
- Do not assume whitespace tokenization; Japanese/Chinese/Thai/Korean need dedicated segmenters/dictionaries.
- Add RTL and code-switching UI fixtures before claiming support.

## Offline vs online tradeoffs

## Online provider policy

Default: all online providers are off.

Any online adapter must have:

1. explicit provider selection by Janusz/user;
2. per-feature data-class disclosure, especially cue text, surrounding context, media snippets, voice recordings, and learner notes;
3. local/offline fallback or a clear disabled state;
4. no-network tests proving disabled providers make zero network calls;
5. request logging that records provider name/status/error code, not raw payloads by default;
6. credential storage outside project docs and no credential commits;
7. a revocation/deletion path for cached provider outputs.

Provider classes:

| Adapter type | Default | Opt-in warning |
|---|---|---|
| Dictionary lookup | Local/offline dictionary preferred | Online lookup sends selected text and maybe language pair. |
| Phrase translation | Local model or disabled | Online translation sends phrase/cue context. |
| Sentence explanation | Local LLM or disabled | Online LLM sends sentence and possibly surrounding context/notes. |
| ASR/transcription | Local faster-whisper/whisper.cpp-style pipeline | Online ASR sends audio/media snippets. |
| Pronunciation scoring | Local ASR/alignment or disabled | Online scoring sends learner voice recordings. |
| Backup/sync | Manual local backup | Cloud sync may upload DB, cue text, notes, paths, and exported media. |



## Fixture/testing strategy

- Tokenizer fixtures must prove char offsets round-trip to original cue text.
- Morphology fixtures must show lemma/UPOS/morph ambiguity rather than forced certainty.
- Lookup fixtures must handle found, not-found, multiple-sense, and manual-meaning save flows.
- Provider-disabled tests must fail on any HTTP/DNS call.
- ASR/alignment/pronunciation fixtures use owned/synthetic media/audio only and report quality/latency rather than claiming general accuracy.
