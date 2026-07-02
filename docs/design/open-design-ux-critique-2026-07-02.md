# Lingotorte Open Design UX Critique Packet — 2026-07-02

Status: source-backed critique packet for a design-only Open Design pass. This is not production implementation approval.

## Scope

Use Open Design to improve Lingotorte UI/UX before further feature development, while preserving the local-first/privacy/legal boundaries already captured in `AGENTS.md`, `PLAN.md`, and `docs/review/safety-privacy-boundary-review.md`.

This critique packet is intended to feed two bounded Open Design proposal variants:

1. **Immersive Study Cockpit** — optimize the normal video/transcript study session.
2. **Transcript Correction Workbench** — optimize draft/correction/source-comparison/approval workflows.

## Evidence inspected

| Evidence | Result |
|---|---|
| Open Design project registration | `Lingotorte` project created/registered against `/home/openclaw/workspace/lingotorte`; project id `21b550d6-5d5f-4991-bf82-a13dca951e52`; resolved directory read back as `/home/openclaw/workspace/lingotorte`. |
| Current git posture | `main...origin/main [ahead 2]`; pre-existing unrelated local dirt: `.gitignore` modified and `.understand-anything/` untracked. |
| Live Vite app | `curl -I http://127.0.0.1:5173/` returned HTTP 200; HTML shell loads `/src/main.ts`. |
| Live local service | `curl http://127.0.0.1:5174/api/health` returned `ok: true`, service `lingotorte-local-service`, version `0.1.0`, host `127.0.0.1`, port `5174`. |
| Local service status caveat | Current running service reports `allowOnlineProviders: true`, ElevenLabs key present/ready. No provider endpoints were invoked during this critique. Design proposals must still keep provider calls explicit opt-in. |
| Browser visual QA | Browser/CDP bridge was unavailable from this Hermes session: CDP discovery timed out on `127.0.0.1:9225`; pixel-level screenshot QA was not performed in this pass. |
| Focused privacy/network tests | `npm run test:no-network` passed: 2 files, 5 tests. |
| Focused web tests | `npm run test:web` passed: 9 files, 64 tests. Vitest reported expected jsdom `HTMLMediaElement.play()` not implemented stderr in player tests; suite passed. |
| Source inspected | `apps/web/src/app.ts`, `apps/web/src/model.ts`, `apps/web/src/style.css`, `README.md`, `PLAN.md`, `docs/dev/local-runbook.md`. |

## Product contract to preserve

Lingotorte is a local/private language-learning video app for Janusz-owned/local media and explicit/generated/corrected subtitles/transcripts.

Non-negotiables:

- Do not copy Lingopie proprietary source, assets, private API payloads, media, subtitle files, catalog data, account data, credentials, or tokens.
- Do not perform DRM circumvention, protected-stream capture, credential/cookie extraction, automatic online media download, provider calls, public writes, cloud sync, AnkiConnect, microphone recording, push/PR/release/deploy/public sharing, or destructive cleanup from this design pass.
- Preserve local-first defaults and visible provider/download/sync gates.
- Provider captions, ASR, and online STT outputs remain **draft evidence** until correction/approval.
- Saved words/phrases/sentences/review cards should orbit the exact source artifact: media + cue + timing + token/word span + transcript version/provenance.
- Use synthetic/local fixtures and source/docs as design context.

## Current UI anatomy from source

`apps/web/src/app.ts` renders a single DOM-based app with top-level views:

- `Player`
- `Library`
- `Saved`
- `Review`
- `Practice`
- `Export / Import`
- `Settings`

Core sections:

- Header/nav: `renderHeader`, `renderNav`.
- Player: `renderPlayerView`, `renderVideoStage`, `renderPlayerControls`, `renderTranscriptPanel`, `renderSelectionPanel`.
- Transcript overlay: `subtitle-overlay`, windowed target/native subtitles, clickable `subtitle-word` buttons.
- Transcript lifecycle: `renderTranscriptLifecyclePanel` with YouTube caption draft import, local ASR draft, ElevenLabs Scribe draft, correction textareas, timing/word timing edits, split/merge, corrected version creation, approval.
- Saved state: `renderSavedView` with My Vocab/My Sentences tabs and occurrence links.
- Review/practice: `renderReviewView`, `renderPracticeView` with source-backed cue context.
- Export/import: local manifest generation/download, restore preview, privacy warnings, merge/update confirmation.
- Settings: local service URL/connect/save/autosave/provider status.

Styling is currently centralized in `apps/web/src/style.css` with dark tokens, cards, pill nav, player layout (`1fr 360px` at desktop), transcript rows, selection forms, saved/review cards, status banners, and reduced-motion handling.

## Current strengths

1. **Functional local-first loop exists.** The app already supports synthetic fixture load, local media import, local-service persistence, player/transcript, saved items, review, practice, export/import, and transcript lifecycle gates.
2. **The core artifact is present.** Video + aligned transcript cue + saved occurrence context are already in the model and UI.
3. **Safety posture is visible.** Footer says local-only/providers disabled by default; provider/caption/ASR controls use explicit authorization wording.
4. **Keyboard/user controls exist.** Cue navigation, replay, loop, speed, transcript search, and click-to-seek/word interactions are implemented.
5. **Transcript lifecycle semantics are strong.** Draft/correcting/approved, source comparison, correction, split/merge, word timings, and approval are represented.
6. **Tests cover the product grammar.** Focused web/no-network suites pass and include player/transcript, saved occurrence, review, practice, export/import, settings, no-network, and transcript lifecycle flows.

## Current UX friction / design opportunities

### F1 — Top-level navigation is feature-list shaped, not workflow shaped

The current nav exposes all major product areas as peer pills. This is workable for a prototype, but it does not teach the user the central learning journey:

```text
Library/import → study player → save context → review/practice → backup/settings
```

Design opportunity: keep all destinations reachable, but make the primary workflow obvious and avoid making `Settings`/`Export` feel as important as the study artifact.

### F2 — The Player surface could make the artifact more central

The current player layout puts video on the left and transcript in a card on the right, with controls and selection below. The core artifact exists, but the UI could more strongly communicate:

- current cue as the active study object;
- target/native subtitle relationship;
- current transcript status/provenance;
- selected word/phrase/sentence and save action;
- loop/replay/speed as study tools rather than generic media controls.

Design opportunity: create an “immersive study cockpit” where video/current cue/transcript/selection are one coherent artifact workspace.

### F3 — Selection/save flow is functional but visually detached

`renderSelectionPanel` appears below the video as a generic card. It says “Selection” and supports meaning/notes/save occurrence, but it is not visually tied to the selected word in the overlay/transcript.

Design opportunity: make selected text feel anchored to the cue/media/time, with a compact “source-backed save” panel near the artifact and clear word/phrase/sentence modes.

### F4 — Transcript lifecycle is powerful but dense

`renderTranscriptLifecyclePanel` currently lives inside Library and contains many concepts:

- YouTube URL/video ID;
- public-read authorization;
- ElevenLabs authorization;
- local ASR absolute path;
- fake/public caption import;
- local ASR generation;
- ElevenLabs generation;
- current transcript metadata;
- per-cue correction textareas;
- start/end timing inputs;
- word-timing rows;
- split/merge;
- create corrected version;
- approve for study.

This is semantically correct but likely cognitively heavy.

Design opportunity: reframe it as a dedicated “Transcript Workbench” with staged lanes:

```text
Source candidates → Draft track → Correction queue → Quality/provenance → Approved study track
```

### F5 — Provider gates need hierarchy, not just checkboxes

The provider gates are explicit, which is good. But the UI should distinguish:

- fake/local-safe demo paths;
- public metadata reads;
- local ASR that needs local dependencies;
- online STT that sends audio to ElevenLabs.

Design opportunity: use clear risk tiers, status badges, and disabled/default-off copy without burying the main local workflow.

### F6 — Review/practice are source-backed but not yet motivational or polished

Review and Practice already preserve source context and have deterministic tests, but the visual treatment is still prototype-card style. They need better prompt/reveal/rating rhythm, progress context, and “replay source cue” affordance.

Design opportunity: defer major review/practice redesign until the study/correction surfaces are clarified, but reserve a design language for source-backed prompts and FSRS state.

### F7 — Export/settings/local-service surfaces are operationally correct but not productized

Export/import and settings communicate important privacy and local-service behavior, but they are currently utility panels. Later B1/B2/B3 work will need these screens to feel trustworthy and less ad hoc.

Design opportunity: define visual language for “local operations” without letting settings dominate the learning loop.

### F8 — Visual polish is solid baseline but not distinctive

Current style is a restrained dark card UI. It is readable and safe, but not yet product-defining. Opportunities:

- stronger typography scale and rhythm;
- more intentional spacing between artifact/workflow regions;
- richer cue/word/sentence state badges;
- stable “local/private/source/provenance” visual vocabulary;
- better touch target consistency;
- subtle motion/hover/press states without animation-heavy distraction.

## Proposal objectives for Open Design

Open Design should produce **proposal artifacts only**, not production code. The goal is to choose a direction and implementation slices, not to silently rewrite Lingotorte.

Required proposal qualities:

- artifact-centered, not generic dashboard/SaaS;
- local/private and provider-gated by default;
- source/provenance/status labels clear and honest;
- transcript lifecycle legible from draft to approved;
- study controls feel like learning tools, not just media controls;
- works with synthetic/local fixtures and no account/provider assumptions;
- accessible keyboard and focus states considered;
- mobile/narrow behavior sketched at least conceptually;
- production implementation broken into small reviewable slices.

## Requested Open Design variants

### Variant A — Immersive Study Cockpit

Optimize the normal study session.

Focus areas:

- Player as central artifact canvas.
- Current cue, transcript, native translation, and word-level interaction as one coherent workspace.
- Selected word/phrase/sentence source context and save action.
- Loop/replay/speed shortcuts as study affordances.
- Transcript search and active cue navigation with reduced cognitive load.
- Clear but calm local-only/provider-state indicators.

Expected screens/states:

1. Empty player before import.
2. Loaded synthetic fixture with current cue and native subtitle.
3. Word selected from overlay/transcript; save occurrence panel visible.
4. Draft transcript loaded; save blocked until approval.
5. Saved occurrence/review handoff affordance.

### Variant B — Transcript Correction Workbench

Optimize transcript generation, correction, provenance, and approval.

Focus areas:

- Source candidate intake: subtitle file, public captions, local ASR, ElevenLabs Scribe.
- Gated risk tiers: local/safe, public metadata read, local dependency-required, online audio upload.
- Draft/correcting/approved state machine.
- Cue correction, timing edit, word timing edit, split/merge.
- Source comparison and quality/provenance report.
- Explicit approval for study.

Expected screens/states:

1. No transcript / choose source candidate.
2. Draft caption/ASR track with warnings.
3. Cue correction workbench with timing and source comparison.
4. Word timing inspection/correction.
5. Approved track summary and learner-save readiness.

## Non-goals for this Open Design pass

- Production implementation.
- New storage schema/migrations.
- New provider integration.
- Live provider calls, model downloads, or media downloads.
- Lingopie asset/style copying.
- Full review/practice redesign.
- Cloud sync, AnkiConnect, microphone/shadowing, mobile packaging.
- Public deployment or push/PR/release.

## Suggested implementation slices after review

Only after Janusz reviews and approves a direction:

1. **UX-1 visual/system shell polish** — tokens, surfaces, typography, focus, buttons, badges, status/risk language.
2. **UX-2 study cockpit layout** — player/transcript/selection/source context cohesion.
3. **UX-3 transcript workbench structure** — staged lifecycle UI and correction hierarchy.
4. **UX-4 review/practice polish** — source-backed prompt/reveal/rating flow.
5. **UX-5 operations polish** — settings/local-service/export/import clarity for B1/B2/B3.

## Acceptance checks for later implementation

- `npm run test:web`
- `npm run test:no-network`
- `npm run typecheck`
- `npm run scan:privacy`
- browser smoke against synthetic fixture when browser automation is available
- no provider calls/downloads/sync/public writes unless separately approved
- exact-scope git diff and local commit for durable implementation changes
