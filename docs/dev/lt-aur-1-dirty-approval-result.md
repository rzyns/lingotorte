# lt-aur.1 — dirty transcript approval repair (offline synthetic)

Status: implemented candidate with Docker contributor-lane synthetic evidence. Awaiting independent parent review. No commit, push, merge, Beads mutation or deployment.

## Cause and correction

Base: branch `work/lt-aur1-dirty-approval` at `d63eaeb` (main `7acb49d` + two docs commits). Before the fix, `approveTranscriptTrack` approved any existing track. The Approve button only checked `transcriptStatus === 'approved'`, so pending cue text, cue timing and word text/timing edits could be approved without being applied. A successful Apply cleared all pending dictionaries, including edits made while Apply was still running. Apply also silently dropped cues with empty text. A rejected word edit was validated only after the corrected track and cues had been written, which left a partial `correcting` track selected. Split, merge and offset actions discarded pending edits.

The correction follows block → Apply → inspect → Approve:

- `model.ts`
  - New `hasDirtyTranscriptEdits(model, trackId)` compares pending values with the persisted cue text/boundaries and word text/boundaries of the selected track. Reverted values count as clean. Entries that do not belong to the track and non-numeric (NaN) values fail closed.
  - New `transcriptCorrectionPending`: an in-flight counter wraps corrected and structural version creation, including offset, split and merge.
  - New `transcriptApprovalBlockReason`.
  - `approveTranscriptTrack` now throws while edits are dirty or a correction is pending. Direct model callers therefore cannot bypass the guard.
  - `createCorrectedTranscriptVersion` validates every word edit before any store write.
- `app.ts`
  - Adds a persistent accessible gate note (`.transcript-approval-gate`, `role=status`, `aria-live`).
  - Approve, split, merge and offset are disabled while blocked and refreshed in place on input, without rerendering. This keeps focus and values.
  - Each handler rechecks the guard. Approve is bound to the panel's rendered track id: a stale handler for a no-longer-selected track does nothing.
  - Apply no longer filters out empty cues, so they fail visibly and stay pending. It is disabled while pending.
  - On success, Apply consumes only the submitted values. Newer edits are kept and re-keyed onto the new version's cue/word ids, so approval stays blocked.

No storage, backend, schema or dependency changes. No new harness.

Changed paths: `apps/web/src/model.ts`, `apps/web/src/app.ts`, `tests/web/dirtyTranscriptApproval.test.ts` (new), `docs/dev/lt-aur-1-dirty-approval-result.md` (new), `docs/dev/lt-aur-1-offline-lane-discovery.md` (lane note).

## Red / green per test (`tests/web/dirtyTranscriptApproval.test.ts`, 27 tests)

Red: the new test file was copied alone into a detached scratch worktree of `d63eaeb` (original source), image `lingotorte:lt-aur1-red` `sha256:0d5820c3bb83f4d7050f2fd62fe15e49a039913388ede1f126981e3a95595f1c` (since removed). Result: **18 failed, 9 passed**, exit 1. Every failure was a product assertion; there were no setup or import failures. Green on the candidate: **27 passed**, exit 0.

| Test | Red (original) | Green |
| --- | --- | --- |
| direct: refuses approval while {cueText, cueStart, cueEnd, wordText, wordStart, wordEnd} dirty (6) | FAIL ×6 — `expected [Function] to throw` (approved silently) | pass |
| direct: permits approval after each field reverted (6) | pass ×6 (non-discriminating controls) | pass |
| direct: clean track still approves | pass (control) | pass |
| UI: Approve button + handler blocked per field, with visible explanation (6) | FAIL ×6 — button enabled (`expected false to be true`) | pass |
| UI: re-enables after revert, explicit approve | FAIL — button not disabled while dirty | pass |
| Apply → inspect → Approve: immutable child, displayed = persisted = approved, parent unchanged | pass (existing happy path already correct) | pass |
| failed Apply with empty cue text stays unresolved, not approvable | FAIL — no error raised: empty cue filtered out and Apply "succeeded" | pass |
| rejected word edit leaves no partial version selected/approvable | FAIL — `targetTrackId` switched to partial corrected track | pass |
| stale Apply: newer edit retained and blocks approval | FAIL — approval allowed while Apply pending | pass |
| stale Approve handler for unselected track does not approve | FAIL — `expected 'approved' to be 'draft'` | pass |
| split/merge blocked while dirty, edits not discarded | FAIL — split enabled | pass |
| V1 saved anchors unchanged/valid; correcting V2 save rejected | pass (already held; preserved) | pass |

## Final integrated candidate (supersedes the implementer image below)

Implementation commit `ea5f6ee` was merged with main `c12780d`, giving `cb4c0fc`. That main merge brings in lt-7lq, lt-3f1 and the shared import-wait de-flake. The candidate branch itself does not modify `tests/web/frontendUi.test.ts`. Image `lingotorte:lt-aur1-cand` = `sha256:b25ac24fc39044bc53b10b4b4f8e7247c157d8c89b2c03c86039bad7860a47e2`. Every run used `--network none`.

| Command | Result |
| --- | --- |
| `vitest run` (full), 6 consecutive runs | 1313 passed, 1 skipped (pre-existing `privateDelivery`); 6/6 exit 0 |
| `tsc --noEmit` | exit 0 |
| `vite build --config vite.config.ts` | exit 0 |
| `vitest run tests/no-network` | exit 0 |
| `scripts/check-privacy-boundaries.mjs` | exit 0 |

| Path (at `cb4c0fc`) | SHA256 |
| --- | --- |
| `apps/web/src/model.ts` | `d529f1e909e098b5b321a091c6377d51f96c4041d83b9c70c8344dad7549b2ee` |
| `apps/web/src/app.ts` | `5944541dffd04fe7abc91cc950e534f835b1fd2d06ef2f6313851b1de438d9e2` |
| `tests/web/dirtyTranscriptApproval.test.ts` | `5a79409f520bf65c8164d8be4fa18c5573ded061fcc74497945f17cb43f70b2a` |
| `tests/web/frontendUi.test.ts` (from main `c12780d`, not changed by this branch) | `edd0fcc73222224aab90f8dff9c9703ca19c41bd5970649cd91e1d4be53a1565` |

The flake below is **resolved**. The failing frontendUi import tests waited a fixed 10 zero-delay ticks for an import that awaits File reads and a WebCrypto digest. Under full-suite load that wait was not always long enough. The same failure was reproduced on an lt-2t4 tree that did not contain this candidate (1 of 8 full runs, `expected undefined to be 'owned-clip'`), so it is not a product regression from this change. Main `c12780d` replaced all five fixed-tick import waits with a bounded `vi.waitFor` (5 s) and changed no assertions. Main plus that fix passed 6/6 full runs. The merged candidate above passed 6/6.

## Implementer candidate (historical, pre-sync)

Candidate image `lingotorte:lt-aur1-cand`: `sha256:f4af74960f96be908e233b7eb4508ebb7174a38af7713c1e476b0b173586a980`. It was built with `docker build -q --target contributor` from this worktree, using the existing pinned Node Dockerfile and lockfile. Every run used `docker run --rm --init --network none`. There were no host mounts, published ports or host npm install.

| Command (in candidate) | Result |
| --- | --- |
| `vitest run tests/web/dirtyTranscriptApproval.test.ts` | 27 passed, exit 0 |
| `vitest run` (full) | 1276 passed, 1 skipped (pre-existing `privateDelivery`), exit 0 on 4 of 6 runs; see flake note |
| `vitest run --exclude tests/web/dirtyTranscriptApproval.test.ts` | 1249 passed / 1 skipped ×3, exit 0 (matches baseline) |
| `tsc --noEmit` | exit 0 |
| `vite build --config vite.config.ts` | exit 0, 35 modules |
| `vitest run tests/no-network` | 5 passed, 2 files, exit 0 |
| `scripts/check-privacy-boundaries.mjs` | `ok: true`, exit 0 |
| `git diff --check` (host) | exit 0 |

**Flake note (resolved; see the final integrated candidate above):** `tests/web/frontendUi.test.ts > imports browser-selected local media…` failed 2 of 6 full candidate runs with `currentMedia undefined`. That test waits a fixed 10 zero-delay ticks.

- Results by configuration:
  - The test passed in isolation 3/3 on both candidate and original.
  - It passed in all 3 full runs on original source with the new test file present.
  - It passed in 3/3 full candidate runs excluding the new test file.
- Interpretation: the evidence suggests load or ordering sensitivity in that test's fixed tick budget when 27 extra JSDOM tests run in parallel. A product regression has not been ruled out, because the sample is small.
- The candidate branch did not modify the test; the shared de-flake landed on main `c12780d`.

Parent investigation identified the fixed-tick wait as the cause (see above).

SHA256 of changed or new files:

| Path | SHA256 |
| --- | --- |
| `apps/web/src/model.ts` | `a85f12e4aaa13311d52e61e60800bc56f3eec2b9973cca32f51ee3f1510e7152` |
| `apps/web/src/app.ts` | `2390b020324db05d166d9ead0f2c532ae2f9ea0b88991f5ac753a0f5a07d2d0b` |
| `tests/web/dirtyTranscriptApproval.test.ts` | `5a79409f520bf65c8164d8be4fa18c5573ded061fcc74497945f17cb43f70b2a` |

Logs are in the Hermes scratch directory `lt-aur1/`: `red-build.log`, `red-tests.log`, `red-full-{1..3}.log`, `green-build.log`, `green-regression.log`, `qualification.log`, `full-{2..6}.log`, `cand-excl-{1..3}.log`, `frontendUi-*.log`. The red worktree was removed with `git worktree remove --force`.

## Lane statement and limitations

Execution used the Docker contributor image, network-isolated. The user authorized this lane, and it is recorded in Beads on 2026-10-12. The evidence is synthetic Linux-container Vitest/JSDOM component evidence only. It does **not** certify Windows startup/shutdown, native SQLite, Edge or any real browser, integration, deployment, or completion of the original `lt-13i`, which retains its `lt-13v` prerequisite and the integrated real-UI journey annotation.

Known limits:

- Pending numbers are compared exactly; no normalization policy was introduced.
- Cue text is compared before normalization, so a whitespace-only change counts as dirty. This is fail-closed.
- Re-keying retained edits relies on positional correspondence between parent and child cues, which holds for text/timing Apply.
- Independent review is outstanding.

## Post-review integration (quality APPROVED `deleg_0340f914`)

Quality reviewer note 4 was applied before merge. The new test's polling helper and its post-Apply wait use a bounded `vi.waitFor` (5 s) instead of fixed zero-delay ticks, and the split negative check uses a 20 ms settle. No assertion changed. Main `93838c1` (lt-0g9) was merged in cleanly. Image `sha256:5fb6cb28f07abbfc9e0b32ac2c8c6125fa6de0e45d9cacd8c02d4bd9c0a03060`, `--network none`:

- Full suite, 3/3 runs: 1323 passed, 1 skipped (pre-existing).
- Focused suite: 27/27 passed.
- tsc, build, no-network and privacy checks: all exit 0.

SHA256:

- `apps/web/src/model.ts` `99db165e4a56b5ecd795760b1754fea7abaece14c3b8181d91f207426be6521a`
- `apps/web/src/app.ts` `5c0486393e4c681bf13d8a9c4c223a3d3f6ed43456fcd42120afe9488579186a`
- `tests/web/dirtyTranscriptApproval.test.ts` `92fdcf7623a7b8555f693dbdf10efb26a29717a7b07936a1fd27b082ef1caa0d`

Remaining non-blocking follow-ups:

- Use a direct reference for the Apply button in `refreshApprovalGate`.
- Replace the `JSON.stringify` edit comparison with a field-wise compare.
- Add a comment on the positional re-key.
- Word-edit input does not call `markUnsavedBrowserEdits` (pre-existing; confirm).
- Pull the block-reason strings out as constants.
