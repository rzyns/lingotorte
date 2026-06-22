# Lingotorte Final Implementation Plan

Status: final planning synthesis for a future implementation fleet. This document does not implement the app and does not approve scraping, account mutation, online providers, code reuse, deployment, publishing, or legal/license conclusions.

Core decision for Janusz: proceed with a local-first, artifact-centered MVP if the P0 fixture/skeleton/provenance gates are accepted. Keep open decisions explicit: target-language priority, app shell, asbplayer/custom-player substrate, Anki role, online-provider strictness, Mastered threshold, screenshot policy, and backup media policy.

## Bundle map

- [Feature Build Roadmap](./feature-build-roadmap.md) — phased feature slices and dependency ordering.
- [Evidence Index](./evidence-index.md) — normalized evidence labels, provenance, source caveats.
- [Safety, Privacy, and Legal Boundaries](./safety-privacy-legal-boundaries.md) — hard implementation gates.
- [Testing and Acceptance Plan](./testing-and-acceptance-plan.md) — fixture plan, command shapes, acceptance checks.
- [Documentation Index](./documentation-index.md) — mission deliverable crosswalk and repair map.

Parent detail artifacts:

- [Product Behavior Specification](./product-behavior-spec.md)
- [Evidence Cartography](./evidence-cartography.md)
- [Local-First Architecture, Data Model, and Test Plan](./local-first-architecture-data-model.md)
- [Language Analysis, Saved Learning Objects, SRS, and Practice Plan](./language-srs-practice-plan.md)
- [Independent Challenge Review](./independent-challenge-review.md)

## Executive summary

Lingotorte should be built as a local/private language-learning video app for Janusz-owned media and explicit subtitles/transcripts. The product should not clone Lingopie content or implementation; Lingopie is only a reference for visible learning mechanics such as dual subtitles, transcript sync, token lookup, saved contextual vocabulary/sentences, grammar/POS support, loop/listen controls, and practice flows.

The central artifact is a source-backed study occurrence:

```text
MediaFile -> SubtitleTrack -> Cue -> TokenOccurrence -> SavedItem -> ReviewCard -> ReviewEvent
```

This identity chain is the main product invariant. Vocabulary, grammar, SRS, quizzes, Anki export, progress, backup, and optional pronunciation should preserve the media/cue/token context rather than becoming disconnected flashcards.

Recommended MVP path:

1. create safe synthetic/owned fixtures, a local app skeleton, and no-network test harness;
2. import local media and target/native subtitles into typed cue records;
3. build a player with dual subtitles and synchronized clickable transcript;
4. add local token/phrase lookup through replaceable adapters;
5. save word/phrase/sentence occurrences with source context;
6. create FSRS-backed video/context review cards;
7. add practice modes and local export only after core review works.

## Evidence posture

Planning claims rely on five evidence groups:

- `PROJECT-CONSTRAINT`: `AGENTS.md`, `README.md`, and mission docs define hard boundaries.
- `SANITIZED-LIVE-UI`: visible Lingopie mechanics from a read-only/sanitized UI inventory.
- `PRELIMINARY-RESEARCH`: consolidated local product decomposition and initial architecture hypotheses.
- `OSS-DOC-SOURCE` / `PUBLIC-DOC`: candidate external sources and product taxonomy, not final license/adoption proof.
- `DESIGN-RECOMMENDATION`: synthesized defaults for Lingotorte.

Do not strengthen public/OSS evidence into legal/license/dependency conclusions without revalidation. See [Evidence Index](./evidence-index.md).

## Hard boundaries to preserve

- No Lingopie proprietary code, private API payloads, media, subtitles, assets, catalog data, branding, private account data, or raw private vocabulary.
- No DRM/circumvention, protected stream capture, or scraping.
- Future live UI inspection is gated and visible-mechanics-only; no account mutation unless Janusz explicitly approves a test-account/mutation scope.
- Product workflows use owned/local videos and explicit subtitle/transcript inputs or locally generated transcripts.
- Local/offline processing is default. Online translation/LLM/ASR/dictionary providers require explicit opt-in and no-network disabled-state tests.
- Screenshot evidence remains local/non-distributable and is not used as an implementation asset.
- Anki is export-only by default; AnkiConnect/sync is a separate opt-in mutation/privacy decision.

Full gate: [Safety, Privacy, and Legal Boundaries](./safety-privacy-legal-boundaries.md).

## Product behavior model

### Primary user loop

1. Import a local media file.
2. Import/select target-language subtitle track and optional native-language track.
3. Watch with synchronized target/native captions and transcript.
4. Click token or select phrase/sentence.
5. View local lookup, POS/morphology, translation/meaning, and optional grammar explanation.
6. Save word/phrase/sentence occurrence with exact source context.
7. Review saved items through FSRS cards and local practice modes.
8. Export/backup only with visible privacy warnings and user choice.

### Core feature set

| Feature | MVP role | Evidence | Implementation note |
|---|---|---|---|
| Local media import | Required | `PROJECT-CONSTRAINT`, preliminary research, product spec | Store local path/fingerprint; do not copy media by default. |
| Subtitle import/parsing | Required | Preliminary research, product spec | Start with SRT/VTT; add ASS/embedded extraction later if needed. |
| Dual subtitles | Required | `SANITIZED-LIVE-UI`, public/product docs, product spec | Generic UI; no Lingopie styling/copy. |
| Synchronized transcript | Required | `SANITIZED-LIVE-UI`, product spec | Transcript is both navigation and study surface. |
| Cue loop/speed/seek | Required | `SANITIZED-LIVE-UI`, product spec | Loop current cue and preserve transcript sync. |
| Token lookup | Required | Product/language plans | Local adapter first; online disabled. |
| Phrase/sentence save | Required | Product/language plans | Preserve cue/time/token context. |
| My Vocab/My Sentences | Required | `SANITIZED-LIVE-UI`, product spec | Local views over saved items. |
| FSRS flashcards | Required | OSS/source facts to revalidate; language plan | Verify library/version/license before adoption. |
| Practice modes | After review core | Live practice inventory, language plan | Flip, meaning quiz, match, sentence builder; all local data. |
| Anki export | Later MVP/V1 | Preliminary research, language plan | Export-only; warn about AnkiWeb. |
| Generated subtitles/alignment | V1 spike | Preliminary research and architecture plan | Local experiment required before quality claims. |
| Pronunciation/shadowing | Optional V2 | Public feature family/design recommendation | Voice privacy gate; local ASR preferred. |
| Progress/backup/sync | V1/V2 | Product/architecture plans | Local dashboard; backup metadata-first. |

## Architecture recommendation

### App shell

Default planning recommendation: start as a local web app with TypeScript/Vite-style frontend and a local service boundary. Keep Tauri as a packaging path, not a P0 requirement. Python is acceptable for ASR/NLP-heavy adapters, but the core app should avoid Python-only assumptions until the implementation repo is chosen.

Rationale:

- product behavior is UI-heavy and browser-friendly;
- local files/subtitles/media can be managed by a local service or Tauri bridge;
- Python may be best for ASR/NLP spikes but should remain adapter-level if possible;
- the first risk is workflow correctness, not desktop packaging.

### Component boundaries

```text
UI shell
  Library / Import views
  Player + dual subtitle overlay
  Transcript / lookup / save panel
  My Vocab / My Sentences
  Review / practice views

Domain services
  Media import service
  Subtitle/cue parser and aligner
  Language analysis adapters
  Saved occurrence service
  Review scheduling service
  Export/backup service
  Privacy/provider policy service

Storage
  SQLite metadata and learner state
  Filesystem media references
  Optional cache for generated clips/thumbnails/audio/transcripts
```

### Storage boundaries

- SQLite stores metadata, cue records, token occurrences, saved items, review cards/events, settings, adapter versions, and backup/export manifests.
- Filesystem stores user media by reference; generated clips/thumbnails/transcripts live in removable local cache.
- Learner state is local and should be append-only where practical for review events and important mutations.
- Adapter outputs should be versioned so analyses can be invalidated/recomputed.

## Data model summary

Use typed entities, not loose `map[string]any` blobs, except for explicitly versioned adapter payloads.

Minimum entities:

| Entity | Purpose | Key relationships |
|---|---|---|
| `MediaFile` | Local media reference, metadata, fingerprint. | Has subtitle tracks and progress. |
| `SubtitleTrack` | Target/native/other subtitle source. | Belongs to media; has cues. |
| `Cue` | Timed text interval. | Belongs to track; may align to native cue. |
| `TokenOccurrence` | Token/span in a cue. | Belongs to cue; may have analysis. |
| `LanguageAnalysis` | Lemma/POS/morph/dictionary/translation payloads. | Versioned by adapter. |
| `SavedItem` | Learner-saved lexeme/phrase/sentence. | Points to one or more occurrences and source cue/time. |
| `SavedOccurrence` | Additional source contexts for a saved item. | Links item to cue/token/time. |
| `ReviewCard` | SRS card generated from saved item. | Has FSRS state/difficulty/stability/due fields. |
| `ReviewEvent` | Append-only review rating event. | Updates derived card scheduling state. |
| `PracticeAttempt` | Quiz/game attempt outcome. | Links mode, card/item, response, score. |
| `ProviderSetting` | Adapter enablement/consent. | Enforces local/default-off provider policy. |
| `ExportManifest` | Backup/Anki/export provenance. | Records fields/media included and warnings accepted. |

Core invariants:

1. A saved learning item must retain a source cue/time/media context.
2. Review events are append-only; card state can be derived/audited from events and FSRS version.
3. Online provider outputs record provider/version/consent and are invalidatable.
4. Deleting/removing media must not silently destroy learner state; show broken-source state or require explicit cascade.
5. Backups/exports must state whether they include cue text, media snippets, notes, and review history.

## Language, SRS, and practice mechanics

### Adapter stack

| Adapter | MVP default | Later options | Privacy tradeoff |
|---|---|---|---|
| Tokenizer | Local tokenizer; Polish-first fixture spike | Language-specific tokenizers | Sends no data externally. |
| Lemma/POS/morphology | Local library where feasible | spaCy/Stanza/UDPipe-like adapters after verification | Sends no data externally if local. |
| Dictionary | Local/offline dictionary or unavailable state | Online dictionary opt-in | Online sends selected text/language pair. |
| Phrase translation | Disabled/local only by default | Local model or online opt-in | Online sends phrase/cue context. |
| Sentence explanation | Disabled/local LLM by default | Online LLM opt-in | Online sends sentence/context; high privacy sensitivity. |
| ASR/transcription | Later local spike | Online ASR opt-in only | Online sends audio/media; high sensitivity. |
| Pronunciation scoring | Optional local spike | Online scoring opt-in only | Sends learner voice; highest sensitivity. |

### Saved objects

- Vocabulary item: token/lexeme-like item with at least one source token occurrence.
- Phrase item: selected token range with cue/time context.
- Sentence item: full cue/sentence source-backed item.
- Occurrence count: derived from analyzed cues and/or saved occurrences; never merge ambiguous forms silently.
- Notes/meaning: local editable learner data; do not send to providers unless opted in.

### Review model

Use FSRS for scheduling after library/version/license verification. Keep these concepts separate:

- FSRS state: new, learning, review, relearning (or equivalent verified library states).
- UI buckets: Learning, Due to Review, Mastered. `Mastered` is a configurable display rule, not a hidden FSRS state.
- Review rating: Again, Hard, Good, Easy.
- Practice modes may grade responses, but scheduling updates should be explicit and testable.

### Practice modes

- Flip & Learn: standard card reveal and FSRS rating.
- Perfect Your Vocab: meaning/translation quiz from local saved data.
- Match Your Words: clip/audio/context-to-saved-word matching.
- Build the Sentence: reconstruct target cue from tokens/phrases.
- Pronunciation/shadowing: optional later local recording/ASR flow with explicit microphone/privacy handling.

## Implementation phases

See [Feature Build Roadmap](./feature-build-roadmap.md) for feature-by-feature detail.

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

## Unresolved decisions and safe defaults

| Decision | Safe default now | Needs Janusz/future spike because |
|---|---|---|
| Target language priority | Polish-first fixtures, generic adapter contracts. | Tokenizer/dictionary/morphology quality is language-specific. |
| App shell | Local web/Vite first; Tauri optional. | Desktop file access/packaging tradeoffs need implementation context. |
| Backend language | TypeScript core; Python only for NLP/ASR adapters if useful. | Avoid premature split-stack complexity. |
| asbplayer substrate | Treat as candidate/reference; do not adopt yet. | Needs source/license/architecture spike. |
| FSRS library | Candidate `ts-fsrs`-style approach; revalidate. | Version/license/API must be checked before dependency. |
| Anki role | Local export-only. | AnkiConnect/sync mutates external app/cloud data. |
| Online providers | Disabled by default. | Privacy tradeoffs vary by data class and provider. |
| Mastered threshold | Configurable UI bucket. | Product semantics may differ by learner preference. |
| Screenshot evidence | Use sanitized text only. | Screenshots are outside workspace and may contain proprietary/private context. |
| Backup media policy | Metadata-only backup. | Media copies can duplicate large/copyright/private files. |
| Design-copy tolerance | Generic names/reskinning. | Janusz may later decide closer/farther product terminology. |

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

## Done criteria for the future MVP

MVP is done only when a safe local fixture demonstrates:

1. local media and target/native subtitle import;
2. synchronized video, dual captions, and transcript seek/highlight;
3. token or phrase lookup through local/default-off adapters;
4. saved word/phrase/sentence with exact source cue/time/media context;
5. FSRS-backed review card and append-only review event;
6. My Vocab/My Sentences views over local saved data;
7. no network calls with providers disabled;
8. draft provider/ASR captions cannot become the default study source until corrected/approved;
9. no Lingopie runtime dependency, no proprietary fixtures, no account mutation;
10. backup/export privacy warnings for any data leaving the app boundary.

## Narrow recommendation

Proceed to a future implementation DAG only after Janusz accepts or revises the safe defaults above. The first DAG should be P0 and P1 only: skeleton, fixtures, no-network harness, dependency provenance workflow, and media/subtitle/cue ingestion. Do not start YouTube caption import, ASR, online providers, AnkiConnect, live Lingopie inspection, or sync until their gates are explicitly opened.
