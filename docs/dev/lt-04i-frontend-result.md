# lt-04i frontend integration — contributor result

## Review correction cycle 1 — current candidate

Supersedes the historical `frontend6` candidate below. Independent SPEC `deleg_4c2ddcfe/task1` reproduced reconnect hydrating a committed SQLite result while its HTTP acknowledgement was still held. **One of the maximum three total review-driven correction cycles is consumed; the budget is not reset.** Ready for independent re-SPEC, not publication or closure.

- Image: `lingotorte-lt04i:review1`; exact ID `sha256:1225dded51a0935dfa8ba7a0649f836de761a3d4eda9e851251cf7609759b0af`.
- Six-file frontend aggregate SHA-256: `a6d34cdab36ab13ad28607e5478266812adc7b9f019fb1176499f9aa65244c2b`.
- Selected integrated source/context manifest SHA-256: `11cf8cb9ce77ca356a24dbaba26619bdd6e7973f09a2b19b20cd04f66feda0cb` (same bounded manifest scope as below, not whole-repository identity).
- All eleven preserved `core6` hashes unchanged; all twenty-two copied source/config hashes read inside the exact image equal host bytes. Previous receipts and core result document untouched.
- Full suite: **1,238 passed, zero failed, one existing skip, 1,239 total**. Focused core/frontend: **124 passed, zero failed/skipped**. Dedicated durable restore integration: **26/26 passed**.
- Types, Vite build, no-network (5 passed), privacy scan (`ok: true`, 60 files): each actual exit 0; verification container exit 0. `git diff --check` passes.

### Scoped repair and operation-path audit

`connectLocalService` rejects while the captured restore binding is committing, before transport lookup, owner-generation advance, connection-field reset, request dispatch or hydration. This includes the independent post-ack readback wait. Once an unknown outcome has settled, reconnect still takes only the captured reconciliation path. `pairLocalService` likewise rejects before changing origin/pairing during commit; comparison-choice resolution rejects both pending and unknown restore states.

Explicit disconnect/origin change (`setLocalServiceBaseUrl`) remains permitted as deliberate authority revocation: it does not hydrate or discard the captured binding/input/before-state, and the existing stale-owner regression verifies that its late acknowledgement is not installed. Transport authentication revocation has the same retained-evidence behavior. Re-pairing after settlement is permitted for recovery; reconnect during the unsettled interval is blocked. No new recovery policy, retry authorization, core/schema edit or scheduler copying was introduced.

Two interleaving regressions hold either the actual SQLite commit HTTP response or the subsequent independent GET response. They check preserved live before-state/input/pending intent/connection fields, pairing and all choice refusals, no reconnect status request, original owner completion with verified receipt, exactly one commit, and successful ordinary reconnect after completion.

### Red/green receipts

Receipts: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-04i/review1/`.

- `red.log` / `red-build.log`: original production behavior plus initial two reconnect regressions, **2 product failures**, reconnect returned success instead of refusal; exit 1. Both gates exercised real SQLite commit.
- `red-exact.log`: final exact regression file copied into an isolated original `frontend6` image container (no source mount), **2 product failures**, pairing was not refused while pending; container exit 1. The initial reconnect-specific red receipt remains preserved separately.
- `all.json`, `focused.json`, `tests.log`, `check.log`, `build.log`: final snapshot execution and individual exits/counts.
- `source.json`, `image-source.json`, `container-state.json`, `identity.py`: exact final image/host hash binding and unchanged eleven-file core assertion.

All executable verification used `--network none`, container-local `TMPDIR=/scratch`, providers disabled, and no state/media/home/credential/socket/source mounts. Only model dispatch plus synthetic fetch/real SQLite is newly qualified, not a real browser or new file-backed restart matrix. No host installs, Windows diagnostics, existing preview changes, commit, push, merge, deployment, provider operation or issue closure occurred.

Correction-owned changes: `apps/web/src/model.ts`, `tests/web/durableRestoreIntegration.test.ts`, this result document. Notes remain here rather than shared root notes. New edge case: an ordinary reconnect must not observe/install a transaction before its captured acknowledgement/readback owner finishes. Next checkpoint: independent re-SPEC, then quality review.

## Historical frontend6 result (preserved)

## Outcome

Frontend integration is implemented atop the unchanged `core6` core. The integrated contributor candidate passes **1,236 tests, zero failures, one existing skip (1,237 total)**. The original fourteen frontend-boundary failures are repaired; no assertions in those sync/save suites were weakened. Twenty-four dedicated browser-model regressions pass.

Candidate is ready for the parent's independent specification review, then quality review. **No commit, push, issue closure, main merge, deployment, real learner state/media/provider operation, host installation, Windows diagnostics or Desktop preview changes occurred.** No scheduler candidate was copied. Zero independent review-driven correction cycles consumed; numbered frontend images are contributor test iterations, not reviews. This does not close or qualify `lt-2t4` or `lt-3f1`.

## Exact candidate / source binding

- Worktree: `C:/Users/jmdzi/workspace/lingotorte/.worktrees/lt-04i-durable-replace`.
- Baseline: `efbc05a91e0f6cba86ded027b90ee7fbc69baac1`.
- Image: `lingotorte-lt04i:frontend6`.
- Tested image ID: `sha256:11b0c555d2b125fc3fbf653d6783ed9bc8525445d7122a78d0d3f8afe02418f3`.
- Six frontend source/test files aggregate SHA-256: `bbe3010933a44be7d044968cb55f634d0a3aa1d59569c26febef5c7205f9ee36`.
- Integrated selected source/context manifest SHA-256: `2343d8bc5dbe2b31fb111adb8be5963829dc86f80e9dc7d58123a4ec9c865612` (eleven core files, six frontend files, seven build/config inputs; **not** a claim of a whole-repository hash).
- Twenty-two copied source/config paths were hashed inside that exact image and match host bytes. Dockerfile and `.dockerignore` are additionally host-hashed context inputs, not `/app` files.
- **All eleven core6 source/test hashes match the preserved `core6-source.json`.** No core file was edited, including SQLite and its historical SQL/checksums. Full core migration/checksum regressions also pass in the integrated run. Existing core result document remains untouched.

## Implemented boundary

1. Empty versioned audit metadata is not dirty content. Nonempty retained audit and pending session intent still participate in connection decisions.
2. Restore negotiates `active-audit-restore-v1`; missing capability refuses durable restore with no snapshot-PUT fallback. Original wire JSON, mode, owner generation, local edit generation/comparison, durable revision, detached before-state and audit envelope bind a service-authoritative preview. Service preview is checked against the shared planner, including active/audit/coalesced effects and locally required warnings.
3. Dirty state must be saved or explicitly resolved through the connection choice before durable preview. Loading service state clears pending intent only by that explicit discard choice, retains local immutable audit, and records the actually installed baseline. Pending session edits refuse automatic reinterpretation as an old intent.
4. Manual/autosaves, complete owned provider/embedded job lifecycles (including polling), previews and commits share the owner queue. Earlier operations drain; later saves/jobs cannot run through unresolved restore. Revision changes require refreshed connection/preview, not a blind destructive retry. Awaited results are fenced against transport/owner/input/local edits. A local mutation during commit is preserved and prevents acknowledgement installation.
5. No live learner mutation or success receipt occurs before exact acknowledgement **and** separate GET readback agree on capability, revision, complete active/audit snapshot and result-derived receipt. Success installs authoritative state, clears pending intent, advances baseline/revision, clears stale review/practice selections/answers/results and preserves unrelated player/library state.
6. Transport loss, invalid acknowledgement, owner loss or failed readback retain wire input, before-state and intended result. The UI reports **“Restore outcome unknown; reconnect/read back before retry”**. Reconnect can reconcile exact intended state/revision through GET; no second commit is issued. HTTP commit rejection is distinguished from HTTP readback rejection after commit.
7. Session restore uses `RestoreService.restoreWithReceipt`, labels session-only/not durably saved, retains audit plus explicit intent, and never autosaves the replacement through PUT. Export/Import offers a pending-intent resume action, then fresh authoritative service preview and explicit confirmation. Changed session learner state requires explicit resolution.
8. Preview/receipt UI uses result active effects, retained/inactive audit, coalesced duplicates and supporting-context copy. Replace-active is not audit erasure/full undo. Input is retained across rerenders/failures; textarea changes invalidate the preview. Durable Restore is disabled until a current authoritative preview is available. Pending/unknown operations cannot be overwritten by another preview/input operation.

## Verification / evidence

Owned final and initial-red receipts are in:

`C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-04i/frontend/`

| Receipt | Actual outcome |
| --- | --- |
| `frontend-red.log` | Before production edits: **3/3 product-red** for empty-audit dirty detection, missing-capability restore proceeding, and pending session intent converted into ordinary PUT. |
| `frontend6-all.json` / `frontend6-tests.log` | **1,236 passed, 0 failed, 1 skipped, 1,237 total**; real test exit 0. Dedicated `durableRestoreIntegration.test.ts`: **24/24 passed**. |
| `frontend6.log` | Types exit 0; Vite build exit 0; no-network **5 passed**, exit 0; privacy marker scan `ok: true`, 60 files, exit 0. Individual exits are printed; wrapper/container exit is not substituted for them. |
| `frontend6-source.json` / `frontend6-image-source.json` | Per-file and aggregate identity, all eleven unchanged core hashes, twenty-two `/app` hashes matching exact image. |
| `frontend6-container-state.json` | Actual named verification container exit 0. Container removed only after receipt extraction. |
| `frontend6-build.log` / `frontend6-identity.py` | Contributor build and executed image/host hash-verification recipe. Original receipt copies also remain under `lt-04i/`; recipe references that original location and preserved core manifest. |

All executable checks used contributor Docker snapshots with `--network none`, container-local `TMPDIR=/scratch`, no media/state/source/home/credential/socket mounts, default-disabled providers. No runtime server stack was deployed. `git diff --check` passes.

Dedicated regressions exercise actual browser-model dispatch and real `SqliteLocalPersistence` behind a synthetic fetch adapter: replacement/audit retention, independent acknowledgement/readback gates, stale wire/mode/local/revision, lost response/invalid ack/transport and HTTP readback failure, HTTP 400/409/428/500 commit rejection, owner supersession, mutation during commit, ordinary-save/complete-job queue ordering, edit generation, explicit pending-session restore and audit staging, and session-edit/discard decisions. They are **not** a real-browser or new file-backed browser/service restart qualification. Existing full-suite core real HTTP/file-backed tests run unchanged.

## Owned files

Modified:

- `apps/web/src/model.ts`
- `apps/web/src/app.ts`
- `apps/web/src/uiTypes.ts`
- `apps/web/src/pairedTransport.ts`
- `tests/web/frontendUi.test.ts` — obsolete destructive-erasure copy expectation replaced with stronger active/audit/session/removed-count/intent assertions; existing behavior assertions retained.

New:

- `tests/web/durableRestoreIntegration.test.ts`
- `docs/dev/lt-04i-frontend-result.md` (this document; not an executable image input)

## Deviations

- Notes live in this owned result document rather than rewriting the shared root implementation notes or the core contributor's handoff.
- Unknown-outcome readback that does **not** exactly match the intended active/audit/unrelated state stays blocked with retained evidence. It does not infer rollback from unchanged state or grant an automatic retry against a new revision. A richer explicit recovery-choice UI is not added.
- Completed service jobs may change durable content. The next restore requires an acknowledged fresh revision/connection if its comparison detects that change; no client-side arbitrary revision rebasing is performed.

## Discovered edge cases

- HTTP 500 on readback **after** a successful commit acknowledgement is unknown outcome, not a failed-before-commit acknowledgement.
- Preview/input mutation must be blocked while a commit or unknown result owns recovery evidence.
- Empty audit is metadata; nonempty inactive audit and pending intent are not empty browser work.
- A byte-identical snapshot after an edit still invalidates a captured preview through local edit generation.
- Loading compared remote state uses the installed retained-audit snapshot as its baseline, not raw remote serialization.
- A session restore's later learner edits cannot be silently folded into the original manifest intent.

## Questions for review / limitations

Parent owns specification then quality review and publication. Review queue ownership and outcome reconciliation first. No retention, schema or historical checksum deviation is proposed. The only retained skip is `privateDelivery`'s **actual tmpfs receiver Linux Docker qualification**; its classification was not changed. The full historical upgrade/backup matrix and integrated real-browser/restart matrix remain downstream. No-network interception and the privacy marker scan establish only their exercised scopes, not comprehensive security/secrets proof.

Notes summary: three conservative deviations.
Most likely revisit: explicit unresolved-outcome recovery choices, without granting blind retry.
Six edge cases recorded.
Read the accepted restore/audit contract, unchanged core handoff, then this result.
Next checkpoint: parent independent specification review, followed by quality review; no publication by contributor.
