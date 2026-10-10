# Native planning migration verification

Historical qualification base: `a703dab`; migration was uncommitted at qualification. No application implementation or new runtime qualification performed during graph migration. Subsequent publication is explicitly authorized under `GIT-POLICY.md`; consult Git history and native issue notes for published revisions.

## Evidence

- Native record readback matched 49 seed nodes, 79 blocking edges and 47 parent links. Graph check reported zero cycles.
- Independent read-only review `deleg_47cdadc1/task-0` passed semantic coverage of R1–R12 and B1–B8, required/optional separation, authorization gates and finite acceptance.
- Review caveats resolved: BEADS.md excludes organizational epics from the actionable frontier; lt-04i requires explicit downstream contract revision if replacement is disabled; lt-4ct closes successfully only on actual acceptance, not repair/defer; lt-13v clarifies stage-specific portability regression scope.
- Seed/ID files remain historical migration input; native records include these subsequent review corrections.
- Prior plan/status preserved in docs/plan/archive with line positions and relocated Markdown relative links. Root files are pointers; AGENTS/README/DECISIONS identify native authority.
- `git diff --check` and `python validate_final_bundle.py` passed; artifact manifest entries refreshed for changed README/AGENTS.
- Native Hermes smoke/show succeeded. The filtered frontier was authorization plus migration before closure; closure verification requires authorization only.
- Full local Dolt backup synced to `C:/Users/jmdzi/AppData/Local/lingotorte/beads-backups/takeover-2026-10-10`. Restored into scratch `lingotorte-beads-restore-20261010`, confirmed isolated database with `bd where`, and compared all 49 exported records/dependencies exactly. Later review changes require a refreshed backup/export.
- No Dolt remotes configured; anonymous metrics disabled; automatic Git staging/export/backup and auto-push disabled. Local backup is not off-machine protection.

## Tooling incident and limitations

`bd init` auto-created setup Git commits, including during scratch initialization despite BEADS_DIR/-C configuration. Setup commits were undone with mixed reset under the instruction to retain all files and keep migration uncommitted. Actual process cwd must isolate initialization; do not rerun it here. HEAD restored to a703dab. No push, deployment, provider/media operations or real learner-state changes.

This receipt qualifies the planning migration, not the application. Existing Windows and correctness failures remain open native issues. Parent/operator closed lt-e9g after review corrections, verified the closed record, refreshed export/backup, and confirmed lt-dy6 alone remained on the non-epic ready frontier.
