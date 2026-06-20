# Lingotorte Testing and Acceptance Plan

Status: planning document for future implementation verification. No tests are run here because no app code exists in this workspace yet.

Related docs: [Final Implementation Plan](./final-implementation-plan.md), [Feature Build Roadmap](./feature-build-roadmap.md), [Evidence Index](./evidence-index.md), [Safety Boundaries](./safety-privacy-legal-boundaries.md).

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
| P7 optional ASR/shadowing | Local-only spike reports quality/latency limits; microphone/audio lifecycle is privacy-safe. |
| P8 backup/sync | Backup/restore roundtrip passes; media-copy/sync remains opt-in. |

## Feature acceptance checklist

| Feature | Given | When | Then |
|---|---|---|---|
| Media import | Owned local video fixture | User imports media | App stores path/fingerprint/duration; no media copy unless configured. |
| Subtitle import | Target/native subtitle fixtures | User selects tracks | Cues are parsed with ids/start/end/text/language/role. |
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
| Pronunciation/shadowing | Synthetic/owned prompt audio and test recording | `uv run pytest tests/shadowing_privacy` or chosen local command | Recording lifecycle and local ASR comparison work; temp audio deletion verified. | Optional; not MVP blocker. |

## No-network and no-account-mutation pattern

Each provider-capable feature should have a test that:

1. configures all online providers as disabled;
2. runs the feature flow with local fixtures;
3. fails the test on any HTTP request or DNS/network call, using a mock/fake transport appropriate to the stack;
4. verifies no Lingopie URL is present in runtime code paths;
5. verifies no external account mutation API is called.

## Regression ledger for challenge-review fixes

| Challenge finding | Test/acceptance response |
|---|---|
| MF-1 safety artifact missing | This bundle includes `safety-privacy-legal-boundaries.md`; future code tests must enforce its gates. |
| MF-2 evidence label drift | `evidence-index.md` defines normalized labels; implementation PRs should cite them. |
| MF-3 public/OSS provenance weak | Dependency adoption requires provenance artifact before code reuse. |
| MF-4 deliverable path mismatch | `documentation-index.md` provides a path crosswalk. |
| MF-5 spike commands/fixtures missing | This plan names fixture shapes and command shapes to instantiate in repo skeleton. |
| MF-6 human decisions not gates | `final-implementation-plan.md` and roadmap list safe defaults and open decisions. |
| MF-7 screenshot durability/privacy | Safety doc defaults to sanitized text only unless Janusz approves screenshot policy. |

## Pre-ship checklist for every implementation task

- Does the task cite which planning docs and evidence labels it relies on?
- Are fixtures safe and documented?
- Are providers disabled by default and covered by a no-network test?
- Are data models typed rather than loose blobs, except for explicitly versioned adapter payloads?
- Does saved learner state preserve source media/cue/token context?
- Does the feature have a clear unavailable/error state?
- Are privacy/log/export warnings present for text/media/voice/review data?
- Is any third-party dependency revalidated with version/license provenance before adoption?
- Are open decisions preserved instead of silently resolved?
