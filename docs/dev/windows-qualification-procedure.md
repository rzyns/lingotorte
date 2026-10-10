# Windows qualification procedure — content-bound combined candidate

**Status: planning only; not authorization to execute.** `lt-a46` remains blocked. This procedure neither repairs the product nor resets a retry budget. No live service, integration probe, browser, installation, provider, learner-state operation, commit, or Beads mutation is authorized by publishing it.

Qualify one combined launcher/native-path/Python candidate, not separately green branches assembled by inference. Follow the [Windows platform contract](windows-platform-contract.md) for acceptance and the [local runbook](local-runbook.md) for historical operator context. The principal risk is evidence against the wrong bytes or a broken harness, rather than a missing positive control.

## 1. Freeze the combined candidate before choosing an execution

The planning worktree starts at `828dbfcf9e0bd04dddda8be5dae31f7153a143fe`. That revision contains the published Python work; it is **not** the dirty launcher/native-path integration candidate. The historical integration snapshot used base `2b005926966418769293d9abede5d91be61d145d`, plus exact working bytes. Neither revision alone identifies a future combined candidate.

The parent must review and select one combined candidate under separate implementation/execution authorization. Record its base revision and every included modification, addition and deletion in a deterministic, content-bound manifest. Do not copy the dirty implementation into this documentation branch. Require the following identity before any runtime claim:

- Sorted relative path inventory, byte size and SHA-256 per included file, explicit deletion list, source worktree/branch/base revision, and manifest digest. A revision label or diff summary alone is insufficient for uncommitted bytes.
- Exact launcher closure: `scripts/start-local.mjs`, `scripts/start-local-processes.mjs`, `scripts/start-local-windows-job.cs`, and `scripts/start-local.test.mjs` when selected.
- Exact native-path closure: `apps/local-service/src/nativeConfig.ts`, `packages/domain/src/nativePaths.ts`, `packages/domain/src/nativePathsNode.ts`, and all consuming service/browser/storage/adapter sources and regressions. Include package entrypoints and exports, not only new helpers.
- Exact Python closure: `packages/local-transcription/src/index.ts`, `scripts/faster_whisper_transcribe.py`, `scripts/whisperx_align.py`, `tests/core/localTranscriptionPipeline.test.ts`, interpreter-selection helpers and their importing tests/fixtures. The combined bytes must contain the reviewed published Python repair; do not silently retain the older integration copy.
- `package.json`, `package-lock.json`, workspace/vendor manifests, Vite/Vitest/TypeScript configuration, test setup, ancestor/imported fixtures, all synthetic resources and the full transitive source/import closure. Include vendored dictionary data actually resolved by the app.
- Exact preparation, URL/resource checker, orchestration, native-console and cleanup harness files/configuration; hash their inputs and output schemas. Give any harness amendment its own identity while preserving the original frozen harness and receipts.
- Dependency graph/lockfile identity and actual installed versions/resolution targets used, including reused third-party dependencies and repository/vendor aliases. Record installed closure integrity/content identity, not just requested version ranges. Bind mutable caches separately; caches cannot substitute for source identity.

Prefer a complete tracked-source snapshot plus explicitly reviewed untracked code/test files over directory/extension selection. Inspect the path inventory **before reading bytes**: exclude environment/credential/private-key/runtime-store artifacts and dependency/build caches; reject escaping links. Any exclusion intersecting required closure is a blocker, not permission to omit it. Enumerate and hash all tracked fixtures, including media, subtitles and transcript assets. Do not import `.env`, original `.git`, real databases, browser profiles or Beads stores.

Use fresh external synthetic snapshot/state/cache paths containing spaces and Polish Unicode. Establish standalone snapshot Git metadata only under future explicit authorization, with isolated Git configuration and the snapshot as cwd; do not run `bd init`. Verify `repositoryRoots()` recognizes only the intended snapshot. Repository-package and vendor aliases must resolve to snapshot bytes, never primary/other-worktree sources. Record third-party mappings separately. Pre/post hash checks and resolved-target readback must bind every execution to this same candidate; drift invalidates combined qualification.

## 2. Offline harness preflight — before listeners or a retry decision

This phase must be independently reviewable without starting Vite, the service or a browser. Publishing the procedure does not perform it. Static checks must cover:

1. Complete file/import/resource closure; package exports and Node ESM targets; required fixture presence and hashes; snapshot-local repository/vendor resolution. Resolving Vite configuration must not construct a listening server. Its config temporaries and cache targets must remain snapshot-local or explicitly external, never in the source checkout.
2. Synthetic root validation and environment allowlist: external data/SQLite/scratch/model-cache/home/profile/app-data/TEMP/TMP/TMPDIR; providers explicitly disabled and credentials absent. Preserve DB/cache separation, scratch ownership and checkout exclusion. No default learner store may be opened.
3. Pure URL transformation and parser roundtrip tests using the **actual proposed checker**. Logical `/@vite/client` must remain literal `/@vite/client` in the HTTP request target, not `/%40vite/client`. Record input, transformed URL and request path. Treat `/%40vite/client` as a distinct negative vector, never an alias. Also exercise spaces/Unicode, existing escapes, query strings, relative imports and recursive Vite module URLs without double encoding or changing routing semantics.
4. Offline canned-response checks: a JavaScript resource receiving HTTP 200 `text/html` must fail; a valid JavaScript body containing the literal text `Internal Server Error` must not fail on that substring alone. Assert status, MIME and expected resource bytes/identity as appropriate. Canned responses qualify the checker only, not the application.
5. Bounded process tracking/stop windows, exact handle-based ownership, execution markers, sole-launch lock, and independent final readback design. Preserve the existing `track`, `ctrl_c`, `wait`, and `close` lifecycle semantics and all assertions below; show an explicit source/AST comparison for any changed harness. No fallback cleanup may run before lifecycle outcome is captured.

A failed offline preflight is a **harness/precondition failure**; it cannot justify product changes or consuming/restarting an integration attempt. Stop and seek a disposition. A passed preflight likewise does not grant a fresh end-to-end attempt. No execution is permitted until the parent obtains an explicit new disposition for the exhausted historical lane.

## 3. Record prerequisites, including the selected launcher architecture

Record exact OS/build/architecture, Node executable/build, npm and resolved dependency graph, selected Python executable/version if used, and Edge executable/build for its separate browser lane. Preserve contract targets: Windows 11 x64, Node 26.7.0, Edge 156.0.4314.15, CPython 3.14.7 for help/fake tests only. If installed builds differ, explicitly select and qualify the replacement tuple; do not install or freeze security updates to recreate an old receipt.

Read-only inspection of the current dirty launcher found a PowerShell bootstrap calling `Add-Type -TypeDefinition` on `scripts/start-local-windows-job.cs`, then native `CreateProcessW`/Job Object ownership. If that architecture is chosen:

- Require parent acceptance of **PowerShell 7**, resolved by the launcher at `%ProgramFiles%/PowerShell/7/pwsh.exe`, plus a usable in-memory `Add-Type` C# compiler/runtime under the exact execution policy and synthetic Unicode TEMP environment. Node alone is not sufficient. Record the executable, PowerShell/.NET versions and compiler availability/result; executable presence is not compiler proof.
- Historical focused receipts used PowerShell 7.6.6 / .NET 10.0.12. Inbox PowerShell 5.1 failed a Unicode TEMP compilation probe; it is not an equivalent fallback or qualification.
- Under future explicit preflight authorization, validate compilation without invoking the owner `Run` method or launching children. Missing/restricted PowerShell/compiler is a prerequisite failure: no install, policy relaxation, global TEMP change or unowned Node fallback.
- Record `POWERSHELL_TELEMETRY_OPTOUT=1` and `POWERSHELL_UPDATECHECK=Off` before helper startup. These controls do not prove network-egress containment. Compilation/metadata evidence is separate from process-lifecycle acceptance.

Python selection is service/operator-owned: explicit `LINGOTORTE_PYTHON_PATH` is one executable token, otherwise `python` on Windows and `python3` on Linux. A bad explicit override fails without fallback. Required help/fake-module tests may not be silently skipped. No ASR package/model availability is inferred from CPython help/fake success.

## 4. Preserve the application/lifecycle assertions unchanged

Only a separately authorized, fresh immutable attempt may exercise the real candidate launcher, actual service, real Vite and native file-backed SQLite. Synthetic child stand-ins are complementary launcher controls, not substitutes. Keep fixed loopback origins `127.0.0.1:5173` and `127.0.0.1:5174`; record free-port/ownership prerequisites and bounded execution before launch.

| Gate | Required evidence (not waived by harness amendments) |
| --- | --- |
| Existing positive controls | Both real endpoints ready; health/status schema and Windows path policy; providers disabled/key absent; listener ownership and loopback bind. Actual Vite HTML, literal `/@vite/client`, recursively served application imports and exact fixture responses. HTML alone or static closure is not resource-graph PASS. |
| Persistence | Initial `/api/state`, synthetic PUT/save, exact API readback; native SQLite close/reopen, integrity and persisted-value assertions; restart and API readback of the same values. Do not infer graceful SQLite durability from forceful kernel-job termination. |
| Native Ctrl+C | Dedicated owned console, actual `CTRL_C_EVENT`, expected clean launcher exit, stop acknowledgement and absence of all held owned identities/listeners inside the original stop window. Emitted SIGINT or IPC handler dispatch is not native console delivery. |
| Occupied foreign listener | Pre-existing controlled foreign listener survives unchanged; startup fails; every candidate-owned sibling/owner/descendant is gone. Do not kill a foreign listener to make the ports free. |
| Premature exit | Nonzero and premature-zero child exits are failures; sibling/descendant teardown is complete. Preserve the discriminating exited-root/detached-descendant control, as well as existing live-sibling and owner/launcher-death controls; do not weaken ownership assertions. |
| Owned-process cleanup | Track launcher, helper owners, children and descendants by held identities; record stop/result before recovery; independent final process/listener inventory and lock absence. Empty final inventory after forced recovery is safety evidence, not clean-lifecycle PASS. |
| Combined regressions | Existing baseline plus portability/Python/launcher tests, `test`, `test:no-network`, typecheck, build, privacy and diff checks on this content identity, with exact failures/skips and harness errors. Historical focused GREEN is not the combined gate. |

Assign each assertion **PASS / application FAIL / harness FAIL / prerequisite BLOCKED / NOT REACHED** with raw receipt references. Failure classification must follow the exact traceback, HTTP request/response or process receipt, not historical resemblance. Stop on the first failed execution; record later assertions as NOT REACHED rather than failed or passed. Keep recovery outcome/time/ownership separate; an eventual empty inventory never repairs a stop-window failure or permits another automatic run.

## 5. Separate browser, Linux and optional ASR lanes

The actual Edge journey requires its own authorized execution and exact candidate/runtime identity, disposable **fresh empty profile**, synthetic files and loopback-only traffic inspection. Cover shell/rendering, synthetic import/playback, native-path feedback/API agreement, save/reload, file-picker/handle persistence and permission denial, fallback file selection, restart/relink identity and shutdown. Observe phase ownership: portability smoke belongs to `lt-13v`; completed identity-preserving relink belongs to `lt-n31` and later integrated acceptance. Do not turn fake DOM, resource fetches or native-job fake runners into browser evidence. Existing restore UI/receipt behavior is historical and is not repaired restore acceptance.

Native Linux remains unqualified until the **exact** OS/architecture, Node, dependency/content manifest, Python (if used) and browser tuple receives native process/SQLite/regression/browser evidence. Windows `path.posix` tests preserve lexical coverage only. Linux certification is not a prerequisite for the Windows milestone and historical Linux/systemd/ASR receipts cannot certify the current tuple.

Real ffmpeg/ASR/alignment is optional, separately consented and separately versioned by Python/packages/tools/models/hardware. Core acceptance needs no provider, model download, package install or real media. Silence-fixture zero segments prove neither ASR quality nor daily-driver acceptance.

## 6. Historical evidence and reporting boundary

Preserve, do not edit or rerun, the integration worktree's `docs/dev/lt-a46-launcher-evidence.md`, `docs/dev/windows-launcher-integration-evidence.md` and `docs/dev/windows-launcher-complete-snapshot-evidence.md`, including external artifact hashes and all failed receipts. Those files belong to the historical integration worktree; they are not assumed present in this amendment branch.

- Focused launcher controls reported 13 passing tests and separate synthetic native Ctrl+C on the Job Object architecture. They do not qualify the real combined application or authorize closure.
- Three selective-copy attempts failed on missing Git metadata, a checker substring assertion, and omitted tracked synthetic fixtures. The approved complete snapshot superseded that copy mechanism, not its frozen failures or exhausted budget.
- The single approved complete-source execution then failed on logical `/@vite/client` becoming actual `/%40vite/client` and returning HTML. Persistence, native application Ctrl+C, restart, occupied-port and premature-exit assertions were NOT REACHED. Recovery left no owned processes/listeners but was not a lifecycle pass.
- Published Python revision `828dbfcf9e0bd04dddda8be5dae31f7153a143fe` did not refresh that frozen older snapshot. Combined qualification must bind the reviewed Python repair and launcher/native paths together in new exact bytes, under a new explicit disposition.

A final report must name candidate/base/manifest, harness/dependency identities, prerequisite tuple, each reached/unreached gate, failed attempt and recovery receipts, and separately outstanding browser/Linux/real-ASR scope. Parent owns review, authorization, any later tracking/commit/restoration amendments and Beads state. This planning amendment grants no retry and closes no issue.
