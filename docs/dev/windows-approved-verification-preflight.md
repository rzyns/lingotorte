# Approved Windows verification — offline preflight BLOCKED

No live attempt was consumed. No Vite/service/browser/launcher was started. No provider call, installation, model download, commit, push or Beads mutation was performed. Parent disposition is required before further preparation; this is not an executable approved packet.

## Candidate and retained packet

- Candidate: `C:/Users/jmdzi/workspace/lingotorte/.worktrees/lt-a46-approved-verification`, branch `work/lt-a46-approved-verification`, HEAD `147081a13cf5650b30ab719142b1ef7f31132f5f`.
- Original dirty launcher files were not modified by this preparation.
- Packet: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-approved-offline-20261011-a`.
- Historical probe SHA-256 checked before preparation: `486739795a4a61575e7ac8856fd2fc554760e18405c7f333b985aa76f4c13f07`. Historical files and markers were not modified.
- Created drafts: `prepare.py`, `binding.py`, `offline-tests.py`; copied exact provenance `baseline-prepare.py`, `baseline-probe.py`; generated `static-preparation.py`, `inventory-before-open.json`, `source-manifest.json`, `environment.json`, `dependency-mappings.json`, standalone snapshot Git and snapshot-only repository/vendor junctions.

## Concrete failed prerequisite

The single offline preparation invocation was:

```text
python "C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-approved-offline-20261011-a/prepare.py"
```

It exited 1 in static package resolution, before Vite config resolution or source graph traversal:

```text
ENOENT: no such file or directory, lstat
.../candidate app żółć/vendor/morfeusz-ts/dist
Node.js v26.7.0
```

This is a preparation defect, not an application failure. The new exclusion predicate incorrectly treated every `dist` path component as cache/build output, thereby excluding tracked, required vendored runtime files. Required closure exclusions must block rather than silently omit files. The incomplete snapshot contains 290 files and has no tracked deletions. `inventory-before-open.json` records the exact excluded paths; excluded contents were not opened. Their Git recoverability was checked with `git cat-file -e`.

Do not reuse this snapshot for qualification. Correct disposition must distinguish tracked vendored distribution files from mutable build caches. No repair/retry was performed after this concrete offline failure, honoring the finite preparation stop boundary.

## Digests (incomplete evidence, not acceptance)

| Artifact | SHA-256 |
| --- | --- |
| `prepare.py` | `0749f29b5f0ef698e608f4464a1522f0de575977f50685f203f664c0729e67ed` |
| `source-manifest.json` | `6a8ca8c03596de35d76fdb8d82f9e6dc94fd74810a839879754f8a7cf6fe5994` |
| `inventory-before-open.json` | `3c51c8f12522dd01d41eb18b32a8e1119ee3b06bbb5f4963f1efeefcc2493587` |
| `dependency-mappings.json` | `85a63e1fab5c47a669b93b09c247469ff033c860088a3045783ef007e834b238` |
| `baseline-probe.py` | `486739795a4a61575e7ac8856fd2fc554760e18405c7f333b985aa76f4c13f07` |

## Gates and execute command

- Source/dependency/cache preflight: **harness FAIL**, tracked vendored export omitted.
- Actual installed dependency content binding: **NOT REACHED**.
- Corrected successor generation and lifecycle raw-source/AST comparisons: **NOT REACHED**.
- Actual checker canned URL/resource/parser tests: **NOT REACHED**; test file is an unexecuted draft, not evidence.
- PowerShell helper compile-only prerequisite: **NOT REACHED**.
- Persistence, native Ctrl+C, restart, occupied-port and premature-exit: **NOT REACHED**.
- `probe.py`, `preflight.json`, `execution-started.json`: verified absent in this new packet after failure.

**No valid execute command exists for this packet. Do not launch it.** An expected total execution deadline cannot be certified because no successor was produced. The draft preserves the baseline intended lifecycle polling budget of 20 seconds plus a final 1-second wait, but this has not passed the required comparison. Parent owns disposition, independent review and any eventual one live execution.
