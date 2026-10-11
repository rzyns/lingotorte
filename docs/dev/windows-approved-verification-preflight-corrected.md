# Corrected Windows qualification preflight — offline evidence only

**Offline preflight PASS; parent review is still required before the separately authorized live attempt. No live attempt was consumed.** This report does not qualify application lifecycle, persistence, browser, Linux, or ASR behavior. The original blocked report and packet `a` are unchanged.

## Bound packet and candidate

Packet: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-approved-offline-20261011-b`.
Candidate: `.worktrees/lt-a46-approved-verification`, HEAD `147081a13cf5650b30ab719142b1ef7f31132f5f`, with the same four reviewed launcher files (one modified tracked launcher and three explicitly inventoried additions). No application files were edited by this correction.

| Identity | SHA-256 |
| --- | --- |
| `preflight.json` | `862a18fe25066147b3723839b8fab4c8cc87b53fbf5f7d664d1d37db0dc61317` |
| `source-manifest.json` | `e970a7a5d3647fa811d3c018289e35862fdf7a8794f2cfd0ccdf8dbaf464cbdf` |
| `installed-content.json` | `31adfedc3c7b250a883998649427c899882aaef7dfcc6f4255be4f9d913267b3` |
| successor `probe.py` | `f35fe68e7729d2630f7bfcae708135077eed0d039ccc19a9166046c71017c804` |
| original frozen `probe.py` | `486739795a4a61575e7ac8856fd2fc554760e18405c7f333b985aa76f4c13f07` |

The snapshot contains 378 source files, including all 88 tracked `vendor/morfeusz-ts/dist/` files and 12 tracked fixture files. Dependency inventory hashes 16,904 installed files; two package-root credential-capable configurations are inventoried but **not opened or hashed**: `bottleneck/.env` and `nerf-dart/.npmrc`. These are not package runtime exports. Any other excluded dependency artifact remains a blocker. Installed package names/versions are supplementary, not substitutes for content hashes.

`runtime.json` binds the Node, Python, and PowerShell executable bytes, recording Windows 11 build 26300, Node 26.7.0 and CPython 3.14.7. It does not claim to hash the entire Windows installation. `dependency-mappings.json` separates reused third-party junctions from snapshot-local repository/vendor aliases. `binding.py` rehashes installed contents, runtime executables, source and harness inputs and checks resolved targets before and after future execution.

## Corrections and actual checks

- Replaced the blanket `dist`/`coverage` component exclusion with tracked-source inclusion and credential/cache/store guards. Tracked package exports are source artifacts, not mutable build caches. Snapshot runtime import/config closure now passes, including vendored package exports, repository roots, and local Vite caches.
- Removed `-ExecutionPolicy Bypass`. Exact reviewed C# compiled using installed PowerShell 7.6.6 / .NET 10.0.12 with existing policy: CurrentUser Unrestricted, LocalMachine RemoteSigned, Process Undefined. No policy was changed. Unicode synthetic TEMP was used; owner `Run` was never invoked. Compilation exit code: **0**; stderr empty. C# SHA-256: `d4d44259617f013ca4d886ac53685a734b136af6c049cbbdf3cacd0a15355540`.
- Kept the existing urllib transport. Corrected actual checker quoting to preserve literal `/@vite/client`, existing escapes, queries, spaces and Polish Unicode. No proxy or redirect following; fixed loopback targets, 3-second request timeout, 16 MiB per-response raw-byte ceiling, original 60-second graph deadline and 250-resource graph ceiling.
- Actual successor import was tested with DLL loading and subprocess creation forbidden. Native initialization stays behind `--execute`; normal invocation without that argument and optimized Python both fail closed.
- Actual checker regression exit code: **0**, stderr empty: **4 URL vectors, 12 recursive graph resources, 3 exact fixture checks** through the actual installed `es-module-lexer`. HTML MIME for JavaScript is rejected; valid JavaScript containing `Internal Server Error` passes. Encoded `/%40vite/client` remains distinct and its HTML fallback fails. Redirect, proxy configuration, oversized-body and non-loopback-target controls were also exercised offline.
- `Run.track`, `ctrl_c`, `wait`, and `close` have identical source-segment hashes and ASTs against original raw bytes. CRLF was restored after internal transformation rather than silently normalizing comparison inputs. Orchestration AST is unchanged. Stop budget remains **20 seconds polling plus 1 second final wait**.
- The exclusive execution marker and sole-launch lock are absent. The full binding check independently passed after preparation. No listener, service, browser, SQLite store, provider, install, commit, push or Beads operation was started.

## Bounded correction history

Three permitted mechanical correction cycles were used within this preparation revision:

1. Initial retry stopped before snapshot creation because the now-present frozen untracked report `docs/dev/windows-approved-verification-preflight.md` was absent from the known documentation inventory. It was recognized as documentation, not added to candidate application source.
2. Dependency inventory stopped before opening `bottleneck/.env`. Path-only inspection also found `nerf-dart/.npmrc`. Both exact package-root configuration exclusions were recorded; runtime exports remained required. Added an explicit offline `--resume-static` path that rechecks existing snapshot/source hashes rather than rebuilding or copying packet `a`.
3. Successor generation reached compile-only PASS but stopped with `ValueError: substring not found` at `new.index('lock_owned=False\ntry:')`: the original frozen file uses CRLF. Transformation now uses LF internally and restores original CRLF before raw-source comparison and writing. Final preparation and regression execution passed.

## Preserved failures

Packet `a` verification after all corrections:

- `prepare.py`: `0749f29b5f0ef698e608f4464a1522f0de575977f50685f203f664c0729e67ed`
- `failure.json`: `92ca506c1eb3c6a23ee9406faa2815d121606c8c0614eab00cfab07885b79d70`
- `baseline-probe.py`: `486739795a4a61575e7ac8856fd2fc554760e18405c7f333b985aa76f4c13f07`

## Parent review and later execution

Review `preflight.json`, `independent-offline-review.json`, `compile-only.json`, `lifecycle-comparison.json`, `offline-tests-output.json`, `offline-tests.json`, source/dependency manifests and exclusions. This document itself is new reporting evidence, not part of the frozen application-source manifest.

Only after parent review, the exact PowerShell invocation below selects the content-bound interpreter from `runtime.json` and the reviewed successor. **It has not been executed:**

```powershell
$packet = 'C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-approved-offline-20261011-b'
$runtime = Get-Content -Raw -LiteralPath "$packet/runtime.json" | ConvertFrom-Json
& $runtime.files[1].path "$packet/probe.py" --execute
```

All real application readiness, lifecycle, native Ctrl+C, persistence, occupied-port, premature-exit and cleanup acceptance gates remain **NOT REACHED**. Parent owns the remaining single live attempt and any further disposition.
