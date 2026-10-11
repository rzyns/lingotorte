# lt-c0r.9 — original launcher shutdown: source-first analysis

## Executive disposition

**The shutdown assertion failed; its root cause remains unknown.** The preserved actual-app attempt generated native `CTRL_C_EVENT(0,0)` successfully, then the launcher remained alive through 20 seconds of polling and a final 1-second wait. Recovery subsequently found all six tracked identities still active and terminated them. There is no recorded launcher SIGINT-entry, stoprequest, helper EOF or job-empty boundary that localizes the failure.

**Inherited ignoreCtrlC is the leading, falsifiable hypothesis, not a diagnosis.** Both older successful synthetic probes explicitly clear the sender's inheritable ignore attribute **before** spawning the launcher; the failed successor does not. Neither initial sender state nor the launched Node runtime's effective ignore behavior was measured. Different workloads, launcher revisions/fixture selection, environments and sessions confound the historical comparison.

**A source fact materially narrows the claim:** original Windows shutdown requests helper stdin EOF and then forcibly terminates each owned job. It does not ask service/Vite roots for graceful shutdown. Job-empty completion is internal kernel-accounting evidence converted into helper return/exit status, **not a separately emitted job-empty acknowledgement**. Process disappearance is not SQLite graceful close, reopen integrity or durability.

Deliverable: this report only, for independent read-only review and parent-owned publication. No repair, harness extension, test execution, original-source import, DLL/native API, launcher/helper/console event, application/browser/database/provider/model/install/deploy or learner-state action occurred. Reading preserved red receipts substitutes for identifying the symptom; it does not satisfy an executed new reproduction or authorize one. `lt-c0r.4`, `lt-c0r.6` and `lt-a46` remain blocked. Closing this analysis would not close those assertions.

## Evidence vocabulary and identity

- **OBSERVED:** existing archived receipts, not a new run.
- **SOURCE FACT:** control flow directly read from frozen source.
- **OFFICIAL SEMANTICS:** public Microsoft/Node documentation; not measured runtime behavior.
- **INFERENCE:** a prediction/ranking derived from the above.
- **NOT OBSERVED:** a boundary/value not recorded; absence of instrumentation is not absence of execution.

All archive-relative paths below are under the local evidence-archive root `C:/Users/jmdzi/AppData/Local/lingotorte/evidence-archives/`. `C` abbreviates `lt-a46-candidate-2026-10-10/candidate app żółć/scripts/`; `H` abbreviates `lt-a46-harness-binding-2026-10-10-v3/`; `L` abbreviates `lt-a46-live-attempt-2026-10-10/`; `P` abbreviates `lt-a46-preparation-2026-10-10/scratch-evidence/lt-a46-launcher-evidence/`. These are exact archived inputs, not today's primary or dirty worktree files.

| Frozen source | Bytes | SHA-256 |
| --- | ---: | --- |
| `C/start-local.mjs` | 1218 | `a65acfbda623645872816151691680769b41a0932254e013bcb6a712a9bddfce` |
| `C/start-local-processes.mjs` | 5600 | `ed417f114cf4a4b4d240242a30efc7a6322d9d63bd1ae93293711e13ec41627e` |
| `C/start-local-windows-job.cs` | 9459 | `d4d44259617f013ca4d886ac53685a734b136af6c049cbbdf3cacd0a15355540` |
| `C/start-local.test.mjs` | 16885 | `6eb99163684c89b2871022bf2d2e101ef544a27f939855dd819bb37286b88df0` |
| `H/successor.py` | 15387 | `a9d8bb8370dc96e26f6198e7f5c8b9e115304945b04eda6b7ac8646585ec87b5` |

Candidate `source-manifest.json` records base `147081a13cf5650b30ab719142b1ef7f31132f5f` and historical launcher worktree HEAD `2b005926966418769293d9abede5d91be61d145d`; it records mixed provenance rather than claiming the candidate equals that historical commit. Its SHA-256 is `9cb1e87f020fbfeba6147605bf478253dcc8c3532b2fbfb07ae47788069f2c83`.

This inspection rehashed all **378 candidate source entries**, **14 live-receipt entries** and **17 harness-v3 entries**, with zero mismatches against their manifests. Live manifest SHA-256: `f94547db898675c0159fcdea4386894218320873d57266bb28ea56776db423d4`; harness manifest: `3e9c9dde6380d6a865a0c131f643f368dc333a067d1a4bc8ad1e7627b0795aa7`; `H/binding.json`: `b02892f3f145d00eee98b82257419ebebf0ebaa4a64e01fbafe360ba0c7f171d`.

Fresh provenance archive: `lt-launcher-shutdown-source-analysis-offline/`. Its `receipts-manifest.json` inventories four evidence files, SHA-256 `7cfd14e663be3830be1f50d8cae7d96fac0597e4c0d59a548974dd24732704ba`. Before/after preservation matched for 416 unique input files (the selected 378/14/17 manifest closures, three manifests and four historical comparison files; this is not the earlier 417-file diagnostic scope). It retains before/after input hashes, sanitized selected receipt fields, official-document excerpts with URLs/retrieval time, and a final receipt inventory. No database file was opened or hashed. Dependencies were not loaded or requalified. Existing historical counts for broader archives are not claimed as new verification here. The owned worktree is `.worktrees/lt-shutdown-source-analysis`, branch `work/lt-shutdown-source-analysis`, base `3434a6e655d61feb448fa8ed333a25409394546c`. Parent owns Git/Beads; unrelated dirty worktrees and `.beads/.migrated-attachments` are outside this analysis.

## What the original attempt establishes

**OBSERVED:** `L/execution-receipt.json:3–26` records one successor invocation, start `2026-10-10T22:43:18.814565+00:00`, end `2026-10-10T22:44:17.219385+00:00`, exit 1. The wrapper exit 1 is not a launcher exit code. `L/outputs/result.json` reports `passed:false`, the traceback `main:224 → ctrl_c:164 → wait:169`, and `TimeoutExpired(..., 1)` after the preceding 20-second poll. Its sole scenario contains `stop:"native CTRL_C_EVENT in dedicated owned console"` but no `launcher_exit` field.

Readiness, two owned loopback listeners, offline/resource-graph checks and synthetic save/API readback passed before the native event. `L/outputs/ready-save-native-ctrl-c.log:1–6` contains startup/service/Vite messages only: no `JOB_STOP_FAILED` or ownership-failure message. This is not proof that stop never ran; those messages are conditional failure logs, not boundary acknowledgements.

`H/successor.py:178–190` records a PID in `emergency_cleanup` only when its held handle reports active. The result lists launcher 24732, console host 42236, helpers 57884/57996 and service/UI roots 61340/58684 in that list; final held-handle readback marks all six inactive. `L/independent-readback.json:2–31` corroborates absent PIDs and no listeners on 5173/5174, explicitly labeling the independent readback PID-only. Recovery success is safety evidence after failure, not clean shutdown or authoritative pre-recovery console-host qualification.

**NOT OBSERVED:** sender ignore state before spawn; effective Node native signal state; console membership at generation; JS signal entry; stop start; stdin finish/EOF; helper stop wake; job termination return; job-empty accounting; helper exit/close before recovery; launcher done/event-loop drain. The earliest unresolved boundary is therefore **event generation → effective launcher reception/JS handler entry**, not demonstrably helper EOF or job empty.

SQLite reopen and integrity code lies after `first.ctrl_c()` (`H/successor.py:224–231`) and is not reached when that call raises. No archived `native_sqlite_reopen` result exists. API save readback before shutdown must not be promoted to graceful-shutdown durability evidence.

## Exact launch and control/data flow

**SOURCE FACT:** `H/successor.py:120–121` starts the bound Node executable (`node-26.7.0-win32-x64/node.exe`, visible in the failure receipt) with one script argument, the absolute archived `scripts/start-local.mjs`; cwd is the archived candidate. It requests hidden startup plus `CREATE_NEW_CONSOLE`, redirects stdout to a log and stderr to stdout, and passes the validated packet environment. It does not request `CREATE_NEW_PROCESS_GROUP` for the launcher. Provider false and PowerShell telemetry/update controls are recorded; no private environment was read for this analysis.

| Boundary and owner | Input → output / completion evidence | Bound or failure path | Existing observation |
| --- | --- | --- | --- |
| Python spawn → launcher | Explicit Node/script/cwd/env; hidden new console → launcher PID (`H:115–123`) | Readiness poll 35 seconds (`H:136–155`) | Launcher and app ready |
| Python console attach → native event | `FreeConsole`; checked `AttachConsole(launcherPid)`; checked `SetConsoleCtrlHandler(NULL,TRUE)` **in sender only**; checked `GenerateConsoleCtrlEvent(0,0)`; 150 ms pause; final `FreeConsole` (`H:156–162`) | Assertion on attachment/API failure; no reception ack | Stop string plus later timeout proves assertions passed under the non-optimized invocation, not signal delivery |
| Launcher registration → onSignal | Listeners installed before child spawn loop (`C/start-local-processes.mjs:104–108`) → `void stop(0)` | No registration/entry log; OS-to-Node behavior unmeasured | NOT OBSERVED; readiness makes a simple late-registration explanation less compelling |
| Launcher stop → helper control pipe | First `stop` sets stopping synchronously, memoizes completion, then a microtask terminates all children in parallel (`:87–102`) → `child.stdin?.end()` (`:57–73`) | 10-second timer kills helper with SIGKILL; stdin errors are swallowed (`:35–36`); end has no EOF receipt | NOT OBSERVED |
| Pipe → helper stop event | Helper registers a non-null handler returning true; background thread does one `Console.ReadLine()`, catches read failure, then `stop.Set()` (`C/start-local-windows-job.cs:47–51,89–97`) | No control-read deadline/ack; line, EOF or exception requests stop | NOT OBSERVED |
| Helper bootstrap → root/job | Unnamed kill-on-close job; no breakaway flag; job list attribute at process creation; child stdout/stderr inherited, stdin not assigned helper pipe (`:98–128`) | Setup Check failures → redacted error/return 1; finally closes handles | Roots started; this is not new native ABI/ownership qualification |
| Root exit or stop → job terminate | Loop checks stop and root wait every 25 ms; root exit reads its status; either path calls `TerminateJobObject(job,1)` (`:131–137`) | Check failure → catch return 1; stop path leaves `exitCode=0` | NOT OBSERVED before recovery |
| Job terminate → empty → helper return | Query accounting until ActiveProcesses zero; return root status (zero on stop) (`:138–148`) | Elapsed >5 seconds is checked only after a returning query with nonzero count; sleep 10 ms. Synchronous calls themselves are not hard-bounded | No separate external job-empty acknowledgement exists |
| Helper return → pwsh exit → child close | `finally` closes job/process/attribute handles (`:154–160`); bootstrap exits Run result (`C/start-local-processes.mjs:7–18`); closed Promise listens to `close`, not `exit` (`:117–118`) | Running helper must exit 0/no signal and timer must not have fired, else JOB_STOP_FAILED after close (`:62–73`) | NOT OBSERVED before recovery |
| All close → done → launcher process exit | AllSettled terminate; then all closed Promises; remove listeners; finish chosen code (`:91–99`); top-level await assigns `process.exitCode` (`C/start-local.mjs:19`) | No `process.exit()`; no global hard deadline on close/event-loop drain | Launcher still alive at external deadline |

Important distinctions and races:

1. Helper control is EOF, not a serialized stop command, SIGTERM-to-root, or explicit IPC acknowledgement. Helper's registered non-null ignore handler is distinct from the sender's inheritable NULL-handler ignore attribute; the handler table is process-local.
2. `CREATE_NEW_PROCESS_GROUP` appears **for service/UI roots** in helper `CreateProcess` flags `0x80000 | 0x200` (`:125–128`). It does not explain launcher ignore state by itself. Official flags semantics disable Ctrl+C in that new group; the design deliberately routes shutdown through launcher-owned pipe/job teardown.
3. First stop wins: later signals and helper exit/error events are suppressed or return the memoized completion. Premature helper exit invokes `stop(code || 1)` when not already stopping (`:119–128`). An already-exited helper is not subjected to the same running-helper clean-status check; this is source branching, not evidence of a race in the failed attempt.
4. A synchronous stdin-end throw rejects terminate before its timer; asynchronous stdin error is ignored. AllSettled does not bypass the subsequent unconditional close waits. The 10-second helper timer calls kill but does not check its return or independently resolve/reject close. If helper kill/close never completes, stop/done can remain pending. The timer is a best-effort escalation, not proof of an enforceable launcher deadline.
5. Official Node semantics distinguish `exit` from `close` because stdio may remain open. Here helper stdout/stderr are inherited log handles, **not launcher-owned stdout/stderr pipes**, so a generic unread-pipe-buffer explanation is not established. The launcher retains helper child references/control stdin and may retain other runtime handles. Merely setting exitCode does not force exit. A final event-loop stall would require evidence that done settled first, which is absent.
6. Job termination is forceful even when the launcher reports stop success. The helper's zero stop return acknowledges its accounting path, not root-specific graceful flush. Errors caught by Run still execute finally; kill-on-close cleanup can remove processes without a successful accounting return. Never equate those paths.

## Successful versus failed comparison

| Variable | Older successful synthetic probes | Failed actual-app successor |
| --- | --- | --- |
| Pre-spawn NULL/FALSE clear | `P/native-ctrl-c-probe.py:29–34`; correction `P/lt-a46-launcher-correction/native-ctrl-c-probe.py:45–49` | Absent throughout `H/successor.py`, including immediately before spawn `:115–121` |
| Sender suppression after attach | NULL/TRUE, event `(0,0)`, detach (`P:49–54`; correction `:63–68`) | Same broad operation shape (`H:156–162`) |
| Controller's initial ignore state | Not measured; clear call return is not asserted | Not measured; no clear call |
| Console mode | Hidden new console | Hidden new console; no authoritative membership receipt |
| Product/workload identity | Dynamically chooses newest synthetic fixture directory; two synthetic listeners plus descendant; correction enables detached descendant; cwd `elsewhere` | Frozen bound candidate, actual service/Vite, synthetic save, candidate cwd |
| Environment/runtime/time budget | Broad environment copy with selected deletions; historical node selection; wait 10/15 seconds | Validated allowlisted environment; Node 26.7.0; readiness 35/poll 20/wait 1; pwsh 7.6.6/.NET 10.0.12 recorded |
| Recorded result | `P/native-ctrl-c.log:1`: exit 0, three listeners; correction `final-native-ctrl-c.log:1`: exit 0, six absent PIDs, three released ports | Timeout, recovery kills six active identities, final listeners empty |

**INFERENCE:** the reset difference is actionable because it precedes the actual launcher spawn, whereas post-attach sender suppression cannot retroactively alter an existing child's inherited attribute. It is not a single-variable experiment: dynamically selected fixtures, revisions, workloads, environment, Node selection and session state differ. No retrospective “only reset caused success” claim is warranted. Frozen test source itself labels its IPC signal bridge non-native evidence (`C/start-local.test.mjs:79–81,93–95,140–141,205–209`); those tests were read, not run here.

The later stopped diagnostic is a separate harness failure. [Diagnostic disposition](lt-a46-shutdown-diagnostic-evidence.md):36–40 records one launcher attempt, zero synthetic children and zero native events; `--import` rejected a drive-path URL before registration, followed by recovery/aggregation defects. It supplies **no SIGINT observation** for this original attempt and does not test the inherited-ignore hypothesis. Accepted ledger/offline composition evidence likewise cannot be used as product-shutdown evidence.

## Official semantics and their limits

Public references retrieved for this analysis (retrieval time and selected verbatim excerpts are in the provenance archive):

- [SetConsoleCtrlHandler](https://learn.microsoft.com/en-us/windows/console/setconsolectrlhandler): NULL/TRUE ignores Ctrl+C, NULL/FALSE restores normal processing; the attribute is inherited by children and changing it does not affect existing processes. Non-null handler lists are process-local. AttachConsole/AllocConsole/FreeConsole reset the handler table. That documented **table reset** is not evidence that the original sender ignore attribute was true, nor permission to assume exact flag behavior across attachment operations without measurement.
- [GenerateConsoleCtrlEvent](https://learn.microsoft.com/en-us/windows/console/generateconsolectrlevent): `(CTRL_C_EVENT,0)` addresses processes sharing the sender's console; Ctrl+C cannot be restricted to a nonzero group (the API can succeed without delivery to that specified group). Ignore-enabled processes do not call their handlers. Original `(0,0)` avoids the nonzero-group mistake but does not prove console membership or effective launcher reception. Ctrl+Break is semantically different, not a substitute for the original assertion.
- [Process creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags): new console and new process group are different flags; new process group disables Ctrl+C and is ignored when combined with new console. Here helper root flags and Python launcher flags are different scopes.
- [Node 26.7.0 process](https://nodejs.org/download/release/v26.7.0/docs/api/process.html): terminal SIGINT is supported, Windows SIGTERM can be listened on but is not supported natively, and process.kill/subprocess.kill signal emulation can unconditionally terminate a Windows target. Therefore `.kill('SIGINT')`, `process.emit('SIGINT')` and a native console event are not interchangeable delivery evidence. Setting exitCode allows natural event-loop completion, not forced exit.
- [Node 26.7.0 child_process](https://nodejs.org/download/release/v26.7.0/docs/api/child_process.html): close follows process end and closed stdio; exit can precede closed stdio. A successful kill request is not proof of target exit.

These references do not prove whether Node/CRT/libuv startup or signal registration resets an inherited ignore attribute in this exact session. **The assumption “Python might inherit ignore ⇒ this Node necessarily ignored Ctrl+C” remains inconclusive.** No native/runtime verdict is possible from these receipts alone.

## Ranked falsifiable hypotheses

Ranks are qualitative judgments based on preserved evidence and discriminating value, not measured probabilities.

| Rank | Hypothesis and evidence | Prediction / supporting observation | What would falsify or redirect it |
| --- | --- | --- | --- |
| 1 | Launcher native reception suppressed by inherited ignore or effective console signal state. Pre-spawn reset differential; all six tracked identities active at recovery; no shutdown error log | Native event produces no launcher handler entry; with exact same source/workload and sole pre-spawn clear variable, verified native entry/teardown appears | Verified launcher SIGINT-entry on the failed condition refutes suppression as the cause of the subsequent stall. Both controlled conditions lack entry despite established console membership leaves the reset-specific claim unsupported |
| 2 | Console attachment/recipient mismatch, despite successful API return. Original lacks membership/host receipt | Sender generation is acknowledged but launcher is not a verified same-console recipient; direct JS handler control succeeds | Authoritative same-console/exclusive-host binding plus launcher native entry excludes this boundary as the stall; PID genealogy alone does not falsify it |
| 3 | JS stop/control stdin/helper wake stall. Source has no EOF ack and can wait indefinitely for close | Launcher entry/stoprequest occurs, then one helper lacks control-read/stop wake or downstream completion; direct handler control reproduces that same boundary | Both helper stop-wake and successful job-empty/helper-close receipts before deadline rule out the pipe/read-wake hypothesis |
| 4 | Native job termination/accounting/helper exit stalls. Queries/terminate are synchronous; elapsed check does not interrupt a hung call | EOF/wake occurs but terminate return, accounting-zero or helper exit is missing; original helper trace identifies first missing boundary | Both helper successful accounting returns and closes precede launcher stall; redirect to final JS/runtime resources |
| 5 | Launcher completion/stdio/event-loop drain after helper teardown. All close waits and natural exit are required | Both helpers close, done settles, but launcher remains alive; active-resource evidence identifies a surviving reference | Helpers/roots still active before recovery without earlier successful teardown makes a pure final-drain-only explanation untenable; verified launcher exit excludes it |

The receipt that all helpers and roots were still active at emergency cleanup weighs against an **ordinary completed** stop flow and against a **pure post-teardown** event-loop stall. It does not eliminate delayed JS execution, stalled EOF or blocked native operations. No hypothesis is confirmed.

## Smallest discriminating next check — conditional, not authorized execution

Existing source/receipt inspection already settles what the code intends and what the old failure did **not** record. It cannot reconstruct missing signal entry. **The first additional product-evidence boundary should be launcher registered-SIGINT entry**, with stoprequest distinguished from helper EOF/job completion. Do not first build another ledger/broker or treat API generation success as this observation.

If separately authorized and all native safety gates independently pass, the smallest reset-specific comparison is a finite isolated, source-bound pair: identical launcher/helper/workload/environment and native `(0,0)` event; one condition preserves the original absence of pre-spawn reset, the other checks NULL/FALSE **before launcher spawn** as the sole intended variable. Preserve initial-state uncertainty, runtime/source binding, signal-entry and subsequent boundary receipts in both conditions. If clear cannot be checked or host exclusivity cannot be proved, the comparison is inconclusive and must not run. Resetting after spawn or changing event to Ctrl+Break would not test this hypothesis. A synthetic pass still cannot attribute the actual-app failure or SQLite integrity; actual workload identity is a separate gate.

If native execution remains blocked (the current disposition), the minimum separately scoped **source-bound observability alternative** is a reviewed acknowledgement-only design at existing seams: registration and onSignal entry, stoprequest/stdin completion, helper ReadLine return/stop wake, terminate return/accounting-zero, helper exit/close, done and launcher exit. Correlate per-process sequence and identity; do not merge process-local monotonic clocks into an absolute order. Preserve inverse-byte proof against these exact originals; avoid a new broad supervisor implementation. A pure injected JS control could, under new independent offline authority, discriminate JS completion assumptions only; it must explicitly not claim console delivery/native ownership. No such fixture, instrumentation, test or execution was created here. This alternative does not by itself obtain the missing original native observation.

### Explicit native NO-GO

The [stopped native/controller assessment](lt-native-controller-binding-evidence.md):26–35,84–96 identifies unresolved process-separated supervisor ownership, IPC/endpoint/stdio lifetime, authoritative exclusive console-host targeting/lifetime and enforceable hard deadlines, including never-returning native calls. Ordinary polling timers and post-call checks do not satisfy those obligations. Both existing live guards stay unchanged. Exhausted allowance is not reset by a new worktree, report, agent or cleanup success. Neither recommendation above is a ready live procedure, approval to waive these blockers, or an authorized repair.

## Verification and review boundary

Only this new repository document is owned. Read-only Git confirmed its worktree base/branch and initially clean status. Input preservation is checked against manifests before and after analysis; fresh external provenance is inventoried and read back. No dependency/native execution, database access, archived rewrite, unrelated-worktree edit or Beads/Git publication is part of this child task. Independent specification/quality review and any one parent-approved bounded correction remain parent-controlled; analysis acceptance must not be described as product repair or qualification.

## Parent review and publication disposition

Independent combined specification/evidence-quality review `deleg_b72adabe` **PASS / APPROVED** for this source-first analysis only. The reviewer verified source hashes and citations, the original receipt interpretation, all four provenance entries, and the matching 416-input preservation inventories. No blocking finding or causal-claim correction was required; only the nonblocking editorial wording above was corrected.

Parent independently rehashed all four provenance entries and all 416 selected inputs and confirmed identical before/after inventories. No product/native code or tests were executed. Publication is limited to this report on the dedicated work branch; canonical Beads records the revision and exact remote readback. Only `lt-c0r.9` may close for completed analysis. Root cause remains unknown, live guards and exhausted allowance remain unchanged, and `lt-c0r.4`, `lt-c0r.6` and `lt-a46` remain blocked.
