# LDM7 B7 embedded-subtitle browser UI human-gate packet

Generated: `2026-07-21T17:22:14Z` (`2026-07-21T13:22:14-04:00`)
Gate task: `t_8d8f9d6e`
Branch: `lingotorte/m1-daily-driver-polish`
Workspace/worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
Pre-packet HEAD: `781e626951ba606121e7c4271607cc8c896484a0`
Tracking snapshot before this packet: `origin/lingotorte/m1-daily-driver-polish`, local branch ahead 5 and behind 0

## Decision headline

The repaired LDM7 B7 browser-UI slice is ready for a human decision. It adds an explicit, local-only browser workflow for listing embedded subtitle tracks, selecting a supported track, extracting normalized cues through the existing loopback job surface, and importing a fresh target-language draft under the existing correction/approval and learner-save gates.

The original independent review and first re-review both returned **BLOCK** on stale asynchronous state mutations and an evidence gap. Two bounded repairs landed; the fresh final re-review returned **PASS / SUPPORTED**, and QA returned **PASS** at exact tested HEAD `781e626951ba606121e7c4271607cc8c896484a0`. Recommended posture: `accept local only` if the limitations below are satisfactory. This packet does not itself accept, push, open a PR, deploy, restart, release, publish, run real media tools, or authorize another batch.

## Evidence navigation and exact SHAs

- Manifest: `docs/plan/autonomous-batches/20260721T130119Z-ldm7-b7-embedded-subtitle-browser-ui-batch-manifest-t_296c3b4f.md`
  - SHA-256: `4a929d6353ea95b6b1317328b25797d937d688996261f7f6ed91d2b7f4767b0b`
  - Commit: `3b51c0d0de9048e002d2d18e99fc7d23f40c307e`
  - Kanban: `t_296c3b4f`
- Initial implementation: Kanban `t_7532544d`
  - Code/test commit: `16c9bec23b07b2eced43430d7d2ba9c70f807abd`
  - Documentation commit: `bd6a762d57a06070f8076b75be951309b183752b`
- Original independent review: Kanban `t_4dc1a93f`, **BLOCK** at `bd6a762d57a06070f8076b75be951309b183752b`.
- First repair: Kanban `t_8399d066`, commit `c595d198f43464d50196a1197bf01085a8c592ed`.
- First fresh re-review: Kanban `t_e12c62a5`, **BLOCK** at `c595d198f43464d50196a1197bf01085a8c592ed`.
- Second repair: Kanban `t_8a89d6d8`, commit `781e626951ba606121e7c4271607cc8c896484a0`.
- Final fresh re-review: Kanban `t_583ea1c9`, **PASS** at `781e626951ba606121e7c4271607cc8c896484a0`.
  - MechanicalVerdict: **PASS**; SubstantiveVerdict: **SUPPORTED**; recommendation: `ACCEPT_AS_EVIDENCED_COMPLETION` for the local review scope.
  - Read-only stage; no review commit was created.
- QA: Kanban `t_e42c53ae`, **PASS** at `781e626951ba606121e7c4271607cc8c896484a0`.
  - Read-only stage; no QA commit was created.
  - Receipt: `/home/openclaw/.hermes/artifacts/kanban/t_e42c53ae/receipt.md`
  - Live SHA-256 at gate preparation: `0eff93c8b794c22f4e04cc9aef8691d9c20b9c0ae56042c793d524cf163e4927`

The review and QA stages created no Git commits. Their exact reviewed/tested commit is recorded rather than inventing review or QA SHAs.

## Scope and changed files

The implementation, documentation, and repair commits changed nine paths:

- `PLAN-STATUS.md`
- `PLAN.md`
- `apps/local-service/src/server.ts`
- `apps/web/src/app.ts`
- `apps/web/src/model.ts`
- `apps/web/src/uiTypes.ts`
- `docs/dev/local-runbook.md`
- `tests/core/b7EmbeddedSubtitleExtraction.test.ts`
- `tests/web/b7EmbeddedSubtitleFrontend.test.ts`

The exact pre-packet local delta from unchanged tracking HEAD `ae2e953c0045d7c67334060c9154fd89f678afe9` additionally contains the manifest above: ten paths, 1,483 insertions and 11 deletions across commits `3b51c0d`, `16c9bec`, `bd6a762`, `c595d19`, and `781e626`.

## Implemented behavior and evidence

- The Transcript lifecycle panel uses a dedicated session-only media-path field and rejects missing, relative, tilde-only, browser blob/handle, and HTTP labels before fetch; it does not substitute playback identity or discover files.
- Listing uses the existing `embedded-subtitle-list` loopback job, strictly decodes safe metadata, renders supported and unsupported tracks, handles unreachable/empty/failure states, and never auto-selects or auto-extracts a default track.
- Extraction requires deliberate selection of a supported track and an editable non-empty language. The typed selection determines stream index and deterministic output format; the request role is fixed to `target`.
- The existing `embedded-subtitle-extract` completion now returns normalized cue index/timing/text plus safe track/extract metadata. It does not return source media paths, service scratch paths, stderr, style/position/karaoke data, provider data, or service filesystem ids.
- The browser reconstructs fresh ids under the current media, imports a `draft` `user-subtitle-file` target track with opaque `embedded-subtitle:` provenance and required warnings, and fails closed on empty/malformed cues, non-draft status, stream/format mismatch, or missing warnings.
- Imported drafts remain blocked from learner-save use until the existing correction/approval workflow approves that exact track. No approval bypass or destructive learner-state replacement was added.
- Browser-visible failures are path-redacted. Fake coverage includes an echoed synthetic private-path sentinel and proves it is absent from UI state; private service/media paths are also absent from persisted/exported state.
- The two review-driven repairs bind both successful and failed in-flight list/extract jobs to request generation, initiating path, current media, selected stream, and supported-track context. Superseded jobs cannot mutate newer UI or transcript state.
- Automated validation used fake fetch and injected fake command runners only. No real ffmpeg/ffprobe, media, provider, model, network, or learner-state action occurred.

## Review, repair, and QA verdicts

| Stage | Verdict | Exact scope | Outcome |
|---|---|---|---|
| Original review `t_4dc1a93f` | **BLOCK** | `bd6a762` | Reproduced stale successful listing state after a path change and found required fake-only matrix gaps. Acceptance was denied and a repair/re-review route was created. |
| First repair `t_8399d066` | complete | `c595d19`; three files | Added per-operation generations/context guards, stale success suppression, and the missing fake-only contract cases. |
| First re-review `t_e12c62a5` | **BLOCK** | `c595d19` | Reproduced stale failed list/extract jobs overwriting current state and found the listing redaction assertion vacuous. QA remained deferred. |
| Second repair `t_8a89d6d8` | complete | `781e626`; two files | Guarded catch paths before mutation, preserved the dedicated stale-operation error, added deterministic stale-failure regressions, and made listing redaction non-vacuous. |
| Final re-review `t_583ea1c9` | **PASS / SUPPORTED** | `781e626` | Source inspection, deterministic tests, and an independent four-scenario same-context concurrency probe confirmed old list/extract success and failure cannot mutate newer state. Full gates passed. |
| QA `t_e42c53ae` | **PASS** | reviewed HEAD `781e626` | All 13 contract gates passed with a clean pre/post worktree and fake/synthetic fixtures only. |

The final re-review supersedes both earlier BLOCK verdicts for acceptance. The original findings and repairs remain visible in this packet and the Kanban audit trail; they are not laundered into an unexplained PASS.

## Validation results

QA recorded these results at reviewed HEAD `781e626`, all exit 0:

| Gate | Result |
|---|---|
| `git status --porcelain=v1 -uall --branch` | clean before and after; ahead 5, behind 0; HEAD unchanged |
| `git diff --check` | clean |
| `npm run typecheck` | 0 errors |
| focused B7/P7 tests | 3 files / 55 tests passed: B7 browser 26, P7 lifecycle 6, B7 service extraction 23 |
| `npm run test:no-network` | 2 files / 5 tests passed |
| `npm run scan:privacy` | `ok=true`, 45 files scanned |
| full `npm test` | 28 files / 272 tests passed |
| `npm run build` | Vite 8.0.16 production build passed |
| pinned Node syntax check and dynamic import | passed on `/home/linuxbrew/.linuxbrew/opt/node/bin/node` `v26.5.0` |
| `python3 validate_final_bundle.py` | `errors=[]`; required 16, manifest 16, Markdown 1201 |

The final reviewer independently replayed the same focused/full/privacy/no-network/build/bundle/Node gates and ran a four-scenario concurrency probe covering superseded list/extract success and failure. All four probe scenarios passed.

## Known limitations and evidence note

- This slice imports only the target transcript role. Native/other-role selection, dual-track alignment, and a role picker remain deferred.
- Bitmap subtitle OCR/conversion, automatic language detection, style/position/karaoke preservation, and automatic/default/all-track extraction remain out of scope.
- Paths remain explicit and session-only: no filesystem picker, path persistence/history, discovery, folder scanning, or blob/handle-to-path conversion was added.
- No live owned-media or real ffmpeg/ffprobe smoke was run. Any such smoke requires a separate bounded task with an explicitly approved owned media path and cleanup plan.
- The local service remains loopback-only; this packet does not assert hosted or multi-user hardening.
- The final re-review briefly entered a capability-blocked posture because the reviewer misread tool visibility. Its already-posted authoritative PASS comment was reconciled to terminal `done`; this was a process/tooling incident, not a code-review finding.
- The QA receipt's embedded hash and completion metadata report `5a4edbb466023cd52139230626fb659edb76a584a30c14e0abce277f3b2e0bf8`, but live hashing of the final receipt bytes during gate preparation produced `0eff93c8b794c22f4e04cc9aef8691d9c20b9c0ae56042c793d524cf163e4927`. This packet records the live final-byte hash as a detached reference and does not treat the stale embedded/self-referential value as current. The receipt content, tested HEAD, command table, and QA verdict otherwise match the Kanban handoff.

## Human decision options

Choose one or combine only where explicitly intended:

1. `accept local only` — recommended. Accept repaired LDM7 B7 on the local branch only; no push, PR, deploy, or next batch is implied.
2. `repair` — route a bounded repair for a concrete concern, including receipt-provenance hygiene if a separately regenerated QA artifact is desired, followed by any review/QA depth the repair requires.
3. `authorize push` — permit a fresh remote/status/divergence/diff/secret/privacy preflight and exact-scope branch push. This is not PR, merge, release, or deploy authority.
4. `authorize PR` — permit a fresh base/remote/diff/secret/privacy preflight and PR creation. This is not merge authority.
5. `deploy locally` — permit fresh loopback service/web preflight, dependency-delta check, local rollout or restart, and health/status/functional browser verification. This is not hosted/public deployment and does not authorize private media selection or a real-tool smoke unless explicitly added.
6. `authorize next local batch` — keep work local and materialize the next explicitly selected backlog slice while preserving all unrelated gates.

## Non-authorizations preserved

Unless Janusz explicitly selects the corresponding option, this packet preserves:

- no push, PR, merge, release, package publication, public sharing, or hosted deployment;
- no local deploy, service restart, runtime enablement, or public/non-loopback exposure;
- no real ffmpeg/ffprobe execution, owned/private media access, folder scanning, automatic online download, account/browser credential use, or DRM/circumvention;
- no model download/load/cache scan, provider call, online translation/LLM use, microphone/voice capture, cloud sync, or external-app mutation;
- no destructive real learner, media, provider, account, browser-profile, or model-cache mutation;
- no committing private/generated/cache/model/media/provider artifacts;
- no authorization of another local batch.

## Packet hash note

The packet SHA-256 and packet commit are intentionally not embedded here to avoid self-reference. The Kanban comment on `t_8d8f9d6e` records the final path, SHA-256, exact-scope commit, validation, and decision options.
