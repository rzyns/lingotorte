# lt-c0r.5: offline diagnostic recovery contracts

## Scope and disposition

**Offline injected-contract evidence only. Native execution remains unconditionally blocked.** No diagnostic `prepare`, `execute`, or `controller` CLI was executed. No launcher, helper, synthetic listener, console-event batch, application/browser/SQLite, provider, model, install, or deployment work occurred. Parent owns Beads, commits, pushes and independent review; this work does not renew any attempt allowance or claim live qualification.

Worktree: `.worktrees/lt-a46-diagnostic-offline`, branch `work/lt-a46-diagnostic-offline`, base `9709cb9f00e260818c3ec7fa198d590f0c2bdb09`.

Both native entry functions retain `raise RuntimeError(LIVE_EXECUTION_BLOCK)` as their first statement. The CLI routes to those same guards regardless of optimization flags. Optimized prepare CLI is now explicitly rejected instead of depending on an optimized-away assertion. Prepare was not exercised.

The historical duplicated, unreachable controller and batch implementation was removed from current source, not from the historical archive. Guarded functions retain delegation to the exact same `controller_injected`/`execute_injected` seams exercised by tests. These call the sibling `windows_shutdown_recovery.py`; no native adapter is supplied. This is a reusable injected state machine, not an independently uncalled demonstration helper.

## Four defects and repairs

| Reviewed defect | Historical negative control | Current mechanism |
| --- | --- | --- |
| Failed `OpenProcess` silently loses owned coverage | Actual extracted `track` with failed open accepts empty held subset | Failed acquisition permanently invalidates coverage; authoritative closure coverage required even for empty snapshots; original held launcher handle required |
| Controller timeout only kills controller | Actual dispatch assignment propagates injected `TimeoutExpired` without external recovery | Recovery capability must exist outside controller before dispatch; timeout invokes it in `finally`; missing capability prevents dispatch and reports unqualified |
| Query/termination/close exceptions skip cleanup and receipt | Actual recovery query loop fails before actual handle-close loop | Per-operation errors accumulated; every already-owned handle gets independent wait/close attempts; receipt emitted after operation errors; receipt-sink exceptions remain failures |
| `len(results)` understates consumed attempts | Actual batch-result save expression reports zero with missing result after a represented dispatched attempt | Durable injected ledger consumes before dispatch; receipt absence/corruption cannot refund it; existing consumed ledger cannot restart/resume the batch |

Identity is `(pid, creation identity)`, never PID alone. Descendant acquisition requires adapter proof of exact identity **and authoritative parent ownership**, not snapshot parentage alone. Reused, ambiguous or unproven handles are rejected/closed and never terminated. Already-owned handles may be terminated after a query error; this does not authorize termination of unknown processes.

The fixed original stop contract is 20-second poll + 1-second wait. Recovery operations share an independent absolute deadline; exhausted deadline prevents further observation/termination and still attempts close. Adapter methods must themselves honor deadlines: synchronous Python cannot preempt a blocking native implementation, and none is provided. The original 100-second controller-dispatch bound is preserved at the injected driver seam. A green injected receipt is not Win32 behavior or actual process-disappearance evidence.

## Executed verification

External evidence directory (fresh; historical receipts not overwritten):

`%LOCALAPPDATA%/lingotorte/evidence-archives/lt-a46-diagnostic-offline-2026-10-10`

Commands, raw stdout/stderr and return codes are in `test-1.json` through `test-5.json`; `baseline-red.txt` preserves the first literal normal-mode red run.

| Command | Observed result |
| --- | --- |
| `python scripts/windows_shutdown_recovery.test.py --baseline <baseline-source.py>` | 4 expected behavioral failures; exit 1; no extraction/import errors |
| `python -O scripts/windows_shutdown_recovery.test.py --baseline <baseline-source.py>` | Same 4 expected behavioral failures; exit 1 |
| `python scripts/windows-shutdown-diagnostic.test.py` | 8 passed; original 5 preserved + CLI, binding, optimized-prepare checks |
| `python -O scripts/windows-shutdown-diagnostic.test.py` | 8 passed |
| `python scripts/windows_shutdown_recovery.test.py` | 18 passed |
| `python -O scripts/windows_shutdown_recovery.test.py` | 18 passed |
| `git diff --check` | Exit 0 |

The 18 cases exercise acquisition failure, reused PID, unproven parentage, missing original launcher handle, empty-snapshot authoritative coverage, unowned parent, independent query/terminate/wait/close errors with multiple close failures, controller fixed stop window and failure cleanup, timeout external recovery, absent external capability, missing/corrupt/partial/wrong-case receipts, pre-dispatch accounting, exhausted/corrupt budget, external cleanup failure, exhausted deadline, forbidden resume and receipt-sink failure. Process creation and native WinDLL boundaries are forbidden by mocks. Test drivers/adapters are deliberately injected observations, not synthetic native observations.

Negative controls execute narrowly extracted original AST nodes with inert capabilities; they do not import the frozen controller or execute its entry point. They are source-bound behavioral controls corresponding to the four green regression requirements, **not an identical end-to-end baseline harness**. The missing-receipt baseline initializes the represented completed-results state after one dispatched attempt; the timeout baseline executes the actual dispatch assignment. The archived original remains intact for review.

An intermediate test-fixture failure was encountered: replacing `sys.flags` with an incomplete stub broke Python 3.14 argparse's `ignore_environment` access. Fixed the stub to delegate all unrelated attributes. This was not a diagnostic product regression or native attempt.

## Source binding and archive integrity

Baseline source SHA-256:
`6a132815af67ab2a090c2eebdbc1a53e9ff090af7c33d82648f15ee065eb58f2`

Initial-delivery identities (immutable copies retained beside initial raw receipts; revision 1 identities below supersede current working source):

- Diagnostic source: `fe1d1386de6f23f51ef22206ddc6bfddfed3755212f3ee6ec986dccd9767fe04`
- Diagnostic tests: `ee1f6a51e46871a061032009a8982d386e67c55349b634a9986a5dbcfe2f0eea`
- Recovery core: `782b9c9750657cadd3fc87961b0a6561dbe346a953be52317f457e4135640cd6`
- Recovery tests: `e16269d13425510fb232c65ec4b50ffe3334f18818facd3f6df42da0d6176ab7`

Offline receipts manifest SHA-256:
`5354e68b685a283690022e9ce716212a6568b8b943275b43b999322d1fcf57e1`

Historical upstream manifest remains:
`656c370d2a3fe393d0d6672c76a0a4904e10881b5895437bd99d440982ce8fd6`

Historical archive directory contains 39 files including its own manifest (38 manifest entries). Read-only pre/post inventories match. All 417 original referenced files were rehashed against historical identities immediately before the final offline suite and again afterward; all match. `originals-verified-pre.json`/`originals-verified-post.json` and `upstream-pre.json`/`upstream-post.json` retain those receipts. No historical source, failed evidence document, candidate, frozen packet or original receipt was modified.

## Remaining proof and recommendation

The four repairs are implemented and exercised at retained injected seams. Native adapter qualification is **unresolved**, not silently supplied by mocks. Before any separately authorized future live work, prove: original launcher creation-handle authority (or reviewed native-owned job fixture), authoritative descendant acquisition/coverage, outside-controller lifetime across abrupt controller death, controller-kill races, bounded Win32 operations/close behavior, durable concurrent attempt ledger adapter, receipt IO failures, real independent disappearance/readback and exclusive console ownership. No automatic retry, resume, frozen-packet reset or new native allowance follows from these tests.

`qualified` in the injected batch result means only that injected contract's successful full-budget outcome; it is not native qualification. Missing capability, unknown ownership, operation error or expired deadline cannot produce that outcome. Keep the unconditional live guards until independent review and fresh exact authorization. Parent review/closure may accept the bounded offline scope while retaining all real-runtime gates.

## Bounded offline revision 1 (of maximum 3)

Specification review found three blockers in the initial delivery. This revision repairs them at the same real injected seams; it does not change the native guards or authorize live work.

- Qualification now requires the exact lifecycle string `PASS injected contract only` on every case, controller cleanup and independent cleanup both exactly true, and complete budget/receipt counts. A recognized `FAIL` lifecycle may continue through the finite predeclared cases only when both cleanup receipts are safe, but the final qualification is false. Missing, wrong-type or non-exact lifecycle fields fail closed.
- Controller emits exactly one complete outcome **after** cleanup is merged: explicit `driver.case` binding, lifecycle, stop reason, cleanup operations/errors and any controller error. The intermediate cleanup-only green receipt is suppressed. Real controller-to-batch composition is exercised for success and stop failure, retaining the original 20-second poll plus 1-second wait.
- Ledger initial reads, consume reads, append and readback are protected. Strict list/integer/sequential/count/maximum validation rejects corruption including bool-as-int. IO uncertainty permanently poisons the ledger object; no retry/reset API exists. The final batch sink is attempted even on ledger errors, before any dispatch; no owned-process recovery is needed if dispatch never occurred. Sink failure propagates and is not a persistence claim.

`consumed_attempts` is an exact validated count or null when unknown; `consumed_attempts_min` is only a known lower bound; `possibly_consumed_attempt` records the attempted append. An append that persists `[1]` then raises can retain exact count 1 after one validated observation, while remaining uncertain/unqualified and never dispatching. Failed readback preserves unknown count rather than inventing zero. Retry with the same poisoned ledger remains forbidden even if its store later returns clean data. Durable cross-instance poison, writer exclusion and real IO trust remain adapter prerequisites; this source-only seam does not supply them.

Parent's path-bound recovery-test import fix preceded this revision and changed the working test identity from the initial archived test hash above. It is preserved, including isolated `-I` execution. The initial core was still exactly `782b9c9750657cadd3fc87961b0a6561dbe346a953be52317f457e4135640cd6`; an inert independent copy binds the revision red controls.

Fresh sibling receipts:
`%LOCALAPPDATA%/lingotorte/evidence-archives/lt-a46-diagnostic-offline-2026-10-10-revision-1`

- `revision-red-normal.json` and `revision-red-optimized.json`: 3 targeted pre-revision tests fail as expected, with 8 assertion-failing subcases and 4 actual uncaught ledger exceptions (not import/setup failures); literal command/stdout/stderr/exit 1 retained.
- Final diagnostic suite: 8 passed; recovery suite: **26 passed**, preserving the original 18 plus 8 revision tests. Both suites pass normal, `-O`, `-I`, and `-I -O`, with raw logs for every run.
- Historical original AST controls remain 4 behavioral failures in normal and optimized modes against the unchanged source SHA above; the original packet is never imported.
- All 417 original referenced files and the 39-file upstream archive were verified before and after final tests. The entire initial offline archive matches its pre-revision inventory byte-for-byte, including initial manifest `5354e68b685a283690022e9ce716212a6568b8b943275b43b999322d1fcf57e1`.

Revision source identities (copies and byte counts in `source-final.json`):

| Artifact | SHA-256 |
| --- | --- |
| Diagnostic source (unchanged) | `fe1d1386de6f23f51ef22206ddc6bfddfed3755212f3ee6ec986dccd9767fe04` |
| Diagnostic tests (unchanged) | `ee1f6a51e46871a061032009a8982d386e67c55349b634a9986a5dbcfe2f0eea` |
| Recovery core | `e72bec669fb39394ffc6605f93d42f3cc9ffbed6052f7f3c797f59328b3fd58f` |
| Recovery tests | `4e96df2ce722086acfd1c8357a61d0147018bed7a6544486a90062ad1ff8d768` |

`receipts-manifest.json` binds the new receipt/source copies; the initial manifest and initial identities remain historical, not relabeled as revision evidence. `implementation-notes.md` records uncertainty and sink edge cases. No native call/launch, prepare run, install, original archive write, Beads write, commit or push occurred. Native ownership, deadlines, outside-controller lifetime, concurrency and adapter qualification limitations above remain unresolved.

## Parent verification and independent disposition

Revision receipt manifest SHA-256: `c67b3d762883a59e5b631fa7b662b03a839123fa128901e7ce608a84f72a50d8`, **31 entries**, independently rehashed by the parent and both final reviewers. All four current code/test hashes match the revision source table. The archived document represents the pre-review revision text; this final review section is a subsequent publication annotation, not a relabeled frozen receipt.

- Initial specification review `deleg_aa435fa4`: **BLOCKED**, identifying the three defects repaired in revision 1. No failed review is treated as approval.
- Specification re-review `deleg_5b114b96`: **PASS**, independently rerunning diagnostic 8/8 and recovery 26/26 tests with `-I -B` and `-I -O -B`, validating composition, negative controls, manifest and preserved originals.
- Final quality review `deleg_7a3ebe35`: **APPROVED for bounded offline scope only**, independently rerunning both suites in both isolated modes, verifying all 31 revision entries and current artifact copies; no quality blocker.
- Parent reran both suites in normal and optimized isolated Python: **34/34 per mode**. Whitespace verification passed. No real process fixture, native adapter or prepare/live CLI was exercised.

Only `lt-c0r.5`'s offline injected-contract scope is accepted. `lt-c0r.4` and `lt-a46` remain blocked; the inherited-ignore hypothesis remains untested. This work does not provide a runnable, qualified Windows diagnostic harness: native adapter implementation/qualification, authoritative ownership and outside-controller recovery lifetime, bounded native operations, durable cross-instance ledger uncertainty/concurrency and eventual fresh synthetic execution remain separate gates requiring appropriately scoped authorization. Neither review lifts the unconditional live execution guards.
