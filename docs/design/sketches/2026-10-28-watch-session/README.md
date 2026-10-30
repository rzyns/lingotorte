# Watch-session sketch — fast lookup and collection

Status: **design artifact, proposal.** Not application code; nothing here is implemented, measured, or approved. Produced for the CodePlanningGroup discussion (register: `docs/design/discussion-register.md`, Q-01 focused round). Open `index.html` in a browser; no build step.

## What it answers

The owner's watch-session need (register §"Owner evidence"): recover the utterance → understand the unfamiliar words → optionally collect them → keep watching, with as little interruption as possible. Working choice applied: **collect into the video's vocabulary list, choose what to study later** — no automatic scheduling, no mandatory meaning entry.

## Design stance

One principle: **pointer separates inspect from collect by gesture (hover vs click); touch and keyboard separate them by one explicit action.** Pointer: hover to inspect, click to keep. Touch: tap to inspect, then Keep. Keyboard: focus a word to inspect, then press Enter to keep. Everything else serves that.

## What's in it

| Requirement (coordinator brief) | Where |
| --- | --- |
| Desktop and phone layouts | Sketch bar → Layout. Phone is a 390 px frame; transcript becomes a bottom sheet. |
| Subtitle-unit navigation | ‹ Line / Replay / Line › buttons; `[` `]` `R` keys (exist today); transcript lines seek. |
| Hideable transcript | Transcript button / Hide. |
| Quick lookup | Hover (pointer, ≈300 ms) / tap (touch) / focus (keyboard) → popover: word as written, dictionary form when different, up to three **possible meanings**. |
| Collection + Undo | Click word (pointer) or Keep (touch/keyboard) → "Kept “…” · Undo" toast, 5 s; word underlined in strip and counted in the transcript. |
| Lookup-unavailable states | "No dictionary match" (try *Agnieszko*) and "Dictionary isn't available right now" (Sketch bar → Dictionary). Keep works in both. |
| Collection without scheduling or meaning entry | Words drawer: text + line + moment only; "Choose what to study…" is a disabled placeholder. |
| Attachment when playback advances | Popover owns `{line, span, text}` at open; if the line changes it shows "From the line at 0:17 · ‹cue›" and the strip freezes with a "Show current line" exit. |
| Save failure (W-03) | Sketch bar → Saving: one shared indicator in the header + "Couldn't save · Retry". |

## Proposals carried by this sketch (unresolved)

- **P-01** Words live in a strip below the video, not an overlay, so tap-video and tap-word never share pixels. Cost: no word-level interaction on overlay-style subtitles.
- **P-02** Click/tap the video to pause/resume (missing today).
- **P-03** Hover delay ≈300 ms — a guess, not a measurement.
- **P-04** Moving-line rule: freeze the strip while a popover is open and label the popover's line. Alternative not sketched: let the strip advance and pin the popover.
- **P-05** Touch phrase = long-press, then tap neighbouring words. Unverified on a real device.
- **P-06** Tap-to-inspect pauses on touch; hover never pauses; no timing-based auto-resume.
- **P-07** Senses are possible meanings; no sense is written as the item's meaning.
- **P-08** One shared save indicator for the whole queue.
- **P-09** Replay line is reachable from the popover.

## Integration notes (from the 2026-10-28 focused review; not sketch behaviour)

- **Record the character span, not the token index.** The sketch anchors by word position (`from`/`to`); the occurrence record needs `charSpan` (`packages/domain/src/coreTypes.ts`). The app's word buttons already carry `data-char-start/end`; the popover's copy should hold both — token span for highlighting, char span for the record.
- **Record the exact source slice as `selectionText`.** The sketch shows the punctuation-stripped token; the model's rule is `cue.text.slice(charStart, charEnd)`. Display the clean form if useful, store the slice — otherwise a later "does the kept text still occur in the corrected line?" check gets false mismatches on trailing commas.
- **Undo reverses this collection action, not necessarily the whole item.** A vocabulary item can already have other occurrences from other lines or videos; Undo removes the occurrence just made (and the item only if it has no others). With collect-only (no scheduling) there is no card or review history to unwind. If the future auto-schedule toggle is on, Undo acquires a second meaning (discard the card) and the toast must say so.
- **Freeze vs. advance (P-04) is a product choice with a cost either way.** Freeze: every label, live region and transcript highlight that says "current" must say "inspected" while frozen (done in this sketch). Advance: the overlay's word buttons are rebuilt on `timeupdate`, so the popover's anchor is destroyed and it must float detached. The `{cueId, charSpan, text}` copy is identical under either.

## Revision log

- 2026-10-28 r2 (post-review): Retry re-runs the same save attempt and only succeeds when saving works again; the strip is labelled "Subtitle line" and "Inspected subtitle line (playback has moved on)" while frozen, never "Current"; every word of a kept phrase is highlighted; keyboard instructions corrected; integration notes added.
- 2026-10-28 r2 also fixed a defect found while verifying the phrase highlight: pointer drag-select never formed a selection because each word was a Tab stop (`tabindex=0`) and Chrome drops the drag when focus lands. Words are no longer Tab stops; the line is the Tab stop and `←`/`→`/`Enter` rove focus into its words — the same shape as the app's lt-z8s rule. A pointer press also no longer opens the popover via focus (it may be the start of a drag). Verified by the probe: drag-select "sobie poradzę" → "Keep phrase" → both words highlighted.

## Out of scope on purpose

Navigation shell, study session, correction ("Fix this line"), machine-transcript marker (Q-04), the future auto-schedule toggle, where "choose what to study" actually lives.

## Evidence grade

Synthetic scene (eight invented lines) and a synthetic dictionary shaped like the gloss route's output. "Exists today" labels are source-reading of `apps/web/src/views/player/*`, `ui/shortcutHelp.ts`, `ui/capture.ts`. Keyboard, focus and screen-reader behaviour are intent, not verified with assistive technology; touch behaviour was exercised with simulated input only.
