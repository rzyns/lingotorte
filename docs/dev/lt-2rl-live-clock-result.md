# lt-2rl — live injectable clock for review and practice

Status: implemented and container-tested candidate on `work/lt-2rl-live-clock`, based on main `7acb49d` (includes lt-3wr and lt-04i). Independent spec/quality review is recorded in Beads, not here.

## Cause

`createAppModel()` captured `model.review.bucketAsOf = new Date()` once. Every review/practice query (`listReviewBuckets`, `pickNextDueCard`) and every submission (`submitReviewRating`, `submitPracticeAttempt`, `submitSentenceBuilderAttempt`) reused it. The only refresh was the Saved view's "Create review card" button. Consequences in an open session:

- every rating and practice attempt was stamped with the session-start instant, so later actions got identical (stale) timestamps and FSRS scheduled from the wrong `now`;
- a learning card rated *Again* (due in minutes) never reappeared without a reload, because the queue was evaluated at the frozen instant;
- the header progress rail used `new Date()` while the Review/Practice views used the frozen instant, so due counts and selection could disagree.

## Correction

- `AppModel.clock: () => Date` replaces `review.bucketAsOf`. The default reads system time; `setLearningClock(model, clock)` injects one. `setReviewBucketAsOf(model, asOf)` is kept as a deterministic helper that pins the clock to one instant, so existing fixture tests keep their meaning.
- Every query and submission boundary reads `model.clock()` at that moment: Review buckets/selection, Practice selection, rating clicks, practice/sentence-builder submits, the header progress rail and `studyMetrics`.
- `resolveActiveDueCard(model, asOf)` is shared by both Review and Practice rendering and by practice submission. It keeps the displayed card while it remains due and otherwise picks the next due card. A submission therefore grades the card that was shown, even if a higher-priority card became due between display and submit; re-picking at submit time would have graded a card the learner never saw.
- While Review or Practice is mounted, `rerenderApp` schedules one wake timer for the earliest future due instant (`nextReviewDueAfter`), capped at 60 s so sleep or clock jumps re-check. The timer is cleared on every render and does nothing for other views or a detached root. The Player view is never re-rendered by it, so the video element is preserved.

No storage, schema, domain, FSRS scheduler or service change. Card creation keeps the review package's own `new Date()` for initial state, which is already live.

Changed paths: `apps/web/src/app.ts`, `apps/web/src/model.ts`, `apps/web/src/uiTypes.ts`, `tests/web/liveReviewClock.test.ts` (new), `tests/web/p6PracticeFrontend.test.ts` (one call site moved from `bucketAsOf` to `clock()`), this document.

## Regression evidence

All runs used `docker run --rm --init --network none` against contributor images built from the exact tree. Vitest fake timers fake `Date`, `setTimeout` and `clearTimeout`, so the same tests drive both the original and fixed code through the real JSDOM-rendered buttons.

Red: new test file only, original production source (detached copy of `7acb49d`). **4 failed, 2 passed**, exit 1:

| Test | Original failure |
| --- | --- |
| rating stamps the click time | `reviewedAt` was `10:00:00.000Z` (session start), expected `10:00:05.000Z` |
| learning card reappears in open Review when due | empty state still shown at and after the due instant |
| practice attempts stamped at submit time; card resurfaces | `reviewedAt` was `10:00:00.000Z`, expected `10:00:07.000Z` |
| selection/buckets/counts/backend agree across the due boundary | Review/Practice views showed no prompt while the backend queue, buckets, counts and selection reported the card due |

The two tests that passed on the original code guard properties of the fix rather than reproduce the reported bug: Practice grades the displayed card, and the Player view is not re-rendered.

Green: **6 passed**, exit 0. Coverage: the boundary one millisecond before due, exactly at due, and after due; strictly increasing timestamps for successive review ratings and practice attempts on the same card without reload; backend `listDueCards` agrees with web buckets, `learnerProgress.dueCards`, `pickNextDueCard` and rendered Review/Practice prompts at each instant; the displayed practice card is graded even when a higher-priority card becomes due before submit; the Player `<video>` element is preserved across a due instant.

Mutation checks, on separate scratch copies of the fixed tree:

1. Re-pick at submit plus an unconditional 1 ms re-render loop: 3 failed (displayed-card grading and both reappearance tests time out), which shows those tests catch it.
2. Wake timer without the Review/Practice view guard: the Player-preservation test fails.

## Candidate and verification

Image `sha256:00a696fd8a85de9403c24b14f560858aed2bb966c65bdf8f91ad447574b2b705` (contributor target, pinned Dockerfile/lockfile, no mounts).

| Check | Result |
| --- | --- |
| Full Vitest suite | 1255 passed, 1 skipped (pre-existing `privateDelivery` skip); 54 files + 1 skipped; exit 0 |
| `tsc --noEmit` | exit 0 |
| Vite production build | exit 0, 35 modules |
| `tests/no-network` | 5 passed, exit 0 |
| `check-privacy-boundaries.mjs` | `ok: true` (reference-product marker scan only) |
| `git diff --check` | clean |

Source SHA256 at the candidate:

| Path | SHA256 |
| --- | --- |
| `apps/web/src/app.ts` | `776043fa9d4b31879bc10fce1bf550a31622457cacef647c9f34a024e4e8df7b` |
| `apps/web/src/model.ts` | `0f17af23377bb51be9357f53c1743c8746a776a60976e2cdfeac5fe2b90a6848` |
| `apps/web/src/uiTypes.ts` | `5c5bc39bb46069f021b2bee3669be51b4b4eb4b752d52d49f8bfcf4405b32cd1` |
| `tests/web/liveReviewClock.test.ts` | `96a739ca1438212c178c8a31f6c2f0961198fe2beeff9846ecf1cb5b2924c303` |
| `tests/web/p6PracticeFrontend.test.ts` | `6037bd901135b8b8cce0cb87fbba50588e0918233840d6337967434cba43bef3` |

## Boundaries and limitations

- Linux container plus JSDOM evidence, not real-browser qualification. A real-browser multi-card session belongs to `lt-3bi`.
- The header progress rail is recomputed on every render with the live clock, but outside Review/Practice there is no wake timer. In Player, the "N due" token updates on the next interaction, not at the exact due instant. This was chosen deliberately so that playback is never re-rendered.
- Reveal state carrying across cards, prompt leakage and result/answer clearing on card transition are `lt-0g9` scope; the new tests do not assert them.
- Study-metric day semantics and linked-event double counting are `lt-8vu` scope. `studyMetrics` only switched its default `asOf` to the model clock.
- Synthetic fixtures only; no real learner state, providers, media discovery or deployment.
