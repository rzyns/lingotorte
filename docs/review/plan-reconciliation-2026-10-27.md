# Remaining-plan reconciliation — 2026-10-27

Evidence/disposition record for `lt-3fi`, not a second backlog. Beads holds current issue state, exact amended acceptance and completion evidence. The Hermes R0–R13 checklist tracks this editing pass; it does not authorize product implementation.

## Scope and baseline

Janusz approved the preceding review's planning revisions and asked for an explicit, checkable edit list to avoid introducing new inaccuracies. Baseline: `bfa038e4241f7943d0a7d9ea8555b08d82347806`; primary checkout was clean and matched remote main at discovery. Work is isolated on `work/lt-3fi-plan-reconciliation`.

Allowed: source/decision verification, issue-description and acceptance reconciliation, current documentation, satisfied decision closure after independent review, reviewed work-branch publication under GIT-POLICY. Excluded: application/script implementation, runtime execution, deployment, real-state/media discovery or transfer, provider/download activity, legacy-table deletion, reactivation of frozen Windows budgets, and main integration by implication.

## Recorded starting point

- `lt-foe` closed with Janusz's explicit acceptance on 2026-10-16; 17 direct children closed.
- `lt-584.1`–`.6` and prerequisite `lt-5lb.9` closed. ADR-0003 is Accepted; gate merge `813d5a6`.
- `lt-584` remains open for `lt-584.7`. This amendment does not implement or close that child.
- Recorded gate evidence: 2017 tests passed / 1 skipped, typecheck/build/privacy/no-network checks. These historical results were not rerun by the planning pass.
- `lt-fls` remains an unresolved retirement decision. Optional work is not a new daily-driver acceptance requirement.

## Edit-to-evidence map

Source locations below refer to baseline `bfa038e`; locate by symbol after code changes. Rows describe planning edits, not implemented behavior changes.

| Checklist | Target and specific revision | Evidence/check |
| --- | --- | --- |
| R0 | Preserve original issue fields/comments; record narrow authority; create a dedicated worktree and `lt-3fi` | Canonical store readback, clean Git baseline, scope comment on `lt-dy6`; no feature issue claimed |
| R1 | Replace `lt-5lb.10`'s rejected blob-authority instructions with chosen Option B and satisfaction evidence; reconcile `lt-584` to remaining `.7` | Existing 2026-10-19 decision comments; ADR-0003 Accepted/Outcome; operator epic check. Decision closure requires independent review; epic stays open |
| R2 | `lt-5lb.7`: keep active-card early return and cache the lookup once; consolidate helper dispositions and directly affected test permissions; exclude clone optimization | `apps/web/src/model.ts:3491–3495` bypasses dirty/save on the existing-card path; `:772–775` demonstrates persistence is not inert. Original expansion comment contradicts the one-test-only acceptance |
| R3 | `lt-5lb.11`: sole owner of write-clone optimization, with import and media-hydration coverage | `packages/storage/src/localStore.ts:195–212` clones per cue/timing; `apps/web/src/model.ts:444–460` does per-row hydration. Ignored return values do not avoid the clone; loaded media accumulate, not evict |
| R4 | `lt-5lb.8`: additive actual `reviewEventId` result, same configured ReviewService/store, exact event linkage and non-rating cases; inventory real callers | `packages/review/src/reviewService.ts:58–80` creates event but returns card/state; `packages/storage/src/practiceService.ts:47–68,91–108` uses event ID and a separate default scheduler. No current server import to edit |
| R5 | `lt-584.7`: identify true old-format producers; bundle-first writes, per-write CAS chaining, strict learner shape, preserved fixtures/oracles and bounded contract tests | `scripts/qualification/browser-batch/runtime-batch.mjs:94–97` constructs forbidden keys. `lt-sor/runtime-live-v2.mjs:51–53,66–71` round-trips learner GETs; do not classify it as incompatible from the envelope name alone. Historical live qualification remains distinct |
| R6 | `lt-fls`: keep decision unapproved; full DB recovery evidence, populated old upgrades and historical fixture rebuilds before future drop | Current schema 12; `sqliteLocalPersistence.ts` `readLegacyBlob` already tolerates absent table. v12 backfill precedes future drop. Learner export is not full library/audit recovery |
| R7 | Reconcile current migration numbering, cache exception and not-loaded contract; label completed child instructions historical | v11 revision / v12 rename-backfill / proposed future v13; ADR Outcome D-R10; `occurrenceContext` at `model.ts:1007` already implements not-loaded. Preserve receipts and old baselines as history, not new work |
| R8 | `lt-5lb.3`: explicit sample/coverage gate, categorized missing-entry versus lemma/POS/sense problems, incremental useful English gloss evidence | DECISIONS §16a and meanings evaluation Follow-up children; no arbitrary threshold, acquisition approval or automated activation |
| R9 | `lt-5lb.6`: unresolved stop-review versus hide-item choice, behavior matrix across Saved/Review/Practice/exports/reactivation | ADR-0002 limitation; current Capture card suspension does not write item archivedAt. No new lifecycle chosen |
| R10 | `lt-jxg`, `lt-eet`, `lt-42c`: Docker/private-LAN wording; designated existing setup; optional transfer; operational DB recovery distinct from a new export product | DECISIONS runtime amendment/§14; local runbook export limits. No private-state inspection or operational permission; original deferred states retained |
| R11 | README/BEADS/DECISIONS navigation: accepted milestones, Docker-first, completed Anki file export with receipt limits, actual learner-export scope | `lt-foe` human acceptance, `lt-dxo` closure at `8a70271`, `lt-7lq` export limits. Preserve non-release/real-installation distinction and separate Anki live-check limitations |
| R12 | Compare all edits to original records/source, check no added authority/hidden duplicate work, then independent SPEC and QUALITY | Exact verdicts and corrections are recorded on `lt-3fi`; changed descriptions are read back and prior comments retained |
| R13 | Atomic docs and generated tracker commits, remote readback and local Beads backup | GIT-POLICY and BEADS durability rules; work-branch publication is not main integration or deployment |

## Corrections to the review itself

The review claimed the Git-policy reference in DECISIONS was literally `***`. Direct file-content assertions disproved that: the source contains a valid backticked `GIT-POLICY.md` reference and the target exists; output redaction caused the misleading display. **No edit is warranted and that line is unchanged.** This finding is withdrawn, not silently counted as fixed.

The initial qualification issue also overgeneralized the `lt-sor` state writers. Its revised description distinguishes the confirmed browser-batch producer from already learner-shaped GET round-trips; remaining source/harness inventory is still required before implementation.

## Decisions deliberately not made

No dictionary coverage threshold or new download approval; no item-archive behavior selected; no personal stack/source state assumed; no old-state migration or persistent deployment approved; no legacy-drop date approved; no optional platform/provider/packaging/UI/media-streaming lane promoted into required completion. Service-media streaming remains design-only unless separately activated from demonstrated handle friction. The proposed implementation order is reconciliation/qualification follow-up, then explicitly scoped personal-use/recovery needs and evidence-led import/scheduling improvements—not an instruction to execute the optional backlog.

## Verification boundary

This is a documentation and tracker change. Validation consists of exact source/decision checks, issue field/status/dependency readbacks, whole-graph preservation checks, Markdown/link and diff checks, and independent review. Application tests, browser checks, runtime migration and live deployment are not claimed by this amendment. Canonical Beads comments hold final verification, review, publication and closure receipts; generated JSONL is an interchange snapshot, not a full Dolt-history backup.
