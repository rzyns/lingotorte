<!-- GENERATED from docs/workflows/as-is/ by scripts/workflows/generate-projections.cli.ts. Do not edit; edit the YAML and regenerate. -->

# As-is workflow catalog — index

## App structure (pass 1)

Views in nav order: **Player** (`player`) → **Library** (`library`) → **Saved** (`saved`) → **Review** (`review`) → **Practice** (`practice`) → **Export / Import** (`export-import`) → **Settings** (`settings`).

145 interactive controls: shell 4, shared 14, export-import 16, library 32, player 36, practice 14, review 4, saved 12, settings 13.

Keyboard: 10 shortcuts declared in the help overlay; 25 `event.key` handler sites in source.

Service API: 16 routes (`GET /api/health`, `GET /api/status`, `GET/PUT /api/state`, `POST /api/restore/preview`, `POST /api/restore/commit`, `POST /api/learner/operations`, `POST /api/jobs`, `POST /api/artifacts/cleanup`, `POST /api/language/morphology`, `POST /api/language/gloss`, `POST /api/export/anki`, `GET /api/jobs/{uuid}`, `POST /api/jobs/{uuid}/cancel`, `GET/DELETE /api/snippets/{uuid}`, `GET /api/media/{uuid}/transcripts`, `PUT /api/tracks/{uuid}/transcript`); the browser references 10 of them.

Persistence: 15 model functions autosave to the local service when enabled; 3 mark browser-only edits as unsaved.

## Journeys (pass 2)

| Journey | Steps | Clicks | Keys | Typing | View switches | Decisions | Modals | API calls | Failure branches | Focus lost | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [Daily-driver learning loop (pair, import, draft/correct/approve, save, review, practise, persist)](./daily-driver-learning-loop.md) | 15 | 28 | 4 | 5 | 8 | 3 | 0 | 14 | 9 | 2 | observed-live |
| [Export learner state and restore it (merge) through the local service](./export-restore-learner-state.md) | 6 | 8 | 0 | 1 | 0 | 1 | 0 | 3 | 5 | 0 | observed-live |
