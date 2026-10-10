# Lingotorte native Beads store

Read [BEADS.md](../BEADS.md) for the canonical workflow, scope gates, commands and recovery.

- Embedded Dolt is the authoritative local database; do not edit its files.
- `issues.jsonl` is a generated issue export, not a full backup or live authority.
- `migrations/` contains one-time seeding and verification evidence; do not rerun the seed or maintain it as a second plan.
- No remote sync, auto-push, automatic Git staging or agent/hook setup is enabled by this migration.
- Do not run `bd init` over this initialized store. Its Windows v1.3.1 init has Git side effects even with skip-hooks/skip-agents.
- Worktrees must use the primary checkout store through `bd -C`, not create their own.
