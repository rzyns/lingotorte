# lt-c0r.7 — bounded offline ledger abort ownership

## Scope and disposition

Implemented one store-owned abort architecture in the separate `work/lt-ledger-abort-boundary` worktree, based on `da0700bddf56fc9d67adc008325deb473866ba3c`. This is **offline disposable-file evidence, awaiting parent independent review**, not acceptance/publication of the blocked adapters or renewed native execution authority. Parent owns Beads and Git; this worker made no commits, pushes or issue changes.

Owned repository artifacts:

- `scripts/windows_shutdown_ledger.py`
- `scripts/windows_shutdown_ledger.test.py`
- this evidence document

No native adapter was copied into this worktree. The existing diagnostic/recovery sources and their tests are unchanged. The old diagnostic-adapter worktree retains its five untracked, source-blocked artifacts unchanged.

## Cause and implemented contract

The historical ledger had fragmented failure ownership: its second append status read was outside its uncertainty handler. A failing wrapper could poison itself while direct calls or a new wrapper still accepted a retry. The parent reproduction established retry permission, not duplicate native dispatch.

The new store has one `_checked()` failure edge invoking `_abort()` for every owned filesystem operation and persisted-state validation. Constructor IO enters that edge **only after acquiring its own exclusive lease**. Preacquisition failures do not poison, close or remove a foreign lease.

`_abort()` irrevocably latches both `uncertain` and `closed` **before** fallible poison/descriptor cleanup. It attempts durable `P`, records secondary cleanup errors without replacing the primary exception, attempts lease-descriptor retirement once, and never unlinks the aborted lease. An unavailable/missing status file or failing poison write/fsync/close therefore cannot restore writer permission while the retained lease name exists. Direct calls, pre-existing/new wrappers and distinct instances subsequently deny access/consumption. Core unknown-count reporting remains unchanged; an unavailable observation does not become a claimed zero.

Public read, append and close hold the same lifetime `RLock`. Append reuses its checked preflight status instead of performing the historical unprotected second status read. Caller type/range/no-resume and validated-sequence rejections remain healthy; corrupt persisted envelopes, types, binding/checksum, sequence or status are terminal. Healthy close validates persisted state, writes/fsyncs `C`, closes its lease descriptor once, then unlinks the name in the Windows-compatible order. Repeated close cannot restore a failed store or close a recycled descriptor. Healthy sealed reopening permits observation, never append/resume.

The optional IO seam delegates actual `os.mkdir/open/read/write/fsync/close/replace/unlink` operations by default. The matrix inventories real delegated operations, not selected lifecycle fault hooks. The historical `fault` hooks remain only for compatibility with the eleven existing controls.

## Source-bound red/green proof

Receipt root:

`C:/Users/jmdzi/AppData/Local/lingotorte/evidence-archives/lt-ledger-abort-boundary-2026-10-10`

Final command/source bindings and raw logs are under `final-source-pass/`. Each command records its arguments, cwd, isolated/optimized flags, relevant environment, actual exit status and source hashes.

| Check | Normal `python -I -B` | Optimized `python -I -B -O` |
| --- | --- | --- |
| Exact historical second-status-read regression | 1 test, exit 1, expected assertion failure | 1 test, exit 1, expected assertion failure |
| Eleven historical ledger controls on the frozen baseline | 11 tests, exit 0 | 11 tests, exit 0 |
| Final ledger suite | 20 test methods, exit 0 | 20 test methods, exit 0 |
| Unchanged diagnostic suite | 8 tests, exit 0 | 8 tests, exit 0 |
| Unchanged recovery suite | 26 tests, exit 0 | 26 tests, exit 0 |

The regression loads the actual frozen historical source and fails only after the exact second `Path.read_bytes()` status failure leaves direct retry accepted. The final source has no second status-file read: the same behavioral assertion instead injects failure into its single real preflight status read. A separate inventory assertion proves the redundant read was removed rather than replaced with an artificial phantom operation.

Baseline source SHA-256:

`ff41c18633aaa342ab399bb726ae63a426eed8a806175d13984b4d6d2dc5fb35`

Final ledger source SHA-256:

`ae040513cb69b05508cb17c3cc9dab53c535e154058c1a605499661c0bf65c04`

Final ledger test SHA-256:

`47cf618d0437f2e8ca8a113096d408f747e6e5f3811c1b51a66c9dfc50620d74`

During ordinary red/green development of this initial implementation pass, an additional close-preflight negative control exposed that malformed persisted state could otherwise be sealed healthy. `development-close-red-*` preserves the actual earlier source/test, hash binding and three failing subtests. The final close-preflight test passes in both modes. The root-level earlier 19-method/173-row development receipts are retained; they are not the final candidate qualification and are not erased or relabeled. Initial harness development also corrected root-site naming, expected primary-vs-secondary exception classification, and inspection of intentionally short-written malformed bytes; those were test-harness issues, not evidence of a passing matrix. No independent-review correction has been consumed.

## Actual site-and-occurrence matrix

`final-source-pass/normal-matrix.json` and `optimized-matrix.json` each contain **181 unique failure rows**, not 181 unittest methods. Their sibling `.inventory.json` files preserve ordered actual-operation inventories. Normal and optimized row keys match.

Nine inventories contain 164 actual operations. Two occurrences are fixed primary-error anchors in the double-fault scenarios; the remaining 162 occurrence rows inject an `OSError`. Nineteen additional rows perform a real short write at each inventoried write occurrence. Every uninjected operation delegates to real IO in fresh absolute disposable roots under Hermes scratch. Failed-before-close descriptors remain test-owned and are explicitly retired by the harness, not silently treated as successfully closed by production.

| Stage | Failure rows per mode |
| --- | ---: |
| Fresh initialization | 28 |
| Sealed read-only reopen initialization | 12 |
| Public read | 8 |
| Direct append | 28 |
| Wrapper consumption, including pre/post-append reads | 44 |
| Healthy close, including persisted-state preflight | 15 |
| Abort after malformed persisted status | 10 |
| Abort with fixed primary IO failure plus secondary occurrence failure | 8 |
| Constructor with fixed primary IO failure plus secondary occurrence failure | 28 |

Every row records stage, file site, operation, occurrence, injection mode, actual primary error, uncertainty/closed state, physical lease presence, physical status and rows where parseable, raw-state byte count/hash, secondary cleanup errors and shared denial. All **176 owned-failure rows** retained the lease and terminal state; five preacquisition rows had no owned lease and touched no foreign lease. Foreign-lease preservation also has a byte-for-byte positive control.

The matrix includes lease open/write/fsync; initial status/state create/write/fsync/close; status and state read/open/close occurrences; append poison, exclusive temp creation/write/fsync/close, replace, committed readback and acknowledgement; healthy close preflight/status/fsync/descriptor close/unlink; abort poison failures and descriptor cleanup failures. Double-fault rows verify that secondary poison/cleanup failures preserve the original exception. Even when physical status remains `R`, the retained exclusive lease excludes another instance.

Additional controls cover committed readback mismatch; malformed checksum/binding/types/status; strict pure argument and budget rejection; healthy sequential consumption and sealed no-resume observation; pre-existing/new wrappers; simultaneous same-case wrappers accepting exactly one consumption; close waiting for an in-flight read; repeated failed close; and close-that-completed-but-raised with descriptor recycling, proving the unrelated replacement descriptor remains usable. The existing conservative core failure receipt remains unknown-count with no dispatch. Tests patch process creation and WinDLL loading as forbidden; drivers are inert injected objects only.

The original eleven ledger controls remain functional. The one changed expectation is deliberate: failed unlink now attempts terminal poison (`P`) instead of merely retaining a sealed-looking `C` marker.

## Preservation evidence

Before/after final receipts verify equal source/status snapshots, zero mismatches in every historical manifest entry, and unchanged diagnostic/recovery guard hashes:

- blocked-review manifest: 6 entries, `e4fef72cd73442cb4ca4b87c123579297f6435332ee5be85e9b5c0e3d5055a41`;
- exhausted adapter revision 3: 35 entries, `013d363cb76849c06c64d79cd9d42c705598601e9383a706d0abe0cfe45366a3`;
- prior reviewed offline revision: 31 entries, `c67b3d762883a59e5b631fa7b662b03a839123fa128901e7ce608a84f72a50d8`;
- historical upstream receipts: 38 entries, `656c370d2a3fe393d0d6672c76a0a4904e10881b5895437bd99d440982ce8fd6`;
- bound historical originals: all 417 entries checked from `originals-pre.json`.

The blocked dirty worktree's five file hashes and exact untracked status were read-only and equal before/after. A complete receipt manifest binds the archived sources, document, runner, logs, matrices, source bindings, preservation checks and retained development evidence. Its hash is reported separately to avoid a self-referential document hash.

## Limits and remaining gates

This establishes tested cooperative same-machine exclusion and fail-closed behavior for all occurrences in the recorded healthy/abort traces. It is **not** exhaustive proof of every possible multi-error combination, arbitrary partial read length, asynchronous interruption timing, arbitrary filesystem mutation or OS/kernel behavior. Most syscall injections fail before invoking the selected syscall; the separate descriptor-recycling test covers a close that completed before its acknowledgement failed. Short writes actually alter the disposable files. No disk-error/power-cut campaign was performed.

No Windows directory-entry/power-loss durability, hostile writer/symlink safety, distributed database semantics, crash/stale-lock recovery, native ABI/kernel behavior, actual process/job/console ownership, launcher hypothesis, hard native bounds or application/browser/database/provider qualification is claimed. A retained lease intentionally has no automatic recovery API. If close has an ambiguous result, production deliberately does not retry the descriptor; this can leak a descriptor until process exit but avoids closing an unrelated recycled descriptor.

Parent independent specification/quality review remains required in the frozen candidate recorded above. At most one parent-approved review correction is available; unresolved conflict must stop. Nothing here authorizes another adapter revision loop, native batch, original packet/controller/prepare execution, installation, deployment, publication of native adapters, or closure of the upstream blocked native issues.

## Parent acceptance and publication disposition

- Specification review `deleg_4012e010`: **PASS**, no correction required. Independently reran the final normal/optimized ledger suites and the historical red regression, inspected the complete store/wrapper contract, and checked matrix counts and source bindings.
- Final quality review `deleg_ccdb4080`: **APPROVED** for these three files only, no correction required. Independently reran both ledger modes, checked all 48 receipt entries, historical 6/35/31/38-entry manifests and 417 originals, and verified unchanged blocked artifacts and guards.
- Parent independently ran all 54 unit methods per isolated normal/optimized mode, verified both matrices' 181 unique matching keys and all 176 owned terminal/exclusion rows, rehashed every receipt and historical manifest, and compared all five blocked artifacts byte-for-byte with their frozen copies.
- Frozen receipt manifest: `f986bd09e600230d35543253e1db4390b2504bf4555cf5fd678ef8fcb6196def` (48 entries). This acceptance annotation postdates the frozen document copy; no archived receipt was modified or relabeled.
- Zero review-driven corrections were consumed. Acceptance closes only `lt-c0r.7` after verified publication; `lt-c0r.6`, `lt-c0r.4` and `lt-a46` remain blocked. No native adapter, live entry point, process/console execution or learner state was enabled.

Git revision and exact remote readback are recorded in canonical Beads after publication, rather than creating a self-referential document hash. Publication remains on the dedicated work branch; it does not merge to primary `main`.
