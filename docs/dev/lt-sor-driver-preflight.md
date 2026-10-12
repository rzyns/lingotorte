# lt-sor driver preflight — new candidate, offline execution only

## Disposition

**Offline production/UI mechanisms and the private CDP adapter primitives are executable and verified. The complete live finite-browser handler set is NOT bound; this is NOT authorization or readiness for a browser launch.** No browser, host port publication, existing preview, production edit, dependency installation, provider/model/microphone, real media/state, firewall/TLS/secure-context override, commit, push, Beads operation or gate closure occurred.

Exact runnable image (Docker `.Id`, not a configuration digest):
`sha256:02028528632ec7aa544fc7dc87502cae513698f727b67f337f4c0163ec1d7784`.

Source manifest: `lan-hash/green-final/source-manifest.json`, SHA-256 `52b7e6378b3df0965340a1a1d2128d5775acb101cbae2b46c66616cbc5d7eb72`. Host source readback agrees with every manifest file. Container readback verifies the 251 packaged source files; `.dockerignore` and `Dockerfile` are explicitly build-context-only, not missing production files. New model SHA-256 is `83fd4b8612661f526d1dc571b3de3a5115cfee5e4a9b0791de17324eea335248`.

**Important discovery:** the contributor image has no `/app/dist/web/index.html` baked into its layers. Prior successful `npm run build` commands did not persist their disposable container outputs into that image. The new launcher therefore executes the actual existing `npm run build` offline inside each owned container **before runtime initialization**, then captures the resulting HTML/CSS/JS manifest. These are image-source-built assets, not a claim of baked image assets. This initialization must also be preserved and independently reviewed for any future browser fixture.

Historical review allowance remains **3/3 exhausted**; new hash scope remains **0/2 review cycles used by this worker**. SPEC then QUALITY and fresh parent authorization remain required. These preparation iterations do not reset either allowance.

## Exact executed receipts

All paths below are under:
`C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/deterministic-kit/`.

| Final receipt | Actual result |
| --- | --- |
| `adapter-driver-5394fc49b73f/` | Exit 0; 7 passing phases; 276 assertions; 306 incremental durable rows. |
| `adapter-mechanisms-9b23b64b1041/` | Exit 0; 8 passing phases; 117 assertions; 296 durable rows. |
| `adapter-driver-1b01a12bdc70/` | Intentional negative control: exit 1; exactly one failing assertion; later cleanup passes; failure retained. |
| `adapter-protocol-0b09fdc2d67e/` | Exit 0; scripted CDP queue consumed; actual helper signatures checked without importing/starting the helper; incomplete dispatch refused; failed journal assertion durably retained and independent next phase executed. **Not CDP/browser execution.** |

Every Docker run used `--rm --init --network none --log-driver none`, read-only kit/manifest/synthetic-media mounts, one writable synthetic receipt mount, and no host port publication. Exact named container absence was read back after each command; final filtered Docker ps found no owned adapter container. No emergency stop occurred in the final receipts. Actual runtime shutdown reports six graceful closures, zero forced closures and zero remaining sockets. Capabilities remain in the runtime receive callback, attached private child pipe and controller/CDP argument memory only. They are removed before reply queueing/persistence; no capability environment, argument, disk, HTTP bootstrap, screenshot or raw CDP logging is used. Exception receipts contain only class/stage, not message/stack/headers.

The executed driver environment is **Node + genuine JSDOM + actual Vite SSR/transform + real production service/SQLite/HTTP in Docker network-none**. JSDOM's genuine Crypto has UUID support and no SubtleCrypto; the new production model File import computes the portable SHA-256 and agrees with independent Node hashing. No crypto mock or digest replacement is used. Node's real File/Blob/object-URL implementation supplies the offline media object primitives; this does not qualify browser codec/playback behavior.

Actual production `renderApp` supplies the tested Settings DOM. The password/url selectors and Connect, Keep browser work, Save state now, Disconnect handlers are exercised against that DOM, not a copied UI fixture. The test-owned model/root is separate from the browser application's `main.ts` model; **no claim is made about the real application startup or built-preview model**.

The page kernel verifies current exports before use, awaits actual model/source-audio promises, captures the paired transport, uses service-returned Linux native-path policy and a valid nonempty imported store. Real UI save receives a durable SQLite ACK. Real source-audio job polling returns WAV, GET is followed by DELETE before Blob completion, and lifecycle release succeeds. Simultaneous real pending PUT and poll are gated before admission; actual service restart rotates authority; the old requests fail without oracle change; work is preserved, authority/policy/revision clear, loops stop and explicit repair does not replay mutation. The old legitimate saved timestamp stays unchanged, not erased or advanced by the denied PUT.

The separately rerun mechanism kit preserves its accepted-commit/delayed-JSON fence: a legal durable PUT committed before owner replacement remains committed, while its stale ACK cannot update the replacement owner's saved time/revision. It also preserves the full SQL tables, revision, job/snippet IDs/maps, allocation/LRU/lifecycle/in-flight, file hashes and save/command/provider oracle. Programmatic reconciliation found **64 denials, 16 route indices, 32 × 403 and 32 × 401**, all with identical before/after oracle and no private bytes. All eight accepted job-kind controls remain; accepted terminal business failures are not admission denials. Provider count remains zero.

Synthetic command-runner WAV data is deterministic PCM silence. Blob/WAV success is not proof of audible sound. `audio-policy` separately records metadata readiness, real play promise, controls and legitimate `NotAllowedError` policy outcome; it was **not invoked offline**, because JSDOM cannot qualify media playback.

## Executable commands and additions

```text
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/deterministic-kit/driver-preflight.py
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/deterministic-kit/driver-preflight.py --mechanisms
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/deterministic-kit/driver-preflight.py --receipt-negative-control
python C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/deterministic-kit/browser-adapter.py
```

The third command must exit 1. Each command creates a unique receipt directory; it never overwrites historical receipts. `adapter-artifact-manifest.json` binds additions, old kit hashes, current source image, exact origin tuple and final receipts.

| Addition | SHA-256 |
| --- | --- |
| `driver-kernel.mjs` | `48c7ec6136242115cecb23788a25b1b1880a34f1b87566ed2120b5fa7b6b5a8c` |
| `driver-offline.mjs` | `5d8d438996e155682522cacf2c11f7a9683c6add03420cbccbbdc49751e76702` |
| `driver-preflight.py` | `e522d0e97f706d25e45c3fa23bf9abddb2f0f01e4847a1cb4b1bffe19118ecc6` |
| `browser-adapter.py` | `108c41a2efb4fa4d689ee1a0e8b90eef26de88fefba91a2f76d4c39bd70d3ba4` |
| `runtime-candidate.mjs` | `083f2c8bfcc85d2ce967546c184eb2b53d77c18493473a46316471c2a384866d` |
| `qualification-candidate.mjs` | `3fcb6947cce91f65c096dc067dd72a4ab6505e7fbe6c86d57e131e35d6d40b27` |

`runtime-candidate.mjs` differs from old runtime only by returning the rotated capability over the private selftest reply; the consumer removes it before queueing/persisting. Without this handoff, the selftest's real restart left the controller holding the superseded capability. `qualification-candidate.mjs` differs only in its lane-description string; its old source and receipts remain unchanged.

Earlier setup failures are retained. Missing image-built assets and build-context-only manifest entries caused the first runs to fail; Node fetch/Host behavior, the missing rotated capability handoff and premature async Save observation were harness issues corrected only in additions. Initial failed receipts are not relabeled. All six original runnable kit hashes and the three published historical receipt hashes still match the original document.

## Finite inventory and live adapter boundary

`browser-adapter.py` exports `CdpDriver` matching the actual installed `browser_harness.helpers.cdp(method, **params)` interface. It uses awaited `Runtime.evaluate`, remote-object `Runtime.callFunctionOn` arguments, `Page.navigate` and `Runtime.releaseObject`. Kernel installation contains no capability literal. `invoke` returns only fixed safe objects; errors exclude raw CDP payloads. Runtime cleanup is independent of page/CDP cleanup. It implements the existing controller's `run_phase`/`cleanup` interface and refuses incomplete handler sets before its guarded `dispatch`.

Its generated inventory is **135 explicit planned rows: 100 denial attempts + 35 controls**. Denial channels: 64 fetch, 20 form POST, 8 navigation and 8 embed; all 16 private-read/effect/job rows are enumerated, with missing/wrong allowed-origin authentication distinct from foreign/null admission. Each of eight job kinds has a distinct positive-control row. Browser inability to read a response is never interchangeable with matching service trace status, private-byte checks and unchanged full oracle. Navigation/embed expectations are explicitly wire-dependent: a browser GET that omits Origin and Authorization must yield 401; an actual foreign/null Origin yields 403. Handlers must capture that envelope, not assume the initiating context supplies an Origin header. The final protocol receipt binds this corrected inventory; earlier driver Docker bindings retain their earlier companion-adapter hash without being rewritten.

Mappings:
- A24 dev: masked Settings, nonempty import, durable ACK, native-policy/job/poll/GET/DELETE/Blob and separate media-ready/play-or-policy-block.
- A25: all foreign/null channels, eight job controls and paused denial/release.
- A26: missing/wrong auth, both pending requests, authority rotation, preserved work/no replay, stale accepted ACK and repair.
- A27: endpoint edits, redirect rejection, hostile result paths.
- A28: reload/fresh pairing, disconnect, storage/export/URL absence.
- LAN A24: built asset binding, masked pairing, genuine insecure-context nonempty hash import, durable ACK, audio/Blob and independent playback outcome.

The system IPv4 query observed the actual private LAN address **192.168.1.3** (`vEthernet (External)`), matching the offline configured tuple `http://127.0.0.1:18342` / `http://192.168.1.3:18343`. Other VPN/virtual addresses were not selected. Internal loopback HTTP with explicit LAN Host is compiler/authority evidence only, not a LAN-browser run or a reservation of host ports.

### Remaining blockers — do not launch a browser from this packet

The CDP primitives and dev kernel are bound/offline-tested, but **the 135 live handler implementations are not supplied**. The adapter deliberately refuses dispatch without their exact complete set. Foreign/null sandbox and per-attempt actual browser transport, redirect/reload evidence and real built-preview UI startup remain unexecuted and not fully wired. In particular, `install_dev` imports `/src/...`; the built preview cannot use that dev bridge. A reviewed built-UI-only adapter must preserve actual asset/startup identity instead of silently substituting the dev kernel or replacing the built model/root.

The private runtime callback contract is `capability()` and `request(op, ...)`; its owned process queue is exercised by the offline runner, but a live parent binding must stay in private memory, never normal tool stdout. Reviewed finite handlers must validate safe results/oracles and prove every required row, not merely register callbacks returning success. Actual browser media-ready/play policy, LAN import behavior, form/fetch/navigation/embed server proof, A27/A28 and browser raw transport remain OPEN. No browser dispatch should be approved solely because these offline receipts are green.
