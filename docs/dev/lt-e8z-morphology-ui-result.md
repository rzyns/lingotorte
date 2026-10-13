# lt-e8z: morphology in learner token interaction (result)

Base revision: `main` 8d82a99 (merge of lt-elf). Branch `work/lt-e8z-morphology-ui`, uncommitted.

## What changed

- `apps/web/src/morphologyPanel.ts` (new): analysis orchestration, state, and the result region.
- `apps/web/src/app.ts`: an **Analyse words** button on each transcript cue, and the word-analysis region at the top of the Selection panel.
- `tests/web/lte8zMorphologyUi.test.ts` (new): 15 tests.
- No change to the service, the client, the browser heuristic, or any provider. No dictionary, translation, LLM or network call was added.

## Interaction

- Each cue row has a native `<button>` **Analyse words**, so Enter and Space work. It stops keydown propagation, so the cue row's Enter/Space seek handler does not fire. The existing subtitle-word buttons still save to My Vocab and are unchanged. Analysis is a separate, explicit action, which keeps the save behaviour stable.
- The cue is tokenized with the existing whitespace tokenizer. Only `word` and `number` tokens of at most 64 code points without whitespace are sent, in chunks of at most 64. Punctuation and symbols are never requested and are shown as non-interactive "punctuation, not analysed".
- Each word in the result region is a `<button aria-pressed aria-controls="morphology-detail">`. Activating one moves focus to the detail region (`role=region`, `tabindex=-1`).
- **Cache:** results are cached per cue (keyed by cue id, cue text and paired origin), and only service results are cached. A change of `currentMedia.id` or `targetTrackId` clears the cache and bumps the generation.
- **Stale guard:** each request takes a generation number. A response renders only if the generation and the media/track context are unchanged.

## UI state table

| State | Trigger | Source label | Status line (`role=status`, `aria-live=polite`) | Detail |
|---|---|---|---|---|
| Idle | nothing analysed | – | "Choose “Analyse words” on a cue…" | – |
| Pending | request in flight | – | "Analysing words…" | – |
| Service, certain/probable | `available`, not ambiguous/unknown | Local morphology (Morfeusz) | "Analysed on this computer with local morphology." | Base form, part of speech, grammar in words; Quality "Certain" / "Likely reading (single dictionary reading)" |
| Service, possible | `confidence.kind=possible`, not flagged | same | same | Quality "Low confidence, check" |
| Service, ambiguous | `ambiguous:true` | same | same | "Several readings, check", "Base form (first reading)", note that the first reading ignores context, list of alternatives (each focusable); token button shows "(?)" and its aria-label says "several readings" |
| Service, unknown | `unknown:true` | same | same | "Not in local dictionary"; base form and part of speech "not known"; token shows "(unknown)" |
| Not paired | no transport, or 401 | Browser estimate (lower quality, small built-in word list) | "Local morphology unavailable (local service not paired), showing browser estimate." | "Browser estimate, lower quality" or "No browser estimate for this word" |
| Unreachable | fetch rejects, or 404 from an older service | Browser estimate | "…(local service not reachable), showing browser estimate." | same |
| Disabled | `unavailable/disabled` | Browser estimate | "Local morphology is turned off in the local service, showing browser estimate." | same |
| Load failed | `unavailable/adapter-load-failed` | Browser estimate | "…(dictionary did not load)…" | same |
| Unsupported language | `unavailable/unsupported-language` | Browser estimate | "…does not support this language…" | same |
| Error | `error/analysis-failed\|internal` | Browser estimate | "Local morphology hit an error, showing browser estimate." | same |
| Rejected | other non-2xx | Browser estimate | "…request was refused…" | same |
| Invalid response | parser rejects the response | Browser estimate | "…returned an unexpected answer…" | same |
| Invalid request | client bound check | Browser estimate | "This cue could not be sent…" | same |
| No words | cue has only punctuation | as resolved | status stays visible | "No word selected." |
| Unexpected exception | tokenizer or heuristic throws | – | "Word analysis could not run for this cue…" | – |

These hold in every state:

- The text "Word meanings and translations are not available: no dictionary or translation provider is configured. This shows grammar only." is always shown.
- The heading is "Word analysis (grammar only)".
- No percentage or `confidence.value` is ever shown. Quality is derived only from `unknown`, then `ambiguous`, then `confidence.kind`.
- Lemmas are shown as returned (lowercase, since the service collapses proper-name case). No PROPN label appears.

## Tests mapped to acceptance

| Acceptance | Tests (`tests/web/lte8zMorphologyUi.test.ts`) |
|---|---|
| Polish quality fixtures | Real in-process service: kotem → kot/NOUN; Mamy ambiguous with mieć+mama and visible alternatives; Książki → książka; się/nie → PART, not flagged; zażółć → zażółcić/VERB, "mood: imperative"; xqzvbrt → "Not in local dictionary"; `,` and `!` not requested and shown as punctuation; no PROPN; no percentage |
| Disconnected/error/no-result | 8 fake-fetch rows (unreachable, disabled, adapter-load-failed, analysis-failed, 500 rejected, invalid-response, 404, 401), plus real service `mode:'disabled'`, plus a punctuation-only cue |
| Stale responses | Cue A, then cue B: only B renders; a track change mid-flight renders nothing |
| Cache | Repeat analysis makes no fetch; a track change invalidates |
| Keyboard-accessible UI | Native buttons; keydown on Analyse does not seek; focus moves to the detail region; alternatives have `tabIndex=0`; status is `aria-live=polite`; `aria-pressed` on the selected token |
| Zero-network provider-off | Not paired, inside `withNoNetwork`: 0 attempts, `onlineProvidersEnabled=false`. Paired: a fetch spy shows exactly one call, to `${loopback origin}/api/language/morphology` |
| No dictionary/LLM added | Diff contains no new adapter or network path; privacy scan passes |
| Meanings unavailable text | Asserted in the service, not-paired and fixture-import tests |

## Commands and counts

Image `lingotorte:lt-e8z` (contributor target). Command: `docker run --rm --init --network none lingotorte:lt-e8z …`

Image digest: `sha256:bd83f4441dd40aec5819930602d1faa7037ac27631abf5e2a5fda6411f2756e4`

| Command | Result | Exit |
|---|---|---|
| `npx vitest run tests/web/lte8zMorphologyUi.test.ts` | 15/15 passed | 0 |
| `npx vitest run` (full), run 1 | 68 files passed, 1 skipped; 1394 tests passed, 1 skipped | 0 |
| `npx vitest run` (full), run 2 | 1393 passed, **1 failed** (`legacyMigrationQualification` "reopening twice…", 5834 ms timeout) | 1 |
| `npx vitest run` (full), run 3 | 1392 passed, **2 failed** (`legacyMigrationQualification` "v7 mixed snapshot…", `practiceSqliteMigration` "migrates independently frozen v7…", about 5.5 s timeouts) | 1 |
| Those two files rerun in isolation | 33/33 passed | 0 |
| `npx tsc --noEmit` | clean | 0 |
| `npm run build` | built | 0 |
| `npm run scan:privacy` | `ok:true`, 66 files | 0 |

The run 2 and 3 failures are SQLite migration tests that hit the default 5 s timeout under full-suite load. They do not import any file this change touches. They were not checked against base main in this task, so whether base main shows the same flakiness is unconfirmed; flagged as an open item.

## Limitations and follow-ups

- **Analysis is per cue.** Clicking a subtitle word still saves it to My Vocab, as before; it does not open the analysis. A single combined "analyse this word" gesture on the word itself needs a UX decision, because it would change the save-on-click behaviour.
- The panel is rendered in the Selection card of the Player view only. It is not wired into My Vocab or Review.
- Persisting the learner's choice of reading is out of scope. SavedItem has no typed reading field; this is a follow-up.
- `/api/status` `language.morphology.state` is not used to gate the request. The per-request result is authoritative, as the contract allows.
- The browser heuristic is unchanged and covers about 15 words. Everything else shows "No browser estimate for this word".
- Real-browser evidence is not included. A later real-browser check should cover:
  - screen-reader announcement of the status line
  - focus movement to the detail region and Tab order through the alternatives
  - visible focus rings
  - narrow-viewport layout
  - CORS/preflight of the morphology route from the real UI origin
- The real-browser rows for the service route from lt-elf remain open.

## Independent UI review and corrections (2026-10-13)

The review (`deleg_42b63109`) returned SPEC PASS, QUALITY APPROVED, SAFETY PASS, and ACCESSIBILITY FAIL on one blocker.

- **B1 (fixed): keyboard focus was lost after pressing Analyse words.** `rerenderApp` restores focus only to elements that have an `id`.
  - The button now has the stable id `analyse-words-<cueId>`.
  - The keyboard test asserts that `document.activeElement` is still that button after the analysis renders.
  - Two mutants make the test fail: removing the id, and making the id unstable between renders.
- **Applied nits:**
  - Alternatives are plain list items, no longer tab stops.
  - The button's `aria-controls` now points at the panel section (`#morphology-panel`) instead of the heading.
- **Rulings recorded (none blocking):**
  - The per-cue button satisfies the token-interaction scope. A per-word gesture is a follow-up.
  - Not persisting the reading choice is correct for now.
  - The quality wording is acceptable.
  - Unknown words show "not known", not the surface form.
  - The fallback message for words without a browser estimate is acceptable.
  - Player-only placement is acceptable, as is the absence of a `/api/status` gate.
- **Verification after corrections**, on base `fcf9cc2` with the SQLite timeout fix merged, in Docker with `--network none`:

  | Check | Result |
  |---|---|
  | Focused tests | 15/15 |
  | Full suite, 3 runs | 1394 passed, 1 skipped each |
  | `tsc` | clean |
  | Build | ok |
  | Privacy scan | ok |

**Open for the real-browser end-to-end check (`lt-3kk`):**
- Screen-reader announcement behaviour of the `role=status` region, which is rebuilt on every render.
- Focus rings and tab order.
- Narrow layouts.
- The morphology route from the real UI origin.

**Follow-ups (optional):**
- A per-word analysis gesture.
- Persisting the reading choice on saved items.
- Showing the panel in My Vocab and Review.
- A size cap on the per-cue cache.
