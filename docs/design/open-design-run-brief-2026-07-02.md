# Open Design Run Brief — Lingotorte UX Proposal Variants — 2026-07-02

Use this brief for a design-only Open Design run against the folder-backed Lingotorte project.

## Project

- Open Design project: `Lingotorte`
- Project id: `21b550d6-5d5f-4991-bf82-a13dca951e52`
- Repo/root: `/home/openclaw/workspace/lingotorte`
- Live local app: `http://127.0.0.1:5173/`
- Local service: `http://127.0.0.1:5174/`
- Critique packet: `docs/design/open-design-ux-critique-2026-07-02.md`

## Prompt

Create two bounded UI/UX proposal variants for Lingotorte, a local-first language-learning video app for Janusz-owned/local media and subtitles/transcripts.

Use source context from:

- `AGENTS.md`
- `README.md`
- `PLAN.md`
- `docs/dev/local-runbook.md`
- `docs/review/safety-privacy-boundary-review.md`
- `docs/design/open-design-ux-critique-2026-07-02.md`
- `apps/web/src/app.ts`
- `apps/web/src/model.ts`
- `apps/web/src/style.css`

Preserve these constraints:

- local/private by default;
- no Lingopie proprietary source code, assets, API payloads, media, subtitles, catalog/account data, credentials, tokens, or style copying;
- no DRM/circumvention, protected-stream capture, credential/cookie extraction, automatic online media download, provider calls, public writes, push/PR/release/deploy/public sharing, cloud sync, AnkiConnect, or microphone recording;
- provider, model-download, online STT/translation/LLM, public-caption, and media-download concepts must remain explicit opt-in gates;
- generated/provider transcripts remain draft evidence until corrected/approved;
- saved words/phrases/sentences/review cards must remain anchored to the exact source media/cue/time/token or word span/transcript version.

Center the design around Lingotorte's core artifact:

> a local video segment plus aligned transcript/subtitle cue, with vocabulary, phrase/sentence saving, review, practice, provenance, and operations orbiting that artifact.

## Required outputs

Write proposal artifacts under:

```text
docs/design/open-design-proposals/2026-07-02-lingotorte-ux/
```

Produce exactly these artifacts:

1. `variant-a-study-cockpit.html` — self-contained HTML prototype for the Immersive Study Cockpit.
2. `variant-b-transcript-workbench.html` — self-contained HTML prototype for the Transcript Correction Workbench.
3. `proposal-rationale.md` — rationale, component taxonomy, state inventory, accessibility notes, and implementation slice recommendations.
4. `artifact-manifest.json` — list the generated artifacts, status `proposal`, source files consulted, non-authorizations, and any caveats.

Do not edit production app files in this run unless explicitly asked later. In particular, do not edit:

- `apps/web/src/app.ts`
- `apps/web/src/model.ts`
- `apps/web/src/style.css`
- package files, tests, local-service code, or runtime config

## Variant A — Immersive Study Cockpit

Optimize the normal study session.

Prototype states to include:

1. Empty player before import.
2. Loaded synthetic fixture with current target/native cue.
3. Word selected from overlay/transcript with source-backed save panel.
4. Draft transcript loaded with save blocked until approval.
5. Saved occurrence/review handoff affordance.

Design goals:

- video is the primary canvas;
- transcript is a co-pilot, not a disconnected list;
- selected word/phrase/sentence feels attached to cue/time/media;
- loop/replay/speed controls read as study tools;
- local-only/provider state is visible but calm;
- keyboard/focus affordances are explicit.

## Variant B — Transcript Correction Workbench

Optimize transcript generation, correction, provenance, and approval.

Prototype states to include:

1. No transcript / choose source candidate.
2. Draft caption/ASR track with warnings.
3. Cue correction with timing/source comparison.
4. Word timing inspection/correction.
5. Approved track summary and learner-save readiness.

Design goals:

- make source candidates, draft tracks, correction, quality/provenance, and approval feel staged;
- distinguish local-safe actions from public metadata reads and online audio upload;
- make approval state hard to miss without creating alarm fatigue;
- keep source/provenance labels honest;
- support dense correction work without losing the video/cue artifact.

## Style guidance

- Dark UI is acceptable but not mandatory; preserve a calm local-workbench feel.
- Avoid generic SaaS dashboard aesthetics and marketing hero chrome.
- Avoid mimicking Lingopie branding or proprietary styling.
- Use self-contained CSS/JS in prototypes; no external CDN/fonts/assets.
- Prefer readable typography, strong hierarchy, 40px+ hit targets, tabular numbers for time, visible focus, and reduced-motion-friendly interactions.
- If interactions are simulated, label them as prototype-only.

## Handoff expectations

`proposal-rationale.md` should explicitly include:

- components/tokens to carry into production;
- what to implement first;
- what to reject/defer;
- accessibility considerations;
- privacy/gating considerations;
- expected validation commands for later implementation;
- caveat that these are proposal artifacts, not production implementation approval.
