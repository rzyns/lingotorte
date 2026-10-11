# lt-c0r.8 — native/controller binding: STOPPED safety disposition

## Decision and authority

**STOPPED: no runnable native candidate.** The bounded offline reassessment/composition is complete and ready for parent independent specification review, then quality review. It does not self-accept its sources. Zero review-driven corrections have been used; at most one parent-approved correction is available across both reviews, then stop. No automatic successor implementation stage is recommended.

The owned worktree is `C:/Users/jmdzi/workspace/lingotorte/.worktrees/lt-native-controller-binding`, branch `work/lt-native-controller-binding`, base `a829ebb26e09c310ca12dd081718c65784463b7b`. Parent owns all Beads/Git publication and disposition. `lt-c0r.6`, `lt-c0r.4` and `lt-a46` remain blocked; consumed historical allowance is never refunded.

The frozen native adapter and its tests were adopted **byte-for-byte from the blocked-review archive into this new worktree**, solely for offline assessment. Proposed acceptance, if independent review passes, is source-only acceptance of this stopped assessment, not retrospective acceptance of the old blocked issue and not runtime/native qualification. The accepted ledger and existing recovery/diagnostic sources/tests are unchanged. Both unconditional live guards remain unchanged. No integration module/live CLI was added: an in-process wrapper would falsely imply completion of the missing supervisor/controller transport.

Owned repository changes (four new files):

- `scripts/windows_shutdown_native.py` — exact frozen copy, no native design change;
- `scripts/windows_shutdown_native.test.py` — exact frozen copy;
- `scripts/windows_shutdown_binding.test.py` — offline composition and discriminating safety controls;
- this document.

No DLL, actual process/job/console API, launcher/helper, native fixture, console event, prepare-live or diagnostic CLI, original frozen packet execution, application/browser/SQLite, provider/model, install/deploy or learner-state action was performed. The only subprocesses were isolated Python unit-test interpreters and read-only Git commands. Persistent test guards forbid WinDLL, Popen, subprocess.run, os.system and os.startfile inside those interpreters; the new tests additionally forbid native.real_api. CFUNCTYPE callbacks invoke Python only.

## Actual composition and limits

The tests use the **actual** `NativeOwnershipAdapter.create/cleanup`, `Ownership`, `controller_core`, `execute_core`, `AttemptLedger` and accepted `LocalLedgerStore`. The injected ABI comes from the exact adopted native test fixture and uses ctypes signatures/pointer output writes, not a replacement ownership model. Fresh absolute disposable ledger roots live under `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch`. The packet is an explicitly inert assessment byte string, never the historical packet. Durable consumption is read back from the real store inside dispatch **before** native adapter creation. Physical ledger rows/status/lease are inspected before temporary-directory retirement and recorded in raw receipts.

Roles are distinct in the test's control flow: a supervisor-owned recovery dictionary is allocated before execute_core; dispatch creates the original root only after consume; a logical controller invokes controller_core; execute_core invokes independent adapter cleanup after dispatch/controller failure. **All objects nevertheless share one Python process.** This proves composition/order/error propagation only. EOFError and TimeoutError simulate controller loss; no actual OS process is killed and no IPC is implemented. `qualified=True` remains the existing core's **injected-contract** result; every native recovery receipt explicitly has `native_qualified=False`.

## Concrete remaining blockers

| Obligation | Evidence and disposition |
| --- | --- |
| Ownership outside a disposable OS controller | **BLOCKED.** create returns Ownership referencing the supervisor-local adapter itself; no process-separated operation interface exists. Passing that object to a controller would violate the adapter's own contract. `duplicate_root` duplicates into the same process, not an external lifetime owner. The test's dictionary is not proof of OS-death survival. |
| IPC and handle/stdio lifetime | **BLOCKED.** No real channel, bounded framing, request authentication/source binding, EOF lifetime, endpoint inheritance or controller-death detection is bound. Caller-owned stdio handles are only inert integer values in tests. No proof that the supervisor retains exclusive job authority while a real controller disappears. |
| Exclusive console targeting and host lifetime | **BLOCKED.** `fixture_readiness()` still unconditionally rejects exclusive console-host lifetime. NEW_CONSOLE/hidden startup flags do not establish authoritative dedicated-host identity, exclusive event recipients or teardown readback. Never adopt a console host using PID genealogy/window attachment. No console event is supplied. |
| Enforceable hard native deadlines | **REFUTED for this adapter contract; BLOCKED for native execution.** `_check` occurs before synchronous native calls, not around a preemptible boundary. A returning QueryInformationJobObject callback advances the injected clock from 0 to 11 with deadline 10; `_count(10)` returns 1 successfully. The explicit hard-bound assertion fails in both modes. Subsequent cleanup rejects the exhausted deadline and retains the job, but that is neither interruption nor proof that a hung Query/Close/GetTimes can be bounded. Post-call checks alone would not solve a never-returning call. Recovery CloseHandle attempts can run after deadline. |

These are architectural obligations, not a request for another ledger repair or a cosmetic wrapper. A full IPC broker/deadline-isolation rewrite is beyond this bounded stage. No source fix is claimed for the hard-bound failure. The source comment already acknowledges the problem; the new control makes it observable without executing Windows calls.

## Source-bound execution

Fresh, non-overwritten archive:

`C:/Users/jmdzi/AppData/Local/lingotorte/evidence-archives/lt-native-controller-binding-offline-initial`

`runner.py` binds archived sources, runs five suites with imports and process/DLL calls guarded, captures stdout/stderr/exit/count, and verifies historical evidence before/after. `commands.json` contains exact executable, arguments and cwd; `source-binding.json` binds every executed source. The original command was `python -I -B C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-native-binding-runner.py`. That runner creates its archive exclusively and will refuse to overwrite it; it is not a live qualification command.

| Suite | `-I -B` | `-I -B -O` |
| --- | --- | --- |
| Unchanged diagnostic | 8 passed | 8 passed |
| Unchanged recovery | 26 passed | 26 passed |
| Accepted unchanged ledger | 20 passed | 20 passed |
| Exact adopted native | 16 passed | 16 passed |
| New binding assessment | 10 passed | 10 passed |
| Total suite methods | **80 passed** | **80 passed** |
| Separate hard-bound acceptance negative control | 1 test, expected exit 1 | 1 test, expected exit 1 |

The separate red control is `BindingTests.test_returning_native_callback_can_overrun_absolute_deadline` with `--require-hard-bound`; it fails specifically with `11.0 not less than or equal to 10`, not a missing runtime/import. Both source hashes and raw red receipts/logs are preserved. This is an architectural rejection baseline, not fabricated before/after repair evidence. Ordinary assessment asserts the overrun and subsequent fail-closed cleanup instead of pretending the deadline requirement passes.

Each normal/optimized binding receipt file contains ten uniquely named rows with identical scenario coverage. Each accepted-ledger matrix contains 181 rows (not 181 test methods).

| Binding row | Observed outcome |
| --- | --- |
| Complete composition | Three physical consumed rows; fixed ready 35/poll 20/wait 1 preserved; controller and external cleanup succeed; all jobs retired; injected-only qualification. |
| Missing outside recovery | Zero rows and no dispatch; explicit rejection before consume. |
| Setup failure | One consumed row, bootstrap recovery runs, empty job observed; bootstrap failure never qualifies. |
| Logical controller timeout | One row, independent cleanup succeeds, no refund/retry or subsequent dispatch. |
| Logical controller death/EOF | One row, independent cleanup succeeds; exception simulation only, no OS-death claim. |
| Cleanup exception | One row, false cleanup, job retained, no later dispatch. |
| Uncertain native accounting | One row, failed controller coverage and independent cleanup, job retained; never qualifies. |
| Committed ledger uncertainty | Real replace committed row `[1]`; `P` and lease retained; unknown count/possibly consumed 1; no dispatch; direct/new-wrapper/new-instance retry denied. |
| Console readiness | Rejected without any ABI call. |
| Hard-bound control | Returning callback crosses deadline; subsequent cleanup fails closed; separate required-bound mode is behaviorally red. |

Source SHA-256 values:

- adopted native: `b546f8e9426a3cd224478daf7e9e4c7848593bfa92ef187e57f132097c76a777`;
- adopted native tests: `2bdfab3b44e02f2038d6519ba2e41b0bc65b7cd717bc4c2e730a01277abae153`;
- new binding tests: `0c5952ea04a87823384966a3c0a620e233998ebca0964bc7c4a7d5472b02b1f5`;
- unchanged ledger: `ae040513cb69b05508cb17c3cc9dab53c535e154058c1a605499661c0bf65c04`;
- unchanged ledger tests: `47cf618d0437f2e8ca8a113096d408f747e6e5f3811c1b51a66c9dfc50620d74`.

## Preservation

`preservation-before.json` and `preservation-after.json` are equal. Every entry was rehashed with zero mismatches in the blocked-review 6-entry, adapter-revision-3 35-entry, reviewed-offline 31-entry, upstream 38-entry and accepted-ledger 48-entry manifests; all 417 historical originals were rehashed. The five dirty original adapter files and exact untracked status are unchanged. Primary HEAD remains `147081a13cf5650b30ab719142b1ef7f31132f5f`. Accepted ledger and diagnostic/recovery source/test hashes are unchanged. The final receipt inventory binds full paths, byte sizes and SHA-256; its hash is reported separately to avoid self-reference.

## Future native qualification procedure — all gates currently NO-GO

This is a gated specification, **not executable commands or renewed authority**.

1. **Architecture gate:** independently accept a source-bound process-separated supervisor/controller operation contract. Supervisor retains sole containment authority outside the owned job; controller cannot forge ownership, reopen PID-only targets or inherit job authority. Establish exact endpoint/stdio ownership, allowlisted requests, bounded receipt framing and EOF/death semantics. Reject before durable consume when unavailable. Do not pass this Python object across roles as the solution.
2. **Deadline gate:** demonstrate an independently enforceable boundary for setup, observation, termination and close, including never-returning native calls and loss of the executing role. The trusted recovery path itself must not rely on an unbounded synchronous call to fulfill a hard deadline. Prove containment/lifetime on all transitions; an ordinary timeout or post-call check is insufficient. If that design cannot meet the contract, stop or explicitly change the contract through user-approved scope, never silently weaken it.
3. **Console gate:** establish authoritative dedicated-host identity, exclusive recipient binding and host lifetime/disappearance readback. Review official console-event/attachment semantics before designing delivery. Reject unrelated-console targeting and ambiguous host ownership; NEW_CONSOLE alone is insufficient.
4. **Source/authority gate:** only after those designs pass independent specification/quality review, obtain fresh exact authorization for a finite isolated synthetic native qualification packet. Bind OS/runtime, absolute sources/hashes, supervisor/controller/fixture, fresh ledger root, time budgets and remaining allowance. Neither this stopped report nor accepted-ledger evidence grants native attempts; both current live guards remain intact in this stage.
5. **Native evidence gate under that separate authorization:** verify actual DLL ABI/rights, atomic JOB_LIST/HANDLE_LIST creation and nested-job containment; original PID/FILETIME capability readback; literal argv and offline environment. Exercise setup failure, controller timeout/death, IPC EOF, deadline loss, uncertain accounting and cleanup exception. Independently read back all owned process/job/console-host disappearance and expected port release before safety fallback. Retain every raw receipt and consumed row, including unknown counts; no reset/refund/retry permission from cleanup success. A fixture pass still does not qualify application/SQLite graceful shutdown.

## Smallest recommended alternative

Do not automatically build another supervisory architecture to continue the exhausted harness. Recommend a separately scoped, source-first diagnosis of the original product assertion: distinguish inherited-ignore native Ctrl+C behavior from helper control-EOF/job-empty cleanup and launcher exit. Keep graceful SQLite shutdown a separate durability assertion. This recommendation grants no live helper/launcher/console execution and does not waive existing protection gates.

## Parent acceptance of the stopped assessment

Specification review `deleg_b8bce41d` **PASS** and quality review `deleg_1d5d5df3` **APPROVED** authorize publication of these four files solely as a stopped offline assessment. Neither review accepts a runnable native adapter or resolves the remaining safety gates. Zero functional review corrections were required; only the nonblocking heading formatting was corrected here.

Parent independently reran all 80 unit methods in isolated normal and optimized Python and reproduced both separate expected-red hard-bound controls. Parent verified all 37 receipt entries, historical 6/35/31/38/48-entry manifests, 417 originals, five blocked artifacts and unchanged accepted sources/guards. The receipt-manifest SHA-256 is `286054060ce86483590ef28a509f6353ec9dbb0517ccd9e6fe43a85b62cb0043`.

This annotation and heading correction postdate the frozen document copy; no archived evidence was modified or relabeled. Canonical Beads records the published revision and exact remote readback. Only `lt-c0r.8` may close for the accepted stopped assessment; `lt-c0r.6`, `lt-c0r.4` and `lt-a46` remain blocked. The work branch is not merged to primary `main`, and both live entry points remain disabled.
