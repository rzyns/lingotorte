# LT-SOR A17 explicit zero-length wire controls

## Outcome and scope

A17's remaining positive-control gap is closed in `tests/core/requestRuntime.test.ts`. This is additional evidence for already-working product behavior, not a product bug fix or a fabricated red/green product regression. No application, admission, proxy, configuration, browser, or durable qualification-harness source was changed. No commit, staging, push, or Beads closure was performed.

The existing seeded actual-service test now sends explicit `Content-Length: 0` through Node `http.request` for four authenticated GETs (status, state, queued job, completed snippet) and one authenticated snippet DELETE. It does not infer a GET header from Node defaults. A test-only passive `Server.prototype.emit` observer delegates unchanged to the original implementation and records only method, synthetic route, and the raw Content-Length/Content-Type/Transfer-Encoding fields. Each request is observed at the real Node server boundary with exactly `['Content-Length', '0']`, hence no Content-Type or Transfer-Encoding; no authorization field or capability is retained or printed. The observer is restored in the test's finally block.

All GETs return 200. State returns the exact seeded snapshot/revision; the job returns the seeded job ID; snippet GET returns exact synthetic WAV bytes and audio/wav. The full runtime/SQLite/save/runner/provider/file oracle remains identical for status/state/job. Snippet GET changes only its last-access entry and the LRU counter. DELETE returns empty 204, not a masked 404, and changes only the selected snippet-map entry and its file; every other oracle field stays identical. Existing 930 seeded denials, sixteen zero-length OPTIONS controls, and nonzero/type/TE controls remain intact. Capabilities are still delivered only through the private fixture callback.

## Frozen execution binding

Checkpoint: `8325bb8f171a648e681f241e4c4586d63644d153`.

Actual inspected/executed image: `sha256:0252570b9885e2fd20ba6bf76ac2877ce2c9cefa30565554bcf09fc7954796c0` (`lingotorte:lt-sor-a17`).

Unchanged parent dependency/product base: `sha256:cf506d5ad902a03bf311aab056a44fdd9264e4e2367f1cf0a4631aa66dddab92`.

Test SHA-256: `fb574a77ba4ac0b01712fb9b3144eeb7685d98a3e8dfb3ee3ec5b28a42923a44`.

External packet: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor-harness/a17/`.

`source-manifest.json` LF-normalized SHA-256: `a7a40d29ed1b4171112b36502ac663620960315caa72f4b1ea562280a94c3510`; actual on-disk file-byte SHA-256: `dd0943b3ebc2f331f54de26eb988fd3c7a9e933948fb8893133b88231cb404be`. It includes all 253 tracked build/source inputs plus eleven current untracked durable harness inputs: 264 entries, 262 packaged files, zero image-byte mismatches. Dockerfile and .dockerignore remain explicit build-context entries rather than falsely claimed packaged files. All six workspace aliases resolve into `/app/packages`.

The successor image is a scratch-only offline overlay of the inspected parent image: copies the changed test and the current durable `scripts/qualification` / `tests/qualification` directories without modifying those sources. The full checked-in Dockerfile could not rebuild offline because its apt dependency layer was not cached; no network-enabled dependency installation was substituted. A bare image-ID FROM was also rejected by BuildKit; the successful overlay uses the local parent tag whose immutable ID was checked before building. Its build output resolves that exact parent ID. An initial overlay exposed nine current durable harness byte mismatches against the older checkpoint image; explicitly copying the current kit resolved these, with full manifest readback before tests. Original image and prior browser packet are retained.

Every test command uses the immutable successor ID with `docker run --rm --init --network none`, no host mounts, synthetic guest-local fixtures, and provider-off configuration. Manifest readback uses stdin rather than mounting host inputs. Receipts contain actual command, process exit, stdout, and stderr.

| Receipt | Command after the Docker prefix/image | Actual result |
| --- | --- | --- |
| `focused.json` | `node node_modules/vitest/vitest.mjs run tests/core/requestRuntime.test.ts` | 12 passed; four GET and one DELETE boundary observations |
| `types.json` | `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| `full-rerun.json` | `node node_modules/vitest/vitest.mjs run` | 1139 passed, 1 existing private-delivery skip; 49 files passed, 1 skipped |
| `vite-build.json` | `node node_modules/vite/bin/vite.js build --config vite.config.ts` | exit 0, 33 modules |
| `no-network.json` | `node node_modules/vitest/vitest.mjs run tests/no-network` | 5 passed |
| `privacy.json` | `node scripts/check-privacy-boundaries.mjs` | ok, 58 files |
| `harness-rerun.json` | `python3 tests/qualification/test_lt_sor_harness.py -v` with `-e LT_SOR_SCRATCH=/scratch/a17` before image | 10 passed |

Focused and full green receipts both emit the sanitized aggregate: `get:4`, `delete:1`, `boundaryRequests:5`, exact zero-length raw envelope, absent type/TE, unchanged read oracle, snippet-only LRU and delete-only map/file changes. The existing denial count remains 930, fake provider calls zero.

## Retained failures and limits

`pre-typefix/` retains the earlier focused pass and TypeScript failure for a missing observer `this: Server` annotation. That test-only annotation was corrected before freezing the qualifying image. `full.json` retains a first full run on the final image with one frontend UI fixture failure (`currentMedia` was undefined instead of `owned-clip`); the unchanged image's fresh full rerun passed. This is an observed intermittent outcome, not a diagnosed frontend defect or an erased failure. `harness.json` retains the optional Python suite's missing scratch-environment setup error; the explicit guest-local scratch rerun passed. Initial overlay/readback receipts remain under `initial-*`.

No browser rerun was performed or needed to supply this Node wire evidence. The parent-owned production/browser evidence and quality/spec review remain separate; this supplement does not reclassify the existing private-IPC skip or assert final publication approval. Earlier acceptance-final3 receipts retain their narrower historical coverage; only their A17 mapping is linked forward to this supplement.
