# Reviewed planning amendments — lt-foe.1

This is the recommendation-disposition and verification receipt for one bounded amendment task, not a replacement backlog. Canonical Beads owns current status. Sources: evidence packet in session `20261010_164133_c71dc6`, message 90207; review message 90245; explicit amendment request message 90246. Baseline: primary `main` at `828dbfcf9e0bd04dddda8be5dae31f7153a143fe`; work branch `work/plan-amendments` in an isolated worktree. Policies: [Git](../../GIT-POLICY.md), [work graph](../../BEADS.md), [decisions](../../DECISIONS.md), [safety](safety-privacy-boundary-review.md).

## Authority and coordination

The user superseded read-only review solely for these planning amendments and offline validation. No product repairs, real learner state, provider/model operations, deployment or live Windows integration are authorized by this task. `lt-a46` remains blocked with its exhausted live qualification budget and existing assignee. Primary checkout was clean; no `in_progress` worker claim existed before this amendment claim. Existing closed decision/repair assignees and blocked launcher ownership are preserved. Dirty launcher/integration worktrees and frozen failed receipts are inspected read-only, never staged or incorporated here. A Windows documentation worker owns only the Windows contract/runbook/procedure paths in the amendment worktree; the parent owns other files and all canonical Beads writes.

## Tracked recommendation-disposition checklist

| ID | Recommendation | Disposition and exact owner/reason |
| --- | --- | --- |
| A1 | Bind final populated migration qualification to final active/audit schema | Applied: `lt-3f1` depends on `lt-04i`; existing `lt-04i → lt-8hh` remains. Acceptance includes marker/backfill atomicity and final schema/modes. |
| A2 | Permit earlier fixture preparation without premature qualification | Applied: authorized raw legacy inspection/fixture preparation may precede blockers, but cannot close `lt-3f1`; no independently verifiable new preparation unit is needed. |
| A3 | Serialized linked-practice lossless ownership | Applied: `lt-3xg` explicitly owns wire validation/planner roundtrip; `lt-7lq` owns export projection/context/disclosure; `lt-2t4` owns integrated durable proof. |
| A4 | Planner versus integrated acceptance | Applied: prerequisite merge closure is validation/planner/session atomicity and honest receipts; complete T01–T14 durable/modes/revision/migration/browser obligations remain at `lt-2t4`, not silently dropped. |
| A5 | Full request contract, reads/effectful GETs, pairing and all clients | Applied: `lt-sor` names §3–§5/A01–A30, actual revision-specific route/client/job inventory, private reads, snippet LRU, delivery/lifetime/destination/redirect controls and separate browser evidence. |
| A6 | New restore APIs and zero-side-effect rejection | Applied: `lt-04i` and both contracts require the common gate; `lt-2t4` reconciles parallel branches. Baselines compare application effects/private bytes with positive controls and paused-worker denial. No auth bypass or public diagnostic endpoint. |
| A7 | One combined Windows candidate and offline harness preflight | Applied: Windows procedure/contract/runbook and `lt-a46`/`lt-13v` require content binding, source closure, canonical URL construction, dependency/fixture/harness identities and prerequisites. No live run undertaken. |
| A8 | Distinguish harness/application/unreached results and recovery | Applied: procedure and issue acceptance prohibit spliced receipts and counting recovery termination as lifecycle success; unchanged disk/reopen/native Ctrl+C/failure/foreign-listener/owned-process controls and separate Edge journey. |
| S1 | Correct stale proposed-decision wording without erasing history | Applied: request/restore headers identify accepted decisions and pending implementation; original baseline/failed observations/review questions are labeled historical, not rewritten as passes. |
| S2 | Narrow verification-command claims | Applied: workflow explicitly limits marker scan, intercepted no-network tests and historical bundle validator; they do not establish semantic/security/browser completeness. |
| S3 | Current work routed through canonical Beads, preserve historical decisions and completed repairs | Already satisfied by AGENTS/README/BEADS/DECISIONS and closed `lt-e9g`/`lt-4jg`/`lt-21e`/`lt-9zj`/`lt-xnu`/`lt-8s9`/`lt-tow`; add amendment navigation only. No reopening. |
| S4 | Finite required program versus optional scope | Already satisfied: root required children plus `lt-4ct` human acceptance; deferred `lt-5lb` lanes do not block required work. Preserve phase ownership and safety/learning joins before morphology. |
| S5 | Dirty state, revisions, lost acknowledgements, full-backup distinction | Already required by accepted restore contract/`lt-8hh`/`lt-7lq`; reinforced in integrated acceptance, not implemented here. |
| S6 | Learning clock/due/practice/audio/approval/relink/metrics and morphology honesty | Already assigned to required learning/language issues and qualification; no new planning defect established by review. Implementation remains open. |
| S7 | Original direct Windows → morphology next action | Superseded by recorded deeper review and dependency graph; retain Windows → safety/learning → morphology → integrated acceptance. Historical recommendation not edited. |
| S8 | Integrated Windows receipts, raw evidence preservation and affected startup requalification | Procedure applied; execution deferred because allowance is exhausted and launcher is blocked. Raw historical receipts remain frozen in their existing worktree/scratch locations; future candidate packet must preserve/reconcile them without reclassifying failures. Request pairing startup requalification remains `lt-sor`. |
| S9 | Selected Linux full tuple/browser proof and real ASR | Deferred: exact native Linux qualification evidence is missing and cannot be inferred from emitted-JS/lexical tests; not a Windows milestone blocker. Real ASR remains separately optional, no models/tool installs authorized. |
| S10 | Human acceptance, real-state transfer, persistent rollout, broader recovery | Deferred to existing gates: `lt-4ct` follows qualified candidate; `lt-eet`/`lt-jxg`/`lt-42c` remain separately gated/deferred, outside amendment completion. |
| S11 | Full Beads history durability | Already documented: JSONL/Git is not a Dolt backup. Refresh sanitized export and existing local full backup; no remote Dolt sync/off-machine backup authority. |

Applied means the planning amendment is persisted, **not** that the application meets its amended acceptance. These are the actionable recommendations and supporting evidence corrections from the packet/review; no new unrestricted audit or optional feature is added.

## Verification and review

### Executed offline verification

- Canonical CLI `where --json`: primary `.beads/embeddeddolt`, no competing worktree store. Claim readback: `lt-foe.1`, `in_progress`, `hermes-amendments`.
- Programmatic canonical `list --all --limit 0 --json` and focused `show --json` readback: **50 records, 81 blocking edges, acyclic**, `lt-3f1 → lt-04i → lt-8hh` in the intended direction, **0 required-to-deferred blockers**. All 49 pre-existing statuses/assignees preserved. Eight amended acceptance fields read back exactly; request issue title now covers complete authenticity rather than mutations only.
- `ready --exclude-type epic --json`: **empty frontier** while this amendment is claimed. This is sensible, not a newly introduced deadlock: `lt-a46` remains the existing non-dependency blocker for Windows qualification and its downstream work; fixture preparation does not pretend to close a blocked final qualification gate.
- Canonical `export --all -o <amendment-worktree>/.beads/issues.jsonl`: **50 records**. Independent specification review normalized order and compared every exported record's canonical fields/dependencies: all match. Export is an interchange snapshot, not full Dolt history.
- Offline Python document assertions: **8 changed/new Markdown documents, 35 local link targets**, balanced fences; **A01–A30 (30 request cases)** and **T01–T14 (14 restore cases)** remain intact. These are structural checks, not execution of the product matrices.
- `node --input-type=module -e <URL assertions>`: **2 example vectors pass**; `new URL('/@vite/client', 'http://127.0.0.1:5173').pathname` is `/@vite/client`, distinct from `/%40vite/client`. This checks the documented examples only, **not** the frozen or future actual resource checker. Actual harness preflight and combined Windows execution remain unrun.
- `python validate_final_bundle.py`: exit **0**, `errors: []`, **16 required files, 16 manifest entries, 99 Markdown files**. README's manifest bytes/lines/SHA-256 updated only for this amendment-owned edit; unrelated historical manifest identities preserved.
- `node scripts/check-privacy-boundaries.mjs`: exit **0**, `ok: true`, **49 runtime files scanned** (marker scope only). `git diff --check`: exit **0**.
- Existing full application tests/typecheck/build were **not rerun**: no application, harness or test code changed; documentation/graph checks are the affected verification. No green application or Windows qualification claim is made.
- Existing local `backup sync` succeeded; `backup status` read back the configured local takeover destination and updated sync timestamp. No remote Dolt sync, database initialization or off-machine backup was performed.

### Independent reviews and publication

Specification **PASS**: `deleg_e99c3bfd/task-0`. Quality/consistency **APPROVED**: `deleg_8cbb7d37/task-0`. Both reviewed the actual diff, new documents and Beads changes read-only, with no supported blocking findings. No review-driven correction cycle was required; the three-cycle maximum did not reset the live Windows budget. Parent corrected an in-flight runbook statement before review to recognize the already integrated native-root repair rather than call it future implementation.

Publish the coherent planning amendment and its separate final tracking export only on `work/plan-amendments`; exact commit and remote-readback evidence lives in canonical `lt-foe.1` notes, avoiding recursive commits to record their own hashes. Publication is **not** merge to `main`, deployment, product implementation or Windows qualification. Close only `lt-foe.1` after its verification/review/publication readback; all underlying implementation and qualification issues retain their prior status.
