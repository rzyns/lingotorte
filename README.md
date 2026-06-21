# Lingotorte

Local/private language-learning video app planning workspace.

## Purpose

This workspace captures preliminary grounding research for a planned `hermes-war-room` exploration and planning mission around a Lingopie-like local app. The product goal is to use **Janusz’s own local videos/subtitles**, not Lingopie proprietary content.

## Local V1 quick start

This repo currently has a local-only Vite/TypeScript baseline backed by synthetic fixtures. From a clean checkout with the npm cache already populated:

```bash
npm ci --offline --no-audit --no-fund
npm test
npm run test:no-network
npm run build
npm run typecheck
npm run scan:privacy
python3 validate_final_bundle.py
npm run dev -- --host 127.0.0.1
```

Then open the loopback URL printed by Vite, usually `http://127.0.0.1:5173/`, and use **Library → Load synthetic fixture** to exercise the local player/transcript/saved/review/practice/export flows. See `docs/dev/local-runbook.md` for the full local runbook and browser smoke checklist.

If `npm ci --offline` cannot use the local cache, stop before any networked install unless Janusz explicitly authorizes that package-manager action.

## Recommended reading order

1. `AGENTS.md` — automatically loaded project context and operating boundaries for future agents.
2. `docs/dev/local-runbook.md` — how to run and smoke-test the local fixture-backed app.
3. `docs/dev/v1-local-acceptance.md` — V1 local acceptance scope, cleanup decisions, and verification matrix.
4. `docs/mission/hermes-war-room-mission-statement.md` — pasteable mission statement for the `hermes-war-room` orchestrator.
5. `docs/mission/lingopie-war-room-brief.md` — lane-oriented mission brief for a fleet of agents.
6. `docs/research/preliminary-grounding-research.md` — consolidated preliminary research and architecture direction.
7. `docs/research/live-ui-inventory.md` — sanitized live Lingopie UI observations from CDP/MCP inspection.

## Final planning bundle

The canonical implementation-planning bundle now lives in mission-requested split paths as well as the retained `docs/planning/` parent artifacts.

Recommended final-bundle reading order:

1. `docs/final/war-room-final-synthesis.md` — executive summary, investigation, recommendations, unresolved questions, next steps.
2. `docs/final/lingotorte-implementation-plan.md` — roadmap, phases, dependencies, repo structure, build/test strategy.
3. `docs/review/safety-privacy-boundary-review.md` — authoritative safety/privacy/legal gate.
4. `docs/spec/lingopie-behavior-reference.md` — public/sanitized reference behavior with observed vs inferred notes.
5. `docs/spec/feature-implementation-playbook.md` — feature-by-feature implementation matrix and acceptance tests.
6. `docs/architecture/local-first-architecture.md` — app shell, component diagram, data flow, privacy model, failure modes.
7. `docs/architecture/data-model-and-storage.md` — typed model, SQLite schema, migration/audit/export strategy.
8. `docs/architecture/language-adapter-design.md` — adapter contracts, Polish-first guidance, offline/online tradeoffs.
9. `docs/product/srs-and-practice-design.md` — FSRS, review state, practice modes, UX flow, tests.
10. `docs/research/public-product-cartography.md`, `docs/research/live-ui-inventory-expanded.md`, `docs/research/oss-substrate-assessment.md` — research backing.
11. `docs/plan/mvp-spike-plan.md` — concrete MVP spikes with inputs, outputs, commands, and gates.
12. `docs/planning/documentation-index.md` — retained parent crosswalk and previous synthesis index.

## Source provenance

This bundle is based on the prior investigation artifact:

- `/home/openclaw/lingopie-local-clone-investigation.md`

Screenshots captured during the live UI inspection remain as local evidence files outside this workspace:

- `/home/openclaw/lingopie-cdp-catalog-polish.png`
- `/home/openclaw/lingopie-cdp-show-detail.png`
- `/home/openclaw/lingopie-cdp-player-after-start.png`
- `/home/openclaw/lingopie-cdp-practice-real.png`

## Boundary reminder

Use Lingopie as a **reference UX/product**, not as a source of proprietary implementation or content. Do not extract private account data, tokens, raw subtitle/media assets, or proprietary API payloads. Future work should target local/owned media and explicit subtitle/transcript inputs.
