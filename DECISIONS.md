# Lingotorte decisions for autonomous development

Status: current human-decision record for continuing Lingotorte development through the current `PLAN.md` backlog with minimal human intervention.

Use this file as an implementation-facing supplement to `PLAN.md`, `docs/review/safety-privacy-boundary-review.md`, and `docs/dev/local-runbook.md`. It resolves product/authority choices that older planning docs leave open. It does **not** supersede the safety/privacy boundary review or the hard non-authorizations in `PLAN.md`.

## Worker authority and escalation rule

For repo-local Lingotorte implementation work, agents may proceed through the current backlog using the decisions below without asking Janusz again when the action is local, reversible, testable, and inside the active repo/local-service boundary.

Agents must still stop and ask/block for:

- push, PR, release, public deployment, hosted exposure, or public sharing;
- destructive changes to Janusz's real learner state, media library, provider accounts, or external apps;
- DRM/circumvention, browser credential/cookie use, private/account-gated media access, or automatic online media download;
- any action with plausible Terms-of-Service/account-lock/account-ban risk;
- cloud sync, AnkiConnect mutation, microphone/learner-voice capture, or provider classes not explicitly allowed below;
- committing secrets, API keys, raw provider request/response bodies, model caches, generated media/audio/transcript scratch artifacts, or private absolute paths in default exports/logs/fixtures.

When a slice can be implemented safely without a live external/provider action, prefer fake/local tests plus a clear manual/live-smoke recipe over blocking.

---

## Resolved and deferred decisions

### 1. `provider_policy` v7 exact shape and semantics

Decision: implement v7 as scoped, mutable local governance metadata with no event stream yet. Add audit only when policy changes become user-visible/history-relevant.

Implementation semantics:

- Row absence means disabled.
- Credentials stay env-only; do not store API keys in SQLite, fixtures, logs, docs, or exports.
- `enabled` and `requires_confirmation` are distinct: durable provider enablement is not the same as per-run confirmation.
- Keep provider IDs bounded/typed where practical, but allow flexible future data-class strings when needed.
- Do not add provider calls, model downloads, cloud sync, or request-body logging as part of the storage/projection slice.

---

### 2. Browser File System Access vs. native/Tauri/local-service path model

Decision: use a split model:

- **Browser File System Access handles** are the preferred browser-side path for local playback/relink identity when supported.
- **Local-service absolute paths** are the preferred durable execution path for service-side work: ASR, ffmpeg/ffprobe, embedded subtitle extraction, source-media snippet extraction, and future heavyweight local processing.
- If the current browser media reference is a `blob:` URL or `browser-file-handle:<name>` label, keep requiring an explicit absolute owned local media path before local-service jobs can read the file.
- Redact/private-path handling remains required in status, logs, screenshots, exports, and committed artifacts.

Possible future enhancement: Tauri/desktop bridge, if browser + loopback service remains too awkward after B2/B3/B6/B7 polish.

---

### 3. Backup/export product semantics

Decision: define B3 as **metadata backup v1** first: JSON manifest + integrity + dry-run/readback restore + merge/replace semantics + no media copy.

Implementation semantics:

- Metadata backup may include learner state, transcript/cue text, review/practice history, provider/export metadata, and media references.
- It must warn that cue text, notes, review history, and media refs may be private.
- It must not copy media by default.
- Optional media-bundle backup is a later design after clip/snippet storage needs are clearer.
- Tests and autonomous validation should use isolated/temp stores or synthetic fixtures. Do not run destructive **Replace all** flows against Janusz's real learner state without a fresh exact approval.

Caveat: backup is not a high-priority feature at this time.

---

### 4. Export integrity semantics

Decision: yes, eventually store raw exported-file hash/readback hash separately, but not now.

Current B3 semantics:

- Keep `manifest_sha256` as semantic manifest integrity.
- If B3 becomes a file/bundle product, add a separate field/table for physical artifact hash/readback hash.
- Do not overload `manifest_sha256` to mean both logical manifest integrity and physical file integrity.

---

### 5. Local ASR benchmark acceptance

The local ASR dependency path exists, but “good enough for daily use” is not yet decided.

Decision: run one B4 benchmark on a short real owned Polish clip with tiny/base comparison, then decide whether “tiny CPU” is acceptable or only useful as smoke coverage.

Autonomous execution boundaries:

- B4 quality benchmarking is **optional/non-blocking** for other current backlog slices.
- Do not invent or search private media broadly. Use a benchmark clip only if the task provides an exact owned media path or an explicit approved local selection rule.
- The media must be owned/authorized local media and must not be private/account-gated downloaded content.
- If no approved benchmark input is available, implement/maintain the benchmark harness and runbook recipe, but report the live benchmark as skipped rather than blocking unrelated work.

Benchmark dimensions to record when an approved clip is available:

- language: Polish first;
- model tiers: tiny CPU/int8 and base CPU/int8 unless the task narrows this;
- wall-clock runtime vs media duration;
- transcript usability notes;
- word-timing availability/quality notes;
- memory/disk/cache footprint if cheap to measure;
- recommendation: tiny as daily-use candidate, tiny as smoke-only, or base/small required.

Caveat: local ASR is not super-high priority; Janusz expects to primarily use cloud models/services personally.

---

### 6. Online provider policy

The app already has gated ElevenLabs Scribe and public YouTube captions, but policy needs durable product semantics.

Known current boundary:

- Providers disabled by default in fresh installs, tests, and unconfigured environments.
- API keys env-only.
- No raw provider request/response bodies in logs, fixtures, commits, or default exports.
- Provider outputs remain draft/untrusted until corrected and approved for study.

Decision: for Lingotorte development, Janusz approves hands-off use of the specific provider interactions below, favoring auditability over repeated approval prompts, **except** when there is plausible Terms-of-Service, account-lock, account-ban, credential, private-source, DRM, or rights risk.

Allowed without further human approval, when the code path already has visible/service gates and redaction:

1. **ElevenLabs Scribe v2 STT for owned local audio/video**
   - Requires `ELEVENLABS_API_KEY` outside git and `LINGOTORTE_ALLOW_ONLINE_PROVIDERS=true` in the service environment.
   - Requires explicit UI/service authorization for the run.
   - Sends only the intended owned local media/audio for transcription.
   - Records redacted status/receipt metadata, not raw request bodies or secrets.
   - Imports the result as a draft `online-asr` transcript with provenance and word timings where available.
   - Keeps learner-state saves blocked until correction/approval.

2. **Public YouTube caption metadata/text reads**
   - Requires a user-provided public/authorized URL or video ID.
   - Requires the visible public-read authorization and service online-provider gate.
   - Reads public caption metadata/text only.
   - Does not download media.
   - Does not use cookies, browser credential paths, private/account-gated access, or DRM/circumvention.
   - Imports captions as draft/untrusted tracks requiring correction/approval.

Still requires fresh approval or must block:

- YouTube/media download execution, even via `yt-dlp`; command display remains okay with rights warning.
- Cookie/credential/browser-profile access for media or caption retrieval.
- Private/account-gated videos or sources.
- Any ToS/account-risky source or workflow.
- Online translation, online dictionary, online LLM explanations, online pronunciation scoring, or any provider not named above.
- Sending learner notes, review history, or broader cue context to providers unless separately approved.
- Raw provider payload logging or committing provider outputs/scratch artifacts that contain private media/text.

---

### 7. Translation / explanation quality

B5 morphology is mostly complete, but richer explanations are still open.

Decision: next B5 slice should be **local-service Morfeusz quality surfaced in UI**, not online LLM explanations. Keep LLM translation/explanation as later opt-in.

Implementation semantics:

- Prefer local/offline dictionary, morphology, and grammar affordances first.
- Preserve typed available/unavailable/error states; do not use loose provider blobs for core UI state.
- Online translation/LLM explanation remains disabled by default and outside the current autonomous lane.
- If a local-service Morfeusz path is added or expanded, keep browser heuristic fallback and visible low-confidence/ambiguous analysis warnings.

---

### 8. Clip/audio snippet generation

B6 remaining work depends on media/file decisions.

Decision: current B6 snippet generation means **source-media clip/audio snippets from owned local media**, not provider-generated replacement audio.

Implementation semantics:

- Generate snippets on demand first from owned local media via browser playback ranges or local-service ffmpeg, depending on the slice.
- Source must be local/owned media reachable through a browser handle/object URL for playback or an explicit absolute local path for local-service extraction.
- Do not download online media to make snippets.
- Do not use Lingopie/proprietary media.
- Add durable snippet cache only after B3 backup semantics are settled.
- Cache cleanup should be explicit and testable: session-only, LRU, per-deck cache, or explicit delete can be chosen by the implementing slice as long as it is local and documented.
- Snippets may later become part of export/backup only behind explicit media-copy/export warnings.

ElevenLabs/TTS clarification:

- ElevenLabs-generated TTS snippets or pronunciation prompts are a separate future provider/TTS lane.
- They are not the default implementation for B6 source-media snippets.
- Any TTS lane must disclose that selected text/cue content is sent to a provider and must remain opt-in.

---

### 9. Embedded subtitle extraction

B7 has parsing and offset tools, but embedded extraction is not implemented.

Decision: local-service `ffprobe` track listing first, then explicit user-selected extraction. Persist transcript text/timing/provenance, not styling, unless a real use case appears.

Implementation semantics:

- Use local `ffprobe`/`ffmpeg` only for owned local media paths.
- List embedded tracks with enough metadata for explicit user selection.
- Extraction should create draft/imported transcript tracks with provenance.
- Preserve draft/correction/approval semantics.
- ASS/SSA style/position metadata should remain non-persisted unless a real product use case appears.
- Do not capture protected streams or use DRM/circumvention.

---

### 10. Future Anki path

Anki remains B8/future.

Known current posture:

- AnkiConnect is separately gated.
- No external app mutation by default.

Decision: `.apkg`/file export first, AnkiConnect later if needed.

Implementation semantics:

- Lingotorte remains the source of truth for learner/review state unless Janusz later chooses otherwise.
- `.apkg` or file export should include privacy warnings for cue text, notes, review history, and optional media snippets.
- Do not mutate a live Anki collection through AnkiConnect without fresh approval.

---

### 11. Pronunciation / microphone / shadowing

Future gated lane.

Known boundary:

- Microphone recording remains separately gated.

Decision: defer until clip/snippet generation exists; source-audio recall is lower-risk than learner microphone capture.

Implementation semantics:

- Current autonomous B6 work may use source-media audio snippets for recall/practice.
- Do not implement learner microphone recording, cloud pronunciation scoring, or learner-voice retention without fresh approval.
- If/when microphone work is approved, it needs explicit permission UX, temp-file deletion semantics, and tests for retention behavior.

---

### 12. Cloud sync

Future gated lane with a full threat-model requirement.

Decision: do not touch until the local backup/restore story is strong. B3 is prerequisite.

Implementation semantics:

- No cloud sync implementation in the current autonomous lane.
- No upload of DB, cue text, notes, review history, media refs, or media files.
- Future sync requires separate architecture, encryption, conflict-resolution, identity, and privacy review.

---

### 13. Desktop/PWA packaging

Future lane.

Decision: do not package yet. Let B2/B3/B6/B7 reveal whether browser+loopback is enough.

Implementation semantics:

- Browser + loopback local service remains the current target.
- Tauri/Electron/native packaging is deferred unless the local-file/daily-driver story requires it.
- Do not add auto-update, public distribution, installer signing, or cross-platform packaging work in the current autonomous lane.
