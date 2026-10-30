# Core-loop source and decision reconciliation (`lt-192.1`, A)

Status: **A draft, revised after the independent review checkpoint on `lt-192.1`; parent review pending, not complete**, based on `main` `6a1135eb07ba8d761aa953a6e4c0f265c97bbbbc`, worktree branch `work/lt-192-a-b-foundation`. It reconciles the adopted [product brief](product-brief.md), [delivery scope](delivery-scope.md), [applied Beads mapping](beads-mapping.md), `DECISIONS.md` §2/§6/§9/§10/§14/§14a/§15 and `docs/review/safety-privacy-boundary-review.md` with the current source. Closing `lt-192.1` is up to the parent/operator after independent review.

Evidence labels: **[src]** = read from source at the base commit, at the cited `path:line`. **[test]** = an existing test that names the behaviour. Its pass/fail status was **not** run for this document. **[decision]** = recorded owner decision (cited). **[current]** = current source behaviour, not a decision. **[rec]** = recommendation or inference, not decided. No application code, tests, configuration, Beads, real learner state or media were changed or executed while preparing this document.

## 1. Authority recorded for this work

- **Source.** A `SCOPE` comment on `lt-192` (2026-10-30 09:36). It was written by the parent/coordinating agent, under the Beads actor name, as its record of Janusz's approval in the Desktop chat. The comment quotes Janusz's chat message: *"Let’s get docs/design-discussion-register merged into main and then follow its handoff instructions, please"*. The scope list that follows the quote is the parent's recorded interpretation of that approval, given in reply to the recommendation to start `lt-192.1` and `lt-192.2`. Janusz did not write the Beads comment himself.
- **Authorised (as recorded).** The reviewed merge of the planning branch into `main`. This is done: `main` was fast-forwarded to `6a1135e`, with an independent SPEC and QUALITY PASS recorded on `lt-192`. After that, **A (`lt-192.1`) and B (`lt-192.2`) only**: decision/source reconciliation, and an isolated **synthetic** service/browser recovery rehearsal. Both run in dedicated worktrees with canonical Beads, independent review and verified atomic work-branch commits and pushes.
- **Excluded.**
  - C–H runtime implementation (`lt-192.3`–`.8`) and the promoted `lt-zt0`, `lt-5lb.4` and `lt-90t`.
  - Access-policy or network configuration changes.
  - Providers and downloads.
  - Real-state or media discovery and transfer (`lt-eet`).
  - Actual iPad or Anki operation.
  - Persistent deployment or rollout (`lt-jxg`).
  - Legacy-table deletion.
  - Renewed frozen Windows execution.
  - Any later implementation merge to `main` inferred from the planning-branch merge approval.
- **Not authority.** Historical `lt-dy6`. `AGENTS.md:29` still names it. That protected file is left untouched, as recorded in the [handoff](implementation-handoff.md).
- **Preserved.** Completed work stays closed and accepted: `lt-foe`, `lt-dxo`, `lt-foe.3.5` (Janusz observed .apkg/.txt import and nonduplicating re-import), `lt-584.1`–`.6`, and the capture/parser deliveries. `lt-584.7` (open) blocks only reuse of the affected qualification harness payloads/oracles. It is not a global blocker, and B does not depend on it unless B chooses to reuse that harness.

## 2. Current source inventory

### 2.1 Transcript import paths

| Path | Entry point | Resulting track | Capture-eligible today | Existing tests |
| --- | --- | --- | --- | --- |
| **Local subtitle files (target/native) selected together with the video** in the browser | `importBrowserLocalFiles` `apps/web/src/model.ts:1590` (UI `apps/web/src/views/library.ts:942`); handle variant `importBrowserLocalFileHandles` `model.ts:1676` (`library.ts:987`, `views/player/stage.ts:483`); per-file parse isolation `tryAdaptSubtitleFile` `model.ts:1435` → `adaptSubtitleText` `model.ts:1236` with `sourceKind: 'owned'` (`model.ts:1448`) | `makeSubtitleTrack` defaults `transcriptStatus: 'approved'` (`packages/domain/src/factories.ts:49`) and `transcriptSourceKind: 'user-subtitle-file'` (`factories.ts:44`) | **Yes** (approved on import) | [test] `tests/web/ltddy5MalformedSubtitle.test.ts:81-162`, `ltddy3PickerSubtitles`, `ltddy6NativeOnly`, `lanHashImport`, `lt-n31Relink`, `subtitleAdapter` |
| **Adding subtitles to already-imported media: only by reselecting the same video** | No subtitle-only entry point exists. The learner imports the video file again together with the subtitle files. `importBrowserLocalFiles` hashes the video bytes and relinks only on a matching content fingerprint, never on the file name (`model.ts:1598-1601,1614-1616`). `relinkExistingBrowserMedia` `model.ts:1494` then adds a different subtitle file beside the existing tracks, which are never replaced (`model.ts:1522`), and reuses identical content by hash (`model.ts:1516-1520`). The import warning tells the learner to "import the same video again" (`model.ts:1491`) | Approved user-subtitle track | Yes | [test] `ltddy5MalformedSubtitle.test.ts:111,126`, `lt-n31Relink.test.ts` |
| Offset-corrected version | `createOffsetCorrectedTranscriptVersion` `model.ts:1208` (UI `library.ts:337`); **keeps the parent's status**, so an approved parent produces an approved new track/cue-ID version (`model.ts:1221-1222`) | New track version, new cue IDs | Yes, if the parent was approved | p7/b7 frontend suites |
| Synthetic fixture import | `importFixtureMediaAndSubtitles` `model.ts:3352`, `importTargetOnlyFixture` `model.ts:3314`, browser `importBrowserSyntheticFixture` `model.ts:1268` | Approved, `privacyLabel: 'synthetic'` | Yes | Many core/web suites; **reusable for B** |
| **Embedded subtitle extraction** (local ffprobe/ffmpeg, absolute service path) | list `listEmbeddedSubtitleTracksFromService` `model.ts:2325`; extract `extractSelectedEmbeddedSubtitleDraft` `model.ts:2410` (UI `ui/transcriptSources.ts:165`); service jobs `embedded-subtitle-list`/`-extract` `apps/local-service/src/server.ts:61,479-482`; `packages/local-transcription/src/index.ts:632,668` | **`draft`**, enforced on the service reply (`model.ts:2471-2473`) and written as draft (`model.ts:2495`) | No, until explicitly approved | [test] `tests/web/b7EmbeddedSubtitleFrontend.test.ts`, `nativePathGates`, `capturedTransport` |
| Public YouTube captions (online provider gate) | `importYouTubeCaptionCandidate` `model.ts:2851` (UI `library.ts:142,170`); requires `allowPublicRead` (`model.ts:2856`) and service `LINGOTORTE_ALLOW_ONLINE_PROVIDERS` (`server.ts:617`); creates **separate caption-candidate media** (`model.ts:2868-2876`) | `draft`, `youtube-caption`/`youtube-auto-caption` | No | [test] `tests/core/p7TranscriptAdapters.test.ts`, `tests/no-network/providerDisabled.test.ts:31,54` |
| Local ASR draft (faster-whisper, service job) | `generateLocalAsrDraft` `model.ts:2899` (UI `library.ts:203`); job `local-transcription` `server.ts:453` | `draft`, `local-asr`, word timings | No | [test] `p7TranscriptAdapters`, `dirtyTranscriptApproval`, `transcriptBundleAssembly` |
| ElevenLabs Scribe v2 draft (online provider) | `generateElevenLabsScribeDraft` `model.ts:2939` (UI `library.ts:233`); requires `allowOnlineProvider` (`model.ts:2944`) and the service gate (`server.ts:563`) | `draft`, `online-asr`, word timings | No | [test] `p7TranscriptAdapters`, `transcriptBundleAssembly` |
| `yt-dlp` command plan | `planYtDlpMediaAcquisition` `model.ts:3283`: `effect: 'plan-only'`, media requires rights confirmation | No track (command display only) | — | — |
| JSON transcript import | `importTranscriptJson` `packages/subtitles/src/import.ts:186` | Package API; no app caller found by grep | — | — |

All new tracks go through `putTranscriptSegments` (`model.ts:2742`) or the subtitle adapters. They are persisted to the service as write-once per-track bundles (§2.4).

### 2.2 Correction and approval (current)

- Text/timing/word corrections: `createCorrectedTranscriptVersion` `model.ts:3006`/`:3014`. Each one creates a **new immutable track version** (`trackVersion + 1`, `model.ts:3064`) with **new track and cue IDs**, `transcriptStatus: 'correcting'` (`model.ts:3054`) and `provenance.parentTrackId` (`model.ts:3058`). Split/merge use `createStructuralCorrectedTranscriptVersion` (`model.ts:3122`, `:3163`, `:3184`).
- Approval: `approveTranscriptTrack` `model.ts:3261`. It is blocked while a correction is pending or edits are dirty (`transcriptApprovalBlockReason` `model.ts:3255`). UI: `library.ts:625-642`.
- **Re-anchoring does not exist.** Saved occurrences keep the original `subtitleTrackId`/`cueId` (`packages/domain/src/coreTypes.ts:206-216`). A corrected version does not move existing occurrences. This matches discussion-register E-09.

### 2.3 Exact selection capture and card enrolment (current)

- UI gate: `openCapture` refuses capture unless the current target track is `approved` (`apps/web/src/ui/capture.ts:7,16`; transcript affordances `views/player/transcript.ts:61,572`). Inspect/lookup stays ungated.
- Capture: `saveSelectionWithReceipt` `model.ts:3435`. It builds the exact source context with `buildSourceContext` (`apps/web/src/uiTypes.ts:264`): `mediaId`, `mediaPath` (= current `originalPath`), fingerprint, `subtitleTrackId`, `cueId`, word-timing-derived `timeRangeMs` (`model.ts:3400`), `tokenSpan` and `charSpan`. Sentences use the whole-cue shape (`model.ts:3443-3458`).
- Domain service: `SavedOccurrenceService.saveSelection` `packages/storage/src/savedOccurrenceService.ts:104`.
  - The service enforces an approved transcript as well (`:94-102`).
  - It deduplicates items **globally** by kind + language + normalized text, skipping archived items (`:64-72`). The item, and so its meaning and notes, is therefore already shared across videos.
  - Occurrences are deduplicated by an exact span fingerprint (`:39-51`, `:74-92`).
- **Card enrolment is coupled to capture.** `CaptureService.capture` `packages/review/src/capture.ts:38-46` calls `ensureCard` (`:103-118`), which creates an FSRS recognition card due now. F (`lt-192.6`) must decouple this without deleting existing cards or history.
- Undo: `CaptureService.undo`/`canUndo` `review/src/capture.ts:57-89`, model `undoSave` `model.ts:3423`. It removes only what that save created, and refuses after any edit, review event, practice attempt or other reference.
- Meaning edit: `CaptureService.setMeaning` `review/src/capture.ts:148`, model `setSavedItemMeaning` `model.ts:3509`. It is per saved item, so it already persists across occurrences.
- [test] `tests/core/captureService.test.ts:46,59,70,84,115,122`, `tests/core/p7TranscriptAdapters.test.ts:244`, `tests/core/p7TranscriptLifecycle.test.ts:108`, `tests/web/dirtyTranscriptApproval.test.ts:274`, `tests/web/ltfoe31MeaningEdit.test.ts`.

### 2.4 Shared state CAS and per-media write-once transcript bundles (ADR-0003, accepted)

- Service persistence: `SqliteLocalPersistence` `packages/storage/src/sqliteLocalPersistence.ts:842`.
  - `write` runs `BEGIN IMMEDIATE`, compares the expected revision and bumps it (`:1968-1976`).
  - The opaque `rev:<n>` token comes from `currentRevision` (`:1849-1852`).
  - `saveLearnerState` uses whole-document CAS (`:1980`).
  - `saveTrackTranscript` is **write-once per track**: `TranscriptBundleConflictError` (`:2000-2009`).
  - Bundle-first guard: `tracksMissingTranscriptBundle` (`:1990`).
  - Reads: `loadLearnerState` (`:1744`) and `loadTranscripts` per media (`:1749`).
- Routes:
  - `GET /api/state` `apps/local-service/src/server.ts:1098`.
  - `GET /api/media/{id}/transcripts` `:1105`.
  - `PUT /api/tracks/{id}/transcript` `:1117-1135`: 428 without a revision, 409 `transcript-bundle-exists`.
  - `PUT /api/state` `:1159-1190`: refuses a non-candidate track without a stored bundle (`:1179`) and returns 409 on a stale revision (`:1187`).
- Client:
  - `saveModelToLocalService` `model.ts:515` sends one PUT at a time and flushes bundles before learner state (`:540`). `flushPendingTranscriptBundles` (`:487`) verifies a 409 by readback.
  - Connection choice: `connectLocalService` `:609` and `resolveLocalServiceConnection` `:700`.
  - Browser-only work: cache v2 keeps the learner state and only the **unacknowledged** bundles. It strips the cues and word timings of every bundle the service has acknowledged (`pendingOnlySnapshot`, `apps/web/src/browserSnapshotCache.ts:124-128`), and hydration restores only the pending ones (`:209-213`). Acknowledged bundles return only through per-media loading (`loadMediaTranscriptsNow` `model.ts:446`). On connect, only the current media is loaded (`model.ts:668-673`); other media load when opened (`model.ts:877-882`). See ADR-0003 Decision 4.
  - Connection choice **Keep browser work** does not merge. It keeps the browser document unchanged and marks it unsaved. The next save replaces the compared durable learner state under the compared revision, and concurrent changes conflict (`resolveLocalServiceConnection` `model.ts:701-739`; message at `:735`). **Load service state** replaces the browser store and discards its unsent bundles (`model.ts:718-730`).
  - Baseline for the dirty check: after a successful connect, the client records an acknowledgement baseline per service origin, and the cache seeds it at boot (`recordAckBaseline`/`seedCachedAckBaseline`/`effectiveBaseline` `model.ts:338-352`). A cached browser whose serialized state equals that same-origin baseline is not dirty. It therefore adopts whatever learner state the service at that origin returns, with no choice prompt (`model.ts:647-648,664-667`). [rec, source-read only] So a cache acknowledged by a candidate service can silently adopt an older service restored at the same origin.
- **Current lost-ack behaviour is not an idempotent retry.** `tests/web/localServiceSync.test.ts:58` names it "reports a lost acknowledgement honestly even when SQLite committed, then conflicts on retry". C (`lt-192.3`) owns the change to a duplicate-safe retry.
- [test] `tests/core/transcriptBundles.test.ts:45,59,77,92,126`, `tests/core/durableRevision.test.ts:39,56,86,106`, `tests/web/transcriptLoading.test.ts:117,134,150,167,189`, `tests/web/localServiceSync.test.ts:39,58`, `tests/web/browserSnapshotCache.test.ts:49,78,149,167,191`, `tests/core/lt2t4IntegratedQualification.test.ts:175,215`.

### 2.5 Recovery mechanisms that already exist

- **Consistent SQLite copy:** `node:sqlite` `backup()` on a live WAL database. The copy opens independently with table-level state equal to the source, and a pre-upgrade copy stays usable for recovery (`tests/core/legacyMigrationQualification.test.ts:8,368-414`). The comparison helper `tableState` (`:82`) is file-local and not exported. Equality is logical (rows/objects); it is not byte identity of the live database or WAL files.
- **Revisions** are a per-store counter, `rev:<n>` from `durable_state.revision` (`sqliteLocalPersistence.ts:1849-1852`). They are monotonic only within one store lineage. A restored older copy reuses lower `rev:n` values, so the same token can name different states across a rollback.
- **Learner-state export v1 and restore:** active learner subset only (`DECISIONS.md` §3; `docs/dev/local-runbook.md:314-317`). It is **not** full recovery: it has no media, tracks, cues or audit. Restore preview/commit runs under CAS and the existing denial matrix (`lt2t4IntegratedQualification.test.ts:80,175,215`; `tests/core/restorePlanner.test.ts`).
- Docker named volumes per Compose project. A changed project name gives an isolated synthetic instance (`docs/dev/docker-runbook.md:102-113`).

### 2.6 Anki export: stable IDs and source choice (current)

- GUID: `ankiGuidFor` `packages/domain/src/ankiExport.ts:43-45`. It is `lt` + the first 20 hex characters of sha256(`` `lingotorte-anki:${savedItem.id}` ``) (the doc comment at `:42` omits the prefix). [current] This gives one GUID per saved item, stable across exports and videos. The package also uses a fixed note-type id and name (`ANKI_NOTETYPE_ID`/`ANKI_NOTETYPE_NAME` `apps/local-service/src/ankiPackage.ts:13-16`) and sets each note's `mod` to the export time (`ankiPackage.ts:154,173`).
- Plan: `buildAnkiExportPlan` `ankiExport.ts:75-102` exports **all active items**. Items with `archivedAt` are excluded (`:82`).
- **Item archive versus UI archive.** `SavedItem.archivedAt` (`packages/domain/src/coreTypes.ts:253`) is supported by the store (`sqliteLocalPersistence.ts:1082,1470`) and by the learner-state manifest (`packages/domain/src/exportManifest.ts:329-347`), so it can be stored and restored. No web UI sets it. The Saved view's review toggle only suspends the item's cards (`apps/web/src/views/saved.ts:161-170`, `CaptureService.archiveCards` `packages/review/src/capture.ts:120-127`), so a UI-"archived" item stays active and is still exported. There is **no per-video or subset selection**; the UI calls it with everything (`apps/web/src/views/exportImport.ts:561-562`).
- Context source: the **earliest occurrence by `createdAt`, then id** (`contextHtmlFor` `ankiExport.ts:53-73`). It is recomputed on every export, **not pinned**. Removing or undoing that occurrence, or a later restore, silently changes which context is exported.
- Context text: resolved from the cue loaded in the browser (`exportImport.ts:562`). The app never stores `contextBefore`/`contextAfter` (`ankiExport.ts:55`). [rec, source-read only] Because transcripts load per media (ADR-0003), an item whose earliest occurrence belongs to media not loaded in this session falls back to the bare bold selection (`ankiExport.ts:68-71`). The export view does not load those transcripts first. G should verify this and handle it.
- Service `.apkg`: `apps/local-service/src/ankiPackage.ts` (route `/api/export/anki`, `server.ts:1081`) validates GUIDs and keeps them unique. [test] `tests/core/ltdxoAnkiExport.test.ts:42-196`, `tests/web/ltdxoAnkiExportUi.test.ts`. Anki import/re-import was human-qualified under `lt-foe.3.5`.

## 3. Transcript paths for the new core loop (scoped recommendation)

**Status: [rec].** This is A's scoped, conservative recommendation for the new add → watch → collect → export loop, put forward for review. It is not an owner product decision, and it changes no existing policy, default or gate. If Janusz decides differently, that decision wins.

1. **Recommended new-loop transcript path:** user-selected local subtitle files (SRT/VTT/ASS; target and optional native) added **together with the video**. This path exists today (`model.ts:1590,1676`) and imports as `approved` `user-subtitle-file` tracks. Adding subtitles to existing media currently works **only by reselecting the same video**, with a matching content fingerprint (§2.1). **Independent subtitle-only attachment** to existing media, with separately retryable attachments, does not exist. It is future E (`lt-192.5`) work, together with server-managed storage. E should reuse the same parsers (`adaptSubtitleText`/`parseSubtitleText`) and the per-file failure isolation (`model.ts:1435-1453`).
2. **Capture eligibility unchanged [current]:** only an `approved` target track can be collected from (`ui/capture.ts:16`, `savedOccurrenceService.ts:94-102`). Collection from previously approved tracks of any origin remains possible, because explicit approval already happened.
3. **Not enabled by this recommendation:**
   - draft collection (discussion-register Q-04 stays open);
   - automatic or implicit approval;
   - any change to `transcriptStatus` defaults;
   - provider calls (YouTube captions, ElevenLabs Scribe);
   - downloads or `yt-dlp` execution;
   - ASR model installation.

   Provider-off defaults and the gates at `server.ts:563,617` and `model.ts:2856,2944` are unchanged.
4. **Retained unchanged, outside the new loop's recommended default flow:** embedded extraction, local ASR, Scribe and YouTube candidate paths keep working as they do today: draft → correct → explicit approve. [rec] New-loop UI should not present them as part of the default add flow. Their compatibility with server-managed media is not designed here. Adapting embedded extraction or local ASR to managed media IDs instead of absolute paths (`DECISIONS.md` §2) would need a later, separately scoped issue.
5. **Recommended as parked (not mandatory work for C–H):**
   - inline correction from the word-analysis surface;
   - re-anchoring captured occurrences to corrected versions (register Q-05, W-05/W-06);
   - context-only versus target-changing correction semantics;
   - correction batching.

   The current behaviour (§2.2: new version, old occurrences keep their original anchors) remains in force.

## 4. Current versus intended behaviour

| Area | Current [src] | Intended (from brief/scope/`DECISIONS.md`; [rec] where marked) | Owner |
| --- | --- | --- | --- |
| Media bytes | Browser-local object URL/handle. Absolute service paths only for jobs (`model.ts:1606,1652-1659`) | Server-managed media streamed to desktop and iPad; read-only source mount kept (§2) | `lt-zt0` design, then D/E |
| Shared mutations | Whole-document learner-state CAS. A lost ack makes the retry conflict (`localServiceSync.test.ts:58`) | Server-owned actions, duplicate-safe retries, two-client edits retained, no silent overwrite | C |
| Access | Capability pairing, remembered pairing (§14a), Host/Origin admission | Reviewed private access; pairing replacement only under reviewed scope (§14) | `lt-zt0`/D |
| Collection | Creates an FSRS card (`review/src/capture.ts:38-46`) | Collect without in-app enrolment; old cards and history preserved (§10) | F |
| Undo | Removes the created item/occurrence/card under guards (`review/src/capture.ts:57-89`) | Action-scoped Undo that never removes pre-existing occurrences or history | F |
| Meaning/notes | Per saved item, already shared across videos (`review/src/capture.ts:148`, `savedOccurrenceService.ts:64-72`) | Persistent shared edits across occurrences (§10). Matches today | G (selection UI) |
| Export scope | All active items (`ankiExport.ts:82`) | Per-video selection with honest preview, including empty/note-only answers | G |
| Export context | Earliest occurrence, recomputed, not pinned | [rec] Stable pinned source occurrence; earliest as the initial pin (`DECISIONS.md` §10 calls this a recommendation still to resolve) | G (after decision) |
| Replay | Browser playback ranges | Replay the selected occurrence through server media | `lt-90t` |

## 5. Decisions: recorded, current-source recommendation, and unresolved before G (`lt-192.7`)

**Recorded owner decisions [decision]:**
- Meaning and note edits persist on the saved item across video occurrences (`DECISIONS.md` §10; [delivery scope](delivery-scope.md) "per owner decision"). Today's per-item meaning matches this (§2.3).
- New collection must not automatically enrol into in-app study. Existing cards and history are kept (`DECISIONS.md` §10).
- File export first. No AnkiConnect or live-collection mutation without fresh approval (`DECISIONS.md` §10).
- Text-only export carries no replay media, and the preview discloses empty/note-only answers (adopted [product brief](product-brief.md) item 4; `DECISIONS.md` §10).
- Existing import/re-import qualification (`lt-foe.3.5`) is retained. New subset/context/edit behaviour needs delta checks (`DECISIONS.md` §10).

**Current source plus recommendation, not an owner decision:**
- **One Anki note per saved item.** [current] `ankiGuidFor` already derives one stable GUID per saved item (§2.6). [rec] The brief and delivery scope recommend keeping that identity with a stable source occurrence, and name video-specific identities as the alternative. `DECISIONS.md` §10 records the identity/source-context policy as "a recommendation still to resolve before `lt-192.7` implementation". A does not decide it.

**Owner decisions needed before G coding. A does not decide these:**
1. **Note identity.** Confirm one note per saved item, or choose video-specific identities. Changing identities later risks duplicates and history discontinuity.
2. **Source pinning.** Whether to persist an explicit export-source occurrence per saved item ([rec]: pin the earliest at first export or first capture). Also, what happens when the item is selected from another video ([rec]: the context is not silently replaced; an explicit "use this context" action).
3. **Source change/deletion.** What the export does when the pinned occurrence is undone, removed by restore *Replace all*, or anchored to a track later superseded by a correction, or when its media/transcript is unavailable. Options: keep the last exported context snapshot; fall back to the next-earliest occurrence with disclosure; or block that note with a reason.
4. **Anki-side edits.** Whether Lingotorte-side edits may overwrite edits made in Anki. A re-import with the same GUID **can** update the existing note. Whether it does depends on the Anki version and import format, the import's update options, note-type compatibility, and how the note modification times compare ([rec]: general Anki behaviour, not verified here; the package sets note `mod` to the export time, §2.6). It is not inferred from `lt-foe.3.5`.

**Technical choice for G, settled by evidence and review rather than an owner gate:**
- **Cue availability at export.** Load the needed per-media transcripts before export, or store a context snapshot. Either must make export independent of which media this session happened to open (§2.6). G resolves this through source evidence and independent review, unless it changes a recorded decision.

**Evidence G needs (not A/B work):** a disposable Anki profile check that records the Anki version, import format (.apkg/.txt) and import/update options, and verifies the update of each field (including the context field), Anki-side edit handling, and retained review history and scheduling across re-import. This is G (`lt-192.7`) evidence under its own scope. A and B perform no live or actual Anki action.

**Still unresolved elsewhere (not blocking A/B):** draft collection (Q-04), correction re-anchoring (Q-05), the actual Tailscale access boundary, and iPad playback capability.

## 6. Recommended B (`lt-192.2`) recovery proof: synthetic only, reusing existing mechanisms

[rec] **Not run.** This section is based on reading the source only. No test was written or executed, and nothing here is runtime proof.

1. **Isolation.**
   - Use temporary SQLite files and in-memory/fake IndexedDB backends only.
   - Start services with the `startPrivateService` pattern (`tests/web/localServiceSync.test.ts:24`) or the `startService` pattern (`tests/web/transcriptLoading.test.ts:43`). Both pair an `AppModel` through `pairLocalService`. `startPairedService` (`tests/helpers/pairedService.ts:3`) only feeds `pairedFetch` and does not expose the capability to a model, so it does not fit browser-model flows.
   - Other reusable helpers: `openShadowed` (`tests/helpers/shadow.ts:56`), `captureSentence`/`captureLexeme` (`tests/helpers/capture.ts:13,18`) and the fixture imports (`model.ts:3352`). `tableState` (`legacyMigrationQualification.test.ts:82`) is file-local, so B needs its own copy or an equivalent logical snapshot.
   - If a Docker stack is used: own project name, `fixtures/media` and `down -v` on owned volumes only.
   - No real state, media or private paths.
2. **Seed a representative synthetic store** through the real save paths, not hand-written rows:
   - two media, each with approved target + native tracks;
   - a corrected track version with word timings;
   - lexeme, phrase and sentence captures, including one item captured in both videos;
   - a learner meaning and a dictionary-suggested meaning with notes;
   - review events and practice attempts;
   - inactive learner audit produced by an existing *Replace all* restore.
   - Two separately labelled archive cases (§2.6): a **UI operation**, where the Saved-view toggle suspends the item's card (`archiveCards`); and a **store/restore fixture**, where an item carries `archivedAt`, seeded through a learner-state manifest restore, because no UI sets it.
3. **Checkpoint.**
   - Take a consistent `node:sqlite` `backup()` of the populated, WAL-active database, as in `legacyMigrationQualification.test.ts:369`. Keep it as an **immutable, separate backup**. Every reopen uses a disposable working copy of it.
   - Record a **logical snapshot** of the checkpoint: schema version, `rev:<n>`, active learner state, learner audit, and the transcript bundles (cues and word timings) of every track, both original and corrected. Also record a learner-state export manifest.
   - Record the serialized browser cache record, including its acknowledgement baseline.
4. **Supported scenario (required): exact checkpoint baseline plus offline additions.** Keep browser work replaces the compared learner state; it does not merge (§2.4). B therefore defines the browser candidate explicitly:
   - Start from the exact service checkpoint baseline, with the transcripts of all media loaded.
   - Add offline browser-only work: an unpaired import whose bundle is pending in snapshot cache v2, and new captures and edits. Follow the `transcriptLoading.test.ts:117,167` and `browserSnapshotCache.test.ts:49,167` patterns.
   - The fixture builder **rejects a same-ID conflict**: any addition whose ID exists in the baseline with a different payload. Additions are new IDs only.
   - Transfer and reopen: open a working copy of the checkpoint behind a paired service. Hydrate the browser from the cache, choose Keep browser through `resolveLocalServiceConnection`, and let `saveModelToLocalService` flush the pending bundles and learner state. Then close and reopen. Include one lost-acknowledgement readback, as in `lt2t4IntegratedQualification.test.ts:215`.
   - **Independent originals:** every baseline record that the additions do not touch must be retained exactly.
   - **Service-only sentinel (separate stale-comparison case):** first reconnect the browser and wait until its pending connection choice has captured the service comparison revision. Only then let a second client write a sentinel, before the browser's first save PUT, with no intervening reconnect. Choosing Keep browser and saving must conflict on that now-stale comparison revision, and the sentinel must survive. A sentinel already present when reconnect compares state is a different case: CAS does not protect it from omission by replacement. The rehearsal must detect that independent divergence and refuse Keep browser before writing; this is a fixture-level safety precondition, not an existing product safeguard. B does not implement a merge; that is C (`lt-192.3`).
5. **Optional separate scenario:** a learner-only *Merge/update* restore of a learner-state export onto a service that already holds the same media and tracks (`views/exportImport.ts:262`, `tests/core/restorePlanner.test.ts`). Its expected result follows the existing restore planner. It is not combined with scenario 4.
6. **Unsupported today:** a service that changed independently, plus new browser-only media. No current path combines these safely, because Keep browser replaces and Load service discards the browser's pending bundles (§2.4). This belongs to C. B may show only the conflict or refusal, never a merged result.
7. **Rehydrate before every comparison.** The cache strips acknowledged bundles, and connect loads only the current media (§2.4). Before any identity or export oracle runs, B explicitly loads the transcripts of **all** fixture media, with both original and corrected tracks, through the per-media route (`GET /api/media/{id}/transcripts`). The before-export and after-export comparisons both use fully hydrated models.
8. **Rollback.**
   - Discard the candidate. Reopen a fresh working copy of the immutable checkpoint backup.
   - Restore or isolate the browser cache checkpoint too: either restore the recorded cache record, or use a fresh cache store and origin. A cache acknowledged by the candidate at the same origin can silently adopt the older service (§2.4).
   - Assert that the rolled-back logical snapshot equals the checkpoint snapshot exactly: schema version, revision, active learner state, audit, and all transcript bundles.
   - Revisions are monotonic only within one store lineage (§2.5). After rollback, `rev:n` values are reused, so do not compare revisions across the candidate and rollback lineages. A candidate-era revision token must not be treated as valid against the rolled-back store.
   - Do not assert byte identity of the live database or WAL files. The backup file stays untouched because it is never opened for writing.
9. **Oracles (IDs and content, not counts), against the combined expected state** (checkpoint baseline plus additions) for transfer, and against the exact checkpoint for rollback:
   - saved item ids, `meaning`, `meaningSource`, `notes` and `archivedAt`;
   - card `suspendedAt` for the UI-archive case;
   - occurrence ids with full `sourceContext`, where every `cueId`/`charSpan` resolves to a cue whose slice equals `selectionText`;
   - track ids, `trackVersion`, status and `provenance.parentTrackId`;
   - cue and word-timing rows per track;
   - review card/state/event and practice attempt ids and payloads;
   - learner audit;
   - revision monotonicity within each lineage only;
   - Anki: the checkpoint `ankiGuidFor` set is a subset of the after-transfer set, and the difference is exactly the GUIDs of the added active items. `buildAnkiExportPlan` on the fully hydrated transferred model equals the plan computed independently from the fully hydrated combined expected state.
10. **Evidence:** exact candidate SHA, the commands and their results, and independent review. `lt-584.7` is irrelevant unless its affected harness payloads are reused.

## 7. Prototype receipt counts (add-video sketch)

`docs/design/sketches/add-video/README.md` is an immutable design archive and stays byte-identical to `6a1135e`. It reports two verification counts. Line 42 records the original run: **85 passing checks**. Line 31 records a later rerun: **99 checks passed**, described as "the original 85" plus no-target applicability checks and focused recovery tests. Both are preserved designer receipts; the coordinator did not rerun them (`lt-192` integration comment). Neither is runtime proof of the application.

## 8. Verification of this document

These checks ran on the base `6a1135e` worktree after the review-checkpoint revision:

- A scratch script outside the repository resolved every relative Markdown link and every backticked `path[:line]` reference in this file, the handoff, the mapping and the add-video README: 22 links and 165 references, 0 errors. The script only checks that each file exists and that the cited line numbers are within the file's length. The symbol or text at each newly added citation (§2.1, §2.4–§2.6, §6) was hand-checked by reading the source.
- `git -c core.whitespace=cr-at-eol diff --check` passed.
- `git diff --quiet 6a1135e -- docs/design/sketches/add-video/README.md AGENTS.md` passed: the immutable sketch README and `AGENTS.md` are byte-identical to the base.

Repowise was not available in this session's tool set, so the source was traced with `grep`/`sed` and direct reads. No application tests were run; every **[test]** citation is a reference to an existing test, not a result. Statements marked "source-read only" have no runtime proof. Line numbers will drift with later edits.
