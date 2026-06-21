# Hermes War Room Mission Statement — Lingotorte

**Use:** Paste the “Pasteable mission statement” section into the `hermes-war-room` Chat tab for the chosen orchestrator, then review the generated triage panel and click **Launch as triage** if it preserves the scope.  
**Target workspace:** `<local-workspace>/lingotorte`
**Desired result:** a fully fleshed-out implementation plan and attendant documentation for creating a local/private Lingopie-like app for owned/local videos and subtitles.  
**Prepared after reviewing:** `<local-reference>/hermes-war-room/README.md`, `server/utils/mission-turn.ts`, and `server/utils/triage.ts`.

## Why this is shaped this way

Current `hermes-war-room` starts in a **refine-then-launch** workflow. The first Chat turn is not supposed to create Kanban tasks directly. The orchestrator should refine the brief and emit a fenced `triage` block; the War Room UI then shows a launch panel and its backend creates a triage task and runs Hermes’ decomposer. Therefore, the mission statement below tells the orchestrator that the brief is intentionally complete and asks it to emit a launchable triage draft unless a genuinely blocking ambiguity remains.

## Pasteable mission statement

I want to launch a thorough Hermes War Room planning and documentation mission for **Lingotorte**, a local/private Lingopie-like language-learning video app. Please treat this brief as intentionally complete. Unless you see a genuinely blocking ambiguity, do not ask a long list of questions; convert this into a launchable War Room triage draft.

### Mission objective

Produce a complete, evidence-backed implementation plan and documentation bundle for building Lingotorte: a local-first app that lets me use my own videos and subtitles to get Lingopie-like learning behavior — interactive dual subtitles, clickable transcript/word lookup, saved contextual vocabulary/sentences, grammar/POS support, looping/listening controls, and SRS/practice modes.

This is a **planning/documentation mission**, not an app implementation mission. The output should be detailed enough that a later implementation fleet can build feature-by-feature without having to rediscover product behavior, architecture, data model, or safety constraints.

### Workspace and read-first files

All durable outputs must be written under:

```text
<local-workspace>/lingotorte
```

Before doing substantive work, read these files in order:

1. `<local-workspace>/lingotorte/AGENTS.md`
2. `<local-workspace>/lingotorte/README.md`
3. `<local-workspace>/lingotorte/docs/mission/hermes-war-room-mission-statement.md`
4. `<local-workspace>/lingotorte/docs/mission/lingopie-war-room-brief.md`
5. `<local-workspace>/lingotorte/docs/research/preliminary-grounding-research.md`
6. `<local-workspace>/lingotorte/docs/research/live-ui-inventory.md`

Use the existing preliminary research as grounding, but do not treat it as complete. Validate, expand, challenge, and refine it.

### Hard boundaries

Preserve these boundaries in every child task:

- Do **not** clone or copy Lingopie proprietary code, private API payloads, media, subtitles, assets, catalog data, branding, or private account data.
- Do **not** bypass DRM, capture protected streams, download proprietary media, or scrape private endpoints.
- If a logged-in Lingopie browser/CDP session is used, inspect visible UI mechanics only. Do not save words, run reviews, submit pronunciation recordings, change settings, dump cookies/localStorage/tokens, or mutate account state.
- Product planning must target **owned/local media** and explicit subtitle/transcript inputs or locally generated transcripts.
- Local/offline processing is the default. Online translation/LLM providers may be discussed only as explicit opt-in adapters with privacy tradeoffs.
- Use evidence labels everywhere: public docs, live UI observation, OSS source/docs, local experiment, or inference/recommendation.
- Do not push, publish, deploy, create public posts, configure credentials, restart services, or perform external side effects.

### Required final deliverables

Create a coherent documentation bundle. At minimum, produce or update these files:

1. `docs/final/war-room-final-synthesis.md`
   - executive summary;
   - what was investigated;
   - major recommendations;
   - unresolved questions;
   - exact next implementation steps.

2. `docs/final/lingotorte-implementation-plan.md`
   - implementation roadmap;
   - MVP-0 spikes, MVP-1, V1, V2;
   - sequencing, dependencies, risks, and acceptance gates;
   - recommended repo/app structure;
   - build/test strategy.

3. `docs/spec/lingopie-behavior-reference.md`
   - thorough documentation of relevant Lingopie behavior from public docs and sanitized live UI observations;
   - feature-by-feature behavior descriptions;
   - evidence table with source/provenance/confidence;
   - explicit notes separating observed behavior from inferred behavior.

4. `docs/spec/feature-implementation-playbook.md`
   - for each feature, document:
     - user-visible behavior;
     - local Lingotorte equivalent;
     - frontend components/views;
     - backend/domain services;
     - data model changes;
     - libraries/algorithms to use;
     - implementation steps;
     - acceptance tests;
     - risks/tradeoffs;
     - MVP/V1/V2 priority.
   - Cover at least: local media import, subtitle extraction/parsing/alignment, dual subtitles, transcript synchronization, cue seek/highlight, clickable token lookup, phrase selection, grammar/POS coloring, sentence explanation, save word/phrase/sentence, My Vocab, My Sentences, Listen, Loop, playback speed, saved occurrence context, FSRS flashcards, SRS states, quiz/match/sentence-builder modes, Anki export, optional generated subtitles, optional pronunciation/shadowing, progress tracking, privacy/settings, and backups/sync.

5. `docs/architecture/local-first-architecture.md`
   - recommended app shell: web/Tauri/local-server tradeoff;
   - component diagram;
   - data flow;
   - service boundaries;
   - local/offline privacy model;
   - media/cache strategy;
   - failure modes.

6. `docs/architecture/data-model-and-storage.md`
   - typed model for media, subtitle tracks, cues, tokens, token occurrences, saved items, cards, review events, language analyses, clip assets, settings;
   - SQLite schema recommendations;
   - migration/versioning plan;
   - append-only learner-state/audit strategy;
   - import/export strategy.

7. `docs/architecture/language-adapter-design.md`
   - adapter interfaces for tokenization, lemma, POS, morphology, dictionary lookup, phrase translation, grammar explanation, ASR/transcription, forced alignment;
   - Polish-first recommendations where possible;
   - generalization path for other languages;
   - offline vs online tradeoffs;
   - fixture/testing strategy.

8. `docs/product/srs-and-practice-design.md`
   - FSRS model and review state;
   - local equivalents of Flip & Learn, Match Your Words, Perfect Your Vocab, Build the Sentence;
   - card generation from video-backed occurrences;
   - grading, scheduling, lapse/relearning behavior;
   - UX flow and acceptance tests.

9. `docs/research/public-product-cartography.md`
   - public Lingopie docs/blog/help-center map;
   - evidence table with URLs, snippets, feature claims, confidence, and local-product implication.

10. `docs/research/live-ui-inventory-expanded.md`
    - sanitized expansion of the existing live UI inventory if safe evidence is available;
    - no private vocab/account dumps;
    - no account mutation.

11. `docs/research/oss-substrate-assessment.md`
    - evaluate `asbplayer`, `subs2srs`, FSRS/`ts-fsrs`, Y’ALL MP, LLPlayer, Memento/SubMiner/jidoujisho/Mirumoji/mLearn, subtitle parsers, ASR/forced-alignment options, dictionary/tokenizer stacks;
    - include license, architecture fit, local/offline support, maturity, integration/fork/reimplement recommendation.

12. `docs/review/safety-privacy-boundary-review.md`
    - allowed/disallowed actions;
    - Lingopie inspection guardrails;
    - local media privacy model;
    - online-provider opt-in policy;
    - future implementation gates.

13. `docs/plan/mvp-spike-plan.md`
    - concrete spikes with exact inputs, outputs, acceptance criteria, and verification commands:
      1. local player + dual subtitles;
      2. transcript seek/highlight;
      3. click-to-token lookup;
      4. saved occurrence + FSRS card;
      5. generated subtitles/alignment;
      6. optional pronunciation/shadowing.

14. `README.md` and `AGENTS.md`
    - update links/indexes if new documents are created;
    - keep the recommended reading order current.

### Suggested fan-out/fan-in structure

Use War Room / Hermes decomposition rather than doing all work in one monolithic task. A good shape would be:

1. Public product/documentation cartography lane.
2. Sanitized live UI behavior lane.
3. OSS substrate and library assessment lane.
4. Product behavior/specification lane.
5. Local-first architecture and data model lane.
6. Language adapter and linguistic analysis lane.
7. SRS/practice/game mechanics lane.
8. Safety/privacy/legal boundary lane.
9. Final synthesis lane that reads every parent artifact and creates the final implementation plan.
10. Independent review/challenger lane that checks completeness, evidence labeling, contradictions, safety boundaries, and implementability.

### Quality bar

The final packet should be useful as the starting point for an autonomous implementation DAG. It should be:

- concrete, not aspirational;
- feature-by-feature, not just architectural;
- evidence-backed, with confidence labels;
- explicit about tradeoffs and unknowns;
- local-first and privacy-preserving;
- careful about IP/DRM/account boundaries;
- written as durable Markdown in the workspace;
- internally cross-linked and indexed;
- honest about what is observed vs inferred;
- clear enough that implementation agents can pick up one feature at a time and know exactly what to build and how to test it.

### Defaults if not otherwise decided

If a choice is not blocked by evidence, use these defaults:

- Product shell: local web app with a Tauri path considered; do not require Tauri for the first spike.
- Frontend: TypeScript/Vite-style architecture.
- Backend: local service or embedded app boundary; Python is acceptable for ASR/NLP-heavy lanes, but keep the plan honest about TypeScript-only alternatives.
- Storage: SQLite plus filesystem cache for media-derived assets.
- Scheduling: FSRS, preferably via a mature existing library.
- First language adapter focus: Polish as a serious test case, but keep the design multi-language.
- First implementation milestone: owned local video + target/native subtitles + synchronized transcript + saved occurrence + FSRS review.

### Launch instruction to the orchestrator

If this brief is sufficiently clear, please emit a War Room `triage` block with a concise title and the full body needed for Hermes’ decomposer to fan this out into specialist tasks. If you must ask a clarification, ask only one or two questions and explain why they are blocking.
