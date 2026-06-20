# Reviews

This directory stores independent review evidence for the Lingotorte planning repository.

## 2026-06-20 independent model reviews

Directory: [`2026-06-20-independent-model-reviews/`](./2026-06-20-independent-model-reviews/)

Scope: full committed planning repository at commit `bcd74c5c7d909402a9f129c713cd9afd9cff6dec`, excluding `.git/` and review artifacts.

Requested reviewers:

- `kimi-k2.7-code`
- `M3`
- `gpt-5.5 (default)`
- `Opus 4.8` via the Claude/Claude Code integration

Start with:

1. [`2026-06-20-independent-model-reviews/orchestrator-triage.md`](./2026-06-20-independent-model-reviews/orchestrator-triage.md) — accepted verdicts, spot-checks, and follow-up suggestions.
2. [`2026-06-20-independent-model-reviews/attempt2-hermes-file-read/attempt2-summary.md`](./2026-06-20-independent-model-reviews/attempt2-hermes-file-read/attempt2-summary.md) — accepted Kimi/M3/GPT-5.5 reviews after the repaired file-read route.
3. [`2026-06-20-independent-model-reviews/review-summary.md`](./2026-06-20-independent-model-reviews/review-summary.md) — initial packet summary plus Opus accepted review and preserved first-attempt Hermes ARG_MAX failures.

The initial no-tool Hermes attempt is preserved because the full packet exceeded the OS argument-length limit before those models were invoked. The repaired Hermes attempt used a small prompt plus file-read access to the on-disk packet.

Raw packet and prompt artifacts are stored as `.txt` files rather than `.md` files so the project validator does not parse embedded source Markdown links as live review-document links.
