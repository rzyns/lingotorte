# Lingotorte work graph

**Beads is the source of truth for work, dependencies, claims and completion.** Documents hold requirements, decisions, research and evidence—not a second task tracker. `PLAN.md` and `PLAN-STATUS.md` are compatibility pointers; their full previous contents are preserved under `docs/plan/archive/`.

## Start here

| What you want | Bead |
| --- | --- |
| Required daily-driver program | `lt-foe` |
| Windows development baseline | `lt-c0r` |
| Local request safety and durable state | `lt-04k` |
| Review, practice and source identity | `lt-aur` |
| Learner-facing local morphology | `lt-fze` |
| Integrated qualification and acceptance | `lt-r4k` |
| Deferred follow-ons, outside required completion | `lt-5lb` |
| Authorization to start application work | `lt-dy6` |
| Migration/reconciliation evidence | `lt-e9g` |
| Captured historical/takeover evidence | `lt-4jg` |

These IDs are stable navigation, **not a status snapshot**. Ask Beads for current state.

## Vocabulary and why this shape

- **Issue / bead:** one independently verifiable unit of work. Native types here include bug, task, feature, decision and chore.
- **Epic:** a grouping of issues, not one giant assignment. The root daily-driver epic contains bounded phase epics.
- **Dependency:** a prerequisite. `bd dep add A B` means **A depends on B**. Parent-child organization is not a substitute for explicit prerequisites.
- **Ready frontier:** open, unclaimed work with no active blocker. Ready does not mean authorized. Raw `bd ready` also includes organizational epics: use `--exclude-type epic` and never claim an epic as an implementation task. After migration closure, only the authorization gate should appear in this filtered frontier.
- **Claim:** an actor takes responsibility; read back ownership before acting. Never steal another actor's claim.
- **Deferred:** deliberately outside the present program, without an arbitrary date that might silently activate it.
- **Evidence record:** a closed audit task can describe historical acceptance without claiming today's application works.

No molecules, formulas, recurring patrols, custom statuses or hosted boards are needed for this finite recovery plan. Native issues and dependencies are sufficient. Technical decisions (path policy, request model, retention design) are separate from the human scope/authority gate: agents should resolve technical questions with evidence and independent review, not make Janusz arbitrate every implementation detail.

The dependency graph is intentionally not a single serial chain. Once authorized, platform and safety design can proceed independently; runtime repairs/qualification precede integrated service work, independent fixes can run in separate worktrees, and B5 depends on safety and learning qualification. Optional ASR, transfer, deployment, export extensions and B8 lanes do not block the root program.

## Canonical store and commands

The canonical store is **this primary checkout's `.beads/`**, currently `C:/Users/jmdzi/workspace/lingotorte/.beads/`, using embedded Dolt with installed `bd 1.3.1`. No database server is needed. Never initialize a second competing store in a development worktree.

Ordinary terminals with Scoop shims on PATH:

```text
bd --sandbox ready --exclude-type epic
bd --sandbox show lt-foe
bd --sandbox graph lt-foe --compact
bd --sandbox blocked
bd --sandbox status
```

If `bd` is absent from the worker PATH, the verified installed executable is `C:/Users/jmdzi/scoop/shims/bd.exe`. In PowerShell invoke it with `&`; in Bash quote the executable path. Pass `-C C:/Users/jmdzi/workspace/lingotorte` when running from another worktree, and verify `bd where --json` before writes. Use the actual process working directory and absolute output paths for init/backup/restore operations; `BEADS_DIR` and `-C` alone did not isolate init's Git side effects during the backup rehearsal. Do not install a second copy merely because the shim directory is missing from PATH.

Hermes native tools are verified against this store:

- `beads_smoke(workspace=canonical checkout)` checks version/store/frontier.
- `beads_frontier(...)` lists unblocked/unclaimed non-epic issues.
- `beads_show(..., bead=ID)` reads details, dependencies and evidence.
- `beads_claim` claims with readback; `beads_comment` appends evidence; `beads_update` supports guarded metadata updates only.
- Creation, content/dependency edits and closure use the real `bd` CLI. There is no Hermes close tool.

An installed Hermes integration is not proof of a visible Desktop board. This setup verifies native tools/CLI; no Desktop pane or server was installed or enabled.

## Authority, worktrees and closure

**Git policy update:** [GIT-POLICY.md](GIT-POLICY.md) explicitly authorizes verified atomic commits and pushes as work completes. It supersedes older blanket commit/push prohibitions in issue templates and historical documents, but not scope, privacy, deployment or Dolt-sync gates.

1. Read the issue, blocking issues, `DECISIONS.md`, and the relevant safety/specification documents before work. The current graph was created for planning; its existence grants no application-development authority.
2. Record Janusz's named scope in `lt-dy6`. A single authorization can cover the whole local synthetic program. If only a subset is approved, keep the broad gate open and replace that dependency only for approved issues with a closed, evidence-backed scope record. Never release unapproved siblings accidentally.
3. Check the canonical ready frontier, claim with an explicit actor, then read back. Use separate Git worktrees for concurrent code changes, but route **all Beads operations to the one canonical store** using `bd -C`. Embedded mode serializes writes; retry only a reported transient lock, never create another store or steal ownership.
4. `open` means not started, even if dependencies block readiness; `in_progress` means genuinely claimed work. Use explicit `blocked` status for a non-dependency blocker with a comment explaining its resolution, and `deferred` for optional work. Do not invent completion dates or estimates.
5. For each implemented issue, append exact revision/patch, changed scope, commands/results, regression proof, independent review, retries, limitations and remaining live gates. A test count or old acceptance receipt alone is not completion.
6. Close only when that issue's acceptance criteria are satisfied and independently reviewed. Parent/operator applies closure; a child agent returns findings/evidence. Before closing an epic, verify its children and qualification issues, not just its own status.
7. Scope authorization, technical decisions, automated correctness, browser qualification, human acceptance, real-state transfer, persistent local deployment and remote publication are distinct. Deferred deployment/transfer issues retain their own approval. No blanket Git commit/push, model/provider, microphone, real-state mutation or public action follows from a claim.

Use the narrowest sufficient evidence: synthetic/fake-runner tests for most fixes; isolated browser/process checks for runtime/UI boundaries; real-tool or real-data work only where explicitly authorized. Preserve source/cue/version identity and provider-off defaults. Do not weaken checks or quietly broaden a batch to get green tests.

## Coverage and source documents

- [Review R1–R12](docs/review/plan-review-2026-10-10.md): findings, provenance, reproduced defects and proposed acceptance.
- [Decisions](DECISIONS.md): durable policy and product constraints.
- [Safety boundary](docs/review/safety-privacy-boundary-review.md): binding local/private boundary.
- [Archived plan](docs/plan/archive/PLAN-2026-10-10.md) and [archived status](docs/plan/archive/PLAN-STATUS-2026-10-10.md): historical source content with line positions preserved; only Markdown relative links were relocated. References to old `PLAN.md:<line>` now mean the archived plan.
- `docs/plan/autonomous-batches/`: historical acceptance/deployment receipts, not renewed authority.
- `.beads/migrations/2026-10-10-plan.graph.json` and `2026-10-10-ids.json`: **one-time migration inputs/ID map**, not live status. Do not reapply to an initialized store or edit them to change current issues.

All review findings map to issues. B1 storage/audit maps to safety plus deferred event streams; B2 to paths/relink; B3 to restore/export correctness plus deferred broader recovery; B4 to historical evidence and optional ASR repairs; B5 to morphology plus deferred dictionary; B6 to learning and deferred snippet reuse; B7 to accepted extraction evidence and deferred alignment/OCR; B8 remains deferred. Previously accepted features were not expanded into a fabricated completed-task history.

## Local durability, export and sync

**Dolt data is not stored in ordinary Git commits.** A checkout of repository files alone does not restore the complete work graph/history. The canonical database is under `.beads/embeddeddolt/` and is Git-ignored.

The Dolt database is intentionally local-only: no configured Dolt sync remote, auto-push off, auto-backup off, no automatic Git staging, and `--sandbox` on operational CLI calls. `bd sync`, `bd dolt push/pull` and remote setup require separate authorization. Ordinary Git commits and pushes follow `GIT-POLICY.md`; this includes reviewed planning documents and issue exports, not runtime databases. Anonymous bd command telemetry was found enabled during discovery and disabled; initial discovery commands may have queued anonymous command-usage events, not issue content.

`.beads/issues.jsonl` is a generated issue interchange/readable snapshot. It is **not the canonical store or a full backup**. It captures issue records/dependencies/comments, not complete Dolt history or all database tables. Refresh it explicitly after a meaningful planning batch with `bd --sandbox export --all -o .beads/issues.jsonl`; never hand-edit it as a competing tracker.

A full local Dolt backup destination is configured separately from Git at `C:/Users/jmdzi/AppData/Local/lingotorte/beads-backups/takeover-2026-10-10`. This protects against accidental store loss, **not machine/disk loss**. Use `bd --sandbox backup status` to inspect the actual destination/status, and `bd --sandbox backup sync` after meaningful work. Off-machine backup/sync is a future explicit decision, not silently enabled here.

If the canonical store is missing, stop before `bd init`: restore a verified full backup or deliberately recover issue records into an isolated store and verify completeness. Do not report JSONL recovery as full history recovery. Never run destructive init/restore over live work. The migration verification receipt records what backup/readback was actually exercised.

**Initialization pitfall (bd 1.3.1):** `bd init --skip-hooks --skip-agents` still auto-created a Git setup commit and a sync-remote setting in this repo. Setup commits were undone under the user's instruction to preserve files and keep this migration uncommitted; HEAD returned to `a703dab`, and the remote setting was removed. A scratch-store init also created a repo setup commit when launched from the primary process cwd despite `BEADS_DIR`, `-C` and scratch `no-git-ops`; it too was undone with all files preserved. The database restore itself was verified isolated via `bd where` and exact exported-record comparison. These flags are not “no Git commit.” Do not rerun init in this initialized checkout or assume they suppress all Git side effects.
