# Independent Challenge Review — Lingotorte Planning Artifacts

**Task:** `t_d69719f4`  
**Reviewer:** `reviewer`  
**Scope:** read-only challenge review before final synthesis. This review checks the planning artifacts; it does not approve implementation, copying, scraping, external provider use, live-account mutation, deployment, publication, or legal conclusions.

## Files read, in required order

1. `AGENTS.md`
2. `README.md`
3. `docs/mission/hermes-war-room-mission-statement.md`
4. `docs/mission/lingopie-war-room-brief.md`
5. `docs/research/preliminary-grounding-research.md`
6. `docs/research/live-ui-inventory.md`

Then reviewed parent artifacts from tasks 0 through 3:

- `docs/planning/product-behavior-spec.md` (`t_2a58c7ca`)
- `docs/planning/evidence-cartography.md` (`t_3a3c8051`)
- `docs/planning/local-first-architecture-data-model.md` (`t_a6fb090d`)
- `docs/planning/language-srs-practice-plan.md` (`t_add618d0`)

## Overall verdict

**BLOCK for final synthesis as-is, but not because the planning direction is unsafe.** The core direction is coherent and the hard local-first/IP/account boundaries are mostly preserved. The block is on synthesis-readiness: the current packet is concentrated in `docs/planning/*`, lacks a dedicated safety/privacy/legal boundary review artifact, lacks enough durable public-source proof for some external feature/license claims, and does not yet provide a final implementation DAG with concrete commands/fixtures that autonomous implementers can execute feature-by-feature.

Narrow recommendation: final synthesis may use these artifacts as a strong draft substrate, but must repair the must-fix items below before presenting the bundle as implementation-ready.

## Major-area verdicts

| Area | Verdict | Rationale |
|---|---|---|
| Mission scope and local-first direction | PASS | `AGENTS.md` states the product is for Janusz-owned/local videos/subtitles, not a Lingopie clone (lines 5-21). The mission statement repeats that this is planning/docs only, not implementation (lines 16-20), and sets local/offline defaults (lines 184-194). Parent docs generally preserve this. |
| Hard boundaries: no proprietary copying / no DRM / no private API / no account mutation | PASS with must-carry caveats | Boundaries are explicit in `AGENTS.md` lines 15-21, mission statement lines 41-52, brief lines 16-23, preliminary research lines 25-43, evidence cartography lines 6-10, architecture lines 65-77, and language/SRS plan lines 21-27. Caveat: live inventory admits opening one episode may have affected continue-watching progress (`docs/research/live-ui-inventory.md` lines 183-187), so final synthesis must treat future live inspection as gated and avoid implying prior inspection was zero-mutation. |
| Evidence labeling and provenance | BLOCK | Parent docs use labels, but labels drift and some evidence is under-proven. `evidence-cartography.md` labels project-scope constraints from `AGENTS.md` as `inference/recommendation` (lines 24-33) even though those are authoritative project constraints. It also quotes public docs/OSS claims and license observations (lines 35-94) without retrieval dates, archived snapshots, line-level source captures, or local source artifacts. That is enough for planning hypotheses, not enough for final license/adoption claims. |
| Product behavior completeness | PASS with must-fix synthesis mapping | `product-behavior-spec.md` covers 15 feature areas with user story/UI states/inputs/outputs/edge cases/persistence/acceptance criteria, and an MVP cut (lines 52-839). However, the mission requested final/spec/architecture/product/review/plan outputs under specific paths (`docs/mission/hermes-war-room-mission-statement.md` lines 53-152). The parent artifact exists only as a planning doc; final synthesis must map/split it into the requested final deliverables. |
| Architecture/data model implementability | PASS with gaps | `local-first-architecture-data-model.md` provides architecture, typed schema tables, privacy gates, invariants, failure modes, and test strategy (notably lines 49-77, 143-153, 248-337, 602-617, 669-728). It is strong enough as design input. It is not yet an executable implementation plan: many tests are described as fixtures but no concrete repo structure, package commands, fixture file names, or command-line verification steps exist. |
| Language/SRS/practice implementability | PASS with human decisions | `language-srs-practice-plan.md` gives typed adapter contracts, saved object contracts, FSRS review events, practice mode rules, Anki export fields, and context-preservation requirements (lines 68-160, 161-440, 441-645, 646-881, 883-995). It explicitly names open decisions (lines 988-995). Final synthesis must not silently choose online-provider strictness, Anki sync role, Mastered semantics, or target-language priority without marking them as decisions/spikes. |
| Privacy/legal/safety constraints | BLOCK | Safety constraints are distributed across files, but the mission explicitly requires `docs/review/safety-privacy-boundary-review.md` with allowed/disallowed actions, Lingopie inspection guardrails, local media privacy model, online-provider opt-in policy, and future implementation gates (`docs/mission/hermes-war-room-mission-statement.md` lines 134-139; brief lines 138-148). No dedicated artifact currently exists in the parent outputs. Distributed reminders are not a substitute for a gate document future implementers can follow. |
| Accidental cloning / proprietary-data risk | NEEDS HUMAN DECISION for styling/copy tolerance; otherwise PASS | The docs repeatedly warn not to copy code/assets/private data/branding. `product-behavior-spec.md` even says no proprietary branding/copy/colors/assets are required for dual subtitles (line 245), and `evidence-cartography.md` says POS color categories are a concept, not exact styling (line 105). Still, final synthesis should add a human-facing design boundary: which Lingopie-like labels/names are acceptable as generic references versus which should be renamed in Lingotorte to avoid product-copy feel. |
| Account-mutation risk | PASS with explicit future gate | Current docs avoid deliberate mutation and flag the one possible continue-watching side effect (`live-ui-inventory.md` lines 183-187). `evidence-cartography.md` requires explicit permission/test account before game-flow inspection (lines 161-162). Final synthesis must carry this as a hard future gate, not as a mere suggestion. |
| Autonomous implementation readiness | BLOCK | The artifacts contain enough concepts and acceptance criteria to guide planning, but not enough for later autonomous implementers to build feature-by-feature without rediscovery. Missing pieces include: exact repo/app skeleton, build/test commands, fixture media/subtitle strategy, MVP spike command list, external dependency pinning, source/license verification workflow, and a cross-doc feature-to-implementation trace table. |

## Must-fix findings

### MF-1 — Create the dedicated safety/privacy/legal boundary review before final synthesis is marked ready

**Verdict:** BLOCK  
**Evidence:** Mission statement requires `docs/review/safety-privacy-boundary-review.md` covering allowed/disallowed actions, Lingopie inspection guardrails, local media privacy model, online-provider opt-in policy, and future implementation gates (lines 134-139). The brief similarly defines a safety/legal/privacy lane and deliverable (lines 138-148). Parent docs include boundary fragments (`AGENTS.md` lines 15-21; `evidence-cartography.md` lines 6-10; `local-first-architecture-data-model.md` lines 65-77; `language-srs-practice-plan.md` lines 21-27), but no standalone gate artifact exists.

**Why this matters:** Future implementers will need one authoritative safety document. Distributed reminders are easy to miss, especially around live Lingopie inspection, Anki/media export, online adapters, microphone recordings, and backup/sync.

**Required fix:** Final synthesis must create or require `docs/review/safety-privacy-boundary-review.md` with at least:

- disallowed actions: proprietary copying, DRM/stream capture, private API/storage/token extraction, account mutation, profile/settings changes, scraping private vocab/account data;
- allowed inspection: public docs and sanitized visible UI mechanics only;
- explicit gate for any future live review/game/pronunciation inspection: test account or user-approved mutation scope;
- online provider policy for text/audio/video/voice data classes;
- Anki/export privacy warning, including AnkiWeb sync and media/path exposure;
- backup/sync privacy defaults;
- implementation tests proving disabled online providers make no network calls.

### MF-2 — Repair evidence-label drift for authoritative project boundaries

**Verdict:** BLOCK for final evidence table precision  
**Evidence:** `AGENTS.md` lines 11-21 defines operating boundaries as project-level constraints. `evidence-cartography.md` then labels E-LOCAL-001 through E-LOCAL-006 as `inference/recommendation` (lines 24-33), even when the source is `AGENTS.md` or mission docs. In contrast, `product-behavior-spec.md` uses `[PROJECT]` for local/owned-media boundaries (lines 28-35), and `language-srs-practice-plan.md` uses `[PROJECT, high]` for hard boundaries (lines 21-27).

**Why this matters:** Downstream synthesis could accidentally downgrade non-negotiable boundaries into optional recommendations. That is exactly the kind of evidence-label drift the challenge review was asked to catch.

**Required fix:** In final evidence tables, use a distinct label such as `PROJECT-CONSTRAINT` or `MISSION-CONSTRAINT` for AGENTS/README/mission boundaries. Reserve `inference/recommendation` for design choices derived from evidence, not for constraints the user already set.

### MF-3 — Public-doc and OSS evidence needs durable provenance before adoption/license claims

**Verdict:** BLOCK for adoption/legal claims; PASS as planning hypotheses  
**Evidence:** `evidence-cartography.md` quotes Lingopie public docs and OSS repo claims with URLs and snippets (lines 35-94) and carries license/adoption recommendations (lines 124-140, 170-179). `language-srs-practice-plan.md` says it used public docs/search results for ts-fsrs, Anki, and Universal Dependencies facts (lines 37-43, 996-1006). The artifacts do not include retrieval timestamps, archived/source snapshots, package versions, license file hashes, or line-level extracts.

**Why this matters:** Feature taxonomy can rely on these as preliminary evidence, but implementation decisions such as adopting `ts-fsrs`, `media-captions`, `asbplayer`, or avoiding GPL code need current source/license verification. Public website wording and repository licenses can change.

**Required fix:** Final synthesis must downgrade these to “candidate/source-to-revalidate” unless it adds a provenance appendix with retrieval date, URL, quote, license file/source pointer, and adoption recommendation. For legal/license-sensitive choices, require a separate license review or spike before code reuse.

### MF-4 — Final deliverable path mismatch is unresolved

**Verdict:** BLOCK for final packet completeness  
**Evidence:** The mission asks for final artifacts under `docs/final`, `docs/spec`, `docs/architecture`, `docs/product`, `docs/review`, and `docs/plan` (mission statement lines 53-152). Current parent artifacts are all under `docs/planning/*`: product behavior spec, evidence cartography, local-first architecture/data-model, and language/SRS/practice plan. `local-first-architecture-data-model.md` explicitly says it “Feeds” future split artifacts under `docs/architecture` and `docs/plan` (lines 28-36), which confirms the split has not yet happened.

**Why this matters:** Autonomous implementers should not have to infer which planning section corresponds to the final playbook, architecture doc, data model doc, language adapter doc, SRS doc, safety review, and MVP spike plan.

**Required fix:** Final synthesis must produce a crosswalk and either create or explicitly map each requested deliverable:

- `docs/spec/lingopie-behavior-reference.md` from evidence cartography + live UI + product spec;
- `docs/spec/feature-implementation-playbook.md` from product spec + architecture tests;
- `docs/architecture/local-first-architecture.md` and `data-model-and-storage.md` from architecture artifact;
- `docs/architecture/language-adapter-design.md` and `docs/product/srs-and-practice-design.md` from language/SRS plan;
- `docs/review/safety-privacy-boundary-review.md` as a new gate artifact;
- `docs/plan/mvp-spike-plan.md` with executable spikes;
- `docs/final/*` as synthesis/index/roadmap, not a duplicate dump.

### MF-5 — MVP spike plan lacks concrete commands, fixtures, and done/not-done gates

**Verdict:** BLOCK for autonomous implementation readiness  
**Evidence:** The mission requires `docs/plan/mvp-spike-plan.md` with exact inputs, outputs, acceptance criteria, and verification commands for six spikes (mission statement lines 141-148; brief lines 120-136). Current docs contain good acceptance criteria and test ideas (`product-behavior-spec.md` lines 795-823; `local-first-architecture-data-model.md` lines 669-728; `language-srs-practice-plan.md` lines 933-977), but not concrete commands, fixture files, or done/not-done gates.

**Why this matters:** “Implement local player + subtitles” is still too broad for a later autonomous build lane. Without fixture names and commands, implementers will rediscover test setup and may accidentally use unsafe/proprietary media or online services.

**Required fix:** Add a spike plan that names safe synthetic or user-owned fixture requirements, expected files, suggested package/tool commands, and verification outputs. Example shape: “Given `fixtures/media/sample-owned.mp4`, `fixtures/subtitles/sample.pl.srt`, `fixtures/subtitles/sample.en.srt`, run `<command>`; pass if transcript seek, dual captions, and no network calls are observed.” Do not use Lingopie media/subtitles/screenshots as fixtures.

### MF-6 — Open human decisions are named but not consistently turned into synthesis gates

**Verdict:** NEEDS HUMAN DECISION  
**Evidence:** Open questions include primary target languages, shell, Anki integration, online-provider strictness, backup media policy, and asbplayer/custom-player decision (`product-behavior-spec.md` lines 825-830; `local-first-architecture-data-model.md` lines 719-728; `language-srs-practice-plan.md` lines 988-995). Some are correctly marked non-blocking for MVP-0, but final synthesis could overchoose them if it tries to be too decisive.

**Why this matters:** These decisions affect privacy posture, dependency choices, export semantics, and implementation sequencing. They should not be silently resolved by an agent if Janusz has not decided.

**Required fix:** Final synthesis must include a “Human decisions / default assumptions” section. It may proceed with defaults for MVP-0, but must explicitly mark:

- Polish-first as an assumption/spike, not a universal product decision;
- Anki as export-only by default unless Janusz requests sync/AnkiConnect mutation;
- online providers disabled by default; any online text/audio/video provider needs explicit opt-in;
- `Mastered` semantics as a configurable UI bucket until Janusz chooses threshold;
- asbplayer as a substrate spike, not an adoption decision.

### MF-7 — Existing live UI evidence and screenshot references need a privacy/durability decision

**Verdict:** NEEDS HUMAN DECISION / must-carry caveat  
**Evidence:** `README.md` references screenshots outside this workspace (`/home/openclaw/lingopie-cdp-*.png`, lines 23-28). `live-ui-inventory.md` references the same screenshot paths (lines 14-21) and says private examples were omitted (lines 3-6, 183-188). The current review did not inspect those screenshots.

**Why this matters:** Final docs may cite screenshots as evidence, but they are outside the workspace, not part of the durable bundle, and may contain visible proprietary UI/account context even if sanitized notes omit private data.

**Required fix:** Final synthesis should either:

- avoid depending on screenshots and rely on sanitized textual observations; or
- add a human-approved sanitization/copy policy before moving screenshots into the workspace; or
- reference them as local non-distributable evidence only, with no public sharing and no private data extraction.

## Nice-to-have improvements

### NH-1 — Add a compact feature-to-artifact trace matrix

Current docs are rich but long. A final `feature -> behavior spec section -> data model tables -> adapter requirements -> acceptance tests -> safety gates -> open questions` matrix would make implementation handoff much easier.

### NH-2 — Normalize evidence labels across all final docs

Suggested label set:

- `PROJECT-CONSTRAINT`
- `MISSION-REQUIREMENT`
- `PUBLIC-DOC`
- `SANITIZED-LIVE-UI`
- `OSS-DOC-SOURCE`
- `LOCAL-EXPERIMENT`
- `DESIGN-RECOMMENDATION`
- `OPEN-DECISION`

This would reduce drift between `[PROJECT]`, `[PRELIM]`, `[LIVE-UI]`, `public docs`, `OSS source/docs`, `REC`, and `OPEN`.

### NH-3 — Add a no-network/no-account-mutation implementation test pattern

Several docs say online providers are disabled by default. Add an explicit test pattern for each feature: run with network denied or HTTP client mocked, verify no requests occur when providers are disabled. For Lingopie specifically, no runtime code path should know Lingopie URLs except documentation/source reference tooling.

### NH-4 — Add explicit log/privacy rules for diagnostics

`product-behavior-spec.md` mentions avoiding raw sensitive text in logs (lines 656-660), and architecture mentions provider logs/secrets (lines 152-153). Final safety docs should provide a short diagnostic logging policy: default logs include ids/status/error codes, not cue text/media paths/notes/voice snippets unless local verbose logging is explicitly enabled.

### NH-5 — Make “Mastered” semantics a documented UI policy

The language/SRS plan correctly states `Mastered` is a UI bucket, not an FSRS state (`language-srs-practice-plan.md` lines 620-625). Final product docs should choose a provisional display rule or mark it as configurable, so implementers do not encode inconsistent thresholds.

## Hard-boundary checklist

| Boundary | Checked? | Evidence and disposition |
|---|---:|---|
| No Lingopie proprietary code/assets/media/subtitles/catalog/private API payloads/account data | Yes | Explicit in `AGENTS.md` lines 15-16, `README.md` lines 30-32, mission lines 41-52, brief lines 16-23, evidence cartography lines 6-10, architecture lines 65-77. PASS; must carry to final safety doc. |
| No DRM/circumvention/protected stream capture | Yes | Explicit in `AGENTS.md` line 16, mission line 46, preliminary research lines 37-43, architecture threat model line 606. PASS. |
| Read-only live product inspection; no account mutation | Yes | Explicit in `AGENTS.md` line 17, mission line 47, brief lines 18-20. Live inventory caveat says one episode open may have affected continue watching (lines 183-187). PASS with caveat and future gate. |
| Own/local media only | Yes | Explicit in `AGENTS.md` line 18, README lines 5-8 and 30-32, preliminary research lines 8-23. PASS. |
| Local/offline default; online providers opt-in | Yes | Explicit in `AGENTS.md` line 20, mission line 49, product spec lines 30-35 and 629-675, architecture lines 536-547, language/SRS privacy notes throughout. PASS; needs implementation tests. |
| Evidence labels distinguish observed/source/recommendation | Partially | Labels exist in all parent docs, but drift noted in MF-2 and public-source depth gaps noted in MF-3. BLOCK until final evidence normalization. |
| No external side effects/deploys/public posts/credential configuration | Yes | Mission line 51; parent tasks report no external side effects. PASS for planning artifacts. |
| No proprietary cloning of UI copy/branding/layout pixels | Partially | Explicit warnings exist (`brief.md` line 22; `product-behavior-spec.md` line 245; `evidence-cartography.md` line 105). Needs final design/copy boundary so implementers rename/re-skin generically. NEEDS HUMAN DECISION for tolerance. |
| Privacy of media paths, cue text, notes, review history, voice recordings | Partially | Covered in architecture/language docs; needs dedicated safety artifact and logging/export policy. BLOCK until MF-1. |

## Counter-evidence and unsupported-claim notes

- The parent docs do **not** claim they performed local experiments; `evidence-cartography.md` states no local experiment was performed (lines 14-18, 180-185). Therefore ASR/alignment/subtitle quality claims must remain spike recommendations, not validated feasibility.
- `evidence-cartography.md` gives confidence `High` for some external OSS/public-doc facts. Without source snapshots or versioned package/license checks, that confidence should apply only to planning taxonomy, not adoption/legal readiness.
- `product-behavior-spec.md` is unusually complete for behavior, but it uses many `[RECOMMENDATION]` labels. That is acceptable if final synthesis preserves which requirements are design recommendations versus source-observed mechanics.
- The docs are generally careful about Anki: internal FSRS remains canonical and export is optional. However, final safety docs must warn that AnkiWeb sync can upload exported text/media; `language-srs-practice-plan.md` already notes this at lines 879-881.

## Required final-synthesis repair checklist

Before final synthesis is marked implementation-ready, require these repairs:

1. Add/produce `docs/review/safety-privacy-boundary-review.md` as the authoritative safety gate.
2. Normalize evidence labels and upgrade project constraints out of `inference/recommendation`.
3. Add durable public/OSS source provenance or downgrade adoption/license claims to “revalidate before implementation.”
4. Create a deliverable crosswalk from `docs/planning/*` to the mission-requested final/spec/architecture/product/review/plan paths.
5. Produce `docs/plan/mvp-spike-plan.md` with concrete safe fixtures, commands, expected outputs, and done/not-done gates.
6. Add a “Human decisions / assumptions” section covering target language order, Anki role, online-provider strictness, Mastered semantics, backup media policy, and asbplayer/custom-player substrate choice.
7. Decide how to handle existing screenshot evidence: sanitized text only, local non-distributable references, or explicit human-approved copied artifacts.

## Final challenger disposition

**BLOCK** final synthesis readiness until the must-fix items are addressed.  
**PASS** the underlying local-first product direction and most hard-boundary preservation.  
**NEEDS HUMAN DECISION** for design-copy tolerance, online-provider strictness beyond default-off, Anki sync/export role, target-language priority, and screenshot evidence handling.
