# Single bounded real-browser acceptance — blocked

## Disposition

A24, A25 and A26 remain **OPEN**. One newly authorized fixture launch ran in Chrome/145.0.7632.6 at `http://127.0.0.1:18051`; no second launch or production correction followed.

Actual Settings pairing succeeded: GET status/state 200, no Content-Type, masked input cleared, Save enabled, full fixture oracle unchanged, commands/providers zero. Actual Settings Save returned PUT state 200 and visible `Saved local state at …`; the post-save logical snapshot/revision and SQLite file hashes are in raw receipt. This was an **empty-state explicit save**, not a synthetic nonempty mutation/CAS-conflict acceptance. No job, WAV, foreign/null-origin or restart acceptance was reached.

## Precise blocker

New acceptance controller invoked shipped `prepareSourceAudioSnippet` with a fresh paired model but omitted required `pathPolicy`. `sourceAudioSnippet.ts:24` calls `requireServiceNativePath`, which rejects missing policy at `packages/domain/src/nativePaths.ts:59–62` **before job creation**. The browser evaluation exception was intentionally redacted to RuntimeError; the exact controller invocation plus source establish the fixture omission, not a production defect. Model was paired but never connected/hydrated for this separate snippet invocation. Correct continuation would connect that model and pass its returned service path policy; do not bypass the compatibility gate. This report does not claim a captured exception message proves that cause independently.

The controller stopped at that exception; it did not execute allowed-capability denials, foreign/null seeded probes, restart during polling/autosave, re-pairing, LAN profile or reload/storage checks. No server denial/private-byte assurance is inferred from this run. Prior diagnosis/failure receipts remain unchanged. Review correction budget is not reset.

## Identity and commands

Production binding check before fixture launch: 196 non-test entries matched parent manifest, zero mismatches. Approved contract hash: `c6692549fd40f265f5fd7e7c76d511e66d279b402c37bbca8a8ec4e487417cb9`.
Image: `sha256:08f8d07f9c75fec44ff60cb06757c99c3f5118fdaf793dcb24c74381499cef76`. Binding: `f8bdecf19aa75e278ac6a06c4849c3708ef1b74d39ed8dae62a02d3ac344e2f2`.
Original fixture: `3ea2a1542734088c3c559cc28714ff8d1346780a408278ae7317658fffcc847a` (unchanged).
Controller: `5f1f0d470788d7895632a94b2c3f87a742aeb24e8983733fa29879d6b5b00d8b`.
Raw receipt: `6aa1028c0e14152bf85860fe1a6d45e8d1544ae1020ad813ba85878fd3055d9d`.

Kit root: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/acceptance`. `controller.py` constructs the exact Docker command; execute only inside browser_exec, never terminal (private capability pipe):

```python
import pathlib
exec(pathlib.Path('C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/acceptance/controller.py').read_text())
```

This is historical execution provenance, **not authorization to rerun**. `hash-manifest.json` binds controller and raw receipt. Browser revision `@47e20adcc15fc15f01825aa17e570c8f5492ac0f`, CDP protocol 1.3. Recorded network: old invalid GET envelope 415, corrected GET status 200, GET state 200, explicit PUT state 200. Counts reconcile to four recorded API responses, of which three are application positive flows.

## Isolation and cleanup

Frozen fixture and synthetic read-only media mount only; log-driver none, private attached pipe, loopback-only verified ports 18051/18052, no volumes created. No production/package/config/test/contract/runbook edits, real media/learner data, provider traffic, host installs, publication, commits or Beads changes. Random capability remained controller/fixture memory and private pipe; no payload/header/script export or screenshot.

Stop acknowledged, controller exited, Docker inspect confirmed owned container absent. Independent `docker ps -a --filter name=lt-sor-browser-acceptance- --format '{{.Names}}'` returned no rows. No relaunch/global prune.
