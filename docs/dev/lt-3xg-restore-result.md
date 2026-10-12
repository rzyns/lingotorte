# lt-3xg planner restore candidate

Status: independently approved planner/session candidate. SPEC PASS `deleg_9502cb26/task-0`; QUALITY APPROVED `deleg_dce8a7da/task-0`, bound to the correction manifest and image below. Review-driven correction cycles: **1 / 3 total**. Publication and closure receipts belong to canonical Beads; this is not frontend or durable-restore qualification.

Baseline: `66aa7660772e22912a8698764e1e581229a62d62`, branch `work/lt-3xg-restore`, initially clean. Scope is contract §8 planner-level closure, not the downstream distributed durable matrix.

## Cause and fix

- Restore previously appended history on every import, bypassed service-entry integrity validation, and mutated collections incrementally. Replace removed array entries using index strings rather than event IDs.
- Export built its context dictionary only from occurrences, enriched immutable attempts from current transcript tracks, and validation discarded nested `eventLink`.
- Snapshot cloning copied containers but shared nested record objects.
- Added `planLearnerRestore(input, mode, active, audit)` as detached preflight shared by `RestoreService.plan`, `preview`, and commit. It validates the supplied schema/hash before coalescing input IDs; rejects mutable duplicate ambiguity, immutable active/audit conflicts, identity rebinding and introduced dangling references; orders history deterministically; computes active/audit/coalesced effects.
- Export preserves captured source contexts unchanged and includes attempt-only contexts. Decoder accepts nested links and the legacy flat link spelling; contradictory spellings and unsupported record/context fields fail closed. Verified legacy wire spelling is retained privately with an exact decoded-object fingerprint, allowing service-entry revalidation without replacing supplied integrity. `captureLearnerExportWire` preserves this wire value for pending intent; mutated decoded objects do not inherit verification.
- LocalStore stages all deep clones before installation, retaining a separate session audit and explicit pending restore intent. Rejected plans return no success receipt. `restoreWithReceipt` reports result-derived effects and **session-only / durablySaved=false**; the snapshot-only `restore` interface remains compatible.

## Regression proof and verification

Raw evidence: `C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt-3xg/`.

- `red.log`: discarded fixture failure (missing approved transcript); **not product regression proof**.
- `red2.log`: original implementation, **5/5 product regressions failed**: attempt-only context missing, service accepted hash tampering, nested snapshot mutation leaked, duplicate counts wrong in both modes. Original image remains `lingotorte:lt3xg-red`, ID `sha256:2824bee0ad9f082fd678aa837d54371b9431f79221a3cb6e0457e9ecfbecd675`.
- Earlier candidate failures and compiler failures remain in `green.log`, `full.log`, `types.log`, and `types2.log`; they are not green receipts.
- Exact final `q2-*` receipts: scoped **10/10**, full **1062/1062 across 41 files**, TypeScript exit **0**, Vite build exit **0**, no-network **5/5**, privacy scan **ok, 50 runtime files**. `git diff --check` exit **0**.
- Image-only Docker build, no host source/media/state mounts; every verification container used `--rm --init --network none`. No host dependency installs, provider calls, private media, learner database or existing preview-stack changes.
- Final contributor image: `sha256:79b94a3b3bfca41ce6962687b0e5eb6f3034ec4bd27ba695773c7bd3d6e83177` (`lingotorte:lt3xg-candidate`). Official pinned Node base is recorded in `q2-build.log`.
- `manifest.json` records exact commands, image identity, seven changed implementation/test SHA256 values and raw-log hashes. `bind_candidate.py` executed and verified all seven image source hashes equal worktree bytes. Manifest SHA256: `aa7086394d68183feedef82e334cc3990bd49017858b5e444e6ebd41dc5e3ca5`.

Tests cover actual FSRS-linked practice producer → export → stringify → parse → validate → merge twice, exact attempt/review payloads without rerating, integrity preflight, independent nested staging, duplicate mutable/practice conflicts in both modes, immutable review conflicts in both modes, audit-only practice conflicts, empty session replacement/audit retention/reactivation, preview-plan agreement, truthful session receipt, legacy flat-link decoding and retained pending-wire revalidation.

Existing core fixture changes are intentional contract alignment: P6 preview fixture now recomputes integrity for the legitimately changed manifest and rebuilds its mixed context dictionary; P7 now asserts exact captured context rather than expecting export-time enrichment from mutable track metadata. No test expectation was changed to permit an immutable payload conflict.

## Correction cycle 1 — inherited-key reference defect

Independent SPEC FAIL `deleg_9f10ae80 task0` is retained: the prior candidate's truthy record indexing accepted a correctly hashed review referencing absent `constructor` in both modes, violating §3.3:110. Prior `q2-*` checks and `manifest.json` below are historical receipts, **not approval or qualification of this correction**.

- Planner reference lookups now require own entries for occurrence ownership, card ownership, state, review and practice. Planner identity/duplicate/audit maps already use `Map`; `Object.fromEntries` safely creates own `__proto__` entries. No identifier normalization or reserved-token prohibition was introduced.
- Domain preview comparisons require own entries; array/history/state comparison indexes have null prototypes. Source-context dictionary references also require own entries.
- LocalStore record getters require own entries. Record setters define enumerable/writable/configurable own properties rather than invoking the inherited `__proto__` setter. Snapshot normalization uses spread and detached structured clones, preserving own special-token entries.
- Final identical regression suite executed on prior production source (`c1-red-final.log`): **18 failed / 32 passed**, including 16 absent constructor/__proto__ occurrence/state/review/practice failures across both modes and two inherited-getter failures. Card-ownership and missing practice-review checks already rejected correctly; ordinary dangling cases already rejected. Red image production bytes were verified against prior `manifest.json`; final test bytes equal green test bytes.
- Green `c1-scoped.log`: **50/50**. Includes 36 individually enumerated absent-reference cases with full active/audit/pending-intent invariance; real own constructor/__proto__ store/export/restore/repeat-preview positives; both-mode identity anchors and audit-only review conflicts. Supplemental positives remain synthetic, not durable evidence.
- Green `c1-full.log`: **1102/1102 across 41 files**; types, Vite build, no-network **5/5**, privacy **ok / 50 files**, all exit 0. Interim readonly-fixture TypeScript error and intermediate receipts retained as `c1-interim-*`; not final green receipts. `git diff --check` exit 0.
- Green image: `sha256:7bd7d67ba65c06e257aaead6d98d1adada8c4af66a24238f80ff8eeca8fc4ec7`. Red final image: `sha256:4e290669c2e78eb41b18b90f4bd3914864037e3109961c1a7a08f5b67ba56391`.
- `c1-manifest.json` SHA256: `678050a2100c96921bb6c555f5f13295eb18bff0264e1c223d8a413d1f38e38d`. Contains seven exact source hashes verified against green image bytes, image-bound commands/exits, and receipt hashes. `qualify_c1.py` is the scratch-only reproducible runner/binder; prior manifest and receipts remain unchanged.
- This cycle changes only `exportManifest.ts`, `localStore.ts`, `restorePlanner.ts`, `restorePlanner.test.ts`, and this result document. Existing earlier candidate changes remain intact. Containers have no mounts and `--network none`; no real learner/provider/model/preview-stack mutations.

Frontend snapshot-only restore, cached counts and session false-success remain **unqualified** until the parent's serialized integration. Full durable migration/revision matrix remains downstream §8. Return is for SPEC re-review, not approval.

## Parent integration interface and limits

Parent independently exercised the exact correction image: **1102 tests / 41 files**, TypeScript, Vite build and privacy-marker scan (**50 files**) passed; separate no-network suite **5/5** passed. Both independent reviewers verified seven source hashes against image/worktree and reran **50/50** scoped tests. The optional mode-warning wording suggestion is not a blocking finding; no additional functional correction was applied.

Files: `packages/domain/src/exportManifest.ts`; `packages/storage/src/{exportRestoreService,localStore,restorePlanner}.ts`; `tests/core/{restorePlanner,p6PracticeExport,p7TranscriptLifecycle}.test.ts`; this document.

No edits to SQLite, web model/app/server, web tests, manifests/config/Docker, shared receipt docs, or Beads exports.

For the serialized frontend follow-up, use `RestoreService.preview(manifest, mode)` and display its authoritative `effects`, `auditEffects`, `coalesced`, `integrity` and `durability`; the older `operations` fields remain compatibility presentation counts, not reactivation/audit counts. Commit via `restoreWithReceipt` and display **that returned receipt**, not cached preview. On rejection retain input and display failure, never durable success. Do not convert a pending replacement into ordinary snapshot PUT. Read `snapshotPendingRestoreIntent()` and `snapshotRestoreAudit()` for fresh durable staging after dirty-state/revision handling. No preview/commit HTTP route is added or request-qualified here.

Remaining mandatory downstream work: versioned internal active/audit transport and hydration, ordinary-save retention/reactivation rules, SQLite transaction/reopen/migration/revision and outcome-unknown reconciliation, dirty browser connect/save serialization, durable receipt UI and active-only export recovery disclosures. Private session audit is not yet a durable transport/schema claim; these remain lt-04i/lt-8hh/lt-3f1/lt-7lq and integrated lt-2t4 obligations.

Privacy scan covers reference-product runtime markers only; no-network tests cover their intercepted flows, while Docker network isolation covers these container runs. No real-browser, real-service restore, file-backed restore/reopen or durable distributed qualification is claimed.
