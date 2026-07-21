# LDM7 B7 embedded-subtitle browser UI batch manifest

Generated: `2026-07-21T13:01:19Z` (`2026-07-21T09:01:19-04:00`)
Preflight task: `t_296c3b4f`
Authorizing gate: `t_679f3cab`
Selected gate option: `accept LDM6, push the feature branch, deploy locally, and authorize next local batch: LDM7 B7 embedded-subtitle browser UI`
Workspace/worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
Branch: `lingotorte/m1-daily-driver-polish`
Preflight start HEAD: `ae2e953c0045d7c67334060c9154fd89f678afe9`
Decision receipt: `docs/plan/autonomous-batches/20260721T125340Z-ldm6-gate-decision-push-deploy-next-t_679f3cab.md`
Decision receipt SHA-256: `d77fcc88c910aa672c0eb5f11c87a4edf697343b9991d37890636fb1bd67dce6`
Remote boundary: local commits only; no push without a fresh human gate

## Artifact navigation

Role: operational
Review scope: browser/service contract, explicit local-path and stream-selection UX, draft import/provenance, path redaction, fake-only tests, Node 26.5 strip-only compatibility, validation, and human-gate routing

Derived from:

- `PLAN.md`
  - LDM4 implemented and accepted service-side embedded subtitle listing/extraction; browser UI wiring remains the active B7 gap.
- `PLAN-STATUS.md`
  - The B7 row records the accepted service capability and the outstanding browser surface.
- `DECISIONS.md` sections 2 and 9
  - Browser blob/handle labels are playback identity only; loopback jobs require explicit absolute owned local paths. Listing comes before explicit user-selected extraction, imported text remains draft, and ASS/SSA style/position is not persisted.
- `docs/plan/autonomous-batches/20260706T054314Z-ldm4-b7-embedded-subtitle-extraction-batch-manifest-t_d675b28e.md`
  - Governs the accepted LDM4 service-side listing/extraction semantics and safety boundary.
- `docs/dev/local-runbook.md`
  - Governs loopback operation, local-path redaction, offline validation, and the Node 26.5 strip-only runtime constraint.
- `docs/plan/autonomous-batches/20260721T125340Z-ldm6-gate-decision-push-deploy-next-t_679f3cab.md`
  - Records Janusz's acceptance/push/local-deploy decision for LDM6 and exact authorization for this LDM7 local batch.

Supported by:

- Kanban task `t_296c3b4f` (`LDM7-00`)
  - Active preflight/readback task that produces and commits this manifest.
- Kanban task `t_679f3cab`
  - Completed human gate whose trusted decision receipt authorizes this local-only browser UI batch.
- LDM4 accepted implementation at and after `3113ffaa7e8d7d4e514334f8587f28c97d080d32`
  - Supplies the existing `embedded-subtitle-list` and `embedded-subtitle-extract` loopback job kinds, typed track listing, explicit stream extraction, draft warning flags, and path redaction.

Feeds:

- Kanban task `t_7532544d` (`LDM7-01`)
  - Test-first implementation of the browser listing/selection/extraction/draft-import surface and the minimum service result extension needed to return parsed cues.
- Kanban task `t_4dc1a93f` (`LDM7-02`)
  - Independent read-only implementation review.
- Kanban task `t_e42c53ae` (`LDM7-03`)
  - QA integration validation and durable receipt.
- Kanban task `t_8d8f9d6e` (`LDM7-04`)
  - Final packet and human decision gate.

Verified by:

- Live Git and runtime preflight on the intended branch/worktree.
- Source-document, code, test, package-script, and existing job-response readback with SHA-256/line evidence below.
- Exact-scope manifest commit and post-commit path/hash/SHA comment on `t_296c3b4f`.

## Preflight readback

Live workspace state immediately before writing this manifest:

- Git root: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`.
- Branch: `lingotorte/m1-daily-driver-polish`.
- HEAD: `ae2e953c0045d7c67334060c9154fd89f678afe9` (`docs: record LDM6 gate decision — accept, push, deploy, authorize LDM7 B7 UI`).
- Upstream: `origin/lingotorte/m1-daily-driver-polish` at the same SHA; ahead/behind is `0/0`.
- `git status --porcelain=v1 -uall --branch`: clean before this manifest was written.
- The task starts from the authorized receipt commit and exactly satisfies the `ae2e953`-or-later baseline named by the card.
- No media was opened, no ffmpeg/ffprobe command ran, no provider/model/network path was invoked, no learner state changed, and no service, push, PR, release, deployment, or public action was performed during preflight.

Runtime constraint readback:

- The task shell resolves `node` to `/home/openclaw/.hermes/node/bin/node`, version `v22.23.1`.
- The active systemd local service launches `/home/linuxbrew/.linuxbrew/bin/npm`; the pinned linuxbrew Node is `v26.5.0` and `brew list --pinned` contains `node`.
- Therefore ordinary npm gates may run under the task shell, but the explicit strip-only syntax/import checks in this manifest must invoke `/home/linuxbrew/.linuxbrew/opt/node/bin/node` so they exercise the deployed runtime rather than accidentally proving only Node 22 compatibility.

Source documents read for this preflight:

| Artifact | SHA-256 | Lines | Scope confirmation |
|---|---:|---:|---|
| `PLAN.md` | `7bf312c0fd25b125ea205ab69a9dfeadd4444ee11b237d18bcc2dafe73dc5854` | 307 | B7 service-side embedded listing/extraction is accepted; browser wiring remains outstanding. |
| `PLAN-STATUS.md` | `6f4bf33c8d848097731f536e3db229ed2f618812dcb9f021cec7f67c197aa7f5` | 151 | Records the accepted LDM4 service capability, no browser changes in LDM4, and B7 browser UI as the remaining route. |
| `DECISIONS.md` | `6ba00b2be221f63c880cba3d2fd9d7b927bc853db07620cadd6bbdf8af0024cc` | 268 | Sections 2 and 9 require an explicit absolute owned local path, typed listing before explicit selection/extraction, draft/correction/approval semantics, no style persistence, and no protected-stream/DRM path. |
| `docs/dev/local-runbook.md` | `fe3314bb746213d6caa09c67c518a25c50339c32dbae270ae4fa67aefc2af418` | 287 | Documents loopback operation, sanitized job responses, local media-path semantics, and Node 26.5 strip-only restrictions. |
| `docs/plan/autonomous-batches/20260706T054314Z-ldm4-b7-embedded-subtitle-extraction-batch-manifest-t_d675b28e.md` | `620ab1a3b847af28283e149bcab67f382bd5e358ccce945d85e6fad45f187090` | 193 | Defines the accepted service-side B7 listing/extraction contract, draft import, redaction, fake runners, and non-authorizations. |
| `docs/plan/autonomous-batches/20260721T125340Z-ldm6-gate-decision-push-deploy-next-t_679f3cab.md` | `d77fcc88c910aa672c0eb5f11c87a4edf697343b9991d37890636fb1bd67dce6` | 34 | Authorizes LDM7 B7 browser UI wiring while withholding PR, release, public exposure, and `origin/main` mutation. |

Targeted current-code and test readback:

| Artifact | SHA-256 | Lines | Current behavior relevant to LDM7 |
|---|---:|---:|---|
| `apps/local-service/src/server.ts` | `7d0e720a9b9e2567c323cc92c90a2017506dab74fb3fed898262a7492052a0ad` | 1140 | Existing job kinds list/extract embedded tracks with absolute-path validation and redacted summaries/errors. The completed extract result exposes safe track metadata and `cueCount`, but not parsed cue text/timings; the browser cannot import a usable transcript from the current response without a minimum result extension. |
| `packages/local-transcription/src/index.ts` | `11e121320f5b1b6dfa68072a7b972ba989bc969703fdb4071457d4930b7c352e` | 684 | Defines typed `EmbeddedSubtitleTrack` metadata, supported-codec classification, ffprobe listing, and explicit ffmpeg extraction with injected runners and absolute-path validation. |
| `packages/subtitles/src/import.ts` | `248f181fa150b96f1a39175811a6cdf77fdb19d6fa644e1337a4433117314b59` | 559 | Parses SRT/VTT/ASS into normalized cues, supports draft/provenance overrides, strips ASS/SSA styling/position data, and supplies the parsed cues available to the service before response shaping. |
| `apps/web/src/model.ts` | `398211d2be7e90f1af0ec59e7585bf49a7f5857535995eba8bfa3088780821e8` | 2751 | Owns typed in-memory transcript lifecycle state, loopback job clients, strict JSON decoders, draft import, correction/approval, and learner-save gating. It has no embedded-subtitle client/import seam today. |
| `apps/web/src/app.ts` | `8512285ca94e80c39b10277054e51dff9e0a072c69b7a731b7a1ef2deefbbb08` | 3568 | Renders the Transcript lifecycle panel and local absolute-path note, but offers no embedded track list/selection/extraction controls. |
| `packages/domain/src/types.ts` | `e83211461f1f21d3ac825bb64996a2f958a631fa9c4cdb72881491f02b85674a` | 147 | `TranscriptSourceKind` has no separate embedded-subtitle variant; current accepted local imported-subtitle semantics use `user-subtitle-file`. |
| `packages/domain/src/coreTypes.ts` | `a393402bb014de76e092ddee08f3766d72b24b33dbab29c7616971f192bed8c7` | 682 | `SubtitleTrack` already carries format, opaque `sourcePath`, draft status, source kind, typed provenance, and quality warnings sufficient for this bounded import without a schema expansion. |
| `packages/storage/src/sqliteLocalPersistence.ts` | `111f080bde4dca175ea71eb868da6bef5601af715a07840b7120973b180d0fd4` | 1555 | The SQLite projection CHECK constraint enumerates existing transcript source kinds; adding a new kind would require a migration and is not needed for the accepted local-file-derived import semantics in this UI slice. |
| `tests/core/b7EmbeddedSubtitleExtraction.test.ts` | `4ee8d8b58f29220712b702186adaf90bbf0ab73bcdb666c54babb379409563f6` | 607 | Fake-runner tests already cover listing metadata, supported/unsupported codecs, explicit stream extraction, draft warnings, absolute paths, and result/error redaction; they should be extended only for the cue-bearing response contract. |
| `tests/web/p7TranscriptLifecycleFrontend.test.ts` | `e25fb626f312b115ebf5ec8b280b1ff93770a6ca5c1660e7a5abd4c3505583eb` | 466 | Existing JSDOM/fake-fetch coverage proves draft import, correction/approval, local ASR job polling, and approved-track learner-save gating; LDM7 should add a focused sibling file rather than overload all B7 cases here. |
| `package.json` | `f8368a2d041719eaa833e0ce32fcb540a16bc0d9d6aff8aed66036d79f4ffd06` | 47 | Defines canonical typecheck, Vitest, no-network, privacy-scan, and Vite build commands. |

CodeGraph was unavailable because this worktree has no `.codegraph/` index. Preflight used direct source/search readback instead and did not initialize or mutate an index.

## Baseline integration gap and bounded policy decisions

LDM4 is functionally complete at the service boundary, but the accepted completion shape is not sufficient for a browser transcript import: `embedded-subtitle-extract` returns `extract` metadata plus a track summary and `cueCount`, while the parsed cue text/timings remain inside the service process. LDM7 must make the smallest compatible extension to the existing endpoint result by returning the already-parsed normalized cues. It must not add a second extraction endpoint, expose scratch paths, or ask the browser to read service scratch files.

The following decisions bind LDM7:

1. **Target transcript only in this slice.** The Transcript lifecycle workbench imports a selected embedded track as role `target`, because that is the existing correction/approval/learner-save path. A native/other-role picker and dual-track alignment UX are deferred rather than implied.
2. **Explicit dedicated path field.** Add a dedicated session-only embedded-subtitle media-path field. Listing and extraction require a non-empty absolute path; `blob:`, `browser-file-handle:`, relative, URL, and tilde-only labels are rejected before fetch. Do not silently substitute a playback URL/handle label or search media folders.
3. **No new persisted source-kind/schema migration.** The browser track uses the accepted local imported-subtitle `transcriptSourceKind: "user-subtitle-file"`. Distinguish it with an opaque redacted source path such as `embedded-subtitle:<media-id>:stream-<index>:<codec>:<format>` plus typed provenance/warnings. This avoids misusing private absolute paths and avoids expanding LDM7 into a storage migration.
4. **Deterministic output format.** Derive extraction format from the selected supported codec: `ass`/`ssa` -> `ass`; `webvtt` -> `vtt`; `subrip`/`srt`/`mov_text` -> `srt`. Unsupported/unknown/bitmap codecs remain visible but cannot trigger extraction. Do not add automatic OCR or codec conversion fallback.
5. **Editable language, fixed role.** Default the extraction language from the selected ffprobe language tag when present, otherwise the existing local transcript language (`pl`); keep it editable before extraction. Send `role: "target"`.
6. **Session-only private path and redacted messaging.** The input may visibly contain the path the user typed, but it is not written to `LocalStore`, autosave, export, status banners, errors, logs, screenshots/fixtures, or committed docs. Every browser-visible status/error is static or defensively redacted against the entered path.

## Confirmed LDM7 implementation contract

### 1. Typed browser lifecycle state

Extend the transcript lifecycle state with tight, explicit types for:

- session-only embedded media path;
- listing state: `idle | listing | empty | ready | failed`;
- extraction state: `idle | extracting | imported | failed`;
- typed track metadata matching the existing service contract: stream index, codec name/kind, supported flag, optional language/title/default/forced/extraction hint;
- selected stream index or `null`;
- editable language;
- redacted status/error code/message.

Do not use `Record<string, any>`, `map[string]any`-style storage, TypeScript enums, or persisted browser settings for this state. Keep raw JSON decoding at the loopback boundary and return typed values to the UI.

### 2. Listing flow and explicit selection

The **List embedded subtitle tracks** action must:

1. require the local service to be connected;
2. validate the dedicated path locally as an absolute local path and reject browser/file/HTTP labels before fetch;
3. create `kind: "embedded-subtitle-list"` through `POST /api/jobs` with only `{ mediaPath }`;
4. poll the returned job id through the existing loopback job surface with bounded attempts/delay and injectable fetch/sleep seams;
5. strictly decode `result.listing` and render the completed list;
6. never auto-select/extract a default track merely because ffprobe marks it default.

Render each track's safe metadata: stream index, codec, language/title when present, default/forced markers, supported/unsupported state, and extraction hint. Selection must be an explicit user action. A completed listing with zero tracks is the `empty` state with the clear message **No embedded subtitle tracks found.** It is not a generic crash.

### 3. Selection and extraction flow

The **Extract selected track as draft** action must remain disabled until:

- the service is connected;
- a supported track was explicitly selected;
- the path still passes validation;
- the language field is non-empty.

Create `kind: "embedded-subtitle-extract"` with exactly:

```json
{
  "mediaPath": "<session-only absolute path>",
  "streamIndex": 2,
  "outputFormat": "srt",
  "language": "pl",
  "role": "target"
}
```

The numeric index and output format must come from the selected decoded track and deterministic mapping above, not from untrusted DOM text or an arbitrary free-form value. If listing/path changes, clear stale selection before another extraction.

### 4. Minimum service result extension

Preserve the existing endpoint/job kinds and current redacted result fields. Extend only the completed extraction result with normalized parsed cues already produced by `importSubtitle()`:

- `track`: current safe id/language/role/format/status/provenance/cueCount summary, plus `transcriptSourceKind` if needed for strict browser decoding;
- `cues`: ordered objects containing only cue index, start/end milliseconds, and normalized text (content hashes are optional; browser may recompute them);
- `extract`: effect, redacted output path sentinel, output format, and stream index.

Never return the source absolute media path, service scratch path, parser input path, ffmpeg/ffprobe stderr, ASS/SSA style/position/karaoke data, provider data, or service filesystem ids. Keep existing server-side failure redaction. Extend `tests/core/b7EmbeddedSubtitleExtraction.test.ts` to prove the cue-bearing response and absence of private/scratch/style fields with an injected fake command runner; no real ffmpeg/ffprobe process may run.

### 5. Browser draft import and provenance

After strict decoding, create a fresh browser-owned track/cues attached to `model.currentMedia`; do not persist service placeholder media ids, service track/cue ids, or service scratch paths.

Required browser track semantics:

- `role: "target"`;
- actual extracted `format` (`srt`, `vtt`, or `ass`);
- `sourceKind` copied from the current owned/synthetic media asset;
- opaque redacted `sourcePath`: `embedded-subtitle:<media-id>:stream-<index>:<codec>:<format>` or a typed equivalent with no absolute path;
- `transcriptStatus: "draft"`;
- `transcriptSourceKind: "user-subtitle-file"` for the accepted local-file-derived import semantics;
- provenance containing language, `generatedAt`, `engine: "ffmpeg-embedded-subtitle"`, and at least `timingUnverified` plus `qualityUnreviewed` warnings from the service result;
- quality report computed from the imported cues and the same warning flags;
- a browser-computed content hash over cue timing/text;
- the selected stream index/codec/format recoverable from the opaque source path without exposing the media path.

Reject an empty cue list, malformed/non-finite timings, non-increasing cue ranges, empty text, a non-draft service track, a mismatched stream index/format, or missing required warning flags. Successful import clears pending cue/word edits, makes the new target track active, reports a redacted success message, and enters the existing correction/approval UI. Saved learner items remain disabled until that exact track is corrected/approved through the existing gate.

ASS/SSA styling is deliberately not persisted: the service parser has already normalized text/timing, and the browser result contract contains no style/position/karaoke fields.

### 6. Clear, path-safe UI states

Required visible states and messages:

- disconnected/unreachable service: **Local service unreachable. Connect the loopback service and retry.**
- invalid/missing path: **An explicit absolute owned local media path is required. Browser blob and handle labels do not qualify.**
- zero tracks: **No embedded subtitle tracks found.**
- supported listing ready: show count and require selection;
- unsupported codec: retain metadata row, disable selection/extraction, and show a safe codec-specific explanation without attempting ffmpeg;
- extraction running: static progress text without path;
- extraction/job failure: static **Embedded subtitle extraction failed.** plus only an already-redacted service reason/error code;
- import validation failure: static **Extracted subtitle data could not be imported as a draft.**
- success: **Embedded subtitle track imported as a draft; correct and approve it before study use.**

Add a defense-in-depth browser error normalizer that removes/replaces the entered path if a fake or future service error accidentally echoes it. Do not place the raw path in `model.importError`, `lastMessage`, console logging, analytics, autosave, export, or committed fixtures.

## Test-first and fake-only contract

LDM7-01 must add a focused `tests/web/b7EmbeddedSubtitleFrontend.test.ts` (or an equivalently narrow file named in its handoff) using JSDOM and faked `fetch` responses. It must not run real ffmpeg/ffprobe, open real media, scan user folders, call providers, or mutate real learner state.

At minimum prove:

1. missing, relative, `blob:`, `browser-file-handle:`, HTTP, and tilde-only paths are rejected before fetch;
2. disconnected/unreachable service has a distinct clear state;
3. a successful fake listing renders stream index, codec, language/title, default/forced flags, and supported/unsupported state;
4. a listing never auto-selects or auto-extracts a default track;
5. a zero-track listing renders the exact empty state;
6. unsupported/bitmap/unknown codecs remain visible but cannot create an extract request;
7. selecting a supported track and editing language emits the exact extract payload with the deterministic format and fixed target role;
8. changing path or refreshing listing clears stale selection;
9. queued/running/completed polling works with bounded fake responses, while failed/cancelled/deadline states are explicit;
10. a completed cue-bearing response creates fresh browser ids attached to current media, preserves actual format, remains `draft`, carries redacted embedded source provenance and required warnings, and contains no service media/scratch path;
11. malformed/empty cues, non-draft service status, stream/format mismatch, or missing warning flags fail closed without changing the active transcript;
12. ASS/SSA style/position/karaoke fields are not accepted into the stored browser track/cues;
13. imported draft learner-save controls remain disabled until the existing correction/approval path approves the track;
14. list/extract/import failures containing a private sentinel path never show that path in status/error text or persisted/exported state;
15. all requests stay on the configured loopback base URL and no provider/network route is introduced.

Extend `tests/core/b7EmbeddedSubtitleExtraction.test.ts` only for the minimum service response: returned ordered cues, draft status/warnings, safe extract metadata, no raw source/scratch path, and no style data. Existing fake-runner assertions remain mandatory.

## Node 26.5 strip-only runtime constraints

Every edited file reachable from `apps/local-service/src/server.ts` must preserve the 2026-07-19 runbook contract:

- every relative import has an explicit `.ts` extension;
- no TypeScript parameter properties;
- no TypeScript enums outside `.d.ts`;
- no TypeScript namespaces;
- plain pinned Node 26.5 can parse/import the node-executed graph, not merely `tsc`, Vitest, Vite, or the task shell's Node 22.

The browser-only graph may retain its established import style, but no new node-executed exception is allowed. The preferred representations are string-literal unions, readonly objects/tuples, and explicit decoder functions.

## Explicitly out of scope / non-authorized

This manifest and its downstream chain do not authorize:

- real ffmpeg/ffprobe execution during automated validation, opening or searching Janusz's media folders, selecting a private file by implication, or committing a real media/path fixture;
- automatic extraction of all/default tracks, background scanning, path discovery, persistent path history, filesystem browsing, or converting browser handles/blob URLs into service paths;
- OCR for bitmap subtitles, PGS/DVD/DVB extraction fallback, subtitle translation, automatic language detection/mapping, style/position/karaoke persistence, or native/other-role alignment UX;
- approval bypass, auto-approval, making a draft the learner-save source, destructive learner-state replacement, or mutation of real browser/local-service learner data in tests;
- online media download, `yt-dlp` execution, cookies/browser credentials, account/private media access, protected-stream capture, DRM/circumvention, or Lingopie/proprietary media/data;
- ElevenLabs/TTS/YouTube/provider calls, online translation/LLM use, model load/download/cache scan, new package/dependency install, microphone/voice capture, cloud sync, AnkiConnect, media-copy backup, or external-app mutation;
- push, PR, release, tag, package publication, deployment, systemd restart, public exposure/sharing, `origin/main` mutation, or a next batch;
- secrets, API keys, private absolute media paths, generated transcripts/media, extracted subtitle scratch, model/cache/browser-profile artifacts, raw provider payloads, or private/generated/cache artifacts in Git.

## Task chain and contracts

| Step | Task id | Assignee | Parent | Contract |
|---|---:|---|---|---|
| LDM7-00 | `t_296c3b4f` | `default` | none | Preflight live branch/docs/code/tests/runtime, bind the browser/service contract and safety decisions, write/verify this manifest, and create an exact-scope local commit. |
| LDM7-01 | `t_7532544d` | `backend-eng` | `t_296c3b4f` | Implement only this browser listing/selection/extraction/draft-import slice test-first with fake seams and the minimum cue-bearing service result extension; update behavior docs; satisfy Node/privacy/full gates; commit exact-scope locally; do not push. |
| LDM7-02 | `t_4dc1a93f` | `reviewer` | `t_7532544d` | Independent read-only review. Return `PASS`, `BLOCK`, or `NEEDS HUMAN DECISION` with exact findings, changed-range evidence, request/result decoding, draft/provenance/path-redaction/style/Node checks, and command receipts. Do not fix code. |
| LDM7-03 | `t_e42c53ae` | `qa` | `t_4dc1a93f` | Proceed only after review PASS; run the exact focused/full fake-only integration contract and write a durable receipt with tested HEAD, commands, exit codes, concise results, cleanliness, and SHA-256. No real tools/media/provider action. |
| LDM7-04 | `t_8d8f9d6e` | `default` | `t_e42c53ae` | Produce and commit the final packet, comment path/hash/SHA/options, then block as the human gate. Never self-authorize acceptance, push, PR, deployment, release, or a next batch. |

If LDM7-02 returns BLOCK, LDM7-03 must defer. LDM7-04 must route a bounded implementation repair -> fresh independent re-review -> QA continuation before presenting acceptance options; it must not treat the originally blocked chain as accepted.

## Validation contract

### LDM7-01 focused implementation gates

Run all commands below, recording exact exit codes and concise results:

```bash
git status --porcelain=v1 -uall --branch
npm run typecheck
npm test -- tests/web/b7EmbeddedSubtitleFrontend.test.ts tests/web/p7TranscriptLifecycleFrontend.test.ts tests/core/b7EmbeddedSubtitleExtraction.test.ts
npm run test:no-network
npm run scan:privacy
npm test
npm run build
/home/linuxbrew/.linuxbrew/opt/node/bin/node --check apps/local-service/src/server.ts
/home/linuxbrew/.linuxbrew/opt/node/bin/node -e "await import('./apps/local-service/src/server.ts')"
python3 validate_final_bundle.py
git diff --check
git status --porcelain=v1 -uall --branch
```

If the focused frontend file has another name, LDM7-01 must comment the exact path and preserve every assertion in the fake-only contract. The pinned Node checks are mandatory if `server.ts` or any node-executed dependency changes; they must not be replaced with the task shell's Node 22 result.

### LDM7-02 independent review gates

The reviewer must verify:

- the UI uses the existing list/extract job kinds and only the minimum cue-bearing completed-result extension;
- the browser validates a dedicated explicit absolute path before fetch and never substitutes a blob/handle/URL/relative label;
- listing metadata is strictly decoded, rendered safely, and cannot trigger automatic/default extraction;
- unsupported codecs fail closed without OCR/conversion/provider/network fallback;
- extract payload index/format/language/target role derive from typed selected state, not arbitrary DOM strings;
- the browser rebuilds fresh track/cues under current media and never persists service placeholder ids or source/scratch paths;
- imported tracks are draft `user-subtitle-file` sources with opaque `embedded-subtitle:` provenance, required warnings, correction/approval gates, and approved-track learner-save enforcement;
- no ASS/SSA style/position/karaoke data reaches persisted browser state;
- every visible error/status path is redacted even when a fake response contains the private sentinel;
- tests use fake fetch/injected command runners and no real ffmpeg/ffprobe/media/provider/model action;
- any node-executed edits obey explicit `.ts` imports and contain no parameter properties, enums, or namespaces, with pinned Node 26.5 evidence;
- exact-scope commits contain no secrets, private paths, generated transcripts/media/scratch, caches, or unrelated churn.

### LDM7-03 QA integration gates

Run the full contract exactly unless a command is impossible for a documented environmental reason:

```bash
git status --porcelain=v1 -uall --branch
git log --oneline --decorate -8
git diff --check
npm run typecheck
npm test -- tests/web/b7EmbeddedSubtitleFrontend.test.ts tests/web/p7TranscriptLifecycleFrontend.test.ts tests/core/b7EmbeddedSubtitleExtraction.test.ts
npm run test:no-network
npm run scan:privacy
npm test
npm run build
/home/linuxbrew/.linuxbrew/opt/node/bin/node --check apps/local-service/src/server.ts
/home/linuxbrew/.linuxbrew/opt/node/bin/node -e "await import('./apps/local-service/src/server.ts')"
python3 validate_final_bundle.py
git status --porcelain=v1 -uall --branch
```

QA must record command, exit code, concise result, tested HEAD, tracked/untracked cleanliness, privacy/artifact scan result, and receipt SHA-256 under `/home/openclaw/.hermes/artifacts/kanban/t_e42c53ae/`. It must not substitute a live media/tool smoke for the required fake-fetch/fake-runner coverage.

## Documentation/status update contract

LDM7-01 should update only docs made materially stale by the behavior change:

- `docs/dev/local-runbook.md`
  - add browser smoke steps for connecting the loopback service, entering an explicit absolute owned local path, listing tracks, selecting one, importing it as draft, and verifying correction/approval gating and path-safe status; state that automated tests use fakes and that live owned-media/tool smoke remains separately chosen;
- `PLAN-STATUS.md`
  - update the B7 row and top current-ground-truth summary to say browser UI wiring is implemented on the local branch, with exact commit and limits; do not claim independent acceptance, push, or deployment before those gates complete;
- `PLAN.md`
  - reconcile the stale rough-baseline line and B7 status lines so they distinguish completed service capability from the newly implemented local browser surface; do not remove the absolute-path, draft, no-style, or non-authorization language.

Update README only if implementation makes a current quick-start statement materially false. Do not copy private media paths, test sentinel values, generated cue text beyond synthetic fixtures, service scratch paths, or runtime logs into committed docs.

## Final human-gate contract

`t_8d8f9d6e` is the manual LDM7 decision gate. It must not silently accept, push, open a PR, deploy, release, publish, restart services, expose a service, or authorize a new batch.

The final packet must include:

1. manifest path/hash and all exact implementation/review/QA commit SHAs;
2. changed files and behavior/API-response summary;
3. focused/full command receipts and reviewer/QA verdicts;
4. explicit-path validation, listing metadata, selection, extraction, cue-bearing response, draft import, correction/approval, and learner-save-gate evidence;
5. unsupported/no-track/unreachable/extraction-failure and path-redaction evidence;
6. no-style/no-real-tool/no-provider and pinned Node 26.5 evidence;
7. known limitations: target-role only, no bitmap OCR/conversion, no role/alignment picker, no path persistence/discovery, no auto-extraction, no live owned-media smoke in automated validation;
8. preserved non-authorizations and explicit decision options.

Recommended options:

- `accept local only`;
- `repair` with concrete findings;
- `authorize push` only after a fresh remote/status/secret preflight;
- `authorize PR` only with a fresh exact gate;
- `deploy locally` only with fresh service/runtime preflight, dependency-delta check, restart, health/status, and browser smoke verification;
- `authorize next local batch` while preserving all unrelated gates.

After commenting packet path/hash/SHA/options, LDM7-04 must block with:

`HUMAN-GATE: Lingotorte LDM7 B7 browser-UI packet ready; choose accept, repair, authorize push/PR, deploy locally, or authorize next local batch`

## Handoff note for LDM7-01

Implement the missing local browser bridge, not a subtitle-management subsystem: require a dedicated explicit absolute owned path, list safe track metadata through the existing fakeable loopback job, require deliberate supported-track selection, derive one bounded output format, extend the existing extraction completion with normalized cues, rebuild a fresh target track under the current media, and keep it draft with opaque embedded-source provenance until the existing correction/approval gate approves it. Keep private paths out of status/persistence/Git, keep ASS/SSA style data out of the result, exercise the actual pinned Node 26.5 for server compatibility, and leave real media/tools, providers, push/PR/deploy, and future role/alignment/OCR work blocked.
