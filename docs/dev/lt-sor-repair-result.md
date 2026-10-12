# lt-sor narrow Vite preflight repair — candidate for independent review

## Disposition and scope

CORS repair candidate only; **A24/A25/A26 and LAN remain OPEN**. This is the authorized final correction cycle **3/3**, not a reset of the prior allowance. No browser was launched, no public/private-LAN port published, and no commit, push, Beads/root-tracker update, provider/model action or real learner-state mutation occurred.

Worktree: `C:/Users/jmdzi/workspace/lingotorte/.worktrees/lt-sor-request-auth`, baseline `66aa766`, existing uncommitted lt-sor work preserved. This worker changed only:

- `vite.config.ts`: explicit `server.cors: false` and `preview.cors: false`, with explanatory comments.
- New `tests/core/vitePreflight.test.ts`: actual dev **and** preview middleware with the actual backend admission/dispatch service, not a standalone ingress mock.
- This new report. Existing `tests/core/publicIngress.test.ts` was exercised unchanged.

Backend CORS, exact-origin/Host validation, bearer validation, route/method/type validation, proxy/header scrubbing and provider-off defaults were not relaxed or edited.

## Root cause and discriminating proof

Installed Vite **8.0.16** source shows default CORS registered before both `configureServer` and `configurePreviewServer`, followed by host validation and the application plugin/proxy. Its OPTIONS handler ends at 204 when `preflightContinue` is false, irrespective of the backend's stricter policy. `cors: false` removes that framework interception; API OPTIONS now passes through ingress/proxy to backend admission. This does not disable backend CORS or enable cross-origin assets.

The final identical test source was run on two isolated full application snapshots. **Only `vite.config.ts` differs between their 249-entry manifests.** Original config bytes were recovered from the original pre-fix scratch snapshot, not restored into the worktree.

- **RED:** actual dev and preview both failed, exit **1**, two failed tests. All **16** foreign/null route-method assertions recorded **observed 204 / required 403**: two modes × two origins × health GET, state GET, state PUT and seeded waiting-job cancel POST. An additional allowed-preflight header assertion also exposes the framework's generic rather than backend-owned response. The structured failures are retained; exit 1 is not an environment/import failure.
- **GREEN:** same final test source on candidate image: two new tests plus unchanged ingress test **3 passed**, exit **0**. **16** disallowed preflights return 403; **8** exact-origin positive preflights return backend 204 with exact method/header allowances, `Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers...`, `Cache-Control: no-store`, no credentials and empty body.
- Seed uses a nonempty synthetic media snapshot and a real queued waiting job. Every denial/positive preflight checks unchanged full service observation (including persisted snapshot/revision/jobs) and recursive file SHA-256 manifest, including SQLite/WAL/scratch. Health 200, allowed-origin bad bearer 401, PATCH 405, text/plain PUT 415, invalid requested method 403 and Docker PNA 403 are retained.
- Both modes preserve raw duplicate Host/Origin/Authorization/Content-Type rejection 400, wrong Host 403 and zero `100 Continue` on rejected Expect requests. The unchanged existing dev ingress test independently retains proxy Host/Origin preservation, forwarding stripping and zero upstream dispatch for its denied raw/Expect cases.

These are Node HTTP integration receipts for the actual middleware, **not Chrome acceptance or audio/playback evidence**. Preview's test document is synthetic; actual candidate production assets were separately baked and rebuilt successfully.

## Exact frozen binding

External evidence directory:
`C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/repair/cors-cycle3/`

| Binding | Value |
| --- | --- |
| Existing runnable base `.Id` | `sha256:08f8d07f9c75fec44ff60cb06757c99c3f5118fdaf793dcb24c74381499cef76` |
| Final red runnable `.Id` | `sha256:7249b0418d44fdd51a6f93567f6af479483e0bd266a10e5ef59d729bfc1836de` |
| **Final candidate runnable Docker inspect `.Id`** | **`sha256:186e3bb0a204943823c3fe0241ab36927b8fa4d32332dcadad1194c33206f152`** |
| Final red manifest SHA-256 | `01eb308e2fe4f3f1e02b736c949371ba6430177c46ee15e32ef777631ba3417c` |
| Final green manifest SHA-256 | `6629838c70da49ff681bdcff90d8044bdf72f1571bfa32579a044d8d9d0b8763` |
| `vite.config.ts` SHA-256 | `0b6ad22a2858bc5754f5bfc666d45baf0893f1c97fb3273c72691bb63bae2110` |
| Final regression test SHA-256 | `139f69defc29ec2a7e82433c6aa415d7c84ad253c22c40bb8c430b8b847b37dc` |
| Approved contract unchanged SHA-256 | `c6692549fd40f265f5fd7e7c76d511e66d279b402c37bbca8a8ec4e487417cb9` |
| Installed Vite source unchanged SHA-256 | `c3dd49d14b140acd79ce8f76d3b9c191dbe76713a47e15947c2efc65f453588b` |

`candidate/binding.json` read back all **249 application/source/test entries inside the final image**, zero mismatches, and compared current worktree entries, zero mismatches. All six `@lingotorte` workspace symlinks resolve to the corresponding `/app/packages/...` directories. Inherited dependency links were not replaced by host node_modules. Provider default reads `false`. Production HTML/CSS/JS hashes are retained in the binding; image carries built assets from its own source. This is the actual runnable image ID, not the build log's OCI configuration digest or the earlier `35f615...` configuration digest. Intermediate candidate images are **not** the final review target.

## Commands and actual verification

Scratch `freeze.py` packages the application inputs (apps/packages/vendor/fixtures/scripts/tests and package/config files) into a source tar, then derives an image from the existing approved base with `ADD --chown=node:node source.tar /app/`. No dependency installation or host mounts. `red-final` substitutes only the original Vite config **inside that tar**. `green-final` retains current source. Final candidate Dockerfile derives from green-final and runs the actual production build.

Executed final preparation:

```text
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/repair/cors-cycle3/freeze.py red-final
docker run --rm --init --network none lingotorte:lt-sor-cors-red-final node node_modules/vitest/vitest.mjs run tests/core/vitePreflight.test.ts
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/repair/cors-cycle3/freeze.py green-final
docker build --network none -t lingotorte:lt-sor-cors-candidate-final C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/repair/cors-cycle3/candidate
docker image inspect lingotorte:lt-sor-cors-candidate-final --format '{{.Id}}'
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/repair/cors-cycle3/verify.py
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/repair/cors-cycle3/bind.py
```

Every final check below used the **exact candidate ID**, not a mutable tag, with prefix:

```text
docker run --rm --init --network none sha256:186e3bb0a204943823c3fe0241ab36927b8fa4d32332dcadad1194c33206f152
```

| Suffix command | Observed result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run tests/core/vitePreflight.test.ts tests/core/publicIngress.test.ts` | 2 files, **3 passed**, exit 0 |
| `node node_modules/vitest/vitest.mjs run` | **47 passed files / 1 skipped**, **1121 passed tests / 1 skipped**, exit 0 |
| `node node_modules/typescript/bin/tsc --noEmit` | no diagnostics, exit 0 |
| `node node_modules/vite/bin/vite.js build --config vite.config.ts` | **33 modules**, HTML/CSS/JS produced, exit 0 |
| `node node_modules/vitest/vitest.mjs run tests/no-network` | 2 files, **5 passed**, exit 0 |
| `node scripts/check-privacy-boundaries.mjs` | `ok:true`, **54 scanned files**, exit 0 |

Full-suite seeded runtime receipt independently retains **930 expanded denials, 29 admission faults, 16 route classes, 8 positive job kinds, 16 positive preflight controls, full table/file/revision/save/LRU oracle, four paused-worker denials and zero fake-provider calls**. One existing private-delivery test is skipped; this is not qualification of that skipped gate. JSDOM emits its existing HTMLMediaElement play-not-implemented diagnostics, not actual audio playback success.

Exact arrays, exits and log hashes: `candidate/verification.json`. Raw logs: `candidate/{regression,full,types,build,no-network,privacy}.log`; final negative-control output: `red-final/test.log`; source: `{red-final,green-final}/{manifest.json,source.tar,Dockerfile,build.log}`; installed ordering excerpts: `vite-source.txt`.

Privacy scan is reference-product-marker coverage, not comprehensive secret/egress/path/security verification. No-network tests prove their exercised provider-disabled flows under their intercepted primitives; isolated Docker networking additionally prevented external traffic during verification.

## Harness issues and residual gates

Two setup failures were corrected before product proof: Dockerfile `FROM sha256:...` was parsed as a registry repository and denied; the existing local base was tagged and read back instead, with no package/download success or installation. Initial fixture used forbidden ephemeral backend port with public origins and failed preflight setup; a reserved loopback fixed backend port corrected that harness prerequisite. Its log is `fixture-prerequisite-failure.log`, **not regression RED evidence**. Subsequent changes enhanced only test seeding/diagnostic labels/Vary assertions; no second production fix was attempted.

All executed servers were disposable in network-none containers, no published ports, no volumes or host source/media/home/credential/socket mounts. Containers used `--rm`; frozen images and scratch receipts intentionally remain for independent review, not deployment. This repair did not attempt TLS, secure-context flags, hash validation weakening or broad authentication refactoring.

**Remaining gates:** independent SPEC/QUALITY review of this exact candidate; audio served-module/evaluation harness resolution; plain-HTTP LAN Web Crypto limitation disposition without weakening hash validation; A25 full real-browser zero-effect/private-byte oracle; A26 restart/poll/autosave/re-pair semantics; remaining A24 audio/WAV/DELETE/Blob/playback and A27/A28 endpoint/reload/storage qualification. Only separately authorized browser execution after review may provide those receipts. No browser relaunch or publication is authorized by this report.
