# lt-c0r.3 — single authorized live Windows attempt

## Disposition

**Qualification failed at native Ctrl+C shutdown. No retry or repair was performed.** User explicitly authorized one bounded live attempt after offline harness approval: “Authorized, please proceed”. Canonical `lt-c0r.3` records that scope. The old exhausted allowance was not reset; this new one-attempt disposition is consumed. `lt-a46` remains blocked and `lt-13v` remains open.

Only the reviewed successor and isolated synthetic candidate were invoked. No browser, real learner data/media, provider/model/install, deployment, product source edit or acceptance closure occurred. Existing historical dirty worktrees were untouched.

## Content identity and raw receipts

- Candidate base: `147081a13cf5650b30ab719142b1ef7f31132f5f`, plus the exact four-file launcher overlay documented in [preparation evidence](lt-a46-preparation-evidence.md).
- Harness packet: `C:/Users/jmdzi/AppData/Local/lingotorte/evidence-archives/lt-a46-harness-binding-2026-10-10-v3`.
- Harness manifest SHA-256: `3e9c9dde6380d6a865a0c131f643f368dc333a067d1a4bc8ad1e7627b0795aa7`.
- Binding SHA-256: `b02892f3f145d00eee98b82257419ebebf0ebaa4a64e01fbafe360ba0c7f171d`.
- Successor SHA-256: `a9d8bb8370dc96e26f6198e7f5c8b9e115304945b04eda6b7ac8646585ec87b5`.
- Disposition SHA-256: `8ab0d7d4b88d3b9fbc11b877d2e4b7e3a6cdb0b8cbb55da9154e8aa5e02914f4`.

Attempt receipts: `C:/Users/jmdzi/AppData/Local/lingotorte/evidence-archives/lt-a46-live-attempt-2026-10-10`.

Its `manifest.json` SHA-256 is `f94547db898675c0159fcdea4386894218320873d57266bb28ea56776db423d4`, binding 14 local payloads. It contains the disposition, one-shot invocation, exact command/exit receipt, stdout/stderr, independent readback and copies of five packet outputs under `outputs/`: result, app log, resource graph, expected synthetic snapshot and execution marker. Copy/source equality and all receipt hashes were checked. Raw artifacts and synthetic database remain local, not committed.

The orchestration ran once, from **2026-10-10T22:43:18.814565Z to 22:44:17.219385Z**, and returned exit **1**. The parent receipt wrapper completed successfully while reporting that failing child code; its own exit 0 is not qualification success. No execution marker/lock/database existed beforehand; ports 5173/5174 were free. Preflight and postflight verified unchanged 378 source, 16,886 dependency, 22 candidate-receipt and 15 harness-input files. Installed dependencies remain mutable mapped bytes, not archived independent dependencies.

## Reached and unreached gates

| Assertion | Actual result / evidence |
| --- | --- |
| Exact candidate/harness/runtime binding | PASS before and after invocation; `source_prehash` / `source_posthash` and anchored packet verification. |
| Real launcher, service and Vite readiness | PASS; exact health schema, Windows path policy, provider-off/key-absent assertions, both listeners bound to 127.0.0.1 and held candidate-owned processes. |
| Actual Vite resource/fixture graph | PASS for the checker’s served literal-import closure: **62 resources**, including literal `/@vite/client` with JavaScript MIME; all **3** fixture byte/WebM/raw-export checks passed. Dynamic nonliteral imports remain reported, not executed. This is not browser evidence. |
| Initial synthetic state | PASS; empty snapshot assertion reached and recorded. |
| Synthetic PUT and API readback | PASS; `save_response.ok` true and exact snapshot readback assertion completed before `expected-snapshot.json` and synthetic item were recorded. Not graceful-close durability. |
| Native Ctrl+C clean shutdown | **FAIL, attribution unresolved**; console attach/handler/generation calls returned success, then the launcher remained alive through the preserved 20-second stop window and final 1-second wait. No clean exit/stop acknowledgement was obtained. |
| Native SQLite reopen/integrity and restart readback | NOT REACHED; execution stopped before `native_sqlite_reopen` and restart scenario. The synthetic DB exists, but was not reopened here. |
| Premature child/foreign listener survival | NOT REACHED; no later scenario launched. Premature-zero/detached-descendant controls also not qualified by this probe. |
| Successful owned-process cleanup inside stop window | FAIL to establish; no normal `pid_readback`/`launcher_exit` receipt because the wait raised first. Recovery results below do not repair this gate. |
| Combined regressions/typecheck/build/privacy; Edge/Linux/ASR | NOT REACHED in this attempt. Earlier offline suites are not substituted for combined qualification. |

Traceback in `outputs/result.json`: successor `main:224` → `ctrl_c:164` → `wait:169` → `subprocess.TimeoutExpired`. The exception’s “1 seconds” is the final wait, **after** the 20-second loop; it is not the entire stop allowance. `outputs/ready-save-native-ctrl-c.log` contains startup only, with no shutdown acknowledgement. This proves the failed observed native-stop behavior, not whether the underlying cause is console delivery/harness/native setup or application signal/teardown behavior. No root cause is asserted without evidence.

## Recovery, separately recorded

The unchanged harness recovery terminated six active held identities: launcher, console host, two PowerShell owners and two Node services. All six held-handle final readbacks reported dead. Final listener inventory was empty and the sole-launch lock was removed; the execution marker remains to prevent another run.

Parent independently corroborated all six PIDs absent and no TCP listeners on 5173/5174; `independent-readback.json` labels this PID-only corroboration, distinct from the harness’s held-identity evidence. Recovery is safety containment, **not clean Ctrl+C, graceful SQLite durability or lifecycle PASS**. The exact synthetic database artifacts are hashed in `synthetic-database-artifact.json` and remain in the isolated packet state for review; no query/reopen or real store access followed.

## Stop point

Independent read-only review (`deleg_853e10f2`) confirmed the classifications, both receipt/harness manifests, exact fixture hashes and preservation boundaries. It counted 122 graph edges and 65 URL transformations in addition to the 62 resources and 3 fixture checks. No further test or invocation was performed during review.

Separate source-confirmed qualification risk, **not the diagnosed timeout cause**: candidate `scripts/start-local-processes.mjs:59–73` requests helper shutdown through stdin EOF; `scripts/start-local-windows-job.cs:47–51,89,125–128,137` ignores helper console events, creates service children in new process groups and terminates the job on stop. Even a successful launcher exit would not alone prove the service's `apps/local-service/src/server.ts:1154–1159` graceful-close handler ran. Keep graceful SQLite durability as a separate unmet gate. The smallest proposed diagnostic is bounded acknowledgement evidence at launcher SIGINT entry, helper EOF receipt and job-empty completion; that diagnostic was **not implemented or executed**, and is not permission for another attempt.

Preserve this failed attempt and all previous packets unchanged. No allowance remains for automatic execution. Any diagnosis/repair or new live disposition must name its scope separately; do not lengthen timeouts, weaken lifecycle assertions, rerun the marker-bound packet or promote recovery into success. Parent independent evidence review and verified publication are recorded separately in canonical Beads.
