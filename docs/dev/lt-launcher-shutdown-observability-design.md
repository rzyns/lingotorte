# lt-c0r.10 — bounded offline shutdown acknowledgement design

**Deliverable:** a source-bound acknowledgement-only design, not instrumentation or a runnable procedure.
**Chosen approach:** first observe launcher registration, SIGINT callback entry, first stop and done at existing seams; defer deeper acknowledgements until the unknown boundary moves.
**Riskiest assumption:** observation can be published without delaying shutdown. No bounded writer is qualified; operational enablement is NO-GO.

## 1. Disposition and decisions

Root cause remains **UNKNOWN**. The accepted [source analysis](lt-launcher-shutdown-source-analysis.md):5–11,45,101–127 records native event generation followed by a launcher timeout, but no handler-entry or downstream acknowledgement. Inherited ignoreCtrlC is a leading hypothesis, not a proved diagnosis. Node/CRT/libuv startup and different historical workloads remain confounds.

This design chooses Stage A rather than a complete tracing rewrite. Its alternative is instrumenting every helper/native seam immediately; that increases concurrency, output and bootstrap perturbation before knowing whether the launcher callback runs. Moving to Stage B costs a separately reviewed, source-bound overlay and fresh authority; it is not automatic permission.

Only this Markdown file is a repository deliverable. Pure text/hash validation and fresh external provenance are allowed. No instrumentation, fixture/test/harness implementation, source import, compilation, DLL/Win32 process/job/console operation, launcher/helper, console event, prepare-live/original packet/live CLI, application/browser/SQLite/provider/model/install/deploy or learner-state action is authorized or performed. Database and credential files are excluded. Parent owns Git, Beads and independent combined specification/evidence-quality review; at most one parent-approved documentation correction, zero used at delivery.

Closing an accepted design would not qualify shutdown, resolve root cause or release `lt-c0r.4`, `lt-c0r.6` or `lt-a46`. Both live guards and exhausted allowance remain unchanged. The [stopped native binding assessment](lt-native-controller-binding-evidence.md):26–35,84–96 remains binding: outside-controller ownership, actual IPC/endpoint/stdio lifetime, authoritative exclusive console-host targeting/lifetime and enforceable deadlines including never-returning calls are unresolved. This design does not implement a broker/supervisor to evade them.

## 2. Frozen identity and exact source anchors

`C` means archive-relative `lt-a46-candidate-2026-10-10/candidate app żółć/scripts/` under the local evidence-archives root. These are the original archived bytes, not a different primary/worktree revision. Full local paths occur only in private provenance. The owned design worktree base is `50392360679d6651dffb455199feba8f3b40b1e0`, branch `work/lt-shutdown-observability-design`.

| Source | Bytes | Lines | SHA-256 |
| --- | ---: | ---: | --- |
| `C/start-local.mjs` | 1218 | 24 | `a65acfbda623645872816151691680769b41a0932254e013bcb6a712a9bddfce` |
| `C/start-local-processes.mjs` | 5600 | 135 | `ed417f114cf4a4b4d240242a30efc7a6322d9d63bd1ae93293711e13ec41627e` |
| `C/start-local-windows-job.cs` | 9459 | 163 | `d4d44259617f013ca4d886ac53685a734b136af6c049cbbdf3cacd0a15355540` |
| `C/start-local.test.mjs` | 16885 | 319 | `6eb99163684c89b2871022bf2d2e101ef544a27f939855dd819bb37286b88df0` |

The four originals and two accepted reports are the six-input preservation scope for this design; no claim to have reverified the prior 416/417-entry scopes. Prospective anchors below reference `C` files by abbreviated basename `processes`, `job`, `launcher`.

## 3. Stage A — minimum discriminating contract

Stage A proposes insertion-only acknowledgements in `start-local-processes.mjs` and `start-local.mjs`; **no C# or PowerShell bootstrap change**. Default is disabled. A later reviewed offline overlay may recognize exactly `LINGOTORTE_SHUTDOWN_ACK=1`; absent/other values disable it, and binding failure makes the trace unusable without changing product shutdown. This proposed nonsecret key needs explicit allowlist approval, not ambient environment copying. Read only this gate and explicit bound identifiers; do not enumerate environment. No gate is applied here.

| Event | Exact insertion seam | Positive meaning | Does not prove |
| --- | --- | --- | --- |
| `registration_complete` | processes:105–106, after both registrations and before :108 spawn loop | Both listener registration calls returned in this invocation | Native console membership, ignore state or delivery |
| `sigint_entry` | processes:104, callback entry before stop | Registered callback entered, with delivery class supplied by independently bound case | Native delivery when case merely injects `process.emit`; callback alone cannot establish cause |
| `stop_entered` | processes:87–90, first invocation after existing stopping assignment, before scheduling completion | First stop accepted; existing first-stop semantics retained | EOF, helper wake or termination |
| `stop_duplicate` | processes:88, memoized branch before original return; first duplicate only | A later stop invocation was suppressed | A second teardown or signal provenance |
| `done_resolution` | processes:97–99, immediately after existing finish call | Existing done resolver called with selected code | Await continuation, launcher exit or durable application close |
| `exitcode_assigned` | launcher:19, after existing await/assignment | Await returned and process.exitCode was assigned | Actual OS process exit or event-loop drain |

The existing `onSignal` is shared by SIGINT and SIGTERM. A future insertion must not label every shared callback SIGINT. Minimal carrier choice: two bound wrappers forwarding to the unchanged shared body, with the SIGINT wrapper attempting `sigint_entry`; registration/removal must use the corresponding same identities. This adds carrier edits beyond pure insertion and therefore requires explicit byte-level patch/inverse review. Alternative: label the shared-body record `signal_callback_entry` with `signal=unknown`; it cannot satisfy the named SIGINT discriminator and must be rejected for that assertion. No assumption that Node supplies the signal name as callback argument is allowed. This design selects the wrappers prospectively, not a callback-argument guess.

Record first stop reason only when supplied by a bound call-site carrier: `sigint`, `sigterm`, `child_exit`, `child_error`, `direct`, or `unknown`. Do not modify stop's exit-code/memoization behavior to infer it. Stage A may use `unknown` except at the selected signal wrapper. `sigint_entry` remains distinct from `stop_entered` because a stop may already be pending.

Per launcher: six event kinds, one occurrence per kind except explicitly capped duplicates (one); maximum six records. Additional SIGINT entries after the first increment a saturating loss/repetition counter in memory, not more I/O. Saturation invalidates completeness claims. No heartbeat, resources enumeration, new timer, retry or readiness acknowledgement is added. External existing observer must bind case delivery as `injected_js`, `native_console`, or `unknown`; the emitting callback cannot authenticate delivery class itself. Without independently qualified native generation/recipient evidence, even a positive entry is only callback entry.

### Stage A decision rule

1. A valid, source-bound positive SIGINT entry excludes absence of callback entry for that observed invocation. It redirects the candidate boundary toward stop/completion, not automatically toward helper failure.
2. Entry plus first stop but no done leaves the broad stop-to-done interval unresolved. Stage B is useful only under separate authority.
3. Done and exit-code assignment plus independently held launcher identity still alive redirects toward final drain. A self-marker is never launcher-exit proof.
4. No SIGINT entry is **INCONCLUSIVE**, not “signal ignored,” unless independently qualified observation covers the relevant runtime interval, loss-free publication/collection and continued launcher liveness. Even then it localizes a candidate boundary, not inherited-ignore causation.
5. Missing registration, malformed frames, mismatched source binding, collector loss or failed coverage rejects negative inference before hypothesis ranking.

## 4. Stage B — conditional deeper seams, not automatic scope

Stage B adds only the seams required by the newly localized unknown interval. It does not add termination APIs, root graceful signals, timeout extensions, behavior repairs or native console bindings. Keep every original call, return, catch and finally ordering. Each record is a bounded attempt, never awaited by shutdown.

| Event family | Frozen seam | Exact acknowledgement and limitation |
| --- | --- | --- |
| `stdin_end_attempt` / `stdin_end_outcome` | processes:62–64 | Before/after existing optional end call; category `absent`, `returned`, `threw`. Preserve synchronous throw. Return does not prove EOF. |
| `stdin_local_finish` / `stdin_error` | processes:35–36,63 | Existing stream completion/error seam if qualified without lifetime change; local finish is not remote ReadLine receipt. Error handling remains swallowed. Never add a drain wait. |
| `helper_handler_registered` | job:89 | Existing registration Check returned; do not instrument the native console handler delegate (:47–51). Record here on main thread only. |
| `readline_start` / `readline_return` | job:92–94 | Background reader before call and after result/catch, category `null_eof`, `line`, `error`; never log line contents or exception/stack. Capturing the existing discarded return is a prospective carrier edit. |
| `stop_set` / `stop_wake` | job:94;124,132–136 | Set returned vs main thread observed event; pre-create stop path distinguished from root-exit path. Read return is not wake. |
| `terminate_attempt` / `terminate_return` | job:137 | Around existing TerminateJobObject; record bool/status only without changing Check semantics or clobbering native last-error state before Check consumes it. A returning failure is not zero accounting. |
| `accounting_zero` | job:143–144 | Only after successful positive query reporting ActiveProcesses zero. No PID guess, timeout or query exception may emit zero. No per-poll records. |
| `run_return_intent` / `run_return_complete` | job:124,148,149–160; processes:14 | Return intent/category in C# is before finally; complete only after Run actually returns to bootstrap. Distinguish error return, pre-create cancellation and normal accounting return. |
| `bootstrap_exit_intent` | processes:7–18 | Existing outer PowerShell exit intent/status after Run return (or catch). Not OS helper exit; prospective bootstrap carrier requires separate review. |
| `child_exit` / `child_close` | processes:117–128 | Node observed process exit versus close; close resolves original Promise. Never replace close wait with exit. Preserve suppression of error/exit-triggered stop while stopping. |
| `all_closed` / `hooks_removed` | processes:91–98 | Existing unconditional all-close wait completed, then original listeners removed; allSettled alone does not establish close. |
| `launcher_exit_observed` | Existing external held observer only | Exact held identity exited, code/status read externally; never emitted by launcher itself or reconstructed from PID-only absence. |

Stage B selected event set must be fixed before any future case: one record per selected event per applicable role/child; two helpers each get their own opaque token. Cap at 32 records per role, one error category per seam and one duplicate summary. If selection exceeds the cap, stop for design review rather than silently omit required coverage. Do not automatically implement every row.

Original semantics stay explicit: first stop sets state synchronously and schedules parallel terminate via microtask (processes:87–102). Helper stdin EOF requests stop; ReadLine line/error also sets stop. Helper termination is **forceful** job teardown (job:137), not graceful root/SQLite shutdown. Successful accounting is internal evidence, not currently an emitted ack. Finally closure (:154–160) is distinct from successful accounting. Running-helper status check and 10-second best-effort kill (:62–73) do not hard-bound close. Done assigns exitCode and permits natural drain; no process.exit (:launcher:19).

## 5. Minimal versioned record and identity

This is a schema specification, not an example claimed to have been collected.

| Field | Contract |
| --- | --- |
| `v` | Integer 1; unknown versions rejected |
| `binding` | 64 lowercase hex digest of external source/runtime/case binding; overlay and original hashes both bound |
| `run`, `case` | Explicit nonsecret opaque identifiers, at most 32 ASCII alphanumeric/hyphen characters each |
| `role` | Allowlist `launcher`, `helper`, `bootstrap`, `observer`; bootstrap/helper can share OS identity, never assume separate processes |
| `token` | Bound opaque process token, at most 32 characters; helper instance mapping fixed before collection |
| `identity` | `bound` with PID and creation identity from an independently authorized held observer, or `unbound`; no new native identity calls inside product overlay |
| `thread` | Allowlist logical `js`, `main`, `reader`, `observer` |
| `seq` | Process-local integer assigned atomically at record attempt; shared C#/bootstrap domain only if explicitly implemented/bound, otherwise separate emitter domains |
| `mono` | Process-local monotonic integer ticks as decimal string plus bound clock unit/origin metadata; no wall-clock causal order |
| `event`, `outcome` | Fixed allowlisted enums selected by stage; numeric exit/native status only where existing code already obtains it |
| `loss` | Saturating bounded counters for omitted/overflow/write failures known locally; unavailable is explicitly `unknown`, not zero |

Emission identity is correlation, **not authentication or ownership authority**. PID alone never establishes creation identity or permission to terminate. An unbound record is useful for local text review but not native ownership/exit conclusions. Bound creation identity may be an external Windows creation-time value; do not fabricate it or substitute current PID lookup. Tokens/claims in shared logs are not authenticated merely because their format passes.

Within one JS thread, sequence orders record attempts, not kernel delivery. In C#, main and ReadLine threads race: atomic sequence assigns attempt order, publication can arrive out of order. Sort by emitter domain/seq for reconstruction while retaining arrival order; neither sorting nor timestamp proves stop.Set caused a particular native return. Per-thread program order and explicit send/read or set/observed relations are the only candidate causal edges; a line read is not necessarily launcher's EOF. Cross-role clocks are never merged into one absolute timeline. External observer time bounds observation intervals only. Do not infer global happens-before from numeric timestamp comparisons.

Three evidence levels remain separate: **attempted** (local slot allocated), **writer-accepted** (sink accepted bytes or buffer slot), **collector-read** (validated full frame read externally). Only the last is exported as an observed acknowledgement, with weaker levels retained when available. None proves persistent/durable storage. Collector-written file readback/hash can bind archived bytes after a separately authorized fixture; it is not fsync or SQLite durability and cannot recover events lost before collection.

## 6. Transport and boundedness — explicit unresolved tradeoff

Reuse existing evidence output only. Helper control stdin remains exactly the original EOF/control channel: no ack packets, requests or extra writes on it. Child stdout/stderr remain inherited as processes:32 and job:120–122 specify. Do not add IPC, pipes, inherited handles, reader threads, referenced event-loop handles, writer retries or a new supervisor. No new channel may change close/lifetime behavior.

Prospective framing: ASCII `LTACK1 <byte-length> <payload> <sha256>\n`; payload is single-line JSON with only schema fields, maximum 1024 bytes; frame maximum 1200 bytes. Hash is corruption detection, not authentication. Parser enforces exact byte length, digest, version, schema, role/token/source binding and occurrence cap before accepting. Preserve original raw fragment/arrival metadata only in bounded private evidence; never interpret an invalid fragment as absence of stop. No claim that one write is atomic: root logs and multiple helper/launcher writers share inherited output. Collision, interleaving, truncation, duplicate sequence, overflow and malformed frame make affected coverage **INCONCLUSIVE**. Do not repair fragments into plausible acknowledgements.

Collector is a proposed bounded parser inside the already existing evidence consumer, not a newly built OS controller. Stage A holds at most six accepted launcher frames; Stage B at most 32 per selected role; parser bounds raw carry to 2400 bytes and total raw diagnostic capture to 65536 bytes per case. Crossing any cap sets coverage invalid and discards beyond-cap bytes, with bounded summary. Collector presence/coverage before registration and through deadline must be independently bound; absence cannot be papered over by startup readiness.

Critical **NO-GO**: existing stdout/stderr writes, filesystem writes and console APIs can block. A bounded record size/ring or swallowed exception does **not** establish a bounded writer deadline. A ring limits memory but flushing can block and natural exit can lose it. An async write can retain handles/alter close and buffering. No qualified sink currently satisfies bounded nonblocking publication without lifetime changes. Until independently resolved within separately authorized scope, the overlay must remain unimplemented/disabled; do not “best effort” a blocking console write inside a shutdown path. No handler fsync, synchronous file flush or waits. Failure must never throw a new exception into shutdown, change the exit code or replace original failures; inability to guarantee that rejects enablement.

Observation itself can perturb scheduling, output contention, allocation/GC, C# thread races, native last-error state and console-handler safety. Never instrument the native delegate; avoid payload/stack formatting and file access at seams. Finite slots and constant fields reduce cost, not prove zero perturbation. Disabled byte-restoration and unchanged call graph are not proof that enabled behavior is semantically identical.

## 7. Unchanged budgets and external exit proof

Retain original external readiness 35 seconds, native post-generation poll 20 seconds plus final wait 1 second; helper best-effort timer 10 seconds; internal accounting elapsed check 5 seconds (only after returning nonzero queries). No budget resets, extensions, new attempts, cleanup-success refunds or retries. Independent enforceable outside-observer bounds are mandatory for actual launcher-exit evidence. No new outside controller is authorized here and the stopped assessment says existing hard-bound obligations are unresolved. Event publication cannot wait for collector acknowledgement. Never-returning native calls remain NO-GO regardless of emitted `terminate_attempt`.

## 8. Evidence-to-inference matrix

All rows require valid binding and collector-read positive anchors; a missing marker alone has no causal meaning.

| Observed pattern | Candidate inference | Limitation / discriminating next evidence |
| --- | --- | --- |
| Registration and native generation, no entry | Generation-to-JS-entry is candidate interval only with qualified complete coverage and live runtime | Otherwise inconclusive; cannot distinguish inherited ignore, recipient mismatch, runtime delay or sink loss |
| Injected JS entry and done | JS completion path works in that bounded mocked/injected case | Not console delivery, real native cleanup, original failure reproduction or ownership |
| Entry and first stop, no stdin outcome | Stop-to-control-call candidate | Stage A has no stdin coverage; not a pipe diagnosis |
| End returned/local finish, no ReadLine return | Local-to-remote control candidate with independently complete reader coverage | Local finish is not EOF; reader may be blocked, unscheduled or observation lost |
| ReadLine return and stop wake, no terminate return | Native termination interval candidate | No hard-bound verdict from post-call clocks; attempt may never return |
| Terminate success, no accounting zero | Accounting/completion interval candidate | Never reinterpret missing/error query as zero |
| Accounting zero, Run intent, no Run complete | Finally/bootstrap return candidate | Intent precedes handle cleanup; error/pre-create returns need different category |
| Helper exit but no child close | Exit-to-close candidate | Inherited output is not automatically an unread Node pipe; identify actual handle lifetime separately |
| Both child close and done/exitcode, held launcher alive | Natural-drain candidate | No new resource dump here; not proof of a specific retained resource |
| Held launcher exit and released owned identities/ports | Process shutdown within separately qualified case | Not root graceful close, SQLite reopen/integrity or durable state |

“Earliest missing valid-stage acknowledgement” means a candidate boundary only after stage completeness, positive preceding anchors, applicable branching and independently qualified transport coverage. A missing Stage B event in Stage A is NOT OBSERVED, never failure. No sequence gap can establish that a specific signal was ignored.

## 9. Future offline validation specification — unrun

Requires separate implementation/fixture authorization. No tests, mocks, compilation or runtime execution occurred for this design.

| Scenario / negative control | Required discriminating expectation |
| --- | --- |
| Disabled gate and frozen baseline | No ack output/new handles; exact original behavior contract, no native execution implied |
| First stop then duplicate | First code/memoized completion unchanged; duplicate capped; one teardown only |
| SIGINT wrapper versus SIGTERM wrapper versus direct stop | Correct callback class; SIGTERM/direct cannot fabricate SIGINT entry; injected emit explicitly non-native |
| Closed sink / synchronous throw / rejected async acceptance | Original shutdown exceptions/codes/order unchanged; record coverage invalid; no retry/wait |
| Loss/ring overflow / saturating count | Completeness denied; missing entry cannot become ignore diagnosis |
| Interleaved, truncated, malformed, wrong-version frames | Reject, do not repair; bounded parser memory and raw capture |
| Boundary hash/runtime/token mismatch | Reject inference even if event order looks correct |
| Reader/main-thread race and out-of-order publication | Preserve per-thread/attempt vs arrival order; no invented cross-clock causal chain |
| ReadLine null / line / exception; pre-create stop | Distinct categories; no payload; no accounting-zero for pre-create/error return |
| Native returning failure / accounting exception or nonzero | No zero ack; original Check/last-error/finally behavior preserved |
| Child exit before close / allSettled before close | No premature done; originals still await close |
| Done assigned but external launcher alive | Never accept self-marker as OS exit |
| Missing entry with intentionally dropped transport | Must report INCONCLUSIVE, not native suppression |

Pure JS callbacks/mocked carriers can check record sequencing/error handling only, not OS delivery or helper correctness. Any separately authorized compile-only check must exclude Add-Type/native execution and process launch; even compilation is not done here. Original source tests remain frozen and unexecuted; their IPC bridge explicitly disclaims native evidence (`C/start-local.test.mjs`:79–81,93–95,140–141,205–209). Static document checks are not runtime verification.

## 10. Prospective reversible overlay and authorization gates

A later overlay manifest must explicitly list only touched sources: Stage A `start-local-processes.mjs` and `start-local.mjs`; optional Stage B `start-local-windows-job.cs` and bootstrap carrier within processes. Add a separate carrier file only under explicit new scope, with its hash; never hardcode an assumed four-file overlay count. Bind baseline hashes, actual overlay hashes, tagged insertion/carrier replacements and exact inverse bytes. Preserve CRLF/encoding/BOM and all original bytes. Removing uniquely tagged insertions and restoring listed replaced spans must reproduce each original SHA-256 byte-for-byte. No AST pretty-print, newline normalization or semantic-equivalence substitution. Carrier replacements for wrapper identities, ReadLine return capture or bootstrap return capture need explicit inverse spans, not a false insertion-only claim.

**No inverse-byte proof has been performed:** there is no applied overlay. Future proof establishes reversible byte identity, not enabled noninterference. Keep prospective fixtures/evidence outside product originals and worktree fixture paths; no dirty root-worktree pollution.

Gates in order:

1. Accept this design through parent independent combined spec/evidence-quality review; acceptance authorizes documentation only.
2. Obtain fresh narrow implementation/offline-fixture authority; resolve bounded writer/collector contract, identity provenance, delivery classification and enabled-observer perturbation. Failure leaves instrumentation NO-GO, not permission for a broad supervisor rewrite.
3. Independently review exact overlays, original/inverse-byte binding and discriminating offline controls; classify mock/compile/source evidence correctly. Passing them does not authorize native calls.
4. Native work remains NO-GO until all stopped-report architecture/deadline/console/source-authority gates independently pass and the user grants a fresh finite packet. A future controlled original-no-reset versus checked NULL/FALSE **before spawn** pair would isolate that intended variable only with identical frozen source/runtime/workload/environment and qualified external ownership/console/deadline evidence. Initial ignore state and Node startup remain measurement obligations. No Ctrl+Break substitution, post-spawn reset or new termination API.

## 11. Actual design verification and unresolved decisions

Fresh provenance archive: `lt-launcher-shutdown-observability-design-offline/` under the private evidence-archives root, created exclusively without overwrite. `preservation-before.json` / `preservation-after.json` bind the six selected inputs; `design-validation.json` records static section/anchor/hash/link/scope checks and deliverable binding; `receipts-manifest.json` inventories those three evidence files. This archive is provenance, not product fixtures or collected acknowledgements. Actual results and manifest hash are supplied in the child handoff; no self-referential manifest hash is embedded here.

Remaining explicit tradeoffs: writer hard bound versus unchanged output/lifetime is unresolved (enablement NO-GO); shared-log identity is not authentication; wrappers require carrier edits rather than pure insertion; loss-free negative coverage cannot be inferred from the same lossy stream; cross-thread causality is weaker than attempt sequence; actual launcher exit requires an independently qualified held observer absent from this stage. These are not silently waived by document acceptance.

Ready for parent review as a concrete design only. Parent publishes atomically and records canonical Beads disposition; the child does not write Git/Beads or touch preexisting `.beads/.migrated-attachments`.

## Parent review disposition

Independent combined specification/evidence-quality review `deleg_97a0b149` **PASS / APPROVED** for documentation only, with no correction required. The reviewer independently checked all six preserved inputs, four source identities, 14 archived anchor ranges, three provenance entries and 12 passing static checks. These are text/hash checks, not executed runtime tests.

Parent verified the three provenance entries and identical before/after inventories. Frozen design SHA-256 is `9d43b0a65e1e5cd6d9097ff0650f09ee1539b29fa8097215e4229983fe78a10c`; provenance manifest SHA-256 is `cca13d9c318e22708380b24e1c5d3635538fef2a9465af8ab5fa00f411fa25de`. This annotation postdates the frozen design binding; no provenance was modified or relabeled. Canonical Beads records the published revision and exact remote readback.

Only `lt-c0r.10` may close for the accepted design. No instrumentation has been applied or enabled, root cause remains unknown, runtime acknowledgement publication remains NO-GO, and native safety blockers and exhausted allowance remain unchanged. Upstream `lt-c0r.4`, `lt-c0r.6` and `lt-a46` remain blocked. Publication of this document does not authorize its implementation or a live run.
