# PLAN.md takeover review — 2026-10-10

## Verdict

**Revise before using PLAN.md as an implementation handoff. Keep the architecture and local-first direction; change the sequencing and acceptance contract.** The plan is a useful feature/history inventory, but it conflates accepted slices with end-to-end correctness, understates completed work, and omits important durability, review-scheduling and local-service safety checks.

The previous recommendation to proceed from Windows portability directly to B5 morphology is superseded by this deeper review: **Windows qualification → local safety/data-integrity repairs → learning-loop correctness → B5 learner-facing language assistance.** Optional features must not become new takeover prerequisites.

This is a review, not authorization or implementation of those repairs. `PLAN.md` has deliberately not been rewritten yet; the proposed changes below expose the consequential decisions before committing to a replacement plan. Historical acceptance receipts remain valid records of their actual scope, not guarantees that no defects exist.

## Scope and evidence

- Baseline: `main` at `a703dab`; the pre-existing `PLAN-STATUS.md` takeover edit was preserved.
- Three independent source/document reviews covered B1–B4, B5–B8, and plan/authority/safety completeness. Parent review checked key traces and reproduced the highest-impact findings.
- **Executed now:** focused existing tests, 4 files / **56 passed**; a separate synthetic exploratory probe reproduced four defects below. No application code or existing tests were changed.
- **Previous same-session execution:** Windows full suite 266 passed / 34 failed, launcher `spawn EINVAL`; types/build/privacy/no-network passed. These results are not presented as a new full-suite rerun.
- All probe learner state was in memory, including SQLite `:memory:`. Vite was used only as a middleware-mode module loader, not as a listening application server. No real learner DB, media library, provider, microphone, model install or deployed service was used.
- **Evidence labels:** `REPRODUCED` = actual synthetic execution; `SOURCE-CONFIRMED` = traced implementation; `RISK / NOT EXERCISED` = integration or environmental implication requiring a focused test; `RECOMMENDATION` = proposed plan change.
- Source line references below refer to this baseline. No comprehensive security audit, dependency vulnerability audit, real-browser acceptance, historical-DB migration or live ASR proof was performed.

## 1. Landmines: issues that change the plan

### R1 — High: restore semantics do not match the UI/plan contract

**REPRODUCED.** Merging a store's identical manifest increased both reviews and practice attempts from 1 to 2. Replacing it with an empty manifest removed saved items but retained both reviews and both practice attempts.

Sources:

- `PLAN.md:164` promises that Replace-all clears existing local learner state.
- `packages/storage/src/exportRestoreService.ts:127–154` uses `Object.keys()` on event/attempt arrays when removing records, then unconditionally appends imported history.
- `packages/storage/src/localStore.ts:247–257,329–336` appends history and removes by record ID, not array index.
- `packages/domain/src/exportManifest.ts:529–557,616–621` classifies identical/conflicting history as skipped/updated, unlike execution.
- `apps/web/src/model.ts:3019–3045` reports preview operation counts and starts optional persistence without awaiting durable success.

**Additional SOURCE-CONFIRMED conflict:** SQLite review history is append-only; omitted events return on load (`packages/storage/src/sqliteLocalPersistence.ts:1353–1359,1505–1514`). Fixing array removal alone will not make durable Replace-all match its wording.

**Required plan change:** split accepted restore UI from unresolved durable restore correctness. Specify ID-aware idempotent merge, immutable-event conflict rejection, atomic preflight/application, honest completion receipts, and explicit replacement semantics. Recommended default: preserve an audit archive separately from active restored learner history rather than silently deleting immutable events or replaying them into the replacement dataset. The exact retention design needs a short decision before coding.

Acceptance: repeated identical import leaves counts/state unchanged; same-ID conflicting immutable history is rejected before partial mutation; replace → save → reload yields the declared active dataset; failed durable save is visibly not a successful durable restore. Use synthetic stores only.

### R2 — High: sentence-builder practice cannot persist to SQLite

**REPRODUCED.** A valid sentence-builder practice attempt caused `saveSnapshot()` to fail with:

`CHECK constraint failed: mode IN ('typed-input', 'multiple-choice', 'audio-recall', 'speaking')`

The new in-memory database still reported no saved snapshot afterward: the transaction rolled back rather than silently dropping just that attempt.

Sources: `PLAN.md:138,197`; `packages/domain/src/coreTypes.ts:52`; `apps/web/src/model.ts:2834–2859`; `packages/storage/src/sqliteLocalPersistence.ts:231–235,1517–1540`. Existing frontend test `tests/web/p6PracticeFrontend.test.ts:425–457` ends at in-memory submission.

**Required plan change:** add existing-feature durability repair before new practice work. Use a forward migration, not a modification of a checksummed historical migration. Exercise every supported practice mode through submission, SQLite save and reload; assert preservation of the rest of the snapshot on success and failure.

### R3 — High: overdue mature cards disappear from automatic review

**REPRODUCED.** A synthetic overdue review card with `scheduledDays: 30` was due according to the review service, but frontend due count was zero and `pickNextDueCard()` returned `null`.

Sources: `packages/review/src/reviewService.ts:98–123`; `apps/web/src/model.ts:2661–2724`; `apps/web/src/uiTypes.ts:165`; misleading “hidden until next review” copy at `apps/web/src/app.ts:3737–3742`.

**Related SOURCE-CONFIRMED gap:** the UI stores one `bucketAsOf` timestamp and reuses it for later ratings/practice submissions (`apps/web/src/model.ts:133`; `apps/web/src/app.ts:507,714,719,3684–3692,3845`). Tests inject their own clock, which does not prove an advancing live session.

**Required plan change:** add a review correctness slice. “Mastered” may be a presentation label but must not suppress due FSRS work. Use an injectable live clock at query/submission boundaries. Acceptance includes overdue mature cards, a learning card becoming due while the app stays open, and distinct later review timestamps without reload.

### R4 — High: loopback binding is not a request-authenticity policy

**SOURCE-CONFIRMED; no browser exploit attempted.** The server emits CORS headers but does not validate request Origin/Host/authenticity before mutations. `readJsonBody()` accepts JSON irrespective of request Content-Type.

Sources: `apps/local-service/src/server.ts:99–128,932–1045`; operator/loopback assumption in `docs/review/safety-privacy-boundary-review.md:158`.

CORS response restrictions are not proof that a state/job/cleanup request came from the intended UI. This matters to a single-user local application too, not only a future hosted deployment. Browser-specific exploitability was not tested and must not be overstated.

**Required plan change:** a bounded personal-local threat model and negative request tests before daily-use qualification. Define permitted Host/Origin, content-type/method enforcement, and any session capability needed; define how legitimate non-browser clients work. Rejected requests must not create jobs, write state, execute commands or delete scratch files. Keep filesystem root-confinement and multi-user hosting as distinct deferred architectural decisions.

### R5 — High before real-state use: persistence/recovery evidence is incomplete

**SOURCE-CONFIRMED behavior / RISK NOT EXERCISED against real data.**

- Connecting to a nonempty service replaces the browser store without an unsaved-change comparison: `apps/web/src/model.ts:229–230,274–290`.
- Autosaves are fire-and-forget whole snapshots; no revision precondition is sent/checked: `apps/web/src/model.ts:254–261,309–311`; `apps/local-service/src/server.ts:964–967`. Multiple tabs or out-of-order writes are an untested stale-write risk, not a reproduced race here.
- Initializing event tables does not backfill older snapshot-only history; load replaces snapshot event arrays with authoritative-table contents: `packages/storage/src/sqliteLocalPersistence.ts:666–703,1505–1514`. A populated pre-event-table database needs a synthetic upgrade rehearsal before asserting compatibility.
- Current migration acceptance primarily establishes fresh/current databases (`tests/core/localPersistence.test.ts:93–196`), not populated historical upgrade, future-schema refusal or recovery after migration failure.

**Required plan change:** separate fresh-store development readiness from real-state qualification. Add dirty-connect confirmation, explicit single-writer/revision conflict policy, save failure/completion behavior, populated-version upgrade/backfill, future-schema policy, consistent backup and reopen/readback tests. Do not turn this into a cloud-sync project. Do not connect real learner state until its bounded recovery gate is met.

### R6 — Medium: “metadata backup” is broader than the export actually contains

**SOURCE-CONFIRMED.** `ExportService.buildManifest()` exports saved items/occurrences, cards/states, review events, practice attempts and embedded source-context enrichment. It does not export the full media library, all subtitle/cue versions, word timings, observations, job collections or provider policies (`packages/storage/src/exportRestoreService.ts:37–69`).

**Required plan change:** call the current feature **learner-state export**, with an exact inclusion/exclusion list. Do not recommend it as complete cross-machine application recovery. A future complete metadata backup still need not copy media. Test import into an otherwise empty app and explicitly report which source playback/transcript capabilities cannot be reconstructed.

### R7 — Medium: handle restoration is not complete media relinking

**SOURCE-CONFIRMED.** The fallback “Choose media again” uses ordinary import (`apps/web/src/app.ts:1682–1712`), which creates a new asset and can clear active track selection (`apps/web/src/model.ts:962–970,996–1020`). Handle storage uses a single current-handle key and restoration checks filename, not the existing fingerprint (`apps/web/src/model.ts:1052,1110–1159`).

**Required plan change:** distinguish implemented handle persistence/permission handling from identity-preserving relink. Define relink to retain existing media, transcript and learner anchors, reject or explicitly confirm identity mismatch, and avoid attaching a same-named different file. Require a real-browser restart/permission smoke in addition to fake handle-store tests. No broad private-media discovery is needed.

### R8 — Medium: Windows readiness must include browser/service workflows, not just the test runner

**EXECUTED in the prior takeover audit:** native launcher and SQLite failures. **SOURCE-CONFIRMED additional scope:** browser embedded-subtitle, local-ASR and ElevenLabs input validation also assumes POSIX paths (`apps/web/src/model.ts:1406–1408,1742–1744,1791–1793`; `apps/web/src/app.ts:2762–2765`). Fixing SQLite alone will leave these controls unusable with normal drive-letter paths.

Sources for existing blockers: `scripts/start-local.mjs:3–25`; `packages/storage/src/sqliteLocalPersistence.ts:659–663`; data-root defaults `apps/local-service/src/server.ts:1095–1103`; Python default `:365`.

**Required plan change:** supported Windows Node/Python/browser policy, native fully-qualified path semantics (including an explicit UNC policy), safe data/scratch defaults, portable fixtures, startup/error/shutdown and Linux regression preservation. Do not accept drive-relative or network paths accidentally under the label “absolute.” No ASR dependency/model installation is required to test input validation with fakes.

### R9 — Medium: practice semantics and transient state need a separate acceptance contract

**SOURCE-CONFIRMED; multi-card/race consequences not executed in this review.**

- A recognition prompt embeds the saved text (`apps/web/src/model.ts:2655`), while multiple-choice answers use that same text (`apps/web/src/app.ts:455–457,493–504`). A card may be technically gradeable without testing recall or meaning.
- Audio prompts ask for target cue text, but grading expects `savedItem.displayText`, potentially one word (`apps/web/src/model.ts:2744–2756`; `apps/web/src/app.ts:538`).
- Audio answer masking depends on a prior-result flag that submission retains; next-card transitions need explicit resets (`apps/web/src/model.ts:2784`; `apps/web/src/app.ts:455,732`).
- Practice snippet preparation lacks the Player's generation/context guard and path-change revocation (`apps/web/src/app.ts:318–332,526–543` versus `:2267–2280`). LDM8 Player tests do not establish Practice lifecycle safety.

**Required plan change:** specify each mode's prompt, expected answer, permitted hints, reveal point and FSRS effect. Test two successive cards, path/media/view changes, stale completion/failure and cleanup. Keep source-audio recall microphone-free. Hide or clearly label unavailable “Speaking” rather than interpreting its menu entry as an authorized microphone feature.

### R10 — Medium: the B5 backlog misses the actual learner-facing gap

**SOURCE-CONFIRMED.** Morfeusz adapter support is not yet equivalent to browser language assistance. The default dictionary returns unavailable/empty entries (`packages/language/src/adapters.ts:434–448`); default adapter selection is at `:543–557`. The browser token path tokenizes, and the separate lookup function has no app caller (`apps/web/src/model.ts:3072–3085`). `DECISIONS.md:155–162` correctly selects local-service Morfeusz in UI, while `PLAN.md:233` points mostly toward future translation.

**Required plan change:** after correctness repairs, expose a typed local-service morphology result with visible ambiguity/confidence/unavailable/error and browser fallback. Explicitly distinguish morphological analysis from word meanings; do not claim a dictionary is complete or silently add an online one. A licensed local dictionary/manual-meaning workflow can be a later bounded decision.

Minor factual fixes: `PLAN.md:187` omits confidence kind `certain` and overstates all analyzed confidence as ≥0.9; implementation includes `probable(0.72)` (`packages/language/src/adapters.ts:399–406`; `packages/domain/src/coreTypes.ts:471–475`).

### R11 — Medium, optional lane: local ASR proof does not establish forced-alignment readiness

**SOURCE-CONFIRMED.** The historical runbook says WhisperX was absent (`docs/dev/local-runbook.md:288`), while the browser requests `alignWords: true` (`apps/web/src/app.ts:3008–3017`). The service then requires WhisperX after faster-whisper (`apps/local-service/src/server.ts:513–532`). Furthermore, `scripts/whisperx_align.py:53–59` guesses timestamp units by magnitude rather than whether the source field is `start` or `startMs`; boundary/long-duration inputs can be misinterpreted.

**Required plan change:** distinguish faster-whisper proof, native word timestamps, optional forced alignment and actual browser end-to-end proof. Add key-based timestamp-unit tests and a capability/optional-alignment policy before enabling that workflow. Keep model installs and real-media qualification separate and optional for unrelated work. Record the accepted `base` default rather than reopening the completed tiny/base benchmark.

### R12 — Medium/low: correction and progress claims need narrower semantics

**SOURCE-CONFIRMED.**

- Apply-edits and Approve are separate operations; Approve does not check dirty editor fields (`apps/web/src/app.ts:3304–3362`; `apps/web/src/model.ts:2368–2379`). Add dirty-edit protection so visible uncommitted edits cannot be mistaken for the approved version. Existing immutable versioning and approved-save guards should be preserved.
- “Study time” is a fixed per-event estimate using UTC date slices, not measured study duration (`apps/web/src/model.ts:2874–2932`). A graded practice attempt also creates a linked review event (`packages/storage/src/practiceService.ts:91–109`), so combining both needs an explicit deduplication policy.
- Global track offset is implemented, but not a dual-track alignment-confidence UI (`PLAN.md:210`; `apps/web/src/model.ts:418–437,606–661`).

**Required plan change:** separate those claims. Prioritize dirty-editor safety; label estimated metrics honestly and define timezone/linked-event treatment. Keep richer alignment and analytics optional.

## 2. Hidden context: contradictions and authority to repair

| Location | Problem | Recommended correction |
| --- | --- | --- |
| `PLAN.md:3–6,25–37` | Competing current-status claims and obsolete branch/review state | PLAN = executable sequence/contracts; PLAN-STATUS = dated execution/evidence; DECISIONS = policy choices; receipts = historical exact-scope evidence. |
| `PLAN.md:121` vs `:153` | Handle restoration both future and implemented | Mark restoration implemented, identity-preserving relink incomplete (R7). |
| `PLAN.md:125,209,297` | LDM7 browser wiring pending/outstanding | Cite final repaired/accepted LDM7, not initial implementation only. |
| `PLAN.md:200,232` | Snippets implemented yet initial generation still backlog | Include accepted LDM8 Player visual range; retain only genuinely separate reuse/storage follow-ons. |
| `PLAN.md:174–178`; `DECISIONS.md:83–85` | Old tiny proof / undecided benchmark | Historical Linux tiny/base comparison and configurable base default completed; current-machine readiness separate. |
| `PLAN.md:114` | systemd operation described as “not a deployment” | Distinguish local deployment/restart from public exposure; receipts call it local deployment. |
| `PLAN.md:280,289,297,307` | Executable prompt names old Linux workspace, overclaims runnable state, reopens B7, and instructs commits | Replace with a named-batch template using discovered repo/worktree, exact baseline, allowed actions, acceptance, review and stop point; commit only if requested. |
| `DECISIONS.md:9` vs latest LDM8 decision | Broad standing local authority versus no next batch authorized by that deployment | Do not reinterpret an old deployment receipt as blanket future permission. Current review authorizes investigation, not starting repair batches. Future request should name scope/outcome; standing safety rules constrain execution. |
| `AGENTS.md:23–37`; README index | Historical planning prioritized over takeover status | Route current work first through PLAN-STATUS, PLAN, DECISIONS and safety; retain historical design reading as background. |

Historical receipts should not be rewritten to conceal earlier BLOCK findings, retries, limited smoke scope or later-discovered defects. LDM8's 300/300 retry and disconnected synthetic browser smoke did not test these newly identified storage/practice boundaries.

Also narrow what verification commands prove:

- `scan:privacy` is a runtime-source reference-product-marker scan (`scripts/check-privacy-boundaries.mjs:6–13,34–38`), not a comprehensive secret/path/egress/security audit.
- The no-network harness establishes exercised provider-off flows under intercepted primitives, not all browser/subprocess behavior (`tests/no-network/networkTrap.ts:20–63`).
- `validate_final_bundle.py` checks historical bundle files/terms/links/hashes; it does not establish semantic completeness or accuracy of PLAN.md (`validate_final_bundle.py:4–18,37–46`).

## 3. What good looks like: bounded replacement plan

### Preserve these successful patterns

1. **Player snippet lifecycle:** selected range, active loop and prepared audio have distinct state; generation/context guards and cleanup have focused negative tests (`tests/web/b6VisualRangeFrontend.test.ts`). Apply that pattern to Practice rather than assuming the shared service is enough.
2. **Transcript provenance:** corrections create versioned tracks, saved occurrences retain source anchors, and unapproved drafts are gated. Add dirty-editor protection without replacing the model.
3. **Auditable acceptance:** LDM8's packet preserves original BLOCKs, repairs, final review, flaky retry and the limits of synthetic smoke. Future batches should report exact evidence just as narrowly.

### Recommended sequence and stopping points

| Stage | Bounded outcome | Acceptance / stop point |
| --- | --- | --- |
| P0 — Plan reconciliation | Replace stale routing; define supported platform, evidence levels, retention/restore policy and fresh-store scope | This review disposition incorporated; no accidental activation of implementation, commit, push or deployment. |
| P1 — Windows development baseline | Launcher/path/Python/data-root portability across all existing browser/service seams | Existing suite plus new regressions green; types/build/no-network/marker scan pass; isolated startup, health/status, save/reload, synthetic browser and clean shutdown; preserve Linux behavior. |
| P2 — Local safety and data integrity | Small separately reviewable batches for request authenticity, restore/history semantics, practice schema coverage, dirty-connect/save conflicts | Rejected requests have zero side effects; supported modes persist; restore agrees with preview and declared audit policy; stale writes/failed saves are explicit. No real-state rollout. |
| P3 — Trustworthy learning loop | Mature due cards/live clock, honest prompts and answer targets, per-card audio/reveal reset, dirty transcript approval, identity-preserving relink | Multi-card/time-transition and source-context tests plus synthetic browser exercise; no mic/provider expansion. |
| P4 — Learner-facing B5 | Local morphology/ambiguity UI with explicit unavailable/error/fallback behavior | Polish fixture acceptance, service-off behavior, no online calls; dictionary/meaning coverage not overstated. |
| Optional real-state gate | Separately authorized migration/transfer rehearsal | Consistent backup, populated historical upgrade/backfill, future-schema policy, ID/event/anchor preservation, reopen/readback and recovery; no implicit media/credential/handle copying. |

Do not collapse P2/P3 into one giant autonomous patch: each defect class needs its own regressions and independent review. Safety and data-integrity qualification should precede deployment or use of real learner state, not necessarily every isolated development experiment.

**Daily-driver acceptance proposal:** on the supported browser/platform, import an owned/synthetic playable file and subtitles, correct/approve, save a contextual item, review genuinely due cards, complete practice, persist/reload without identity/history loss, relink the same file, and export/restore exactly the documented learner dataset. Errors and unsupported formats must be visible; no silent provider calls. Include keyboard/focus and unsupported-codec checks in the bounded browser smoke, not a packaging redesign.

Evidence levels must stay separate: implemented → unit/integration-tested → browser-smoked → real-tool-qualified where needed → independently reviewed → accepted → locally deployed. State the exact revision and dirty patch, commands, retries, skipped/live gates and known limitations. A passing build or completed checklist is not proof of the whole loop.

### Deferred, not new blockers

Tauri/Electron/PWA packaging, cloud sync, AnkiConnect, microphone/shadowing, online translation/LLM/TTS, automatic media acquisition, new provider benchmarks, durable media/snippet export, bitmap OCR, styling preservation, richer alignment and analytics. Historical model approval does not establish a current-machine installation or justify an unrequested download. Pure local ASR need not block development for a user who primarily expects cloud STT behind the existing explicit gates.

## 4. Questions worth resolving before the replacement plan is implemented

Recommended defaults rather than requests to re-decide specialist details:

1. **What counts as recovery?** Current export restores a learner subset, not an entire media/transcript library. Label that precisely; use consistent DB backup for full-state protection until a broader metadata format is explicitly designed.
2. **What does Replace-all mean with immutable audit history?** Replace the active learner dataset while preserving separately identified audit history, or remove the misleading option until such semantics exist. Do not silently violate either promise.
3. **What is the supported environment?** Native Windows/browser + loopback, with an explicitly qualified Node/Python/browser combination and Linux regression coverage. No desktop packaging prerequisite.
4. **What comes before B5?** Repair existing safety, persistence and learning semantics first. Do not mistake feature presence for trustworthy daily use.
5. **What is the launch authority?** A new named local batch and its completion contract, not an obsolete generic `/goal` prompt or historical push/deploy receipt.

Suggested next request: **“Reconcile PLAN.md and its current entry-point references using this review. Define finite Windows, local-safety/data-integrity, and learning-correctness batches with explicit acceptance/non-goals; keep optional lanes deferred and separate historical acceptance from current readiness. Do not start implementation yet.”**

## Reproduction and validation record

Diagnostic artifact: [plan-review-2026-10-10.mjs](probes/plan-review-2026-10-10.mjs).

Run from this checkout after dependencies are installed:

`node docs/review/probes/plan-review-2026-10-10.mjs`

This probe **asserts the current defective observations**, so exit zero means the review findings reproduced, not that the application passed correctness tests. When defects are fixed, replace these observations with ordinary red-to-green regression tests; do not preserve the defects to keep this diagnostic green.

Observed output on Node `v26.7.0`:

| Probe | Observation |
| --- | --- |
| Identical manifest merge | reviews 1 → 2; practice 1 → 2 |
| Replace with empty manifest | saved items 0; old reviews 2 and practice attempts 2 retained |
| Sentence-builder SQLite save | mode CHECK constraint failed; no snapshot committed |
| Overdue mature card | backend due 1; frontend due 0; next card null |

Existing baseline command: `npm test -- --run tests/core/localPersistence.test.ts tests/core/p6PracticeExport.test.ts tests/web/p5ReviewFrontend.test.ts tests/web/p6PracticeFrontend.test.ts` → **4 files / 56 tests passed**. This demonstrates concrete gaps in those assertions, not a contradiction in the test runner.

Review deliverables are this report and its diagnostic script only. No source fixes, real data mutation, dependency additions, commit, push or deployment occurred in this review.
