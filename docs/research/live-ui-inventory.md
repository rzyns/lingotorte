# Sanitized Live UI Inventory — Lingopie Reference

**Source:** Edge/CDP/MCP live inspection of logged-in Lingopie Polish app  
**Capture status:** CDP working at `127.0.0.1:9225` during inspection  
**Evidence screenshots:** local files listed below  
**Privacy posture:** sanitized; raw private vocabulary/account examples omitted.

## Browser/CDP status

- CDP endpoint was reachable at `127.0.0.1:9225`.
- `/json/version` returned `Edg/150.0.4078.5` and a valid browser websocket URL.
- MCP page discovery selected `https://lingopie.com/app/catalog/polish`.

## Screenshot evidence

These local screenshot paths were captured during the preliminary investigation:

- Catalog: `<local-home>/lingopie-cdp-catalog-polish.png`
- Show detail/interstitial: `<local-home>/lingopie-cdp-show-detail.png`
- Player after start: `<local-home>/lingopie-cdp-player-after-start.png`
- Practice route: `<local-home>/lingopie-cdp-practice-real.png`

## Catalog route inventory

Observed route:

```text
/app/catalog/polish
```

Observed app shell mechanics:

- Top nav includes:
  - `My Learning`
  - `Practice`
  - `Download Apps`
- Side nav includes:
  - `Catalog`
  - `Short Stories`
  - `My Library`
- Progress widgets include:
  - today’s goal minutes;
  - watching count;
  - streak days;
  - words due.
- Catalog controls include filters:
  - `Level`
  - `Duration`
  - `Genres`
- Content is organized into rails such as continue watching, popular/top lists, genre/topic rails, beginner-friendly rail, and cross-language recommendations.

Local-product implications:

- Lingotorte probably does not need a streaming catalog for MVP.
- It does need a local **library/episode** surface with progress, recently watched media, and maybe filterable local media collections.
- Progress widgets should be learner-owned local data, not service sync.

## Episode detail / interstitial inventory

Observed route shape:

```text
/app/show/<showId>/episode/<episodeId>
```

Observed mechanics:

- Episode/title detail before player mode.
- Guided-mode control.
- Embedded video iframe source.
- `Skip & Start Watching` entry into player mode.

Local-product implications:

- Lingotorte can model this as an episode/media detail page with:
  - media metadata;
  - subtitle track availability;
  - learner mode selection;
  - resume/start action.
- Guided mode should be treated as a possible later feature, not an MVP requirement.

## Player inventory

Observed mechanics after entering player mode:

- Custom learning player chrome around embedded video.
- Elapsed/total time display.
- Progress bar with vocabulary/checkpoint markers.
- Playback controls including previous/next/play/volume.
- Speed/caption/fullscreen controls.
- `Listen` control.
- `Loop` control.
- Dual subtitle overlay:
  - target-language line with tokenization affordance;
  - English/native translation line.
- Side panel tabs:
  - `Read Along`
  - `My Vocab`
  - `Learning Feed`
- Transcript rows are tokenized into clickable cells.
- Sentence-level actions appear in transcript context:
  - `Explain`
  - `Save`
- Grammar/POS feature visible:
  - `Grammar Index`
  - POS categories such as `noun`, `verb`, `adjective`, `adverb`
  - color-coded grammar visualization.

Local-product implications:

- The MVP player should prioritize:
  - dual subtitle rendering;
  - transcript synchronized to video time;
  - clicking transcript/token to seek or inspect;
  - loop current cue;
  - speed controls;
  - saved occurrence actions.
- Vocabulary checkpoint markers are useful but can be V1 if MVP time is tight.
- Grammar Index can start as Universal POS coloring; richer grammar explanations can be adapter/LLM-backed later.

## Practice route inventory

Correct route:

```text
/app/education/review
```

Earlier direct guess `/app/practice/polish` returned a not-found page; this is now corrected.

Observed heading and framing:

- `Practice in Context`
- Personalized word count shown in UI.

Observed game entrypoints:

- `Flip & Learn`
- `Match Your Words`
- `Perfect Your Vocab`
- `Build the Sentence`

Observed sections/tabs:

- Parent sections:
  - `My Vocab`
  - `My Sentences`
- Review states:
  - `Learning`
  - `Due to Review (SRS)`
  - `Mastered`
- Filters/search.

Observed vocabulary row shape, sanitized:

- target word/phrase;
- English meaning;
- POS and morphology labels;
- last-occurrence sentence context with target item highlighted;
- source show/episode link;
- last occurrence age;
- appearance count;
- SRS level/step indicators.

Local-product implications:

- Lingotorte should treat review items as occurrences, not free-floating dictionary entries.
- Saved items need at least:
  - item kind: lexeme/phrase/sentence;
  - display text;
  - meaning/notes;
  - source cue/time range;
  - source media;
  - POS/morph metadata when available;
  - occurrence count;
  - review card state.
- Game modes can map to local media:
  - `Flip & Learn` → FSRS flashcard;
  - `Match Your Words` → clip/audio-to-word matching;
  - `Perfect Your Vocab` → meaning/translation quiz;
  - `Build the Sentence` → token/phrase reconstruction.

## Inspection caveats

- One episode was opened and playback entered to observe the player. This may have affected continue-watching progress.
- No deliberate vocabulary save/review/pronunciation/account mutation was performed.
- The inspection intentionally avoided cookie/localStorage/token/private API extraction.
- This inventory captures product mechanics only, not proprietary data or assets.

## Further safe inspection ideas

If Janusz wants more live UI inventory later, safe next steps are:

1. Observe settings/preferences screens without editing values.
2. Observe game screens only if a throwaway/test account or explicit mutation permission exists.
3. Record interaction shapes using screenshots and notes, not raw data dumps.
4. Prefer public docs for exact feature claims when possible.
