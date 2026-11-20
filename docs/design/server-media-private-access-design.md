# Server-managed media and private browser access — design (`lt-zt0`)

Status: **reviewed design, revision 2; independent SPEC/QUALITY PASS (`deleg_b59d225b/task-2`) after correction of the initial FAIL. Not implemented.** Base `80b1e20ba1d687c51f1ac560fcfec1ac3527ad72`, branch `work/lt-zt0-media-access-design`. Authority: the `lt-192` SCOPE EXTENSION comment (2026-10-30 16:11, parent-recorded interpretation of Janusz's "Please proceed") authorises `lt-zt0` **design only**. This note grants nothing to D (`lt-192.4`) or E (`lt-192.5`): no streaming/upload code, no Compose/Tailscale/network change, no pairing change, no real state or media. Parent/operator owns publication and closure. Design acceptance does not approve the proposed cookie: its separate owner security-contract decision and the D/E implementation/configuration gates remain open.

Implementation update (2026-10-30): the D read-only playback part (M1–M4, §5.1–§5.6) exists as an **implementation candidate qualified with synthetic media only** on `work/lt-192-4-server-playback`, pending independent review; see [`docs/dev/lt-192.4-server-playback-result.md`](../dev/lt-192.4-server-playback-result.md). It is not accepted: the actual iPad rows, B1–B5 and E (uploads) remain open. The design text below is unchanged.

Evidence labels: **[src]** read from source at the base commit (`path:line`). **[doc]** official public documentation or standard (URL given). **[decision]** recorded owner decision. **[rec]** this note's recommendation. **[unverified]** a claim that needs runtime or owner evidence before anyone relies on it. Nothing here was executed against the application.

## 1. Problem and constraints

The adopted brief wants one computer-hosted library that both the desktop browser and the iPad play from, with seeking, after a desktop upload (`docs/design/product-brief.md:24,36`; `DECISIONS.md:46`). Today, media bytes never leave the browser. Import reads the whole file into memory to hash it (`apps/web/src/model.ts:1598-1601`). Playback uses an object URL or falls back to `originalPath` (`model.ts:1378-1380`). `originalPath` can hold a `blob:` URL, a `browser-file-handle:` label (`model.ts:45`), a `youtube:` id (`model.ts:2870`) or an absolute service path. Service jobs read absolute paths, with no media-root confinement (`apps/local-service/src/server.ts:1208-1212`; the contract adds "no media-library root allowlist", `docs/dev/local-request-authenticity-contract.md:39`).

Binding constraints:

1. **Pairing stays.** Every protected route needs `Authorization: Bearer` (`apps/local-service/src/requestAdmission.ts:101-108`). Host must match exactly (`:90`), and Origin must match when present (`:92`). The proxy keeps Host and strips forwarding headers (`apps/local-service/src/publicIngress.ts:4-16`; `vite.config.ts:8`). Replacing pairing needs a reviewed access contract plus separate implementation/configuration authority (`DECISIONS.md:286`; `docs/design/implementation-handoff.md:41`).
2. **A `<video>` element cannot send a bearer header.** The contract forbids putting the capability in media URLs and forbids a tokenless media exception (`local-request-authenticity-contract.md:46,117`).
3. **The source folder stays read-only.** `/media` is a read-only bind (`compose.yaml:30-35`). Managed uploads need a separate, explicitly writable location (`DECISIONS.md:46`).
4. **Out of scope:** transcoding, resumable uploads, media export, native iOS and providers (`implementation-handoff.md:45`). Tailscale is a recommendation, not a verified boundary (`DECISIONS.md:286`).

## 2. Current access path (traced)

| Hop | Behaviour [src] |
| --- | --- |
| Host publish | Only `web` publishes a port: `${LINGOTORTE_BIND_HOST:-0.0.0.0}:${LINGOTORTE_WEB_PORT:-5173}:4173` (`compose.yaml:52-53`). `api` sits only on the `internal: true` network (`compose.yaml:41,109-111`). The runbook rehearsal binds `127.0.0.1` (`docs/dev/docker-runbook.md:13`). The LAN profile binds `0.0.0.0` (`docker-runbook.md:46`). |
| Web tier | Vite 8.0.16 preview (`package.json:47`). In the installed `node_modules/vite/dist/node/chunks/node.js:33902-33912` (primary checkout), the order is: CORS (disabled, `vite.config.ts:41`), then `allowedHosts`, then plugin hooks (our exact-Host ingress, `vite.config.ts:15-21`), then the `/api` proxy, then compression. Compression is mounted after the proxy, so it never wraps proxied `/api` responses. The proxy streams in both directions (`node.js:17323,17331`), with `changeOrigin: false, xfwd: false` and no cookie rewrite configured (`vite.config.ts:8`). |
| API boundary | `boundary` → `admit` → `dispatch` (`server.ts:751-760`). `admit` does the following: rejects duplicate security headers (`requestAdmission.ts:55-57`); accepts only origin-form `/api/...` paths with no query (`:88`); returns 405 for unlisted methods, so HEAD is 405 everywhere today (`:98-100`); requires `application/json` on POST/PUT, and rejects bodies or types on other methods (`:109-113`); buffers JSON bodies up to 5 MiB (`:5,134-143`); sets `cache-control: no-store` (`:93`). |
| Timeouts | API: `headersTimeout` 10 s, `requestTimeout` 15 s, socket `timeout` 15 s (`server.ts:763-766`). The web tier uses Node defaults: `requestTimeout` 300 000 ms, socket timeout 0 ([doc] Node.js HTTP, `server.requestTimeout` / `server.timeout`, https://nodejs.org/api/http.html). |
| Existing media route | `GET /api/media/:uuid/transcripts` (`requestAdmission.ts:76`; `server.ts:1105-1115`). Ids match a UUID regex (`requestAdmission.ts:66`). Ids are generated with `Math.random` (`packages/domain/src/coreTypes.ts:4-18`). They are identifiers, **not secrets**. |
| Browser transport | `http:` origins only (`apps/web/src/pairedTransport.ts:21`). Fixed path allowlist (`:42`). Bearer header (`:44`). Forces JSON content-type on any body (`:45`). `credentials: 'omit'` (`:47`). |

## 3. Decision 1 — native `<video>` admission

### Alternatives

| | A. Media session cookie minted with pairing **[rec]** | B. Service worker adds the bearer | C. No token on media reads; rely on the network boundary |
| --- | --- | --- | --- |
| Mechanism | A bearer-authenticated `POST` returns an HttpOnly, SameSite=Strict, path-scoped cookie. The server accepts it **only** on `GET`/`HEAD /api/media/:id/content`. | A service worker intercepts the video's range requests and re-issues them with `Authorization`. | The media route is open to anyone who can reach the exact Host. |
| Pairing preserved | Yes. The cookie can only be minted with a valid bearer, lives in process memory, and rotates on restart. | Yes. | **No.** Media reads would silently drop pairing (forbidden by `DECISIONS.md:286`). |
| Current private-LAN HTTP | Works without `Secure`. | **Fails.** Service workers need a secure context ([doc] MDN Service Worker API). | Works, with no authentication. |
| iPad Safari risk | One empirical risk: does Safari send the cookie on same-origin media range requests? (§10 E1) | High. Service-worker interception of Safari's media range requests is reported as fragile (https://adactio.com/journal/14452; third-party, not official). | Low technical risk, but it is a boundary decision. |
| Contract change | Yes. It amends the "no cookies" clauses (§9). | Smaller. Still needs HTTPS/Tailscale first. | Largest: replaces pairing for a read class. |

Also rejected: **capability in the URL** (forbidden by `local-request-authenticity-contract.md:46`; leaks into history and logs). **Fetch-to-Blob**, as snippets do (`apps/web/src/sourceAudioSnippet.ts:42-65`): it downloads the whole file before playback, so there is no early seek and memory is unbounded. **MSE**: it needs container- and codec-specific segmenting, which is a transcoding-adjacent platform outside scope.

**Choice: A.** It is the only option that works in both the current HTTP-LAN profile and a future HTTPS profile. It keeps pairing as the root of authority and leaves Host/Origin checks unchanged. B depends on an unverified HTTPS boundary and fragile behaviour. C is the pairing-replacement decision that this task must not take. Confidence: medium. **What would change it:** E1 failing on an actual iPad. In that case, stop and escalate to C as an explicit owner decision. Never fall back to URL tokens.

### Contract for A [rec]

- **Mint:** `POST /api/media/session`. Bearer required, JSON `{}`, full existing admission. The server generates 32 random bytes and keeps them in a bounded in-memory set (fixed small cap, evicting the oldest). It returns `204` with `Set-Cookie: lt_media=<base64url>; Path=/api/media/; HttpOnly; SameSite=Strict`, adding `; Secure` only when the configured public origin is `https:`. There is no `Domain` and no `Max-Age`. The **server** never writes the value to disk. The browser's cookie jar is outside the server's control: browsers may persist session cookies (for example across session restore), so a stale value can survive in the browser, but it is useless after a service restart. It is minted after pairing or remembered-pairing auto-connect (`DECISIONS.md:303`). M1 uses `credentials: 'same-origin'`; with `'omit'` the browser would not store the cookie.
- **Revoke:** `DELETE /api/media/session` (M2). It needs the bearer, exactly as M1 does, **and** the same transport exception: `credentials: 'same-origin'`. Without it (`'omit'`, `pairedTransport.ts:47`) the browser would not send the current `lt_media` value, so the server could not revoke it, and it would ignore the expiring `Set-Cookie`. M2 removes the presented value from the in-memory set when present. It always answers `204` with `Set-Cookie: lt_media=; Path=/api/media/; Max-Age=0; HttpOnly; SameSite=Strict` (plus `; Secure` under `https:`). A missing or unknown value is not an error. M2 without a valid bearer → 401 with zero effects, and the value stays valid. Forget pairing calls M2 **before** it clears the bearer.
  - **After a successful Forget,** M4 with the old value → 401, even if the browser kept a copy (N24).
  - **If the service is unreachable or M2 fails,** Forget still clears the local pairing. JavaScript cannot delete an HttpOnly cookie, and the server never saw the revocation, so the value stays acceptable to M4 until a restart or eviction. The UI must say so: *"Media access on this browser could not be revoked; it ends when the service restarts."* There is no fallback: no token in a URL, no retry with another credential, and no claim that access was revoked. Re-pairing mints a new value; it does not revoke the old one (N25).
  - A service restart invalidates every value. A 401 on M2 means the bearer is already invalid (normally a restart), and the transport then clears pairing (`pairedTransport.ts:50`). An M4 401 can also come from eviction from the bounded set or from a revoked value; §5.6 handles recovery.
- **Accept:** only `GET` and `HEAD` on `/api/media/:id/content`. Either a valid bearer **or** exactly one valid `lt_media` value, compared in constant time. Duplicate `Cookie` header fields are rejected as 400 by the duplicate-field rule (§5.3). Duplicate `lt_media` pairs within one field, or an unknown value → 401. The cookie is ignored on every other route, including `/api/media/:id/transcripts`. Host and Origin checks run first and unchanged: a present but disallowed Origin → 403. A `<video>` element without `crossorigin` sends a no-cors same-origin request, which normally carries no Origin; absent Origin is already allowed (`requestAdmission.ts:91-92`).
- **Response hardening:** `X-Content-Type-Options: nosniff`, an allowlisted media type only (§5.4), and `Cross-Origin-Resource-Policy: same-origin`. CORP is a **response-side disclosure control that the browser enforces**. The browser blocks a no-cors cross-origin or cross-site response from reaching the requesting page ([doc] MDN CORP: it "indicates that the browser should block `no-cors` cross-origin or cross-site requests"; the Fetch "cross-origin resource policy check" runs on the response, https://fetch.spec.whatwg.org/). It does not stop the request, does not stop the server reading and sending the bytes, and is not a server-side rejection. For such requests the only server-side guarantee is that M4 has no effects.
- **Cross-site sending:** `SameSite=Strict` withholds the cookie from cross-**site** requests ([doc] MDN Set-Cookie). A site is not an origin: pages on other ports of the same host are same-site. Three limits remain:
  - Cookies are **not isolated by port** ([doc] RFC 6265 §8.5), so another service on the same host could receive this cookie. That is an operator-controlled service under the §14 threat model (`DECISIONS.md:292`).
  - A same-site page on another port of the same host can make the browser send a cookie-bearing no-cors GET to M4, for example through `<video src>`. Over plain HTTP to a LAN address, that request carries no Origin (absent Origin is allowed, `requestAdmission.ts:91-92`) and no Fetch Metadata. The server **cannot tell it apart** from the app's own request, so it reads and streams the bytes, and CORP then keeps them from that page. In this profile the guarantee is **no mutation, not no read**. N08 checks for zero effects and a browser-side block, never for a server-side refusal.
  - Fetch Metadata headers are only sent to potentially trustworthy URLs ([doc] Fetch Metadata, "If r's current URL is not an potentially trustworthy URL, return", https://w3c.github.io/webappsec-fetch-metadata/). That set is not HTTPS-only. It includes loopback HTTP: hosts in `127.0.0.0/8` or `::1/128`, and `localhost` when the browser follows let-localhost-be-localhost ([doc] Secure Contexts, "Is origin potentially trustworthy?", https://w3c.github.io/webappsec-secure-contexts/). So the runbook's host-only rehearsal (`docker-runbook.md:13`), when browsed at a loopback origin, does get these headers. LAN-profile origins such as `http://lingotorte.local:5173` (`docker-runbook.md:46`) or a LAN IP do not. As defence in depth, a present `Sec-Fetch-Site` other than `same-origin` → 403. The design never relies on the header being present.
- **No effects:** M4 changes nothing, unlike the LRU-touching snippet GET (`server.ts:1257-1266`). A rejection under the contract §4 invariant (`local-request-authenticity-contract.md:160-172`) must leave zero effects.
- **Profiles:** server playback is a **same-origin profile** feature (Docker proxy, or HTTPS in front of it). Native direct mode (UI on 5173, API on 5174) would need credentialed CORS, which the contract forbids (`:151`). It keeps browser-local playback.

## 4. Decision 2 — managed storage identity

| | A. Content-addressed blobs keyed by SHA-256, bound through `MediaAsset.contentSha256` **[rec]** | B. Per-media-id files, with a foreign key in `media_asset` |
| --- | --- | --- |
| Survives learner-state saves | Yes. It lives in a separate server-owned table. `saveLearnerState` deletes and reinserts the whole `media_asset` projection (`packages/storage/src/sqliteLocalPersistence.ts:1320-1323,1923-1926,1980-1984`). | No. A Keep-browser replace or a restore can drop the asset row and orphan the file, or rebind it wrongly. |
| Deduplicates identical bytes | Naturally: one file per digest. | Needs a separate lookup. |
| Existing assets | An unchanged asset becomes server-playable when bytes with the same `contentSha256` (`coreTypes.ts:75-86`; index `sqliteLocalPersistence.ts:90`) are stored. No id, `originalPath` or occurrence rewrite. | Requires a migration that rewrites asset rows. |
| Overwrite risk | None. The name is the digest, and files are written once. | Same name with different content needs explicit guards. |

**Choice: A.** It reuses the identity the app already uses for relinking: content decides, the file name never does (`model.ts:1599-1601`). Capture already records it as `mediaFingerprint` (`model.ts:3449-3452`).

## 5. Storage, playback and path confinement (D) [rec]

### 5.1 Layout and lifecycle

- A new **named volume** `library` is mounted read-write at `/library` on `api` only, and configured as `LINGOTORTE_LIBRARY_DIR`. `/media` stays `read_only: true`. `web` mounts neither. Startup extends `assertMutablePaths` (`apps/local-service/src/nativeConfig.ts:58-83`): the library must not equal or overlap the media root, state, database, scratch, models, home or repository, checked in both directions with `pathInside` (`packages/domain/src/nativePathsNode.ts:10-13`). If unset, the media and upload routes are absent and status reports managed media as unavailable. Adding the volume is a Compose change, so it needs D/E configuration authority.
- `/library/staging/<uploadId>.part` holds **staged** bytes. They are never served. They are created with `O_CREAT|O_EXCL|O_WRONLY|O_NOFOLLOW` and mode 0600.
- `/library/blobs/<64-hex>` holds **complete** bytes: immutable, mode 0400. A blob is published with `link(staged, blob)`; `EEXIST` means it is a duplicate. Then the staged file is unlinked and both directories are fsynced. A blob is never renamed over an existing file.
- **Ready** means a DB row in a new server-owned table, roughly `managed_media_blob(sha256 PK, size_bytes > 0, mime_type, probe, stored_at)`, **and** a regular file whose size matches. The row is written only after the file is durable, so an incomplete entry can never be ready.

### 5.2 Path confinement

Paths are built only from a validated 64-hex digest or a validated UUID; client strings never become path segments. The checks:

- At startup, `lstat` the library root and each subdirectory. Each must be a real directory owned by the service uid, with matching `realpath`, and staging and blobs must share one `st_dev` so `link` works.
- On each request, open with `O_RDONLY|O_NOFOLLOW`, `fstat` (regular file, DB size), then stream from **that fd** only, with no reopen by path.
- Cleanup unlinks only and never recurses through links, as scratch cleanup does (`server.ts:231-246`).

Residual risk: `O_NOFOLLOW` covers only the final path component. A swap of an intermediate directory between the `realpath` check and `open` needs write access to `/library`, and only the service uid has it. That is same-uid software, accepted under `DECISIONS.md:292`. The existing job path check is check-then-use by path (`nativePathsNode.ts:40-48`). This design does not copy that pattern.

**Not served:** source-folder files under `/media`. Serving them by path would add mutable bytes behind a validator, symlink escapes from the host bind, path-derived identity and private paths in records. Existing `/media` jobs are unchanged.

### 5.3 Range, HEAD and seeking (route M4)

Safari needs byte ranges for random access ([doc] Apple, "HTTP servers hosting media files for iOS must support byte-range requests", https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingVideoforSafarioniPhone/CreatingVideoforSafarioniPhone.html). Semantics follow [doc] RFC 9110 §14.2 / §13.1.5 / §15.3.7 / §15.5.17 (https://www.rfc-editor.org/rfc/rfc9110):

| Request | Response |
| --- | --- |
| No `Range` | `200`, full `Content-Length`, `Accept-Ranges: bytes`, strong `ETag: "sha256-<hex>"`. |
| Exactly one `bytes=` spec: `a-b`, `a-` or `-n` | `206`, `Content-Range: bytes a-b/size` (end clamped to `size-1`; a suffix of at least the size means the whole file). |
| Unsatisfiable (`a ≥ size`, or `-0`) | `416` with `Content-Range: bytes */size`. |
| Multiple ranges, unknown unit, or invalid syntax | Ignore the Range and send `200` (RFC 9110 §14.2 "MAY ignore"; an unknown unit "MUST ignore"). |
| Reversed `a-b` with `b < a` | Invalid ("An int-range is invalid if the last-pos value is present and less than the first-pos", RFC 9110 §14.1.1). Ignore the Range and send `200`, as for other invalid syntax. |
| Very long numerals | RFC 9110 §14.1.2: recipients "MUST anticipate potentially large decimal numerals and prevent parsing errors due to integer conversion overflows". Compare digit strings exactly (by length after stripping leading zeros, then lexically, or as `BigInt`), never through a lossy `Number`/`parseInt` beyond `Number.MAX_SAFE_INTEGER`. A huge `a` is `a ≥ size` → `416`. A huge `b` clamps to `size-1`. A huge suffix means the whole file. Node's request-header size limit bounds the input length. |
| `If-Range` not equal to the ETag | `200` with the full representation. |
| Duplicate `Range`/`If-Range`/`Cookie` fields | `400` (add these to `requestAdmission.ts:55-57`). |
| `HEAD` | GET headers with no body; Range is ignored, because GET is the only method with defined range handling (RFC 9110 §14.2, §9.3.2). HEAD opens and `fstat`s the fd but never creates a read stream. |
| `HEAD` that fails (400/401/403/404/405/503) | The same status and headers that GET would get, and **no body** (RFC 9110 §9.3.2: the server "MUST NOT send content in the response"). Today errors go through JSON error writers. In a scratch probe on Node v24.21.0, `ServerResponse` sent zero body bytes on the wire for a HEAD 404 that called `end(body)`. The image runs Node 26.7.0 (`Dockerfile:1`), so this is **[unverified]** there. M4 must not rely on it, and D tests it by reading the raw socket. |
| Unknown id, asset without a blob, or missing bytes | `404`, generic body (M3 gives the reason). |

- **Bounded:** one fd and one stream per request, with backpressure and no buffering (unlike `readFile` in the snippet route, `server.ts:1262`). The stream is destroyed when the client aborts.
- **Concurrency:** a fixed small cap on concurrent streams → `503` with `Retry-After`. D measures real Safari/Chrome concurrency.
- **Timeouts:** the API's 15 s idle socket timeout (`server.ts:765`) will close a paused stream. The browser should re-request with a Range. D proves this (E4).
- **Caching:** keep `no-store`. Change it only by a reviewed decision if D measures seek regressions.

### 5.4 Codec honesty (no transcoding)

At upload, `ffprobe` (already in the image) records the container, stream codecs and duration (replacing the `durationMs: 1000` placeholder, `model.ts:1622`). This is advisory only. The served type comes from the probed container, never from the file name or the client's declared type:

- MP4/MOV family → `video/mp4`;
- WebM-compatible Matroska → `video/webm`;
- other Matroska → `video/x-matroska`;
- anything else ffprobe recognises as audio/video → `application/octet-stream`.

Never serve `text/*` or HTML. A file with no audio or video stream is rejected at upload.

**Bounded probe.** E runs `ffprobe` through `execFile`, never a shell, with fixed arguments (`-v error -print_format json -show_format -show_streams` and the staged path built from the validated `uploadId`). It also sets:

- a fixed wall-clock `timeout` with `killSignal: 'SIGKILL'`;
- a fixed `maxBuffer` ([doc] Node.js child_process: "Largest amount of data in bytes allowed on stdout or stderr. If exceeded, the child process is terminated and any output is truncated", https://nodejs.org/api/child_process.html);
- an `AbortSignal` linked to U4 and to the U2 request.

The existing `nodeCommandRunner` sets none of these (`packages/local-transcription/src/index.ts:26-27`), so E must not reuse it unchanged. Timeout, output over the limit, a non-zero exit or unparsable JSON → `failed: probe-failed`. That is distinct from `not-media`, which means ffprobe succeeded and found no audio or video stream. The probe runs only in `verifying`, after fsync, and it counts as part of the single active U2. ffprobe opens the staged file by path, so the fd-only rule of §5.2 does not cover the child process. That is the same same-uid residual risk.

The client may pre-check with `canPlayType`, but the truth is the element itself: `loadedmetadata`, or error codes 3/4 (`apps/web/src/views/player/stage.ts:280-291`) **after** the access check of §5.6 has ruled out an authentication failure. For managed media the UI must say *stored on the server, but this browser cannot decode its format; no conversion is performed*. It must not reuse the "relink or choose another file" advice (`stage.ts:363`). Stored and playable are separate states, as the brief requires (`product-brief.md:24`).

### 5.5 Client selection and the playback gate

Today two functions decide playback, and both look only at `originalPath` and the object URL. `needsMediaRelink` gates the stage (`stage.ts:114,126`; `model.ts:1382-1387`). `mediaPlaybackUrl` picks the `src` (`model.ts:1378-1380`). Left unchanged, they break server media in two ways [src]:

- A browser-only asset (`blob:`/`browser-file-handle:`) whose bytes are now on the server still needs relinking when there is no object URL (`model.ts:1385-1386`). The stage then renders the relink placeholder (`stage.ts:114-118`) and never plays the server copy. This is the iPad case.
- A `managed:<sha256>` asset is not a relink label, so `needsMediaRelink` is false, and `mediaPlaybackUrl` would return the label itself as `src`. That fails as error code 4 and shows relink advice (`stage.ts:363`).

D replaces the pair with **one derived playback source**, used by the stage gate and the stage key (`stage.ts:114,126`). It is computed from the object URL, the asset label and the last M3 result:

| Local object URL | M3 result | Asset label | Playback |
| --- | --- | --- | --- |
| present | any | any | Local object URL, as today (no network). |
| absent | `complete`, same-origin paired profile | any | `/api/media/:id/content`; no relink placeholder. |
| absent | `bytes-missing` | `blob:`/handle | Relink placeholder, plus *the server copy is missing; upload the same file again to restore it*. |
| absent | `bytes-missing` | `managed:` | *Stored bytes are missing on the server. Upload the same file again to restore them.* No relink advice and no `src`. |
| absent | `none`, or unknown (not paired, unreachable, direct mode) | `blob:`/handle | Today's relink path, unchanged. |
| absent | `none`, or unknown | `managed:` | *Pair with the service* or *service unreachable*. A `managed:` label is never assigned as `src`. |

Missing bytes never fall back silently: the message says which copy is missing, and identity stays content-based, so the same bytes heal the asset (§8).

### 5.6 Recovery when native media requests fail

A `<video>` request does not go through the paired transport. So a 401 from M4 never reaches the transport's 401 handling (`pairedTransport.ts:50`). The element just reports error code 4 or 2 (`stage.ts:280-290`), and an authentication failure looks the same as a codec failure. A 401 here can mean a service restart, eviction from the bounded cookie set, a value revoked by another tab's Forget, or a browser that dropped the cookie. For a server source, D therefore adds an explicit `checking-access` state before showing any message:

1. On `error` from a server source, call M3 through the transport. A 401 makes the transport clear pairing (`pairedTransport.ts:50`): show *pair again to play server media*.
2. M3 `bytes-missing` → the missing-bytes state (§5.5).
3. M3 `complete` → call M1 once to re-mint, then reload the same element once with `load()`. Before reloading, clear the recorded error for that media and source. Otherwise the repeat-error check (`stage.ts:285-286`) would swallow a second failure with the same code.
4. A second error on the same media and source after a successful re-mint: code 3/4 → *stored, but not decodable in this browser*; code 2 → a network message; code 1 → aborted.
5. M3 or M1 unreachable → *service unreachable*, with no decode claim.

There is at most one re-mint per media selection and error sequence, so a persistent failure cannot loop. The existing repeat-error suppression (`stage.ts:283-286`) stays.

## 6. Upload, status and attachments contract (E) [rec]

There is one streaming PUT per attempt and no resumption, matching "restart rather than resume" (`product-brief.md:36`). Alternatives rejected:

- `multipart/form-data` POST: the body is parsed in-process, metadata mixes with bytes, and it gives no simpler retry story.
- Chunked/resumable (tus-like): a non-goal.
- Base64 in JSON: forbidden for videos by `lt-192.5`.

| Route | Admission and body | Semantics |
| --- | --- | --- |
| U1 `POST /api/uploads` | Bearer, JSON `{uploadId, intent, sizeBytes, title?, mediaId?}` | `uploadId` is a client-generated v4 UUID (the existing `uuid()`, because `crypto.randomUUID` may be missing on plain HTTP). `intent` is `new-media` or `attach-bytes` (for an existing browser-only asset). Idempotent: repeating the same body returns the same record; the same id with different fields → 409. |
| U2 `PUT /api/uploads/:uploadId/content` | Bearer. `Content-Type: application/octet-stream`. `Content-Length` required and equal to `sizeBytes` (chunked → 411). Headers are admitted before any body is read, and the body is **streamed** to staging, never sent through the JSON buffer at `requestAdmission.ts:134-143`. | Hash and count while writing. When the byte count matches: fsync, `ffprobe`, publish (§5.1), then one DB transaction. Responds with the final status. |
| U3 `GET /api/uploads/:uploadId` | Bearer | `{state, receivedBytes, mediaId?, duplicateOf?, failure?}`. |
| U4 `DELETE /api/uploads/:uploadId` | Bearer | Aborts a non-complete upload and deletes its staged file. Never touches a published blob or asset. If completion has already committed → `409 already-complete` with no change (linearization below). |

**States:** `created → receiving → verifying → complete`, or `failed(reason)`. The reasons are `size-mismatch | too-large | disk-full | not-media | probe-failed | fingerprint-mismatch | interrupted | aborted`. `failed` is terminal: a retry uses a **new** `uploadId`. Upload records live in SQLite so status survives a restart. At startup, `receiving`/`verifying` become `failed: interrupted`, and orphaned staged files are unlinked as in §5.2.

**Uncertain completion:** after a lost U2 response, the client calls U3 with the id it generated itself:

- `complete` → done, and it uses the returned `mediaId`;
- `verifying` → poll;
- `failed` or 404 (the create never landed, or the database was rolled back) → restart with a new upload.

The client never re-sends bytes before this check (`delivery-scope.md:15`).

**Cancel versus publication (linearization).** Exactly one SQLite transaction decides an upload's outcome: the one that moves the record out of `receiving`/`verifying`. U2 completion and U4 both make that move as a conditional update inside `BEGIN IMMEDIATE`, in the form `UPDATE … SET state = … WHERE upload_id = ? AND state IN ('receiving','verifying')`, so exactly one of them wins. The completion transaction also writes the ready row, the asset (for `new-media`) and the revision bump. File work before it is either discardable (staged bytes) or a harmless orphan (a blob with no row, which is never served). U4 also sends an in-memory abort signal to the stream and probe so that they stop promptly. That signal is not the decision.

| Phase | Durable facts | Crash or restart | U4 arriving in this phase |
| --- | --- | --- | --- |
| P1 receiving | Partial staged file; record `receiving` | At startup: `failed: interrupted`; staged file unlinked | U4 wins: `failed: aborted`; stream destroyed; staged file unlinked |
| P2 verifying (fsynced, hashed, probe running) | Complete staged file; record `verifying` | As P1 | U4 wins: probe killed through its signal; `failed: aborted`; staged file unlinked |
| P3 `link(staged, blob)` done, before the commit (directory fsync pending or done) | A blob file that is durable only after the directory fsync; no ready row | At startup: `failed: interrupted`; staged file unlinked; any blob is an orphan that is never served and is counted in status | U4 wins: `failed: aborted`; the blob stays an orphan (never served, never deleted in D/E) and a later identical upload adopts it |
| P4 the deciding transaction | SQLite atomicity: either all of state, row, asset and bump, or none | Either committed (U3 → `complete`) or not (as P3) | Serialized by SQLite. If U4 commits first, completion's conditional update matches no row, so it rolls back and reports `failed: aborted`. If completion commits first, U4 → `409 already-complete` |
| P5 committed, response not delivered | `complete` | U3 → `complete` with the same `mediaId` (N17) | `409 already-complete` |

No phase can produce `complete` after an acknowledged abort, or a ready entry without its row (N29).

**Dedup and no overwrite:**

- For `new-media`: if a ready blob has the same digest, the staged file is discarded. If an asset with the same `contentSha256` exists, the response is `duplicateOf: <mediaId>` and no second asset is created.
- For `attach-bytes`: the digest must equal the asset's `contentSha256`, otherwise `failed: fingerprint-mismatch` and the asset is untouched.
- The same file name with different content always produces a new asset. Names are display-only, and files are never addressed by name.
- The server computes the hash, so iPad uploads need no client-side hash.
- A client-claimed hash that skips the upload is a deferred optimisation: it would bind an asset to bytes the client never proved it had.

**Asset creation:** E creates the `MediaAsset` for `new-media` inside the deciding completion transaction above, keyed by `uploadId`, which is unique on the upload record. A lost acknowledgement then cannot create a second asset, and U3 is its readback. C does not provide this: C's recorded acceptance criteria name only vocabulary edits (`lt-192.3`). E still depends on C for how a client reconciles a revision bump that it did not make (§8). For new assets, `originalPath` is an opaque non-path label (`managed:<sha256>`) and is never an absolute path. Path-requiring snippet and job features continue to reject it honestly (`sourceAudioSnippet.ts:24`).

**Limits:**

- Check free space before accepting U2 (`fs.statfs` must show the size plus a margin). `ENOSPC` → `failed: disk-full` and the staged file is deleted.
- A code-constant size ceiling that E chooses.
- One active U2 per process (`429` otherwise); a second U2 on the same id while receiving → `409`.
- Timeouts: E must replace the API's server-wide 15 s `requestTimeout` (`server.ts:764`) with route-scoped deadlines. JSON routes keep about 15 s. U2 gets an idle deadline: no bytes for N seconds → `failed: interrupted`. The web tier's default 300 s `requestTimeout` would cut longer uploads, so it needs the same treatment.
- U2 stays under the existing exact-Host ingress.

### 6.1 Subtitle attachment: one atomic register-and-bundle operation (A1) [rec; E implementation scope]

The client parses subtitles with the existing parsers (`model.ts:1435-1453`). It attaches them by media id, separately from the video. A failed subtitle never rolls back or re-sends the video.

**Why the existing route cannot carry this [src].** The existing write-once `PUT /api/tracks/:trackId/transcript` writes cue and timing rows for any `trackId`, under whole-document CAS (`server.ts:1117-1135`; `sqliteLocalPersistence.ts:1999-2008`, where `write` checks the revision first, `:1968-1971`). The `cue` table has no foreign key to `subtitle_track` (`sqliteLocalPersistence.ts:117-128`). The track itself is registered later, and only by a whole-document `PUT /api/state`. That PUT requires the bundle to exist first (`server.ts:1179`), and its projection replaces every track row (`sqliteLocalPersistence.ts:1345-1346`). The only readback is `GET /api/media/:id/transcripts`. It lists tracks from `subtitle_track` by `media_id` and joins cues to them (`sqliteLocalPersistence.ts:1749-1759`), so a committed but unregistered bundle is invisible to it. The client's retry path (`model.ts:500-509`) therefore cannot recover a lost acknowledgement:

- **Lost ack before registration, retried with the old revision:** the bundle committed and bumped the revision, so the retry gets a plain CAS 409 with no code, and the client rethrows it (`model.ts:500`).
- **Stale revision, then bundle-exists:** after refreshing its revision, the client gets `409 transcript-bundle-exists`. It reads back the per-media GET and either sees a different revision (`model.ts:507`, rethrow) or finds no bundle for the unregistered track (`model.ts:508-509`, "different transcript").

No reachable state lets the client prove that the stored bundle is its own. C does not fix this: C's recorded acceptance criteria name only vocabulary edits (`lt-192.3`). E must not add a second whole-document writer (§8).

**Alternatives considered:**

- *A pending-track transcript readback endpoint*, reading cues by track id as `bundleForTrack` does (`sqliteLocalPersistence.ts:1048-1052`). It would make a lost acknowledgement provable. But registration would remain a second step through the whole-document writer, so "bundle stored, track not registered" would stay a durable state that every client must reconcile.
- ***A1: atomic register plus bundle* — chosen.** The track row and its bundle commit in one transaction, so new attachments never reach the unregistered state, and the request is its own readback.

**Contract: A1 `PUT /api/media/:mediaId/tracks/:trackId`.** Bearer and JSON under the existing admission and 5 MiB buffer. The body keys are exactly `{track, cues, wordTimings, expectedRevision}`. A missing revision → 428, as at `server.ts:1121`. `trackId` is a client-generated v4 UUID, chosen once per attachment and kept in browser state until it is acknowledged.

Validation happens before any transaction; failures → 400 with zero effects:

- `track.id` must equal `trackId`, and `track.mediaId` must equal `mediaId`;
- the status must be non-candidate, and `role` and `language` must be valid (E's acceptance requires the user to review them before sending);
- the `sourcePath` must be an opaque non-path label;
- the cues must be non-empty and all carry `trackId`, and the timings must reference those cues (the bundle checks of `sqliteLocalPersistence.ts:2001-2004` and `:1964`).

Then, inside one `BEGIN IMMEDIATE`, in this order:

1. No `media_asset` row for `mediaId` → `404 media-not-found`.
2. A `subtitle_track` row with this id already exists:
   - its normalized track fields are equal and its stored bundle is equal (`sameBundle`) → `200 {replayed: true, trackId, revision}`, with no write and no bump. This check runs **before** CAS, so a retry after a lost acknowledgement succeeds even with a stale `expectedRevision`;
   - otherwise → `409 track-exists-different`, and nothing changes.
3. Cue rows exist for this id but no track row (an orphan left by the existing route). `expectedRevision` must match the current revision (else the existing CAS 409). The stored bundle must equal the submitted one (else `409 track-bundle-mismatch`). If both hold, insert only the track row, bump, and return `200 {replayed: false, adopted: true, trackId, revision}`.
4. `expectedRevision` ≠ the current revision → the existing CAS 409; nothing is committed.
5. Insert the track row and the bundle, bump the revision, commit → `200 {replayed: false, trackId, revision}`.

Equality is checked on normalized values, never on serialized JSON text. B observed record-order differences in JSON serialization (`lt-192.3` A/B handoff comment, 2026-10-30 10:54).

**Client acknowledgement rules:**

- `replayed: false` → adopt `revision` as the base, as today (`model.ts:498`). CAS proved that no write was interleaved.
- `replayed: true` → mark the track acknowledged, but do **not** adopt the returned revision, because it may include other writers' changes. The next whole-document save needs a state readback, which is C's reconcile path (§8).
- CAS 409 → nothing was written. Read the state, then retry with the **same** `trackId` and body.
- A lost response, before or after the commit → retry the identical request; step 2 or step 5 decides.
- `track-exists-different` or `track-bundle-mismatch` → stop, keep the browser copy unsent, and show the conflict. Never retry silently under a new id, because that would create a duplicate track.

After success, the per-media GET returns the track, because it is registered.

A1 never touches the video, the upload or a blob. Existing routes stay unchanged. Whether the existing browser-local flush (`model.ts:487-513`) moves to A1 is a separate E/C scope decision; until then its unregistered-bundle failure stays as it is today. A1 is **E implementation scope only**. This note does not authorise it, and E needs its own recorded scope (§9).

**Browser transport changes for D/E:** add the new paths (M1–M3, U1–U4, A1) to the allowlist (`pairedTransport.ts:42`). M4 is never fetched through the transport; only the `<video>` element loads it. Allow an `application/octet-stream` body for U2 only (`:45`). Use `'same-origin'` credentials for exactly two calls, M1 mint and M2 revoke, both still bearer-authenticated; every other call keeps `'omit'` (`:47`). Allow `https:` service origins when the HTTPS profile is adopted (`:21`; server side `requestAdmission.ts:13`). The video upload streams the `File` body and never calls `arrayBuffer()`.

## 7. Route, security and negative-case matrix

New routes: M1 mint, M2 revoke, M3 `GET /api/media/:id/storage` (bearer; `{state: none|complete|bytes-missing, sizeBytes, mimeType, probe}`), M4 content, U1–U4, A1 track attachment (§6.1). Existing routes are unchanged. "Invariant" means the contract §4 zero-side-effect rule (`local-request-authenticity-contract.md:160-172`), checked with the §5 before/after observation method (`:213-217`).

| ID | Case | Expected |
| --- | --- | --- |
| N01 | M4 with no bearer and no cookie (also with a forged good Origin) | 401, no bytes, invariant |
| N02 | M4 with a cookie from a previous process, a revoked cookie, two `lt_media` pairs in one field, or a malformed cookie; separately, two `Cookie` fields | 401; two fields → 400 |
| N03 | Valid cookie on any non-M4 route (state, jobs, uploads, transcripts, A1, M1, M2) | 401; the cookie is never an API credential |
| N04 | M1 or M2 without a bearer (with or without a cookie); M1 with a non-`{}` body; M2 with a body | 401 / 400; no Set-Cookie; a presented value stays valid; invariant |
| N05 | M4 with wrong Host, rebinding hostname, internal `api:5174`, or `127.0.0.1:5174` health authority | 403, as at `requestAdmission.ts:90`; forwarded headers cannot repair it |
| N06 | M4 with a present disallowed or `null` Origin | 403 even with a valid cookie |
| N07 | M4 with `Sec-Fetch-Site: same-site` or `cross-site` (any potentially trustworthy origin: HTTPS or loopback HTTP) | 403 |
| N08 | Real browser: a page on another origin of the same host embeds `<video src>` pointing at M4 | Over plain LAN HTTP the server may serve the bytes, because the request is indistinguishable (§3). Expected: zero server-side effects, plus the browser blocking delivery to that page through CORP. Record the console result and whether bytes were sent; a server-side refusal is not expected |
| N09 | M4 with `POST/PUT/DELETE/PATCH`; method override | 405 with `Allow: GET, HEAD, OPTIONS` |
| N10 | M4 with an id that is not a UUID, has `..`, is encoded, has a query, or contains a backslash | 400 at `requestAdmission.ts:88` or route 404; never a path lookup |
| N11 | M4 for an unknown id, an asset with no blob, a staged-only upload, or a row whose file is missing or has the wrong size | 404, generic; M3 reports the state |
| N12 | Synthetic symlink or non-regular file planted at a blob or staging path; symlinked library root | Refused (404/startup failure); never follows the link |
| N13 | Range edge cases from §5.3 (suffix, open-ended, beyond EOF, `-0`, reversed `b < a`, 30-digit `a`/`b`/suffix, multi-range, other unit, invalid, `If-Range` mismatch, HEAD with Range); HEAD for each error status | As tabled; exact `Content-Range`/`Content-Length`; no overflow or crash; zero body bytes on the raw socket for every HEAD |
| N14 | U2 without a bearer; wrong content type; chunked; length not equal to declared; length over the ceiling; more bytes than declared | 401 / 415 / 411 / 400 / 413 / 400; staged file deleted; no blob, row or asset |
| N15 | U2 while another U2 is active; a second U2 on the same id | 429 / 409 |
| N16 | U2 interrupted mid-body; service restarted mid-body | `failed: interrupted`; no ready entry; staged file deleted at startup |
| N17 | Lost U2 response (committed) | U3 returns `complete` with the same `mediaId`; no second asset |
| N18 | Same bytes uploaded twice, or for two titles; same name with different bytes; `attach-bytes` with the wrong file | `duplicateOf`, one blob / two assets, no overwrite / `fingerprint-mismatch`, asset unchanged |
| N19 | Disk full (synthetic small volume or fault injection) | `failed: disk-full`; no partial blob |
| N20 | Non-media bytes, e.g. HTML or text renamed `.mp4` | `failed: not-media`; never served |
| N21 | Write attempt into `/media` from the service (synthetic stack) | EROFS; `/media` unchanged |
| N22 | Pairing regression: the existing A01–A30 subset over the new routes, including pairing still required after M1 and Forget pairing calling M2 with bearer **and** `credentials: 'same-origin'` | Unchanged results; restart rotates bearer and cookie together |
| N23 | Logs, status, errors and exports after all the above | No cookie or bearer values, no absolute paths, no filenames-as-paths |
| N24 | Successful Forget: M2 with bearer and cookie, then M4 with the old value replayed by a test client | M2 `204` with an expiring `Set-Cookie`; the M4 replay → 401. A client that sends M2 with `'omit'` is a failing test, because the value would stay valid |
| N25 | Forget while the service is unreachable or M2 fails | Local pairing cleared; the UI says media access was not revoked and ends at restart; no URL token or other credential is tried; after a restart, M4 with the old value → 401 |
| N26 | M4 authentication failure during playback: an evicted value (cap exceeded by synthetic mints), a revoked value, or a restart | Evicted or revoked → `checking-access`, M3 `complete`, one M1 re-mint, plays. Restart → M3 401, pairing cleared, *pair again* state; never decode advice. A second failure after re-mint → decode or network state; at most one re-mint |
| N27 | Playback gate: a browser-only asset with M3 `complete` and no object URL; a `managed:` asset with M3 unknown or `bytes-missing`; an object URL present | Server copy plays with no relink placeholder / the honest unpaired or missing-bytes message, and a `managed:` value is never assigned as `src` / local playback with no network request |
| N28 | ffprobe fake that hangs, floods stdout past `maxBuffer`, exits non-zero or prints invalid JSON; U4 during the probe | Child killed; `failed: probe-failed` (or `aborted` for U4); no blob row; staged file deleted |
| N29 | Fault injection: a crash at each phase P1–P5, and U4 racing completion at each phase (§6) | The outcome tabled for that phase; never `complete` after an acknowledged abort; never a ready entry without its row; orphan blobs never served |
| N30 | A1: response lost **after** commit; retry with the original, now stale, `expectedRevision` | `200 replayed: true`; no bump; one track; client does not adopt the revision |
| N31 | A1: connection lost **before** commit (fault-injected rollback); identical retry | `200 replayed: false`; exactly one track and bundle |
| N32 | A1: stale `expectedRevision` on a fresh track; then a state read and identical retry | `409` CAS with zero effects; then `200 replayed: false`; one track |
| N33 | Legacy orphan: a bundle written through the existing `PUT /api/tracks/:trackId/transcript` and never registered (lost ack before registration); then A1 with the identical bundle, A1 with different cues, and A1 with a stale revision | `200 adopted: true` with only the track row inserted / `409 track-bundle-mismatch`, orphan unchanged / `409` CAS, unchanged |
| N34 | A1 mismatched content: same `trackId` with different cues, timings, role, language or media; `track.mediaId` ≠ path; a cue with another `trackId`; unknown media; candidate status; absolute `sourcePath`; extra or missing body keys | `409 track-exists-different`, nothing changed / 400 / 400 / 404 / 400 / 400 / 400 or 428; invariant for every rejection |
| N35 | After each successful A1 | `GET /api/media/:id/transcripts` returns the track with an identical bundle; the video, upload and blob are untouched |

## 8. Existing identity, migration and recovery effects

- **No rewrite.** `MediaAsset` ids, `originalPath`, `contentSha256`, occurrences' `mediaId`/`mediaPath`/`mediaFingerprint`, Anki GUIDs (per saved item) and the single-handle store (`apps/web/src/browserHandleStore.ts:15-18`) are unchanged. Binding is derived: an asset is server-playable when a ready blob has its digest.
- **Browser-only assets** (`blob:`/`browser-file-handle:`) keep local playback and relink. "Upload to library" means `attach-bytes`. YouTube candidate media hash text, not bytes (`model.ts:2870-2871`), so they can never bind. That is correct and honest.
- **The learner-state projection rewrite** (`sqliteLocalPersistence.ts:1320-1323`) never touches blobs. If an asset row is dropped by Keep-browser or a restore, its blob stays. Re-adding identical bytes rebinds them.
- **B rollback pairings** (`docs/dev/lt-192.2-recovery-rehearsal-result.md:60-65`):
  - Database rolled back while the library is ahead: blobs without rows are never served, and identical re-uploads adopt them after a size check. Upload ids created after the checkpoint return 404, so the client restarts.
  - Library lost while the database is intact: M3 reports `bytes-missing` and M4 returns 404. Re-uploading the same bytes heals the asset.
  - A database backup is not a media backup. Recovery pairs the `state` and `library` volumes, or accepts re-upload. This is consistent with metadata-only backups and no media copy (`DECISIONS.md:61-71`).
- **B findings carried forward:** U2 completion creates an asset and A1 registers a track. Both bump the revision, so stale clients get a 409. Avoiding the false Keep/Load choice after a lost acknowledgement is C's job (`lt-192.2-recovery-rehearsal-result.md:103-105`). E must not add a second whole-document writer.
- **No deletion or GC** of blobs in D/E. Orphan counts appear in status, without paths. Disk use only grows until a later, separately scoped deletion design.

## 9. Approvals actually needed

1. **Security contract amendment (owner).** Allow one cookie: pairing-minted by M1, revocable by M2, HttpOnly, SameSite=Strict, path-scoped, read-only, and accepted only on M4. M1 and M2 both still require the bearer, and they are the only `credentials: 'same-origin'` calls. The amendment must also accept the stated limits: there is no server-side read refusal for same-site LAN-HTTP requests (§3), and a revocation is not possible while the service is unreachable. This amends `local-request-authenticity-contract.md:39,117,151,158` (no cookies, no cookie fallback, no Set-Cookie, `credentials: 'omit'`). Under `DECISIONS.md:298` it needs its own owner decision issue **before D**. This note is not that decision.
2. **Access/configuration authority for D (owner).** Adopting the recommended boundary changes Compose and the origin set: Tailscale Serve HTTPS → the web tier published on `127.0.0.1` only (`compose.yaml:53`), plus `https:` origin support (`requestAdmission.ts:13`; `pairedTransport.ts:21`). The owner also supplies the evidence in §10 that agents may not collect. The `library` volume needs the same configuration authority in D/E.
3. **D and E implementation scope** must be recorded on `lt-192` first, as the graph already requires. E's scope must name A1 (§6.1) and the upload routes explicitly. This design gives D and E no authority.

Not needed now: pairing replacement (not proposed), transcoding, or resumable uploads. Size ceilings, stream caps and timeouts are routine technical choices for D/E review.

## 10. Evidence required before D, and bypass checks

**Boundary verification (before any pairing or access change).** No actual access configuration was inspected or verified for this note, and none may be under it. Agents must not inspect tailnet credentials or ACLs. The items marked *owner* are owner-run or owner-attested, recorded as sanitized results:

- B1. Listener inventory: `docker compose port web 4173` and `docker compose port api 5174` (the latter must be empty), plus the host's listening sockets for that port.
- B2. A non-tailnet LAN device cannot reach `http://<LAN-IP>:<port>` once the web tier is bound to loopback.
- B3. *Owner:* the tailnet devices and users allowed to reach port 443 on the host. Funnel must be off for that port; Serve and Funnel cannot share a port, and whichever was configured last wins ([doc] https://tailscale.com/kb/1312/serve, Limitations).
- B4. The Host, Origin and any `X-Forwarded-*`/`Tailscale-*` header *names* that the web ingress receives behind Serve. Header names only, from a disposable synthetic stack. This determines the exact public-origin configuration. Serve injects identity headers ([doc] same page). They are **not** used for authentication.
- B5. Serve forwards `Range`, `Cookie`, `Set-Cookie` and 206/416 unchanged, and streams the upload body.

**Empirical playback gates (D):**

- E1. An actual iPad browser sends the media cookie on same-origin M4 range requests over the chosen profile. **This is the riskiest assumption; if it fails, stop and escalate.**
- E2. Desktop Chrome and the actual iPad play and seek a synthetic H.264/AAC MP4.
- E3. An unsupported synthetic file shows the honest "stored, not playable" state.
- E4. Pausing for more than 15 s and then resuming works.
- E5. Playback survives a restart followed by re-pairing, through the §5.6 recovery and not decode advice.
- E6. On the actual iPad, an asset uploaded from the desktop browser plays from the server with no relink placeholder (§5.5).

**Bypass checks:** N01–N35 run against a disposable synthetic stack with fakes: the D rows before D is reviewed, and the E rows (N14–N21, N28–N35) before E is reviewed. Node tests never replace the real-browser rows (N08, N24–N27 in a browser, E1–E6), as the contract requires (`local-request-authenticity-contract.md:219`).

Pairing remains deployed policy throughout (`DECISIONS.md:286`).

## 11. Checks performed for this note

- **Repowise** (`repo="lingotorte"`) was available, but its index was behind: indexed `801b6c44867b`, base `80b1e20`. It was used for orientation only. Every [src] claim comes from a direct read at the base.
- **Live Beads** were read with `bd --sandbox show`: `lt-zt0`, `lt-192`, `lt-192.3`, `lt-192.4`, `lt-192.5`. Revision 2 re-read `lt-192.3` (acceptance names only vocabulary edits) and `lt-192.5`. Nothing was written.
- **Revision 2 source checks [src]:**
  - the bundle/registration split: `model.ts:487-513`, `sqliteLocalPersistence.ts:117-128,1345-1346,1749-1759,1968-1971,1999-2008`, `server.ts:1117-1135,1179`;
  - the playback gate: `model.ts:1378-1387`, `stage.ts:114-127,280-291`;
  - transport 401 and credentials: `pairedTransport.ts:47,50`;
  - the unbounded runner: `packages/local-transcription/src/index.ts:26-35`;
  - the image Node version: `Dockerfile:1`.
- **Public documents** were fetched and grepped for the quoted semantics: RFC 9110 (§9.3.2, §14.1.1, §14.1.2, §14.2), RFC 6265, Node.js HTTP and child_process (`maxBuffer`), the Fetch Metadata spec, Secure Contexts ("potentially trustworthy" includes `127.0.0.0/8`, `::1/128` and `localhost`), the Fetch CORP check, MDN Set-Cookie/CORP/Service Worker, the Tailscale Serve docs and Apple's Safari media guide. Every external URL in this file returned HTTP 200 on the revision-2 check.
- **One scratch probe** (outside the repository, then deleted): a raw-socket HEAD against a Node v24.21.0 `http` server that calls `end(body)` on a 404 received zero body bytes. It is not evidence for the image's Node 26.7.0 (§5.3, [unverified]).
- **Citation check.** A scratch script resolved every backticked `path[:line]` reference and every continuation reference, a bare colon plus line number taken against the previous file: 127 path references (this count includes the citations listed in §11 itself) and 19 continuation references. All are in range except two that the script cannot resolve in this worktree, because `node_modules` exists only in the primary checkout. There, the Vite chunk cited in §2 has 35 109 lines (Vite 8.0.16), so both of its §2 ranges are in range. Every revision-2 citation was re-read line by line, which corrected `stage.ts:124` to `:126`. The script checks ranges, not meaning. There are no relative Markdown links.
- **Repository state.** `git diff --no-index --check /dev/null <this file>` printed nothing (the file is untracked). There are no CR characters, trailing spaces or tabs, and the file ends with one newline. `git status --short` shows only this new file. No application code, tests, config, Beads, shared handoff/`DECISIONS.md`/implementation notes, or the sibling C worktree were touched. No service, browser, Docker, Tailscale or media operation was run, and no access configuration was inspected.
