# Fable 5 Review: B1 remaining item — export-job/provider-policy projections scoping

## Context

You are reviewing the Lingotorte project — a local-first language-learning video app — to scope an outstanding item from the B1 (Granular Storage, Migrations, Auditability) backlog.

## Files to review

Read these files in full before answering:
- `/home/openclaw/workspace/lingotorte/PLAN.md`
- `/home/openclaw/workspace/lingotorte/PLAN-STATUS.md`
- `/home/openclaw/workspace/lingotorte/docs/architecture/data-model-and-storage.md`
- `/home/openclaw/workspace/lingotorte/packages/storage/src/localStore.ts` (key type definitions)
- `/home/openclaw/workspace/lingotorte/apps/local-service/src/server.ts` (job and provider patterns)

## The outstanding item

PLAN.md B1 scope/status says:

> "Remaining: export-job/provider-policy projections when those become first-class local store entities."

PLAN-STATUS.md says this item is "gated on future entity creation — nothing to do until that's scoped."

## Your task

Answer the following questions as precisely as possible, citing specific types/tables/fields from the code you read:

### Q1 — What is the minimal viable shape of an `export_job` entity?

Lingotorte already has browser JSON manifest export/import. What new persistent state would a first-class `export_job` entity need to track that the current implementation doesn't track? Consider:
- Job lifecycle: pending → running → done/failed
- What is being exported (media refs, cues, saved items, review history, etc.)
- Output format/destination (file path, manifest SHA)
- Error details and retry intent
- Whether this is a user-initiated job or an automated backup

### Q2 — What is the minimal viable shape of a `provider_policy` entity?

Lingotorte has provider enable/disable configuration in the local store. What new persistent state would a first-class `provider_policy` entity need? Consider:
- Which provider (ElevenLabs, YouTube captions, future providers)
- Per-provider enabled/disabled flag
- Per-provider credentials / token storage (or reference to external secrets store)
- Rate limits, quota tracking, cost estimation
- Approval state (explicit user consent before first use)
- Whether the policy is scoped to a specific import job or global

### Q3 — Are these two entities related?

Could an `export_job` reference a `provider_policy` (e.g., an ElevenLabs export that uses provider credentials)? Or are they independent?

### Q4 — What is the smallest first step?

Given the architecture in `data-model-and-storage.md` and the existing SQLite schema in `localStore.ts`, propose the minimal first migration that introduces one of these entities — with the smallest useful surface area. Include:
- New table name and columns
- How it relates to existing tables
- Whether it needs an append-only event stream or just a mutable record
- What the "nothing exported yet" / "no policy configured" initial state looks like

### Q5 — What should be preserved from B1?

The B1 slice already has:
- Forward-only migration ledger
- Typed projections for all current entities
- Append-only replay for `review_event` and `import_job_event`

What naming conventions, migration patterns, or projection patterns from B1 should the new entity follow?

## Constraints

- Local-only: no cloud sync, no external services by default
- Privacy-by-default: no provider credentials in plain text in the DB
- Append-only event streams preferred for state that represents historical facts (exports are historical facts; policies are intentional state)
- Keep it minimal: this is scoping for a future slice, not implementation

## Output format

Provide your answer in structured Markdown with clear sections for each question. Be specific about type names, column names, and code patterns. Where you must guess or infer, say so explicitly.
