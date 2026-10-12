# lt-sor implementation result — INCOMPLETE, NOT review/closure ready

Baseline `66aa7660772e22912a8698764e1e581229a62d62`; worktree `work/lt-sor-request-auth`. The approved contract and plan were preserved, including their exact supplied hashes. No publication, canonical Beads writes, other worktree changes, restore routes, provider traffic, real learner/media actions or preview-stack changes.

## Implemented subset

- `apps/local-service/src/requestAdmission.ts`: exact canonical HTTP origin/authority helpers; immutable policy; raw duplicate header checks; explicit method/route inventory, unknown-route default denial; bearer base64url validation and constant-time 32-byte comparison; required JSON envelopes, streaming 5 MiB limit, unsupported encoding rejection, bodyless route envelope checks; bounded preflight/PNA rules; consistent response CORS and generic denials.
- `apps/local-service/src/server.ts`: common admission before existing dispatch, process OS-random capability and explicit private in-process delivery callback; local observation seam (not HTTP); delivery readiness check; minimal health; `checkContinue` and finite timeouts; native ephemeral listener binds disabled before resources, freezes actual port and only enables after initialization. Startup failure closes listener and removes only its newly created run scratch child. Existing durable revision/CAS and provider business handlers were retained.
- Two new real-dispatch test files: baseline reproducer, generated partial admission/envelope matrix and startup delivery refusal. No admission mocking.

This is a partial implementation, not an assertion that every clause above is qualified. Startup interval/failure injection, complete strict forms, actual delivery boundaries and full oracles still need implementation/qualification.

## Executed Docker evidence

Pinned official Node/Debian Dockerfile contributor target; no host installs. Every verification container used `--rm --init --network none`, no host mounts. Logs and hash manifest: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/`.

Final source image: `sha256:850035cd1cc40bef3754ff485dc67e6cefc424350c02ab1566959ba042d6879d` (`lingotorte:lt-sor-partial-final`). Red image: `sha256:14766e980d3c93a6ea1a6f5bfeafcac2e3de8c9ca3089c5a1338e09da365d848` (`lingotorte:lt-sor-red`). Exact app/test/contract hashes are in `manifest.json`; commands and exits in `command-results.json`.

| Check | Actual result |
| --- | --- |
| Baseline regression | FAIL for the intended behavior: status/state/job-create returned `[200,200,201]` instead of `[401,401,401]` |
| Baseline entire suite with reproducer | 1052 passed, only new reproducer failed |
| Final partial regression/matrix | 3 tests passed, 127 expanded denial requests; 16 route/job classes, 7 admission faults and 13 envelope cases, plus Expect and runtime receiver-loss checks |
| Final entire suite | **42 failed / 1013 passed**, 9 failed files / 33 passed files; existing native/service/web fixtures not yet migrated to private delivery/authentication |
| Final TypeScript | exit 0 |
| Final Vite build | exit 0 |
| Final no-network subset | 5 tests passed |
| Final privacy scan | exit 0, 50 files scanned; marker scan only, not secret/egress certification |
| Git diff whitespace | exit 0 |

Partial matrix observes actual persistence snapshot/revision, jobs/map, snippet map/access/lifecycle, in-flight count and fake runner count. The reproducer additionally compares recursive file hashes after startup/before shutdown. **No seeded completed snippet, audit/save spies or paused worker oracle is qualified.** Invalid fake media payloads in denial expansions demonstrate rejection preceding media reads, not authorized positive controls for all job kinds. Positive waiting/noop job insertion and valid preflight controls ran. No capability was emitted into receipts.

## Blocking missing implementation and qualification

1. Docker API-only verified tmpfs Unix socket receiver and controlling-TTY helper; native private TTY delivery; actual wrong-uid/non-TTY/mount/readiness/restart/loss qualification. CLI currently fails closed because it has no receiver; detached Compose is **not usable with this subset**.
2. Vite exact public ingress gate, raw duplicate checks before proxy normalization, preserved Host and stripped forwarding fields; Compose/environment/runbook integration.
3. Shared memory-only browser paired transport, masked Settings pairing/disconnect, captured destinations, all model and snippet call sites and after-await ownership invalidation, redirect/credentials safety, UUID result-path validation. Existing frontend remains unchanged/unpaired.
4. Migration of existing service/native/core/web fixtures and their headers/envelopes; full suite must pass without weakening assertions. The 42 failures are introduced compatibility regressions, not a pre-existing baseline.
5. Complete applicable A01–A30 expansions, seeded snippet/LRU/full file/audit/save/ID/provider oracles, all eight authorized synthetic job controls and paused-worker proof, raw framing/oversize cases, ephemeral startup checkpoints/failures, bracket IPv6 and separate health-only internal authority runtime evidence.
6. Real browser A24–A26 and private IPC/TTY/runtime qualification: **NOT RUN**. Node/JSDOM is not a substitute. No browser recipe is claimed runnable until missing paired transport/delivery integration exists.
7. Independent SPEC then QUALITY review of the finished exact candidate; parent verification/publication/closure. Correction budget remains 1/3 consumed; ordinary subset edits/test runs did not reset or consume an independent-review correction cycle.

Do not publish or close this tree as lt-sor complete. Continue implementation in this exclusive worktree, retaining failed receipts. No technical impossibility of the approved mechanism was established; this worker returned incomplete work.
