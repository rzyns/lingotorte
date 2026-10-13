# lt-8vu — estimated study metrics, local-day semantics, linked-event dedupe

Base: `work/lt-8vu-study-metrics` = main `93838c1`. Changes are uncommitted.

## Policy

- **Study action**: one plain review rating, one practice attempt with no resolvable linked review (skipped, `updateFsrs: false`, or unknown link id), or **one practice attempt plus the FSRS review event it created** (`eventLink.reviewEventId` matching a persisted review). A linked pair counts **once** for time and streak.
- **Time is an estimate**: `STUDY_ESTIMATE_MS_PER_ACTION = 45_000` (45 s) per study action. No real time-on-task is measured.
- **Local day**: a calendar-day key in the learner's zone. Default is `localDayKey`, which uses Date local getters (the browser/runtime zone). It can be injected with `timeZoneDayKey(IANA)` (Intl) or `fixedOffsetDayKey(minutes)`. "Today" uses `model.clock()`. The streak compares consecutive calendar-day keys, so 23 h and 25 h DST days still count as one day each. A streak survives only if the last study day is today or yesterday.
- **Privacy**: metrics are still derived only from `store.snapshot()` review events and practice attempts. There are no new storage fields, no schema change, and no network or analytics.
- **UI**: the rail token reads `~45s today • ~1m 30s total (estimated)`. It has `aria-label="Estimated study time: about … today, about … total"`, a `title` explaining the estimate, and `data-estimate="true"`. The existing `data-*` attributes are unchanged.

## Changed files (SHA256)

| File | SHA256 |
|---|---|
| apps/web/src/model.ts | 9e86f9da947cc8fedb9bc514d1e169c16d5a3df5b1ba8853fd92d730ca52e662 |
| apps/web/src/app.ts | 174d0e5f94b7bb976f233788f607e6165499a3902a17c468debd2bee78a651cd |
| tests/web/lt8vuStudyMetrics.test.ts (new) | c814c52fb3f9badc15158f17f88a301725328fa2a32465f2cfdfea36176803ce |
| tests/web/p2PlayerTranscript.test.ts | 75f419111474ec9c0bc9d27173e6d1415e914291e6d322a9d3c6e603355eaeff |

Updated assertion: the p2 rail test seeded `${UTC date}T12:00Z`, which encoded the UTC-day assumption. It now seeds local noon of today and yesterday, and also asserts the estimate label and aria-label. The 45s, 1m 30s and 2-day expectations are unchanged.

## Red/green

Red was run in a detached scratch worktree of `93838c1` with only the tests copied in, using image tag `lingotorte:lt-8vu-red` (now removed).

| Test | Original | Candidate |
|---|---|---|
| public API: linked practice+review counts once (3 actions) | FAIL (180000 ≠ 135000: double count) | pass |
| public API: default day is runtime-local under TZ=America/New_York | FAIL (0 ≠ 45000: UTC slicing) | pass |
| p2 rail: estimate label + aria-label | FAIL (label missing) | pass |
| unit: dedupe, unknown link kept, NY near-midnight, today/yesterday boundary, consecutive/gap streak, DST fall-back, localDayKey (7) | FAIL (new exports absent: `timeZoneDayKey is not a function`) | pass |

## Verification (candidate image `lingotorte:lt-8vu-cand` = sha256:3181361976d5c98df5bb9c48cd66c0e92e3cf8d0751c4312ba360e86f2f39518)

All runs used `docker run --rm --init --network none`.

| Command | Result | Exit |
|---|---|---|
| vitest focused (lt8vu + p2PlayerTranscript) | 28 passed | 0 |
| full vitest ×3 (TZ=UTC) | 1305 passed / 1 skipped each | 0,0,0 |
| full vitest, TZ=Pacific/Auckland | 1305 passed / 1 skipped | 0 |
| vitest run tests/no-network | 5 passed | 0 |
| tsc --noEmit | clean | 0 |
| vite build --config vite.config.ts | built | 0 |
| node scripts/check-privacy-boundaries.mjs | pass | 0 |
| git diff --check | clean | 0 |

Total = 1296 baseline + 9 new tests.

Flake note: earlier full runs of an equivalent candidate sometimes failed with a 5000 ms timeout in `tests/core/legacyMigrationQualification.test.ts`, a SQLite backup/upgrade suite this change does not touch. Those failures were intermittent: about 3 of 9 runs, under both UTC and Auckland. They did not recur in the final runs above.

## Limitations

- 45 s per action is a fixed estimate. Real attention time is not measured, by design.
- `studyMetrics` takes an optional `dayKey`, but nothing in the app uses it yet. The UI relies on the browser zone. There is no user preference for time zone.
- If the browser zone changes, past events are bucketed again under the new zone, because metrics are derived and not stored.
- The DST case covers the US fall-back transition through Intl. Spring-forward is not tested separately; it uses the same calendar-key logic.
