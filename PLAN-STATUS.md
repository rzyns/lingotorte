# PLAN status — Lingotorte

Updated: `2026-07-05T19:08:23Z`

Status: **Swarm v1 (B5 + B7 + B2/B3/B6 frontend) merged to main; autonomous decision record added.** B1 `export_job` projection/migration v6 and `provider_policy` projection/migration v7 are implemented locally as mutable projections. P6 audio-recall practice mode is implemented and committed. `DECISIONS.md` is now tracked and records the current human decisions for autonomous local development boundaries; check live git for the exact current HEAD after this status file's commit.

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
| B2 | Durable media handle / File System Access persistence | Partially done | Browser File System Access handle persistence across restarts. First slice partially done: handle-based import UI, transient object-URL playback, relink prompt on permission loss. Full handle revalidation after restart still outstanding. |
| B3 | Backup/export/restore polish | Partially done | File System Access save path, replace vs. merge UX, integrity verification, metadata-only default, privacy warnings. |
| B4 | Local ASR dependency/model proof | Not started | Python 3.12.3 venv, faster-whisper 1.2.1, ffmpeg 8.1.2, tiny model (CPU/int8) proven on 2026-07-04. Full dependency receipts and runbook setup recorded in `docs/dev/local-runbook.md`. Real-word-speed proof on owned media still outstanding. |
| B5 | Polish dictionary/morphology/translation quality | **Mostly complete (swarm v1)** | `morfeusz-ts` (BSD-2-Clause) vendored under `vendor/morfeusz-ts/`; `makeMorfeuszMorphologyAdapter()` wired into `resolveLocalAdapters`. Typed `Confidence` (probable/possible/unavailable) with values; unknown tokens → `confidencePossible(0.3)` + warning; POS-ambiguous → `confidencePossible(0.55)` + alternatives + ambiguity warning. Six new edge-case tests plus existing SGJP analyses. Translation/LLM explanation remains disabled-by-default opt-in. |
| B6 | Practice and progress polish | **Partially complete (swarm v1)** | Multiple-choice and sentence-builder practice modes implemented. Study cockpit shows saved/due/reviews/practice counts plus a streak/study-time widget derived from persisted `reviewEvents`/`practiceAttempts` via `studyMetrics()` → `computeStudyMetricsFromEvents` (recomputed on every read). Arbitrary word-span loop ranges wired through `toggleLoopRange`/`clearLoopRange` + `activeLoopRangeForSelection`. Clip/audio snippet generation still outstanding. |
| B7 | Subtitle ingest robustness and alignment tooling | **Mostly complete (swarm v1)** | VTT parsing (server + browser) plus ASS/SSA parsing (`parseAss`) with override-tag stripping and non-persisted style/position fields. Millisecond offset editor (`applyTrackOffsetMs` + `createOffsetCorrectedTranscriptVersion`) applies finite offset with zero clamp, ordering preservation, parent status preservation, and `timingUnverified` marker. Embedded subtitle extraction via ffmpeg/ffprobe still outstanding. |
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

Shortest ready path through the backlog:

1. **B2** — File System Access handle persistence: revalidate browser-granted handles on reload, wire relink prompt to actual permission state. `DECISIONS.md` keeps browser handles for playback/relink identity while local-service jobs still require explicit absolute owned local media paths.
2. **B4** — Local ASR proof on real owned media: real-word-speed measurement, latency/quality report, scratch cleanup verification. `DECISIONS.md` makes this optional/non-blocking unless an exact owned media path or explicit approved local selection rule is available.
3. **B3** — Backup/export/restore polish beyond the current metadata-only manifest save/restore path, especially conflict review/rollback. `DECISIONS.md` keeps media-copy backup deferred behind explicit opt-in and forbids destructive Replace-all tests against Janusz's real learner state without fresh exact approval.

B5 (translation/LLM gate), B6 (source-media clip generation), B7 (embedded extraction), and B8 (future gated lanes) remain valid. `DECISIONS.md` clarifies that B6 snippets are owned source-media snippets, not provider/TTS audio by implication.

## Non-actions preserved

- No public-facing writes, push/release/deploy/public exposure, DRM/circumvention, private/account-gated media access, automatic online media download, Lingopie proprietary content/API use, raw secret/provider request logging, or generated cache/model/media artifacts in git.
- Providers remain disabled by default; no-network tests cover disabled state.
- Live provider calls outside the narrow `DECISIONS.md` allow-list, model downloads outside already-approved/local-gated setup, AnkiConnect, cloud sync, microphone recording, and public sharing remain gated on explicit separate authorization.
- `DECISIONS.md` is tracked and should be read before autonomous worker launch.
- No push to `origin/main` was performed; the swarm-v1 merge and B1 follow-up commits remain local-only.
