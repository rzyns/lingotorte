# Lingotorte local runbook

Status: V4 local transcription runbook. This document describes how to run and inspect the current local baseline without enabling cloud sync, AnkiConnect, live Lingopie inspection, public sharing, public-internet writes, external account mutation, or unapproved media/model downloads. The transcript lifecycle lane includes fakeable/local adapter seams for provider captions, real local ffmpeg/faster-whisper/WhisperX-style command adapters, and explicit-opt-in ElevenLabs Scribe v2 cloud STT. Generated/provider tracks must be corrected and approved before learner study use.

## Scope and safety posture

Lingotorte currently runs as a local Vite/TypeScript web app over synthetic fixtures and browser-selected local media/subtitle files:

- media fixture: `fixtures/media/synthetic-polish-dialogue.webm`
- target subtitles: `fixtures/subtitles/synthetic-polish-dialogue.target.srt`
- native subtitles: `fixtures/subtitles/synthetic-polish-dialogue.native.srt`
- fixture provenance: [`../../fixtures/README.md`](../../fixtures/README.md)

The fixture set is synthetic/local and contains no Lingopie media, subtitles, screenshots, catalog data, account data, private API payloads, branding, tokens, or private examples. The Library view also exposes browser local file inputs for Janusz-owned media plus target `.srt` and optional native `.srt` subtitles. Those browser imports stay on-device by using object URLs for media and `File.text()` for subtitle contents; they are not uploads and do not invoke a provider. Product boundaries remain governed by [`../review/safety-privacy-boundary-review.md`](../review/safety-privacy-boundary-review.md). Public documentation links in planning files are evidence references only; the runtime app must not depend on public Lingopie services or provider calls.

## Prerequisites

- Node.js and npm matching the lockfile environment.
- A checkout of this repo.
- The npm cache already populated if running in no-network/offline mode.

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

## Local dev server

Start the app on loopback only:

```bash
npm run dev -- --host 127.0.0.1
```

Use the localhost URL printed by Vite, commonly `http://127.0.0.1:5173/`. Treat the dev server as a tracked local process. Stop it after browser smoke and record the log/PID in the external acceptance packet.

## Browser smoke script

Use WSL Edge DevTools when available. Regular browser tooling is an acceptable fallback if Edge DevTools is unavailable.

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
13. Open **Export / Import**, click **Generate local export**, and verify the privacy-warning summary appears.
14. Open **Settings** and verify provider/sync/Anki/ASR states remain disabled.
15. Inspect console and network requests after navigation and interactions.

For a local-file smoke, return to **Library**, choose an owned `.mp4`/`.webm`/`.mkv`/`.mov`/audio media file, choose a target `.srt`, optionally choose a native `.srt`, then click **Import local media**. Verify the player uses a `blob:` media URL, the transcript shows the selected target cue text, the optional native cue text is displayed when provided, and replacing imported media revokes the previous object URL without uploading anything.

Acceptable network traffic during dev smoke is limited to loopback/local dev-server reads, `data:`/`blob:` URLs, and Vite internals. Public-internet writes, provider calls, external account mutations, or runtime requests to an external host are V1 blockers unless Janusz has explicitly approved that exact opt-in path.

## V3 transcript lifecycle smoke

The P7 transcript lane is implemented as a local/fakeable lifecycle slice. It does **not** fetch live YouTube captions, download media, install ASR models, or call network providers during default smoke.

1. Open **Library** and locate **Transcript lifecycle**.
2. Click **Import fake YouTube caption draft** without checking the authorization box; verify the action is blocked before adapter execution and no transcript appears.
3. Enter or keep a public YouTube URL/video id, check **I authorize a public caption metadata read**, and click **Import fake YouTube caption draft**.
4. Verify the current transcript is labeled `draft` with `youtube-auto-caption` provenance/warnings.
5. Open **Player** and verify **Save sentence** is disabled with the approval-gate message.
6. Return to **Library**, edit at least one cue in the correction textareas, and click **Create corrected transcript version**.
7. Verify the current transcript is `correcting`, then click **Approve transcript for study**.
8. Return to **Player** and verify **Save sentence** is enabled and saves the corrected cue text.
9. Optional local-only ASR seam: after loading any local/synthetic media, use **Generate fake local ASR draft** and verify the resulting track is a `draft` `local-asr` track with `asrDraft` warnings.

Live YouTube caption retrieval and actual media acquisition remain separate, explicitly gated future work. `planYtDlpMediaAcquisition()` only produces a safe command plan; it does not execute `yt-dlp`.

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

Cloud STT remains an explicit per-run decision because it sends local audio/media to ElevenLabs. Keep API keys out of logs, fixtures, commits, and screenshots.

## Known V1/V4 limitations

- The app is a local browser/Vite baseline, not a packaged desktop/mobile product.
- The browser UI exposes local file pickers for owned media plus target/native `.srt` subtitles, but those imports are still browser-session object URLs unless later persisted through the local service/storage layer.
- Export currently generates and previews a local learner-state manifest and file path; it does not write a manifest file to disk.
- Restore currently merges/upserts records from the manifest into existing local learner state; it does not clear unrelated local records or provide a full replace mode.
- The export path remains a placeholder until a user-chosen local export/download workflow is designed.
- Live provider execution, networked ASR/model downloads, AnkiConnect, cloud sync, live Lingopie inspection, pronunciation/shadowing, and public sharing remain disabled or gated unless separately approved. The current browser UI transcript lifecycle controls still use fake/local adapters; real ffmpeg/faster-whisper/WhisperX/ElevenLabs adapters are Node-side seams with explicit invocation boundaries.
