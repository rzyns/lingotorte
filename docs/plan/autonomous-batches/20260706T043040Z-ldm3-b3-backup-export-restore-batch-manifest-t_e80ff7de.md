# LDM3 B3 backup/export/restore polish batch manifest

Generated: `2026-07-06T04:30:40Z` (`2026-07-06T00:30:40-04:00`)
Preflight task: `t_e80ff7de`
Authorizing gate: `t_a2f08e9c`
Selected gate option: `accept local only + authorize next local batch: B3 backup/export/restore polish`
Workspace/worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
Branch: `lingotorte/m1-daily-driver-polish`
Preflight start HEAD: `d639a01280d9922c65d30828330bed30916ab60a`
Decision receipt: `docs/plan/autonomous-batches/20260706T042403Z-ldm2-gate-decision-t_a2f08e9c.md`
Decision receipt sha256: `1c89e1936d26e621a3ff2c966976a012f9557b378f8f6ace19d68d393f23b668`

## Artifact Navigation
Role: operational
Review scope: operational_relevance
Derived from:
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/plan/autonomous-batches/20260706T042403Z-ldm2-gate-decision-t_a2f08e9c.md
  -> human decision receipt accepting LDM2 locally and authorizing this LDM3 B3 local-only chain
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/PLAN.md
  -> current backlog and B3 scope/status
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/DECISIONS.md
  -> metadata-backup-first decision, export integrity semantics, and worker authority boundaries
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/PLAN-STATUS.md
  -> latest B3 status after B2/B3/B6 frontend merge and LDM2 B2 follow-up
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/dev/local-runbook.md
  -> current export/import runbook copy, local-service boundaries, and validation commands
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/review/safety-privacy-boundary-review.md
  -> binding safety, privacy, provider, media, export, and backup boundaries
Supported by:
- kanban task `t_a2f08e9c`
  -> completed human gate whose decision receipt authorized this local batch
- kanban task `t_e80ff7de`
  -> preflight/readback task that produced this manifest
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/plan/autonomous-batches/20260706T030826Z-ldm2-b2-handle-robustness-batch-manifest-t_ca7af335.md
  -> prior-batch manifest style and handoff pattern
Feeds:
- kanban task `t_c0c11262`
  -> frontend implementation of B3 backup/export/restore polish
- kanban task `t_8b46eb39`
  -> independent review of the B3 implementation
- kanban task `t_873ec00a`
  -> integration validation of the reviewed B3 implementation
- kanban task `t_4e92a00c`
  -> final human-gate packet and next decision
Verified by:
- `git status --short --branch` at preflight start
  -> clean worktree on the intended branch before this manifest was written
- source readback and hashes in this manifest
  -> confirms the current docs/code that define B3 scope and boundaries

## Preflight readback

Live workspace checks before writing this manifest:

- Worktree exists: yes.
- Git root: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`.
- Branch: `lingotorte/m1-daily-driver-polish`.
- HEAD before this manifest: `d639a01280d9922c65d30828330bed30916ab60a` (`Record LDM2 gate decision for B3 local batch`).
- `git status --short --branch`: clean (`## lingotorte/m1-daily-driver-polish`).
- Decision receipt hash matches the task body: yes, `1c89e1936d26e621a3ff2c966976a012f9557b378f8f6ace19d68d393f23b668`.

Source documents read for this preflight:

| Artifact | SHA-256 | Lines | Scope confirmation |
|---|---:|---:|---|
| `PLAN.md` | `a9b905a64982dd6797f1c5e278bc502e7c7dcf7f60b5b10728ef7204a1b5f7a1` | 302 | B3 is metadata backup/export/restore polish; current state already has browser JSON export/import, File System Access save/readback, and merge/update plus destructive Replace all confirmation. |
| `DECISIONS.md` | `6ba00b2be221f63c880cba3d2fd9d7b927bc853db07620cadd6bbdf8af0024cc` | 268 | B3 is metadata backup v1 first: JSON manifest, integrity, dry-run/readback restore, merge/replace semantics, and no media copy. Optional media-bundle backup is deferred. |
| `PLAN-STATUS.md` | `90b824687c63ba9bef1c2fb7fdc309709f48c2fb31686928777b5d1c5f6edbc2` | 106 | B3 remains partially done after prior frontend work: File System Access save path, replace vs merge UX, integrity verification, metadata-only default, and privacy warnings. |
| `docs/dev/local-runbook.md` | `640be2ed767b05a410039d0d9b1fe1358f79ed560eafaf79f7a6d907098d0156` | 278 | The runbook documents current Export / Import smoke, metadata-only export, save-file readback verification, and replace-all limitations. |
| `docs/review/safety-privacy-boundary-review.md` | `321dc7a148a389695f4627aaf74d509cc35d963ebfac6b683052de0f79381948` | 168 | Binding project boundaries require local/default metadata backup without media copies, privacy warnings, no provider/cloud/Anki/public mutation, and no destructive real-state restore tests. |
| `docs/plan/autonomous-batches/20260706T042403Z-ldm2-gate-decision-t_a2f08e9c.md` | `1c89e1936d26e621a3ff2c966976a012f9557b378f8f6ace19d68d393f23b668` | 53 | Janusz selected local acceptance of LDM2 and authorized this B3 backup/export/restore local-only chain with explicit non-authorizations. |
| `docs/plan/autonomous-batches/20260706T030826Z-ldm2-b2-handle-robustness-batch-manifest-t_ca7af335.md` | `b368e65e275891474892ff9adb3ec230f43e19eb9d5b705eb84d23ea6b6d3f49` | 171 | Prior manifest establishes the downstream chain/validation handoff shape used here. |

Targeted current-code readback for B3 baseline:

| Artifact | Lines inspected | Current behavior relevant to this batch |
|---|---:|---|
| `packages/storage/src/exportRestoreService.ts` | 160 | Export builds a learner manifest from saved items/occurrences, review cards/states/events, and practice attempts. Restore preview is dry-run; restore requires merge/update or replace confirmation; replace-all clears current learner metadata before importing manifest records. |
| `packages/domain/src/exportManifest.ts` | 675 | Manifest integrity uses `sha256-per-record` over learner records and source contexts; default warnings include timestamps, media paths, content hashes, unencrypted export file, and restore overwrite behavior. |
| `apps/web/src/app.ts` | 3482 | Export / Import UI advertises metadata backup v1, no media copy/cloud contact, generated manifest summary, File System Access save with write/readback verification, restore preview counts/operations/integrity, merge/update vs Replace all checkboxes, and warning acknowledgements. |
| `apps/web/src/model.ts` | 2730 | `exportLearnerState` stores manifest metadata and integrity status; `previewRestoreManifest` clears stale restore confirmations; `confirmRestore` performs restore then clears preview/last export and autosaves when enabled. |
| `tests/core/p6PracticeExport.test.ts` | 549 | Core tests cover privacy/integrity, round trip, merge without clearing unrelated records, preview dry-run, Replace all clearing isolated target learner state, mutual-exclusion validation, and tamper detection. |
| `tests/web/frontendUi.test.ts` | 759 | UI tests cover metadata-only export/restore copy, schema/integrity display, stale preview clearing, File System Access save/readback, and JSON backup-only copy. |

## Confirmed LDM3 B3 scope

This local batch is limited to B3 backup/export/restore polish for the existing local browser + loopback-service app. It should strengthen the current metadata-only JSON backup/restore product without expanding into media bundles, sync, providers, external app mutation, or real-state destructive testing.

In scope for LDM3 implementation:

1. **Metadata-only default export/backup clarity.** Keep the default export as local JSON metadata: learner state, cue text, notes, timestamps, review/practice history, content hashes, provider/export metadata where already modeled, and media references only. No default media file copy.
2. **Conflict preview and restore-mode clarity.** Make merge/update versus Replace all unmistakable in the preview and confirmation flow. Merge/update must preserve unrelated local learner records; Replace all must be labeled destructive and limited to local learner metadata replacement.
3. **Integrity verification clarity.** Preserve the distinction between semantic manifest integrity (`sha256-per-record` root hash/record count) and physical file write/readback verification. Do not overload `manifest_sha256` or `manifestIntegrityVerified` to mean browser-download/file persistence verification.
4. **User-visible restore status.** After restore, show an explicit local status/receipt rather than silently clearing the preview. The status should name the selected mode, integrity result, record/operation counts when available, warning acknowledgements, and the fact that media files were not copied/restored.
5. **Privacy warnings and acknowledgement UX.** Ensure privacy warnings remain prominent for cue text, learner notes, timestamps, review/practice history, local media references, content hashes, unencrypted files, and optional future media copies. Restores should require acknowledgement of the warnings actually present.
6. **Filename/path hygiene.** Keep export destination labels to safe filenames/labels, not private absolute paths. Browser downloads and File System Access saves may display filenames; committed docs/tests/fixtures must not include Janusz private media paths or generated/cache artifacts.
7. **Safe local test affordances.** Add/adjust tests using synthetic fixtures or isolated in-memory/temp stores only. Destructive Replace all tests must not run against Janusz's real learner state, local-service default DB, media library, browser profile, provider accounts, or external apps.
8. **Docs/status updates only when behavior changes.** If implementation changes user-visible behavior or validation expectations, update `PLAN.md`, `PLAN-STATUS.md`, and/or `docs/dev/local-runbook.md` exact-scope.

Out of scope for this batch unless a later human gate changes it:

- Media-copy backup, media bundle export, clip/snippet bundle export, or full media duplication.
- Cloud sync, remote backup, hosted sharing, account sync, AnkiConnect mutation, microphone/pronunciation capture, online translation/LLM explanation, or provider expansion.
- Automatic online download, private/account-gated media access, DRM/circumvention, browser credential/cookie/profile use, or Lingopie proprietary content/API use.
- Destructive Replace all tests or manual restore runs against Janusz's real learner state or default personal local-service database.
- Push, PR, release, public deployment, hosted exposure, package publication, public sharing, or remote mutation.
- Committing secrets, provider keys, raw provider request/response bodies, private media paths, generated media/audio/transcript scratch, model caches, browser profile data, or cache/private artifacts.

## Task chain and contracts

| Step | Task id | Assignee | Parent(s) | Contract |
|---|---:|---|---|---|
| LDM3-00 | `t_e80ff7de` | `default` | `t_a2f08e9c` | Preflight the batch, verify live docs/branch/clean state, write this manifest, commit exact-scope docs change. |
| LDM3-01 | `t_c0c11262` | `frontend-eng` | `t_e80ff7de` | Implement only B3 backup/export/restore polish within the scope above; use typed local state where practical, focused tests, docs/status updates if behavior changes, and an exact-scope local commit. |
| LDM3-02 | `t_8b46eb39` | `reviewer` | `t_c0c11262` | Independent read-only review. Return `PASS`, `BLOCK`, or `NEEDS HUMAN DECISION` with evidence, commands, boundary checks, and exact commit/diff scope. |
| LDM3-03 | `t_873ec00a` | `qa` | `t_8b46eb39` | Integration validation only. Record a durable receipt with exact commands, exit codes, concise output, receipt path/hash, clean status proof, and tracked-artifact/privacy check. |
| LDM3-04 | `t_4e92a00c` | `default` | `t_873ec00a` | Produce final human-readable packet under `docs/plan/autonomous-batches/`, comment path/hash/options, then block as the human gate rather than self-approving. |

## Validation expectations

### LDM3-01 implementation

Minimum expected checks, adjusted only by actual diff scope:

- `git status --short --branch` before and after implementation.
- `git diff --check`.
- Focused vitest targets covering changed B3 behavior, likely including `tests/core/p6PracticeExport.test.ts` and `tests/web/frontendUi.test.ts`.
- `npm run typecheck` for TypeScript/model/UI changes.
- `npm run test:no-network` to preserve provider-disabled/no-network behavior when export/import UI/model paths are touched.
- `npm run scan:privacy` when docs/UI/export wording or path handling changes.
- `npm test`, `npm run build`, and `python3 validate_final_bundle.py` when shared model/UI/storage/docs paths warrant broad validation.

### LDM3-02 review

The reviewer should verify:

- implementation stayed within metadata-only B3 backup/export/restore polish;
- conflict preview makes merge/update vs Replace all clear and does not hide destructive semantics;
- restore status is visible and truthful after confirmation;
- manifest integrity and file readback integrity remain distinct;
- filename/path hygiene avoids private absolute paths in committed artifacts and export metadata labels;
- privacy warnings remain visible and acknowledged;
- tests use synthetic/isolated local state only and do not mutate Janusz real learner/media/provider/account state;
- no external/public/provider/cloud/Anki/microphone/deploy/push actions were introduced.

### LDM3-03 validation

Expected validation set unless the reviewed diff justifies narrowing:

- `git status --short --branch`.
- `git log --oneline --decorate -8`.
- `git diff --check`.
- Focused B3 vitest targets for changed export/import UI/model/storage paths.
- `npm run typecheck`.
- `npm run test:no-network`.
- `npm run scan:privacy`.
- `npm test` if shared model/UI/test infrastructure changed.
- `npm run build` if frontend/runtime paths changed.
- `python3 validate_final_bundle.py` if docs/final-bundle-visible files changed.
- Final `git status --short --branch`.

The QA receipt should live under either `/home/openclaw/.hermes/artifacts/kanban/t_873ec00a/` or this worktree's `docs/plan/autonomous-batches/` area, and should include a SHA-256 hash in the task handoff.

## Final human-gate contract

`t_4e92a00c` is the manual LDM3 B3 decision gate. It must not silently accept, push, PR, deploy, or authorize a new batch.

Expected final gate steps:

1. Read parent handoffs from LDM3-00 through LDM3-03 and this manifest.
2. Produce a concise final packet under `docs/plan/autonomous-batches/` with summary, commits, changed files, tests/validation, reviewer verdict, known limitations, safety/privacy boundary confirmation, deferred/non-authorized actions, and recommended options.
3. Add a Kanban comment with final packet path, SHA-256, and concise options.
4. Block the card with:
   `HUMAN-GATE: Lingotorte LDM3 B3 packet ready; choose accept, repair, authorize push/PR, or authorize next local batch`

Recommended options to present at that gate:

- `accept local only` — mark the local B3 batch accepted without push/PR/deploy.
- `repair` — create/route a focused repair chain for concrete blockers.
- `authorize push/PR` — only if Janusz explicitly chooses external delivery; still requires exact fresh preflight.
- `authorize next local batch` — keep local-only and materialize the next backlog slice behind the same non-authorizations.

## Handoff note for LDM3-01

Treat this manifest as scope/authority context, not permission to expand B3 into sync/media bundles/provider work. The highest-signal implementation path is to make the already-present metadata-only export/restore product more legible and safer: clearer merge-vs-replace preview, explicit post-restore receipt/status, separate manifest vs file integrity wording, and tests that prove the destructive path only touches isolated learner metadata.
