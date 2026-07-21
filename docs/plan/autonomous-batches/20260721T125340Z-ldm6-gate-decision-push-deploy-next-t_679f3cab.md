# LDM6 gate decision — accept, push, deploy locally, authorize next local batch (LDM7 B7 UI)

Generated: `2026-07-21T12:53:40Z`
Gate task: `t_679f3cab`
Operator: Janusz via Cowork (Claude) chat: "authorize push/merge, deploy locally, authorize next local batch"
Accepted packet: `docs/plan/autonomous-batches/20260721T121539Z-ldm6-configurable-asr-model-base-default-human-gate-packet-t_679f3cab.md` (commit `4e213fe`)

## Interpretation applied

1. Accept LDM6 (configurable ASR model, `base` default) at tested HEAD `9f92d52`; review PASS `t_300286cc`, QA PASS `t_86394367`.
2. Push the branch to the Janusz-owned remote after fresh preflight ("merge" = the standing local fast-forward of the primary checkout; `origin/main` remains untouched).
3. Deploy locally: fast-forward primary checkout + restart the Lingotorte systemd user units + verify the effective default model.
4. Authorize the next local-only batch. Selected: **LDM7 — B7 browser UI wiring for embedded subtitle track listing/extraction**, closing the gap left by LDM4 (service-side capability accepted 2026-07-06 with no browser surface).
5. Not authorized: PR, release, public exposure, `origin/main` update.

## Push result

- Preflight: fetch --prune; `ahead 4 / behind 0`; clean worktree; `git diff --check` clean; `scan:privacy` ok (45 files); `validate_final_bundle.py` errors=[] (16/16, 1199 md files).
- `git push origin HEAD:refs/heads/lingotorte/m1-daily-driver-polish`: `d4b39df..4e213fe`; remote SHA verified `4e213fed47b97afecbd17f64bef893f6f3385e9a`.

## Local deploy result

- No dependency-manifest changes in `d4b39df..4e213fe`; `npm ci` not required.
- Primary checkout fast-forwarded `d4b39df` → `4e213fe`; both units restarted, `active`.
- `GET /api/health` ok; `GET /api/status` shows **`config.defaultAsrModelName: "base"`** (redactions intact); web UI HTTP 200.
- The B4 recommendation is now the live daily default; `LINGOTORTE_ASR_MODEL` can override within the allowlist.

## Next batch materialized

LDM7 B7 browser-UI chain (goal-mode, default board, shared m1 worktree/branch) — task ids recorded in the follow-up Kanban comment on `t_679f3cab` after creation.

## Boundaries preserved

No PR/release/tag/public exposure; `origin/main` untouched; no provider calls or model downloads; no destructive learner/media changes; receipt committed to the branch, pushed, and fast-forwarded into `main` (docs-only, no restart required).
