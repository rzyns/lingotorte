# Personal-local request authenticity contract

**Runtime amendment / revision required:** Janusz's [Docker-primary private-LAN decision](../plan/docker-primary-runtime.md) supersedes the loopback-only/no-LAN/no-proxy deployment restrictions in this historical contract. Retain its request-admission, private-read protection, zero-side-effect rejection, pairing/credential-delivery, redirect and provider-consent objectives. Before `lt-sor` implementation, reconcile exact public authority/UI origins, the same-origin container proxy and native clients with the selected private-LAN runtime; do not simply substitute an unrestricted Origin/Host wildcard or claim CORS authenticates callers. The Docker contributor baseline is not implementation or security acceptance of this contract. Historical A01–A30 evidence requirements remain source material, not an assertion that the old loopback tuple is mandatory for Docker.

**Decision:** `lt-9zj` — recommend an exact request gate plus one ephemeral, process-scoped capability for the existing browser + loopback service.
**Approach:** validate authority, Origin, route/method and request envelope before dispatch; require the capability for every API operation except minimal health and validated preflight.
**Riskiest assumption:** the operator, local service, and selected UI origin are trusted; this is not protection against compromised same-user software or script running inside the paired UI.

Status: **accepted implementation contract** (`lt-9zj` closed), not implemented or browser-qualified. Historical decision-task source baseline: `a96ddce728e9860887d1a9b6fb0ef92105c04729`. Historical source observations and validation below retain that baseline. Current implementation and qualification state comes from canonical Beads; decision acceptance is not runtime acceptance.

Independent review: specification approved (`deleg_a24dfdb3/task-0`), quality approved (`deleg_a2dc2b80/task-1`). The proposal below is accepted as the implementation contract; application/browser qualification remains pending.

Evidence labels used below:

- **SOURCE-CONFIRMED:** directly traced source or existing test code, not an execution result.
- **PROPOSAL:** normative behavior for the next implementation; names of new settings/interfaces are design descriptions, not existing APIs.
- **TEST REQUIRED:** finite acceptance cases not run by this documentation task.

## 1. Decision and bounded threat model

### What is protected

**PROPOSAL.** Prevent an unpaired caller from reading learner snapshots, transcript/job results or snippet bytes, overwriting state, scheduling or cancelling jobs, executing local commands, or deleting artifacts. Preserve the personal-local boundaries in [DECISIONS.md](../../DECISIONS.md) and the [safety review](../review/safety-privacy-boundary-review.md), especially its media-path contract at line 158.

| Actor / boundary | In scope and response |
| --- | --- |
| Unrelated webpage, including a different local development origin | Validate Origin before dispatch, not just in response headers. Block simple requests as well as preflighted requests. Require capability even when Origin is allowed. |
| Opaque-origin document (`Origin: null`), file page, sandboxed page | Reject `null`; no file-page exception. An absent Origin is a different case and still needs capability for protected operations. |
| Attacker-controlled hostname resolving to loopback / wrong service authority | Exact Host check, independent of socket binding and Origin; never authorize by DNS resolution or hostname suffix. |
| Non-browser caller / local automation without pairing | Loopback and a spoofed permitted Origin are insufficient. Require capability. |
| Paired browser or explicitly paired script | Same personal-operator authority; no per-user or per-route roles. Normal payload validation and provider consent still apply. |
| Other network machines | Preserve loopback binding. No LAN, reverse-proxy, wildcard bind, hosted or multi-user mode. |
| Compromised UI origin, extension with UI access, same-user malware, administrator, stolen capability | Outside the assurance boundary. They may read memory, replace local software or act as the operator. Do not claim this bearer capability isolates OS users or defeats XSS. |

No browser exploit has been demonstrated. The source defect is the absence of a request-authenticity gate, not evidence that every browser can exploit it. Browser CORS enforcement, local-network permission prompts, DNS behavior and fetch metadata are not the server's authorization mechanism. `Referer` and `Sec-Fetch-*` must not substitute for the checks below; do not require them for native clients.

The authorized operator still explicitly supplies owned/local media paths. This decision adds **no media-library root allowlist**, no new permission to execute downloads, no provider enablement, no credential discovery, and no authentication framework, accounts, cookies, OAuth, TLS deployment or cloud sync. It does not repair independent path portability, restore/revision, command configuration or job cancellation semantics.

### Choices and tradeoffs

1. **Use a process capability, not Origin-only trust.** Native clients can supply Origin/Host freely. A public HTTP token-discovery endpoint would erase the pairing boundary for them, so none is permitted. The cost is explicit pairing after service restart and browser reload.
2. **Protect reads as well as writes.** State and job results contain private material; snippet GET already mutates LRU metadata. Only minimal health stays unauthenticated. This changes current status/polling clients, deliberately.
3. **One canonical service authority; exact UI-origin allowlist.** Default UI origin is `http://127.0.0.1:5173`. Preview `http://127.0.0.1:4173` is explicit startup opt-in, not an implicit wildcard. `localhost`/IPv6 are not aliases of the default origin. Changing these defaults later affects pairing and tests, not the basic protocol.
4. **Keep browser fetch-to-Blob snippet playback.** It can carry a capability header; direct `<audio src="http://.../api/snippets/...">` must not become a tokenless exception. No capability in media URLs.

## 2. Complete source trace

**SOURCE-CONFIRMED.** Paths and line numbers below refer to the baseline above. Server references are to `apps/local-service/src/server.ts`; browser references are to `apps/web/src/`.

### Existing route/effect inventory

| ID | Actual route | Current entry/effects | Existing caller and proposed envelope |
| --- | --- | --- | --- |
| R01 | `GET /api/health` | Server 941–952: service/version/host/actual port, no learner state. | Runbook health check and core tests. No capability; no body. |
| R02 | `GET /api/status` | 954–956: redacted config, provider readiness and persistence metadata. | `model.ts:280`, Settings connection. Capability; no body. |
| R03 | `GET /api/state` | 959–961: loads private snapshot. | `model.ts:281`, connection hydration. Capability; no body. |
| R04 | `PUT /api/state` | 964–968: JSON parsing then `persistence.saveSnapshot`. | `model.ts:254–271`; explicit Save and autosave (`309–312`), including supported in-browser learning/import changes. Capability + JSON object with `snapshot`. |
| R05 | `POST /api/jobs` | 971–1000: validates kind, inserts job into map, immediately dispatches applicable work; not merely a queue proposal. | Browser job paths below. Capability + JSON object with existing kind/payload schema. |
| R06 | `GET /api/jobs/:id` | 1003–1011: returns job status and possibly transcript/caption/subtitle/snippet result. | All browser job pollers. Capability; no body. |
| R07 | `POST /api/jobs/:id/cancel` | 1013–1022: updates job status/map, leaves completed jobs completed; does not establish process termination. Currently ignores body. | Core test at `tests/core/localService.test.ts:129–149`; no current browser caller found. Capability + JSON `{}`. |
| R08 | `GET /api/snippets/:uuid` | 1025–1033: increments access counter/`lastAccess`, reads audio file, returns WAV. **Not side-effect-free.** | `sourceAudioSnippet.ts:42–44`. Capability; no body. |
| R09 | `DELETE /api/snippets/:uuid` | 1035–1039, helper 702–708: removes map entry and scratch file. Currently ignores body. | `sourceAudioSnippet.ts:45–46`. Capability; no body. |
| R10 | `POST /api/artifacts/cleanup` | 1042–1045, helper 768–782: switches lifecycle to cleaning, drains snippet jobs, clears snippets, recursively cleans scratch. Currently ignores body. | Core tests (`localService.test.ts:537–555`; `b6SourceMediaSnippet.test.ts:145–169`); no current browser caller found. Capability + JSON `{}`. |
| R11 | `OPTIONS` | 934–936 currently accepts every path without examining preflight fields. | Browser-generated preflight, not explicit application fetch. Proposed: only known routes and allowed requested method/headers; no capability and no body. |

Unmatched requests currently receive 404; the catch at 1049–1050 maps thrown errors to 400. There is no request Origin, Host, capability or Content-Type authorization check in this dispatch. `sendJson` (99–109) emits the fixed dev CORS origin and advertises `content-type` only. Snippet responses repeat that origin directly (1031, 1037). `readJsonBody` (116–129) caps bytes but ignores Content-Type and returns `{}` for an empty body. The existing loopback guard (80–97) validates bind configuration, not the HTTP caller.

### Every job kind behind R05

| Kind | Effects and gates in service | Browser trace |
| --- | --- | --- |
| `waiting` | Creates queued map entry; no worker. | Core synthetic job/cancel tests, no current browser caller. |
| `noop` | Creates completed map entry. | Test/native use, no current browser caller. |
| `local-transcription` | Payload validated before insertion for this kind; creates job scratch, executes ffmpeg/Python; optional alignment writes transcript scratch (`499–533`, `784–807`). | `model.ts:1732–1778` creates/polls ASR jobs. |
| `elevenlabs-scribe` | Checks service online gate, per-request consent and key presence before scratch/audio extraction/provider work (`535–567`, `809–832`). These checks currently happen after job insertion. | `model.ts:1781–1833`, explicit consent included in payload. |
| `youtube-caption` | Checks service online gate and public-read consent before public caption fetch (`589–627`, `834–857`); no media download. Checks happen after insertion. | `model.ts:1836–1878` creates/polls caption job. |
| `embedded-subtitle-list` | Executes ffprobe; listing is a job even though it does not import a track (`629–640`, `859–882`). | `model.ts:1539–1596`; shared poller at `1492–1514`. |
| `embedded-subtitle-extract` | Creates scratch, executes ffmpeg, reads/imports subtitle as draft, returns cues (`642–679`, `884–930`). Browser later updates its store. | `model.ts:1617–1729`; later persistence uses R04. |
| `source-audio-snippet` | Executes extraction, registers output, LRU-evicts/deletes at capacity, updates job; failure/cancellation cleanup also deletes output (`710–760`). | `sourceAudioSnippet.ts:21–49`; called from Practice (`app.ts:538`) and Player (`app.ts:2260`). |

The common gate must precede **all** these effects, including `waiting`/`noop` map insertion and listing commands. Protecting only transcription or only SQLite writes is incomplete.

### Browser and native compatibility consequences

- `model.ts:177–202` only trims/trims trailing slashes from the service URL; `fetchLocalServiceJson` adds JSON Content-Type when a body exists. It does not attach a capability, constrain destinations or disable redirects.
- `app.ts:3917–3983` exposes URL/Connect/Save/autosave, not pairing. Changing URL currently only assigns the string (`model.ts:301–303`). All model clients listed above must share the new paired transport, including polling and status, not just POST/PUT calls.
- `sourceAudioSnippet.ts` is a **separate fetch path**: create → poll → fetch WAV Blob → DELETE → create object URL. Updating `fetchLocalServiceJson` alone misses this path. Preserve deletion-before-promoting-audio and object URL revocation.
- `vite.config.ts:6–15` fixes dev to `127.0.0.1:5173` and preview to `127.0.0.1:4173`; both strict-port. Current CORS covers only the former. `scripts/start-local.mjs:7–11,37–39` inherits stdio and starts service/UI; it has no pairing distribution mechanism.
- Existing service tests use Node `fetch` without Origin/capability and ephemeral ports. `tests/web/localServiceSettingsUi.test.ts:10–23` installs JSDOM globals at `http://localhost:5173/`, but does not replace Node fetch with browser networking. These tests are **not CORS/browser evidence**. `tests/web/localServiceSync.test.ts` exercises model persistence similarly.
- `tests/web/b7EmbeddedSubtitleFrontend.test.ts:348–368` currently expects a custom service URL path prefix. The new direct-service transport rejects path prefixes; revise this mock expectation deliberately, not by retaining a token-leaking arbitrary base URL. There is no matching prefix route in this server.
- `tests/core/b6SourceMediaSnippet.test.ts:181–203` expects bare GET init; update it to assert authenticated GET and DELETE. Existing cancel/cleanup tests send bodyless POST; migrate them to JSON `{}`.
- Runbook `docs/dev/local-runbook.md:85–86` has unauthenticated curl health/status. Health remains compatible; status needs pairing. No browser cancel/cleanup request was found in the frontend source search, despite Settings description mentioning cleanup.

## 3. Normative request policy

Everything in this section is **PROPOSAL**. All checks apply independently; a good capability does not override bad Origin/Host, and good Origin does not override a missing capability.

### Authority and Origin

- Continue rejecting non-loopback bind configuration **before startup filesystem work**. Default bind remains `127.0.0.1`. Build the accepted HTTP authority from the configured canonical loopback host and **actual listening port**, including `port: 0` tests. Bracket IPv6 correctly: `[::1]:port`. Do not concatenate bare `::1` into a URL as current code does.
- Require one well-formed Host whose parsed host/port equals that canonical authority. Accept `localhost` or `[::1]` only when explicitly selected as the service's canonical host, not automatically alongside `127.0.0.1`. No DNS lookup to prove trust. Reject wrong/omitted port, wildcard/non-loopback names, trailing-dot names, userinfo and extra authority components. HTTP hostname casing is insensitive; ports must use canonical decimal spelling. No automatic URL-normalization acceptance of shorthand/numeric loopback spellings.
- Ignore `Forwarded`/`X-Forwarded-Host` as authority; a proxy is outside scope. They cannot repair an invalid Host. Reject duplicate Host/Origin/Authorization/Content-Type fields via raw header inspection, not just Node's possibly joined/discarded representation. Transport-parser rejection is also acceptable for malformed framing.
- If Origin is present, require exactly one serialized origin equal to a startup-configured allowed UI origin. Default only `http://127.0.0.1:5173`. Optional exact local origins (e.g. preview `http://127.0.0.1:4173`) must be explicitly configured before startup. Only HTTP and the canonical loopback host spellings `127.0.0.1`, `localhost`, `[::1]` with an explicit valid port may be configured. No `*`, suffix match, credentials, path, query, fragment, `null`, `file:`, HTTPS assumption or request-driven enrollment.
- Missing Origin is allowed for a capability-bearing request; this is **not** a claim the caller is non-browser. Native tools need not forge Origin. Present-but-disallowed Origin fails even with a valid capability. Minimal health permits absent Origin but still rejects a present invalid one.

### Capability and pairing

- Generate a fresh unpredictable **32-byte** capability with OS-backed cryptographic randomness per service start; encode base64url without padding. Do not derive it from a port, origin, UUID job ID, time, machine identity or provider credential.
- Require one `Authorization: Bearer <capability>` on R02–R10. Validate the exact token encoding/length and compare equal-length bytes in constant time. Malformed/missing/wrong/stale capability returns 401 with a generic error and `WWW-Authenticate: Bearer realm="lingotorte-local"`; never echo it. No query/body/cookie/URL capability fallback. Health and valid OPTIONS do not require it.
- **Minimal bootstrap selected:** explicit local terminal-to-Settings pairing. The service delivers the generated value once through a dedicated direct interactive TTY pairing display, separate from structured status/startup logs. UI has a masked session-capability input beside its exact service origin; the user pastes it and explicitly connects. Do not print it when stdio is redirected/inherited by a noninteractive logger. Never put it into startup JSON, Vite assets, HTTP health/status, an unauthenticated bootstrap endpoint, URL fragment/query, shell command arguments/history, or committed fixtures.
- For in-process synthetic tests/explicit local automation, add a local-only programmatic startup delivery seam (e.g. a callback receiving the generated capability); it is **new implementation work**, not an existing runtime option. It must not expose the value over HTTP or general config/status serialization. If neither a private interactive delivery path nor an explicitly configured local programmatic receiver is available, fail startup before opening state or cleaning scratch. No insecure unpaired fallback. Headless persistent deployment/bootstrap is not authorized by this decision.
- Browser keeps capability in a nonserialized, in-memory paired-client object bound to one exact service origin, not SQLite, learner snapshot/export, localStorage, sessionStorage, IndexedDB or ordinary logs. Clear the input after pairing. Reload requires pairing again; service restart invalidates all previous clients. Multiple explicitly paired tabs share operator authority, **not** write-conflict protection.
- URL edit/disconnect clears the active pairing and stops new authenticated work. In-flight requests retain their captured original origin/session and may not retarget a replacement endpoint; stale responses must not update the replacement connection. A 401 stops autosave/new jobs/poll loops with a generic “pair again” state; do not retry without credentials or replay a mutation automatically after pairing.
- Non-browser scripts use the same capability and exact authority; Origin may be absent. HTTP libraries can fake headers, so header assertions alone never enroll a script. Use private process memory/input for delivery, not provider keys or a general-purpose long-lived password. Same-user software that steals this value is outside the threat model.

This delivery cost is chosen over auto-fetching a token from the service. A later launcher/desktop bridge may replace manual pairing only with an independently reviewed local secret-delivery boundary; do not silently add an unauthenticated token endpoint for convenience.

### Route, method, body and dispatch order

Use a single route table/gate before handler effects, including binary/204 responses. Do not scatter partial checks through `sendJson`.

1. Validate Host, Origin and request-target syntax. Accept origin-form canonical API paths only; no absolute-form target, query/fragment, backslash, dot-segment normalization, percent-encoded routing escape or proxy target. No API currently needs a query string. Keep identifier matching consistent with emitted IDs and the existing snippet UUID route.
2. Resolve known route and allowed methods. Unknown route: 404. Known route, wrong method: 405 with `Allow` listing that route's methods plus OPTIONS. No HEAD/TRACE/PATCH/CONNECT fallback or method override from headers/body/query. This classification performs no state/job/snippet lookup.
3. For OPTIONS, apply the preflight policy below and return without dispatch. Otherwise require capability except health.
4. Validate envelope and read only bounded permitted bodies. Preserve the existing 5 MiB ceiling for JSON bytes, measured while streaming (not trusted Content-Length). Reject unsupported Content-Encoding; do not decompress bodies. Do not read unauthorized bodies into application buffers. Reject/close or boundedly discard at the transport level without invoking any handler; avoid unbounded draining. Handle `Expect: 100-continue` through the same admission gate rather than treating it as permission to dispatch.
5. For PUT state and POST jobs/cancel/cleanup, require `application/json`, optionally one `charset=utf-8` parameter; compare media type/charset case-insensitively with legal whitespace. Reject all other parameters/charsets, absent type, `text/plain`, form-urlencoded, multipart, vendor JSON and other types with 415. Parse valid JSON object before effects; no empty-body-to-`{}` conversion. Cancel/cleanup require exactly `{}`. Malformed/empty/nonobject/unexpected cancel/cleanup fields: 400. Oversize: 413.
6. GET/DELETE/OPTIONS accept no request body and no Content-Type. Reject declared nonzero length, transfer-encoded body or unexpected body bytes before side effects; zero Content-Length is fine. Unsupported Content-Type on these routes: 415; body/framing violations: 400. Node-level malformed framing may close the connection instead. Set finite transport body/header timeouts; this is not a general denial-of-service guarantee.
7. Only after successful gate and envelope validation may the matched handler read private state, alter maps/counters/lifecycle, save SQLite, start a job/command/provider operation, or clean/delete artifacts. Existing semantic payload validation remains necessary; capability is not provider consent or media-rights proof.

For multi-fault requests, follow this order: malformed authority/headers/target 400; well-formed wrong Host or Origin 403; route/method 404/405; capability 401; encoding/media type 415; body size/JSON/shape 413/400. Tests should normally change one condition at a time. Errors must not contain request secrets, private paths, payloads, notes or cue text.

### Preflight and CORS are response mechanics, not authorization

- OPTIONS needs valid Host, known path, one allowed Origin, exactly one `Access-Control-Request-Method` permitted for that route, and a case-insensitive requested-header set contained in `{authorization, content-type}`. Duplicate/malformed preflight control fields: 400. Missing Origin/requested method: 400. Forbidden Origin/requested method/header: 403. No body; no actual bearer value is required or issued.
- A protected route's requested-header set must include `authorization`; POST/PUT must also include `content-type`. Missing those expected names: 403. Health GET permits an absent/empty requested-header set. Reject `Access-Control-Request-Private-Network: true` with 403 in this initial direct local profile; do not opt into a broader network-access mode accidentally. Test supported browsers rather than assuming they never request it.
- Successful preflight: empty 204, no JSON body, allowed exact Origin, requested permitted method, allowed requested headers, `Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers`, `Cache-Control: no-store`; omit preflight max-age initially. It never creates a session or reserves a job. Unknown OPTIONS path: 404.
- For actual requests with validated Host and allowed Origin, add that exact `Access-Control-Allow-Origin` and `Vary: Origin`, including allowed-origin error responses (so the UI can see a 401/415). No wildcard, no `Access-Control-Allow-Credentials`, no Set-Cookie. Missing Origin gets no CORS grant. Wrong Host/disallowed Origin gets no CORS grant. Apply consistently to JSON, WAV and 204 deletion responses.
- Each actual request is independently gated even if a browser cached a successful preflight. Native callers do not need to send OPTIONS. A denied preflight must have no more application side effects than any other rejected request.

### Browser transport destination safety

Before attaching capability **or sending learner state**, parse/validate the user-entered base URL locally. Accept only an exact HTTP loopback origin with explicit port, optional root `/`, and no username/password/path prefix/query/fragment. Reject remote hosts, deceptive loopback spellings, `file:`, `data:`, `blob:`, `javascript:` and arbitrary HTTPS origins. Display the exact destination during explicit pairing; HTTP cannot prove the process owning that local port is genuine.

Use a shared paired transport for model and snippet requests, with `credentials: 'omit'`, `redirect: 'error'` and no `no-cors` fallback. Do not set Origin manually in browser JavaScript. Validate any server-supplied snippet path against `/api/snippets/:uuid` before constructing the URL; never follow an absolute/protocol-relative result URL or route to another authority. Keep capability out of Blob/audio URLs. A base-URL change cannot carry an existing capability or snapshot to the new destination automatically.

## 4. Reject-side-effect invariant

**PROPOSAL / TEST REQUIRED.** A request rejected by this admission policy (authority, Origin, method, capability, preflight, encoding, media type, body size/JSON/envelope) has **zero request-attributable application side effects**:

- no persistence save/transaction or learner/provider-policy change;
- no job ID allocation/queue/map insertion, job status/cancel update or worker dispatch;
- no command runner, media read, provider HTTP call or new scratch/model artifact;
- no snippet registration, LRU touch/eviction, deletion, cleanup scheduling, lifecycle transition or drain of running work;
- no private response bytes, generated token, raw request logging, or secret-bearing error.

A small generic denial response and safe bounded diagnostic counters are not learner/application mutations. Startup/normal shutdown cleanup is a separate operator lifecycle action; take negative-test baselines **after** startup and inspect **before** shutdown. An already-authorized background job may progress concurrently; use a gated fake runner and prove rejection neither cancels/drains it nor changes its result/publication behavior.

Do not hide a rejected request by returning an error after queuing work. Conversely, an authenticated request accepted as a job and later failing payload/provider validation is a job failure, not a request-policy rejection. Baseline provider-disabled jobs currently create a failed job record; this decision does not relabel that behavior as side-effect-free. Snapshot semantic/transaction validation and whole-job preflight remain their own correctness contracts. All admission checks and JSON/envelope failures specified here must occur before those business handlers.

## 5. Finite next acceptance matrix

**TEST REQUIRED, not passing evidence.** Run only against disposable synthetic state/scratch and injected command/provider fakes; never call real ffmpeg/Python/providers for this matrix. Use a raw Node HTTP/socket client where fetch cannot send duplicate Host, invalid framing or wrong target forms. Do not infer browser results from Node fetch/JSDOM.

For each negative row targeting mutations, exercise **R04, R05, R07, R09, R10 and R08** (the LRU-mutating GET), using otherwise valid per-route envelopes and existing synthetic resource IDs. Envelope-specific rows apply to their stated body classes. For R05 capability/origin/host denial, cover all eight enumerated job kinds with otherwise valid synthetic payloads. A table-driven expansion is finite; report expanded case counts from execution, not a hand-estimated total.

| Case | Request / setup | Required result |
| --- | --- | --- |
| A01 | Canonical Host; allowed dev Origin; current capability; valid route envelope | R02–R10 succeed under their existing semantics; save/reload and job/result/cancel/snippet/delete/cleanup positive controls work. R05 covers every kind using fakes. |
| A02 | Same valid protected requests, Origin absent | Native client succeeds without OPTIONS; capability still required. |
| A03 | Minimal GET health, correct Host; absent or allowed Origin; no capability | 200 minimal public health only; no status/state/provider metadata/token. |
| A04 | Explicitly configured preview origin / canonical localhost or IPv6 service profile; actual ephemeral port | Exact configured cases work; bracketed IPv6 Host/URL is correct. Unsupported platform IPv6 must be a named skipped gate, not presumed passing. |
| A05 | Valid capability, foreign web Origin / unconfigured local origin / wrong scheme or port | 403, no CORS grant, invariant. Include preview and localhost when not configured. |
| A06 | Origin `null`, multiple origins, path/trailing slash in Origin, malformed/duplicate Origin | `null`/nonmatching serialized values 403; malformed/duplicate fields 400; invariant. |
| A07 | Correct Origin but missing/wrong/malformed capability; or absent Origin without capability | 401 for protected routes, no handler/private bytes. Spoofed good Origin from native client is insufficient. |
| A08 | Capability from previous start or another concurrent service | 401; original token never appears in response/log/status/export. New service capability works. |
| A09 | Valid capability and Origin, wrong well-formed Host/port, rebinding-style hostname, unconfigured alias | 403 before lookup/body/dispatch; forwarded headers cannot repair it. |
| A10 | Missing/duplicate/malformed Host, duplicate Authorization/Content-Type; malformed framing | 400 or parser-level connection rejection; invariant. Duplicate fields cannot be hidden by header normalization. |
| A11 | Known route with HEAD/PATCH/TRACE/wrong method; method-override attempt | 405, no mutation; use otherwise valid Host/Origin. Override header/body never changes actual method. |
| A12 | Unknown path; absolute-form target, query, encoded slash/dot escape, backslash | Unknown path 404; forbidden target form 400; no normalization into an admitted route. |
| A13 | POST/PUT missing Content-Type or text/plain, form-urlencoded, multipart, vendor JSON | 415 even if bytes form valid JSON. Simple-form-shaped cancel/cleanup cannot execute. |
| A14 | POST/PUT JSON with utf-8 charset/case/whitespace variants; wrong charset/extra parameters | Specified legal variants succeed; wrong variants 415 before handlers. |
| A15 | POST/PUT empty body, invalid JSON, null/array/scalar; cancel/cleanup nonempty object | 400, invariant. Valid `{}` only for cancel/cleanup; valid objects for state/jobs must still satisfy their schemas. |
| A16 | JSON body over existing limit, including chunked input; unsupported Content-Encoding | 413 / 415 respectively, no partial save/job/scratch effects. Bound memory/time; do not decompress. |
| A17 | GET/DELETE/OPTIONS nonempty/transfer-encoded body or Content-Type | 400 body / 415 type; no LRU touch/deletion/preflight grant. Zero Content-Length without type is accepted. |
| A18 | Valid OPTIONS for every supported method/path, required requested-header names, no bearer value | Empty 204, exact route-specific CORS fields, no capability issuance or application side effects. |
| A19 | OPTIONS foreign/null Origin, forbidden method/header, omitted required auth/type header name, private-network request | 403; no dispatch/CORS authority for foreign origin; invariant. |
| A20 | OPTIONS missing Origin/method, duplicated control fields; unknown path | 400 / 404 as specified, invariant. |
| A21 | Successful preflight then invalid actual capability/Origin/body | Actual request independently rejected with its own status/invariant. No cached approval bypass. |
| A22 | Denied cancel/delete/cleanup while a fake snippet worker is paused | Denial returns without draining/cancelling worker or changing lifecycle/LRU/maps. Releasing worker afterward has the same outcome as control. |
| A23 | Native client sets all apparently trusted headers but has no capability | No private reads/writes, jobs/commands/deletions; minimal health/preflight exceptions only. |
| A24 | Real supported browser on dev origin, explicit synthetic pairing | Connect/status/state, save, local fake job/poll and WAV fetch→DELETE→Blob playback work. Observe actual preflights and error handling; no provider calls. |
| A25 | Real browser on a second unallowed loopback origin; sandboxed/null-origin test page | Attempt form POST, fetch POST JSON, DELETE and snippet navigation/embed. Verify service effects remain absent even when browser hides responses. Record any browser-local-network prompt/block rather than treating it as server proof. |
| A26 | Browser missing/wrong capability from allowed origin; service restart during polling/autosave | Generic visible pairing error; no retry without auth, automatic replay or false success; bearer never displayed in status. |
| A27 | Browser base URL changed to remote/deceptive host/path/query/userinfo; 3xx response or hostile result URL | Client refuses before token/state egress; redirect not followed; result path constrained; changing endpoint clears pairing. Test all model and snippet paths. |
| A28 | Capability retention and startup-delivery failure | Nothing in snapshots/exports/web storage/URLs/structured logs; reload/disconnect clears browser value; noninteractive startup without receiver fails before state/scratch effects. No HTTP token endpoint. |
| A29 | Provider-off / missing per-run provider consent with valid request capability | Existing provider policy preserved: zero provider/command work where disabled gates require it. Failed accepted-job records are allowed under existing semantics; not counted as policy rejection. No real provider calls. |
| A30 | Non-loopback bind config, malformed configured UI origin, unusable capability delivery | Fail closed before database creation, scratch cleanup or listener start; no permissive fallback. |

### How to prove the invariant rather than just status codes

Seed a synthetic snapshot, waiting job, completed snippet and sentinel scratch files through authorized setup. Capture logical SQLite snapshot/event contents, persistence-save spy count, full job map/status, snippet map/access counter, filesystem manifest with content hashes, lifecycle and fake runner/provider call counts. Use a local-only observation/test seam if necessary; **do not add a public debug/jobs-list endpoint** for assertions. Compare before and after each denial, including a bounded event-loop/task-settlement checkpoint. Verify authorized positive controls actually change the relevant state so a broken route or a Windows path failure cannot masquerade as protection.

A denied snippet GET must not refresh LRU order. A denied cleanup must not set `cleaning`, clear snippets or wait for a gated worker. A denied POST jobs must not create even a failed/noop record. An HTTP 403 by itself proves none of these.

Minimum implementation evidence packet: exact revision, expanded case IDs/results, commands, supported browser/version and observed origin/preflight behavior, isolated paths redacted, provider/command fake counts, retry/failure/skip details, plus independent spec and quality review. Real-browser gates A24–A26 remain explicit if the runtime/browser lane is not yet ready; do not call Node tests a substitute.

## 6. Implementation handoff and evidence from this task

### Closure coverage clarification — amendment `lt-foe.1`

`lt-sor` implements the **entire** normative policy in §3–§5 and A01–A30, not merely cross-origin mutations. At its qualified content-bound revision, record the actual server routes/methods, job kinds, effect classification and every model, snippet and native client. R01–R11 above are the historical baseline inventory, not a frozen allowlist or a completeness claim for later code. Classify added restore preview/commit APIs under the same common gate; unknown/unclassified routes remain non-dispatchable, with no tokenless exception. Newly added private reads or effectful GETs require the same rejection oracles. Do not multiply every envelope-specific row onto inapplicable body classes; expand applicable cases programmatically and report the actual results.

Admission/envelope negative tests must cover private response disclosure as well as writes, including status/state/job results and the LRU-mutating snippet GET. Use the full §4 invariant and §5 before/after observation, authorized positive controls and paused-worker comparison. Pairing delivery/lifetime, all-client destination/redirect safety and requalification of changed startup behavior are part of `lt-sor`; fake HTTP/DOM evidence cannot close real-browser A24–A26.

Restore and request implementation may proceed independently after their own prerequisites. Restore API authors must wire any new handler through the common admission boundary, identify pending integration explicitly, and never claim bypassed routes secure. `lt-2t4` joins the branches, reconciles the **integrated** route/client inventory and qualifies the complete request/restore/revision contracts. An earlier `lt-sor` receipt cannot certify a later-added route without this reconciliation. See [restore ownership](restore-audit-semantics-contract.md#closure-ownership-clarification--amendment-lt-foe1) and [amendment disposition](../review/planning-amendments-2026-10-10.md).

**Mechanical work, next slice:** introduce one request gate/route table; safe process capability delivery; paired browser transport shared by model/snippet clients; masked explicit pairing UI; consistent CORS on JSON/WAV/204; update native test helpers and affected runbook/examples; implement the matrix and review it. Do not add a second authentication layer or refactor unrelated persistence/media logic. Coordinate runtime/IPv6/startup fixes with the separate platform decision, without assuming its result.

**SOURCE-CONFIRMED evidence gathered here:** read canonical `lt-9zj` (claimed by `hermes-request-policy`) and closed authorization `lt-dy6`; read `BEADS.md`, `DECISIONS.md`, safety review and R4; traced server dispatch/helpers and both frontend networking paths; inspected relevant existing service/snippet/sync/Settings tests. A targeted test-source search for literal Origin/Host/Authorization/OPTIONS/text/plain/CORS header checks or session/capability-token identifiers returned no matches. That is a scoped source search, not a proof no related test exists under another spelling.

**Executed validation scope:** source inspection, Git baseline/scope checks and structural validation of this document/route inventory only. A Python assertion check returned 11 ordered route rows R01–R11 against 11 source HTTP-method branches, coverage of all 8 source job kinds, 30 ordered acceptance rows A01–A30, and 2 valid relative document links. It also asserted that `git status --porcelain --untracked-files=all` contained only this new document at the stated baseline. These are structural/source checks, not security tests. No application test suite, listening service, browser exploit, learner database, actual provider, command runner, install or credential inspection was run. Existing tests cited above are evidence of test design, not claimed fresh passes. No app/shared-root document changes, commit/push or bead closure belong to this task.

**Historical parent review asks, now resolved by the approvals above:** (1) ephemeral capability/manual pairing instead of Origin-only or public bootstrap; (2) exact-origin defaults and the deliberate bodyless-POST/custom-prefix compatibility breaks; (3) route coverage and reject-side-effect matrix. Implementation evidence is still required; only an incompatible product/privacy boundary requires escalation.
