# Lingotorte Live Local Usability Plan

Status: current routing plan for taking Lingotorte from a test-backed local prototype to a live, locally usable app for Janusz's own media. This file is the handoff entry point for future `/goal` runs; detailed source artifacts remain authoritative where noted.

Last reconciled: 2026-06-22.
Current branch posture at reconciliation: `main...origin/main [ahead 4]`.
Recent relevant commits:

- `43a4801 Implement local transcription pipeline adapters`
- `b5f0063 Implement ElevenLabs transcript draft seam`
- `db0b679 docs: codify ElevenLabs-first transcript plan`
- `9f90839 feat: implement transcript lifecycle draft approval`
- `724158e docs: plan transcript generation correction lane`

## Source artifacts

| Artifact | Role |
|---|---|
| `README.md` | Current quick start, reading order, local transcription package summary, global boundaries. |
| `docs/dev/local-runbook.md` | Current local runbook and smoke checklist. Has minor drift: it still says arbitrary local file pickers are not exposed even though the Library UI now has local media/subtitle file inputs. |
| `docs/dev/v1-local-acceptance.md` | V1 acceptance baseline and older limitations. Also has drift around local file import readiness. |
| `docs/plan/v3-transcript-generation-correction-plan.md` | Governing transcript-generation/correction plan: YouTube captions, ElevenLabs Scribe v2, local ASR, word timings, `yt-dlp` command-only boundary. |
| `docs/architecture/data-model-and-storage.md` | Data model/storage direction, including SQLite/migration/audit/export expectations. |
| `docs/review/safety-privacy-boundary-review.md` | Binding safety/privacy/legal boundary. |
| `packages/storage/src/localStore.ts` | Current in-memory store; durable persistence is not implemented yet. |
| `packages/local-transcription/src/index.ts` | Node-side ffmpeg/faster-whisper/WhisperX/ElevenLabs adapter seams. |
| `scripts/faster_whisper_transcribe.py` | Dependency-lazy faster-whisper CLI entrypoint. |
| `scripts/whisperx_align.py` | Dependency-lazy WhisperX-style forced-alignment CLI entrypoint. |
| `apps/web/src/app.ts` and `apps/web/src/model.ts` | Current browser UI/model surface, including local file import, fake transcript lifecycle controls, and draft/approval semantics. |

## Current-state snapshot

### Already locally runnable

- `npm run dev -- --host 127.0.0.1` serves the app on loopback.
- The dev server was verified reachable at `http://127.0.0.1:5173/`.
- Browser Library UI exposes:
  - synthetic fixture load;
  - local media file input;
  - target `.srt` input;
  - optional native `.srt` input.
- Existing tested local flows include:
  - local video/player shell;
  - dual subtitle projection;
  - transcript cue list, seeking, cue highlight, cue loop, playback speed;
  - transcript token preview;
  - source-backed save word/phrase/sentence flows;
  - My Vocab / My Sentences;
  - FSRS-backed review cards/events;
  - practice attempts;
  - local export/import manifest flow;
  - transcript draft/correction/approval lifecycle;
  - first-class transcript word timing entities.

### Implemented but not yet fully integrated into live UI/service flow

- Real ffmpeg audio extraction seam.
- Local faster-whisper transcription seam.
- WhisperX-style forced word-alignment seam.
- ElevenLabs Scribe v2 explicit-opt-in cloud STT seam.
- `yt-dlp` command generation only; no auto-execution.

### Primary blockers to daily local usability

1. Learner/media/transcript state is still held by an in-memory `LocalStore`; reload loses work unless export/import is used manually.
2. There is no durable local service boundary yet for SQLite, filesystem, ffmpeg, Python STT/alignment, job progress, cancellation, and cache cleanup.
3. Real transcription adapters are Node/Python seams, not wired into browser UI as live jobs.
4. Transcript correction UI is minimal; it lacks timing edit, split/merge, word-timing inspection/correction, source comparison, and keyboard-first editing.
5. Stored word timings are not yet used deeply in transcript interactions, phrase loops, or saved-occurrence anchors.
6. Polish/language adapters are still shallow; whitespace tokenization and fixture dictionary behavior are not enough for serious daily study.
7. YouTube caption import remains fake/local-provider backed; live public caption reads are not implemented.
8. Packaging remains a dev-server workflow rather than a one-command local app/service setup.
9. Export/import works as a manifest flow but is not yet a robust backup/restore story.

## Authorizations for the `/goal` implementation run

Janusz authorizes agents executing this plan to complete the local-live Lingotorte implementation end to end, with the following scope.

### Authorized local/repo actions

- Inspect, edit, create, delete, and refactor files in `/home/openclaw/workspace/lingotorte` as needed for this plan.
- Add or modify source, tests, docs, scripts, package manifests, lockfiles, local service code, database migrations, fixtures, and runbooks.
- Make architectural/design decisions necessary to complete the plan, provided they preserve the local-first/product boundaries below.
- Run package-manager operations needed to implement and verify the work, including networked installs when required and recorded.
- Add dependencies when justified by the plan; prefer `uv` for Python workflows and keep dependency/model setup reproducible.
- Create local git commits as durable milestones after verified slices.
- Start, stop, and restart local WSL processes/services required for development and smoke testing, including loopback-only local web/API services.
- Use local files and directories in WSL and Windows-mounted paths for owned test media, caches, scratch artifacts, and local acceptance evidence.
- Use subagents/delegated agents for bounded implementation, review, debugging, and verification work.

### Authorized local service / model / media actions

- Implement a loopback-only local service/API for Lingotorte.
- Implement durable local persistence, preferably SQLite-backed unless a measured implementation finding justifies another local-first option.
- Run `ffmpeg`/`ffprobe` and Python helper scripts against local/owned/synthetic media.
- Install and run local STT/alignment dependencies such as faster-whisper and WhisperX where feasible.
- Download local model weights needed for the approved local STT/alignment path, after recording model/license/cache location and keeping generated/cache artifacts out of git.
- Generate temporary audio/transcript/alignment artifacts under an explicit scratch/cache directory and implement cleanup rules.
- Use Janusz-provided or repo synthetic media for live validation; do not use Lingopie proprietary media/subtitles/screenshots or private API payloads.

### Authorized external/API actions

- Perform public-internet reads needed for package installation, documentation lookup, dependency verification, and public YouTube caption metadata reads.
- Use ElevenLabs Scribe v2 as an explicit opt-in STT provider for Janusz's configured personal/local deployment.
- Use stored secrets through approved secret tooling (for example OpenPass secret execution) without revealing raw secret values in logs, commits, screenshots, or chat.
- Make provider calls required for live validation only after UI/config/CLI state makes the opt-in explicit and tests prove disabled/default paths make zero network calls.
- Read public documentation and public API references as needed.

### Explicit non-authorizations / hard boundaries

- No public-facing writes to non-owned resources. This includes upstream GitHub PRs/issues/comments, public posts, package publishing, wiki edits, hosted deployments, or any mutation of a non-owned/public resource.
- No PRs against non-owned upstream repositories.
- No push, PR, release, publish, deploy, or public exposure unless the target is owned/authorized and the action is necessary for this local-live goal; default to local commits only.
- No DRM circumvention, protected-stream capture, credential/cookie extraction, or automatic download of online media.
- No private/account-gated YouTube or other source access unless Janusz separately approves the exact source and credential boundary.
- No use or extraction of Lingopie proprietary content, private account data, tokens, raw subtitle/media assets, screenshots, or private API payloads.
- No storing raw API keys, raw provider request bodies, or private absolute host paths in committed files or default exports.
- No fake implementation or fake data in the final live path. Fakes/mocks remain appropriate for automated tests, but final acceptance must exercise real local code paths and explicitly mark any remaining external/human blockers.

## Workstreams

### WS0 — Plan/status hygiene and doc drift cleanup

Goal: make the repo's docs agree with current code before downstream agents implement from stale artifacts.

Tasks:

1. Update `docs/dev/local-runbook.md` and `docs/dev/v1-local-acceptance.md` to reflect that browser local media/subtitle file inputs exist.
2. Preserve the distinction between existing local file import and missing durable/local-service/transcription integration.
3. Add or update acceptance smoke steps for importing a small owned/synthetic local file pair through the file inputs.
4. Run doc hygiene checks and commit the status-refresh slice.

Validation:

- `git diff --check`
- `python3 validate_final_bundle.py` if final-bundle-indexed docs change.
- Focused browser/UI tests if text changes correspond to UI behavior.

### WS1 — Durable local persistence

Goal: make Lingotorte survive reloads and behave like a local app rather than an in-memory demo.

Preferred direction:

- Implement a SQLite-backed local persistence layer behind the existing typed store/service boundaries, unless a short spike proves IndexedDB is a better immediate bridge.
- Keep media files as user-owned filesystem/object references by default; do not copy media unless explicitly configured.
- Store transcript tracks, cues, word timings, saved items, saved occurrences, review cards/states/events, practice attempts, import jobs, and provenance durably.
- Add migrations/schema versioning and round-trip tests.
- Ensure export/restore semantics remain privacy-aware and do not leak secrets or unnecessary absolute paths.

Acceptance:

- Reload/restart preserves imported media metadata, transcript tracks/cues, approved transcript state, saved items, review schedule, and practice history.
- Existing in-memory tests still pass through an adapter-compatible test path.
- Migration/seed tests pass from an empty local database.

### WS2 — Loopback local service boundary

Goal: provide the safe local execution boundary needed for filesystem, SQLite, ffmpeg, Python, and provider jobs.

Tasks:

1. Add a loopback-only local API/service process.
2. Add health, version, config/status, job create/status/cancel, and artifact-cleanup endpoints.
3. Bind to `127.0.0.1` by default; no LAN/public exposure.
4. Define scratch/cache roots for audio extraction, transcript JSON, provider outputs, and model caches.
5. Redact secrets and local private paths from logs by default.
6. Provide a single local command that starts the service and UI together, or clearly documented two-process commands if necessary.

Acceptance:

- `npm run local` or documented equivalent starts a live local app/service on loopback.
- Health endpoint and UI status panel agree.
- Service can be stopped cleanly.
- No public network listening sockets are introduced.

### WS3 — Real transcription job integration

Goal: wire the implemented transcription adapters into the local service and browser UI.

Tasks:

1. Local path: media -> ffmpeg extraction -> faster-whisper -> optional WhisperX alignment -> draft transcript track with first-class word timings.
2. Cloud path: media/audio -> explicit ElevenLabs Scribe v2 opt-in -> draft transcript track with first-class provider-native word timings.
3. Add job progress, cancellation, errors, and retry UX.
4. Keep provider/model installs and downloads explicit and documented.
5. Ensure disabled/default provider state fails before any network call.
6. Ensure raw provider outputs/request bodies are not committed or exported by default.

Acceptance:

- Generate a local transcript from real local/synthetic media without fake providers.
- Generate an ElevenLabs Scribe v2 transcript only after explicit config/consent.
- Both paths produce draft tracks with provenance, quality warnings, and word timings.
- Tests cover no-network default, fake clients for unit tests, and live/manual smoke receipts for real local execution.

### WS4 — Transcript correction editor MVP

Goal: make transcript drafts reviewable enough for actual study use.

Tasks:

1. Add a correction workspace with video/player, cue list, editable cue text, timing fields, provenance/warning panel, and approval action.
2. Add cue split/merge operations.
3. Add word-timing inspection and correction affordances.
4. Add source comparison when multiple tracks exist.
5. Add keyboard-friendly replay/previous/next/slowdown shortcuts.
6. Preserve immutable track versioning: corrections create new versioned tracks with parent hashes/provenance.

Acceptance:

- Drafts cannot feed default study saves until approved.
- Corrected tracks preserve parent/provenance and become approved only through explicit action.
- Existing saved occurrences remain anchored to the exact track/cue/hash used when saved.

### WS5 — Word-timing-powered learner UX

Goal: turn stored word timings into visible product value.

Tasks:

1. Render word-level transcript spans where timings exist.
2. Enable click-to-seek/replay for word spans.
3. Enable phrase/range looping from word timing boundaries.
4. Persist saved occurrences with exact word/span timing anchors where available.
5. Show graceful fallback for cue-only timing.

Acceptance:

- Clicking a timed word seeks/replays the correct segment.
- Saving a word/phrase from a timed transcript stores timing provenance.
- Export/restore preserves timing-backed saved occurrence context.

### WS6 — Polish/local language adapter quality

Goal: make the local study loop useful for Polish, not just structurally correct.

Tasks:

1. Replace or augment whitespace tokenization with a better local tokenizer for Polish.
2. Add lemma/POS/morphology adapter(s) with typed unavailable/error states.
3. Add a local dictionary/lookup path suitable for initial daily use.
4. Keep online translation/LLM explanation optional and disabled by default.
5. Preserve adapter provenance/versioning in saved analysis results.

Acceptance:

- Polish fixture and at least one user-provided local sample produce useful tokens/lemmas/POS or clear unavailable states.
- No online lookup occurs unless explicitly enabled.

### WS7 — Live YouTube caption read path, still command-only for media acquisition

Goal: support user-initiated public caption metadata reads without automatic media download.

Tasks:

1. Implement an opt-in live YouTube caption provider using public caption/transcript workflows.
2. Keep public reads visibly user-triggered and test-disabled by default.
3. Keep `yt-dlp` as displayed command generation only; do not execute it automatically.
4. Preserve no cookies, no browser credential paths, no DRM/protected-stream bypass flags.

Acceptance:

- User can paste a public YouTube URL and import available captions as draft tracks after explicit public-read authorization.
- No media download occurs automatically.
- Disabled-provider/no-network tests prove zero HTTP calls by default.

### WS8 — Packaging, backup/restore, and live acceptance

Goal: finish the local-live experience and prove it with real receipts.

Tasks:

1. Provide a one-command local start path.
2. Provide clear local config and setup docs for Node, Python/uv, ffmpeg, model cache, ElevenLabs optional secret, and scratch directories.
3. Improve export/download and restore conflict/full-replace UX.
4. Add metadata-only backup path; make media-copy backup explicitly opt-in.
5. Run a full local acceptance pass with:
   - synthetic fixture;
   - browser-selected local media + `.srt` pair;
   - durable restart/reload proof;
   - local transcription proof;
   - optional ElevenLabs proof if configured;
   - no-network default proof;
   - privacy/secret scan;
   - final browser smoke.
6. Commit durable changes locally at each verified milestone.

Definition of done:

- A fresh checkout/setup can start Lingotorte locally.
- Janusz can import owned local media/subtitles, save study items, review/practice them, quit/restart, and continue without losing state.
- Janusz can generate a transcript from local media through real local STT/alignment, correct it, approve it, and use it for study.
- Optional ElevenLabs Scribe v2 works only when explicitly configured and consented.
- The app remains local/private by default and all tests/gates pass.
- Final handoff includes commits, commands run, live smoke evidence, unresolved blockers if any, and explicit non-authorizations preserved.

## Required validation gates

Run these as a minimum before final handoff, adding narrower focused tests per slice:

```bash
npm run typecheck
npm run test:no-network
npm run scan:privacy
npm test
npm run build
python3 validate_final_bundle.py
git diff --check
```

Also run:

- focused tests for every changed package/service/UI slice;
- local service health checks;
- browser smoke on `127.0.0.1`;
- conservative tracked-file secret scan;
- committed-range whitespace check after local commits;
- live local STT smoke if model dependencies are installed;
- live ElevenLabs smoke only if configured and explicitly consented in the UI/config.

## Copy-paste `/goal` prompt

```text
Complete the Lingotorte live-local usability plan end to end.

Workspace/repo: /home/openclaw/workspace/lingotorte
Primary plan artifact: PLAN.md
Important source docs: README.md, docs/dev/local-runbook.md, docs/dev/v1-local-acceptance.md, docs/plan/v3-transcript-generation-correction-plan.md, docs/architecture/data-model-and-storage.md, docs/review/safety-privacy-boundary-review.md.

Objective:
Take Lingotorte from its current test-backed local prototype to a live, locally usable app for Janusz's own media. Implement all remaining work in PLAN.md unless a task is blocked only by an explicit human/external decision. Keep iterating until the app can be started locally, can import owned local media/subtitles, persists learner/transcript state across restart/reload, can generate/correct/approve transcripts through real local transcription paths, and has a clear optional ElevenLabs Scribe v2 path behind explicit opt-in.

Current known state:
- The app already runs with `npm run dev -- --host 127.0.0.1` and responds on loopback.
- The Library UI already has local media + target .srt + optional native .srt file inputs, although some docs still say this is not ready.
- The store is still in-memory (`packages/storage/src/localStore.ts`), so durable persistence is a major blocker.
- Real transcription seams exist in `packages/local-transcription/src/index.ts` and scripts/ but are not yet integrated into a loopback service/browser workflow.
- `yt-dlp` must remain command-generation only; do not auto-execute it.
- Microsoft MAI-Transcribe-1.5 is explicitly out of scope for this implementation run.

Authorizations granted for this goal:
- You may inspect and modify files in /home/openclaw/workspace/lingotorte, including source, tests, docs, scripts, packages, service code, schemas/migrations, fixtures, package manifests, and lockfiles.
- You may make necessary design/architecture decisions to complete the goal while preserving local-first privacy boundaries.
- You may run tests, builds, typechecks, browser/local service smoke tests, package-manager installs, and dependency verification.
- You may add justified dependencies. Prefer uv for Python workflows and keep Python/model setup reproducible and isolated.
- You may install/run local STT/alignment dependencies such as faster-whisper and WhisperX and download required model weights, recording model/license/cache details and keeping generated/cache artifacts out of git.
- You may run ffmpeg/ffprobe, Python helper scripts, and local transcription/alignment jobs against synthetic or Janusz-owned/local media.
- You may implement/start/stop/restart loopback-only local services in WSL for Lingotorte development and smoke testing.
- You may use external/public-internet reads for package installs, documentation, public YouTube caption metadata reads, and dependency/model acquisition.
- You may use ElevenLabs Scribe v2 as an explicit opt-in STT provider for Janusz's configured personal/local deployment. Use approved secret tooling; do not reveal raw secrets.
- You may use delegated/subagents for bounded implementation, review, debugging, and verification.
- You may create local git commits after verified slices. Prefer exact-scope commits with clean status and receipts.

Hard boundaries / non-authorizations:
- No public-facing writes to non-owned resources. Do not create PRs/issues/comments, public posts, package publications, wiki edits, hosted deployments, or other mutations on non-owned/public resources.
- No PRs against non-owned upstream repositories.
- Do not push, publish, release, deploy, or expose a service publicly unless the target is owned/authorized and the action is strictly necessary; default to local commits only.
- No DRM circumvention, protected stream capture, credential/cookie extraction, browser credential path use, or automatic online media download.
- Do not access private/account-gated YouTube or other media sources unless Janusz separately approves the exact source and credential boundary.
- Do not use Lingopie proprietary media/subtitles/screenshots/private API payloads/account data. Lingopie is reference UX only.
- Do not commit secrets, raw provider request bodies, model caches, generated media/audio/transcript scratch artifacts, or private local absolute paths in default exports.
- Do not fake the final live path. Fakes/mocks are allowed in automated tests, but final acceptance must exercise real local paths or clearly identify explicit external/human blockers.

Required workstreams, in order unless dependency analysis proves a safer order:
1. WS0 doc/status hygiene: update stale docs about local file import and preserve current boundaries.
2. WS1 durable local persistence: preferably SQLite-backed, with migrations/schema tests and persistence across restart/reload.
3. WS2 loopback local service boundary: health/status/config, job create/status/cancel, scratch/cache policy, redacted logs, loopback-only binding.
4. WS3 real transcription job integration: local ffmpeg -> faster-whisper -> WhisperX-style alignment path; optional ElevenLabs Scribe v2 path; draft transcript artifacts with first-class word timings and provenance.
5. WS4 transcript correction editor MVP: edit cue text/timing, split/merge, word timing inspection/correction, source comparison, keyboard replay/navigation, immutable corrected versions and approval.
6. WS5 word-timing learner UX: clickable timed words, phrase/span replay/looping, saved occurrence timing anchors, export/restore preservation.
7. WS6 Polish/local language adapter quality: better tokenization/lemma/POS/morph/dictionary path with online disabled by default.
8. WS7 live YouTube caption read path: explicit public-read authorization, draft captions, no media auto-download, yt-dlp command display only.
9. WS8 packaging/backup/live acceptance: one-command local start, setup docs, export/restore/backup polish, final local acceptance packet.

Validation requirements:
Run focused tests for each slice plus, before final handoff:
- npm run typecheck
- npm run test:no-network
- npm run scan:privacy
- npm test
- npm run build
- python3 validate_final_bundle.py
- git diff --check
- conservative tracked-file secret scan
- browser smoke on 127.0.0.1
- local service health checks
- durable restart/reload proof
- local transcription smoke with real local code paths if model dependencies are installed
- optional ElevenLabs smoke only if configured and explicitly consented

Completion contract:
Do not stop at a plan or stub. Keep implementing and verifying until Lingotorte is live and locally usable, or until remaining work is blocked only by explicit human/external decisions. Final response must include: commits made, commands run and results, live smoke receipts, what works, what remains if anything, exact blockers, and confirmation that non-authorizations were preserved.
```
