# LDM5 B6 source-media snippet generation batch manifest

Generated: `2026-07-19T15:13:39Z`
Preflight task: `t_862d56c9`
Authorizing instruction: Janusz's 2026-07-19 Cowork instruction `B6 snippets`, as captured in the trusted Kanban task body
Workspace/worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
Branch: `lingotorte/m1-daily-driver-polish`
Preflight start HEAD: `55c9bf57b008cf505494ebeec1068e9333150ce3`
Remote boundary: local commits only; no push without a fresh human gate

## Artifact navigation

Role: operational
Review scope: implementation scope, authority, safety/privacy, cache lifetime, validation, and human-gate routing

Derived from:

- `PLAN.md`
  - Current B6 backlog: source-media clip/audio snippets from owned local media remain outstanding.
- `PLAN-STATUS.md`
  - The 2026-07-19 revalidation identifies B6 source-media snippet generation as a natural next batch.
- `DECISIONS.md` sections 8 and 11
  - B6 means owned source-media snippets, not provider/TTS replacement audio; source-audio recall is allowed while learner microphone capture remains deferred.
- `docs/review/safety-privacy-boundary-review.md`
  - Binding owned/local-media, no-DRM, provider-disabled-by-default, no-private-path-leak, no-media-export-by-default, and no-external-mutation rules.
- `docs/dev/local-runbook.md`
  - Current loopback local-service, explicit absolute-path, scratch cleanup, no-network, validation, and Node 26.5 strip-only contracts.

Supported by:

- Kanban task `t_862d56c9`
  - Active preflight/readback task that produces and commits this manifest.
- Janusz's exact `B6 snippets` instruction recorded in the task body
  - Authorizes this local/reversible/testable B6 slice only; it does not authorize push, deploy, providers, downloads, microphone access, or external mutation.
- `docs/plan/autonomous-batches/20260719T150913Z-ldm5-b6-source-media-snippets-batch-manifest-t_e6946299.md`
  - Byte-verified concurrent predecessor manifest from an archived duplicate dashboard card; this active manifest preserves its selected slice and rebinds it to the active user-created chain.

Feeds:

- Kanban task `t_f5a0ccb6` (`LDM5-01`)
  - Implementation of the bounded source-audio snippet slice.
- Kanban task `t_0e0c26ee` (`LDM5-02`)
  - Independent read-only implementation review.
- Kanban task `t_354f7b63` (`LDM5-03`)
  - QA integration validation and durable receipt.
- Kanban task `t_730b1a0a` (`LDM5-04`)
  - Final packet and human decision gate.

Verified by:

- Live Git preflight on the intended branch and worktree.
- Source-document and code readback with SHA-256/line evidence below.
- Exact-scope commit and post-commit path/hash/SHA comment on `t_862d56c9`.

## Concurrent predecessor and active-chain binding

An earlier dashboard-created duplicate preflight card, `t_e6946299`, was archived while its worker was still running. That reclaimed worker subsequently created local commit `55c9bf57b008cf505494ebeec1068e9333150ce3`, adding predecessor manifest `20260719T150913Z-ldm5-b6-source-media-snippets-batch-manifest-t_e6946299.md` with SHA-256 `b63cba8ff5cd5242181e1b5089e8cd739551e572145d88a4d36c63642898f2c2`.

This active user-created task does not rewrite, drop, or amend that concurrent commit. This manifest adopts the same local-service ffmpeg first slice, records `55c9bf5` as the new preflight base, and replaces only the stale archived-card routing with the active LDM5-01..04 chain listed above. Downstream workers must use this manifest and the active task ids. The predecessor remains historical provenance, not a second executable chain.

## Preflight readback

Live workspace state immediately before writing this manifest:

- Git root: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`.
- Branch: `lingotorte/m1-daily-driver-polish`.
- HEAD: `55c9bf57b008cf505494ebeec1068e9333150ce3` (`docs: define LDM5 B6 source snippet batch`).
- Tracking: `origin/lingotorte/m1-daily-driver-polish` remains `dacbedf127a8006febc6c48ac6664814268dabc4`; the branch is ahead by the one local predecessor-manifest commit.
- `git status --short --branch --untracked-files=all`: clean before this active manifest was written.
- No provider call, media read, ffmpeg execution, learner-state mutation, service action, push, PR, release, deployment, or public action was performed during preflight.

Source documents read for this preflight:

| Artifact | SHA-256 | Lines | Scope confirmation |
|---|---:|---:|---|
| `PLAN.md` | `ff81bcc542611de6178f41c80a15839c53af0a7dfcf04826704ccd097de83923` | 307 | B6 has multiple-choice, sentence-builder, progress metrics, and range loops; source-media snippet generation remains outstanding and must not be routed through TTS/provider audio. |
| `PLAN-STATUS.md` | `9dabfe2f63e339faa7fc27e48607fdb20e812c597d8f4f1a11e948fb12ff0fa5` | 151 | The 2026-07-19 ground truth names B6 source-media snippets as a natural next batch and preserves local-only/provider-disabled boundaries. |
| `DECISIONS.md` | `6ba00b2be221f63c880cba3d2fd9d7b927bc853db07620cadd6bbdf8af0024cc` | 268 | Section 8 authorizes on-demand owned source-media snippets with local/testable cleanup and defers durable/export media; section 11 permits source-audio recall but defers learner microphone capture. |
| `docs/review/safety-privacy-boundary-review.md` | `c145d24cb4b807665ec5266506d3da54ef7fcd4d31e8c1e9aed896b041cce000` | 169 | Owned/local media only; no protected-stream capture; no raw local paths in logs/exports; local metadata backup excludes media by default; generated clips are not public/shareable by default. |
| `docs/dev/local-runbook.md` | `fc491d200d0827c2e5f8dadf04eee74a655ea0d23bd5190e1a66a20e695026af` | 282 | Local service is loopback-only, absolute paths are required for service-side ffmpeg work, scratch cleanup already exists, and Node 26.5 strip-only requires explicit `.ts` relative imports plus no parameter properties/enums/namespaces in node-executed code. |
| Predecessor manifest | `b63cba8ff5cd5242181e1b5089e8cd739551e572145d88a4d36c63642898f2c2` | 328 | Defines the same selected slice but points to an archived duplicate chain; preserved as provenance and superseded for execution routing by this active manifest. |

Targeted current-code readback:

| Artifact | SHA-256 | Lines | Current behavior relevant to LDM5 |
|---|---:|---:|---|
| `packages/local-transcription/src/index.ts` | `34bed7e5372f5df40b88bb31a56ecc5b40146534f9705c2338a24b7ba7bca494` | 637 | Provides typed injectable `CommandRunner`, absolute-path checks, full-media PCM WAV extraction, and B7 ffprobe/ffmpeg seams. It has no range-bounded source-snippet adapter yet. |
| `apps/local-service/src/server.ts` | `d0f79aad6eaab40b9ccf75dad983289bf8fbc4dd2007798b4651f5f832fe2576` | 962 | Provides loopback-only jobs, scratch paths, redacted job summaries/errors, B7 extraction, and global scratch cleanup. It has no source-snippet job, opaque playback endpoint, or snippet-specific lifetime policy yet. |
| `apps/web/src/app.ts` | `ae6cc9d4f4310870cbf62b964f01c7daf5b68b215b4aa142284b76bdbb553aac` | 3548 | Practice already has an `audio-recall` mode, but that branch calls `getUserMedia` and browser speech recognition. That microphone path is outside current section 11 authority. `Replay source cue` only jumps back to the player. |
| `apps/web/src/model.ts` | `77b1678bd00f2a501ea84e0a5d27da04456505cc18a509a76585c9f9891b23e3` | 2751 | Practice attempts are source-context-backed and persisted through the existing service; no transient source-snippet client state or job helper exists. |
| `apps/web/src/uiTypes.ts` | `10222ea778e5aa851fc1019b85741ce3d1b393ca5136e762b718872909e2e411` | 216 | Practice state contains mode/answer/result/sentence-builder fields only; no snippet request/playback state is persisted. |
| `packages/domain/src/coreTypes.ts` | `a393402bb014de76e092ddee08f3766d72b24b33dbab29c7616971f192bed8c7` | 682 | Practice attempts persist mode/result/source context but have no snippet bytes, id, path, or cache entity; the metadata-only learner manifest carries attempts and source contexts only. |
| `tests/web/p6PracticeFrontend.test.ts` | `6ad7ba8ddec347d06b1775d958b2753dbd5a1b0d308e509ea4614a4db136a1f0` | 472 | Covers current practice modes and no-network behavior, but microphone/audio-recall tests are four empty skipped tests. LDM5 must replace them with deterministic source-snippet tests rather than enable microphone mocks. |
| `tests/core/p6PracticeExport.test.ts` | `6899441ce3d12ecc854d01d53c9c6e0ba73bfbeba403d509171a0acd32e53169` | 549 | Establishes source-context-backed attempts and metadata-only export/restore behavior; it should prove snippet bytes/cache metadata remain absent. |
| `tests/core/b7EmbeddedSubtitleExtraction.test.ts` | `4ee8d8b58f29220712b702186adaf90bbf0ab73bcdb666c54babb379409563f6` | 607 | Establishes the fake-runner, temp-service, absolute-path, redaction, job-polling, and cleanup patterns to reuse; automated tests do not execute real ffmpeg. |
| `tests/core/localTranscriptionPipeline.test.ts` | `2d310fb3ea70d0861a4c83bf18b95af059a214cedda4d115c3fa38502e529e98` | 403 | Establishes typed ffmpeg command-shape tests and injectable runner behavior for local extraction. |

## Selected first slice and rationale

**Selection:** local-service ffmpeg extraction of a cue-bounded mono WAV snippet from an explicit absolute owned local media path, wired into the existing Practice `audio-recall` mode as source-audio playback plus the existing typed-answer/attempt flow.

This first slice deliberately chooses local-service extraction rather than browser-only range playback:

1. It follows the settled split model in `DECISIONS.md` section 2: browser handles/object URLs are playback identity, while service-side ffmpeg work uses an explicit absolute owned local path.
2. It gives the existing `audio-recall` learner surface a real owned source-audio prompt and removes the currently unreviewed microphone/speech-recognition branch from that mode. This matches section 11: source-audio recall is allowed; learner voice capture is not.
3. It reuses the typed, injectable ffmpeg/local-service seams already proven by B7 and can be tested without reading private media or running real ffmpeg.
4. It creates a reusable service boundary for later saved-occurrence playback without prematurely designing durable media storage, media-copy backup, or snippet export.
5. Deterministic PCM WAV avoids a new codec/package/provider dependency. A strict duration cap and bounded session cache keep local disk use small.

Browser-only range playback remains a possible later optimization for currently active object URLs/handles. It is not required for LDM5 acceptance and must not become a fallback that silently bypasses the explicit local-service-path contract.

## Confirmed LDM5 B6 implementation contract

### 1. Typed range-bounded ffmpeg adapter

Add a dedicated source-snippet adapter; do not silently change full-media ASR extraction semantics. Use a tight typed contract with:

- input: `inputPath`, `outputPath`, `startMs`, `endMs`, optional `ffmpegPath`;
- output: effect discriminator, duration, MIME/format metadata, sample rate, channels, and the internal output path for service use;
- validation:
  - input/output paths must be absolute and different;
  - `startMs` and `endMs` must be finite non-negative integers;
  - `endMs` must be greater than `startMs`;
  - maximum requested duration is `30_000 ms` for this first slice;
- command behavior: ffmpeg extracts only the requested range, removes video, and writes mono `16 kHz` `pcm_s16le` WAV;
- execution stays behind the existing injectable `CommandRunner`;
- adapter errors may contain useful codes/status but must be redacted before crossing the public service boundary.

Automated tests must assert command shape and validation with a fake runner. They must not execute real ffmpeg or open Janusz's media.

### 2. Loopback source-snippet job and opaque playback

Add a local-service job kind such as `source-audio-snippet`:

- request payload: explicit absolute owned `mediaPath`, cue-derived `startMs`, cue-derived `endMs`, and optional configured `ffmpegPath`;
- public job summary: redacted media marker plus timing/duration only;
- extraction target: a snippet-specific directory under the configured local scratch root, using an opaque random identifier and `.wav` filename;
- completed result: opaque snippet id, `audio/wav`, start/end/duration, and a loopback retrieval route; never return the absolute media or scratch path;
- retrieval: fetch the complete WAV bytes over the existing loopback service and create a browser object URL client-side. A full-blob fetch is sufficient for this slice; HTTP Range support is not required;
- retrieval/delete routes must validate opaque identifiers strictly and must not allow path traversal or arbitrary scratch-file reads;
- cancellation/failure must not leave an externally addressable successful snippet and must redact input/scratch paths from errors.

The service remains loopback-only. This local HTTP read is not a public network/provider action and must not depend on `LINGOTORTE_ALLOW_ONLINE_PROVIDERS`.

### 3. Session-only bounded cache and cleanup

The chosen cache policy is **service-session-only, bounded LRU with explicit early delete**:

- keep at most `16` generated snippets in an in-memory registry;
- cache keys and source paths stay internal to the process and are not logged, persisted, exported, or returned;
- evicting the least-recently-used entry deletes its WAV file;
- a strict `DELETE` route removes one opaque snippet and its file;
- the browser fetches the WAV into a blob, then requests service-side deletion after successful read; it also revokes superseded browser object URLs;
- service start removes stale files from the snippet scratch subdirectory left by a prior crash, and service close removes remaining session snippets;
- existing global scratch cleanup remains a fallback and must also clear snippet files safely.

Tests must prove the 16-entry bound, LRU eviction, explicit delete, startup/close cleanup, missing-id behavior, path-confinement protection, and browser object-URL revocation. No snippet filename/path/id may enter `LocalStore`, SQLite snapshots, learner exports, backup manifests, or practice-attempt records.

### 4. Practice `audio-recall` wiring

Use the existing due-card occurrence and cue timing as the learner artifact:

- require a due card with a source-backed saved occurrence and a resolvable cue;
- use exactly that cue's `startMs`/`endMs`, subject to the service's 30-second cap; do not accept arbitrary unbounded ranges in this slice;
- expose a clear per-session input for the explicit absolute owned local media path when the current media reference is a browser handle/object URL/fixture label;
- do not persist that absolute path in learner state, SQLite, exports, logs, screenshots, or committed fixtures;
- expose deterministic states: unavailable/disconnected, path required, preparing, ready, playing, failed, and cleaned;
- replace the current microphone/SpeechRecognition branch in `audio-recall` with source-snippet preparation/playback and a typed answer input using the existing `submitPracticeAttempt` path;
- do not call `navigator.mediaDevices.getUserMedia`, `MediaRecorder`, `SpeechRecognition`, provider/TTS APIs, or pronunciation scoring;
- keep snippet preparation separate from attempt submission: creating/playing a snippet must not itself update FSRS, create a practice attempt, approve a transcript, or autosave media bytes;
- preserve the existing source occurrence and approved-track learner-state gate. LDM5 must not create, correct, approve, or replace transcript tracks;
- avoid claiming blind dictation if target text remains visible. For `audio-recall`, hide target/native answer text until the attempt has been submitted or explicitly revealed, while retaining safe media/timing provenance.

Saved-occurrence and review-surface snippet buttons are deferred. The first integration surface is Practice only.

### 5. Export, backup, privacy, and artifact boundaries

- LDM5 does not add snippet media or snippet cache metadata to the metadata-only learner export/backup.
- LDM5 does not add a media-copy checkbox or imply that snippets survive restart, restore, export, or backup.
- UI/runbook copy must state that source snippets are transient local scratch, are deleted early/at eviction/service end, and are not exported.
- No generated WAV, private media path, scratch path, provider output, learner voice, browser profile data, model cache, or real learner-state artifact may be committed.
- Fixtures remain synthetic/local. Fake runners may write deterministic fake WAV bytes only inside test-owned temporary directories that are removed after each test.
- The privacy scan and tests must fail if a private absolute path is exposed through job status, result JSON, UI state intended for persistence, logs, or committed artifacts.

### 6. Node 26.5 strip-only runtime constraints

Every new or edited file in the node-executed graph must comply with the 2026-07-19 runbook rule:

- every relative import includes an explicit `.ts` extension;
- no TypeScript parameter properties;
- no TypeScript enums outside `.d.ts`;
- no TypeScript namespaces;
- source must load under Node's strip-only execution, not only pass `tsc`/Vite transformation.

Browser/test-only import style should remain consistent with the existing build, but anything reachable from `apps/local-service/src/server.ts` must satisfy this contract.

## Explicitly out of scope / non-authorized

This manifest and its downstream chain do not authorize:

- browser-only snippet generation as a substitute for the selected service slice;
- arbitrary-range clip editing, waveform editing, video snippet export, thumbnails, deck media, permanent per-deck cache, or durable snippet entities;
- snippet media in learner export/backup, media-copy backup, portable bundles, `.apkg`, AnkiConnect, or cloud sync;
- ElevenLabs/TTS/pronunciation-provider audio, online translation/LLM calls, provider expansion, provider payload logging, or sending cue/learner context externally;
- learner microphone access, learner voice capture/retention, browser speech recognition, shadowing recording, or pronunciation scoring;
- online media download, `yt-dlp` execution, private/account-gated media access, cookies/browser credentials, protected-stream capture, DRM/circumvention, or Lingopie/proprietary media/data;
- reading or searching Janusz's media folders for an input path; the operator must explicitly provide the owned absolute path;
- destructive changes to Janusz's real learner state, local media, browser profile, providers, or external apps;
- push, PR, release, package publication, deployment, systemd restart, public exposure/sharing, or other remote/public mutation;
- secrets, API keys, raw provider payloads, private absolute paths, generated snippets, cache directories, or scratch artifacts in Git.

## Task chain and contracts

| Step | Task id | Assignee | Parent | Contract |
|---|---:|---|---|---|
| LDM5-00 | `t_862d56c9` | `default` | none | Preflight live branch/docs/code, bind the selected B6 slice to the active chain, write/verify this manifest, and create an exact-scope local commit. |
| LDM5-01 | `t_f5a0ccb6` | `backend-eng` | `t_862d56c9` | Implement only the selected local-service cue-bounded source-WAV + Practice audio-recall slice; test first with fake runners/synthetic temp files; enforce cleanup/redaction/Node constraints; update behavior docs exact-scope; commit locally; do not push. |
| LDM5-02 | `t_0e0c26ee` | `reviewer` | `t_f5a0ccb6` | Independent read-only review. Return `PASS`, `BLOCK`, or `NEEDS HUMAN DECISION` with exact findings, changed-range evidence, Node/runtime checks, privacy/cache/export checks, and command receipts. Do not fix code in the review task. |
| LDM5-03 | `t_354f7b63` | `qa` | `t_0e0c26ee` | Proceed only after review PASS; run focused and full integration gates, record exact exit codes/output summary/HEAD/cleanliness in a durable receipt, hash it, and comment the result. No real ffmpeg/private media/provider action. |
| LDM5-04 | `t_730b1a0a` | `default` | `t_354f7b63` | Produce and commit the final packet, comment packet path/hash/SHA/options, then block as the human gate. Never self-authorize acceptance, push, PR, deploy, release, or the next batch. |

If LDM5-02 returns BLOCK, LDM5-03 must defer and the final-gate worker must route a bounded repair → re-review → QA continuation before presenting acceptance options.

## Validation contract

### LDM5-01 focused implementation gates

Run at minimum:

```bash
git status --short --branch --untracked-files=all
npm test -- --run tests/core/b6SourceMediaSnippet.test.ts tests/web/p6PracticeFrontend.test.ts
node -e "await import('./packages/local-transcription/src/index.ts')"
node --check apps/local-service/src/server.ts
npm run typecheck
npm run test:no-network
npm run scan:privacy
npm test
npm run build
python3 validate_final_bundle.py
git diff --check
git status --short --branch --untracked-files=all
```

The focused test filename may differ only if the implementation card comments the actual path and preserves equivalent coverage.

Required focused assertions:

1. typed range validation: absolute paths, distinct output, finite ordered range, 30-second maximum;
2. exact fake-runner ffmpeg shape: requested start/duration, no video, mono 16 kHz PCM WAV;
3. local-service job success/failure/cancel redaction with no private media/scratch path in public JSON;
4. opaque retrieval/delete id validation and path-confinement rejection;
5. full-blob playback fetch, correct `audio/wav`, object-URL creation/revocation, and no HTTP Range requirement;
6. bounded 16-entry LRU, eviction deletion, explicit delete, stale-start cleanup, close cleanup, and global scratch cleanup compatibility;
7. audio-recall UI uses the current source occurrence/cue, requires explicit path/service readiness, exposes typed answer, and does not reveal target/native answer text before submit/reveal;
8. no `getUserMedia`, `MediaRecorder`, `SpeechRecognition`, TTS/provider call, online media read, or real ffmpeg execution;
9. no snippet bytes/path/id in snapshots, SQLite, practice attempts, learner exports, backup manifests, or committed artifacts;
10. Node 26.5 strip-only compatibility for every changed node-executed import/syntax path.

### LDM5-02 independent review gates

The reviewer should verify:

- exact compliance with this selected slice rather than a broader media/cache/export subsystem;
- owned-local absolute media path is explicit, transient, redacted, and never inferred from a browser label;
- cue-derived range validation and 30-second cap cannot be bypassed through job payloads;
- opaque ids cannot traverse or expose arbitrary scratch/media paths;
- cleanup works mechanically at explicit delete, LRU eviction, startup, service close, and global scratch cleanup;
- `audio-recall` no longer invokes microphone/speech recognition and snippet playback does not mutate transcript/FSRS state before submission;
- provider-disabled/no-network behavior remains intact;
- metadata-only export/backup includes neither media bytes nor snippet cache metadata;
- tests are deterministic, synthetic, fake-runner-backed, and do not execute real ffmpeg or touch real learner/media state;
- every changed node-executed relative import has `.ts`, and no parameter property/enum/namespace entered that graph;
- commits are exact-scope and contain no secret, private path, media/cache/scratch artifact, or unrelated churn.

### LDM5-03 QA integration gates

Run the full contract exactly unless a command is impossible for a documented environmental reason:

```bash
git status --short --branch --untracked-files=all
git log --oneline --decorate -8
git diff --check
npm run typecheck
npm test -- --run tests/core/b6SourceMediaSnippet.test.ts tests/web/p6PracticeFrontend.test.ts
npm run test:no-network
npm run scan:privacy
npm test
npm run build
node -e "await import('./packages/local-transcription/src/index.ts')"
node --check apps/local-service/src/server.ts
python3 validate_final_bundle.py
git status --short --branch --untracked-files=all
```

QA must record command, exit code, concise result, tested HEAD, tracked/untracked cleanliness, privacy/artifact scan result, and receipt SHA-256. Do not substitute a real-media/real-ffmpeg smoke for fake-runner coverage. A live owned-media smoke is optional and remains skipped unless a fresh task supplies the exact approved path and cleanup plan.

## Documentation/status update contract

LDM5-01 should update only docs whose statements become materially stale:

- `PLAN.md` B6 status: mark the selected source-audio snippet slice implemented while preserving browser-only ranges/saved-occurrence reuse as deferred if they remain deferred.
- `PLAN-STATUS.md` B6 row/current state: record exact implementation commit and limits, without claiming push/deploy/acceptance before those gates occur.
- `docs/dev/local-runbook.md`: add the explicit owned path, Practice audio-recall flow, session/LRU/delete cleanup semantics, no-export behavior, and synthetic/fake-runner validation command.
- Safety/privacy docs only if implementation changes a boundary; do not weaken the authoritative defaults.

Do not record private paths, generated snippet ids, media bytes, or transient cache locations in committed docs.

## Final human-gate contract

`t_730b1a0a` is the manual LDM5 decision gate. It must not silently accept, push, open a PR, deploy, release, publish, or authorize a new batch.

The final packet must include:

1. manifest path/hash and all exact implementation/review/QA commit SHAs;
2. changed files and behavior summary;
3. focused/full command receipts and reviewer/QA verdicts;
4. cache cleanup and export-exclusion evidence;
5. Node 26.5 strip-only evidence;
6. known limitations and deferred browser/saved-occurrence/media-export work;
7. preserved non-authorizations;
8. explicit decision options.

Recommended options:

- `accept local only`;
- `repair` with concrete findings;
- `authorize push` after fresh remote/status/secret preflight;
- `authorize PR` only with a fresh exact gate;
- `deploy locally` only with fresh service/runtime preflight and health verification;
- `authorize next local batch` while preserving all unrelated gates.

After commenting packet path/hash/SHA/options, LDM5-04 must block with:

`HUMAN-GATE: Lingotorte LDM5 B6 snippet packet ready; choose accept, repair, authorize push/PR, deploy locally, or authorize next local batch`

## Handoff note for LDM5-01

Implement the smallest complete product path: one explicit absolute owned media path plus one due-card cue range becomes one transient mono WAV, fetched from the loopback service through an opaque id and played inside Practice `audio-recall`; after browser blob creation, delete the service file, revoke browser URLs when superseded, and leave no durable snippet/export/cache trace. Replace the current microphone/SpeechRecognition branch rather than extending it. Keep every runner fakeable, every public path redacted, every node-executed import explicit `.ts`, and every remote/provider/microphone/media-download action blocked.
