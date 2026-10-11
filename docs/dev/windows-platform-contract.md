# Windows/runtime and native-path contract

**Scope supersession:** the [Docker-primary decision](../plan/docker-primary-runtime.md) replaces native Windows as the required runtime/contributor target and permits trusted private-LAN binding. This document remains the historical/optional native-Windows contract; its Windows console/helper/browser tuple is not a prerequisite to the new Docker lane. Shared native-path validation and provider/state/privacy obligations remain applicable. Historical Windows qualification is not closed or relabeled successful.

Decision artifact for **lt-21e**, against source revision `a96ddce728e9860887d1a9b6fb0ef92105c04729`.

Select native Windows 11 x64, Node **26.7.0**, and Edge **156.0.4314.15** as the first qualification target; Python **3.14.7** is only a dependency-free CLI/fake-module target, not an ASR endorsement.
Use one platform-aware native-path policy across browser, service, adapters and SQLite; reject UNC/network syntax and keep mutable roots outside the checkout.
The biggest remaining risk is end-to-end qualification: installed executables and passing in-memory tests do **not** establish a working launcher, disk persistence, browser relink or real ASR.

**Status:** selected implementation contract, not an implemented fix or daily-use acceptance receipt. `MUST` below defines downstream acceptance. Source observations and executed probes are separated in §6. No installation, provider/model action, real media, existing browser profile, learner-state transfer or deployment is needed or authorized by this decision. Binding boundaries remain [DECISIONS.md](../../DECISIONS.md) and the [safety review](../review/safety-privacy-boundary-review.md); task state remains in Beads, not this document.

Independent review: specification and quality approved (`deleg_a2dc2b80/task-0`) after correcting phase ownership. This accepts the decision, not runtime qualification.

## 1. Selected runtime and browser combinations

| Lane | Selected versions / behavior | Evidence and qualification status |
| --- | --- | --- |
| Required Windows core | Windows 11 x64; Node 26.7.0; repository lockfile dependencies; Edge 156.0.4314.15; Python not required to start UI, service or SQLite | Host reports `win32`, `x64`, OS release `10.0.26300`. Node and browser binary version observed. Native Node SQLite probe and in-memory application storage ran. **Whole combination not qualified:** baseline defects remain. |
| Windows Python wrapper/fake lane | Same Node; CPython 3.14.7 via `python` or explicitly configured executable; no browser required | `python --version` and both Python scripts' `--help` passed. `python3` returns `ENOENT`. Existing fake-module tests cannot launch their hardcoded `python3`; wrapper execution with fake modules still needs qualification after resolver repair. |
| Linux compatibility lane | Native Linux x64; Node 26.7.0 target; CPython 3.14.7 target for wrapper/fake tests via `python3` or explicit executable; Chromium-family browser 156.x target for equivalent browser smoke | **Not executed here.** Preserve POSIX behavior and run native Linux tests before claiming Linux qualification. Historical Linux Node 26.5.0/ASR receipts are historical evidence, not today's support proof. |
| Other versions / browsers | No blanket `>=` runtime support promise. Installed Chrome 155.0.8059.40 is an alternate future qualification candidate, not a second required browser. Firefox, Safari, macOS, ARM, WSL-to-Windows paths, Tauri and remote browsers are outside this first qualification. | Executable metadata only for Chrome; no browser was opened for this decision. |
| Real local ASR / ffmpeg / alignment | Optional, separately qualified exact Python/package/model/tool versions and hardware | **No real-ASR Python combination is qualified by this artifact.** Python 3.14.7 help/fake support does not imply faster-whisper, WhisperX, CUDA or wheel availability. Do not install/downgrade Python or fetch a model to make core tests pass. |

These are narrow **support targets**, not claims that every target is already supported by the baseline. Promote a tuple to “qualified” only with §5 receipts recording exact OS, Node, Python (if used), browser build and source revision. Re-run relevant receipts on a runtime/browser update; do not disable security updates to retain a receipt. A replacement installed build can be selected and tested without retroactively qualifying it. No runtime installation is required to adopt the contract.

### Runtime execution rules

- Keep direct Node `.ts` execution, explicit `.ts` imports in the Node-executed graph, and strip-only-compatible TypeScript. Do not add a loader or another SQLite binding just to bypass the Windows path bug. `package.json` has no `engines` field today; implementation must make the selected runtime visible and must not confuse dependency engine ranges with app qualification.
- Launch service and Vite with `process.execPath` plus their resolved script paths and argument arrays, **without a shell**. Resolve scripts from the launcher/package location, not an arbitrary caller working directory. Do not `spawn('npm.cmd', ...)` without a shell or solve it by interpolating paths into a shell command. Source `start-local.mjs:3–11` currently does the former; a bounded `npm.cmd --version` launch reproduces `EINVAL`.
- Boot is all-or-nothing: child spawn error, occupied port or premature child exit stops the sibling; explicit stop waits for owned children to exit. Receipt must establish both loopback endpoints ready and no orphan processes afterward. No system service, scheduled task or persistent deployment is part of launcher qualification.
- Select Python from a **service/operator configuration**, not a browser job payload: introduce `LINGOTORTE_PYTHON_PATH` as one executable token, never an executable-plus-flags string. Existing `LocalServiceRuntime.pythonPath` remains the injected seam for tests. Explicit setting wins; otherwise use `python` on Windows, `python3` on Linux. Do not silently fall through to another interpreter after an explicit override fails. `py -3` is not one executable token and is not accepted as the override.
- Fully qualified executable overrides obey the native-path rules; bare executable names use the service's PATH. UI input must never choose Python/ffmpeg executables. This removes the baseline payload override, coordinated with request-safety work; it does not require a new general executable discovery framework.
- Missing Python affects Python-backed work only. Report a redacted unavailable state rather than installing dependencies. Fake-runner tests inject the command runner and do not execute Python/ffmpeg; dependency-free Python CLI/fake-module tests use the same explicit interpreter selection and report a missing prerequisite honestly. Required fake tests must not be silently skipped and reported as passed.

### Browser/service alignment

Use a disposable, empty browser profile for qualification, only synthetic files, and `http://127.0.0.1:5173` with the service at `http://127.0.0.1:5174`. These fixed origins match the current Vite/default service settings. A `localhost`/IPv6/custom-port variant is not qualified by the fixed-origin smoke; request-safety work owns exact Host/Origin/session enforcement. Loopback binding or CORS alone is not authorization.

The service MUST advertise a non-sensitive, versioned path capability in status, proposed exact shape:

```json
{"config":{"pathPolicy":{"version":1,"platform":"win32","fullyQualifiedOnly":true,"uncAllowed":false}}}
```

Linux reports `platform: "linux"`. Browser validation uses **that service platform**, not user-agent, `navigator.platform`, or the syntax of an entered path. A missing/unrecognized capability disables native-file job submission with a compatibility message; it does not break browser-only playback. The capability contains no home, drive, media, executable or database paths.

Implement a shared browser-safe pure policy accepting `(value, platform, purpose)` where purpose distinguishes an input file, output file or directory. Browser controls and submission handlers apply the same policy as service request/config validation; the service is authoritative and revalidates direct requests before any filesystem operation or command invocation. Adapters and SQLite must not keep weaker independent definitions. Tests can exercise both platforms explicitly on either host; actual filesystem operations always use the host platform.

Apply this to embedded-subtitle listing/extraction, local ASR, ElevenLabs local input (without enabling the provider), source-audio snippets, native export/output directories, DB/scratch/model configuration and script/executable overrides. Remove POSIX-only `startsWith('/')` gates and the misleading assumption in `isAbsoluteOwnedLocalPath`. Browser handles/object URLs remain a **different reference type**:

- File System Access handle + IndexedDB is preferred where the selected browser exposes it and permission is granted. Feature-detect; handle denial/cancellation must not become a fatal app error.
- Ordinary file input and transient `blob:` playback are the fallback. Do not claim a blob is durable across restart or that a browser can disclose the underlying filesystem path.
- `browser-file-handle:<name>`, a picker display name such as `C:\fakepath\clip.mp4`, and a fixture URL must never be automatically converted into a service path. `fakepath` is a browser display convention, not an authorized media location.
- Native jobs require an explicitly supplied local path and the user's existing ownership/same-media confirmation semantics. Filename/path shape is not proof of rights, filesystem locality or correspondence to the browser-selected file. Relink must preserve media/cue/version identity; same basename alone is not identity proof.

## 2. Native-path policy v1

### Common rules

1. Accept a non-empty string, not an object, URI or implicit shell expression. Reject NUL/control characters and leading/trailing whitespace at this API boundary rather than trimming silently. Interior spaces and Unicode are supported. This deliberately excludes filenames ending in whitespace even where POSIX permits them.
2. Validate **raw syntax before normalizing**. Do not resolve a relative path against cwd, expand `~`, expand `$HOME`/`%USERPROFILE%`, strip quotes, decode URL escapes, convert `file:` URLs or translate `/c/...`/`/mnt/c/...` into Windows paths. Reject a field containing surrounding shell quotes. A UI field contains a literal native path, not a shell command. JSON escaping is transport syntax, not extra path characters.
3. Windows requires a drive letter, colon and slash/backslash, followed by a non-root path. Both `C:\Media\clip.mp4` and `C:/Media/clip.mp4` qualify syntactically. Reject drive-relative `C:clip.mp4`, bare `C:`, drive-unspecified rooted `\clip.mp4` and `/clip.mp4`, all UNC/device/extended namespace forms, and ADS (`clip.mp4:stream`). Reject Windows-invalid component characters `< > : " | ? *` (except the drive colon), reserved DOS device basenames (case-insensitive, including extensions), and components with trailing spaces/dots. Reject `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9` and the Windows superscript-digit device aliases. This prevents passing device names to media tools under a “local file” label.
4. Linux requires one leading `/`; reject a leading `//` as the conservative network/implementation-defined namespace policy. Do not treat backslashes as separators or Windows-looking text as a Windows drive on Linux. Ordinary POSIX component punctuation remains literal (for example `/media/a:b.mp4` is allowed). An absolute `/mnt/c/clip.mp4` is syntactically POSIX on Linux, never Windows translation or evidence that the mount is local.
5. After syntax acceptance, normalize `.`/`..` and repeated interior separators with the selected platform's semantics; reject a result equal to a filesystem/drive root. Recheck any restrictions normalization exposes. Validation must never turn an initially rejected raw prefix into an accepted path. Normalization is not an ownership, containment or file-identity check.
6. Input media must name an existing readable regular file, not a directory/device, before executing a real job. Output/database paths may not yet exist; check their intended parent/type safely. Directory configuration names a directory. A positive syntax result does not guarantee existence/access. Preserve path case and Unicode in stored references; do not globally lowercase strings or use a string prefix to establish identity/containment.
7. `:memory:` is an explicit **SQLite unit-test sentinel only**, not a valid media path, public service config or general directory. Keep the storage unit seam; application/service qualification uses isolated file-backed SQLite.

### Positive/negative matrix

Values below are literal strings, not JSON escapes. “Accept” is **syntax only**, conditional on the purpose/existence/locality/authorization checks above. Browser and service MUST agree for the service's declared platform.

| Input / purpose | Windows | Linux | Reason / expected behavior |
| --- | --- | --- | --- |
| `C:\Synthetic Media\żółć.mp4` / media | Accept | Reject | Fully qualified Windows path, spaces/Unicode preserved |
| `C:/Synthetic Media/żółć.mp4` / media | Accept | Reject | Alternate Windows separator |
| `D:/fixture outputs/state.db` / DB | Accept | Reject | Nonexistent output is allowed after parent validation |
| `/home/test/Media/żółć.mp4` / media | Reject | Accept | POSIX absolute only on Linux |
| `/media/a:b.mp4` / media | Reject | Accept | POSIX colon is a literal filename character |
| `/media/part/../clip.mp4` / media | Reject | Accept | Normalize only after accepting POSIX prefix |
| `C:/Media/part/../clip.mp4` / media | Accept | Reject | Normalize only after accepting drive-qualified prefix |
| `clip.mp4`, `./clip.mp4`, `../clip.mp4` | Reject | Reject | Relative |
| `C:clip.mp4`, `C:`, `C:../clip.mp4` | Reject | Reject | Per-drive cwd must not select the file |
| `\clip.mp4`, `/clip.mp4` | Reject both | Reject first; accept second | Windows current-drive-root trap; `/clip.mp4` remains valid POSIX |
| `C:\`, `C:/`, `/` / any configured purpose | Reject | Reject | Root is not a media file or safe mutable directory |
| `\\server\share\clip.mp4`, `//server/share/clip.mp4` | Reject | Reject | UNC/network namespace explicitly unsupported |
| `\\?\C:\clip.mp4`, `\\?\UNC\server\share\clip.mp4`, `\\.\C:\clip.mp4` | Reject | Reject | Extended/device namespace unsupported, even for a local drive |
| `C:/Media/clip.mp4:stream`, `C:/Media/NUL.mp4`, `C:/Media/clip.` | Reject | Reject | ADS, reserved device or Windows alias; also not POSIX absolute |
| `~/clip.mp4`, `~other/clip.mp4`, `$HOME/clip.mp4`, `%USERPROFILE%\clip.mp4` | Reject | Reject | No shell/environment expansion |
| `/c/Media/clip.mp4`, `/mnt/c/Media/clip.mp4` | Reject | Accept as literal POSIX | No MSYS/WSL conversion; Linux locality remains separately asserted |
| `file:///C:/Media/clip.mp4`, `file:///media/clip.mp4` | Reject | Reject | File URI is not a native-path field |
| `https://example.invalid/clip.mp4`, `http://127.0.0.1:5173/fixture.webm` | Reject | Reject | URL, including loopback URL, is not a service input filename |
| `blob:http://127.0.0.1:5173/id`, `data:video/webm;base64,...` | Reject | Reject | Browser resource only |
| `browser-file-handle:clip.mp4`, `fixtures/media/clip.webm` | Reject | Reject | Handle label / browser fixture reference, not a native absolute path |
| Empty, whitespace-only, quoted whole path, embedded NUL/newline | Reject | Reject | Invalid literal input |
| `:memory:` / direct SQLite unit seam | Accept only at that seam | Accept only at that seam | Reject for service config and every non-SQLite purpose |

### UNC, mapped drives and ownership boundary

**Decision: no network-backed storage/media in this first supported deployment.** UNC is rejected before filesystem lookup, credentials, DNS, command execution or job creation. Do not add a share exception or auto-mount. The same restriction covers mapped network drives, remote mounts and sync-backed mutable roots; a drive letter or POSIX path alone cannot identify those. Require the operator to select local, non-synced locations, explicitly document that assertion, and reject a resolved Windows UNC/device target if discovered. The lexical helper does not claim to detect drive mappings, remote POSIX mounts or synchronization software. Automatic physical-volume classification is not a prerequisite for the fake contract and is not claimed as implemented enforcement.

Existing-file symlinks/junctions may resolve to a different location: runtime checks must use resolved targets where enforcing mutable-root exclusion/containment, and must not follow links during scratch deletion. This is **not** a new media-library allowlist or a guarantee of confinement against a hostile local OS user. Per the safety review, the operator asserts rights by explicitly selecting the file; path acceptance alone never assigns `owned`/`licensed`/`synthetic`. Synthetic fixtures receive provenance from fixture metadata, not a substring such as `fixtures/`.

## 3. External data, scratch and cache roots

Retain existing environment names. For missing values, use this deterministic precedence; a present-but-empty or invalid value is an error, not an excuse to fall back to cwd:

| Setting | Selected resolution |
| --- | --- |
| `LINGOTORTE_DATA_DIR` | Explicit native absolute directory; otherwise Windows `%LOCALAPPDATA%/lingotorte`, Linux `$XDG_DATA_HOME/lingotorte` when XDG_DATA_HOME is set and absolute, else `os.homedir()/.local/share/lingotorte` |
| Windows missing `LOCALAPPDATA` | Use validated `os.homedir()/AppData/Local/lingotorte`; if no usable home is available, stop with a configuration error |
| `LINGOTORTE_DB_PATH` | Explicit native absolute file; otherwise `<dataRoot>/state.db` |
| `LINGOTORTE_SCRATCH_DIR` | Explicit native absolute dedicated scratch directory; otherwise `<dataRoot>/scratch` |
| `LINGOTORTE_MODEL_CACHE_DIR` | Explicit native absolute directory; otherwise `<dataRoot>/models`; choosing it never loads/downloads a model |

`%LOCALAPPDATA%` and `$XDG_DATA_HOME` here denote environment lookups performed by the config resolver, **not expansion inside operator-provided path values**. Preserve Linux's existing default when no XDG override is set. Windows must not depend on Bash setting `HOME`. Run fixtures may override all roots explicitly in a unique external temporary directory; no existing user store is opened.

Before creating/opening/deleting anything:

- Validate every final path with policy v1. Refuse mutable data/DB/scratch/cache in the executing checkout, its dependency/build directories, or the associated primary checkout/worktrees. Check real existing ancestors as well as lexical paths so a junction into the repository is not an escape hatch. There is no automatic relocation of an existing DB: selecting a new default must not silently migrate/import/delete learner state.
- Reject filesystem roots, a home directory itself, or the data root itself as the cleanup scratch directory. Scratch must not equal/contain the DB, model cache, repository, or selected input media. It must not overlap the cache in either direction; an ordinary `<dataRoot>/scratch` sibling is valid. Media inside scratch is refused for jobs. Data root may be the parent of DB/scratch/cache by design.
- Give each run/job an app-owned scratch child; cleanup is bounded to owned artifacts, not arbitrary contents of an operator's parent directory. Containment uses platform-aware `relative`/segment checks plus resolved-parent checks, not `startsWith(root + '/')`. Windows separator/case handling must be tested; never cross volumes or follow a directory symlink/junction when deleting. Refuse ambiguous configuration rather than broadening deletion.
- Keep SQLite and its WAL/SHM sidecars on the selected local data filesystem. `DatabaseSync` takes the validated native path; no URI conversion is needed. A unique synthetic external DB must survive save/close/reopen in qualification.
- Status/logs/errors must retain redacted labels (`[local-sqlite]`, `[local-scratch]`, etc.), not raw paths or command stderr containing them. Only synthetic examples belong in committed tests/docs. User path references stay private and exports retain their privacy warnings.

For this decision's probes, temporary files were written only under the Hermes scratch root, not application defaults. Future product scratch defaults above are not a request to reconfigure Hermes or to deploy the app.

## 4. Implementation consequences, not a second backlog

The existing Beads dependencies own scheduling; this is the acceptance interface they implement:

1. Shared policy + status platform capability; table-driven tests; replace all browser/service/adapter/SQLite path gates together. Avoid a browser-only repair that still fails in SQLite, or a service-only repair with disabled UI controls.
2. Native launcher, platform data roots and service-owned Python selection; deterministic error/shutdown tests. A path-safe launcher cannot broaden provider permissions or inherit a real data store during qualification.
3. Portable fake fixtures use `join(testRoot, ...)` for host filesystem work and explicit `win32`/`posix` strings for pure syntax tests. Assert native argument vectors and native cwd; do not weaken tests to slash-agnostic substrings or make invalid rooted Windows paths pass.
4. Keep Linux validation, no-network behavior, redaction, source identity and draft/approval semantics intact. Request authenticity, durable restore/relink and cleanup ownership fixes remain their respective safety/identity work; this contract supplies their platform constraints, not completion claims.

Rejected alternatives: broad “any modern Node/browser,” continuing the shell-dependent `npm.cmd` launcher, accepting `path.isAbsolute` as sufficient, UNC support without an actual use case, automatic home/cwd path repair, requiring ASR/model installs to test argument construction, and guessing the server OS from the browser. Reversing the shared policy later would change API/status semantics and fixtures; version it rather than quietly widening acceptance.

## 5. Qualification receipts required before claiming support

Execution mechanics and content identity are defined in the [Windows qualification procedure](windows-qualification-procedure.md). It requires one combined base-plus-content manifest covering launcher/native paths/Python, dependencies, fixtures and harness; offline URL/source-closure preflight; explicit prerequisite recording (including PowerShell 7 and usable `Add-Type` compilation if the reviewed Job Object launcher is selected); and separate application, harness and NOT REACHED outcomes. This is a planning amendment, not a retry authorization or implementation receipt. Historical integration attempts remain frozen; `lt-a46` remains blocked. Recovery termination is not lifecycle success. Existing positive controls, persistence/reopen, native Ctrl+C, occupied foreign listener, premature-exit and owned-process cleanup gates below remain unchanged.

### Phase ownership (not one prerequisite checklist)

**Windows portability checkpoint `lt-13v`:** qualify pure path contracts, browser/API path agreement, native startup/shutdown and isolated SQLite persistence, Python fake/help execution, portable mutable-root behavior, and the existing automated baseline plus new portability regressions. Its disposable browser smoke covers synthetic import/playback, native-path input, save/reload and shutdown. Existing non-portability correctness defects remain explicitly open. It does not require completed identity-preserving relink, request capability pairing, or durable restore repairs.

**Later repair and integrated checkpoints:** restart/relink identity and permission behavior belong to `lt-n31` (after `lt-13v`) and learning/final qualification. Request capability pairing and its changed startup behavior belong to `lt-sor` (after `lt-13v`); its tests must requalify the affected startup/client boundary. Restore/revision correctness belongs to the safety issues and final qualification. The table below states eventual evidence by boundary, not a requirement to complete downstream features before Windows QA.

**Linux:** preserve POSIX behavior and Linux-focused regression coverage during Windows repairs. Native Linux runtime/browser execution is required only before claiming that exact Linux tuple qualified; Linux browser certification is not a prerequisite for the Windows milestone. Unrun Linux checks must remain explicitly unqualified rather than represented by Windows lexical tests.

| Gate | Required positive and negative evidence |
| --- | --- |
| Pure contract | Every §2 matrix case on both platform parameters and each relevant purpose; no I/O/runner calls for rejected values; normalization cannot turn UNC/relative/rooted Windows input into a valid path. Include Unicode/spaces, ADS/device names, root, foreign-platform, tilde, URL/blob/handle, dot segments and empty values. |
| Browser + API agreement | Same vectors through embedded, ASR, Scribe-local-input and snippet gates, plus export/output configuration. Disable on unknown status policy. Bypass the UI and show invalid API paths fail before jobs/files/commands; provider-disabled tests remain zero-network. No provider request is needed for Scribe path validation. |
| Native runtime | Direct `.ts` import/syntax and disk-backed SQLite save/reopen. Launch both children, ready endpoints, occupied-port/spawn failure, Ctrl+C/stop and sibling failure teardown; verify no owned processes remain. Paths to checkout/config containing spaces must work without shell quoting tricks. |
| Python boundary | Selected executable `--version`, both lazy `--help` commands and both fake-module script tests; explicit bad override errors without fallback; no model imports/downloads in help tests. Full real-ASR support remains separately unqualified. |
| Mutable roots | Unset HOME on Windows, LOCALAPPDATA fallback, explicit env overrides, Linux XDG/default behavior, blank/relative/network roots, repo and root-overlap refusal, DB/cache preservation, cleanup containment and symlink/junction non-traversal in isolated stores. No deletion outside app-owned scratch. |
| Real browser | Selected exact Edge build in a fresh profile: loopback load/play of synthetic media; picker/handle persistence and permission denial; restart/relink identity; fallback file selection; explicit drive-qualified service path; invalid matrix feedback; no non-loopback/provider traffic. Fake DOM/IndexedDB tests alone are not a browser receipt. Native-job execution may use fake runners; label it as such. |
| Linux | Run the portable automated suite on native Linux plus equivalent local browser smoke before a Linux-qualified claim. Running `path.posix` on Windows only qualifies lexical tests, not Linux process/SQLite/browser behavior. |
| Regression | Record `test`, `test:no-network`, typecheck, build, privacy scan and diff checks for the implementation revision, with exact failures/skips. A partial green subset or historical Linux receipt is not full acceptance. |

Final human daily-driver acceptance and real learner-state transfer are separate gates, not unlocked by selecting these versions or producing this document.

## 6. Evidence, reproduction and limitations

### Source-confirmed at the stated revision

- `package.json:16–26,35–45`: direct Node server, Vite 8.0.16, Vitest 4.1.9, TypeScript 6.0.3, jsdom `^29.1.1`; no application engine declaration. Installed package manifests reported Vite `^20.19.0 || >=22.12.0`, Vitest `^20.0.0 || ^22.0.0 || >=24.0.0`, jsdom `^20.19.0 || ^22.13.0 || >=24.0.0`. These are dependency admission ranges, not tested app tuples.
- `scripts/start-local.mjs:3–25`: `.cmd` child launch and immediate sibling shutdown logic. `vite.config.ts:6–14`: loopback fixed ports and strict-port behavior.
- `apps/local-service/src/server.ts:80–96,200–203,258–266,358–367,1095–1107`: permissive platform `isAbsolute`, slash-based containment, payload Python override/default `python3`, and HOME/cwd-based data defaults. `99–108` fixes the CORS response origin; this does not enforce request authenticity.
- `packages/storage/src/sqliteLocalPersistence.ts:659–668`: leading-slash-only guard before `DatabaseSync`, `:memory:` exception, WAL setup.
- `apps/web/src/model.ts:1406–1409,1742–1744,1791–1793,2394–2396` and `apps/web/src/app.ts:337–340,2762–2765`: conflicting POSIX-only and permissive Windows/UNC browser checks. `model.ts:2440,2483` also illustrates why fixture-path text must not be treated as provenance proof.
- `packages/local-transcription/src/index.ts:22–27,137–143,404,472`: `execFile` seam, normalize/isAbsolute, Python defaults. `tests/core/localTranscriptionPipeline.test.ts:33–59,92–107,236–258,277–389`: POSIX literals and hardcoded `python3` even in dependency-lazy/fake-module tests.
- `apps/web/src/browserHandleStore.ts:15–18,34–76` and [DECISIONS §2](../../DECISIONS.md): IndexedDB handle lane versus explicit service path lane. [Takeover review R8](../review/plan-review-2026-10-10.md) documents the cross-layer portability scope; R4/R7 record safety/relink limits.

### Executed for this decision (offline, synthetic)

- `node --version`: **v26.7.0**; native Node reported SQLite **3.53.4**, Windows x64 / OS release **10.0.26300**. `python --version`: **3.14.7**. Native Node `spawnSync('python3', ['--version'])`: **ENOENT**. Read executable version metadata only: Edge **156.0.4314.15**, Chrome **155.0.8059.40**. No browser launch/profile/credential access.
- `node --check apps/local-service/src/server.ts`: exit **0**. Importing the actual storage class with Node and opening `:memory:` succeeded with schema version **7**. This is not a full service boot.
- External scratch probe: Node's built-in `DatabaseSync` created, read and removed a synthetic drive-qualified database with spaces/Polish characters. The existing application `SqliteLocalPersistence.open` rejected the same native path with `SQLite local persistence path must be absolute, or :memory: for tests.` **Inference supported within scope:** the app guard, not lack of native SQLite path support, blocks this case.
- Bounded `spawnSync('npm.cmd', ['--version'])` with no shell: **EINVAL**. No `npm run local` was started against default storage. The parent audit's real launcher failure is corroborated at the child-launch seam, not re-labelled as a fresh end-to-end run.
- Pure Node path probe: Windows `isAbsolute` returns true for `\clip.mp4`, `/clip.mp4`, UNC and `\\?\C:\clip.mp4`; it returns false for `C:clip.mp4`. POSIX `isAbsolute('//server/share/clip.mp4')` is also true. **Refuted:** `isAbsolute` alone proves the selected fully-qualified/local contract.
- `python scripts/faster_whisper_transcribe.py --help` and `python scripts/whisperx_align.py --help`: both exit **0**, expected flags present, no ASR dependency install needed. No real media/model execution was attempted.
- Focused existing Vitest run: **26 total, 19 passed, 7 failed, 0 pending**, exit **1**. All 16 `localPersistence` tests passed (in-memory seam); local-transcription had 3 argument-vector failures from Windows normalization versus POSIX literal expectations, and 4 `spawn python3 ENOENT` failures (two help, two fake-module tests). These failures are baseline evidence, not defects fixed by this document.
- Parent's separately recorded full baseline at this revision: **300 total, 266 passed, 34 failed**. Not rerun as part of this decision and not replaced by the smaller focused count.

Focused-run reproduction used existing ancestor `node_modules`, an external config mirroring `vitest.config.ts` with only `root` and `cacheDir` redirected, and external TEMP/TMP. In the following recipe `<repo>` is the isolated worktree, `<deps>` the existing dependency root, and `<scratch>` an explicitly selected external synthetic directory; substitute native paths, not shell environment-expression strings:

```text
node <deps>/vitest/vitest.mjs run tests/core/localTranscriptionPipeline.test.ts tests/core/localPersistence.test.ts --config <scratch>/vitest.config.mjs --configLoader runner --reporter=json --outputFile=<scratch>/focused-results.json
```

External config shape (no new dependency required):

```js
export default {
  root: '<repo>', cacheDir: '<scratch>/vite-cache',
  test: { environment: 'node', globals: true, restoreMocks: true,
    clearMocks: true, include: ['tests/**/*.test.ts'] }
};
```

The temporary probe/config/report are retained outside the repository in the task's `lt-21e-platform-probe` Hermes scratch directory for review; they are not application artifacts or permanent evidence dependencies. No application code/tests, root policy docs or Beads records were modified for this decision. No commit/push/issue closure was performed. Full browser, native Linux, repaired launcher, persistent application service and live ASR qualification remain **unrun**, explicitly rather than inferred from source or recommendations.
