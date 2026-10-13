# lt-04i core durable replacement — first-stage result

## Outcome and boundaries

Core active/audit replacement is implemented and exercised. **lt-04i is not complete:** frontend integration is deliberately excluded from this stage, and the full suite currently fails at that boundary. No commit, push, Beads closure, main merge, deployment, real learner database, provider/model operation, or Windows qualification continuation was performed. Parent owns independent two-stage review/publication. No independent review correction cycle has been consumed.

Candidate baseline: `efbc05a91e0f6cba86ded027b90ee7fbc69baac1`, branch `work/lt-04i-durable-replace`, assigned worktree `.worktrees/lt-04i-durable-replace`.

Contributor candidate: `lingotorte-lt04i:core6`, image ID `sha256:60e7199fcd0dda8716865d28188f06e6933be235aa27a0d8f4cae252faf08e02`. Owned executable/test source manifest SHA-256: `824473fa33f1f0161a60fdefe68e530fd97cffce23144de0272f568ef153ddaf`. All eleven owned source/test file hashes were read from `/app` inside this image and matched the worktree. This result document is not an executable image input.

## Implemented policy

- Internal `LocalStoreSnapshot.learnerAudit` is versioned (`version: 1`) and carries retained review/practice payloads. Its type is optional for legacy/session input compatibility; current normalized snapshots always supply it. Unknown formats, malformed history payloads, and immutable conflicts reject rather than being coerced. Ordinary learner export remains the six active collections only.
- LocalStore construction/hydration seeds/reads audit explicitly. Generic replacement retains audit rather than purging it. Session restore installs a detached candidate and retains explicit pending manifest/mode intent. Ordinary history additions cannot reactivate an inactive retained ID. Audit diagnostics are separate from active consumers.
- SQLite v9 adds `active_review_event`, `active_practice_attempt`, and the initialized `learner_audit_format` marker. Membership references immutable rows, foreign keys are enabled, and no card/occurrence cascade deletes audit. Practice is now append-only just like review. v1–v8 SQL definitions were compared against baseline and are byte-for-byte unchanged.
- Migration preflights the complete known ledger/prefix and schema version, rejects future/changed definitions, and performs v9 raw-snapshot/table union, immutable conflict detection, membership population, marker initialization, import-job-event backfill, normalized snapshot, and ledger success in one transaction. Recovery counts and historical orphan/link counts are exposed as `status().learnerAuditRecovery`; payloads are not logged. Missing initialized membership is an error, not permission to activate all audit again.
- `saveSnapshot` retains previously active review **and** practice records when omitted. Incoming audit may add identical/new retained rows but cannot rewrite or delete old ones. An ordinary save cannot reactivate an inactive audit ID. Snapshots are persisted from resulting authoritative active/audit state.
- `previewRestore` and `commitRestore` use the shared planner/equality and existing content-revision CAS policy, not a new revision counter. Commit rechecks revision/input/conflicts/confirmations inside `BEGIN IMMEDIATE`, appends audit, sets exact replacement membership or merged membership, updates projections/snapshot, reconciles authoritative readback, and commits atomically. Unrelated library, import/export jobs and provider policies are retained.
- Upgraded snapshot reads reject corrupt JSON/collections, missing audit, and unsupported snapshot/audit versions. Failed initialization closes its SQLite connection.

## API for frontend integration

All routes run through the existing common admission gate, including exact authority/origin, bearer capability, bounded JSON envelope, and method/body rules. No second authentication bypass was added.

`GET /api/state` returns existing `{ ok, snapshot, revision }` plus `restoreCapability: "active-audit-restore-v1"`. Absence/mismatch must refuse durable restore; never fall back to PUT.

`POST /api/restore/preview` body:

```ts
{
  manifest: capturedOriginalWireManifest,
  mode: 'merge' | 'replace-active',
  expectedRevision: 'sha256:...',
  learnerAudit?: { version: 1, reviewEvents: [...], practiceAttempts: [...] }
}
```

It returns `{ ok: true, revision, capability: "active-audit-restore-v1", preview }`. The optional staging audit supports later durable commit of session-retained history; it participates in immutable conflict checks but does not activate unselected records. Preview has no writes.

`POST /api/restore/commit` uses the same fields plus:

```ts
confirmation: {
  confirmedAt: '...',
  confirmOverwrite: mode === 'merge',
  confirmReplace: mode === 'replace-active',
  acknowledgedWarnings: preview.warnings.map(w => w.kind)
}
```

It returns `{ ok: true, snapshot, revision, capability, receipt }`. Receipt contains `mode`, per-collection `effects`, `auditEffects`, `coalesced`, `integrity: "semantic-hash-verified"`, `durability: "durable-committed/readback-verified"`, and `durablySaved: true`. **Render receipt counts from `receipt.effects`/`receipt.auditEffects`; preview's older `operations`/`details` are not the authoritative removal/reactivation receipt.** History has no updated payload count. Audit appended counts include new staged session rows.

Missing revision is HTTP 428, stale revision 409, invalid input/conflict/confirmation 400 (redacted), transaction failure 500 with failed-before-commit copy. Transport loss is not a rollback acknowledgement. Reposting against the stale pre-commit revision is rejected if the first operation changed durable content; the client must still never blindly retry against a newly read revision.

Storage exports `LearnerAudit`, `RestoreMode`, and `RestoreAudit` types without importing Node/SQLite into the browser bundle. Backend direct operation request type is `DurableRestoreRequest` in the SQLite module.

## Exact remaining frontend work

1. Fix `snapshotHasDurableContent` in `apps/web/src/model.ts`: it currently counts `{ version: 1, reviewEvents: [], practiceAttempts: [] }` as nonempty merely because the audit object has keys. Inspect actual history arrays (and pending restore intent), not audit metadata. This is the concrete trigger behind the fourteen current web-suite failures.
2. Negotiate the restore capability, capture original wire manifest/mode/local edit generation/audit envelope, obtain authoritative service preview at the connected durable revision, and render its effects/audit disclosures. Invalidate preview if any captured input, local generation, or service revision changes. Require exactly one mode and every locally/service-required warning.
3. Resolve dirty browser state explicitly. Preserve local before-state, retained audit, and pending intent during connect choices; do not silently hydrate over browser work. Generic `replaceSnapshot` preserves local audit intentionally, so after applying authoritative remote state the baseline must correspond to the actually installed state, not an assumed raw remote serialization. Any explicit discard decision must account for retained session audit/intent rather than dropping it accidentally.
4. Serialize preview/commit with the existing owner-bound ordinary-save/job/autosave queue. Drain earlier operations and use their acknowledged revision; prevent learner edits during commit or reject the captured generation before installing the acknowledgement. Fence all awaited results against owner/transport/session replacement. An old queued PUT must not follow restore with the old learner snapshot.
5. Do not mutate live learner state before durable commit succeeds. On valid acknowledgement, install returned active/audit snapshot, advance revision/baseline, clear pending intent, invalidate old restore preview and clear only stale review/practice selections/answers/results. Preserve unrelated player/library state. Obtain `/api/state` readback and match revision/result before displaying client-verified durability.
6. On lost/invalid acknowledgement or lost readback, retain input/before-state and report **“restore outcome unknown; reconnect/read back before retry”**. Reconcile durable revision plus intended active result; never claim rollback or automatically send a second replacement against a fresh revision. Explicit HTTP rejection is separate from transport-unknown outcome.
7. Session-only restore continues through `RestoreService` with the same planner. Keep `snapshotPendingRestoreIntent()` plus versioned snapshot audit until acknowledged explicit durable restore. Later Save/Connect must acquire a fresh preview/revision, resolve local edits/conflicts and submit that intent/audit staging envelope, not ordinary snapshot PUT. Changed learner edits since a pending session restore need an explicit resolution, not silently restoring the older intent.
8. Add/repair web sync/receipt/UI regressions for dirty empty audit, queue ordering, stale writers, capability mismatch, owner supersession, failed/unknown acknowledgement, readback reconciliation and session-to-durable intent. Then rerun the whole suite on the integrated candidate. No frontend file or shared web test was changed here.

## Real verification results

All executable checks ran in the candidate-owned Docker contributor image, with `--network none`, container-local `/scratch`, `TMPDIR=/scratch`, providers disabled, no host installs and no user-home/media/credential/Docker-socket mount.

Raw receipts are under `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-04i/`:

- `red2.log`: before production edits, 3/3 failing for missing audit hydration, absent durable preview API, and omitted-practice loss. `red.log` is separately preserved as an earlier fixture-setup failure (missing approved track), **not** regression proof.
- `core6-focused.json`: **98 passed**, 0 failed/skipped: durableReplace 23, localPersistence 16, practiceSqliteMigration 9, restorePlanner 50; exit 0.
- `core6-all.json`: **1,198 passed, 14 failed, 1 skipped, 1,213 total**; exit 1. All fourteen failures are in excluded frontend integration suites: frontendUi (1), localServiceSync (4), saveSafety (7), saveSafetyUi (2). The skip is the separate actual Docker tmpfs receiver qualification in privateDelivery; this run did not claim that qualification.
- `core6.log`: typecheck exit 0; Vite build exit 0; no-network suite 5 passed/exit 0; privacy scan `ok: true`, 60 runtime files/exit 0.
- `core6-source.json`, `core6-image-source.json`, `core6-image-id.txt`: baseline/per-file/aggregate/image binding and verified source equality. `core6-container-state.json`: actual bounded process outcome; test exits are reported individually, not inferred from the wrapper's exit.
- `build-core6.log`: candidate build receipt. Named result container was removed after raw JSON/state extraction. `git diff --check` passed.

The focused execution covers empty replacement -> ordinary save -> file-backed close/reopen, exact retained review/practice payloads, all five practice modes with serialized provenance/link reactivation, nonempty replacement/idempotence, active-only consumers/export, ordinary omission, audit-only conflicts in both modes, stale restore/PUT writers, session audit staging, real admitted/denied HTTP restore, corrupt/future formats, minimal v8 backfill/retry, and rollback comparison of **every database table** plus snapshot/revision before and after reopen. Trigger failures cover audit insertion, post-audit membership, post-membership projection, and snapshot update.

No-network tests establish their exercised intercepted flows; Docker network isolation separately prevents external container egress. Privacy scan checks runtime reference-product markers, not a comprehensive secrets/security proof. Full historical upgrade/backup qualification remains `lt-3f1`; integrated T01–T14 remains `lt-2t4`. The minimal valid v8 fixture and adjusted practice-mode regression are not a waiver or a claim that the historical matrix is complete.

## Owned files

New: `packages/storage/src/learnerAudit.ts`, `tests/core/durableReplace.test.ts`, this document.

Modified: `packages/storage/src/{index,localStore,restorePlanner,sqliteLocalPersistence}.ts`, `packages/domain/src/exportManifest.ts`, `apps/local-service/src/{requestAdmission,server}.ts`, `tests/core/{localPersistence,practiceSqliteMigration}.test.ts`.

Existing core test updates reflect v9, earlier validation rejection, and normalized audit snapshots. The practice migration's former `{synthetic:true}` context was not a valid domain payload; its row fixture now supplies a valid synthetic source context while preserving independently frozen historical SQL/checksum assertions, exact projection columns, and rollback assertions.

## Deviations

- Implementation notes are recorded in this approved result document rather than modifying the unrelated root notes file.
- Full green verification is deliberately deferred to frontend integration; no web edits were made to hide the observed failures.

## Discovered edge cases

- Empty versioned audit is metadata, not dirty learner content.
- Missing audit/membership after upgrade must not revive old history on reopen.
- SQL projection-only rollback must be checked against tables, not just blob-backed `loadSnapshot()`.
- Test-owned malformed historic context and SQL-invalid input now fail the shared domain preflight before SQL CHECK evaluation.
- Named Docker containers must retain machine-readable reports until extraction; `--rm` with guest-only JSON loses the detailed result.

## Questions for review

Parent must review core policy/implementation and frontend integration separately. No retention-rule change, audit deletion, new undo architecture, disabled final Replace-all, or broader authority is proposed.

Notes summary: 2 deviations; frontend integration is the one pending revisit; 5 edge cases; read the API/frontend handoff first; qualification/closure remains with parent and the named downstream issues.
