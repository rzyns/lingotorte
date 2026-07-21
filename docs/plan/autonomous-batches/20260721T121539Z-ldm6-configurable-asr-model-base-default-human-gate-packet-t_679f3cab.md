# LDM6 configurable ASR model (`base` default) human-gate packet

Generated: `2026-07-21T12:15:39Z` (`2026-07-21T08:15:39-04:00`)
Gate task: `t_679f3cab`
Branch: `lingotorte/m1-daily-driver-polish`
Workspace/worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
Pre-packet HEAD: `9f92d52247dd209ffed2e3ea8537c7d416c90587`
Tracking snapshot before this packet: `origin/lingotorte/m1-daily-driver-polish`, local branch ahead 3 and behind 0

## Decision headline

LDM6 is ready for a human decision. The local service now owns a bounded, configurable ASR model default, with `base` as the missing/blank/invalid configuration fallback and `tiny` retained as an explicit smoke/fallback override. The browser omits its normal model override so it does not duplicate the service default.

Independent review returned **PASS** and QA returned **PASS** at exact tested HEAD `9f92d52247dd209ffed2e3ea8537c7d416c90587`. Recommended posture: `accept local only` if the local-only behavior and limitations below are satisfactory. This packet does not itself accept, push, open a PR, deploy, restart, release, publish, run a real model, or authorize another batch.

## Evidence navigation and exact SHAs

- Manifest: `docs/plan/autonomous-batches/20260721T113944Z-ldm6-configurable-asr-model-base-default-batch-manifest-t_1b8ea424.md`
  - SHA-256: `85081733e499785ded98292a71f784ced1d6a9b842992b4644fb5e941fa37ab1`
  - Commit: `40ca7d45c4cf9cd366c3c4a1c61484013aa50862`
  - Kanban: `t_1b8ea424`
- Implementation: Kanban `t_56b91753`
  - Code/test commit: `195743dd00322ca927103f14bda9e656d8115475`
  - Documentation/tested-HEAD commit: `9f92d52247dd209ffed2e3ea8537c7d416c90587`
- Independent review: Kanban `t_300286cc`, **PASS** at `9f92d52247dd209ffed2e3ea8537c7d416c90587`.
  - Read-only stage; no review commit was created.
- QA: Kanban `t_86394367`, **PASS** at `9f92d52247dd209ffed2e3ea8537c7d416c90587`.
  - Read-only stage; no QA commit was created.
  - Receipt: `/home/openclaw/.hermes/artifacts/kanban/t_86394367/RECEIPT.md`
  - Receipt SHA-256: `1e7dc344685bcfe16eb1d49f82623cf0f9bfabea7687745a1e0b46a07acec11d`

The review and QA stages created no Git commits. Their exact reviewed/tested commit is recorded rather than inventing review or QA SHAs.

## Scope and changed files

The implementation and documentation commits changed seven paths:

- `apps/local-service/src/server.ts`
- `apps/web/src/app.ts`
- `apps/web/src/model.ts`
- `tests/core/localService.test.ts`
- `tests/web/p7TranscriptLifecycleFrontend.test.ts`
- `docs/dev/local-runbook.md`
- `PLAN-STATUS.md`

The pre-packet local delta from unchanged tracking HEAD `d4b39df29f15d030ca003965e83451d9791d3198` additionally contains the manifest above: eight files, 512 insertions and 19 deletions across commits `40ca7d4`, `195743d`, and `9f92d52`.

## Implemented behavior and evidence

- `LINGOTORTE_ASR_MODEL` accepts only `tiny`, `base`, `small`, `medium`, or `large-v3`.
- Missing or trim-empty configuration resolves to `base` without warning; unsupported configuration resolves to `base` with one deterministic warning that does not echo the raw rejected value.
- The loopback service is the single normal default authority. The browser omits `modelName` for normal local-ASR generation, while an intentional provider-level explicit override still serializes.
- `/api/status.config.defaultAsrModelName`, queued summaries, and fake-runner handoff use the same normalized effective model while existing local-path redaction remains intact.
- An unsupported explicit job model is rejected with HTTP 400 before job insertion or runner dispatch, without echoing the rejected input or private media path.
- Configuration and status resolution are bookkeeping only: they do not invoke Python, ffmpeg, faster-whisper, WhisperX, Hugging Face, a provider, the network, a model/cache probe, or a model download.
- Tests use synthetic values, test-owned temporary directories, and injected fake runners only. They cover missing/blank/all-allowed/invalid env input, default `base`, injected `small`, explicit `tiny`, pre-run rejection, status/summary/runner agreement, browser omission, and explicit browser override.

## Review and QA verdicts

| Stage | Verdict | Exact scope | Outcome |
|---|---|---|---|
| Independent review `t_300286cc` | **PASS** | `195743d` + `9f92d52`; tested HEAD `9f92d52` | Source, changed-range, commit, privacy/redaction, browser-authority, fake-test, no-download, Node 26.5 strip-only, and Git-hygiene checks matched the manifest. No findings. |
| QA `t_86394367` | **PASS** | reviewed HEAD `9f92d52` | All 13 contract gates passed; independent source/test readback supported the manifest; clean pre/post worktree. |

No BLOCK/repair/re-review route was required for LDM6.

## Validation results

QA recorded these results at reviewed HEAD `9f92d52`, all exit 0:

| Gate | Result |
|---|---|
| `git status --porcelain=v1 -uall --branch` | clean before and after; ahead 3, behind 0 |
| `git diff --check` | clean |
| `npm run typecheck` | 0 errors |
| focused local-service + frontend tests | 17/17 passed (11 core + 6 frontend) |
| `npm run test:no-network` | 5/5 passed across 2 files |
| `npm run scan:privacy` | `ok=true`, 45 files scanned |
| full `npm test` | 246/246 passed across 27 files |
| `npm run build` | Vite build passed; 31 modules |
| Node syntax check and dynamic import | passed on installed Node `v26.5.0` |
| `python3 validate_final_bundle.py` | `errors=[]`; required 16, manifest 16, Markdown 1198 |

Independent review separately replayed the same focused/full/privacy/no-network/build/bundle/Node gates at the same HEAD and returned MechanicalVerdict **PASS** and SubstantiveVerdict **SUPPORTED**.

## Known limitations and deferred gates

- No model picker, model availability/cache probe, runtime failure auto-fallback, performance-based switching, GPU/device/VAD tuning, or new quality benchmark was added.
- Allowed values beyond `base` are configuration choices, not newly benchmarked or recommended daily defaults.
- No real-model, real-media, real-ffmpeg, faster-whisper, or WhisperX smoke was run. Any such run requires a separate bounded task with explicit authorization, owned-media scope, model/download policy, and cleanup evidence.
- Generated transcripts remain draft-only; transcript approval, learner state, storage schema, exports/backups, providers, and online features are unchanged.
- The service remains loopback-only. This packet does not assert hosted or multi-user hardening.

## Human decision options

Choose one or combine only where explicitly intended:

1. `accept local only` — recommended. Accept LDM6 on the local branch only; no push, PR, deploy, or next batch is implied.
2. `repair` — route a bounded repair for a concrete concern, followed by fresh independent review and QA.
3. `authorize push` — permit a fresh remote/status/divergence/diff/secret/privacy preflight and exact-scope branch push. This is not PR, merge, release, or deploy authority.
4. `authorize PR` — permit a fresh base/remote/diff/secret/privacy preflight and PR creation. This is not merge authority.
5. `deploy locally` — permit fresh loopback service/web preflight, local rollout or restart, and health/status/functional verification. This is not hosted/public deployment and does not authorize a model download or real-model smoke unless explicitly added.
6. `authorize next local batch` — keep work local and materialize the next explicitly selected backlog slice while preserving all unrelated gates.

## Non-authorizations preserved

Unless Janusz explicitly selects the corresponding option, this packet preserves:

- no push, PR, merge, release, package publication, public sharing, or hosted deployment;
- no local deploy, service restart, or runtime enablement;
- no model download/load, cache scan, live ASR/ffmpeg/WhisperX run, Hugging Face/network access, provider call, or benchmark rerun;
- no protected/private media access, account/browser credential use, automatic online download, or DRM/circumvention;
- no destructive real learner, media, provider, account, browser-profile, or model-cache mutation;
- no committing private/generated/cache/model/media/provider artifacts;
- no authorization of another local batch.

## Packet hash note

The packet SHA-256 and packet commit are intentionally not embedded here to avoid self-reference. The Kanban comment on `t_679f3cab` records the final path, SHA-256, exact-scope commit, validation, and decision options.
