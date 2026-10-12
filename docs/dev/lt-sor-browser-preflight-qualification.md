# lt-sor corrected bounded browser qualification — blocked, no publication

## Disposition

**A24 OPEN · A25 OPEN · A26 OPEN · LAN OPEN.** One corrected browser fixture launch was executed; no relaunch, production fix, publication, commit, Beads change or review-budget reset followed. Chrome `145.0.7632.6`, CDP protocol `1.3`, revision `@47e20adcc15fc15f01825aa17e570c8f5492ac0f`.

Two concrete browser-visible product blockers were found:

1. **Disallowed preflights bypass backend admission at Vite ingress.** The owned foreign origin `http://127.0.0.1:18052` received **eight OPTIONS 204** and sandboxed `Origin: null` received **twelve OPTIONS 204**. The contract requires 403 for these origins, not an unconditional preflight success. Actual foreign/null requests observed afterward were 403; this is a preflight-policy defect, **not evidence of private-data disclosure**. Frozen Vite source confirms default CORS ends OPTIONS at 204 before the configure hooks/proxy path. The current production Vite config does not disable that middleware or forward preflights through the application gate. No fix was attempted.
2. **Plain HTTP private-LAN UI cannot import the synthetic fixture.** Built production assets ran at actual private authority `http://192.168.1.3:18053`, not loopback or a renamed loopback profile. Actual Settings pairing/status/state worked and loaded durable state. Chrome reported `isSecureContext:false` and `crypto.subtle` absent. Actual Library → Load synthetic fixture rendered **`Browser fixture import requires Web Crypto SHA-256 support.`** Full fixture oracle was unchanged after the failed import. This is source-bound to `model.ts:664–671`, called by browser synthetic import at 1002–1061. No secure-context flag, crypto mock, TLS deployment or alternate import was substituted.

## Actual acceptance evidence and remaining uncertainty

| Gate | Executed evidence | Disposition |
| --- | --- | --- |
| A24 dev UI | Actual Settings masked pairing, cleared input, status/state 200, unchanged connect oracle. Actual Player synthetic-fixture import then Settings Save produced nonempty durable snapshot with one media asset, changed revision, exactly one persistence-save call, PUT 200 and visible `Saved local state at 2026-10-12T14:56:59.958Z`. Complete before/after runtime, 18 SQLite tables and state/scratch file hashes are retained. | **PASS subset**, not full A24. |
| A24 source snippet | New invocation pairs, connects/hydrates its own model and passes returned `model.localService.pathPolicy` before transport capture. Browser evaluation nevertheless raised sanitized RuntimeError. It did not return a WAV/DELETE/Blob/playback receipt. Offline fake-runner contract succeeded but is not browser snippet evidence. Root cause of this new browser evaluation failure is unresolved; do not repeat the previous missing-policy diagnosis as a proven cause. | **OPEN**. Actual served-module URL was not independently validated by offline compilation. |
| A25 foreign/null | Synthetic waiting job and completed snippet were constructed via actual authenticated POST/poll. Planned 16 route/kind rows per origin cover private reads, state PUT, cancel/delete/cleanup and all eight job kinds; form POST and embed attempts were also issued. The independent ingress trace retains actual foreign/null request statuses, including forbidden OPTIONS successes. Phase ended in AssertionError. Its intermediate before/after oracle and per-attempt result arrays were not persisted by the phase-return wrapper, so **no full zero-effect/private-byte or positive-control assertion is claimed**. | **OPEN**, concrete preflight-policy blocker. |
| A26 allowed missing/wrong | Eight actual requests returned 401 (four routes × missing/wrong bearer); full fixture oracle unchanged, no readable snapshot marker. Actual wrong-capability Settings Connect rendered `Local service pairing required. Pair again explicitly; browser work was kept.` and did not mutate service state. | **PASS subset**. Restart during polling/autosave, explicit repair, stopped loops and no automatic mutation replay remain **OPEN** and were not executed. |
| LAN | Exact private-IP Docker publication and same-origin proxy, frozen production Vite-built assets, actual paired status/state success, real Library import and rendered Web Crypto failure. | **OPEN**, concrete HTTP secure-context blocker. No LAN save/job/WAV/playback closure. |
| A27/A28 | No new complete endpoint-edit/reload/web-storage qualification. | **OPEN**. Prior server/client/IPC evidence retains its original scope. |

The run is not the requested complete qualification. Source/interface preflight improved the native-policy and envelope paths, but did not qualify every remaining acceptance mechanism: there is no deterministic restart/poll/autosave fixture here, and a production build does not validate a dev-module URL. These gaps are explicit rather than converted into passing gates. One authorized launch is consumed; no follow-up launch is authorized by this report.

## Preflight and source binding

External kit: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/preflight-qualification/`.

- `checklist.md` records actual store/import/save/native-policy/snippet/fake-command/SQL/DOM/foreign/null/cleanup calls and source locations. No guessed store methods/card schemas/callbacks were invoked.
- Image-only offline preflight ran with `--network none`, no browser or listener startup. It exercised real `extractSourceAudioSnippet` with a rejecting-shape fake runner: **one fake command, zero providers, genuine 3244-byte 16kHz mono PCM WAV**, exit 0. Existing Vite then built frozen assets, exit 0. Exact command/result is `offline-receipt.json`.
- Browser fixture separately built the production assets with existing dependencies only before serving preview. `receipt.json.ready.assetManifest` binds the actual browser-run assets; offline asset hashes retain their separate configuration scope.
- Production image: **`sha256:08f8d07f9c75fec44ff60cb06757c99c3f5118fdaf793dcb24c74381499cef76`**, actual runnable Docker ID, not configuration digest.
- Parent source binding: **`f8bdecf19aa75e278ac6a06c4849c3708ef1b74d39ed8dae62a02d3ac344e2f2`**; **196 non-test entries matched before and after**, zero mismatches.
- Approved contract: **`c6692549fd40f265f5fd7e7c76d511e66d279b402c37bbca8a8ec4e487417cb9`**, unchanged.
- Controller: **`a3f41dd21c7900aeca07e7f62507bb88e94b348f8aab956776f7ccff10ee2fb8`**.
- New fixture: **`b50c610857c18635052f9178705f95661915d8694954a901ebbd9cc425ab356f`**.
- Raw receipt: **`363886f56c078060521582259af1224b22324402a911a70cfdf4697047e1e1e8`**; retained unmodified, including failed phases/cleanup flags.
- `adjudication.json` reconciles **59 ingress observations**: 200 × 6, 401 × 9, 201 × 2, 204 × 20, 403 × 22. All 20 204 observations are disallowed/null preflights. Counts are programmatically computed, not inferred from fixture loops.
- `frozen-vite-readback.md` records two image-only network-none source reads, no listening service. Frozen Vite `dist/node/chunks/node.js` SHA-256 is `c3dd49d14b140acd79ce8f76d3b9c191dbe76713a47e15947c2efc65f453588b`; actual excerpts show OPTIONS termination and CORS middleware preceding configureServer/Preview hooks.

The precise Docker command is retained in raw receipt and constructed by `controller.py`. The one executed browser call was:

```python
# Historical execution only; do not rerun without fresh authorization.
import pathlib
exec(pathlib.Path('C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/preflight-qualification/controller.py').read_text())
```

It ran inside `browser_exec(session='lt-sor-preflight-qualification', timeout_s=360)`. No Playwright/host installation was required. All original browser fixture, diagnosis and acceptance receipts/controllers remain unchanged, including `executed-fixture.ts` hash `3ea2a1542734088c3c559cc28714ff8d1346780a408278ae7317658fffcc847a` and prior acceptance receipt `6aa1028c0e14152bf85860fe1a6d45e8d1544ae1020ad813ba85878fd3055d9d`.

## Isolation, secret handling and cleanup

Only the new readonly fixture and previously owned synthetic readonly `/media` were mounted. No home/credentials/canonical learner store/model mounts, Docker socket, real media/microphone/provider work, existing preview, public bind, firewall/router change or global prune. Dev/foreign publication was loopback-only; LAN publication was specifically `192.168.1.3:18053`, confirmed by owned Docker inspect. No volumes created.

Dynamic capability was held in fixture/controller memory and private attached pipe with log-driver none; no capability environment/argument/HTTP bootstrap/receipt/screenshot/storage output. Evaluation payloads were not exported. Sanitized errors retain class/location only. This is controller-level handling, not an independent secret-forensic audit.

**Strict cleanup FAILED its original bound:** owned fixture acknowledged stop, but controller's subsequent 10-second wait timed out and immediate readback still showed container/client present. Raw receipt preserves `cleanupDeadlineFailure:true`, `containerAbsent:false`, `controllerExited:false`. No force-clean or fixture relaunch was attempted. Later independent exact Docker inspect returned `no such object`, and filtered docker ps returned no rows for owned preflight containers. **Later absence is verified; it does not retroactively pass strict cleanup.** No residual owned container was found.

Only this new document and external preflight-qualification artifacts were created. Existing production/package/config/tests/runbooks/contract/source and prior receipts were not edited. Parent's SPEC → QUALITY/publication gates remain outstanding; conservative correction allowance is not reset.
