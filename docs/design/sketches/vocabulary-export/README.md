# Vocabulary → Anki sketch

Standalone design proposal, not application implementation. Open `index.html` directly. Uses Lingotorte's existing dark colour tokens and native controls; no dependencies or network requests. Watch-session sketch unchanged. One direction only, as requested by the coordinator, rather than unrelated visual variants.

## Scope and evidence
Owner direction: watch → understand → collect → export to Anki. Select a few expressions from a video's list without processing the rest. This supersedes the earlier proposed in-app enrolment flow. Collection-only is proposed behaviour; current capture still automatically creates an in-app recognition card.

Source reference: `packages/domain/src/ankiExport.ts:54–129`, read during this task. Today's mapper uses earliest occurrence, builds expression + context on the front and meaning + notes on the back, and creates a reverse card only with meaning. Source review does not prove successful Anki import. Preview is schematic rather than pixel-identical to Anki.

## Try
1. Check **płaszcz** and **sobie poradzę**, leaving **kluczach** alone. Only the checked expressions appear in the preview.
2. See the empty answer on **sobie poradzę**. Expand optional editing: meaning and note are separate fields. Nothing is dictionary-prefilled, and neither editing nor deselection is mandatory.
3. Select **kluczach**. It is the same item collected from two videos; this export previews the kitchen occurrence. This is an explicit context proposal, not current behaviour.
4. Replay a line. A labelled synthetic scene and progress indicator demonstrate where Lingotorte playback belongs. **There is no actual media/audio** in this sketch and none is included in the proposed export.
5. Simulate export preview. The result explicitly says no file was created or sent to Anki. No download or network operation exists.

## Revision r2 — consolidated review

Recognition preview now says “Answer section · repeated front omitted.” The reverse-card portion is explicitly a summary, not a full rendering, and states that context, notes and applicable attribution are omitted. Note-only answers show “No meaning included. The answer section contains only your note,” without blocking export. Each optional editor explicitly leaves its intended scope unresolved: update the saved expression everywhere versus change only this export. Neither policy is selected.

Rerun: 55 checks passed, including the original 43 and focused checks at each viewport for recognition labelling, reverse-summary omissions, note-only feedback/export availability and unresolved editor scope. Existing simulation limitations remain; no application or watch-sketch changes.

## Unresolved proposals
- E-02: Prefer this video's occurrence for this export, preserving original captures and the saved item's identity. Updating the same Anki note from another video's context remains unresolved.
- E-03: Empty answers may remain selected with an explicit warning; user may optionally edit or deselect. Notes can also be questions and are never certified answers.
- E-04: Stable identity is intended to update notes, not duplicate them. Preservation of Anki-side edits, scheduling, context on repeat export and actual import/re-import are not verified.
- Replay controls and timestamps are Lingotorte-only. Export preview is text-only .apkg; no media, filenames, timestamps or app review history.

## Verification
Headless installed Chrome using the existing project's Playwright (no install). `verification.json` contains the check results. Exercised at 1440×1000 desktop, 820×1180 iPad-sized portrait and 1180×820 iPad-sized landscape; iPad-sized contexts enabled touch emulation, not real iPadOS Safari.

For each viewport: disabled empty selection; select missing meaning without blocking; select subset; select multi-video item once; edit note independently of meaning; edit meaning and refresh preview; deselect without removing collected entry; replay demonstration progress/stop; simulate export with honest status; no horizontal overflow, external requests or JavaScript errors. Watch HTML SHA-256 compared before/after the probe. Screenshots captured and visually inspected at all three sizes; a static “None selected” sentence was corrected after inspection.

Not checked: real audio/video playback, real iPad gestures or Safari, screen-reader behaviour, backend persistence or generation, Anki import/re-import. This artifact is not evidence of those capabilities.

Gate: **verify** — friction grounded in owner's selection intent; current exporter supplies the preview structure but unresolved identity/context policies remain; scope is synthetic local design only.
