# ADR-0002 — Capture is one module that owns SavedItem, SavedOccurrence and ReviewCard writes

Status: **Proposed** (set to Accepted by `lt-2se.6` with merge hashes in Outcome)
Date: 2026-10-17 · Author: Code Architect · Beads: `lt-2se`, `lt-2se.4`, `lt-2se.5`, `lt-2se.6`
Plan: `docs/plan/architecture-deepening-plan.md` §2

## Context

The product's central act is **capture**: the learner selects a word, phrase or sentence in a cue and saves it; a `SavedItem` (deduplicated by text) gains a `SavedOccurrence` (the exact cue/time/char anchor) and exactly one `recognition` `ReviewCard` enters FSRS review. `docs/architecture/data-model-and-storage.md:29-35, 56, 166, 210` state the invariants: one card per item, occurrence anchors immutable, archive instead of delete, review events append-only.

Today these rules are enforced by callers in `apps/web/src/model.ts`:

- `ensureReviewCardForSavedItem` (`model.ts:3548-3563`) implements "one card per item" but is reached only from `saveSelectionWithReceipt` (`:3374`). Three sibling save helpers (`:3433-3519`) and `createReviewCardForSavedItem` (`:3521`) bypass it. `ReviewService.createCard` (`packages/review/src/reviewService.ts:39-56`) and `LocalStore.putReviewCard` (`packages/storage/src/localStore.ts:246`) accept duplicates.
- Undo (`undoSave`/`canUndoSave`, `model.ts:3333-3366`) is the only caller of `LocalStore.remove*` and guards the hard delete with eight conditions, three of which read UI state.
- `SavedItem.archivedAt` is read but never written by app code.

Git history (`git log -L3289,3620:apps/web/src/model.ts`) shows lt-cms, lt-uzo, lt-e0j and lt-foe.3.1 each re-opening the same ~330 lines. Every learner-facing change lands here; the module is deep in behaviour but its interface is "whatever model.ts happens to call", and 34 web tests seed learner state with `model.store.put*` because there is no narrower way in.

## Decision

1. A `CaptureService` (`packages/review/src/capture.ts`) is the only module that creates or removes `SavedItem`, `SavedOccurrence` and `ReviewCard` rows from the app. Interface: `capture`, `canUndo`, `undo`, `cardsFor`, `archiveCards`, `reactivate`, `setMeaning` (full signatures in the plan §2.2).
2. The invariants live inside it: item/occurrence dedupe (delegated to `SavedOccurrenceService`), approved-transcript gate, one recognition card per item including the "archived counts" rule, undo preconditions, archive-not-delete.
3. `model.ts` keeps its exported function names as thin delegates (UI inputs in, UI side effects + persistence out). Views and tests do not change for the move.
4. Three legacy save helpers with zero app callers become wrappers over `capture` (D-B2) so there is no card-less save path left.
5. Three grep rules (plan §2.2) make the decision checkable: `createCard`, `saveSelection` and `remove*` have exactly one app caller — `capture.ts`.

## Alternatives considered

- **Enforce uniqueness inside `ReviewService.createCard`.** Rejected alone: the rule spans two aggregates (item ↔ card) and undo spans three; a check in one service leaves undo and archive scattered. Could be added later as defence in depth.
- **New `packages/learner` package.** Rejected for now: lockfile/`npm install` not in scope; `@lingotorte/review` already depends on both inputs.
- **Delete the three legacy helpers.** Rejected: 24 test files / 75 call sites for no product gain. Wrapping them gives the same invariant with a 3-assertion test diff.
- **Also narrow `LocalStore` and stop views reading `model.store` (review candidate 4).** Deferred: larger blast radius (11 files, 34 tests); this ADR makes it cheap by concentrating the write surface first.

## Consequences

- Locality: future capture/undo/card issues change one file plus its one test.
- Tests can seed learner state through `CaptureService.capture` on an isolated `LocalStore` instead of `store.put*`; migrating the 34 existing tests is a follow-on, not part of this ADR.
- `archivedAt` remains unwritten; recorded as a follow-on on `lt-2se`.
- Not changed: SQLite schema, snapshot shape, export manifest, wire contract, `DECISIONS.md`.

## Outcome

_Filled in by `lt-2se.6`: merge hashes for `lt-2se.4`/`lt-2se.5`, grep-rule results, Docker vitest counts._
