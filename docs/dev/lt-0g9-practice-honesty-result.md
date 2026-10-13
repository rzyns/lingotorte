# lt-0g9 — Honest practice prompts, grading and next-card state (result)

Base: `main` 097fca7 (this includes the lt-2rl live clock, lt-3wr mature-due and lt-f5h practice persistence work). The changes are uncommitted and still need independent review.

## Per-mode contract (`practiceContractFor` / `gradePracticeAnswer` in `apps/web/src/model.ts`)

| Mode | Prompt shown before answering | Expected answer (stored as `expectedAnswer`) | Pass / hesitation / fail | Skip | FSRS effect |
|---|---|---|---|---|---|
| typed-input | "Type the saved text." plus any hints that do not contain the answer: the meaning, the native cue, and the source cue with the saved span replaced by `____`. If no hint is safe, it shows "Replay the source cue for a hint." | The saved item's `displayText` (the saved-word response) | Exact match after whitespace/case normalisation = pass. A substring of at least 3 characters = pass-with-hesitation. Anything else = fail. | An empty answer or the Skip button = `skipped` | pass→good, hesitation→hard, fail→again, skipped→no update |
| multiple-choice | "Choose the saved text." plus the same safe hints. The choices are created once per card and stay the same across rerenders and wake timers. | The saved item's `displayText` | Exact match = pass. Otherwise fail. There is no hesitation grade. | Skip = `skipped` | Same as above |
| sentence-builder | "Build the source cue from the shuffled words." plus the native cue (only if it does not contain the answer). The word pool is shuffled and is never shown in answer order when another order exists. | The source cue's `text` (cue transcription) | Exact match = pass. Otherwise fail. | Skip / no tokens placed = `skipped` | Same as above |
| audio-recall | "Listen to the owned source cue, then type what you hear." plus the native cue if it is safe | The source cue's `text` (cue transcription) | Same as typed-input, including hesitation | Same as typed-input | Same as above |
| speaking | "Speaking practice is unavailable…" No input is shown, Submit and Skip are disabled, the model rejects submissions, and no microphone or `getUserMedia` is used | — | — | — | none |

These rules apply in every mode:
- **Reveal:** the source cue and native line are hidden until the learner presses "Reveal answer". After a reveal, a non-empty submission is graded `fail` (FSRS again). The reveal state belongs only to the card it was made on.
- **Leak check:** the hint filter drops any hint whose text contains the expected answer.
- **Retry:** after a submission the card is rescheduled by FSRS and comes back when it is due again, as before. Practice has no immediate retry.

## Cause (R9, confirmed in source)
- The Practice view showed `card.promptTemplate` (`Recognize: ${displayText}`), which contains the answer. The source cue was also visible before answering in every mode except audio-recall.
- Typed-input and multiple-choice were graded against `displayText`, while sentence-builder was graded against the cue text. The prompt did not say which one was expected.
- `pendingAnswer`, sentence-builder tokens, `review.revealed` and practice reveal carried over to the next card. Multiple-choice choices were re-randomised on every render. Speaking showed a typed input and graded it.

## Correction
- **`model.ts`:**
  - Added `PracticeContract`, `practiceContractFor`, `gradePracticeAnswer`, `syncPracticeCard`, `practiceChoicesFor`, `revealPracticeAnswer` and `PRACTICE_SPEAKING_UNAVAILABLE`.
  - Typed, multiple-choice, audio and sentence-builder submissions now go through one function, `recordPracticeAttempt`, which still uses `resolveActiveDueCard`, so the lt-2rl rule (the displayed card is the one graded) still holds.
  - Replaced the shuffle with Fisher–Yates. The sentence-builder pool is never in answer order.
  - `setPracticeMode` clears the per-card input.
  - `clearStaleLearnerUi` resets the new fields.
- **`app.ts`:**
  - The Practice view now uses the contract prompt and shows the unavailable state for speaking.
  - It calls `syncPracticeCard` when the presented card changes.
  - Feedback reads "Previous card — Result: …. Expected: …" and stays visible only for the next card's first presentation.
  - Choices are stable per card, and the answer is hidden until revealed.
  - The Review view resets `revealed` when the card changes and after a rating.
- **`uiTypes.ts`:** added `practice.cardId`, `practice.revealed` and `practice.choices`, and optional `cardId`/`expected`/`nextCardId` on `lastAttemptResult`. These are UI-only fields and are not persisted.
- **Unchanged:** the stored `PracticeAttempt` shape, the schema, migrations and `practiceService`.

## Changed paths and SHA256
| Path | SHA256 |
|---|---|
| apps/web/src/model.ts | d0291692a0c234a6960a144db1f31e4530688a11d20377f9f6cf0d62732298f3 |
| apps/web/src/app.ts | 3225f88395a356be4cea2ea24394b09420fa0039eba4f92d67e02f989dc19463 |
| apps/web/src/uiTypes.ts | 6853534dee1f7404bd3b69307d5ab91a2abe31184e454d8d439ea0c933f43a51 |
| tests/web/lt0g9PracticeHonesty.test.ts (new) | 3abad19e3e404cf41478212e8142f9ff6ab05d58601f79ee392cf09eb28ebae0 |
| tests/web/liveReviewClock.test.ts | 223ba70c7e0ae25a2f8f2aa22f305c8470f0aa4c060166f3780c05b7cf6155bc |
| tests/web/matureDue.test.ts | 5f87649d788ee7668bf4001f014bcc2f133555bb3ee5812b9c821bed0ae6095a |
| tests/web/p6PracticeFrontend.test.ts | a8df67e02712a452004d5773b34a65b40bdc44987849285e9b6b71a703b37653 |

## Red / green (`tests/web/lt0g9PracticeHonesty.test.ts`)
The red run used the original 097fca7 source in a detached scratch worktree with image `lingotorte:lt-0g9-red` (both removed afterwards). Red result: 10 failed of 10. Green: 10 passed.

| Test | Red failure (cause) | Green |
|---|---|---|
| typed-input two cards (no leak, pass→good, skip→no FSRS, SQLite reopen) | prompt `Recognize: <cue>` contained the answer | pass |
| multiple-choice two cards (+ stable choices) | prompt contained the answer | pass |
| sentence-builder two cards | prompt contained the answer | pass |
| audio-recall two cards | card 2 prompt `Recognize: …` contained the answer (the audio prompt was only hidden until the first result) | pass |
| sentence-builder tokens do not carry over | card B pool was missing the tokens left placed on card A | pass |
| typed draft is not prefilled on card B | `niedokończone` was carried over | pass |
| practice reveal → submit = fail; reveal does not carry over | graded `pass` after reveal | pass |
| review reveal does not carry over after rating | `.review-reveal` was shown on card B | pass |
| lexeme: cue transcription vs saved word | prompt `Recognize: lokalny` | pass |
| speaking unavailable, no getUserMedia, no attempt | showed a typed input and the Recognize prompt | pass |

## Existing assertions changed (they encoded the leak)
- `liveReviewClock.test.ts`, two places: asserted that the practice prompt equals `promptTemplate`. They now assert that a prompt exists and that `model.review.activeCardId` is the expected card.
- `matureDue.test.ts`: kept the `promptTemplate` check for Review; for Practice it now asserts that a prompt exists and that the active card is correct.
- `p6PracticeFrontend.test.ts` "shows the practice view…": asserted the cue text was visible before answering. It now asserts the cue text is hidden, and visible after "Reveal answer".

## Verification (Docker, `--network none`)
Image `lingotorte:lt-0g9-cand` = `sha256:42b2aa5deb28c1ff8815366a7024e5ba89f91f7e959aac0d5c90c1cf32be4708`. Logs are in `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-0g9/logs/`.

| Command | Exit | Result |
|---|---|---|
| docker build --target contributor | 0 | |
| vitest focused (new test + p6, liveReviewClock, matureDue, p4, p5, practiceSqliteMigration) | 0 | 7 files, 68 passed |
| vitest full | 0 | 1265 passed / 1 skipped (baseline 1255 + 10 new; the skip is the existing privateDelivery skip) |
| tsc --noEmit | 0 | |
| vite build | 0 | |
| vitest tests/no-network | 0 | 5 passed |
| node scripts/check-privacy-boundaries.mjs | 0 | |
| git diff --check | 0 | |

## Limitations / out of scope
- The tests run in JSDOM, not a real browser.
- Lexeme/phrase leak checks rely on the hint filter, which uses a substring match. A saved text that is a common substring of the meaning or native line drops that hint.
- Hints exist only for the card's own native/cue context. There is no dictionary.
- Multiple-choice distractors come from saved items and cues in the same store. With very few items there may be only one or two choices.
- `responseMs` is still 0. Study-time metrics (lt-8vu) and audio-recall snippet races (lt-q3d) are not addressed.
