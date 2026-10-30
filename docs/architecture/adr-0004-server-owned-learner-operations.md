# ADR-0004: Server-owned learner vocabulary operations (lt-192.3)

Status: accepted after independent specification and quality review (`deleg_d477c77e/task-1`), implemented on `work/lt-192-3-shared-mutations` (base `80b1e20`). Publication and closure are recorded in canonical Beads; no deployment or merge to `main` is implied.
Builds on ADR-0003 (relational authority, opaque revision, write-once transcripts). Evidence: `docs/dev/lt-192.3-shared-mutations-result.md`.

## Context

Before this change, every browser saved vocabulary by sending its whole learner document (`PUT /api/state` under CAS on an
opaque revision). Two paired browsers that both changed vocabulary lost one side's work or reached a Keep/Load choice,
and a browser that fetched the latest revision but held stale rows could overwrite another browser's capture.

## Decision

### 1. Four operations, one route

`POST /api/learner/operations` with a strict body (unknown keys are refused):

```
{ operationId: UUID, kind, basis: { generation, incarnation, receiptSeq }, payload }
```

| kind | payload | server semantics |
|---|---|---|
| `capture` | kind, language, displayText, mediaId, cueId, startMs, endMs, sourceContext, optional meaning/meaningSource/notes | Strict wire validation first (exact keys, UUID ids, integer spans/times, non-empty text, valid `meaningSource`; any failure is `400 invalid-operation` with no receipt, row or revision). Then complete source validation against the stored *approved* target bundle: media path and fingerprint, track, cue, text, time range (the browser's rule), and a token span that must equal exactly the tokens the char span overlaps under the browser's capture segmentation (`captureTokenSpan`, the `cueWordTokens` tokenizer: punctuation is a token); a whole-cue sentence keeps its historical whitespace word count. Then `CaptureService.capture` (global normalized dedup, still creates a card until F). A dedup that cannot apply a draft meaning/notes returns `unappliedDraft` with the existing values; the existing item is never overwritten. |
| `set-meaning` | savedItemId (UUID), meaning (non-empty string or null = explicit clear), expected `{ meaning: string or null, meaningSource: valid source or null (null when meaning is null) }` | Conflict `meaning-changed` unless both the current meaning **and** its source/provenance (or their absence) equal `expected`. |
| `set-review-enrolment` | savedItemId (UUID), enrolled (boolean), expected `{ activeCardIds, archivedCardIds }` (UUID arrays) | Conflict `enrolment-changed` unless the card identity/state sets match. Archive, reactivate and bulk "Add all to review" (one operation per item) all use it. |
| `undo-capture` | captureOperationId | Undo only what the **stored, server-generated** capture receipt of the same lineage says that capture created, under current guards (item unchanged since capture). The client has no deletion authority. |

There is no notes operation (no current writer needs one). Existing Host/Origin/Bearer/admission rules apply unchanged;
no new header, CORS rule or cookie.

The service composes the semantics (`apps/local-service/src/learnerOperations.ts`) and passes them as a synchronous
callback to `SqliteLocalPersistence.applyLearnerOperation`, so storage never imports review.

### 2. Exactly-once, atomically

In one `BEGIN IMMEDIATE` transaction: look up the receipt by id; same id and identical request (SHA-256 of canonical
`{kind, basis, payload}`) returns the historical receipt with `replayed: true` and no second effect; same id with a
different request is refused (`409 operation-id-reused`). An unknown id must be eligible:

* `basis.generation` equals the current lineage (rotated by restore commit) — else `generation-changed`;
* `basis.incarnation` equals this service process — else `incarnation-changed` (conservative fence: an operation never
  acknowledged by the current process might belong to a lost pre-restart state, so it is refused, never guessed);
* `basis.receiptSeq >= prunedThroughSeq` — else `operation-expired`; and not ahead of the latest receipt.

Then the callback runs against the authoritative rows. Only operation-owned collections may change (checked). Changed
rows, per-row ownership stamps with the row's authoritative before/after images (`operation_owned_row.history_json`,
kept only since the last non-operation write), revision bump, terminal receipt (`applied` or `conflict`) and
pruning commit together or not at all. A failure in receipt insertion or `COMMIT` rolls everything back; the service
reports failure, never success. Server-generated timestamps only.

Receipts carry authoritative images of the rows written (plus the canonical item/occurrence/card named by a dedup
capture) and the ids removed. Retention: at most 5,000 receipts and none older than 30 days; pruning advances
`prunedThroughSeq`, so a missing request older than the boundary is refused rather than applied anew.

### 3. Ownership fence on whole-document saves

Operation-owned: `savedItems`, `savedOccurrences`, `reviewCards`, and card-state membership/initialization/removal in
`reviewCardStates`. Review/practice schedules and history stay on the document path.

The fence is activated by the first applied operation (`learner_operation_state.protection_active`). An upgraded or
never-operated database keeps the historical whole-document semantics. After activation, `PUT /api/state` (any client,
including old ones) is reconciled **inside the save transaction**:

* a body row that differs from the authoritative row is accepted as a stale view **only** when an operation touched
  that row after the body's basis and the body row (or its absence) equals one of the row's stored authoritative images
  since that basis (the image at the basis, or after any later operation, e.g. one the browser installed from a
  receipt); it is then replaced by the authoritative row. No generic merge: a body that edits, creates, deletes or
  resurrects an operation-owned row in any other way (an old client's local meaning edit, an unpaired capture), or
  whose row history is unavailable, is refused with `409 operation-owned-rows` (the browser keeps its work and offers
  Restore (merge)); rows are never silently dropped;
* a dirty review schedule/history on a card removed remotely is refused with `409 operation-dependency`
  (non-destructive; the browser keeps its work);
* otherwise local document changes (schedule, history, media, settings) are kept and the authoritative operation rows
  are returned (`operationOwned`) for the browser to install.

Document CAS uses `last_non_operation_revision`, updated by **every** non-operation writer (learner save, transcript
bundle, fixture `saveSnapshot`, restore). Operations bump the revision but do not make another browser's document basis
stale. This proof is durable and not derived from prunable receipts. Every learner-state document writer is fenced:
`saveLearnerState` and the internal fixture `saveSnapshot` (without an expected revision its basis is the current
revision, so it cannot change any operation-owned row). Restore is **not** a rebasing writer: preview and commit keep
strict current-revision CAS, so any intervening operation requires a fresh preview and confirmation.

### 4. Lineage

Ordinary restart: same generation, new incarnation; retained receipts still replay. Restore commit rotates the
generation: pre-restore unknown intents are refused (shown as blocked, with explicit reapply), retained receipts keep
their own generation and still replay. An external database-file rollback copies the lineage; the receipt sequence
cannot detect every rollback, and no such claim is made.

### 5. Browser: durable outbox and honest UI

* Dedicated IndexedDB database `lingotorte-learner-operations` (one record per operation; not the snapshot cache's
  last-writer record). `add` resolves only after transaction completion; cap (200 unresolved) is counted and enforced
  in the same transaction; unresolved records are never evicted; a duplicate id aborts the transaction.
* State machine `pending → sending → acked | conflict | blocked`, `pending → cancelled`; every transition is a guarded
  read-modify-write transaction, so stale writers cannot resurrect terminal records and claim/cancel races have one
  winner. `sending` (may-have-sent) is durable **before** the network request. A dispatch lease (15 s) prevents two tabs
  sending one operation; a reloaded tab re-adopts its id via sessionStorage + Web Locks (a duplicated tab cannot).
* The request is immutable; retries resend exactly it. Capture records keep their unsaved media/track/transcript
  prerequisites, which are saved before the capture is sent and restored after Load service state.
* Paired operation mode is enabled only when the selected service publishes `operations` in `GET /api/state`. Unpaired
  and non-supporting services keep the historical local behaviour.
* No provisional canonical rows on paired clients: pending intents are shown by operation id (Saved view panel and
  overlays). A capture is "Not saved yet" until acknowledged, never "Saved". Acknowledged rows install under per-row
  revision guards so an older (replayed) receipt cannot overwrite newer rows. An ack never advances the document
  baseline silently; an operations-only sync sends no redundant `PUT /api/state`.
* A capture acknowledged as joining an existing item without its meaning/notes draft (`unappliedDraft`) keeps a durable
  open disclosure (`draftReview: open`): shown in Saved across reloads and tabs, excluded from resolved-record pruning,
  and Save does not report all changes saved until the learner explicitly keeps the saved values or applies the
  meaning as a new `set-meaning` operation. Nothing is applied automatically. Meaning and notes are resolved
  separately (`draftResolved`): "Use my meaning" / "Keep saved meaning" decide only the meaning, "Keep saved notes"
  only the notes (there is no notes writer, so the notes draft can only be kept or dismissed explicitly); the
  disclosure stays open while either is undecided. "Use my meaning" is one outbox transaction (`handoff`) that adds
  the replacement operation and then resolves the draft's meaning: a killed page, a full outbox or a failed write
  leaves the meaning draft open and no replacement; a committed one leaves the replacement pending. Decisions are
  evaluated on the stored record inside the transaction, so a stale tab can neither re-decide nor reopen a draft.
* A failed outbox write (for example `QuotaExceededError`) stores and sends nothing; the capture form keeps the
  selection and shows a named storage error.
* Autosave off queues; explicit Save flushes. Load service state keeps pending intents visible; discarding is separate.
  An unknown-outcome capture cannot simply be cancelled: Undo reads the receipt back and then sends a trusted undo.

## Consequences

* Two paired browsers' independent vocabulary edits both survive; same-item edits are explicit conflicts.
* Old clients cannot overwrite operation effects, even with a GET-latest stale body; they may instead receive a visible,
  recoverable refusal.
* Schema v13 is additive (`learner_operation_state`, `learner_operation_receipt`, `operation_owned_row`); migrations
  1–12 and legacy tables are unchanged (legacy deletion stays with lt-fls).
* Changed regression contracts are listed with rationale in the result document.
