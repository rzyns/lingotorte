# Relational authority plan — tables become the truth, transcripts load per media

Status: plan of record for the epic created from ADR-0003 (IDs in §0.8). Written by Code Architect on 2026-10-19 against `main` `34051cd` (runtime bytes identical to `e9b5586`). Decision B taken by Janusz in chat the same day (recorded on `lt-5lb.10`): whole epic, ahead of `lt-5lb.8`/`.9`.

Written for an implementing agent that has not seen the review. Every child names files, symbols, exact commands, what "done" looks like, and when to stop and report. Read it once top to bottom before the first child. Follow the same working method as `docs/plan/architecture-deepening-plan.md` §0 (branch per child, atomic verified commits, independent review, operator closes).

Related: `docs/architecture/adr-0003-relational-authority-per-media-loading.md`, `docs/review/abstraction-review-2026-10-19.md` (F2, F3), `docs/dev/restore-audit-semantics-contract.md`, `docs/architecture/data-model-and-storage.md`, `BEADS.md`, `GIT-POLICY.md`, `DECISIONS.md`.

---

## 0. Ground rules

1. **Scope.** This epic changes the SQLite read path, the durable revision, the `/api/state` contract and the browser's transcript loading. It does **not** change: the learner export manifest, Anki export, Capture/Review/Practice semantics, provider policy, `DECISIONS.md`, the Docker runtime, or any entity's field set. If a step seems to need one of those: stop, comment on the issue, wait.
2. **Authorization.** Planning and filing are authorized (chat, 2026-10-19). Implementation requires Janusz's SCOPE comment on the epic, cross-referenced from `lt-dy6` as `lt-2se` was. A ready child is not authorization.
3. **One child = one branch = one atomic `--no-ff` merge.** `work/<issue-id>-<slug>` from current `main`. Claim, read back, work, evidence comment, `READY FOR CLOSURE:` comment, stop. Operator closes; only then is the next child ready.
4. **Verification set** (repo root, host): `npm run typecheck` (0 outside `apps/web/e2e/`), `npx vitest run` (baseline on `34051cd`: **123 files / 1,971 passed / 1 skipped**; the three known load-sensitive timeouts from `architecture-deepening-plan.md` §0.4 still apply, and for this epic the set also includes `tests/web/lte8zMorphologyUi.test.ts` "Polish quality fixtures through the real service…", which timed out at 5 s under full-suite load in `lt-584.1` and passed in isolation; the same §0.4 rule applies: a 5 s timeout limited to that set is baseline only if the isolated re-run passes; record both runs on the issue; never raise or skip timeouts), `npm run test:no-network`, `npm run build`, `npm run scan:privacy`. Gate child adds Docker `--network none` (`docs/dev/docker-runbook.md`).
5. **Persistence tests are the safety net, not an obstacle.** `tests/core/localPersistence.test.ts`, `durableReplace.test.ts`, `legacyMigrationQualification.test.ts`, `practiceSqliteMigration.test.ts`, `localService.test.ts`, `restorePlanner.test.ts`, `tests/web/localServiceSync.test.ts`, `durableRestoreIntegration.test.ts`, `browserSnapshotCache.test.ts` (2,571 lines together) pin the behaviour being moved. A child may **add** tests freely. A child may change an existing assertion only where this plan names it; any other needed change → stop and report with the test name and the line.
6. **Do not widen.** No drive-by renames or formatting. The 1,800-line `sqliteLocalPersistence.ts` has 4 bug fixes in 90 days; touch only what the child names.
7. **Line numbers are as of `34051cd`.** Locate by symbol (`rg -n "function revisionOf" packages/storage/src/sqliteLocalPersistence.ts`); a drifted number is a hint, a missing symbol is a stop.
8. **Issue IDs.** Epic and children are filed in Beads by this plan's author; the table in §5 maps `C0`–`C5` to IDs. `lt-5lb.9` is a hard prerequisite of `C4` (dependency recorded).
9. **Private data.** Spike fixtures are synthetic. Never run a migration or qualification against Janusz's real `/state` volume without a fresh exact approval; use `:memory:` or a temp file.

---

## 1. The problem, precisely

| Fact | Evidence |
| --- | --- |
| Product reads the blob, never the entity tables | `loadSnapshot` `sqliteLocalPersistence.ts:1610-1634`; 17 `list*` readers `:800-1193` with 0 app callers; `server.ts` uses six methods (`rg "persistence\.[a-zA-Z]*" apps/local-service/src/server.ts`) |
| Every save rewrites every entity table and the blob, then re-reads and hashes everything | `writeCandidate` `:1713-1727`; `save*Projection` `:1204-1600` each start with `DELETE FROM <table>`; `revisionOf` `:49-55` |
| Revision = canonical hash of the whole blob, regex-pinned in three places | `revisionOf` `:49`; `server.ts:1098`; `model.ts:366-369` (`stateRevision`); `sqliteLocalPersistence.ts:1753` (`restorePlan`) |
| Browser receives and holds the whole snapshot, PUTs the whole snapshot | `GET /api/state` `server.ts:1066-1069`; `connectLocalService` `model.ts:478-507`; `saveModelToLocalService` `model.ts:392-399`; `PUT /api/state` `server.ts:1092-1111` |
| Transcript data is the growth axis | `cues` + `transcriptWordTimings` are the only per-media-size collections in `LocalStoreSnapshot` (`localStore.ts:24-41`); word timings have ~18 fields per word (`:128-147`) |
| Cue bundles are written at import/correction, not during study | `rg -n "putCue\(|putTranscriptWordTiming\(" apps/web/src/model.ts` → 24 sites, all inside import/transcript-version functions (verified in C0). **C0 result (`lt-584.1`):** 11 call lines in 8 functions; ASR/Scribe drafts and corrected versions add word timings / bump `trackVersion` after the track's first persist, so the hypothesis does not hold today. C3 assembles the bundle and final `trackVersion` before the first put/persist (decision (a), `docs/dev/relational-authority-spike-2026-10-19.md` §3) |
| Media switch is synchronous today | `openMediaAsset` `model.ts:686-701`, `projectMediaIntoModel` `:672-683`; `model.cues` read in 8 files / 50 sites (`rg "model\.cues" apps/web/src`) |
| Restore planner is already pure over learner collections only | `restorePlanner.ts:7` (six collections), `:14`; manifest content `exportRestoreService.ts:39-46` |
| Membership tables already make history relational | `active_review_event`, `active_practice_attempt`, `learner_audit_format` (`:363-365`, migration v9) |
| Transport allow-list is a fixed regex | `pairedTransport.ts:42` |

---

## 2. Target design

### 2.1 Durable schema (v11)

```
durable_state(id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, updated_at TEXT NOT NULL)
legacy_snapshot_json   -- renamed from lingotorte_snapshots; read by nothing; dropped by v12 later
-- all existing entity, history and membership tables unchanged
```

`revisionToken(n) = 'rev:' + n`. Accepted token grammar on both ends: `/^[A-Za-z0-9:_-]{1,128}$/` (opaque). The service increments `revision` inside the same `BEGIN IMMEDIATE … COMMIT` as the write.

### 2.2 Storage interface after the epic (`SqliteLocalPersistence`)

```ts
status(): SqliteLocalPersistenceStatus                    // unchanged shape + revision
loadLearnerState(): { state: LearnerStateSnapshot; revision: string }
saveLearnerState(state: LearnerStateSnapshot, expectedRevision: string, updatedAt?): string   // CAS; rejects cues/transcriptWordTimings keys
loadTranscripts(mediaId: string): TranscriptBundle         // { tracks: Record<trackId, { cues: Cue[]; wordTimings: TranscriptWordTiming[] }> }
saveTrackTranscript(trackId: string, bundle: { cues; wordTimings }, expectedRevision: string): string  // write-once per trackId; CAS
previewRestore(...) / commitRestore(...)                    // same signatures; implemented over tables
close()
```

`LearnerStateSnapshot = Omit<LocalStoreSnapshot, 'cues' | 'transcriptWordTimings'>`. `LocalStoreSnapshot` keeps its name for the in-memory store; `normalizeLocalStoreSnapshot` keeps accepting both shapes.

### 2.3 Wire contract after the epic

| Route | Change |
| --- | --- |
| `GET /api/state` | body `{ ok, snapshot: LearnerStateSnapshot, revision, restoreCapability }` — `cues`/`transcriptWordTimings` absent |
| `PUT /api/state` | body `{ snapshot: LearnerStateSnapshot, expectedRevision }`; `400` if `cues` or `transcriptWordTimings` present; `409` on CAS mismatch; response `{ ok, revision, savedAt, persistence }` |
| `GET /api/media/{mediaId}/transcripts` | new; `{ ok, mediaId, revision, tracks: { [trackId]: { cues, wordTimings } } }`; `404` unknown media |
| `PUT /api/tracks/{trackId}/transcript` | new; `{ cues, wordTimings, expectedRevision }`; an unknown track id is accepted (bundle first, D-R9); `409` if the track already has a bundle or on CAS mismatch |
| `/api/restore/preview`, `/api/restore/commit` | unchanged envelope; `expectedRevision` is the new token |
| `pairedTransport.ts:42` allow-list | add `media\/[0-9a-f-]{36}\/transcripts` and `tracks\/[0-9a-f-]{36}\/transcript` |

**Transitional `/api/state` in C3 (D-R8).** C3 ships a transitional `/api/state`: `GET` still returns the full snapshot with `cues`/`transcriptWordTimings` assembled from the tables; `PUT` accepts the legacy full-snapshot body — a supplied bundle is written once for a track without one and must equal the stored bundle exactly otherwise (`400`, never a rewrite); a body without those keys leaves bundles untouched; the §2.4 non-candidate-track bundle check is not applied (legacy fixtures save approved tracks without cues; operator decision 2026-10-20). The strict rows above and that check take effect in C4. **Flipped in C4 (`lt-584.5`):** `GET /api/state` returns `loadLearnerState()`; `PUT /api/state` answers `400` to `cues`/`transcriptWordTimings` keys and to a non-candidate track without a stored bundle (a track already stored as non-candidate before the flip stays accepted, so no existing database becomes unsavable); a track PUT that finds an existing bundle answers `409` with `code: 'transcript-bundle-exists'`.

### 2.4 Browser after the epic

- `LocalStore` interface unchanged. `cues`/`transcriptWordTimings` contain only loaded media. New: `loadedTranscriptMedia: Set<UUID>` tracked in `model.ts` (WeakMap, like `syncOwner`), not in the snapshot.
- `openMediaAsset(model, mediaId): Promise<boolean>`; sets `model.transcriptLoading = { mediaId } | null`; fetches `/api/media/{id}/transcripts` when paired and not loaded; projects as today.
- Import paths (`importBrowserLocalFiles`, transcript generation, correction versions) still `putCue`/`putTranscriptWordTiming` into the store **and**, when paired and autosave is on, `PUT /api/tracks/{trackId}/transcript` before the learner-state save that references the new track. Order matters: track metadata (in learner state) must not reference a bundle the service does not have — the service's `PUT /api/state` validates that every `subtitleTracks[*]` with `transcriptStatus !== 'candidate'` has a bundle, else `400` (decide in C3 whether `candidate` tracks may be bundle-less; default yes).
- `saveModelToLocalService` strips `cues`/`transcriptWordTimings` before PUT. Dirty detection compares the stripped serialization.
- `browserSnapshotCache` stores the stripped snapshot; `SNAPSHOT_CACHE_SCHEMA_VERSION` → 2 with an upgrade that drops old records.
  **Option A (Janusz, 2026-10-20, `lt-584.5`; D-R10):** the v2 record strips only the bundles the current service has acknowledged (loaded from it, a successful track PUT, or a `409 transcript-bundle-exists` verified by `GET /api/media/{id}/transcripts` at the same revision with an identical bundle). It keeps the cues/word timings of every unacknowledged track (all of them when unpaired) plus `pendingTranscriptTrackIds`; reload restores them, and the first paired save flushes them per track before the learner state. Acknowledgements are bound to the service URL: after a URL change every bundle in the store is pending again. "Load service state" discards pending bundles with the other browser edits.
- Occurrence-in-context (from `lt-5lb.9`) returns `{ status: 'not-loaded', mediaId }` when the cue's media is not loaded; Saved/Review/Practice views render "Open media to load transcript" and call `openMediaAsset`.

### 2.5 Shadow mode (C2) before authority flips (C3)

C2 makes the table loaders complete and runs them beside the blob: `loadSnapshot()` still returns the blob, but a debug method `loadSnapshotFromTables()` is compared against it in tests on every save/restore fixture (`sameHistoryPayload` after sorting). Authority flips in C3 only after the shadow comparison is green across the whole persistence suite. This bounds the risk of the bug-magnet file.

---

## 3. Children

### C0 — Spike: measure the baseline and verify the write-once hypothesis

Branch: `work/<id>-spike-measure`. Throwaway code under `tests/spike/` or `scripts/spike/`; nothing under `apps/` or `packages/` changes.

1. Build a synthetic generator: `N` media × `C` cues × `W` word timings per cue with `makeMediaAsset`/`makeSubtitleTrack`/`makeCue`/`makeTranscriptWordTiming` (domain factories), plus a fixed learner set (200 items, 200 cards, 2,000 events).
2. Measure on `:memory:` and on a temp file, for `(N,C,W)` in `{(10,500,8), (100,500,8), (300,1000,8)}`: `saveSnapshot` wall-clock, `loadVersionedSnapshot` wall-clock, serialized `GET /api/state` body bytes, `revisionOf` time. Record a table on the issue and in `docs/dev/relational-authority-spike-<date>.md`.
3. Verify the hypothesis in §1 row 6: list every `putCue`/`putTranscriptWordTiming` call site in `model.ts` and classify each as "inside a function that also creates the track (`makeSubtitleTrack`/`putSubtitleTrack`)" or not. Any "not" is a finding for C3 (it means a track's bundle can change after creation) — list it.
4. Verify every `LocalStoreSnapshot` collection has a projection table and a `list*` reader (expected: yes for all 15; `learnerAudit` is derived).

Done when: measurements and classification are on the issue; ADR-0003 Context gains the measured numbers (one short paragraph, no other edit). No product change. Review PASS; merged (spike code may be deleted in the same branch if it is not reusable).

Stop and report if: step 3 finds a bundle that changes after track creation without a new `trackVersion`.

### C1 — Revision token and `durable_state`; both ends accept opaque tokens

Branch: `work/<id>-revision-token`. Depends on C0.

1. Migration v11 part 1: `CREATE TABLE durable_state (...)`; `INSERT ... (1, 1, now)`. Add to `MIGRATIONS` (`:660-710`), bump `CURRENT_SCHEMA_VERSION` to 11, keep `lingotorte_snapshots` as is for now (rename happens in C3). Update the v10 `UPDATE lingotorte_snapshots SET schema_version` pattern (`:771`) with the same for v11.
2. `revisionOf(snapshot)` → `private currentRevision(): string` reading `durable_state.revision` and formatting `rev:<n>`; `private bumpRevision(): string` inside the write transaction. Replace every `revisionOf(...)` use (`:1641`, `:1734`, `:1747`, `:1755`, `:1782`) accordingly. `SnapshotRevisionConflictError` unchanged.
3. Relax the three regexes to the opaque grammar: `server.ts:1098`, `model.ts:366-369` (`stateRevision`), `sqliteLocalPersistence.ts:1753`. Error messages unchanged.
4. Tests: new `tests/core/durableRevision.test.ts` — token increments once per committed save/restore, CAS rejects a stale token with `SnapshotRevisionConflictError`, rollback does not bump, identical content twice yields two different tokens (documents the dropped property). Existing tests that assert `sha256:` revision shape: `rg "sha256:[0-9a-f]\{64\}|revision.*sha256" tests` — list them on the issue; each may change **only** the token-shape assertion.

Done when: verification set green; `rg "revisionOf" packages apps` → 0; evidence; review PASS; merged.

Stop and report if: a test relies on identical content producing an identical revision for a product reason (not just shape).

### C2 — Table loaders complete; shadow comparison against the blob

Branch: `work/<id>-table-loaders-shadow`. Depends on C1.

1. Add `private loadSnapshotFromTables(): LocalStoreSnapshot` assembling all 15 collections from the existing `list*` readers (`:800-1193`), using the same history/membership overlay as `loadSnapshot` (`:1628-1634`). Fix any reader whose row→entity mapping drops an optional field (the shadow test will find them; `exactOptionalPropertyTypes` is on, so match the factories' optional handling exactly).
2. Add `loadSnapshotShadowDiff(): { equal: boolean; collections: Record<string, { blob: number; tables: number }> }` (public, test support).
3. Tests: extend each persistence suite's fixtures with one assertion `expect(db.loadSnapshotShadowDiff().equal).toBe(true)` after every save/restore/migration they already perform (`localPersistence`, `durableReplace`, `legacyMigrationQualification`, `practiceSqliteMigration`). Add this as a shared helper in `tests/helpers/`.
4. `saveSnapshot` and `writeCandidate` unchanged; blob still authoritative.

Done when: shadow equal on every fixture in the four suites; full verification set green; the collection(s) whose mapping needed fixing are listed on the issue; review PASS; merged.

Stop and report if: a collection cannot be reproduced from its table because the table lacks a field the snapshot carries (that would be a v11 schema addition — stop, it needs a decision).

### C3 — Authority flips: load from tables, restore over tables, learner-state split, blob retired

Branch: `work/<id>-tables-authoritative`. Depends on C2.

1. `loadSnapshot()` body becomes `loadSnapshotFromTables()`; delete the blob read. `loadLearnerState()` = that minus `cues`/`transcriptWordTimings`. `loadTranscripts(mediaId)` from `cue`/`transcript_word_timing` joined through `subtitle_track.media_id` (add `idx_cue_track_time` already exists; add `CREATE INDEX idx_word_timing_track` if missing).
2. Writers: `saveLearnerState(state, expectedRevision)` = CAS + `appendLearnerAudit` + `selectHistory` + the non-transcript `save*Projection`s + `bumpRevision` + readback compare (`sameHistoryPayload(state, loadLearnerState().state)`). Reject `cues`/`transcriptWordTimings` keys with `TypeError`. `saveTrackTranscript(trackId, bundle, expectedRevision)`: CAS, `409`-class error if `SELECT 1 FROM cue WHERE track_id=?` exists, insert cues + timings, bump. Delete `saveTranscriptProjections`' `DELETE FROM` lines; the per-save full rewrite of transcript tables ends here.
3. Restore: `restorePlan` reads `loadLearnerState()`; `commitRestore` writes via `saveLearnerState`'s internals (same transaction). `writeSnapshot` and `lingotorte_snapshots` writes removed. `initializeActiveAudit` (v9 hook, `:1669-1711`) still reads the legacy blob for **historical** migrations — keep it reading `legacy_snapshot_json` after the rename.
4. (Shipped as migration **v12** `retire_snapshot_blob`.) Migration v11 part 2 (same migration, extend the SQL from C1 — the ledger checksums fixed versions, so C1 must leave v11 **unapplied in any committed fixture DB**; if a fixture DB with v11 applied exists from C1, this becomes v12 — check `tests/fixtures/**/*.sqlite` and `legacyMigrationQualification.test.ts` fixture builders first): `ALTER TABLE lingotorte_snapshots RENAME TO legacy_snapshot_json`; in the migration hook (`applyMigration` `:769-771` pattern): read the legacy blob, rewrite every entity table from it once (reuse `save*Projection`), assert `loadSnapshotShadowDiff` equal against the legacy blob, set `durable_state.revision = 1`.
5. `server.ts`: `GET /api/state` → `loadLearnerState()`; `PUT /api/state` → `saveLearnerState` with `400` on forbidden keys; add the two routes from §2.3 with the same admission/body rules as `/api/state`; `status()` adds `revision`. **Amended (D-R8):** C3 ships the transitional `/api/state` contract from §2.3 instead (full snapshot on `GET`; legacy body on `PUT` with write-once/exact-match bundles); the strict contract moves to C4. The flip happened in C4 (`lt-584.5`, §2.3).
6. Remove `hydrateStore`/`saveStore`; migrate their test callers to `loadSnapshot`/`saveLearnerState` + `saveTrackTranscript`. `loadVersionedSnapshot` stays as `{ snapshot: loadSnapshot(), revision }` for tests only (`@internal`).
7. Tests: rewrite assertions in the four persistence suites **only** where they (a) read `lingotorte_snapshots` directly, (b) call `hydrateStore`/`saveStore`, (c) assert the blob shape. New `tests/core/transcriptBundles.test.ts`: write-once per track, per-media load returns all tracks, learner save leaves `cue` rows untouched (count rows before/after). `tests/core/localService.test.ts`: new routes, `400` on forbidden keys.
8. Browser is **not** changed in C3; the web tests that drive `/api/state` through fakes (`localServiceSync.test.ts`, `durableRestoreIntegration.test.ts`) must still pass because they fake the service — confirm; if a fake asserts the old body shape, change only that fake. **Amended (D-R8):** `tests/web/localServiceSync.test.ts` drives the real service, not a fake; it passes unchanged because of the transitional contract.

Done when: `rg "lingotorte_snapshots|snapshot_json" packages apps` → only the v11 migration and `initializeActiveAudit`; all suites green; a `legacyMigrationQualification` case migrates a populated v10 DB to v11 and `loadSnapshot()` equals the pre-migration blob; review PASS; merged.

Stop and report if: readback after `saveLearnerState` differs from the input on any fixture (an entity mapping gap C2 missed); the v9 legacy path cannot be kept working against the renamed table.

### C4 — Browser: per-media transcript loading, learner-state PUT, cache v2

Branch: `work/<id>-browser-per-media`. Depends on C3 **and `lt-5lb.9`** (occurrence-in-context read model; views no longer touch `model.store`).

1. `pairedTransport.ts:42`: extend the allow-list per §2.3.
2. `model.ts`: `loadedTranscriptMedia` WeakMap; `openMediaAsset` async with `model.transcriptLoading`; `connectLocalService` hydrates learner state then loads transcripts for `currentMedia` only; `saveModelToLocalService` strips transcript keys and serializes the stripped snapshot for baseline/dirty comparison; import/correction functions call `PUT /api/tracks/{id}/transcript` before the learner-state save (serialize both through `serializeServiceJob`).
3. `uiTypes.ts`: `transcriptLoading: { mediaId: string } | null` on `AppModel`; occurrence-in-context gets the `not-loaded` variant.
4. Views: `library.ts` and `saved.ts` callers of `openMediaAsset` await it and re-render; Saved/Review/Practice render the `not-loaded` state with an "Open media" action. Keyboard/transport behaviour unchanged.
5. `browserSnapshotCache.ts`: schema v2, strip transcript keys, drop v1 records on upgrade.
6. Flip `/api/state` to the strict rows of §2.3 (`GET` without transcript keys; `PUT` `400` on `cues`/`transcriptWordTimings`), enable the §2.4 non-candidate-track bundle check, and migrate the real-service tests that save full snapshots: `tests/core/localService.test.ts` ("persists a LocalStoreSnapshot through the HTTP state API…"), `durableReplace.test.ts` (restore through the common request gate), `lt2t4IntegratedQualification` (T04/T05/T07, T09, A22, restore matrix), `requestRuntime`, `saveSafety`, `vitePreflight`, `tests/web/localServiceSync.test.ts`.
7. Tests: `localServiceSync.test.ts` fakes updated to the new body shapes (this is the named allowed change); new `tests/web/transcriptLoading.test.ts`: open media → one GET, second open → zero GETs, unpaired import keeps cues in memory, Saved "jump" on a not-loaded media triggers load then seeks; `browserSnapshotCache.test.ts` upgrade case.

Done when: `rg "model\.store\." apps/web/src/views apps/web/src/ui` → 0 (inherited from `lt-5lb.9`, must still hold); verification set green; a manual recipe on the issue: import two media, study, reload, confirm only the opened media's transcript is fetched (DevTools network); review PASS; merged.

Stop and report if: a view needs cues for a media other than the current one synchronously and cannot be given a loading state without changing its DOM contract pinned by tests.

### C5 — Gate: Docker verification, ADR-0003 accepted, authority rule documented, v12 decision

Branch: `work/<id>-gate`. Depends on C4.

1. Docker contributor image build + `--network none` full vitest, tsc, vite build, privacy scan, no-network (per `docker-runbook.md`); record counts.
2. ADR-0003 → `Accepted`, Outcome filled (merge hashes, C0 numbers vs a C4 re-measurement of `GET /api/state` bytes and learner-save time on the same synthetic sets).
3. `docs/architecture/data-model-and-storage.md`: add an "Authority" subsection: tables authoritative; `legacy_snapshot_json` read by no code path except historical migrations; `transcript_index` and `review_card_state` remain derived; revision semantics.
4. File one decision issue for v12 (`DROP TABLE legacy_snapshot_json`) addressed to Janusz, with the suggested criterion "after one month of real use with at least one successful export".
5. Independent review of the merged tree.

Done when: recorded; merged; epic acceptance re-checked by the operator.

---

## 4. Decision log

| ID | Decision | Rejected | Why |
| --- | --- | --- | --- |
| D-R1 | Opaque monotonic `rev:<n>` token | content hash over tables | O(1) vs O(n) per write; nothing needs content-equality of revisions |
| D-R2 | Learner-state document keeps whole-document CAS; only transcripts split out | per-aggregate command API | smallest change that removes the growth-axis cost; command API can follow behind the same tables |
| D-R3 | GET per media, PUT per track | per-track GET | player needs target + native together; write unit is the track |
| D-R4 | Shadow mode (C2) before flip (C3) | flip directly | bug-magnet file; the comparison is cheap and catches mapping gaps before they are authoritative |
| D-R5 | Keep `legacy_snapshot_json` until a separate v12 decision | drop in v11 | rollback evidence for real data; Janusz decides the period |
| D-R6 | `lt-5lb.9` precedes C4 | do both in C4 | the `not-loaded` state must live in one read model, not in three views |
| D-R7 | Stale browser gets `400`, not silent acceptance | accept old whole-snapshot PUT | single image ships both; silent drop of transcript keys would look like data loss |
| D-R8 | Transitional `/api/state` in C3 (full GET; legacy PUT with write-once/exact-match bundles); strict in C4 (Janusz, 2026-10-20) | strict in C3 | the unchanged C3 browser could not save |
| D-R9 | Bundle-first track creation: `PUT /api/tracks/{id}/transcript` accepts a track not yet in learner state | candidate → bundle → status change | three round trips per import |
| D-R10 | Cache v2 keeps unacknowledged bundles plus a pending-track list; flushed before the learner state on the first paired save (option A, Janusz 2026-10-20) | always strip transcript keys from the cache | unpaired reloads (and unsent paired edits) would lose their transcripts |

## 5. Issue map

Filed 2026-10-19 by `hermes-codearchitect`; live status in Beads.

| Child | Issue | Priority | Depends on |
| --- | --- | --- | --- |
| Epic | `lt-584` | P2 | discovered from `lt-5lb.10` |
| C0 spike/measure | `lt-584.1` | P2 | — |
| C1 revision token | `lt-584.2` | P2 | `lt-584.1` |
| C2 table loaders, shadow mode | `lt-584.3` | P2 | `lt-584.2` |
| C3 authority flips, learner/transcript split, v11 | `lt-584.4` | P1 | `lt-584.3` |
| C4 browser per-media loading | `lt-584.5` | P2 | `lt-584.4`, **`lt-5lb.9`** |
| C5 gate | `lt-584.6` | P2 | `lt-584.5` |

`lt-5lb.9` was raised to P2 and annotated as the prerequisite of C4. `lt-5lb.10` carries the decision and links here.
