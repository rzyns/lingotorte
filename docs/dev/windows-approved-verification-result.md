# Approved Windows qualification — executed result

## Disposition

**One authorized live attempt consumed; integration FAIL at native Ctrl+C shutdown. Stop; no retry or application repair performed.** The URL-checker repair worked. Application-versus-harness attribution of the shutdown failure remains unresolved: successful `GenerateConsoleCtrlEvent` is not proof the launcher received SIGINT, and the retained application log has no signal-entry/owner-EOF acknowledgement.

Independent offline review: SPEC PASS / QUALITY PASS, `deleg_f9578ed6/task-0`. The user explicitly authorized this one corrected isolated execution after offline preflight. The original failed packets and dirty worktrees remain unchanged.

## Content identity and execution

- Combined candidate: `work/lt-a46-approved-verification`, base `147081a13cf5650b30ab719142b1ef7f31132f5f`, including published native-path/Python repairs and the four reviewed launcher files recorded in the source manifest.
- Packet: `<Hermes scratch>/lt-approved-offline-20261011-b`.
- Source manifest: `e970a7a5d3647fa811d3c018289e35862fdf7a8794f2cfd0ccdf8dbaf464cbdf`, 378 source files. Pre/post binding passed; installed dependency, runtime and harness identities were checked by the bound verifier.
- Preflight SHA-256: `862a18fe25066147b3723839b8fab4c8cc87b53fbf5f7d664d1d37db0dc61317`.
- Executed probe SHA-256: `f35fe68e7729d2630f7bfcae708135077eed0d039ccc19a9166046c71017c804`.
- Bound CPython executable selected from `runtime.json`; invocation `probe.py --execute`, no `-O`. Parent wrapper allowed 600 seconds; probe exited **1**, outer timeout **false**. This is not a wrapper-success or global-watchdog claim.
- External synthetic data/database/scratch/cache/profile/temp roots only; providers disabled, credentials absent, loopback listeners. No application implementation edits, provider/model installs, real learner state or deployment.

## Reached and unreached gates

| Gate | Result and scope |
| --- | --- |
| Offline source/dependency/checker/compiler prerequisites | PASS; independent review and corrected-preflight report. |
| Real service and Vite startup | PASS; service health/version, native Windows path policy, provider-off/key-absent status and owned loopback listeners verified. |
| Actual Vite resource graph | PASS; 62 served resources and three exact fixture checks. Literal `/@vite/client` is no longer percent-encoded. This is HTTP/import-graph evidence, not browser rendering/playback. |
| Initial state and synthetic save | PASS; empty snapshot, synthetic PUT response and exact subsequent API snapshot equality asserted before shutdown. |
| Native Ctrl+C clean shutdown | FAIL; console attachment/event generation returned success, but launcher did not exit within **20 seconds polling plus the final 1-second wait**. The traceback's `timeout=1` is the final wait, not the entire stop allowance. |
| Native SQLite reopen/integrity and application restart/readback | NOT REACHED; API save/readback does not substitute for these assertions. |
| Premature-service-exit and occupied-port preservation | NOT REACHED in this real-app run. Historical synthetic controls remain separate. |
| Recovery and final ownership readback | PASS as recovery only: all six held process identities inactive, both listeners absent and sole-launch lock removed. Parent independent numeric-PID/port follow-up corroborated absence; it does not replace original held identities or establish clean lifecycle. |
| Browser, native Linux, real ASR and final human acceptance | NOT QUALIFIED by this run. |

The application log contains startup/readiness only, not evidence locating the missed shutdown acknowledgement. No claim is made that the service's graceful SQLite-close handler ran. Source/harness posthash passed. The execution marker remains; it must never be deleted to regain allowance.

## Frozen raw receipts

All paths below are relative to the packet; raw synthetic state/logs remain local and are not published.

| Artifact | SHA-256 |
| --- | --- |
| `result.json` | `d6c3433ed15fc460d31763026668f0a3a933d442137070334cca149cc89657cf` |
| `approved-live-execution.json` | `055b0b64647bdcdaf96603dff5dae21ab277eb6d3d7a156d96fe815123f25cb0` |
| `expected-snapshot.json` | `57a9a02c3e5b970607c06cb7e14701da00a3ead76109a19bfbe00ff9640f67ff` |
| `ready-save-native-ctrl-c.log` | `8dfc8083bb4e2eb7b9943a75224ee2156471313fbaf1a6add169f40f3cd3f28c` |

`approved-live.stdout`/`.stderr`, the snapshot and dependency manifests, execution marker and synthetic database are retained in the packet. No later assertions were executed after failure.

## Next decision

`lt-a46` and the Windows checkpoint remain blocked. The smallest next scope is bounded signal-delivery diagnosis: distinguish console event delivery, launcher SIGINT entry, supervisor control-pipe EOF and Job Object empty acknowledgement before changing product behavior. That diagnostic execution is not authorized by this consumed one-shot run; do not silently rerun qualification, lengthen the stop window, or count forced recovery as success.
