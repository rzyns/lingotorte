# B1 Remaining Item Review — export_job / provider_policy Scoping

**Reviewed by:** Claude Code (Fable 5, `--model claude-fable-5`)
**Session:** `7a1a6e11-7eee-48eb-bf6e-c9d8f42de699`
**Date:** 2026-07-04T13:33:58-04:00
**Model usage:** `claude-fable-5` — inputTokens: 7867, outputTokens: 9272, cacheReadInputTokens: 170709, costUSD: 1.84

## Files reviewed

- `PLAN.md` — current backlog
- `PLAN-STATUS.md` — current status
- `docs/architecture/data-model-and-storage.md` — target storage model
- `packages/storage/src/localStore.ts` — LocalStore type definitions
- `packages/storage/src/sqliteLocalPersistence.ts` — migration ledger + SQLite patterns
- `apps/local-service/src/server.ts` — job and provider patterns
- `packages/domain/src/coreTypes.ts` — domain types

---

## Summary

Fable 5 scoped two independent entities:

### `export_job` — recommended first step

Browser JSON exports already happen (B3 added file-save with integrity readback) but nothing records that an export occurred. Minimal shape:

| Field | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `kind` | `TEXT CHECK IN (...)` | `'learner-json-manifest'` (extensible to `'anki-apkg'`, `'backup-snapshot'`) |
| `status` | `TEXT CHECK IN (...)` | `'pending' \| 'running' \| 'completed' \| 'failed'` |
| `started_at` | `TEXT` | ISO 8600 |
| `completed_at` | `TEXT` | nullable |
| `destination_kind` | `TEXT CHECK IN (...)` | `'browser-download' \| 'file-system-access'` |
| `destination_label` | `TEXT` | filename only — **never absolute path** |
| `manifest_sha256` | `TEXT` | digest from B3 readback verification |
| `content_summary_json` | `TEXT` | versioned counts/flags per collection |
| `error_code` | `TEXT` | + optional redacted message |

**Migration v6** (`create_export_job_projection`): single `CREATE TABLE IF NOT EXISTS export_job` + index + schema version bump.

**Key design decisions:**
- Mutable projection, not append-only (exports are synchronous one-shot; `import_job` pattern)
- No foreign keys to other tables
- `destination_label` is filename only — preserves privacy boundary against absolute local paths
- No `export_manifest_item` per-object rows — overkill until backups are a product

### `provider_policy` — follow-on after export_job

Already works via env + per-request consent; persistence adds little until a settings UI wants to own it. Minimal shape:

| Field | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `provider_id` | `TEXT` | `'elevenlabs-scribe' \| 'youtube-caption'` |
| `enabled` | `INTEGER` | default `false` |
| `allowed_data_classes` | `TEXT` | JSON array lifted from existing `ProviderPolicy` type |
| `requires_confirmation` | `INTEGER` | default `1` (true) — preserves two-layer gate |
| `first_approved_at` | `TEXT` | nullable |
| `created_at` | `TEXT` | ISO 8600 |
| `updated_at` | `TEXT` | ISO 8600 |

**Key design decisions:**
- **Absence of a row means disabled** — never seed enabled policy rows
- No credentials in DB — keep env-only pattern; at most store `credentialRef` naming the env variable
- No rate limits/quota/cost tracking — not yet needed
- Mutable single-row-per-provider (policy is intentional state, not historical fact)
- Append-only `provider_policy_event` audit trail deferred

### Relationship

**Independent** — no FK between them. ElevenLabs and YouTube are import/transcription providers, not export providers. Future touchpoints noted but don't require a FK today.

### Smallest first step

Do `export_job` first (v6 migration). Provider policy follows as v7.

---

## Explicit guesses to verify at implementation time

1. Exact `ExportIntegrity` field name for the manifest digest (check `coreTypes.ts:340`)
2. Whether B3 save path currently exposes a filename allowed as `destination_label`
3. `providerId` enum spelling (`'youtube-caption'` vs track-provenance-flavored)

## Preserved B1 patterns

- Naming: singular snake_case tables ↔ PascalCase domain types
- Migration mechanics: `MigrationDefinition` with `migrationChecksum`, forward-only enforcement, `CREATE TABLE IF NOT EXISTS` idempotence, `BEGIN IMMEDIATE` transaction, schema version upsert inside migration SQL
- Column conventions: `TEXT PRIMARY KEY` UUIDs, ISO `TEXT` timestamps, `CHECK IN (...)` enums, `_json` suffix for versioned JSON
- Projection pattern: `*Row` types + rebuild-from-snapshot; append-only tables (when they arrive) follow `review_event`/`import_job_event` semantics
- Privacy: no secrets, no raw provider payloads, no absolute local paths — keep `npm run scan:privacy` green
- Tests: empty-DB migration ledger test + round-trip projection test per entity
