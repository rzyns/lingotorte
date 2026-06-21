# Lingotorte V2 Local I/O + Conflict UX Plan

Status: follow-up implementation plan for the first post-publication Lingotorte branch.

Branch: `lingotorte/v2-local-io-conflict-ux`

Source request: implement all four next product slices:

1. Replace the preview-only `/tmp/lingotorte` export placeholder with a browser-safe download / user-chosen export path.
2. Restore conflict UX: keep current merge/upsert behavior, but show what records would be added, updated, and skipped.
3. Real local file import UX: move beyond the synthetic fixture button toward user-selected local media/subtitle import.
4. Clarify local-only policy in docs: local-only means no public-internet writes; loopback/local dev-server fetches are allowed.

## Governing constraints

- Preserve `AGENTS.md` boundaries: own/local media only, no proprietary copying, no DRM/circumvention, privacy by default.
- Keep providers and public-internet writes disabled by default. Loopback reads from the Vite/local dev server are allowed and should remain covered by no-network tests.
- Use strict TDD vertical slices: one observable behavior test, verify RED, implement minimal GREEN, then continue.
- Avoid broad schema/internal renames unless a slice requires them; the existing restore service already models merge/upsert semantics.
- Keep public repo hygiene intact: no private absolute local path leaks, no private fixture media/subtitles, no generated dependency/build artifacts committed.

## Structure-first plan

The work is shaped around the local data lifecycle:

```text
local user inputs -> browser-local parsing/projection -> learner state mutation -> export/restore package -> user-visible provenance and policy docs
```

That yields four vertical slices in a safe order:

1. Document policy terms first so implementation/tests use the same language.
2. Replace export placeholder with a real browser download path, because it does not mutate existing learner state.
3. Add restore conflict preview before changing import UX, because restore already consumes package data and can prove add/update/skip semantics in isolation.
4. Add real local media/subtitle import UX last, because it crosses the browser `File` boundary and touches the player ingestion path.

## Slice 1 — local-only policy clarification

Goal: make the docs explicit that local-only forbids public-internet writes, not loopback/local dev-server reads.

Likely files:

- `README.md`
- `docs/dev/local-runbook.md`
- `docs/dev/v1-local-acceptance.md`
- `docs/review/safety-privacy-boundary-review.md`
- tests only if policy text is asserted by an existing privacy/docs scanner

Acceptance criteria:

- Docs state: no public-internet writes without explicit opt-in/approval.
- Docs state: loopback/local dev-server fetches are allowed for app assets and local development.
- Docs distinguish public docs URLs used as planning evidence from runtime app network behavior.
- `npm run scan:privacy`, `npm run test:no-network`, and `git diff --check` pass.

TDD / verification shape:

- If the privacy scanner already checks docs, add/update one focused fixture/assertion first and verify RED.
- Otherwise treat this as documentation-only and verify with `npm run scan:privacy`, `npm run test:no-network`, and a tracked-file scan for private host/path leakage.

## Slice 2 — browser-safe export/download

Goal: replace the current preview-only `/tmp/lingotorte` export path with a browser-real export affordance.

Expected behavior:

- Export creates the existing manifest JSON payload in the browser.
- UI offers a real download action using `Blob`, `URL.createObjectURL`, and an anchor `download` filename.
- The UI displays a browser-appropriate destination message such as “downloaded via your browser” instead of a fake local path.
- The exported filename is deterministic and privacy-safe, for example `lingotorte-learner-state-YYYYMMDD-HHMMSS.json`.
- Object URLs are revoked after use to avoid leaks.
- The export still performs zero public-internet network calls.

Likely files:

- `apps/web/src/app.ts`
- `apps/web/src/model.ts`
- `tests/web/p6PracticeFrontend.test.ts`
- optionally `packages/domain/src/exportManifest.ts` if filename/metadata belongs in domain helpers
- `docs/dev/local-runbook.md`
- `docs/dev/v1-local-acceptance.md`

TDD slices:

1. RED: frontend export test expects no `/tmp/lingotorte` text and sees a download filename/action.
2. GREEN: update export UI copy and state model minimally.
3. RED: mock/spy browser URL + anchor download behavior and assert Blob content is valid manifest JSON.
4. GREEN: implement browser download helper with object URL revocation.
5. RED: no-network export flow still records zero network calls.
6. GREEN: wire through existing no-network harness if needed.

Validation:

- Focused: `npx vitest run tests/web/p6PracticeFrontend.test.ts`
- Broad: `npm run typecheck`, `npm run test:no-network`, `npm run test:web`, `npm test`, `npm run build`, `git diff --check`

## Slice 3 — restore conflict preview

Goal: keep merge/upsert restore semantics, but preview what the restore will add, update, and skip before mutation.

Expected behavior:

- Preview computes per-record-family counts for at least:
  - saved items
  - saved occurrences
  - review cards
  - review card states
  - review events
  - practice attempts
- Classification semantics:
  - `added`: import record ID/key is absent locally.
  - `updated`: import record ID/key exists locally and imported normalized content differs.
  - `skipped`: import record ID/key exists locally and normalized content is identical, or import record is intentionally ignored by existing validation rules.
- UI shows summary before restore and after a completed restore.
- Restore still requires privacy-warning acknowledgement and merge/update confirmation when local data exists.
- Existing unrelated local records remain untouched.

Likely files:

- `packages/storage/src/exportRestoreService.ts`
- `packages/domain/src/exportManifest.ts`
- `apps/web/src/model.ts`
- `apps/web/src/app.ts`
- `tests/core/p6PracticeExport.test.ts`
- `tests/web/p6PracticeFrontend.test.ts`

TDD slices:

1. RED: core restore preview classifies a simple import as added/updated/skipped without mutating local state.
2. GREEN: add pure preview helper and typed result.
3. RED: restore result returns the same counts after mutation.
4. GREEN: wire counts through existing restore service return path.
5. RED: frontend preview renders the counts and still avoids overwrite wording.
6. GREEN: render conflict summary in import/restore panel.
7. RED: no-network restore preview remains zero network activity.
8. GREEN: preserve existing network guard behavior.

Validation:

- Focused: `npx vitest run tests/core/p6PracticeExport.test.ts tests/web/p6PracticeFrontend.test.ts`
- Broad gates as in Slice 2.

## Slice 4 — real local media/subtitle import UX

Goal: add user-selected local media/subtitle import UX while preserving the synthetic fixture as a demo/smoke path.

Expected behavior:

- UI offers file inputs for:
  - local media file
  - target-language subtitle file
  - optional native-language subtitle file
- Import accepts owned/local files selected by the user through the browser `File` API.
- Subtitle parsing uses `File.text()` and existing parser/ingestion seams.
- Media playback uses a browser object URL for the selected media file; object URLs are revoked when superseded/unmounted if the app has a cleanup seam.
- Imported records carry local/user-selected provenance without storing absolute host filesystem paths.
- Unsupported subtitle/media inputs produce clear local validation errors and no learner-state mutation.
- The synthetic fixture button remains available but is labeled as a demo fixture, not as the real import path.

Likely files:

- `apps/web/src/app.ts`
- `apps/web/src/model.ts`
- `packages/media` / `packages/subtitles` ingestion helpers if present
- `packages/domain/src/types.ts` if new provenance fields are required
- `tests/web/p2PlayerTranscript.test.ts`
- `tests/web/frontendUi.test.ts`
- `tests/no-network/providerDisabled.test.ts` or an added no-network import test
- `docs/dev/local-runbook.md`
- `docs/dev/v1-local-acceptance.md`

TDD slices:

1. RED: UI renders real file inputs and keeps the synthetic fixture as a separate demo action.
2. GREEN: add controls and labels only.
3. RED: selecting a target subtitle file parses cues and projects them in the transcript/player without network calls.
4. GREEN: wire `File.text()` into existing subtitle ingestion.
5. RED: selecting media creates an object URL and player uses it without recording an absolute path.
6. GREEN: wire media object URL into player state.
7. RED: invalid subtitle input shows an error and does not mutate current library/learner state.
8. GREEN: add validation/error handling.
9. RED: optional native subtitles render as dual subtitles when supplied and gracefully absent when omitted.
10. GREEN: complete the dual-subtitle import path.

Validation:

- Focused: `npx vitest run tests/web/p2PlayerTranscript.test.ts tests/web/frontendUi.test.ts tests/no-network/providerDisabled.test.ts`
- Broad gates as in Slice 2.
- Manual/local smoke after automated green:
  - `npm run dev -- --host 127.0.0.1`
  - open loopback URL
  - import a synthetic/owned local subtitle/media fixture
  - verify playback/transcript/save/review/export flow remains local
  - record smoke notes outside committed source or in an explicitly intended acceptance artifact

## Integration and branch handoff gates

Before committing implementation work on this branch:

- Run focused tests for the touched slice.
- Run `npm run typecheck`.
- Run `npm run test:no-network`.
- Run `npm run test:web` for UI slices.
- Run `npm test` before final handoff.
- Run `npm run build`.
- Run `npm run scan:privacy`.
- Run `python3 validate_final_bundle.py` if docs/final or manifest-affecting docs changed.
- Run `git diff --check`.
- Run a tracked-file scan for private absolute paths such as local home directories and Windows user-home paths before any public push.

Commit strategy:

- Prefer one commit per completed vertical slice if each is independently green.
- If a slice forces cross-cutting docs/tests, keep the commit message scoped to the user-visible behavior.
- Do not push the follow-up branch until Janusz asks or a review/PR step is explicitly chosen.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Browser tests overfit to DOM implementation details | Assert user-visible text/actions and state effects, not internal helper names. |
| Restore preview counts disagree with actual mutation | Reuse one pure classification helper for preview and restore result; regression-test both before and after mutation. |
| Object URLs leak across repeated exports/imports | Test `URL.revokeObjectURL` on replacement/cleanup paths where practical. |
| Local import accidentally stores private absolute host paths | Store browser-visible file names/provenance only; scan committed artifacts for host paths. |
| “Local-only” becomes ambiguous again | Keep docs and privacy scan language tied to “no public-internet writes”; preserve loopback exception explicitly. |
| Synthetic fixture masks real import breakage | Keep separate tests for fixture path and user-selected `File` path. |

## Definition of done for this branch

- All four slices are implemented or explicitly split with Janusz approval.
- UI no longer presents `/tmp/lingotorte` as a real export destination.
- Restore preview shows added/updated/skipped counts before mutation.
- A user can import local media/subtitle files through browser file inputs without public-internet writes.
- Docs encode the local-only policy clarification.
- Full validation gates pass with receipts/logs.
- Final branch handoff states whether it was pushed, reviewed, and/or left local.
