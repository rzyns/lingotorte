# lt-q3d — Practice source-audio race guards and cleanup

Base: `work/lt-q3d-practice-audio` = main `93838c1`. Changes are uncommitted.

## Cause

The Practice audio-recall prepare handler wrote into one shared lifecycle (`snippet`) and only checked transport ownership:

- no per-operation generation, so a late older success replaced or leaked the URL of a newer one, and a late failure overwrote a ready state;
- nothing bound the snippet to its card, mode, view, media path or service state. Submit/skip, a wake-presented new card, `syncPracticeCard`, a path edit, a mode or view change, or a disconnect left the object URL alive. A re-pair revoked the URL but left the state at "ready";
- the `<audio>` element did not set `autoplay = false` explicitly.

## Guard design

This reuses the Player range-snippet pattern (`sourceRangeSnippetStates`, `synchronizeSourceRangeSnippet`, `invalidateSourceRangeSnippet`) in `apps/web/src/app.ts`:

- **`PracticeSnippetUiState`** gains `generation` and `contextKey`.
- **`practiceSnippetContextKey`** covers the view, practice mode, `practice.cardId`, the number of practice attempts for that card (so a submit/skip that re-presents the same card still counts as a new presentation), the trimmed media path, the service base URL, the connection status and the path policy. It is read-only and never advances the queue.
- **`invalidatePracticeSnippet`** bumps the generation, calls `releaseSourceAudioSnippet` (which revokes the URL and fences an in-flight operation), and sets status and message.
- **`synchronizePracticeSnippet`** invalidates when the context key changed. It runs:
  - at the top level of `renderApp`, so leaving Practice or mode changes are covered;
  - after `syncPracticeCard` in `renderPracticeView`;
  - when the audio panel renders.
- **Prepare** releases the previous URL and captures the generation and context key. It runs into a per-operation lifecycle and installs the URL only if the transport, generation and context are still current; otherwise it revokes it. A late failure is ignored the same way.
- **`transport.onInvalidate`** (re-pair or endpoint change) now invalidates the UI state as well as revoking the URL.
- **Path input** invalidates on every edit and rerenders if audio was present or a prepare was in flight.
- **Audio element** sets `autoplay = false` explicitly and never calls `play()`.

A wake rerender for the same card leaves the context key unchanged, so the snippet survives.

There is no schema change and no new dependency. `sourceAudioSnippet.ts` is unchanged.

## Changed paths

| Path | SHA256 |
|---|---|
| apps/web/src/app.ts | ff94bf8b426477f5db449cb60a5eac9441af974f8cc687072e40fd5db525f646 |
| tests/web/ltq3dPracticeAudioGuards.test.ts (new) | cdbc637dc642be364ebb27beaee673c444f50a16f8d2a831416440638c2075a3 |
| docs/dev/lt-q3d-practice-audio-result.md (new) | — |

## Red/green (tests/web/ltq3dPracticeAudioGuards.test.ts)

The red run used a detached scratch worktree at HEAD `93838c1` with only the new test copied in, under image tag `lt-q3d-red`. The worktree and image were removed afterwards. The test wait timeouts were widened later; the assertions did not change.

| Test | Original | Fixed | Why red |
|---|---|---|---|
| (1) out-of-order success, same card | FAIL | pass | The stale success overwrote or leaked `blob:old`. |
| (1b) out-of-order stale failure | pass | pass | Already covered by the transport-fence path. Kept as a regression guard. |
| (2) submit/skip while preparing | FAIL | pass | The late result was installed for a new presentation. |
| (2b) card change after ready (submit, `syncPracticeCard`) | FAIL | pass | The URL was never revoked on a card change. |
| (2c) wake rerender, same card keeps; new card revokes | FAIL | pass | A new card did not revoke. Same-card keep is asserted in both runs. |
| (3) path edit, mode, view, re-pair while preparing | FAIL | pass | No revoke on path, mode or view change. |
| (3b) disconnect after ready | FAIL | pass | No revoke on status change. |
| (4) retrieval failure, delete failure, then retry | pass | pass | `prepareSourceAudioSnippet` already handled these. Now a regression guard. |
| (5) no autoplay, getUserMedia, provider or export leak | pass | pass | Regression guard. The explicit `autoplay=false` was added anyway. |

Original: 6 failed, 3 passed. Fixed: 9/9 pass.

## Verification

Image `lingotorte:lt-q3d-cand` = `sha256:b4fe79b8e09de357eb4751b0d090bfcaec776a85514c4f2eabd58beef096f31b`. All runs used `docker run --rm --init --network none`.

| Command | Result |
|---|---|
| vitest focused (q3d, p6Practice, lt0g9, liveReviewClock, b6VisualRange) | 70 passed |
| vitest full ×3 | 1305 passed / 1 skipped each, exit 0 (baseline 1296 + 9 new) |
| `npx tsc --noEmit` | exit 0 |
| `npx vite build` | exit 0 |
| vitest tests/no-network | 5 passed |
| `node scripts/check-privacy-boundaries.mjs` | exit 0 |
| `git diff --check` (including the new file via intent-to-add) | exit 0 |

**Load note.** Earlier full runs on the candidate hit intermittent 5 s timeouts. They were in `tests/core/legacyMigrationQualification.test.ts` and `practiceSqliteMigration.test.ts`, SQLite tests this change does not touch, and happened while other agents' containers were running concurrently. Those files pass in isolation (33/33). One earlier run also timed out the 1 s default `vi.waitFor` in new test (5), which is why the new file now uses 8 s waits. The final three full runs were clean. The baseline image passed 1296/1 once in the same period.

## Limitations

- JSDOM with fake fetch and fake `URL.createObjectURL`/`revokeObjectURL`: this is not real audio decoding, browser autoplay policy or a real local service.
- The "wake to a new card" case is simulated by setting `review.activeCardId` and rerendering, not by firing the lt-2rl timer. Same-card wake is simulated as repeated `rerenderApp`.
- Leaving Practice is enforced on the next `renderApp`. A tab close or unload without a rerender relies on browser teardown of blob URLs.
