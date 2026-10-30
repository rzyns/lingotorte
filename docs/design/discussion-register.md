# Lingotorte design discussion register

## Purpose and authority

Living synthesis of the CodePlanningGroup discussion: clarify the emerging product vision, then simplify the experience and architecture to serve it. This is a discussion and decision register, not an implementation plan or replacement for DECISIONS.md or Beads.

Coordinator: @default-this-device. Specialists: @codearchitect, @experiencedesigner, @drwritely. Product decisions belong to the user. Specialists respond when prompted by the user or coordinator; the coordinator maintains this document and invites focused contributions.

Scope of this first edition: the shared discussion through the user's request for a coordinating document. No private conversations or recalled private project history are used. Source findings below are attributed reports from this discussion, not independently reverified findings. Repository base at document creation: `801b6c44867b165683e6e16aebf228f62122138e`.

## Current scope — owner priority reset

The owner explicitly prioritises video watching, lookup and vocabulary gathering. Study should currently be handled through Anki export; in-app study may be revisited once the core product is stable and streamlined. This supersedes active discussion of Add to study, exercise readiness, unresolved-meaning study encounters, scheduling toggles and in-app practice-mode design. Preserve those discussions below as parked history, not current requirements or gates.

Active product loop: open own video → recover/replay subtitle unit → inspect words/phrases → collect with source context → optionally select/manage collected vocabulary → export to Anki. The existing r2 watch sketch remains the direction reference. Shared computer-hosted service with computer/iPad browser clients remains the deployment target; no native iOS app. Existing study code/data is not authorised for removal or destructive migration by this scope reset. Export field/meaning semantics and re-import behaviour still require evidence; do not infer Anki readiness from the watch sketch.

Next bounded request to @codearchitect: source-read the current Anki export and capture boundaries and identify the smallest changes needed to support collection without automatic in-app scheduling, with selection/export from video vocabulary and preservation of current data. Report existing versus missing behaviour and material constraints, not an implementation plan. Designer and writer hold further study proposals.

## Historical coordination checkpoint (superseded by baseline adoption and applied mapping below)

Evidence correction: later live Beads review confirmed existing Anki import/re-import was human-qualified under lt-foe.3.5. Any unqualified wording in this historical checkpoint applies only to newly proposed selection/context/edit behaviour, not the existing exporter.

- Owner direction: watch/lookup/collect/export first; Anki handles study. Computer-hosted server remains running; computer and iPad browser clients; no native iOS app.
- Both watch r2 and vocabulary/export r2 received positive owner feedback. These are design references, not production qualification or blanket approval of remaining proposals.
- Owner-selected rule: meaning/note edits persist on the saved item across its video occurrences. Export-only overrides are not the initial design.
- Coordinator-endorsed working recommendation, not owner-selected policy: one Anki note identity per saved item, export source occurrence held stable rather than switched implicitly by the video used to open export. Architect proposes earliest captured occurrence as initial source. Source code currently selects earliest occurrence; that selection rule alone is not proof of a durable pinned source across deletion or later edits. Actual Anki import/re-import, user edits and scheduling preservation remain unqualified.
- Next discussion should cover the remaining front of the core loop: how a video and its subtitles become available on the server and iPad. Do not expand Anki study or commission implementation from these directional approvals.

## Owner decision: browser-based media addition

Desktop-browser addition of videos and subtitles is required for the initial experience; a folder-only workflow is not sufficient. Use standards-based web controls and sound cross-browser design, without requiring desktop-only file-system APIs. iPad-browser addition is desirable but not a top priority; a focused iPad compatibility/tuning pass may follow. Standards-based design is an approach, not proof that uploads/playback work on iPad. No native iOS app.

In the service-owned library direction, browser-selected media needs durable server availability rather than a session-local object URL or handle. Exact upload/storage semantics are a design recommendation pending source assessment; do not alter the existing read-only media mount by implication. Next bounded request to @codearchitect: inspect current browser import and storage boundaries; recommend one minimal upload-to-library path, identify existing versus new capabilities and material large-file/interruption, duplicate, disk/path-safety and subtitle-association issues. Read-only recommendation, no implementation/deployment. Designer and writer hold pending assessment.

## Browser addition: architectural assessment and sketch brief

@codearchitect reports browser video/subtitle selection and independent subtitle parsing already exist (`model.ts:1608–1632`), but video bytes currently remain browser-local: whole-file hashing, object URL, metadata/transcript persistence (`:1598–1606,1637–1668`). Server-owned upload storage and range-capable playback are missing. Keep existing source-folder mount read-only; uploads need an explicitly writable managed location. Source review only, no runtime qualification.

Working recommendation: standard file picker; streamed upload into generated staging file with server fingerprint; status check after ambiguous acknowledgement; complete-file publication with file/database recovery; server media ID for separately retryable subtitle attachments with explicit language/role. Initial cancellation/restart rather than resumable chunks is proposed, not owner-selected. Content-identical duplicates return the existing media item; equal filenames alone never authorise replacement. Concurrency, disk-full/size limits, confined paths, partial cleanup and browser-playability checks remain implementation requirements to qualify, not completed capabilities.

Next bounded artifact: @experiencedesigner creates one synthetic Add video → ready to watch HTML sketch in own worktree. Include optional subtitles selected with video (no unnecessary forced two-stage interaction), progress/cancel, interrupted and uncertain-result states, duplicate outcome, stored-video/subtitle-warning with subtitle-only retry, and stored-but-unplayable outcome. Do not equate upload completion with playback readiness; collection without target subtitles must not be promised. Simulate only; no uploads, storage/API edits, transcoding or scope expansion. Keep prior sketches unchanged, use standard inputs, desktop first with tablet-sized sanity checks. Then focused source/copy review before owner evaluation.

## Add-video artifact handoff

Designer supplied `C:/Users/jmdzi/workspace/lingotorte-design-sketches/docs/design/sketches/add-video/index.html` and adjacent README/verification artifacts. Coordinator read README. Designer reports 85 passing headless checks across desktop/tablet-sized layouts, with selected screenshots visually inspected. No coordinator reproduction or actual upload/storage, codec/playback, iPad Safari, large-file or assistive-technology qualification is claimed. Status and retry outcomes are synthetic; prior sketches reportedly byte-identical. No application changes or commits reported.

Next source/copy review: @codearchitect checks transitions among transfer, storage, unknown result, cancellation, duplicates and independent attachments for misleading retry/overwrite/readiness implications; @drwritely checks whether each state explains succeeded/uncertain/retry scope and avoids confusing role defaults with language detection or stored with playable. Read actual HTML and README, at most three material findings with locations and minimal corrections. No new upload platform, app edits or real file operations. Designer holds revisions for consolidated brief, then owner tries corrected artifact.

## Add-video consolidated revision brief

Both reviewers source-reviewed the artifact without browser execution or edits. Accepted bounded findings: storage confirmation and subtitle-retry success must not bypass independent playback/attachment outcomes; old asynchronous status/retry completions must not update a reset/new attempt; “this computer's library” must be unambiguous on iPad; a subtitle-failure scenario must require an actually selected attachment, not invent a file failure.

Revision hold released to designer for those corrections only. Bind status and subtitle-retry callbacks to attempt identity, invalidate obsolete callbacks on reset, and preserve independent failure outcomes through recovery. Use server/library wording usable from either browser client; distinguish omitted subtitle from failed selected subtitle (disabling an inapplicable lab outcome is sufficient). Retain existing unknown-result safeguards and selected-file preservation. Re-run prior checks plus reset/new-attempt stale callback, stored-but-unplayable after status recovery, subtitle success with playback failure, and no-selected-target-subtitle cases. Prior artifacts/application remain unchanged; no real upload qualification. After reported evidence, owner tries artifact; no broader redesign authorised.

## Owner checkpoint: core-flow sketches positively received

Owner reviewed the corrected add-video simulation and described it as “a much more cohesive and intelligible experience than the old experience” with consistent, well-thought-out simulation. Alongside prior feedback on watch and vocabulary/export, this establishes a positively received end-to-end design direction: add → watch/lookup → collect → select/export to Anki. It is not actual-upload, Anki-import or iPad qualification, nor blanket implementation/deployment authorisation.

Designer reports all four add-video corrections applied with 99 headless checks; no coordinator reproduction is claimed. Preserve the three sketches as the design baseline, stop new screen expansion, and consolidate the discussion into a short product brief and active decision list before implementation planning. Remaining material items include migration/persistence boundaries, access verification, actual media/browser compatibility and Anki re-import ownership. In-app study remains deferred.

## Baseline adoption and planning handoff

Owner explicitly adopts [product brief](product-brief.md) as the baseline for implementation planning, following architecture and UX alignment reviews. UX omission of immediate confirmation/scoped Undo was added. This is planning authority, not coding/deployment approval. Historical open questions below must be read against the current scope and subsequent resolutions, not treated as mandatory work.

Next bounded contributions: @codearchitect proposes dependency-ordered, independently verifiable delivery slices and identifies checks needed before choosing mechanisms; @experiencedesigner supplies friction/evidence/business-scope gate for the adopted journey before an implementation plan is written. Existing source claims must be refreshed against the implementation candidate, and current Beads/decision records reconciled during planning rather than treating the discussion as their replacement. No new screens or optional features. Migration/data preservation, real playback/access and actual Anki import remain explicit acceptance evidence, not simulation claims.

## Canonical mapping applied

Owner authorised applying the mapping, explicitly without starting implementation. Created lt-192 and A–H children lt-192.1–lt-192.8; amended/reparented lt-zt0 (design-only), lt-5lb.4 (watch interaction) and lt-90t (replay), preserving superseded descriptions in comments. Wired/read back all 17 planned prerequisite edges and verified no cycles. Exact readback confirmed all targets, no assignees/claims, 129 previously closed records remain closed, and deferred lt-eet/lt-jxg plus bounded lt-584.7 unchanged. lt-dy6 received a planning-only cross-reference. Canonical issue export refreshed to 165 records; full local backup synced. No coding, deployment, remote Dolt sync, real learner-state or live Anki changes. Applied ID map and verification boundary: [Beads mapping](beads-mapping.md).

## Status vocabulary

- **Owner direction:** explicitly stated by the user; guides this review.
- **Working agreement:** convergent discussion position; not automatic implementation approval.
- **Proposal:** suggested behaviour or architecture, not settled.
- **Source-reading report:** a participant's code inspection, not live qualification.
- **Open:** requires evidence or a decision. A resolved source question may still need live confirmation.
- **Superseded:** retained here to prevent an earlier claim or proposal being reused accidentally.

## 1. Owner direction

| ID | Direction |
| --- | --- |
| D-01 | Step back and clarify the overall vision; do not merely optimise the current implementation. Historical choices and existing design decisions are open to reconsideration. |
| D-02 | Pairing/security ceremony may be disproportionate for a casual personal learning tool. The user has not selected a particular replacement or authorised removing safeguards. |
| D-03 | Keep the discussion organised around a common goal, capture agreements and unresolved questions, and reduce unsolicited specialist chatter. |

## Owner evidence: watch-session needs (Q-01)

The user described unfamiliar words within an utterance as the main watching difficulty. Fixed-time seeking and mobile controls that require reveal/animation make recovering the sentence cumbersome. Their reported useful reference behaviours are:

- Previous/next subtitle-unit navigation and a hideable transcript whose lines seek to their timestamps.
- Direct click on the video to pause/resume, without a controls-reveal delay.
- Hover on a word or phrase for a quick translation and supporting information without necessarily interrupting playback.
- Click a word or phrase to collect it into the video's vocabulary list with no additional form, and pause playback.

Evidence grade: owner-reported experience and preference, not independent inspection of the reference product. These are promising behaviours, explicitly not a definitive interaction specification. The owner values both casual inspection and very low-friction intentional collection; an extra Keep button must not be presumed necessary on pointer devices.

Q-01 now has a concrete use case: recover the utterance, understand unfamiliar language, optionally collect it, then continue watching with minimal disruption. The broader vision statement remains provisional. Next focused question: adapt that distinction to touch/keyboard without hover, and clarify what collecting into a video vocabulary list implies for scheduled study. No deployment or standalone-mode decision follows from this answer.

## 2. Emerging vision and working agreements

**Candidate vision, not yet endorsed:** “Lingotorte helps me turn material I want to understand into language I can remember—without making me manage the learning system.”

**Candidate principle:** “Let curiosity stay casual; make deliberate practice easy to enter.”

| ID | Working agreement | Qualification |
| --- | --- | --- |
| W-01 | Remove administrative choices, not meaningful learning choices. | Looking up a word is distinct from choosing to study it. Discovering a file is distinct from adding it to a library. |
| W-02 | Watch and study are connected experiences: material can feed deliberate study, and study can return the learner to its source context. | Material-first priority, navigation and automatic exercise selection remain proposals. |
| W-03 | Reliable persistence and recoverability matter more than exposing storage administration. | Confirmation must reflect durable recovery, not just an in-memory change. A close-tab warning is a fallback, not protection by itself. |
| W-04 | Preserve original capture provenance without requiring known subtitle errors to be displayed forever. | Corrected-context display and correspondence across track versions need design and technical validation. |
| W-05 | A subtitle correction must not silently change the learning target or transfer review history to a different target. | Correction can succeed while resolution of affected study items remains pending. |
| W-06 | Session boundaries must not determine the meaning or scope of a correction. | The “same sitting” re-pointing rule was withdrawn. |
| W-07 | Necessary conflict or content decisions must not be hidden to meet a click target. | “Zero decisions, at most one app click” was proposed only for a clean return with due cards. |
| W-08 | Interruption recovery and deliberate service-free study are distinct needs; whether standalone study is required remains open under Q-02. | Removing a second authoritative store does not justify losing unacknowledged work. |

## 3. Evidence reported in the discussion

All entries here are source-reading reports unless explicitly noted. Exact lines are participant-cited historical locators and may drift; validate against the candidate revision before implementation.

| ID | Report and provenance | Implication / limit |
| --- | --- | --- |
| E-01 | @codearchitect identified the recorded `docs/workflows/as-is/journeys/daily-driver-learning-loop.yaml`; @experiencedesigner showed it combines setup, demo-caption correction and repeat learning. | Existing journey totals do not measure daily friction alone. The existing journey was described as observed-live; no new live run occurred in this discussion. |
| E-02 | Remembered pairing is opt-in; service restart rotates the capability. Boot can auto-connect when remembered pairing remains valid. Cited: `rememberedPairing.ts`, DECISIONS §14a. | Distinguish remembered/service-up, not-remembered, and service-restarted returns. Their real usage frequency is unknown. |
| E-03 | @codearchitect: disconnected ratings update IndexedDB; reconnect can raise the browser/service choice. Cited: `apps/web/src/model.ts:3619–3624,647–650`, `browserSnapshotCache.ts:44`. | Repeatable risk path, not evidence that every learner encounters it every morning. Needs a live offline-rating variant. |
| E-04 | @codearchitect: autosave defaults on; after Keep browser work, the next learner change can PUT and replace the compared service version. Cited: `model.ts:186,739–741,772–777`. | Do not promise that replacement waits for an explicit Save. |
| E-05 | @codearchitect: loading service state omits the handle restoration used on clean connect. Browser permission can separately require a user gesture. Cited: `model.ts:680,722–737,1931–1934`, `views/player/stage.ts:533–540`. | Distinguish an app parity gap from the browser's permission requirement. |
| E-06 | The reconnect comparison is equality/fingerprint based, not a human-readable diff. Held snapshots and `packages/storage/src/restorePlanner.ts` may support a summary. Reasons for the choice can overlap. | Difference counts do not establish which version is preferable; reason-specific copy and summary remain proposals. |
| E-07 | Imported subtitles start approved; the offline draft path creates separate caption-candidate media. Cited: `packages/domain/src/factories.ts:49`, `model.ts:2870–2873`. | Current media/track model can obstruct correcting one's own material and continuity of capture. |
| E-08 | @codearchitect corrected the gate analysis: Inspect/Analyse words is ungated; Keep is approval-gated. Cited: `ui/capture.ts:16`, `views/player/transcript.ts:61,153,572`. `SavedOccurrence` already snapshots text/context and track provenance (`coreTypes.ts:206–221,258–269`). | Approval is a policy question, not an anchor-storage necessity. No gate change has been approved. |
| E-09 | Corrections currently create a whole immutable track version, with new track and cue IDs; no re-anchoring was found. Cited: `model.ts:3016–3097`, `coreTypes.ts:210–211`. | Corrected-context display requires an explicit mapping rule; provenance alone does not provide it. |
| E-10 | @codearchitect corrected the deployment analysis: the web already proxies `/api` (`vite.config.ts:7–9`); API is private-network only; published bind host defaults to `0.0.0.0` (`compose.yaml:33,53`). | Same-origin is already deployed. Reconsidering capability protection requires explicit loopback/LAN exposure and request-admission analysis, not an origin-policy-only argument. |
| E-11 | Existing `journey-09-persist-reload-repair` checks save/reload/re-pair against SQLite; cited `docs/dev/lt-3kk-daily-driver-journey-plan.md:33`. | Extend the existing qualification kit for offline review rather than assume a new harness is needed. |

## 4. Options under consideration — none selected

### Architecture and deployment

- Service-owned learner state and media; browser provides recoverable unacknowledged work rather than a competing library. Candidate benefit: remove ordinary storage-authority negotiation and browser file-permission ceremony.
- Retain genuine browser-only study with reconciliation. Candidate benefit: standalone use; cost: a continuing synchronisation model.
- Loopback-default convenience versus explicit LAN access with appropriate authentication. Existing LAN use must not be removed by implication.
- Improve point-of-action connection/persistence feedback independently of either architecture. “Kept in this browser” requires a successful durable write; pairing must not be described as automatically saving everything.
- Reconcile compatible offline review events rather than replace whole snapshots. This is unapproved and must verify the resulting schedule, not just retention of event history.

These are combinable levers, not a mandatory A/B choice. Capability persistence and changing defaults are policy and implementation work, not free consequences of same-origin hosting.

### Watch and study experience

- Discover → Inspect → Keep for study, keeping each meaningful choice separate.
- Inline Fix from the existing word-analysis surface; draft Keep with a visible machine-transcript marker instead of mandatory track approval.
- Today / Library / Words / Settings navigation; session-level learning intention; material-led default. All remain proposals.
- A shared persistence indicator rather than separate per-verb storage states, while reporting failures truthfully.

### Correction persistence and affected cards

- Compare immediate full-track version per confirmed correction with batching pending corrections into a later version. Cue-amendment records are another, more extensive alternative. No choice has been made; version count alone is not evidence of unacceptable cost.
- Context-only correction: proposed corrected display context, original provenance and review history retained.
- Target-changing correction: subtitle update succeeds; affected card needs a separate learning decision. Retain original target, Keep corrected target via normal Keep behaviour, or remove the card from study are proposed options.
- Coordinator proposal: resolve before recall, permit deferral/next card, and record no rating for this maintenance interaction. Do not automatically duplicate an already-kept target. These latest details have not yet received group review.
- Undo must preserve later work and reliable persistence; its domain semantics are unresolved.

## 5. Open-question register

Priority is discussion order, not implementation authorisation. “Lead” names the next useful contributor, not an instruction to start work.

| ID | Priority | Question / decision needed | Lead and closure evidence |
| --- | --- | --- | --- |
| Q-01 | Partly answered | Owner supplied the watching use case above. How should fast inspect/collect work across pointer, touch and keyboard, and does collection imply scheduled study? | @experiencedesigner next; owner confirms remaining intent. Broader product statement is still provisional. |
| Q-02 | Next | Which device/access story is wanted: one machine, trusted LAN/phone, multiple devices? Is deliberate service-free study wanted? | User, then @codearchitect; explicit needs before architectural selection. Do not conflate interruptions with standalone use. |
| Q-03 | Next | Which administrative concepts can disappear, and which protections must remain at the actual deployment boundary? | @codearchitect; options with exposure, threat assumptions, recovery/migration and total complexity. |
| Q-04 | Next | Is Keep from an unapproved machine transcript allowed with provenance/marker? | User with @experiencedesigner; explicit policy disposition. Inspect already works. |
| Q-05 | Later | How should corrections map old captured occurrences to corrected context, including ambiguous mappings and changes to/removal of the target? | @codearchitect + @experiencedesigner + @drwritely; predictable rules across reopening, no silent target/history substitution. |
| Q-06 | Later | Immediate version per Fix or batching? What does Undo mean? | @codearchitect; total-complexity comparison, actual cost evidence, interruption and retry behaviour. |
| Q-07 | Later | Where and how should unresolved affected cards appear, with deferral and no misleading rating? | @experiencedesigner + @drwritely; review the concrete three-moment example and coordinator's latest proposals. |
| Q-08 | Later | Which navigation, watch/study priority and exercise-intention choices serve the vision? | @experiencedesigner with user; proposed experience reviewed against Q-01 rather than inherited screens. |
| Q-09 | Evidence | Does the traced offline-review/reconnect flow behave live as reported? | Future scoped qualification; event and schedule checks, actual fork/copy, browser vs service differences. Usage frequency needs separate evidence. |
| Q-10 | Deliverable | When should source-labelled as-is journeys, proposed to-be journeys and sketches be authored? | Coordinator after Q-01/Q-02 framing; location is existing `docs/workflows/`, not a parallel UX catalog. This register does not authorise application changes. |

## Focused round: fast lookup and collection

Status: proposed interaction map, not an approved implementation. Owner's provisional choice is collect into the video's vocabulary list for later selection, without automatic scheduled study. This is a working direction, explicitly revisitable. A future toggle for automatic scheduling was suggested by the owner; it is a possibility to retain, not a current feature commitment.

- Pointer: hover to inspect without pausing; click to collect and pause. Touch: tap to inspect, explicit Keep in the popover. Keyboard: focused inspection and explicit collection. Exact gestures, timing, phrase selection, subtitle geometry and pause/resume behaviour need validation. Do not assume swipe, arrow-key aliases or a hover delay are settled.
- @experiencedesigner corrected the earlier keyboard inventory: the help declares `[` / `]` previous/next line and `R` replay. @codearchitect reported existing cue buttons and transcript seeking, missing video-click pause and hover lookup, and a current collect form. These remain source-reading reports.
- Dictionary senses are possible meanings, not confirmed contextual translations. @experiencedesigner withdrew “the gloss is the meaning”; automatic top-sense selection remains disputed and must not enter agreed behaviour. Keep must remain possible without a lookup result. Distinguish completed no-match from unavailable/failed lookup.
- @drwritely and @codearchitect identified the moving-cue hazard: the interaction must retain the inspected selection/context when playback advances. Existing capture shapes help, but future popover behaviour is not verified. Freezing a strip, showing source context/timestamp, or pinning the popover are candidate designs, not completed fixes.
- Per-track gloss prefetch is an architectural proposal, not a prerequisite or measured latency result. First-use, loading and failure states must remain honest; “local” does not prove “instant”.
- Claims that first study must request a missing meaning, or that a top dictionary sense becomes the answer, are not approved. Resolve learning intent before specifying that path.

Coordinator next prompt: @experiencedesigner provides one bounded watch-session sketch using collection without automatic scheduling, including pointer and phone layouts and inspection/collection states. No application implementation, new scheduling preference or architecture expansion is authorised. Other specialists wait for a focused review prompt.

### Sketch handoff

@experiencedesigner supplied `C:/Users/jmdzi/workspace/lingotorte-design-sketches/docs/design/sketches/2026-10-28-watch-session/index.html` and adjacent README on branch `docs/design-sketch-watch-session` (reported uncommitted). Coordinator read the README. Designer reports 24 headless behaviour checks and visual screenshot inspection; these results are not independently reproduced by the coordinator. Touch is simulated; no real-phone or assistive-technology validation. The scene and dictionary are synthetic; save feedback simulates behaviour, not production durability. P-01 through P-09 in the README are unresolved proposals, particularly subtitle-strip geometry and freezing the strip during inspection. No application change or owner acceptance is claimed.

Next focused review: @drwritely examines lookup/collection/failure wording and whether collection implies confirmed meaning or study; @codearchitect examines selection identity and moving-cue interactions, including close/reopen/retry boundaries. Read-only artifact review, bounded findings, no redesign or application changes. Designer holds revisions until coordinator synthesises findings.

### Focused review disposition

Both requested reviewers responded source-only; neither ran the sketch. @codearchitect found the copied selection consistent with the current capture model, with integration notes to retain char spans and exact source slices rather than cleaned tokens. @drwritely found the copy distinguishes possible meanings, collection and later study.

Coordinator releases the revision hold for four bounded corrections in the designer's worktree: (1) Retry must remain failed while Saving: Fails is selected; (2) the frozen strip must not be labelled Current subtitle line; (3) kept phrase highlighting must cover its selected span; (4) README must describe keyboard Enter on the focused word accurately. Designer accepted these findings; completion remains pending. Document charSpan/exact-slice integration requirements separately, not as new application work.

Recheck the changed behaviours and preserve previous checks. No model, deployment or study-scheduling change is authorised. Freeze versus advancing strip remains a user-experience choice: retaining a frozen line has labelling costs; advancing the strip requires a stable, detached inspection surface once the original anchor disappears. Neither option changes the need to capture immutable inspected context. Undo is scoped to this prototype's collection operation; production deduplication and shared item/occurrence ownership still require analysis before assuming deletion of an entire item is safe.

### Revision r2 and owner try-out

Designer reports r2 at the same artifact path: four requested corrections completed, charSpan/exact-slice/Undo integration notes added, and an additional pointer drag-selection defect corrected by using the line as the Tab stop with roving word focus. Reported headless result: 31/31 checks (24 original plus seven additions). These are designer-reported results, not coordinator-reproduced evidence; touch remains simulated and assistive technology untested. Sketch remains reported uncommitted; no application changes.

Next action is owner exploration of the current artifact, not another specialist round. The sketch implements the below-video strip and freeze behaviour only; it does not provide an actual overlay-versus-strip or freeze-versus-advance comparison. Ask whether the implemented behaviour helps or obstructs watching before commissioning alternatives. Owner acceptance and real-phone validation remain open.

### Owner feedback on r2

Owner response after the invitation to try r2: “Yes, actually, this is pretty great! I like where this is going!” Record this as positive directional feedback on the watch-session sketch, not blanket approval of P-01–P-09, proof of real-phone use, or application implementation authorisation. Retain r2 as the working watch-session reference; do not commission alternatives without a concrete concern. Next discussion focus returns to Q-02: where the learner wants to watch and study (same computer, phone/private LAN, or away from the service). Specialists hold further sketch changes pending that framing.

### Owner device/access needs (Q-02)

The user states that, for the time being, use will be around the house from this computer or an iPad; Tailscale is already set up for access to local services. This establishes a multi-client personal-use target, not a loopback-only product. It does not establish an offline/standalone requirement or select direct LAN versus Tailscale-only access. No Tailscale configuration or access policy has been inspected or changed.

Next prompt to @codearchitect: recommend the simplest service-owned deployment for computer plus iPad, considering private Tailscale access as an option. State remaining trust/access assumptions, media delivery/iPad playback constraints, and interruption/multi-client write safety. Distinguish source-established facts from checks still needed; do not presume Tailscale alone supplies all application protections. Read-only recommendation, no deployment or implementation.

### Architecture recommendation after Q-02

@codearchitect returned successfully after the room-session model switch. Recommendation (not yet owner-selected): one computer-hosted authoritative library, SQLite/transcripts/media on the host, player/API/range-capable media through one private HTTPS origin, accessed by computer and iPad. Prefer Tailscale-only ingress if verified device membership/access rules and absence of bypass/public exposure support it. Preserve server-side cross-site-write protections and request validation; same-origin/CORS alone are insufficient. No access configuration was inspected or changed in this review.

Replace browser whole-library replacement with specific acknowledged actions, stable operation IDs and recoverable pending intent. This is architecture work, not an assertion that a queue prevents concurrency conflicts. Concurrent rating/edit semantics and migration of existing browser-only work remain open. Refresh on device switch cannot expose another device's still-unacknowledged actions. The recommendation assumes the computer/service is available; full standalone iPad study is outside this candidate scope, not rejected by the user.

Verification items: actual iPad Safari playback/seeking/fullscreen/touch/reconnection; representative codec compatibility before deciding on transcoding; trusted-folder media-ID resolution and safe range serving; retry after lost acknowledgement; two-device edits/ratings; access rules and direct-port bypass checks. Existing desktop-Chrome support is not iPad qualification.

Coordinator next asks whether keeping the computer awake/service running is acceptable for the initial product. Do not commission implementation planning or alter binding, pairing, Tailscale, browser storage or real learner state until the direction is selected and scoped.

### Owner confirmation: hosted browser scope

Owner confirms the server is expected to remain running on this computer. iPad access means the web interface in the iPad browser; a native iOS application is explicitly out of scope at this point. This closes the server-availability assumption under Q-02 and establishes browser clients on computer/iPad as the initial target. It does not approve a particular ingress/auth configuration or mandate a native wrapper, installed PWA, downloaded-media mode or standalone study implementation.

Next bounded discussion moves to the gap between collection and deliberate study: propose a minimal video-vocabulary selection flow, retaining one-action collection and no automatic scheduling. Keep the accepted watch sketch stable; no new application implementation or study algorithm change.

### Collected vocabulary to study: proposal for review

@experiencedesigner proposes opening a video's Words list, recognising expressions through original context and replay, selecting unchecked rows, then Add N to study. Unselected items remain collected without a processing quota. Already enrolled targets show In study; no duplicate enrolment is intended. Optional meaning/note and possible dictionary meanings do not block selection or silently confirm an answer. Acknowledged enrolment receives confirmation; failure preserves selection for retry.

Status: verify; proposal, not owner acceptance. Open issue: does adding an item without a confirmed meaning create a usable learning task, or merely defer preparation into study? Missing meaning must not be treated as recall failure. Review the minimal first-study interaction before introducing a separate readiness queue or mandatory definition workflow. Batch add/Undo must preserve pre-existing enrolment/history and be safe against retries or partial failure; an all-or-nothing transaction is not yet selected.

Next focused reviewers: @drwritely proposes one concrete, honest first-study interaction for an unresolved expression without assuming translation is the learning goal; @codearchitect reports what current recognition/review paths actually require and where any missing-meaning behaviour is enforced. Read-only, at most two material findings each, no implementation or new sketch. Designer holds expansion until synthesis.

### Selection-flow review and capture correction

@codearchitect reports current `packages/review/src/capture.ts:38–45` automatically ensures a recognition card on collection. This supersedes the earlier historical-journey-based claim that collection already operates independently of scheduling. The proposed collect-now/choose-later default requires a deliberate capture-boundary change; merely removing the form is insufficient. Card ownership is by savedItemId, potentially across video occurrences (`capture.ts:92–106`); reactivation preserves an archived card's schedule (`:129–144`). These remain participant source-reading reports, not coordinator-reproduced tests.

Both reviewers support taking the selection proposal forward with verify status, not declaring all downstream exercises ready. @drwritely proposes “Add a note (optional): A meaning, reminder, or question for yourself” and clarifies that checkbox selection does not enrol until Add to study; note-save semantics remain unspecified. A note is not automatically an exercise answer. Preserve existing enrolments/history and scope Undo to new batch changes.

The requested concrete first-study interaction without confirmed meaning is still missing: neither response supplied the actual prompt/reveal/rating/exit sequence. Coordinator requests that example from @drwritely alone before commissioning another sketch. @codearchitect and @experiencedesigner hold expansion. No new learner-facing readiness status is agreed.

### Concrete unresolved-meaning example

@drwritely proposes a non-rated first encounter for “sobie poradzę”: Revisit prompt; reveal original line “Mam nadzieję, że sobie poradzę”; replay captured segment; possible dictionary meanings labelled suggestions; optional note; Next without presenting it again during the sitting. No recall rating or schedule update. This supplies the requested concrete example, not an owner-approved study design.

Open consequence: this example permits revisiting but does not establish how the item becomes usable for rated recall, or why it should recur in later sessions if its uncertainty remains unchanged. Do not turn it into mandatory recurring preparation. Confirm the user's intended study activity before adding readiness states or building a study sketch. Missing an app-stored translation is not itself proof the learner does not understand the expression; the rule must be exercise-specific.

### Export-path assessment and next design artifact

@codearchitect source review reports exporter consumes saved items/occurrences, not review cards (`packages/domain/src/ankiExport.ts:75–93`). Current export screen passes all items/occurrences except archived items (`views/exportImport.ts:561–566`), not per-video checked selection. Context currently uses earliest occurrence, potentially another video's, with a possibly expression-only fallback when its cue is unavailable (`ankiExport.ts:54–72`). Proposed video export must deliberately choose the source occurrence and retain full context rather than silently substitute.

Missing meaning is exportable but the current recognition answer can be effectively empty without notes; txt uses an em dash. Production cards require meaning. No audio/video/timestamps or review history are exported. Stable GUID per saved item intends update-on-reimport; cross-video context replacement and preservation of Anki edits/scheduling remain unqualified. .apkg needs the service; txt is browser-generated. These are source reports, not executed export/import qualification.

Next artifact request to @experiencedesigner: standalone video-vocabulary/export sketch in own worktree, keeping watch r2 unchanged. Checkbox selection without list-processing obligation; row source line/replay; export preview of exact expression/context/answer with dictionary suggestions distinguished from chosen meaning. Include one missing-meaning item and one item collected from multiple videos. Make empty-answer risk and repeated-export context questions visible proposals, not silently solved policy. No in-app study, media-export expansion, live Anki changes or application edits. After source/copy review, owner tries artifact before implementation planning.

### Vocabulary/export artifact handoff

Designer supplied `C:/Users/jmdzi/workspace/lingotorte-design-sketches/docs/design/sketches/vocabulary-export/index.html`, with README, screenshots and verification.json. Coordinator read README; designer reports 43 headless Chrome checks across desktop and iPad-sized portrait/landscape. No coordinator reproduction, real iPad Safari, assistive technology, media playback, file generation or Anki import qualification is claimed. Replay and export are explicitly simulated. Designer reports watch sketch unchanged and work uncommitted.

Next focused review: @drwritely checks whether missing-meaning warnings, optional meaning/note fields and simulated replay/export status communicate honestly without blocking selection; @codearchitect checks whether preview/selection accurately expresses mapper changes, selected occurrence ownership and repeated-export limitations. Read-only review, up to three material findings with artifact locations, distinguishing sketch defects from integration/policy issues. No actual export/Anki writes. Designer holds revisions pending synthesis.

### Vocabulary/export source-review findings

@codearchitect source-reviewed the sketch, without browser execution. Reports selected-only preview, honest missing-meaning handling, proposed video-scoped context, and clear simulation/re-import limitations. One preview correction: reverse-card summary omits context, notes and applicable attribution present in the real production template (`apps/local-service/src/ankiPackage.ts:73`). Show the complete content or label it explicitly as a summary. Recognition preview Back can be labelled Answer section because the real answer repeats the front (`:71`).

Meaning-edit scope remains unresolved: shared saved-item edit across videos versus export-only override. Label the scope in any prototype; neither policy is owner-selected. @drwritely's requested content review has not yet been delivered in the thread. Revision hold remains pending that review, then coordinator consolidates one bounded change list. No browser or Anki qualification is inferred from this source review.

### Consolidated vocabulary/export revision brief

@drwritely supplies the content-review findings: note-only answers currently suppress the empty-answer warning despite no meaning; add “No meaning included. The answer section contains only your note.” without blocking export. “Preview-only in this sketch” does not resolve intended editing scope. The full review referred to by the writer was not visible to the coordinator; these supplied findings are sufficient for this bounded revision, without claiming unseen line citations.

Revision hold released to @experiencedesigner for: complete reverse-side preview content (or explicit summary labelling), recognition Answer section labelling, separate empty-answer versus note-only feedback, and explicit unresolved shared-item-versus-export-only editing scope. Preserve optional editing/deselection, text-only/simulation disclosure, no automatic sense choice, and selected-video context as a proposal. Rerun prior checks plus focused checks for preview content and note-only feedback. Watch artifact and application code remain untouched. Both reviews are source-only; no real Anki import or owner approval is claimed.

### Owner feedback on vocabulary/export r2

Coordinator read the revised README, which records preview labelling, note-only feedback, unresolved edit scope and 55 reported checks; coordinator did not reproduce those checks. Owner then said: “Oh wow, yeah, I actually really like this ...!” Record positive directional feedback on the vocabulary/export flow, not resolution of shared-item versus export-only editing, re-import semantics, or proof of actual Anki import. Together with watch r2, this establishes a positively received design reference for watch → lookup → collect → select → export.

Next bounded discussion addresses meaning/note edit scope only. Coordinator recommends editing the saved vocabulary item, with effects across its occurrences disclosed, rather than introducing export-only overrides by default; this remains a recommendation pending owner choice. No further sketch expansion or application implementation is authorised by positive feedback alone.

### Owner decision: persistent vocabulary edits

Owner accepts the coordinator's recommendation: meaning/note edits in the vocabulary/export flow update the saved vocabulary item for future use, including its occurrences across videos. This resolves edit scope in favour of persistent shared-item edits, not export-only overrides. Communicate that scope clearly; preserve the distinction between a note and a confirmed meaning. Exact save/acknowledgement/failure behaviour remains to be specified, and no live data changes are authorised by this design decision.

Next focused review addresses the separate remaining identity issue: re-exporting the same saved item from another video changes proposed context while retaining note identity. @codearchitect should recommend one conservative context/re-import policy, distinguish source facts from Anki behaviour needing qualification, and identify any unavoidable owner choice. Do not reopen edit scope, study design or add implementation scope.

## 6. Candidate acceptance scenarios

These are proposed checks, not executed tests or implementation requirements already approved.

1. **Clean return:** due cards accessible without unrelated setup; replay dependency only where needed; answer, close, reopen, confirm both retained rating and correct resulting review state.
2. **Offline/interrupted return:** rate disconnected, reload, reconnect, inspect the actual branch and consequences; distinguish a service unchanged since disconnection from genuinely competing changes. Confirm unacknowledged work is recoverable without claiming all mutation types are automatically mergeable.
3. **Context unavailable:** leave a context-dependent card unrated rather than manufacture a recall failure.
4. **Correction sequence:** Keep “coat” from “She left her coat on the chair”; correct chair → train; then coat → cat. Same behaviour whether kept just now or previously. Preserve capture/history, separate context and target effects, permit deferral, and avoid a duplicate target card.
5. **Durability:** interrupt after Keep, Fix or rating; feedback must match recoverability. A retry must not create duplicate events or overwrite subsequent work. Schema validation alone does not establish user-flow correctness.

## 7. Corrections and superseded positions

- “Inspect is blocked on drafts” was corrected: Keep is blocked; Inspect exists and is ungated.
- “Keep browser work waits until explicit Save” was withdrawn: default autosave can write on the next learner action.
- “The fork is exceptional” and “the fork happens every morning” are both too broad. A source-traced repeatable path is established; its usage frequency is not.
- Same-origin proxying was initially described as a new deployment change; it already exists. Browser origin policy alone is not the full security argument.
- Same-sitting re-pointing was withdrawn. An invisible session boundary must not decide which corrections affect a card.
- Auto-saving inspected words and auto-enrolling discovered files were challenged and replaced with explicit learning/library selection in the proposed experience.
- A queue does not by itself prove durability, idempotency, ordering, conflict freedom or safe migration.

## 8. Coordination and update protocol

1. Discuss Q-01 first, then Q-02. Do not force a choice of pairing fix or correction storage design before establishing the desired experience.
2. Coordinator prompts one bounded question to the needed specialist(s), records the answer and unresolved disagreement, and then selects the next question. Others wait unless invited by the user or coordinator.
3. Keep stable IDs. Resolve an item by recording who decided, the exact disposition, evidence and dependencies; do not silently turn proposals into agreements. Preserve useful minority objections.
4. Promote owner-approved decisions to the appropriate project decision record and implementation work to Beads only when authorised. This register complements those systems, not competes with them.
5. Before implementation planning, assess user friction, empirical evidence and business scope; record continue, verify or stop_reframe. Current design proposals remain verify, not implementation-ready approval.
6. No application edits, provider calls, real learner-state changes, deployment changes or new live qualification are authorised by this document. Its creation is the first repository artifact from this discussion recorded here; earlier specialist contributions explicitly reported no repository writes.

### Change log

- Initial edition: coordinator synthesised the shared discussion, including later corrections, and separated owner direction, working agreements, evidence, proposals and open questions. No proposed architecture or UI change was applied.
