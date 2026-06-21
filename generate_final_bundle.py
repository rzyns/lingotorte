from pathlib import Path
import json, hashlib, textwrap, re
root = Path(__file__).resolve().parent
planning = root/'docs/planning'

def read(rel):
    return (root/rel).read_text(encoding='utf-8')

def write(rel, text):
    p=root/rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text.rstrip()+"\n", encoding='utf-8')

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

final_plan = read('docs/planning/final-implementation-plan.md')
roadmap = read('docs/planning/feature-build-roadmap.md')
evidence = read('docs/planning/evidence-index.md')
safety = read('docs/planning/safety-privacy-legal-boundaries.md')
testing = read('docs/planning/testing-and-acceptance-plan.md')
product = read('docs/planning/product-behavior-spec.md')
cart = read('docs/planning/evidence-cartography.md')
arch = read('docs/planning/local-first-architecture-data-model.md')
lang = read('docs/planning/language-srs-practice-plan.md')
review = read('docs/planning/independent-challenge-review.md')
live = read('docs/research/live-ui-inventory.md')
prelim = read('docs/research/preliminary-grounding-research.md')

bundle_links = """- [Final synthesis](../final/war-room-final-synthesis.md)
- [Implementation plan](../final/lingotorte-implementation-plan.md)
- [Lingopie behavior reference](../spec/lingopie-behavior-reference.md)
- [Feature implementation playbook](../spec/feature-implementation-playbook.md)
- [Local-first architecture](../architecture/local-first-architecture.md)
- [Data model and storage](../architecture/data-model-and-storage.md)
- [Language adapter design](../architecture/language-adapter-design.md)
- [SRS and practice design](../product/srs-and-practice-design.md)
- [Public product cartography](../research/public-product-cartography.md)
- [Live UI inventory expanded](../research/live-ui-inventory-expanded.md)
- [OSS substrate assessment](../research/oss-substrate-assessment.md)
- [Safety/privacy boundary review](../review/safety-privacy-boundary-review.md)
- [MVP spike plan](../plan/mvp-spike-plan.md)"""

write('docs/final/war-room-final-synthesis.md', f"""# Lingotorte War Room Final Synthesis

Status: final fan-in synthesis for the Lingotorte planning/documentation mission. This is a planning artifact only; it does not implement the app and does not authorize scraping, proprietary copying, account mutation, external providers, deployment, or publishing.

## Executive summary

Lingotorte should be built as a local-first, privacy-preserving language-learning video app for user-owned media and explicit subtitle/transcript inputs. The validated product center is not a streaming catalog clone; it is the artifact chain `MediaFile -> SubtitleTrack -> Cue -> TokenOccurrence -> SavedItem -> ReviewCard -> ReviewEvent`.

The first useful implementation milestone should be narrow: import one owned local video plus target/native subtitles, render synchronized dual subtitles and a clickable transcript, support local/default-off token or phrase lookup, save source-backed words/phrases/sentences, and schedule video/context-backed review with FSRS. Every later capability (generated subtitles, pronunciation/shadowing, Anki integration depth, online providers, sync) should pass an explicit privacy and feasibility gate.

## What was investigated

- Project constraints and mission docs: `AGENTS.md`, `README.md`, mission statement, War Room brief.
- Existing preliminary research and sanitized Lingopie UI inventory.
- Public Lingopie feature claims and sanitized live UI mechanics as behavior references only.
- OSS substrate candidates: asbplayer, subs2srs, ts-fsrs/FSRS, Y'ALL MP, LLPlayer, Memento/SubMiner/jidoujisho/Mirumoji/mLearn class tools, subtitle parser stacks, ASR/forced-alignment options, tokenizer/dictionary stacks.
- Local-first architecture, SQLite/storage model, language adapters, saved occurrence model, FSRS/practice mechanics, safety/privacy/legal boundaries, and testing/spike gates.
- Independent challenge review findings; the final bundle responds by adding dedicated safety, evidence, path-crosswalk, spike, and human-decision gates.

## Major recommendations

1. Use a local web/Vite-style frontend plus local service boundary first; keep Tauri compatible but not required for MVP-0.
2. Use SQLite for metadata and learner state; keep media as filesystem references by default and generated clips/thumbnails/transcripts in a pruneable local cache.
3. Preserve source context for every saved item. Saved vocabulary must remain tied to media, cue, token span, time range, and subtitle provenance.
4. Use FSRS for scheduling after dependency/version/license verification; keep review events append-only and card state recomputable.
5. Treat language analysis as a replaceable adapter layer: tokenizer, lemma, POS, morphology, dictionary, phrase translation, grammar explanation, ASR/transcription, forced alignment, and pronunciation scoring.
6. Make Polish the first serious adapter stress test while keeping the interface multilingual.
7. Treat online providers, AnkiConnect, cloud sync, media-copy backups, screenshot reuse, and live Lingopie inspection as explicit opt-in gates, not defaults.
8. Treat OSS candidates as planning references until each dependency has a fresh license/version/provenance artifact.

## Unresolved questions and safe defaults

| Decision | Safe default | Why unresolved |
|---|---|---|
| Target language priority | Polish-first fixtures, generic adapter contracts | Dictionary/tokenizer/morphology choices are language-specific. |
| App shell | Local web/Vite first; Tauri optional | Desktop packaging/file access tradeoffs need repo context. |
| Backend language | TypeScript core; Python only for ASR/NLP adapters if needed | Avoid premature split-stack complexity. |
| asbplayer vs custom player | Candidate/reference only | Needs substrate spike before adoption. |
| FSRS library | ts-fsrs-style candidate | Must verify current API/license/version. |
| Anki role | Export-only | AnkiConnect/sync mutates an external app/cloud path. |
| Online providers | Disabled by default | Text/audio/voice privacy varies by provider. |
| Mastered semantics | Configurable UI bucket, not FSRS state | Learner/product preference decision. |
| Screenshot evidence | Sanitized text only | Screenshots may contain proprietary/private context. |
| Backup media policy | Metadata-only backup | Full media copy can duplicate private/copyrighted files. |

## Exact next implementation steps

1. Create future implementation card P0.1: choose repo skeleton, TypeScript/Vite test runner, fixture layout, and no-network test harness.
2. Create P0.2: add synthetic/owned media and subtitle fixtures plus provenance README; verify no Lingopie media/subtitles/screenshots/private data.
3. Create P0.3: dependency provenance workflow for every library before adoption.
4. Create P1: media/subtitle/cue ingestion with typed records and safe parse failure states.
5. Create P2: player + dual subtitle overlay + transcript seek/highlight + loop/speed controls against fixtures.
6. Create P3: tokenizer/lookup adapter contract and Polish-first fixture spike with providers disabled.
7. Create P4/P5 only after P1-P3 pass: saved occurrence service, My Vocab/My Sentences, FSRS card creation and review events.

## Bundle index

{bundle_links}

## Parent evidence incorporated

- `docs/planning/product-behavior-spec.md`
- `docs/planning/evidence-cartography.md`
- `docs/planning/local-first-architecture-data-model.md`
- `docs/planning/language-srs-practice-plan.md`
- `docs/planning/independent-challenge-review.md`
- `docs/planning/final-implementation-plan.md`
- `docs/planning/feature-build-roadmap.md`
- `docs/planning/evidence-index.md`
- `docs/planning/safety-privacy-legal-boundaries.md`
- `docs/planning/testing-and-acceptance-plan.md`
""")

write('docs/final/lingotorte-implementation-plan.md', f"""# Lingotorte Implementation Plan

Status: implementation-facing plan for future autonomous agents. Planning only; do not implement from this workspace without a separate implementation task.

## Roadmap summary

{final_plan[final_plan.index('## Implementation phases'):final_plan.index('## Unresolved decisions and safe defaults')]}

## MVP-0 spikes, MVP-1, V1, V2

### MVP-0 / P0: safety, skeleton, fixtures, provenance

- Choose local web/Vite-style skeleton and local service boundary.
- Add safe synthetic/owned fixtures.
- Add provider-disabled no-network harness.
- Add dependency provenance workflow.

### MVP-1: first useful product loop

- Import owned local video and explicit target/native subtitles.
- Parse cues into typed records.
- Render dual subtitles and synchronized transcript.
- Click token/select phrase with local/default-off lookup.
- Save word/phrase/sentence with source context.
- Generate FSRS-backed review card and append review events.

### V1

- Embedded subtitle extraction, ASS/VTT/SRT robustness, offset/alignment editor.
- POS/morphology/grammar visualization and sentence explanations through local/default-off adapters.
- Practice modes: Flip & Learn, Perfect Your Vocab, Match Your Words, Build the Sentence.
- Local Anki/export workflow with privacy warnings.
- Progress dashboard and metadata-only backup/restore.

### V2

- Local generated subtitles and forced alignment quality improvements.
- Optional pronunciation/shadowing with microphone privacy gate.
- Explicit encrypted/user-controlled sync design.
- Mobile/PWA review client or desktop packaging if warranted.

## Sequencing, dependencies, risks, and acceptance gates

{roadmap[roadmap.index('## Dependency ordering'):roadmap.index('## Human decisions and safe defaults')]}

## Recommended repo/app structure

```text
lingotorte/
  apps/web/                  # Vite/TypeScript UI
  packages/domain/           # typed domain model and validation
  packages/subtitles/        # subtitle parsing, cue normalization, alignment helpers
  packages/language/         # adapter contracts + local fixtures
  packages/review/           # FSRS wrapper and review state reducers
  services/local/            # local service boundary, SQLite, filesystem/cache APIs
  fixtures/                  # owned/synthetic media/subtitle/token/review fixtures
  tests/                     # unit/integration/e2e/privacy tests
  docs/dev/                  # dependency provenance, safety gates, implementation notes
```

## Build/test strategy

{testing[testing.index('## Test strategy overview'):testing.index('## Regression ledger for challenge-review fixes')]}

## Implementation card template

{final_plan[final_plan.index('## Implementation task template'):final_plan.index('## Done criteria for the future MVP')]}
""")

# behavior reference combines public/live evidence and product behavior contract
start = cart.index('### Lingopie public product evidence')
end = cart.index('### OSS/source/doc substrate evidence')
feature_matrix = cart[cart.index('## Feature-behavior matrix'):cart.index('## Source inventory table')]
write('docs/spec/lingopie-behavior-reference.md', f"""# Lingopie Behavior Reference for Lingotorte

Status: sanitized behavior reference. Lingopie is a reference product only. This document captures public docs and sanitized visible UI mechanics without copying proprietary code, assets, media, subtitles, catalog data, private account data, or private API payloads.

## Evidence labels

- `PUBLIC-DOC`: public Lingopie/help/blog/marketing documentation summarized by the planning artifacts.
- `SANITIZED-LIVE-UI`: visible UI mechanics from the existing read-only/sanitized inventory.
- `DESIGN-RECOMMENDATION`: local Lingotorte equivalent inferred from evidence and project constraints.
- `PROJECT-CONSTRAINT`: binding local/private/owned-media boundary.

## Public documentation evidence table

{cart[start:end]}

## Sanitized live UI observations

{live}

## Feature-by-feature behavior reference

{feature_matrix}

## Observed vs inferred notes

- Observed live: catalog shell, player chrome, dual subtitle overlay, transcript/read-along panel, tokenized transcript cells, Listen/Loop controls, Explain/Save actions, Grammar Index/POS categories, practice route, My Vocab/My Sentences, SRS buckets, contextual saved-item row shape.
- Public documented: subtitle language selection, hover/click word and POS coloring, Listen/Repeat, auto-loop, speed adjustment, Grammar Tutor/Explain Sentence, My Vocab, practice games, spaced repetition, contextual video-backed practice.
- Inferred/recommended for Lingotorte: local library instead of streaming catalog; source-backed saved occurrences; generic POS coloring rather than copied styling; FSRS internal scheduling; local provider gates; optional ASR/pronunciation; metadata-only backup default.
""")

features = [
('Local media import','Import owned/synthetic local video/audio as references by default; compute duration/fingerprint; never capture protected streams.','LibraryImportView, MediaDetailView, ImportPreview','MediaImportService, MediaProbe/ffprobe boundary, PrivacyPolicyService','media_asset, media_file_observation, import_job','ffprobe/mediainfo candidate; local filesystem APIs','P1','Given owned fixture media, import stores path/duration/fingerprint and does not upload/copy unless configured.'),
('Subtitle extraction/parsing/alignment','Attach explicit target/native subtitles, extract embedded tracks later, align by timestamp/offset/confidence.','SubtitleImportDialog, AlignmentPreview','SubtitleParser, EmbeddedTrackExtractor, CueAlignmentService','subtitle_track, cue, cue_alignment, transcript_index','media-captions/vidstack captions, ffmpeg/ffprobe, custom offset tooling','P1/V1','Valid SRT/VTT creates cues; malformed subtitles fail safely; target/native alignment is explicit.'),
('Dual subtitles','Render target and optional native subtitle lines in sync with video.','PlayerOverlay, SubtitleSettings','PlaybackStateService, CueProjection','active track settings, cue_alignment','Browser media APIs/custom renderer','P2','At cue time, target/native lines render; missing native degrades gracefully.'),
('Transcript synchronization','Scrollable/searchable transcript follows playback and click seeks video.','TranscriptPanel, CurrentCueHighlighter','TranscriptProjection, SearchService','transcript_fts, cue projection','UI virtualization; FTS5/sqlite','P2','Playback highlights current cue; clicking row seeks; keyboard path works.'),
('Cue seek/highlight','Seek to current/previous/next cue and highlight active cue.','CueNavigationControls','PlaybackController','media_marker optional; cue time index','HTMLMediaElement/Tauri/mpv candidate','P2','Cue navigation respects start/end with documented tolerance.'),
('Clickable token lookup','Click/focus token and show lemma/POS/morph/meaning or unavailable state.','TokenCell, LookupPanel','TokenizerAdapter, LookupService, ProviderPolicyService','token_occurrence, token_morph_feature, adapter_result','local dictionary/tokenizer; optional providers gated','P3','Lookup never calls online provider unless enabled; source context visible.'),
('Phrase selection','Select token range, lookup/save phrase, reject ambiguous cross-cue MVP selections.','PhraseSelectionToolbar','PhraseLookupService, SelectionMapper','cue_text_span, saved_occurrence_token','token span mapping','P3/P4','Selected range saves exact token ids/span and cue/time.'),
('Grammar/POS coloring','Show generic UPOS color/category visualization with configurable styling.','GrammarIndex, POSTokenDecorator','MorphologyAdapter','LanguageAnalysis/token_morph_feature','UD-style POS/morph adapters','V1','Tokens color by UPOS when available; neutral fallback when missing.'),
('Sentence explanation','Explain current cue/sentence via local/default-off adapter; store generated explanation provenance.','SentenceExplainPanel','SentenceExplanationAdapter, ProviderPolicyService','adapter_result, learner_note','local rules/local LLM optional; online LLM gated','V1/V2','Disabled/unavailable state works; online use requires explicit opt-in.'),
('Save word/phrase/sentence','Save selected lexeme/phrase/cue as learner item with source context.','SaveEditor, SavedMarker','SavedItemService','saved_item, saved_occurrence, saved_occurrence_token','domain validation','P4','Saved item links to media/cue/time/token span and remains after media missing.'),
('My Vocab','Local collection of saved lexemes/phrases with filters, source context, review state.','MyVocabView','SavedItemQueryService, ReviewProjection','saved_item, saved_occurrence, review_card_state','SQLite queries/FTS','P4/P5','List filters by learning/due/mastered and opens source cue.'),
('My Sentences','Local collection of saved cue/sentence items and explanations.','MySentencesView','SavedItemQueryService','saved_item(kind=sentence), saved_occurrence','SQLite','P4/P5','Saved sentence replays or opens exact source cue.'),
('Listen','Replay current cue/segment for comprehension.','ListenButton','PlaybackController','none beyond cue time','HTMLMediaElement segment replay','P2','Listen replays selected cue without changing learner state.'),
('Loop','Loop current cue/selected range until disabled.','LoopToggle','PlaybackController','playback setting','HTMLMediaElement timeupdate/seek','P2','Loop stays within cue boundaries and can be disabled.'),
('Playback speed','Adjust and persist safe playback rate.','SpeedControl','PlaybackSettingsService','app_setting/media preference','HTMLMediaElement playbackRate','P2','Rate applies and transcript remains synchronized.'),
('Saved occurrence context','Preserve exact source context for every saved item and review prompt.','OccurrenceDetail, OpenAtSource','SavedOccurrenceService','saved_occurrence, saved_occurrence_token, cue_version_link','domain invariants','P4','Open-at-source seeks original media/time; stale source is flagged not silently retargeted.'),
('FSRS flashcards','Create recognition/production cards backed by saved occurrences.','ReviewCardView','ReviewSchedulerService','review_card, review_card_state, review_event','ts-fsrs candidate after verification','P5','Card creation and Again/Hard/Good/Easy updates are deterministic and append-only.'),
('SRS states','Separate FSRS states from UI buckets Learning/Due/Mastered.','ReviewDashboard','ReviewProjection','review_card_state, review_event','FSRS library','P5','Mastered is configurable display rule, not hidden FSRS state.'),
('Quiz/match/sentence-builder modes','Local practice games derived from saved items and cues.','MeaningQuiz, ContextMatch, SentenceBuilder','PracticeSessionService','practice_session, practice_attempt','local distractor generation, clip replay','P6','All prompts/distractors are local and deterministic; scheduling effects are explicit.'),
('Anki export','Export saved cards/decks locally with privacy warning; no AnkiConnect mutation by default.','ExportDialog','ExportService','export_job, export_manifest_item','genanki/.apkg or text export candidate','P6','Export manifest lists included text/media; no external app mutation by default.'),
('Optional generated subtitles','Run local ASR or alignment as a labeled generated track after dependency/privacy gate.','ASRJobView, GeneratedTrackReview','ASRAdapter, ForcedAlignmentAdapter','analysis_run, subtitle_track(source=generated), cue','faster-whisper/whisper.cpp/WhisperX/stable-ts candidates','P7','Owned fixture creates timestamped cues and quality report; online ASR disabled.'),
('Optional pronunciation/shadowing','Loop cue, record learner locally, compare via local ASR/alignment with explicit microphone handling.','ShadowingView','RecordingService, PronunciationScorerAdapter','practice_attempt, cache_asset temp recording','local ASR/forced alignment candidate','V2/P7 optional','Temp recording lifecycle is tested; online scoring requires explicit opt-in.'),
('Progress tracking','Compute local watch/study/due/saved metrics from events.','ProgressDashboard','ProgressProjection','review_event, media_marker, practice_session','SQLite projections','P8','Metrics are recomputable from local state.'),
('Privacy/settings','Control provider, export, logging, backup and media-copy policies.','PrivacySettingsView','ProviderPolicyService, SettingsService','app_setting, provider_policy','no-network harness','P0/P8','Providers disabled by default and covered by zero-network test.'),
('Backups/sync','Metadata-only local backup first; media copy/cloud sync opt-in only.','BackupRestoreView','BackupService, SyncDesignGate','backup_snapshot, export_manifest_item','SQLite backup/export archive','P8','Backup/restore roundtrip passes; media copy policy explicit.'),
]
rows=[]
for f in features:
    rows.append('| '+' | '.join(f)+' |')
playbook_table='\n'.join(['| Feature | User-visible behavior | Frontend components/views | Backend/domain services | Data model changes | Libraries/algorithms | Priority | Acceptance test |','|---|---|---|---|---|---|---|---|']+rows)
write('docs/spec/feature-implementation-playbook.md', f"""# Feature Implementation Playbook

Status: implementation-facing playbook. Planning only.

## Evidence and boundary rules

- Treat `PROJECT-CONSTRAINT` and `MISSION-REQUIREMENT` as binding.
- Treat `SANITIZED-LIVE-UI` and `PUBLIC-DOC` as behavior references, not permission to copy Lingopie assets, styling, copy, media, subtitles, catalog data, private examples, or APIs.
- Treat `OSS-DOC-SOURCE` candidates as unadopted until license/version/provenance verification is written.
- Default to local/offline adapters and no-network tests.

## Feature-by-feature implementation matrix

{playbook_table}

## Cross-cutting implementation steps for every feature

1. Read `AGENTS.md`, `docs/review/safety-privacy-boundary-review.md`, and `docs/planning/evidence-index.md`.
2. Confirm fixture safety: owned/synthetic media and subtitles only.
3. Write acceptance tests before feature code in the future repo.
4. Add typed domain objects or migrations before UI state depends on them.
5. Verify provider-disabled/no-network behavior for adapter-capable features.
6. Preserve source media/cue/token context in all saved/review/export paths.
7. Record third-party dependency provenance before importing any library.
8. Update implementation docs with evidence labels and unresolved decisions.

## Parent detail references

- Product behavior contract: `../planning/product-behavior-spec.md`
- Architecture/data model: `../planning/local-first-architecture-data-model.md`
- Language/SRS/practice: `../planning/language-srs-practice-plan.md`
- Roadmap and gates: `../planning/feature-build-roadmap.md`, `../planning/testing-and-acceptance-plan.md`
""")

write('docs/architecture/local-first-architecture.md', f"""# Local-First Architecture

Status: split-out architecture deliverable derived from the final planning bundle. Planning only.

## Recommended app shell: web / Tauri / local-server tradeoff

{arch[arch.index('### Recommended app shell tradeoff'):arch.index('## Data lifecycle')]}

## Component diagram

{arch[arch.index('## Architecture overview'):arch.index('### Storage and trust boundaries')]}

## Data flow

{arch[arch.index('## Data lifecycle'):arch.index('## Domain model overview')]}

## Service boundaries

{arch[arch.index('### Storage and trust boundaries'):arch.index('### Recommended app shell tradeoff')]}

## Local/offline privacy model

{safety[safety.index('## Data classes and privacy posture'):safety.index('## Online provider policy')]}

## Media/cache strategy

- Store original media as references by default; app-managed copy only by explicit user action.
- Store generated thumbnails/audio/clips/transcripts in a pruneable cache, not as authoritative learner state.
- Keep subtitle/cue text in SQLite with provenance; treat it as private/copyright-sensitive data.
- Back up metadata first; copied media and clips require explicit opt-in.

## Failure modes

- Missing/moved media: preserve learner state and offer relink.
- Malformed subtitles: fail import without corrupting existing tracks.
- Adapter failure: preserve raw cue/token state and show unavailable/low-confidence result.
- Provider disabled/offline: zero network calls and graceful disabled state.
- Cache prune/miss: regenerate derived clips/assets; never lose review events or saved occurrences.
- Track reimport/regeneration: create new track/cue versions and preserve old saved occurrence anchors.
""")

write('docs/architecture/data-model-and-storage.md', f"""# Data Model and Storage

Status: split-out data model deliverable. Planning only.

## Typed model overview

{final_plan[final_plan.index('## Data model summary'):final_plan.index('## Language, SRS, and practice mechanics')]}

## Domain identity layers

{arch[arch.index('## Domain model overview'):arch.index('### Entity relationship diagram')]}

## Entity relationship diagram

{arch[arch.index('### Entity relationship diagram'):arch.index('## Proposed SQLite schema')]}

## SQLite schema recommendations

{arch[arch.index('## Proposed SQLite schema'):arch.index('## Cue and token identity model')]}

## Migration/versioning plan

- Use forward-only migrations with a `schema_migration` ledger containing version, name, checksum, applied timestamp, and result.
- Treat subtitle track changes, generated transcript regeneration, tokenizer/model upgrades, and adapter schema changes as versioned data changes, not in-place rewrites.
- Store parser/adapter/model versions and payload schema versions beside derived data.
- Provide migration helpers such as `cue_version_link` and saved-occurrence relinking with confidence, but never silently retarget learner history.

## Append-only learner-state/audit strategy

- `review_event` is append-only; `review_card_state` is materialized and recomputable.
- `saved_occurrence` anchors are immutable; archive/suspend rather than silent hard-delete.
- Important import/export/provider operations record jobs/events/manifests without secrets or raw provider payload logs.
- Deletions that destroy learner state require explicit user confirmation and should preserve a local audit record unless hard-delete is requested.

## Import/export strategy

- Import local media paths and subtitle files with source provenance, hashes/fingerprints when feasible, parser version, and privacy label.
- Export local JSON/SQLite/Anki packages through an `export_job` and `export_manifest_item` manifest listing included text/media/review data and checksums.
- Default backups are metadata-only; generated clips/media copies are opt-in.
- Anki export is local/export-only by default; AnkiConnect or sync is a separate mutation/privacy gate.
""")

write('docs/architecture/language-adapter-design.md', f"""# Language Adapter Design

Status: split-out language adapter deliverable. Planning only.

## Adapter boundary principles

{lang[lang.index('## Language analysis adapters'):lang.index('## Saved learning objects')]}

## Adapter taxonomy and privacy tradeoffs

{arch[arch.index('## Adapter interfaces and privacy tradeoffs'):arch.index('### Typed adapter interface sketch')]}

## Required adapter interfaces

Implement adapters for:

| Interface | Input | Output | Default |
|---|---|---|---|
| Tokenization | cue text, language, cue id | token spans with stable offsets | local |
| Lemma/POS/morphology | tokenized cue + language | lemma, UPOS, XPOS, morph features, confidence | local |
| Dictionary lookup | token/lemma/phrase + learner language | entries/glosses/source/license | local/offline or unavailable |
| Phrase translation | phrase/cue context | translation candidates + provenance | disabled/local by default |
| Grammar explanation | cue, parse, learner level | explanation sections + warnings | disabled/local by default |
| ASR/transcription | owned media/audio | generated cues/timestamps/confidence | optional local spike |
| Forced alignment | audio + transcript/subtitle | aligned cue/word timing | optional local spike |
| Pronunciation scoring | learner recording + prompt | local comparison/feedback | optional V2, explicit microphone gate |

## Polish-first recommendations

- Use Polish fixtures early because rich inflection stresses lemma, case, gender, number, aspect, animacy, and ambiguity.
- Require char-offset roundtrip tests for Polish tokenization.
- Treat lemma/POS/morph confidence as visible; do not silently merge inflected forms.
- Keep dictionary lookup source/license visible in the output model.

## Generalization path for other languages

- Use BCP-47 language codes at media/track/cue/token levels.
- Keep UPOS as cross-language baseline while allowing language-specific `xpos` and morph features.
- Do not assume whitespace tokenization; Japanese/Chinese/Thai/Korean need dedicated segmenters/dictionaries.
- Add RTL and code-switching UI fixtures before claiming support.

## Offline vs online tradeoffs

{safety[safety.index('## Online provider policy'):safety.index('## Anki/export boundary')]}

## Fixture/testing strategy

- Tokenizer fixtures must prove char offsets round-trip to original cue text.
- Morphology fixtures must show lemma/UPOS/morph ambiguity rather than forced certainty.
- Lookup fixtures must handle found, not-found, multiple-sense, and manual-meaning save flows.
- Provider-disabled tests must fail on any HTTP/DNS call.
- ASR/alignment/pronunciation fixtures use owned/synthetic media/audio only and report quality/latency rather than claiming general accuracy.
""")

write('docs/product/srs-and-practice-design.md', f"""# SRS and Practice Design

Status: product/practice design deliverable. Planning only.

## FSRS model and review state

{lang[lang.index('### Public/OSS scheduling facts'):lang.index('## Architecture overview')]}

{arch[arch.index('## Review-state model'):arch.index('## Adapter interfaces and privacy tradeoffs')]}

## Local equivalents of Lingopie-like practice modes

| Reference mode | Local Lingotorte equivalent | Scheduling effect | Acceptance gate |
|---|---|---|---|
| Flip & Learn | Reveal/rate FSRS card backed by saved occurrence | Updates FSRS through Again/Hard/Good/Easy | Append-only review event and deterministic next due. |
| Match Your Words | Context/clip/audio-to-word matching from saved items | Optional; explicit if it updates FSRS | Local distractors and source cue replay. |
| Perfect Your Vocab | Meaning/translation quiz from saved items | Optional FSRS update only when configured | No online distractor generation by default. |
| Build the Sentence | Reconstruct target cue from tokens/phrases | Practice attempt; optional card type later | Handles punctuation/spacing and links to source cue. |
| Pronunciation/shadowing | Loop cue, record locally, compare locally | Optional V2 practice telemetry | Microphone consent and temp deletion verified. |

## Card generation from video-backed occurrences

- Generate cards from `saved_item` + selected `saved_occurrence`, not detached dictionary entries.
- Card prompt/reveal can include target text, native aligned cue, meaning, notes, lemma/POS/morph, and replayable cue context.
- Card types: recognition, production, clip-to-word, sentence-order, shadowing.
- Cards should remain valid if media is missing by showing text context and relink/open-source warning.

## Grading, scheduling, lapse/relearning behavior

- Use FSRS library after verification for state transitions and due dates.
- Ratings are Again, Hard, Good, Easy.
- FSRS states are New, Learning, Review, Relearning; UI buckets such as Learning/Due/Mastered are projections.
- `review_event` records previous/next state snapshots and response metadata; `review_card_state` is recomputable.
- Lapses move review cards into relearning according to verified FSRS behavior.

## UX flow

1. User saves a word/phrase/sentence from media context.
2. Lingotorte creates or offers a review card anchored to the saved occurrence.
3. Due queue shows cards by local time and UI bucket.
4. Review prompt shows video/text context and reveal/answer affordance.
5. User grades; app appends `review_event` and updates materialized card state.
6. Practice modes create `practice_attempt`; they update FSRS only when explicitly designed to do so.

## Acceptance tests

{testing[testing.index('## Feature acceptance checklist'):testing.index('## Spike commands and expected shape')]}
""")

write('docs/research/public-product-cartography.md', f"""# Public Product Cartography

Status: public/reference feature map. Planning only.

## Boundary

Lingopie public docs are used to understand feature taxonomy and learning mechanics only. Do not copy proprietary UI copy, branding, media, subtitles, catalog data, or implementation. Revalidate public URLs and quotes before legal, dependency, or implementation claims.

## Public Lingopie docs/blog/help-center map and evidence table

{cart[start:end]}

## Feature claims and local-product implications

{feature_matrix}

## Known public-doc gaps

- Exact in-player token popup fields require either public-doc revalidation or a gated visible-UI-only inspection.
- Exact game internals should not be inferred beyond public descriptions unless a safe test account/mutation scope is approved.
- Public docs do not authorize copying proprietary assets/copy/style.
""")

write('docs/research/live-ui-inventory-expanded.md', f"""# Live UI Inventory Expanded

Status: sanitized expansion of existing live UI inventory. No new browser/CDP inspection was performed for this final synthesis. This document expands the existing inventory into local-product implications and future-safe inspection gates.

{live}

## Expanded local-product implication matrix

| Observed area | Sanitized observed mechanic | Lingotorte equivalent | Evidence label | Confidence |
|---|---|---|---|---|
| Catalog/library | App shell, progress widgets, filters, content rails | Local media library with recently watched/progress filters; no streaming catalog MVP | SANITIZED-LIVE-UI | medium |
| Episode detail | Media detail/interstitial and start action | Local media detail with subtitle availability, resume/start, mode selection | SANITIZED-LIVE-UI | medium |
| Player chrome | elapsed/total, progress, playback, volume, speed/captions/fullscreen | Generic local player controls | SANITIZED-LIVE-UI | high |
| Dual subtitles | target and native/English lines | Synchronized target/native subtitle overlay | SANITIZED-LIVE-UI | high |
| Transcript | Read Along side panel, tokenized cells | Synchronized clickable transcript with cue seek/highlight | SANITIZED-LIVE-UI | high |
| Listen/Loop | cue replay and loop controls | Listen/loop current cue/selection | SANITIZED-LIVE-UI | high |
| Explain/Save | sentence actions in transcript context | Sentence explanation/save occurrence with local/provider gate | SANITIZED-LIVE-UI | medium |
| Grammar Index | POS categories and color visualization | Generic configurable UPOS coloring, not copied style | SANITIZED-LIVE-UI | medium |
| Practice | My Vocab, My Sentences, Learning/Due/Mastered | Local saved-item views and review projections | SANITIZED-LIVE-UI | high |
| Vocab row | meaning, POS/morph, occurrence, source, count, SRS indicator | Saved occurrence + ReviewCard model | SANITIZED-LIVE-UI | high |

## Future inspection guardrail

No additional live UI inspection should occur unless Janusz explicitly authorizes scope. Prefer public docs first; use a throwaway/test account for mutation-prone flows; never dump storage/tokens/private APIs; do not save words, run reviews, record pronunciation, or change settings unless specifically authorized.
""")

oss_start = cart.index('### OSS/source/doc substrate evidence')
oss_end = cart.index('## Feature-behavior matrix')
source_start = cart.index('## Source inventory table')
source_end = cart.index('## Behavior-to-data anchors')
write('docs/research/oss-substrate-assessment.md', f"""# OSS Substrate Assessment

Status: planning assessment. Do not adopt, fork, copy, or import code until a future implementation task revalidates version, license, source, privacy/network behavior, and integration fit.

## OSS evidence table

{cart[oss_start:oss_end]}

## Source inventory and recommendations

{cart[source_start:source_end]}

## Required per-candidate adoption checklist

For each candidate (`asbplayer`, `subs2srs`, FSRS/`ts-fsrs`, Y'ALL MP, LLPlayer, Memento/SubMiner/jidoujisho/Mirumoji/mLearn, subtitle parsers, ASR/forced-alignment options, dictionary/tokenizer stacks):

1. retrieval date and URL;
2. exact package/repo version or commit;
3. license file path/hash and compatibility note;
4. architecture fit: dependency, fork, reference-only, or reimplement;
5. local/offline support and any network/provider behavior;
6. maturity/maintenance risk;
7. fixture-backed spike result before adoption.

## Initial recommendations

- Study `asbplayer` first as a permissively licensed TypeScript reference/substrate candidate for local files, subtitles, and Anki-adjacent workflows.
- Use `ts-fsrs`-style FSRS internally after revalidation rather than inventing scheduling.
- Prefer MIT/permissive subtitle parser/rendering libraries for core; keep GPL projects such as subs2srs/Y'ALL MP/LLPlayer as reference unless GPL adoption is intentional.
- Treat ASR/forced-alignment and pronunciation as spikes, not MVP dependencies.
- Keep dictionary/tokenizer stacks adapter-based and language-specific.
""")

write('docs/review/safety-privacy-boundary-review.md', safety.replace('# Safety, Privacy, and Legal Boundaries', '# Safety, Privacy, and Boundary Review', 1) + f"""

## Independent review response

The independent challenge review initially blocked final synthesis on safety/privacy, evidence labeling, path crosswalk, concrete spike gates, and human-decision gates. This document, plus `../planning/evidence-index.md`, `../planning/documentation-index.md`, and `../plan/mvp-spike-plan.md`, provides the required repairs. Future implementation work must still pass review before merge/release.
""")

write('docs/plan/mvp-spike-plan.md', f"""# MVP Spike Plan

Status: concrete spike plan for the future implementation repo. Planning only; commands are expected shapes to instantiate once the repo skeleton exists.

## Fixture rules

{testing[testing.index('## Fixture plan'):testing.index('## Acceptance gates by milestone')]}

## Concrete MVP-0 spikes

| Spike | Exact safe inputs | Expected outputs | Verification commands | Acceptance criteria | Not-done if |
|---|---|---|---|---|---|
| Local player + dual subtitles | `fixtures/media/sample-owned.mp4`, `fixtures/subtitles/sample.target.srt`, `fixtures/subtitles/sample.native.srt` | Player renders target/native cues and exposes transcript | `npm run test:e2e -- player-dual-subtitles`; `npm run test:no-network` | Current target/native cue changes at timestamps; transcript click seeks; no network | Uses remote/proprietary media, no fixture provenance, or missing native-track fallback |
| Transcript seek/highlight | Imported cue fixtures and current playback clock | Highlighted current cue, click-to-seek, follow-playback toggle | `npm run test:e2e -- transcript-sync` | Current cue follows playback within documented tolerance; keyboard path works | Timing tolerance undocumented or virtualized transcript breaks highlighting |
| Click-to-token lookup | `fixtures/expected/tokens.polish.sample.json` plus target cue | Token lookup panel with lemma/POS/morph/meaning or unavailable state | `npm test -- token-lookup`; `npm run test:no-network` | Token offsets round-trip; online provider disabled causes zero calls; manual save still works | Requires online provider or loses cue/token source context |
| Saved occurrence + FSRS card | Saved word/phrase/sentence fixture and review-card fixture | `saved_item`, `saved_occurrence`, `review_card`, append-only `review_event` | `npm test -- saved-item-review-card` | Card points to source media/cue/time/token span; Again/Hard/Good/Easy schedule deterministically | Review event rewrites history or source cue/time is lost |
| Generated subtitles/alignment | Owned short audio/video fixture without subtitles | Generated `SubtitleTrack` labeled `generated`, timestamped cues, quality report | `uv run pytest tests/asr_alignment` or chosen local command; `npm run test:no-network` | Local engine only; confidence/warnings visible; discarded output does not affect saved state | Online ASR is required or quality/latency is not measured |
| Optional pronunciation/shadowing | Synthetic/owned prompt audio and test recording | Recording lifecycle, local ASR/alignment comparison, deletion check | `uv run pytest tests/shadowing_privacy` or chosen local command | Microphone/recording gate explicit; temp audio deleted unless saved; no online scoring | Voice leaves machine by default or temp recordings persist unexpectedly |

## Acceptance gates by milestone

{testing[testing.index('## Acceptance gates by milestone'):testing.index('## Feature acceptance checklist')]}

## No-network and no-account-mutation pattern

{testing[testing.index('## No-network and no-account-mutation pattern'):testing.index('## Regression ledger for challenge-review fixes')]}
""")

# Update README and AGENTS with new canonical reading order while preserving boundary content.
readme = read('README.md')
new_readme = re.sub(r'## Final planning bundle[\s\S]*?## Source provenance', f'''## Final planning bundle

The canonical implementation-planning bundle now lives in mission-requested split paths as well as the retained `docs/planning/` parent artifacts.

Recommended final-bundle reading order:

1. `docs/final/war-room-final-synthesis.md` — executive summary, investigation, recommendations, unresolved questions, next steps.
2. `docs/final/lingotorte-implementation-plan.md` — roadmap, phases, dependencies, repo structure, build/test strategy.
3. `docs/review/safety-privacy-boundary-review.md` — authoritative safety/privacy/legal gate.
4. `docs/spec/lingopie-behavior-reference.md` — public/sanitized reference behavior with observed vs inferred notes.
5. `docs/spec/feature-implementation-playbook.md` — feature-by-feature implementation matrix and acceptance tests.
6. `docs/architecture/local-first-architecture.md` — app shell, component diagram, data flow, privacy model, failure modes.
7. `docs/architecture/data-model-and-storage.md` — typed model, SQLite schema, migration/audit/export strategy.
8. `docs/architecture/language-adapter-design.md` — adapter contracts, Polish-first guidance, offline/online tradeoffs.
9. `docs/product/srs-and-practice-design.md` — FSRS, review state, practice modes, UX flow, tests.
10. `docs/research/public-product-cartography.md`, `docs/research/live-ui-inventory-expanded.md`, `docs/research/oss-substrate-assessment.md` — research backing.
11. `docs/plan/mvp-spike-plan.md` — concrete MVP spikes with inputs, outputs, commands, and gates.
12. `docs/planning/documentation-index.md` — retained parent crosswalk and previous synthesis index.

## Source provenance''', readme)
write('README.md', new_readme)

agents = read('AGENTS.md')
new_agents = re.sub(r'## Recommended reading order[\s\S]*?## Working hypothesis', '''## Recommended reading order

Read these in order before planning, deep-diving, or launching implementation work:

1. `README.md` — workspace index and file map.
2. `docs/mission/hermes-war-room-mission-statement.md` — original War Room mission statement.
3. `docs/mission/lingopie-war-room-brief.md` — lane-oriented mission brief.
4. `docs/research/preliminary-grounding-research.md` — preliminary findings.
5. `docs/research/live-ui-inventory.md` — sanitized live Lingopie UI inventory.
6. `docs/final/war-room-final-synthesis.md` — final synthesis and next implementation steps.
7. `docs/final/lingotorte-implementation-plan.md` — implementation roadmap and build/test strategy.
8. `docs/review/safety-privacy-boundary-review.md` — authoritative safety/privacy/legal gate.
9. `docs/spec/feature-implementation-playbook.md` — feature-by-feature implementation playbook.
10. `docs/plan/mvp-spike-plan.md` — concrete MVP spike inputs, outputs, commands, and gates.

## Working hypothesis''', agents)
write('AGENTS.md', new_agents)

# artifact manifest
paths = [
'docs/final/war-room-final-synthesis.md','docs/final/lingotorte-implementation-plan.md','docs/spec/lingopie-behavior-reference.md','docs/spec/feature-implementation-playbook.md','docs/architecture/local-first-architecture.md','docs/architecture/data-model-and-storage.md','docs/architecture/language-adapter-design.md','docs/product/srs-and-practice-design.md','docs/research/public-product-cartography.md','docs/research/live-ui-inventory-expanded.md','docs/research/oss-substrate-assessment.md','docs/review/safety-privacy-boundary-review.md','docs/plan/mvp-spike-plan.md','README.md','AGENTS.md']
manifest = {'generated_by':'generate_final_bundle.py','status':'planning-docs-only','artifacts':[]}
for rel in paths:
    p=root/rel
    txt=p.read_text(encoding='utf-8')
    manifest['artifacts'].append({'path':rel,'relative_path':rel,'bytes':p.stat().st_size,'lines':txt.count('\n')+1,'sha256':sha(p)})
write('docs/final/artifact-manifest.json', json.dumps(manifest, indent=2))
print(json.dumps(manifest, indent=2))
