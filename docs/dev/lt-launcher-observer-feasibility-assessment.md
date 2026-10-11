# lt-c0r.11 — bounded SIGINT observer feasibility, source/API only

## 1. Decision and authority

**STOP under the existing constraints.** A private, preallocated marker is a plausible fixed-storage callback-local update, but it is not a recoverable observer. None of the inspected existing retrieval paths supplies independently collected, source-bound SIGINT-entry evidence in the stalled shutdown case without an unqualified writer, new transport/lifetime, changed exit semantics or new native/debugger machinery.

This is a bounded source/API assessment, not a universal impossibility theorem. Local update feasibility is **SUPPORTED WITHIN SOURCE SCOPE**; the inspected whole-observer proposal is **REFUTED WITHIN THE EXISTING CONTRACT**; hard execution bounds, enabled noninterference and actual native reception remain **INCONCLUSIVE / UNQUALIFIED**. No observer candidate survives for implementation in this stage.

Only this Markdown file is a repository deliverable. Pure text/hash operations and public official-document retrieval were performed. Zero product launches, host candidate imports/tests/compilation, guest launches, instrumentation, fixtures, harnesses, native DLL/API/process/job/console operations, helpers, console events, diagnostic prepare/live CLI or original-packet execution occurred. No application/browser/SQLite/provider/model/install/deploy or learner-state actions occurred. Reading archived JSON receipts is not querying SQLite or running the application.

The parent owns Git publication, Beads disposition and independent combined specification/evidence-quality review; this child performs no Git/Beads writes or task closure. At most one parent-approved documentation correction is available; none used at delivery. No automatic architecture pivot or manufactured experiment follows this STOP.

The accepted [source analysis](lt-launcher-shutdown-source-analysis.md), [acknowledgement design](lt-launcher-shutdown-observability-design.md) and [STOPPED native binding assessment](lt-native-controller-binding-evidence.md) remain unchanged. This assessment does not enable the earlier design. Both live guards, exhausted allowance and blockers on `lt-c0r.4`, `lt-c0r.6` and `lt-a46` remain unchanged; accepting this document does not qualify shutdown or diagnose inherited ignoreCtrlC.

## 2. Predeclared prediction and verdict criteria

The criteria separate update from recoverability; they are not assertions that a new experiment ran.

**Prediction A — local storage:** preallocate one private ordinary lexical boolean before listener registration; a correctly identified SIGINT carrier sets it before calling the unchanged stop body. The update requires finite constant source-level work, no growing buffer and no callback-time formatting, clocks, hashes, counters, explicit allocation, logging, file/native calls, promises or waits attributable to the marker.

- Support within source scope: a finite private-state update can be placed at the callback seam without a publication call or new handle.
- Refute: source/API requires a growing record or fallible/unbounded publication in that local update, or cannot distinguish SIGINT from another caller.
- Inconclusive: source cannot prove runtime timing, absence of GC/JIT/page faults, scheduling or enabled noninterference. No hard nonblocking or universal no-GC claim follows from finite source steps.

**Prediction B — recoverable observer:** an already available, unchanged observation contract can retrieve a source-bound positive marker while the launcher remains alive after entry, including stop/done pending, and can preserve collected evidence before subsequent forced cleanup. Retrieval must not require shutdown completion, new referenced resources/transport, unbounded I/O, modified product exit codes or new native/debugger ownership machinery.

- Support: identify an actual existing recovery path satisfying those obligations for the relevant failure state, with independently bound callback identity, source/runtime and collection semantics. A positive-only observer need not establish loss-free negative coverage to provide a useful positive result.
- Refute within inspected options: each concrete existing path fails at least one required obligation. That rejects this candidate under this contract, not every conceivable future observer architecture.
- Inconclusive: unknown runtime/API binding or collection guarantees cannot be treated as success. A missing, uncollected or lost marker remains inconclusive, never evidence that SIGINT was ignored.

The question is recoverability during a live stall, not merely whether a boolean could be inspected after successful shutdown. Source inspection settles the existing-path mismatch; a new runtime experiment is neither necessary to establish that mismatch nor authorized.

## 3. Exact input identity and inspected source contract

`C` denotes archive-relative `lt-a46-candidate-2026-10-10/candidate app żółć/scripts/` beneath the private evidence-archives root. These are the original bytes, not today's candidate worktree sources.

| Frozen source | Bytes | Lines | SHA-256 |
| --- | ---: | ---: | --- |
| `C/start-local.mjs` | 1218 | 24 | `a65acfbda623645872816151691680769b41a0932254e013bcb6a712a9bddfce` |
| `C/start-local-processes.mjs` | 5600 | 135 | `ed417f114cf4a4b4d240242a30efc7a6322d9d63bd1ae93293711e13ec41627e` |
| `C/start-local-windows-job.cs` | 9459 | 163 | `d4d44259617f013ca4d886ac53685a734b136af6c049cbbdf3cacd0a15355540` |
| `C/start-local.test.mjs` | 16885 | 319 | `6eb99163684c89b2871022bf2d2e101ef544a27f939855dd819bb37286b88df0` |

Worktree base: `bd48e9208e0c0a111bd745794329f28149ae05c2`, branch `work/lt-observer-feasibility`. Read-only Git reported a clean starting worktree and primary HEAD `147081a13cf5650b30ab719142b1ef7f31132f5f`.

**SOURCE FACTS:**

1. Processes:104 defines the shared `onSignal` body calling `void stop(0)`; :105–106 register it for SIGINT and SIGTERM. A marker in that undifferentiated body is not by itself a SIGINT marker. Registration precedes the child loop (:108).
2. Stop:87–102 retains first-stop/memoized completion, schedules teardown in a promise continuation, unconditionally awaits all direct-child `closed` promises (:94), removes the same listener identities (:95–96), then resolves done (:98).
3. **The actual public return is `{ done, stop }` (:134), not `{ children, stop, done }`.** `children` is local state. Neither returned property exposes observer state or external heap access. A new getter/snapshot or extra return field would be a prospective API/carrier change, not reuse of an already exposed marker.
4. Launcher:13–19 retains that returned object in its own JS process and assigns `process.exitCode = await launcher.done`. It does not call `process.exit()`, publish a diagnostic result or return a value across the OS-process boundary.
5. Windows helper stdin is the existing control pipe, while stdout/stderr are inherited (:32). `child.stdin?.end()` (:63) is a stop request, not a marker-retrieval protocol. The helper's ReadLine/stop event (:92–97), termination/accounting (:137–148) and finally (:154–160) do not expose the launcher's private JS state.
6. Child `close`, not `exit`, resolves the original completion promise (processes:117–128). A new observer cannot replace that wait with earlier exit and claim unchanged semantics.
7. The fixture's bridge (:79–81) is created by the test, imported explicitly (:93), and spawned with an extra `ipc` stdio slot (:94). It receives a synthetic message, disconnects and calls `process.emit(signal)`. The actual archived launcher invocation has no such bridge. Those source tests were read, not imported or executed.

A selected preserved `lt-a46-live-attempt-2026-10-10/outputs/result.json` error/traceback identifies the launched executable path as `node-26.7.0-win32-x64/node.exe`. Its separate `runtime` array is PowerShell/.NET (`7.6.6`, `10.0.12`), not a Node version receipt. This provides the historical Node path/version association used to select official **v26.7.0** docs; it is not new binary execution or verification of its embedded version/build/hash. No current `node --version` was substituted for the archived runtime.

## 4. Smallest local marker — prospective only

Select an ordinary private lexical boolean initialized before registration and set to true at an explicitly bound SIGINT carrier before forwarding to the unchanged stop body. This is less machinery than allocating a typed-array buffer for one bit. A preallocated private `Uint8Array` slot could also bound logical storage, but adds backing-store lifetime considerations and still offers no existing external retrieval path. Neither variant is implemented here.

The earlier accepted design selects distinct SIGINT/SIGTERM wrappers with matching removal identities (design:43). Retain that prospective carrier requirement: wrappers are an explicit source change, not insertion-only, and must preserve existing ordering, first-stop behavior and listener removal. Do not expose the mutable cell, invoke a user getter/setter in the callback, or label arbitrary direct stop calls as signal entry.

**API nuance:** the retrieved version-specific process documentation explicitly says the signal handler receives the signal name as its first argument. That is official Node native-event semantics, not a guarantee for the injected `signals` EventEmitter or the fixture's `process.emit(signal)` without an argument. The frozen function currently ignores arguments. This nuance does not qualify a marker, authenticate native delivery, relax the earlier selected wrapper contract or repair the prior document. No assumption about synthetic callback arguments is used here.

One sticky bit reports at least one entry, not multiplicity, timing, first stop cause, native origin, stop acceptance or successful teardown. If a stop was already pending, entry remains a distinct fact. Repeated writes do not grow storage. A later same-thread private snapshot can copy a boolean, but exposing or scheduling that snapshot is new carrier work, and getting it outside the launcher is still publication.

**Verdict A: SUPPORTED WITHIN SOURCE SCOPE for logical fixed storage and finite explicit update steps.** Absolute callback execution bound and zero perturbation are not established by Node API docs or static source. Runtime allocation/GC, event-loop dispatch, OS scheduling and abnormal termination remain outside this proof. Preallocation removes an explicit callback allocation requirement; it does not establish hard real-time behavior.

## 5. Retrieval inventory and disposition

| Inspected path | Available contract / source or API evidence | Why it does not qualify this observer |
| --- | --- | --- |
| Read returned launcher object in the same process | `{ done, stop }`; launcher owns the object | No marker/getter exists. Adding one changes the API; an outside Python/process observer does not possess that JS object. Even a local snapshot is not external collection. |
| Read only after `await done` | Launcher:19; finish follows all `closed` waits | If stop/close stalls, that boundary is unreachable. If done resolves, a local value still needs external transport. A successful-done-only diagnostic cannot resolve the target pending-done failure. |
| Invoke stop again / infer from completion code | First stop wins; done returns original status | Cannot distinguish SIGINT entry from SIGTERM/direct stop/other causes. Encoding marker in exitCode changes product semantics and remains unavailable while alive. No new process.exit or overloaded code is permitted. |
| Poll getter or schedule timer in launcher | No existing marker query loop | New observer scheduling/lifetime, still requires JS progress and external publication. A blocked JS thread cannot execute a requested ordinary JS getter; responsiveness is unqualified, not supplied by private memory. |
| Existing stdout/stderr/log consumer | Inherited output; historical controller redirects output to file | Windows file writes and pipes are synchronous under the retrieved Node I/O contract; fixed bytes and swallowed exceptions do not bound write duration. Windows TTY async behavior also does not establish externally collected bounded delivery. Deferred flush cannot repair a stalled/terminated process. |
| Existing control stdin | Parent-to-helper EOF protocol | Does not return launcher state. Adding acknowledgements, readback packets or a second direction changes transport and lifetime; no such channel is approved. |
| Fixture `child.send` / process IPC | Test-only extra channel and imported bridge | Not the actual launcher contract. Requires serialization, message handling and channel lifetime. Send callback is not recipient receipt; backlog/disconnect/loss matter. `.unref()` alone does not prove unchanged lifecycle or bounded receipt, and the bridge disconnects before synthetic emit. |
| beforeExit / exit handlers | Node process lifecycle events | beforeExit needs an empty event loop, may extend lifetime by scheduling work and is absent on explicit termination. Exit listeners allow synchronous operations only; queued work is abandoned. Neither provides a pre-stall retrieval boundary; synchronous late output can block. Forced OS termination need not run them. |
| Forced cleanup followed by readback | Existing cleanup removes owned identities | Volatile private JS state is not collected merely by termination. Existing exit/PID/listener readback has no marker payload. Loss before collection remains inconclusive. |
| External ReadProcessMemory | Microsoft requires PROCESS_VM_READ and a target base address | A held identity/exit handle is not a qualified heap-marker contract. Needs new native operation, rights, explicit stable address/backing-store and lifetime binding; no supported mapping from this private lexical value is present. Do not assume V8 internals/GC layout or scan the heap. Outside scope; not a universal claim that all backing stores move. |
| Inspector / debugger / heap snapshot | Inspector sessions/protocol; opening host/port; snapshot operations | New debugging machinery, exposure, protocol/ownership, allocation and perturbation obligations. No qualified preexisting inspector channel was identified. Not an unchanged safe retrieval path, and no hard response/deadline guarantee is supplied for this failure state. |
| Shared memory / worker / mapped native buffer | No cross-process marker mapping in inspected sources | Preallocated JS storage is not automatically process-shared storage. New mapping, synchronization, observer and lifetime/ownership contract would be a different architecture, not the approved bounded candidate. |
| Diagnostic report / crash/core dump | report.writeReport writes file/stdout/stderr; snapshot is separate machinery | New I/O/privacy and capture/deadline obligations. API documentation does not promise automatic recovery of an arbitrary lexical marker. No report/dump or memory inspection was generated. |

**Verdict B: REFUTED WITHIN THE INSPECTED EXISTING CONTRACT.** The decisive counterexample is entry followed by an indefinitely pending stop/done boundary: private state may be set, but the existing contract has no way to retrieve that bit as a bound external positive receipt. Moving output later removes callback publication but does not make that unreachable retrieval happen. Forced cleanup then loses an uncollected volatile value. The conclusion does not rely on requiring loss-free negative evidence for a positive-only diagnostic.

## 6. Official API evidence and version limits

Public official pages were retrieved on **2026-10-11 UTC**; private provenance records capture time `2026-10-11T18:06:28.957479+00:00`, URLs, snapshot identities and selected receipt fields. That clock was obtained using Python UTC time, not inferred from the conversation date. It is documentation capture time after retrieval, not an invented per-request server timestamp. Three extracted Node pages are preserved in full; ReadProcessMemory has a selected verbatim excerpt.

- [Node v26.7.0 process](https://nodejs.org/download/release/v26.7.0/docs/api/process.html): sections Signal events, beforeExit, exit, process.exit, process.channel, process.report.writeReport and A note on process I/O. Quotes: “Listener functions must only perform synchronous operations”; “Synchronous writes block the event loop until the write has completed.” Setting exitCode permits natural drain rather than forcing completion.
- **Exact platform distinction from that retrieved I/O section:** files synchronous on Windows and POSIX; TTYs asynchronous on Windows, synchronous on POSIX; pipes/sockets **synchronous on Windows, asynchronous on POSIX**. Do not invert this platform table or generalize all writes as asynchronous. This differs from an informal expectation that Windows pipes would be async; the frozen official excerpt is the evidence used here. The historical launcher log is file-directed, so the rejection does not depend only on pipe classification.
- [Node v26.7.0 child_process](https://nodejs.org/download/release/v26.7.0/docs/api/child_process.html): close occurs after process end and stdio closure; IPC requires an existing channel; channel ref/unref affects event-loop lifetime; subprocess.send callback occurs after send but before the child may receive it, and false can indicate closed channel or unsent backlog. Acceptance is not collector-read proof.
- [Node v26.7.0 inspector](https://nodejs.org/download/release/v26.7.0/docs/api/inspector.html): inspector.open activates a host/port; wait=true blocks for debugger connection; close blocks until the inspector server stops. Its heap-profiler example uses snapshot chunks/file writes. None supplies an existing bounded external observer in these sources.
- [Microsoft ReadProcessMemory](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-readprocessmemory): requires a process handle with PROCESS_VM_READ, a base address and accessible requested range. This documents a native capability, not a safe address/recovery contract for private V8 state.

These are official API semantics, not executed observations of the archived binary, native console reception or GC. Latest Node documentation was not silently substituted for the historical version. Unknown runtime startup/console state and writer/collector timing remain unqualified. No native API was called to validate the documents.

## 7. Evidence meaning and unchanged terminal stop

A separately authorized future **collected positive** would need exact source/overlay/runtime binding, a SIGINT-specific callback carrier and independently established collection from that invocation. It would prove callback entry, not native console causation unless delivery class/recipient evidence were independently qualified. It would not prove first stop, EOF, job-empty, helper close, launcher exit or graceful SQLite durability.

An absent bit, missing getter response, lost buffer, missing late output, disconnected channel or killed launcher is **INCONCLUSIVE**. Do not promote that to “signal ignored.” Registration evidence does not authenticate reception; a self-marker does not authenticate external ownership or exit. No marker collected in this assessment exists.

Known source/API facts support local fixed-storage update, but fail the existing retrieval contract. Unknowns include exact enabled-observer perturbation, runtime hard time bound, effective original native reception/ignore state and any future externally qualified collector. The original root cause remains **UNKNOWN**.

**Terminal decision: STOP.** Do not implement a marker, getter, wrappers, output flush, IPC, shared mapping, worker, native reader, debugger or supervisor under this assessment. No surviving candidate is handed forward for testing. Any materially different retrieval architecture would require fresh explicit scope and independent review, not an automatic follow-on. Source settlement is sufficient here; do not manufacture an experiment. Accepted packaging/runner/supervisor/cleanup discovery would be required before any later separately authorized guest launch; zero launches are permitted now.

## 8. Preservation and actual static verification

Fresh exclusive private archive: `lt-launcher-observer-feasibility-offline/` beneath the evidence-archives root. It contains selected input before/after inventories, three public-document text snapshots, official API/runtime excerpt provenance, static validation and a receipt manifest. The manifest uses explicit `{schema:1, files:[{path,size,sha256}]}` entries relative to that archive; it does not hash itself.

Preservation scope is **eight unique inputs**: four frozen source files, the three current accepted report files and the selected preserved result JSON. No claim to reverify prior six-input design, 416/417-input analyses or full candidate/dependency archives is made. The three report bindings include parent annotations, not the older pre-annotation frozen hashes. No database/credential files, global scans or dirty original candidate imports occurred.

Static validation checks exact original hashes/sizes/line counts, selected source-anchor strings, version-specific API excerpt presence, local links, required decision/scope sections and identical before/after selected inputs. These are text/hash checks, not collected test identities, runtime tests, native ABI qualification, deadline experiments or proof of enabled noninterference. Deliverable size/line/hash and actual validation/manifest results are provided in the child handoff, without recursive document self-hashing.

Parent review/publication remains pending at this child delivery. A documentation-only acceptance may dispose of `lt-c0r.11`; it cannot release the upstream runtime/native assertions or consumed allowance.

## Parent acceptance

Independent combined source/API and specification/evidence-quality review `deleg_18ec04e2` **PASS / APPROVED** for this documentation-only STOP assessment; no blocking finding or correction required. The reviewer checked the frozen source contract, independently re-retrieved the version-specific official API pages, and rehashed all eight selected inputs and eight manifest entries. The initial failed static quote matcher is preserved in `assessment-validation-initial.json`; the corrected matcher used the same preserved page and produced 14 passing static checks. Neither result is runtime testing.

Parent verified all eight receipt-manifest entries and the frozen report binding: SHA-256 `353bd19b466c1057306a4137c09f33ca0264e1db4ffb70b828ba1c516e1fa78d`, 21,955 bytes, 120 lines. Manifest SHA-256 is `9c58629b257f1f829510ddfe541c3a6670d8e1a33ad0fa8d3dae8866dd4b2909`. This acceptance annotation postdates that report binding; no archived evidence was changed or relabeled. Canonical Beads records publication and exact remote readback.

Acceptance closes only the feasibility assessment, not the shutdown failure. No observer candidate advances to implementation, no host candidate tests or guest/live runs occurred, root cause remains unknown, and the upstream blockers, live guards and exhausted allowance remain unchanged.
