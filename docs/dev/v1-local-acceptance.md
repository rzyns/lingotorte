# V1 local acceptance baseline

Status: V1 local-only acceptance note for the reviewed P6 implementation baseline. Detailed command output, screenshots, checksums, and final branch commit are recorded in the external acceptance packet under `<local-hermes-artifacts>/lingotorte/v1-local-stabilization/`.

## Baseline

- Baseline branch: local `main`
- Baseline commit: `ac8ca31eb79a77a3eb1cf9cca023dccdb9cf8855`
- V1 stabilization branch: `lingotorte/v1-local-stabilization`
- Intended worktree: `<local-worktrees>/lingotorte-v1-local-stabilization`

This baseline is still local/private. It is not a push, PR, release, deployment, provider enablement, AnkiConnect/cloud-sync enablement, live Lingopie inspection, public sharing, public-internet write approval, or destructive-cleanup approval. Loopback/local dev-server reads for app assets are allowed during local smoke; public documentation URLs used in planning are evidence references, not runtime dependencies.

## What works locally

The current baseline provides a local Vite/TypeScript app and test-backed domain packages for:

- synthetic fixture import from the Library view;
- browser-selected local media plus target `.srt` and optional native `.srt` import using local object URLs and `File.text()` without uploads;
- local video/player shell with transcript and dual target/native subtitle cue projection;
- cue navigation, cue loop toggle, and playback-speed control;
- transcript token preview and source-backed saved sentence/phrase/vocabulary flows;
- My Vocab / My Sentences local views with source context;
- FSRS-backed local review card creation and append-only review events;
- local practice attempts with deterministic result feedback;
- local export/restore manifest preview with privacy warnings; restore merges/upserts manifest records into local learner state and does not clear unrelated records;
- provider-disabled settings/status and no-network test coverage.

## Required V1 verification matrix

Run the full matrix from the V1 worktree before treating the branch as merge-ready:

| Check | Command | Expected V1 result |
|---|---|---|
| Offline dependencies | `npm ci --offline --no-audit --no-fund` | succeeds from local npm cache; no registry fallback |
| Unit/integration suite | `npm test` | pass |
| Provider-disabled network harness | `npm run test:no-network` | pass with zero network attempts |
| Production build | `npm run build` | pass |
| Static typecheck | `npm run typecheck` | pass |
| Privacy boundary scan | `npm run scan:privacy` | pass / `{ "ok": true }` |
| Final bundle validator | `python3 validate_final_bundle.py` | pass against the current checkout |
| Whitespace | `git diff --check` | pass |
| Committed-range whitespace | `git diff --check main...HEAD` or equivalent after commit | pass |
| Secret scan | conservative tracked-file scan | zero hard findings |
| Browser smoke | WSL Edge DevTools or browser fallback against `npm run dev -- --host 127.0.0.1` | no fatal console errors; no external network; fixture flow and browser local file import flow work as documented |

## Latest local evidence

The latest all-green resumed validation run is recorded outside the repo at:

- `<local-hermes-artifacts>/lingotorte/v1-local-stabilization/resume-final-validation-summary.json`
- `<local-hermes-artifacts>/lingotorte/v1-local-stabilization/command-results.md`
- `<local-hermes-artifacts>/lingotorte/v1-local-stabilization/acceptance-packet.md`
- `<local-hermes-artifacts>/lingotorte/v1-local-stabilization/browser-smoke-report.md`
- `<local-hermes-artifacts>/lingotorte/v1-local-stabilization/cleanup-triage.md`
- `<local-hermes-artifacts>/lingotorte/v1-local-stabilization/artifact-checksums.sha256`

That run passed `npm ci --offline --no-audit --no-fund`, `npm test`, `npm run test:no-network`, `npm run test:web`, `npm run build`, `npm run typecheck`, `npm run scan:privacy`, `git diff --check`, a refined credential-pattern scan, generated-artifact cleanup, `python3 validate_final_bundle.py`, and external artifact checksum verification.

## Cleanup decisions carried by V1

| Candidate | V1 decision | Rationale |
|---|---|---|
| P5 unreachable review helper | Fixed | Removed the unused helper from the web model so future code cannot accidentally bypass `ReviewService.submitReview`. Existing review tests cover the supported path. |
| P6 `lastAttemptResult.correct: boolean \| null` | Fixed | Tightened the UI type to `boolean` because all assignments are concrete booleans and the UI treats it as boolean. Typecheck and practice tests cover the path. |
| P6 `ExportService.exportToFile` does not write to disk | Deferred | Real file writing/download is a product/API decision and may affect privacy, user-chosen paths, browser download semantics, and future desktop packaging. |
| P6 hardcoded `/tmp/lingotorte` export directory | Deferred | Harmless while export is manifest-preview only; should be redesigned together with explicit user-chosen export/download behavior. |
| P3 `sha256Text` naming caveat | Deferred | The name/provenance distinction should be handled in a focused hash/provenance cleanup so downstream terminology remains explicit. |
| Inherited P1 audit items | Deferred | No V1 blocker was identified; keep as future cleanup unless a new validation failure appears. |

## Known limitations

- The current browser UI imports the synthetic fixture through **Library → Load synthetic fixture** and supports **Library → Import local media** for owned media plus `.srt` subtitle files. Durable persistence/local-service transcription integration is still future work beyond the browser object-URL import path.
- Export creates a manifest object and preview path, not a persisted file.
- Restore merges/upserts manifest records into existing local state; a future full replace/conflict-resolution flow remains a separate product decision.
- The local Vite dev server is for acceptance smoke, not a deployed service.
- Screenshots and browser evidence should use only synthetic/local data.
- External providers, online translation/LLM/ASR/pronunciation, AnkiConnect, cloud sync, public-internet writes, public release/sharing, live Lingopie inspection, remote setup, push/PR, and deploy/restart remain explicitly unauthorized.

## Merge-readiness posture

A passing V1 packet means **self-validated locally and ready for independent review**, not automatically merged to `main`. Merge, push, PR, public release, provider/sync enablement, deployment/restart, or destructive cleanup all require separate human authorization.
