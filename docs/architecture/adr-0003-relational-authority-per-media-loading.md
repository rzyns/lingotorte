# ADR-0003 — SQLite tables are the durable authority; transcripts load per media

Status: **Proposed** (decision taken by Janusz in chat, 2026-10-19; recorded on `lt-5lb.10`; implementation not yet authorized)
Date: 2026-10-19 · Author: Code Architect · Beads: `lt-584` (children `lt-584.1`–`lt-584.6`; decision on `lt-5lb.10`; prerequisite `lt-5lb.9`)
Plan: `docs/plan/relational-authority-plan.md`
Source base for every `path:line`: `main` `34051cd` (runtime bytes identical to `e9b5586`).

## Context

`SqliteLocalPersistence` (`packages/storage/src/sqliteLocalPersistence.ts`) stores learner state twice:

1. **One JSON blob** — the whole `LocalStoreSnapshot` in `lingotorte_snapshots.snapshot_json` (`:65-70`), plus three append-only history tables (`review_event`, `practice_attempt`, `import_job_event`) with the active/retained membership from `lt-xnu` (`active_review_event`, `active_practice_attempt`, `:363-365`).
2. **Relational projection tables** — one per entity (`media_asset`, `subtitle_track`, `cue`, `transcript_word_timing`, `media_file_observation`, `saved_item`, `saved_occurrence`, `review_card`, `review_card_state`, `import_job`, `export_job`, `provider_policy`; migrations v2–v7, `:73-330`), rewritten wholesale on every save (`writeCandidate` `:1713-1727` → `DELETE FROM …` + re-insert in `save*Projection` `:1204-1600`).

The product **reads the blob** (`loadSnapshot` `:1610-1627`) and overlays history from the tables (`:1628-1634`). Seventeen `list*` readers over the entity tables (`:800-1193`) have zero app callers (`rg "persistence\.[a-zA-Z]*" apps/local-service/src/server.ts` → `status`, `loadVersionedSnapshot`, `saveSnapshot`, `previewRestore`, `commitRestore`, `close` only). The revision used for optimistic concurrency is a canonical hash of the **whole blob** (`revisionOf` `:49-55`), pinned by regex at `server.ts:1098`, `model.ts:366-369` and `sqliteLocalPersistence.ts:1753`.

The browser mirrors this: `GET /api/state` returns the entire snapshot (`server.ts:1066-1069`), `connectLocalService` hydrates all of it into `LocalStore` (`model.ts:478-507`), and every autosave `PUT`s the entire snapshot back (`saveModelToLocalService` `model.ts:392-399`), which the service serializes, rewrites into every table, re-reads and hashes (`writeCandidate`).

Cost today is small (fixtures: 30 cues). Janusz plans a large video library. Transcript data — cues and word timings — is the bulk of the state and grows linearly with media; the learner data (items, cards, events) grows with study, not with library size. Under the current design every review rating rewrites every cue of every video.

Measured in the C0 spike (`docs/dev/relational-authority-spike-2026-10-19.md`, synthetic: 8 word timings per cue, 200 items/cards, 2,000 review events, file-backed DB). At 10 media × 500 cues, one study save (one rating) takes 4.7 s, `loadVersionedSnapshot` 1.0 s, and `GET /api/state` is 21 MB. At 100 media × 500 cues the same save takes 53 s, the load 12.5 s, `revisionOf` 7.4 s, the body 200 MB and the database file 591 MB. At 300 media × 1,000 cues the first `saveSnapshot` fails with `RangeError: Invalid string length`, because the blob exceeds V8's 512 MiB string limit. The learner-only body stays at 1.5–1.6 MB across those sizes.

Also an abstraction-quality finding (`docs/review/abstraction-review-2026-10-19.md` F3): two interfaces to the same data at the same level (`LocalStore.listMediaAssets()` vs `SqliteLocalPersistence.listMediaAssets()`), one live, with no declaration of which is the truth.

## Decision

1. **Tables are authoritative.** `loadSnapshot` is assembled from the entity tables plus the existing history/membership tables; the `snapshot_json` blob is no longer read. The seventeen dormant readers become the loaders.
2. **Revision is an opaque, monotonic durable token**, not a content hash: a `durable_state(id=1, revision INTEGER, updated_at)` row incremented in the same transaction as every committed write, serialized on the wire as `rev:<n>`. Both ends treat it as an opaque string. Conflict semantics stay compare-and-set (`409` on mismatch). The property "equivalent content ⇒ same revision" is dropped; nothing depends on it (the browser detects dirtiness by comparing serialized content against its acknowledged baseline, `model.ts:405-409`, not by revision equality).
3. **State is split in two along the growth axis.**
   - *Learner state + media catalog* (`mediaAssets`, `mediaObservations`, `subtitleTracks` metadata, `savedItems`, `savedOccurrences`, `reviewCards`, `reviewCardStates`, `reviewEvents`, `practiceAttempts`, `learnerAudit`, `exportJobs`, `providerPolicies`, `importJobs`, `importJobEvents`) keeps whole-document semantics: `GET/PUT /api/state` with CAS revision, exactly as today minus two keys.
   - *Transcript bundles* (`cues`, `transcriptWordTimings`) are addressed per media: `GET /api/media/{mediaId}/transcripts` returns every track's cues and word timings for one media; `PUT /api/tracks/{trackId}/transcript` writes one track's bundle. A track's bundle is written once at import/correction time (tracks are versioned; corrections create a new `trackVersion`, `model.ts createCorrectedTranscriptVersion`), so an ordinary learner-state save never touches `cue` or `transcript_word_timing`.
4. **The browser loads transcripts on demand.** `LocalStore` keeps its interface; `cues`/`transcriptWordTimings` hold only the media opened in this session. `openMediaAsset` becomes asynchronous with an explicit loading state. The browser snapshot cache (`browserSnapshotCache.ts`, lt-0zc) caches learner state + catalog only. Unpaired browser-only mode is unchanged: everything imported in the session stays in memory.
5. **Restore keeps its contract.** `planLearnerRestore` is already pure over the six learner collections (`restorePlanner.ts:14`); the export manifest contains no transcripts (`exportRestoreService.ts:39-46`). `previewRestore`/`commitRestore` read the current learner state from tables and write the candidate through the same table writers; readback verification (`:1725`, `:1781`) becomes read-after-write over tables.
6. **Migration v11** adds `durable_state`, verifies the entity tables reproduce the blob (they are rewritten on every save, so they must), rewrites them from the blob once as a backfill, sets `revision = 1`, and renames `lingotorte_snapshots` to `legacy_snapshot_json`. The legacy table is dropped by a later v12 after Janusz has used the app on real data for a period he chooses.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **A — Declare the blob authoritative; demote the readers to test support** (recommended in the review as the zero-risk move) | Janusz's library plans make blob-per-save the hot path; A would have to be undone later with the data already large. Chosen against in chat, 2026-10-19. |
| **B without the split (tables authoritative, whole-snapshot wire contract kept)** | Moves the bottleneck from SQLite to the wire and the browser; the service still rewrites every cue per save and the browser still holds every cue. No felt benefit for the migration cost. |
| **Content-hash revision computed over the tables** | Requires reading and canonicalizing the whole state on every write to produce the token — the exact O(n) cost being removed. |
| **Per-aggregate command API (`POST /api/saved-items`, …) instead of a learner-state document** | Closer to a "real" service, but changes every write path in `model.ts` and the restore protocol at once; the learner-state document is small and CAS already works. Can follow later behind the same tables. |
| **Per-track GET instead of per-media GET** | Player needs target + native tracks together; one round trip per media open is the natural unit. PUT stays per track because that is the write unit. |
| **Keep cues in the browser snapshot cache** | Cache would grow with the library and the cache is explicitly "not a source of truth" (`browserSnapshotCache.ts:4-6`); transcripts reload from the service. |

## Consequences

- Autosave cost becomes proportional to learner data, not library size; media open costs one bounded request.
- `lingotorte_snapshots` stops being written; the `transcript_index` FTS projection (`data-model-and-storage.md:140`) gains a real base table to index later.
- Wire contract changes: revision token format, two `/api/state` keys removed, two endpoints added, transport allow-list extended (`pairedTransport.ts:42`). Browser and service ship together in one image, so no compatibility window is needed; the service rejects a `PUT /api/state` carrying `cues`/`transcriptWordTimings` with `400` so a stale browser build fails loudly rather than silently dropping data.
- `openMediaAsset` and the Saved-view "jump to occurrence" become asynchronous; views need a loading/unavailable state. This is why `lt-5lb.9` (views stop reaching through `model.store`) is a prerequisite: the occurrence-in-context read model is where "transcript not loaded" is handled once.
- Export manifest, Anki export, Capture, Review, Practice, provider policy: unchanged.
- Risk concentrates in one 1,800-line file with recent bug fixes; the plan mitigates with a shadow-mode child (tables loaded and compared against the blob before authority flips) and a measured spike before any product change.

## Outcome

_To be filled at the gate child: merge hashes, before/after measurements from the spike, Docker receipts._
