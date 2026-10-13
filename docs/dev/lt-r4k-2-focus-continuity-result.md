# lt-r4k.2 — keyboard focus continuity result

Base: `main` 5af4047, branch `work/lt-r4k.2`. Uncommitted at hand-off.

## Defect

`rerenderApp` only restored focus to an element with the same `id`. Actions that remove or replace the activated
control (transcript Approve, review Rate, practice Submit/Skip, multiple-choice answer) left focus on `<body>`.

## Mechanism

`requestFocusAfterRender(model, ...ids)` in `apps/web/src/app.ts` stores an ordered successor list in a
module-level `WeakMap<AppModel, string[]>`. The next `rerenderApp(model)` consumes it once and focuses the first id
that exists after rendering; otherwise the previous same-id restore applies unchanged. Only user-action click
handlers call it, so timer, learning-wake and autosave renders never move focus. Successor regions get
`tabindex="-1"` and a label or text.

## Successor table

| Action | Successor (first present) |
| --- | --- |
| Transcript "Approve transcript for study" | `#transcript-lifecycle-status` (role=status, aria-label "Transcript status") |
| Review Rate Again/Hard/Good/Easy | next card's `#review-reveal-toggle` ("Show answer / context") → `#review-empty` |
| Review Show/Hide answer | `#review-reveal-toggle` (now has a stable id) |
| Practice "Submit attempt" (typed, audio-recall, sentence builder) | `#practice-feedback` (aria-label "Practice result") → `#practice-empty` → `#practice-prompt` |
| Multiple-choice answer | same as Submit attempt |
| Practice Skip | same as Submit attempt |
| Practice "Reveal answer" | `#practice-revealed-answer` (aria-label "Revealed answer: …") |

## Tests

`tests/web/ltr4k2FocusContinuity.test.ts`, 17 JSDOM tests: each control is focused, activated by click and by
Enter keydown followed by click (the existing handlers are click-only; Enter on a button triggers click in a
browser), then `document.activeElement` must not be `<body>` and must be the successor. A further test
checks that a render with no pending request (as a timer would trigger) does not move focus.

- Red (app.ts stashed): 17 failed / 17, exit 1.
- Green: 17 passed / 17.

## Commands (Docker, `--network none`)

- `docker build --target contributor -t lingotorte:r4k2 .` — image `sha256:2034f548a4ac47475aaf72b1fd09aab5219c50cca5e105ea498d7f01f5f2aa89`
- `npx vitest run` ×3: 69 files passed, 1 skipped; 1411 tests passed, 1 skipped; exit 0 each time.
- `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npm run scan:privacy` exit 0 (66 files).

## Sibling findings not fixed (outside main learning loop)

These handlers call `rerenderApp` from buttons without stable ids; focus may fall to `<body>` if the button
is replaced: Replay source cue (changes view to player, which is intended), export/import (Generate export,
restore preview/apply/resume), local-service connection choice buttons, source-audio prepare/clean, sentence
builder token buttons, transcript split/offset buttons, Save word / Create review card in the player.

## Limitations

JSDOM cannot check focus rings or `:focus-visible`. Those need a real browser, in lt-3kk journey-13.

## Independent review (deleg_879914fd) and corrections

Verdict: SPEC PASS, QUALITY APPROVED and ACCESSIBILITY PASS, with no blockers. I applied these notes:

- `rerenderApp` now consumes the pending focus request before its `#app` early return, so a request can never survive to a later render.
- A comment on `requestFocusAfterRender` says that any future request made before an `await` must check `activeElement`.
- I removed `aria-label` from the `role=status` successor regions ("Practice result" and "Transcript status"), so screen readers read the verdict text when focus lands on them.
- I renamed the misnamed test to "non-user render never moves focus" and added "a pending request is consumed by exactly one render".

Follow-up, not in this issue: the same focus-successor treatment for restore, local-service choice, source-audio prepare, sentence-builder tokens, split/offset, Save word and Create review card.
