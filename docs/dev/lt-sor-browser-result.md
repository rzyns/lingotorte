# lt-sor real-browser qualification: blocked, not accepted

## Bound candidate and browser

- Runnable image: `sha256:08f8d07f9c75fec44ff60cb06757c99c3f5118fdaf793dcb24c74381499cef76`.
- Parent joined binding receipt SHA-256: `f8bdecf19aa75e278ac6a06c4849c3708ef1b74d39ed8dae62a02d3ac344e2f2`.
- Real CDP browser: `Chrome/145.0.7632.6`, revision `@47e20adcc15fc15f01825aa17e570c8f5492ac0f`, protocol `1.3`.
- The older preflight receipt's `35f615…` image requirement was a config-digest mistake, not a product failure; its receipt remains preserved.

## Actual execution

Three bounded mechanism attempts ran two synthetic profiles each (six fixture starts). All reached the fixture's real backend/startup readiness. No A24–A26 gate completed.

| Attempt | Dev same-origin | Docker preview/private-LAN |
|---|---|---|
| 1 | `127.0.0.1:56431`, browser connection refused | `192.168.1.3:56441`, browser connection refused |
| 2 | Same refusal; controller HTTP also failed | Same refusal; controller HTTP also failed |
| 3 | `127.0.0.1:18031`, real application Settings reached | `192.168.1.3:18041`, root HTTP 404 |

In attempt 3, the dev browser verified a password-type pairing field and cleared input after explicit Connect. Its visible message remained “Connecting and comparing durable state; browser work is kept.” The subsequent synthetic networking journey raised a browser evaluation exception before its summarized result could be returned. Exception details were deliberately suppressed because the evaluation contained the private test capability. No successful connect, state-save ACK, fake job completion, WAV deletion/playback, negative-oracle comparison, preflight coverage, or restart/autosave result is claimed.

The LAN preview container was running with published `5173`→`18041` and `5175`→`18042`, but its configured public root returned 404. Both final containers' internal non-public-authority probes returned 403, consistent with exact public ingress; this is not proof of a working public deployment. Switching from the high ports to lower ports reached the dev UI, but the cause of the initial connection refusals was not established.

## Boundaries and evidence

Scratch root: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/`.

- `executed-fixture.ts`: actually executed Docker-only fixture; SHA-256 `3ea2a1542734088c3c559cc28714ff8d1346780a408278ae7317658fffcc847a`. Its absolute imports are intentional frozen-image paths, not a host TypeScript application module.
- `controller.py`: browser-helper/CDP controller, corrected after execution only to point at the identical scratch fixture. Do not rerun automatically: the three-attempt mechanism allowance is exhausted.
- `real-browser-receipt-attempt1.json`, `real-browser-receipt-attempt2.json`, `real-browser-receipt.json`: preserved failure and cleanup records. The earlier preflight record is also retained.

Backend `receiveCapability` delivered only to a private in-process closure and Docker's dedicated attached controller pipe. Docker logging was disabled with `--log-driver none`. No capability was intentionally emitted in tool output, receipts, environment, command arguments, URLs, HTTP bootstrap, files, screenshots, or browser storage dumps. Private bearer injection occurred within the controller's CDP evaluation, not through a public fake capability or HTTP token endpoint. The receipt's disclosure flag records controller handling, not an independent forensic proof of all browser internals.

Only synthetic media was mounted read-only; the fixture itself was mounted read-only. Container-local writable layers held disposable state/scratch/models. No volumes, host credentials/home mounts, Docker socket mounts, provider endpoints, model downloads, microphone access, firewall/router changes, host installs, or real learner state were used. Provider and command fakes were installed, but their execution counts were not retrieved before the blocked journeys; zero counts are therefore **unknown**, not asserted.

Cleanup readback verified absence of all six owned containers and closure of their controller processes/pipes. A final `docker ps -a --filter name=lt-sor-browser-` returned no rows. No global prune was used. Production sources were unchanged. A temporary worktree fixture was removed to avoid introducing Docker-only absolute imports into the application's TypeScript scope; the executed bytes remain in scratch. Host typechecking was unavailable (`node_modules/typescript/bin/tsc` missing); no host installation was attempted.

## Remaining gates / smallest continuation

A24, A25 and A26 remain open. Foreign/null-origin attacks and their before/after server oracles did not run; browser blocking is not substituted for server rejection. Restart/polling/autosave, no-replay/no-false-ACK, endpoint changes, reload/storage lifetime, Blob playback, real preflights and browser local-network prompt behavior remain unqualified.

Stop here under the existing mechanism limit; do not consume a fourth attempt or reset the inherited review allowance. An explicit bounded continuation disposition is needed. The smallest next work is fixture diagnosis, not a product change: verify that this exact frozen image serves a built preview root, explicitly configure the dev UI's same-origin service endpoint, then capture sanitized exception class/location and status-only request observations (never Authorization headers or raw CDP payloads). First reach a confirmed authorized status/state positive before resuming the remaining browser matrix. This run does not establish a product defect or justify a production-source edit.
