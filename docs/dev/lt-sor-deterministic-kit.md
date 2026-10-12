# lt-sor deterministic qualification kit — offline preflight, browser NOT executed

## Outcome and immutable boundary

The test-owned runtime and scheduling mechanisms now execute against frozen production code, not an authentication replacement. **No browser was launched; no host port was published.** A24–A28/LAN remain OPEN. New LAN-hash candidate review and fresh parent browser authorization remain prerequisites. Historical correction allowance **3/3 remains exhausted**; this separately authorized preparation does not reset it.

Only this document and external scratch kit files were written. No production, package, domain/web-model test, existing report/receipt, Beads, commit or push changes belong to this worker.

Kit: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/deterministic-kit/`.

All actual execution used existing runnable image **`sha256:186e3bb0a204943823c3fe0241ab36927b8fa4d32332dcadad1194c33206f152`**, i.e. reviewed CORS bytes, **not** the pending LAN-hash candidate. Approved full contract host SHA-256 stayed **`c6692549fd40f265f5fd7e7c76d511e66d279b402c37bbca8a8ec4e487417cb9`**. Original mechanism fixture was located under the worktree's `scratch/lt-sor/mechanism-preflight/`, not external cache scratch; its SHA-256 remains **`4f5aa4169fc50da432f050709750f91008b58894f23e4b2928a74cdb938202b8`**. It was read only.

## Executed evidence

| Artifact | Actual result |
| --- | --- |
| `run-76b57eb47ba8/` | **Exit 0, 8 passing phases, 117 assertions, 296 durably appended JSONL rows**; exact owned container absent; no emergency stop. |
| `run-d5b9873d8937/` | Intentional receipt negative control: **exit 1**, exactly one injected assertion failure, 297 rows; later cleanup phase passes, exact owned container absent, no emergency stop. Failure is retained, not relabeled green. |
| `runtime-run-94cd5e186ccb/` | Actual dev/preview/gating-proxy/service/foreign listeners inside network-none container: **9 passing checks**, exit 0; six cleanup records graceful, zero forced, zero remaining sockets; exact owned container absent. |
| `controller-selftest/` | Durable failed assertion retained; independent following phase executed; missing review/browser authorization refused before dispatch. No browser activity. |

Main production-module preflight independently exercises:

1. Actual Vite transform/import of `/src/model.ts`, `/src/sourceAudioSnippet.ts`, `/src/pairedTransport.ts`; historical `/apps/web/src/...` URLs fail; actual store `putMediaAsset`, schema factory and returned Linux native-path policy work.
2. Nonempty synthetic durable Save with real SQLite ACK, service-provided revision and save-count control.
3. Test-owned paused command runner; denied cleanup and DELETE do not drain, cancel, or mutate the paused worker oracle; release produces a genuine **3244-byte mono 16kHz PCM WAV** via the actual backend job and production client. Actual GET/DELETE completes and snippet map is empty **at Blob promotion**, not merely at later cleanup. Blob lifecycle release succeeds. No actual browser playback claim.
4. Real `persistIfLocalServiceAutosaveEnabled` trigger, pending PUT and production snippet polling both held before HTTP dispatch; actual service closes/restarts and generates a new capability; released old-owner requests hit actual admission and fail. Browser synthetic work remains, autosave stops, revision/path policy clear, pairing-required state is generic, and explicit re-pair/connect performs no mutation/job replay.
5. Separately, an already accepted real durable PUT commits before delayed response JSON completes. Endpoint/owner replacement fences the stale ACK: no false success, saved timestamp or revision on replacement owner. This does **not** require impossible retroactive cancellation of a legitimate commit.
6. Full seeded runtime/SQLite-table/revision/save/command/provider/file/LRU oracles around **64 denials**: **16 route/kind rows × foreign/null/missing/wrong**. Programmatic receipts reconcile **32 × 403 + 32 × 401**. All eight job kinds have accepted positive controls; terminal failed business jobs remain accepted-job failures, not admission denials. Authorized snippet GET returns WAV and increments the real LRU counter. Zero fake-provider calls.
7. Actual preview preflight `Origin: null` returns 403 and leaves full oracle unchanged; owned HTTP connection, service, preview and Vite shutdown are bounded and observed.

`runtime_preflight.py` independently exercises the **actual runtime intended for future browser attachment**, not only middlewareMode: all three corrected module URLs return actual compiled JS from the dev listener; the frozen built preview HTML references `/assets/`; real nonempty SQLite save works; real HTTP PUT and poll are both visibly gated; restart rotates authority; both old requests return **401**; full before/after oracle is unchanged by those denials; new capability gets status 200. Loopback HTTP requests with the explicit LAN Host are only an **internal authority/compiler test**, never actual LAN-browser evidence.

## Architecture and usage

- `qualification.mjs`: independently isolated mechanism phases; each row/checkpoint is appended with flush before assertion; a phase failure records only class/fixed phase and sets failing overall exit while independent phases continue.
- `matrix.mjs`: source-bound 16-row generator and finite seeded HTTP admission/positive controls; it can be reused for later browser attempts without inventing route bodies.
- `runtime.mjs`: actual backend plus dev and **image-built production preview**; test-owned reverse proxy preserves Host/Origin and holds only scheduling before backend admission. Commands are deterministic fakes. IPC operations are `oracle`, `trace`, `gate {put,poll,commands}`, `release`, `restart`, `stop`, and offline `selftest`. Restart returns the new capability solely over private attached IPC. No public oracle/bootstrap endpoint.
- `run.py`, `runtime_preflight.py`: execute disposable exact-ID containers with `--network none --rm --init --log-driver none`, no host publication, read-only synthetic media and read-only fixture mounts. The main harness has one explicit writable synthetic receipt directory. No volumes, Docker-socket/home/credential/canonical-store mounts, host installations, providers/models/microphone, real private media, firewall/router/TLS/secure-context/crypto overrides or global prune.
- `controller.py`: guarded durable receipt/independent-phase control layer. It does **not** start a process or browser when imported. Its future browser-driver adapter is intentionally **not bound or browser-executed** here; the parent must supply and review the actual driver against the new reviewed image before the single authorized finite browser dispatch. This is not an end-to-end browser-ready claim.

Reproducible commands, no browser:

```text
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/deterministic-kit/run.py
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/deterministic-kit/run.py --receipt-negative-control
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/deterministic-kit/runtime_preflight.py
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/deterministic-kit/controller.py
```

The negative-control command MUST exit 1. Each run receives a unique container/evidence directory; historical runs are never overwritten. Exact commands, image, host contract hash, fixture hash and execution/absence readbacks are retained in each execution packet. Main receipts also hash six actual frozen production modules/config and actual image-built HTML/CSS/JS; these bind the old image's tested bytes, not concurrent host hash-worker edits.

## Receipt privacy and cleanup

Capability remains in production receiveCapability closure and private attached IPC memory only. Runtime pipe uses log-driver none; offline pipe consumer deletes the capability before queueing/persisting ready/restart replies. No capability environment/file/log/stdout-to-user/command-argument/HTTP bootstrap/storage/screenshot output was produced. No raw CDP logging was used. Oracles contain only synthetic learner data; headers/expressions/stacks/raw exception messages are excluded. This is a harness-level boundary, not a comprehensive secret-forensics claim.

Resource cleanup releases only owned gates/jobs, closes upstream agent, service and owned listeners, closes readline input and Vite compiler, and awaits owned socket close-event settlement. Graceful/forced/remaining-socket records remain distinct. A deadline miss sets strict failure; bounded force applies only to owned sockets/container. Later absence never rewrites a failed strict cleanup record. All final runs exited and read back exact owned container absence; filtered Docker ps showed no remaining owned deterministic/runtime-preflight container.

## Preserved setup failures and uncertainty

- `runtime-run-3827261569f7`: module checks passed but built preview request used an unconfigured loopback authority instead of the selected LAN Host. It failed and is retained. Strict cleanup also failed its immediate owned-socket inventory despite graceful close. Fixes were test-only: explicit already-configured Host for internal preview request, and bounded socket close-event settlement **within the declared cleanup bound**.
- `run-481feeb9ab57`: attempted to source-hash the contract inside a frozen application image that contains application inputs, not documentation. Phase failed; later independent cleanup passed. Contract binding now stays at its actual host artifact; six existing production image paths are hashed inside the container. The failed receipt remains.
- Earlier successful iterations and all historical browser failure/cleanup receipts remain unmodified. No product fix was attempted by this worker.

## Remaining single browser dispatch requirements — not executed

Before any host publication/browser use: parent records new exact LAN-hash image SPEC+QUALITY approval, verifies image/source/built-asset binding and this kit/adapter, queries current actual private LAN address once, reserves unique usable ports and exact valid public-origin aliases, and explicitly authorizes the one finite run. Do not blindly reuse the old image/host tuple or a contributor image without built assets.

A24: actual masked Settings pairing, NONEMPTY synthetic UI import/save and visible durable ACK; actual fake job/poll, WAV GET, DELETE-before-Blob and playback/control policy recorded separately on dev and actual private-LAN **built assets**.

A25: foreign and sandboxed-null form POST, JSON fetch, DELETE and navigation/embed; per-attempt before/after full oracle and private-readable-byte checks persisted before assertions; browser permission/CORS errors alone are not server proof. Include all private/effect classes and eight job-kind controls, plus paused-worker denial/release control.

A26: missing/wrong allowed-origin capabilities and restart with real browser model polling AND autosave PUT pending; generic visible pair-again, stopped loops, nonempty work preserved, no replay/false ACK; explicit repair. Retain accepted-commit versus pre-admission-pending semantics above.

A27: actual endpoint edits/hostile redirects/result paths, no existing authority or snapshot transfer. A28: actual reload, disconnect, all web storage/exports/URL absence; existing receiver/tmpfs evidence retains its original separate scope, not a new claim.

**Offline mechanisms are exercised; real-browser gates, browser adapter, new candidate requalification, actual LAN import/hash behavior and playback remain unqualified.**

## Final artifact SHA-256

| File | SHA-256 |
| --- | --- |
| `qualification.mjs` | `d41d9441b4aed3ac57c72f21842894552c9e03638e4b6bc83cf51468103ad795` |
| `matrix.mjs` | `0dfe9fedc1062d21be9901420eed8127d601341eda377fc0c4f9fdfa7ff72d08` |
| `runtime.mjs` | `d53354ab643f965f293e350eb0ed714390cf92796da0b3f8d960f6ffb0ba883c` |
| `run.py` | `7e94aa495b006d22e2d6d4926931a70ecb7bbf9261c7392252af539cce8d1a9a` |
| `runtime_preflight.py` | `cd3f9b94384857d082467885295593610504e671f3ef9215aac383f0fb4f4b00` |
| `controller.py` | `7c80ac948d7bb61d19e55676b927369f947be9ac1a8f89df39ee1cfd17680e4f` |
| `run-76b57eb47ba8/rows.jsonl` | `3b1e325d240163b12290451810552c2d6ffd4e86d11e41705d1a222a3ed83c55` |
| `run-d5b9873d8937/rows.jsonl` | `3f1e30ff9d8905cd22570ba78ee61cefcb0c298635f79084967a861c7a496f14` |
| `runtime-run-94cd5e186ccb/rows.jsonl` | `42bd1b6cb2e4c7a583c9d2cb1be28796868c3467d9d1622205e3f3b9bc6a1198` |
