# lt-r4k.1 — Media error feedback result

- Base: `main` 5af4047, branch `work/lt-r4k.1` (uncommitted).
- Date: 2026-10-13.

## Behaviour

- The Player `<video>` (`renderVideoStage`, `apps/web/src/app.ts`) now listens for `error`. On error it stores
  `model.player.mediaError = { mediaId, source, code, message }`, sets `isPlaying = false`, and rerenders.
- The stage renders a `p.status-banner.error.media-error-alert[role=alert]` from model state, so it survives rerenders.
- The message depends on the MediaError code and never names a codec:
  - 1 (ABORTED): "could not load: playback was aborted…"
  - 2 (NETWORK): "could not load: the browser could not read the file…"
  - 3 (DECODE): "could not be played: the browser could not decode it…"
  - 4 (SRC_NOT_SUPPORTED): "could not be played: the browser does not support its format or codec."
  - Every message ends with "The imported record is kept; relink or choose another file."
  - All messages match the journey-12 pattern.
- The message clears when:
  - the current element fires `loadedmetadata`; or
  - a render finds that the media id or playback URL differs from those in the stored error.
- Stale guard: handlers act only if the element is still connected, is the stage's current `<video>`, and still has
  the same media id and playback URL.
- Listeners are attached to each newly created element. `rerenderApp` replaces the stage, so the old element and its
  closures are detached, and the guard ignores any events they fire later.
- Media identity, learner state and the imported record are unchanged. No decodability check was added at import time.

## Tests

The new test file is `tests/web/ltR4k1MediaErrorFeedback.test.ts` (JSDOM). Its 6 tests stub `video.error` and dispatch
`error` / `loadedmetadata`. They cover:

- alert role and text, and that the record is kept;
- a different message for each code;
- persistence across rerenders, with one alert and one video;
- clearing on `loadedmetadata`;
- clearing on a media change;
- ignoring a stale error or a stale success.

- Red, on the base code: 5 failed, 1 passed, exit 1. The test that passed is the stale-error case, which passes trivially on the base code.
- Green: 6 passed, exit 0.

## Commands (Docker `lingotorte:r4k1`, `--network none`)

- `npx vitest run` ×3: 69 files passed, 1 skipped; 1400 tests passed, 1 skipped; exit 0 on all three runs.
- `npx tsc --noEmit`: exit 0.
- `npm run build`: exit 0.
- `npm run scan:privacy`: exit 0, ok, 66 files scanned.

## Sibling findings (not fixed, out of scope)

- Practice source-audio `<audio>` (`app.ts`, around line 656) and Source-range `<audio>` (around line 2517) have no
  `error` listener. These are service-generated snippets, so an undecodable source should already fail at the
  service; a browser decode failure there would still be silent. Recommend a follow-up.

## Limitations

- JSDOM cannot decode media, so these tests only prove the wiring. The real-browser check is lt-3kk journey-12.
- Import still does not probe decodability; the feedback appears when the Player element fails.

## Independent review (deleg_879914fd) and corrections

Verdict: SPEC PASS, QUALITY APPROVED and ACCESSIBILITY PASS, with no blockers. Both recommendations are applied:

- **No repeated announcement.** The banner is `role=alert` only on the first render after the error. Later re-renders mark it `role=status` through `mediaError.announced`, so unrelated re-renders don't announce it again. Journey-12 accepts both roles. The test now checks that the role changes from alert to status.
- **The stale-guard test now actually tests the guard.** After a stale `loadedmetadata`, it asserts that `model.player.mediaError.code` is still 4.

Follow-up, not in this issue: the Practice source audio and source-range `<audio>` elements have no `error` feedback.
