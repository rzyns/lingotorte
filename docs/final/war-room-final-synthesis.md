# Lingotorte War Room Final Synthesis

Status: final fan-in synthesis for the Lingotorte planning/documentation mission. This is a planning artifact only; it does not implement the app and does not authorize scraping, proprietary copying, account mutation, external providers, deployment, or publishing.

## Executive summary

Lingotorte should be built as a local-first, privacy-preserving language-learning video app for user-owned media and explicit subtitle/transcript inputs. The validated product center is not a streaming catalog clone; it is the artifact chain `MediaFile -> SubtitleTrack -> Cue -> TokenOccurrence -> SavedItem -> ReviewCard -> ReviewEvent`.

The first useful implementation milestone should be narrow: import one owned local video plus target/native subtitles, render synchronized dual subtitles and a clickable transcript, support local/default-off token or phrase lookup, save source-backed words/phrases/sentences, and schedule video/context-backed review with FSRS. Every later capability (generated subtitles, pronunciation/shadowing, Anki integration depth, online providers, sync) should pass an explicit privacy and feasibility gate.

## What was investigated

- Project constraints and mission docs: `AGENTS.md`, `README.md`, mission statement, War Room brief.
- Existing preliminary research and sanitized Lingopie UI inventory.
- Public Lingopie feature claims and sanitized live UI mechanics as behavior references only.
- OSS substrate candidates: asbplayer, subs2srs, ts-fsrs/FSRS, Y'ALL MP, LLPlayer, Memento/SubMiner/jidoujisho/Mirumoji/mLearn class tools, subtitle parser stacks, ASR/forced-alignment options, tokenizer/dictionary stacks.
- Local-first architecture, SQLite/storage model, language adapters, saved occurrence model, FSRS/practice mechanics, safety/privacy/legal boundaries, and testing/spike gates.
- Independent challenge review findings; the final bundle responds by adding dedicated safety, evidence, path-crosswalk, spike, and human-decision gates.

## Major recommendations

1. Use a local web/Vite-style frontend plus local service boundary first; keep Tauri compatible but not required for MVP-0.
2. Use SQLite for metadata and learner state; keep media as filesystem references by default and generated clips/thumbnails/transcripts in a pruneable local cache.
3. Preserve source context for every saved item. Saved vocabulary must remain tied to media, cue, token span, time range, and subtitle provenance.
4. Use FSRS for scheduling after dependency/version/license verification; keep review events append-only and card state recomputable.
5. Treat language analysis as a replaceable adapter layer: tokenizer, lemma, POS, morphology, dictionary, phrase translation, grammar explanation, ASR/transcription, forced alignment, and pronunciation scoring.
6. Make Polish the first serious adapter stress test while keeping the interface multilingual.
7. Treat online providers, AnkiConnect, cloud sync, media-copy backups, screenshot reuse, and live Lingopie inspection as explicit opt-in gates, not defaults.
8. Treat OSS candidates as planning references until each dependency has a fresh license/version/provenance artifact.

## Unresolved questions and safe defaults

| Decision | Safe default | Why unresolved |
|---|---|---|
| Target language priority | Polish-first fixtures, generic adapter contracts | Dictionary/tokenizer/morphology choices are language-specific. |
| App shell | Local web/Vite first; Tauri optional | Desktop packaging/file access tradeoffs need repo context. |
| Backend language | TypeScript core; Python only for ASR/NLP adapters if needed | Avoid premature split-stack complexity. |
| asbplayer vs custom player | Candidate/reference only | Needs substrate spike before adoption. |
| FSRS library | ts-fsrs-style candidate | Must verify current API/license/version. |
| Anki role | Export-only | AnkiConnect/sync mutates an external app/cloud path. |
| Online providers | Disabled by default | Text/audio/voice privacy varies by provider. |
| Mastered semantics | Configurable UI bucket, not FSRS state | Learner/product preference decision. |
| Screenshot evidence | Sanitized text only | Screenshots may contain proprietary/private context. |
| Backup media policy | Metadata-only backup | Full media copy can duplicate private/copyrighted files. |

## Exact next implementation steps

1. Create future implementation card P0.1: choose repo skeleton, TypeScript/Vite test runner, fixture layout, and no-network test harness.
2. Create P0.2: add synthetic/owned media and subtitle fixtures plus provenance README; verify no Lingopie media/subtitles/screenshots/private data.
3. Create P0.3: dependency provenance workflow for every library before adoption.
4. Create P1: media/subtitle/cue ingestion with typed records and safe parse failure states.
5. Create P2: player + dual subtitle overlay + transcript seek/highlight + loop/speed controls against fixtures.
6. Create P3: tokenizer/lookup adapter contract and Polish-first fixture spike with providers disabled.
7. Create P4/P5 only after P1-P3 pass: saved occurrence service, My Vocab/My Sentences, FSRS card creation and review events.

## Bundle index

- [Final synthesis](../final/war-room-final-synthesis.md)
- [Implementation plan](../final/lingotorte-implementation-plan.md)
- [Lingopie behavior reference](../spec/lingopie-behavior-reference.md)
- [Feature implementation playbook](../spec/feature-implementation-playbook.md)
- [Local-first architecture](../architecture/local-first-architecture.md)
- [Data model and storage](../architecture/data-model-and-storage.md)
- [Language adapter design](../architecture/language-adapter-design.md)
- [SRS and practice design](../product/srs-and-practice-design.md)
- [Public product cartography](../research/public-product-cartography.md)
- [Live UI inventory expanded](../research/live-ui-inventory-expanded.md)
- [OSS substrate assessment](../research/oss-substrate-assessment.md)
- [Safety/privacy boundary review](../review/safety-privacy-boundary-review.md)
- [MVP spike plan](../plan/mvp-spike-plan.md)

## Parent evidence incorporated

- `docs/planning/product-behavior-spec.md`
- `docs/planning/evidence-cartography.md`
- `docs/planning/local-first-architecture-data-model.md`
- `docs/planning/language-srs-practice-plan.md`
- `docs/planning/independent-challenge-review.md`
- `docs/planning/final-implementation-plan.md`
- `docs/planning/feature-build-roadmap.md`
- `docs/planning/evidence-index.md`
- `docs/planning/safety-privacy-legal-boundaries.md`
- `docs/planning/testing-and-acceptance-plan.md`
