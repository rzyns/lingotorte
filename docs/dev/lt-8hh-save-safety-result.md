# lt-8hh — unsaved browser work and snapshot-save safety

## Candidate and outcome

- Branch: `work/lt-8hh-save-safety`; baseline `6652f46354bf5dc8871818f45b341f492dc733dd`.
- Qualified contributor image: `lingotorte:lt-8hh-verify`, ID `sha256:333ddd077c884fc7a34e41730c10632a32d4a6cabd83a7246d7619513e3c7b3a`.
- Final Docker execution: **1,052 tests / 40 files passed**, TypeScript passed, Vite production build passed, no-network **5 tests / 2 files passed**, privacy marker scan **49 files / ok true**. Every command exited 0. `git diff --check` passed.
- All 13 changed TypeScript source/test files were hashed inside the qualified image and matched the host candidate exactly. Documentation is excluded from that image.
- No commits, pushes, Beads mutations, main merge, PR, deployment, host installs, host mounts or preview stack. Parent owns specification review, then quality/final-integration review and publication; no review-correction cycles have been used by this worker.

## Design and behavior

1. **Dirty connect is a comparison, not permission to replace.** Browser snapshot content is compared with its last acknowledged/loaded baseline. Nonempty unsaved browser content differing from nonempty durable content, edits made during the pending connection, or pending transcript form drafts enter a visible choice state. Nothing is written or hydrated at that point. Unsaved deletion of previously loaded content is also dirty. A fresh empty browser still hydrates automatically; connecting pre-existing browser work to an empty service keeps that work unsaved.
2. **Explicit choices:** Keep browser work, Load service state (discard browser edits), or Cancel connection. Keeping does not save automatically. Loading is a synchronous, explicit replacement of the compared snapshot and clears pending transcript drafts. If browser state changed since comparison, the first choice only refreshes confirmation: another click is required. Further durable changes after comparison are rejected on save by CAS, not silently replaced. No merge or force-save action was added.
3. **Durable content-addressed revision:** GET `/api/state` returns a consistent `{ok, snapshot, revision}` read transaction. The revision is SHA-256 of the complete normalized durable snapshot with recursively sorted object keys, including persisted append-only review/import events. PUT requires `{snapshot, expectedRevision}`. Missing revision returns 428; malformed revision 400; a changed durable revision 409. The comparison is inside SQLite `BEGIN IMMEDIATE`, before any snapshot/projection mutation; snapshot, projections and append-only events commit together. Only after COMMIT does PUT acknowledge `{ok:true, revision, savedAt}`. Failed projection writes roll back both content and revision.
4. **Why no migration:** Equal durable content is an equivalent revision, including a state that changed and then returned to exactly the same content. This deliberately is content CAS, not a monotonic edit-history counter. No new SQL schema is required and historical v1–v8 migration definitions/checksums were not changed. Raw `saveSnapshot`/`saveStore` remain trusted internal persistence operations; their content changes invalidate HTTP tokens. All application runtime snapshot writes use guarded PUT.
5. **Serialized, observed saves:** one PUT per browser model at a time, using the latest snapshot when dequeued and the preceding durable acknowledgement. A generation fence prevents old connect/save responses and queued operations mutating a reconnected/edited service owner. HTTP 409 is a visible terminal autosave conflict until reconnect comparison. Generic save failures remain visible and preserve browser work. A missing/lost acknowledgement never creates a saved timestamp or success claim; retry after an already committed changed-content write conflicts.
6. **Edits during await:** connect checks its captured browser comparison before hydration. Browser-handle restoration checks connection/media/browser ownership after every awaited lookup/permission/file read before any mutation or object URL creation. Save acknowledgement distinguishes an earlier committed snapshot from newer unsaved edits; unapplied transcript form drafts are explicitly not represented as saved.
7. **UI evidence:** a live status banner is visible outside Settings too; autosave completion/failure updates its DOM without requiring user navigation or a full rerender. Settings exposes the comparison choices and disables Save during connection/choice/conflict/in-flight save. Transcript input edits update unsaved status without destroying the focused form.

## Traced callers and non-goals

- Browser snapshot changes use `persistIfLocalServiceAutosaveEnabled` in import/relink, transcript import/correction/approval, saved selections, review/practice and learner-state restore flows. The existing restore feature's semantics were not changed; only its existing autosave call observes this save policy.
- Browser service/job/provider adapters use `fetchLocalServiceJson`; only state saves attach CAS tokens. Job polling/import logic is unchanged.
- Server job finishers keep jobs in an in-memory map. Embedded extraction returns draft import results, not a durable learner snapshot write; browser imports then flow through the normal store/autosave path. Source snippets write only authorized scratch artifacts. The only service snapshot writer is PUT `/api/state`.
- No cloud sync, request-authenticity changes, learner-state restore feature redesign, provider/model/microphone actions, credential/private-media discovery, or real-state transfer. This does not make a trusted-LAN service authenticated or multi-user secure.
- Whole-snapshot hashing/comparison is proportional to snapshot size. Content revisions do not distinguish equal-content ABA history; no claim of a durable edit log was added. Browser comparisons are conservative and can require confirmation for differing object ordering. An already submitted HTTP request can commit after a browser changes URL; its stale response cannot mutate the new browser connection.

## Original-failure proof and neighboring checks

Before any production edit, the original baseline plus focused regressions was baked into the contributor image and run with network disabled. The corrected fixture run (`red-tests-2.log`) returned **four product assertion failures and one existing rollback pass**:

- stale HTTP writer received 200 instead of required 409;
- dirty nonempty browser connect returned success and silently selected remote state rather than confirmation;
- edit made while connect awaited lacked a confirmation state;
- acknowledgement of an earlier snapshot advertised all browser work saved despite a newer edit.

`red-tests.log` is also retained: its first attempt included fixture mistakes (missing native subtitle argument and wrong persistence import), not counted as product proof. They were corrected before production changes; `red-tests-2.log` is the original-product receipt.

Final regressions cover independent file-backed SQLite connections, competing HTTP services with one accepted writer, stale revisions/reopen, real projection rollback/reopen, model-to-real-HTTP/SQLite conflicts, and a real committed write whose browser acknowledgement is deliberately lost. Controlled promises cover save ordering, edit-during-await, URL edit/reconnect, stale errors/acks/queued saves, confirmation refresh and browser-handle ownership. Six JSDOM UI tests exercise all choices, reconfirmation, autosave pending/error outside Settings and conflict-disabled Save.

**Evidence limit:** Node HTTP tests and JSDOM UI tests are synthetic execution, not a real-browser qualification. No live browser journey was run or claimed. The no-network suite checks its intercepted primitives; the privacy script checks runtime reference-product markers, not comprehensive security/secrets/egress. Historical Docker/browser receipts do not qualify these bytes.

## Exact verification commands and receipts

Run from this worktree; all runtime checks use the same baked image, no host mounts:

```sh
docker build --target contributor -t lingotorte:lt-8hh-verify .
docker image inspect lingotorte:lt-8hh-verify --format '{{.Id}}'
docker run --rm --init --network none lingotorte:lt-8hh-verify node node_modules/vitest/vitest.mjs run
docker run --rm --init --network none lingotorte:lt-8hh-verify node node_modules/typescript/bin/tsc --noEmit
docker run --rm --init --network none lingotorte:lt-8hh-verify node node_modules/vite/bin/vite.js build --config vite.config.ts
docker run --rm --init --network none lingotorte:lt-8hh-verify node node_modules/vitest/vitest.mjs run tests/no-network
docker run --rm --init --network none lingotorte:lt-8hh-verify node scripts/check-privacy-boundaries.mjs
git diff --check
```

Original-product command: the same approved build/run path, with Vitest arguments `run tests/core/saveSafety.test.ts tests/web/saveSafety.test.ts` before production edits (exit 1, expected original assertions). Final receipts are `final-build.log`, `final-tests.log`, `final-types.log` (empty/exit 0), `final-vite.log`, `final-no-network.log`, `final-privacy.log` under `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-8hh/`. A separate `candidate-hashes.json` binds changed paths, image sources and receipts, including this document's hash.

## Changed-file SHA-256 (documentation self-hash in scratch receipt)

| Path | SHA-256 |
| --- | --- |
| `apps/local-service/src/server.ts` | `27a3c97197cdea68e6e6bd54f38b96b82823c48916e9763ca7e6523be7f6a485` |
| `apps/web/src/app.ts` | `0fd57f2c0357820caac5a629119f88ce284c9bd7a120caeb77ec8302ed75563f` |
| `apps/web/src/model.ts` | `cddf4867bb227c7273ef70d69d5767d0c3c5f1ec8e4e17ada7f13d84b156719c` |
| `apps/web/src/uiTypes.ts` | `873bf6d56e675c445e89744cd35828553af8424e4947f09733442e83ded7418d` |
| `implementation-notes.md` | `3a8f46bb540806630564f9d5e2b95698fabc9826ac70ddf6729c71dc4fbd0079` |
| `packages/storage/src/sqliteLocalPersistence.ts` | `f851a6a69f0b7d105c070f18a9146e986fdb5fb04c65144e6f6213d8b4a7c0ec` |
| `tests/core/localService.test.ts` | `0b8d4680e7f3f0c9eb3f33f5abcc0ce5e33202caf55be27ef18259a051763af0` |
| `tests/core/saveSafety.test.ts` | `f5c8628492df297953b0dc0a26a58faaca9be02acae556c302ae7323c760c633` |
| `tests/web/dockerServiceRouting.test.ts` | `443f518792768c58246b113b6330b7c5c676801a0443bfb89cef4ae326e8baec` |
| `tests/web/frontendUi.test.ts` | `268a5d1a35e978a7644cffe231b3d2be3cdd63d3b854b5cde5e45b63a9ff9ffb` |
| `tests/web/localServiceSync.test.ts` | `ec71186510a43dada516a88aee04bff87cbc65fc725319262231753425ed53ef` |
| `tests/web/nativePathGates.test.ts` | `56ea580b87ea2a43993ba8ce3518f6cacb3657bb46553ac9ae874750cface37f` |
| `tests/web/saveSafety.test.ts` | `fb9b5a52fd60b74bae9031ba297e8073ce8b0a16bc4f6ab74cc91aefa77d1fa4` |
| `tests/web/saveSafetyUi.test.ts` | `5c3630b0e69930d0e72e35b7a1c9f35e77d65c96ff8c5044ce0599dbfdb92c8c` |
