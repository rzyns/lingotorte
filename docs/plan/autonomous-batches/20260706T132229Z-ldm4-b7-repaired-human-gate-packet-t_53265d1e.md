# LDM4 B7 repaired embedded subtitle extraction human-gate packet

Generated: `2026-07-06T13:22:29Z` (`2026-07-06T09:22:29-04:00`)
Gate task: `t_53265d1e`
Branch: `lingotorte/m1-daily-driver-polish`
Workspace/worktree: `/home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish`
Pre-packet live HEAD: `43afed07824b0aeffb7cf7c14198adcaae6e5b1d`
Supersedes original final-gate card: `t_305e7cc5`

## Artifact Navigation
Role: summary
Review scope: summary_integrity
Derived from:
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/plan/autonomous-batches/20260706T054314Z-ldm4-b7-embedded-subtitle-extraction-batch-manifest-t_d675b28e.md
  -> LDM4 B7 scope, safety boundaries, and original chain contract
- kanban task `t_0f17aafd`
  -> original B7 implementation handoff and commit metadata
- kanban task `t_eb8fe5ad`
  -> original independent review BLOCK and repair requirements
- kanban task `t_7d6722ca`
  -> repaired implementation handoff and commit metadata
- kanban task `t_d89a812a`
  -> independent re-review PASS evidence
- /home/openclaw/.hermes/artifacts/kanban/t_16019a45/receipt.json
  -> QA validation receipt for repaired B7 integration gates
Supported by:
- kanban task `t_16019a45`
  -> QA PASS parent that promoted this human gate
- /home/openclaw/workspace/.worktrees/lingotorte-m1-daily-driver-polish/docs/review/safety-privacy-boundary-review.md
  -> authoritative project boundary and open media-path ownership decision
Feeds:
- kanban task `t_53265d1e`
  -> next human decision gate for acceptance, repair, push/PR/deploy, or next local batch authorization
Verified by:
- `git status --short --branch --untracked-files=all`
  -> clean pre-packet worktree, branch ahead of origin by 5 local commits
- `git diff --name-status origin/lingotorte/m1-daily-driver-polish..HEAD`
  -> live local B7 branch delta scoped to B7 code/tests/docs
- `git diff --name-status 0fc4ba6..HEAD`
  -> only `docs/final/artifact-manifest.json` differs between the QA-recorded docs-maintenance SHA and live pre-packet HEAD

## Decision headline

The repaired LDM4 B7 embedded subtitle extraction slice is ready for a human decision. The original implementation was correctly blocked for draft/approval semantics; the repair fixed that blocker, the independent re-review returned PASS, and QA recorded PASS across the requested validation gates. This packet does not approve, push, PR, deploy, publish, release, or authorize the next batch by itself.

Recommended gate posture: accept the repaired local B7 work if Janusz is satisfied with the current local-only media-path decision; otherwise route a focused repair or explicitly authorize the next boundary.

## Chain summary

| Stage | Task | Verdict/status | Commit / evidence | Key outcome |
|---|---:|---|---|---|
| Preflight | `t_d675b28e` | complete | `6a8f61e190ce2a2c8a57b57bf52bb28593cb8134`; manifest SHA `620ab1a3b847af28283e149bcab67f382bd5e358ccce945d85e6fad45f187090` | Authorized local-only B7 scope: ffprobe listing first, explicit ffmpeg extraction second, owned/local absolute paths, draft/imported transcript semantics, no DRM/protected/private media expansion. |
| Original implementation | `t_0f17aafd` | complete | `046cec7ddc020e5e1703e93fe3ec733f5df958fd` | Added local-service embedded subtitle list/extract jobs, ffprobe/ffmpeg command seams, path redaction, and 23 focused tests. |
| Original review | `t_eb8fe5ad` | BLOCK | reviewer comment and blocked run `855` | Found a critical lifecycle violation: extracted tracks defaulted to `transcriptStatus='approved'` with empty warning flags; also found minor `ffprobePath` fallback to `runtime.ffmpegPath`. |
| Repair | `t_7d6722ca` | complete | `3113ffaa7e8d7d4e514334f8587f28c97d080d32` | Fixed both review findings: extracted embedded subtitles now enter as `draft` with typed provenance and `warningFlags=['timingUnverified','qualityUnreviewed']`; ffprobe fallback is literal `ffprobe`. |
| Re-review | `t_d89a812a` | PASS | source-revalidated review comment and metadata | Confirmed the blocker and minor finding are resolved, existing import semantics are not regressed, test gates pass, and git hygiene is exact-scope. |
| QA | `t_16019a45` | PASS | receipt `/home/openclaw/.hermes/artifacts/kanban/t_16019a45/receipt.json` | Confirmed 9 gates clean: git status, diff-check, focused B7 tests, no-network, typecheck, full test suite, build, privacy scan, and final-bundle validation. |

## What changed on the branch

Compared with `origin/lingotorte/m1-daily-driver-polish` (`28c942afad23d017a2592ad08d15b558b974decd`), the local branch now carries B7 work in these paths:

- `apps/local-service/src/server.ts`
- `packages/local-transcription/src/index.ts`
- `packages/subtitles/src/import.ts`
- `tests/core/b7EmbeddedSubtitleExtraction.test.ts`
- `docs/plan/autonomous-batches/20260706T054314Z-ldm4-b7-embedded-subtitle-extraction-batch-manifest-t_d675b28e.md`
- `docs/review/safety-privacy-boundary-review.md`
- `docs/final/artifact-manifest.json`

Current local commits before this packet:

1. `6a8f61e190ce2a2c8a57b57bf52bb28593cb8134` — `docs: add LDM4 B7 batch manifest`
2. `046cec7ddc020e5e1703e93fe3ec733f5df958fd` — `LDM4-01: implement B7 embedded subtitle track listing and extraction`
3. `3113ffaa7e8d7d4e514334f8587f28c97d080d32` — `LDM4-01R: fix embedded subtitle draft semantics and ffprobePath fallback`
4. `8061aaf22a14fccc6c303f14fa8956aff4ad5147` — `docs: record B7 media-path ownership decision in safety boundary review`
5. `43afed07824b0aeffb7cf7c14198adcaae6e5b1d` — `docs: update safety-privacy-boundary-review SHA and add media-path-ownership decision row`

QA metadata recorded short SHA `0fc4ba6` for a docs-only manifest maintenance commit. Fresh live readback found current branch HEAD is `43afed07824b0aeffb7cf7c14198adcaae6e5b1d`; the diff from `0fc4ba6` to live HEAD touches only `docs/final/artifact-manifest.json`. This packet therefore treats QA's PASS as substantively applicable to the repaired code and notes the live branch SHA separately.

## Validation evidence

From re-review `t_d89a812a`:

- `npm run typecheck`: PASS.
- Full test suite: PASS, `231 passed, 4 skipped`.
- B7 focused suite: PASS, `23/23`.
- `npm run test:no-network`: PASS, `5/5`.
- `npm run build`: PASS.
- `npm run scan:privacy`: PASS, `44 files`.
- `git diff --check`: PASS.
- `git status`: clean.

From QA receipt `t_16019a45`:

- `git_status_clean`: pass.
- `git_diff_check`: pass.
- `b7_focused_tests`: `23/23 pass`.
- `test:no-network`: `5/5 pass`.
- `typecheck`: pass.
- `full_test_suite`: `231 pass, 4 skip`.
- `build`: pass (`201.48 KB JS`, `15.21 KB CSS`).
- `scan:privacy`: `44 files pass`.
- `validate_final_bundle`: `errors=[]`, exit 0.

This final packet is docs-only. It still needs its own packet-level checks after writing: `git diff --check`, `python3 validate_final_bundle.py`, `npm run scan:privacy`, packet hash, and final git status.

## Known limitations and open decisions

- Media-path ownership remains a tracked local-only decision: loopback bind plus absolute-path validation, with the local operator explicitly providing each owned/local media path. No filesystem allowlist/root confinement is enforced yet. The safety review says root confinement should be added holistically before any non-loopback or multi-user deployment.
- The service still exposes local ffprobe/ffmpeg path controls inside the loopback API surface. The repaired bug fixes the ffprobe fallback, but payload-level command-path override remains an inherited local operator surface, not a hardened multi-user boundary.
- Automated validation used fake command runners and synthetic fixtures; it did not inspect, extract, or commit any private media. A real-tool smoke, if desired, should use generated synthetic media under `/tmp` and clean it afterward, or be explicitly authorized with an owned local media path.
- The current gate does not include push, PR, release, hosted deploy, local service restart/deploy, Anki/AnkiConnect, cloud sync, microphone, provider expansion, automatic online download, DRM/protected-stream handling, or public sharing.
- ASS/SSA styling/position/karaoke effects remain non-persisted unless a later product use case is approved.

## Human decision options

Choose one or combine only where explicitly intended:

1. `accept local only` — record the repaired B7 batch as accepted locally. This does not push, PR, deploy, or start a new batch.
2. `repair` — route a focused repair chain for a specific blocker or concern. Suggested repair topics would be media-root confinement, loopback command-path hardening, or a synthetic real-ffmpeg smoke if Janusz wants stronger evidence.
3. `authorize push` — allow a fresh exact-scope preflight and push of this branch to the Janusz-owned remote branch. This is not PR/merge/release/deploy approval.
4. `authorize PR` — allow a PR/open-review workflow after fresh remote/base/secret/diff checks. This is not merge approval.
5. `deploy locally` — allow fresh local service/web preflight and loopback deployment/restart of the accepted branch. This is not hosted/public deployment.
6. `authorize next local batch` — keep the work local-only and materialize the next backlog slice behind the same non-authorizations after this B7 gate is accepted.

## Non-authorizations preserved

Unless Janusz explicitly selects one of the above boundaries, this packet preserves:

- no push/PR/merge/release/package publication/public sharing;
- no hosted or local deployment/restart;
- no protected/private media access, browser credential/cookie/profile use, DRM/circumvention, or automatic online media download;
- no real learner/media/provider/account mutation;
- no cloud sync, AnkiConnect mutation, microphone/voice capture, provider expansion, or provider call;
- no committing private/generated/cache/model/media artifacts.

## Packet self-hash note

The packet SHA-256 is intentionally not embedded in this file to avoid self-hash recursion. The Kanban comment on `t_53265d1e` records this file's path and hash after final verification.
