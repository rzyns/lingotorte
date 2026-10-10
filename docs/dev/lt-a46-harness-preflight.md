# lt-a46 resource-checker offline preflight

Status: preparation only. Offline tests pass for the repository successor resource checker. This does **not** qualify the application, update/qualify the Python lifecycle harness, authorize listeners/browser/integration, reset retries, or close lt-a46. The parent owns candidate/archive/dependency/prerequisite preflight and independent reviews under the existing finite review budget.

## Historical source and exact replacement boundary

Recovered sources (read only, never imported or executed):

- `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-windows-complete-snapshot-one-shot/probe.py`, SHA-256 `486739795a4a61575e7ac8856fd2fc554760e18405c7f333b985aa76f4c13f07`.
- `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-windows-real-app-qualification-v2/probe.py`, SHA-256 `2c2320a916df22d17e5c7eefd85f99a00551f6cf00315a380a74894260a152e3`.

`checkResources` in `scripts/windows-qualification-resources.mjs` is the extracted successor of complete-snapshot `verify_graph` (lines 104–164), not a standalone URL demonstration. Its fixed entrypoints, recursive parser traversal, package/vendor snapshot assertion, model package/`makeMediaAsset` controls, three required fixtures, byte identity, WebM header/MIME and subtitle raw-export identity derive from that function. It returns resource hashes/MIME, edges, fixture receipts, parser nonliteral-dynamic counts and `browser_execution: false`; it adds URL transformation receipts with input/full URL/request path.

Source relation:

| Original | Successor |
| --- | --- |
| Line 116 `quote(url,safe='/%?:&=')` encodes literal `@` | `resourceUrl` uses WHATWG URL resolution without quoting already-valid routing punctuation. `/@vite/client` and `/%40vite/client` remain distinct. |
| Lines 107–108, 129: existing `es-module-lexer` | Explicit injected `parseImports` adapter, using that same installed parser in the offline tests. No new dependency or install. |
| Lines 118–128: status/nonempty/JavaScript MIME checks | Status 200, nonempty bytes, UTF-8 decoding and JavaScript MIME allowlist before module parsing; root HTML also has an explicit MIME check. |
| Earlier v2 line 150 rejects `Internal Server Error` anywhere | No substring failure. The complete-snapshot source already omitted that earlier assertion; tests guard against its reintroduction. |
| Lines 145–162: re-fetch model/raw modules and direct fixtures | Retained exact fixture bytes and raw-export controls; model/raw assertions use the already-fetched graph bytes, avoiding an unbound second module read. Direct fixture bytes are fetched separately. |
| Lines 110, 115: deadline/resource cap | Deadline checks around injected fetch, visited-resource cap, deduplication including cyclic imports. Transport must enforce its own bounded timeout. |

The frozen sources remain unchanged. In particular `get` and `Run.track`, `ready` health/status/provider/listener assertions, `ctrl_c`, `wait`, `close`, API persistence, native SQLite reopen, restart, premature-exit, foreign-listener and cleanup assertions have **not** been rewritten. This is not an AST-equivalence claim for a ported lifecycle harness: no lifecycle code was ported. A future orchestration amendment must independently prove those literal assertions and lifecycle semantics unchanged.

## Regression evidence: real successor path, canned transport only

Runtime observed: Node `v26.7.0`; preparation base `147081a13cf5650b30ab719142b1ef7f31132f5f`; initial worktree status clean.

Tests were written before the fix and run against the extracted checker with source-derived historical behaviors retained:

1. `node --test --test-name-pattern='literal Vite|actual successor' scripts/windows-qualification-resources.test.mjs`: **0 pass / 2 fail**. Literal routing produced `/%40vite/client`; the graph reached the canned HTML fallback and rejected it for JavaScript MIME. This exercises the actual checker callback/request path, not a detached URL helper alone.
2. Same command after the URL repair, before removing the earlier source-derived substring assertion: **1 pass / 1 fail**, with `historical substring assertion` on otherwise valid JavaScript containing `Internal Server Error`.
3. `node --test scripts/windows-qualification-resources.test.mjs`: **7 pass / 0 fail / 0 skipped**. `git diff --check` also passed.

The seven tests cover literal/encoded Vite routes, parser-to-URL roundtrips with Unicode/spaces/existing escapes/query punctuation, relative and recursive imports/cycles, nonliteral-dynamic counting, HTTP status/empty/MIME/parser errors, 200 HTML rejection, exact fixture bytes, WebM MIME/magic, raw subtitle exports, escaped snapshot/bare/external imports, absent fixture declarations, graph bounds and absence of an implicit fetch fallback. Responses are injected in-memory byte buffers; fixture bytes are synthetic, not read from any learner store.

The RED counterpart was a source-derived JavaScript extraction, not execution of the frozen Python probe. No historical attempt was rerun or receipt changed.

## Future integration contract — requires separate authorization

The future resource lane must call `checkResources`, not continue to use the frozen `verify_graph` quote operation. The Python probe currently has **no bridge** to this module and is not ready for an authorized live attempt merely because these tests pass.

Inputs are mandatory:

- `snapshotRoot`: future content-bound absolute Windows snapshot path with forward slashes.
- `fixtures`: exactly the three `FIXTURE_PATHS`, each with `expectedBytes` read from that immutable snapshot and bound to its manifest. Missing bytes fail; no synthetic default exists.
- `fetchResource({input, url, requestPath})`: explicit future transport returning `{status, contentType, bytes: Uint8Array}`. It must preserve the supplied URL/request target, disable proxy routing/redirect following, remain on fixed loopback origin `http://127.0.0.1:5173`, bound each request, and return exact response bytes. Never route it through historical `get`, which still quotes `@`. No fetch or listener is supplied by the module.
- `parseImports(text)`: adapter to the content-bound existing `es-module-lexer`, matching the original parser: `await init; const [imports] = parse(text); return {imports: imports.filter(i => i.n).map(i => i.n), dynamicUnknown: imports.filter(i => i.d >= 0 && !i.n).length};`.

Archive both module/test bytes and adapter/orchestration bytes with future harness identity; bind parser resolution/version/installed bytes separately. Offline tests currently resolve the pre-existing parser from primary `node_modules`; this is a disclosed test dependency, **not** proof of snapshot-local installed dependency identity. The parent must validate future snapshot dependency mapping.

Nonliteral dynamic imports are reported, not executed or invented, as in the frozen checker. An import lexer is not a full JavaScript semantic/runtime validator. Entry modules/root markers are fixed as in the original; this checker does not discover arbitrary HTML entrypoints or replace browser execution. It does not certify remote transport behavior, process tracking/stop windows, listeners, service/API correctness, persistence, product source closure or browser rendering. Injected callbacks must resolve within their own bounded windows; the checker does not forcibly cancel a never-resolving callback.

## Implementation notes

### Deviations

- Kept notes in this owned document instead of creating an unauthorized fourth `implementation-notes.md` file.
- Cached already-fetched model/raw bytes for identity assertions instead of repeating module requests; explicit fixture transport remains separate.

### Discovered edge cases

- Existing `%20`, `%2F`, `%2520`, query `@`/`+`/`:` and Unicode must survive parser-to-request conversion without a second encoding pass.
- A successful HTTP status alone is insufficient: encoded Vite route can return HTML; error words alone are insufficient: valid JS may contain them.

### Questions for review

- Parent must review the future transport/parser bridge and separately preserve the original lifecycle/API assertion closure before any new execution disposition.

Summary: scoped successor module plus seven offline tests; no product or frozen-harness edits; future bridge and dependency/candidate preflight remain outstanding. Read this document and `windows-qualification-procedure.md` before proposing a live attempt.
