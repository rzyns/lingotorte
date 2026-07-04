# PLAN status — Lingotorte

Updated: `2026-07-04T15:14:00Z`

Status: **B1 (granular storage/migrations/auditability) is complete.** All other slices (B2–B8) remain outstanding. P6 audio-recall practice mode is implemented and committed. The repo is 14 commits ahead of `origin/main`.

## Current scope and repository state

- Workspace/repo: `/home/openclaw/workspace/lingotorte`
- Git HEAD: `243b18d` (`docs: update PLAN.md reconciliation date and recent commits`)
- Branch: `main`, ahead of `origin/main` by 14 commits (including `66657b8` audio-recall P6 feature)
- Worktree: clean

## Fable 5 Review — B1 remaining item scoped

**Session:** `7a1a6e11-7eee-48eb-bf6e-c9d8f42de699` (claude-fable-5, 2026-07-04)
**Model usage:** inputTokens: 7867, outputTokens: 9272, cacheReadInputTokens: 170709, costUSD: 1.84
**Full artifact:** `.claude/fable-review-B1-export-provider-policy.md`

**Two entities scoped as B1's remaining items:**

### `export_job` (next — migration v6)
10-column `export_job` table: `id`, `kind` ('learner-json-manifest'), `status` ('pending'|'running'|'completed'|'failed'), `started_at`, `completed_at`, `destination_kind` ('browser-download'|'file-system-access'), `destination_label` (filename only — never absolute path), `manifest_sha256`, `content_summary_json`, `error_code`. Mutable projection, no foreign keys, no append-only event stream until async export is needed. Follows B1 naming/migration/column conventions.

### `provider_policy` (follow-on — migration v7)
8-column `provider_policy` table: `id`, `provider_id` ('elevenlabs-scribe'|'youtube-caption'), `enabled` (default false — absence means disabled, never seed enabled rows), `allowed_data_classes` (JSON), `requires_confirmation` (default true — preserves two-layer gate), `first_approved_at`, `created_at`, `updated_at`. No credentials in DB; env-only pattern preserved. Mutable, not append-only.

**Relationship:** independent — no FK between them. ElevenLabs/YouTube are import providers, not export providers.

**Explicit guesses to verify at implementation time:** exact `ExportIntegrity` field name for manifest digest; whether B3 save path exposes a filename as `destination_label`; `providerId` enum spelling.

## PLAN.md backlog status

| Slice | Goal | Status | Notes |
| --- | --- | --- | --- |
| B1 | Granular storage, migrations, auditability | **Complete** | Forward-only migration ledger through v5; typed projections for all current LocalStore entities; append-only review_event/import_job_event replay tables; empty-DB and migration tests; missing-media guard. Remaining: export-job/provider-policy projections gated on future entity creation. |
| B2 | Durable media handle / File System Access persistence | Not started | Browser File System Access handle persistence across restarts. First slice partially done: handle-based import UI, transient object-URL playback, relink prompt on permission loss. Full handle revalidation after restart still outstanding. |
| B3 | Backup/export/restore polish | Not started | File System Access save path, replace vs. merge UX, integrity verification, metadata-only default, privacy warnings. |
| B4 | Local ASR dependency/model proof | Not started | Python 3.12.3 venv, faster-whisper 1.2.1, ffmpeg 8.1.2, tiny model (CPU/int8) proven on 2026-07-04. Full dependency receipts and runbook setup recorded in `docs/dev/local-runbook.md`. Real-word-speed proof on owned media still outstanding. |
| B5 | Polish dictionary/morphology/translation quality | Not started | `morfeusz-ts` (BSD-2-Clause) vendored under `vendor/morfeusz-ts/`; `makeMorfeuszMorphologyAdapter()` wired into `resolveLocalAdapters`; test in `tests/core/p3Adapters.test.ts` verifies real SGJP analyses for "Cześć", "lokalny", "test". Real daily-study quality still outstanding. |
| B6 | Practice and progress polish | Partially done | Multiple-choice practice mode with distractor generation. Audio-recall practice mode implemented (P6 commit `66657b8`). Study cockpit status rail shows due/saved/review/practice counts. Arbitrary phrase/range looping controls exist but UI not wired to word-span selection. |
| B7 | Subtitle ingest robustness and alignment tooling | Partially done | VTT parsing supported both server-side and browser-side. ASS parsing, embedded subtitle extraction, offset/alignment editor still outstanding. |
| B8 | Optional future gated lanes | Future | Anki export, pronunciation/shadowing, cloud sync, desktop/PWA packaging — all future, gated on separate approval. |

## Recent commits (from this session)

| Commit | Message |
| --- | --- |
| `66657b8` | feat(p6): audio-recall practice mode — P6 learner state, recording UI, submit flow |
| `243b18d` | docs: update PLAN.md reconciliation date and recent commits |

## Validation commands run

- `npm test -- --run` — **24 passed, 176 passed | 4 skipped** (4 skipped are audio-recall tests requiring jsdom environment)
- `npm run typecheck` — **0 errors**
- `npm run test:no-network` — **2 passed, 5 passed** (provider-disabled no-network harness)
- `npm run scan:privacy` — **ok: true, scannedFiles: 42**
- `python3 validate_final_bundle.py` — **errors: [], required_count: 16, manifest_count: 16**
- `git diff --check` — clean

## Audio-recall skip note

4 audio-recall tests are `describe.skip`'d in `tests/web/p6PracticeFrontend.test.ts` because the vitest `'node'` environment does not provide `navigator.mediaDevices.getUserMedia()` or `window.SpeechRecognition`. They require migrating `vitest.config.ts` to `environment: 'jsdom'` and adding `@jsdom/jsdom` for full BrowserAPI mocking. Filed as TODO(c.5) in the test file.

## What's next

Shortest ready path through the backlog:

1. **B2** — File System Access handle persistence: revalidate browser-granted handles on reload, wire relink prompt to actual permission state, keep explicit absolute-path ASR input as separate concern.
2. **B3** — Export/restore polish: File System Access save path with integrity verification, replace-vs-merge confirmation checkboxes, metadata-only default.
3. **B4** — Local ASR proof on real owned media: real-word-speed measurement, latency/quality report, scratch cleanup verification.

B5 (morfeusz-ts quality), B6 (richer practice modes), B7 (VTT/ASS/offset editor) are all valid parallel tracks but have more open design questions.

## Non-actions preserved

- No public-facing writes, push/release/deploy/public exposure, DRM/circumvention, private/account-gated media access, automatic online media download, Lingopie proprietary content/API use, raw secret/provider request logging, or generated cache/model/media artifacts in git.
- Providers remain disabled by default; no-network tests cover disabled state.
- Live provider calls, model downloads, AnkiConnect, cloud sync, microphone recording, and public sharing remain gated on explicit separate authorization.
- `.understand-anything/` untracked generated artifacts were not touched.
