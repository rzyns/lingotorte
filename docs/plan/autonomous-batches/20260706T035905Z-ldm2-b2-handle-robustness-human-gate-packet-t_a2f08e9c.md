# LDM2 B2 handle-robustness human gate packet

Generated: `2026-07-06T03:59:05Z` (`2026-07-05T23:59:05-04:00`)
Gate task: `t_a2f08e9c`
Workspace/worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
Branch: `lingotorte/m1-daily-driver-polish`
Current implementation HEAD reviewed/validated: `c22af7e`

## Artifact Navigation
Role: summary
Review scope: summary_integrity
Derived from:
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/plan/autonomous-batches/20260706T025725Z-lingotorte-next-local-batch-decision-t_bc700d35.md
  -> human-gate decision receipt that authorized this local-only LDM2 B2 batch
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/plan/autonomous-batches/20260706T030826Z-ldm2-b2-handle-robustness-batch-manifest-t_ca7af335.md
  -> preflight manifest defining B2 handle/relink scope and final gate contract
- /home/openclaw/.hermes/artifacts/kanban/t_0c32ebbc/validation-receipt.md
  -> QA validation receipt for the reviewed implementation
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/PLAN.md
  -> current backlog/status and B2/B4/B3 sequencing
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/DECISIONS.md
  -> split browser-handle/local-service path model and authority boundaries
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/PLAN-STATUS.md
  -> current B2 completion status and remaining backlog
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/dev/local-runbook.md
  -> local run/runbook behavior and known limitations
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/review/safety-privacy-boundary-review.md
  -> binding safety/privacy/legal boundary review
Supported by:
- kanban task `t_ca7af335`
  -> LDM2-00 preflight + batch manifest, completed with clean worktree and exact-scope docs commit
- kanban task `t_e600b01a`
  -> LDM2-01 implementation, committed B2 handle-store/relink robustness at `c22af7e`
- kanban task `t_dfceb95e`
  -> LDM2-02 independent review PASS with non-blocking findings only
- kanban task `t_0c32ebbc`
  -> LDM2-03 QA validation PASS with all requested gates clean
Feeds:
- kanban task `t_a2f08e9c`
  -> human gate for accept/repair/push-PR/next-local-batch decision
Verified by:
- `git status --short --branch --untracked-files=all`
  -> clean before this packet was written, at `c22af7e`
- post-write `git diff --check`, `python3 validate_final_bundle.py`, file hash, and exact-scope local commit
  -> to be recorded in the Kanban comment after this packet is committed/hashed

## Summary

LDM2 B2 is ready for Janusz's next human decision. The batch implemented the previously authorized local-only B2 robustness slice: browser File System Access handles are now persisted in a real IndexedDB-backed store, installed at web app startup, revalidated on local-service hydration, and restored into transient object URLs when permission is granted. The player now has clearer relink/error states for missing, stale, denied, unavailable, and object-URL-failure cases, while preserving the local-service rule that ASR/ffmpeg/ffprobe/snippets still require an explicit absolute owned-local media path.

The implementation was independently reviewed and integration validated. Reviewer verdict: `PASS`. QA verdict: `PASS`. No push, PR, release, deploy, public exposure, real learner/media/provider/account mutation, protected/private media access, online download, cloud sync, AnkiConnect, microphone/provider expansion, or private/generated/cache artifact commit was authorized or performed.

## Commits

| Commit | Source task | Purpose |
|---|---|---|
| `1ebb329ec6cbca008ae2b1781997a95c8874f1c6` | `t_bc700d35` | Recorded the human selection `authorize next local batch` and materialized the LDM2 B2 task chain. |
| `063814fbc29dd0d45b100517060eaa4ad11f6062` | `t_ca7af335` | Recorded the LDM2 B2 preflight/batch manifest. |
| `c22af7e` | `t_e600b01a` | Implemented IndexedDB browser handle storage and stale-handle/relink robustness. |

This packet itself is a gate artifact for `t_a2f08e9c`; it does not add runtime behavior. Its file hash and any local packet commit are recorded in the Kanban comment for this gate.

## Changed files

Implementation commit `c22af7e` changed:

- `apps/web/src/browserHandleStore.ts` — new real IndexedDB-backed browser FileSystemHandle store with typed availability/error behavior.
- `apps/web/src/main.ts` — installs the browser handle store during app startup.
- `apps/web/src/model.ts` — hardens handle restoration/relink state around permission, missing/stale handle, store unavailable, object URL creation, and local-service hydration.
- `apps/web/src/app.ts` — improves relink placeholder/copy and preserves the local-service absolute-path boundary in the UI.
- `tests/web/frontendUi.test.ts` — focused coverage for restored handles and stale/denied/missing/unavailable relink states.
- `docs/dev/local-runbook.md` — documents the new B2 handle/relink behavior and known limitations.
- `PLAN.md` — updates B2 status to implemented for IndexedDB-backed handles/relink robustness.
- `PLAN-STATUS.md` — updates short-backlog status to mark B2 implemented and shifts next-path notes.

Preflight/gate docs added before implementation:

- `docs/plan/autonomous-batches/20260706T025725Z-lingotorte-next-local-batch-decision-t_bc700d35.md`
- `docs/plan/autonomous-batches/20260706T030826Z-ldm2-b2-handle-robustness-batch-manifest-t_ca7af335.md`

## Tests and validation

Implementation worker `t_e600b01a` reported all gates passing at `c22af7e`:

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0, TypeScript passed with 0 errors |
| `npm test -- --run tests/web/frontendUi.test.ts` | exit 0, 24 passed; implementation handoff says 19 existing + 5 new |
| `npm test -- --run` | exit 0, 25 files / 206 passed / 4 skipped |
| `npm run test:no-network` | exit 0, 2 files / 5 passed |
| `npm run build` | exit 0, Vite build passed |
| `npm run scan:privacy` | exit 0, `ok: true`, 44 scanned files |
| `python3 validate_final_bundle.py` | exit 0, `errors: []`, required 16, manifest 16, markdown files 1183 |
| `git diff --check` | exit 0, clean |
| cached credential keyword probe | no credential material found; only expected non-authorization prose matched |

Independent review `t_dfceb95e` reproduced and inspected the relevant evidence and returned `PASS`:

- confirmed the diff stayed within B2 handle/relink scope;
- confirmed `DECISIONS.md` section 2 split-model boundary remained intact: browser handles are playback/relink identity only, while service-side jobs still require explicit absolute owned paths;
- confirmed no real learner/media/provider/account mutation or external/public/provider action;
- confirmed focused tests cover the claimed stale/denied/restored/missing/unavailable behavior;
- recorded only three non-blocking minor findings: commit-message wording says 5 focused tests while 4 were new plus 1 existing, no dedicated test for the rare `URL.createObjectURL` unavailable branch, and no trailing newline in two source files.

QA validation `t_0c32ebbc` returned `PASS` with receipt `/home/openclaw/.hermes/artifacts/kanban/t_0c32ebbc/validation-receipt.md`:

| Gate | QA result |
|---|---|
| `git status --short --branch` | clean worktree on `lingotorte/m1-daily-driver-polish` |
| `git log --oneline --decorate -8` | `c22af7e` HEAD visible with seven prior commits |
| `git diff --check` | clean |
| `npm run typecheck` | exit 0, 0 errors |
| `npm run test:no-network` | exit 0, 2 files / 5 passed |
| `npm run scan:privacy` | exit 0, `ok:true`, 44 scanned files |
| focused frontend test | exit 0, 24 passed |
| full test suite | exit 0, 25 files / 206 passed / 4 skipped |
| `npm run build` | exit 0, Vite build passed, 198KB JS / 15KB CSS |
| `python3 validate_final_bundle.py` | exit 0, `errors: []`, required 16, manifest 16, markdown files 1183 |
| final `git status --short --branch` | still clean |

## Safety/privacy boundary confirmation

The B2 implementation preserves the authoritative boundaries in `DECISIONS.md` and `docs/review/safety-privacy-boundary-review.md`:

- Browser handles are persisted only for local playback/relink identity; they are not treated as a service-readable native path.
- Local-service ASR, ffmpeg/ffprobe, embedded subtitle extraction, source-media snippets, and future heavyweight local processing still require an explicit absolute owned-local media path.
- The new persistence path stores browser FileSystemHandles in browser IndexedDB and uses transient object URLs for playback; it does not upload, copy, download, or publish media.
- The relink path is user-mediated and degrades to a visible prompt/error state when permissions are denied or handles are stale/unavailable.
- Providers remain disabled by default; no provider expansion, cloud sync, AnkiConnect mutation, microphone capture, public sharing, or external account mutation was added.
- No secrets, raw provider payloads, private media paths, generated media/audio/transcript scratch artifacts, or model caches are intentionally committed.

## Known limitations and qualifications

- IndexedDB/browser FileSystemHandle storage degrades gracefully to relink affordances when IndexedDB or File System Access APIs are unavailable, such as private browsing or unsupported browsers.
- Handle restoration occurs after local-service state hydration via `connectLocalService()`; this batch does not auto-connect to the local service on cold reload.
- Plain file-input imports still use session-scoped `blob:` URLs and require choosing media again after reload.
- Browser handles remain playback/relink identity only. Users still need the absolute local media path for local-service ASR/ffmpeg/ffprobe/snippets.
- No browser/manual smoke was run in the headless worker environment; coverage is via vitest/jsdom plus full test/build/privacy gates.
- The independent reviewer recorded the `URL.createObjectURL` unavailable branch as an untested rare defensive branch, but not a blocker.

## Deferred and non-authorized actions

Still not authorized by this batch or packet:

- push, PR, release, hosted deployment, public exposure, package publication, or public sharing;
- destructive changes to Janusz's real learner state, media library, provider accounts, browser profiles, or external apps;
- DRM/circumvention, protected-stream capture, credential/cookie/browser-profile use, private/account-gated media access, or automatic online media download;
- cloud sync, AnkiConnect mutation, microphone/learner voice capture, online translation/LLM/dictionary/provider expansion, or provider classes beyond the explicit `DECISIONS.md` allow-list;
- B4 real owned-media ASR quality benchmarking unless Janusz supplies an exact owned media path or explicit local selection rule;
- B3 destructive replace-all restore against real learner state without fresh exact approval;
- B6 source-media snippet generation, B7 embedded subtitle extraction, B8 Anki/microphone/sync/packaging lanes, and any Tauri/Electron/PWA packaging.

## Recommended options

1. `accept local only` — accept the LDM2 B2 local batch as complete on the local branch. No push/PR/deploy/public sharing is implied.
2. `repair` — route a focused repair only if Janusz wants one of the non-blocking qualifications addressed, e.g. add the rare `URL.createObjectURL` unavailable test, fix trailing newlines, adjust commit-message/docs wording, or add a browser smoke receipt.
3. `authorize push/PR` — authorize external delivery only after a fresh exact preflight checks branch state, remote drift, secret/privacy scan, and repo policy. This packet does not grant that authority by itself.
4. `authorize next local batch` — keep work local-only and materialize the next backlog slice behind the same non-authorizations. The likely next decision is either B4 owned-media ASR benchmark if Janusz provides an exact owned clip path/selection rule, or B3 backup/export/restore polish if no B4 media input is available.

## Suggested human-gate wording

`HUMAN-GATE: Lingotorte LDM2 B2 packet ready; choose accept, repair, authorize push/PR, or authorize next local batch`
