# LT-SOR qualification harness repair

## Result and scope

The durable kit is now under `scripts/qualification/lt-sor/`, with regression tests under `tests/qualification/`. It adapts the reviewed deterministic live-v2 kit, not a new browser framework. No application, admission, CORS, capability, deployment, firewall, TLS, real learner data or provider behavior was changed. No commit, push or Beads mutation was performed by this repair worker.

Checkpoint: `8325bb8f171a648e681f241e4c4586d63644d153`.

Actual contributor image inspected and executed:
`sha256:cf506d5ad902a03bf311aab056a44fdd9264e4e2367f1cf0a4631aa66dddab92`.

The checkpoint manifest contains 253 source/build-input entries, SHA-256
`7a0cc3cae41728bca7bd3ca3ae5c5431bd5d4b8b57b11d5618697f820c0ead85`.
Image readback found zero packaged-source mismatches. All six `@lingotorte/*` aliases resolve into this image's `/app/packages`, not an ancestor checkout. The manifest deliberately treats `Dockerfile` and `.dockerignore` as build-context inputs, not packaged application files.

| Verification | Actual outcome |
| --- | --- |
| Original journal diagnostic regression | Failed: `None != 'BrowserNavigationDeadline'` |
| Repaired Python regression suite | 10 passed, both Windows Python and image Python |
| Actual Docker service/SQLite + built-startup JSDOM readiness | 391 checks; no failed phases; no forced cleanup |
| Wrong-mapping injected offline control | Exit 1 at the intended mapping assertion; independent strict cleanup passed |
| Targeted real Chrome matrix | 27 asserted rows: 24 PASS, 3 OBSERVED_BROWSER_BLOCK, 0 FAILED |
| Full real Chrome matrix | 135 attempted/135 contract-satisfied: 131 PASS, 4 OBSERVED_BROWSER_BLOCK, 0 FAILED, 0 SKIPPED_CASCADE |
| Checkpoint Docker typecheck/build/Vitest | Exit 0; 1139 passed, 1 existing private-delivery skip |

The four observed browser exclusions are `null-embed-0` through `null-embed-3`. They are **not** reported as server 403s. They satisfy A25's explicit requirement to record browser blocks, with independently unchanged effects/private-byte oracles. This report does not itself close A01–A30, authorize publication, or remove the existing private-IPC qualification limitation.

## Repairs and evidence

### Safe diagnostics

`controller.py` defines `DiagnosticError` with fixed allowlisted tags, CDP method names and categories. Journals retain these structured fields, never exception messages, stacks, CDP expressions, headers or arguments. Unexpected exception types and messages reduce to a fixed diagnostic. The DOM bridge projects only exact known DOM error tags; arbitrary JavaScript errors are not exported. The regression test injects a synthetic secret through the actual journal and CDP-call seams and verifies it is absent.

The historical journal's class-only output fails the new test. All original cache harnesses and failed receipts remain unchanged outside Git.

### Owned target and LAN

The driver creates its own target through browser-root `Target.createTarget`, attaches its own explicit session, and never changes the helper's default session to that target. Page/Runtime calls use the owned session; Target calls use the browser-root route. Cleanup checks the close acknowledgement and reads back the exact target ID before discarding it. Runtime cleanup remains independent of browser failure, and its verdict is separately retained as `runtimeStrictPass`.

The installed helper was inspected and exercised, rather than relying on an obsolete absolute helper path. The earlier LAN navigation failure was not reproduced with the current helper and root/session-owned routing; its old underlying cause is not retrospectively proven. The repaired run did prove real built-asset binding, actual UI startup, explicit pairing, native Linux path-policy hydration, insecure-context nonempty import without `crypto.subtle`, durable SQLite acknowledgement, snippet GET/DELETE/Blob ownership, metadata readiness and playback-policy disposition on LAN.

The selected native address `192.168.1.3` was re-queried at launch. The first full run used loopback ports 18442 and 18449 and private-LAN port 18443; the final diagnostic-hardened full run used 18542/18543/18549, mapped to the fixture's existing internal ports. An earlier prelaunch reservation on 18342/18343/18349 failed with Windows 10048 after targeted runs. No listener/container remained; readback showed Chrome client CLOSE_WAIT connections. No browser process or unrelated tab was terminated. Explicit fresh task-owned host ports were used, and redirect/hostile-result controls followed the selected foreign fixture origin.

### Native media

The isolated audio diagnostic reproduced `readyState=0`, `networkState=2`, valid Blob source and metadata preload, with no native media error. Calling native `load()` alone did not resolve it. Activating the owned background target did: native readiness reached 4 and network state reached 1. A separate diagnostic native user-gesture play succeeded without replacing media APIs.

The durable media gate therefore activates only its own target and records native state before and after activation. In the full run, dev readiness changed 0→4; LAN readiness was 4. Both normal `play()` attempts returned `NotAllowedError` with no media error, recorded as the contract-permitted autoplay-policy block rather than successful playback. Synthetic WAV decoding is checked on the audio element, not a video element. Only source protocol/length and numeric media status are retained, never Blob URLs.

### Observed opaque-sandbox embed exclusions

The frame bridge records the actual declared opaque sandbox, connected EMBED element, load/error counts and exact attempted-resource count. A row is classified OBSERVED_BROWSER_BLOCK only when:

- its otherwise-valid fixture was seeded and the complete pre/post SQL/maps/LRU/files/revisions/fake-runner/provider digest is unchanged;
- no ingress request and no matching frame resource load were observed;
- the embed is connected in the real opaque-sandbox frame, without a bridge deadline or load event;
- the corresponding unsandboxed foreign embed **and** sandboxed iframe-navigation controls both really reached the server, satisfied their envelope-specific denial expectations and preserved their private/effects oracles.

No request by itself cannot pass this classifier. Missing controls, changed oracle, disconnected element, nonopaque frame, resource observation or timeout fail the regression tests. If an actual request arrives instead, ordinary server-denial rules apply and the row is PASS/FAILED, never silently changed into a browser block. The targeted run observed three exclusions and one actual denial; the full run observed four exclusions. No Chrome policy console event was observed in the diagnostic probe: the classification is a differential browser exclusion, not proof of Chrome's internal reason or of application rejection.

## Durable entrypoints

- `live-controller-v2.py`: reviewed finite dispatch, private Docker pipe, owned CDP mechanics, manifest/kit binding and durable receipts. CLI executes **offline only**; live dispatch remains an explicit private in-process call.
- `runtime-live-v2.mjs`: real product service/SQLite and real Vite dev/preview, synthetic command/provider seams, complete oracle and independently awaited cleanup.
- `dom-live-v2.mjs`: actual shipped UI controls and native browser media/crypto; observational fetch/Blob hooks are restored during cleanup.
- `inventory.py` / `matrix.mjs`: exact 135-row browser inventory and sixteen otherwise-valid route/job-kind mappings.
- `live-offline-v2.mjs`: preserved original offline startup and HTTP readiness path.
- `freeze.py`: tracked build-input manifest plus actual image-byte and workspace-alias readback; starts no application.
- `test_lt_sor_harness.py`: diagnostic red/green proof, secret scrub, mapping negative control, owned session/root cleanup protocol and browser-exclusion negative controls.

The original runtime shutdown source segment is byte-identical in the successor. An actual image TypeScript 6.0.3 AST-source comparison also preserved the complete `boot`, `shutdown`, `commandRunner`, `oracle` and `seed` definitions; it executed no application. Original runtime uses LF, no CRLF. Matrix and offline entrypoint bytes are also unchanged. Redirect and hostile-result fixture origins are the only runtime-source adaptations; service/process cleanup assertions were not weakened.

Inputs use repository-relative discovery and explicit `LT_SOR_IMAGE`, `LT_SOR_MANIFEST`, `LT_SOR_SCRATCH` and optional `LT_SOR_PORTS`/`LT_SOR_HELPER`. `LT_SOR_SCRATCH` must point to the task's explicit Hermes scratch, not the system temporary directory. No receipts, real media, private content, caches or copied capabilities are committed. Synthetic fixture files and built-asset hashes are generated into external owned output. Capabilities remain private pipe/CDP memory only; Docker logging is disabled and capabilities are never put in environment/arguments/files/screenshots/browser storage.

## Reproduction

From the candidate checkout in Git Bash, set nonsecret runtime bindings:

```bash
export LT_SOR_SCRATCH='<explicit Hermes scratch directory>'
export LT_SOR_IMAGE='sha256:cf506d5ad902a03bf311aab056a44fdd9264e4e2367f1cf0a4631aa66dddab92'
python scripts/qualification/lt-sor/freeze.py "$LT_SOR_IMAGE"
export LT_SOR_MANIFEST="$LT_SOR_SCRATCH/lt-sor-harness/checkpoint-source-manifest.json"
python tests/qualification/test_lt_sor_harness.py -v
python scripts/qualification/lt-sor/live-controller-v2.py
python scripts/qualification/lt-sor/live-controller-v2.py --wrong-mapping # intentional exit 1
```

Build a successor contributor image and inspect its runnable identity before rebinding after any packaged-source change; do not use the build log's config digest. Host npm tests are not claimed here; the product checks were Docker-only.

For a separately authorized real-browser run, load `live-controller-v2.py` with `importlib.util.spec_from_file_location` inside the private `browser_exec` interpreter, set the same nonsecret environment, and invoke:

```python
result = module.run_live(
    cdp,
    {'image': module.IMAGE, 'specApproved': True,
     'qualityApproved': True, 'browserAuthorized': True},
    new_tab=new_tab, lan='<queried chosen private IPv4>')
print(json.dumps(result))  # sanitized aggregate only; never print IPC/CDP values
```

Supply the three selected owned host ports with `LT_SOR_PORTS` when the default ports cannot be exclusively reserved. Do not set review/authorization assertions true unless they actually hold for the candidate and intended execution.

## Retained external evidence

Under `$LT_SOR_SCRATCH/lt-sor-harness/`:

- `targeted-red-3e39bcec9867/`: media-ready failure retained with CDP tag/category; LAN binding and strict cleanup passed.
- `media-diagnosis-3ab6d3eb8381/` and `media-activation-f465ac28f959/`: bounded native media diagnostic phases (tool-output observations, not full qualification receipts).
- `sandbox-diagnosis-4a441c8b07c0/proof.json`: zero-request unchanged-oracle probe. Its early tool result reported cleanup false without a full cleanup receipt, so this probe is **not** used as strict-cleanup evidence.
- `targeted-green-5c7d2654e381/`: targeted browser matrix and strict cleanup.
- `live-v2-8d294a5f19e1/`: first full real-browser green.
- `live-v2-aaf15b41aace/`: final diagnostic-hardened full real-browser binding, rows, execution and independently read-back provenance, same 131 PASS/4 OBSERVED_BROWSER_BLOCK outcome.
- `live-v2-offline-68d300a08519/`: retained initial JSDOM incompatibility with `frame.sandbox`; fixed by reading the declared sandbox attribute without altering browser policy.
- `live-v2-offline-2bb7196ab2a6/`: initial offline readiness green.
- `live-v2-offline-d3e6574a09c5/`: final diagnostic-hardened offline readiness green.
- `live-v2-offline-b29e757ede19/`: wrong-mapping negative control and independent cleanup.
- `regression-red.json`, `regression-green.json`, `docker-harness-tests.json`, `regression-green-final.json`, `docker-harness-tests-final.json`, `offline-final.json`, `docker-quality.json`, `freeze-readback.json`, `preservation.json`, `preservation-ast.json`: executed commands and exact results/preservation observations. The final suites include runtime-error-tag and mutated-diagnostic-secret controls in addition to the original eight tests.

Full browser receipt SHA-256:

| File | SHA-256 |
| --- | --- |
| `binding.json` | `e3f10ac100d507e385bfaa6dcd97adf529449f75bec28a160279668cfbd865b3` |
| `rows.jsonl` | `7e94295281cc3cc1858c8d0c61932e717eb0f25701ad4280aee1518358d82380` |
| `execution.json` | `b5f49c39e12ca1f7fda15be254fbea30949e47d25ac095fe7f30b1f355eeee9f` |

Chrome `145.0.7632.6`, protocol `1.3`; actual helper SHA-256
`5ea8560a01b74281833923720ffd23ca8e4f6b873c2419c821f7695a04091cf3`.
Final artifact hash readback matched the complete executed kit. Cleanup receipt: six graceful closures, zero forced closures, zero remaining runtime sockets, container absent, exit 0, no browser cleanup issue and exact owned target absent. Independent browser readback found zero remaining targets on the selected owned origins. Historical failures were not relabeled or deleted.
