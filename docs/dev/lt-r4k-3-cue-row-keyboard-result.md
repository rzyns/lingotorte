# lt-r4k.3 — cue row keyboard activation of nested buttons

- Base: `main` caf5a8a (merge lt-r4k.2).
- Cause: the transcript cue row (`div role=button tabindex=0`, `apps/web/src/app.ts`) handled bubbling `keydown` Enter/Space from its child buttons, called `preventDefault()` (cancelling the button's synthesized click) and seeked instead. Found live in Chrome by lt-3kk journey: Enter on "Save sentence" saved nothing.
- Fix: the row keydown handler returns early unless `e.target === row`. Nested controls keep native activation; no per-button `stopPropagation` added. Row Enter/Space still seeks; document-level shortcuts unchanged.

## Tests

New `tests/web/cueRowNestedKeyboard.test.ts` (JSDOM): for Enter and Space on Save sentence and Show tokens, dispatch a bubbling, cancelable keydown; assert not `defaultPrevented`, `activeCueId`/`currentTimeMs` unchanged; synthesize click only when not prevented; assert a saved item / token preview appears. Plus a row-itself Enter/Space seek check.

- Before fix: 4 failed / 1 passed (all nested-button cases red).
- After fix: focused (new + p2PlayerTranscript) 24/24, exit 0.
- Full suite ×3: 1423 passed, 1 skipped (72 files), exit 0 each.
- `npx tsc --noEmit` 0, `npm run build` 0, `npm run scan:privacy` 0.
- Image `lingotorte:r4k3` sha256:2eac9b5ac5524778442d5de3c37c933c4ce807d517b1fbd41db6640306353905 (removed after run).

Commands: `docker build --target contributor -t lingotorte:r4k3 .`; `docker run --rm --init --network none lingotorte:r4k3 npx vitest run [files]`.

## Limitations / follow-up

- JSDOM does not synthesize clicks from keys; the test simulates it. Real-browser recheck is lt-3kk journey-04.
- ARIA follow-up (not changed here): interactive descendants inside `role=button` is invalid nesting; screen readers may flatten the row. Consider a non-button row with a dedicated seek button.
