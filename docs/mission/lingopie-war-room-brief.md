# Lingopie/Lingotorte Deep-Dive Mission Brief

**Prepared for:** `hermes-war-room` fleet orchestration  
**Workspace:** `/home/openclaw/workspace/lingotorte`  
**Preliminary evidence captured through:** 2026-06-19T15:42:20-04:00  
**Primary goal:** turn preliminary Lingopie reference-product research into a rigorous local-first product/architecture plan for Lingotorte.

## Mission objective

Run a thorough but safety-bounded exploration and planning mission to answer:

> What should we build, borrow, spike, or explicitly avoid when creating a local/private Lingopie-like app for Janusz’s own videos/subtitles?

The desired output is not a generic clone plan. It should be a grounded implementation roadmap for a local-first product with clear MVP slices, risk spikes, candidate OSS substrates, data model, UX model, and safety/privacy boundaries.

## Non-goals / hard boundaries

- Do **not** clone Lingopie proprietary code, assets, private APIs, media, subtitles, or catalog data.
- Do **not** bypass DRM, capture protected streams, scrape media, or dump logged-in account storage.
- Do **not** mutate Janusz’s Lingopie account: no saving words, review submissions, pronunciation recordings, profile changes, or bulk data export.
- Do **not** assume online services are acceptable. Local/offline is the default; online providers require explicit opt-in.
- Do **not** treat UI observations as permission to reproduce branding, layout pixels, or proprietary copy. Extract product mechanics and interaction patterns only.

## Read-first context

Agents should read these files first:

1. `AGENTS.md`
2. `README.md`
3. `docs/mission/hermes-war-room-mission-statement.md`
4. `docs/research/preliminary-grounding-research.md`
5. `docs/research/live-ui-inventory.md`

## Suggested war-room lanes

### Lane 1 — Public product/documentation cartography

Scope:

- Map Lingopie’s public feature set from Help Center, blog, marketing pages, and public reviews.
- Separate documented features from marketing claims.
- Identify exact concepts relevant to a local-owned-media product.

Deliverable:

- `docs/research/public-product-cartography.md`
- Evidence table with URL, quote/snippet, feature, confidence, and local-product implication.

### Lane 2 — Live UI/interaction inventory

Scope:

- If a logged-in CDP session is available, inspect only visible UI mechanics.
- Focus on interaction structure: player, transcript, vocabulary, practice, settings, review/game flows.
- Avoid raw private data and account mutation.

Deliverable:

- `docs/research/live-ui-inventory-expanded.md`
- Sanitized screen/flow inventory with screenshots referenced by local path where useful.

### Lane 3 — OSS substrate scouting

Scope:

Evaluate candidate projects/libraries:

- `asbplayer`
- `subs2srs`
- FSRS / `ts-fsrs`
- Y’ALL MP
- LLPlayer
- Memento/SubMiner/jidoujisho/Mirumoji/mLearn
- subtitle parsing/alignment libraries
- local ASR/forced-alignment options
- tokenization/dictionary stacks per target language

Deliverable:

- `docs/research/oss-substrate-assessment.md`
- Include license, architecture fit, extension points, local/offline support, maturity, and fork-vs-integrate recommendation.

### Lane 4 — Local-first product architecture

Scope:

- Define app shape: web app, Tauri, local server, or existing-player integration.
- Decompose ingestion, player, transcript, lookup, saved items, review, and exports.
- Define storage boundaries and privacy model.

Deliverable:

- `docs/architecture/local-first-architecture.md`
- Include component diagram, data flow, risk register, and MVP/v1/v2 cuts.

### Lane 5 — Linguistic analysis and language adapters

Scope:

- Design replaceable adapters for tokenization, lemma, POS, morphology, dictionaries, translation, and grammar explanations.
- Evaluate Polish specifically if it is the first serious target language; keep model generic enough for other languages.

Deliverable:

- `docs/architecture/language-adapter-design.md`
- Include typed interfaces, adapter examples, offline/online tradeoffs, and test fixtures.

### Lane 6 — SRS/practice/game design

Scope:

- Translate Lingopie-like practice mechanics into local-owned-media equivalents.
- Define FSRS-backed state, review events, card generation, and quiz/game modes.

Deliverable:

- `docs/product/srs-and-practice-design.md`
- Include card types, scheduling model, review UI flows, and data model.

### Lane 7 — MVP spike plan

Scope:

Create concrete spikes with acceptance tests:

1. local player + dual subtitles;
2. transcript seek/highlight;
3. click-to-token lookup;
4. saved occurrence + FSRS card;
5. generated subtitles/alignment;
6. optional pronunciation/shadowing.

Deliverable:

- `docs/plan/mvp-spike-plan.md`
- Include exact inputs, acceptance criteria, build/test commands, and done/not-done gates.

### Lane 8 — Safety/legal/privacy review

Scope:

- Review IP/privacy/security risks for product design and research methodology.
- Define guardrails for future browser inspection and online provider use.

Deliverable:

- `docs/review/safety-privacy-boundary-review.md`
- Include allowed/disallowed actions and user-confirmation gates.

## Quality gates for every lane

Every lane report should include:

- **Evidence type:** public docs, live UI observation, source code inspection, local experiment, or inference.
- **Confidence:** high/medium/low.
- **Local-product implication:** what changes for Lingotorte.
- **Risks/tradeoffs:** license, privacy, complexity, UX quality, offline viability.
- **Open questions:** what Janusz must decide or what needs a spike.
- **No private dumps:** omit raw private vocab/account data and credentials.

## Initial hypothesis to test

The preliminary hypothesis is:

> Build a local web/Tauri app centered on video + aligned transcript cues. Use local media/subtitle ingestion, FSRS scheduling, and replaceable language adapters. Study `asbplayer` first as the strongest OSS substrate/reference; only build a custom player if asbplayer’s architecture fights the local-first product direction.

The mission should try to falsify this. If a better substrate or product shape emerges, report the evidence and tradeoffs.
