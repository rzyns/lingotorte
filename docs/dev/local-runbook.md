# Lingotorte local runbook

**Current entry point:** use the [Docker runbook](docker-runbook.md) and [Docker-primary replacement scope](../plan/docker-primary-runtime.md). Janusz selected Docker and removed mandatory loopback-only binding for trusted private-LAN use. The native startup/systemd/Windows recipes below are retained historical/operator context, not prerequisites to Docker. The original app ran in WSL (user-provided history); current container bytes require fresh verification. Provider/state/media boundaries still apply.

Status: V4 local transcription runbook. This document describes how to run and inspect the current local baseline without enabling cloud sync, AnkiConnect, live Lingopie inspection, public sharing, public-internet writes, external account mutation, or unapproved media/model downloads. The transcript lifecycle lane includes fakeable/local adapter seams for provider captions, real local ffmpeg/faster-whisper/WhisperX-style command adapters, and explicit-opt-in ElevenLabs Scribe v2 cloud STT. Generated/provider tracks must be corrected and approved before learner study use.

## Scope and safety posture

Lingotorte currently runs as a local Vite/TypeScript web app over synthetic fixtures and browser-selected local media/subtitle files:

- media fixture: `fixtures/media/synthetic-polish-dialogue.webm`
- target subtitles: `fixtures/subtitles/synthetic-polish-dialogue.target.srt`
- native subtitles: `fixtures/subtitles/synthetic-polish-dialogue.native.srt`
- fixture provenance: [`../../fixtures/README.md`](../../fixtures/README.md)

The fixture set is synthetic/local and contains no Lingopie media, subtitles, screenshots, catalog data, account data, private API payloads, branding, tokens, or private examples. The Library view also exposes browser local file inputs for Janusz-owned media plus optional target `.srt` and optional native `.srt` subtitles. Media-only import is supported for videos that need an ASR draft/correction workflow. Those browser imports stay on-device by using object URLs for media and `File.text()` for subtitle contents; they are not uploads and do not invoke a provider. Product boundaries remain governed by [`../review/safety-privacy-boundary-review.md`](../review/safety-privacy-boundary-review.md). Public documentation links in planning files are evidence references only; the runtime app must not depend on public Lingopie services or provider calls.

## Prerequisites

- For native Windows qualification, use the selected exact tuple and acceptance gates in the [Windows platform contract](windows-platform-contract.md) and the [content-bound Windows qualification procedure](windows-qualification-procedure.md), not the historical Linux receipts below. Node 26.7.0 / Edge 156.0.4314.15 are selected targets, not a qualified combined application. CPython 3.14.7 via `python` is the help/fake target only. The reviewed dirty Job Object launcher additionally requires accepted PowerShell 7 plus usable in-memory `Add-Type` C# compilation; this prerequisite is conditional on selecting that architecture, not a claim that this checkout contains the repair.
- Node.js and npm matching the selected runtime and exact lockfile/dependency closure.
- A checkout of this repo.
- The npm cache already populated if running in no-network/offline mode.

The Windows procedure is planning only: `lt-a46` remains blocked, historical failures stay frozen, and no live run, install, browser journey or retry-budget reset is authorized here. Commands below are operator recipes, not permission to execute during planning. Windows qualification must use fresh external synthetic roots, no learner state, providers disabled, and one combined launcher/native-path/Python content identity.

### Historical Linux Node version pin (2026-07-19)

The services run `.ts` sources directly under Node's type stripping, which is **strip-only** as of Node 26: relative imports must carry explicit `.ts` extensions and TypeScript-only runtime syntax (parameter properties, enums outside `.d.ts`, namespaces) is not allowed in the node-executed graph. An unattended linuxbrew upgrade to Node 26.5.0 broke service boot on 2026-07-19 (fixed forward in `b74327c`/`d04d63a`); the historical Linux host recorded a `brew pin node` pin. That is not a current Windows installation or pin claim. For an authorized runtime update, run the boot smoke: load each `packages/*/src/index.ts` with plain `node -e "await import(...)"` and `node --check apps/local-service/src/server.ts`, then check `/api/health` after the authorized platform-specific restart. Systemd applies only to the historical Linux lane.

Do not install new packages from the network during V1 acceptance unless Janusz separately authorizes that exact package-manager network action.

## Dependency setup

Preferred command for a fresh local checkout or worktree:

```bash
npm ci --offline --no-audit --no-fund
```

If this fails because the local npm cache is missing required packages, stop and request/record explicit approval before using a networked install. Do not silently fall back to `npm install` or registry access during local acceptance.

Generated dependency/build directories such as `node_modules/` and `dist/` are local artifacts and should not be committed.

## Validation commands

Run these from the repo root:

```bash
npm test
npm run test:no-network
npm run build
npm run typecheck
npm run scan:privacy
python3 validate_final_bundle.py
git diff --check
```

For V1 acceptance also run a conservative tracked-file secret scan and a committed-range whitespace check after committing. If `validate_final_bundle.py` is run while generated dependency docs are present under `node_modules/`, remove generated local artifacts first or run validation in a clean repo-only state.

The `python3` recipes in this runbook are historical Linux commands. On Windows use the selected `python` or explicit executable for validation/help/fake tests; a missing prerequisite must be reported, not silently skipped or installed. No ASR support follows from CLI help success.

## Local services

For the normal live-local development path, start the loopback SQLite/job service and Vite UI together:

```bash
npm run local
```

This starts the local service on `127.0.0.1:5174` and Vite on `127.0.0.1:5173`. Run from a private interactive controlling terminal: native delivery defaults to `tty`, not stdout/stderr. It fails closed without a private receiver; unattended historical units below require a separately designed private receiver and are not current startup recipes. Do not pipe, redirect, capture or screenshot the terminal. In Settings set `http://127.0.0.1:5174`, paste the displayed current session capability, pair the tab, then connect. The capability stays only in tab memory and rotates at each service start; reload/restart requires re-pairing. Never put it in command arguments/history, URLs, config/environment files, logs, browser storage, exports or backups. Plain `/api/health` remains an unauthenticated liveness check; `/api/status`, state, jobs and snippets require Bearer authorization and exact admitted Host/Origin.

For split private terminals:

```bash
npm run dev:local-service
npm run dev -- --host 127.0.0.1
```

Default service behavior:

- binds only to `127.0.0.1:5174` unless loopback env vars override it;
- the integrated `lt-8s9` native-config repair resolves Windows `%LOCALAPPDATA%/lingotorte` (validated home/AppData/Local fallback), Linux absolute XDG data-home/default resolution, and explicit native `LINGOTORTE_DATA_DIR`, `LINGOTORTE_DB_PATH`, `LINGOTORTE_SCRATCH_DIR`, `LINGOTORTE_MODEL_CACHE_DIR` overrides. The older `$HOME/.local/share/lingotorte` receipt below is historical Linux context. Component repair evidence is not combined Windows qualification; explicitly redirect all roots to a fresh external synthetic store before authorized qualification startup;
- the SQLite store is snapshot-compatible with a forward-only `schema_migration` ledger, rebuildable typed projections for current media/transcript/learner/review/practice/import-job state, and authoritative append-only replay tables for review/import events;
- redacts local filesystem paths from `/api/status` and startup receipts;
- uses `base` as the local ASR model default, configurable with `LINGOTORTE_ASR_MODEL` from the bounded set `tiny`, `base`, `small`, `medium`, `large-v3`;
- reports persistence status, including applied migration metadata, without exposing the database path;
- accepts another bind only with an exact advertised `LINGOTORTE_SERVICE_HOSTNAME`; native UI origins default only to `http://127.0.0.1:5173`. For an explicitly chosen preview or localhost UI set `LINGOTORTE_UI_ORIGINS` to its exact comma-separated HTTP origins, e.g. `http://127.0.0.1:4173,http://localhost:5173`, before startup. No wildcards or trailing slashes; scheme/port/hostname are distinct enrollments. Enrollment does not replace pairing;
- keeps online providers disabled unless `LINGOTORTE_ALLOW_ONLINE_PROVIDERS=true` is explicitly set for a consented run.

Useful checks:

```bash
curl -sS http://127.0.0.1:5174/api/health
```

For authenticated status inspection use the paired Settings UI rather than a shell token argument. An unauthenticated status request must return 401 with no private payload. Preflight/CORS success never authenticates a later request. Do not copy capabilities into `curl -H` commands.

### Systemd user units

This section records the historical Linux deployment, not native Windows support, a current installed-unit assertion, or permission to deploy. That Linux tuple remains unqualified for current combined bytes until native evidence is collected. The historical units were installed under `~/.config/systemd/user/`:

- `lingotorte-local-service.service` — loopback SQLite/job/ASR service on `127.0.0.1:5174`.
- `lingotorte-web.service` — Vite web UI on `127.0.0.1:5173`.
- `lingotorte.target` — grouping target that starts/stops both child services.

The units consume the repo-local `.env` file via `EnvironmentFile=/home/openclaw/workspace/lingotorte/.env`. That file is git-ignored and should remain mode `0600` when it contains provider keys.

Operator commands:

```bash
systemctl --user status lingotorte.target lingotorte-local-service.service lingotorte-web.service
systemctl --user start lingotorte.target
systemctl --user stop lingotorte.target
systemctl --user restart lingotorte.target
journalctl --user -u lingotorte-local-service.service -u lingotorte-web.service -f
```

The target is intended to be enabled with:

```bash
systemctl --user enable --now lingotorte.target
```

After any unit edit, run:

```bash
systemctl --user daemon-reload
systemd-analyze --user verify ~/.config/systemd/user/lingotorte-local-service.service ~/.config/systemd/user/lingotorte-web.service ~/.config/systemd/user/lingotorte.target
```

In the browser, open **Settings**, keep or enter `http://127.0.0.1:5174`, click **Connect local service**, then click **Save state now** or enable autosave. Connecting to a fresh empty service does not clobber unsaved browser state; save explicitly once you want the current browser state to become the durable SQLite snapshot.

The same service accepts local transcription jobs through `POST /api/jobs` with `kind: "local-transcription"`. Job responses are sanitized and do not echo private filesystem paths. The browser **Generate local ASR draft** control omits a model override so the service-owned default governs, creates and polls one of these jobs, then imports the returned transcript as a draft track. Set `LINGOTORTE_ASR_MODEL` before service startup to one of `tiny`, `base`, `small`, `medium`, or `large-v3`; missing/blank values use `base`, while an unsupported value emits a raw-value-free warning and safely falls back to `base`. `tiny` remains an explicit fast smoke/fallback override. The effective selection is visible as `/api/status` → `config.defaultAsrModelName` without exposing local paths or configuration input. Configuration and status resolution do not inspect caches, load models, or download anything. Actual execution requires ffmpeg plus approved/install-local ASR dependencies (`faster-whisper`, optionally `whisperx`) available to the service process; model downloads and live media runs still require their own explicit operator authorization.

For ElevenLabs Scribe v2, start the service with both gates set in the service process, not in browser JavaScript:

Set the service-only `ELEVENLABS_API_KEY` through an approved private secret-delivery mechanism, not a pasted command, command argument, log or committed config. Only for a separately consented run, set the nonsecret provider enable flag before startup:

```bash
LINGOTORTE_ALLOW_ONLINE_PROVIDERS=true npm run local
```

The `/api/status` response reports `providers.elevenLabsScribe.apiKeyPresent` and `ready` booleans without exposing the key. In **Library → Transcript lifecycle**, check **I authorize sending extracted audio to ElevenLabs Scribe v2**, enter an absolute owned media path if the current browser media is a `blob:` URL, then click **Generate ElevenLabs Scribe v2 draft**. This creates a `kind: "elevenlabs-scribe"` loopback job. The service extracts local audio with ffmpeg, sends that audio to ElevenLabs, imports the returned draft as `online-asr`, and keeps learner-state saves blocked until correction/approval. Do not click **Generate local ASR draft** when intending to use ElevenLabs; that local button intentionally runs faster-whisper.

For public YouTube captions, the service accepts `kind: "youtube-caption"` jobs only when both gates are true: the browser/user payload includes `allowPublicRead: true` and the service was started with `LINGOTORTE_ALLOW_ONLINE_PROVIDERS=true`. This path reads public caption metadata through YouTube timedtext, returns draft caption segments, redacts the source URL from job summaries, and never downloads media.

## Local dev server

Start the app on loopback only:

```bash
npm run dev -- --host 127.0.0.1
```

Use the localhost URL printed by Vite, commonly `http://127.0.0.1:5173/`. Treat the dev server as a tracked local process. Stop it after browser smoke and record the log/PID in the external acceptance packet.

## Browser smoke script

Native Windows qualification requires the selected exact Edge build in a fresh empty disposable profile and a separate browser receipt under the [Windows qualification procedure](windows-qualification-procedure.md). WSL tooling, fake DOM tests or HTTP asset checks are not native Edge journey evidence. Do not open an existing user profile.

**Historical behavior, not repaired acceptance:** the export/restore step below and the existing **Restore complete** receipt/limitations text describe the prior UI workflow only. They do not prove repaired restore/revision correctness, stale-preview handling, rollback, durable persistence or identity-preserving relink. Those acceptance gates remain parent-owned and open; a success message alone is insufficient. During qualification use synthetic disposable state only, never restore into a real learner store.

1. Open the local Vite URL.
2. Verify the shell loads without fatal console errors.
3. Verify the footer/status says local-only / providers disabled.
4. Open **Library**.
5. Click **Load synthetic fixture**.
6. Verify the app returns to **Player** and shows:
   - video/player stage;
   - transcript panel;
   - synthetic target cue text;
   - native cue text;
   - cue navigation controls;
   - loop and speed controls.
7. In the transcript, use **Show tokens** on a cue and verify a token preview appears.
8. Save at least one sentence through **Save sentence**.
9. Open **Saved** and verify **My Sentences** or **My Vocab** shows local source context.
10. Create a review card from a saved item, then open **Review**.
11. Reveal/rate the due card and verify review bucket/status changes locally.
12. Open **Practice**, submit or skip a local attempt, and verify feedback appears.
13. Open **Export / Import**, click **Generate local export**, and verify the privacy-warning summary appears. Paste the export JSON into the import textarea, click **Preview restore**, acknowledge the privacy warnings, select merge/update or Replace all if local state exists, and click **Restore now**. Verify a **Restore complete** receipt appears with mode, manifest integrity result, operation counts, acknowledged warnings, and a no-media-copied note.
14. Open **Settings**, verify provider/sync/Anki/ASR states remain disabled, connect to the loopback local service if it is running, and save state once to verify the SQLite service path.
15. Inspect console and network requests after navigation and interactions.

For a local-file smoke, return to **Library**, choose an owned `.mp4`/`.webm`/`.mkv`/`.mov`/audio media file, optionally choose a target `.srt`, optionally choose a native `.srt`, then click **Import local media**. Verify the player uses a `blob:` media URL without uploading anything. If the browser exposes the File System Access API, also verify **Import persistent media handle** opens the browser picker, imports the selected owned media, records a `browser-file-handle:<name>` media source label, and still uses only a transient `blob:` URL for playback. If a target subtitle was selected, verify the transcript shows the selected target cue text and the optional native cue text is displayed when provided. If no target subtitle was selected, verify the media still imports, the transcript panel says no transcript is loaded yet, and **Generate local ASR draft** remains available from **Library → Transcript lifecycle** after connecting the loopback service / providing an absolute media path as needed.

Acceptable network traffic during dev smoke is limited to loopback/local dev-server reads, `data:`/`blob:` URLs, and Vite internals. Public-internet writes, provider calls, external account mutations, or runtime requests to an external host are V1 blockers unless Janusz has explicitly approved that exact opt-in path.

### B6 visual source-range and transient-snippet smoke

Use only synthetic or explicitly owned local media. Do not use protected/private/proprietary media, enable an online provider, download media, or use a microphone.

1. Import or relink owned/synthetic local media and target subtitles, then open **Player**.
2. In **Source range**, move both timeline handles with a pointer and then with keyboard arrow keys. Verify the highlighted interval and visible **Start**, **End**, and **Duration** values follow the handles.
3. Select transcript text that has word timings and click **Use transcript selection**. Verify only the visual source range changes to the word-derived interval; the learner text selection remains available for **Save**.
4. Click **Loop selected range**, play across the end boundary, and verify playback returns to the selected start. Move a visual handle and verify the active loop does not silently change. Click **Clear loop** and verify the visual selection remains.
5. Connect the loopback local service and enter an explicit absolute path to the same owned media. Browser handles, fixture URLs, relative paths, HTTP(S), and `blob:` URLs are playback-only and must be rejected for service extraction. Preparation also fails closed unless the current media asset is labeled `owned` or `synthetic`. Browser security does not expose a filesystem identity that lets the app cryptographically bind a manually entered service path to a browser `File`/handle; the UI can enforce the current-media privacy label and absolute-path shape, but the user must confirm that the path names the same owned/synthetic media.
6. Select a range of exactly 30 seconds or less, click **Prepare audio for practice**, and verify a native audio control appears without autoplay. Start playback deliberately, then click **Clean browser audio** and verify the control disappears. The status must state that the service scratch copy was deleted after browser retrieval.
7. Select a 30,001 ms range. Verify **Prepare audio for practice** is disabled with a 30-second-maximum message while **Loop selected range** remains available.
8. Verify clear feedback for disconnected service, missing/invalid absolute path, missing transcript word timings, and extraction/retrieval failure. Status text must not expose an absolute filesystem path.
9. Prepare audio again, then change the range, path, or media, clear the range, or leave Player. Verify the superseded audio control disappears and the old browser object URL is released.
10. Inspect DevTools network/storage and a generated learner export. Confirm there is no non-loopback/provider/microphone traffic and no snippet bytes, IDs, paths, object URLs, status, or audio in learner state, export, or backup data. Stop the service/session and confirm no snippet survives service cleanup.

## V3 transcript lifecycle smoke

The P7 transcript lane is implemented as a local/fakeable lifecycle slice. Default smoke uses fake/local providers and makes no external reads; the live public YouTube caption path is separate and requires both a visible browser public-read authorization and `LINGOTORTE_ALLOW_ONLINE_PROVIDERS=true` on the loopback service.

1. Open **Library** and locate **Transcript lifecycle**.
2. Click **Import gated demo caption draft** without checking the authorization box; verify the action is blocked before adapter execution and no transcript appears.
3. Enter or keep a public YouTube URL/video id, check **I authorize a public caption metadata read**, and click **Import gated demo caption draft**.
4. Verify the current transcript is labeled `draft` with `youtube-auto-caption` provenance/warnings.
5. Open **Player** and verify **Save sentence** is disabled with the approval-gate message.
6. Return to **Library**, edit cue text/timing or word timing fields, optionally use **Split line N** / **Merge line N with next**, and click **Create corrected transcript version**.
7. Verify the current transcript is `correcting`, then click **Approve transcript for study**.
8. Return to **Player** and verify **Save sentence** is enabled and saves the corrected cue text.
9. Optional local ASR path: start `npm run local` or `npm run dev:local-service`, keep **Settings → Local service URL** pointed at `http://127.0.0.1:5174`, load or keep a current media asset, enter an absolute owned local media path in **Local service ASR media path** when the current browser media is a `blob:` URL, fixture URL, or `browser-file-handle:<name>` label, then click **Generate local ASR draft**. Verify the resulting track is a `draft` `local-asr` track with `asrDraft` warnings and first-class word timings when the local adapter returns them. Browser handles/blob URLs are playback-only; the loopback service needs a filesystem path it can read for ASR, ffmpeg/ffprobe, and source-media snippets.
10. Optional embedded-subtitle path: connect the loopback service, keep a current owned/synthetic media asset loaded, and enter an explicit absolute path to owned local media under **Embedded subtitle tracks**. Click **List embedded subtitle tracks** and verify safe stream index/codec/language/title/default/forced/support metadata appears without selecting or extracting anything automatically. Explicitly select one supported text track, edit the draft language if needed, and click **Extract selected track as draft**. Verify the path never appears in status/provenance/exported state, unsupported tracks cannot be selected, the imported target track is `draft` with `user-subtitle-file` plus `timingUnverified`/`qualityUnreviewed` provenance, **Save sentence** remains disabled, and correction then approval re-enables study saves. Automated tests use fake service/command responses and never execute ffmpeg/ffprobe; a live smoke must use a separately chosen owned file and installed local tools.
11. Optional ElevenLabs Scribe v2 path: start the service with `LINGOTORTE_ALLOW_ONLINE_PROVIDERS=true` and `ELEVENLABS_API_KEY` set, check **I authorize sending extracted audio to ElevenLabs Scribe v2**, enter an absolute owned media path when needed, then click **Generate ElevenLabs Scribe v2 draft**. Verify the resulting track is a draft `online-asr` track with ElevenLabs provenance and provider word timings. This sends extracted local audio to ElevenLabs and is not a local/offline ASR path.
12. Optional live public-caption path: start the service with `LINGOTORTE_ALLOW_ONLINE_PROVIDERS=true`, check the public-read authorization box, and click **Import public YouTube caption draft**. Verify the resulting track is a draft YouTube caption track. This path reads public caption metadata only; it does not download media.
13. Practice source-audio recall: connect the loopback local service, open a due card in **Practice**, select **Audio recall**, and paste the explicit absolute path to the owned local media. **Prepare audio for practice** extracts exactly the saved occurrence's cue range (maximum 30 seconds) as mono 16 kHz PCM WAV. The browser fetches the complete local blob and requests immediate service deletion; superseded browser object URLs are revoked. Remaining snippets are session-only, bounded to 16 entries with LRU eviction, and removed on service startup/close or global scratch cleanup. Paths and snippet cache metadata are not persisted or exported. This mode does not use a microphone, speech recognition, TTS, providers, or online downloads.

Actual media acquisition remains command-generation only. `planYtDlpMediaAcquisition()` produces a safe command plan; Lingotorte does not execute `yt-dlp`.

## V4 local/cloud transcription adapters

The repo now ships a Node-side `@lingotorte/local-transcription` package plus dependency-lazy Python entrypoints for real transcription work. Automated tests use injected runners/fake HTTP clients; they do not execute ffmpeg, download models, call ElevenLabs, or run `yt-dlp`.

Implemented adapter decisions:

- **ffmpeg audio extraction:** `extractAudioWithFfmpeg()` executes `ffmpeg -hide_banner -y -i <media> -vn -ac 1 -ar 16000 -c:a pcm_s16le <audio.wav>` through an injectable command runner. Inputs/outputs must be absolute local paths and output must differ from input.
- **Local faster-whisper transcription:** `transcribeWithFasterWhisper()` calls `scripts/faster_whisper_transcribe.py` and normalizes segment/word JSON into Lingotorte transcript segments. The Python script imports `faster_whisper` only after argument parsing, so `--help` works without installing the heavy dependency.
- **WhisperX-style alignment:** `alignWordsWithWhisperX()` calls `scripts/whisperx_align.py` with an existing transcript JSON sidecar and normalizes aligned words with `sourceKind: "forced-alignment"`. The script imports `whisperx` only for actual alignment execution.
- **First-class word timings:** local ASR and cloud STT word arrays are persisted as `TranscriptWordTiming` rows; WhisperX-style aligned words keep forced-alignment provenance instead of being downgraded to provider-native timing.
- **ElevenLabs Scribe v2:** `transcribeWithElevenLabsScribe()` is explicit opt-in. It refuses before HTTP execution unless `allowOnlineProvider` is true, then posts `file`, `model_id=scribe_v2`, `timestamps_granularity=word`, `diarize=true`, and optional `language_code` to `POST https://api.elevenlabs.io/v1/speech-to-text`. Unit coverage uses a fake HTTP client.
- **yt-dlp:** remains command-generation only through `planYtDlpMediaAcquisition()`. The app does not auto-execute `yt-dlp`, pass cookies, use browser credential paths, or bypass DRM.

Example dependency-gated local commands, run only after approving model/dependency installation for the local machine:

```bash
ffmpeg -hide_banner -y -i /absolute/path/video.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le /absolute/path/audio.wav
python3 scripts/faster_whisper_transcribe.py --audio /absolute/path/audio.wav --language pl --model small --device cpu --compute-type int8 --word-timestamps
python3 scripts/whisperx_align.py --audio /absolute/path/audio.wav --transcript-json /absolute/path/transcript-segments.json --language pl --device cpu
```

### B4 ASR dependency proof (recorded 2026-07-04)

The historical Linux local ASR pipeline receipt recorded the following setup; it does not qualify this Windows host, CPython 3.14.7, or the current exact Linux tuple:

- **Python:** 3.12.3 in a dedicated venv at `~/.local/share/lingotorte/asr-venv/`
- **faster-whisper:** 1.2.1, installed via `uv pip install faster-whisper`
- **ffmpeg:** 8.1.2 (via Linuxbrew)
- **Model:** `tiny` (default proof model), CPU device, int8 compute type. Also available in cache: `base`, `large-v3`
- **Model cache location:** `~/.cache/huggingface/hub/` (HuggingFace Hub default)
- **Status:** ASR pipeline functional — model loads, transcription executes, word timestamps supported. The synthetic fixture webm is silence-only so no segments are produced from it; real owned media is needed for quality assessment.

Setup commands:

```bash
# Create ASR venv and install faster-whisper
uv venv ~/.local/share/lingotorte/asr-venv --python 3.12
source ~/.local/share/lingotorte/asr-venv/bin/activate
uv pip install faster-whisper

# Run transcription (after activating venv)
python3 scripts/faster_whisper_transcribe.py --audio /absolute/path/audio.wav --language pl --model tiny --device cpu --compute-type int8 --word-timestamps
```

Model/cache/scratch artifacts are kept out of git. The venv and model cache live under `~/.local/share/lingotorte/` and `~/.cache/huggingface/` respectively.

### B4 safe runtime verification and benchmark gate

The ASR harness can be re-verified without a private owned-media benchmark by using dependency-free CLI shape checks, fake-module/unit tests, and the synthetic fixture smoke below. The synthetic fixture is silence-only, so a zero-segment transcript is an expected harness result rather than a quality signal.

Safe local checks:

```bash
python3 scripts/faster_whisper_transcribe.py --help
python3 scripts/whisperx_align.py --help
npm test -- --run tests/core/localTranscriptionPipeline.test.ts tests/core/localService.test.ts
npm test -- --run tests/core/b6SourceMediaSnippet.test.ts tests/web/p6PracticeFrontend.test.ts
npm run test:no-network
```

Optional synthetic smoke, only when the already-approved local ASR venv and cached tiny model are present; keep HuggingFace offline flags set so this cannot silently download a model:

```bash
tmpdir=$(mktemp -d /tmp/lingotorte-b4-asr-smoke.XXXXXX)
trap 'rm -rf "$tmpdir"' EXIT
ffmpeg -hide_banner -y -i fixtures/media/synthetic-polish-dialogue.webm -vn -ac 1 -ar 16000 -c:a pcm_s16le "$tmpdir/synthetic.wav"
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 \
  ~/.local/share/lingotorte/asr-venv/bin/python \
  scripts/faster_whisper_transcribe.py \
  --audio "$tmpdir/synthetic.wav" \
  --language pl \
  --model tiny \
  --device cpu \
  --compute-type int8 \
  --word-timestamps
```

2026-07-05 fallback-chain receipt: `ffmpeg` 8.1.2, ASR venv Python 3.12.3, and `faster-whisper` 1.2.1 were present; `whisperx` was not installed, so WhisperX-style alignment remained covered by the dependency-lazy CLI/fake-module tests rather than a live alignment run. The offline synthetic tiny-model smoke returned `engine=faster-whisper`, `model_name=tiny`, `model_version=1.2.1`, `language=pl`, and `segments_count=0`, matching the silence-only fixture expectation. Live owned-media quality benchmarking was skipped because no exact approved owned local clip path was provided.

Run the tiny/base quality benchmark only when a task provides an exact owned local media path or an explicit approved local selection rule. Record model tier, runtime vs. media duration, transcript usability, word-timing notes, and whether tiny CPU is daily-use candidate or smoke-only. Do not search Janusz media folders, download models, install heavyweight dependencies, call cloud providers, or commit media/model/cache/scratch artifacts to satisfy B4.

**2026-07-21 benchmark done.** The tiny-vs-base quality benchmark was run on an approved owned Polish clip (i7-12700KF, CPU/int8, 300 s slice): tiny ~13× realtime, base ~8.5× realtime, both faster-than-realtime; base is materially cleaner on proper nouns/numerals (mean word prob 0.876 vs 0.795). Recommendation adopted: **`base` int8 CPU is the Polish daily-use default, `tiny` the fast smoke/fallback tier**; both remain draft-only until the correction/approval pass. Full receipt with commands and transcript samples: `docs/dev/b4-asr-quality-benchmark-2026-07-21.md`.

Cloud STT remains an explicit per-run decision because it sends local audio/media to ElevenLabs. Keep API keys out of logs, fixtures, commits, and screenshots.

## Known V1/V4 limitations

- The app is a local browser/Vite baseline, not a packaged desktop/mobile product.
- Browser local-file imports persist learner/transcript metadata through the local service. Plain file-input imports still use session-scoped `blob:` media URLs. Supported browsers also offer **Import persistent media handle**, which stores a stable `browser-file-handle:<name>` source label, persists the FileSystemHandle in IndexedDB (`lingotorte-handle-store` database), and uses a transient object URL for playback; on reload or local-service state load, the app installs the IndexedDB handle store at startup, revalidates the persisted browser handle permission, and recreates the object URL when permission is granted. The player shows a **Relink media** prompt with the current browser permission state and a clear error message when the handle is unavailable, permission is denied, the stored handle is missing/stale, or the media reference is only a plain session-scoped `blob:` URL; the relink placeholder also notes that browser handles are playback/relink identity only and the local service still needs an explicit absolute owned local media path for ASR/ffmpeg/ffprobe/snippets. Use **Relink media** to regrant the saved handle or **Choose media again** to replace it. For local-service ASR, paste the owned media's absolute local path into **Local service ASR media path** whenever the current browser media reference is a `blob:` URL or browser handle label rather than a service-readable absolute path.
- Export builds a local **learner-state export v1** manifest: an active-only learner subset, not a full backup and not full recovery (lt-7lq). Included collections are exactly `savedItems`, `savedOccurrences`, `reviewCards`, `reviewCardStates`, active `reviewEvents` and active `practiceAttempts`, plus a `sourceContexts` decode dictionary holding each record's captured source context (cue IDs, media paths, content hashes). Excluded: media files, `mediaAssets`, `mediaObservations`, `subtitleTracks`, `cues`, `transcriptWordTimings`, retained inactive review/practice `learnerAudit`, `exportJobs`, `importJobs`, `importJobEvents` and `providerPolicies` (constants `LEARNER_EXPORT_INCLUDED_COLLECTIONS` / `LEARNER_EXPORT_EXCLUDED_COLLECTIONS`). Practice attempts are exported with their captured context and `eventLink` unchanged; export does not enrich them from current track metadata.
- Distinguish these independent facts: (1) **learner subset** — what the file contains, above; (2) **semantic integrity** — schema plus sha256-per-record root hash of the manifest content, not a file hash; (3) **physical-file verification** — only **Save export to chosen file** (File System Access) reads the written file back; browser downloads are not read back; (4) **retained audit** — after Replace all, prior review/practice payloads stay local as inactive audit and are never in the learner export; (5) **durable acknowledgement** — a restore is durable only when the receipt says durable readback verified; disconnected restores are session-only.
- Importing into a fresh app restores learner records only. Library, media, cues and jobs are not recreated, so practice/review show **Source cue/media not available in this app; playback unresolved** with the captured reference until the media and subtitles are re-imported or relinked. A consistent DB backup, not this export, is the full-state recovery mechanism. Integrated file-backed restore/reopen qualification is lt-2t4; any broader media/metadata bundle is deferred (lt-42c).
- Restore supports both merge/update and a destructive **Replace all** mode. Merge/update upserts records from the manifest into existing local learner state. **Replace all** removes current active learner records (saved items, occurrences, review cards/states/events, practice attempts) absent from the file, retains prior review/practice payloads locally as inactive audit (not erasure, not full undo, not in learner export), and is mutually exclusive with merge/update. After restore, a **Restore complete** receipt displays the selected mode, manifest integrity result (semantic sha256-per-record, distinct from File System Access write/readback verification), operation counts, acknowledged warnings, and a no-media-copied note. Selective conflict review and rollback remain future backup/restore product work.
- The export/restore path is no longer just a preview placeholder, but the broader backup product still needs a user-facing decision on metadata-only versus optional media-copy bundles, destination semantics, and richer conflict handling.
- Live provider execution, networked ASR/model downloads, AnkiConnect, cloud sync, live Lingopie inspection, pronunciation/shadowing, and public sharing remain disabled or gated unless separately approved. The browser UI transcript lifecycle controls use fake/default-safe providers, a gated public YouTube caption job through the loopback service, real local ASR jobs with an absolute local media path plus separately installed local ASR dependencies, and an explicit opt-in ElevenLabs Scribe v2 control that requires the service online-provider gate plus `ELEVENLABS_API_KEY`.
