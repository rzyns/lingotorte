# lt-c0r.2 offline successor harness binding

## Outcome and authority

**Offline binding exercised; no live qualification or renewed execution allowance.** The new transport, actual snapshot parser, checker, Python orchestration and native-console compiler inputs form a versioned packet. No app, service, browser, HTTP request/listener, SQLite database, provider/model, install/deployment or historical retry was started. No disposition/token was created. Parent review/publication/Beads updates remain separate.

Owned additions are `scripts/windows-qualification-{transport,bridge}.mjs`, `scripts/windows-qualification-{builder,support}.py`, `scripts/windows-qualification-binding.test.{mjs,py}`, `scripts/windows-qualification-compile-only.ps1`, and this document. Existing checker/tests and all product/candidate/historical bytes were left unchanged. No child Git commit/push or Beads write occurred.

## Local immutable inputs

Selected packet:

`C:/Users/jmdzi/AppData/Local/lingotorte/evidence-archives/lt-a46-harness-binding-2026-10-10-v3`

- `manifest.json`: **`3e9c9dde6380d6a865a0c131f643f368dc333a067d1a4bc8ad1e7627b0795aa7`**; 17 payloads, excluding the manifest itself.
- `successor.py`: `a9d8bb8370dc96e26f6198e7f5c8b9e115304945b04eda6b7ac8646585ec87b5`.
- `harness-inputs.json`: 15 input payloads; manifest and binding anchors sit outside that nonrecursive input list.
- Bindings cover 378 source files, 16,886 installed dependency files, 22 candidate receipt files, exact parser resolution/entry bytes, repository/vendor and third-party junction targets, fixture bytes, and Node/Python/PowerShell executable hashes.
- Candidate remains the existing `lt-a46-candidate-2026-10-10/candidate app żółć`. Source/dependency/receipt manifest SHA-256s remain those in [preparation evidence](lt-a46-preparation-evidence.md).
- Frozen complete-snapshot probe was recovered through the preservation manifest, read as bytes and AST only, never imported/executed. Its archived and copied hash remains `486739795a4a61575e7ac8856fd2fc554760e18405c7f333b985aa76f4c13f07`.

Raw final command receipts are in the sibling `lt-a46-harness-binding-2026-10-10-v3-receipts`, not appended to the immutable input manifest. Final preservation readback separately rehashed all **908** original archive payloads: zero mismatches; original archive manifest SHA-256 remained `954239187d791250516d9533536871225eca257656dfbbf00565dc2dd2b95c72`. Final selected-packet rehash matched all groups and published script payloads; its execution marker/sole-launch lock were absent and its synthetic state contained zero `.db` files. Node syntax checks and `git diff --check` returned exit 0 (the latter alone does not inspect untracked additions). Earlier versioned packets are preserved, not overwritten. Mutable installed dependencies are still junction reuse, not independently archived dependency bytes; pre/post rehash and target readback remain mandatory.

## Replacement and preservation proof

The builder rejects an existing destination and verifies the exact original archive/frozen/candidate manifest identities before deriving a successor. It emits the complete frozen bytes, `source-diff.patch`, `source-equivalence.json`, successor, helper scripts/tests, isolated environment, empty isolated Git configuration, parser/runtime binding and input manifests. It does not use a generic replacement lifecycle harness.

Proven from the actual frozen source:

- `PE`, `dump`, `proc_list`, `active`, `listeners`, `get`, and the entire `Run` class are identical source segments **and** ASTs. That includes `track`, `ready`, `ctrl_c`, `wait`, `close`, held handles, 35-second readiness and 20-second stop windows, native `CTRL_C_EVENT`, stop/readback before recovery and identity-restricted cleanup.
- The complete application orchestration tail is AST-identical after relocation into gated `main`: initial/save/API readback, native Node SQLite reopen/integrity, restart, premature-service termination, controlled foreign listener, final readbacks, exceptions, lock cleanup and result/exit logic are preserved.
- Kernel32 initialization/configuration is source-identical after removal of the added indentation and AST-identical after relocation behind the gate. Importing the successor no longer performs native setup or Node discovery.
- Approved changes are path/setup identities, `verify_frozen`, `setup`, `verify_graph`, explicit gated main/metadata relocation, bound Node executable selection, and an explicitly offline graph helper. The full diff makes every replacement visible.

`HERE`, synthetic state, sole-launch lock, execution marker, logs and mutable roots now belong to the new packet. `SOURCE`, `PRIMARY`, `ROOT` designate the current exact candidate, not the obsolete integration worktree. Git configuration paths were rebound too; the original allowlisted synthetic Git files were checked empty before generating their empty isolated counterpart. Environment keys are allowlisted, credentials absent, provider-off/offline/telemetry/update controls retained, and no global environment is mutated. Old `preflight['passed']` is not consulted or promoted into execution authority.

The frozen probe does not by itself contain every broader procedure lane (for example premature-zero/detached-descendant controls and the combined regression/browser gates). Preservation of its assertions does not certify those additional controls; they remain required under [the procedure](windows-qualification-procedure.md) and existing candidate tests. No new live assertions were invented to make this packet look qualified.

## Transport and bridge

- Actual `node:http` `ClientRequest` implementation, fixed `http://127.0.0.1:5173`, hostname literal `127.0.0.1`, exact supplied request path, `agent:false`, GET and identity encoding. No proxy agent/global fetch, DNS hostname, redirect following or fallback transport.
- Each request has an absolute deadline and inactivity timeout bounded to 3 seconds, and a 16 MiB raw-byte cap. Request/response errors, timeout, abort, premature close, incomplete body, redirects and encoded responses fail closed and destroy the owned request/response. Status, MIME and split raw response bytes reach the actual checker.
- Parser resolves with `createRequire(snapshot/package.json)` to the bound candidate `node_modules/es-module-lexer` mapping. It uses the original `await init; parse(text)` import/nonliteral-dynamic adapter. All installed parser bytes are covered by the dependency manifest; fixtures are read from the exact candidate, not replaced with default stand-ins.
- Python's `offline_graph(rows)` invokes the packet Node CLI with JSON canned responses and explicit allowlisted environment. Fake ClientRequest/IncomingMessage events drive the **same transport and checker**. Missing canned paths throw; they cannot fall back to HTTP. Output schema is `{schema:1, mode:'offline', graph:...}`; live schema is distinct.
- Source/dependency/receipt/harness/runtime identities and mapping targets are checked before parsing/graph traversal and after it, including failed graph checks. Fixture/resource output includes actual byte hashes and URL transformations.

An absent/mismatched disposition blocks Python before native initialization, metadata subprocesses, lock/marker creation or `Run`. Optimized Python is also blocked, since stripping assertions would invalidate the preserved qualification checks. Any future parent-issued bounded disposition must bind both packet-manifest and binding hashes, one attempt, explicit live consent and an approval reference. The Node live CLI additionally requires the anchored packet manifest, matching successor execution marker and sole-launch lock. This is an operator scope gate, not cryptographic proof of human approval. No preparation API issues a disposition.

## Actual offline execution

Final runs used packet v3 scripts where applicable; raw stdout/exit status/commands are retained in the sibling receipt files.

```text
LT_BINDING=<packet-v3>/binding.json node --test <packet-v3>/windows-qualification-binding.test.mjs scripts/windows-qualification-resources.test.mjs
# 11 pass, 0 fail, 0 skipped; exit 0

python -B <packet-v3>/windows-qualification-binding.test.py <packet-v3>
# 7 pass, 0 fail, no skipped cases; exit 0
```

The four new Node tests cover exact fixed direct request options/literal Vite target and raw split bytes; all request/response failure events and deadline; redirects/compression/bounds/external and inconsistent targets; and the actual packet parser/fixture/transport/checker integration. The seven existing checker regressions were run from the owned worktree using its pre-existing primary parser resolution; **only the new bound integration cases prove candidate parser mapping**.

The seven Python tests exercise inert import and absent/bad gate under process/native/socket/write spies, byte-exact regeneration plus source/AST proofs, pre/post full file rehash, allowlisted/provider/root/environment negatives, native helper compile-only, optimized-Python refusal, and actual Python → Node CLI → parser/transport/checker/fixture execution. The encoded Vite historical counterpart is an observed negative control reaching the real checker and rejecting HTTP 200 HTML; expected stderr is `/@vite/client: JavaScript MIME required`. Valid JS containing `Internal Server Error` passes. This is a regression control, not a newly executed historical probe or a claim that new tests preceded implementation.

Native compile-only used `Add-Type` on the exact candidate `start-local-windows-job.cs` under a fresh Polish-Unicode Hermes scratch TEMP and copied/revalidated allowlisted environment. Receipt: `compiled:true`, `runInvoked:false`, PowerShell **7.6.6**, **.NET 10.0.12**. No `LocalWindowsJob.Run`, Job Object owner, console attach/signal, application child or DB was invoked. Temporary compile directories were removed. Python was **3.14.7**, Node **26.7.0**.

### Finite iteration record

1. First offline packet: Node 11/11; Python 5/6, with a source-equivalence **test** failure caused by `read_text` normalizing original CRLF bytes. Native compile-only and graph integration passed; no lifecycle/application run occurred. The first packet is retained.
2. Second packet: byte-based comparison corrected; Node 11/11 and Python 6/6. Added explicit native setup comparison, executable hashes, bridge marker/manifest gate and isolated Git config rebinding. Packet retained.
3. Final packet: metadata child environment explicitly allowlisted; optimized-Python refusal exercised. Node 11/11, Python 7/7. No further implementation/retry loop or live disposition followed. Parent independent spec/quality review is still required; these iterations are not external-review acceptance.

## Limits and next authority gate

All real application readiness/served-resource, persistence/SQLite durability, native Ctrl+C delivery, restart, occupied-port/premature-exit/owned cleanup, combined regressions, Edge and Linux assertions remain **NOT REACHED** here. Add-Type proves compiler availability, not native-console lifecycle acceptance. Canned HTTP event coverage proves the implemented transport/checker path, not a real socket/server/browser receipt or universal kernel egress containment.

The offline prerequisite now has functional, exercised artifacts. It does not close `lt-a46`, qualify the product or reset the exhausted historical allowance. Parent must independently rehash/review this exact packet and obtain a new explicit bounded disposition before any live attempt. Any gate failure remains a harness/precondition failure, not permission for product repair or another attempt.

## Parent verification and independent review

Parent independently reran Node **11/11** and Python **7/7**, no skips; compile-only returned `runInvoked:false`. Parent rehashed all 17 packet payloads and verified all 9 packaged scripts match worktree bytes. Execution marker/lock remain absent, with zero synthetic databases. Node/Python syntax checks, reference-product privacy marker scan (54 files) and whitespace checks passed; these are not broad secrets/egress or product certification.

Specification review **PASS** (`deleg_197f5565`); quality review **APPROVED** (`deleg_f6449bf7`). Both independently reran the offline suites and confirmed packet identity and preservation/gate boundaries. No review-driven correction cycle was required. Quality review noted that the 65-second subprocess cap includes identity-hashing overhead in addition to the 60-second resource-graph deadline: it can produce a bounded harness timeout instead of a graph receipt. This fails closed and is not a demonstrated blocker; retain that failure classification rather than extending limits or retrying automatically.
