# Language Analysis, Saved Learning Objects, SRS, and Practice Plan

**Workspace:** `<local-workspace>/lingotorte`
**Task:** plan language analysis, SRS, and practice mechanics; do not implement.  
**Status:** planning artifact.  
**Scope:** local/private Lingotorte app for owned media and explicit subtitles/transcripts.  

## Evidence legend

Every substantive claim is labeled with one of these evidence types:

- **[PROJECT]**: grounded in `AGENTS.md`, `README.md`, or mission briefs in this workspace.
- **[PRELIM]**: grounded in `docs/research/preliminary-grounding-research.md`.
- **[LIVE-UI]**: grounded in `docs/research/live-ui-inventory.md` sanitized Lingopie UI observations.
- **[PUBLIC]**: grounded in public documentation discovered during this task.
- **[DESIGN]**: a Lingotorte design recommendation or implementation contract derived from the above evidence.
- **[OPEN]**: human decision, spike, or later evidence needed.

Confidence is `high`, `medium`, or `low`. Source-backed behavior and design recommendations are intentionally separated.

## Non-goals and hard boundaries

- **[PROJECT, high]** Lingotorte must target Janusz's own local videos/subtitles and explicit transcript inputs, not Lingopie media, private account data, proprietary subtitle files, catalog data, code, assets, or API payloads.
- **[PROJECT, high]** Local/offline processing is the default. Online translation, dictionary, ASR, or LLM providers are optional adapters that require explicit opt-in and privacy warnings.
- **[PROJECT, high]** The central product artifact is a video segment plus aligned subtitle/transcript cue; vocabulary, grammar, review, and analytics should preserve that source context.
- **[DESIGN, high]** This document defines contracts and data shapes only. It does not authorize account mutation, scraping, DRM circumvention, service configuration, implementation, or external provider setup.

## Source-backed behavior to preserve as local mechanics

### Observed/product-reference mechanics

- **[LIVE-UI, high]** The reference player shows dual subtitles, a synchronized transcript side panel, tokenized transcript cells, `Listen` and `Loop` controls, sentence-level `Explain` and `Save` actions, and a Grammar Index with POS coloring.
- **[LIVE-UI, high]** The reference practice route is centered on contextual review: `My Vocab`, `My Sentences`, Learning / Due to Review (SRS) / Mastered states, item meanings, POS/morphology labels, last-occurrence sentence context, source show/episode link, appearance count, and SRS step indicators.
- **[LIVE-UI, medium]** Reference game entrypoints include `Flip & Learn`, `Match Your Words`, `Perfect Your Vocab`, and `Build the Sentence`; exact internal rules were not inspected because account mutation was avoided.
- **[PRELIM, high]** The recommended Lingotorte MVP is local video + target/native subtitles + synchronized transcript + click/drag lookup + saved word/phrase/sentence occurrences + FSRS/Anki-style review.

### Public/OSS scheduling facts

- **[PUBLIC, high]** `ts-fsrs` documents four card states: `New`, `Learning`, `Review`, and `Relearning`, with ratings `Again`, `Hard`, `Good`, and `Easy`.
- **[PUBLIC, high]** `ts-fsrs` supports previewing all possible scheduling outcomes before the learner answers (`repeat`) and applying one selected rating (`next`).
- **[PUBLIC, high]** FSRS-style state transitions are: new cards enter learning on `Again`/`Hard`/`Good` and may skip to review on `Easy`; review cards remain review on `Hard`/`Good`/`Easy` and move to relearning on `Again`; learning/relearning cards advance or reset through configured short steps.
- **[PUBLIC, high]** Anki can export notes as tab-separated plain text and packaged decks as `.apkg`; packaged deck export can optionally include media and scheduling information.
- **[PUBLIC, high]** Universal Dependencies represents morphology with lemma, a universal POS tag, and feature key/value pairs; UPOS has a fixed universal inventory, while features can include universal and documented language-specific features.

## Architecture overview

**[DESIGN, high]** Split the subsystem into six layers so implementers can test and replace pieces independently:

```text
Local media + subtitle cues
        ↓
Cue normalization and alignment
        ↓
Language analysis adapters
(tokenize, lemma, POS, morphology, dictionary, translation, explanation)
        ↓
Saved learning objects
(lexeme, phrase, sentence, occurrence-backed)
        ↓
Review cards + FSRS state
        ↓
Practice modes + export
(flashcards, quiz, match, sentence builder, Anki, optional shadowing)
```

Key rule: language analysis is source-derived and recomputable; saved items, review events, notes, and learner decisions are learner state and must be durable/auditable. **[PRELIM, high]**

## Shared object model

The following TypeScript-style shapes are normative planning contracts. Field names can be adapted to the final stack, but the same information must be preserved. **[DESIGN, high]**

### Primitive types

```ts
type UUID = string;
type ISODateTime = string;
type Milliseconds = number;
type LanguageCode = string; // BCP-47, e.g. "pl", "es", "ja-JP"
type Confidence = "high" | "medium" | "low";
type EvidenceType = "project" | "prelim" | "live-ui" | "public" | "local-experiment" | "design";

type SourceEvidence = {
  type: EvidenceType;
  source: string;          // file path, URL, or local experiment id
  claim: string;
  confidence: Confidence;
};
```

### Media, subtitle, cue, and token context

```ts
type MediaFile = {
  id: UUID;
  title: string;
  originalPath: string;          // local user-owned path; never uploaded by default
  contentHash?: string;          // optional sha256 or media fingerprint
  durationMs: Milliseconds;
  createdAt: ISODateTime;
  importedAt: ISODateTime;
  privacyClass: "local-only" | "explicit-export";
};

type SubtitleTrack = {
  id: UUID;
  mediaId: UUID;
  language: LanguageCode;
  role: "target" | "native" | "other";
  format: "srt" | "vtt" | "ass" | "ssa" | "embedded" | "generated";
  sourcePath?: string;
  generatedBy?: AdapterRunRef;
  importedAt: ISODateTime;
};

type SubtitleCue = {
  id: UUID;
  mediaId: UUID;
  trackId: UUID;
  index: number;
  startMs: Milliseconds;
  endMs: Milliseconds;
  rawText: string;
  normalizedText: string;
  alignedNativeCueIds: UUID[];
  tokenizationRunId?: UUID;
};

type TokenOccurrence = {
  id: UUID;
  mediaId: UUID;
  cueId: UUID;
  tokenIndex: number;
  charStart: number;
  charEnd: number;
  surface: string;
  normalizedSurface: string;
  language: LanguageCode;
  tokenKind: "word" | "punctuation" | "number" | "symbol" | "space" | "other";
  analysisId?: UUID;
};
```

**Acceptance criteria**

- **[DESIGN, high]** Every saved item and review card can navigate back to `mediaId`, cue time range, and token/phrase span.
- **[DESIGN, high]** Cue timing uses millisecond integers; UI rendering may round but persisted state must not.
- **[DESIGN, high]** Subtitle text normalization must not destroy the original cue text; `rawText` is preserved for display/export and `normalizedText` is for analysis/search.

**Edge cases**

- **[DESIGN, high]** Overlapping cues: allow multiple active cues and store each cue independently; do not collapse them into one text string.
- **[DESIGN, high]** Subtitle drift: preserve original cue times and store alignment corrections as separate records.
- **[DESIGN, high]** Missing native subtitles: allow `alignedNativeCueIds: []`; practice and review cards must still work from target context.
- **[DESIGN, medium]** Multi-speaker cues or ASS styling: strip styling for analysis, but retain enough raw text/metadata to render or audit source text later.

**Privacy notes**

- **[PROJECT, high]** Media paths, cue text, and saved notes are private local learner data.
- **[DESIGN, high]** Any export, cloud backup, translation call, or LLM explanation must present the exact text/time/media metadata to be sent before opt-in.

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

## Saved learning objects

### Conceptual model

- **[LIVE-UI, high]** Reference review items preserve contextual occurrence information, including highlighted sentence context, source show/episode link, appearance count, POS/morph labels, and review state.
- **[DESIGN, high]** Lingotorte should distinguish the learner's saved object from the source occurrence and from generated review cards.

```ts
type SavedItemKind = "lexeme" | "phrase" | "sentence";

type SourceContextRef = {
  mediaId: UUID;
  trackId: UUID;
  cueId: UUID;
  startMs: Milliseconds;
  endMs: Milliseconds;
  tokenOccurrenceIds: UUID[];
  tokenStart?: number;
  tokenEnd?: number;
  selectedText: string;
  cueText: string;
  nativeCueText?: string;
  precedingCueId?: UUID;
  followingCueId?: UUID;
};

type SavedItem = {
  id: UUID;
  kind: SavedItemKind;
  language: LanguageCode;
  learnerLanguage: LanguageCode;
  displayText: string;
  normalizedKey: string;
  lemmaKey?: string;
  primaryMeaning?: string;
  learnerNote?: string;
  sourceContext: SourceContextRef;
  analysisSnapshot: {
    tokenAnalyses: LanguageAnalysis[];
    lookup?: LookupOutput;
    explanationId?: UUID;
  };
  occurrenceIds: UUID[];
  status: "active" | "suspended" | "archived";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

type SavedOccurrence = {
  id: UUID;
  savedItemId: UUID;
  sourceContext: SourceContextRef;
  discoveredBy: "user-click" | "user-selection" | "import" | "auto-suggested";
  createdAt: ISODateTime;
};
```

### Save flows

#### Save vocabulary item

1. **[DESIGN, high]** Learner clicks a token or selects a token span in the current cue.
2. **[DESIGN, high]** App resolves token occurrence, analysis, dictionary/translation candidates, and source context.
3. **[DESIGN, high]** App creates or reuses a `SavedItem` keyed by language + normalized/lemma key + learner language, then appends a `SavedOccurrence` for this exact cue/time.
4. **[DESIGN, high]** App creates default review cards according to card-generation policy.

#### Save phrase

1. **[DESIGN, high]** Learner drags/selects multiple tokens or enters phrase-selection mode.
2. **[DESIGN, high]** App stores exact selected text, token span, cue context, and optional phrase translation.
3. **[DESIGN, medium]** Phrase saved items can share component token analyses but must not require every token to have a lemma.

#### Save sentence

1. **[LIVE-UI, high]** Reference UI exposes sentence-level `Save` and `Explain` actions.
2. **[DESIGN, high]** Lingotorte sentence save stores the full cue text, cue time range, aligned native cue if present, explanation artifact if generated, and media/cue reference.
3. **[DESIGN, medium]** If a sentence spans multiple subtitle cues, save a sentence object with multiple `SourceContextRef` records.

### Acceptance criteria

- **[DESIGN, high]** Saved items can be listed as `My Vocab` and `My Sentences` without running media playback.
- **[DESIGN, high]** Every saved item can open the source media at the relevant cue and highlight the saved span.
- **[DESIGN, high]** Duplicate saving adds a new occurrence rather than overwriting prior occurrence history.
- **[DESIGN, high]** Saved item display can show current meaning, learner note, POS/morph summary, occurrence count, source title, and due/mastery status.
- **[DESIGN, high]** Saved objects do not require external accounts or proprietary data access.

### Edge cases

- **[DESIGN, high]** Same surface form with different lemmas or POS: allow separate saved items or a disambiguation UI.
- **[DESIGN, high]** Same lemma with many inflected forms: group occurrences under `lemmaKey` but preserve each surface form.
- **[DESIGN, medium]** User correction of meaning: keep learner override separate from adapter output.
- **[DESIGN, medium]** Deleted or moved media: saved item remains visible with text context but playback is marked unavailable until path is repaired.

### Privacy notes

- **[PROJECT, high]** Saved vocabulary and sentences are private learner data.
- **[DESIGN, high]** Export must let the user exclude media paths, clip media, notes, or exact cue text if desired.

## FSRS-based SRS states and scheduling data

### Review card model

```ts
type CardType =
  | "recognition"        // see target/context, recall meaning
  | "production"         // see meaning/native context, produce target
  | "clip-to-word"       // hear/see clip, identify saved word/phrase
  | "word-to-context"    // see word, identify source/context
  | "sentence-order"     // reconstruct target sentence
  | "shadowing";         // optional pronunciation practice

type FSRSState = "new" | "learning" | "review" | "relearning";
type ReviewRating = "again" | "hard" | "good" | "easy";

type ReviewCard = {
  id: UUID;
  savedItemId: UUID;
  cardType: CardType;
  promptPolicy: PromptPolicy;
  state: FSRSState;
  dueAt: ISODateTime;
  lastReviewAt?: ISODateTime;
  stability?: number;
  difficulty?: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  learningStepIndex?: number;
  suspended: boolean;
  buriedUntil?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

type PromptPolicy = {
  showVideoClip: boolean;
  showTargetText: "hidden" | "masked-item" | "full";
  showNativeText: boolean;
  showPOS: boolean;
  showMeaning: boolean;
  requireTypedAnswer: boolean;
};

type ReviewEvent = {
  id: UUID;
  cardId: UUID;
  savedItemId: UUID;
  reviewedAt: ISODateTime;
  previousState: FSRSState;
  rating: ReviewRating;
  responseMs?: number;
  answerText?: string;
  correct?: boolean;
  schedulerVersion: string;
  previousDueAt: ISODateTime;
  nextDueAt: ISODateTime;
  nextState: FSRSState;
  stabilityBefore?: number;
  stabilityAfter?: number;
  difficultyBefore?: number;
  difficultyAfter?: number;
  practiceMode: PracticeMode;
};
```

### State transitions

**[PUBLIC, high]** Use the FSRS library's scheduler as the source of truth for due dates, stability, difficulty, intervals, and fuzzing. The table below is the product-level state machine implementers must support:

| Current state | Again | Hard | Good | Easy |
|---|---|---|---|---|
| `new` | `learning` step 1 | `learning` step 1 | `learning` step 1 | `review` |
| `learning` | reset to learning step 1 | stay/advance learning step | advance; graduate to `review` if final step | `review` |
| `review` | `relearning` step 1; increment lapse | stay `review` | stay `review` | stay `review` |
| `relearning` | reset relearning step 1 | stay/advance relearning step | advance; return to `review` if final step | `review` |

### Scheduling rules

- **[DESIGN, high]** Review sessions query cards where `dueAt <= now`, not saved items directly.
- **[DESIGN, high]** A saved item may generate multiple cards, but sibling cards should be bury-able so the same item does not appear repeatedly in one session unless the user explicitly allows it.
- **[PUBLIC, high]** Use the FSRS scheduler's preview capability to show possible outcomes only if needed; persist only the selected outcome in `ReviewEvent`.
- **[DESIGN, high]** Never recompute current card state from mutable summaries alone. Persist review events append-only and maintain a current-card projection.
- **[DESIGN, medium]** `Mastered` is a UI bucket, not a core FSRS state. Suggested definition: `state === "review"` plus interval/stability threshold or no due date within a chosen horizon.
- **[DESIGN, medium]** `Learning` and `Due to Review (SRS)` UI buckets map to `state in learning/relearning` and `dueAt <= now` respectively; exact labels can vary.

### Acceptance criteria

- **[DESIGN, high]** Implementers can create a new card with state `new`, review it with any of four ratings, and persist a `ReviewEvent` containing old state, selected rating, new state, next due date, and scheduler version.
- **[DESIGN, high]** Review history can be replayed to rebuild current state after a scheduler-library upgrade or database projection bug.
- **[DESIGN, high]** The system can suspend, bury, archive, or delete cards without deleting saved item history.
- **[DESIGN, high]** The UI can explain why an item appears in Learning, Due, or Mastered using persisted review state.

### Edge cases

- **[DESIGN, high]** Timezone and clock changes: store UTC timestamps and compute review availability from a single local clock service.
- **[DESIGN, high]** Missed reviews: rely on scheduler elapsed days rather than assuming daily use.
- **[DESIGN, medium]** Bulk import from Anki or CSV: create historical `ReviewEvent` records only if enough data exists; otherwise initialize as `new` or user-selected state.
- **[DESIGN, medium]** Scheduler version changes: keep `schedulerVersion` and parameters per event/run.

### Privacy notes

- **[DESIGN, high]** Review events reveal learning behavior and should stay local by default.
- **[DESIGN, high]** Any analytics export must aggregate or explicitly disclose saved text, review timestamps, and media references.

## Practice modes

```ts
type PracticeMode =
  | "flip-and-learn"
  | "perfect-your-vocab"
  | "match-your-words"
  | "build-the-sentence"
  | "shadowing";
```

### Mode 1: Flip & Learn / FSRS flashcard

**Source-backed behavior**

- **[LIVE-UI, high]** Reference UI exposes `Flip & Learn` and review states tied to contextual vocabulary.
- **[PRELIM, high]** Preliminary plan maps flashcards to cue/word/phrase → reveal meaning and grade Again/Hard/Good/Easy.

**Rules**

1. **[DESIGN, high]** Select due `ReviewCard` objects of type `recognition`, `production`, or `word-to-context`.
2. **[DESIGN, high]** Prompt includes source media title, optional still/clip, cue context according to `PromptPolicy`, and masked target span if needed.
3. **[DESIGN, high]** Learner reveals answer or submits typed response.
4. **[DESIGN, high]** Learner grades with `again`, `hard`, `good`, or `easy`; typed correctness may recommend a rating but must not silently hide FSRS semantics.
5. **[DESIGN, high]** Persist one `ReviewEvent` and update the card projection through FSRS.

**Acceptance criteria**

- **[DESIGN, high]** A due recognition card can be reviewed without media playback if clip generation is unavailable.
- **[DESIGN, high]** Card answer view shows meaning, lemma/POS/morph summary if available, original sentence, native subtitle if available, and source cue link.
- **[DESIGN, high]** Review buttons map exactly to FSRS ratings.

**Edge cases**

- **[DESIGN, medium]** If the source media file is unavailable, show text-only context and mark clip unavailable.
- **[DESIGN, medium]** If multiple meanings exist, accept learner-selected primary meaning or show all candidate meanings.

**Privacy notes**

- **[DESIGN, high]** Clip thumbnails/audio snippets are derived from local media and should be stored in a local cache with export controls.

### Mode 2: Perfect Your Vocab / meaning quiz

**Source-backed behavior**

- **[LIVE-UI, medium]** Reference UI exposes `Perfect Your Vocab`; exact scoring rules were not inspected.
- **[DESIGN, high]** Local equivalent should quiz recognition of meaning/translation from saved vocabulary.

**Rules**

1. **[DESIGN, high]** Prompt with saved word/phrase, optional cue sentence with the target highlighted or masked.
2. **[DESIGN, high]** Generate 3-5 distractors from same language and compatible item type; prefer same POS where known.
3. **[DESIGN, high]** Correct answer is the saved learner meaning or selected dictionary/translation sense.
4. **[DESIGN, medium]** Map result to FSRS rating suggestion: incorrect → `again`; correct but slow/hinted → `hard`; correct → `good`; instant/easy streak → `easy`. Let user override in settings.

**Acceptance criteria**

- **[DESIGN, high]** Distractors never use the same saved item or identical normalized key as the correct answer.
- **[DESIGN, high]** The quiz can run entirely from local saved items; no online provider is required.
- **[DESIGN, medium]** If not enough distractors exist, fall back to flashcard mode rather than fabricating options.

**Edge cases**

- **[DESIGN, high]** Synonyms and near-duplicates can make multiple options correct; store distractor provenance and allow challenge/mark-correct.
- **[DESIGN, medium]** Ambiguous short words need context shown by default.

**Privacy notes**

- **[DESIGN, high]** Distractor generation from local saved items avoids sending private vocabulary to an external provider.

### Mode 3: Match Your Words / clip or context matching

**Source-backed behavior**

- **[LIVE-UI, medium]** Reference UI exposes `Match Your Words`; observed vocabulary rows preserve last occurrence and source context.
- **[PRELIM, medium]** Preliminary mapping suggests play clip/audio and choose the heard/saved word.

**Rules**

1. **[DESIGN, high]** Build a round from 4-8 saved items with available source contexts.
2. **[DESIGN, high]** Show target words/phrases and meanings in one column and clips/sentences/native meanings in another column, depending on selected variant.
3. **[DESIGN, high]** Learner pairs all items; each card receives a mode result.
4. **[DESIGN, medium]** Convert per-item results to review events only for cards due in FSRS; practice-only rounds can log non-scheduling practice events.

**Acceptance criteria**

- **[DESIGN, high]** Every match prompt includes enough source context to disambiguate homographs.
- **[DESIGN, high]** The mode handles missing clips by using cue text.
- **[DESIGN, medium]** Review scheduling updates are per card, not per round aggregate.

**Edge cases**

- **[DESIGN, medium]** Very similar items should not be placed in the same matching round unless the user enables hard mode.
- **[DESIGN, medium]** Long phrases may need truncation in grid UI but full text must be available on hover/detail.

**Privacy notes**

- **[DESIGN, high]** Generated audio clips remain local derived artifacts; exporting them may expose copyrighted/user-owned media snippets.

### Mode 4: Build the Sentence / sentence reconstruction

**Source-backed behavior**

- **[LIVE-UI, medium]** Reference UI exposes `Build the Sentence`.
- **[PRELIM, high]** Preliminary plan maps sentence practice to scrambled target cue tokens/phrases and reconstruction.

**Rules**

1. **[DESIGN, high]** Select saved sentence items or sentence-order review cards.
2. **[DESIGN, high]** Tokenize the target sentence with the same tokenizer used for analysis.
3. **[DESIGN, high]** Create draggable chunks: tokens for short sentences; phrase chunks for long or morphologically complex sentences.
4. **[DESIGN, high]** Optionally show native subtitle, audio/video clip, POS colors, or first-letter hints according to difficulty.
5. **[DESIGN, high]** Score exact order by token/chunk IDs, not by string comparison alone.
6. **[DESIGN, medium]** Map completion to a rating suggestion using correctness, hints, and response time.

**Acceptance criteria**

- **[DESIGN, high]** Punctuation handling is deterministic: punctuation can be fixed in place or represented as chunks, but the rule must be mode-configured.
- **[DESIGN, high]** The answer can be checked from token IDs even when duplicate words occur.
- **[DESIGN, high]** The review card preserves cue/media source and can replay the sentence.

**Edge cases**

- **[DESIGN, high]** Duplicate tokens require stable token occurrence IDs; string-based checking is insufficient.
- **[DESIGN, medium]** Flexible word-order languages may have multiple acceptable answers; v1 can use source-order only and mark flexible scoring as a later feature.
- **[DESIGN, medium]** Subtitles that split one grammatical sentence across cues need multi-cue sentence objects.

**Privacy notes**

- **[DESIGN, high]** No external service is required for source-order reconstruction.

### Optional Mode 5: Pronunciation / shadowing

**Source-backed behavior**

- **[PRELIM, medium]** Public/product inventory includes Listen and Repeat, pronunciation recording/feedback, and optional shadowing.
- **[LIVE-UI, high]** `Listen` and `Loop` controls were observed in the reference player.

**Rules**

1. **[DESIGN, medium]** Learner opens a saved sentence or cue and loops the source audio.
2. **[DESIGN, medium]** Learner records local microphone audio only after explicit permission.
3. **[DESIGN, medium]** Local ASR/forced alignment compares learner transcript/timing to target text and returns coarse feedback.
4. **[DESIGN, low]** Pronunciation scoring should be treated as an optional spike, not MVP scheduling-critical functionality.

```ts
type ShadowingAttempt = {
  id: UUID;
  savedItemId?: UUID;
  cueId: UUID;
  recordedAudioPath: string;
  recordedAt: ISODateTime;
  asrTranscript?: string;
  alignmentScore?: number;
  timingScore?: number;
  pronunciationHints: string[];
  adapterRun?: AdapterRunRef;
  userConsent: true;
};
```

**Acceptance criteria**

- **[DESIGN, high]** Recording is never automatic; microphone permission and storage location are explicit.
- **[DESIGN, medium]** Shadowing attempts can exist without affecting FSRS unless the user enables a shadowing card type.
- **[DESIGN, medium]** If local ASR is unavailable, the mode degrades to listen/loop/repeat without scoring.

**Edge cases**

- **[DESIGN, medium]** Background noise, accents, speech rate, and ASR language mismatch can produce unfair scores.
- **[DESIGN, medium]** Short utterances may be too small for reliable ASR scoring; show confidence/warnings.

**Privacy notes**

- **[PROJECT, high]** Voice recordings are sensitive local data. Online speech APIs require explicit opt-in and deletion controls.

## Anki export plan

### Export targets

- **[PUBLIC, high]** Anki supports tab-separated plain text note exports/imports and `.apkg` packaged decks with optional media and scheduling information.
- **[DESIGN, high]** Lingotorte should first implement deterministic TSV/CSV-style note export, then optional `.apkg` generation if library support is chosen later.

### Recommended note fields

```ts
type AnkiExportNote = {
  deckName: string;
  noteType: "Lingotorte Context Card";
  guid: string;                    // stable from savedItemId + cardType
  fields: {
    TargetText: string;
    Lemma: string;
    PartOfSpeech: string;
    Morphology: string;
    Meaning: string;
    NativeSubtitle: string;
    SourceSentence: string;
    SentenceWithCloze: string;
    MediaTitle: string;
    CueStartMs: string;
    CueEndMs: string;
    SourcePathOrMediaId: string;
    OccurrenceId: string;
    SavedItemId: string;
    Notes: string;
    AudioOrClipRef: string;
    ScreenshotRef: string;
  };
  tags: string[]; // e.g. lingotorte, lang_pl, pos_VERB, media_<safe-id>
};
```

### Export rules

- **[DESIGN, high]** Default export excludes raw local file paths unless user enables them; use stable media IDs and cue times instead.
- **[DESIGN, high]** Include source sentence and cue timing so context survives outside Lingotorte.
- **[DESIGN, high]** Include `SavedItemId`/`OccurrenceId` for round-trip updating.
- **[DESIGN, medium]** Media exports should be opt-in because clips/screenshots are derived from local videos.
- **[DESIGN, medium]** Scheduling export/import is a separate choice; do not silently overwrite Anki scheduling or Lingotorte FSRS history.

### Acceptance criteria

- **[DESIGN, high]** Exported notes can be regenerated with stable GUIDs so Anki can update rather than duplicate notes.
- **[DESIGN, high]** Export works without AnkiConnect or an Anki account by writing a local text file.
- **[DESIGN, medium]** The export manifest lists included media files, omitted media files, and privacy-affecting fields.

### Edge cases

- **[DESIGN, high]** Tabs/newlines/HTML in subtitle text must be escaped according to the selected export format.
- **[DESIGN, medium]** Anki note types differ across user collections; provide a default note type and documented field mapping.
- **[DESIGN, medium]** If a user edits notes in Anki and reimports, conflict resolution requires a later explicit sync design.

### Privacy notes

- **[DESIGN, high]** AnkiWeb sync may upload exported text/media outside Lingotorte; warn before producing media-rich exports intended for synced decks.

## Review item source-context preservation

**[DESIGN, high]** Every review prompt and practice result must preserve this context bundle:

```ts
type ReviewContextBundle = {
  savedItemId: UUID;
  occurrenceId: UUID;
  media: {
    mediaId: UUID;
    title: string;
    originalPath?: string; // hidden from default export/display unless user opts in
  };
  cue: {
    cueId: UUID;
    startMs: Milliseconds;
    endMs: Milliseconds;
    targetText: string;
    nativeText?: string;
  };
  selection: {
    tokenOccurrenceIds: UUID[];
    selectedText: string;
    charStart?: number;
    charEnd?: number;
  };
  analysis: {
    lemma?: string;
    upos?: string;
    morphSummary?: string;
    confidence: Confidence;
  };
};
```

**Acceptance criteria**

- **[DESIGN, high]** From any card, the user can click `Open in source` and land at the correct media time with the saved span highlighted.
- **[DESIGN, high]** If source media is unavailable, text context and cue times still display.
- **[DESIGN, high]** Review events store the context ID used at review time so future changed subtitles do not rewrite historical prompts silently.

**Edge cases**

- **[DESIGN, medium]** User edits a subtitle after saving: preserve the old saved context snapshot and optionally offer to relink/update.
- **[DESIGN, medium]** Same subtitle file attached to multiple media files: context must key by `mediaId` + `trackId` + `cueId`, not text alone.

**Privacy notes**

- **[PROJECT, high]** Source context is the most sensitive learning data because it combines media identity, text, and behavior; keep local by default.

## Implementation sequencing plan

This is a plan for future implementers; it is not executed in this task. **[DESIGN, high]**

### Phase 0: Fixtures and contracts

1. Define the TypeScript/domain types above in a shared `domain` module.
2. Create fixture media metadata and subtitle cues from user-owned or synthetic subtitles.
3. Add adapter-contract tests that verify token offsets, cue context preservation, and serialization.

**Acceptance gate:** Given synthetic cue text, tokenizer and save flows can produce a `SavedItem`, `SavedOccurrence`, and unscheduled `ReviewCard` with source context intact.

### Phase 1: Local token lookup and saved items

1. Parse target/native subtitles into cue objects.
2. Tokenize target cues with char offsets.
3. Provide local dictionary/translation placeholder adapter with explicit provenance.
4. Implement save lexeme/phrase/sentence flows.

**Acceptance gate:** A user can save a word, phrase, and sentence from a cue; the item appears in local `My Vocab` / `My Sentences`; clicking it seeks to the source cue.

### Phase 2: FSRS review core

1. Integrate a mature FSRS library instead of inventing scheduling.
2. Persist `ReviewCard` projections and append-only `ReviewEvent` logs.
3. Implement Flip & Learn with four FSRS ratings.

**Acceptance gate:** Reviewing a due card with each rating produces the expected state transition class and a persisted event.

### Phase 3: Practice modes

1. Add meaning quiz with local distractors.
2. Add matching mode with text-first fallback and optional clips.
3. Add sentence builder using token IDs.

**Acceptance gate:** Each mode can run with local data only and updates per-card review state only when configured to do so.

### Phase 4: Export and optional pronunciation

1. Add Anki TSV export with stable GUIDs and privacy manifest.
2. Add optional media export.
3. Spike local shadowing/ASR only after core saved-item and review flows are stable.

**Acceptance gate:** Exported text file includes target, meaning, source sentence, cue times, IDs, and tags; no local media path is included unless opted in.

## Cross-subsystem acceptance checklist

- **[DESIGN, high]** Object types exist for media, subtitle tracks, cues, token occurrences, language analyses, lookup outputs, sentence explanations, saved items, saved occurrences, review cards, review events, practice attempts, and Anki export notes.
- **[DESIGN, high]** Adapter contracts define inputs/outputs for tokenization, lemma/POS/morphology, dictionary/translation lookup, sentence explanation, ASR/alignment, and pronunciation scoring.
- **[DESIGN, high]** FSRS state transitions are explicit and implementation delegates interval math to a scheduler library.
- **[DESIGN, high]** Practice-mode rules specify prompts, answer checking, scoring/rating mapping, and local fallback behavior.
- **[DESIGN, high]** Review items preserve source media, subtitle cue, selected token span, cue time range, and text context.
- **[DESIGN, high]** Privacy notes identify which features expose text, media paths, clips, review history, or voice recordings.
- **[DESIGN, high]** No step requires Lingopie account access, proprietary data, or online services.

## Open decisions for Janusz

- **[OPEN, high]** Primary target language order after Polish: this determines tokenizer/dictionary priorities.
- **[OPEN, medium]** Whether Anki is an export-only target or a first-class sync target.
- **[OPEN, medium]** How strict local-only mode should be: local LLMs only, optional online translation, or per-provider opt-in.
- **[OPEN, medium]** Whether `Mastered` should be an interval threshold, stability threshold, review-count threshold, or user-visible label only.
- **[OPEN, low]** Whether pronunciation/shadowing should influence SRS due dates or remain separate practice telemetry.

## Evidence index

| Claim area | Evidence | Confidence | Local implication |
|---|---|---:|---|
| Local-first owned-media boundary | `AGENTS.md`, `README.md`, mission docs | high | No proprietary Lingopie data or online dependency required. |
| Artifact-centered player | `AGENTS.md`, preliminary research | high | Saved/review items orbit video + cue context. |
| Dual subtitles, transcript, token clicks, Explain/Save, Listen/Loop, Grammar Index | `docs/research/live-ui-inventory.md` | high | MVP/V1 should implement local equivalents of these mechanics. |
| Practice labels and review buckets | `docs/research/live-ui-inventory.md` | medium/high | Map labels to local FSRS/practice modes, but do not assume exact proprietary rules. |
| FSRS states and ratings | `ts-fsrs` public docs/search results | high | Use New/Learning/Review/Relearning and Again/Hard/Good/Easy. |
| Anki export formats | Anki Manual public docs/search results | high | Start with local text export; media/scheduling are explicit choices. |
| UD lemma/POS/morphology model | Universal Dependencies public docs/search results | high | Use lemma + UPOS + feature pairs as cross-language analysis baseline. |
