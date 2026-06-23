# Lingotorte Live Local Usability Plan

Status: current routing/status plan for taking Lingotorte from the implemented local prototype to a polished daily-driver local app for Janusz's own media. This file is the handoff entry point for future `/goal` runs; older planning bundles are design/reference sources, not current implementation status.

Last reconciled: 2026-06-23.
Current branch posture at reconciliation: `main...origin/main [ahead 1]`.
Known unrelated local dirt at reconciliation: `.gitignore` modified and `.understand-anything/` untracked; leave those out of Lingotorte plan/status commits unless Janusz separately scopes them.

Recent relevant commits:

- `acfe67b Make subtitle overlay windowed and clickable`
- `7b17e76 Document Lingotorte systemd user services`
- `56bb804 Wire ElevenLabs Scribe local-service path`
- `b0bd6f1 Allow media-only local imports`
- `fbb13f2 feat: run local transcription through loopback service`
- `f692d94 feat: add loopback local service sync`

## Source artifacts and status authority

| Artifact | Current role |
|---|---|
| `PLAN.md` | Current routing/status artifact and short backlog. Treat this as the first stop for what remains. |
| `README.md` | Current quick start, local transcription package summary, public-caption/local-service boundaries, and reading order. |
| `docs/dev/local-runbook.md` | Current local runbook, one-command/systemd local start, local-service/ASR/public-caption smoke checklist, and known limitations. |
| `docs/dev/v1-local-acceptance.md` | V1 acceptance baseline and deferred cleanup ledger. Some details are older, but the limitation/deferred tables remain useful. |
| `docs/plan/v3-transcript-generation-correction-plan.md` | Governing transcript-generation/correction design lane. Many slices are now implemented; use this for semantics and gates, not status. |
| `docs/architecture/data-model-and-storage.md` | Target granular SQLite/data/audit/export model. Current implementation has snapshot SQLite only, so this remains backlog evidence. |
| `docs/review/safety-privacy-boundary-review.md` | Binding safety/privacy/legal boundary. Not historical. Preserve these gates. |
| `docs/planning/` | Historical parent planning/reference bundle. Use for rationale, acceptance criteria, and backlog seeds only after checking current code/docs. |
| `docs/final/` | Historical final fan-in bundle from the original planning mission. Use for synthesis/background, not current status. |
| `packages/storage/src/localStore.ts` and `packages/storage/src/sqliteLocalPersistence.ts` | Typed in-memory store plus SQLite snapshot persistence adapter used by the loopback service. |
| `apps/local-service/src/server.ts` | Loopback service for health/status, SQLite state save/load, scratch cleanup, job create/status/cancel, local ASR, ElevenLabs, and gated public YouTube caption jobs. |
| `packages/local-transcription/src/index.ts` | Node-side ffmpeg/faster-whisper/WhisperX/ElevenLabs adapter seams. |
| `scripts/faster_whisper_transcribe.py` | Dependency-lazy faster-whisper CLI entrypoint. |
| `scripts/whisperx_align.py` | Dependency-lazy WhisperX-style forced-alignment CLI entrypoint. |
| `apps/web/src/app.ts` and `apps/web/src/model.ts` | Browser UI/model surface: local file import, local service connect/save/autosave, transcript lifecycle jobs, correction/approval UI, source comparison, timed words, clickable subtitle overlay words, local Polish adapter integration, review/practice/export/import. |

## How to read older planning docs now

The older `docs/planning/` and `docs/final/` artifacts were written before the current implementation existed. They intentionally remain in the repo because they contain useful product, evidence, safety, and acceptance rationale. However:

1. Do not treat their future-tense milestone lists as current status.
2. Check `PLAN.md`, `README.md`, `docs/dev/local-runbook.md`, recent commits, and targeted code/tests before marking an item unfinished.
3. Treat `docs/review/safety-privacy-boundary-review.md` and the safety sections copied into planning docs as still binding.
4. Treat provider enablement, downloads, sync, AnkiConnect, deployment, push/release, public sharing, and live Lingopie inspection as separate human-gated actions, not implied by any plan text.

## Current-state snapshot

### Implemented baseline

Lingotorte is locally runnable and test-backed for the core private/local study loop:

- `npm run local` starts the loopback local service and Vite UI together.
- Split-terminal `npm run dev:local-service` + `npm run dev -- --host 127.0.0.1` remains available for debugging.
- Systemd user units can run the local service/UI as `lingotorte.target`, `lingotorte-local-service.service`, and `lingotorte-web.service`.
- Browser Library UI supports:
  - synthetic fixture load;
  - local media file input;
  - optional target `.srt` input;
  - optional native `.srt` input;
  - media-only import for later ASR draft generation.
- Local player/study UI supports:
  - local video/player shell;
  - dual subtitle projection;
  - windowed subtitle overlay that does not cover the video with whole long cues;
  - clickable overlay words that save lexemes through the source-backed saved occurrence path;
  - transcript cue list, seeking, active cue highlight, cue loop, playback speed, and keyboard shortcuts (`[`, `]`, `R`, `,`, `.`);
  - transcript token preview and timed-word click-to-seek when word timings exist;
  - source-backed save word/phrase/sentence flows;
  - timing-backed saved occurrence anchors for timed words;
  - My Vocab / My Sentences;
  - FSRS-backed review cards/events;
  - basic practice attempts;
  - browser JSON export/import with privacy warnings and merge/update restore preview.
- Loopback local service supports:
  - health/status endpoints;
  - SQLite snapshot save/load;
  - scratch cleanup;
  - job create/status/cancel;
  - local transcription jobs;
  - ElevenLabs Scribe jobs behind service/provider gates;
  - public YouTube caption metadata jobs behind service/public-read gates;
  - redacted status/job summaries for local paths/secrets.
- Transcript lifecycle supports:
  - draft/correction/approval states;
  - editable cue text/timing;
  - word-timing correction;
  - cue split/merge;
  - source comparison;
  - immutable corrected transcript versions;
  - local ASR draft import through the loopback service;
  - gated public YouTube caption draft import through the loopback service;
  - explicit-opt-in ElevenLabs Scribe v2 draft import through the loopback service;
  - first-class transcript word timing entities;
  - approved-track gate before default learner-state saves.
- Polish language support includes local/offline tokenization plus heuristic lemma/POS/morphology suitable for the initial loop.

### Implemented behind explicit gates or local dependencies

- Real ffmpeg audio extraction seam and local-service job invocation.
- Local faster-whisper transcription seam and dependency-lazy Python entrypoint.
- WhisperX-style forced word-alignment seam and dependency-lazy Python entrypoint.
- ElevenLabs Scribe v2 explicit-opt-in cloud STT path; not a default UI path and not usable without service env/provider consent.
- Public YouTube timedtext caption read path; requires UI public-read authorization and service env `LINGOTORTE_ALLOW_ONLINE_PROVIDERS=true`.
- `yt-dlp` command generation only; no auto-execution.
- Systemd user service operation is local/loopback only and not a deployment/public exposure.

### Implemented but intentionally rough

These work today as local prototype/product slices, but are not the final daily-driver shape:

- SQLite persistence is a snapshot store, not the granular schema/migration/audit/conflict model in the architecture docs.
- Browser `blob:` media handles are session-scoped; after restart, saved metadata can persist but playback/local ASR may require reselecting the owned media file or pasting an absolute local path.
- Export/import is a browser JSON manifest/download plus merge/update restore path; it is not yet a full backup/restore product.
- Practice is basic and local; richer game-like practice/progress views remain future work.
- Polish language support is heuristic/local; richer dictionary/morphology/translation/explanation quality remains future work.
- Subtitle import is still centered on SRT/JSON/local browser inputs; VTT/ASS/embedded subtitle robustness and offset tooling remain future work.

## Current short backlog

Work below is already planned or deferred in older docs and remains legitimately unfinished after current implementation checks. Sequence old backlog before net-new feature ideas unless Janusz reprioritizes.

### B1 — Granular storage, migrations, and auditability

Goal: replace/augment snapshot SQLite with typed durable tables, migrations, and audit/replay surfaces where they matter.

Scope:

- Forward-only migration ledger.
- Durable tables/projections for media, subtitle tracks/cues, word timings, saved items, saved occurrences, review cards/states/events, practice attempts, provider/job/export metadata.
- Append-only review/import/provider/export events where useful.
- Round-trip tests from empty DB and at least one migration test.
- Clear source-missing/broken-media behavior without silently deleting learner history.

Not in scope without fresh approval: cloud sync or destructive data cleanup.

### B2 — Durable media handle / native path story

Goal: make restart/reload behavior feel like a local app rather than a browser object-URL prototype.

Scope:

- Decide whether the next step is user-chosen persistent file handles, a native/Tauri/desktop bridge, or a better local-service absolute-path workflow.
- Preserve privacy: no implicit media copies, no protected-stream capture, no browser credential/cookie paths.
- Improve UI affordances for reselecting or relinking owned local media after restart.
- Keep local-service ASR path explicit about absolute local paths.

### B3 — Backup/export/restore polish

Goal: turn the manifest preview/download into an intentional local backup/export product.

Scope:

- User-chosen export/download/write path story.
- Metadata-only backup first; optional media-copy backup only behind explicit opt-in.
- Restore conflict UX, full replace vs merge/update decision, and readback/integrity verification.
- Preserve privacy warnings for cue text, notes, media refs, review history, and optional media copies.
- Keep AnkiConnect/cloud sync out of scope unless separately authorized.

### B4 — Local ASR dependency/model proof

Goal: prove the local ffmpeg/faster-whisper/WhisperX path on this machine with real dependencies when Janusz authorizes the model/dependency setup.

Scope:

- Record Python/uv environment, ffmpeg, model, license/cache location, command receipts, latency, and output quality notes.
- Keep model/cache/scratch artifacts out of git.
- Add or update runbook setup instructions based on actual receipt.
- Do not download models or install heavyweight dependencies silently.

### B5 — Polish dictionary/morphology/translation quality

Goal: move beyond heuristic Polish analysis for serious daily study.

Scope:

- Evaluate local/offline dictionary and morphology sources with license/provenance checks.
- Return typed available/unavailable/error states, not loose provider blobs.
- Preserve online translation/LLM explanation as disabled-by-default opt-in gates.
- Add fixtures/tests for Polish samples and clear warnings for low-confidence analysis.

### B6 — Practice and progress polish

Goal: improve the learner product loop after saved/review basics.

Scope:

- Richer local practice modes: meaning quiz, match/context/audio recall, sentence builder, and better prompt/reveal feedback.
- Progress widgets derived from local events: due count, saved count, attempt history, and optional streak/study-time once semantics are clear.
- Phrase/range looping from arbitrary word spans where word timings exist.
- Clip/audio snippet generation only from owned local media and with cache cleanup.

### B7 — Subtitle ingest robustness and alignment tooling

Goal: broaden local subtitle/transcript input beyond the current SRT/JSON-centered path.

Scope:

- VTT and ASS parsing or well-scoped dependency adoption after provenance review.
- Embedded subtitle extraction via local ffmpeg/ffprobe where safe.
- Offset/alignment editor and target/native alignment confidence UI.
- Preserve draft/correction/approval semantics for generated/imported tracks.

### B8 — Optional future gated lanes

These remain planned/reference ideas, not current default work:

- Anki `.apkg` or richer export format; AnkiConnect remains a separate mutation gate.
- Pronunciation/shadowing with explicit microphone/privacy handling.
- Cloud sync only after a separate threat model and authorization.
- Desktop/mobile/PWA packaging if the local-file/daily-use story warrants it.
- MAI-Transcribe or other provider benchmark only after timestamp-output spike plan and provider consent.

## Mapping from old workstreams to current status

| Old workstream | Current status | Remaining route |
|---|---|---|
| WS0 — plan/status hygiene | This reconciliation pass refreshes status and marks old planning bundles as historical/reference. | Keep docs current after major implementation commits. |
| WS1 — durable local persistence | Partially implemented as SQLite snapshot save/load/autosave. | B1, B2, B3. |
| WS2 — loopback local service boundary | Implemented baseline: health/status/state/jobs/cancel/cleanup, loopback-only, redacted status. | Maintain safety tests as service grows. |
| WS3 — real transcription job integration | Implemented service/UI seams for local ASR, ElevenLabs, and public captions. | B4 for real local dependency proof; live ElevenLabs only by explicit consent. |
| WS4 — transcript correction editor MVP | Implemented baseline: correction, split/merge, word timing edits, source comparison, immutable corrected versions, approval gate. | Polish UX as issues arise; preserve approved-track gate. |
| WS5 — word-timing-powered learner UX | Mostly implemented for timed words, click-to-seek/save anchors, and overlay click-to-vocab. | B6 for arbitrary phrase/range looping and deeper practice integration. |
| WS6 — Polish/local language adapter quality | Partially implemented with heuristic local morphology. | B5. |
| WS7 — live YouTube caption read path | Implemented as gated public-caption metadata read; no media download. | Keep explicit public-read/service gate; no auto-download. |
| WS8 — packaging, backup/restore, live acceptance | Partially implemented: one-command local start, systemd units, browser export/import, local smokes. | B2, B3, B4, plus future packaging only if warranted. |

## Non-authorizations / hard boundaries

This plan and the older planning docs do **not** authorize:

- public-facing writes to non-owned resources;
- upstream PRs/issues/comments, public posts, package publication, wiki edits, hosted deployments, or other public mutations;
- push, release, public deployment, or service exposure;
- DRM circumvention, protected stream capture, credential/cookie extraction, browser credential path use, or automatic online media download;
- private/account-gated YouTube or other media access without an exact separate source/credential approval;
- Lingopie proprietary media/subtitles/screenshots/private API payloads/account data;
- committing secrets, raw provider request bodies, model caches, generated media/audio/transcript scratch artifacts, or private local absolute paths in default exports;
- live provider calls, model downloads, AnkiConnect, cloud sync, microphone recording, or public sharing without explicit fresh authorization for the exact action.

## Validation gates for docs/status changes

For this reconciliation slice:

```bash
git diff --check
python3 validate_final_bundle.py
git diff --name-status
git diff --stat
```

For future implementation slices, run focused tests plus relevant full gates from the runbook, commonly:

```bash
npm run typecheck
npm run test:no-network
npm run scan:privacy
npm test
npm run build
python3 validate_final_bundle.py
git diff --check
```

Also run local service health/browser smoke for UI/service changes, and live local ASR or provider smokes only when the dependency/provider gate has been explicitly authorized.

## Current copy-paste `/goal` prompt

```text
Complete the next approved Lingotorte backlog slice from PLAN.md.

Workspace/repo: /home/openclaw/workspace/lingotorte
Primary plan artifact: PLAN.md
Current source docs: README.md, docs/dev/local-runbook.md, docs/dev/v1-local-acceptance.md, docs/review/safety-privacy-boundary-review.md, docs/architecture/data-model-and-storage.md, docs/plan/v3-transcript-generation-correction-plan.md.
Historical/reference planning docs: docs/planning/ and docs/final/. Use them for rationale/backlog evidence, but verify current code/docs before treating a listed item as unfinished.

Objective:
Implement one explicitly approved current backlog slice, preserving Lingotorte's local-first/privacy boundaries. Current backlog slices are B1 storage/migrations/auditability, B2 durable media handle/native path story, B3 backup/export/restore polish, B4 local ASR dependency/model proof, B5 Polish dictionary/morphology/translation quality, B6 practice/progress polish, B7 subtitle ingest robustness/alignment tooling, and B8 optional future gated lanes.

Current known state:
- Core local loop is implemented and locally runnable.
- Loopback service supports health/status/state/jobs/cancel/cleanup, local ASR, ElevenLabs Scribe behind gates, and public YouTube caption reads behind gates.
- Transcript lifecycle has draft/correction/approval, split/merge, word timing edits, source comparison, immutable corrected versions, and approved-track learner-save gate.
- Subtitle overlay is windowed and clickable; overlay words save lexeme occurrences through the approved source-backed path.
- SQLite persistence is snapshot-oriented and remains the main storage/durability gap.
- Browser blob media handles remain session-scoped and may need reselecting after restart.
- Export/import works as browser JSON manifest download/paste+merge, not full backup/restore.
- Polish analysis is useful but heuristic/local.
- Provider calls, model downloads, sync, AnkiConnect, microphone recording, and public actions remain gated.

Hard boundaries:
- No public-facing writes, push/release/deploy/public exposure, DRM/circumvention, private/account-gated media access, automatic online media download, Lingopie proprietary content/API use, raw secret/provider request logging, or generated cache/model/media artifacts in git.
- Keep providers disabled by default and covered by no-network tests.
- Treat live provider calls/model downloads/microphone/sync/AnkiConnect as separate explicit approvals.

Completion contract:
Implement only the approved slice, run focused and relevant full validation, update docs if behavior/status changes, create exact-scope local commits, and report commands/results, remaining blockers, and preserved non-authorizations.
```
