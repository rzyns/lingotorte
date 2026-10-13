# lt-2t4 integrated qualification result

"Close/reopen" below means same-process `service.close()` followed by a fresh `startLingotorteLocalService` on the same SQLite file, not an OS process restart.

Status: **synthetic integrated qualification passed; real-browser gate OPEN.** Committed on `work/lt-2t4-integrated-qual` (see the integrated revision section at the end). No real-state rollout.

## Binding

| Item | Value |
| --- | --- |
| Base revision | `c12780d` (origin/main, fast-forwarded on branch `work/lt-2t4-integrated-qual`), plus the new test file and this doc; final integrated revision `df5a77b` on main `1bdeebb` (see the end) |
| Candidate image | `lingotorte:lt-2t4-cand` = `sha256:94b20484af2a9949c68c45ce2947b4dbec090e57a4dbdce3d125e2ac7612107f` (built from the working tree with the final test file) |
| New test | `tests/core/lt2t4IntegratedQualification.test.ts` sha256 `61c81fc9871c3fc0ec33cc91779714a15b47d70b605c6440b11edec1d67a1914` |
| Product code changes | none |

## 1. Route inventory (`apps/local-service/src/server.ts` dispatch) and admission

Every request goes through `admit()` (`requestAdmission.ts`) before `dispatch`. `routeMethods()` is the default-deny allowlist: unknown path → 404, wrong method → 405 (+`Allow`), and all routes except health need a capability.

| Route | Methods | In `routeMethods` | Capability | Web client call site |
| --- | --- | --- | --- | --- |
| `/api/health` | GET | yes | public, minimal | none (operator/compose health only) |
| `/api/status` | GET | yes | required | `model.ts` connect (`fetchLocalServiceJson`) |
| `/api/state` | GET, PUT | yes | required | `model.ts` connect/readback/autosave PUT, restore preview/readback |
| `/api/restore/preview` | POST | yes | required | `model.ts` restore preview (~l.3395) |
| `/api/restore/commit` | POST | yes | required | `model.ts` restore commit (~l.3438) + `/api/state` readback |
| `/api/jobs` | POST | yes | required | `model.ts` transcription/scribe/subtitle jobs; `sourceAudioSnippet.ts` |
| `/api/jobs/{uuid}` | GET | yes | required | `model.ts` job polling; `sourceAudioSnippet.ts` |
| `/api/jobs/{uuid}/cancel` | POST | yes | required | **no web call site** (transport allowlists it) |
| `/api/snippets/{uuid}` | GET, DELETE | yes | required | `sourceAudioSnippet.ts` fetch then DELETE |
| `/api/artifacts/cleanup` | POST | yes | required | **no web call site** (transport allowlists it) |
| `/api/language/morphology` (lt-elf) | POST | yes | required | `morphologyClient.ts` (no UI caller until lt-e8z); stateless, 16 KiB body cap |

Client side: every local-service request goes through `pairedTransport.request()`. It checks the path against an allowlist that matches the server table above (health excluded), attaches the bearer, and forces the JSON content type. The only direct `fetch` is `model.ts:1048` (`browserFixtureMediaUrl`, a same-origin static fixture, not the service).

Reconciliation result: server routes, the admission allowlist and the client allowlist agree. **No route is left out of the gate.** Restore preview/commit were added after lt-sor's qualified inventory. They are in `routeMethods` and the client allowlist, but they were missing from the lt-sor seeded oracle matrices (`requestAdmissionMatrix`, `requestRuntime`). The new test closes that gap. Cancel and cleanup are server- and transport-reachable but have no UI caller. They stay covered by the lt-sor server matrices.

## 2. A01–A30 mapping

"lt-sor" means the qualified evidence in `lt-sor-acceptance-result.md` / `lt-sor-a17-evidence.md` / `lt-sor-runtime-result.md` (`requestRuntime`, `requestAdmissionMatrix`, `requestAuthenticity`, `publicIngress`, `privateDelivery`, `requestPairing`, `capturedTransport`, `dockerServiceRouting`, `lanHashImport`). "NEW" means the lt-2t4 test, which extends those rows to the restore routes.

| Row | Evidence | Restore routes | Status |
| --- | --- | --- | --- |
| A01 | lt-sor positives; durableReplace gate test; NEW positive preview (oracle unchanged) + commit (oracle changes, revision = readback) | covered | qualified (server) |
| A02 | lt-sor; NEW positives are Origin-absent native fetch | covered | qualified |
| A03 | lt-sor | n/a | qualified |
| A04 | lt-sor (`requestRuntime` profiles/checkpoints, `publicIngress`) | route-independent | qualified, as recorded by lt-sor |
| A05 | lt-sor; NEW foreign-origin 403 ×2 routes | covered | qualified |
| A06 | lt-sor; NEW null-origin 403, duplicate Origin 400 | covered | qualified |
| A07 | lt-sor; NEW missing/wrong bearer 401 | covered | qualified |
| A08 | lt-sor (previous/concurrent capability) | gate-wide, route-independent | qualified, not re-run per restore route |
| A09 | lt-sor; NEW wrong Host 403 | covered | qualified |
| A10 | lt-sor; NEW duplicate Authorization 400 | partially (dup auth/origin) | qualified via gate-wide lt-sor |
| A11 | lt-sor; NEW GET/PUT on restore → 405 | covered | qualified |
| A12 | lt-sor (query/encoding/unknown) | gate-wide (pre-route regex) | qualified |
| A13 | lt-sor; NEW text/plain, form-urlencoded → 415 | covered | qualified |
| A14 | lt-sor; NEW wrong charset 415 | negative covered; restore legal-variant positives use only `application/json` | qualified (variant positives gate-wide) |
| A15 | lt-sor; NEW empty/array → 400, extra key / bad mode / missing confirmation → 400, missing revision → 428, stale revision → 409 | covered | qualified |
| A16 | lt-sor; NEW 30 MiB body → 413, gzip → 415 | covered (non-chunked) | qualified; chunked oversize gate-wide only |
| A17 | lt-sor A17 supplement | n/a (restore is POST-only) | qualified |
| A18 | lt-sor; NEW restore OPTIONS → 204 empty, oracle unchanged | covered | qualified |
| A19 | lt-sor; NEW foreign-origin OPTIONS 403 | partial | qualified via gate-wide lt-sor |
| A20 | lt-sor | gate-wide | qualified |
| A21 | lt-sor; NEW preflight-then-unauthenticated actual → 401, oracle unchanged | covered | qualified |
| A22 | lt-sor `tests/core/requestRuntime.test.ts:128` paused snippet worker (cancel/delete/cleanup denials); NEW A22 test: with a `source-audio-snippet` worker paused inside its command runner, 12 restore preview/commit denials (missing/wrong bearer 401, foreign origin 403, text/plain 415, array 400, stale revision 409) leave the full oracle (logical state, all SQLite tables, files, runner calls) unchanged; the worker is then released, publishes, its snippet is readable and DELETE returns 204; revision unchanged. Restore routes themselves are synchronous and own no worker | covered | qualified |
| A23 | lt-sor `requestAuthenticity` | NEW missing-auth rows with a trusted Origin/Host | qualified |
| A24 | lt-sor real Chrome 145 matrix (`docs/dev/lt-sor-harness-repair.md:23`): 135 rows, 131 PASS, 4 OBSERVED_BROWSER_BLOCK, 0 FAILED for lt-sor's routes. lt-sor `scripts/qualification/lt-sor/matrix.mjs` and `inventory.py` contain no `/api/restore` routes | not covered | qualified by lt-sor for its routes; **OPEN** only for `/api/restore/preview`, `/api/restore/commit` and the durable restore journey |
| A25 | lt-sor real Chrome 145 matrix (same receipt) for its routes | not covered | qualified by lt-sor for its routes; **OPEN** only for the restore routes and journey |
| A26 | lt-sor real Chrome 145 matrix (same receipt) for its routes | not covered | qualified by lt-sor for its routes; **OPEN** only for the restore routes and journey |
| A27 | lt-sor (`requestPairing`, `lanHashImport`, `dockerServiceRouting`) | transport allowlist shared | qualified (non-browser) |
| A28 | lt-sor (`privateDelivery`; tmpfs IPC skip below) | n/a | qualified except Linux tmpfs roundtrip, which is env-gated |
| A29 | lt-sor `providerDisabled`/no-network; NEW harness `allowOnlineProviders:false`, command runner throws (count unchanged) | covered | qualified |
| A30 | lt-sor `requestRuntime` | n/a | qualified |

Zero-side-effect oracle (NEW): `JSON.stringify({observeState logical state incl. snapshot/revision/jobs/LRU, runnerCalls, every SQLite table row (read-only connection), scratch file list})`. It is compared before and after each of 45 denials (2 routes × 11 header faults, 2 × 9 (preview) / 10 (commit) envelope faults, foreign preflight, preflight-then-unauthenticated).

## 3. T01–T14 mapping

| Case | Existing evidence | NEW (HTTP + file-backed SQLite + same-process `service.close()` then fresh `startLingotorteLocalService` on the same SQLite file) | Status |
| --- | --- | --- | --- |
| T01 | `restorePlanner` "serialized linked practice merges twice"; `lt7lq` roundtrip | per mode ×5: export → stringify → parse → merge twice over HTTP; second pass leaves active/audit/card state and `review_event` table identical; ordinary PUT; close and reopen the service in-process; exact attempts/events/occurrences/card states/audit | qualified |
| T02 | `restorePlanner` duplicate coalesce/reject (both modes) | — | qualified (planner + persistence share the validator) |
| T03 | `restorePlanner` immutable conflicts; `durableReplace` audit-only conflicts (both modes) | — | qualified |
| T04 | `durableReplace` empty replace → save → reopen (direct persistence) | over HTTP: empty replace → PUT → in-process close/reopen: six collections empty, audit exact, media/tracks/policy/import jobs unchanged | qualified |
| T05 | `durableReplace` nonempty replacement idempotent | over HTTP: subset b + new c, replaced twice → PUT → in-process close/reopen: active = {b,c}, audit = {a,b,c}, c appended once, a not revived | qualified |
| T06 | `durableReplace` ordinary omission | NEW T09 also shows a current-revision PUT of the old snapshot is refused and the oracle is unchanged | qualified |
| T07 | `lt7lq` re-export after replace; `durableRestoreIntegration` | re-export from reopened readback contains only b,c; `a` absent | qualified (consumer UI lists via lt7lq/web suites) |
| T08 | `durableReplace` rollback injections (4 tables) + reopen | — | qualified |
| T09 | `saveSafety` stale/competing HTTP writers; `durableRestoreIntegration` lost response/readback, supersession, captured-preview invalidation | over HTTP: commit treated as lost → readback shows commit; blind identical replay 409, changed mode 409, stale PUT 409, revisionless PUT 428, old snapshot at current revision refused; oracle unchanged; in-process close/reopen confirms; current-revision PUT with old active snapshot → 400 | qualified |
| T10 | `durableReplace` session staging; `durableRestoreIntegration` session intent never PUT | — | qualified |
| T11 | `legacyMigrationQualification` pre-v5 / v7 mixed, twice-reopen; `durableReplace` v8→v9 | — | qualified |
| T12 | `legacyMigrationQualification` conflicts/future schema/injected failure + retry; `durableReplace` checksum/marker | — | qualified |
| T13 | `legacyMigrationQualification` WAL backup, pre-upgrade copy; `tests/web/durableRestoreIntegration.test.ts` capability mismatch refuses | — | qualified |
| T14 | `durableReplace`/`legacyMigration` all modes; no-network suites | all five modes through HTTP and in-process close/reopen; providers off; runner never called | qualified |

## 4. Defects

None found. No product code was changed, so no red-versus-original scratch worktree was needed.

Observations, not defects:
- Transport allowlists `jobs/{id}/cancel` and `artifacts/cleanup`, but the web app never calls them.
- The client regex allows `[A-Za-z0-9_-]+` job ids, which is looser than the server's UUID check. The server still returns 404 before dispatch, so this is harmless.

## 5. Commands (all in `lingotorte:lt-2t4-cand`, `--network none`)

| Command | Result |
| --- | --- |
| `docker build -q --target contributor` | ok, image above |
| focused `vitest run tests/core/lt2t4IntegratedQualification.test.ts` | 3 runs, each 9/9 passed, exit 0 (`lt2t4RestoreDenials: 45`, `lt2t4PausedWorkerRestoreDenials: 12`) |
| full `vitest run` | 3 runs, each 1295 passed / 1 skipped (58 files passed, 1 skipped), exit 0. Baseline 1286 + 9 new. See flake note. |
| `tsc --noEmit` | exit 0. The first draft of the new test had a readonly-array type error, which was fixed before final. |
| `vite build` | exit 0 |
| `vitest run tests/no-network` | 5/5 passed, exit 0 |
| `node scripts/check-privacy-boundaries.mjs` | exit 0 |
| `git diff --check` (new test file added with `-N`) | exit 0 |

Flake note (previous base `401dd22`): one full run reported `1 failed | 1293 passed`. Root cause, reproduced by the parent in 1 of 8 full runs on that candidate image: `tests/web/frontendUi.test.ts` "imports browser-selected local media..." (`expected undefined to be owned-clip`) used fixed 10-tick `setTimeout(0)` waits after async imports (File reads + WebCrypto digest), which raced under full-suite load. Fixed on main `c12780d` with bounded `vi.waitFor`. Unrelated to this candidate; the results above are on the `c12780d` base.

## 6. Skips and unreached assertions

- `tests/core/privateDelivery.test.ts` "actual tmpfs receiver roundtrip, permission rejection, loss and owner-only disposal" uses `skipIf(LINGOTORTE_QUALIFY_IPC !== 'true')`. It covers the real Linux Docker tmpfs IPC capability delivery (A28) and is not restore-specific. lt-2t4 does not change delivery. It stays an env-gated lt-sor runtime receipt and is not re-qualified here.
- Not asserted per restore route: chunked oversize body (A16), legal charset variant positives (A14), and previous/concurrent capability (A08). All three are gate-wide behavior checked before route dispatch and are covered by lt-sor on other routes.
- No real browser and no compose stack were run for the restore routes. A24–A26 are qualified by lt-sor's real Chrome 145 matrix for lt-sor's routes; they stay OPEN only for `/api/restore/preview`, `/api/restore/commit` and the durable restore journey.

## 7. Real-browser receipt plan (OPEN GATE, for parent to run)

Profiles:
- (P1) dev Vite `http://127.0.0.1:5173` + native service on a test-owned temp DB.
- (P2) Docker private-LAN same-origin profile per `lt-sor-browser-acceptance.md`.

Use explicit synthetic pairing via the existing fixture flow, a fresh browser profile, and providers off.

1. Pair, connect, and wait for state. Oracle: the service `GET /api/state` revision equals the UI revision. Capture network: preflights for `/api/state` and `/api/restore/*` show exact CORS and no bearer in URLs, storage or console.
2. Seed synthetic learner data in all 5 practice modes (one per mode, linked to reviews), then autosave. Record revision R1 and the server table dump (oracle O1).
3. Export the manifest (download), then Import → **preview merge** of the same file. Oracle: no POST commit was sent, and server tables equal O1.
4. Confirm merge twice. Oracle: active/audit unchanged after the second commit, no rerating, and the receipt matches the server readback.
5. Import an empty manifest → preview replace-active → confirm. Oracle: the UI shows success only after commit 200 **and** the `/api/state` readback. Active collections are empty, and audit equals O1's history (server dump).
6. Reload the page, then stop and restart the service and re-pair. Oracle: the state is still empty-active with retained audit, and the revision equals the post-commit revision.
7. Second tab, still holding the pre-restore state, autosaves. Oracle: 409 and a visible conflict, with no resurrection on the server.
8. Lost acknowledgement: kill the service right after the commit request is sent (or block its response in devtools). Oracle: the UI shows outcome-unknown, not success, and does not blindly replay. After restart and reconnect, the readback reconciles.
9. Negative origin (A25): from a second unallowed loopback origin and a `sandbox`/null-origin page, attempt form POST and fetch POST to `/api/restore/commit`. Oracle: the server table dump and revision are unchanged.
10. Wrong or missing capability (A26) during preview/commit. Oracle: a generic pairing error, no retry without auth, and no false success.

Record HAR and server dumps per step, plus browser version and profile. Steps not reached must be listed explicitly.

## 8. Independent review

SPEC review `deleg_350f445c/task1` passed the test code. The doc findings it raised were corrected in correction cycle 1, then re-reviewed: SPEC PASS and QUALITY APPROVED `deleg_da5e11f7` (focused 9/9 ×3). Post-review: the test at line 282 now checks for a leaked token with `includes(...)` so a failure cannot print the synthetic capability.

## Integrated content-bound revision

Committed and merged with main `1bdeebb`, which carries lt-0g9, lt-aur.1 and lt-n31; the merge is `df5a77b`. Image `sha256:0967e5853e38f23d4e358ab22b6a2fe98e7e6f9f95d1c57e1318e8891ab1333c`, `--network none`:

- Full suite, 3/3 runs: 1342 passed, 1 skipped (pre-existing private-IPC A28 gate).
- tsc, build, no-network and privacy checks: all exit 0.

Spec review (`deleg_350f445c/task1`) passed the test code; its doc findings were corrected in correction cycle 1. A re-review of the corrected doc and a quality review are still pending. The issue stays open until those reviews pass and the real-browser restore receipt (section 7 plan) is recorded.
