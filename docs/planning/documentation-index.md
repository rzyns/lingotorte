# Lingotorte Planning Documentation Index

Status: final planning bundle index and crosswalk. Planning only; not an implementation artifact.

## Final planning bundle

Start here:

1. [Final Implementation Plan](./final-implementation-plan.md) — integrated product/architecture/data/language/SRS plan, milestones, dependency ordering, unresolved decisions.
2. [Feature Build Roadmap](./feature-build-roadmap.md) — feature-by-feature phased roadmap and acceptance gates.
3. [Evidence Index](./evidence-index.md) — normalized provenance labels, parent artifact inventory, feature-to-evidence trace matrix, revalidation rules.
4. [Safety, Privacy, and Legal Boundaries](./safety-privacy-legal-boundaries.md) — authoritative safety gate, provider/export/live-inspection/logging boundaries.
5. [Testing and Acceptance Plan](./testing-and-acceptance-plan.md) — fixture plan, command shapes, feature acceptance checklist, no-network/account-mutation patterns.
6. [Documentation Index](./documentation-index.md) — this file; cross-links and deliverable path map.

Parent planning artifacts retained for full detail:

- [Product Behavior Specification](./product-behavior-spec.md)
- [Evidence Cartography](./evidence-cartography.md)
- [Local-First Architecture, Data Model, and Test Plan](./local-first-architecture-data-model.md)
- [Language Analysis, Saved Learning Objects, SRS, and Practice Plan](./language-srs-practice-plan.md)
- [Independent Challenge Review](./independent-challenge-review.md)

Read-first project context:

- [AGENTS.md](../../AGENTS.md)
- [README.md](../../README.md)
- [Hermes War Room Mission Statement](../mission/hermes-war-room-mission-statement.md)
- [Lingopie/Lingotorte Mission Brief](../mission/lingopie-war-room-brief.md)
- [Preliminary Grounding Research](../research/preliminary-grounding-research.md)
- [Sanitized Live UI Inventory](../research/live-ui-inventory.md)

## Mission deliverable crosswalk

The original mission statement listed a broad target tree under `docs/final`, `docs/spec`, `docs/architecture`, `docs/product`, `docs/review`, and `docs/plan`. The final packaging pass created those mission-requested split-path deliverables while retaining the deeper parent artifacts under `docs/planning/`. The crosswalk below identifies each requested deliverable, its current durable split-path file, and the parent source that fed it.

| Mission-requested deliverable | Current split-path artifact | Parent detail source | Gap/next action |
|---|---|---|---|
| `docs/final/war-room-final-synthesis.md` | `../final/war-room-final-synthesis.md` | All parent artifacts and final planning synthesis | Current canonical executive synthesis. Keep in sync only if future planning changes. |
| `docs/final/lingotorte-implementation-plan.md` | `../final/lingotorte-implementation-plan.md` | `final-implementation-plan.md`; `feature-build-roadmap.md` | Future implementation DAG can split by milestone. |
| `docs/spec/lingopie-behavior-reference.md` | `../spec/lingopie-behavior-reference.md` | `product-behavior-spec.md`, `evidence-cartography.md`, `../research/live-ui-inventory.md` | Do not use screenshots/assets without screenshot policy. |
| `docs/spec/feature-implementation-playbook.md` | `../spec/feature-implementation-playbook.md` | `product-behavior-spec.md`; architecture feature tests; final roadmap | Turn roadmap slices into task cards when implementing. |
| `docs/architecture/local-first-architecture.md` | `../architecture/local-first-architecture.md` | `local-first-architecture-data-model.md`; final plan architecture section | Revalidate chosen app shell during P0. |
| `docs/architecture/data-model-and-storage.md` | `../architecture/data-model-and-storage.md` | `local-first-architecture-data-model.md` schema sections | Convert to migrations only after repo skeleton exists. |
| `docs/architecture/language-adapter-design.md` | `../architecture/language-adapter-design.md` | `language-srs-practice-plan.md` adapter contracts | Choose concrete libraries per language after fixture spike. |
| `docs/product/srs-and-practice-design.md` | `../product/srs-and-practice-design.md` | `language-srs-practice-plan.md`; roadmap P5-P6 | Mastered threshold remains configurable/open. |
| `docs/research/public-product-cartography.md` | `../research/public-product-cartography.md` | `evidence-cartography.md`; `../research/preliminary-grounding-research.md` | Revalidate public docs before legal/adoption claims. |
| `docs/research/live-ui-inventory-expanded.md` | `../research/live-ui-inventory-expanded.md` | `../research/live-ui-inventory.md`; `evidence-index.md` | No further live inspection without explicit gate. |
| `docs/research/oss-substrate-assessment.md` | `../research/oss-substrate-assessment.md` | `evidence-cartography.md`; preliminary OSS seeds | Future dependency/license spike required before adoption. |
| `docs/review/safety-privacy-boundary-review.md` | `../review/safety-privacy-boundary-review.md` | challenge review MF-1; `safety-privacy-legal-boundaries.md` | This split-path doc is the current authoritative safety gate. |
| `docs/plan/mvp-spike-plan.md` | `../plan/mvp-spike-plan.md` | `testing-and-acceptance-plan.md` spike table; roadmap P0-P7 | Instantiate exact commands after skeleton chosen. |
| `README.md` and `AGENTS.md` updates | `../../README.md`; `../../AGENTS.md` | Existing README/AGENTS plus final package navigation | Refresh manifests whenever these index files change. |

## Recommended reading path for future implementation agents

For any feature card:

1. Read `AGENTS.md` and `docs/planning/safety-privacy-legal-boundaries.md` first.
2. Read `docs/planning/evidence-index.md` for provenance labels and source caveats.
3. Read `docs/planning/final-implementation-plan.md` for global architecture/data/SRS context.
4. Read the relevant milestone in `docs/planning/feature-build-roadmap.md`.
5. Read `docs/planning/testing-and-acceptance-plan.md` for fixture and acceptance gates.
6. Read parent artifact sections for full detail, especially:
   - feature behavior: `product-behavior-spec.md`;
   - schema/invariants: `local-first-architecture-data-model.md`;
   - language/SRS/practice: `language-srs-practice-plan.md`.

## Challenge-review repair map

| Challenge review item | Repair in final bundle |
|---|---|
| MF-1 dedicated safety/privacy/legal boundary review | `safety-privacy-legal-boundaries.md` created. |
| MF-2 evidence-label drift | `evidence-index.md` defines normalized labels including `PROJECT-CONSTRAINT` and `MISSION-REQUIREMENT`. |
| MF-3 public/OSS provenance weakness | `evidence-index.md` downgrades adoption/license claims to candidate/revalidate-before-use. |
| MF-4 final deliverable path mismatch | This document provides mission crosswalk; all minimum requested planning docs exist under `docs/planning/`. |
| MF-5 MVP spike commands/fixtures | `testing-and-acceptance-plan.md` defines safe fixture layout, command shapes, and done/not-done gates. |
| MF-6 human decisions | `final-implementation-plan.md` and `feature-build-roadmap.md` list safe defaults and open decisions. |
| MF-7 screenshot evidence policy | `evidence-index.md` and safety doc default to sanitized text only/local non-distributable evidence. |
| NH-1 trace matrix | `evidence-index.md` feature-to-evidence trace matrix. |
| NH-2 label normalization | `evidence-index.md` label table. |
| NH-3 no-network/no-account tests | `testing-and-acceptance-plan.md`; safety doc implementation tests. |
| NH-4 diagnostic logging policy | `safety-privacy-legal-boundaries.md` data-class/logging rules. |
| NH-5 Mastered semantics | Roadmap and final plan treat Mastered as configurable UI bucket, not FSRS state. |

## Artifact policy

Keep the full structured artifacts on disk. Human-facing summaries should link to these files rather than copying long sections into chat. Do not publish screenshots, proprietary UI assets, raw private vocabulary, account data, local media, subtitle files, voice recordings, or exported decks without explicit approval.
