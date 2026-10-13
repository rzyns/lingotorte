# lt-n31 — relink existing media identity (result)

Base: `main` 401dd22, branch `work/lt-n31-relink`. Status: automated gates green; real-browser gate **SKIPPED (open)**. Uncommitted.

## Identity decision table

| Selected file vs. existing assets | Behaviour |
|---|---|
| Same content fingerprint (`contentSha256`), same name | Relink existing `MediaAsset`: same media ID, no new asset; existing tracks/cues untouched; target/native selection kept (previous selection if still valid, else active/first track of that role); saved occurrences/review cards unchanged. |
| Same fingerprint, **different name** (decision c) | Same as above. Content identity wins over name; title is kept. A persistent handle updates `originalPath` to the new handle label. A plain-input reselect keeps the stored label unless that label was a dead `blob:` URL. |
| Same name, **different fingerprint** | Refused with `BrowserMediaNameConflictError` before any object URL or store write. UI shows "…same name as existing media but different content. Nothing was changed." with **Import as new media** (`onNameConflict: 'import-new'` creates a separate asset; old asset and anchors are left alone) or **Cancel** ("Import cancelled. Existing media was not changed."). |
| New name, new fingerprint | Normal new import (unchanged). |
| Identical subtitles supplied on relink | Matched by role + text SHA-256; no duplicate track or cues. Different subtitles are *added* as a new track beside the existing ones and selected; existing tracks are never replaced. |
| Stored handle, file content changed on disk | `restoreBrowserMediaHandle` hashes the file. On a mismatch it returns false with permission state `error` and a "changed content … Nothing was relinked" message, and creates no object URL. |
| Stored handle, permission denied/prompt | Unchanged pre-existing behaviour: fails safe, `getFile` is not called, state is visible in the relink placeholder. |
| No `showOpenFilePicker` (plain-HTTP LAN) | "Choose media again" sets an error. The relink placeholder now **renders** `importError` (previously it was set but not shown on the player view). |

## Cause
`importBrowserLocalFiles` always called `makeMediaAsset` (new UUID) and re-parsed subtitles (new track/cue IDs). Reselecting the same file therefore created a duplicate asset and orphaned the track selection. There was no name/content conflict check, and handle restore never checked the fingerprint.

## Correction
- `apps/web/src/model.ts`: compute the fingerprint first; `relinkExistingBrowserMedia`; `BrowserMediaNameConflictError` plus an `onNameConflict` option, also threaded through `importBrowserLocalFileHandles`; fingerprint check in `restoreBrowserMediaHandle` (only when the stored hash is a valid `sha256:<64 hex>`).
- `apps/web/src/app.ts`: conflict choice box (Library and relink placeholder); error banner in the relink placeholder.
- No schema change, no new dependencies, no existing tests changed.

## Red/green (`tests/web/lt-n31Relink.test.ts`)
Red was run on a detached scratch worktree at HEAD with only the new test copied in (image `lingotorte:lt-n31-red`, removed afterwards).

| Test | Red (401dd22) | Green |
|---|---|---|
| (a,e) plain-input same-content relink keeps IDs/tracks/occurrences/review cards | ✗ new asset ID | ✓ |
| (a) identical media+subs → no duplicate tracks/cues | ✗ | ✓ |
| (b) same name/different content refused, then import-new is separate | ✗ no error | ✓ |
| (b) UI Import-as-new/Cancel; Cancel leaves data unchanged | ✗ no box | ✓ |
| (c) renamed identical file relinks | ✗ | ✓ |
| (a) handle reselection keeps ID, updates label | ✗ | ✓ |
| (d) stored handle with changed content fails safe | ✗ relinked | ✓ |
| (d) denied permission fails safe | ✓ (pre-existing guard; regression lock) | ✓ |
| (d) no-picker origin shows visible error | ✗ not rendered | ✓ |
| exports conflict error type | ✗ | ✓ |

## Commands (image `lingotorte:lt-n31-cand`, `sha256:e5f8c531d7ad6d8ad93163cc502b915213fd60eca2b0d522417dd31b4914568c`; checks other than `git diff --check` ran with `--network none`)

| Command | Result |
|---|---|
| `vitest run tests/web/lt-n31Relink.test.ts` | 10/10 passed |
| `vitest run` (full) | 58 files passed / 1 skipped; 1296 passed / 1 skipped, exit 0 (baseline 1286/1, +10 new) |
| `tsc --noEmit` | exit 0 |
| `vite build --config vite.config.ts` | exit 0 |
| `vitest run tests/no-network` | 5 passed |
| `node scripts/check-privacy-boundaries.mjs` | exit 0 |
| `git diff --check` | exit 0 |

## SHA-256 of changed files
- `apps/web/src/model.ts` 015d0de329d61fc8679534f8a983346ff2393caeae4c77a92d837eb2fccacbd2
- `apps/web/src/app.ts` 45253d3f25c89301d8b9f862d930947b997bd576a798d341add1e9c0d25bfe8b
- `tests/web/lt-n31Relink.test.ts` a1995423d1a5eda4ffcf3a3e0cdb472fb519fec5f41908fe1f441f2ba6203132

(These hashes were taken before this document was written.)

## Real-browser gate — SKIPPED (open)
The runbook allows the pairing capability to be retrieved only in a private interactive controlling terminal and pasted by hand. The agent's tools capture all output, so retrieving it safely is impossible here. No preview was started, so no compose project was created and there is nothing to tear down. Still needed: a human-run synthetic import → save → restart the api container → re-pair → reselect the same file → confirm IDs/tracks are retained, and observation of Chromium handle-permission prompts.

## Limitations
- Fingerprinting reads the whole file into memory (as the existing import already did).
- Name matching uses the handle name when the asset is handle-sourced; otherwise it compares the title derived from the file name. Plain-input assets with `blob:` labels are therefore matched by title.
- The conflict choice for the persistent-handle import retries with the last picked handle. The pending choice is held in module state (not persisted) and is cleared by any successful import.
- `restoreBrowserMediaHandle` skips the fingerprint check for legacy/non-canonical hash values.

## Post-review integration (spec PASS `deleg_350f445c`, quality APPROVED `deleg_5a9e6411`)

Two quality notes were applied before merge:

- The conflict prompt uses `role="alert"` with ordinary inline buttons instead of an unnamed, unfocused `alertdialog`.
- The `originalPath` precedence is now explicitly parenthesized. Behaviour is unchanged.

Main `0506110` (lt-0g9 and lt-aur.1) merged in cleanly, giving `d1de526`. Image `sha256:adaa676f266b30572ac64538845f96a31a0e6162d6d781a20677884ae5825b34`, `--network none`:

- Full suite, 3/3 runs: 1333 passed, 1 skipped (pre-existing).
- tsc, build, no-network and privacy checks: all exit 0.

**Issue closure remains open.** The acceptance clause "isolated real-browser restart/permission evidence" has not been executed.
