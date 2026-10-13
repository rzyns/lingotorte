# lt-7lq — learner-state export inclusion and recovery limits

Status: implemented and container-tested candidate; awaiting parent spec/quality review. No commit, push, Beads change, merge or deployment.

## Cause and correction

Baseline `7acb49d` already produced an active-only learner export: `ExportService.buildManifest` projects exactly the six learner collections from active state, `learnerAudit` is never serialized, and lt-3xg's shared `validateLearnerExportManifest`/`sameHistoryPayload` path preserves captured practice `sourceContext` and nested `eventLink` through stringify → parse → validate → restore. The gaps were disclosure and declaration, not projection:

- The UI called the file "Metadata backup v1" and listed "review/practice history" without saying it is an active learner subset, what is excluded, or that it is not full recovery. The runbook described Replace all as clearing state, contradicting the retained-audit contract.
- No code-level inclusion/exclusion list existed.
- After import into a fresh app, practice/review silently omitted source context when the cue was absent (no unresolved/missing-source state; the replay button was disabled without explanation).

Correction (minimal, no format change):

- `packages/domain/src/exportManifest.ts`: exported `LEARNER_EXPORT_INCLUDED_COLLECTIONS` (six) and `LEARNER_EXPORT_EXCLUDED_COLLECTIONS` (ten); `sourceContexts` documented as a supporting decode dictionary. Wire schema `lingotorte.learner-export.v1` and integrity unchanged.
- `apps/web/src/app.ts`: export intro/summary renamed to "Learner-state export v1 (learner subset)" with exact included/excluded lists and "not a full backup or full recovery"; summary labels semantic integrity as not a physical-file check; export note labels physical-file verification separately; restore preview states scope and that semantic integrity is not physical-file/durable-save verification; receipt adds a scope note (learner subset restored, not full recovery; missing source media/cues remain unresolved; retained inactive audit stays local, not in learner export). Existing durable/session-only receipt heading unchanged. Practice and review (revealed) render a `source-unresolved` status — "Source cue/media not available in this app; playback unresolved" with the captured media reference — when the cue is absent.
- `docs/dev/local-runbook.md`: learner-subset definition, exact lists, five distinctions (learner subset / semantic integrity / physical-file verification / retained audit / durable acknowledgement), fresh-app missing-source behavior, corrected Replace all wording, lt-2t4/lt-42c ownership.
- Two existing tests updated only for the renamed copy (`Metadata backup v1 ready` → `Learner-state export v1 ready`, `JSON backup file only` → `learner-state JSON file only`); assertions not weakened.

Changed paths:

- `packages/domain/src/exportManifest.ts`
- `apps/web/src/app.ts`
- `docs/dev/local-runbook.md`
- `tests/core/lt7lqExportLimits.test.ts` (new)
- `tests/web/lt7lqExportLimitsFrontend.test.ts` (new)
- `tests/web/frontendUi.test.ts`
- `tests/web/p6PracticeFrontend.test.ts`
- `docs/dev/lt-7lq-export-limits-result.md`

## Regression evidence

Red: the seven new tests were copied into a detached scratch worktree at `7acb49d` (image `lingotorte:lt-7lq-red`, since removed). Final-version result: **3 failed, 4 passed**, exit 1.

| Test | Baseline | Reason |
| --- | --- | --- |
| core: manifest has exactly six collections + `sourceContexts`; wire keys exact | pass | projection already correct |
| core: declared included/excluded lists cover every `LocalStoreSnapshot` key | **fail** | constants undefined |
| core: re-export after empty replace has only active records; audit IDs and `learnerAudit` absent | pass | lt-04i already filters |
| core: serialized FSRS-linked practice → fresh store keeps `eventLink`/captured context, no enrichment after track mutation, no library invented, re-export equal | pass | lt-3xg shared path already lossless |
| web: fresh app import via `exportLearnerState` JSON keeps attempt canonical-equal, no media/cues, `mediaCopied:false` | pass | |
| web: fresh-app practice + review show unresolved missing source, replay disabled | **fail** | no `source-unresolved` element |
| web: export/import/receipt copy distinctions; no "Metadata backup"/"full backup verified" | **fail** | old copy |

An earlier red draft had two additional failures that were test-design errors, not product defects: an exact `sameHistoryPayload` compare against the wire attempt (which legitimately carries the `sourceContextId` dictionary reference) and a `JSON.stringify` key-order compare. Both were corrected to canonical comparisons before the fix; logs `red.log` (draft) and `red2.log` (final) are in scratch.

Green: same seven tests **7 passed**, exit 0. Synthetic fixtures only; web flows run inside `withNoNetwork` with zero attempts.

## Exact candidate and verification

Contributor image `lingotorte:lt-7lq-cand`, ID:

`sha256:cfb685b71b246519c883ce237a572d794c5028529b354aa86482e5c9c542a25c`

Built from this worktree with the existing Dockerfile `contributor` target. All runs `--rm --init --network none`; no host mounts.

| Command | Result | Exit |
| --- | --- | --- |
| `vitest run` focused (2 files) | 7 passed | 0 |
| `vitest run` (full) | 55 files passed, 1 skipped; 1256 passed, 1 skipped (baseline 1249 + 7 new) | 0 |
| `tsc --noEmit` | clean | 0 |
| `vite build --config vite.config.ts` | built | 0 |
| `vitest run tests/no-network` | 5 passed | 0 |
| `node scripts/check-privacy-boundaries.mjs` | `ok: true`, 60 files | 0 |
| `git diff --check` | clean | 0 |

The skipped test is the pre-existing `tests/core/privateDelivery.test.ts` skip. Host and in-image SHA256 match for every changed source/test file:

| Path | SHA256 |
| --- | --- |
| `apps/web/src/app.ts` | `774cfa7a4b526e0496b63bc6fa905d5018fdc41ebb7663e9e027992993c29f5b` |
| `packages/domain/src/exportManifest.ts` | `3d4b4681b9e483fd69afed617adbb9487e5e3c57bef6f49d5563bebf55cea2cf` |
| `tests/core/lt7lqExportLimits.test.ts` | `fcc9fff0f7c6a1bf427973f10a11f984427d1a2c0b9fe790389a7e9acc88aeb7` |
| `tests/web/lt7lqExportLimitsFrontend.test.ts` | `daabea82f1d14e8ce9810d0c90cc52079578f5724edf07552a37161c77fa0d2b` |
| `tests/web/frontendUi.test.ts` | `f808df4eca0393a57188f3aa3d01413ae0a436098f5575a6cb02c9c96641ba09` |
| `tests/web/p6PracticeFrontend.test.ts` | `87498e8dd9b7650e7f655fdf452276e6b2a57dfe10159544b77599237d303aa9` |
| `docs/dev/local-runbook.md` (not in image) | `49ebcb3dfaf579e61accc517981629fa13dc83ae690703b939f443bce4c3923e` |

## Boundaries and limitations

- No manifest format, schema version, integrity or media-copy change; no new dependency; no historical migration SQL touched; providers disabled; no network; no real learner data or private media.
- Fresh-app tests use in-memory session restore. Integrated file-backed restore → save → reopen with exact active/audit readback (T01/T07 durable form) is **lt-2t4**, not proven here.
- A broader metadata/media bundle or full-recovery export is deferred to **lt-42c**. Consistent DB backup remains the full-state recovery mechanism.
- The excluded-list constants are declarative and tested against `LocalStoreSnapshot` keys; they are not yet consumed by the export builder (which already projects only the six).
