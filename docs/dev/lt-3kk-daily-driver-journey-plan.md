# lt-3kk daily-driver journey — plan (gate `lt-3kk`)

Status: **offline-prepared only.** No browser, compose stack or fixture service was launched, and `run_live` was never called. This plan does not authorize a run, and it closes no gate.

Source: `docs/review/plan-review-2026-10-10.md` §3 (daily-driver acceptance). The journey extends the reviewed browser-batch kit (`scripts/qualification/browser-batch/`, run 4 passed all 16 phases). It reuses that run's fixture service, pairing, private runtime, journal sanitization, strict cleanup, authorization guard and CDP file-input mechanism.

## What was added

| File | Change |
| --- | --- |
| `controller.py` | 13 `journey-*` phases (bead `lt-3kk`), their `DEPENDS`, the new fixed vocabulary (DOM element keys, `Input.*`/`Emulation.*` CDP methods, `SourceRevisionMismatch`/`FocusDeadline` tags), plus a gate rule: `lt-3kk` must run **alone** and needs `review['revision']` (40-hex). The default gate selection is unchanged, so the journey only runs when selected explicitly. |
| `live-batch.py` | `revision_guard`, `journey_files`, keyboard helpers (`key`, `press`), 13 `phase_journey_*` methods, and `run_live` wiring (guard before any container or tab; re-checked after the run; the receipt carries `candidateRevision`, `image` and `sourceSha256`). `set_files` now also accepts the two subtitle inputs. |
| `dom-journey.mjs` | New DOM-only ops layered on `dom-batch.mjs`. Journey tabs (`J`, `JF`) load both modules; the other gates' tabs are unchanged. |
| `runtime-batch.mjs` | The oracle adds a `journey` projection; the gate classifies `/api/language/morphology`. |
| `seed-batch.mjs` | `journeyProjection(snapshot)`: fixed fields only. Nothing is seeded for the journey. |
| `tests/qualification/test_lt3kk_journey_harness.py` | 16 offline tests (see below). |
| `tests/qualification/test_browser_batch_harness.py` | Phase count 17 → 30; the bead set includes `lt-3kk`. |

## Phase table

One fresh store, one service, one tab `J` (plus `JF` on the owned foreign origin). Every phase goes through the UI. The oracle is the in-container server state (SQLite + `/api/state`), never page claims.

| Phase | UI action (keyboard where marked ⌨) | Oracle (all must hold) | Evidence level |
| --- | --- | --- | --- |
| journey-01-pair | Pair through the masked Settings field ("Load service state"); autosave on. | Store empty (no media/cards/occurrences); masked + cleared; status/state GETs; providers = commands = 0. | Live server |
| journey-02-import-media-subtitles | Library: CDP `DOM.setFileInputFiles` on `#local-media-file`, `#local-target-subtitle-file`, `#local-native-subtitle-file` (repo fixtures, read-only) → **Import local media** → Save. | One media item (sha = fixture sha), tracks with roles {target, native}. **F1** is recorded as `OBSERVED` (`targetApproved`). | Live server |
| journey-03-draft-correct-apply-approve | Library: tick the public-read authorization → ⌨ **Import gated demo caption draft** (fake in-browser provider) → edit cue 0 to `Mamy zamek i kota.` → ⌨ **Create corrected transcript version** → Save → ⌨ **Approve transcript for study**. | Draft track `youtube-auto-caption`/`draft` persisted; providers = commands = 0; Approve disabled while dirty; exactly one new corrected track, persisted unapproved; then `approved` server-side with V1 still `draft`. Focus after Apply/Approve is journalled. Draft media placement is recorded as `OBSERVED` (see G1). | Live server |
| journey-04-save-word-sentence | Player: real text selection + `mouseup` on cue 0 for `zamek` and `kota` (the app's selection-save path; it renders no "Saved" preview, so only the gesture is asserted page-side) → ⌨ **Save sentence** → Saved view, tabs **My Vocab** / **My Sentences**: ⌨ **Create review card** for each item. | Approved corrected cue shown with Save enabled and no draft banner. Exactly 3 occurrences, all on the corrected track/media, char spans exactly {zamek 5–10, kota 13–17, whole cue 0–18}; **no** card before the explicit create; then 3 distinct cards, all `new`. | Live server |
| journey-05-review-due-keyboard | ⌨ nav **Review** → ⌨ **Show answer / context** → ⌨ **Rate good**. | Prompt shown; 4 rating buttons; exactly one card has 1 review event, reps 1, state ≠ new. Due mechanism: **live** (new cards are created with `dueAt = now`). No review-state seeding. | Live server |
| journey-06-practice-two-modes-keyboard | ⌨ nav **Practice**. Typed input: `Input.insertText` of the exact saved text → ⌨ **Submit attempt**. Then ⌨ ArrowDown on `#practice-mode` → multiple choice → ⌨ a **wrong** choice. | Card order is derived from server `dueAt`; on a tie the phase FAILS rather than guessing. Typed: feedback success, attempt `typed-input` pass, FSRS reps 1 + 1 review event. Choice: feedback error, attempt `multiple-choice` `fail`, FSRS applied. Modes = {typed-input, multiple-choice}; no microphone; providers 0. | Live server |
| journey-07-morphology-ui-narrow | Player: ⌨ **Analyse words** on the corrected cue; select the ambiguous token; CDP `Emulation.setDeviceMetricsOverride` 375 px (always cleared). | ≥1 POST `/api/language/morphology` from the UI origin with 200; label `Local morphology (Morfeusz)`; `#morphology-status` is `role=status` + `aria-live=polite`; meanings-unavailable text; ambiguous flag + "Several readings, check" + ≥2 alternatives; at 375 px `#morphology-panel` has no horizontal overflow (page overflow recorded, not asserted). | Live server + browser layout |
| journey-08-morphology-origin-denial | From the owned foreign origin: plain foreign frame and sandboxed (null) frame × {JSON fetch with bearer, text/plain form}: 4 attempts on `/api/language/morphology` (A24–A26 style). | Per attempt: gate trace 401/403, no CORS or credentials grant, table SHA and revision unchanged → PASS. No wire request but unchanged → `OBSERVED_BROWSER_BLOCK` (never PASS). | Live server |
| journey-09-persist-reload-repair | Save, reload the page, re-pair ("Load service state"). | Journey projection (IDs, card states, review events, attempts, anchors) and revision identical; anchors equal journey-04's; Saved lists ≥3 occurrences. | Live server |
| journey-10-relink-restart-reselect | Restart the service (capability rotates), reload, re-pair, reselect the same media + SRTs through the file inputs. | Re-paired after rotation; no name conflict; media and track sets identical; occurrences, cards and attempts identical. | Live server |
| journey-11-export-restore-merge | **Generate local export** → **Download export JSON** (blob text captured in page memory only) → paste into `#import-manifest` → **Preview restore** → Merge → **Refresh authoritative service preview** → acknowledge warnings → **Restore now**. | Export captured; preview integrity verified; durable receipt, commit 200, readback GET after the commit, exactly 1 commit, no `role=alert` banner; the post-merge journey projection equals both pre-merge and post-relink. | Live server |
| journey-12-unsupported-codec-feedback | Library: import a 64-byte local file named `.webm` that is not a media container (built in owned scratch, no download), then open Player. | `<video>` error code is OBSERVED. Assertion: visible **and** accessible (`role=alert/status`) media-error feedback. G2 fixed by lt-r4k.1 (merged before the live run). | Live browser |
| journey-13-keyboard-focus | From nav **Player**, 40 × CDP Tab. | Tab reaches {Library, Review, Practice, Settings, Analyse words, Save sentence}; every focus stop matches `:focus-visible` with a computed outline or box-shadow; focus was not on `body` after Apply, Approve, grade, practice submit, practice choice or Analyse (≥5 recorded). | Live browser (live-only) |
| cleanup | Unchanged: page cleanup → release → close own targets → `Target.getTargets` readback; fixture `stop` (graceful per listener, 0 sockets); exact-name `docker ps -a` readback. A forced closure is a strict failure. | | Live |

DEPENDS (a failed phase marks its dependents `SKIPPED_CASCADE`; they are never run):
02←01; 03←02; 04←03; 05←04; 06←04,05; 07←03; 08←01; 09←05,06; 10←09; 11←10; 12←02; 13←03,05,06,07.

No retries anywhere: each op runs once, and every wait is a finite page-side deadline that is shorter than its CDP timeout (`OP_TIMEOUTS`: `restore-commit` 35 s, `restore-preview-captured` 25, `morphology-state` 25, `media-feedback` 20).

## Product gaps and observations (evidence; production code unchanged)

- **F1 (observation for Janusz).** Subtitle files imported through Library → Import local media become **approved** target tracks: `makeSubtitleTrack` defaults `transcriptStatus` to `'approved'` (`packages/domain/src/factories.ts:49`), and the correction editor only renders for non-approved tracks. This is current design (the user's own subtitle files are trusted; provider/ASR outputs stay draft per DECISIONS.md). The journey therefore uses path (a) for correct/approve: **Import gated demo caption draft**. It is a real UI path that uses the fake in-browser provider `makeFakeYouTubeCaptionProvider` (`apps/web/src/model.ts:1584`), which makes no `fetch` and needs no provider env. It does require the public-read checkbox (`importYouTubeCaptionCandidate`, model.ts:2412).
- **G1 (journey composition, medium).** The gated demo draft does **not** attach to the imported media. `importYouTubeCaptionCandidate` creates a new `caption-candidate` media item (`originalPath: youtube:abcdefghijk`, model.ts:2424–2433) and makes it `currentMedia`. As a result, the corrected/approved track, the saved occurrences, and therefore the review and practice cards are anchored to that caption-candidate media, not to `synthetic-polish-dialogue.webm`. The journey still runs every step through the UI, and the oracles assert that anchors sit on the corrected track (journey-04) and that the relink of the imported media preserves everything (journey-10). However, "correct → save from the *same* imported media" is not exercised, because no offline UI path gives a draft on an imported local file. Local ASR needs the service plus a real ASR engine; embedded-subtitle extraction needs ffmpeg plus an absolute path. **Decision for review:** accept G1 as a documented composition gap, or approve a seeded draft on the imported media (path (b), `seed-batch.mjs` `transcriptStore`-style) as a separate variant.
- **G2 (blocking for acceptance item "unsupported codec feedback", expected FAIL).** `renderVideoStage` (`apps/web/src/app.ts:1704–1741`) registers `timeupdate`, `loadedmetadata`, `play` and `pause` listeners but **no `error` listener**, and `importBrowserLocalFiles` does not probe decodability (`durationMs: 1000`, container taken from the file extension, model.ts:1286–1290). An undecodable `.webm` therefore imports "successfully" and the player shows a broken native control with no app message. journey-12 asserts the visible and accessible error, so it will **FAIL** live unless the browser's own control is judged sufficient (it is not `role=alert/status`). `test_known_product_gap_still_present` pins this source fact. The task forbids product changes, so this is reported rather than fixed.
- **F2 (export/restore after relink): no blocker found by source reading.** `buildLearnerExportContent` (`packages/domain/src/exportManifest.ts:470`) exports only learner collections plus their `sourceContexts` (by value). Media and tracks are not exported, and relink (`relinkExistingBrowserMedia`, model.ts:1198) keeps the media ID and reuses tracks by content digest. Merging the same learner records back into a store where the media and tracks exist should therefore be a no-op on the projection, which journey-11 asserts. Whether the restore preview flags these as conflicts is recorded (`conflictChoice`), not assumed. This is confirmed only by the live run.

- **G3 (keyboard focus loss, expected FAIL in journey-13).** `rerenderApp` (`apps/web/src/app.ts:4404–4419`) restores focus only by `document.activeElement.id`. **Approve transcript for study**, **Rate good/…**, **Submit attempt** and the practice choice buttons have no `id`, and Approve/Rate/Submit also change the view or remove the button. In the JSDOM probe, focus is on `body` after Approve, Rate good, Submit attempt and choice; it is kept after Apply, Save sentence and Analyse words (Analyse has a stable id, lt-e8z). journey-13 `focus-not-lost-after-actions` asserts this and will FAIL unless live Chrome behaves differently. This is reported, not fixed (no product changes in scope).

## Revision guard (how it works)

`review` for this gate must carry `gates: ['lt-3kk']` and `revision: '<40-hex commit>'`; otherwise `require_authorization` refuses before anything starts. In `run_live`, before any port bind result is used, container start or tab:

1. `git -C <repo> rev-parse HEAD` must equal `review['revision']` (`SourceRevisionMismatch`).
2. `git status --porcelain --untracked-files=all` must be empty (`DirtyWorktree`).
3. `git ls-files` over exactly what the Dockerfile copies (`apps packages vendor fixtures scripts tests` + root configs) gives the file list. The host digest is SHA-256 over `path\0sha256(bytes)\n`.
4. `docker run --rm --network none --log-driver none -i <image> node -e <hash script>` hashes the same list under `/app` (no mounts; the list goes in on stdin). It must equal the host digest (`ImageSourceMismatch`).

The guard is re-run after the journey, so `sourceAndKitUnchanged` covers the tree, the image and the kit/media bindings. The receipt records `candidateRevision`, `image` and `sourceSha256`. The kit itself lives in `scripts/` and so is part of the hashed tree: the image must be built **after** the kit is committed.

## Offline qualification (this change)

| Command | Result |
| --- | --- |
| `BQB_SCRATCH=…/scratch/lt3kk python -I -B tests/qualification/test_lt3kk_journey_harness.py` | 16 tests OK, exit 0 |
| `BQB_SCRATCH=…/scratch/lt3kk python -I -B tests/qualification/test_browser_batch_harness.py` | 52 tests OK, exit 0 |
| `python -I -B scripts/qualification/browser-batch/live-batch.py` | 30 phases, `unboundPhases: []`, `authorizationGuard: true`, `browserExecuted: false`, exit 0 |
| `LT_SOR_SCRATCH=…/scratch/lt-sor-lt3kk python -I -B tests/qualification/test_lt_sor_harness.py` | 10 tests OK, exit 0 |
| `node --check` on all 5 kit `.mjs` in `lingotorte:lt3kk` (`--network none`) | all OK, exit 0 |
| JSDOM probe (real app modules + real `dom-batch.mjs` + `dom-journey.mjs`, in-memory SQLite, no listener) in Docker `--network none` | 1/1 pass, exit 0 (see below) |

New tests cover: phase binding and order; DEPENDS that point only backwards and stay inside the journey; a cascade that never runs dependents and has no hidden retry; the journey excluded from the default selection and required to run alone; exact-revision syntax; unauthorized `run_live` → `PermissionError` with zero spawned processes; revision guard accept and refusals (HEAD drift, dirty tree, image mismatch); an image-hash container with no mounts; a locally built undecodable fixture; capability, free text and non-ASCII refused by the journal; no typed answer or cue text in any journal call; no `'PASS'` literal in journey code; strict cleanup and the no-prune check unchanged; every UI string in `dom-journey.mjs` present in the app sources; no production imports; G2/G3 fixes present.

**JSDOM probe result** (scratch `lt3kk/probe/lt3kkProbe.test.ts`; `activate-fallback` = click on the focused control replaces CDP Enter). It runs the full sequence pair → import (1 media; target and native both `approved`, F1) → gated draft (`draft`/`youtube-auto-caption`) → edit → Apply → Approve (corrected `manual-edit` track `approved`, V1 stays `draft`) → word ×2 + sentence (spans 5–10, 13–17, 0–18) → 3 cards via Create review card → Review reveal + Good (1 card `learning`, reps 1) → typed pass + multiple-choice fail (both persisted with FSRS) → Analyse (status role/live, meanings text; source = browser estimate because the probe has no Morfeusz service) → UI export captured (14.6 KB) → preview (integrity, conflict choice shown) → merge commit 200 with durable receipt and readback → projection unchanged. Defects it found and that are now fixed in the kit: cue editor ids follow `cueIndex` (provider drafts start at 1, not 0); `save` navigates away from Library/Practice; the selection gesture shows no preview; cards need an explicit **Create review card** on two Saved tabs.

**JSDOM-only / live-only.** Codec feedback (G2), focus rings/`:focus-visible`, the 375 px layout, CDP key events and file inputs, origin denial, and service-side Morfeusz are **live-only**. The JSDOM probe exercises selectors and op sequencing only.

## Parent live-run procedure (only after review and fresh authorization)

1. Commit the reviewed candidate. From a **clean** checkout at that commit: `docker build --target contributor -t lingotorte:lt3kk .`, then record `docker image inspect -f '{{.Id}}' lingotorte:lt3kk`.
2. In the parent `browser_exec` session (never a terminal):

```python
# Run lt-3kk daily-driver journey
import importlib.util, os, pathlib, sys
os.environ['BQB_IMAGE'] = 'sha256:<reviewed contributor image id>'
os.environ['BQB_SCRATCH'] = r'C:/Users/jmdzi/AppData/Local/hermes/cache/scratch/lt3kk'
path = pathlib.Path('C:/Users/jmdzi/workspace/lingotorte/.worktrees/lt-3kk-journey/scripts/qualification/browser-batch/live-batch.py')
spec = importlib.util.spec_from_file_location('bqb_live', path); m = importlib.util.module_from_spec(spec); sys.modules[spec.name] = m; spec.loader.exec_module(m)
review = {'image': os.environ['BQB_IMAGE'], 'revision': '<40-hex candidate commit>', 'specApproved': <recorded>, 'qualityApproved': <recorded>, 'browserAuthorized': <recorded>, 'gates': ['lt-3kk']}
result = m.run_live(cdp, review, new_tab=new_tab)
print(result)   # sanitized only
```

3. Afterwards, `docker image rm lingotorte:lt3kk` (never prune). Record `rows.jsonl` sha, dispositions, and the cleanup row.

## Explicit gaps (not covered by this gate)

- **Edge**, **plain-HTTP private-LAN origin**, and the **native file-chooser/persistent-handle permission prompt** remain human checks (`docs/review/final-human-acceptance-checklist.md`). Files are supplied via CDP.
- **Service restart is an in-process kill/boot** inside the fixture (`restart`), not a hard crash or power loss of a separate process.
- **Real ASR/STT and online providers are not exercised.** The draft comes from the fake in-browser caption provider; provider fetches are forced off and counted.
- **G1:** correction is on caption-candidate media, not on the imported file.
- Review grading uses one rating (Good) and practice uses two modes (typed pass, choice fail). Audio recall, sentence builder and speaking are out of scope (speaking needs no microphone and shows the unavailable status).
- JSDOM results are selector and sequence evidence only.

## Residual risks for the first live run

- **journey-12:** G2 was fixed by lt-r4k.1; the real-browser behaviour is unproven until this run.
- **Practice card order.** If two `new` cards share a `dueAt` millisecond (word saves in quick succession), journey-06 fails with `active-card-determinable` rather than guessing. That is a harness limitation, not a product defect.
- **journey-13:** G3 was fixed by lt-r4k.2 in JSDOM; this run is the first real-browser check. It also needs `:focus-visible` to match after programmatic `focus()` + Tab. Chrome sets focus-visible on keyboard navigation, but the first stop after a programmatic focus may differ.
- **Restore preview** shows a conflict choice when merging the journey's own records (JSDOM: `conflictChoice: true`). `restore-commit` ticks Merge, and the merge result equalled the pre-merge projection in JSDOM.
- **Revision guard:** if the Dockerfile's install step rewrites any tracked file under `/app` (for example `vendor/**/dist`), `ImageSourceMismatch` refuses the run. That is the intended behaviour, but it needs a one-time check against a real build.
- `Input.insertText` / `dispatchKeyEvent` require that the `cdp()` helper routes `session_id` for `Input.*` (it does for all non-`Target.`/`Browser.` methods).

## Run results

_(empty — no live run has been executed)_

## Gap resolution before the first live run (2026-10-13)

- **G2** became `lt-r4k.1`, which is merged. The Player shows a `role=alert` message on media errors; after the first render it uses `role=status`.
- **G3** became `lt-r4k.2`, which is merged. `requestFocusAfterRender` moves focus to a successor after Approve, Rate, Submit, multiple-choice and Skip.
- **G1** (the gated demo draft creates its own `youtube:` media item) remains a documented gap pending Janusz's choice, together with F1.
