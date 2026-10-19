# Abstraction-quality review — 2026-10-19

Status: review report, read-only. Written by Code Architect against `main` `e9b5586`. Requested and accepted by Janusz in chat on 2026-10-19; findings filed as Beads issues under `lt-5lb` (see §6). No source, test, config or tracker state was changed by the review itself.

Lens: *abstraction quality* — does each layer give callers a genuinely different way of thinking about the problem, or must callers see through it to use it correctly? Companion lenses applied where noted: deep-modules (pass-through audit), information-hiding.

Scope: `packages/storage`, `packages/review`, `apps/web/src/model.ts` and its views, `apps/web/src/*Client.ts`, `apps/local-service/src/server.ts`.

Baseline respected: ADR-0001 (subtitle parser seam), ADR-0002 (Capture module) and `docs/plan/architecture-deepening-plan.md` §3 (what Lane A/B deliberately deferred) are treated as settled, not re-litigated. Line numbers are as of `e9b5586`; locate by symbol name when they drift.

Verification baseline for any follow-on work: 123 files / 1,971 passed / 1 skipped (`npx vitest run`, per ADR-0002 Outcome), `npm run typecheck`, `npm run build`, `npm run scan:privacy`.

---

## 1. Layer map

```
views/*, ui/*  ──► model.ts (AppModel + exported use-case functions)
                     ├─► CaptureService (packages/review)      ─┐
                     ├─► ReviewService (packages/review)        ├─► LocalStore (in-memory snapshot)
                     ├─► PracticeService (packages/storage)     │        ▲
                     ├─► SavedOccurrenceService (storage)       │        │ snapshot() JSON over /api/state
                     └─► Export/RestoreService (storage)       ─┘        ▼
                     └─► *Client.ts ─► PairedTransport ─► server.ts ─► SqliteLocalPersistence
```

Genuine abstractions (callers can forget what is underneath; leave alone):

| Module | Why it passes |
| --- | --- |
| `PairedTransport` (`apps/web/src/pairedTransport.ts:36-54`) | hides bearer auth, API path allow-list, staleness/invalidation, redirect refusal |
| `glossClient.ts`, `morphologyClient.ts`, `ankiExportClient.ts` | every failure is a typed result; parser accepts only the reviewed contract |
| `SubtitleParseError` seam (ADR-0001) | typed codes, runtime-agnostic core |
| `CaptureService` (ADR-0002) | invariants inside; three grep rules make ownership checkable |
| `planLearnerRestore` (`packages/storage/src/restorePlanner.ts`) | pure, detached planner; no store writes |

---

## 2. Findings, ranked by leverage

### F1. `PracticeService` is a second FSRS rating path at the same level as `ReviewService`, in the wrong package — high leverage, low effort

Evidence:

- `packages/storage/src/practiceService.ts:47-69` (`applyFsrsUpdate`) re-implements `ReviewService.submitReview` (`packages/review/src/reviewService.ts:58-81`): scheduler → `applyRating` → `makeReviewEvent` → `putReviewCardState` → `addReviewEvent`.
- It constructs its own scheduler with `defaultFsrsConfig()` (`practiceService.ts:56`), so the `FsrsSchedulerConfig` injected into `ReviewService` (`reviewService.ts:34`) does not govern practice-driven ratings. The interface omits something callers need to know (two schedulers can disagree) — the dangerous failure mode of a false abstraction, because it signals nothing.
- Package direction is inverted: storage imports review (`practiceService.ts:1`); review imports storage types (`reviewService.ts:12`, `capture.ts:1`). A storage package carrying FSRS orchestration is why the cycle exists.
- `listAttemptsForCard` / `listAllAttempts` (`practiceService.ts:118-124`) are sort-only pass-throughs with 0 app callers (`rg "listAttemptsForCard|listAllAttempts" apps packages --glob '!**/practiceService.ts'` → 0; one test file each).

Design it twice:

- **A (recommended):** move `PracticeService` to `packages/review`; `submitAttempt` calls `ReviewService.submitReview` for the FSRS part. One scheduler config, one event-writing path, package cycle removed.
- B: keep it in storage, inject `ReviewService`. Removes the duplicate but keeps storage depending on review. Rejected.

Confidence: high. Would change my mind: a documented reason practice must use default FSRS parameters even when review is configured otherwise (none found in `DECISIONS.md` or `docs/architecture/data-model-and-storage.md`).

### F2. The central artifact has no name in code; views reassemble it by reaching through `model.store` — high leverage, medium effort

AGENTS.md: "the central artifact is a video segment plus aligned transcript/subtitle cue." In code an occurrence-in-context is rebuilt by hand:

- `apps/web/src/views/review.ts:93-96` and `views/practice.ts:68-71` — identical sequence `getCue` → `getSubtitleTrack(nativeTrackId)` → `listCuesForTrack(nativeTrackId)` → `nativeTextForCue`.
- `views/saved.ts:103-118` — a third variant (`getCue`, `getMediaAsset`, `listCuesForTrack`).
- Views and `ui/*` touch `model.store.*` 47 times across 10 files (`rg "model\.store\." apps/web/src --glob '!apps/web/src/model.ts'`): `getSubtitleTrack` ×16, `listCuesForTrack` ×9, `snapshot()` ×6, `getCue` ×5, `listTranscriptWordTimingsForCue` ×4, `getMediaAsset` ×3, `listPracticeAttemptsForCard` ×2, `snapshotPendingRestoreIntent` ×1, `putMediaAsset` ×1 (`views/player/stage.ts:299` — a view writing to the store).
- `views/review.ts:209-213` and `views/saved.ts:39` iterate the raw `LocalStoreSnapshot` record.

`model.ts` presents itself as the application facade but views see the same structure they would see without it; `LocalStore`'s interface *is* its data structure (`LocalStoreSnapshot` is public; 34 `snapshot()` calls outside the store). Plan §3 deferred this as "candidate 4"; it is now the largest remaining UI↔storage-shape coupling.

Design it twice:

- **A (recommended first step):** one read model in `model.ts`, e.g. `occurrenceContext(model, occurrence): { cue, targetTrack, nativeText, media } | null` (UI-state aware: it needs `model.nativeTrackId`), migrate the three views to it, then add a grep rule "views/ui do not reference `model.store`" the way ADR-0002 did.
- B: a `LearnerReadModel` in `packages/review` over `LocalStore`. Better long-term (reusable from the service) but the native-track choice is UI state, so B needs A's seam first.

Confidence: medium-high. Would change my mind: if native-text lookup is about to move server-side (then B directly).

### F3. `SqliteLocalPersistence` carries a second, unused entity-reader interface duplicating `LocalStore`'s — medium leverage, low effort

Evidence:

- 17 `list*` readers over projection tables (`packages/storage/src/sqliteLocalPersistence.ts:800-1193`) have zero app callers. `server.ts` uses exactly six methods: `status`, `loadVersionedSnapshot`, `saveSnapshot`, `previewRestore`, `commitRestore`, `close` (`rg "persistence\.[a-zA-Z]*" apps/local-service/src/server.ts`). `hydrateStore` / `saveStore` (`:1789-1795`) are test-only.
- The authoritative read is the `snapshot_json` blob (`loadSnapshot` `:1610-1627`) overlaid with history and import-job events from tables (`:1628-1634`). Entity projections (`media_asset`, `subtitle_track`, `cue`, `saved_item`, …) are written on every save (`writeCandidate` `:1716-1721`) and never read by the product.
- `LocalStore.listMediaAssets()` and `SqliteLocalPersistence.listMediaAssets()`: same name, same shape, same concept, one live. Adjacent layers, same abstraction. The data-model doc names only `transcript_index` (`data-model-and-storage.md:140`) and `review_card_state` (REC-8, `:197`) as projections; nothing says where truth lives for the rest.

Design it twice:

- **A (recommended now):** declare it — `snapshot_json` + history tables are authoritative; entity projection tables are write-only derived indexes. Mark the 17 readers plus `hydrateStore`/`saveStore` as test-support (`@internal`, or relocate to `tests/helpers/`), and record the authority rule in `data-model-and-storage.md`.
- B: make tables authoritative and drop the blob. The "right" relational design, but it touches `revisionOf`, the restore-audit protocol, and needs migration v11 in an 1,800-line bug-magnet file (4 fixes, last 6 days ago). Not justified for a single-user store today.

Confidence: high on the facts, medium on A vs B. Would change my mind: snapshot size growing to where full-blob loads hurt, or a need for partial/paged loads.

### F4. Pass-throughs and misnamed wrappers that survived Lane B — low effort; appended to `lt-5lb.7`

| Symbol | Evidence | Verdict |
| --- | --- | --- |
| `LocalStore.put*` / `add*` return a `structuredClone` of the whole state (`localStore.ts:151-153` and 14 siblings) | no caller assigns the result (`rg "= [a-zA-Z._]*\.(put|add)[A-Z][a-zA-Z]*\(" apps packages tests` → 0) | full deep copy per write for nothing; return `void` |
| `ensureReviewCardForSavedItem` (`model.ts:3160-3162`) and the public `CaptureService.ensureCard` exception (`capture.ts:101`, ADR-0002 Outcome) | 0 call sites in `apps/`, `packages/`, `tests/` besides the delegate itself | the exception's sole justification is gone; retire the delegate, make `ensureCard` private |
| `ExportService.exportToFile(directory)` (`exportRestoreService.ts:60-64`) | writes nothing; returns a path string; 0 app callers, 2 test files | name promises durability it omits; rename (`plannedExportPath`) or delete |
| `extractDeviceId` (`exportRestoreService.ts:105-107`) | identity function, 0 callers | delete |
| `RestoreService.restore` (`:92-94`), `.validateManifest` / `.requireConfirmation` statics (`:96-102`) | pure forwards to domain functions; `restore` has 0 app callers | callers import the domain functions; keep `plan` / `preview` / `restoreWithReceipt` |
| `SavedOccurrenceService.snapshot()` (`savedOccurrenceService.ts:60-62`) | 0 callers | delete |
| `RestoreService.restoreWithReceipt` vs `SqliteLocalPersistence.commitRestore` | same confirmation checks twice (`exportRestoreService.ts:83-87` vs `sqliteLocalPersistence.ts:1777-1779`) | acceptable split (browser preview vs durable commit), but the check belongs in one place — `planLearnerRestore` or a domain `assertRestoreConfirmed(plan, confirmation)` |

### F5. Job-polling client: the abstraction exists but adjacent code does not use it — plan candidate 2, now five copies

`completedEmbeddedJob` (`model.ts:1957-1982`) is the generic create→poll→complete loop with injectable sleep. The three providers at `model.ts:2215-2364` each hand-roll the same loop (120/60 attempts, 1000 ms, same status branches, same deadline message); `apps/web/src/sourceAudioSnippet.ts:40-58` is a fifth with 100 × 20 ms. Plan §3 deferred this deliberately; recorded here because it has grown and the seed abstraction already exists. Suggested shape later: `runServiceJob(transport, kind, payload, opts): Promise<Record<string, unknown>>` in a `localServiceJobs.ts`; the three providers become ~10 lines each. The 8-line transport-error→typed-result mapping is also triplicated (`glossClient.ts:114-122`, `morphologyClient.ts:65-73`, `ankiExportClient.ts:13-22`); fine as is, one helper when F5 is done. Not filed as an issue; it is already plan candidate 2.

### F6. Package boundary is nominal — context for the above

21 relative imports `../../../packages/...` from `apps/` bypass the `@lingotorte/*` barrels (`model.ts:1-11`, `server.ts`), while `uiTypes.ts:73-79` names the same classes via `@lingotorte/storage`. Two spellings for one module means the boundary is not a boundary. Not a finding on its own; F1 (package cycle) and F3 (which interface is real) are symptoms. After F1 lands, a single-import-style rule becomes checkable by grep.

---

## 3. Suggested order

F1 → F4 → F2 → F3 → F5. F1 and F4 are mechanical and test-covered; F2 changes future change-cost most; F3 is a decision plus a visibility change; F5 is its own lane.

## 4. What was not found

No evidence that `model.ts`'s size (3,970 lines; 368 → 4,346 over four months; 50 commits in 90 days) is itself the problem. Most of it is long, sequential, UI-state-dependent functions that would get harder to read if split by line count. The leverage is in F2 (give views a real interface) and F5 (five copies of one loop), not a line-count target.

## 5. Evidence commands

```
rg "model\.store\." apps/web/src --glob '!apps/web/src/model.ts'            # 47 hits / 10 files
rg "persistence\.[a-zA-Z]*" apps/local-service/src/server.ts                # six distinct methods
rg "listAttemptsForCard|listAllAttempts|extractDeviceId|exportToFile|ensureReviewCardForSavedItem" apps packages tests
rg "@lingotorte/review" packages/storage/src ; rg "@lingotorte/storage" packages/review/src   # the cycle
git log --since=90.days --name-only --pretty=format: -- apps packages | sort | uniq -c | sort -rn | head
```

## 6. Filed follow-ons

Filed 2026-10-19 by `hermes-codearchitect` as children of `lt-5lb`:

| Finding | Issue | Type |
| --- | --- | --- |
| F1 PracticeService → packages/review, single FSRS path | `lt-5lb.8` | task |
| F2 occurrence-in-context read model; views stop reaching through `model.store` | `lt-5lb.9` | task |
| F3 SQLite authority decision; demote unused readers | `lt-5lb.10` | decision |
| F4 pass-through tidy-ups | comment appended to `lt-5lb.7` | — |

F5 is already plan candidate 2 and is not filed. A ready issue is not authorization; implementation requires scope recorded in `lt-dy6` or an exact-scope successor.
