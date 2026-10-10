# lt-8s9 native-path implementation evidence

Baseline: `2b00592`, branch `work/lt-8s9-native-paths`. Synthetic external stores only; providers off. Parent owns reviews/commits. Launcher and Python selector are separate workers/issues.

## RED
- Existing focused service/transcription suite: exit 1 (external `lt-8s9-paths/red-existing.json`). SQLite drive-qualified guard and POSIX argument assumptions reproduce the baseline.
- `nativePathRegression.test.ts`: 1 failed, expected rejection of `//server/share/clip.mp4`, received successful ffprobe listing and runner invocation. Raw path normalized before policy validation.
- Commands use ancestor `node_modules/vitest/vitest.mjs`, external `lt-8s9-paths/vitest.config.mjs`, `--configLoader runner`; TEMP/TMP redirected externally.

## Deviations
- Running implementation notes are consolidated here rather than a second root tracking document.

## Discovered edge cases
- `path.isAbsolute` accepts current-drive-rooted and UNC Windows strings. Browser POSIX guards and SQLite disagree with adapters.
- Existing fake runners often have no input file at all; filesystem fixtures must become explicit external native files, not a production validation bypass.
- Existing cleanup recursively deletes all configured scratch contents. Ownership must be bounded to a newly created per-run child, retaining unrelated parent files.

- Associated Git worktree metadata includes a stale foreign Linux registration on this Windows host. Native exclusions include every host-valid registration plus executing/primary checkout; foreign namespaces are never translated or queried.
- Test environment must map workspace package aliases to this worktree, not ancestor node_modules symlinks pointing at primary. External Vitest/Vite/TS configs do this; no dependencies installed.
- Fixture-named import APIs are explicitly synthetic; user imports retain their separate ownership gates. No string substring assigns provenance.
- Scratch parent artifacts (including previous-run children) are retained; cleanup only handles this service run. Cross-job cancellation/race redesign remains later safety work, not silently claimed solved.

## Questions for review
- None requiring scope expansion. Capability version unknown must disable native jobs, not playback.

## GREEN / remaining gates

Final candidate after QUALITY directory-role correction, cycle 2/3 (uncommitted, parent re-review required): changed TypeScript/MJS manifest SHA-256 `1ba99a848d662096b3b751fae7c436642fbaa7f51e9f0fa846106deb61b5f10a`. Computed from sorted changed/untracked code paths mapped to file-byte SHA-256, compact sorted-key JSON, then SHA-256. Documentation is excluded to avoid a self-reference.

| Gate | Observed result |
| --- | --- |
| Existing RED service + transcription | 21 tests: 5 passed, 16 failed; SQLite guard/Windows literal argument expectations and missing python3. |
| Raw UNC regression RED → GREEN | Original ffprobe adapter accepted `//server/share/clip.mp4` and invoked fake runner; now rejects before runner (1/1). |
| Pure platform/purpose matrix | 468/468 passed, explicitly parameterized Windows and Linux, no filesystem qualification claim. |
| Native roots/API/SQLite regressions | 16/16 passed, including real Windows junction creation, repository-target rejection, non-traversal cleanup, dedicated external scratch-junction support, native disk SQLite save/reopen and all five API job path gates. |
| Browser submission gates | 155/155 passed across both declared service platforms and all native job types; missing/unknown capability fails closed. Additional Windows DOM button-state regression passed. |
| Full final test suite after QUALITY directory-role correction | **983 total, 979 passed, 4 failed, 0 pending**, exit 1 (`roles-full.json`). All four failures are existing `spawn python3 ENOENT`: two lazy help tests and two fake-module Python tests. No skipped required fake tests. |
| `test:no-network` equivalent | 5/5 passed, exit 0. Providers off except existing explicitly injected HTTP fakes; no real provider calls. |
| Typecheck | Worktree-mapped external TS config, exit 0. Plain ancestor-resolution invocation initially surfaced duplicate private LocalStore types from primary/worktree, not product type errors; mappings were corrected rather than changing types. |
| Production build | Vite 8.0.16, external cache/output, 32 modules transformed, exit 0. Browser bundle does not import Node path/fs helpers. |
| Direct Node graph + service | Native Node v26.7.0/win32 imported direct `.ts` graph, started loopback service, verified status capability/redaction, saved state, closed, reopened file-backed SQLite and read state, then closed and deleted only the unique external synthetic root. Script/root filenames contain spaces and Unicode. |
| Privacy / diff | Privacy scan `ok: true`, 48 files; `git diff --check` exit 0. |

The dedicated external scratch-junction case was separately made RED (cleanup rejected the lexical alias and left SQLite open). The fix allocates the owned run child beneath the resolved approved target and closes SQLite even if cleanup refuses. Its same test then passed; included in the final full run.

### Reproduction commands

Use the exact candidate worktree as cwd. `<deps>` is the existing primary checkout `node_modules`, `<scratch>` is the external `lt-8s9-paths` task directory under Hermes scratch. Set native `TEMP` and `TMP` to that external directory; never point them into the repository.

```text
node <deps>/vitest/vitest.mjs run --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/full-final.json
node <deps>/vitest/vitest.mjs run tests/no-network --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/no-network.json
node <deps>/typescript/bin/tsc --noEmit --project <scratch>/tsconfig.json
node <deps>/vite/bin/vite.js build --config <scratch>/vite.config.mjs --configLoader runner
node "<scratch>/direct node smoke.mjs"
node scripts/check-privacy-boundaries.mjs
git diff --check
```

External configs preserve original test/build options, redirect root/cache/output, and map each `@lingotorte/<package>` to this candidate's `packages/<package>/src/index.ts`. TS config extends the repository config, maps package and wildcard imports into this worktree, and points Node/Vitest type libraries to the existing dependency root. Reports retained externally: `red-existing.json`, `focused-2.json`, `browser-gates.json`, `full-final.json`, `no-network.json`. The initial UNC and scratch-junction RED results are tool transcripts, not fabricated JSON reports.

### Integration assertions / boundaries

- Parent can now start **lt-tow** edits: `server.ts`, adapter index and transcription test file are released. Browser payload executable overrides are already ignored in favor of service runtime values; use the shared `nativeExecutable` guard. The platform Python selector/env override is intentionally **not implemented here**; defaults and four Python tests still use `python3`.
- Launcher script/tests were not touched or run. Launcher failures/evidence belong to the launcher worker. Core starts without Python: verified direct service + SQLite receipt above.
- Re-run all gates after integrating launcher/Python and after parent review corrections; do not interpret this exit-1 full suite as a green milestone. No commit, push, Beads write or closure by this worker.
- Windows DOM tests are fake-browser evidence, not the disposable Edge smoke. Native Linux runtime/browser, real ASR, downloads/models/providers, relink, request pairing/authentication and restore correctness remain unqualified/deferred to their named phases.
- The operator must select **local, non-synced** roots/media. Lexical rejection of UNC and resolved-target checks do not detect mapped remote drives, remote mounts or synchronization software; no physical-locality/rights claim is made.
- Cleanup is scoped to the freshly owned run child, never the operator scratch parent or previous-run children. Cross-job cancellation/races remain later safety work; this patch does not claim general lifecycle confinement against a hostile local OS user.

### Exact changed paths

```text
apps/local-service/src/nativeConfig.ts
apps/local-service/src/server.ts
apps/web/src/app.ts
apps/web/src/model.ts
apps/web/src/sourceAudioSnippet.ts
apps/web/src/uiTypes.ts
docs/dev/lt-8s9-native-path-evidence.md
packages/domain/src/nativePaths.ts
packages/domain/src/nativePathsNode.ts
packages/local-transcription/src/index.ts
packages/storage/src/sqliteLocalPersistence.ts
tests/core/b6SourceMediaSnippet.test.ts
tests/core/b7EmbeddedSubtitleExtraction.test.ts
tests/core/localService.test.ts
tests/core/localTranscriptionPipeline.test.ts
tests/core/nativeConfig.test.ts
tests/core/nativePathRegression.test.ts
tests/core/nativePaths.test.ts
tests/core/p7TranscriptAdapters.test.ts
tests/helpers/nativeFixtures.ts
tests/web/b6VisualRangeFrontend.test.ts
tests/web/b7EmbeddedSubtitleFrontend.test.ts
tests/web/nativePathGates.test.ts
tests/web/p7TranscriptLifecycleFrontend.test.ts
```

### SPEC correction: regular-file ancestors (cycle 1)

- Root cause: Windows `lstatSync(file/child)` can return `ENOENT`. The resolver climbed to the existing regular file and appended the missing suffix without checking its type; `assertNativeOutput` then also accepted the leaf's `ENOENT`. Startup could create the DB parent before failing on scratch/cache, and adapters invoked the runner with impossible output paths.
- Exact production change: after `realpathSync(current)`, require `statSync(resolved).isDirectory()` whenever `suffix.length > 0`. Check the resolved target, not the link's lstat type, preserving dedicated directory junctions. Existing leaf-type checks and no-follow cleanup remain unchanged.
- Changed in this correction only: `packages/domain/src/nativePathsNode.ts`, `tests/core/nativePathRegression.test.ts`, and this evidence file. No server, launcher, Python selector, provider, or cleanup edits.
- RED on real **win32 / Node v26.7.0**, before the production edit: **19 tests, 18 failed, 1 passed**, exit 1, `ancestor-red.json`. Both output purposes accepted file descendants; all four mutable-config fields accepted them; scratch/cache failures left new directories behind; all three output adapters called their fake runner. DB rejection occurred only at mkdir, and invalid dataDir even allowed service startup. Fixtures were synthetic unique external directories and were removed afterward.
- RED source SHA-256: `nativePathsNode.ts` = `3a15d0ec87a54e9a618d6bf3328ddbdd063b8343eaf232a046698cb9a76fc88e`; regression test = `79d79b20556a09d2baa90ccce250d37a8865971a15db932e2b3230c6c056e6f8`.
- Same negative cases GREEN after the fix; two positive junction-descendant controls added afterward. Final regression file **21/21 passed**: 18 new rejection cases, two new directory-junction controls, and the existing raw UNC case. Rejection cases cover one- and two-component suffixes, output-file/directory, DB/scratch/cache/data roots, and audio/snippet/subtitle adapters. Startup assertions require TypeError, zero runner calls, unchanged ancestor bytes, and no new directory/DB artifacts (not merely eventual startup failure).
- Final focused run **665/665 passed**, exit 0 (`ancestor-focused-final.json`): regression 21, native config 16, platform matrix 468, browser gates 155, no-network 5. Existing dedicated scratch-junction startup and no-follow cleanup tests passed unchanged.
- Full suite **961 total, 957 passed, 4 failed, 0 pending**, exit 1 (`ancestor-full.json`): only the same four `spawn python3 ENOENT` tests. Typecheck, production build (32 modules), privacy scan (48 files), direct Node service/SQLite save-reopen smoke, and `git diff --check` all passed again. No Linux-host filesystem qualification is claimed.
- Final file SHA-256: `nativePathsNode.ts` = `d4f7fee5666fd654f8b9b9eaf0317111d8c766515c5b10cd1702ec84000f21ab`; regression test = `66e355ad0bbd2013134403a722ad79bd9e03407fe4b53218a1dee9afa138621f`. Candidate manifest hash above supersedes the pre-correction hash `38c701ecf1829074c140a88df0509ac67e4ada08743851a8b21d5427125b3844`.

Commands (same external dependencies/configs and TEMP/TMP as above; RED command executed before the production change):

```text
node <deps>/vitest/vitest.mjs run tests/core/nativePathRegression.test.ts --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/ancestor-red.json
node <deps>/vitest/vitest.mjs run tests/core/nativePathRegression.test.ts tests/core/nativeConfig.test.ts tests/core/nativePaths.test.ts tests/web/nativePathGates.test.ts tests/no-network --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/ancestor-focused-final.json
node <deps>/vitest/vitest.mjs run --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/ancestor-full.json
```

### QUALITY correction: future database/directory roles (cycle 2/3)

- Root cause: individual target/ancestor type checks cannot detect incompatible roles when both paths are missing. A future DB equal to the cache or above scratch/cache passed validation, then startup created directories/run children before SQLite rejected the now-directory DB. A conflicting dataDir could even allow startup.
- Minimal fix: `assertMutablePaths` rejects any configured directory (`scratchDir`, `modelCacheDir`, optional `dataDir`) equal to or beneath the database path, using both lexical and resolved segment-aware comparisons. The opposite direction remains valid for data/cache directory parents. Existing scratch isolation, startup order, privacy, Python and lifecycle behavior are untouched.
- This correction changes only `apps/local-service/src/nativeConfig.ts`, `tests/core/nativePathRegression.test.ts`, and this receipt. No launcher changes or runs; no commit or closure.
- RED before the production change: **43 total, 28 passed, 15 failed, 0 pending**, exit 1 (`roles-red-final.json`). Fifteen cases accepted impossible future roles and left artifacts or allowed startup. Three equal-scratch controls already rejected before writes. The tests assert TypeError at validation/startup, zero runner calls, unchanged fixture listings (including alias targets), and unchanged sentinel bytes, rather than an error-message change or eventual SQLite failure.
- Added matrix: all three directory roles, equal/descendant relation, direct paths plus aliases on either DB or directory side (**18 rejection cases**); **four positive startup controls** cover data/cache directory parents with direct paths or real Windows junctions and readable SQLite output. All conflicting leaves start nonexistent, including missing parents in the direct cases. Existing dedicated scratch-junction and cleanup tests remain green.
- RED source SHA-256: `nativeConfig.ts` = `955195b0ba71382543c40fd80a4b1a768afa6a2155748c406a9bb505952a1ac6`; test = `3ab4129882a8fffb251c7e78ea785bb13ca4902452816741b296d7a17fb626cd`.
- Same regression file GREEN **43/43**; focused **687/687**, exit 0 (`roles-focused.json`: regression 43, config 16, pure matrix 468, browser gates 155, no-network 5). Full **983 total, 979 passed, 4 failed, 0 pending**, exit 1 (`roles-full.json`), exclusively the same four `spawn python3 ENOENT` tests reserved for lt-tow.
- Typecheck, production build (Vite 8.0.16, 32 modules), privacy scan (48 files), direct Node v26.7.0/win32 service/SQLite save-reopen smoke, and diff check all passed again. External synthetic fixtures only, providers off; no real data, downloads, installs, or Linux-host filesystem claim.
- GREEN source SHA-256: `nativeConfig.ts` = `d45c90d778deca8870bd08299eb1dc4bfb3618e0c52028dc9ea8bd1c901c42a0`; regression test unchanged from RED. The final candidate manifest above supersedes cycle 1's `82c946f9490ae0439aab04f809e9a83955277891bc7bc25da78d026a43f576f1`; compact manifest retained externally as `roles-manifest.json`.

Commands (same external dependencies/configs and TEMP/TMP as above; RED executed before the production change):

```text
node <deps>/vitest/vitest.mjs run tests/core/nativePathRegression.test.ts --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/roles-red-final.json
node <deps>/vitest/vitest.mjs run tests/core/nativePathRegression.test.ts tests/core/nativeConfig.test.ts tests/core/nativePaths.test.ts tests/web/nativePathGates.test.ts tests/no-network --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/roles-focused.json
node <deps>/vitest/vitest.mjs run --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/roles-full.json
```

### Implementation-notes closeout

- Deviation: notes consolidated in this evidence document; no second task tracker.
- Most likely revisit: broad lifecycle cleanup is deliberately not claimed; run-owned containment is implemented.
- Edge cases: stale foreign Git registrations, ancestor workspace symlinks, fake-runner files, Windows junction aliases and non-traversal cleanup.
- Fixture adjustment: the 17-job LRU test needs a bounded 15-second timeout on Windows; measured 4.17 seconds standalone, above 5 seconds under concurrent full-suite filesystem work. No assertion was removed.
- Read this receipt and accepted platform contract first; then parent specification/quality review and lt-tow integration.
