# Public Product Cartography

Status: public/reference feature map. Planning only.

## Boundary

Lingopie public docs are used to understand feature taxonomy and learning mechanics only. Do not copy proprietary UI copy, branding, media, subtitles, catalog data, or implementation. Revalidate public URLs and quotes before legal, dependency, or implementation claims.

## Public Lingopie docs/blog/help-center map and evidence table

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



## Feature claims and local-product implications

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



## Known public-doc gaps

- Exact in-player token popup fields require either public-doc revalidation or a gated visible-UI-only inspection.
- Exact game internals should not be inferred beyond public descriptions unless a safe test account/mutation scope is approved.
- Public docs do not authorize copying proprietary assets/copy/style.
