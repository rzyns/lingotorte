# Restore active-data / audit semantics contract

**Decision:** retain working replacement as the required product outcome; replace the **active learner dataset**, not the append-only audit.
**Design:** keep one active dataset, reuse the existing history tables as immutable payload stores, and add explicit active-history membership. Do not introduce generations of entire application state or a general event-sourcing framework.
**Riskiest assumption:** all save/load/export paths can distinguish active history from retained audit. A single unfiltered replay or stale whole-snapshot write defeats replacement; the tests below are release gates, not optional polish.

Status: proposed technical decision for `lt-xnu`, ready for independent specification then quality review. This document is not implementation, approval, issue closure, deployment authorization, or proof of repaired behavior. Source baseline: `a96ddce728e9860887d1a9b6fb0ef92105c04729` on `work/lt-xnu-restore-policy`. Beads remains the task/status authority.

Independent review: specification approved (`deleg_a24dfdb3/task-0`), quality approved (`deleg_a2dc2b80/task-1`). The proposal below is accepted as the implementation contract; implementation and durable qualification remain pending.

## 1. Decision and alternatives

### Selected: explicit active membership, retained immutable history

A confirmed Replace-all becomes **“Replace active learner data”** in visible copy. Its result is exactly the imported six learner collections after validated decoding and duplicate normalization: saved items, saved occurrences, review cards, review-card states, review events and practice attempts. Prior review/practice payloads remain in local audit storage but omitted events are not active, counted, scheduled, shown as current history, or exported by the normal learner-state export.

This preserves the default `lt-04i` acceptance: synthetic replace → durable save → close/reopen yields the declared active records **and** the retained audit. No downstream acceptance is narrowed to “button disabled.” It preserves the append-only review policy in [the safety review](../review/safety-privacy-boundary-review.md), lines 44–54, and the merge/replace product direction in [DECISIONS.md](../../DECISIONS.md), lines 55–79.

Practice attempts also receive same-ID immutability and non-destructive retention, using their existing table rather than a new event family. **This is a deliberate strengthening, not a description of current SQLite behavior:** practice rows currently are deleted/reinserted. Retaining existing learner history locally does not authorize new data collection, remote copies, indefinite retention of new data classes, or an erasure feature. No existing human-approved purge rule was found in the named governing documents. If review identifies such a rule, stop and reconcile it; do not silently replace it with this design.

| Alternative | Reason not selected / cost of changing later |
| --- | --- |
| Fix only array-index deletion | Fails durable review replay; an omitted review returns on reopen. |
| Delete or rewrite immutable event rows on Replace-all | Violates append-only review retention; requires a different destructive/retention policy and approval. |
| Keep all history active; rename replacement as partial replacement | Does not provide the agreed active-dataset result and contaminates active progress/export. |
| Disable Replace-all | Safe temporary containment if needed, but not completion of `lt-04i`. Would require explicit acceptance revisions for `lt-04i`, `lt-7lq`, `lt-2t4`, `lt-3kk`, and the candidate presented to `lt-4ct`, plus parent review and human approval if narrowing the agreed product. Not selected here. |
| Whole-dataset generations / archive every prior snapshot | Supports richer undo/history but requires namespaced identities, much larger retention, and new recovery UX. Not needed for active/audit separation. Revisit only for an independently authorized recovery use case. |
| Active IDs only inside the JSON snapshot | Fewer tables, but makes the redundant snapshot blob the sole active-history index and gives ordinary snapshot omission ambiguous destructive meaning. Explicit membership plus a restore-only replacement operation has clearer corruption and transaction boundaries. |

## 2. Source trace and observed evidence

All line references below are to the baseline above. `SOURCE-CONFIRMED` denotes source inspection; `EXECUTED` denotes this decision task's synthetic execution; historical observations are identified separately.

| Boundary | Evidence and consequence |
| --- | --- |
| Existing promise and constraints | `DECISIONS.md:55–79`: metadata-first, merge/replace, semantic integrity, synthetic stores only. `docs/review/plan-review-2026-10-10.md:23–39,73–88,190–195`: R1/R5 identify restore/replay and migration contradictions; R6 distinguishes learner export from complete backup. |
| Export contents | `packages/storage/src/exportRestoreService.ts:37–69`: exports only the six learner collections plus source contexts; enriches occurrences **and practice attempts** from current track metadata. It does not export a complete library, jobs or policies. |
| In-memory replacement/merge | Same file `:97–156`: preview takes active snapshot, replacement enumerates array indices using `Object.keys`, removers expect IDs, then imports append unconditionally. `packages/storage/src/localStore.ts:23–39,61–78,93–124,247–267,313–336`: no separate audit or transactional restore; shallow copies, push-based history, ID-based removals. |
| Preview and validation | `packages/domain/src/exportManifest.ts:529–557,589–648`: generic comparison reports differing events as `updated`; no audit-only conflict view. `:361–408,425–496`: practice encoder/decoder and integrity paths require actual serialized-history tests, not only direct service calls. |
| Existing SQLite schema | `packages/storage/src/sqliteLocalPersistence.ts:218–244,606–648`: v5 creates review/practice tables, v7 is latest on this baseline. IDs are table primary keys, not dataset-scoped IDs. No active-history membership exists. |
| Replay versus projection | Same file `:1291–1395`: review rows are compared by immutable payload, but practice rows are deleted and reinserted. `:1505–1514`: load overwrites JSON review/import-job event arrays with **all** table rows; practice loads from snapshot JSON. |
| Transaction and upgrade | Same file `:666–703`: per-migration transaction/checksum ledger, no historical backfill. `:1517–1540`: one snapshot/projection SQL transaction already exists and must be retained. `:567–578`: review comparison treats embedded state JSON strings as exact strings. |
| Service/browser durability | `apps/local-service/src/server.ts:959–968`: unversioned GET/PUT whole snapshot. `apps/web/src/model.ts:254–311,3007–3045`: fire-and-forget autosave; restore receipt uses preview counts before durable acknowledgement. |
| Existing replay assertions | `tests/core/localPersistence.test.ts:473–565`: saving an empty review array retains the original review and replays it; repeated save is idempotent; changed payload rejected. `:569–661`: same invariants for import-job events. These retention assertions are deliberate and must not be removed merely to obtain a green replacement test. |
| Existing migration/restore gaps | `tests/core/localPersistence.test.ts:93–196` covers new DB/current ledger, not populated historical upgrade. `tests/core/p6PracticeExport.test.ts:217–254,306–361,432–481` checks direct restore/card identity, preview, and item/occurrence replacement, not serialized linked practice + durable replacement/reopen. UI receipts in `tests/web/frontendUi.test.ts:760–871` do not establish committed SQLite state. |

### Executed for this document

On Node `v26.7.0`, from the decision worktree:

```text
npm test -- --run tests/core/localPersistence.test.ts tests/core/p6PracticeExport.test.ts
2 files passed; 31 tests passed; exit 0
```

A scratch-only probe, `lt-xnu-restore-probe.mjs` under Hermes's configured scratch directory, loaded actual worktree modules with installed Vite in middleware mode; no listening app server, installation, real DB, provider or private media was used. It exercised synthetic repository fixture context and SQLite `:memory:`. Assertions passed for these **defective observations**, not for the proposed design:

| Probe | Actual result |
| --- | --- |
| Direct repeat import of identical populated manifest | Review events 1 → 2; practice attempts 1 → 2. |
| Direct empty replacement after that import | Saved items 0; review events 2; practice attempts 2. |
| Save original snapshot, then omit both history arrays | Loaded review events 1; loaded practice attempts 0; practice SQL rows 0. |
| Serialize/parse/validate the export containing FSRS-linked practice | `Export integrity check failed: manifest content does not match integrity root hash`. |

The last observation is an additional acceptance dependency, not a reason to weaken integrity. Source explains a concrete mismatch: `buildLearnerExportContent` preserves nested `eventLink`, whereas `validatePracticeAttempt` reads `eventLink_reviewEventId` and may leave the required `eventLink` absent. Source-context enrichment can also make an exported same-ID practice payload differ from its original stored payload. `lt-3xg`/`lt-7lq` must include lossless serialized linked-practice roundtrip before claiming idempotent restore. Direct in-memory manifest calls alone miss this boundary.

These probes did not exercise populated migration, new membership semantics, file-backed reopen or browser durable restore; those remain implementation acceptance below.

## 3. Exact data and identity contract

### 3.1 Active learner data

- **Mutable collections:** saved items, saved occurrences, review cards, review-card states. Merge retains local-only records and applies confirmed imported records by ID (`cardId` for state). Replace retains exactly imported records. Existing domain/source-anchor validation still applies; imported records cannot silently rebind retained card/occurrence identities to a different source. Conflicting identity anchors must be rejected, not treated as an editable note.
- **History:** active review/practice ID sets select immutable payloads in the audit stores. Merge unions selected IDs; replace selects exactly imported IDs. Arrays are unique by collection + ID, deterministically ordered by `reviewedAt`, `createdAt`, then `id`. The same textual ID in different history collections is not itself a collision.
- FSRS state comes from the resulting review-card-state records, as today. “Replay” here means selecting/materializing history rows, **not** rerunning FSRS transitions. Do not reconstruct imported state from every retained audit event or rerate imported practice.
- Stats, card-history views, practice history, list methods used by learning, and normal learner export consume **active** records only. A retained event with the same card ID does not become active merely because that card exists again.
- Media assets/observations, subtitle tracks/cues/word timings, import jobs/events, export jobs, provider policies, playback handles and actual files are **outside** this restore's replace scope. Preserve their state. Missing source media/tracks are a visible limitation, not grounds to invent media or rewrite source anchors.
- Source-context entries in the manifest are supporting records for decoding learner records, not an independent active library or a separate “restored media” count.

### 3.2 Retained audit

- Reuse `review_event`; preserve existing immutable payload comparison. Promote `practice_attempt` to the same insert-or-identical contract. Never delete/reinsert it as a current-snapshot projection after migration.
- Audit payloads are the union of already-retained payloads and successfully committed new history. A restore cannot replace, prune or rewrite that union. An omitted ID only loses **active membership** in explicit replacement.
- Add two membership tables, conceptually `active_review_event(event_id PRIMARY KEY)` and `active_practice_attempt(attempt_id PRIMARY KEY)`. References must resolve to the corresponding audit row; enforce this with foreign keys enabled on the connection or equivalent transaction validation. No cascading deletion of audit payloads from card/occurrence deletion.
- Add one versioned active/audit storage marker and reuse the save-conflict revision metadata from `lt-8hh`; do not invent a competing revision counter. Empty initialized membership is valid and must remain empty on reopen. Missing/uninitialized membership in an upgraded store is an error, not “activate everything.”
- Add explicit audit read methods for diagnostics/tests, e.g. `listAuditReviewEvents` / `listAuditPracticeAttempts`; ordinary learner-facing methods and `loadSnapshot().reviewEvents/practiceAttempts` mean active history. No new learner-facing audit browser is required.
- LocalStore must retain the same separation in session memory. Its active arrays cannot be its only history storage. Use a typed, versioned `learnerAudit` section in the internal snapshot/transport containing retained review/practice payloads, separate from active arrays. This section is **not** added to the v1 learner-export content. SQL rows are authoritative for durable audit; incoming audit payloads can add identical/new rows, never delete or rewrite rows.
- Hydration explicitly supplies active state and audit. Generic `replaceSnapshot`/normalization must not erase the audit, treat absent new fields as permission to purge, or silently accept an unsupported internal format. New session construction is distinct from replacing an existing store. In-memory staging must not mutate nested live objects through the current shallow clone.
- Audit retention is **not full undo**: old mutable items/card states need not be archived, so a retained review may refer to an inactive/missing card. Keep its IDs and original state JSON; do not fabricate historical parent objects. Consistent DB backup, not this row archive or the learner export, is the full-state recovery mechanism.

### 3.3 Identity, equality and integrity

Preflight all records before mutation, including audit-only IDs and within-file duplicates:

| Imported immutable record | Result in merge and replace |
| --- | --- |
| New ID, valid payload | Append once to audit; select as active. |
| Active ID, identical payload | No append/rewrite; count as skipped-identical. |
| Audit-only ID, identical payload | No append/rewrite; count as reactivated. |
| Existing ID, different payload (active or audit-only) | Reject the **entire** restore as an immutable-history conflict, even in replace mode. No last-write-wins and no generated replacement ID. |
| Repeated same ID within manifest, identical payload | Verify file integrity first, then coalesce once; report duplicate-input count separately. |
| Repeated same ID within manifest, different payload | Reject before mutation. Apply the same duplicate-key ambiguity rule to mutable collections. |

Use one domain equality definition in planner, LocalStore and SQLite. Review equality must keep the existing fields and exact `previousStateJson`/`nextStateJson` strings; optional fields are normalized consistently to absence before comparison. Practice equality covers **every** domain field: ID, card ID, mode/result, answers, response time, source context, reviewed/created times and review-event link. Compare structured source context/link canonically by keys (array order preserved); do not ignore changed provenance, answers or event links. Validate types rather than coercing nulls, unknown fields or malformed IDs into plausible values.

Validate the serialized manifest schema and semantic integrity at the restore entry boundary, not just in the UI. Direct programmatic restore must not bypass validation. Resolve source-context references losslessly; build the context dictionary from occurrences **and** attempts. Preserve nested practice links through serialization/validation (legacy supported wire spellings may have an explicit decoder; contradictory spellings must fail). Stop enriching an existing immutable attempt's payload from mutable/current track metadata at export time. Emit its captured context unchanged; any additional presentation-only context must not masquerade as a replacement immutable payload.

If an old v1 artifact genuinely contains a conflicting enriched payload, reject it with a precise conflict/compatibility error. Do not excuse it by ignoring provenance or recomputing a supplied integrity hash. Support valid existing v1 files without adding audit data or changing the meaning of their integrity fields. `manifest_sha256` stays semantic integrity, never a physical-file/durable-save guarantee.

For new imports, validate learner references against the resulting active dataset: occurrence → item; card → item/occurrence with consistent ownership; state/review/practice → card; linked attempt → active review of the same card. Missing external media/cue versions may remain unresolved with warnings because v1 is a learner subset. Existing legacy audit orphans remain retained; migration is not authorization to delete them. Historical active inconsistencies discovered during migration are reported, not silently repaired; a later import must not create new dangling references.

## 4. Operations and transaction boundary

### 4.1 Ordinary saves versus restore

**Do not redefine an ordinary empty history array as a destructive replacement.** Ordinary saves append new history and retain previously active history; they neither deactivate membership nor reactivate already-inactive audit IDs by accident. Explicit restore is the operation that may reactivate an audit-only ID. A normal save attempting to introduce an inactive audit ID into active history must fail with “explicit restore required.” Revision guards reject stale clients before this point.

Consequently, the existing test that saves `reviewEvents: []` and still loads the original active event remains meaningful. Extend it to practice. Separately test an explicit Replace-active operation whose empty membership survives ordinary subsequent saves and reopen. Do not change the retention test into a deletion test.

`saveSnapshot` remains the ordinary save path. Introduce an explicit `commitRestore` persistence operation (or equivalent typed operation branch sharing the same transaction implementation); callers must not disguise replacement as a routine snapshot omission. Normalized snapshot JSON must be written from the **resulting authoritative active/audit state**, not blindly from a submitted truncated array.

### 4.2 Plan and commit

One shared pure planner produces the proposed active snapshot, audit additions, selected history IDs, per-collection counts, warnings and conflicts from `(validated manifest, mode, active state, audit state)`. Preview and commit share that policy; a preview is not permission to skip revalidation.

For durable restore, the service is authoritative:

1. Browser captures manifest, selected mode and local edit generation; obtain a service-backed dry run at an expected durable revision. Confirm required warnings locally generated from actual mode/data classes, even if the manifest's warning list is incomplete. Exactly one restore mode must be selected.
2. Resolve dirty browser state explicitly; do not silently discard it or merge it into the restore transaction. Drain/serialize pending saves. Invalidate old previews if manifest, mode, local edits or service revision changes. Disable local learner mutation during commit, or reject a mismatched edit generation before applying its result.
3. Send an explicit restore operation with validated input, confirmations and expected revision, not a pre-mutated snapshot with no intent. A bounded local restore preview/commit API may be added under the request-authenticity policy defined by `lt-9zj` and enforced by `lt-sor`; it must not bypass that policy.
4. Inside one `BEGIN IMMEDIATE` transaction, recheck expected revision, current audit conflicts and the complete candidate. Append new immutable rows; update learner projections; update active membership (union for merge, exact for replace); preserve unrelated snapshot collections; write normalized active/audit snapshot and next revision. Perform deterministic readback/count reconciliation in the transaction, then commit. Any error rolls back **all** of these writes.
5. Return the committed revision, authoritative active state and result-derived receipt. Only after acknowledged success does the browser swap its live state and clear review/practice selections, answers/results and cached restore preview that refer to old learner records. Avoid changing unrelated player/library state.
6. Readback must agree with the committed revision before displaying a verified-durable result. Qualification additionally closes/reopens a file-backed synthetic DB. If connection loss makes commit outcome unknown, show **“restore outcome unknown; reconnect/read back before retry”**, not “rolled back” or success. Keep the manifest and before-state locally; reconcile revision plus intended active result before retry. Never automatically issue a second destructive operation against a new revision.

The existing SQL transaction is a useful base, but browser mutation followed by an unawaited PUT is not an end-to-end transaction. All save callers, including jobs and other tabs, must use the same `lt-8hh` revision policy so an older snapshot cannot resurrect removed learner records or active membership. This is a bounded local stale-write rule, not cloud conflict resolution.

### 4.3 Session-only restore

Without a service, run the same planner against the LocalStore active/audit state and install one validated candidate atomically. Preserve audit in session memory and clearly label the result **session-only / not durably saved**. It must not claim SQLite retention across closing the page.

A session replacement is retained as explicit pending restore intent, not silently reduced to a normal snapshot save. Later Save/Connect must obtain a new durable preview, handle dirty/conflicting state and commit the explicit operation against the service revision; include locally retained audit additions in the conflict-checked staging envelope. Do not lose session audit simply because default export excludes it. Never automatically hydrate over dirty browser work. This preserves browser-only use without pretending it supplies durable recovery.

## 5. Forward migration and compatibility

Allocate the next available forward migration after integration with `lt-f5h` (baseline latest is v7; do not hard-code a competing v8 in parallel work). Never edit v1–v7 SQL or their recorded checksums.

Migration requirements for `lt-3f1` and the retention implementation:

1. Check the entire existing ledger and supported schema before applying new writes. Reject a future schema, changed historical checksum, unknown internal active/audit format or corrupt snapshot; do not normalize corruption into an empty successful database. Back up an existing database consistently before a separately authorized real upgrade.
2. Read raw legacy snapshot history **before** current load logic can replace it with empty event tables. Merge identical IDs from raw JSON and existing review/practice tables; append missing payloads once. Conflicting same-ID historical payloads fail closed with a redacted collection/ID diagnostic, leaving source evidence intact. Do not choose table versus blob silently.
3. Seed initial active membership conservatively: every legacy review row visible under old replay, plus valid snapshot-only review rows; practice rows from the identical/compatible union of legacy snapshot and table. All are retained in audit. Legacy state has no trustworthy prior replacement marker, so do not guess that an omitted review should become inactive. Report recovered snapshot-only or table-only records. A pre-upgrade replacement that was already wrong cannot be retroactively inferred; the user can run a new explicit replacement after qualification.
4. Preserve/backfill legacy snapshot-only import-job events through their existing append-only contract; this restore does not give them active membership or place them in learner exports. Unrelated import-job replay tests remain unchanged.
5. Create/populate membership, preserve practice payloads while converting its save behavior, write the initialized format marker and normalized snapshot, and record migration success atomically with the data migration. A failure must not leave an “applied” marker with empty membership. Earlier successfully applied migrations may remain; rerunning after correcting the diagnosed blocker is forward-only and idempotent.
6. Fresh empty DB: initialize empty audit/membership without fabricating a user snapshot. Populated historical DB: preserve all IDs, source anchors, review state and unrelated collections. Reopen must not rerun legacy backfill or repopulate intentionally empty active membership.
7. Coordinate practice-table rebuilding for mode CHECK repair with `lt-f5h`: keep all old payloads and indexes, allow every supported mode, and test failure rollback. Do not patch historical v5 SQL to achieve this.

Old binaries are **not** supported against upgraded files: baseline code does not refuse future migrations and replays all review rows; an old writer can also delete/rewrite practice rows. No in-place downgrade is safe. Stop the service and open an isolated, verified **pre-upgrade backup copy** with the old binary, keeping the upgraded DB and its later writes intact. New code must refuse future schemas; this cannot retrofit protection into already shipped old code. State this in recovery instructions rather than promising downgrade compatibility.

Full-state backup must use a consistent SQLite backup mechanism or a stopped/closed database after successful checkpoint; copying a live main `.sqlite` file while ignoring WAL is not evidence of consistency. Verify a restored copy by opening it and comparing active records, audit rows, revisions/markers and unrelated collections. This is a recipe and synthetic acceptance requirement here, not authority to inspect/copy/restore a real learner database. Learner JSON intentionally lacks inactive audit and the full library, and is not a substitute.

## 6. Honest preview and receipts

Preview and receipt must distinguish these independent facts:

- **Scope/mode:** learner-state merge versus replace-active; list the six collections and non-replaced library/config collections. Replace warning: “Removes current active learner records not in this file. Prior review/practice history is retained locally as inactive audit. This does not erase private data.” Explain that old mutable state is not a complete undo archive.
- **Integrity:** manifest schema and semantic hash verified; not “full backup verified” or “file hash verified.” Keep physical file readback as its existing separate UI fact.
- **Active effects:** per collection added, mutable-updated, skipped-identical, removed-from-active; immutable history also reactivated. Immutable-updated is impossible. Show active-after counts. Identical duplicate input entries have a separate coalesced count; do not count them as multiple restored records.
- **Audit effects:** newly appended, total retained, and inactive-after counts per history collection. Inactive-after is not the same as newly deactivated. Nothing is “deleted from audit.” Context dictionary entries are supporting data, not events.
- **Durability:** preview-only, pending, session-only, durable-committed/readback-verified, failed-before-commit, or outcome-unknown. Actual operation/result determines counts, not an old preview. A stale preview must be refreshed and confirmed again.
- **Privacy/recovery:** no media copied; missing source playback remains unresolved; inactive audit is not in normal learner export; data remains local and sensitive.

A rejected conflict/invalid manifest/failed transaction produces no success receipt and no active/audit/revision mutation. Keep input available for diagnosis/retry; do not clear it on a caught save failure. Do not log raw notes, answers, cue text, source paths or event payloads to explain a conflict.

## 7. Finite synthetic acceptance matrix

Implement focused regressions in the existing core persistence/export suites and web sync/receipt suites. Use explicit small deterministic fixtures with disjoint IDs and fixed timestamps. Persist/reopen tests use only a test-owned file under the configured scratch/test root. Providers remain disabled; no model/download/media-library operations. Cases are required behaviors, not tests claimed to exist today.

| Case | Required assertions |
| --- | --- |
| T01 — serialized idempotent merge | Saved item/occurrence/card/state, review and linked practice survive export → stringify → parse → validate → merge twice → save → reopen, including exact source context/event link. Active/audit counts and payloads are unchanged on second import; no rerating. |
| T02 — duplicate-input IDs | Identical duplicates coalesce after integrity verification; conflicting duplicates reject the entire candidate. Include duplicate mutable IDs, practice-only and review-only conflicts, and both modes. |
| T03 — existing immutable conflict | Active and audit-only same-ID/different-payload reviews and attempts reject before mutation in both modes. Seed unrelated records first; compare their full before/after state too. |
| T04 — empty replacement | Populated active/audit state → confirmed empty replacement → commit → ordinary save → close/reopen: six active collections empty, original history payloads retained byte-for-byte/field-for-field, unrelated library/jobs/policy unchanged. |
| T05 — nonempty replacement/reactivation | Import a subset plus new and audit-only-identical history. Active records exactly equal decoded manifest, new audit appended once, excluded history still retained, repeated replacement idempotent. Same card ID must not revive unselected old events. |
| T06 — ordinary omission | Ordinary save omitting active history preserves it (existing review replay case plus practice); omitted inactive history remains inactive. Normal save cannot reactivate audit-only IDs; explicit restore can. Import-job append-only tests retain their original meaning. |
| T07 — active consumers/export | After T04/T05, progress, review/practice lists, due-card workflow and re-export contain only active learner records. Raw audit inspection shows retained originals. Fresh-app import does not claim to recreate media/library/jobs. |
| T08 — atomic rollback | Inject failures after audit insertion, membership modification, projection/snapshot write, and before commit. Compare active state, complete audit, unrelated tables and revision with before-state; reopen confirms rollback. Same test for a late conflicting record following valid records. |
| T09 — acknowledgements and stale writers | Failed save, changed manifest/mode, stale durable revision, out-of-order autosave and second tab cannot display success or mutate membership. A prior browser snapshot cannot resurrect replaced records. Simulate lost response after commit and reconcile by readback without a second blind replace. |
| T10 — session path | LocalStore staging does not mutate original nested objects; rejected plan leaves all state unchanged. Session replacement keeps audit and labels non-durability; later connection requires explicit fresh durable restore intent rather than ordinary truncated snapshot PUT. |
| T11 — legacy populated upgrade | Separate synthetic pre-v5 snapshot-only and v5/v7 mixed/table-backed fixtures. Include reviews, linked and unlinked attempts, import-job events, state and source anchors. Backfill once, preserve IDs/contents, seed membership conservatively, and reopen twice. |
| T12 — bad/failed upgrade | Same-ID conflicting legacy payload, corrupt snapshot, checksum mismatch and future schema fail visibly without silent loss. Inject new-migration failure before ledger success; verify no partial initialized marker/backfill and a valid forward retry. |
| T13 — backup/recovery and downgrade boundary | Consistent populated synthetic backup opens independently with equal active/audit/metadata; old-version recovery is only against pre-upgrade copy. New client/server capability mismatch refuses restore rather than falling back to unsafe PUT. |
| T14 — practice/schema and privacy | All supported practice modes survive retained-audit migration and restore/reopen after `lt-f5h`. Export/restore makes no provider calls, changes no policy, copies no media and emits no raw sensitive payload diagnostics. |

References to “same state” above mean exact IDs and payloads as well as counts. Reopening the same in-memory object is not a file-backed restart test. Historical defect-observation probes must not be preserved as correctness expectations once the regressions are repaired.

## 8. Downstream ownership, blockers and review checkpoint

This is the precise handoff, not a second status tracker:

| Existing issue | Required implementation/qualification consequence |
| --- | --- |
| `lt-3xg` | Shared validation/planner, immutable equality and duplicate handling; lossless serialized linked practice; memory atomicity; result-based receipt shape and durable failure semantics. |
| `lt-04i` | Active membership/audit separation across LocalStore and SQLite; explicit replace operation; consumer filtering; no omitted-event resurrection on save/reopen. Its original working-replacement acceptance is unchanged. |
| `lt-8hh` | One revision contract for ordinary saves and restore, dirty connect, out-of-order writes, browser operation serialization and outcome-unknown handling. Durable replace cannot be qualified without this integration. |
| `lt-f5h` | Supported practice modes and forward table migration coordinated with retained practice audit. |
| `lt-3f1` | Populated legacy raw-snapshot backfill, migration/marker atomicity, future-schema refusal, consistent backup and synthetic recovery. |
| `lt-7lq` | Active-only learner export, context/link roundtrip, exact exclusions, fresh-app missing-source behavior, corrected UI/runbook copy. No broader media/full-metadata format. |
| `lt-2t4` | Integrated synthetic restore, migration, request-safety and save-conflict qualification with exact active/audit readback. |
| `lt-3kk` / `lt-4ct` | Qualified daily-driver journey includes working durable replace and truthful receipt; human accepts that exact candidate, not this document. |

Parent should coordinate ordering/dependencies of the restore, migration and revision branches before implementation; this document does not edit Beads or claim their work complete. No genuine human-scope blocker was found for this non-destructive local design. The additional serialized-practice defect, Windows file-path baseline limitation, shared migration-number allocation, and revision integration are **technical dependencies**, not authority to weaken acceptance. File-backed Windows tests wait for the existing portability repair rather than bypassing its path policy.

Escalate if implementation requires deleting audit, changing a human retention rule, broad new dataset-history/undo architecture, disabling replacement as the final product, real-state access, private-media discovery, remote/provider use or deployment. Do not escalate routine choice of helper names or SQL indexes.

Independent review requested before implementation:

1. Accept active-only replacement with immutable retained review **and practice** payloads, and the explicit non-erasure/non-undo disclosure?
2. Accept explicit membership plus restore-only replacement, preserving ordinary omission/replay tests and source identities?
3. Accept the shared revision/transaction and migration/recovery gates as mandatory downstream acceptance, including serialized linked-practice roundtrip?

Only this contract is added to the repository by the decision task. No application implementation, historical migration/test edits, commits, pushes, bead writes/closure or real-state actions are included.
