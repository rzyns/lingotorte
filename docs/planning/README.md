# Lingotorte planning bundle status

Status: historical/reference parent planning bundle. These documents preserve the original product, architecture, evidence, safety, and acceptance rationale, but they are not the current implementation status ledger.

For current status and remaining work, start with [`../../PLAN.md`](../../PLAN.md), then check [`../dev/local-runbook.md`](../dev/local-runbook.md), [`../dev/v1-local-acceptance.md`](../dev/v1-local-acceptance.md), recent commits, and the code/tests.

## How to use these files now

- Use `final-implementation-plan.md`, `feature-build-roadmap.md`, `product-behavior-spec.md`, `local-first-architecture-data-model.md`, `language-srs-practice-plan.md`, and `testing-and-acceptance-plan.md` as design and acceptance references.
- Do not treat older future-tense milestones as proof that a feature is still missing; verify against current code and docs first.
- Keep `safety-privacy-legal-boundaries.md` and the safety sections copied into other docs as binding gates unless Janusz explicitly changes them.
- Keep `evidence-index.md` and `evidence-cartography.md` as provenance/evidence references, not dependency/license approval.
- Provider enablement, model downloads, media downloads, sync, AnkiConnect, microphone recording, deploy, push/release, public sharing, and live Lingopie inspection remain separately gated actions.

## Current backlog pointer

As of the 2026-06-23 reconciliation, the short current backlog is maintained in `PLAN.md`:

1. granular storage, migrations, and auditability;
2. durable media handle / native path story;
3. backup/export/restore polish;
4. local ASR dependency/model proof;
5. Polish dictionary/morphology/translation quality;
6. practice and progress polish;
7. subtitle ingest robustness and alignment tooling;
8. optional future gated lanes.
