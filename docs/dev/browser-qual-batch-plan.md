# Browser qualification batch — plan (lt-2t4, lt-n31, lt-13i)

Status: **offline-prepared only.** No browser, compose stack or fixture service has been launched. This plan does not authorize a run, and it closes no gate.

Kit: `scripts/qualification/browser-batch/`. It follows the lt-sor live adapter v2 pattern (`docs/dev/lt-sor-live-adapter.md`):
- a fixed-vocabulary `Journal`;
- a Docker fixture whose stdout pipe delivers the capability privately to the controller;
- a CDP driver that uses `Target.createTarget`/`attachToTarget` and `Runtime.evaluate`/`callFunctionOn` to run DOM ops;
- strict cleanup that reads back only the run's own targets and container.

| File | Role |
| --- | --- |
| `controller.py` | Phase inventory (17 phases), cascade map, `Journal`, `require_authorization`, `run`. |
| `live-batch.py` | `PrivateRuntime`, `BatchDriver` (one method per phase), `run_live`. The CLI is an offline self-check only. |
| `runtime-batch.mjs` | Test-owned fixture: the real local service via Vite SSR, an observing gate proxy, a Vite dev origin, an owned foreign origin, and a private IPC. |
| `dom-batch.mjs` | DOM-only bridge. It drives the shipping UI (Settings, Export / Import, Library, transcript panel). |
| `seed-batch.mjs` | Pure synthetic seed builders: one chain per practice mode, a draft transcript, and anchor projections. |
| `tests/qualification/test_browser_batch_harness.py` | Offline unittest suite (22 tests). |

## Isolation policy

- **Container:** one per run, named `lt-bqb-live-<12 hex>`, started with `--rm --init --log-driver none -i`.
- **Network:** `--network bridge` with only `127.0.0.1:<dev>:18442` and `127.0.0.1:<foreign>:18449` published. The service (18441) and gate (18445) stay unpublished. Default ports are `18442,18449`; override them with `BQB_PORTS`. Before publishing, the controller bind-probes both ports on loopback.
- **Mounts:** kit read-only, `fixtures/media` read-only, plus an owned `/out` scratch directory. There are no volumes, no other host mounts and no docker socket.
- **Providers:** `allowOnlineProviders:false`. Provider and command fakes throw and are counted, and every oracle reports `providers`/`commands`.
- **Capability:** it travels only in the ready/restart reply lines of the private pipe. The controller pops it out of memory before anything is queued. The journal refuses any row that contains a current or prior capability (`SecretInReceipt`).
- **Cleanup:**
  - page cleanup, then `Runtime.releaseObject`, then `Target.closeTarget` for each owned tab, then a `Target.getTargets` readback;
  - fixture `stop`, which closes each listener with a graceful/forced flag and a socket count;
  - `docker ps -a --filter name=^/<exact>$`.
  - There is no prefix sweep and no prune. A forced closure is a strict failure.
- **Authorization:** `require_authorization` needs `specApproved`, `qualityApproved` and `browserAuthorized` to be literally `True`, plus `review.image == BQB_IMAGE` (an exact `sha256:` id). The check runs before any process, socket or tab exists. `review.gates` can narrow the run to a subset of `lt-2t4`/`lt-n31`/`lt-13i`.

## Phases, oracles and what they prove

Server oracle, computed in the container (raw rows never leave it): a SHA-256 of all SQLite tables, per-table counts, audit-table counts, `revision`, active learner counts with the set of practice modes, an anchor digest, media/track IDs, and provider/command counters. The browser side reports only method, path and status events, booleans and counts.

### lt-2t4 restore journey (section 7, steps 1–10)

| Phase | Action | Oracle (all must hold) |
| --- | --- | --- |
| restore-01-pair | Pair through the masked Settings field. | Masked, cleared, no "Pair again"; GET status/state both observed; providers = commands = 0. |
| restore-02-seed-five-modes | Fixture seeds one item→occurrence→card→state→review→attempt chain per mode, then reload and re-pair. Tab B pairs and holds that state with autosave off. | `modes` equals all 5, and `practiceAttempts` = 5. O1 is recorded. |
| restore-03-export-merge-preview-no-effect | Generate the export in the UI, paste the matching manifest, and click **Preview restore**. | Preview shown, integrity verified, **0 commit requests**; table SHA and revision unchanged. |
| restore-04-merge-twice-idempotent | Preview → Merge → Restore now, twice. | Each pass shows a durable receipt, exactly 1 commit and a GET /api/state after the commit. The second pass leaves learner and audit counts and review events unchanged (no rerating). |
| restore-05-empty-replace-readback | Empty manifest → Replace → Restore now. | Durable receipt only with commit 200 **and** a post-commit readback. Active learner collections are 0; `active_practice_attempt`/`active_review_event` = 0; `practice_attempt`/`review_event` history ≥ pre (≥ 5). |
| restore-06-reload-restart-repair | Reload, restart the service (capability rotates), re-pair. | Re-paired; revision and learner/audit counts equal the post-commit values. |
| restore-07-second-tab-stale-409 | Tab B re-pairs choosing "Keep browser work", then saves its stale pre-restore state. | PUT 409 with the visible conflict state; table SHA and revision unchanged (no resurrection). |
| restore-08-kill-during-commit-unknown | Arm `drop-ack-after-commit`, then Restore now. The gate forwards the commit, observes the upstream status, kills the service and destroys the browser socket. | Barrier seen exactly once. UI shows outcome-unknown with no success receipt, and **exactly 1** commit request (no blind replay). Upstream status **must be 200** (hard assert, never vacuous). After service start and re-pair: revision > pre-phase revision and active counts are exactly 5 per collection (savedItems/occurrences/cards/states/reviewEvents/practiceAttempts) with all 5 modes. |
| restore-09-foreign-null-origin | From the owned foreign origin, a sandboxed (null) frame and a plain foreign frame each try JSON fetch (with bearer) and text/plain form POST against preview and commit: 8 attempts. | Per attempt: the gate trace for that path is 401/403 with no CORS or credentials grant, and table SHA and revision are unchanged and every trace row has `privateAbsent` → PASS. If there is no wire request but the oracle is unchanged → `OBSERVED_BROWSER_BLOCK`, which is recorded as a block and is not a server-denial proof. Anything else → FAILED. |
| restore-10-wrong-capability-generic | Pair with a wrong 43-char capability, then Preview. | Generic pairing error and cleared field; 0 commits; tables unchanged. Ends by re-pairing correctly. |

### lt-n31 relink

| Phase | Action | Oracle |
| --- | --- | --- |
| relink-01-import-save | Fixture media is supplied with `DOM.setFileInputFiles` on `#local-media-file` (repo `fixtures/media/synthetic-polish-dialogue.webm`, read-only). Then Import local media and Save. | Imported, PUT 200, media present. Media/track IDs and anchors are recorded, along with `secureContext` and `pickerAvailable`. |
| relink-02-restart-repair-reselect | Restart the API (rotation), reload, re-pair, then reselect the **same** file. | No name-conflict prompt; media IDs, track IDs and anchor digest are equal to relink-01. |
| relink-03-same-name-different-content | Supply a scratch copy with the same name and the original bytes plus 16 NUL bytes. | `.media-name-conflict` is shown. Cancel shows "Import cancelled…", and media/track IDs are unchanged. |
| relink-04-handle-permission-observation | Read `showOpenFilePicker`, `isSecureContext` and the Permissions API. If there is no picker, click "Choose media again". | **Observation only**: checkpoint and phase-end carry disposition `OBSERVED` (never `PASS`, listed in `result.observed`). Without a picker, the visible error is asserted. |

### lt-13i transcript approval (real UI)

| Phase | Action | Oracle |
| --- | --- | --- |
| transcript-01-dirty-approve-refused | Fixture seeds a draft target track (2 cues, word timings) and a saved occurrence anchored on cue 0. For each of cue text, cue start, cue end, word text, word start and word end: First the seeded media/track is opened via the Saved occurrence link and the cue editor inputs must exist (`cue-editor-present`, else DomSelector). For each field: edit, then a force-enabled Approve click, then revert. | Each field: `refused-<f>` (Approve disabled, gate visible, re-enabled after revert) and a separate `dispatch-guard-refused-<f>` (handler refused, block reason still visible in gate/error banner). Server anchors unchanged. |
| transcript-02-apply-inspect-approve | Edit cue text → **Create corrected transcript version** → Approve. | Approve blocked while dirty; Apply waits for the "Corrected transcript version created" message; a Save then shows exactly one new track, not approved; Approve succeeds and disables. |
| transcript-03-save-reload-anchors | Save, reload, re-pair. | PUT 200; anchor digest equal to the pre-edit value; ≥ 2 tracks; server `trackStatus` of the corrected version id (recorded in phase 02) is `approved` and it is the only newly approved track; original V1 `bqt-track` still present. |

Cascade: a failed phase marks its dependents `SKIPPED_CASCADE` (see `controller.DEPENDS`). Independent phases still run, and cleanup always runs.

## Parent run instructions (run only after review and fresh authorization)

Before the run:
1. Build the contributor image from the reviewed commit and record its exact id. The offline build used here was `sha256:ce181952d449352c35e7698aeea2324ce6b6b3382ec2f5086458eeec32787974`; it must be rebuilt from the reviewed commit, because the runtime needs the full `/app`, including `node_modules` for Vite.
2. Set `BQB_IMAGE=<id>` and `BQB_SCRATCH=<hermes scratch dir>` in the parent browser_exec process environment. These are **not** secret: the capability is never placed in env or argv.
3. Run the snippet below **only inside `browser_exec`**, never in a terminal:

```python
# Run reviewed browser qualification batch
import importlib.util, os, pathlib, sys
os.environ['BQB_IMAGE'] = 'sha256:<reviewed contributor image id>'
os.environ['BQB_SCRATCH'] = r'C:/Users/jmdzi/AppData/Local/hermes/cache/scratch'
path = pathlib.Path('C:/Users/jmdzi/workspace/lingotorte/.worktrees/browser-qual-batch/scripts/qualification/browser-batch/live-batch.py')
spec = importlib.util.spec_from_file_location('bqb_live', path); m = importlib.util.module_from_spec(spec); sys.modules[spec.name] = m; spec.loader.exec_module(m)
review = {'image': os.environ['BQB_IMAGE'], 'specApproved': <recorded>, 'qualityApproved': <recorded>, 'browserAuthorized': <recorded>, 'gates': ['lt-2t4', 'lt-n31', 'lt-13i']}
result = m.run_live(cdp, review, new_tab=new_tab)
print(result)   # sanitized only; never print runtime/pipe/CDP values or exceptions
```

Expected `result` shape:

```json
{"browserExecuted": true, "ok": true,
 "phases": {"restore-01-pair": "PASS", "...": "PASS|OBSERVED|FAILED|SKIPPED_CASCADE", "cleanup": "PASS"},
 "failures": [], "skipped": [], "observed": ["relink-04-handle-permission-observation"], "sourceAndKitUnchanged": true,
 "directory": "<scratch>/browser-batch/live-<12hex>", "rowsSha256": "<hex>"}
```

`rows.jsonl` rows are `{type, phase, stage, ok, bead?, disposition?, status?, oracle?, counts?, value?, errorTag?, diagnosticMethod?, failureCategory?}`. They hold only fixed-alphabet strings of ≤ 96 chars, numbers and booleans. Each run directory also contains `binding.json` (kit and media SHA-256 plus image) and `execution.json`.

Post-run readback, which the parent may run in a terminal because it prints no secret: `docker ps -a --filter name=^/lt-bqb-live-<id>$ --format '{{.Names}}'` should return nothing.

## Browser launches

One browser session, with one batch dispatch and four owned tabs (A, B, F, R/T). Budget **1 launch**, plus at most **1 retry** if the contract allows it. Retry only after a fixed-tag diagnosis, never automatically.

## Explicit limits

- Dispositions: `PASS`, `OBSERVED` (relink-04; observation only), `OBSERVED_BROWSER_BLOCK` (restore-09 rows), `FAILED`, `SKIPPED_CASCADE`. Only `PASS` counts as proof.
- Construction after the fixture starts is guarded (`start_and_run`): any failure writes a cleanup row and closes the container. The browser cleanup row is written before `runtime.close()` clears the capability history, so the secret check stays meaningful.

- "Kill service" means stopping the **in-process local service** inside the fixture right after its upstream commit response. It is an in-process kill, not a container or OS kill, not a hard crash and not a power loss. It proves the lost-ACK UI path and the no-replay behaviour, not durability under a hard crash; SQLite durability is covered by existing offline tests.
- No native file picker or permission prompt is driven.
- The fixture's Vite dev origin is a loopback secure context only. Plain-HTTP LAN behaviour (no File System Access) is **not** exercised in this batch. relink-04 records the loopback observation only.
- `DOM.setFileInputFiles` bypasses the native file chooser. It proves import/relink identity, not the chooser UX or persistent-handle permission prompts. CDP cannot grant or deny `FileSystemHandle` permissions without native UI, so the persistent-handle path stays a manual observation.
- Foreign/null attempts that Chrome blocks before sending anything (Private Network Access or local-network rules) are recorded as `OBSERVED_BROWSER_BLOCK` and do not count as server-denial proof. lt-sor's server-side 403/401 evidence for the same gate remains the authority.
- The service runs in a Linux container. This says nothing about a Windows-native service, native SQLite or Edge.

## Open questions (resolve in review; no production hooks were added)

1. **Selectors not verified against a live DOM.** These selectors were inferred from `apps/web/src/app.ts` and need confirmation:
   - the restore receipt heading (`[data-testid=restore-receipt]` with the `h3,h4` text "durable readback verified");
   - the sync-choice button text for the service side (`Use service state`; only "Keep browser work" was found);
   - `Reload from service`, which is optional;
   - the transcript panel's location under Library;
   - the Approve success text `approved for study`, used by the handler-refusal probe.

   A failure on any of these surfaces as `DomButton`/`DomSelector`/`DomDeadline`, not as a false pass. It still costs a launch.
2. **The handler probe force-enables a disabled button.** That is DOM manipulation, not a user path. The production handler recheck exists per lt-aur.1. Reviewers should decide whether to keep or drop it. Without it, only `disabled` and the gate note are proven.
3. **Step 8's oracle accepts that the upstream committed.** Reconciliation asserts 5 attempts only when the upstream status was 200. The alternative `kill-before-forward` mode exists in the fixture but no phase uses it.
4. **Audit oracle depends on the v9 table split.** The audit oracle reads `practice_attempt` and `review_event` (full history) against `active_practice_attempt` and `active_review_event`. restore-05 requires history ≥ 5 retained and both active tables at 0. This mapping was checked against the `CREATE TABLE` statements in `sqliteLocalPersistence.ts`, but has not been observed live.
5. **restore-02 seeds by a fixture PUT, not through the five practice UIs.** The plan's "seed synthetic learner data" is satisfied by service-side seeding. Driving five practice UIs would need per-mode DOM ops, which are not written.

## Run 1 result and corrections

Run 1 (journal `live-170e1ca23491`, 57 sanitized rows; image `lingotorte:bqb-run`):

| Phase | Run 1 | Root cause | Defect |
|---|---|---|---|
| restore-01/02/03, 09, 10; relink-01/02/03 | PASS | - | - |
| relink-04 | OBSERVED | - | - |
| restore-04, 05, 08 | FAILED DomButton | 'Restore now' disabled: harness never bound a service-backed preview | harness |
| restore-06 | SKIPPED_CASCADE | depends on 05 | - |
| restore-07 | FAILED 200 != 409 | ran although 04/05 never advanced the revision; tab B was still current | harness (dependency) |
| transcript-01 (02/03 cascaded) | FAILED PrivateRuntimeOperation | `seed-transcript` PUT failed: word timings used `sourceKind: 'synthetic'` | harness (fixture data) |
| cleanup | FAILED strictPass false | not attributable from run 1 receipts (stop reply/exit code discarded); see below | harness (diagnostics) |

Root causes and fixes:

* **Restore commit (04/05/08).** `app.ts` renderExportImportView sets `restoreBtn.disabled = !canRestore || restoreIsBusy(model) || (status !== 'disconnected' && !hasCurrentDurableRestorePreview(model))`. With a paired service, a durable binding exists only after 'Refresh authoritative service preview' (`previewDurableRestore`, model.ts). Selecting a mode drops any binding (`setExportImportConfirmOverwrite` deletes restoreStates), and a successful refresh resets `acknowledgedWarnings`. `conflictChoice: true` in restore-03 shows the merge/replace conflict UI was present. The old `confirmRestore` in dom-batch.mjs ticked the mode and warnings and then clicked 'Restore now' without refreshing, so the button stayed disabled. Fix: select mode, refresh the service preview and wait for it, acknowledge warnings after the refresh, wait for 'Restore now' to enable, then click. The product behavior is the intended durability gate; no product defect.
* **Diagnostics.** dom-batch.mjs throws `Tag|elementKey|state` from fixed `BUTTON_LABELS`/`SELECTOR_LABELS` keys. live-batch.py `INVOKE_FN` parses it. controller.py validates against `DOM_ELEMENTS`/`DOM_STATES` and journals `element`/`elementState`; unknown values are dropped.
* **restore-07.** DEPENDS now requires restore-01, 02, 04 and 05; the 409 oracle is unchanged.
* **transcript-01.** The SQLite schema allows word-timing `source_kind` only from ('provider-word-timing', 'forced-alignment', 'manual-edit'). It was reproduced offline in the image against `SqliteLocalPersistence.open(':memory:')` (CHECK constraint failed). The seed now uses 'manual-edit', and the offline probe passes for both seeds.
* **Cleanup.** `PrivateRuntime.close()` discarded the stop reply detail and the exit code, so run 1 cannot tell which closure failed. A contributing hazard is also fixed: after a `request()` timeout, a late reply stayed in the queue and could be consumed by the next request, including 'stop'. Fixes:
  * Requests and replies are now sequence-correlated (`seq`).
  * Stop records `stopStage`, `exitCode`, providers and the closures with their `graceful`/`remainingSockets` values in the cleanup receipt.
  * Fixture shutdown closes idle keep-alive connections first and waits up to 500 ms for socket 'close' after `destroy()` (it previously read `remainingSockets` synchronously).
  * Shutdown errors are converted to a strict-false reply instead of an unhandled rejection.
  * The strict check is not relaxed.

Residual for run 2: the commit path is source-traced and not yet browser-proven. If cleanup still fails, the new `stop` receipt names the failing closure.

