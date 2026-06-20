# Lingopie Behavior Reference for Lingotorte

Status: sanitized behavior reference. Lingopie is a reference product only. This document captures public docs and sanitized visible UI mechanics without copying proprietary code, assets, media, subtitles, catalog data, private account data, or private API payloads.

## Evidence labels

- `PUBLIC-DOC`: public Lingopie/help/blog/marketing documentation summarized by the planning artifacts.
- `SANITIZED-LIVE-UI`: visible UI mechanics from the existing read-only/sanitized inventory.
- `DESIGN-RECOMMENDATION`: local Lingotorte equivalent inferred from evidence and project constraints.
- `PROJECT-CONSTRAINT`: binding local/private/owned-media boundary.

## Public documentation evidence table

### Lingopie public product evidence

| ID | Label | Source | Short excerpt / observation | Planning use |
|---|---|---|---|---|
| E-LP-PUB-001 | public docs | https://help.lingopie.com/support/solutions/articles/150000076263-how-to-use-video-features-on-lingopie- | “Choose the language for your subtitles…” | Subtitle language selection / dual-subtitle planning. |
| E-LP-PUB-002 | public docs | same as E-LP-PUB-001 | “Hover over, click, or pause a word to see captions highlight in colors representing different parts of speech…” | Token interaction + POS coloring baseline. |
| E-LP-PUB-003 | public docs | same as E-LP-PUB-001 | “Replay videos to improve comprehension and pronunciation.” | Listen/repeat control. |
| E-LP-PUB-004 | public docs | same as E-LP-PUB-001 | “Record yourself repeating video captions… Get instant feedback…” | Pronunciation/shadowing is a later opt-in feature, likely ASR-backed. |
| E-LP-PUB-005 | public docs | same as E-LP-PUB-001 | “Practice tricky sentences by automatically replaying them using the auto-loop icon.” | Loop-current-cue MVP behavior. |
| E-LP-PUB-006 | public docs | same as E-LP-PUB-001 | “Adjust the playback speed with the slow down button.” | Playback speed control. |
| E-LP-PUB-007 | public docs | https://help.lingopie.com/support/solutions/articles/150000174278-lingopie-grammar-tutor | “Explain Sentence feature helps you understand grammar, structure, and meaning…” | Sentence explanation panel / grammar adapter. |
| E-LP-PUB-008 | public docs | same as E-LP-PUB-007 | “You can click Save next to any explanation.” | Saved sentences as first-class learner objects. |
| E-LP-PUB-009 | public docs | https://help.lingopie.com/support/solutions/articles/150000174369-how-to-use-the-word-list-my-vocab- | “Click on any word… automatically be saved… under ‘My Vocab’.” | Save-word flow and vocabulary list. |
| E-LP-PUB-010 | public docs | same as E-LP-PUB-009 | “See its meaning… Check the show and episode where it appeared… Track how many times you’ve seen it…” | Saved item should preserve source media/cue and occurrence count. |
| E-LP-PUB-011 | public docs | https://help.lingopie.com/support/solutions/articles/150000174403-how-to-use-the-grammar-index- | “Each word is color-coded by type: Nouns – Blue; Verbs – Pink; Adjectives – Green; Adverbs – Brown.” | POS color legend seed; do not copy exact styling blindly. |
| E-LP-PUB-012 | public docs | https://help.lingopie.com/support/solutions/articles/150000174380-lingopie-learning-games-flashcards-pop-quiz-word-master-sentence-wizard | “Open the Practice section… Saved or reviewed words and sentences also appear under My Vocab and My Sentences…” | Practice nav and saved-item sections. |
| E-LP-PUB-013 | public docs | same as E-LP-PUB-012 | “Flashcards use spaced repetition…” | SRS-backed reviews. |
| E-LP-PUB-014 | public docs | same as E-LP-PUB-012 | “Pop Quiz tests saved vocabulary using the context of the original video…” | Context-backed quiz mode. |
| E-LP-PUB-015 | public docs | same as E-LP-PUB-012 | “Word Master plays a short video clip… select the word…” | Clip-to-word matching mode. |
| E-LP-PUB-016 | public docs | same as E-LP-PUB-012 | “Sentence Wizard… arrange scrambled sentence parts correctly.” | Sentence reconstruction mode. |

### Sanitized live UI evidence already in repo

| ID | Label | Source | Short excerpt / observation | Planning use |
|---|---|---|---|---|
| E-LP-LIVE-001 | live UI observation | `docs/research/live-ui-inventory.md` | Catalog route `/app/catalog/polish`; nav includes My Learning, Practice, Catalog, Short Stories, My Library. | Local library surface can borrow information architecture patterns without catalog cloning. |
| E-LP-LIVE-002 | live UI observation | same | Progress widgets: goal minutes, watching count, streak days, words due. | Local dashboard widgets should be computed from local learner state. |
| E-LP-LIVE-003 | live UI observation | same | Episode route shape `/app/show/<showId>/episode/<episodeId>` and interstitial with `Skip & Start Watching`. | Local media detail page + start/resume mode. |
| E-LP-LIVE-004 | live UI observation | same | Player: elapsed/total time, progress bar, playback controls, speed/caption/fullscreen. | Base player chrome requirements. |
| E-LP-LIVE-005 | live UI observation | same | Player has `Listen`, `Loop`, dual subtitle overlay, Read Along, My Vocab, Learning Feed. | MVP interactive player + side-panel structure. |
| E-LP-LIVE-006 | live UI observation | same | Transcript rows are tokenized into clickable cells; sentence actions `Explain` and `Save`. | Token/cue event model and saved occurrence actions. |
| E-LP-LIVE-007 | live UI observation | same | Grammar Index with POS categories: noun, verb, adjective, adverb; color-coded visualization. | POS/morphology adapter output should be renderable in transcript/player. |
| E-LP-LIVE-008 | live UI observation | same | Practice route `/app/education/review`; headings/sections include `Practice in Context`, My Vocab, My Sentences. | Practice area routes around context-backed saved items. |
| E-LP-LIVE-009 | live UI observation | same | Review states: Learning, Due to Review (SRS), Mastered. | Learner-state vocabulary/card status buckets. |
| E-LP-LIVE-010 | live UI observation | same | Vocabulary row: target item, meaning, POS/morph labels, last-occurrence context, source show/episode, appearance count, SRS step. | SavedItem + Occurrence + ReviewCard data model requirements. |



## Sanitized live UI observations

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

- Catalog: `/home/openclaw/lingopie-cdp-catalog-polish.png`
- Show detail/interstitial: `/home/openclaw/lingopie-cdp-show-detail.png`
- Player after start: `/home/openclaw/lingopie-cdp-player-after-start.png`
- Practice route: `/home/openclaw/lingopie-cdp-practice-real.png`

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


## Feature-by-feature behavior reference

## Feature-behavior matrix

| Feature / behavior | Evidence IDs | Evidence label(s) | Local Lingotorte equivalent | Confidence | Notes / tradeoffs |
|---|---|---|---|---|---|
| Owned/local media import | E-LOCAL-001, E-LOCAL-002, E-OSS-003, E-OSS-007 | inference/recommendation; OSS source/docs | Import local video/audio files and external/embedded subtitle tracks; store file references and hashes locally. | High | Must not depend on Lingopie catalog/media. |
| Dual subtitles | E-LP-PUB-001, E-LP-LIVE-005, E-OSS-012 | public docs; live UI observation; OSS source/docs | Render target subtitle plus optional native-language subtitle; allow track selection. | High | Need alignment rules for tracks that do not share cue boundaries. |
| Interactive transcript / read-along | E-LP-LIVE-005, E-LP-LIVE-006, E-OSS-001, E-OSS-015 | live UI observation; OSS source/docs | Cue list synced to playback; clicking cue seeks; current cue highlighted. | High | `media-captions` and asbplayer show web viability. |
| Token click / hover lookup | E-LP-PUB-002, E-LP-LIVE-006, E-OSS-011, E-OSS-014 | public docs; live UI observation; OSS source/docs | Tokenize cues; click/hover token opens dictionary/POS/translation panel. | High | Multi-language tokenization requires adapter layer; Polish needs serious morphology support. |
| Phrase selection | E-LP-PUB-009, E-LP-PUB-012, E-OSS-011 | public docs; OSS source/docs | Allow selected span to become a saved phrase occurrence. | Medium | Direct Lingopie phrase behavior is public-doc supported but details need UI/spec expansion. |
| Grammar/POS index | E-LP-PUB-002, E-LP-PUB-011, E-LP-LIVE-007 | public docs; live UI observation | Universal POS color layer; richer morphology and grammar cards via adapters. | High | Do not clone exact visual style; color categories are a concept, not proprietary assets. |
| Explain sentence | E-LP-PUB-007, E-LP-PUB-008, E-LP-LIVE-006 | public docs; live UI observation | Sentence-level explanation generated from local parse/LLM adapter; save explanation to My Sentences. | Medium | Public docs describe behavior; implementation can be local/offline or explicit opt-in online. |
| Save word / My Vocab | E-LP-PUB-009, E-LP-PUB-010, E-LP-LIVE-010 | public docs; live UI observation | Save token/lexeme occurrence with meaning, source cue/media, occurrence count, review state. | High | Occurrence-backed vocabulary is more valuable than free-floating dictionary entries. |
| Save sentence / My Sentences | E-LP-PUB-008, E-LP-PUB-012, E-LP-LIVE-008 | public docs; live UI observation | Save complete cue/sentence and optional explanation for later review. | High | Requires sentence/cue identity and media time range. |
| Listen / repeat cue | E-LP-PUB-003, E-LP-LIVE-005 | public docs; live UI observation | Replay current cue or selected segment. | High | Easy MVP behavior if cue timings are reliable. |
| Loop subtitles / current cue | E-LP-PUB-005, E-LP-LIVE-005 | public docs; live UI observation | Toggle loop for active cue or selected subtitle range. | High | MVP requirement; should integrate with speed controls. |
| Playback speed | E-LP-PUB-006, E-LP-LIVE-004 | public docs; live UI observation | Slow/normal/faster playback; maybe per-gap behavior later. | High | Browser media APIs cover simple cases; mpv approaches cover more. |
| Progress widgets | E-LP-LIVE-002 | live UI observation | Local dashboard from watch time, streak, due cards, saved counts. | Medium | Useful after MVP learner state exists; not central first spike. |
| FSRS-backed flashcards | E-LP-PUB-013, E-OSS-008, E-OSS-009, E-LOCAL-005 | public docs; OSS source/docs; inference/recommendation | Internal `ReviewCard` with FSRS state and append-only `ReviewEvent`; optionally export to Anki. | High | Use FSRS internally rather than inventing scheduler. |
| Pop Quiz / meaning quiz | E-LP-PUB-014, E-LP-LIVE-010 | public docs; live UI observation | Show cue/video context and ask meaning/lemma/translation choice. | Medium | Needs distractor generation; later than base flashcards. |
| Word Master / clip-to-word | E-LP-PUB-015, E-LP-LIVE-010 | public docs; live UI observation | Play short clip/audio and ask learner to identify target word. | Medium | Requires clip extraction or reliable cue replay. |
| Sentence Wizard / reconstruction | E-LP-PUB-016, E-LP-LIVE-008 | public docs; live UI observation | Scramble saved sentence tokens/phrases; check order; replay source cue. | Medium | Need robust token segmentation and handling of punctuation/clitics. |
| Anki export | E-OSS-004, E-OSS-006, E-OSS-010, E-OSS-014, E-OSS-020 | OSS source/docs | Optional export via AnkiConnect or `.apkg`/media package; keep Lingotorte internal state authoritative. | High | asbplayer/YALL/subs2srs prove workflow; exact API choice needs spike. |
| Subtitle parsing/rendering | E-OSS-007, E-OSS-015, E-OSS-016 | OSS source/docs | Normalize SRT/VTT/ASS/SSA cues; custom render and transcript list. | High | `media-captions` is a strong TS-first candidate; ffmpeg extraction still needed for embedded tracks. |
| ASR-generated subtitles | E-OSS-013, E-OSS-017, E-OSS-019 | OSS source/docs | Optional local Whisper/faster-whisper/whisper.cpp pipeline; export normalized subtitle track. | Medium | Compute/model size, timestamps, and language accuracy need local experiment. |
| Forced alignment | E-OSS-018, E-OSS-019 | OSS source/docs | Align known transcript/subtitle text to audio for better cue timings or word timestamps. | Medium | Requires quality spike; stable-ts is archived, WhisperX may require model/token constraints. |
| Dictionary / morphology / POS | E-LP-PUB-002, E-LP-PUB-011, E-LP-LIVE-010, E-OSS-011, E-OSS-014 | public docs; live UI observation; OSS source/docs | Adapter interface for tokenization, lemma, POS, morph, dictionaries, phrase translation, grammar explanation. | High | Critical architecture seam; avoid loose untyped payloads except versioned adapter outputs. |
| Pronunciation / shadowing | E-LP-PUB-004, E-OSS-013, E-OSS-017 | public docs; OSS source/docs | Later optional local ASR comparison and feedback; account/media stays local. | Low/Medium | Public product has feature, but high-quality scoring is nontrivial; should be V2/spike. |



## Observed vs inferred notes

- Observed live: catalog shell, player chrome, dual subtitle overlay, transcript/read-along panel, tokenized transcript cells, Listen/Loop controls, Explain/Save actions, Grammar Index/POS categories, practice route, My Vocab/My Sentences, SRS buckets, contextual saved-item row shape.
- Public documented: subtitle language selection, hover/click word and POS coloring, Listen/Repeat, auto-loop, speed adjustment, Grammar Tutor/Explain Sentence, My Vocab, practice games, spaced repetition, contextual video-backed practice.
- Inferred/recommended for Lingotorte: local library instead of streaming catalog; source-backed saved occurrences; generic POS coloring rather than copied styling; FSRS internal scheduling; local provider gates; optional ASR/pronunciation; metadata-only backup default.
