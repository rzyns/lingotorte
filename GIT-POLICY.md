# Atomic commit and push policy

Janusz explicitly authorized this policy for Lingotorte: commit and push atomic changes as work is completed, rather than accumulating an uncommitted session. This supersedes earlier blanket requirements to ask again before each ordinary commit/push. It does not authorize new implementation scope.

- Make each commit one coherent, reviewable change, with its relevant tests and documentation. Reference the Beads issue ID when applicable. Do not combine unrelated fixes or wait until the whole epic/session is finished.
- Run the relevant verification and review before committing. Record exact results and known baseline failures; never describe a failing baseline as green. Do not push broken intermediate work merely to satisfy cadence.
- Inspect the staged diff and explicitly stage only intended paths/hunks. Never sweep in another agent's edits, secrets, learner state, media, caches, credentials or runtime databases.
- Push each completed atomic commit to the existing origin on the work branch after verification. Use dedicated branches/worktrees for concurrent work; pushing a branch does not imply merging to main. Follow branch protection and existing integration rules. Do not create a new remote or change repository visibility.
- Verify remote branch readback contains the commit before reporting it pushed. If authentication, branch protection, divergence or network failure blocks a push, retain the local commit and report the exact blocker; do not force-push, reset others' work or silently accumulate unpublished work.
- No force-push, published-history rewrite, release/tag, deployment, public sharing beyond the existing repository, or real-state/provider action is authorized by this policy.
- Record implementation revision and push evidence in the canonical Beads issue. Refresh the sanitized JSONL export at meaningful issue/planning checkpoints in a separate small tracking commit when needed; do not create a recursive commit merely to record its own hash. Keep full Dolt backup local unless separately authorized.
- Existing uncommitted audit/migration work must be reviewed and split into coherent baseline commits before application implementation; this policy does not make a blanket `git add .` acceptable.

This is standing project-specific commit/push authorization, not permission to start all ready issues. Application scope remains subject to its Beads authorization gate.
