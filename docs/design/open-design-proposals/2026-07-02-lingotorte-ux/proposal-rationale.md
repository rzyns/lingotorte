# Lingotorte Open Design UX Proposal — 2026-07-02

Status: proposal artifacts only. This packet is not production implementation approval and does not authorize provider calls, package changes, production app edits, public writes, push/PR/release/deploy, model downloads, media downloads, cloud sync, AnkiConnect, microphone recording, or proprietary Lingopie copying.

## Proposal artifacts

- `variant-a-study-cockpit.html` — Immersive Study Cockpit proposal for the normal local video/transcript study session.
- `variant-b-transcript-workbench.html` — Transcript Correction Workbench proposal for staged source selection, draft correction, word timing repair, provenance, and approval.

Both variants are self-contained HTML/CSS/JS proposal prototypes. They use synthetic/local examples and source-backed product semantics from the current Lingotorte docs and UI source.

## Design system direction

The proposal uses a calm dark local-workbench system rather than generic SaaS marketing chrome:

- deep blue-black background and raised slate surfaces;
- teal primary action for local-safe study progress;
- blue secondary accent for media/cue instrumentation;
- amber warning for gated public/local-dependency paths;
- red danger only for online audio upload or unapproved draft blocks;
- serif display headings for a warmer study-product feel, sans body for readability, and tabular monospace times/ids.

This intentionally avoids Lingopie branding, proprietary assets, public media examples, generic dashboard hero sections, and invented performance metrics.

## Component taxonomy to carry into production

### Shared tokens and primitives

- `local/private` badge: confirms browser/local-service state without alarm.
- `provider gated` badge: visible before risky actions, not as a global panic banner.
- `draft/correcting/approved` transcript status badge: the key learner-save gate.
- tabular `time range` token: used consistently for video time, cue spans, word timings, review replay, and saved occurrence anchors.
- source context row: media id/path label, cue id, time range, token span, char span, track version, and transcript source kind.
- risk-tier badges: local safe, public metadata read, local dependency required, online audio upload.

### Variant A — Study Cockpit components

1. **Artifact video canvas** — video remains primary; subtitle overlay is windowed and interactive.
2. **Study controls dock** — replay cue, loop, speed, previous/next semantics read as learning tools rather than generic media controls.
3. **Transcript co-pilot** — searchable active cue list stays beside the video, not as a detached document.
4. **Source context card** — selected text is visibly anchored to cue/time/media/track version.
5. **Source-backed save panel** — save word/phrase/sentence flow collects meaning/notes while preserving exact occurrence context.
6. **Draft approval gate** — draft/correcting tracks disable saves with clear explanation.
7. **Review handoff card** — saved occurrence leads to local review with replay-source affordance.

### Variant B — Transcript Workbench components

1. **Lifecycle stage rail** — source candidates → draft track → cue correction → word timing → approval.
2. **Source candidate cards** — each option carries risk tier and gate copy.
3. **Draft evidence panel** — unapproved tracks are usable for correction only.
4. **Cue correction editor** — text, timing, source comparison, split/merge, corrected-version creation.
5. **Word timing editor** — first-class word rows with text, start/end, source-kind status.
6. **Quality/provenance sidebar** — current status/source/readiness visible while working.
7. **Approval summary** — approval is the explicit unlock before learner saves.

## State inventory

### Variant A required states

| State | Proposal treatment | Production implication |
|---|---|---|
| Empty player before import | Import-first canvas explains local file + optional subtitles + gated ASR path. | Make `Player` empty state actionable without moving users through all nav peers. |
| Loaded synthetic fixture | Current cue/native subtitle, transcript co-pilot, status badges, and study controls are visible together. | Preserve synthetic fixture smoke path while improving layout. |
| Word selected | Save panel appears near the artifact and repeats media/cue/span/version context. | Move selection from generic lower card into artifact-adjacent source-backed panel. |
| Draft transcript loaded | Save actions blocked with calm, explicit approval-gate messaging. | Keep existing `transcriptStatus !== approved` guard; improve visual hierarchy. |
| Saved occurrence/review handoff | Handoff card points to local review with source replay. | Keep occurrence-first review creation and source replay affordance. |

### Variant B required states

| State | Proposal treatment | Production implication |
|---|---|---|
| No transcript / choose source candidate | Source cards clearly separate local-safe, public-read, local dependency, and online upload paths. | Replace dense lifecycle card with staged workbench or staged subpanel. |
| Draft caption/ASR warnings | Draft evidence panel blocks save readiness and surfaces provenance/warnings. | Preserve draft evidence until correction/approval. |
| Cue correction with comparison | Editor pairs corrected text/timing controls with source comparison and video cue. | Keep text/timing/split/merge; reduce cognitive load with staged layout. |
| Word timing inspection | Word rows make timings editable and source-kind-visible. | Continue treating word timings as first-class versioned data. |
| Approved track summary | Approval summary unlocks study readiness and records non-lossy provenance. | Keep approval as explicit state transition. |

## Accessibility considerations

- Maintain 40px+ touch/click targets; proposal buttons are 42px minimum.
- Preserve visible focus rings and keyboard navigability for tabs, stage rail, cue rows, controls, and form inputs.
- Keep cue/time values in tabular numerics for scannability.
- Use `aria-selected`, `aria-label`, clear form labels, and live/status regions in implementation.
- Respect reduced motion; proposal CSS disables transitions/animations under `prefers-reduced-motion`.
- Avoid relying on color alone: badges include text labels (`draft`, `approved`, `online audio upload`, etc.).
- Keep video/cue controls reachable without pointer-only interactions; existing shortcuts `[`, `]`, `R`, `,`, `.` should remain discoverable.

## Privacy and gating considerations

- Local file import and synthetic fixtures remain the default safe path.
- Public caption import must remain a visible public-read authorization and produce draft/untrusted tracks.
- Local ASR must remain a local dependency/model gate; no silent downloads or dependency installs.
- ElevenLabs/online ASR must remain explicit opt-in and must disclose that local audio/media leaves the machine.
- Provider outputs remain draft evidence until corrected and approved.
- Saved words/phrases/sentences/review cards remain anchored to exact media/cue/time/token/char span/transcript version.
- Logs/screenshots/artifacts should not include private media paths, raw provider payloads, secrets, or private account data.

## What to implement first

1. **UX-1 visual/status token shell** — introduce typed badge/status/risk primitives, focus styles, tabular time rows, and calm privacy/provider language in current CSS/components.
2. **UX-2 Study Cockpit layout** — reorganize `renderPlayerView`, `renderVideoStage`, `renderTranscriptPanel`, and `renderSelectionPanel` so video/cue/transcript/selection/source context are visually unified.
3. **UX-3 Transcript Workbench staging** — split `renderTranscriptLifecyclePanel` into source-candidate, draft, correction, word-timing, and approval sections without changing transcript semantics.
4. **UX-4 Review handoff polish** — improve saved occurrence → review card → replay source cue rhythm after UX-2 is stable.
5. **UX-5 Operations polish** — later: settings/export/local-service clarity after the core study/correction surfaces settle.

## What to reject or defer

- Do not implement a generic marketing dashboard or hero landing page for the product UI.
- Do not add OS widgets, home-screen quick surfaces, cloud sync, AnkiConnect, microphone/shadowing, provider benchmarking, or public sharing in this UX slice.
- Do not copy Lingopie names, branding, colors, assets, private data, or proprietary layout details.
- Do not introduce provider calls, model downloads, or online media acquisition while implementing visual proposals.
- Defer full review/practice redesign until study cockpit and transcript workbench hierarchy are reviewed.

## Expected validation commands for later implementation

Run focused checks for implementation slices after Janusz approves a direction:

```bash
npm run test:web
npm run test:no-network
npm run typecheck
npm run scan:privacy
python3 validate_final_bundle.py
git diff --check
```

For UI implementation, also run the local browser smoke from `docs/dev/local-runbook.md` against the synthetic fixture when browser automation is available. Live provider, model-download, public-caption, ASR dependency, public sharing, push/PR/release/deploy, or AnkiConnect checks require separate explicit approval.

## Caveats

- These HTML files are proposal prototypes, not production code.
- No pixel-level browser QA was performed in this generation pass; structural checks and source-backed design review should precede implementation.
- Current repo posture already has unrelated/pre-existing local dirt under `.gitignore`, `.od-skills/`, `.understand-anything/`, and untracked `docs/design/`; this packet should be reviewed as exact-scope proposal output.
