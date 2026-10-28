# Lingotorte design discussion register

## Purpose and authority

Living synthesis of the CodePlanningGroup discussion: clarify the emerging product vision, then simplify the experience and architecture to serve it. This is a discussion and decision register, not an implementation plan or replacement for DECISIONS.md or Beads.

Coordinator: @default-this-device. Specialists: @codearchitect, @experiencedesigner, @drwritely. Product decisions belong to the user. Specialists respond when prompted by the user or coordinator; the coordinator maintains this document and invites focused contributions.

Scope of this first edition: the shared discussion through the user's request for a coordinating document. No private conversations or recalled private project history are used. Source findings below are attributed reports from this discussion, not independently reverified findings. Repository base at document creation: `801b6c44867b165683e6e16aebf228f62122138e`.

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

Status: proposed interaction map, not an approved implementation. Owner's collect-versus-schedule answer remains pending.

- Pointer: hover to inspect without pausing; click to collect and pause. Touch: tap to inspect, explicit Keep in the popover. Keyboard: focused inspection and explicit collection. Exact gestures, timing, phrase selection, subtitle geometry and pause/resume behaviour need validation. Do not assume swipe, arrow-key aliases or a hover delay are settled.
- @experiencedesigner corrected the earlier keyboard inventory: the help declares `[` / `]` previous/next line and `R` replay. @codearchitect reported existing cue buttons and transcript seeking, missing video-click pause and hover lookup, and a current collect form. These remain source-reading reports.
- Dictionary senses are possible meanings, not confirmed contextual translations. @experiencedesigner withdrew “the gloss is the meaning”; automatic top-sense selection remains disputed and must not enter agreed behaviour. Keep must remain possible without a lookup result. Distinguish completed no-match from unavailable/failed lookup.
- @drwritely and @codearchitect identified the moving-cue hazard: the interaction must retain the inspected selection/context when playback advances. Existing capture shapes help, but future popover behaviour is not verified. Freezing a strip, showing source context/timestamp, or pinning the popover are candidate designs, not completed fixes.
- Per-track gloss prefetch is an architectural proposal, not a prerequisite or measured latency result. First-use, loading and failure states must remain honest; “local” does not prove “instant”.
- Claims that first study must request a missing meaning, or that a top dictionary sense becomes the answer, are not approved. Resolve learning intent before specifying that path.

Coordinator next prompt: hold further specialist expansion until the owner answers whether collecting also schedules study. Then request one bounded revised sketch/map, rather than another open-ended fanout. No new application scope is granted.

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
