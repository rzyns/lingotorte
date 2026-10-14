---
name: ux-audit
description: Run a structured UX/UI audit of the Lingotorte web app — visual design critique, Nielsen heuristic evaluation, and cognitive walkthroughs of the three core learner tasks (load media+transcript, watch+collect cards, review cards). Use when asked to "audit the UX", "review the design", "what's ugly / clunky", "streamline the flow", or before/after a UI change. Produces a severity-ranked findings file; never redesigns in the same pass.
---

# Lingotorte UX audit

You are auditing a **personal, local-first language-learning video app** used by one person (Janusz) on his own media. There is no onboarding funnel, no marketing surface, no multi-user concerns. Optimise for *daily-driver* ergonomics: few steps, nothing in the way, state always visible.

## Ground rules

1. **Findings first, fixes second.** This skill produces a findings report. Do not restyle or refactor during the audit. A separate pass acts on the prioritised list.
2. **Three evidence labels, always:** `[observed]` (seen in the running app), `[code]` (established from source, cite file:line), `[inferred]` (your judgement). Never present `[inferred]` as `[observed]`.
3. **Severity on every finding:** `blocker` (task cannot complete) / `major` (task completes with real friction or wrong result) / `minor` / `cosmetic`.
4. **Measure against the three core tasks below**, not against generic best practice. A heuristic violation on a screen nobody uses in those tasks is `minor` at most.
5. **Compare to the previous audit** in `docs/review/ux-audit-*.md` (latest by date). Mark each prior finding as *fixed / still open / regressed* before adding new ones.

## The app in one paragraph

Vanilla TypeScript, no framework. `apps/web/src/app.ts` renders everything via `renderApp(model)` → `renderMain` switching on `model.view` (`player | library | saved | review | practice | export-import | settings`). All styling lives in `apps/web/src/style.css` (CSS custom properties on `:root`, dark theme). State is `AppModel` in `model.ts`; every interaction calls `rerenderApp(model)` which rebuilds the DOM. Optional local service on `127.0.0.1:5174` persists state; without it the browser shows an "unsaved" banner. Fixture media exists for smoke tests: **Library → Load synthetic fixture**.

## The three core tasks (the yardstick)

| Task | Entry | Success state | Ideal step count |
|------|-------|---------------|------------------|
| **A. Load** a video + transcripts | Library (or Player empty state) | Player shows video, dual subtitles, clickable transcript | ≤ 4 clicks incl. file pickers |
| **B. Watch & collect** words/phrases/sentences | Player | Item saved *with a meaning*, source anchor kept, learner stays in flow | 1 gesture + optional meaning entry |
| **C. Review** cards | Review | Due cards shown front→back, rated, next card; nothing manual between save and review | 0 setup clicks; `space` + `1-4` |

## Procedure

### Step 0 — Set up
- Confirm the dev server: `npm run local` (UI on `http://127.0.0.1:5173`, service on `:5174`). If a browser tool is available, open it; otherwise do a code-only pass and say so in the report header.
- Read `apps/web/src/style.css` fully and skim `app.ts` function index (`grep -n "^function render" apps/web/src/app.ts`).
- Read the latest `docs/review/ux-audit-*.md`.

### Step 1 — Mechanical checks (run, don't eyeball)
```bash
# Classes emitted by TS with no rule in style.css
cd apps/web/src
grep -oE "className = ['\`]([a-z0-9-]+)" app.ts morphologyPanel.ts | sed -E "s/.*= ['\`]//" | sort -u > /tmp/used.txt
grep -oE "^\.[a-z0-9-]+" style.css | sed 's/^\.//' | sort -u > /tmp/styled.txt
comm -23 /tmp/used.txt /tmp/styled.txt
```
Also check: number of children appended to `.lingotorte-app` vs `grid-template-rows` in `style.css`; every `status-banner` placement (is it near the action that caused it?); every string shown to the user that contains an id/hash/`token`/`chars`/`v1`.

### Step 2 — Visual design critique (per view: Player, Library, Saved, Review; others if asked)
Take a screenshot at 1280×800 and at 390×844 (mobile). For each view assess: hierarchy (what is biggest / brightest — is it the thing the learner reads?), spacing rhythm, unstyled UA defaults, text size of learner-facing content (target-language text should be the largest body text on screen), overlap/collision (subtitles vs native controls), jargon in labels.

### Step 3 — Heuristic evaluation (Nielsen's 10)
Walk each core-task screen against: visibility of system status · match with real world · user control & freedom (undo!) · consistency · error prevention · recognition over recall · flexibility/shortcuts · minimalist design · error recovery · help. Report only violations that touch Tasks A–C, one row each: heuristic, finding, severity, evidence.

### Step 4 — Cognitive walkthroughs (do them, don't imagine them)
For each of A, B, C, actually perform it in the browser using the fixture, counting steps and noting at every step: *Does the user know what to do? Can they see the control? Do they get feedback that it worked?* Record the actual step count vs the ideal above. Note any outcome that is technically "success" but produces a poor artifact (e.g. a review card with no answer side).

Specific probes that have caught real issues before — re-check each time:
- Does **Save sentence** / drag-select / word-click all lead to the *same* capture UI with a meaning field?
- Does saving give feedback **at the point of action** (not only in a distant status rail)?
- Does a saved item become a review card **without** a manual "Create review card" click?
- Does the Review front side differ from the back side when no meaning was entered?
- Does the subtitle overlay sit clear of the `<video controls>` bar?
- Does the "unsaved changes" banner tell the user *how* to save?
- Is the Transcript lifecycle / provider UI hidden when the current track is already approved?
- Does Library list previously imported media?

### Step 5 — Write the report
Create `docs/review/ux-audit-YYYY-MM-DD.md` with these sections, in this order:
0. One-paragraph diagnosis (the single biggest cause of "ugly" and the single biggest cause of friction).
1. Visual design table (`#`, finding, severity, evidence).
2. Heuristic table.
3. Task walkthroughs A/B/C: steps observed vs ideal, friction, **fix direction** (one sentence, not a design).
4. Prioritised fix list, ordered by (severity × breadth × cheapness). Number them; the next pass picks from the top.
5. Delta vs previous audit (fixed / open / regressed).
6. Appendix: mechanical-check outputs; what was *not* audited.

Keep findings terse. Cite `file:line` for `[code]`. Do not pad with praise; one line of "what's already good" per view is enough.

## When asked to *fix* instead of audit
Take the top-N items from the latest report's prioritised list, state which ones you're taking, implement, then re-run **Step 1** and the relevant **Step 4 probes** and append a "Delta" entry to the report. Respect project boundaries in `AGENTS.md` (local-first, providers opt-in, no Lingopie copying) and the commit policy in `GIT-POLICY.md`.
