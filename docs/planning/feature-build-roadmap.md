# Lingotorte Feature Build Roadmap

Status: implementation-facing roadmap for a future autonomous fleet. Planning only; no app code is implemented here.

Related docs: [Final Implementation Plan](./final-implementation-plan.md), [Evidence Index](./evidence-index.md), [Safety Boundaries](./safety-privacy-legal-boundaries.md), [Testing and Acceptance Plan](./testing-and-acceptance-plan.md), [Documentation Index](./documentation-index.md).

## Roadmap principles

1. Build from safe local fixtures before touching user libraries.
2. Preserve artifact-centered identity: media -> subtitle track -> cue -> token occurrence -> saved item -> review card.
3. Keep online providers disabled by default and covered by no-network tests.
4. Treat every third-party library as candidate-only until license/version/source verification.
5. Commit feature slices frequently in future implementation work; this planning bundle does not create code commits because the workspace is not a git repo.

## Dependency ordering

```text
P0 safety + fixtures + skeleton
  -> P1 media/subtitle/cue ingest
    -> P2 player + transcript sync
      -> P3 tokenization + lookup adapters
        -> P4 saved occurrences + learner state
          -> P5 FSRS review cards
            -> P6 practice modes + exports
              -> P7 generated subtitles/alignment + optional shadowing
                -> P8 backup/sync/progress polish
```

Hard blockers before implementation:

- safe owned/synthetic fixture set exists;
- project skeleton and test runner are chosen;
- no-network/provider-disabled test pattern exists;
- third-party dependencies selected for a slice have license/version verification;
- human decisions that affect a slice are either resolved or encoded as default-off/configurable.

## Milestone P0 — Safe project skeleton and fixtures

Goal: create a minimal local app/test foundation without product-risky behavior.

| Slice | Build | Acceptance gate |
|---|---|---|
| P0.1 skeleton | Vite/TypeScript UI plus local service boundary or equivalent selected by Janusz/fleet. | `npm test`/chosen test command runs; no network by default. |
| P0.2 fixture policy | `fixtures/media/sample-owned.*`, `fixtures/subtitles/sample.target.srt`, `fixtures/subtitles/sample.native.srt`, and `fixtures/metadata/README.md` using owned/synthetic content. | Fixture README proves no Lingopie/proprietary media/subtitles/screenshots. |
| P0.3 evidence/license workflow | `docs/dev/dependency-provenance.md` or equivalent for candidate dependency checks. | Each adopted dependency has URL, retrieval date, version/commit, license pointer/hash. |
| P0.4 provider-off harness | Test helper that fails on unexpected HTTP when providers are disabled. | Disabled dictionary/LLM/ASR providers make zero network calls. |

## Milestone P1 — Local media, subtitle, and cue ingestion

Goal: import local media and subtitle/transcript tracks into typed local records.

| Feature | Depends on | Build scope | Acceptance criteria |
|---|---|---|---|
| Media import | P0 fixtures | Select local file, compute duration/fingerprint, store path reference and metadata. | Given owned fixture media, media record exists with path, duration, hash/fingerprint; file is not copied unless configured. |
| Subtitle import | Media import | Parse SRT/VTT/ASS or chosen MVP formats into normalized cues. | Given target/native fixtures, cue rows have stable ids, start/end, text, language, role. |
| Track selection | Subtitle import | Choose target/native roles per media. | UI/API rejects missing target track with clear error; native track may be absent. |
| Cue alignment | Subtitle import | Timestamp-first target/native alignment with confidence flag. | Overlapping cues link; ambiguous/missing native cue remains explicit rather than guessed. |
| Import errors | All above | Recoverable parse/file errors. | Bad subtitle file does not corrupt existing media; user sees actionable local-only error. |

## Milestone P2 — Artifact-centered player and transcript

Goal: playable video with synchronized dual subtitles and transcript navigation.

| Feature | Depends on | Build scope | Acceptance criteria |
|---|---|---|---|
| Local video player | P1 media | Load local media in browser/Tauri/local server shape. | Play/pause/seek works with fixture video; no external media URL needed. |
| Dual subtitle overlay | P1 aligned cues | Display target and optional native cue at current time. | Current target/native cue changes at expected timestamps; missing native track degrades gracefully. |
| Transcript list | P1 cues | Scrollable/searchable cue list with current cue highlight. | Seeking video highlights current cue; clicking transcript row seeks video. |
| Cue seek/loop | Player + transcript | Loop current cue and seek previous/next cue. | Loop stays within cue bounds with tolerance; can disable loop. |
| Speed controls | Player | Expose safe playback rates. | Selected rate persists per media/session; transcript sync remains correct. |
| Accessibility baseline | Player/transcript | Keyboard controls, captions visible, focus states. | Core watch/study loop works without pointer-only actions. |

## Milestone P3 — Tokenization and lookup adapters

Goal: turn cue text into inspectable tokens and local lookup results while keeping adapters replaceable.

| Feature | Depends on | Build scope | Acceptance criteria |
|---|---|---|---|
| Token occurrence identity | P1 cues | Tokenize target cues into stable occurrence records. | Each token occurrence links to cue, token index/span, surface, normalized form. |
| Polish-first tokenizer spike | Token identity | Evaluate chosen local tokenizer for Polish fixture. | Tokenization fixture expected output checked; unresolved cases documented. |
| Lemma/POS/morph adapter | Token identity | Adapter contract for lemma, UPOS, morphology. | Adapter returns typed payload with version; failures preserve raw token and do not block playback. |
| Dictionary/translation lookup | Token identity | Local dictionary/translation adapter boundary. | Click token shows local result or clear unavailable state; online lookup disabled by default. |
| Phrase selection | Transcript/player | Select token range/phrase and request phrase lookup. | Phrase result preserves token ids, cue id, and original text span. |
| Grammar/POS visualization | Lemma/POS | Generic POS coloring/index, not Lingopie styling. | POS colors are configurable/generic; missing POS degrades to neutral. |

## Milestone P4 — Saved learning objects and contextual occurrences

Goal: save words, phrases, and sentences as source-backed learning objects.

| Feature | Depends on | Build scope | Acceptance criteria |
|---|---|---|---|
| Save vocabulary item | P3 lookup | Save token/lexeme with occurrence context. | Saved item links to media, cue, token ids/span, meaning/notes, language, created time. |
| Save phrase | Phrase selection | Save phrase as phrase-kind item. | Phrase preserves ordered token occurrences and exact cue/time range. |
| Save sentence | P2 transcript | Save full cue/sentence. | Sentence item links to cue and can replay source segment. |
| My Vocab / My Sentences | Saved items | Local library views. | Lists separate vocab/phrases/sentences, search/filter locally, show source context. |
| Occurrence count | Saved items | Aggregate appearances by normalized form/lemma where available. | Count is explainable and does not merge unrelated language forms silently. |
| Duplicate handling | Saved items | Existing saved item plus new occurrence vs duplicate. | User can add occurrence to existing item or create separate item; no data loss. |

## Milestone P5 — FSRS review core

Goal: create video-backed review cards from saved items and schedule them locally.

| Feature | Depends on | Build scope | Acceptance criteria |
|---|---|---|---|
| FSRS dependency verification | P0 license workflow | Verify chosen FSRS library/version/license. | Dependency evidence file exists before adoption. |
| Review card creation | P4 saved items | Recognition/production/card-type records. | Saving item can create review card with `new` state and due timestamp. |
| Review event logging | Review card | Append review events with rating and response metadata. | Again/Hard/Good/Easy creates immutable event and updated scheduling state. |
| Due queue | Review state | Query due cards by local time. | Due/new/learning/review buckets render deterministically in tests. |
| Video-backed prompt | P2 player + card | Replay cue/clip/context in review. | Card prompt can show/replay source cue without losing saved item context. |
| Mastered UI bucket | Review state | Configurable display rule, not FSRS core state. | Default threshold documented/configurable; implementation does not invent a hidden FSRS state. |

## Milestone P6 — Practice modes and export

Goal: add local equivalents of practice games while preserving SRS/source context.

| Mode/export | Depends on | Build scope | Acceptance criteria |
|---|---|---|---|
| Flip & Learn | P5 | Standard FSRS card reveal/rating. | Ratings update schedule; prompt includes video/text context. |
| Perfect Your Vocab | P5 + lookup | Meaning/translation quiz with local distractors. | Distractors are generated from local saved items; no online call by default. |
| Match Your Words | P5 + clips | Clip/audio/context-to-word matching. | Correct answer maps to saved item; clip generation uses local media only. |
| Build the Sentence | P5 + tokens | Reconstruct target cue from tokens/phrases. | Preserves punctuation/spacing rules and reports deterministic scoring. |
| Anki export | P4/P5 | `.apkg` or intermediate export plan with fields. | Export warns about text/media privacy; does not mutate Anki by default. |

## Milestone P7 — Generated subtitles, alignment, and optional shadowing

Goal: add higher-risk optional local media-processing capabilities after core product works.

| Feature | Depends on | Build scope | Acceptance criteria |
|---|---|---|---|
| Local ASR transcript generation | P1/P2 | Local faster-whisper/whisper.cpp-style adapter after dependency verification. | Given owned fixture audio, generated cues have timestamps and confidence; quality caveats reported. |
| Subtitle alignment tools | P1/P3 | Align generated/imported target/native tracks. | Manual correction workflow exists for ambiguous alignment. |
| Clip/audio extraction | P2/P5 | Lazy local snippets for review/practice. | Snippets are generated from owned local media and removable from cache. |
| Pronunciation/shadowing | P2 + ASR | Optional local recording + comparison flow. | Microphone permission explicit; temp recordings deleted unless saved; online scoring disabled by default. |

## Milestone P8 — Progress, backup, sync, and polish

Goal: durable local study product after core loops are validated.

| Feature | Depends on | Build scope | Acceptance criteria |
|---|---|---|---|
| Progress widgets | P5/P6 | Local dashboard metrics: due count, study time, saved count, streak if desired. | Metrics derive from local events and can be recalculated. |
| Backup/export/import | P4/P5 | Metadata-only backup first; optional media/caches later. | Restore roundtrip preserves saved items/review state; media-copy mode is explicit. |
| Privacy settings | All adapters | UI for provider/export/logging choices. | Disabled providers cannot be invoked; warnings are visible before opt-in. |
| Future sync | Backup | Design only until human decision. | No cloud sync implementation without separate approval and threat model. |

## Human decisions and safe defaults

| Decision | Safe default for roadmap | Blocks which milestone? |
|---|---|---|
| Primary target language order | Polish-first fixture spike, generic adapter contracts. | P3 quality, not P1/P2. |
| App shell | Local web/Vite first; Tauri remains path, not requirement. | P0 skeleton decision. |
| Backend language | TypeScript-only for MVP if possible; Python acceptable for ASR/NLP adapters. | P0/P7. |
| asbplayer vs custom player | Spike/reference only, not adoption. | P2 substrate choice. |
| Anki role | Export-only by default. | P6 export integration depth. |
| Online providers | Disabled by default. | P3/P7 optional adapters. |
| Mastered threshold | Configurable UI bucket. | P5/P6 display semantics. |
| Backup media copies | Metadata-only backup. | P8 backup scope. |
