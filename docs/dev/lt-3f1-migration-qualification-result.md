# lt-3f1 — populated historical SQLite migration qualification

## Candidate and change

Baseline: `7acb49d` (main, includes lt-04i v9 `active_learner_audit_membership`, lt-f5h v8 `expand_practice_modes`, lt-8hh revision metadata). Branch `work/lt-3f1-migration-qual`. Binding contract: [restore-audit-semantics-contract](restore-audit-semantics-contract.md) §5 and §7 T11–T14.

New test file `tests/core/legacyMigrationQualification.test.ts` (24 tests). Fixtures are built from scratch in each test: the independently frozen v1–v7 SQL in `tests/fixtures/sqlite-v7-migrations.json` (checksum checked first) is applied to a test-owned temp file and a historical ledger is written. Two shapes are built:

- **pre-v5 (v1–v4):** history exists only in the snapshot JSON. It includes reviews with and without optional fields, one attempt in each of the five practice modes (linked and unlinked, one with optional fields omitted), and two import-job events.
- **v5/v7 mixed:** history in both the snapshot and the tables. Some IDs are in both with identical payloads, some are table-only, some are snapshot-only, and there is one extra table-only `audio-recall` attempt.

Both shapes also contain populated unrelated collections: media, observation, track, cue, item with notes, occurrence/source anchors, card, FSRS state, import/export job and provider policy, plus pre-existing projection rows. The redaction tests use marker strings for answers, notes, cue text and the media path.

Product change (minimal, forward-only): migration and save conflict diagnostics now name the conflicting record ID, as §5.2 requires ("redacted collection/ID diagnostic"). They still never include payload contents. Historical v1–v9 SQL, migration names and checksums are unchanged, and no v10 was needed.

- `learnerAudit.ts` `unionHistory`: `Immutable history conflict: <collection> <id>`
- `sqliteLocalPersistence.ts` `appendLearnerAudit`: `Immutable history conflict: practiceAttempts <id>`; `initializeActiveAudit`: `Conflicting legacy import-job event <id>`

The existing message prefixes are kept, so existing `/immutable/i` and `/conflict/i` assertions are unchanged.

## T11–T14 matrix

| Case | Required assertion | Test (describe › it) | Result |
| --- | --- | --- | --- |
| T11 | Pre-v5 snapshot-only history backfilled once. IDs/content, all modes, linked and unlinked links, import-job events and unrelated collections preserved. Membership seeded conservatively (all active). Recovery counts reported. Open ×3 produces identical tables and revision, with no second backfill. | T11 › pre-v5 snapshot-only history … stable across two reopens | pass (pre- and post-fix) |
| T11 | v7 mixed: identical IDs merged; table-only and snapshot-only sets both recovered; legacy rows never rewritten; v1–v7 ledger rows byte-equal | T11 › v7 mixed snapshot + table history … | pass |
| T11 | Reopen twice does not reactivate intentionally inactive audit (empty replace → ordinary save → reopen ×2) | T11 › reopening twice does not reactivate … | pass |
| T12 | Conflicting same-ID legacy review / practice / import-job payload: refuses v9 with a collection+ID message that contains no payload; no marker, membership or v9 ledger row; source rows unchanged; repeat refusal adds no state | T12 › conflicting same-ID legacy %s (×3) | **red → green** (missing ID) |
| T12 | Corrupt snapshot (unparseable, array root, non-array history, invalid payload) refused; not normalized to empty success | T12 › corrupt legacy snapshot (×4) | pass |
| T12 | Changed checksum, changed name, ledger gap, or schema/ledger disagreement refused before any forward migration, with the file unchanged | T12 › pre-v5 fixture with %s (×4) | pass |
| T12 | Future ledger row or future schema marker on an upgraded populated DB refused without mutation; future snapshot schema refused on load and save | T12 › upgraded populated DB with %s (×2); future snapshot schema row … | pass |
| T12 | Injected v9 failure after audit backfill, after import-job backfill, or at the post-marker snapshot rewrite (before ledger success) leaves the whole DB equal to before (no marker or membership); forward retry backfills exactly once and survives reopen ×2 | T12 › injected v9 failure %s (×3) | pass |
| T12/§5.7 | Injected v8 practice-rebuild failure rolls back and keeps legacy practice rows; retry succeeds | T12 › injected v8 practice-table rebuild failure … | pass |
| T13 | `node:sqlite` `backup()` of a populated upgraded DB with active ≠ audit and writes still in the WAL. The copy opens independently, with equal versioned snapshot/revision, audit, migrations, status/recovery marker, job events, media and full table/index state. | T13 › consistent SQLite backup … | pass |
| T13 | A pre-upgrade backup copy keeps the v7 ledger/state for old-binary recovery. The upgraded original and its later writes are not affected. No in-place downgrade: future-schema refusal is covered in T12. | T13 › pre-upgrade backup copy … | pass |
| T14 | All five modes survive pre-v5 migration → empty replace → explicit restore/reactivation (0 appended) → reopen. Provider policy unchanged, no media added, `fetch` never called. Redaction is checked in every T12 refusal. | T14 › all supported modes … | pass |

T13 "client/server capability mismatch refuses restore" is already covered by `tests/web/durableRestoreIntegration.test.ts` ("connected restore refuses missing capability without local mutation or unsafe PUT"). It was not duplicated here.

## Red/green

- Exact-final red: the final test file was copied into a detached scratch worktree at `7acb49d` (original production bytes: `sqliteLocalPersistence.ts` `121631f9…d9e`, `learnerAudit.ts` `51eac022…879`). Image `lingotorte:lt-3f1-red-exact` `sha256:8c8eb8daef3598cabc411e7a0095d62b08f3bb1aeb1b47df8e9d66e950406430`. Result: exit 1, 3 failed / 21 passed. All three failures were the conflict diagnostic lacking the record ID. Before that assertion was added, the same suite passed 24/24 on original source, so the remaining T11–T14 behavior was already correct.
- Green: all 24 pass on the candidate.

## Execution evidence

Candidate image `lingotorte:lt-3f1-cand` = `sha256:c1ac7dacafd58ad6433ae224db5698c0e52a9ed323a5a71e7d52d2fc07033fba`. All runs used `--rm --init --network none`, with no host mounts.

| Check | Result |
| --- | --- |
| Focused (legacyMigrationQualification, practiceSqliteMigration, durableReplace, localPersistence, saveSafety) | exit 0; 5 files, 76 passed |
| Full Vitest | exit 0; 54 files passed + 1 skipped; 1273 passed, 1 skipped (baseline 1249 + 24 new; same pre-existing privateDelivery skip) |
| `tsc --noEmit` | exit 0 |
| Vite build | exit 0; 35 modules |
| `vitest run tests/no-network` | exit 0; 5 passed |
| `check-privacy-boundaries.mjs` | exit 0; ok=true, 60 files |
| `git diff --check` (including the new file via intent-to-add) | exit 0 |

Logs are in the Hermes scratch dir `lt-3f1/` (`red-exact.log`, `red-exact-source-hashes.log`, `green-focused.log`, `full.log`, `tsc.log`, `build.log`, `nonet.log`, `privacy.log`). The scratch red worktree was removed.

## SHA-256 (candidate)

- `packages/storage/src/sqliteLocalPersistence.ts`: `6521d8102379b9f930b9061b6dac0aa09bba964829d813c5485aaac26b3d4d25`
- `packages/storage/src/learnerAudit.ts`: `9debfa4c7ae1bc967fd4914829af92319a822c6d176040625b51a5118a246bba`
- `tests/core/legacyMigrationQualification.test.ts`: `7df3df4bf50b33a5723aee283bc5f7055b730edce8dfb7a16f77133ddd05b4a5`
- `tests/fixtures/sqlite-v7-migrations.json` (unchanged): `4529caa33d294bbf3ee5001fd7fd48c38689f0c3173164a9c21783cb545d7e86`

## Limits

- Synthetic, Linux-container SQLite only. No real learner DB was used, and this is not a real-upgrade backup procedure.
- Not the lt-2t4 integrated matrix: browser, request gate and stale-writer flows are not covered.
- Failures are injected with test-owned SQLite triggers on the fixture file, the same seam lt-04i used. They cover data-statement failures inside the v8/v9 transactions, not process crash or power loss.
- Old-binary behaviour against an upgraded file is unsupported and was not executed. The documented recovery is the pre-upgrade copy.
- The conflict diagnostic now includes record IDs (synthetic UUID-like identifiers). Per §5.2 these are acceptable; payloads are never included.
