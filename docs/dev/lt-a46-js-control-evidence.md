# lt-a46 — injected JavaScript shutdown control

## Result and evidence boundary

**Three fixed offline cases passed on Node 26.7.0; the original native shutdown root cause remains UNKNOWN.** This is execution of the actual frozen `startLocalProcesses` implementation with fake children, a private signal emitter and fake escalation timers. It is not another application/native qualification attempt, a copied shutdown model, an observability overlay or a repair.

Janusz authorized bounded diagnostic work after the corrected integration failure. Discovery found subsequent native-harness, source-analysis and acknowledgement-design work already recorded under `lt-c0r.4`–`lt-c0r.10`. Those results were reused rather than repeating their failed native attempts. Read-only mechanism assessment `deleg_f4a12ffd` recommended this existing dependency-injection seam as the smallest safe executable control. Existing native execution guards, preserved attempt markers and safety blockers remain unchanged.

## Bound inputs and execution

- Imported only `start-local-processes.mjs` from the frozen corrected packet's `candidate app żółć/scripts/`. Neither application entrypoint nor process-spawning integration test was imported.
- Actual source SHA-256: `ed417f114cf4a4b4d240242a30efc7a6322d9d63bd1ae93293711e13ec41627e`; checked before import and after the batch, independently again by the outer runner.
- Installed Node executable SHA-256: `e921fe5307e29bf6fd00000dd594356affd3a7b044e52720c7f10decbdc305b9`; resolved from the frozen packet's runtime metadata and hashed before running.
- Fixture: `scripts/windows-shutdown-js-control.mjs`, SHA-256 `8a341127244a0394c8dfb69cf57cfbd2c12d5b469c1abdfc6353c650a515b1de`. The published copy is byte-identical to the executed scratch file.
- Outer command: bound Node executable, fixture path, frozen module path and exact source hash above. An exclusive local marker recorded this three-case batch. The runner allowed 20 seconds and returned **exit 0**, stderr empty.
- Child environment contained only `SystemRoot`, `ProgramFiles` and scratch-only `TEMP`/`TMP`. Node options/provider credentials were not inherited. Existing module accesses the PowerShell installation path but its injected spawn function starts no process.
- Fake child IDs never reach an OS API. Fake stdin/exit/close events are in-memory only. The private emitter does not send native signals or emit on `process`.
- Guards reject the actual module's subprocess spawn and selected network/process-kill primitives; no forbidden call occurred. These guards are not a comprehensive security sandbox.
- Escalation timers are intercepted: the original 10,000 ms value is asserted, registration/removal checked, and callbacks never fired. Finite microtask checkpoints test settlement under these schedules, not Windows wall-clock shutdown bounds.
- Capped observations remain in memory during each case. JSON output occurs only after all tested paths complete; no acknowledgement writer was inserted in product shutdown.

## Observed cases

| Case | Actual assertion outcome |
| --- | --- |
| Registration and positive SIGINT control | Both listeners exist before each fake spawn. Private SIGINT requests exactly one stdin end on each child. After both closes, done resolves **0**, listeners are removed and repeated stop calls retain the original completion/code. |
| Exit is not close | After both fake exit events, done is still pending. After only the first close it remains pending. Both closes resolve done **0**. The actual unconditional close barrier was exercised. |
| Synchronous stdin-end failure | First child's end throws; sibling still receives its end request. The failed child closes first, followed by the healthy sibling; done resolves **1** only after this schedule's closes. This is the expected rejection result, not a failing test. |

All three cases left zero fake timers and unchanged real-process SIGINT/SIGTERM listener counts. No C# compilation, helper, native console event, application service, browser, SQLite, provider or model ran. The failure case does not independently discriminate removal of the extra all-children barrier: it does not test the healthy sibling closing while the failed child remains open. This is observed behavior under the stated schedules, not complete regression coverage of that barrier.

## Interpretation

These results show that the actual JS callback-to-stop-to-completion path works for the controlled schedules, and that a missing close can keep it pending even after child exit. They do **not** establish that close was missing in the failed real run, that native SIGINT reached Node, that inherited ignore state suppressed it, or that real helper EOF/accounting occurred.

The source-first ranking remains unresolved: event generation to callback entry is the earliest unobserved boundary. No production change is justified by this batch alone. A real callback-entry observation still needs a reviewed native launch/ownership/console/recovery mechanism; the accepted native-controller report's blockers have not been resolved by these injected tests. An inspector would additionally perturb timing/lifetime and is not an automatic workaround. No repair, new full integration attempt or closure of `lt-a46` is claimed.

## Preservation and review

Durable private archive: `<local Lingotorte evidence-archives>/lt-shutdown-js-control-20261011`, containing six manifest-bound files: executed fixture, original module, execution marker, stdout, stderr and receipt. Manifest SHA-256: `6f640ab04d93180528743287d38ba4ff95b7e75eba8c70d3f513febf414722eb`. Stdout SHA-256: `974af7eae118a45622c99e4367883d5ba3671de04004d43c87d44de74cd5893a`.

Only the fixture and this sanitized report are approved for publication on `work/lt-a46-js-control`; raw receipts and frozen product source remain local. Independent specification/evidence-quality review `deleg_fea07ac3` **APPROVED** bounded injected-JS evidence with no blocking fixture defect. The reviewer independently verified fixture/source/stdout hashes and three results, without rerunning the batch. The runtime selection, outer timeout and allowlisted environment above are parent execution-tool provenance, not independent reviewer verification; the packet does not itself archive the runner configuration. Synthetic close/status events are not helper-generated acknowledgements. No further diagnostic cases are part of this fixed batch. `lt-a46` remains blocked.
