# Historical work: preserved, not active runtime

Docker is the current development/runtime direction. The earlier Windows launcher and diagnostic work remains recoverable history, not a prerequisite, a qualified native runtime, or permission to resume stopped execution. Canonical Beads—not this index—holds current task state.

## Preservation checkpoint

Archive ID: `historical-20261012-185851`, created from main `c65b447e4787784f92d07b1adfeed87c383a9991` before local cleanup.

Local archive: sibling directory `../lingotorte-archives/historical-20261012-185851/` relative to the primary checkout. The actual archive is outside this repository and outside Hermes's prunable cache. It is on the same machine/disk; it is **not off-machine disaster recovery**.

`history.bundle` SHA-256:
`cc5cac436c7c8fe52a98449cb055ccbc22a5dfe2b1282ca9d88fbc1c5e32a19c`.

- The bundle preserves all 72 Git refs captured at the checkpoint, including exact historical branch-name/commit mappings. `git bundle verify`, isolated mirror clone, exact ref comparison and strict Git object checks passed.
- Seventeen historical worktree heads/trees were verified recoverable. Four dirty worktrees were actually restored: patches preserve Git staging/working diffs, ZIP overlays preserve the exact bytes of 53 changed/untracked source-file copies. Restored indexes, diffs, file hashes and untracked paths matched the originals.
- `inventory.json` and `preservation-manifest.json` identify every branch, worktree and overlay. `recovered.git` and `recovered-worktrees/` retain the recovery rehearsal. No credentials, learner/runtime data or dependency/build caches were added to the overlays.
- Exactly seventeen recovery-verified obsolete **local** worktrees and their local branches were retired after unchanged-source/ref and scoped-process checks. Remote branches remain unchanged. No historical application code or old Beads snapshot is merged into main. Existing external evidence archives remain untouched.

## What is worth remembering

| Historical family | Preserved covering tip | Useful conclusion; qualification limit |
| --- | --- | --- |
| Windows diagnostic/tooling stack | `work/lt-observer-feasibility` — `346b1b22efff0b81f622ded865d44fa6e6ca1cfa` | Contains preparation, offline binding/recovery/ledger tests and shutdown analysis/design/STOP assessments. Some offline units were independently accepted; native launcher qualification failed or remained blocked. No runtime success is inferred from an accepted report. |
| Dirty transcript-approval planning | `work/lt-dirty-approval-offline` — `ad0b4f5935cae9dc97c7f82fb60e9a0c50ffc62f` | Preserves reviewed scope split and blocked lane discovery. The underlying approval correctness issue is not fixed by those documents; retain its requirements in Beads for future authorized work. |
| Earlier Windows verification/control evidence | `work/lt-a46-js-control` — `1fbeb0db41043142ebd5be41973c61a127522c0c` | Preserves corrected qualification receipts and bounded injected shutdown controls. Injected/source evidence does not qualify native process/console behavior. |

These three tips cover all fifteen unmerged historical branches by ancestry. The full branch map is in the archive; stacked commits must not be counted repeatedly.

Uncommitted drafts were separately preserved from:
- `work/lt-a46-approved-verification`
- `work/lt-a46-diagnostic-adapters`
- `work/lt-a46-launcher`
- `work/lt-windows-integration`

Some draft paths duplicate code later accepted elsewhere. Their original bytes and base revisions remain in overlays, but this does not establish that every draft is useful, reviewed or ready to merge.

## Recovery without reviving old work

To inspect Git history in a **new isolated directory**, use `git clone --mirror <archive>/history.bundle <new-directory>/history.git`. Verify the bundle SHA-256 and `git bundle verify` first. The archive's original restore rehearsal already passed; never restore over the live checkout.

For a dirty draft, use `preservation-manifest.json` as the authoritative final verification record; its entries are verified true. The per-overlay manifests retain a pre-final `verified: false` stamp and supply reconstruction metadata, not the final verdict. Consult the relevant `overlays/<worktree-name>/manifest.json` for that metadata. Restore its recorded HEAD, apply `staged.patch` with `git apply --index`, apply `unstaged.patch` with `git apply`, then restore the validated relative paths from `files.zip`. The ZIP retains original file bytes; verify every recorded hash. `recovered-worktrees/<name>/` is the already-verified example. Do not treat a bundle alone as a backup of uncommitted files.

Old `.beads/issues.jsonl` revisions are historical snapshots only. Never copy them onto today's canonical store, rerun bootstrap seeds, or initialize a competing Beads database during recovery. The canonical database has its own separately configured backup.

Reintroduce material only for a named current requirement, in a dedicated branch, with fresh source/runtime verification and review. A historical report, archived runnable script or branch existing remotely grants no renewed native, provider, deployment or learner-state authority.
