# Lingotorte Implementation Plan

Status: implementation-facing plan for future autonomous agents. Planning only; do not implement from this workspace without a separate implementation task.

## Roadmap summary

## Implementation phases

See [Feature Build Roadmap](../planning/feature-build-roadmap.md) for feature-by-feature detail.

| Phase | Goal | Required outputs | Must pass before next phase |
|---|---|---|---|
| P0 | Skeleton, fixtures, provenance, no-network harness | Safe fixture set; test runner; provider-off tests; dependency provenance workflow | No Lingopie fixtures; no network by default; chosen shell documented. |
| P1 | Media/subtitle/cue ingestion | Media/track/cue records; parser errors; alignment basics | Typed records and safe failure behavior. |
| P2 | Player/transcript | Dual subtitles; transcript seek/highlight; loop/speed | E2E fixture playback and transcript sync. |
| P3 | Language adapters | Token occurrences; lookup/POS/phrase adapters | Typed adapter outputs; graceful unavailable states; no online calls disabled. |
| P4 | Saved occurrences | Save vocab/phrase/sentence; My Vocab/My Sentences | Source context preserved and duplicate handling tested. |
| P5 | FSRS review | Cards/events/due queue/video-backed prompts | FSRS verified; review events append-only; schedule deterministic. |
| P6 | Practice/export | Practice modes; local Anki/export | Local distractors/scoring; export warnings; no external mutation. |
| P7 | Transcript generation/correction | YouTube/provider caption candidates, local ASR drafts, correction UI, approved transcript gate | Provider/ASR output remains draft until corrected/approved; no-network disabled state covered. |
| P8 | ASR/alignment/shadowing | Local spikes and quality reports | Measured feasibility; voice/media privacy gates. |
| P9 | Progress/backup/sync | Dashboard, backup/restore, optional sync design | Backup roundtrip; media-copy/sync opt-in. |



## MVP-0 spikes, MVP-1, V1, V2

### MVP-0 / P0: safety, skeleton, fixtures, provenance

- Choose local web/Vite-style skeleton and local service boundary.
- Add safe synthetic/owned fixtures.
- Add provider-disabled no-network harness.
- Add dependency provenance workflow.

### MVP-1: first useful product loop

- Import owned local video and explicit target/native subtitles.
- Parse cues into typed records.
- Render dual subtitles and synchronized transcript.
- Click token/select phrase with local/default-off lookup.
- Save word/phrase/sentence with source context.
- Generate FSRS-backed review card and append review events.

### V1

- Embedded subtitle extraction, ASS/VTT/SRT robustness, offset/alignment editor.
- POS/morphology/grammar visualization and sentence explanations through local/default-off adapters.
- Practice modes: Flip & Learn, Perfect Your Vocab, Match Your Words, Build the Sentence.
- Local Anki/export workflow with privacy warnings.
- Progress dashboard and metadata-only backup/restore.

### V2

- Local generated subtitles and forced alignment quality improvements.
- Optional pronunciation/shadowing with microphone privacy gate.
- Explicit encrypted/user-controlled sync design.
- Mobile/PWA review client or desktop packaging if warranted.

## Sequencing, dependencies, risks, and acceptance gates

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



## Recommended repo/app structure

```text
lingotorte/
  apps/web/                  # Vite/TypeScript UI
  packages/domain/           # typed domain model and validation
  packages/subtitles/        # subtitle parsing, cue normalization, alignment helpers
  packages/language/         # adapter contracts + local fixtures
  packages/review/           # FSRS wrapper and review state reducers
  services/local/            # local service boundary, SQLite, filesystem/cache APIs
  fixtures/                  # owned/synthetic media/subtitle/token/review fixtures
  tests/                     # unit/integration/e2e/privacy tests
  docs/dev/                  # dependency provenance, safety gates, implementation notes
```

## Build/test strategy

## Test strategy overview

Use a layered strategy:

1. Fixture safety tests: prove all test media/subtitles are owned, synthetic, or explicitly licensed.
2. Unit tests: parsers, identity, adapters, FSRS scheduling, reducers.
3. Integration tests: import -> cue index -> player/transcript -> save occurrence -> review card.
4. UI tests: keyboard/click flows, transcript sync, review interactions.
5. Privacy/network tests: providers disabled => no network; logs redacted; no Lingopie runtime calls.
6. Export/backup tests: roundtrip data and privacy warnings.
7. Spike acceptance tests: ASR/alignment/pronunciation only after local experiments.

## Fixture plan

Future implementation should create a fixture directory similar to:

```text
fixtures/
  README.md
  media/
    sample-owned.mp4
  subtitles/
    sample.target.srt
    sample.native.srt
    sample.bad-format.srt
    sample.overlap.srt
  expected/
    cues.sample.json
    tokens.polish.sample.json
    review-schedule.sample.json
```

Fixture rules:

- no Lingopie media, subtitles, screenshots, catalog data, or private vocab;
- prefer synthetic or explicitly owned short media;
- include at least one target/native pair with simple timing;
- include malformed and overlapping subtitles for failure tests;
- record fixture provenance in `fixtures/README.md`.

## Acceptance gates by milestone

| Milestone | Minimum acceptance gate |
|---|---|
| P0 skeleton | Test runner works; no-network harness exists; fixture provenance documented. |
| P1 ingestion | Media/subtitle fixtures import into typed records; malformed input fails safely. |
| P2 player/transcript | Video, dual captions, transcript highlight, seek, loop, and speed controls work against fixtures. |
| P3 adapters | Token/lemma/POS/dictionary adapters return typed versioned results or graceful unavailable states; online disabled state makes no network calls. |
| P4 saved objects | Saved word/phrase/sentence preserves media/cue/token/time context and handles duplicates. |
| P5 FSRS | Review events update card state deterministically through a verified FSRS library. |
| P6 practice/export | Practice modes grade correctly from local data; Anki/export warns about privacy and does not mutate external apps by default. |
| P7 transcript generation/correction | YouTube/provider captions and local ASR outputs enter as draft tracks with provenance, quality warnings, correction UI, and explicit approval before study use. |
| P8 optional ASR/shadowing | Local-only spike reports quality/latency limits; microphone/audio lifecycle is privacy-safe. |
| P9 backup/sync | Backup/restore roundtrip passes; media-copy/sync remains opt-in. |

## Feature acceptance checklist

| Feature | Given | When | Then |
|---|---|---|---|
| Media import | Owned local video fixture | User imports media | App stores path/fingerprint/duration; no media copy unless configured. |
| Subtitle import | Target/native subtitle fixtures | User selects tracks | Cues are parsed with ids/start/end/text/language/role. |
| YouTube caption candidate | User provides a public/authorized YouTube URL with captions | User imports captions through an explicitly enabled provider action | Draft caption track is labeled with provenance and warnings; it cannot become default study source until corrected/approved. |
| Transcript correction | Draft provider/ASR caption track exists | User edits cue text/timing and approves | A new versioned approved track is created; raw provider/ASR output remains immutable provenance. |
| Cue alignment | Target/native cues with overlapping times | Alignment runs | Target cues link to best native cue or explicit no-match/ambiguous state. |
| Player playback | Imported media | User plays/seeks | Video time updates transcript/caption state. |
| Dual subtitles | Current cue has target/native pair | Video reaches cue time | Target and native lines render; missing native degrades gracefully. |
| Transcript click | Transcript row visible | User clicks row | Video seeks to cue start and row becomes current. |
| Cue loop | Current cue selected | Loop enabled | Playback repeats within cue boundaries until disabled. |
| Speed control | Video loaded | User changes rate | Rate applies and captions/transcript remain synchronized. |
| Token lookup | Tokenized cue | User clicks token | Lookup panel shows local token/lemma/POS/dictionary data or unavailable state. |
| Phrase selection | Cue token range | User selects phrase | Phrase lookup/save action preserves token ids and text span. |
| Sentence explanation | Cue selected | User requests explanation | Local/default-off adapter returns explanation or explicit disabled/unavailable state. |
| Save vocab | Token lookup result | User saves item | Saved item links to media, cue, token occurrence, meaning/notes, created time. |
| Save phrase | Phrase selected | User saves phrase | Saved phrase has occurrence range and source cue/time. |
| Save sentence | Cue selected | User saves sentence | Saved sentence replays/source-links exact cue. |
| My Vocab/Sentences | Saved items exist | User opens library | Items are searchable/filterable and show source context. |
| Review card | Saved item exists | Card generated | Card has saved item id, type, due state, FSRS fields. |
| Review event | Card due | User rates Again/Hard/Good/Easy | Append-only event exists and next due/state changes through FSRS. |
| Flip & Learn | Due card | User reveals/rates | Prompt/reveal/rating sequence updates card. |
| Meaning quiz | Saved items with meanings | Quiz starts | Distractors are local; grading is deterministic. |
| Match Your Words | Saved item with source clip/context | User answers | Correctness maps to saved item; no online calls. |
| Build the Sentence | Saved sentence/tokenized cue | User orders tokens | Scoring handles punctuation/spacing and links back to source cue. |
| Anki export | Saved cards | User exports | Export artifact warns about privacy; no AnkiConnect mutation by default. |
| Backup | Local DB state | User creates/restores backup | Roundtrip preserves media refs, saved items, reviews; media copy is opt-in. |
| Online provider disabled | Any adapter feature | Feature executes | Test observes zero HTTP/network calls. |
| Logging | Error or adapter failure | Logs are written | Logs contain ids/status/error code, not raw cue text/media path/voice payload by default. |

## Spike commands and expected shape

Exact commands depend on the future repo skeleton, but downstream implementation tasks should instantiate these command shapes before writing feature code.

| Spike | Safe input | Suggested command shape | Pass condition | Done/not-done gate |
|---|---|---|---|---|
| Local player + dual subtitles | `fixtures/media/sample-owned.mp4`, `sample.target.srt`, `sample.native.srt` | `npm run test:e2e -- player-dual-subtitles` | Player renders current target/native cue and transcript seek works. | Done only if fixture provenance and no-network checks pass. |
| Transcript seek/highlight | Imported cue fixtures | `npm run test:e2e -- transcript-sync` | Current cue follows playback; click seeks to start. | Not done if timing tolerance is undocumented. |
| Click-to-token lookup | Token fixture | `npm test -- token-lookup` | Token click returns typed occurrence + local lookup/unavailable state. | Not done if online provider is required. |
| Saved occurrence + FSRS card | Saved item fixture | `npm test -- saved-item-review-card` | Saved item creates source-backed card and review event updates schedule. | Not done if source cue/time is lost. |
| Generated subtitles/alignment | Owned audio/video fixture | `uv run pytest tests/asr_alignment` or chosen local command | Generated cues have timestamps and quality report. | Spike-only until latency/quality/privacy are measured. |
| YouTube caption candidate + correction | User-provided public/authorized YouTube URL with available captions | fake-provider unit tests; `npm run test:no-network`; live retrieval only as approval-gated manual smoke | Captions import as draft tracks with provenance/warnings and require correction/approval before default study use. | Not done if raw provider captions become trusted learner state, credentials/cookies are used, or media download is implicit. |
| Pronunciation/shadowing | Synthetic/owned prompt audio and test recording | `uv run pytest tests/shadowing_privacy` or chosen local command | Recording lifecycle and local ASR comparison work; temp audio deletion verified. | Optional; not MVP blocker. |

## No-network and no-account-mutation pattern

Each provider-capable feature should have a test that:

1. configures all online providers as disabled;
2. runs the feature flow with local fixtures;
3. fails the test on any HTTP request or DNS/network call, using a mock/fake transport appropriate to the stack;
4. verifies no Lingopie URL is present in runtime code paths;
5. verifies no external account mutation API is called.



## Implementation card template

## Implementation task template

Every future implementation card should state:

- feature/milestone and dependencies;
- evidence labels used;
- exact parent docs/sections read;
- files to create/modify;
- safe fixtures used;
- test commands and expected outputs;
- no-network/provider-off checks if applicable;
- privacy/export/logging implications;
- third-party dependency provenance if a dependency is added;
- open decisions preserved or explicitly resolved by Janusz.
