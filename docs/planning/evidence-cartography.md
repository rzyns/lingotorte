# Evidence Cartography — Lingotorte Planning

**Task:** `t_3a3c8051`  
**Scope:** planning evidence only; this is not an implementation artifact.  
**Workspace:** `/home/openclaw/workspace/lingotorte`  
**Safety boundary:** no proprietary Lingopie code/assets/private payloads, no DRM bypass, no private endpoint scraping, no cookies/tokens/localStorage dumps, no account mutation, no external side effects.

## Boundary statement

Lingotorte targets **owned/local media** and **explicit subtitle/transcript inputs** or **locally generated subtitles/transcripts**. Lingopie is used only as a public/reference product for understanding language-learning interaction mechanics. Lingotorte must not copy Lingopie proprietary code, catalog data, private subtitles/media/assets, branding, private account data, or private API payloads.

## Evidence label legend

- **public docs** — public help-center, marketing, blog, project docs, or official websites.
- **live UI observation** — sanitized live UI mechanics already captured in this repo; no raw private account/vocab data.
- **OSS source/docs** — public open-source repository or package documentation.
- **local experiment** — direct local execution or test output; none was performed for this cartography pass.
- **inference/recommendation** — synthesis from evidence; not a directly observed fact.

## Reusable evidence IDs

Use these IDs as anchors in later planning docs.

### Local workspace / boundary evidence

| ID | Label | Source | Short excerpt / observation | Planning use |
|---|---|---|---|---|
| E-LOCAL-001 | inference/recommendation | `AGENTS.md` | “Build a local-first learning tool for Janusz’s own videos/subtitles…” | Governs product scope and safety posture. |
| E-LOCAL-002 | inference/recommendation | `AGENTS.md` | “Own/local media only… explicit subtitle files or locally generated transcripts.” | Explicitly excludes proprietary catalog/media extraction. |
| E-LOCAL-003 | inference/recommendation | `AGENTS.md` | “The central artifact is a video segment plus aligned transcript/subtitle cue.” | Core product model for player, saved items, and SRS cards. |
| E-LOCAL-004 | inference/recommendation | `docs/research/preliminary-grounding-research.md` | “A local private Lingopie-like system is feasible if… scoped around owned local video + subtitle-based learning.” | Feasibility framing and MVP cut. |
| E-LOCAL-005 | inference/recommendation | `docs/research/preliminary-grounding-research.md` | “Use FSRS for internal scheduling.” | Scheduling recommendation. |
| E-LOCAL-006 | inference/recommendation | `docs/mission/lingopie-war-room-brief.md` | “Study `asbplayer` first as the strongest OSS substrate/reference…” | Prioritizes substrate investigation order. |

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

### OSS/source/doc substrate evidence

| ID | Label | Source | Short excerpt / observation | License / reuse note | Planning use |
|---|---|---|---|---|---|
| E-OSS-001 | OSS source/docs | https://github.com/asbplayer/asbplayer | “browser-based media player and Chrome extension developed for language learners…” | MIT; strong reuse/reference candidate. | First substrate to evaluate for local files, subtitles, Anki, and token status workflows. |
| E-OSS-002 | OSS source/docs | same | “Load text-selectable subtitles… streaming… or your own subtitle files.” | MIT. | Confirms local subtitle-file workflows are viable. |
| E-OSS-003 | OSS source/docs | same | “For local files: Drag-and-drop media/subtitle files into the asbplayer website.” | MIT. | Direct MVP analogue for local media ingestion. |
| E-OSS-004 | OSS source/docs | same | “Configure asbplayer to create cards via AnkiConnect…” | MIT; depends on Anki/AnkiConnect user setup. | Anki export bridge pattern. |
| E-OSS-005 | OSS source/docs | same | Word styling, reading annotation, frequency annotation, word browser, known-word stats. | MIT. | Rich word-state inspiration beyond Lingopie’s My Vocab. |
| E-OSS-006 | OSS source/docs | https://subs2srs.sourceforge.net/ | “parse through subtitle files… generate audio clips, snapshots and video clips…” | SourceForge project reports GPLv3; copy/reuse would impose GPL constraints. | Media-to-card batch pipeline reference, not obvious code substrate for permissive app. |
| E-OSS-007 | OSS source/docs | same | Supports `.srt`, `.ass`, `.ssa`, `.lrc`, `.trs`, `.idx/.sub`; uses ffmpeg. | GPLv3. | Subtitle/media support requirements and ffmpeg pipeline precedent. |
| E-OSS-008 | OSS source/docs | https://github.com/open-spaced-repetition/ts-fsrs | “TypeScript toolkit for building spaced repetition systems with FSRS.” | MIT. | Preferred internal scheduler for TS/Vite app. |
| E-OSS-009 | OSS source/docs | same | `scheduler.repeat(...)` previews outcomes; `scheduler.next(..., Rating.Good)` applies final rating. | MIT; Node >=20. | Data model should store card state + review logs compatible with FSRS flow. |
| E-OSS-010 | OSS source/docs | https://github.com/kgurniak91/yall-mp | “subtitle editing… dictionary lookups… Anki flashcards creation.” | GPLv3; avoid direct code incorporation unless GPL-compatible. | Strong UX/reference for timeline editing, mpv, waveform, Yomitan, Anki export. |
| E-OSS-011 | OSS source/docs | same | Smart tokenization via `Intl.Segmenter` or dictionary-based scanning; multi-track support. | GPLv3. | Tokenization/dictionary adapter design clue. |
| E-OSS-012 | OSS source/docs | https://github.com/umlx5h/LLPlayer | “dual subtitles, AI-generated subtitles, real-time translation, word lookup…” | GPL-3.0; Windows/C# beta. | Reference for ASR/translation/local-vs-online tradeoffs. |
| E-OSS-013 | OSS source/docs | same | ASR engines: `whisper.cpp` and `faster-whisper`; ASR runs locally after model download. | GPL-3.0 project; underlying engines have their own licenses. | Local generated subtitles pipeline candidate. |
| E-OSS-014 | OSS source/docs | https://github.com/svdC1/mirumoji | “self-hosted Japanese Immersion Toolkit… clickable tokenized subtitles… faster-whisper… clip saving, and Anki export.” | MIT; early/small project. | Self-hosted app shape + Japanese-specific adapter reference. |
| E-OSS-015 | OSS source/docs | https://github.com/vidstack/captions | “Modern media captions parser and renderer… Supports VTT, SRT, and SSA/ASS.” | MIT. | Strong TypeScript subtitle parser/renderer candidate for web-first MVP. |
| E-OSS-016 | OSS source/docs | same | Browser/server rendering, streaming, custom cue renderers, collision detection. | MIT. | Helps avoid native browser caption limitations for custom interactive transcript/captions. |
| E-OSS-017 | OSS source/docs | https://github.com/m-bain/whisperX/blob/main/README.md | “fast automatic speech recognition… word-level timestamps and speaker diarization.” | Check repo/license and model/token requirements before adoption. | Higher-accuracy generated subtitles / word timestamps; diarization likely non-MVP. |
| E-OSS-018 | OSS source/docs | same | Forced alignment aligns orthographic transcriptions to audio. | Some diarization pieces may require HF gated models/tokens. | Alignment path when source transcript is known but timings need refinement. |
| E-OSS-019 | OSS source/docs | https://github.com/jianfch/stable-ts | “Transcription, forced alignment, and audio indexing… improved/stabilized timestamps.” | MIT but archived/paused. | Useful reference/tool for spikes; risk due to paused maintenance. |
| E-OSS-020 | OSS source/docs | https://github.com/ankitects/anki | “Anki is a spaced repetition program.” | License listed by GitHub as NOASSERTION; use APIs/add-ons carefully. | External export target; Lingotorte should own internal FSRS state even if exporting. |

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

## Source inventory table

| Source cluster | Evidence IDs | Type | Quality / confidence | Safety / privacy note | Maintenance / license observations | Reuse recommendation |
|---|---|---|---|---|---|---|
| Lingotorte local docs | E-LOCAL-001–006 | inference/recommendation | High for project intent and boundaries. | Local workspace docs only; no proprietary payloads. | N/A. | Treat as authoritative scope constraints. |
| Lingopie public help/docs | E-LP-PUB-001–016 | public docs | High for documented features; medium for exact UI flows. | Public pages only; do not use private app APIs or assets. | Proprietary product docs; extract mechanics only. | Use for behavior taxonomy and feature mapping, not implementation copying. |
| Sanitized live UI inventory | E-LP-LIVE-001–010 | live UI observation | High for observed mechanics; incomplete sample. | Already sanitized; raw private vocab/account data intentionally omitted. | Local notes/screenshot paths; no reusable code. | Use as interaction reference with caveats. |
| asbplayer | E-OSS-001–005 | OSS source/docs | High; mature TS project, active releases, many contributors. | Supports streaming use cases, but Lingotorte should target local/owned media first. | MIT, TypeScript, sizable but relevant. | First deep-dive candidate; consider integration or selective adaptation. |
| subs2srs | E-OSS-006–007 | OSS source/docs | High historical workflow value; older UI/tooling. | Works on user-supplied media/subtitles. | GPLv3; code reuse may contaminate licensing. | Reference pipeline concepts; avoid direct code unless GPL-compatible. |
| ts-fsrs | E-OSS-008–009 | OSS source/docs | High for TypeScript SRS scheduling. | Learner logs stay local. | MIT, active, Node >=20. | Adopt/prototype for internal scheduling. |
| Y’ALL MP | E-OSS-010–011 | OSS source/docs | Medium/high as UX reference; young project. | Offline dictionaries possible; online lookup optional. | GPLv3, primarily Windows, experimental cross-platform. | Reference UI/pipeline ideas; avoid direct code unless GPL-compatible. |
| LLPlayer | E-OSS-012–013 | OSS source/docs | Medium/high for ASR/translation reference; beta Windows/C#. | Online translation engines exist; local engines possible. | GPL-3.0, C#/WPF, beta. | Reference ASR/translation option matrix; not primary substrate. |
| Mirumoji | E-OSS-014 | OSS source/docs | Medium; early but directly self-hosted immersion shape. | Local Docker app with optional cloud/LLM features. | MIT, young/small. | Study as architecture/reference for self-hosted media + dictionary + Anki. |
| media-captions / Vidstack captions | E-OSS-015–016 | OSS source/docs | High for web captions parsing/rendering. | Pure local caption processing possible. | MIT, small TS package. | Strong candidate for subtitle parser/renderer spike. |
| WhisperX | E-OSS-017–018 | OSS source/docs | Medium/high for ASR+word timestamps; operationally heavier. | Diarization may require Hugging Face token/gated model; avoid default external dependency. | Need license/model review before adoption. | Spike for generated subtitles/word timestamps if local compute permits. |
| stable-ts | E-OSS-019 | OSS source/docs | Medium; relevant features but archived/paused. | Local operation possible. | MIT but archived; maintenance risk. | Use as reference or short-term spike only. |
| Anki | E-OSS-020 | OSS source/docs | High as ecosystem target. | External app/add-on; user-controlled. | License needs explicit review; APIs/add-ons vary. | Optional export target; do not make Lingotorte dependent on Anki for core state. |

## Behavior-to-data anchors

These are not final schemas, but stable evidence-backed anchors for later typed modeling.

| Anchor | Backing evidence | Required data shape |
|---|---|---|
| A-MEDIA | E-LOCAL-001, E-OSS-003, E-OSS-007 | `MediaFile`: path/reference, fingerprint/hash, duration, metadata, local privacy flags. |
| A-SUBTRACK | E-LP-PUB-001, E-OSS-015 | `SubtitleTrack`: media id, language, role target/native/other, format, source path, generated/extracted flag. |
| A-CUE | E-LOCAL-003, E-LP-LIVE-006 | `Cue`: start/end ms, normalized text, track id, optional aligned cue id. |
| A-TOKEN | E-LP-PUB-002, E-LP-LIVE-010, E-OSS-011 | `TokenOccurrence`: cue id, surface, normalized, lemma, POS, morph features, char span. |
| A-SAVED | E-LP-PUB-009, E-LP-PUB-010, E-LP-LIVE-010 | `SavedItem`: lexeme/phrase/sentence, source cue/time range, meaning/notes, occurrence count. |
| A-CARD | E-LP-PUB-013, E-OSS-008, E-OSS-009 | `ReviewCard`: saved item id, card type, FSRS state/difficulty/stability/due date. |
| A-REVIEW | E-LP-PUB-013, E-OSS-009 | `ReviewEvent`: card id, reviewed_at, rating again/hard/good/easy, response metadata. |
| A-ADAPTER | E-LP-PUB-011, E-OSS-014 | Versioned adapter outputs for tokenization, lemma, POS, morphology, dictionary entries, translations, grammar explanations. |

## Known gaps and uncertainty

| Gap | Evidence status | Why it matters | Suggested next step |
|---|---|---|---|
| Exact Lingopie in-player token popup contents | Public docs + sanitized live notes mention lookup, POS, meaning, context; exact fields incomplete. | Determines minimum lookup panel spec. | Use public docs first; if live inspection is authorized later, observe visible mechanics only without saving/mutating/dumping data. |
| Exact Practice game flows | Public help summarizes games; live inventory saw entrypoints but did not run games. | Needed for acceptance tests for Pop Quiz / Word Master / Sentence Wizard. | Prefer public docs; only inspect live game flows with explicit mutation/test-account permission. |
| Primary target language(s) | Preliminary docs ask this as an open question. | Tokenizer/dictionary/POS choices differ drastically for Polish/Japanese/etc. | Default architecture to adapter seam; run Polish-first spike if Janusz confirms. |
| Subtitle alignment quality | OSS tools exist; no local experiment performed here. | Dual subtitles and generated transcripts can be frustrating if timings drift. | Spike `media-captions` + ffmpeg + a known local test file; separately spike WhisperX/stable-ts if needed. |
| Licensing compatibility | MIT/GPL/proprietary mix identified, but no legal review. | Direct GPL code reuse can constrain Lingotorte licensing. | Prefer MIT libraries for core; use GPL projects as reference unless GPL adoption is intentional. |
| Anki export method | asbplayer/YALL/subs2srs show patterns, but Lingotorte’s desired export UX is undecided. | Impacts internal-vs-external SRS boundary. | Keep internal FSRS canonical; prototype AnkiConnect export as optional adapter. |
| ASR/pronunciation scoring | Public docs show product feature; OSS shows ASR options. No scoring algorithm selected. | High complexity, privacy/performance concerns. | Defer to V2; first spike generated subtitles, then word timestamps, then scoring. |
| Media shell choice | Docs mention web/Tauri/local server; OSS references vary (web/asbplayer, mpv/YALL, C#/LLPlayer). | Affects player API, packaging, and OS support. | MVP as web/Vite local app; compare Tauri/mpv only if browser media APIs are insufficient. |

## Synthesis recommendations

1. **Treat the cue as the unit of truth** (E-LOCAL-003, E-LP-LIVE-006). Store media, subtitle tracks, cues, tokens, saved occurrences, cards, and reviews as separate typed entities.
2. **Prioritize MVP player mechanics:** local media import, target/native subtitle tracks, synchronized transcript, cue seek/highlight, loop, speed, token lookup, save occurrence (E-LP-LIVE-004–006; E-OSS-015–016).
3. **Use FSRS internally, with Anki as export/integration** (E-OSS-008–009, E-OSS-020). Avoid making Anki the only durable state store.
4. **Study asbplayer first** (E-OSS-001–005). It is the closest permissively licensed TypeScript substrate/reference for local files, subtitles, AnkiConnect, and sentence-mining workflows.
5. **Use GPL projects as product/UX/pipeline references unless GPL compatibility is acceptable** (subs2srs, Y’ALL MP, LLPlayer). Their feature evidence is valuable, but direct code reuse should be gated.
6. **Make language analysis pluggable** (E-LP-PUB-011, E-OSS-011, E-OSS-014). Polish, Japanese, and other languages need different tokenization/dictionary/morphology stacks.
7. **Keep online services behind explicit opt-in adapters** (E-LOCAL-002, E-OSS-012). Local/offline is the default; cloud LLM/translation/ASR should be optional and clearly labeled.

## Out-of-scope evidence intentionally not collected

- No Lingopie private API payloads, raw subtitle/media assets, cookies, tokens, localStorage, or account/vocab dumps.
- No DRM stream capture or protected media download.
- No account mutation, review submission, pronunciation recording, settings change, or saved-word action.
- No project code was installed or executed; OSS findings are from public docs/source metadata only.
