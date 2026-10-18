# ADR-0002 — Capture is one module that owns SavedItem, SavedOccurrence and ReviewCard writes

Status: **Accepted** (`lt-2se.6`; implementation and verification evidence below)
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
4. The three legacy save helpers and `createReviewCardForSavedItem`, all with zero app callers, are deleted (D-B2); tests migrate to a tests-only helper that drives the real product path (`saveSelectionWithReceipt`). No card-less save path is left in production code.
5. Three grep rules (plan §2.2) make the decision checkable: `createCard`, `saveSelection` and `remove*` have exactly one app caller — `capture.ts`.

## Alternatives considered

- **Enforce uniqueness inside `ReviewService.createCard`.** Rejected alone: the rule spans two aggregates (item ↔ card) and undo spans three; a check in one service leaves undo and archive scattered. Could be added later as defence in depth.
- **New `packages/learner` package.** Rejected for now: lockfile/`npm install` not in scope; `@lingotorte/review` already depends on both inputs.
- **Keep the three legacy helpers as wrappers over `capture`.** Rejected by Janusz: it leaves a second production write path alive solely for tests. Deleting costs a mechanical rename + `await` across 24 test files, with one-for-one parameter order via `tests/helpers/capture.ts`.
- **Also narrow `LocalStore` and stop views reading `model.store` (review candidate 4).** Deferred: larger blast radius (11 files, 34 tests); this ADR makes it cheap by concentrating the write surface first.

## Consequences

- Locality: future capture/undo/card issues change one file plus its one test.
- Tests can seed learner state through `CaptureService.capture` on an isolated `LocalStore` instead of `store.put*`; migrating the 34 existing tests is a follow-on, not part of this ADR.
- `archivedAt` remains unwritten; recorded as a follow-on on `lt-2se`.
- Not changed: SQLite schema, snapshot shape, export manifest, wire contract, `DECISIONS.md`.

## Outcome

### Implemented Lane B

- `lt-2se.4` merged as `396a774834ab9242e5afee759157b71e24f69a0b` (implementation tip `646f5998cfda7a1c9c8b077bdce0611b3457f142`); `lt-2se.5` merged as `f50471403d3f8170b78f04d484c64bac7ed80bc2` (implementation tip `3d5cb52f6459b2241ceb32880c79895d9396efd4`). Gate source base: `7133e150d62204a68bb558dd7984ba414ac9a233` (main after the `lt-41v` test-clock fix; the Capture/storage sources named here are byte-identical to the first gate attempt's base `31fe86114ddf97452c0ed0bda24683bceee48d9e`).
- Capture now owns the product save/card/undo path. Current implementation anchors: `packages/review/src/capture.ts:38-45` (capture), `:57-88` (guarded undo), `:103-117` (card uniqueness), `:120-144` (suspend/reactivate), `:148-159` (meaning provenance).
- Reconciliation with the original interface: `ensureCard` is public solely for the unchanged `ensureReviewCardForSavedItem(model, item, occurrence)` delegate; it honors the supplied occurrence without adding save semantics. This independently reviewed implementation exception is documented in plan §2.2. Lower-level storage/review APIs remain public; this is product-path ownership, not a storage-wide uniqueness constraint.
- The four legacy helpers are deleted. Tests use the product save path through `tests/helpers/capture.ts`; no schema, snapshot, export manifest, wire contract, workspace/lockfile or `DECISIONS.md` change is part of this gate.

### Structural checks on the gate source base

Python `re.search` over source lines was used because `rg` is not installed, applying the exact plan §2.2 expressions and exclusions under `apps/` and `packages/` (excluding generated `dist/` and dependencies):

| Expression | Exclusions | Matches outside Capture | Matches inside `capture.ts` |
| --- | --- | ---: | --- |
| `reviewService\.createCard\|review\.createCard` | `capture.ts`, `**/*.test.ts` | 0 | 1 (`:108`) |
| `savedOccurrenceService\.saveSelection\|saved\.saveSelection` | `capture.ts` | 0 | 1 (`:39`) |
| `\.remove(SavedItem\|SavedOccurrence\|ReviewCard\|ReviewCardState)\(` | `capture.ts`, `packages/storage/src/localStore.ts` | 0 | 4 (`:61-65`) |

The escaped pipes in the Markdown table display regex alternation; the executed expressions use unescaped alternation, as in the plan. These lexical checks establish the named call sites, not enforcement against every possible future alias or direct store write.

### Fresh Docker contributor verification

Built from the gate source base with `docker build --target contributor -t lingotorte:verify-lt-2se6b .`; image ID: `sha256:5f93575d62dd4ecc197f6afa540d06e7bb82054687197f3a0f6f6864243a0761`.

Each following check ran in its own foreground `docker run --rm --init --network none lingotorte:verify-lt-2se6b <command>`, with no mounts, provider credentials or learner-state volumes. Providers retain the image's disabled default. The image build installs dependencies; `--network none` applies to verification runs, not the build.

| Command | Actual result | Scratch log basename |
| --- | --- | --- |
| `node node_modules/vitest/vitest.mjs run` | Exit 0; 123 files passed, 1 file skipped (124 total); 1,971 tests passed, 1 skipped (1,972 total) | `g-vitest.log` |
| `node node_modules/typescript/bin/tsc --noEmit` | Exit 0; no diagnostics | `g-tsc.log` |
| `node node_modules/vite/bin/vite.js build --config vite.config.ts` | Exit 0; 63 modules transformed | `g-vite.log` |
| `node scripts/check-privacy-boundaries.mjs` | Exit 0; `ok: true`, 112 files scanned | `g-privacy.log` |
| `node node_modules/vitest/vitest.mjs run tests/no-network` | Exit 0; 3 files / 6 tests passed | `g-nonet.log` |

Logs are local diagnostic artifacts under the Hermes scratch directory (`$TMPDIR` when configured to that directory), not repository files. Each check ran once on this base. The first gate attempt (base `31fe861`, image `sha256:4f3e734d…5cee5`) recorded 1,949 passed / 1 failed / 1 skipped: `tests/web/ltdlf4ReviewKeys.test.ts` intermittently saw an empty review queue. `lt-41v` traced that to two test files rendering review/practice on the live wall clock (a backward clock step after capture leaves no due card), reproduced both historical symptoms with an injected 1 ms backstep, and pinned the clock in those tests; no product code or assertion changed. The historical trigger in that container run is not proven; the mechanism is. The privacy scanner checks its defined runtime markers, not all secrets or egress; no-network tests cover their exercised flows, while Docker additionally disables networking for these runs.

The contributor Dockerfile copies runtime sources, tests and workflow documentation, not these architecture documents. Therefore this image qualifies the unchanged runtime/test bytes at the named base; it does not claim to embed the final Markdown. The gate diff is restricted to this ADR and the invariant table in `data-model-and-storage.md`.

### Limits and operator handoff

`SavedItem.archivedAt` remains unwritten by app code; card suspension is implemented, item archiving is not. Occurrence immutability is a product-path rule with a narrowly guarded undo exception, not a blanket ban on low-level upserts or explicit restore. Review/practice history enforcement lives in storage, not Capture. Broader planning invariants and their current limits are mapped in the data-model table. The item-archiving follow-on is recorded on `lt-2se`.
