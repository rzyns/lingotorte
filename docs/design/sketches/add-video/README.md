# Add video → ready to watch

Status: synthetic standalone design proposal. Open `index.html` directly; no build or dependencies. Single direction requested by the coordinator. Existing watch and vocabulary/export sketches remain unchanged.

## Frame and evidence

Owner direction: desktop-browser addition first, then server-hosted playback from the computer or iPad; use web standards, not mandatory desktop-only file handles. iPad addition is desirable, with compatibility work later. Architecture basis: coordinator register §Browser addition and architect's source assessment of `apps/web/src/model.ts:1598–1668`: current browser selection/subtitle parsing exist, but video storage/server range playback need new work. This sketch does not verify those capabilities.

Design stance: one initial selection of video plus optional subtitles; successful video storage is not undone because a subtitle fails. Transfer, durable storage confirmation, attachments and browser playability are separate outcomes. Earlier accepted design tokens reused.

## Try without selecting personal files

Choose **Use synthetic filenames**, pick a **Simulated outcome**, then **Add to library**. Lab controls are not product UI. Outcomes:

- **Stored and playable:** progress → server confirmation → ready in this browser. No claim of universal device compatibility.
- **Interrupted:** explicitly server-confirmed incomplete upload; retry starts over, no chunk-resume claim.
- **Result unknown:** only Check upload status is offered. A still-unavailable check keeps the unknown state; confirmed incomplete permits restart; confirmed stored is followed by attachment/playback checks, not immediate re-upload.
- **Already in library:** simulated identical-content match, no second copy; existing subtitles untouched. Attachment review is a labelled placeholder, not an implicit overwrite.
- **Target subtitle failed:** video stored, successful English attachment retained when selected. Choose a replacement .srt; retry only the Polish subtitle. Without replacement, retry prompts for a file. Word lookup/collection remains unavailable until target subtitles succeed.
- **Stored, not playable here:** library item retained with a browser-playback warning; no automatic conversion or claim that re-uploading identical bytes repairs compatibility.
- **Cancel during progress:** models server-confirmed cancellation before storage completes, retains selections. Lost cancellation confirmation must use unknown status in production.

Standard multi-file input can select one video and optional .srt files together, with a second optional subtitle picker. Only filenames are inspected; contents are never read. Explicit Polish/English assignments are reviewable and must use different subtitle files. Defaults are positional proposals, not language detection. Optional subtitles can be omitted; lookup and text collection are not promised without the learning-language track.

## Revision r2 — recovery review

- Library location now explicitly says server, not “this computer,” so the copy also makes sense on iPad.
- Lab controls independently select playback pass/fail and subtitle-attachment outcome after a stored-status response. Storage confirmation routes to ready, subtitle warning or stored-but-unplayable; successful subtitle retry preserves the attempt's playback outcome.
- Every delayed completion uses an attempt-bound guard. Reset, cancellation and a new upload invalidate old status checks and subtitle retries, including nested completion callbacks.
- Polish-failure scenarios are disabled and deselected when no Polish subtitle is assigned; omission still uses the existing no-subtitles message.
- Verification rerun: **99 checks passed** (the original 85 plus no-target applicability checks at all three sizes and focused recovery tests). Tested stored→unplayable, stored→subtitle warning, successful subtitle retry with failed playback, pending/stored status callbacks after reset and a newer attempt, and subtitle retry after reset/new attempt. Earlier sketches' HTML/READMEs remain hash-identical during verification. New outcome screenshot: `r2-subtitle-fixed-playback-failed.png`.

## Trade-offs and unresolved limits

- Initial cancel/restart (rather than resumable uploads) keeps recovery simple but costs retransmission for large interrupted files. Owner acceptance and actual upload evidence remain needed.
- Ordinary selection, subtitle attachments, operation/status records, file/database recovery, size/disk limits, safe names, hashing, auth and media compatibility are implementation concerns, not established by this sketch.
- Duplicate subtitle review is not expanded into another feature lane. English versus Polish role defaults are proposals; no auto-transcription or conversion is introduced.
- Status-check and subtitle-retry success branches are synthetic happy-path continuations, not evidence of API behaviour.

## Verification

Existing project Playwright + installed Chrome, headless. `verification.json` records **85 passing checks** across 1440×1000 desktop, 820×1180 tablet portrait, and 1180×820 tablet landscape with touch emulation for tablet-sized contexts. Exercised native input selection with synthetic in-memory test files, role conflict, progress, cancellation persistence, interruption/restart, unknown status with repeated failure and both confirmed outcomes, duplicates, subtitle-only retry (including missing replacement), stored-unplayable, video without subtitles, heading focus, no overflow/network/JS errors. Previous sketches' HTML and READMEs were byte-hashed before/after verification and matched.

Screenshots captured for choice, progress and all requested outcomes at each size. Visually inspected desktop selection, tablet portrait subtitle error and tablet landscape unknown-result state. No visible clipping/overlap in those inspected screenshots.

**Not tested:** real upload/storage, actual cancellation/status recovery, large-file performance, media validation/codec playback, real iPadOS Safari, screen readers, or real subtitle parsing. The page does not upload, read file contents, play media, transcode, or write learner data.

Gate: **verify** — owner-grounded friction reduction; source-reported feasibility, not runtime evidence; scope limited to a synthetic design artifact. No application or config changes, commits, deployments or real user data operations.
