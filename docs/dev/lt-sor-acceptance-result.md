# lt-sor finite server/startup acceptance evidence

**Server qualification supplement, not full A01–A30 closure.** Production application/service/proxy/config bytes were not edited. Real-browser A24–A26 and final independent review remain parent-owned. This work is the finite qualification completion within the parent's correction budget, not a new gate or budget reset.

## Content binding and execution

Qualified contributor tag: `lingotorte:lt-sor-acceptance-final3`.
Actual Docker image ID: `sha256:9c38eaee5b0f48e03bb448a841c132d9c7bc9bc4fc4c8cc8684a07742cd0461b`.
Build config digest: `sha256:ac0d44341aa0f241f73a68ac0100f35ad076edcf9426bffe05930f331c5dc0df` (not the Docker image ID).

External packet: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/acceptance/`.
`final3-binding.json` compares all **248** paths from the parent joined source binding against both this image and current checkout: zero host/image mismatches; the only difference from the parent's image binding is `tests/core/requestRuntime.test.ts`; zero production differences. Parent production image: `sha256:08f8d07f9c75fec44ff60cb06757c99c3f5118fdaf793dcb24c74381499cef76`. Operator docs are source artifacts, not inputs copied into the contributor image.

Every command ran in a fresh image-only container with `--rm --init --network none`; no host source/media/state/credential mount. Build reused cached dependency layers; no dependency installation on the host.

| Receipt | Executed command following `docker run --rm --init --network none lingotorte:lt-sor-acceptance-final3` | Result |
| --- | --- | --- |
| `final3-scoped.json` | `node node_modules/vitest/vitest.mjs run tests/core/requestRuntime.test.ts` | 12 passed |
| `final3-full.json` | `node node_modules/vitest/vitest.mjs run` | 1119 passed, 1 skipped; 46 files passed, 1 skipped |
| `final3-types.json` | `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| `final3-build.json` | `node node_modules/vite/bin/vite.js build --config vite.config.ts` | exit 0; 33 modules |
| `final3-no-network.json` | `node node_modules/vitest/vitest.mjs run tests/no-network` | 5 passed |
| `final3-privacy.json` | `node scripts/check-privacy-boundaries.mjs` | ok, 54 files |

The regular suite retains its private-IPC skipped gate. This supplement does not replace the separately collected real tmpfs IPC receipt with a mocked pass. Actual IPv6 listener passed in this Linux image; that is not native Windows/browser qualification.

## Seeded oracle and exact expansion

The existing seeded test owns a durable synthetic media snapshot and revision, a queued waiting job, completed WAV snippet, synthetic source file, fake runner, provider-off fakes, and an independent concurrently running service. Before/after rejection comparisons include the full runtime observation (snapshot, jobs, snippet map, LRU counter, allocation counters, lifecycle, in-flight size), all SQLite tables including audit/event/projection rows, persistence save count, command/provider counters, and file content hashes. Raw parser and admission fault cases also settle the event loop before the after comparison. Positive setup genuinely saves state, allocates jobs, extracts and reads/deletes the synthetic WAV.

Programmatic `final3-counts.json` reconciles exactly **930** seeded denials, not 930 Vitest test functions:

| Expansion | Rows |
| --- | ---: |
| 29 admission faults × 16 seeded route/kind rows | 464 |
| Raw parser failures and CONNECT connection rejection | 6 |
| HEAD/TRACE/PATCH/override and three forbidden target forms × 16 | 112 |
| Seven media-type failures × 11 JSON body rows | 77 |
| Five invalid JSON shapes × 11 JSON body rows | 55 |
| GET/DELETE envelopes, five rows × three faults | 15 |
| Cleanup over-limit/nonempty object | 2 |
| Actually transfer-encoded chunked oversize × 11 JSON body rows | 11 |
| Cancel nonempty object | 1 |
| Unsupported encoding | 1 |
| Route-specific preflight and subsequent actual-request negatives | 166 |
| Other method/target/preflight negatives | 16 |
| Paused worker cancel/delete/read/cleanup denials | 4 |
| **Total** | **930** |

The startup test separately executes **108** unavailable-admission requests across nine reached checkpoints, with three injected failures and zero replayed jobs. It includes job/snippet reads, cancel/delete, state/jobs/cleanup, health, OPTIONS and Expect. A30 uses a real `port: 0` bind to unavailable TEST-NET address `192.0.2.1`, returning `EADDRNOTAVAIL`; zero post-bind checkpoints, unchanged sentinel manifest, no database/model creation. This is not a fixed-port simulation or injected success.

## A01–A30 evidence mapping

`runtime` below means `tests/core/requestRuntime.test.ts`, exercised by both scoped and full receipts. Complementary existing tests are exercised by the full receipt; browser/mock distinctions remain explicit.

| ID | Evidence / disposition |
| --- | --- |
| A01 | Runtime allowed-Origin state save/read, status, every fake job kind, job reads, WAV, cancel/delete/cleanup controls. Configured-profile test adds end-to-end JSON/WAV/empty-204 CORS controls. |
| A02 | Runtime Origin-absent seeded reads and existing authenticated native service/state/job tests in `localService.test.ts`; no OPTIONS needed. |
| A03 | Runtime seeded minimal health with absent/allowed Origin; exact public keys only, no-store, no capability/private bytes, unchanged oracle; minimal health preflight. |
| A04 | Runtime configured preview and localhost full dispatch positives, actual assigned ephemeral authority/IPv6, expanded disabled-admission startup intervals, fixed public/default-port/internal-health separation. `publicIngress.test.ts` covers proxy Host boundary. Real LAN browser remains A24. |
| A05 | Runtime foreign/null-local-profile/wrong-scheme/wrong-port faults across all seeded rows. |
| A06 | Runtime serialized trailing-slash/path Origins return 403; malformed/multiple/duplicate fields return 400; full invariants. |
| A07 | Runtime missing/wrong/scheme/case/encoding/length malformed bearer variants across every private read/mutation/job kind. |
| A08 | Runtime capability from another concurrently live service across every seeded row; existing `requestAuthenticity.test.ts` restart rotation. |
| A09 | Runtime distinct wrong Host port, unconfigured localhost alias and rebinding hostname; forwarding cannot repair Host. |
| A10 | Runtime actual TCP missing Host, duplicate/equal and conflicting Content-Length, TE+CL, invalid chunk size; HTTP 400 with seeded full invariant. Existing duplicate Host/auth/type faults retained. |
| A11 | Runtime route-wide HEAD/TRACE/PATCH, exact Allow strings, method override headers. CONNECT is Node parser/connection rejection with empty response and unchanged seeded oracle, not an asserted application 405. |
| A12 | Runtime backslash, encoded slash and fragment per seeded row, plus existing unknown/query/absolute/dot/double-slash cases. |
| A13 | Runtime seven illegal media types across every applicable JSON body row. |
| A14 | Runtime legal case/charset/spacing variants on state/jobs/cancel/cleanup; preview/localhost positives use mixed-case quoted UTF-8. Wrong variants retain full oracle comparison. |
| A15 | Runtime invalid JSON shapes across every applicable body row, nonempty cancel and cleanup objects. |
| A16 | Runtime genuine chunked oversize (explicit TE, no CL) across state/jobs/cancel/cleanup; separate cleanup CL oversize and unsupported encoding controls; no partial effects. |
| A17 | Runtime GET/DELETE body/type/TE negatives; OPTIONS type/nonempty/TE negatives and explicit zero-CL preflight positives. Explicit zero-CL GET/DELETE positive expansion is not separately claimed by this supplement. |
| A18 | Runtime exact method/header grants across all seeded route rows, no-store, Vary Origin, no credentials/max-age; empty 204 and invariant. Health preflight separately checked. |
| A19 | Runtime missing POST/PUT content-type requested-header name, forbidden method/header, native PNA positive/negative, Docker-profile policy forbids PNA configuration; `publicIngress.test.ts` complements Docker ingress denial. |
| A20 | Runtime duplicate requested method/header controls per seeded row plus existing missing controls and unknown path cases. |
| A21 | Runtime successful preflight followed by independent wrong concurrent bearer, foreign Origin and malformed actual JSON; full seeded oracle comparisons. |
| A22 | Runtime paused worker four denials preserve entire pending oracle. Release completes and publishes expected range plus exact same fake WAV bytes as initial unpaused seeded control; source file preserved. A separately normalized cross-run full final-map/file equivalence is not asserted. |
| A23 | Runtime apparently trusted Origin/Referer/Sec-Fetch/Forwarded headers without capability across every seeded route/kind row; no work/private bytes. |
| A24 | **Parent-owned real-browser evidence required**; no Node/JSDOM substitute. |
| A25 | **Parent-owned real-browser disallowed/null-origin evidence required**. |
| A26 | **Parent-owned real-browser pairing/restart evidence required**. |
| A27 | Existing `capturedTransport.test.ts`, `requestPairing.test.ts`, snippet/frontend owner-fence tests in full receipt; not reclassified as real-browser proof. |
| A28 | Existing privateDelivery/pairing retention/receiver-loss tests; runtime body-await receiver-loss case; actual IPC receipt remains separate. Runbooks now document private TTY/IPC recipes and no secret args/logs/storage. |
| A29 | Runtime eight fake job-kind positive controls retain provider-off failed accepted-job semantics, zero fake provider calls. `localService.test.ts` tests public caption and ElevenLabs service-off/missing per-run consent, with fake provider/runner counters; accepted-job failure is not an admission denial. |
| A30 | Runtime invalid fixed policy refuses before delivery/listener/roots; real unavailable ephemeral bind; checkpoint/initialization failure disposal preserves preexisting durable snapshot/sentinels and closes listeners with no replay. Existing privateDelivery tests/actual IPC receipt complement receiver/tmpfs preflight. |

## Operator docs and review caveats

`local-runbook.md` now distinguishes unauthenticated health from paired private operations, exact optional preview/localhost enrollment, private native TTY requirement, rotation/re-pairing and historical unattended-unit limitations. `docker-runbook.md` now requires exact browser-visible public origins for both processes, documents `exec -it ... node scripts/pair-local.ts`, container-local tmpfs delivery, private terminal handling, public/internal authority separation and no PNA bypass. Provider opt-in/media/state boundaries are preserved.

Host direct Vitest failed because this worktree has no local node_modules; no host install was attempted. Image-only qualification was used instead. During fixture refinement, trailing-slash Origin was correctly classified as nonmatching 403 (not malformed 400). A fixed-port occupied-bind experiment created a database after valid preflight: that was the wrong startup lane for the ephemeral A30 no-effects obligation and is not claimed as an A30 defect. State business-schema experiments returned existing 428/default-empty-snapshot semantics; A21 was narrowed to unquestionably admission-invalid JSON rather than changing production semantics. Failed intermediate receipts remain external and are not qualifying receipts.

**Outstanding:** A24–A26 actual-browser packet and final independent spec/quality disposition. The narrower A17 and A22 assertions above must remain visible to the reviewer rather than being converted into blanket full-matrix completion. No commit, push, Beads update or closure was performed.
