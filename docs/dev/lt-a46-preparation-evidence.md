# lt-a46 clean continuation baseline — preparation evidence

## Scope and disposition

User authorized preservation, integration of reviewed amendments, selective launcher recovery, offline preflight and read-only process/listener inventory. This is **preparation, not Windows qualification**. `lt-a46` remains blocked with its live allowance exhausted; `lt-13v` remains open. No product repair beyond preserving the previously reviewed launcher bytes, live app/browser attempt, learner database access, installation, provider/model activation, deployment or retry reset occurred.

Main and origin/main were read back at `147081a13cf5650b30ab719142b1ef7f31132f5f`, incorporating the reviewed planning amendments. Main was clean. `python validate_final_bundle.py` passed (16 required / 16 manifest entries; no errors); `git diff --check` passed. That validator is historical document-bundle validation, not product acceptance.

Preparation is tracked in canonical Beads as `lt-c0r.1`. The work branch is `work/lt-a46-preparation`; only the new offline checker/tests and sanitized preparation documents are intended for publication. Launcher product code remains a locally frozen candidate because its required live gates have not passed. This uses the exact-manifest alternative in `lt-c0r.1`, not a claim that the code is ready to merge.

## Preservation packet (local only)

Root: `C:/Users/jmdzi/AppData/Local/lingotorte/evidence-archives/lt-a46-preparation-2026-10-10`.

- `manifest.json`: SHA-256 `954239187d791250516d9533536871225eca257656dfbbf00565dc2dd2b95c72`.
- Preserves launcher 5 tracked modifications + 4 untracked files, and integration 20 tracked modifications + 15 untracked files, including full-index binary-safe patches, exact working bytes, base revisions, inventories and receipts.
- 631 copied files, 277 generated payloads. Parent independently rehashed all **908 payloads** and all 631 copied source files; no mismatches. Both original worktree statuses remained unchanged.
- 34 referenced artifact presence checks and 12 documented one-shot hashes matched; no referenced receipt missing.
- 1,357 omission records explicitly cover secrets/environment/config, database/dependency/build/cache/profile trees, links and disposable copies. This is not a learner-state, dependency or Dolt backup and offers no protection against machine/disk loss.
- Historical complete snapshot: 283/380 hashes verified from archived base/dirty bytes; 97 excluded tracked files (88 vendored dist, 9 Beads) are recoverable at base `2b005926966418769293d9abede5d91be61d145d`. Independent spec review verified those Git blob hashes. Each earlier selective-copy snapshot reconstructs 55/55 hashes.

Restore into a **new** isolated destination at the recorded base, apply its archived `tracked-dirty.patch`, then restore the exact `dirty-files` entries and honor the deletion inventory. Validate against the archive manifest and historical source manifest before any use. Do not reset, delete or overwrite the originals; do not run a historical probe. Excluded tracked baseline content is obtained from the recorded Git revision only when needed and allowed. Frozen failures remain failures.

## Exact combined candidate (local only)

Packet root: `C:/Users/jmdzi/AppData/Local/lingotorte/evidence-archives/lt-a46-candidate-2026-10-10`.

Candidate: packet root + `/candidate app żółć`.

| Identity | SHA-256 |
| --- | --- |
| `source-manifest.json` | `9cb1e87f020fbfeba6147605bf478253dcc8c3532b2fbfb07ae47788069f2c83` |
| `dependency-manifest.json` | `5662edf1679205d42d9b6674a15d08f01214adbbc2d0ea546e4dd5cfcf2056fe` |
| `receipt-manifest.json` | `7b2d33a0bdb760c4c05ac43bfd44018c072ebb19b6344a0f790dc89074448eaa` |

The 378-file complete tracked-source selection starts at `147081a13cf5650b30ab719142b1ef7f31132f5f`; only `scripts/start-local.mjs`, `scripts/start-local-processes.mjs`, `scripts/start-local-windows-job.cs`, and `scripts/start-local.test.mjs` overlay exact historic launcher bytes. Published native-path (`31b4747`) and Python (`828dbfc`) repairs remain baseline bytes; no older integration-wide diff was swept in. Sensitive paths/Beads stores/caches are excluded before opening contents; required tracked vendor runtime files and synthetic fixtures are included. Standalone Git metadata is candidate-local with isolated Git configuration, not copied from another checkout; no Beads store was initialized.

Parent independently verified all 378 source files, 16,886 installed dependency files and 22 receipt files against sizes/hashes. Third-party dependencies are read-only reused via **mutable junctions**, not independently archived bytes: rehash and target readback are mandatory before any future execution. Repository and vendor aliases resolve to candidate-local bytes. Cache/config temporaries are candidate-local. Source/installed-content drift invalidates a future claim.

## Offline preflight and prerequisites

Receipts beside the candidate: `offline-source-preflight.json`, `final-preflight-summary.json`, `helper-compilation-v2.json`, `process-listener-os-edge-v2.json`, `listener-crosscheck.json`; the receipt manifest binds the preparation scripts and earlier failed preflight receipts too.

| Check | Result and boundary |
| --- | --- |
| Static source/literal import closure, exports and fixtures | PASS; not exhaustive third-party conditional/runtime resolution or live served resources. |
| Vite config resolution | PASS without constructing a listening server; cache/config-temp targets isolated. |
| Synthetic mutable roots and repository roots | PASS; provider-off allowlisted environment; no database created. |
| Exact C# `Add-Type` under Unicode TEMP | PASS, exit 0; helper `Run` never invoked, no service children launched. |
| Read-only PID/listener inventory | 654 processes without CommandLine; CIM plus netstat found no listeners on 5173/5174 at observation time. Nothing killed. Earlier unavailable `Get-NetTCPConnection` receipt retained; fallback evidence is explicit. |

Observed tuple: Windows 11 Pro build 26300 x64; Node 26.7.0; npm 10.9.8; Python 3.14.7; Edge 156.0.4314.15; PowerShell 7.6.6 / .NET 10.0.12. Metadata/compile evidence is not runtime certification. Telemetry/update controls are not kernel egress containment. Listener availability is point-in-time, not a reservation.

[Resource-checker preflight](lt-a46-harness-preflight.md) records the actual historical checker successor, source-derived RED evidence and **7/7 offline tests, no skips**, independently rerun by parent/spec reviewer. Literal `/@vite/client` remains distinct from `/%40vite/client`; recursive URLs/MIME and exact fixture/raw-export checks discriminate canned failures. Frozen Python/native-console/lifecycle/service assertions remain unchanged.

## Remaining execution gates

The successor has **no future transport/Python bridge yet**. Before proposing execution, bind that offline-tested bridge/parser/fixture/harness closure to the exact candidate and independently compare unchanged lifecycle/API assertions. This is a disclosed follow-on harness integration prerequisite, not renewed authority to run the old probe. The candidate freeze and offline checker do not constitute a live-ready orchestration packet.

All real readiness/HTTP-resource, save/reopen/restart, native Ctrl+C, premature-exit/foreign-listener, owned cleanup, combined regression/typecheck/build/privacy and Edge assertions are **NOT REACHED** in this preparation. Linux and real ASR remain separately unqualified, not extra completion gates for this preparation task. No historical receipt is promoted to combined acceptance.

After the remaining offline harness binding, any actual attempt requires a **new explicit bounded execution disposition** for the exhausted lane. Keep [Windows qualification procedure](windows-qualification-procedure.md) protections, stop at the first failed execution, preserve unreached classifications, and never use recovery cleanup as lifecycle success.
