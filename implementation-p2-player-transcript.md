# P2 Player Transcript Implementation Notes

## Scope
This milestone adds the second player/transcript implementation slice for lingotorte:
- Real video playback controls (play/pause) wired to the `<video>` element.
- Playback speed range (0.5–1.5, 0.1 step) clamped and applied to the element.
- Previous / next cue navigation with disabled-state logic.
- Cue loop with 100 ms tolerance (jumps back only after passing cue bounds + tolerance).
- Dual subtitle overlay in the player (target + native).
- Transcript panel highlights the active cue, supports click and keyboard (Enter/Space) seeking, and shows per-cue source context (time range + media path).
- Graceful degradation when native subtitles are missing.

## Files changed
- `apps/web/src/model.ts` — extracted projection helpers (`activeCueAtTime`, `projectPlayerState`, `nativeTextForCue`, `applyLoopTolerance`, `previousCue`/`nextCue`, `clampPlaybackRate`, `setPlaybackRate`, `togglePlay`, `toggleLoopCue`, `seekToCue`, `importTargetOnlyFixture`).
- `apps/web/src/app.ts` — wired real video events and controls; removed duplicated local `nativeTextForCue`; added prev/next buttons; applied playback-rate constants; added source context line in transcript rows.
- `apps/web/src/style.css` — added `.cue-context` styling.
- `tests/web/p2PlayerTranscript.test.ts` — 12 new tests covering projection, dual subtitles, missing native, click/keyboard seeking, prev/next helpers, loop tolerance, speed clamping, control rendering, loop UI toggle, and visible source context.
- `fixtures/subtitles/synthetic-polish-dialogue.target-only.srt` — fixture for native-missing graceful-degradation test.
- `fixtures/expected/player-projection.example.json` — documented projection expectation for the P2 behavior.
- `fixtures/README.md` — listed the new fixtures.

## Verification
- `npm run typecheck` — pass (no errors).
- `npm test` — 38 tests pass.
- `npm run test:no-network` — 2 tests pass.
- `npm run scan:privacy` — 28 files scanned, ok.
- `npm run build` — production build succeeds.
- `git diff --check` — no whitespace errors.

## Known limitations / follow-ups
- The video `play()` method is not implemented in jsdom, so tests log a harmless console warning but do not fail.
- Keyboard navigation currently handles Enter/Space on cue rows and Prev/Next buttons; arrow-key navigation within the transcript list is a future accessibility improvement.
- The source context line is visually present but not yet selectable/clickable to open a provenance detail view.
