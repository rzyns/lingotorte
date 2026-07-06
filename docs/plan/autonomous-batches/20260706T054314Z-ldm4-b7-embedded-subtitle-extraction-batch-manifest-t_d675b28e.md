# LDM4 B7 embedded subtitle extraction batch manifest

Generated: `2026-07-06T05:43:14Z` (`2026-07-06T01:43:14-04:00`)
Preflight task: `t_d675b28e`
Authorizing gate: `t_4e92a00c`
Selected gate option: `push branch, deploy locally, authorize next local batch: B7 embedded subtitle extraction`
Workspace/worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
Branch: `lingotorte/m1-daily-driver-polish`
Preflight start HEAD: `28c942afad23d017a2592ad08d15b558b974decd`
Decision receipt: `docs/plan/autonomous-batches/20260706T053847Z-ldm3-b3-gate-decision-push-deploy-next-t_4e92a00c.md`
Decision receipt sha256: `aa4882cfa4943f9ed3fae1b4759643cedfc6351034a7422e94b7c2364a62c8dc`

## Artifact Navigation
Role: operational
Review scope: operational_relevance
Derived from:
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/plan/autonomous-batches/20260706T053847Z-ldm3-b3-gate-decision-push-deploy-next-t_4e92a00c.md
  -> human decision receipt accepting LDM3 B3, pushing/deploying the reviewed branch locally, and authorizing this LDM4 B7 local-only chain
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/PLAN.md
  -> current backlog and B7 status/scope
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/DECISIONS.md
  -> section 9 embedded subtitle extraction decision and worker authority boundaries
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/PLAN-STATUS.md
  -> latest B7 status after prior subtitle parsing/alignment work and LDM3 B3 acceptance
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/dev/local-runbook.md
  -> current local-service, ASR, ffmpeg, no-network, and validation runbook
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/review/safety-privacy-boundary-review.md
  -> binding safety, privacy, media, provider, export, and backup boundaries
Supported by:
- kanban task `t_4e92a00c`
  -> completed human gate whose decision receipt authorized this local batch
- kanban task `t_d675b28e`
  -> preflight/readback task that produced this manifest
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/plan/autonomous-batches/20260706T043040Z-ldm3-b3-backup-export-restore-batch-manifest-t_e80ff7de.md
  -> prior-batch manifest style and handoff pattern
Feeds:
- kanban task `t_0f17aafd`
  -> implementation of B7 embedded subtitle listing and explicit extraction
- kanban task `t_eb8fe5ad`
  -> independent review of the B7 implementation
- kanban task `t_07c307df`
  -> integration validation of the reviewed B7 implementation
- kanban task `t_305e7cc5`
  -> final human-gate packet and next decision
Verified by:
- `git status --short --branch` at preflight start
  -> clean worktree on the intended branch before this manifest was written
- source readback and hashes in this manifest
  -> confirms the current docs/code that define B7 scope and boundaries

## Preflight readback

Live workspace checks before writing this manifest:

- Worktree exists: yes.
- Git root: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`.
- Branch: `lingotorte/m1-daily-driver-polish`.
- HEAD before this manifest: `28c942afad23d017a2592ad08d15b558b974decd`.
- `git status --short --branch`: clean, tracking `origin/lingotorte/m1-daily-driver-polish` with no dirty entries.
- Decision receipt hash matches the task body: yes, `aa4882cfa4943f9ed3fae1b4759643cedfc6351034a7422e94b7c2364a62c8dc`.

Source documents read for this preflight:

| Artifact | SHA-256 | Lines | Scope confirmation |
|---|---:|---:|---|
| `PLAN.md` | `a9b905a64982dd6797f1c5e278bc502e7c7dcf7f60b5b10728ef7204a1b5f7a1` | 302 | B7 is mostly complete for VTT/ASS parsing and offset/alignment tooling; embedded subtitle extraction via `ffmpeg`/`ffprobe` remains outstanding. |
| `DECISIONS.md` | `6ba00b2be221f63c880cba3d2fd9d7b927bc853db07620cadd6bbdf8af0024cc` | 268 | Section 9 decides local-service `ffprobe` track listing first, explicit user-selected `ffmpeg` extraction second, owned/local absolute media paths only, draft/imported transcript tracks with provenance, no styling persistence by default, and no DRM/circumvention. |
| `PLAN-STATUS.md` | `270aedddba81358385bfabcc9d8a47f9e5a17681f0b8f77a349bc45387b1e71a` | 106 | B7 remains mostly complete after swarm v1; only embedded subtitle extraction via `ffmpeg`/`ffprobe` is still outstanding. |
| `docs/dev/local-runbook.md` | `8ad9f4cb3e22cdc725ee04f79db4b2fc4170ca5e8f029ac50f57fd2517e9014d` | 278 | The runbook documents loopback local service operation, absolute owned local media paths for local-service ASR/ffmpeg/ffprobe work, local ffmpeg/faster-whisper receipts, no-network validation, and synthetic/offline smoke posture. |
| `docs/review/safety-privacy-boundary-review.md` | `321dc7a148a389695f4627aaf74d509cc35d963ebfac6b683052de0f79381948` | 168 | Binding project boundaries require owned/local media only, no DRM/protected-stream capture, provider-disabled defaults, draft/untrusted generated tracks until correction/approval, local/privacy warnings, and redacted logs. |
| `docs/plan/autonomous-batches/20260706T053847Z-ldm3-b3-gate-decision-push-deploy-next-t_4e92a00c.md` | `aa4882cfa4943f9ed3fae1b4759643cedfc6351034a7422e94b7c2364a62c8dc` | 127 | Janusz accepted/pushed/deployed LDM3 B3 and authorized this next local-only B7 embedded subtitle extraction chain. |
| `docs/plan/autonomous-batches/20260706T043040Z-ldm3-b3-backup-export-restore-batch-manifest-t_e80ff7de.md` | `2bdc8f23c396e83596a053f18cd8f5aa07565d31ff577af3a9b0a9595188903a` | 185 | Prior manifest establishes the downstream chain/validation handoff shape used here. |

Targeted current-code readback for the B7 baseline:

| Artifact | SHA-256 | Lines | Current behavior relevant to this batch |
|---|---:|---:|---|
| `packages/subtitles/src/import.ts` | `c6ebb511ad4ca62443eaabf1d2ac38e5658f686cdc825a0c00c249e793a3630c` | 501 | Imports SRT, VTT, ASS/SSA, and JSON subtitle/transcript files. ASS/SSA parsing strips override tags and line breaks, persists cue text/timing/content hashes/source provenance, and does not persist style/position fields. |
| `packages/local-transcription/src/index.ts` | `56275298492b02b3ba027bfe8478464fa10a5f1fe86d0f964cda931e2f1e68c0` | 446 | Existing command-runner seam validates absolute paths and wraps `ffmpeg` for audio extraction plus local/online ASR adapters; this is the natural place to add reusable `ffprobe`/subtitle-extraction command helpers or a sibling package seam. |
| `apps/local-service/src/server.ts` | `efde10bc912e99d03000c32080acaaf0867dd4bf004efdda8be7c9a545f7b24a` | 774 | Local-service jobs currently support `local-transcription`, `elevenlabs-scribe`, and `youtube-caption`, with absolute `mediaPath` validation and redacted path/secret summaries. No embedded-subtitle listing/extraction job kind exists yet. |
| `apps/web/src/model.ts` | `77b1678bd00f2a501ea84e0a5d27da04456505cc18a509a76585c9f9891b23e3` | 2751 | Model already supports transcript draft/correction/approval states and offset-corrected transcript versions with `timingUnverified` provenance. Embedded extraction should feed this lifecycle rather than bypass it. |
| `apps/web/src/app.ts` | `ae6cc9d4f4310870cbf62b964f01c7daf5b68b215b4aa142284b76bdbb553aac` | 3548 | UI already exposes local-service and transcript-lifecycle controls. Embedded extraction will need explicit track listing/selection UX if implementation includes browser wiring; browser handles/blob URLs remain playback-only and must not be treated as service-readable paths. |
| `tests/core/b7SubtitleRobustness.test.ts` | `a255aa76f1152fac1221f3ffa62cbb8bb8e54ab027afca2f295b86cd4a0f95e5` | 217 | Existing B7 tests cover ASS parsing, malformed ASS rejection, offset correction, status preservation, and timing-unverified provenance; new embedded-extraction tests should extend this coverage rather than regress it. |
| `tests/core/localService.test.ts` | `8bf1098bd74a06f59bfc885b7bfc26969d17c12066e17518099e9df57df7e4c7` | 476 | Local-service tests use injected command runners/fake HTTP clients and assert private local paths are not echoed. New ffprobe/ffmpeg jobs should follow the same fake-runner and redaction pattern. |
| `tests/core/localTranscriptionPipeline.test.ts` | `2d310fb3ea70d0861a4c83bf18b95af059a214cedda4d115c3fa38502e529e98` | 403 | Command-adapter tests already prove ffmpeg command shape, absolute-path validation, no network, and lazy dependency boundaries; embedded extraction should add similarly typed command-shape tests. |

## Confirmed LDM4 B7 scope

This local batch is limited to embedded subtitle extraction for owned/local media inside the existing browser + loopback local-service app. It should complete the outstanding B7 gap by adding safe local-service `ffprobe` listing and explicit user-selected `ffmpeg` extraction without expanding into media download, provider calls, protected streams, sync, Anki, microphone, or public delivery.

In scope for LDM4 implementation:

1. **Typed embedded subtitle track listing.** Add a local-service path that invokes `ffprobe` against an explicit absolute owned/local media path and returns a redacted, typed list of embedded subtitle/text streams. The list should include enough metadata for human selection, such as stream index, codec/container format, language, title/name when available, disposition/default flags when available, and any safe extraction constraints. Do not include cue text in listing results.
2. **Explicit extraction request.** Add a second operation that extracts one user-selected embedded subtitle stream with `ffmpeg` into a service scratch path, then imports/parses the extracted subtitle through the existing subtitle import pipeline when the format is supported.
3. **Draft/imported transcript semantics.** Extracted tracks must become draft/imported transcript tracks with provenance and warning flags as appropriate. They must not silently become the approved/default source for learner saves until the existing correction/approval path approves them.
4. **Text/timing/provenance persistence.** Persist extracted subtitle cue text, cue timings, content hashes, source kind/provenance, container/stream metadata needed for traceability, and transcript status. Do not persist ASS/SSA style/position fields unless a concrete product use case is separately approved.
5. **Absolute local path boundary.** Browser `blob:` URLs and `browser-file-handle:<name>` labels remain playback/relink identity only. The local service must require an explicit absolute owned/local media path it can read for `ffprobe` and `ffmpeg`.
6. **Redacted status/logs.** Job summaries, errors, UI status, tests, and committed fixtures must redact private local paths and must not commit media files, extracted subtitle scratch, raw provider payloads, model caches, browser profile data, or private/generated artifacts.
7. **Synthetic/fakeable validation.** Automated tests should use injected command runners and synthetic subtitle text/fixtures. If an integration smoke uses real `ffmpeg`/`ffprobe`, it should generate a temporary synthetic local media container under `/tmp` and remove it afterward; do not search Janusz media folders or use private media.
8. **Docs/status updates only when behavior changes.** If implementation changes user-visible local-service/API/UI behavior or validation expectations, update `PLAN.md`, `PLAN-STATUS.md`, `docs/dev/local-runbook.md`, and/or README exact-scope.

Out of scope for this batch unless a later human gate changes it:

- Online media download, `yt-dlp` execution, public/private account media retrieval, private/account-gated sources, cookies, browser credential/profile access, protected stream capture, DRM/circumvention, or source-site ToS/account-risky automation.
- Provider calls, online translation/LLM/dictionary/pronunciation scoring, new provider classes, cloud sync, AnkiConnect mutation, microphone/learner voice capture, public sharing, hosted exposure, release, package publication, PR, push, or deploy.
- Media-copy backup/export bundles, source-media snippet generation, real owned-media ASR benchmarking, desktop/PWA packaging, or B8 future lanes.
- Treating extracted embedded subtitle text as trusted learning truth before correction/approval.
- Persisting styling/position/karaoke effects as product data without a concrete approved use case.
- Committing secrets, provider keys, raw provider payloads, private local media paths, generated media/audio/transcript scratch artifacts, model caches, browser profile data, or cache/private artifacts.

## Task chain and contracts

| Step | Task id | Assignee | Parent(s) | Contract |
|---|---:|---|---|---|
| LDM4-00 | `t_d675b28e` | `default` | `t_4e92a00c` | Preflight the batch, verify live docs/branch/clean state, write this manifest, commit exact-scope docs change. |
| LDM4-01 | `t_0f17aafd` | `backend-eng` | `t_d675b28e` | Implement only B7 embedded subtitle listing/extraction within the scope above; prefer typed local-service/command-adapter seams, fakeable tests, path redaction, docs/status updates if behavior changes, and an exact-scope local commit. If full UI work becomes non-trivial, create a focused `frontend-eng` child rather than burying UI expansion in backend scope. |
| LDM4-02 | `t_eb8fe5ad` | `reviewer` | `t_0f17aafd` | Independent read-only review. Return `PASS`, `BLOCK`, or `NEEDS HUMAN DECISION` with evidence, commands, boundary checks, and exact commit/diff scope. |
| LDM4-03 | `t_07c307df` | `qa` | `t_eb8fe5ad` | Integration validation only. Record a durable receipt with exact commands, exit codes, concise output, receipt path/hash, clean status proof, and tracked-artifact/privacy check. |
| LDM4-04 | `t_305e7cc5` | `default` | `t_07c307df` | Produce final human-readable packet under `docs/plan/autonomous-batches/`, comment path/hash/options, then block as the human gate rather than self-approving. |

## Validation expectations

### LDM4-01 implementation

Minimum expected checks, adjusted only by actual diff scope:

- `git status --short --branch` before and after implementation.
- `git diff --check`.
- Focused tests for new embedded subtitle command/API behavior, likely a new `tests/core/b7EmbeddedSubtitleExtraction.test.ts` plus relevant existing targets:
  - `tests/core/b7SubtitleRobustness.test.ts`
  - `tests/core/localService.test.ts`
  - `tests/core/localTranscriptionPipeline.test.ts`
- Fake-runner tests proving `ffprobe`/`ffmpeg` command shape, explicit stream selection, absolute-path validation, output scratch separation, and no private path echo in job summaries/errors.
- Parser/import tests proving extracted SRT/VTT/ASS flows preserve cue text/timing/provenance while extracted tracks remain draft/imported until correction/approval.
- `npm run typecheck` for TypeScript/model/service/UI changes.
- `npm run test:no-network` to preserve provider-disabled/no-network behavior.
- `npm run scan:privacy` for path/log/status/docs changes.
- `npm test`, `npm run build`, and `python3 validate_final_bundle.py` when shared model/UI/storage/docs paths warrant broad validation.
- Optional real-tool smoke only with generated synthetic media under `/tmp`, cleaned up afterward, and only if `ffprobe`/`ffmpeg` are already available; absence of a real private media sample should not block this slice.

### LDM4-02 review

The reviewer should verify:

- implementation stayed within B7 embedded subtitle extraction and did not expand into downloads, providers, sync, Anki, microphone, packaging, push, PR, release, or deploy;
- `ffprobe` listing is local-service/absolute-owned-path only, typed, redacted, and does not expose cue text or private paths;
- extraction requires explicit user-selected stream/index and cannot silently extract all tracks or auto-approve a study source;
- extracted tracks preserve draft/correction/approval semantics and source/provenance metadata;
- ASS/SSA style/position/karaoke fields are not persisted as product data;
- command execution is behind injectable seams and tests use fake runners/synthetic fixtures rather than Janusz real media;
- errors/status/job summaries redact private paths, scratch dirs, DB paths, and secrets;
- no new external network or provider paths are introduced.

### LDM4-03 validation

Expected validation set unless the reviewed diff justifies narrowing:

- `git status --short --branch`.
- `git log --oneline --decorate -8`.
- `git diff --check`.
- Focused B7 embedded subtitle extraction tests and existing B7/local-service/local-transcription tests.
- `npm run typecheck`.
- `npm run test:no-network`.
- `npm run scan:privacy`.
- `npm test` if shared service/model/UI/test infrastructure changed.
- `npm run build` if frontend/runtime paths changed.
- `python3 validate_final_bundle.py` if docs/final-bundle-visible files changed.
- Final `git status --short --branch`.

The QA receipt should live under either `/home/openclaw/.hermes/artifacts/kanban/t_07c307df/` or this worktree's `docs/plan/autonomous-batches/` area, and should include a SHA-256 hash in the task handoff.

## Final human-gate contract

`t_305e7cc5` is the manual LDM4 B7 decision gate. It must not silently accept, push, PR, deploy, or authorize a new batch.

Expected final gate steps:

1. Read parent handoffs from LDM4-00 through LDM4-03 and this manifest.
2. Produce a concise final packet under `docs/plan/autonomous-batches/` with summary, commits, changed files, tests/validation, reviewer verdict, known limitations, safety/privacy boundary confirmation, deferred/non-authorized actions, and recommended options.
3. Add a Kanban comment with final packet path, SHA-256, and concise options.
4. Block the card with:
   `HUMAN-GATE: Lingotorte LDM4 B7 packet ready; choose accept, repair, authorize push/PR/deploy, or authorize next local batch`

Recommended options to present at that gate:

- `accept local only` — mark the local B7 batch accepted without push/PR/deploy.
- `repair` — create/route a focused repair chain for concrete blockers.
- `authorize push/PR/deploy` — only if Janusz explicitly chooses external/local-service delivery; still requires exact fresh preflight.
- `authorize next local batch` — keep local-only and materialize the next backlog slice behind the same non-authorizations.

## Handoff note for LDM4-01

Treat this manifest as scope/authority context, not permission to expand B7 into download/provider/media-library work. The highest-signal implementation path is a narrow local-service/command-adapter slice: list embedded subtitle streams with `ffprobe`, let the user explicitly choose one stream, extract it with `ffmpeg` into scratch, import supported extracted subtitle text through the existing subtitle pipeline, mark the result draft/imported with provenance, and keep all private paths and scratch artifacts out of committed logs/docs/fixtures.
