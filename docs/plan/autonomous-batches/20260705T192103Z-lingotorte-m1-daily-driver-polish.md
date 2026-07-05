# Lingotorte M1 autonomous daily-driver polish batch

- Batch id: `LDM1-20260705T192103Z`
- Approval timestamp: 2026-07-05T15:25:39-04:00
- Materialized by: default profile operator
- Board: `default`
- Repository: `/home/openclaw/workspace/lingotorte`
- Start baseline before materialization: `dbfd347`
- Planned branch: `lingotorte/m1-daily-driver-polish`
- Shared integration worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
- Canonical source docs: `PLAN.md`, `DECISIONS.md`, `PLAN-STATUS.md`, `docs/dev/local-runbook.md`, `docs/review/safety-privacy-boundary-review.md`

## Approval / autonomy envelope

Janusz approved autonomous execution of the next Lingotorte local daily-driver polish batch using Kanban with internal review/repair loops and no human interaction until the final deliverable gate.

Allowed without further human input:

- local repo edits inside Lingotorte;
- isolated worktree use;
- exact-scope local commits;
- synthetic/temp fixtures;
- local loopback service smoke tests;
- focused tests/build/privacy scans;
- docs/runbook/status updates;
- internal review, repair, and re-review loops.

Not authorized without fresh explicit human approval:

- push, PR, release, public deploy/exposure/sharing;
- destructive edits to Janusz real learner state, real media library, provider accounts, or external apps;
- DRM/circumvention;
- private/account-gated media access;
- automatic online media downloads;
- cloud sync;
- AnkiConnect mutation;
- microphone or learner voice capture/retention;
- provider classes beyond the already documented `DECISIONS.md` allow-list;
- committing secrets/keys, raw provider request bodies, model caches, generated media/audio/transcript scratch artifacts, private absolute paths in defaults/logs/exports/fixtures.

If a worker hits a true boundary, it must preserve evidence and block with a concise reason. Routine implementation choices should be handled locally, documented, reviewed, and repaired if necessary without asking Janusz.

## Batch scope

This M1 batch is deliberately serial to avoid collisions in the shared worktree:

1. B2 durable media handle/relink polish.
2. Independent B2 review.
3. B3 metadata backup/export/restore polish.
4. Independent B3 review.
5. B4 local ASR harness/runbook verification, with live benchmark skipped unless an exact approved owned local clip path already exists.
6. Independent B4 review.
7. Integration validation.
8. Final independent review.
9. Final packet/human gate.

Out of this batch unless a worker creates a reviewed follow-up repair card within the same authority envelope:

- B6 source-media snippet implementation;
- B7 embedded subtitle extraction implementation;
- live provider calls;
- live real-media benchmarks;
- packaging/distribution/public release.

## Task graph

| Step | Task id | Title | Assignee | Parents | Expected terminal state |
|---|---:|---|---|---|---|
| 00 | `t_bb5dca48` | LDM1-00: Lingotorte M1 autonomous daily-driver polish kickoff | `default` | — | done after verifying this committed manifest/worktree |
| 01 | `t_e892e455` | LDM1-01: preflight and shared worktree setup | `default` | `t_bb5dca48` | done |
| 02 | `t_bb077be2` | LDM1-02: B2 durable media handle and relink polish | `frontend-eng` | `t_e892e455` | done with exact-scope local commit |
| 03 | `t_44a617d6` | LDM1-03: review B2 media handle polish | `reviewer` | `t_bb077be2` | PASS or BLOCK |
| 04 | `t_757fa776` | LDM1-04: B3 metadata backup/export/restore polish | `frontend-eng` | `t_44a617d6` | done with exact-scope local commit |
| 05 | `t_9f7492e8` | LDM1-05: review B3 backup/restore polish | `reviewer` | `t_757fa776` | PASS or BLOCK |
| 06 | `t_e917b878` | LDM1-06: B4 local ASR harness and runbook verification | `backend-eng` | `t_9f7492e8` | done with commit or no-change evidence |
| 07 | `t_ef338a96` | LDM1-07: review B4 ASR harness verification | `reviewer` | `t_e917b878` | PASS or BLOCK |
| 08 | `t_f8000616` | LDM1-08: integration validation for M1 daily-driver polish | `qa` | `t_ef338a96` | done with validation receipt |
| 09 | `t_1da27ce3` | LDM1-09: final independent review of M1 batch | `principal-reviewer` | `t_f8000616` | PASS or BLOCK |
| 10 | `t_bc700d35` | LDM1-10 HUMAN GATE: final Lingotorte M1 packet and next decision | `default` | `t_1da27ce3` | blocked `needs_input` after packet creation |

## Runtime routing repair 01

At 2026-07-05T15:31-04:00, the original B2 implementation card `t_bb077be2` was claimed by `frontend-eng` three times and crashed before work because that profile's configured `kimi-k2.7-code` / Ollama Cloud provider returned weekly-quota HTTP 429 errors. This is a worker-runtime capacity issue, not a Lingotorte product or safety boundary.

The active chain was therefore re-routed to stable GPT-backed implementation/validation cards while preserving the original blocked specialist card as evidence. The non-authorization envelope above is unchanged.

| Step | Task id | Title | Assignee | Parents | Expected terminal state |
|---|---:|---|---|---|---|
| 02R | `t_b5e6e6e5` | LDM1-02R: B2 durable media handle polish runtime fallback | `default` | `t_e892e455` | done with exact-scope local commit |
| 03R | `t_f4b87e36` | LDM1-03R: review B2 runtime fallback polish | `reviewer` | `t_b5e6e6e5` | PASS or BLOCK |
| 04R | `t_9c4ffb75` | LDM1-04R: B3 backup/export/restore polish runtime fallback | `default` | `t_f4b87e36` | done with exact-scope local commit |
| 05R | `t_ee23d449` | LDM1-05R: review B3 runtime fallback polish | `reviewer` | `t_9c4ffb75` | PASS or BLOCK |
| 06R | `t_98c4a0da` | LDM1-06R: B4 ASR harness/runbook runtime fallback verification | `default` | `t_ee23d449` | done with commit or no-change evidence |
| 07R | `t_0a83503c` | LDM1-07R: review B4 runtime fallback verification | `reviewer` | `t_98c4a0da` | PASS or BLOCK |
| 08R | `t_89bf8506` | LDM1-08R: integration validation for M1 runtime fallback chain | `default` | `t_0a83503c` | done with validation receipt |
| 09R | `t_916b0917` | LDM1-09R: final independent review of M1 runtime fallback batch | `principal-reviewer` | `t_89bf8506` | PASS or BLOCK |
| 10R | `t_39378871` | LDM1-10R HUMAN GATE: final Lingotorte M1 fallback packet and next decision | `default` | `t_916b0917` | blocked `needs_input` after packet creation |

The final intended human gate is now `t_39378871`. The original final gate `t_bc700d35` is superseded unless the operator explicitly revives the original specialist chain.

## Review / repair policy

- A reviewer `BLOCK` is not a human gate by default.
- The operator/watcher should preserve the blocked review as evidence, create a narrow repair card assigned to the original implementation owner, then create a fresh independent review card behind the repair and link the downstream continuation to the fresh review.
- `NEEDS HUMAN DECISION` is reserved for true authority/product boundaries that cannot be safely resolved inside `DECISIONS.md`.
- No worker should call `clarify`; use `kanban_block` with evidence only for genuine blockers.

## Validation expectations

The integration validation card should attempt, from the shared worktree, recording exact output/status:

```bash
git status --short --branch
git log --oneline --decorate -8
git diff --check
npm run typecheck
npm run test:no-network
npm run scan:privacy
npm test
npm run build
python3 validate_final_bundle.py
```

A missing script or missing optional model/media input is not automatically fatal; it must be classified accurately.

## Final gate contract

The final packet card must prepare a concise artifact with:

- summary of changes;
- commit SHAs;
- changed files;
- tests/validation results;
- review verdicts;
- safety/privacy boundary confirmation;
- deferred/non-authorized actions;
- recommended next options.

Then it must block itself with reason:

> HUMAN-GATE: Lingotorte M1 final packet ready; choose accept, repair, authorize push/PR, or authorize next local batch.

That blocked final card is the first intended human interaction for this batch.
