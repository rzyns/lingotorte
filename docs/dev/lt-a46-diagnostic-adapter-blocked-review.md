# lt-c0r.6 — stopped adapter review

## Disposition

**BLOCKED.** Native and local-ledger adapters are implemented locally but have not passed acceptance or publication review. The three bounded source revisions are exhausted. No fourth code correction, native DLL/API call, launcher/helper, console event, prepare/live CLI, application/browser/database/provider/model/install or deployment is authorized by this disposition. Both existing diagnostic execution guards remain unchanged.

The five unreviewed adapter artifacts remain uncommitted in `.worktrees/lt-a46-diagnostic-adapters`. This report may be published as failure evidence; it does not approve or publish those artifacts. Primary `main` is unchanged.

## Confirmed failure

`LocalLedgerStore.append()` at `scripts/windows_shutdown_ledger.py:121` reads the status file a second time outside the uncertainty handler at lines 124–149. Failure there leaves the store healthy in memory and the status ready on disk. `AttemptLedger` poisons its own wrapper, but direct use or a new wrapper over the same store is not protected by that wrapper state.

Independent specification review `deleg_2a86dd62` found the gap. The parent reproduced it using real disposable files and an injected error on that exact second read:

- after failure: `uncertain=False`, status `R`, rows `[]`, writer lease present;
- a subsequent direct append was accepted, yielding rows `[1]`.

This proves an adapter-level retry-permission gap, **not duplicate native dispatch**. No process was dispatched in this probe. A later healthy-looking close can also release exclusion because uncertainty was never latched on this path.

Parent probe and the five exact adapter source/document copies are preserved at:

`C:/Users/jmdzi/AppData/Local/lingotorte/evidence-archives/lt-a46-diagnostic-adapters-2026-10-10-review-blocked`

Its `receipts-manifest.json` has **6 entries**, SHA-256:

`e4fef72cd73442cb4ca4b87c123579297f6435332ee5be85e9b5c0e3d5055a41`

The failing ledger source SHA-256 is:

`ff41c18633aaa342ab399bb726ae63a426eed8a806175d13984b4d6d2dc5fb35`

## Passing evidence and limits

The existing 61 tests per mode passed in normal and optimized isolated Python: 8 diagnostic, 26 recovery, 16 native-callback and 11 ledger tests. They do **not** cover this status-read failure. Native tests use ctypes callbacks, not actual Win32 APIs. Ledger tests use private disposable local files. The native adapter source review found no additional blocker within this source-only scope, not a native-runtime qualification.

Parent verified the final adapter manifest's 35 entries and SHA-256 `013d363cb76849c06c64d79cd9d42c705598601e9383a706d0abe0cfe45366a3`. The prior reviewed revision's 31 entries, historical upstream's 38 entries and all 417 bound original files remain unchanged. Earlier source revisions and receipts are preserved, not reset or relabeled as passes.

The local implementation evidence document predates this failed review; its broad fail-closed wording is not accepted. This stopped-review report and canonical blocked issue record govern the current disposition.

## Architectural review and proposed next scope

Read-only architectural review `deleg_1b40b124` identifies **fragmented failure ownership**, not a fundamentally unsound exclusive-lease approach within the private, cooperative same-machine contract.

If separately authorized, perform one bounded **offline ledger architecture/revision stage**:

1. Centralize store-owned filesystem operations under a checked-operation/abort boundary. Include every preflight read, persisted-state validation, commit, acknowledgement and close path; remove redundant status reads or protect them consistently.
2. Separate pure caller-argument rejection from filesystem uncertainty. Latch terminal store uncertainty before any fallible poison/cleanup step; preserve writer exclusion if durable poison itself fails.
3. Make direct calls, old/new wrappers and distinct store instances observe the same terminal store state. Close must never restore consumption permission after uncertainty.
4. Add site-and-occurrence fault tests for initialization, status/state reads, poison writes/fsync, temp writes/short writes/close, replacement, committed readback, acknowledgement and lease close/unlink. Include the exact second-read reproducer, direct retry, new-wrapper retry, failed-operation close, reopen and stale same-store callers.
5. Preserve healthy controls for sequential consumption, budget enforcement, ordinary argument rejection and sealed read-only reopening without resume. Produce behavioral red/green receipts and independent review.

No distributed database or hostile-filesystem redesign is recommended. Existing exclusions for adversarial writers, symlink replacement and unproved Windows directory/power-loss durability remain explicit. Native ABI/kernel behavior, separate-controller IPC/lifetime, exclusive console-host ownership and hard operation bounds are distinct unresolved gates. No fresh synthetic/native batch follows from this proposed ledger stage.

`lt-c0r.6`, `lt-c0r.4` and `lt-a46` remain blocked. The original inherited-ignore Ctrl+C hypothesis remains untested.
