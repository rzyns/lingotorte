# Relational authority spike (lt-584.1, C0) — 2026-10-19

Plan: `docs/plan/relational-authority-plan.md` §3 C0. ADR: `docs/architecture/adr-0003-relational-authority-per-media-loading.md`.
Source base: `main` `6082901` (runtime bytes identical to `34051cd`). No product code changed.

Evidence labels: **measured** (this spike, synthetic data), **source** (read from code at the base above), **inference**.

## 1. Method

- Script: `scripts/spike/relational-authority-measure.ts` (throwaway; native Node 24 strip-types, not part of vitest).
  `node --max-old-space-size=<MB> scripts/spike/relational-authority-measure.ts <N> <C> <W> <memory|file>`
- Synthetic library from the domain factories (`makeMediaAsset`, `makeSubtitleTrack`, `makeCue`, `makeTranscriptWordTiming`): `N` media × 1 target track × `C` cues × `W` word timings per cue. Fixed learner set: 200 saved items + occurrences, 200 cards + states, 2,000 review events (10/card).
- The bulk snapshot is assembled as plain records, not through `LocalStore.put*` (see finding F-C0-3).
- Per case, against `SqliteLocalPersistence.open(':memory:')` or a temp file (deleted afterwards):
  - **first save**: `saveSnapshot` into an empty DB (import-like);
  - **load**: `loadVersionedSnapshot()`;
  - **study save**: `saveSnapshot` with one extra review event and the CAS `expectedRevision` (what every autosave after a rating costs);
  - **revisionOf**: the same canonical-hash algorithm as the private `revisionOf`, timed on the loaded snapshot;
  - **GET body**: `JSON.stringify({ ok, snapshot, revision, restoreCapability })` bytes (the `GET /api/state` body built by `sendJson`); **learner-only**: the same without `cues`/`transcriptWordTimings` (the ADR-0003 target);
  - **putCue**: one `LocalStore.putCue` on a store holding the loaded snapshot (browser-side cost per put).
- Host: Windows 11, i7-12700KF, 128 GB RAM, Node v24.21.0. Single run per case (wall-clock, ms); treat as order-of-magnitude.

## 2. Measurements (measured)

| N × C × W | cues / word timings | DB | first save | load | study save | revisionOf | GET /api/state | learner-only | putCue | DB file | peak RSS |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 × 500 × 8 | 5,000 / 40,000 | memory | 2.6 s | 0.90 s | 4.0 s | 0.77 s | 21.3 MB | 1.50 MB | 246 ms | — | 0.8 GB |
| 10 × 500 × 8 | 5,000 / 40,000 | file | 3.3 s | 1.03 s | 4.7 s | 0.73 s | 21.3 MB | 1.50 MB | 199 ms | 63 MB | 0.8 GB |
| 100 × 500 × 8 | 50,000 / 400,000 | memory | 31.5 s | 9.9 s | 45.2 s | 7.4 s | 200.0 MB | 1.59 MB | 1,994 ms | — | 6.6 GB |
| 100 × 500 × 8 | 50,000 / 400,000 | file | 37.8 s | 12.5 s | 53.5 s | 7.4 s | 200.0 MB | 1.59 MB | 2,581 ms | 591 MB | 5.2 GB |
| 300 × 1000 × 8 | 300,000 / 2,400,000 | memory | **fails** | — | — | — | — | — | — | — | 3.7 GB |
| 300 × 1000 × 8 | 300,000 / 2,400,000 | file | **fails** | — | — | — | — | — | — | — | 2.4 GB |

Raw JSON lines are pasted on `lt-584.1`.

**300 × 1000 × 8 fails in the first `saveSnapshot` with `RangeError: Invalid string length`**, in both modes, even with `--max-old-space-size=32768`. The whole-snapshot JSON string exceeds V8's `buffer.constants.MAX_STRING_LENGTH` (536,870,888 on this Node). The blob design has a hard ceiling, not just a slow path. Inference from the linear 21 MB → 200 MB scaling: the ceiling is roughly 130,000 cues at 8 words per cue (about 270 hour-long videos at 500 cues each). `revisionOf` and the `GET` body hit the same limit independently.

Reading: (inference)

- Everything scales linearly with transcript size. A **study save** (one rating) costs about 4.5× a load because `saveSnapshot` runs `loadSnapshot` 3 times, writes the blob twice, rewrites every projection table and hashes the whole state. At 100 media one rating takes 45–53 s of service time.
- The **learner-only** body stays about 1.5–1.6 MB across a 10× library growth. That is the size the ADR-0003 split leaves on the hot path. It is dominated by the 2,000 review events, which appear twice (`reviewEvents` and `learnerAudit.reviewEvents`).
- The SQLite file at 100 media is 591 MB: the blob plus the projection tables hold every transcript twice.

## 3. Write-once hypothesis (plan §1 row 6) — STOP triggered, decided

`grep -n "putCue(\|putTranscriptWordTiming(" apps/web/src/model.ts`: 16 sites at `6082901` (the plan estimated about 24). Each was classified as inside the function that also creates and puts the track, or not (source):

| Site (by symbol, ~line) | Call | Same function creates the track? | Bundle changes after the track's first persist? |
| --- | --- | --- | --- |
| `importBrowserSyntheticFixture` ~995, ~999 | `putCue` | yes (`putSubtitleTrack` ~992/993) | no |
| `relinkExistingBrowserMedia` ~1217 | `putCue` | yes (`putSubtitleTrack(parsed.track)` ~1216; relink only adds new tracks) | no |
| `importBrowserLocalFiles` ~1325, ~1330 | `putCue` | yes (~1321/1322) | no |
| `putTranscriptSegments` ~2475 | `putCue` | yes (`makeSubtitleTrack` ~2442, `putSubtitleTrack` ~2474) | **yes, through its callers**: it ends with `persistIfLocalServiceAutosaveEnabled` (~2483), which fires `saveModelToLocalService` immediately when paired + autosave |
| `putTranscriptWordTimingsForSegments` ~2503 | `putTranscriptWordTiming` | **no** | **yes**: called after `await putTranscriptSegments` by `generateLocalAsrDraft` (~2601) and `generateElevenLabsScribeDraft` (~2650), same `trackId`, same `trackVersion` |
| `createCorrectedTranscriptVersionNow` ~2752 | `putTranscriptWordTiming` | **no** (the track was created and persisted inside `putTranscriptSegments`) | **yes**: re-puts the same track id with `trackVersion: parent + 1` (~2741/2742), then adds word timings, then persists again |
| `importTargetOnlyFixture` ~3018 | `putCue` | yes (~3016) | no |
| `importFixtureMediaAndSubtitles` ~3063, ~3066 | `putCue` | yes (~3060/3061) | no |

Also (metadata-only, fine under the learner-state document): `createStructuralCorrectedTranscriptVersionNow` (~2835) re-puts the same id with a bumped `trackVersion`; `createOffsetCorrectedTranscriptVersion` (~913) and `approveTranscriptTrack` (~2951) re-put track metadata. Callers that write cues once and add nothing afterwards: `importYouTubeCaptionCandidate` (~2550), embedded subtitle extraction (~2170).

**Finding F-C0-1 (C3 input):** a track's bundle is not written once today. The ASR/Scribe drafts and word-level corrections add word timings to an already-persisted track without a new id or `trackVersion`. A write-once `PUT /api/tracks/{id}/transcript` at track creation would drop those timings or reject them with `409`.
**Decision (Janusz, 2026-10-19, option a):** C3 assembles cues, word timings and the final `trackVersion` before the first put/persist, so the plan §2.3 write-once contract is unchanged. Recorded on `lt-584.1` and `lt-584.4`.

## 4. Collection / table / reader coverage (step 4)

| `LocalStoreSnapshot` key | Table(s) written by `save*Projection` | Reader | Reader shape |
| --- | --- | --- | --- |
| `mediaAssets` | `media_asset` | `listMediaAssets()` | whole collection |
| `mediaObservations` | `media_file_observation` | `listMediaFileObservations(mediaId)` | **keyed by media** |
| `subtitleTracks` | `subtitle_track` | `listSubtitleTracks()` | whole |
| `cues` | `cue` | `listCuesForTrack(trackId)` | **keyed by track** |
| `transcriptWordTimings` | `transcript_word_timing` | `listTranscriptWordTimingsForCue(cueId)` | **keyed by cue** |
| `savedItems` | `saved_item` | `listSavedItems()` | whole |
| `savedOccurrences` | `saved_occurrence` | `listSavedOccurrences()` | whole |
| `reviewCards` | `review_card` | `listReviewCards()` | whole |
| `reviewCardStates` | `review_card_state` | `listReviewCardStates()` | whole |
| `reviewEvents` | `review_event` + `active_review_event` | `listReviewEvents()` | whole (active) |
| `practiceAttempts` | `practice_attempt` + `active_practice_attempt` | `listPracticeAttempts()` | whole (active) |
| `learnerAudit` | derived (`review_event`, `practice_attempt`) | `listAuditReviewEvents()`, `listAuditPracticeAttempts()` | whole (retained) |
| `exportJobs` | `export_job` | `listExportJobs()` | whole |
| `providerPolicies` | `provider_policy` | `listProviderPolicies()` | whole |
| `importJobs` | `import_job` | `listImportJobs()` | whole |
| `importJobEvents` | `import_job_event` | `listImportJobEvents()` | whole |

Result: yes for all 15 collections; `learnerAudit` is derived. Seventeen `list*` readers in total (source).

**Finding F-C0-2 (C2/C3 input):** three readers are keyed, not whole-collection.
- `loadSnapshotFromTables` must iterate tracks → cues → word timings, or use new unkeyed/per-track readers. A per-track word-timing reader is also what `loadTranscripts(mediaId)` needs, instead of N per-cue queries.
- `media_file_observation.media_id` has no foreign key to `media_asset`. Observations for media absent from the catalog are legal and tested (`tests/core/localPersistence.test.ts`, "preserves saved learner anchors and missing-media observations without cascading deletes", saved with `mediaAssets: {}`). A loader that iterates `media_asset` would silently drop them, so C2 needs an unkeyed observation read.

## 5. Other findings

**F-C0-3 (browser, outside this epic's named changes; inference + measured):** every `LocalStore.put*` / `add*` returns `cloneSnapshot(this.state)` (`packages/storage/src/localStore.ts` `clone()`). One `putCue` costs about 0.25 s at 5,000 cues and about 2–2.6 s at 50,000 cues. Import loops call it once per cue and per word timing (`model.ts` sites in §3), so a browser import is O(library × new rows). Building the 2 × 50 × 8 set through `LocalStore` took about 46–50 s. The per-media loading in C4 bounds the in-memory library to the opened media, which caps this, but the per-put clone remains. Reported for a decision; not filed or changed here.

## 6. Retention

The spike script stays in `scripts/spike/` so C5 can re-measure the same synthetic sets against the new loaders (plan §3 C5 step 2). It is not imported by product code or tests.
