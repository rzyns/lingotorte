# lt-tow Python executable evidence

Baseline: `31b4747`, branch `work/lt-tow-python`. Parent owns review, commit, push and closure. Synthetic external fixtures only; no installs, providers or model work.

## Deviations
- Running implementation notes consolidated here, matching the native-path receipt, rather than adding a root tracking file.

## Discovered edge cases
- Four existing tests spawn hardcoded `python3`; the selected Windows host provides `python` (3.14.7), not `python3`.
- Fake-module arguments also contain POSIX `/tmp` literals and leak temporary modules; retain exact native path assertions and clean owned fixture directories.
- Python stdout encoding must be explicit for Polish text on Windows pipes. Fake/help execution must disable site imports and bytecode, not depend on installed ASR packages.

## Questions for review
- None requiring scope expansion. Native Linux receipts depend on pre-existing authorized tooling; pure Linux-default tests are not native Linux qualification.

## Selection and failure contract
- `LocalServiceRuntime.pythonPath` injection wins, then `LINGOTORTE_PYTHON_PATH`, then `python` on Windows / `python3` on Linux. The service snapshots this selection at startup. Direct adapters and CLI fixtures use the same helper.
- The override is a single bare executable name or fully qualified host-native executable path, validated by the existing `nativeExecutable` guard. No quoting, shell, argument splitting, discovery, installation or fallback. A present blank/malformed value is a redacted configuration error. Browser executable fields remain ignored.
- Startup validates syntax only; it does not probe or require Python. A nonexistent interpreter leaves health/core available. Python jobs report `Python executable is unavailable. Configure LINGOTORTE_PYTHON_PATH with one installed executable.` Nonzero Python exits retain redacted adapter failures; stderr/path details are not exposed.
- Lazy-help tests place dependency modules that fail on import in the fixture module path. Fake scripts use those local modules only, `-S` (no site imports), `-B` (no bytecode), UTF-8 pipes, bounded execution and owned-directory cleanup. Polish/space-containing native audio paths are compared for exact equality inside both fake modules; previous native argument-vector/cwd assertions remain intact.

## RED and GREEN receipts
External configs/reports live in Hermes scratch `lt-tow-python`; existing ancestor dependencies are reused with every workspace alias mapped to this worktree. TEMP/TMP, caches and build outputs are external. No dependency/runtime/model installation, provider call or real media was used.

| Gate | Actual result |
| --- | --- |
| Original transcription regression, before edits | **10 total, 6 passed, 4 failed, 0 pending**, exit 1, `red-existing.json`. Exactly the two lazy-help and two fake-module tests failed with `spawn python3 ENOENT`. |
| New adapter regression before production edits | **20 failed**, exit 1, `red-selector.json`. Both adapters used `python3` instead of the Windows/default/env selection; explicit missing interpreters produced generic exit errors. Malformed-env cases reached the unconfigured fake runner instead of rejecting the setting. |
| Final focused transcription/selector/service | **51/51 passed**, exit 0, `focused-final.json`. Includes env/injection precedence, explicit Linux/Windows defaults, malformed settings, exact space/Unicode paths, no fallback on launch/exit failure, service snapshot, ignored browser overrides and actual missing-executable/core-health regression. |
| Final complete Windows suite | **1013 total, 1013 passed, 0 failed, 0 pending**, exit 0, `full-final.json`. All four former failures pass. |
| `test:no-network` equivalent | **5/5 passed**, exit 0, `no-network.json`. |
| Typecheck | Exit 0, `typecheck-final.log`; worktree-mapped external TS config. |
| Production build | Exit 0, Vite **8.0.16**, **32 modules** transformed, `build-final.log`; external output. |
| Privacy scan / diff | `ok: true`, **49 files** (`privacy-final.json`); `git diff --check` exit 0. |
| Native Windows Python boundary | Windows **10.0.26300**, x64, Node **v26.7.0**, Python **3.14.7**; selected `python`. Version and explicit qualified override, both lazy-help scripts, both real Python/fake-module scripts, selector precedence and two missing-interpreter adapter calls passed (`windows-native.json`). |
| Native Linux focused Python boundary | Authorized `ubuntu-scratch`, Linux **6.18.40.1-microsoft-standard-WSL2**, x64, Node **v22.22.1**, Python **3.14.4**; selected `python3`. Same version/qualified override, both lazy-help scripts, both fake-module scripts, selector precedence and two missing-interpreter adapter calls passed (`linux-native.json`). Limitations below apply. |

Counts were reconciled against every assertion row: 1013 rows across 35 distinct test files. Existing parameterized tests reuse display names (five bounded-range cases and nine repeated native-path matrix labels), yielding 1000 distinct file/name pairs; no report files are duplicated and no cases were dropped/deduplicated to obtain the reported pass count.

### Source binding
Baseline source SHA-256 (Git blob bytes at `31b4747`):
- Adapter index: `e1d73df25c71e84a2c2f9986a07b40ac4818dadef24a51f600eefd8ff867b70e`.
- Original transcription tests: `0bbd5a058ca1f40f2644046c857901b48ebe272343155ff270dd605d963d4121`.

Final changed-code manifest SHA-256: **`69c7efcd97d9a9897a9a997f28ab74de122a5f52ca3167f1be3d221e0be454f8`**. Manifest is sorted changed/untracked `.ts`/`.mjs` relative paths mapped to on-disk file SHA-256, compact sorted-key JSON, then SHA-256; documentation is excluded to avoid self-reference. Retained as `candidate-manifest.json`.

### Reproduction
Run from this worktree. `<deps>` denotes the primary checkout's existing `node_modules`; `<scratch>` denotes external Hermes scratch `lt-tow-python`. Set `TEMP` and `TMP` to that external native directory before tests. Configs preserve repository options and map `@lingotorte/*` to this worktree; no package linking/install is needed.

```text
node <deps>/vitest/vitest.mjs run tests/core/localTranscriptionPipeline.test.ts --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/red-existing.json
node <deps>/vitest/vitest.mjs run tests/core/pythonExecutable.test.ts --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/red-selector.json
node <deps>/vitest/vitest.mjs run tests/core/localTranscriptionPipeline.test.ts tests/core/pythonExecutable.test.ts tests/core/pythonService.test.ts tests/core/localService.test.ts --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/focused-final.json
node <deps>/vitest/vitest.mjs run --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/full-final.json
node <deps>/vitest/vitest.mjs run tests/no-network --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/no-network.json
node <deps>/typescript/bin/tsc --noEmit --project <scratch>/tsconfig.json
node <deps>/vite/bin/vite.js build --config <scratch>/vite.config.mjs --configLoader runner
node scripts/check-privacy-boundaries.mjs
git diff --check
node <scratch>/native-python-probe.mjs <repo>
```

RED commands were executed before the production edits, not after. Initial focused GREEN exposed one old service expectation of `python3`; its exact command-vector assertion now expects the configured/host-specific interpreter, without relaxing any path assertion. Initial typecheck found `Pick<ProcessEnv, ...>` incorrectly required the env key; it was corrected to `Readonly<NodeJS.ProcessEnv>` and the final gates rerun.

### Linux scope and tooling limitation
The installed WSL Node lacks compiled-in TypeScript support: direct `.ts` import failed, and `--experimental-strip-types` reported `ERR_NO_TYPESCRIPT`. No runtime was installed. The external `emit-linux-probe.mjs` used the already installed TypeScript **6.0.3** to emit only the selector, adapter and two native-path modules, with relative import extensions rewritten. `linux-emitted/manifest.json` records source/emitted hashes. The Linux probe imported those emitted modules and executed the **unchanged actual Python scripts**, extracting the same fake module bodies from the candidate test source. It used POSIX paths to the external mounted Hermes scratch directory and cleaned its owned child.

```text
node <scratch>/emit-linux-probe.mjs
wsl.exe -d ubuntu-scratch --exec env TMPDIR=<scratch-posix> node <scratch-posix>/native-python-probe.mjs <repo-posix> <scratch-posix>/linux-emitted
```

This is native Linux **focused subprocess/Python evidence**, not the selected Linux Node 26.7.0/Python 3.14.7 tuple, not a native Linux full-suite/SQLite/browser receipt, and not ext4 filesystem qualification. The direct-TS Linux target remains unqualified. The native harness additionally verifies interpreter `--version` via both platform default and Python's qualified `sys.executable`.

## Changed paths and boundaries
```text
apps/local-service/src/server.ts
packages/local-transcription/src/index.ts
packages/local-transcription/src/pythonExecutable.ts
tests/core/localService.test.ts
tests/core/localTranscriptionPipeline.test.ts
tests/core/pythonExecutable.test.ts
tests/core/pythonService.test.ts
docs/dev/lt-tow-python-evidence.md
```

Launcher, README/runbook/platform contract, provider/model behavior and existing native-path policy were not changed. No commit, push, Beads update or closure by this worker; parent specification/quality review and integrated launcher qualification remain required. Full browser qualification and real ASR remain outside this receipt.

### Implementation-notes closeout
- Deviations: two — consolidated notes and emitted-JS Linux probe because installed Node has no TypeScript support.
- Most likely revisit: native Linux target runtime/full suite, not an ASR installation workaround.
- Edge cases handled: blank operator values, startup snapshots, absent interpreter, exact Unicode native arguments and pipe encoding.
- External artifacts: preserved reports/configs/probes/manifest in task scratch; fake module children are cleaned.
- Read this receipt and the accepted Windows platform contract before parent review/integration.
