# lt-sor newly authorized LAN SHA-256 reuse — implementation ready for review

## Disposition and authority

The separately authorized LAN hashing slice is implemented and qualified in an exact Docker contributor image. **No browser launch, publication, commit, push, merge, deployment or Beads closure occurred.** A24/A25/A26/LAN and remaining browser gates remain OPEN; this is not lt-sor completion.

Worktree: `C:/Users/jmdzi/workspace/lingotorte/.worktrees/lt-sor-request-auth`, HEAD `66aa7660772e22912a8698764e1e581229a62d62`, preserving its existing dirty request-authenticity candidate. This explicit new scope does not renew the historical exhausted **3/3 correction allowance**. New hash scope used **two implementation variants of maximum three**, with one failed full verification retained. Independent SPEC → QUALITY review has not run here (zero of maximum two new-scope review cycles used); parent review is required before any separately authorized browser work.

## Minimal production change

- `packages/domain/src/exportManifest.ts`: generalize the existing complete SHA-256 compression/padding implementation into exported `sha256HexBytes(ArrayBuffer | Uint8Array)`. The existing UTF-8 wrapper delegates to it. Constants, rounds, canonical JSON, record concatenation, prefix, validation, restore planning and wire semantics are unchanged. The existing domain `export *` already exports the new API, so no barrel edit is necessary.
- `apps/web/src/model.ts`: preserve the async private `sha256Bytes` interface and existing Web Crypto path; when `crypto.subtle` is absent, use the shared portable core and the identical lowercase `sha256:<64 hex>` format. No caller signature changes, avoiding unnecessary conflict with the separate lt-3xg branch. Native storage `sha256File`/`sha256Text`, service revisions and pairing remain independent and unchanged.
- Input view offset/length is preserved. Padding owns a copied byte array; hashing does not mutate the caller. Invalid non-byte inputs throw instead of being coerced or skipped. No weaker FNV hash, text conversion of binary media, new dependency, upload, crypto bypass, secure-context flag, TLS or admission change.

The initial portable-always variant passed the new regression but failed the unchanged awaited-hash ownership regression in `tests/web/capturedTransport.test.ts`, because its deliberate deferred Web Crypto seam no longer ran. That entire failing full result and unhandled-rejection report are preserved. The final fallback-only variant retains the existing secure-context async behavior and all existing ownership assertions; **no existing test was edited or weakened**.

## Discriminating regression and adjacent behavior

`tests/web/lanHashImport.test.ts` executes real model local File import and the actual synthetic browser dispatch, not native storage hashing or a copied helper. Real JSDOM Crypto has random UUID support and no SubtleCrypto; no fake SHA digest or validation mock is supplied. Synthetic fetch supplies only the owned repository fixture. Original regression ran before production edits: **2/2 failed with the exact Web Crypto support TypeError** at the real media hash call sites. The frozen red test/production snapshot and raw logs remain intact. The final test additionally checks corrected transcript/cue digests, untrusted empty-cue rejection and unchanged store after rejection.

`tests/core/portableSha256.test.ts` checks empty, abc, non-ASCII/emoji/NUL/lone-surrogate UTF-8, all 256 binary byte values, 55/56/63/64/65/127/128/129-byte boundaries, one million bytes, ArrayBuffer equivalents, subarray/empty-view bounds, caller ownership, invalid inputs and export canonicalization. Independent Node `createHash` and genuine Web Crypto agree with every vector. These are executable client/unit tests, **not real-browser plain-HTTP qualification**.

Prior qualified image `sha256:186e3bb0a204943823c3fe0241ab36927b8fa4d32332dcadad1194c33206f152` and the final image execute the same export inputs with identical results:

- Empty export: `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, recordCount 0.
- Explicit canonical Unicode item: `sha256:77e54090e09c017bc18cd6be9344e53e196eb45565182a45a12858c051cd8305`, recordCount 1.
- Node abc standard vector: `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.

Portable whole-input hashing remains synchronous with one padded input copy plus a fixed 64-word schedule, not streaming. One-million-byte coverage does not qualify responsiveness or peak memory for arbitrarily large user media. No new size limit or untested streaming refactor was introduced.

## Exact-image verification

Final runnable image ID (Docker image inspect, not config digest):

`sha256:02028528632ec7aa544fc7dc87502cae513698f727b67f337f4c0163ec1d7784`

| Verification on that exact image | Actual result |
| --- | --- |
| Focused LAN import + portable SHA tests | 18 passed, exit 0 |
| Full suite | 1139 passed, 1 skipped; 49 passed files, 1 skipped file; exit 0 |
| TypeScript `--noEmit` | exit 0 |
| Vite production build | exit 0 |
| Existing no-network suite | 5 passed, exit 0 |
| Privacy marker scan | ok, 54 files; exit 0 |
| Frozen image source readback | 251 packaged source entries, zero mismatches |
| Host source versus frozen manifest | zero mismatches |
| Exact named owned container absence | verified after every command |

The full-suite skip remains the existing tmpfs-dependent `tests/core/privateDelivery.test.ts` gate, not a new waiver. The full suite includes existing deferred-hash ownership checks and admission/runtime tests. No-network proves exercised intercepted flows only; privacy scan is the existing marker scan, not a complete security/egress audit.

Snapshot manifest SHA-256: `52b7e6378b3df0965340a1a1d2128d5775acb101cbae2b46c66616cbc5d7eb72`.

Build inputs were explicitly exported into a tar archive from tracked plus permitted untracked application files, excluding host node_modules/Git/Beads/caches/private state. Symlink modes are preserved by the exporter; this closure contained **zero symlinks**, confirmed in image readback. The existing official pinned Node/npm/Debian Dockerfile was used unchanged. Contributor execution used `--rm --init --network none`, no host mounts, media mount, port publication, providers/models, host installation or real learner state. A separately inspected readback container had the exact final Image, NetworkMode `none` and `Mounts: []`. Existing preview containers were not touched; no global prune occurred.

## Binding and changed files

Only these implementation/test files changed since the red snapshot:

| File | Exact SHA-256 |
| --- | --- |
| `packages/domain/src/exportManifest.ts` | `4668088b8e9cd4f64f7b1f4bd019d4c5d65d7eb784900b7598c8583b0eadac01` |
| `apps/web/src/model.ts` | `83fd4b8612661f526d1dc571b3de3a5115cfee5e4a9b0791de17324eea335248` |
| `tests/core/portableSha256.test.ts` | `e0d1ef2dc0c8b428e9c2524576b141291045e5a4b07e108d12894f7905c35389` |
| `tests/web/lanHashImport.test.ts` | `a60cb9aec76068652927a8bbbcb2a325c8e41c93e4cf76e6209f002d581df638` |

This result document is the sole additional repository file created. Existing approved contract remains `c6692549fd40f265f5fd7e7c76d511e66d279b402c37bbca8a8ec4e487417cb9`; production CORS Vite config remains `0b6ad22a2858bc5754f5bfc666d45baf0893f1c97fb3273c72691bb63bae2110`; its regression remains `139f69defc29ec2a7e82433c6aa415d7c84ad253c22c40bb8c430b8b847b37dc`. Service, paired transport, runtime, Compose, storage, audit, restore planner, manifest validation and FSRS/practice were not edited.

## Commands and retained evidence

External task artifacts: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/lan-hash/`.

- `qualify.py red`, `qualify.py green`, `qualify.py green-final`: each freezes its own source manifest/tar, builds a unique contributor image, records exact argv/exit/raw output in its `commands.json` and logs. Red image: `sha256:f52b63cb787906fc294d181959f096b3d5a95264b9954dda8c0bec8ae698dca8`. Rejected portable-always image: `sha256:c9cf09c1750c6a44a1f4c5ffc973c64c0cf8034bcc39a4ebf80d383d6a522c1b`.
- Each check runs `docker run --rm --init --network none --name <owned-name> <exact-image-id>` followed by the existing Node/Vitest/TypeScript/Vite/privacy command. Exact argv and log references are authoritative in `green-final/commands.json`; each subsequent inspect returns no such object. Builds consume the frozen tar on stdin, not a mutable host-source mount.
- `bind.py` completed actual image/container inspect, all-source image readback, named cleanup and old/final canonical comparisons. Final JSON serialization initially failed because an intentional lone-surrogate vector cannot be written literally as UTF-8. Command outcomes/raw logs had already been saved. `recover-binding.py` reconstructs `binding-result.json` from those completed logs using lossless JSON ASCII escapes, **without Docker invocation, test replay or silently replacing the observed execution**. The serializer fix is external evidence tooling only.
- `binding-commands.json`, `binding-result.json`, `final-image-inspect.log`, `bind-inspect.log`, `bind-source-readback.log`, `canonical-prior.log`, `canonical-final.log` and all exact-name absence logs retain the binding receipts. Prior browser/correction receipts were read-only.

## Remaining gates

Parent must independently review SPEC then QUALITY against these exact file hashes/image before any future browser worker. Future supported-browser qualification must bind a new deterministic fixture to this final image plus unchanged approved admission contract/CORS bytes; retain dev/private-LAN positive controls, foreign/null preflight and zero-effect/private-byte oracles, restart during pending poll and durable PUT, delayed-body/owner-replacement fences, explicit repair/no mutation replay, stopped UI loops, WAV GET→DELETE→Blob playback and strict graceful cleanup. Capability handling, A27/A28 storage/lifetime checks, tmpfs IPC qualification and integrated restore/request reconciliation retain their own gates. No browser launch or automatic allowance renewal follows from this green offline result.
