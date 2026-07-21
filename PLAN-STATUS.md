# PLAN status — Lingotorte

Updated: `2026-07-19T14:30:00Z` (revalidation pass; the previous `Updated:` header said `2026-07-05T21:33:45Z` even though body sections were last edited at `be71520` on 2026-07-06 without refreshing it)

Status: **LDM4 B7 embedded subtitle extraction accepted local-only at `a7e8307` on `lingotorte/m1-daily-driver-polish`; primary checkout `main` deployed at `28c942a` (7 commits behind the accepted branch tip); no batch in flight since 2026-07-06.** See the "2026-07-19 revalidation" section — it supersedes stale claims in the older sections below, which are preserved as history.

## 2026-07-19 revalidation (supersedes stale claims below)

Reviewed against live git, the Kanban record, gate receipts under `docs/plan/autonomous-batches/`, and the running services. What actually happened after this file's last body edit (`be71520`, 2026-07-06 00:42 EDT):

1. **LDM3 B3 gate (`t_4e92a00c`) — Janusz chose "push and deploy locally, then move on to the next local batch"** (receipt commit `28c942a`, `docs/plan/autonomous-batches/20260706T053847Z-ldm3-b3-gate-decision-push-deploy-next-t_4e92a00c.md`):
   - Branch `lingotorte/m1-daily-driver-polish` was pushed to `origin` (`https://github.com/rzyns/lingotorte.git`) at `a8718bc`, then `28c942a` — the first remote push of this repo's work. `origin/main` was **not** updated (remains `eee1a5c`).
   - Primary checkout `/home/openclaw/workspace/lingotorte` (`main`) was fast-forwarded to `a8718bc` → `28c942a`; systemd user units `lingotorte-local-service.service` / `lingotorte-web.service` restarted and verified healthy.
   - The LDM4 B7 embedded-subtitle-extraction chain was materialized.
2. **LDM4 B7 (embedded subtitle extraction) — implemented, repaired, and accepted local-only** on `lingotorte/m1-daily-driver-polish` (worktree `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`):
   - `046cec7` LDM4-01 implementation → original review `t_eb8fe5ad` **BLOCK** → repair `3113ffa` (LDM4-01R: embedded subtitle draft semantics + `ffprobePath` fallback) → re-review `t_d89a812a` **PASS** → QA `t_16019a45` **PASS**.
   - Safety boundary review gained a B7 media-path-ownership decision row (`8061aaf`, `43afed0`).
   - Final human gate `t_53265d1e`: Janusz commented `accept` (2026-07-06T13:54Z), narrowly interpreted as **accept local only**; receipt `a7e8307` (`docs/plan/autonomous-batches/20260706T135641Z-ldm4-b7-gate-decision-accept-local-t_53265d1e.md`). No push/PR/deploy/next-batch was authorized. Bookkeeping `t_07105a53` reconciled the superseded original chain by comment.
   - Accepted change surface: `apps/local-service/src/server.ts`, `packages/local-transcription/src/index.ts`, `packages/subtitles/src/import.ts`, new `tests/core/b7EmbeddedSubtitleExtraction.test.ts`. **No `apps/web` changes — browser UI wiring for listing/extracting embedded tracks is not yet implemented.**
3. **Nothing has happened since 2026-07-06.** No LDM5 batch was created or authorized; no Kanban gate is pending.

### Current ground truth (verified 2026-07-19)

- `lingotorte/m1-daily-driver-polish` = `a7e8307` (accepted tip; ahead of `origin/lingotorte/m1-daily-driver-polish` = `28c942a` by 7; worktree clean).
- `main` (primary checkout, deployed) = `28c942a`; ahead of `origin/main` (`eee1a5c`) by 30; worktree clean.
- Services healthy today: `GET http://127.0.0.1:5174/api/health` ok; deployed schema version 7 (migrations 1..7 applied).
- `.env` exists locally and is untracked (env-only credential posture preserved).
- Kanban: `lingotorte` board (swarm v1) fully done/archived; the M1/LDM chains on the `default` board are complete. Superseded original B7 cards `t_eb8fe5ad` (BLOCK provenance), `t_07c307df`, `t_305e7cc5` remain `todo` with closure comments only — harmless; archive manually if board hygiene matters.

### Corrections to older sections of this file

- "No push to `origin/main` was performed; the swarm-v1 merge and B1 follow-up commits remain local-only" — **stale**: everything through `28c942a` was pushed to the remote *feature branch* on 2026-07-06 under gate `t_4e92a00c`. `origin/main` itself is still untouched.
- Backlog table B7 "Embedded subtitle extraction via ffmpeg/ffprobe still outstanding" — **stale**: implemented and accepted on the branch (service-side; UI wiring outstanding), not yet merged to `main`/deployed.
- "What's next" items 1 (B2) and 3 (B3) — **complete** (LDM2/LDM3, reviewed and accepted); item 2 (B4 live benchmark) remains deferred awaiting an exact owned media path or approved selection rule.
- Ahead-by-11 branch-posture numbers throughout — historical; see ground truth above.

### Resumption decisions (for Janusz)

1. ~~**Merge + deploy the accepted B7 work**~~ — **DONE 2026-07-19** (authorized in chat): `main` fast-forwarded through `bad4bd9`/`b74327c`/`d04d63a`, services restarted and verified healthy. The restart exposed a latent linuxbrew Node 26.5.0 upgrade breakage (extensionless TS imports + parameter properties unsupported in strip-only mode) that would have broken *any* restart since the upgrade; fixed forward in `b74327c` + `d04d63a` with full gates green (typecheck, 231 tests, build, privacy scan). Receipt: `docs/plan/autonomous-batches/20260719T144906Z-merge-deploy-receipt-b7-node26-cowork.md`.
2. **Push the branch update**: `origin/lingotorte/m1-daily-driver-polish` is at `28c942a`, now several commits behind; no push has been authorized since 2026-07-06.
3. **Pick the next batch**: B6's first source-media snippet slice is implemented locally on the current branch: cue-bounded owned-media WAV extraction, opaque loopback retrieval, 16-entry session LRU/early deletion, and microphone-free Practice audio recall. Review/QA/human acceptance, push, deploy, browser-only ranges, and saved-occurrence reuse remain outstanding. Other candidates include B7 browser UI wiring for embedded track listing/extraction and the B4 owned-media ASR benchmark if an exact clip or selection rule is provided (`DECISIONS.md` §5).
4. **Ops follow-up**: consider pinning Node or adding a service boot smoke to the runbook so brew upgrades can't silently strand the services again.

---

Previous status (2026-07-05/06, preserved as history): **Swarm v1 (B5 + B7 + B2/B3/B6 frontend) merged to main; autonomous decision record added.** B1 `export_job` projection/migration v6 and `provider_policy` projection/migration v7 are implemented locally as mutable projections. P6 audio-recall practice mode is implemented and committed. `DECISIONS.md` is now tracked and records the current human decisions for autonomous local development boundaries; check live git for the exact current HEAD after this status file's commit.

## Current scope and repository state

- Workspace/repo: `/home/openclaw/workspace/lingotorte`
- Git base before this B1 `provider_policy` follow-up: `be3d01e` (`docs: refresh export and media limitation notes`)
- Branch at DECISIONS wiring start: `main` at `311162c`, ahead of `origin/main` by 11 commits
- Worktree at DECISIONS wiring start: clean; exact current cleanliness should be checked with `git status --short`
- Current autonomous decision record: `DECISIONS.md` (tracked as of `311162c`) supplements `PLAN.md` and `docs/review/safety-privacy-boundary-review.md` for provider authority, B2 path semantics, B3 backup posture, B4 benchmark optionality, B6 snippet semantics, and B8/future gates.

## Swarm v1 — three-branch merge + synthesis

Three reviewed implementation lanes were merged into `main` via `--no-ff` merge commits, with two merge conflicts resolved during the B2/B3/B6 frontend merge (the B5 and B7 merges were conflict-free):

- `878176a` Merge `lingotorte/swarm-b5-morphology` (review t_5db9253b: PASS @ `bb86dac`)
- `55b6808` Merge `lingotorte/swarm-b7-subtitles` (review t_0945ff1f: PASS @ `36b8ced`)
- `5b844f9` Merge `lingotorte/swarm-b2b3b6-frontend` (review t_d218dec9 BLOCK → repair t_96877100 PASS @ `f96fd73`)

Conflict resolution (preserving functionality from both sides):

- `apps/web/src/app.ts` imports — union of B7's `applyTrackOffsetMs` and frontend's `clearLoopRange`. Both exports exist in `model.ts` and are used in `app.ts`.
- `tests/core/p3Adapters.test.ts` — took HEAD (B5). B5's new edge-case `describe` block plus B5's explicit Cześć-ambiguity assertions subsume the frontend's defensive lenient change to the older `expect(result.warnings).toHaveLength(0)` line.

Full validation passed on the merged result (see "Validation commands run" below). No push to `origin/main` was performed (local merge only, per task non-authorizations).

## Fable 5 Review — B1 remaining item scoped

**Session:** `7a1a6e11-7eee-48eb-bf6e-c9d8f42de699` (claude-fable-5, 2026-07-04)
**Model usage:** inputTokens: 7867, outputTokens: 9272, cacheReadInputTokens: 170709, costUSD: 1.84
**Full artifact:** `.claude/fable-review-B1-export-provider-policy.md`

**Two entities scoped as B1's remaining items:**

### `export_job` (implemented — migration v6)
10-column `export_job` table: `id`, `kind` ('learner-json-manifest'), `status` ('pending'|'running'|'completed'|'failed'), `started_at`, `completed_at`, `destination_kind` ('browser-download'|'file-system-access'), `destination_label` (filename only — never absolute path), `manifest_sha256`, `content_summary_json`, `error_code`. Mutable projection, no foreign keys, no append-only event stream until async export is needed. Follows B1 naming/migration/column conventions. Implemented as `create_export_job_projection` v6 with `LocalStoreSnapshot.exportJobs`, `LocalStore.putExportJob()`, SQLite `listExportJobs()`, and a focused snapshot/projection clearing test.

### `provider_policy` (implemented — migration v7)
8-column `provider_policy` table: `id`, `provider_id` ('elevenlabs-scribe'|'youtube-caption'), `enabled` (default false — absence means disabled, never seed enabled rows), `allowed_data_classes_json` (JSON), `requires_confirmation` (default true — preserves two-layer gate), `first_approved_at`, `created_at`, `updated_at`. Implemented as `create_provider_policy_projection` v7 with `LocalStoreSnapshot.providerPolicies`, `LocalStore.putProviderPolicy()`, SQLite `listProviderPolicies()`, and a focused snapshot/projection clearing test. No credentials in DB; env-only pattern preserved. Mutable, not append-only.

**Relationship:** independent — no FK between them. ElevenLabs/YouTube are import providers, not export providers.

**Explicit guesses to verify at implementation time:** exact `ExportIntegrity` field name for manifest digest; whether B3 save path exposes a filename as `destination_label`; `providerId` enum spelling.

## PLAN.md backlog status

| Slice | Goal | Status | Notes |
| --- | --- | --- | --- |
| B1 | Granular storage, migrations, auditability | **v6 export-job + v7 provider-policy follow-ups complete** | Forward-only migration ledger through v7; typed projections for current LocalStore entities including `export_job` and `provider_policy`; append-only review_event/import_job_event replay tables; empty-DB, migration, and projection tests; missing-media guard. Remaining deferred audit/event work: `export_job_event` only if async/media-copy export is designed, and `provider_policy_event` only if policy replay/audit becomes authoritative. |
| B2 | Durable media handle / File System Access persistence | **IndexedDB handle store + relink robustness implemented** | Browser File System Access handles are now persisted in a real IndexedDB-backed store (`browserHandleStore.ts`) wired into app startup. `restoreBrowserMediaHandle()` revalidates permission and recreates the object URL after reload/local-service hydration, with clear error states for missing handle, stale handle, permission denied, store unavailable, and object-URL creation failure. The relink placeholder surfaces the local-service absolute-path boundary. Focused vitest tests cover all stale/denied/restored/missing/unavailable edge cases. |
| B3 | Backup/export/restore polish | **Implemented (LDM3 B3 polish)** | Post-restore receipt with mode (initial/merge-update/replace-all), manifest integrity result, operation counts, acknowledged warnings, and no-media-copied note. Strengthened merge-vs-replace conflict preview wording (destructive, cannot be undone, unrelated records cleared). Clarified manifest integrity wording in preview and receipt (semantic sha256-per-record, not browser file write). Preserve lastSaveVerified for File System Access readback only. Privacy warnings, filename hygiene, and synthetic test fixtures preserved. |
| B4 | Local ASR dependency/model proof | **Complete — owned-media quality benchmark run 2026-07-21** | Python 3.12.3 ASR venv, faster-whisper 1.2.1, ffmpeg 8.1.2 proven 2026-07-04. Live tiny-vs-base quality benchmark run 2026-07-21 on an approved owned Polish clip (i7-12700KF, CPU/int8): tiny ~13× realtime / base ~8.5× realtime, both faster-than-realtime; base is materially cleaner on proper nouns/numerals (mean word prob 0.876 vs 0.795). **Recommendation: `base` int8 CPU as the Polish daily-use default, `tiny` as fast smoke/fallback.** Both remain draft-only pre-correction. Full receipt: `docs/dev/b4-asr-quality-benchmark-2026-07-21.md`. |
| B5 | Polish dictionary/morphology/translation quality | **Mostly complete (swarm v1)** | `morfeusz-ts` (BSD-2-Clause) vendored under `vendor/morfeusz-ts/`; `makeMorfeuszMorphologyAdapter()` wired into `resolveLocalAdapters`. Typed `Confidence` (probable/possible/unavailable) with values; unknown tokens → `confidencePossible(0.3)` + warning; POS-ambiguous → `confidencePossible(0.55)` + alternatives + ambiguity warning. Six new edge-case tests plus existing SGJP analyses. Translation/LLM explanation remains disabled-by-default opt-in. |
| B6 | Practice and progress polish | **Partially complete (swarm v1)** | Multiple-choice and sentence-builder practice modes implemented. Study cockpit shows saved/due/reviews/practice counts plus a streak/study-time widget derived from persisted `reviewEvents`/`practiceAttempts` via `studyMetrics()` → `computeStudyMetricsFromEvents` (recomputed on every read). Arbitrary word-span loop ranges wired through `toggleLoopRange`/`clearLoopRange` + `activeLoopRangeForSelection`. Clip/audio snippet generation still outstanding. |
| B7 | Subtitle ingest robustness and alignment tooling | **Mostly complete (swarm v1); embedded extraction accepted on branch (LDM4, 2026-07-06)** | VTT parsing (server + browser) plus ASS/SSA parsing (`parseAss`) with override-tag stripping and non-persisted style/position fields. Millisecond offset editor (`applyTrackOffsetMs` + `createOffsetCorrectedTranscriptVersion`) applies finite offset with zero clamp, ordering preservation, parent status preservation, and `timingUnverified` marker. Embedded subtitle track listing/extraction implemented service-side and accepted local-only at `a7e8307` (see 2026-07-19 revalidation); browser UI wiring outstanding. |
| B8 | Optional future gated lanes | Future | Anki export, pronunciation/shadowing, cloud sync, desktop/PWA packaging — all future, gated on separate approval. |

## Recent commits (from this session)

| Commit | Message |
| --- | --- |
| `5b844f9` | Merge lingotorte/swarm-b2b3b6-frontend: B2+B3+B6 frontend + review repair (t_d218dec9, t_96877100) |
| `55b6808` | Merge lingotorte/swarm-b7-subtitles: B7 ASS/SSA subtitle robustness + offset correction (t_0945ff1f) |
| `878176a` | Merge lingotorte/swarm-b5-morphology: B5 typed Confidence + Morfeusz ambiguity marking (t_5db9253b) |
| `f96fd73` | fix(frontend): B2+B3+B6 review blockers — vendor morfeusz build, persisted streak, clean packaging |
| `36b8ced` | B7: ASS/SSA parsing, offset/alignment editor, draft/correction preservation |
| `bb86dac` | feat(language): morfeusz morphology confidence/ambiguity warnings and edge-case tests |
| `66657b8` | feat(p6): audio-recall practice mode — P6 learner state, recording UI, submit flow |
| `243b18d` | docs: update PLAN.md reconciliation date and recent commits |
| `311162c` | Document Lingotorte autonomous decisions |

## Validation commands run

- `npm test -- --run tests/core/localPersistence.test.ts` — **16 passed** (focused RED→GREEN storage/projection test)
- `npm run typecheck` — **passed** (0 errors)
- `npm test -- --run` — **25 files passed; 194 passed, 4 skipped** (4 skipped are audio-recall tests requiring jsdom environment)
- `npm run test:no-network` — **2 files, 5 passed** (provider-disabled no-network harness)
- `npm run scan:privacy` — **ok: true, scannedFiles: 42**
- `npm run build` — **passed** (Vite build; existing morfeusz browser externalization warnings only)
- `python3 validate_final_bundle.py` — **errors: [], required_count: 16, manifest_count: 16, markdown_files: 1174**
- `git diff --check` — clean

## Audio-recall skip note

4 audio-recall tests are `describe.skip`'d in `tests/web/p6PracticeFrontend.test.ts` because the vitest `'node'` environment does not provide `navigator.mediaDevices.getUserMedia()` or `window.SpeechRecognition`. They require migrating `vitest.config.ts` to `environment: 'jsdom'` and adding `@jsdom/jsdom` for full BrowserAPI mocking. Filed as TODO(c.5) in the test file.

## What's next

> **Superseded 2026-07-19** — items 1 (B2) and 3 (B3) below were completed by LDM2/LDM3 on 2026-07-06; see the revalidation section at the top for the current resumption decisions.

Shortest ready path through the backlog:

1. **B2** — File System Access handle persistence: **implemented** — IndexedDB-backed handle store wired into app startup, `restoreBrowserMediaHandle()` revalidates permission and recreates object URLs with clear error states for all stale/denied/missing edge cases, relink placeholder surfaces the local-service absolute-path boundary. `DECISIONS.md` keeps browser handles for playback/relink identity while local-service jobs still require explicit absolute owned local media paths.
2. **B4** — Local ASR proof on real owned media: harness/runbook path is verified, while real-word-speed measurement, latency/quality report, and qualitative transcript assessment remain deferred. `DECISIONS.md` makes the live quality benchmark optional/non-blocking unless an exact owned media path or explicit approved local selection rule is available.
3. **B3** — Backup/export/restore polish beyond the current metadata-only manifest save/restore path, especially conflict review/rollback. `DECISIONS.md` keeps media-copy backup deferred behind explicit opt-in and forbids destructive Replace-all tests against Janusz's real learner state without fresh exact approval.

B5 (translation/LLM gate), B6 (source-media clip generation), B7 (embedded extraction), and B8 (future gated lanes) remain valid. `DECISIONS.md` clarifies that B6 snippets are owned source-media snippets, not provider/TTS audio by implication.

## Non-actions preserved

> **Correction 2026-07-19**: on 2026-07-06 gate `t_4e92a00c` explicitly authorized a branch push to `origin` (`lingotorte/m1-daily-driver-polish`) and a local systemd deploy; `origin/main` remains untouched and everything else below still holds.

- No public-facing writes, push/release/deploy/public exposure, DRM/circumvention, private/account-gated media access, automatic online media download, Lingopie proprietary content/API use, raw secret/provider request logging, or generated cache/model/media artifacts in git.
- Providers remain disabled by default; no-network tests cover disabled state.
- Live provider calls outside the narrow `DECISIONS.md` allow-list, model downloads outside already-approved/local-gated setup, AnkiConnect, cloud sync, microphone recording, and public sharing remain gated on explicit separate authorization.
- `DECISIONS.md` is tracked and should be read before autonomous worker launch.
- No push to `origin/main` was performed; the swarm-v1 merge and B1 follow-up commits remain local-only.
