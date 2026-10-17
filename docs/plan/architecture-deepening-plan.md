# Architecture deepening plan — subtitle parser seam, then Capture module

Status: plan of record for Beads epic `lt-2se` (children `lt-2se.1` … `lt-2se.6`). Written by Code Architect on 2026-10-17 against `main` `0bcf2e0`. Approved by Janusz in chat the same day: Lane A (parser seam) first, Lane B (Capture) only after Lane A closes.

This document is written for an implementing agent that has **not** seen the review. Every step names the files, the exact commands, what "done" looks like and when to stop and report instead of guessing. Read it top to bottom once before starting the first child.

Related: `docs/architecture/adr-0001-subtitle-parser-seam.md`, `docs/architecture/adr-0002-capture-module.md`, `BEADS.md`, `GIT-POLICY.md`, `DECISIONS.md`, `docs/architecture/data-model-and-storage.md`.

---

## 0. Ground rules for the implementer

1. **Scope.** This is a refactor. Product behaviour must not change except at the two decision points marked **D-A2** and **D-B2** below, which are already decided here. If a step seems to require a change to the SQLite schema, the snapshot JSON shape, the learner export manifest, any `/api/*` wire contract, or `DECISIONS.md`: **stop, comment on the Beads issue, and wait.**
2. **One child = one branch = one atomic merge.** Branch `work/<issue-id>-<slug>` from current `main`. Commit in small verified steps (GIT-POLICY.md). Request an independent review (spec + quality) before merging `--no-ff` into `main`, as `lt-5lb.5` did. Record the merge hash on the issue.
3. **Beads.** Claim the child (`bd --sandbox update <id> --status in_progress --assignee <actor>`), read it back, work, append evidence comments with exact commands and results, and leave closure to the parent/operator. Children are sequential by dependency; `bd --sandbox ready --exclude-type epic` shows exactly one `lt-2se.*` child at a time.
4. **Verification commands** (run from repo root, host):
   - `npm run typecheck` — must report **0 errors outside `apps/web/e2e/`** (8 pre-existing `TS7006` errors in `apps/web/e2e/support.ts` are baseline; do not fix them here).
   - `npx vitest run` — baseline on `0bcf2e0`: **118 files / 1,904 passed / 1 skipped**. Three tests time out at 5 s under full-suite load on this host (`tests/core/requestRuntime.test.ts` "rejects every transport class…", `tests/workflows/catalog.test.ts` "detects drift…" and "extracts labels…"); all three pass when run in isolation (`npx vitest run tests/core/requestRuntime.test.ts tests/workflows/catalog.test.ts` → 19 passed). Treat that as the known baseline; do **not** raise timeouts or skip them. Any *other* failure is yours.
   - `npm run test:no-network`, `npm run build`, `npm run scan:privacy` — all must stay green.
   - Docker (gate issues only): `docker build --target contributor -t lingotorte:verify .` then `docker run --rm --init --network none lingotorte:verify node node_modules/vitest/vitest.mjs run` (see `docs/dev/docker-runbook.md`).
5. **Do not widen.** No drive-by renames, formatting, or "while I'm here" fixes in files you touch. If you notice something, comment on the issue.
6. **Vocabulary.** *Module* = interface + implementation. *Seam* = where an interface lives. *Adapter* = a thing that satisfies an interface at a seam. The goal of both lanes is a **deep module**: more behaviour behind a smaller interface, with the invariants inside.

---

## 1. Lane A — move the subtitle parser seam off `node:fs`

### 1.1 The problem, precisely

| Fact | Evidence |
| --- | --- |
| `packages/subtitles/src/import.ts` parsers take a file **path**, read it and hash it | `import.ts:259-267, 354-362, 413-421` call `readLocalSubtitle(path)` |
| `readLocalSubtitle`/`sha256Text` come from `@lingotorte/storage`, which imports `node:fs`/`node:crypto` | `packages/storage/src/mediaHelpers.ts:1-3, 22-26, 67-71` |
| Therefore the browser cannot import `@lingotorte/subtitles`; `model.ts` carries a second parser | `apps/web/src/model.ts:820-1165` (`parseBrowserSrtText`, `parseBrowserAssTextBody`, helpers) |
| The copy has already drifted | VTT header: node throws without `WEBVTT` (`import.ts:403-405`), browser tolerates (`model.ts:1090, 1109-1111`); browser lacks `transcriptStatus`/`transcriptSourceKind`/`provenance` overrides (`import.ts:257` vs `model.ts:1080-1088`) |
| UI copy regex-matches parser **error strings** | `model.ts:1369-1375` `plainSubtitleFailureReason` |
| Nothing outside `model.ts` uses the browser copy | `rg "parseBrowserSrtText|parseBrowserAssTextBody|validateBrowserCueOrdering|normalizeBrowserCueText" apps tests --glob '!apps/web/src/model.ts'` → 0 |

### 1.2 Target design

```
packages/subtitles/src/
  parse.ts        NEW  runtime-agnostic parser core. Imports ONLY types from @lingotorte/domain.
  import.ts       KEPT Node adapter: read file → parse.ts → hash with node:crypto → makeSubtitleTrack/makeCue.
                       Public exports (importSubtitle, parseSrt, parseVtt, parseAss, importTranscriptJson,
                       ParsedSubtitle, ImportSubtitleInput, SubtitleOverrideOptions) keep their names and signatures.
apps/web/src/model.ts  browser adapter: File.text() → parse.ts → hash with sha256BrowserText → makeCue.
                       Browser parser copy deleted.
```

`parse.ts` interface (this is the whole thing the browser and Node need to know):

```ts
import type { SubtitleFormat } from '@lingotorte/domain';

export type ParsedSubtitleFormat = Exclude<SubtitleFormat, 'json'>;           // 'srt' | 'vtt' | 'ass'

export type SubtitleCueDraft = Readonly<{
  cueIndex: number; startMs: number; endMs: number; text: string; normalizedText: string;
}>;

export type SubtitleParseErrorCode =
  | 'missing-cue-id' | 'invalid-timing' | 'empty-text' | 'overlap'
  | 'missing-header' | 'no-sections' | 'no-events' | 'no-dialogue' | 'unsupported-format';

export class SubtitleParseError extends TypeError {
  constructor(
    readonly code: SubtitleParseErrorCode,
    readonly format: ParsedSubtitleFormat,
    /** 1-based block / cue number the learner can look for; null when the whole file is at fault. */
    readonly blockIndex: number | null,
    message: string,
  );
}

/** Pure, synchronous. Normalises line endings and cue text, validates timing, text and ordering. */
export function parseSubtitleText(text: string, format: ParsedSubtitleFormat): SubtitleCueDraft[];

/** `.srt`/`.vtt`/`.ass`/`.ssa` by extension; a `WEBVTT` first line also means 'vtt'. Throws SubtitleParseError('unsupported-format'). */
export function inferParsedSubtitleFormat(fileName: string, text?: string): ParsedSubtitleFormat;

/** Re-exported from @lingotorte/domain (moved there from storage/mediaHelpers; storage re-exports it too). Collapses CR/LF and whitespace runs to single spaces and trims. */
export { normalizeCueText } from '@lingotorte/domain';
```

Rules for `parse.ts`:
- **No imports** other than from `@lingotorte/domain` (types, plus the relocated `normalizeCueText`). A vitest test asserts the file source contains no `node:` and no `@lingotorte/storage` import (see A1 step 6).
- Error **message strings must stay byte-identical** to the current Node parser's messages (`import.ts:190-246, 316-350, 403-405`) because tests match them: `tests/core/b7SubtitleRobustness.test.ts:70,77` (`/end time must be after start time/`, `/no Dialogue lines/`) and `tests/core/coreBackend.test.ts:64` (`/SRT/`). The typed `code` is additive.
- `cueIndex` semantics stay as today: SRT uses the numeric id from the block (throws `missing-cue-id` if absent); VTT uses the numeric id if present, else the 0-based block index; ASS uses the Dialogue ordinal.

**D-A2 (decided): VTT `WEBVTT` header is optional.** The parser accepts a missing header for `format === 'vtt'` and strips it when present. Rationale: the browser has shipped tolerant behaviour to the learner; no test asserts the Node throw (`rg "must start with WEBVTT" tests` → 0); strictness buys nothing here. The ADR records this as the resolved drift. If you find a test that asserts the throw, stop and report rather than deleting the assertion.

### 1.3 Child A1 — `lt-2se.1` Extract the runtime-agnostic parser core; Node adapter keeps its interface

Branch: `work/lt-2se.1-subtitle-parse-core`.

Steps:
1. Create `packages/subtitles/src/parse.ts` with the interface above. Move the implementation from `import.ts`: timestamp patterns (`:41-43`), `parse*Timestamp` (`:45-94`), ASS helpers (`:96-207`), `validateCueOrdering` (`:209-219`, now operating on drafts and throwing `overlap`), `parseSrtBlock` (`:221-255`), `parseVttBlock` (`:316-352`), `splitSrtBlocks`/`splitVttBlocks` (`:307-314, 401-411`). Relocate `normalizeCueText` (`packages/storage/src/mediaHelpers.ts:59-65`): move the function body to `packages/domain/src/guards.ts` (domain's `index.ts` already does `export * from './guards.ts'`; the browser already imports `@lingotorte/domain` values, and `fixtures.ts` — the only Node-importing file in domain — is not exported from the index, so this is safe). Then `mediaHelpers.ts` re-exports it (`export { normalizeCueText } from '@lingotorte/domain'`) so `packages/language/src/adapters.ts` and `tests/core/coreBackend.test.ts` keep compiling, and `parse.ts` imports it from `@lingotorte/domain`. **Storage must not import subtitles** (that would be a package cycle). Record the relocation in the issue.
2. Every `throw new TypeError(...)` in moved code becomes `throw new SubtitleParseError(code, format, blockIndex, <same message>)`. `SubtitleParseError extends TypeError`, so existing `rejects.toThrow(TypeError)` style assertions still hold.
3. Rewrite `import.ts` so `parseSrt`/`parseVtt`/`parseAss` each do: `readLocalSubtitle(path)` → `parseSubtitleText(text, format)` → `makeSubtitleTrack(...)` → for each draft `makeCue({... textSha256: await sha256Text(draft.text)})`. Keep their exported names, parameter order and `ParsedSubtitle` return type. `importSubtitle` and `importTranscriptJson` unchanged in behaviour.
4. Remove the now-dead private functions from `import.ts`. `import.ts` should shrink to roughly the three adapters + JSON import (~200 lines).
5. Add `tests/core/subtitleParseCore.test.ts`: for each format, one valid fixture (reuse `fixtures/subtitles/*.srt|.vtt` and the ASS fixture strings in `tests/core/b7SubtitleRobustness.test.ts:1-40`), one assertion per error code with `expect(err).toBeInstanceOf(SubtitleParseError)` and `err.code`/`err.blockIndex` checked; VTT with and without `WEBVTT` header both parse to the same drafts (D-A2).
6. In the same test file, a **seam test**: read `packages/subtitles/src/parse.ts` with `node:fs` and assert `/from ['"]node:/` and `/@lingotorte\/storage/` do not match. This is the proof the package is now importable by the browser.
7. Run `npm run typecheck`, `npx vitest run tests/core`, then the full suite. All five existing subtitle test files (`b7SubtitleRobustness`, `coreBackend`, `p4SavedOccurrences`, `p5FsrsReview`, `p6PracticeExport`) must pass **unmodified**.

Done when: steps 1–7 green; `rg "node:" packages/subtitles/src/parse.ts` → 0; `import.ts` exports unchanged (diff the `export` lines before/after and paste into the issue); evidence comment with commands and counts; independent review PASS; merged `--no-ff` to `main`.

Stop and report if: any existing test needs its expected message changed; `normalizeCueText` cannot be relocated without a package cycle you cannot resolve in one of the two ways above; `apps/local-service/src/server.ts:661` (the only service caller of `importSubtitle`) would need to change.

### 1.4 Child A2 — `lt-2se.2` Browser adapter uses the parser core; delete the `model.ts` copy; typed failure reasons

Branch: `work/lt-2se.2-browser-subtitle-adapter`. Depends on A1 merged.

Steps:
1. In `apps/web/src/model.ts`, replace the bodies of `parseBrowserSrtText` (`:1080-1165`) and `parseBrowserAssTextBody` (`:1002-1051`) with **one** private function:
   ```ts
   async function parseBrowserSubtitle(input: { mediaId; language; role; path; text; isActive?; sourceKind? }): Promise<{ track: SubtitleTrack; cues: Cue[] }>
   ```
   that calls `inferParsedSubtitleFormat(input.path, input.text)`, `parseSubtitleText(text, format)`, builds the track with `sha256BrowserText(input.text)` and cues with `sha256BrowserText(draft.text)`. Update the two callers (`tryParseBrowserSubtitle` `:1347`, `importBrowserSyntheticFixture` `:1191,1199`).
2. Delete from `model.ts`: `normalizeBrowserCueText` (`:843-849`), `srtTimestampPattern`/`assTimestampPattern` (`:851-852`), `parseBrowserAssTimestamp`, `stripBrowserAssOverrideTags`, `stripBrowserAssLineBreaks`, `parseBrowserAssText`, `BrowserAssSection`, `splitBrowserAssSections`, `parseBrowserAssDialogueLine` (`:854-930`), `parseBrowserSrtTimestamp`, `browserVttTimestampPattern`, `parseBrowserVttTimestamp` (`:1052-1078`). **Before deleting `validateBrowserCueOrdering` (`:932`, exported)** run `rg validateBrowserCueOrdering apps tests`; if `applyTrackOffsetMs` or `createOffsetCorrectedTranscriptVersion` (`:944-1000`, used by `tests/core/b7SubtitleRobustness.test.ts`) call it, keep it, and have it throw `SubtitleParseError('overlap', …)` using the same message text. Anything else that used `normalizeBrowserCueText` (there are 11 references; `putTranscriptSegments` `:2669` and `putTranscriptWordTimingsForSegments` `:2710` do) switches to the relocated `normalizeCueText`.
3. Rewrite `plainSubtitleFailureReason` (`:1369-1375`) to branch on `err instanceof SubtitleParseError` → `code`/`blockIndex`, producing the **same three strings** as today (`the timing on block N is not valid`, `block N has no text`, `it is not a valid subtitle file`). Keep the regex fallback for non-`SubtitleParseError` errors. Tests that pin these strings: `tests/web/ltddy5MalformedSubtitle.test.ts`, `tests/web/frontendUi.test.ts`, `tests/web/ltfoe34GlossUi.test.ts`.
4. Keep `sha256Bytes`/`sha256BrowserText`/`isNodeRuntime`/`hexFromBytes` (`:820-841`): they are the browser hashing adapter and are still used by transcript import.
5. Run `npm run typecheck` (0 outside e2e), `npx vitest run tests/web tests/core`, full suite, `npm run build`, `npm run scan:privacy`, `npm run test:no-network`.

Done when: `rg "parseBrowser|BrowserAss|normalizeBrowserCueText|browserVttTimestampPattern" apps/web/src` → 0; `model.ts` is ≥300 lines shorter (record `wc -l` before/after); all tests green against baseline; evidence + review PASS; merged.

Stop and report if: a test asserts a browser-specific error message that the core does not produce; `importBrowserSyntheticFixture` behaviour (fixture `sourceKind: 'synthetic'`) cannot be preserved through the adapter.

### 1.5 Child A3 — `lt-2se.3` Lane A gate: Docker verification, ADR-0001 accepted, docs

Branch: `work/lt-2se.3-lane-a-gate`. Depends on A2 merged.

1. Docker contributor image build + `--network none` full vitest (command in §0.4). Record file/test counts.
2. Set `docs/architecture/adr-0001-subtitle-parser-seam.md` status from `Proposed` to `Accepted`, fill in the "Outcome" section with merge hashes and the before/after line counts.
3. Add one row to `README.md` reading-order list for `docs/plan/architecture-deepening-plan.md` (one line; no other README edits).
4. Independent review of the merged tree for Lane A (spec: ADR-0001 satisfied; quality: no behaviour change beyond D-A2).

Done when: all recorded on the issue; merged. **This is the gate for Lane B** (`lt-2se.4` depends on it).

---

## 2. Lane B — pull Capture together

### 2.1 The problem, precisely

| Fact | Evidence |
| --- | --- |
| "One recognition card per SavedItem" is enforced only in `ensureReviewCardForSavedItem` | `model.ts:3548-3563`; `ReviewService.createCard` (`packages/review/src/reviewService.ts:39-56`) has no check; `LocalStore.putReviewCard` (`packages/storage/src/localStore.ts:246`) is a blind upsert |
| Only **one** of four save paths goes through it | `saveSelectionWithReceipt` `model.ts:3374-3431`; the other three (`saveSentenceFromCue :3433`, `saveLexemeFromCue :3461`, `saveSelectedPhraseFromCue :3491`) call `savedOccurrenceService.saveSelection` directly and create no card |
| Those three have **zero app callers**; 24 test files / 75 call sites use them | `rg "saveSentenceFromCue|saveLexemeFromCue|saveSelectedPhraseFromCue" apps --glob '!apps/web/src/model.ts'` → 0 |
| `createReviewCardForSavedItem` (`:3521`) bypasses uniqueness and also has zero app callers (25 test references) | `rg createReviewCardForSavedItem apps --glob '!apps/web/src/model.ts'` → 0 |
| Undo is the only caller of `LocalStore.remove*`, guarded by 8 conditions in the caller | `undoSave`/`canUndoSave` `model.ts:3333-3366` |
| `SavedItem.archivedAt` is read (`views/saved.ts:41`, `savedOccurrenceService.ts:67,157`) but never written by app code | `rg "archivedAt:" apps packages` → only the SQLite row reader |
| 34 web tests seed state with `model.store.put*` instead of a save path | `rg -l "model\.store\.(put|add|remove)" tests/web` → 34 |
| Documented invariants | `docs/architecture/data-model-and-storage.md:29-35` (core invariants), `:56` (occurrence immutable), `:166` (archiving does not delete), `:210` (archive/suspend rather than hard-delete) |

The capture block (`model.ts:3289-3622`) was re-opened by lt-cms, lt-uzo, lt-e0j and lt-foe.3.1 in turn (`git log -L3289,3620:apps/web/src/model.ts`): every learner-facing change lands here. Depth here pays back on every future issue.

### 2.2 Target design

One module, `CaptureService`, that is the **only** way to write `SavedItem`, `SavedOccurrence` and `ReviewCard` from the app. `model.ts` keeps its exported function names as thin delegates so views and tests are untouched in B1.

**D-B1 (decided): location is `packages/review/src/capture.ts`**, exported from `packages/review/src/index.ts`. Reason: `@lingotorte/review` already depends on `@lingotorte/domain` and imports `LocalStore` from `@lingotorte/storage` (`reviewService.ts:2`), and `CaptureService` needs both `SavedOccurrenceService` (storage) and `ReviewService` (review). Creating a new workspace package would require `npm install`/lockfile changes, which this plan does not authorise.

```ts
// packages/review/src/capture.ts
import type { LocalStore, SavedOccurrenceService, SaveSelectionInput } from '@lingotorte/storage';
import type { ReviewCard, SavedItem, SavedOccurrence, UUID } from '@lingotorte/domain';
import type { ReviewService } from './reviewService.ts';

export type CaptureInput = SaveSelectionInput;             // kind, language, displayText, meaning?, meaningSource?, notes?, mediaId, cueId, startMs, endMs, sourceContext

export type CaptureReceipt = Readonly<{
  item: SavedItem; occurrence: SavedOccurrence; card: ReviewCard;
  isNewItem: boolean; isNewOccurrence: boolean;
  /** Set only when this capture created the card. */
  createdCardId: UUID | null;
  /** Capture-time state that undo re-checks before mutating anything. */
  baseline: Readonly<{ itemUpdatedAt: string; itemJson: string; occurrenceCount: number }>;
}>;

/** Card ids the UI is currently showing; undo refuses to touch them. */
export type UndoGuard = Readonly<{ activeCardIds: readonly (UUID | null)[] }>;

export class CaptureService {
  constructor(store: LocalStore, saved: SavedOccurrenceService, review: ReviewService, clock: () => Date);

  /** Save (dedupe item + occurrence, require approved transcript) and ensure exactly one recognition card for the item. */
  capture(input: CaptureInput): CaptureReceipt;

  /** True iff everything `capture` created is still untouched (see current canUndoSave rules). Mutates nothing. */
  canUndo(receipt: CaptureReceipt, guard: UndoGuard): boolean;
  /** Removes exactly what the capture created; returns false (and mutates nothing) when canUndo is false. */
  undo(receipt: CaptureReceipt, guard: UndoGuard): boolean;

  cardsFor(itemId: UUID): { active: ReviewCard[]; archived: ReviewCard[] };
  /** Suspend the item's active cards (card, state, events kept). Returns the suspended card ids. */
  archiveCards(itemId: UUID): UUID[];
  /** Un-suspend the most recently archived card, else create one from the earliest occurrence. */
  reactivate(item: SavedItem): ReviewCard | null;
  /** Learner-sourced meaning edit; unchanged re-save keeps provenance; allowClear removes meaning + source. */
  setMeaning(itemId: UUID, meaning: string, options?: { allowClear?: boolean }): SavedItem | null;
}
```

What moves **verbatim** from `model.ts` into the class (keep comments, keep logic; only replace `model.store` → `this.store`, `model.clock()` → `this.clock()`, `model.reviewService` → `this.review`):

| `model.ts` today | becomes |
| --- | --- |
| `SaveReceipt` minus `selection/meaning/notes` (`:3307-3318`) | `CaptureReceipt` |
| `saveSelectionWithReceipt` lines after `sourceContext` is built (`:3412-3431`) | `capture()` |
| `canUndoSave` (`:3346-3366`) | `canUndo()` — the three UI card ids become `guard.activeCardIds` |
| `undoSave` (`:3333-3344`) minus the persist call | `undo()` |
| `reviewCardsForSavedItem` (`:3538-3541`) | `cardsFor()` |
| `ensureReviewCardForSavedItem` (`:3548-3563`) | private `ensureCard()` used by `capture()` and `reactivate()` |
| `archiveReviewCardsForSavedItem` (`:3566-3573`) minus the `model.review.activeCardId` reset and persist | `archiveCards()` (returns ids so `model.ts` can do the UI reset) |
| `addSavedItemToReview` (`:3576-3592`) minus persist | `reactivate()` |
| `setSavedItemMeaning` (`:3609-3622`) minus persist | `setMeaning()` |

What **stays** in `model.ts` (UI concerns): building `sourceContext` from `model.selection`/`model.currentMedia` (`:3375-3410`), `selectionTimeRangeForCue` (`:3289`), the `SaveReceipt` type (now `CaptureReceipt & { selection; meaning; notes }`), `meaningSourceForPending` (`:3369`), the `model.review.activeCardId` reset, every `persistIfLocalServiceAutosaveEnabled(model)` call, and `addSavedItemsToReview` (batch loop + one persist).

`AppModel` (`apps/web/src/uiTypes.ts:72-80`) gains `capture: import('@lingotorte/review').CaptureService;` and `createAppModel` (`model.ts:81-93`) constructs it after the services it wraps.

Invariant rules that become **checkable by grep** after Lane B:

| Rule | Check (must hold after B2) |
| --- | --- |
| Only Capture creates cards from the app | `rg "reviewService\.createCard|review\.createCard" apps packages --glob '!packages/review/src/capture.ts' --glob '!**/*.test.ts'` → 0 |
| Only Capture saves selections | `rg "savedOccurrenceService\.saveSelection|saved\.saveSelection" apps packages --glob '!packages/review/src/capture.ts'` → 0 |
| Only Capture hard-deletes learner rows | `rg "\.remove(SavedItem|SavedOccurrence|ReviewCard|ReviewCardState)\(" apps packages --glob '!packages/review/src/capture.ts' --glob '!packages/storage/src/localStore.ts'` → 0 |

### 2.3 Child B1 — `lt-2se.4` Create `CaptureService`; `model.ts` functions become thin delegates

Branch: `work/lt-2se.4-capture-service`. Depends on `lt-2se.3`.

Steps:
1. Create `packages/review/src/capture.ts` per §2.2; export from `packages/review/src/index.ts`.
2. Add `capture` to `AppModel` and `createAppModel`.
3. Rewrite each `model.ts` function in the table above as a delegate: build UI inputs → call `model.capture.*` → UI side effects → `persistIfLocalServiceAutosaveEnabled(model)`. **Exported names and signatures in `model.ts` do not change in B1**, so `views/player/transcript.ts:576`, `ui/capture.ts:48`, `views/saved.ts:155-231` and all tests compile untouched.
4. Add `tests/core/captureService.test.ts` driving `CaptureService` directly on an isolated `LocalStore` with an approved synthetic track (seed via `importSubtitle` from `packages/subtitles`, not `store.put*`): (a) capture creates item + occurrence + exactly one `recognition` card; (b) second capture of the same text in another cue adds an occurrence, **no** second card; (c) capture after `archiveCards` does not resurrect the card (lt-uzo rule); (d) `undo` removes exactly what was created and returns `true`; (e) `undo` returns `false` and changes nothing after `setMeaning`, after a review event on the card, and when `guard.activeCardIds` contains the card; (f) capture from a `draft` track throws (approved-transcript gate, message `/approved transcript/i`); (g) `setMeaning` unchanged re-save keeps `meaningSource`; `allowClear` removes both.
5. Full verification set (§0.4). Specifically re-run `tests/web/ltE0jSaveToast.test.ts`, `tests/web/ltcmsUnifiedCapture.test.ts`, `tests/web/ltfoe31MeaningEdit.test.ts`, `tests/web/lt3biLearningLoop.test.ts`, `tests/web/p4SavedOccurrences.test.ts` individually first — they pin the behaviour you are moving.

Done when: §2.2 grep rule 1 and 2 hold **except** for the three legacy save helpers and `createReviewCardForSavedItem` (B2's job — list their remaining hits in the issue); all tests green against baseline without modifying any test except adding the new file; `model.ts` capture block is ≤120 lines of delegates (record before/after `wc -l`); review PASS; merged.

Stop and report if: moving `canUndoSave` requires knowledge of `model.practice`/`model.review` beyond the three card ids (it should not — check `:3363`); a web test fails because it relied on `undoSave` mutating before checking (there is none known); the `@lingotorte/review` ↔ `@lingotorte/storage` import creates a runtime cycle that Vite or vitest reports (today `practiceService.ts:1` already imports review from storage, so this is expected to be fine — but verify `npm run build`).

### 2.4 Child B2 — `lt-2se.5` Route the legacy save helpers and `createReviewCardForSavedItem` through Capture

Branch: `work/lt-2se.5-capture-legacy-paths`. Depends on `lt-2se.4`.

**D-B2 (decided): the three legacy helpers stay as named exports but become thin wrappers over `model.capture.capture(...)`, so they now create the one recognition card.** They have zero app callers; this is a test-fixture behaviour change, not a product change. Deleting them instead would touch 24 test files / 75 call sites for no product gain — not authorised here.

Steps:
1. Rewrite `saveSentenceFromCue`, `saveLexemeFromCue`, `saveSelectedPhraseFromCue` (`model.ts:3433-3519`) to build `sourceContext` exactly as today, then `return model.capture.capture({...}).item` + persist. They lose their direct `savedOccurrenceService.saveSelection` call.
2. Inventory first, change second: `rg -n "createReviewCardForSavedItem" tests` (25 refs). Classify each as (i) creates a `recognition` card for an item that has none — route through `capture`'s idempotent ensure (add a `CaptureService.ensureCard(item, occurrence)` public method only if needed); (ii) creates a `production` card or a deliberate **second** card — these tests pin behaviour the invariant forbids; **list them in the issue and stop for a decision** before changing them. Paste the classification table as an evidence comment.
3. Three tests assert **zero** cards right after a legacy save and will now see one: `tests/web/frontendUi.test.ts`, `tests/web/lt3biLearningLoop.test.ts`, `tests/web/p4SavedOccurrences.test.ts` (each has one `toHaveLength(0)`/`toBe(0)` on `reviewCards`; confirm with `rg -n "reviewCards" <file>`). Update **only** those assertions to the new count, each with a one-line comment `// lt-2se.5: legacy save helpers now capture (one recognition card per item)`. Any other test that changes expectation → stop and report.
4. Grep rules 1 and 2 from §2.2 must now hold with no exceptions. Full verification set.

Done when: grep rules hold; test diff is limited to the assertions listed in step 3 (paste `git diff --stat tests/` into the issue); review PASS; merged.

Stop and report if: step 2 class (ii) is non-empty (expected: possible — report, do not guess); any test outside the three named ones needs a changed expectation.

### 2.5 Child B3 — `lt-2se.6` Lane B gate: Docker verification, ADR-0002 accepted, invariant table in the data-model doc

Branch: `work/lt-2se.6-lane-b-gate`. Depends on `lt-2se.5`.

1. Docker build + `--network none` full vitest; record counts.
2. `docs/architecture/adr-0002-capture-module.md` → `Accepted`, Outcome filled in.
3. Add a short table to `docs/architecture/data-model-and-storage.md` under "Core invariants" mapping each invariant to the module that enforces it today (`CaptureService` / `SavedOccurrenceService.requireApprovedTranscript` / `LocalStore.addReviewEvent` / `SqliteLocalPersistence.saveSnapshot`) with `path:line`. Do not rewrite the rest of the doc.
4. Independent review of the Lane B merged tree. Note for the reviewer: `archivedAt` is still never written by app code — this plan does **not** change that; it is a candidate for a follow-on issue, record it as a comment on `lt-2se`.

Done when: recorded; merged; epic acceptance criteria re-checked by the operator.

---

## 3. What this plan deliberately does not do

- Does not narrow `LocalStore`'s public interface or stop views reading `model.store` (review candidate 4). B1/B2 make that cheap later; a follow-on epic can take it.
- Does not touch the local-service job client / wire contract (candidate 2) or relocate the session owner (candidate 5).
- Does not add a `GLOSSARY.md`; domain terms stay in `docs/architecture/data-model-and-storage.md`.
- Does not write `SavedItem.archivedAt` anywhere.

## 4. Decision log for this plan

| ID | Decision | Alternative rejected | Why |
| --- | --- | --- | --- |
| D-A1 | Parser core lives in `packages/subtitles/src/parse.ts`; `normalizeCueText` moves to `@lingotorte/domain` (storage re-exports) | New `packages/subtitle-core` package; or `parse.ts` keeping its own copy of `normalizeCueText` | New package = lockfile/`npm install`, not authorised; a second copy is the smell being removed |
| D-A2 | VTT header optional | Strict header (Node today) | Browser already shipped tolerant; no test pins the throw |
| D-B1 | `CaptureService` in `packages/review` | New `packages/learner`; or inside `apps/web` | Same lockfile reason; `apps/web` would make it unreachable from the service later |
| D-B2 | Legacy save helpers become wrappers that capture (and so create a card) | Delete them and migrate 75 test call sites | Zero app callers; a 24-file test churn buys nothing |
| D-B3 | Lane B waits for Lane A gate | Run lanes in parallel | Janusz chose sequential so one weaker agent sees one ready child at a time |
