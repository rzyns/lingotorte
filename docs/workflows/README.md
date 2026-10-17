# As-is user workflow catalog (lt-5lb.5)

A machine-readable map of how Lingotorte **actually works right now**, built so an LLM (or a person) can reason about the learner experience, propose a to-be version, and have the difference checked against the code. The YAML here is the source of truth; the Markdown/Mermaid under `generated/` is a projection.

## Layout

| Path | What | Who writes it |
| --- | --- | --- |
| `schema/structure.schema.json` | JSON Schema for pass 1 | hand-maintained |
| `schema/journey.schema.json` | JSON Schema for pass 2 | hand-maintained |
| `as-is/structure.yaml` | **Pass 1 — structure**, extracted from `apps/web/src` and `apps/local-service/src`: views and nav order, every interactive control (label, id, guard, events), `event.key` handler sites, the declared shortcut help, service routes with body limits, browser call sites, and which model functions autosave. Every entry has `source: {path, line, snippet}`. | `node scripts/workflows/extract-structure.cli.ts` — never by hand |
| `as-is/journeys/<id>.yaml` | **Pass 2 — journeys**, observed walks through the app. Each step records `view`, `userSees`, `userDoes` (interactions targeting pass-1 control ids), `decision`, `feedback`, `persists`, `api`, `canFail` (+recovery), `focusAfter`, `modal`, `navigatesTo`, `source` refs and an `evidence` label. Journeys also list unwalked `variants` and neutral `observations`. | hand-written from live-run receipts and source reading |
| `generated/index.md` | Structure summary + per-journey friction totals | `node scripts/workflows/generate-projections.cli.ts` |
| `generated/<id>.md` | Mermaid flowchart (steps grouped by view, failure branches dashed) + friction table + variants + observations | same |

## Evidence labels

Every journey, step, variant and observation carries `evidence.kind`:

- `observed-live` — a recorded live browser run (today: `docs/dev/lt-3kk-daily-driver-journey-plan.md`, run 4).
- `source-reading` — traced in code; `ref`/`source` give `path:line`.
- `jsdom-test` — exercised by a vitest/JSDOM test.
- `inference` — not verified; keep these rare and visible.

## Validation (fails CI when the map rots)

`tests/workflows/catalog.test.ts` (part of `npm run test`) and `node scripts/workflows/validate-catalog.cli.ts` check:

1. both YAML kinds against their JSON Schema (ajv, strict);
2. `structure.yaml` equals a fresh extraction, and every recorded `path:line` still starts with the recorded snippet;
3. journeys reference only existing view ids, control ids and `METHOD /api/route`s, step ids are unique and ordered, variant/observation anchors exist, and every `path:line` is inside the current file;
4. `generated/` equals what the generator produces now.

When a control is renamed or moved: re-run the extractor, then fix the journeys that referenced the old id (the validator lists them).

## Using it with an LLM

Give the model `as-is/structure.yaml` (or just the `controls` of the views in question), the journey YAML, and `generated/<id>.md`. Ask for a **to-be journey in the same schema**, keeping step ids where the step is unchanged, then diff the two YAML files and the two friction tables. After implementing, re-run the extractor and validator: the to-be file should now validate against the new structure, which closes the loop.

Granularity is view/action level on purpose: UX optimisation happens there, and the ids stay stable across cosmetic refactors (they derive from the visible label or element id, not the line number).

## Known limits

- Pass 1 is text analysis of the codebase's own `createElement` + `textContent` convention, not a type-checked program model. Labels set from ternaries record both strings; labels set from helper functions or template literals are kept as `labelExpr`. `<span role="button">` word buttons are recognised; controls created through other helpers (`renderFilePicker`) appear under the inputs they wrap.
- Journeys cover the learner paths that have live evidence. Not yet walked: Library media list (Open/Relink), source-range loops and practice audio, embedded-subtitle extraction, local ASR, Anki export, Clear browser cache, shortcut help dialog. Add them as further `as-is/journeys/*.yaml`.
- Frictions are counts, not judgements. Proposals belong in to-be files or review docs, never in `observations`.
