# lt-13i — proposed offline scope adjustment

**Status: independently approved scope proposal; planning only.**
Separate a future synthetic dirty-approval repair from Windows runtime qualification without weakening the original acceptance.
Choose explicit **block → Apply → inspect → Approve**, preserving immutable corrected tracks.
Riskiest assumption: a qualified, bounded offline Vitest/JSDOM lane can be identified; none is established by this review.

## 1. Decisions for review

### A. Split work, not completion

Propose one future unit titled **“Repair dirty transcript approval with offline synthetic regressions”** (`OFFLINE_REPAIR` below is a placeholder, not a reserved/existing issue ID). It may implement and establish synthetic behavior without depending on Windows startup. Original `lt-13i` remains the complete behavior/qualification obligation and retains its `lt-13v` blocker. Review acceptance is not permission to implement or execute.

Alternative: leave all work serialized behind `lt-13v`. That avoids a split but prevents independent offline progress. Reversing the proposed split later requires graph/receipt reconciliation, not a product migration.

### B. Block dirty approval; do not silently apply

Show a persistent, accessible explanation that pending edits require **Create corrected transcript version** (the existing Apply action), then inspection and a separate approval. Disable approval while dirty or while a correction/structural operation is pending; enforce the same rule in the handler and model-facing approval path, not only the button attribute. Clean explicit approval remains allowed under existing product semantics.

Dirty means a meaningful difference from the selected persisted track's cue text, cue boundaries, or word text/boundaries—not merely a nonempty pending-edit dictionary. Reverting values restores clean status. Invalid/empty editor input must remain visibly unresolved, not be filtered away and presented as accepted content. Approval must bind the selected track/version and editor generation; changing selection or editing during asynchronous Apply cannot approve stale content or clear newer edits. Preserve focus/value continuity when refreshing the control state.

The model already has pending dictionaries, but they are keyed by cue/word IDs rather than an explicit editor-session track identity. Establish identity and the shared guard within the narrow app/model/UI-state scope; do not assert that track ID alone proves the DOM is clean. Direct model callers and handler dispatch need a negative control alongside UI click coverage.

Alternative: combined Apply-and-Approve. It adds asynchronous validation/partial-failure and consent ambiguity; switching later would change both UI contract and regressions. No automatic approval is proposed. Split/merge may conservatively block while dirty; consuming or discarding pending edits silently is not acceptable. No alignment engine, analytics, provider, schema migration, storage backend or launcher refactor belongs here.

## 2. Source grounding and remaining unknowns

Baseline: branch `work/lt-dirty-approval-scope`, base/HEAD `147081a13cf5650b30ab719142b1ef7f31132f5f`; clean before drafting. These are tracked main-baseline sources, not the stopped dirty launcher overlay. Evidence class is **source-confirmed risk**, not a newly reproduced runtime defect; no candidate code was imported or exercised.

| Current source anchor | What it establishes |
| --- | --- |
| `docs/review/plan-review-2026-10-10.md:129–137,166` | R12 identifies dirty approval; retain immutable versions and approved-save guards. Historical app/model line references have shifted. |
| `apps/web/src/app.ts:3168–3174,3178–3208,3222–3259` | Inputs retain pending cue text, cue timings and word edits separately from persisted content. |
| `apps/web/src/app.ts:3319–3364,3369–3379` | Apply constructs edits asynchronously and clears pending dictionaries on success. Approve currently checks only approved status before calling the model; no dirty guard is visible here. One production approval button/call was located, not two assumed UI entrypoints. |
| `apps/web/src/model.ts:2190–2263,2288–2321,2373–2384` | Correction creates a `correcting` child with parent ID/hash and a new version; approval updates the requested persisted track. Word validation occurs after initial transcript creation: rejected Apply must not be assumed transactional or safe to approve. |
| `tests/web/p7TranscriptLifecycleFrontend.test.ts:7–20,74–145` | JSDOM workflow covers successful Apply then Approve and draft-save UI gating; it does not establish dirty-before-Approve refusal. |
| `tests/core/p7TranscriptAdapters.test.ts:241–276`; `tests/core/p7TranscriptLifecycle.test.ts:64–73,96–108` | Existing assertions cover raw-draft immutability, corrected parent identity and draft-save rejection; saved context includes media fingerprint, track/cue IDs, time/token/character spans. Preserve and extend, not replace. |
| `package.json:16–26,35–45`; `vitest.config.ts:3–10`; `vite.config.ts:4–18` | Vitest suite uses Node environment; frontend tests construct JSDOM. Vite development/build is a distinct lane. Lockfile records Vite 8.0.16, Vitest 4.1.9, jsdom 29.1.1 and TypeScript 6.0.3, not installed runtime qualification. |

Known unknowns: exact normalization/invalid numeric-input policy, stale-selection behavior and partial Apply state require future regression evidence. Default to fail-closed approval and retain unresolved edits; if correctness requires broader correction transactions or a storage change, stop for a separate scope disposition rather than smuggling it into this unit. This proposal claims no red test, green baseline, collection total or browser behavior.

## 3. Exact prospective graph and acceptance

Canonical read-only snapshot: `lt-13i` open/unclaimed; `lt-13i.1` in_progress, assigned `hermes-dirty-approval-scope`; `lt-13v` open/unclaimed; `lt-dy6` closed; `lt-3bi` open/unclaimed; `lt-a46` blocked/assigned `hermes-launcher`; `lt-c0r.4` and `lt-c0r.6` blocked. The last two are **not** `lt-a46.4/.6` (those lookups returned not found). Preserve the actual IDs and all native guards, claims and exhausted allowances.

Notation: **A depends on B** means a Beads `blocks` dependency stored on A toward B. Organizational `parent-child` edges are separate.

| Record | Proposed later change, only after reviewed disposition and fresh authority |
| --- | --- |
| `OFFLINE_REPAIR` | New task, priority 1, organizational parent `lt-aur` (sibling of `lt-13i`); initial status **blocked**, no assignee. `blocks` prerequisites: `lt-13i.1` and `lt-dy6`. No `lt-13v` dependency. Notes explicitly retain fresh implementation-authority and qualified execution-lane blockers. |
| `lt-13i` | Add only a `blocks` dependency on `OFFLINE_REPAIR` and an evidence/closure annotation below. Retain `blocks` edges to `lt-13v` and `lt-dy6`, parent `lt-aur`, original description, acceptance, status and claim state. |
| `lt-13i.1` | Keep its parent `lt-13i`; parent may close only the planning decision after independent review, with disposition evidence. Do not add an inverse blocking edge from `lt-13i` to this review child. |
| `lt-13v`, `lt-3bi`, native diagnostic/launcher issues | No edits. `lt-13v` retains blockers `lt-dy6`, `lt-a46`, `lt-8s9`, `lt-tow` and parent `lt-c0r`; `lt-3bi` still depends on `lt-13i` and all its other prerequisites. |

This sibling arrangement avoids an organizational-plus-blocking cycle through `lt-13i`. No issue creation, dependency/status change or annotation is performed by this draft.

**Proposed OFFLINE_REPAIR scope:** narrowly edit transcript editor/approval state and guards in app/model/UI types, with existing synthetic lifecycle tests and minimal associated documentation. No new runnable harness, backend rewrite or runtime lane.

**Proposed OFFLINE_REPAIR acceptance:** “Dirty cue text, cue timing and word text/timing prevent approval through UI and direct model/handler paths; clean or reverted edits permit explicit approval. Successful Apply creates an immutable corrected version whose displayed accepted content and identity match the subsequently approved track; failed or stale Apply never approves or clears newer unresolved edits. Existing saved occurrence anchors remain unchanged and valid; draft/correcting saves remain blocked. Preserve existing lifecycle tests; record discriminating pre-fix failure and post-fix synthetic results, exact candidate/dependency/harness identities and independently reviewed evidence under a separately authorized qualified offline lane. Synthetic closure does not certify Windows startup/shutdown, native SQLite, Edge, integration, deployment or original lt-13i completion.”

**Original lt-13i acceptance stays verbatim:** “Dirty edits prompt/apply/block explicitly; approved version equals visible accepted content; existing saved anchors remain valid; draft-save gate preserved.”

**Proposed additional lt-13i closure annotation:** “Offline repair is only a component receipt. Close only after OFFLINE_REPAIR and retained lt-13v prerequisites are satisfied, independent review accepts the unchanged behavior criteria, and a separately authorized synthetic real-UI integration journey on the exact integrated repair revision verifies dirty refusal, Apply/inspect/Approve, save/reload and unchanged existing anchors. A prior Windows receipt lacking this patch, static build or JSDOM result alone is insufficient. lt-3bi remains the downstream integrated learning qualification gate.”

Activation is a separate parent action: obtain and record fresh named implementation authority and its stop point before product edits; create the unit only under that disposition, initially blocked. Before any test execution, discover and independently check the approved lane contract and obtain its explicit execution authority. Record each unresolved blocker, then change status/claim only when the applicable prerequisites really hold. Closed historical `lt-dy6` and accepted review cannot bypass the current review-only instruction. No new authorization issue is presumed to exist or be closed.

## 4. Bounded future regression matrix — all unrun

| Scenario / discriminating negative control | Required synthetic assertion |
| --- | --- |
| Cue text; each cue boundary; word text; each word boundary | Change one field at a time; approval blocked with visible explanation, no approval timestamp/status change. Unchanged and edit-then-revert controls permit approval. |
| UI and non-button paths | Disabled click, handler dispatch and direct approval call cannot bypass the guard. Existing clean model approval callers still work. |
| Apply then inspect then approve | Child version/parent hash and displayed text/timings match persisted accepted values; only that selected version becomes approved. Parent bytes/IDs remain unchanged. |
| Invalid/failed Apply | Empty text, invalid/reversed timings and rejected word edit remain unresolved; no silent omission, autoapproval or success message. Detect partial created tracks without treating them as accepted. |
| Asynchronous interleavings | Deferred Apply with a later edit, selected-track change or duplicate action cannot approve stale content or erase later edits. Block split/merge while dirty/pending; clean structural behavior preserved. |
| Saved anchors and save gate | Save from approved V1, create/approve V2, then compare V1 occurrence context and its referenced cue/track/text/timings/fingerprint/spans unchanged. Reject saves from draft/correcting V2 before approval; preserve word provenance without inventing alignment. |

Use actual app/model/local in-memory store where these boundaries matter, not a mock replacing the approval guard. Existing fake providers are synthetic; URLs in fixtures do not authorize online reads. Future tests must intercept/deny network and keep providers disabled. Pre-fix failure must reach the intended product assertion, not merely fail on setup. If a case already passes, record that honestly rather than inventing red evidence. No fixture or regression code is written now.

## 5. Execution readiness and evidence limits

Read-only discovery located the manifest/configs and existing Vitest/JSDOM test shape above. `docs/dev/windows-qualification-procedure.md:7–35,50–72` supplies source-binding, preflight, lifecycle and browser constraints; it is explicitly planning-only, not an approved disposable-guest Vitest packaging/runner/supervisor/cleanup contract. No task-specific qualified offline execution lane was established. **Future execution: BLOCKED; all runtime/testing/build/compilation results: UNRUN.** Do not assume an old guest or fixture is ready, launch one, or convert pytest instructions into TypeScript runner authority.

Before a later launch, discover the existing qualified packager, runner, supervisor, source scope and cleanup contract. If absent, stop for disposition rather than create a less restrictive harness here. Adapt only the bounded-guest evidence principles: complete tracked-source/import/fixture closure; exact reviewed dirty additions/deletions; path inventory privacy/link checks before copying; file/lockfile/installed-dependency hashes and snapshot-local resolution; explicit credential-free environment with provider/network restrictions; external owned state/caches/output; finite approved setup/collection/test and product deadlines; actual Vitest-collected identities reconciled with complete machine results; exact owned-instance stop acknowledgement and independent no-recovery cleanup readback. No fixed guest, runtime tuple or budget is invented by this proposal.

Timeout, assertion failure, setup/collection failure, output truncation and incomplete results remain distinct. Stop on failure under the approved bound; no automatic repair/retry and no fabricated report. JSDOM establishes only exercised synthetic DOM/model behavior. Windows launch/native console/SQLite/Edge claims stay with the unchanged runtime gates; actual integrated learning acceptance stays with `lt-3bi`. Combining the repair with a qualification candidate requires explicit integration selection and new content-bound evidence, not an automatic merge, PR or deployment.

## 6. Review packet and stop point

Local-only archive `lt-13i-offline-scope-review` under the project's evidence-archives root contains the read-only canonical snapshot and **16 selected source files**, not a runnable package. `source-manifest.json` has schema `{schema:1, files:[{path,size,sha256}]}`; SHA-256 `1fbe14a37917bd763599967e64637ff4f0288205f226779665d264c2a0c402a6`. This selected review inventory is not future execution closure. Parent must re-read canonical records before any write because unrelated actors may advance them; do not restore an old whole-store export over concurrent changes.

Independent reviewer: accept/reject (1) the sibling unit/retained graph and completion distinction, (2) explicit block/Apply/inspect/Approve with all editable fields and stale-operation guards, (3) synthetic matrix plus blocked lane/authority contract. Allow at most one documented correction, then return disposition to the parent. Parent alone owns canonical review updates, closure and verified atomic work-branch publication; this child supplies the draft/evidence. Accepted review closes no product gate and starts no implementation or execution.

## Parent review disposition

Independent review `deleg_262bc011` **PASS / APPROVED** for planning only, with no correction required. The reviewer checked source anchors, graph/acceptance preservation, repair limits and execution authority, and independently verified all 16 selected source files against both the archive manifest and worktree. Parent verified those same source bindings, identical archived before/after canonical snapshots and the frozen draft binding. These are text/hash and source-inspection checks, not runtime tests.

Frozen draft SHA-256: `518b407c7ec1190c472a99d01dd8f76529be47caf3795b5857fd5e7556b008d6`; source-manifest SHA-256: `1fbe14a37917bd763599967e64637ff4f0288205f226779665d264c2a0c402a6`. The status update and acceptance annotation postdate the archived draft; no archive was altered or relabeled. Canonical Beads records the exact publication revision and remote readback.

Disposition: accept the proposed split for a later explicitly authorized activation. Only `lt-13i.1` closes as a reviewed planning decision. No `OFFLINE_REPAIR` issue is created, no original issue dependency or acceptance is changed, and no product repair or execution begins. Fresh named implementation authority and an independently checked, explicitly authorized offline execution lane remain prerequisites. All Windows/runtime/native qualification gates remain intact.
