# Lingotorte — delivery scoping proposal

Build the adopted add → watch → understand → collect → selected Anki export journey.
Approach: extend existing storage/export/domain components and deliver verified increments, not a rewrite.
Riskiest assumption: replacing browser-peer state with shared service authority can preserve all existing work while removing ordinary reconciliation ceremony.

Status: coordinator synthesis of CodePlanningGroup planning inputs. Owner adopted [product brief](product-brief.md); implementation and cutover are not authorised. This document is input to canonical Beads reconciliation, not a second task/status store.

## 1. Decisions and boundaries

- Keep one computer-hosted library used by computer/iPad browsers. Recommended private HTTPS access via a verified Tailscale boundary; no access-policy changes by implication. Existing Origin/Host and request protections remain necessary.
- Browser addition stores media durably on the server; preserve existing read-only source-folder access. Managed writable storage is a recommendation to detail during scoping.
- Collect without in-app enrolment. Meaning/note edits persist across occurrences, per owner decision. Preserve prior study data/history.
- Recommended Anki identity: one note per saved item, stable source occurrence. Earliest capture is the proposed initial source, not a proven durable pin. Alternative: video-specific note identities; changing identities later risks duplicates and history discontinuity. Resolve source-change/deletion policy before the selected-export slice.
- Restart interrupted uploads initially rather than implementing resumability. Pivot only on real large-file interruption cost; unknown outcomes must be checked before restarting.

## 2. Evidence gate and unknowns

**Gate: verify**, supplied by @experiencedesigner. User feedback and scripted simulation checks support the experience direction; they do not establish upload/lookup latency, accessibility, actual iPad usability, storage/retry safety or production readiness. No further screen expansion is needed.

Preserve existing evidence: @codearchitect reports live `lt-foe.3.5` records include owner-qualified .apkg/.txt imports and no duplicate notes on re-import. Earlier blanket “unqualified” claims were based on stale documentation. New subset, source-context and editing behaviour still needs delta acceptance; Anki-side edits/scheduling preservation are not inferred.

Unresolved access setup, codec support and mutation/conflict semantics are bounded technical investigations, not reasons to redesign the whole product. Do not add transcoding, full standalone study or a native app by default. Actual iPad playback/collection is part of the adopted use case; iPad upload tuning can follow later.

## 3. Dependency-ordered delivery slices

| Slice | Usable outcome and reuse | Minimum real acceptance evidence |
| --- | --- | --- |
| 1. Reconcile scope and rehearse recovery | Map adopted brief to current decisions/Beads; preserve service and browser-only work using current backup/cache/per-media mechanisms. | Isolated transfer/reopen/rollback with identities, meanings, source links, transcripts and study history checked, not just counts. No live migration. |
| 2. Shared playback, safe mutations and private access | Computer/iPad open one URL and stream server-held media; extend Docker proxy, admission checks and media catalog. Own the server-authoritative mutation/retry contract here. | Play/seek synthetic media in desktop Chrome and actual iPad browser; restart/reopen; verify denied unintended access paths before replacing pairing. From two clients, independent saved-vocabulary edits both survive; retry a server-acknowledged operation after losing its response without duplicate effect; conflicting edits never silently overwrite one another. |
| 3. Durable browser addition | Standard video/subtitle selection, managed upload, fingerprint identity and independently retryable attachments using shared parsers. | Upload on desktop then reopen/play from iPad; interrupted upload, lost completion response, duplicate content and subtitle-only retry leave no broken published item or duplicate. |
| 4. Watch/lookup/collection | Reuse cue navigation, transcript, local gloss/morphology, exact selection spans and occurrences; decouple capture from card creation. | Inspect A while B plays, collect A, reopen on other device; no card created. Lookup unavailable and lost save acknowledgement preserve exact context without duplication; Undo preserves prior work. |
| 5. Selected export | Reuse mapper, stable GUIDs, .apkg/.txt builders; add subset preview and persistent shared edits with predictable context. | Disposable Anki import of subset and re-import after edits/from another video; verify identities, context, empty/note-only answers and retained scheduling/history. Establish Anki-side edit handling explicitly. |
| 6. End-to-end qualification and approved cutover | Reuse valid qualification infrastructure; preserve source-matched component evidence. | Full desktop-add → iPad-watch/collect → selected export loop with disconnect/restart. Separate approved real-data cutover and rollback checkpoint. |

Slice 1 owns recovery requirements and rehearsal. Slice 2 owns the server-authoritative mutation/retry contract and focused two-client acceptance. Slice 4 proves the collection UI uses that established contract; it must not defer foundation safety until its own UI checks. Existing accepted components should not be reimplemented or requalified wholesale without changed dependencies.

## 4. Reconcile existing work before implementation

Reported by @codearchitect from live Beads, not independently re-read by coordinator:

- Extend ADR-0003 and accepted `lt-dxo` export work; do not reopen completed storage/export deliveries.
- `lt-584.7` remains open: repair affected qualification payload/oracle before reusing that historical harness. Do not promote this into a global blocker for unrelated checks.
- Reconcile `lt-5lb.4` drawer/capture-form proposal with one-action collection rather than building both.
- Amend affected DECISIONS sections together: §2 browser media, §10 Anki role, §14/14a access/pairing, §15 desktop-browser support.
- Native Windows qualification, practice refactoring and legacy-table deletion stay outside this chain. Prior `lt-dy6` authorisation is not new-scope approval.

Before final issue payloads, re-read current records/source and map each slice to existing work, blockers, scope and acceptance criteria. No tracker changes were made by this synthesis.

## 5. Review/approval checkpoint

Review whether the dependency order and real acceptance evidence match the adopted brief. Routine implementation details should be resolved from source; escalate only material product/security/data choices. Planning approval is separate from permission to code, alter real learner data, change network access, deploy, or perform cutover. Keep unresolved limitations attached to worker handoffs.
