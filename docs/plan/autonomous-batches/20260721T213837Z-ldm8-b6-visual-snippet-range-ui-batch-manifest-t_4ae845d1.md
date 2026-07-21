# LDM8 B6 visual snippet range UI — autonomous batch manifest

- Manifest task: `t_4ae845d1`
- Authorized direction: Janusz, Cowork chat, 2026-07-21 — “Let's do B6 visual snippet range UI”
- Authorization predecessor: `docs/plan/autonomous-batches/20260721T172731Z-ldm7-gate-decision-push-deploy-t_8d8f9d6e.md`
- Worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
- Branch: `lingotorte/m1-daily-driver-polish`
- Preflight revision: `f1fcd29f102af5ae6f15b47481854fb0130ebda6`
- Upstream at preflight: `origin/lingotorte/m1-daily-driver-polish`, ahead `0`, behind `0`
- Publication state: already pushed through the preflight revision; **no further push, PR, release, or deploy is authorized by this manifest**

## 1. Purpose and bounded outcome

LDM8 closes the remaining B6 interaction gap between two already-deployed foundations:

1. the player model can represent and enforce arbitrary millisecond loop ranges and can derive a word-timed range from the current transcript selection; and
2. the LDM5 local-service path can extract a transient source-audio WAV for an explicit `startMs`/`endMs` range, with a 30-second cap, opaque retrieval, immediate retrieval deletion, bounded session LRU, and cleanup on service shutdown.

The missing product surface is a visual, keyboard-usable way to select a source-media interval, see its exact bounds, apply it as the video loop, and prepare/play a transient source-audio snippet for the same interval.

LDM8 is complete only when a user can do that in the Player view against owned local media, with clear validation and lifecycle feedback, without provider calls, media downloads, durable snippet storage, or learner-state pollution.

## 2. Preflight evidence and revision guard

Preflight on 2026-07-21 established:

- clean worktree on `lingotorte/m1-daily-driver-polish`;
- `HEAD` exactly `f1fcd29f102af5ae6f15b47481854fb0130ebda6`;
- upstream exactly `origin/lingotorte/m1-daily-driver-polish` with `0/0` divergence;
- active Node binary `/home/linuxbrew/.linuxbrew/bin/node`, version `v26.5.0`;
- Homebrew `node` package pinned;
- no dependency installation or package-manager network action is needed or authorized.

Source anchors at preflight:

| Source | SHA-256 |
|---|---|
| `PLAN.md` | `a630ab3bff633ff58b771c9d7db7aef2ba46d32f58743902a731bf309a70e428` |
| `PLAN-STATUS.md` | `4fc3bb38d24d28804b55811ac428af5774dee6cfcef476f4038a3c5f1311f892` |
| `DECISIONS.md` | `6ba00b2be221f63c880cba3d2fd9d7b927bc853db07620cadd6bbdf8af0024cc` |
| `docs/dev/local-runbook.md` | `513d57b3b16461d52405078934e10e0809a9dfa863f14fd50d8811c237f3cec6` |
| LDM5 B6 manifest | `e3cdd74e44ce575db625d9d54bacfc83caa6604778664c5eb50806f59f984723` |
| LDM7 B7 manifest | `4a929d6353ea95b6b1317328b25797d937d688996261f7f6ed91d2b7f4767b0b` |
| `apps/web/src/model.ts` | `8663b71e48aa98ca6dd6f438cb5838592bbe4353da28604442bb5f13f2590e0f` |
| `apps/web/src/uiTypes.ts` | `7329caa28ab8608c51dd5d845862876d6876cc6a65eb7d6aa4a5b44f611ec578` |
| `apps/web/src/app.ts` | `97f38e5603941e9600825d937b6e747b640ec512e6c3f6308ee56f302d574dcb` |
| `apps/web/src/sourceAudioSnippet.ts` | `8215528ec2975e92894a830a46480d5b28c2ed9cf5b33a60e72d2bec2b69dee3` |
| `apps/local-service/src/server.ts` | `f327ff67280c6a060581d8fb3d99b82bcebf594103982b7e646972dca52a7458` |
| `packages/local-transcription/src/index.ts` | `11e121320f5b1b6dfa68072a7b972ba989bc969703fdb4071457d4930b7c352e` |
| `tests/core/b6SourceMediaSnippet.test.ts` | `c4e4f2694d4147005b1b59f270b86c6662ce6491cc8d1fd80346d1d5babce56a` |

Downstream workers must re-read `HEAD`, `git status`, the manifest, and the changed source before acting. If another reviewed task has advanced the branch, they may continue only when the new revision is a clean descendant and does not contradict this contract. Any incompatible drift must be reported rather than silently overwritten.

## 3. Existing foundation — do not rebuild it

The implementation must extend, not replace, these foundations:

- `PlayerState.loopRange` and `setLoopRange` / `toggleLoopRange` / `clearLoopRange` in `apps/web/src/uiTypes.ts` and `apps/web/src/model.ts`;
- `activeLoopRangeForSelection`, which maps the current transcript selection to overlapping word timings and returns the minimum word start and maximum word end;
- `applyLoopTolerance`, already called from the video `timeupdate` handler;
- transcript word timing buttons and the existing saved-occurrence `Selection` model;
- `prepareSourceAudioSnippet` / `releaseSourceAudioSnippet` in `apps/web/src/sourceAudioSnippet.ts`, which already submit explicit `startMs`/`endMs` values, retrieve complete WAV bytes, delete service bytes, and manage browser object URLs;
- `source-audio-snippet` local jobs and opaque `/api/snippets/:id` retrieval in `apps/local-service/src/server.ts`;
- `extractSourceAudioSnippet` in `packages/local-transcription/src/index.ts`, including absolute input/output paths, strict integer range validation, `endMs > startMs`, and maximum duration `30_000` ms;
- LDM5 repair `31df3b9`, which drains in-flight snippet extraction before global or close cleanup;
- LDM7 repairs `c595d19` and `781e626`, which demonstrate per-model operation generations, initiating-context checks, pre-commit guards, and stale-failure suppression.

The service route is already explicit-range capable. Do not alter its request/result schema or cleanup architecture unless a failing contract test proves an actual gap. A UI-only extension plus lifecycle/race hardening is preferred over speculative backend churn.

## 4. Product and state contract

### 4.1 Canonical visual selector

LDM8 chooses a bounded M1 design:

- a **dual-handle timeline range selector** in the Player surface is the canonical arbitrary-range affordance;
- use native keyboard-operable range inputs (or an equivalently accessible control) for start and end;
- show start, end, and computed duration in human-readable time beside the selector;
- show the selected interval visually on the timeline;
- include a clear/reset action;
- include an explicit **Use transcript selection** action that seeds the timeline from `activeLoopRangeForSelection` when the current selection has usable word timings.

A custom pointer-only canvas, mouse-only drag gesture, or pixel-only interaction is not acceptable. A separate transcript drag-selection rewrite is optional and is not required for LDM8 if the canonical timeline and transcript-seeding action meet this contract.

### 4.2 Separate transient concepts

Do not conflate these states:

1. learner text `selection`, used by Save occurrence and source-context capture;
2. the visual source range under edit;
3. the active video `loopRange`;
4. the browser object URL/status for a prepared source-audio snippet.

Add a typed, transient source-range selection to the player/UI model, with integer `{ startMs, endMs }` values or `null`. The selected range must not become a saved item, occurrence, review card, export field, backup field, or storage record.

Applying **Loop selected range** copies the selected values into the existing loop API. Clearing or moving the visual selection must not silently mutate an already-active loop; the user reapplies deliberately. **Clear loop** remains explicit and uses the existing clear API.

The existing learner text selection must remain intact while selecting, looping, preparing, or cleaning a source range. Saving that text selection afterward must preserve the same `SavedOccurrenceSourceContext`, including word-derived time range.

### 4.3 Range normalization and validation

Model helpers, not ad hoc DOM code, own deterministic range rules:

- values are finite non-negative integers in milliseconds;
- `endMs` is strictly greater than `startMs`;
- values are clamped or rejected consistently against known media duration;
- moving one handle through the other must preserve a valid ordered interval deterministically;
- range state is reset or revalidated when media identity changes;
- formatting must not be used as the stored value.

A valid loop selection may exceed 30 seconds. The 30-second limit is specifically the source-audio extraction contract. For a selected duration greater than `30_000` ms:

- looping remains available;
- snippet preparation is disabled or rejected before any fetch;
- the UI clearly states the 30-second maximum and current duration;
- reducing the range to `30_000` ms or less clears the range-too-long condition.

Exactly `30_000` ms is accepted. `30_001` ms is rejected for snippet preparation.

### 4.4 Transcript seeding and no-timing behavior

**Use transcript selection** must:

- require a current selection belonging to a current cue;
- derive its range through the existing word-timing helper;
- preserve the text selection;
- update only the visual range;
- report a clear, non-destructive message when no word timing overlaps the selection.

Missing word timings must not disable manual timeline selection. The user can still choose a millisecond range with the handles.

## 5. Loop action contract

The Player range panel must provide:

- **Loop selected range**: call `setLoopRange` or use `toggleLoopRange` with deliberate on/off semantics for the current selected start/end; do not duplicate range-loop state in DOM-local code;
- **Clear loop**: call the existing loop clear helper;
- visible state that distinguishes “selected range” from “active loop”;
- existing video loop behavior through `applyLoopTolerance`, without a second competing loop engine.

Changing the learner text selection must not implicitly start looping. Applying the loop must not save learner data or prepare audio.

## 6. Transient source-audio action contract

### 6.1 Explicit owned local path

Preparing a source snippet requires all of:

- connected loopback local service;
- a current owned/synthetic local media asset;
- an explicit absolute local-service media path;
- a valid selected range no longer than 30 seconds.

The Player UI may reuse `model.transcriptLifecycle.localAsrMediaPath` and the existing current-media path fallback only when the fallback is an actual absolute local filesystem path. `blob:`, `browser-file-handle:`, HTTP(S), relative, and blank values are not valid service media paths.

The UI must explain that browser handles/object URLs are playback-only and that the local service needs an absolute path to the same owned local media. It must never suggest downloading online media to satisfy the path requirement.

### 6.2 Preparation and playback

**Prepare source audio** must send exactly the selected `startMs` and `endMs` through the existing LDM5 client. On success:

- render a native audio control using the returned browser object URL;
- make playback deliberate rather than autoplaying;
- state that the service scratch copy was deleted after browser retrieval;
- provide **Clean browser audio** to revoke the current object URL;
- keep snippet bytes and object URLs session/transient only.

Starting another preparation, changing range/path/media context, clearing the range, or leaving/replacing the relevant media context must release any superseded object URL. Normal rerenders alone must not revoke a still-current prepared snippet.

### 6.3 Stale-result race safety

A stale asynchronous success or failure must not overwrite the current range/media/path status or install stale audio.

The implementation must use an operation generation plus initiating-context snapshot containing at least:

- media identity;
- normalized absolute media path;
- selected `startMs` and `endMs`;
- operation generation.

Use an operation-local `SourceAudioSnippetLifecycle` while awaiting preparation. Promote the resulting object URL to current UI state only after the context guard passes. If the result is stale, revoke the operation-local URL immediately and suppress current-state mutation. Revalidate context before all success and failure state writes, following the fixed LDM7 pattern rather than checking only successful completion.

A newer operation invalidates an older one. Range, path, or media changes invalidate in-flight operations. A stale operation may finish service cleanup, but may not install UI state or leak a browser object URL.

### 6.4 Clear error states

The range panel must provide a visible status/error region and distinguish at least:

- media duration/range unavailable;
- transcript selection has no usable word timings;
- absolute owned local path required;
- local service disconnected/unreachable;
- range longer than 30 seconds;
- extraction/job/retrieval failure;
- stale/superseded operation, without letting it overwrite newer state.

Filesystem paths in service errors must be redacted. Do not put raw absolute paths in committed fixtures, receipts, or snapshots.

## 7. Safety, privacy, and authority boundaries

`DECISIONS.md` section 8 and the safety/privacy review remain authoritative:

- source snippets are extracted only from user-owned/local or synthetic fixture media;
- no Lingopie code, assets, private APIs, media, subtitle payloads, accounts, cookies, tokens, or protected streams;
- no online media download, capture, DRM bypass, or stream extraction;
- no TTS/provider-generated replacement audio in B6;
- no ElevenLabs or other provider call;
- online providers remain disabled by default;
- no microphone capture, learner voice retention, or cloud pronunciation scoring;
- no durable snippet cache, snippet export, backup inclusion, or media-copy behavior;
- no snippet bytes, IDs, object URLs, scratch paths, or statuses in learner persistence;
- no destructive real learner/media/provider mutation;
- no package/model download;
- no secrets, private paths, generated cache, WAV, media, browser profile, or build output in Git;
- no push, PR, release, deploy, service rollout, or public action.

The deployed service remains loopback-only. LDM8 does not authorize widening listeners, altering provider gates, or introducing a network dependency.

## 8. Implementation file budget

Expected implementation scope:

- `apps/web/src/uiTypes.ts`
- `apps/web/src/model.ts`
- `apps/web/src/app.ts`
- `apps/web/src/styles.css`
- `apps/web/src/sourceAudioSnippet.ts` only if shared browser-side validation/lifecycle support is needed
- `tests/web/b6VisualRangeFrontend.test.ts` as the preferred new focused UI contract file
- `tests/web/p2PlayerTranscript.test.ts` only for focused regression updates to existing loop behavior
- `tests/core/b6SourceMediaSnippet.test.ts` only if a service/client boundary regression is needed
- `docs/dev/local-runbook.md`
- `PLAN-STATUS.md`

Changes to `apps/local-service/src/server.ts` or `packages/local-transcription/src/index.ts` require a failing test demonstrating that the deployed explicit-range contract is insufficient. Dependency manifests, export schemas, storage schemas, `DECISIONS.md`, and provider code are outside scope unless a concrete blocker is raised and separately authorized.

## 9. Required automated contract

Implementation is test-first and fake-only. Automated tests must not run real ffmpeg, contact a provider, download media, or depend on a real local service.

### 9.1 Model/range tests

Prove:

- deterministic valid range creation, ordering, clamping/rejection, and clearing;
- start/end/duration rendering;
- handle input and keyboard-accessible labels/values;
- transcript-seeded range from word timings;
- no-word-timing message with manual timeline still usable;
- selected range and active loop remain distinct;
- apply/clear loop uses existing model behavior;
- media change invalidates incompatible selected range and prepared snippet context;
- exactly 30 seconds accepted for preparation and 30,001 ms rejected before fetch.

### 9.2 Frontend snippet tests with faked responses

Keep the existing service tests backed by injectable command runners green. Any service-side change must add a focused injectable-runner regression to `tests/core/b6SourceMediaSnippet.test.ts`; no automated test may invoke real ffmpeg.

Prove:

- exact selected range appears in the `source-audio-snippet` POST payload;
- disconnected service and missing/invalid path fail closed before fetch;
- successful job polling, blob retrieval, retrieval `DELETE`, audio control rendering, and explicit browser cleanup;
- service/extraction/retrieval failure displays a redacted status;
- reprepare/range change/path change/media change/clear revokes the prior URL;
- out-of-order stale success is revoked and cannot replace newer audio/status;
- out-of-order stale failure cannot overwrite newer range/media/path state;
- generated audio does not autoplay;
- no microphone API or provider adapter is invoked.

Use injected/faked fetch, object-URL, sleep, and command-runner seams. No real ffmpeg process is permitted.

### 9.3 Learner-state and privacy regressions

Prove:

- visual range operations do not mutate the learner text selection;
- a later Save occurrence preserves its word-derived source context;
- export/backup JSON contains no snippet bytes, object URLs, snippet IDs, scratch paths, or transient UI status;
- provider-disabled/no-network tests remain green;
- privacy scan remains green.

## 10. Node 26.5 strip-only execution contract

All code reachable through direct Node execution must remain erasable TypeScript:

- relative imports in Node-executed `.ts` graphs include explicit `.ts` extensions;
- no TypeScript parameter properties;
- no runtime `enum` declarations outside `.d.ts`;
- no TypeScript `namespace` declarations;
- no unsupported syntax hidden behind tests that only run through Vite transforms.

Do not change or unpin Node. Do not run `npm install`, `npm ci`, `npm update`, `npx` network acquisition, or another package-manager network action without a fresh exact human authorization.

## 11. Validation gates

### 11.1 Implementation gate

From the worktree root, record exact command, exit code, tested `HEAD`, and concise counts:

```bash
git status --short --branch --untracked-files=all
git diff --check
npm run typecheck
npm test -- tests/core/b6SourceMediaSnippet.test.ts tests/web/p2PlayerTranscript.test.ts tests/web/b6VisualRangeFrontend.test.ts
npm run test:no-network
npm run scan:privacy
npm test
npm run build
python3 validate_final_bundle.py
git diff --check
git status --short --branch --untracked-files=all
```

If the exact new focused test filename differs, record the actual path and preserve all contract cases above.

### 11.2 Independent review gate

The reviewer must inspect source, diff, tests, Git state, and Node compatibility, then return `PASS` or `BLOCK` with concrete findings. At minimum, independently challenge:

- pointer and keyboard range behavior;
- no-timing and duration-edge behavior;
- distinction between selection and loop state;
- exact range payload and 30-second edge;
- stale success and stale failure after range/path/media changes;
- object-URL release on every invalidation path;
- absolute-owned-path and path-redaction behavior;
- no persistence/export/provider/microphone expansion;
- test credibility and no real ffmpeg/network actions.

Review is read-only. A `BLOCK` routes to an implementation repair and fresh re-review before QA; it is not papered over by the original implementation worker.

### 11.3 QA integration gate

QA runs the complete gate on a clean reviewed revision and writes a receipt under `/home/openclaw/.hermes/artifacts/kanban/t_05aef81f/`:

```bash
git status --short --branch --untracked-files=all
git log --oneline --decorate -8
git diff --check
npm run typecheck
npm test -- tests/core/b6SourceMediaSnippet.test.ts tests/web/p2PlayerTranscript.test.ts tests/web/b6VisualRangeFrontend.test.ts
npm run test:no-network
npm run scan:privacy
npm test
npm run build
python3 validate_final_bundle.py
git status --short --branch --untracked-files=all
```

The receipt records tested full SHA, command exits/counts, review authority, final Git state, and SHA-256. Generated receipts remain outside Git unless the human-gate packet deliberately summarizes them.

### 11.4 Browser smoke contract

`docs/dev/local-runbook.md` must document a synthetic/local smoke that verifies:

1. import or relink owned/synthetic local media and subtitles;
2. open Player and select a range with both mouse/pointer and keyboard controls;
3. verify visible start, end, and duration;
4. seed from a timed transcript selection and observe the same selected interval;
5. apply and clear video looping;
6. connect the loopback service and provide an explicit absolute path to the same owned media;
7. prepare a range at or below 30 seconds, play it deliberately, then clean browser audio;
8. verify an over-30-second range is rejected for snippet preparation but still loopable;
9. verify disconnected/no-path/no-timing messages;
10. confirm no online/provider/microphone activity and no snippet survives explicit cleanup or session/service shutdown.

No protected/private/proprietary media is used for the smoke.

## 12. Autonomous chain

The approved execution chain is linear unless review findings create a repair branch:

1. `t_4ae845d1` — **LDM8-00 preflight and manifest** (`default`)
   - commit only this manifest;
   - comment path, SHA-256, and commit;
   - no push.
2. `t_c33a1e7f` — **LDM8-01 implement B6 visual snippet range UI** (`backend-eng`)
   - test-first implementation under this contract;
   - update local runbook and `PLAN-STATUS.md`;
   - exact-scope local commit(s), full validation, no push.
3. `t_b3be3f96` — **LDM8-02 independent review** (`reviewer`)
   - read-only `PASS` or `BLOCK`;
   - if blocked, create/route a bounded repair and fresh re-review chain before QA.
4. `t_05aef81f` — **LDM8-03 QA validation** (`qa`)
   - proceed only after authoritative review `PASS`;
   - no code changes; external receipt and task comment.
5. `t_b99dacc1` — **LDM8-04 human gate** (`default`)
   - produce and exact-scope commit a final evidence packet;
   - block `needs_input` for Janusz’s accept/repair/push/PR/deploy/next-batch decision;
   - do not perform any gated action.

A reviewer `BLOCK` takes precedence over schedule. QA must defer to the repair/re-review lane rather than validating a known-blocked revision.

## 13. Commit and handoff contract

For every mutating lane:

- preserve unrelated dirty state;
- stage only intended paths;
- run `git diff --cached --check` and inspect staged names/stat;
- scan the staged diff for credentials, tokens, private paths, media bytes, object URLs, generated output, and unexpected dependency changes;
- create a local exact-scope commit;
- report full commit SHA and changed paths on the task;
- do not push.

For this manifest lane, the only intended changed path is:

`docs/plan/autonomous-batches/20260721T213837Z-ldm8-b6-visual-snippet-range-ui-batch-manifest-t_4ae845d1.md`

## 14. Human gate after LDM8

LDM8 completion does not authorize publication or rollout. The final packet must offer explicit choices, separately:

- accept the local implementation only;
- require repair;
- authorize a normal push to the verified branch;
- authorize PR creation;
- authorize local deployment/restart;
- authorize a named next local batch.

Force-push, history rewrite, remote deletion, release/package publication, external deployment, provider activation, media acquisition, and public announcement remain outside this lane.
