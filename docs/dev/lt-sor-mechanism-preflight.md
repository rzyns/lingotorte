# lt-sor mechanism preflight (offline only)

## Verified outcome and boundary

No production edits, browser, listener, TLS/transport change, dependency install, provider/model/microphone or learner data were used. Existing image `sha256:08f8d07f9c75fec44ff60cb06757c99c3f5118fdaf793dcb24c74381499cef76` ran two disposable `--network none --rm --init` containers. Both exited 0; exact-name Docker inspect verified absence after each. `python scratch/lt-sor/mechanism-preflight/run.py` is the reproducible command; complete arguments/output are in `execution.json`.

Five compiler/audio/ownership/disposal phases PASS, **25 assertions**. Real frozen model and snippet production modules execute through Vite SSR, not copied fragments. A model pairs using random capability held only in memory, connects through fake status/state, obtains the returned Linux native path policy and revision, then captures its own transport. Fake HTTP supplies one completed job and genuine 3244-byte mono 16kHz PCM WAV body. Actual production snippet code performs POST, poll, GET, DELETE, and only then Blob promotion. MIME, byte bound, request envelope, native path, release/revoke and DELETE-before-promotion are asserted. This is fake-HTTP production-client execution, **not a newly executed backend ffmpeg job or actual browser playback**. The prior offline backend fake-command receipt retains its separate scope.

401 during the real snippet poll clears authority/path policy/revision, disables autosave, prevents promotion, preserves the synthetic empty store and requires explicit pairing. Subsequent autosave trigger sends zero PUTs; explicit pair/connect sends no automatic job replay. This is deterministic unauthorized-response simulation, **not an actual service restart**. Pending PUT restart, delayed JSON/body completion after owner replacement, nonempty autosave preservation and DOM timers remain unqualified here.

A separate owned fake process has a pending timer, stdin EOF cancels it and exits gracefully: 31 ms, no forced kill. A 3-second own-child emergency kill guard discriminates graceful from forced exit; it was not invoked. Vite middlewareMode disposal and container absence PASS. Active HTTP sockets, checkContinue and preview-server close are **not exercised**, because starting a listener is expressly prohibited. The historical strict browser-fixture cleanup failure remains a failure; later absence does not rewrite it.

## Audio harness root-path defect

Historical controller line 74 imports `/apps/web/src/model.ts` and `/apps/web/src/sourceAudioSnippet.ts`. Vite config root is `apps/web`; frozen actual Vite `transformRequest` positively compiles `/src/model.ts` and `/src/sourceAudioSnippet.ts` and rejects both historical paths. This is a discriminating offline negative/positive test through the real compiler. The corrected production call shape fully succeeds offline with returned pathPolicy. **Do not assert that this proves the browser RuntimeError's sole cause:** historical CDP exception details were intentionally discarded, so an additional browser-only failure could remain.

One specific future authorized probe: use those two corrected module URLs, stage-tag module-import/connect/policy/capture/POST/poll/WAV/DELETE/promotion/playback/release separately; capture only exception class and fixed stage (no message, stack, expression or capability). Persist independent checkpoint/oracle evidence before assertions and continue independent diagnostic phases after one fails. No probe was launched by this work.

## Plain-HTTP LAN digest scope

Historical actual LAN evidence is exactly the synthetic Library import failure with absent Web Crypto in insecure Chrome context. Connection/status/state already worked. It is **not evidence that all imports or all LAN operations are broken**.

`apps/web/src/model.ts:664–675` requires `crypto.subtle.digest('SHA-256', input)` and returns lowercase `sha256:<64 hex>`. Exact direct callers:

- 853/879: ASS/SSA full subtitle text and each normalized cue text.
- 939/990: SRT/VTT full subtitle text and each normalized cue text.
- 1018: fetched synthetic media bytes; import 1002–1061 hashes before store writes.
- 1138: browser local File bytes; handle-based import delegating to this path inherits the requirement.
- 2158/2178: serialized transcript segment content and normalized cue text (including correction/import paths using putTranscriptSegments).
- 2253: serialized authorized YouTube-caption candidate metadata/segments, before transcript hashes. No provider was invoked here.

These populate media/track content fingerprints and cue text digests. Factories accept digest fields separately from entity IDs; digest helper is not UUID generation. Native Node media imports use storage `sha256File` at model 2631–2676, a separate `node:crypto` implementation. Durable state revisions are service-provided SHA-256 values validated at model 294, not computed by this browser helper. Export/restore semantic integrity uses a **different existing portable SHA-256** and does not depend on Web Crypto.

## Minimal recommendation — existing portable core, no new hash implementation

`packages/domain/src/exportManifest.ts:44–196` already contains zero-dependency full SHA-256 constants, schedule, compression, padding and lowercase hex output in private `sha256HexUtf8(text)`. `rootHashFromRecords` calls it at 211; exported `computeExportIntegrity` uses it at 228–239. It presently UTF-8 encodes strings internally and is **not exported as a general byte API**. It cannot safely hash arbitrary media by lossy text conversion.

Preferred separately authorized minimal change: extract/generalize this existing byte compression/padding implementation into one browser-safe byte digest utility; retain a UTF-8 wrapper and all existing canonical-record semantics; have the model use the same SHA-256 utility (or exact-equivalent fallback when subtle is absent). Preserve byteOffset/byteLength for subarrays, prefix/case/64-digit shape and all validation. No new dependency, mock crypto, omission, weaker digest, content upload or secure-context flag is needed. Audit and test before accepting: empty/abc standard vectors, Unicode/lone surrogates matching TextEncoder, NUL/all-byte binary input, subarray offsets, 55/56/63/64/65-byte padding boundaries, multi-block/random deterministic differential comparison against Node SHA-256 and Web Crypto, plus unchanged export integrity fixtures and memory bounds for whole-media hashing. No SHA implementation or production change is supplied here; parent judgment/authorization is still required.

Do **not** reuse `packages/language/src/adapters.ts:36–43` despite its `sha256Text` name: it is 32-bit FNV-style provenance hashing, not SHA-256. Storage `mediaHelpers.ts` and domain `fixtures.ts` SHA implementations require Node crypto/fs and are not browser-portable. Root dependency manifest lists ts-fsrs and local morfeusz-ts, no explicit SHA package.

## Remaining restart/cleanup mechanism requirements before another launch

Source-owned fences: pairedTransport asserts current pair before/after fetch, rejects redirects, uses omit/error envelope and clears on 401 (29–56); model callback bumps generation and clears autosave/policy/revision (186–200); JSON completion checks captured transport (214–217); save serializes through owner.tail and checks generation after acknowledgement (299–354); connection checks generation after status/state/handle restoration (357–420); endpoint change clears pair/baseline/generation (455–468); autosave requires connected status, revision, enabled flag and no conflict/choice (481–485); snippet checks ownership after JSON/blob/delete and delays (21–71).

Future fixture must independently persist before/after oracles for restart during pending poll and pending durable PUT, deferred response-body completion, endpoint/owner replacement, explicit repair, stopped UI loops and no mutation replay. Use only deterministic synthetic records and deferred promises; distinguish source evidence, SSR fake HTTP and real browser receipts. Real browser phases should run independently and save their checkpoint receipts even when one fails.

Historical fixture `stop` awaits service/dev/preview/foreign close but then its readline iterator/private IPC remains active, and no owned socket/pending-job inventory is captured. That source observation is a **hypothesis**, not a proven cause of the 10-second timeout. Future owned fixture should close the input interface, await Vite disposal, inventory and cancel only its own pending fake jobs/timers, track only owned sockets, distinguish graceful deadline from emergency owned-socket closure and await Docker client exit before verifying absence. A no-listener fake timer proof cannot qualify those actual socket paths. Do not modify production lifecycle to make the test green.

## Artifact binding

Artifacts under `scratch/lt-sor/mechanism-preflight/`:

- `preflight.mjs`: `4f5aa4169fc50da432f050709750f91008b58894f23e4b2928a74cdb938202b8`
- `receipt.json`: `e1f1b4b46e463f3369655f162e2c3caed7243dc2bd7ee234a6d91c2ff4f04149`
- `cleanup.mjs`: `542c5045f3294886d440bb71d5d6a2503de1f2457f36a353a94bebffd7fc0eed`
- `cleanup-receipt.json`: `46d10d20bd79a60ca84c76e04b4dd0b693c782a2fcacc39b9e7edc2611e42fcf`
- `run.py`: `42fe9d302cf488449a7841edc5c0e3ca1138f361799e2814ca22a06fecef3170`
- `execution.json`: exact commands, readbacks, timings and artifact hashes.

Parent binding SHA `f8bdecf19aa75e278ac6a06c4849c3708ef1b74d39ed8dae62a02d3ac344e2f2`: **195 non-test entries match before/after**, excluding only concurrent CORS-owner `vite.config.ts` from original 196. Production unchanged by this worker. Historical receipts/controllers were read only. A24/A25/A26/LAN stay OPEN; no matrix completion, publication, commit, push or Beads closure is claimed.
