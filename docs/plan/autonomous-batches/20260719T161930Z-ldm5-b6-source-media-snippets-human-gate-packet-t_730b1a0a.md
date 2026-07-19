# LDM5 B6 source-media snippets human-gate packet

Generated: `2026-07-19T16:19:30Z` (`2026-07-19T12:19:30-04:00`)
Gate task: `t_730b1a0a`
Branch: `lingotorte/m1-daily-driver-polish`
Workspace/worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
Pre-packet HEAD: `31df3b9bdddc4bfb310e81697fcd7f9ea8a9eec8`
Tracking snapshot before this packet: `origin/lingotorte/m1-daily-driver-polish`, local branch ahead 4 and behind 0

## Decision headline

The repaired LDM5 B6 source-media snippet slice is ready for a human decision. It adds transient, cue-bounded source-audio playback for Practice from an explicitly supplied owned local media path. The original independent review correctly returned BLOCK for an in-flight cleanup race; an exact two-file repair landed, a fresh independent re-review returned PASS, and QA returned PASS on the repaired commit.

Recommended posture: `accept local only` if the local-only behavior and evidence limitations below are satisfactory. This packet does not itself accept, push, open a PR, deploy, release, publish, or authorize another batch.

## Evidence navigation

Derived from:

- Active manifest: `docs/plan/autonomous-batches/20260719T151339Z-ldm5-b6-source-media-snippets-batch-manifest-t_862d56c9.md`
  - SHA-256: `e3cdd74e44ce575db625d9d54bacfc83caa6604778664c5eb50806f59f984723`
  - Commit: `352c3e9ec37a97a129657d7ef10ca108e47b75fd`
- Historical concurrent predecessor manifest: `docs/plan/autonomous-batches/20260719T150913Z-ldm5-b6-source-media-snippets-batch-manifest-t_e6946299.md`
  - Commit: `55c9bf57b008cf505494ebeec1068e9333150ce3`
  - Preserved only as provenance; the active manifest and active task chain supersede its archived routing.
- Implementation: Kanban `t_f5a0ccb6`, commit `2a72f3bb5cb0e88227234535a202e45fa39b8ab9`.
- Original independent review: Kanban `t_0e0c26ee`, BLOCK on `2a72f3bb5cb0e88227234535a202e45fa39b8ab9`.
- Repair: Kanban `t_5c8b9f9c`, commit `31df3b9bdddc4bfb310e81697fcd7f9ea8a9eec8`.
- Fresh independent re-review: Kanban `t_3f8ba538`, PASS on `31df3b9bdddc4bfb310e81697fcd7f9ea8a9eec8`.
- QA: Kanban `t_354f7b63`, PASS on `31df3b9bdddc4bfb310e81697fcd7f9ea8a9eec8`.
  - Receipt: `/home/openclaw/.hermes/artifacts/kanban/t_354f7b63/ldm5-03-qa-receipt.md`
  - Receipt SHA-256: `81f2c6b29e81fe60bdf931ab2a916612c0965931f98b788dbbb69cb6bc5e3821`

The review and QA stages were read-only and created no Git commits. Their exact reviewed/tested commit is therefore recorded above instead of inventing review or QA SHAs.

## What changed

The implementation now:

- extracts at most 30 seconds of cue-bounded mono 16 kHz PCM WAV through the injectable local ffmpeg adapter;
- requires an explicit absolute owned-local media path and keeps media/scratch paths out of public job results;
- exposes loopback-only asynchronous generation, opaque retrieval, and strict deletion routes;
- replaces the Practice `audio-recall` microphone/speech-recognition branch with transient source-audio playback plus the existing typed-answer submission flow;
- hides target/native answer text until submit or explicit reveal;
- keeps snippet generation separate from transcript approval, FSRS updates, and attempt submission;
- uses a service-session-only 16-entry LRU, successful-read early deletion, browser object-URL revocation, startup cleanup, service-close cleanup, and global scratch cleanup;
- excludes snippet bytes, ids, paths, and cache metadata from learner state, SQLite snapshots, practice attempts, exports, and backups;
- keeps provider/TTS, microphone, online download, and real learner/media mutation outside the slice.

Implementation commit `2a72f3b` changed these nine paths:

- `PLAN-STATUS.md`
- `PLAN.md`
- `apps/local-service/src/server.ts`
- `apps/web/src/app.ts`
- `apps/web/src/sourceAudioSnippet.ts`
- `docs/dev/local-runbook.md`
- `packages/local-transcription/src/index.ts`
- `tests/core/b6SourceMediaSnippet.test.ts`
- `tests/web/p6PracticeFrontend.test.ts`

Repair commit `31df3b9` changed only:

- `apps/local-service/src/server.ts`
- `tests/core/b6SourceMediaSnippet.test.ts`

The branch also contains the two manifest files named in Evidence navigation. Before this packet, the exact four-commit local delta from the tracking ref was `55c9bf5`, `352c3e9`, `2a72f3b`, and `31df3b9`.

## Review, repair, and QA verdicts

| Stage | Verdict | Exact scope | Outcome |
|---|---|---|---|
| Original review `t_0e0c26ee` | **BLOCK** | `2a72f3b` | A gated fake-runner reproduction proved an extraction could finish after service close and leave a WAV. Acceptance was denied and a repair chain was routed. |
| Repair `t_5c8b9f9c` | complete | `31df3b9`; two files | Tracks and drains in-flight snippet promises, blocks starts/completions while cleaning or closing, and performs final cleanup after settlement. Added deterministic close/global-cleanup race regressions. |
| Fresh re-review `t_3f8ba538` | **PASS** | `31df3b9` | Source inspection plus 20/20 repeated gated race iterations found no residual or reappearing WAV; exact-scope, privacy, test, and build gates passed. |
| QA `t_354f7b63` | **PASS** | `31df3b9` | All 13 contract gates passed with a clean pre/post worktree and no stray WAV or scratch artifact. |

The fresh re-review supersedes the original BLOCK for acceptance. The original finding remains part of the audit trail and is not laundered into a PASS.

## Validation results

QA recorded these commands at repaired HEAD `31df3b9`, all exit 0:

| Gate | Result |
|---|---|
| `git status --short --branch --untracked-files=all` | clean before and after; ahead 4, behind 0; no untracked files |
| `git diff --check` | clean |
| `npm run typecheck` | 0 errors |
| `npm run test:no-network` | 5/5 passed |
| `npm run scan:privacy` | 45 files passed |
| focused B6 core + frontend tests | 28/28 passed: 11 core snippet and 17 frontend |
| full `npm test` | 243/243 passed across 27 files |
| `npm run build` | passed; 204.35 kB JS and 15.21 kB CSS before gzip |
| `python3 validate_final_bundle.py` | 0 errors; 16/16 required manifest entries; 1194 Markdown files |
| Node strip-only dynamic import and syntax check | passed on installed Node 22.23.1 |

Additional repair/re-review evidence:

- repair TDD RED evidence reproduced the original fault before the fix: 9/11 targeted tests passed, with one residual-WAV failure and one global-cleanup timeout;
- repair verification passed 20/20 focused service tests and 10/10 repeated race-file runs;
- independent re-review passed 20/20 repeated close/global-cleanup race iterations;
- all automated media effects used synthetic bytes in test-owned temporary directories and injectable fake runners; no real ffmpeg or private media was used.

## Known limitations and deferred gates

- Exact Node 26.5 re-execution was unavailable to the independent reviewer and QA under the no-download/no-install boundary. Strip-only syntax/import checks passed on Node 22.23.1 and 24.18.0 during re-review, and the changed node graph was inspected for explicit `.ts` imports and prohibited parameter-property/enum/namespace syntax. This is a non-blocking evidence-depth limitation, not a claim of exact Node 26.5 execution by the independent gates.
- No real-owned-media/real-ffmpeg smoke was run. Such a smoke remains optional and requires a fresh task with an explicitly approved owned media path and cleanup plan; generated synthetic media under a test-owned temporary path is the safer default.
- Browser-only range playback for active handles/object URLs, saved-occurrence or transcript-surface snippet buttons, reusable snippet entities, waveform/video editing, and durable media storage remain deferred.
- Snippet media and cache metadata remain intentionally excluded from backup, restore, learner export, portable bundles, Anki/AnkiConnect, and cloud sync.
- Learner microphone capture, voice retention, shadowing, pronunciation scoring, TTS/provider audio, online media download, account-gated/protected media, and DRM/circumvention remain outside authority.
- The local service remains loopback-only and requires an operator-supplied absolute path. Filesystem root confinement and non-loopback/multi-user hardening remain future gates.
- The QA receipt's final sentence names archived predecessor gate `t_4ef087a8`; live Kanban readback confirms that card is archived. Active manifest `t_862d56c9`, active QA child routing, and this packet bind the decision to active gate `t_730b1a0a`. The QA tested commit, command evidence, receipt hash, and PASS verdict are unaffected.

## Human decision options

Choose one or combine only where explicitly intended:

1. `accept local only` — recommended. Accept repaired B6 on the local branch only. No push, PR, deploy, or next batch is implied.
2. `repair` — route a bounded repair for a concrete concern, such as stronger Node 26.5 evidence, a synthetic real-ffmpeg smoke, or root-confinement hardening.
3. `authorize push` — permit a fresh remote/status/divergence/diff/secret/privacy preflight and an exact-scope branch push. This is not PR, merge, release, or deploy authority.
4. `authorize PR` — permit a fresh base/remote/diff/secret/privacy preflight and PR creation. This is not merge authority.
5. `deploy locally` — permit fresh loopback service/web preflight, local rollout or restart, and health/functional verification. This is not hosted/public deployment.
6. `authorize next local batch` — keep work local and materialize the next explicitly selected backlog slice while preserving all unrelated gates.

## Non-authorizations preserved

Unless Janusz explicitly selects the corresponding option, this packet preserves:

- no push, PR, merge, release, package publication, or public sharing;
- no local or hosted deploy/restart;
- no protected/private media access, account/browser credential use, automatic online download, or DRM/circumvention;
- no destructive real learner, media, provider, or account mutation;
- no cloud sync, AnkiConnect mutation, microphone/voice capture, provider expansion, or provider call;
- no committing private/generated/cache/model/media artifacts;
- no authorization of another local batch.

## Packet hash note

The packet SHA-256 and packet commit are intentionally not embedded here to avoid self-reference. The Kanban comment on `t_730b1a0a` records the final path, SHA-256, exact-scope commit, verification, and decision options.
