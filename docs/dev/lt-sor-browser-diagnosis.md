# Authorized bounded browser-fixture diagnosis

## Outcome and boundary

One authorized diagnosis pass, one isolated dev-profile browser launch, then stopped. Actual Settings pairing completed in Chrome/145.0.7632.6 at `http://127.0.0.1:18051`. Visible message: **Connected to local service and loaded durable state.** Actual UI-originated GET `/api/status` and GET `/api/state` both returned 200 with no Content-Type header. The password input was cleared, Save was enabled, and the entire service oracle was unchanged before/after (state, state/scratch hashes, command/provider counters). Commands and providers remained zero. No save request or durable-save acknowledgement occurred.

This is an authenticated connection positive, **not** full A24–A26 qualification. No denial matrix, restart, save, job, media, playback, LAN preview or model/provider gate was resumed. Inherited conservative review budget remains 2/3 consumed with one remaining; this authorization did not reset it or grant three new mechanism attempts.

## Proven fixture faults

- Frozen runnable contributor image has neither `/app/dist` nor `/app/dist/web`. Dockerfile contributor does not build assets; the separate runtime target runs Vite build. This explains why Vite preview was not a valid asset-serving mechanism for this contributor artifact. No preview build was needed or attempted; existing supported Vite dev was sufficient.
- Actual Settings default was `http://127.0.0.1:5174`, not the published browser origin. The new controller explicitly selected `http://127.0.0.1:18051` through the URL input and dispatched its input event before assigning the private synthetic capability. Existing Connect handler reads the actual URL and capability input values directly; no production fix was needed.
- Old controller's unconditional JSON Content-Type on bodyless requests is invalid: a real authenticated GET `/api/status` with that envelope returned **415**. The subsequent real UI requests used valid bodyless headers and returned **200**.

## Exact bytes and execution

- Image: `sha256:08f8d07f9c75fec44ff60cb06757c99c3f5118fdaf793dcb24c74381499cef76`, verified Docker runnable ID.
- Binding: `f8bdecf19aa75e278ac6a06c4849c3708ef1b74d39ed8dae62a02d3ac344e2f2`.
- Unchanged original fixture: `3ea2a1542734088c3c559cc28714ff8d1346780a408278ae7317658fffcc847a`. No fixture AST or acceptance checks were edited; exact byte identity was rechecked after execution.
- New controller: `4aa49359a43f1d2b86c938516eb4346af583f1c2c5f5f591c35e324b7437dde3`.
- Raw receipt: `4ca4b39560a36164f05a943b17bbdb988870bbb11124892028194958df169230`.
- Frozen image model: `5a6e6c76740ffff39ca73fafabec8b7199d6c049218b9ee1d8630ed94841569b`.
- Browser revision: `@47e20adcc15fc15f01825aa17e570c8f5492ac0f`, protocol 1.3.

Scratch evidence root: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/diagnosis/` contains `controller.py`, `receipt.json`, and `adjudication.json`. Run was executed inside `browser_exec(session='lt-sor-diagnosis', timeout_s=180)` using:

```python
import pathlib
exec(pathlib.Path('C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-sor/browser/diagnosis/controller.py').read_text())
```

Do not automatically rerun. The full exact Docker command is constructed in that controller; it uses the frozen image, unchanged read-only `/qualification.ts`, read-only synthetic `/media`, loopback-only ports 18051/18052, exact allowed origins, log-driver none and dedicated attached private pipes.

## Receipt assertion issue preserved, not hidden

The raw receipt labels the result `precise-positive-incomplete` because a newly written no-false-save-ACK assertion incorrectly required the word `unsaved` even for an empty browser connecting to an empty service. It is preserved unchanged. Frozen-image `model.ts` lines 400–413 expressly implement the observed loaded/idle success message and connected state. Separate `adjudication.json` records the narrow positive supported by actual UI/network evidence, and the no-save-ACK conclusion from the exact message, GET-only trace and unchanged full oracle. This is not a passing save test or a waiver of any retained acceptance gate.

## Isolation and cleanup

No production source, dependencies, host install, public exposure, real learner/private media, providers, models, preview configuration, firewall/router, Beads, commit or push changes. No capability appeared in receipts/tool stdout, screenshots, environment, arguments, URL or persisted files; private handling is a controller-level guarantee, not an independent forensic audit. Capability stayed in fixture/controller closure and private Docker pipe; no raw CDP payload was exported. Trace stored only origin, method, path, response status and Content-Type presence.

Owned `lt-sor-browser-diagnosis-dev-positive` acknowledged stop, attached controller exited and Docker inspect confirmed container absent. Independent final `docker ps -a --filter name=lt-sor-browser-diagnosis-` returned no rows. No volumes created or global prune used. Original fixture/controller and failure receipts were preserved. Only this new document was added in the worktree; pre-existing parent changes were untouched.
