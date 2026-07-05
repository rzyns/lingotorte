# Lingotorte M1 final fallback human-gate packet

Generated: `2026-07-05T21:52:05Z` (`2026-07-05T17:52:05-04:00`)
Gate task: `t_39378871`
Branch: `lingotorte/m1-daily-driver-polish`
Reviewed HEAD before this packet: `0a60518` (`Restore vendored Morfeusz SGJP analyzer`)
Batch baseline: `dbfd347` (`Wire Lingotorte decisions into plan status`)

## Artifact Navigation
Role: summary
Review scope: summary_integrity
Derived from:
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/plan/autonomous-batches/20260705T192103Z-lingotorte-m1-daily-driver-polish.md
  -> original M1 batch manifest, autonomy envelope, routing repair, and final-gate contract
- /home/openclaw/.hermes/artifacts/kanban/t_89bf8506/validation-receipt.md
  -> integration validation command receipt and representative raw output snippets
Supported by:
- /home/openclaw/.hermes/artifacts/kanban/t_89bf8506/artifact-manifest.json
  -> validation artifact hashes, byte counts, and log paths
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/plan/autonomous-batches/20260705T215205Z-lingotorte-m1-final-changed-files.txt
  -> complete `git diff --name-only dbfd347...HEAD` changed-file inventory used for this packet
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/PLAN.md
  -> current backlog/status authority and non-authorizations
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/DECISIONS.md
  -> autonomous local-development authority and deferred gates
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/review/safety-privacy-boundary-review.md
  -> binding safety/privacy/legal boundary
Feeds:
- kanban task `t_39378871`
  -> final human decision gate: accept, repair, authorize push/PR, or authorize next local batch
Verified by:
- kanban task `t_916b0917`
  -> final independent review PASS at `0a60518`
- kanban task `t_89bf8506`
  -> integration validation PASS with 12 checked artifact files and zero manifest verification failures

## Executive verdict

Ready for the final human gate. The replacement M1 runtime-fallback batch has an independent final-review `PASS` at `0a60518`, clean integration validation, preserved hard boundaries, and no reported final-gate blockers.

This packet is not push, PR, release, deployment, public sharing, provider expansion, data-mutation, or external-action approval. It only frames the next human decision.

## Replacement-chain routing

The original specialist B2 card `t_bb077be2` was blocked before implementation by repeated `frontend-eng` runtime crashes caused by Ollama Cloud HTTP 429 weekly quota for `kimi-k2.7-code`. That failure was treated as a worker-runtime capacity issue, not a Lingotorte product/safety blocker.

Active replacement chain:

| Step | Task | Result |
|---|---|---|
| B2 runtime fallback | `t_b5e6e6e5` | completed with commit `bc3de66` |
| B2 review | `t_f4b87e36` | PASS |
| B3 runtime fallback | `t_9c4ffb75` | completed with commits `b7493f0`, `f81e3b1` |
| B3 review | `t_ee23d449` | PASS |
| B4 runtime fallback verification | `t_98c4a0da` | completed with commit `664080b` |
| B4 review | `t_0a83503c` | PASS |
| Morfeusz test-integrity repair | `t_746de6df` | completed with commit `0a60518` |
| Integration validation | `t_89bf8506` | PASS at `0a60518` |
| Final independent review | `t_916b0917` | PASS at `0a60518` |
| Final human gate | `t_39378871` | this packet; block for human decision |

The original final gate `t_bc700d35` is superseded by `t_39378871` unless the original specialist chain is explicitly revived.

## Commit inventory

Batch commits from `dbfd347...HEAD` reviewed for this gate:

| Commit | Message | Scope |
|---|---|---|
| `550e719` | Record Lingotorte M1 runtime reroute | docs/batch routing repair |
| `bc3de66` | Polish browser media relink lifecycle | B2 durable browser media handle/relink polish |
| `b7493f0` | Polish B3 metadata backup integrity and restore mode guards | B3 export/restore guard polish |
| `f81e3b1` | Polish metadata backup restore UI | B3 restore UI polish |
| `664080b` | Document B4 ASR harness verification | B4 ASR harness/runbook verification |
| `0a60518` | Restore vendored Morfeusz SGJP analyzer | B5/Morfeusz test-integrity repair included before final validation |

## Changed-file inventory

Current `git diff --stat dbfd347...HEAD` reports `132 files changed, 6189 insertions(+), 69 deletions(-)` before this packet. The complete changed-file list is committed as:

`docs/plan/autonomous-batches/20260705T215205Z-lingotorte-m1-final-changed-files.txt`

Top-level changed areas:

- `PLAN-STATUS.md` — status reconciliation for M1 fallback outcomes.
- `docs/dev/local-runbook.md` — B2/B3/B4 runbook and limitation updates.
- `docs/plan/autonomous-batches/20260705T192103Z-lingotorte-m1-daily-driver-polish.md` — batch manifest and runtime-routing repair.
- `apps/web/src/app.ts`, `apps/web/src/model.ts`, `apps/web/src/uiTypes.ts` — browser media handle/relink and backup/restore UI/model polish.
- `packages/storage/src/exportRestoreService.ts` — export/restore guard support.
- `packages/language/src/adapters.ts`, `packages/language/src/morfeusz-ts.d.ts`, `vendor/morfeusz-ts/**` — restored real SGJP-backed Morfeusz adapter/package path.
- `tests/core/p3Adapters.test.ts`, `tests/core/p6PracticeExport.test.ts`, `tests/web/frontendUi.test.ts`, `tests/web/p6PracticeFrontend.test.ts` — focused regression coverage.

## Validation evidence

Integration validation task `t_89bf8506` produced `/home/openclaw/.hermes/artifacts/kanban/t_89bf8506/validation-receipt.md` and `/home/openclaw/.hermes/artifacts/kanban/t_89bf8506/artifact-manifest.json`.

Required commands in the receipt all exited `0`:

- `git status --short --branch`
- `git log --oneline --decorate -8`
- `git diff --check`
- `npm run typecheck`
- `npm run test:no-network` — 2 files, 5 tests passed
- `npm run scan:privacy` — `ok: true`, `scannedFiles: 43`
- `npm test` — 25 files passed; 202 tests passed; 4 skipped
- `npm run build`
- `python3 validate_final_bundle.py` — `errors: []`, `required_count: 16`, `manifest_count: 16`, `markdown_files: 1179`
- final `git status --short --branch`

Final independent review task `t_916b0917` additionally checked the branch state, batch diff/list, `git diff --check`, clean status, and validation artifact manifest hashes. It reported 12/12 files checked with no failures.

## Reviewer verdicts and qualifications

Final review verdict: `PASS`.

No final-gate blockers were reported. Non-blocking qualifications carried forward:

1. B4 live owned-media ASR benchmark remains deferred by design because no exact approved owned clip path or selection rule was provided.
2. A minor B2 stale-IDB-handle restoration robustness note remains open; it is local-only, user-mediated, non-destructive, and not a final-gate blocker.
3. The Morfeusz test-integrity issue found during B2 review was repaired in `t_746de6df` / `0a60518` and included in integration validation.

## Safety/privacy boundary confirmation

Preserved boundaries from `PLAN.md`, `DECISIONS.md`, and `docs/review/safety-privacy-boundary-review.md`:

- no push, PR, release, public deployment, hosted exposure, or public sharing;
- no destructive edits to Janusz's real learner state, media library, provider accounts, or external apps;
- no DRM/circumvention, protected-stream capture, private/account-gated media access, browser credential/cookie use, or automatic online media download;
- no cloud sync, AnkiConnect mutation, microphone/learner voice capture, or pronunciation scoring;
- no provider expansion beyond `DECISIONS.md`;
- no secrets/API keys/raw provider payloads/model caches/generated media/audio/transcript scratch artifacts/private local media paths in git.

## Deferred or non-authorized actions

Deferred/non-authorized after this gate:

- Push/PR/release/deploy/public sharing: requires separate explicit authorization.
- B4 real owned-media ASR benchmark: requires exact approved owned clip path or explicit approved local selection rule.
- B2 stale-handle edge hardening: optional targeted repair if Janusz wants it before accepting M1.
- B6 source-media clip/snippet generation, B7 embedded subtitle extraction, B8 Anki/microphone/sync/packaging: future gated lanes.
- Live provider calls/model downloads outside already approved and documented local gates: not authorized by this packet.

## Recommended human options

Choose one:

1. `accept` — accept the local M1 fallback batch as evidenced at `0a60518`; no remote/public action implied.
2. `repair` — request a targeted local repair, most plausibly the B2 stale-IDB-handle edge noted by review.
3. `authorize push/PR` — separately authorize pushing/opening a PR for the exact local branch/range after a fresh preflight.
4. `authorize next local batch` — keep this M1 batch local and start the next approved local backlog slice under the same hard boundaries.

Recommended default: `accept` if the goal is to close the local M1 daily-driver polish batch; choose `authorize push/PR` only if you want this branch moved beyond local evidence into a remote review workflow.
