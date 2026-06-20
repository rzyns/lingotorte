# Lingotorte — Agent Context

This workspace is for planning a local/private Lingopie-like language-learning video system, tentatively **Lingotorte**. Treat this file as project-level context for agents working in this workspace.

## Core framing

The goal is **not** to clone Lingopie’s proprietary service. Lingopie is a reference product/UX for understanding the problem space. The durable product direction is:

> Build a local-first learning tool for Janusz’s own videos/subtitles: import local media, align target/native subtitles, provide an artifact-centered video/transcript player, save contextual word/phrase/sentence occurrences, and review them with local SRS/practice workflows.

## Operating boundaries

Agents must preserve these boundaries unless Janusz explicitly changes them:

1. **No proprietary copying.** Do not copy Lingopie source code, private API payloads, media, subtitle files, assets, catalog data, or account data.
2. **No DRM/circumvention.** Do not attempt to download, decrypt, bypass, or capture protected streams.
3. **Read-only product inspection.** If a logged-in browser session is inspected, observe UI behavior only. Do not save words, run reviews, submit recordings, mutate profile/account state, scrape private vocab, or dump credentials/tokens/storage.
4. **Own/local media only.** Product planning should target user-owned/local videos and explicit subtitle files or locally generated transcripts.
5. **Evidence labels.** Distinguish: observed live UI, public docs/blogs/help center, OSS substrate evidence, and inference/recommendation.
6. **Privacy by default.** Local storage and local processing are the default. Online translation/LLM APIs are optional feature gates requiring explicit opt-in.
7. **Artifact-centered design.** The central artifact is a video segment plus aligned transcript/subtitle cue; vocabulary, grammar, review, and analytics should orbit that artifact.

## Recommended reading order

Read these in order before planning, deep-diving, or launching implementation work:

1. `README.md` — workspace index and file map.
2. `docs/mission/hermes-war-room-mission-statement.md` — original War Room mission statement.
3. `docs/mission/lingopie-war-room-brief.md` — lane-oriented mission brief.
4. `docs/research/preliminary-grounding-research.md` — preliminary findings.
5. `docs/research/live-ui-inventory.md` — sanitized live Lingopie UI inventory.
6. `docs/final/war-room-final-synthesis.md` — final synthesis and next implementation steps.
7. `docs/final/lingotorte-implementation-plan.md` — implementation roadmap and build/test strategy.
8. `docs/review/safety-privacy-boundary-review.md` — authoritative safety/privacy/legal gate.
9. `docs/spec/feature-implementation-playbook.md` — feature-by-feature implementation playbook.
10. `docs/plan/mvp-spike-plan.md` — concrete MVP spike inputs, outputs, commands, and gates.

## Working hypothesis

The highest-leverage MVP is a local web/Tauri app with:

- local video/subtitle ingestion;
- dual-subtitle interactive player;
- searchable/clickable transcript;
- cue-looping, speed controls, and saved occurrences;
- dictionary/POS/morphology/grammar explanation adapter layer;
- `My Vocab` / `My Sentences` learner state;
- FSRS-backed review cards and later quiz/game modes;
- optional Anki export.

## Agent output expectations

For research/planning missions, produce evidence-backed Markdown artifacts with:

- exact source/provenance;
- confidence level;
- recommendation and tradeoffs;
- open questions;
- explicit next-step spikes;
- no raw private account/vocab dumps.
