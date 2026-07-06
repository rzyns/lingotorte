# LDM2 B2 handle-robustness batch manifest

Generated: `2026-07-06T03:08:26Z` (`2026-07-05T23:08:26-04:00`)
Preflight task: `t_ca7af335`
Authorizing gate: `t_bc700d35`
Selected gate option: `authorize next local batch`
Workspace/worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
Branch: `lingotorte/m1-daily-driver-polish`
Decision start HEAD: `f24ec48411275d9980c53b36fcec19405abdab07`
Preflight start HEAD: `1ebb329ec6cbca008ae2b1781997a95c8874f1c6`

## Artifact Navigation
Role: operational
Review scope: operational_relevance
Derived from:
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/plan/autonomous-batches/20260706T025725Z-lingotorte-next-local-batch-decision-t_bc700d35.md
  -> human-gate decision receipt and created LDM2 chain
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/PLAN.md
  -> current backlog and B2 scope/status
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/DECISIONS.md
  -> browser-handle versus local-service path decision and worker authority boundaries
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/PLAN-STATUS.md
  -> latest current-state summary and shortest ready path
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/review/safety-privacy-boundary-review.md
  -> binding safety, privacy, provider, and media boundaries
Supported by:
- kanban task `t_bc700d35`
  -> completed human-gate application that authorized this local batch
- kanban task `t_ca7af335`
  -> preflight/readback task that produced this manifest
Feeds:
- kanban task `t_e600b01a`
  -> frontend implementation of B2 stale handle/relink robustness
- kanban task `t_dfceb95e`
  -> independent review of the implementation
- kanban task `t_0c32ebbc`
  -> integration validation of the reviewed implementation
- kanban task `t_a2f08e9c`
  -> final human-gate packet and next decision
Verified by:
- `git status --short --branch --untracked-files=all` at preflight start
  -> clean worktree on the intended branch before this manifest was written
- source readback and hashes in this manifest
  -> confirms the current docs that define scope and boundaries

## Preflight readback

Live workspace checks before writing this manifest:

- Worktree exists: yes.
- Git root: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`.
- Branch: `lingotorte/m1-daily-driver-polish`.
- HEAD before this manifest: `1ebb329ec6cbca008ae2b1781997a95c8874f1c6` (`Record Lingotorte LDM2 next-batch decision`).
- `git status --short --branch --untracked-files=all`: clean (`## lingotorte/m1-daily-driver-polish`).

Source documents read for this preflight:

| Artifact | SHA-256 | Lines | Scope confirmation |
|---|---:|---:|---|
| `PLAN.md` | `1cc37f7ca0a9cba5fec7082da2fa756bf43827766b045be326286dde13d56cd5` | 302 | B2 is the active durable media handle/native path backlog slice; current status says handle import/revalidation is partial and fallback relink remains relevant. |
| `DECISIONS.md` | `6ba00b2be221f63c880cba3d2fd9d7b927bc853db07620cadd6bbdf8af0024cc` | 268 | B2 uses a split model: browser File System Access handles for playback/relink identity and explicit local-service absolute paths for ASR/ffmpeg/ffprobe/snippets/extraction. |
| `PLAN-STATUS.md` | `09508cb96b2ba4524f2fdffb5eaffcbf4c92ba59234cd59ac005ea7618d4ccd0` | 106 | The shortest ready path starts with B2 File System Access handle persistence/revalidation and stale-handle/relink robustness. |
| `docs/review/safety-privacy-boundary-review.md` | `321dc7a148a389695f4627aaf74d509cc35d963ebfac6b683052de0f79381948` | 168 | Binding project boundaries: owned/local media, privacy by default, provider-disabled default, no DRM/circumvention, no external/account mutation. |
| `docs/plan/autonomous-batches/20260706T025725Z-lingotorte-next-local-batch-decision-t_bc700d35.md` | `d8f2f9cd3b07659d3992a656d63c593bde41ad5248a33498151309019e3d69f4` | 74 | Human decision selected `authorize next local batch` and scoped the next batch to B2 handle persistence/revalidation + stale handle/relink robustness. |

## Confirmed LDM2 B2 scope

This local batch is limited to B2 handle/relink robustness for the existing local browser + loopback-service architecture.

In scope for LDM2 implementation:

- Persisted browser File System Access handle permission revalidation on reload/restart.
- Stale IndexedDB/browser-handle edge cases: missing handle, permission denied, handle gone/unreadable, or restored handle with no active object URL.
- User-mediated relink affordances that make the local app feel recoverable rather than silently broken.
- Clear UI/model copy and state boundaries that browser handles are playback/relink identity only.
- Preservation of the explicit local-service absolute-path requirement for ASR, ffmpeg/ffprobe, embedded subtitle extraction, source-media snippets, and future heavyweight local processing.
- Focused tests using synthetic/local fixtures only.

Out of scope for this batch unless a later human gate changes it:

- B3 backup/export/restore product expansion.
- B4 real owned-media ASR benchmarking, because no exact owned media path or approved selection rule was supplied.
- B6 source-media clip/audio snippet generation.
- B7 embedded subtitle extraction.
- Tauri/Electron/PWA packaging.
- Provider expansion, online translation/LLM/dictionary work, microphone/pronunciation capture, cloud sync, AnkiConnect, or public/remote actions.

## Non-authorizations preserved

This manifest and the LDM2 chain do not authorize:

- push, PR, release, public deployment, hosted exposure, or public sharing;
- destructive changes to Janusz's real learner state, media library, provider accounts, browser profiles, or external apps;
- DRM/circumvention, protected-stream capture, credential/cookie/browser-profile use, private/account-gated media access, or automatic online media download;
- cloud sync, AnkiConnect mutation, microphone/learner voice capture, online provider expansion, online translation/LLM explanation, or provider classes beyond `DECISIONS.md`;
- committing secrets, API keys, raw provider request/response bodies, model caches, generated media/audio/transcript scratch artifacts, private absolute media paths, or private provider payloads.

## Task chain and contracts

| Step | Task id | Assignee | Parent(s) | Contract |
|---|---:|---|---|---|
| LDM2-00 | `t_ca7af335` | `default` | `t_bc700d35` | Preflight the batch, verify live docs/branch/clean state, write this manifest, commit exact-scope docs change. |
| LDM2-01 | `t_e600b01a` | `frontend-eng` | `t_ca7af335` | Implement only B2 stale browser-handle/relink robustness with typed local state where practical, focused tests, docs/status updates if behavior changes, and exact-scope commit. |
| LDM2-02 | `t_dfceb95e` | `reviewer` | `t_e600b01a` | Independent read-only review. Return `PASS`, `BLOCK`, or `NEEDS HUMAN DECISION` with evidence, commands, and boundary checks. |
| LDM2-03 | `t_0c32ebbc` | `qa` | `t_dfceb95e` | Integration validation only. Record a durable receipt with exact commands, exit codes, concise output, receipt path/hash, clean status proof, and tracked-artifact/privacy check. |
| LDM2-04 | `t_a2f08e9c` | `default` | `t_0c32ebbc` | Produce final human-readable packet under `docs/plan/autonomous-batches/`, comment path/hash/options, then block as the human gate rather than completing. |

## Validation expectations

### LDM2-01 implementation

Minimum expected checks, adjusted only by actual diff scope:

- `git status --short --branch` before and after implementation.
- `git diff --check`.
- Focused vitest targets covering stale handle, permission denied, restored handle, and relink states.
- `npm run typecheck` if TypeScript changes are made.
- `npm run test:no-network` for provider-disabled/no-network preservation when UI/model paths or provider-adjacent surfaces are touched.
- Broader `npm test`, `npm run scan:privacy`, `npm run build`, and `python3 validate_final_bundle.py` when shared model/UI/storage/docs paths warrant it.

### LDM2-02 review

The reviewer should verify:

- implementation stayed within B2 handle/relink robustness;
- browser handle semantics did not become a local-service media-read substitute;
- real learner/media/provider/account state was not mutated;
- no external/public/provider actions were introduced;
- focused tests match the edge cases claimed;
- commit/diff scope is exact and reviewable.

### LDM2-03 validation

Expected validation set unless the reviewed diff justifies narrowing:

- `git status --short --branch`.
- `git log --oneline --decorate -8`.
- `git diff --check`.
- Focused relevant vitest targets for changed B2 UI/model/storage paths.
- `npm run typecheck`.
- `npm run test:no-network`.
- `npm run scan:privacy`.
- `npm test` if shared model/UI/test infrastructure changed.
- `npm run build` if frontend/runtime paths changed.
- `python3 validate_final_bundle.py`.
- Final `git status --short --branch`.

The QA receipt should live under either `/home/openclaw/.hermes/artifacts/kanban/t_0c32ebbc/` or this worktree's `docs/plan/autonomous-batches/` area, and should include a SHA-256 hash in the task handoff.

## Final human-gate contract

`t_a2f08e9c` is the manual LDM2 B2 decision gate. It must not silently accept, push, PR, deploy, or authorize a new batch.

Expected final gate steps:

1. Read parent handoffs from LDM2-00 through LDM2-03 and this manifest.
2. Produce a concise final packet under `docs/plan/autonomous-batches/` with summary, commits, changed files, tests/validation, reviewer verdict, known limitations, safety/privacy boundary confirmation, deferred/non-authorized actions, and recommended options.
3. Add a Kanban comment with final packet path, SHA-256, and concise options.
4. Block the card with:
   `HUMAN-GATE: Lingotorte LDM2 B2 packet ready; choose accept, repair, authorize push/PR, or authorize next local batch`

Recommended options to present at that gate:

- `accept local only` — mark the local B2 batch accepted without push/PR/deploy.
- `repair` — create/route a focused repair chain for concrete blockers.
- `authorize push/PR` — only if Janusz explicitly chooses external delivery; still requires exact fresh preflight.
- `authorize next local batch` — keep local-only and materialize the next backlog slice behind the same non-authorizations.

## Handoff note for LDM2-01

The implementation task should treat this manifest as scope/authority context, not as permission to expand the batch. The highest-signal path is to make the existing B2 handle import/revalidation/relink behavior robust against stale or denied browser handles while keeping local-service jobs on explicit absolute owned-local paths.
