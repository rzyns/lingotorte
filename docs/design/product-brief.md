# Lingotorte — product brief

Status: **owner-adopted baseline for implementation planning**, not authorisation to start coding or deployment. Owner explicitly confirmed adoption after writing, architecture and UX alignment review. Drafted by @drwritely in CodePlanningGroup; @codearchitect reported no material alignment correction; @experiencedesigner confirmed alignment with the addition of collection confirmation and scoped Undo, now included. Coordinator preserved the substance here. Source: shared discussion and [discussion register](discussion-register.md), not private conversations.

## Purpose

Make personal videos easier to understand and useful vocabulary easy to collect, without turning watching into setup or study administration.

**Core journey: add → watch → understand → collect → export to Anki.**

## Owner decisions and scope

- The server runs on the owner's computer. The web interface is used from that computer and an iPad around the house; no native iOS app.
- Add videos and optional subtitles through the desktop browser first, using standard web controls. iPad addition is desirable, with focused compatibility work later.
- Prioritise watching, lookup and vocabulary gathering. Anki handles study for now.
- Collect expressions into the video's vocabulary list for later selection, without automatic in-app study enrolment.
- Meaning and note edits update the saved vocabulary item across its video occurrences, not just one export.
- Existing design decisions may be reconsidered to reduce ceremony. This does not authorise removing safeguards or deleting existing study data.

## Design baseline

The owner responded positively to three standalone simulations:

1. **Add a video:** select video and optional subtitles together; show progress/cancellation; distinguish interrupted upload from unknown result; preserve successful work after subtitle failure; distinguish stored media from browser-playable media.
2. **Watch and understand:** navigate by subtitle unit, replay lines, use a hideable transcript and direct pause; inspect words/phrases with minimal disruption. Dictionary suggestions are possible meanings, not confirmed translations.
3. **Collect:** deliberately keep an expression with its source context, without mandatory meaning entry or successful lookup. Advancing playback must not change the captured selection. Confirm collection with Undo; Undo reverses that collection action without removing pre-existing occurrences or study history.
4. **Choose and export:** select a few expressions without processing the whole list; inspect source context and replay within Lingotorte; preview exported content and disclose empty/note-only answers without forcing definitions. Text-only export does not include that replay media.

These references are not blanket approval of every proposed gesture or policy. The three sketches and READMEs are bundled under `docs/design/sketches/`; see [implementation handoff](implementation-handoff.md) for entry points. Original specialist-worktree copies remain preserved separately.

## Recommended technical direction

Recommendations, not implemented or fully owner-selected mechanisms:

- One server-owned library serving media to both browsers, with recoverable pending actions rather than competing browser libraries. Tailscale is available; access rules, exposure and request protections need verification.
- Streamed browser uploads into managed storage; content-based duplicate detection; separately retryable subtitle attachments; server playback supporting seeking. Restart rather than resume after genuine interruption is an initial recommendation.
- One Anki note identity per saved item, with a stable source occurrence. Earliest capture is the proposed initial source. Selecting an item from another video should not silently replace its exported context. Existing earliest-occurrence selection is not proof of durable source pinning.

## Deferred

In-app scheduling, practice modes, exercise-readiness flows and automatic-study toggles are parked, not prerequisites. Native iOS is out of scope; focused iPad upload tuning comes later. Automatic transcoding, resumable uploads and audio/video export are not commitments in this baseline.

## Remaining decisions and verification

- **Export context/identity:** settle stable source handling, including source changes/deletion. @codearchitect's later live-Beads review reports `lt-foe.3.5` closed with owner-observed successful .apkg/.txt imports and nonduplicating re-import; retain that existing qualification. Newly proposed subset/context/edit behaviour still needs fresh acceptance, including Anki-side edits and scheduling/history preservation.
- **Persistence/migration:** specify save acknowledgement, retries/conflicts and preservation of browser-only work and existing study history.
- **Access/compatibility:** verify actual access boundary, desktop upload/storage/playback and iPad browser playback. Web standards alone do not establish compatibility.
- **Transcript policy:** draft collection and correction-to-capture mapping remain unresolved if included in implementation scope. Earlier correction proposals are not approved functionality.

## Evidence and next gate

Positive owner feedback establishes a coherent design direction. Reported headless checks exercise simulations, not real uploads, durable saves, media compatibility or Anki import. Source reviews identify gaps: current capture still creates an in-app card; inspected import keeps video bytes browser-local; current export lacks proposed per-video selection.

Keep these remaining items attached to any handoff. Before implementation planning, the responsible specialists must assess friction, empirical evidence and business scope and record continue, verify or stop_reframe. Actual runtime proof and migration/security review remain necessary where relevant. No application changes, deployment or destructive migration are authorised by this brief.
