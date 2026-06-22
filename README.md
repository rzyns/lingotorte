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

Then open the loopback URL printed by Vite, usually `http://127.0.0.1:5173/`, and use **Library → Load synthetic fixture** to exercise the local player/transcript/saved/review/practice/export flows. “Local-only” runtime behavior means no public-internet writes or provider calls without explicit opt-in; loopback/local dev-server reads for app assets are expected during development. See `docs/dev/local-runbook.md` for the full local runbook and browser smoke checklist.

If `npm ci --offline` cannot use the local cache, stop before any networked install unless Janusz explicitly authorizes that package-manager action.

## Local transcription adapters

`packages/local-transcription` contains Node-side seams for the transcript-generation plan:

- `extractAudioWithFfmpeg()` for real mono 16 kHz WAV extraction through ffmpeg.
- `transcribeWithFasterWhisper()` plus `scripts/faster_whisper_transcribe.py` for local faster-whisper transcription.
- `alignWordsWithWhisperX()` plus `scripts/whisperx_align.py` for WhisperX-style forced word alignment.
- `transcribeWithElevenLabsScribe()` for explicit-opt-in ElevenLabs Scribe v2 cloud STT using fake-HTTP tests by default.

The browser UI still uses fake/local lifecycle controls unless a Node/local-service integration layer explicitly invokes these adapters. `yt-dlp` remains plan-only via `planYtDlpMediaAcquisition()`.

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
12. `docs/plan/v3-transcript-generation-correction-plan.md` — post-core plan for YouTube caption candidates, ElevenLabs Scribe v2 transcript drafts, word timings, command-only media acquisition, future local STT opt-out, correction/approval, and transcript provenance.
13. `docs/planning/documentation-index.md` — retained parent crosswalk and previous synthesis index.

## Source provenance

This bundle is based on the prior investigation artifact:

- `<local-home>/lingopie-local-clone-investigation.md`

Screenshots captured during the live UI inspection remain as local evidence files outside this workspace:

- `<local-home>/lingopie-cdp-catalog-polish.png`
- `<local-home>/lingopie-cdp-show-detail.png`
- `<local-home>/lingopie-cdp-player-after-start.png`
- `<local-home>/lingopie-cdp-practice-real.png`

## Boundary reminder

Use Lingopie as a **reference UX/product**, not as a source of proprietary implementation or content. Public documentation URLs in this repo are planning evidence, not runtime dependencies. Do not extract private account data, tokens, raw subtitle/media assets, or proprietary API payloads. Future work should target local/owned media, explicit subtitle/transcript inputs, generated local transcripts, or user-approved/corrected caption tracks.
