# lt-3bi — cross-surface learning-loop qualification (result)

- Date: 2026-10-13
- Base revision: `5874245bc513b7acb098f6f3330e385e240a0b70` (main), branch `work/lt-3bi-learning-loop`, changes uncommitted.
- Review evidence: R3/R7/R9/R12 in `docs/review/plan-review-2026-10-10.md`.
- Product changes: **none** (test and doc changes only).
- Environment: Docker `contributor` target, `--network none`, image `sha256:4a12d68750e33ef7fc902dd594dfae84a68d67b437f8894afd677262a45652f4` (built from the dirty worktree; removed after the run). Node v26.7.0, vitest 4.1.9, JSDOM.

## What was added

- `tests/web/lt3biLearningLoop.test.ts`: one journey on **one** `AppModel` and **one** file-backed SQLite store (temp dir):
  1. browser import of synthetic media + target/native SRT → save 2 sentences + 2 lexemes → 4 cards; one aged into an overdue 30-day review card (the Mastered bucket), two deferred by 1 h.
  2. Review UI, live fake clock: two successive cards (`fresh`, then the overdue `mature`) with distinct click timestamps (T0+4 s, T0+7 s). The learning card becomes due while Review stays open, and the wake timer presents it without a reload.
  3. Practice UI, clock advanced so the lexeme cards are due: audio-recall snippet prepared against a fake paired service. Switching mode while it is pending → the late completion installs no `<audio>` and its object URL is revoked. Then typed-input card 1 (prompt masks the answer) → card 2 (input reset) → sentence-builder on card 2 (fresh token pool of card 2's cue, nothing carried over, prompt masked). Attempt timestamps are taken from the live clock and both attempts link to review events.
  4. Transcript: corrected V2 → dirty editor edit disables Approve → Apply creates V3 → Approve. Saved occurrences are byte-identical and their anchors (track/cue/media fingerprint) still resolve.
  5. `saveStore` → close → fresh model + new DOM → `loadSnapshot` → identical identity/history. Relink of the **renamed** identical file (then again with identical subtitles) keeps the media/track/cue/occurrence/card/state IDs plus all review and practice history, and creates no duplicates.
  6. Metrics after restart: 5 study actions (5 review events, 2 of them linked to practice, + 2 practice attempts) give 5×45 s, equal to the pre-restart figures. The Player rail token is labelled “(estimated)” / “Estimated study time…”.
  7. Save again → reopen: snapshot equality, both practice modes (incl. sentence-builder) and a single media asset persist. Backend due queue, frontend due count and next-card pick agree.
- `tests/web/lt3biReviewProbeRegressions.test.ts`: the four scenarios of the removed probe, each asserting the corrected behaviour.

## Acceptance clause → evidence

| Clause | Journey (this issue) | Existing focused tests (not duplicated) |
| --- | --- | --- |
| Mature due / live time | steps 1, 2, 7 | `matureDue.test.ts`, `liveReviewClock.test.ts` |
| Successive prompts / audio cleanup | step 3 | `lt0g9PracticeHonesty.test.ts`, `ltq3dPracticeAudioGuards.test.ts` |
| Dirty approval | step 4 | `dirtyTranscriptApproval.test.ts` |
| Anchor-preserving relink | steps 4, 5 (SQLite restart, renamed file) | `lt-n31Relink.test.ts` |
| Honest metrics | step 6 | `lt8vuStudyMetrics.test.ts` |
| Four probes replaced | `lt3biReviewProbeRegressions.test.ts` | see table in `docs/review/plan-review-2026-10-10.md` |

## Probe disposition

`node docs/review/probes/plan-review-2026-10-10.mjs` was run at base in Docker (probe dir bind-mounted, since `.dockerignore`/image omits it) → **exit 1**, `AssertionError 1 !== 2` at the first (identical-merge) assertion: the defect no longer reproduces. The probe was **deleted**. The review doc's “Reproduction and validation record” now has a dated note and a probe → regression table, and the observation table is marked historical. No other references existed (checked BEADS.md, README.md, PLAN-STATUS.md, docs/, tests/, package.json).

## Commands and results (image above)

| Command | Exit | Result |
| --- | --- | --- |
| `npx vitest run tests/web/lt3biLearningLoop.test.ts tests/web/lt3biReviewProbeRegressions.test.ts` | 0 | 2 files, 5 tests passed |
| `npx vitest run` ×3 (flake check) | 0,0,0 | each 65 files passed + 1 skipped; 1365 passed + 1 skipped (1366) |
| `npx tsc --noEmit -p tsconfig.json` | 0 | clean |
| `npm run build` | 0 | built |
| `npm run scan:privacy` | 0 | `ok: true`, 63 files |

## Mutation checks (container-local `sed`; host sources untouched)

| Mutation | Result |
| --- | --- |
| M1 `pickNextDueCard` drops the mastered bucket (original R-defect) | journey + probe 4 **fail** |
| M2 `studyActionInstants` stops deduplicating linked practice→review | journey **fails** |
| M3 approval ignores dirty edits | journey **fails** |
| M4 no content-fingerprint relink | journey **fails** |
| M5 stale snippet completion not discarded | journey **fails** |
| M6 `resolveActiveDueCard` ignores the remembered card | journey **passes** (survivor) |

M6 survives because no higher-priority card becomes due between display and submit in the journey. It is killed by `liveReviewClock.test.ts` “grades the practice card that was displayed…”.

## Limitations / open risks

- JSDOM, not a real browser: no real media decode, `<audio>` playback, File System Access handles or IndexedDB. Real-browser relink/approval evidence is in `docs/dev/browser-qual-batch-plan.md` run 4.
- The relink step uses plain-file reselection after restart. The restart rebuilds the store via `replaceSnapshot`, not the local-service hydrate path (`connectLocalService`), which is covered elsewhere (`localServiceSync`, `durableRestoreIntegration`).
- Fake local-service fetch and fake object URLs; no provider/ASR, network or microphone.
- Mutation M6 survives the journey (see above).
