# lt-f5h — SQLite practice-mode persistence

## Candidate and change

Baseline: `6b573e0c30fc35160b77a891d5c2ef0795a2926f`, branch `work/lt-f5h-practice`.
Forward migration v8 (`expand_practice_modes`) rebuilds only `practice_attempt`, copies every column explicitly, adds `sentence-builder` to the bounded mode CHECK, preserves result/nonnegative-response checks and recreates the card/time index. The existing migration transaction covers table replacement and ledger insertion. Historical v1–v7 SQL is unchanged.

The frozen JSON fixture was already present on delegation. Programmatic comparison with `git show <baseline>:packages/storage/src/sqliteLocalPersistence.ts` verified every SQL string, migration name/version and checksum; no fixture bytes were changed. Tests independently construct a real v7 database from it, check all legacy attempt columns (including nulls and JSON), unchanged snapshot/ledger, index, integrity, post-migration sentence-builder insertion and reopen idempotence.

Five exhaustive typed mode cases submit through real PracticeService (including FSRS/event linkage), save to file-backed SQLite, close and reopen, and compare snapshots and relational attempts/events. Three invalid-write cases compare previous snapshot and seven affected relational tables before/after rollback and after reopen.

## Execution evidence

All containers used `--rm --init --network none`; no host source/state/media mounts, host installs, provider/model/microphone or real learner-state actions. Initial harness used a nonexistent listing method; corrected and reran red before production editing. Initial typecheck found missing fixture fsrsVersion; corrected and reran every final check. Those preliminary logs are retained, not represented as passing.

| Check | Actual final result | Receipt |
| --- | --- | --- |
| Exact final regression against original production | exit 1; 7 passed, 2 failed | `red-exact.log` |
| Focused fixed regression + persistence suite | exit 0; 25 passed, 2 files | `green-final.log` |
| Full Vitest | exit 0; 1026 passed, 37 files | `full-final.log` |
| Typecheck | exit 0; no diagnostics | `typecheck-final.log` |
| Vite build | exit 0; 32 modules transformed | `build-final.log` |
| No-network suite | exit 0; 5 passed, 2 files | `no-network-final.log` |
| Privacy marker scan | exit 0; ok=true, 49 files | `privacy-final.log` |
| Git diff whitespace | exit 0 | terminal receipt |

The red failures are the original mode CHECK rejecting sentence-builder and expected schema 8 receiving 7. The exact final test was also copied into a derived red image without changing original production; container hashes verify baseline production bytes and identical final regression bytes. Primary red ran before the production edit.

## Reproduction commands

```sh
docker build --target contributor -t lingotorte:lt-f5h-verify .
docker run --rm --init --network none lingotorte:lt-f5h-verify node node_modules/vitest/vitest.mjs run tests/core/practiceSqliteMigration.test.ts tests/core/localPersistence.test.ts
docker run --rm --init --network none lingotorte:lt-f5h-verify node node_modules/vitest/vitest.mjs run
docker run --rm --init --network none lingotorte:lt-f5h-verify node node_modules/typescript/bin/tsc --noEmit
docker run --rm --init --network none lingotorte:lt-f5h-verify node node_modules/vite/bin/vite.js build --config vite.config.ts
docker run --rm --init --network none lingotorte:lt-f5h-verify node node_modules/vitest/vitest.mjs run tests/no-network
docker run --rm --init --network none lingotorte:lt-f5h-verify node scripts/check-privacy-boundaries.mjs
```

Pre-edit red used `docker build --target contributor -t lingotorte:lt-f5h-red .`, then the same isolated Vitest command with just `tests/core/practiceSqliteMigration.test.ts`. Exact-final red used `docker build -f <receipt-dir>/Dockerfile.red-final -t lingotorte:lt-f5h-red-exact .` then `docker run --rm --init --network none lingotorte:lt-f5h-red-exact node node_modules/vitest/vitest.mjs run tests/core/practiceSqliteMigration.test.ts`.

Images:
- Primary red: `sha256:9c1156cc4197d6c2e823c85b7f11029bf314f1d59e39100ec9fa0d336d58d475`
- Exact-final red: `sha256:aaa252aa467d5b8c186724a6c71905b2b38905d16de9ae9225377e141c62ee23`
- Qualified candidate: `sha256:9207539130fedb6d351ffe9cdc1e1536531466db8c315b16b699b632e733ad67`

SHA-256:
- v8 SQL (trimmed/LF): `e60d3a17777d1132f398403f1815c39237424b011ffe98e33a27b4f494cec2bf`
- `packages/storage/src/sqliteLocalPersistence.ts`: `dc9416aa629158ea80263882f66f2816187a6ae7fccb98b0765791f02baf7bbc`
- `tests/core/localPersistence.test.ts`: `6f58c58342bf0f74aeaf52e27a0eb3e1a000309898217bac6d9a2a421f25deaa`
- `tests/core/practiceSqliteMigration.test.ts`: `d0cd7b9170a14b01f5006a870126008007de48739d85f3dccc9654d02101a0ce`
- `tests/fixtures/sqlite-v7-migrations.json`: `4529caa33d294bbf3ee5001fd7fd48c38689f0c3173164a9c21783cb545d7e86`

Receipt directory: current-profile scratch `lt-f5h` (absolute location in operator handoff); provenance and hashes in `provenance-hashes.json`, exact-red binding in `red-exact-source-hashes.log`. Raw build/test outputs are retained there. No commit/push or Beads change; parent owns independent reviews/publication/closure.

## Limits

This is synthetic Linux/container SQLite execution, not real-state migration or browser/deployment qualification. No-network tests cover their exercised intercepted flows; the privacy scan checks reference-product markers, not comprehensive secret/egress security. Docker network isolation additionally blocks external network access during execution. No production scope deviation or new dependency.
