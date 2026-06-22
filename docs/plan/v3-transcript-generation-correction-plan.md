# Lingotorte V3 Transcript Generation + Correction Plan

Status: follow-up planning lane after V2 Local I/O + Conflict UX.

Source request: Janusz wants Lingotorte to support generating transcripts locally, and also using YouTube-provided transcripts/subtitles after checking and correcting them because provider captions can be inaccurate.

Retrieval / skill review date: 2026-06-22.

## Relevant existing Hermes skills

Use these existing skills when implementing or operating this lane:

| Skill | Role in this plan | Key workflow evidence |
|---|---|---|
| `youtube-content` | Fetch YouTube-provided transcripts/captions and playlist metadata without downloading media by default. | Uses `youtube-transcript-api`; playlist reference uses `yt-dlp --flat-playlist --dump-single-json`; fallback guidance prefers `uvx` so the Hermes runtime venv is not mutated. |
| `youtube-content` reference `references/playlist-workflow.md` | Batch/playlist shape and `yt-dlp` metadata enumeration. | Demonstrates `uvx --from yt-dlp yt-dlp --flat-playlist --dump-single-json "$PLAYLIST_URL"`. |
| `youtube-content` reference `references/transcript-fetching-fallbacks.md` | Dependency and transcript-access fallbacks. | Prefer `uvx --from youtube-transcript-api ... fetch_transcript.py "URL" --timestamps`; validate segment count/duration/language. |
| `local-video-transcription-subtitles` | Generate local ASR subtitles from owned/local audio/video, correct SRTs, mux/verify outputs. | Uses `ffmpeg` for audio extraction, local Whisper-style ASR, manual correction, SRT sidecar, muxing, and `ffprobe` verification. |
| `local-video-transcription-subtitles` reference `references/tvp-vod-clip-subtitles.md` | Concrete clip/subtitle production pattern. | Treat provider captions as search/timing clues; use ASR + correction for actual transcription when requested. |
| `media-scene-identification` | Optional support skill for searching captions/transcripts to find moments before cutting/importing. | Useful for caption keyword/window search, timestamp verification, and distinguishing caption clues from proof. |

Tool choice: prefer `yt-dlp` over legacy `youtube-dl` for new work because it is the maintained fork and is already referenced by the available `youtube-content` workflow. Use `youtube-dl` only as a fallback if a specific environment requires it.

## Governing constraints

- Preserve `AGENTS.md` and `docs/review/safety-privacy-boundary-review.md` boundaries.
- Do not download, decrypt, proxy, or capture DRM/protected streams.
- YouTube/media download is allowed only for videos Janusz/user owns, has explicit permission to download, or that are otherwise legally/licensably safe for local personal use.
- Default YouTube integration should be **metadata/caption read-only** and **skip media download**.
- Public-internet reads for YouTube caption metadata are opt-in per import action and must be visibly labeled; public-internet writes remain disallowed without explicit approval.
- Provider captions, auto-captions, and ASR results are **draft evidence**, not truth. They must remain reviewable/correctable before becoming the approved track used for saved occurrences, review cards, or exports.
- Store browser-visible/source metadata and stable IDs, not private absolute host paths.
- Keep online ASR/translation/LLM providers disabled by default in fresh installs, tests, and unconfigured environments; Janusz's personal target deployment may explicitly enable ElevenLabs as the first real STT provider.
- Lingotorte must not automatically download online media. It may generate exact `yt-dlp` commands for the user to copy/run after a rights/permission notice, then import the resulting local file.
- Word-level timestamps are a near-term product requirement, not a distant nice-to-have. Generated transcript adapters should return word timings directly or pair transcription with forced alignment.

## Resolved engine direction as of 2026-06-22

Janusz approved the following implementation direction for non-fake transcript generation:

| Lane | Direction | Rationale / caveat |
|---|---|---|
| First real STT target | **ElevenLabs Scribe v2** behind an explicit provider opt-in/configuration gate. | Best immediate fit for Lingotorte because it documents word/character-level timestamps, speaker diarization, broad language support, and a clean managed API. |
| Future local/offline option | WhisperX + faster-whisper-style local pipeline as an opt-out/fallback for users who do not want cloud STT. | Preserves the local/private ethos and gives forced-alignment word timings, but is operationally heavier. |
| Benchmark / possible later provider | Microsoft MAI-Transcribe-1.5. | Strong long-form accuracy/speed candidate; adopt only after a spike proves usable word-timestamp output or a reliable local forced-alignment pairing. |
| Not first STT engine | Phi-4-multimodal. | Promising speech-understanding model, but not the first choice for long, word-timestamped transcript generation. |
| Optional TTS later | ElevenLabs TTS first if TTS is needed; MAI-Voice as a later long-form/benchmark candidate. | TTS is useful for review/pronunciation aids but is secondary to transcript generation and remains opt-in because it sends text/cue content to a provider. |

Fresh/unconfigured Lingotorte builds still keep all online providers off. "Target ElevenLabs" means the first production-quality provider adapter should be ElevenLabs Scribe v2, not that tests or default installs may silently call it.

## Product model: transcript source lifecycle

Add an explicit transcript/caption lifecycle instead of treating all subtitle files as equally trusted:

```text
source candidate -> draft transcript track -> correction workspace -> approved transcript track -> learning artifact source
```

Recommended statuses:

| Status | Meaning | Learning use default |
|---|---|---|
| `candidate` | Raw provider caption, raw ASR, or imported sidecar before validation. | Not usable for saved learning artifacts. |
| `draft` | Parsed, normalized, and visible in the editor/player with provenance and warnings. | Playable/searchable; saving creates warning unless user explicitly allows draft use. |
| `correcting` | User is editing cue text/timing/segmentation. | Not final; saved items should reference versioned draft hash if allowed. |
| `approved` | User accepted this track for study. | Default source for transcript, cue loops, saved words/sentences, and review cards. |
| `superseded` | Older draft/approval replaced by a newer corrected track. | Existing saved occurrences keep old version references; new saves use latest approved track. |

Each track should carry provenance:

- `sourceKind`: `user-subtitle-file` | `youtube-caption` | `youtube-auto-caption` | `online-asr` | `local-asr` | `forced-alignment` | `manual-edit`
- `sourceUrl` or `sourceVideoId` when user provided a public URL
- `retrievedAt` / `generatedAt`
- `language`
- `isAutoGenerated` when known
- `engine` / `model` for ASR, e.g. `elevenlabs/scribe_v2`, `whisperx+faster-whisper`, `mai-transcribe-1.5`, model name/version
- word-level timing provenance: provider-native word timing vs forced alignment, confidence/logprob when available, and speaker ID when provided
- `parentTrackId` and `parentTrackSha256` for corrected tracks
- warning flags such as `lowConfidence`, `timingUnverified`, `autoCaption`, `downloadRightsUnverified`

## Slice A — YouTube caption/transcript candidate import

Goal: let the user paste a YouTube URL and import available caption/transcript tracks as draft candidates without downloading the video by default.

Implementation direction:

1. Add a gated **Import from YouTube captions** action in the Library view.
2. Use the `youtube-content` workflow in an app-side/local helper:
   - `youtube-transcript-api` for caption/transcript segments;
   - `yt-dlp --skip-download --write-subs --write-auto-subs` as a fallback/spike candidate if direct transcript API access is insufficient;
   - `yt-dlp --flat-playlist --dump-single-json` only for playlist/batch metadata enumeration.
3. Normalize retrieved segments into Lingotorte `SubtitleTrack` records with `status: 'draft'` and provenance.
4. Show a warning banner: provider captions may be inaccurate; review/correct before using for study.
5. Preserve no public-internet writes. The user-initiated read should be visible and testable separately from the default no-network mode.

TDD shape:

- RED: URL import with a fake YouTube caption provider returns a draft track labeled `youtube-caption` and does not create learner-state objects.
- GREEN: add typed provider interface and fake implementation.
- RED: auto-generated captions show `autoCaption` warning and require correction/approval before default study use.
- GREEN: add warning state and approval gate.
- RED: providers disabled/no-network mode blocks the action with a local disabled message and zero HTTP calls.
- GREEN: wire provider-disabled state through existing no-network harness.

## Slice B — Optional YouTube media acquisition / local file handoff

Goal: support local playback of YouTube-sourced media only when rights and technical constraints allow it, without making download the default caption-import path.

Recommended UX:

- Primary path: user imports captions from YouTube, then supplies an owned/local media file through the existing local file import control.
- Optional advanced path: user explicitly chooses **Show yt-dlp command** after a rights/permission notice; Lingotorte displays the exact CLI command for copy/paste but does not run it automatically.
- Store resulting media as a local owned/permissioned file reference or browser object URL, not as a remote dependency.

Operational boundary:

- Use `yt-dlp`, not `youtube-dl`, as the default tool.
- Use no DRM/circumvention flags or protected-stream bypasses.
- Do not persist cookies or browser credentials in the repo.
- Do not download private/account-gated videos unless Janusz explicitly approves the specific source and credentials boundary.

Possible command shape to display to the user, not execute from browser runtime code:

```bash
uvx --from yt-dlp yt-dlp \
  --no-playlist \
  --write-subs --write-auto-subs --sub-format srt/vtt \
  --paths '<user-chosen-local-library>' \
  '<youtube-url>'
```

TDD / verification shape:

- Keep the actual downloader behind an adapter that is fakeable in tests.
- Unit tests assert command planning does not include cookies, credential paths, DRM bypass flags, or repo-relative output paths.
- Integration tests use a local fake downloader, not live YouTube.
- A live downloader smoke is a manual/approval-gated operation with a public-domain/owned test video only.

## Slice C — ElevenLabs Scribe v2 transcript drafts

Goal: generate non-fake transcript/subtitle drafts from actual local audio/video when no good subtitle exists or provider captions are poor, targeting ElevenLabs Scribe v2 as the first production-quality STT provider.

Implementation direction:

1. Extract local audio with `ffmpeg` to a provider-accepted format, or pass the user-selected local audio/video file when the provider supports it.
2. Require explicit provider configuration/consent before sending audio. Disabled provider state must fail before any network call.
3. Call ElevenLabs Scribe v2 with word-level timestamp output enabled and diarization optional/configurable.
4. Generate draft VTT/SRT/JSON cues plus first-class word-timing rows with timing, confidence/logprob where available, speaker IDs when available, and model provenance.
5. Normalize into the same `TranscriptTrack` / `SubtitleTrack` lifecycle as YouTube captions.
6. Store provider output as local draft transcript artifacts; do not store API keys, raw request bodies, or raw provider logs in the repo/export by default.

TDD shape:

- RED: disabled ElevenLabs provider refuses transcription before adapter/network execution.
- GREEN: add provider-policy gate and redacted request logging.
- RED: fake ElevenLabs adapter produces draft cues and word timings with `sourceKind: 'online-asr'`, engine/model provenance, and warning flags.
- GREEN: add Scribe-shaped adapter contract and draft import path.
- RED: parse/generation failure does not mutate the current approved track or learner state.
- GREEN: transactional import semantics.
- RED: temporary audio/work directories and provider request details are not stored in exported learner state.
- GREEN: store only transcript artifacts/provenance, redacted provider metadata, and word-timing rows.

## Slice C2 — Future local model opt-out/offline lane

Goal: add a local/offline transcription option for users who opt out of cloud STT or want fully local processing.

Implementation direction from `local-video-transcription-subtitles`:

1. Extract local audio with `ffmpeg` to mono 16 kHz WAV or stream directly into the chosen ASR engine.
2. Run a local pipeline such as WhisperX + faster-whisper after dependency/model license and hardware checks.
3. Prefer local forced alignment that emits word-level timestamps. If a local model only emits segment timings, mark word timing as unavailable/low-confidence rather than inventing it.
4. Normalize local output into the same draft/correction/approval lifecycle as ElevenLabs and YouTube captions.
5. Model downloads and Python/GPU dependencies remain separate package/model action gates.

## Slice D — Correction and approval workspace

Goal: provide a dedicated UI for reviewing, correcting, and approving transcript drafts before they feed the learning workflow.

Required editor capabilities:

- side-by-side video/player + transcript cue list;
- editable cue text;
- timing adjustment at cue level;
- word-level timing inspection/correction where provider or forced-alignment data is available;
- split/merge cue operations;
- mark uncertain/misheard words;
- compare tracks when available, e.g. YouTube caption vs ElevenLabs draft vs future local ASR vs native subtitle;
- keyboard-friendly playback shortcuts: replay cue, slow playback, jump previous/next;
- visible provenance and warning badges per track;
- explicit **Approve transcript for study** action.

Data semantics:

- Corrections create a new versioned track, not in-place mutation of raw provider/ASR output.
- Saved words/sentences/review cards reference the exact approved track version and cue ID/hash used at save time.
- If a track is later corrected, existing saved occurrences remain valid but can show “source transcript updated” and offer a re-anchor/review action.

TDD shape:

- RED: draft track cannot become the default study track until approved.
- GREEN: add approval state and UI affordance.
- RED: correcting cue text creates a new corrected version with parent hash/provenance.
- GREEN: implement immutable track versioning.
- RED: saved occurrence records approved track version ID and cue hash.
- GREEN: extend source-context model and regression tests.

## Slice E — Quality report and confidence gates

Goal: make transcript quality visible so inaccurate captions do not silently poison vocabulary/review data.

Quality report fields:

- source type and generation method;
- language detected/requested;
- segment count and coverage duration;
- empty/very short/overlong cue counts;
- overlapping cue count;
- suspicious timing gaps;
- ASR confidence summaries if available;
- track comparison diffs when multiple sources exist;
- manual correction count;
- approval timestamp/user action.

Acceptance criteria:

- Every non-manual transcript track has a visible quality/provenance panel.
- Auto-caption and ASR tracks start with a warning state.
- Approval is explicit and persisted.
- Export/backup includes transcript provenance and warnings.
- No raw YouTube/private credentials, cookies, or local absolute paths are stored in committed artifacts or default exports.

## Updated roadmap placement

Recommended milestone placement:

- V2 completed: browser local media/subtitle import, export/download, restore conflict preview.
- V3a: typed transcript-track lifecycle and correction/approval model.
- V3b: YouTube caption candidate import using `youtube-content` workflows.
- V3c: correction editor MVP and approved-track gate for learning artifacts.
- V3d: ElevenLabs Scribe v2 adapter using explicit provider opt-in, word-level timestamps, redacted logging, and no-network disabled-state tests.
- V3e: word-level timing storage and UI affordances for clickable transcript words/spans.
- V3f: optional `yt-dlp` command generator, gated by rights/permission and no-DRM boundary; command display only, no automatic download execution.
- V3g: future local model opt-out/offline lane using WhisperX + faster-whisper-style pipeline after dependency/model/hardware review.
- V3h: Microsoft MAI-Transcribe-1.5 benchmark adapter only after verifying word timestamp or forced-alignment viability.

## Verification gates

Automated gates:

- `npm run typecheck`
- focused unit tests for transcript lifecycle/provider adapters
- frontend tests for correction/approval UX
- no-network tests proving disabled providers make zero HTTP calls
- privacy scan for URL/credential/path leaks
- `git diff --check`
- `python3 validate_final_bundle.py` when final-bundle-indexed docs change

Manual/approval-gated gates:

- Live YouTube caption retrieval only with a user-provided public URL and explicit user action.
- Live YouTube media download only for owned/authorized/public-domain/licensably safe videos.
- ElevenLabs Scribe v2 live transcription only after explicit provider configuration/consent and with redacted request logging.
- Local ASR model download/install only after an explicit package/model action gate.
- Microsoft MAI-Transcribe-1.5 live benchmark only after explicit provider configuration/consent and a timestamp-output spike plan.

## Open decisions

| Decision | Safe default | Why it matters |
|---|---|---|
| Which real STT engine first? | Resolved: target ElevenLabs Scribe v2 for Janusz's personal deployment, behind explicit opt-in/provider config. | It best matches the word-timestamped transcript UX and Janusz has access. |
| Local model path | Future opt-out/offline lane: WhisperX + faster-whisper-style pipeline after dependency/model/hardware review. | Preserves local/private operation for users who do not want cloud STT, but is not the first production adapter. |
| Do draft captions allow saving? | No by default; require approval first. | Prevents inaccurate captions from becoming durable SRS data. |
| Should Lingotorte download YouTube media itself? | No automatic downloads; show exact `yt-dlp` CLI commands for the user to run after a rights notice. | Download rights/ToS/DRM boundaries vary by video; command-generation keeps acquisition user-controlled. |
| Track versioning granularity | Immutable track versions with parent hashes. | Keeps old saved occurrences auditable after transcript corrections. |
| Word-level timestamps | Priority requirement for the ElevenLabs adapter and transcript data model. | Enables clickable words/spans, phrase looping, pronunciation/shadowing, and precise saved-occurrence anchors. |
