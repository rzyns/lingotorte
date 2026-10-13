# lt-r4k.4 media-error re-render loop — result

## Problem
lt-r4k.1's `<video>` `error` handler (apps/web/src/app.ts `renderVideoStage`) always replaced
`model.player.mediaError` and called `rerenderApp`. The rerender creates a new `<video>` with the same
src; real Chrome fails it again (MEDIA_ERR_SRC_NOT_SUPPORTED, code 4), firing `error` again: an endless
render loop, and each replacement reset `announced`, so `role=alert` re-announced every time.

## Fix
In the handler, if `mediaError` already exists for the same `mediaId`, `source` and `code`, return:
no state replacement, no rerender. The alert stays visible (role=status after the first render);
relink / choose-another-file still clear it (media/source change). A different code for the same
media replaces the error once (new message, announced once as a new error), then repeats of that code
are ignored too.

## Regression
`tests/web/ltR4k4MediaErrorLoop.test.ts` simulates the browser: every newly rendered `.video-stage video`
dispatches `error` once after insertion (capped at 20 iterations).
- Old (red): 2 failed / 1 passed — `expected 20 to be less than or equal to 2` (loop hit the cap).
- New (green): all pass; errors bounded (<= 2), role `alert` then `status`, same `mediaError` object
  with `announced === true`.

## Review note (deleg_c971956d)

SPEC PASS, QUALITY APPROVED, ACCESSIBILITY PASS. Known theoretical edge: a browser alternating two error codes on the same source could still re-render once per change; Chrome reports a fixed code per source, so this is not handled further. The src is deliberately kept so a later successful loadedmetadata can clear the error.
