# Feature Implementation Playbook

Status: implementation-facing playbook. Planning only.

## Evidence and boundary rules

- Treat `PROJECT-CONSTRAINT` and `MISSION-REQUIREMENT` as binding.
- Treat `SANITIZED-LIVE-UI` and `PUBLIC-DOC` as behavior references, not permission to copy Lingopie assets, styling, copy, media, subtitles, catalog data, private examples, or APIs.
- Treat `OSS-DOC-SOURCE` candidates as unadopted until license/version/provenance verification is written.
- Default to local/offline adapters and no-network tests.

## Feature-by-feature implementation matrix

| Feature | User-visible behavior | Frontend components/views | Backend/domain services | Data model changes | Libraries/algorithms | Priority | Acceptance test |
|---|---|---|---|---|---|---|---|
| Local media import | Import owned/synthetic local video/audio as references by default; compute duration/fingerprint; never capture protected streams. | LibraryImportView, MediaDetailView, ImportPreview | MediaImportService, MediaProbe/ffprobe boundary, PrivacyPolicyService | media_asset, media_file_observation, import_job | ffprobe/mediainfo candidate; local filesystem APIs | P1 | Given owned fixture media, import stores path/duration/fingerprint and does not upload/copy unless configured. |
| Subtitle extraction/parsing/alignment | Attach explicit target/native subtitles, extract embedded tracks later, align by timestamp/offset/confidence. | SubtitleImportDialog, AlignmentPreview | SubtitleParser, EmbeddedTrackExtractor, CueAlignmentService | subtitle_track, cue, cue_alignment, transcript_index | media-captions/vidstack captions, ffmpeg/ffprobe, custom offset tooling | P1/V1 | Valid SRT/VTT creates cues; malformed subtitles fail safely; target/native alignment is explicit. |
| Dual subtitles | Render target and optional native subtitle lines in sync with video. | PlayerOverlay, SubtitleSettings | PlaybackStateService, CueProjection | active track settings, cue_alignment | Browser media APIs/custom renderer | P2 | At cue time, target/native lines render; missing native degrades gracefully. |
| Transcript synchronization | Scrollable/searchable transcript follows playback and click seeks video. | TranscriptPanel, CurrentCueHighlighter | TranscriptProjection, SearchService | transcript_fts, cue projection | UI virtualization; FTS5/sqlite | P2 | Playback highlights current cue; clicking row seeks; keyboard path works. |
| Cue seek/highlight | Seek to current/previous/next cue and highlight active cue. | CueNavigationControls | PlaybackController | media_marker optional; cue time index | HTMLMediaElement/Tauri/mpv candidate | P2 | Cue navigation respects start/end with documented tolerance. |
| Clickable token lookup | Click/focus token and show lemma/POS/morph/meaning or unavailable state. | TokenCell, LookupPanel | TokenizerAdapter, LookupService, ProviderPolicyService | token_occurrence, token_morph_feature, adapter_result | local dictionary/tokenizer; optional providers gated | P3 | Lookup never calls online provider unless enabled; source context visible. |
| Phrase selection | Select token range, lookup/save phrase, reject ambiguous cross-cue MVP selections. | PhraseSelectionToolbar | PhraseLookupService, SelectionMapper | cue_text_span, saved_occurrence_token | token span mapping | P3/P4 | Selected range saves exact token ids/span and cue/time. |
| Grammar/POS coloring | Show generic UPOS color/category visualization with configurable styling. | GrammarIndex, POSTokenDecorator | MorphologyAdapter | LanguageAnalysis/token_morph_feature | UD-style POS/morph adapters | V1 | Tokens color by UPOS when available; neutral fallback when missing. |
| Sentence explanation | Explain current cue/sentence via local/default-off adapter; store generated explanation provenance. | SentenceExplainPanel | SentenceExplanationAdapter, ProviderPolicyService | adapter_result, learner_note | local rules/local LLM optional; online LLM gated | V1/V2 | Disabled/unavailable state works; online use requires explicit opt-in. |
| Save word/phrase/sentence | Save selected lexeme/phrase/cue as learner item with source context. | SaveEditor, SavedMarker | SavedItemService | saved_item, saved_occurrence, saved_occurrence_token | domain validation | P4 | Saved item links to media/cue/time/token span and remains after media missing. |
| My Vocab | Local collection of saved lexemes/phrases with filters, source context, review state. | MyVocabView | SavedItemQueryService, ReviewProjection | saved_item, saved_occurrence, review_card_state | SQLite queries/FTS | P4/P5 | List filters by learning/due/mastered and opens source cue. |
| My Sentences | Local collection of saved cue/sentence items and explanations. | MySentencesView | SavedItemQueryService | saved_item(kind=sentence), saved_occurrence | SQLite | P4/P5 | Saved sentence replays or opens exact source cue. |
| Listen | Replay current cue/segment for comprehension. | ListenButton | PlaybackController | none beyond cue time | HTMLMediaElement segment replay | P2 | Listen replays selected cue without changing learner state. |
| Loop | Loop current cue/selected range until disabled. | LoopToggle | PlaybackController | playback setting | HTMLMediaElement timeupdate/seek | P2 | Loop stays within cue boundaries and can be disabled. |
| Playback speed | Adjust and persist safe playback rate. | SpeedControl | PlaybackSettingsService | app_setting/media preference | HTMLMediaElement playbackRate | P2 | Rate applies and transcript remains synchronized. |
| Saved occurrence context | Preserve exact source context for every saved item and review prompt. | OccurrenceDetail, OpenAtSource | SavedOccurrenceService | saved_occurrence, saved_occurrence_token, cue_version_link | domain invariants | P4 | Open-at-source seeks original media/time; stale source is flagged not silently retargeted. |
| FSRS flashcards | Create recognition/production cards backed by saved occurrences. | ReviewCardView | ReviewSchedulerService | review_card, review_card_state, review_event | ts-fsrs candidate after verification | P5 | Card creation and Again/Hard/Good/Easy updates are deterministic and append-only. |
| SRS states | Separate FSRS states from UI buckets Learning/Due/Mastered. | ReviewDashboard | ReviewProjection | review_card_state, review_event | FSRS library | P5 | Mastered is configurable display rule, not hidden FSRS state. |
| Quiz/match/sentence-builder modes | Local practice games derived from saved items and cues. | MeaningQuiz, ContextMatch, SentenceBuilder | PracticeSessionService | practice_session, practice_attempt | local distractor generation, clip replay | P6 | All prompts/distractors are local and deterministic; scheduling effects are explicit. |
| Anki export | Export saved cards/decks locally with privacy warning; no AnkiConnect mutation by default. | ExportDialog | ExportService | export_job, export_manifest_item | genanki/.apkg or text export candidate | P6 | Export manifest lists included text/media; no external app mutation by default. |
| Optional generated subtitles | Run local ASR or import provider captions as labeled draft tracks after dependency/privacy gates; raw provider/ASR drafts cannot create learner study items until corrected/approved. | Library transcript lifecycle panel, GeneratedTrackReview | YouTubeCaptionProvider seam, ASRAdapter seam, TranscriptCorrectionService, ProviderPolicyService | subtitle_track transcript lifecycle fields, transcript provenance/warning flags, cue version links, saved_occurrence transcriptTrack context | fake/local adapters now; faster-whisper/whisper.cpp/WhisperX/stable-ts candidates later after provenance | P7/V3 | Fake YouTube/local-ASR adapters create draft tracks and quality reports; no-network unauthorized import stops before adapter execution; corrected/approved version enables saves. |
| Optional pronunciation/shadowing | Loop cue, record learner locally, compare via local ASR/alignment with explicit microphone handling. | ShadowingView | RecordingService, PronunciationScorerAdapter | practice_attempt, cache_asset temp recording | local ASR/forced alignment candidate | V2/P7 optional | Temp recording lifecycle is tested; online scoring requires explicit opt-in. |
| Progress tracking | Compute local watch/study/due/saved metrics from events. | ProgressDashboard | ProgressProjection | review_event, media_marker, practice_session | SQLite projections | P8 | Metrics are recomputable from local state. |
| Privacy/settings | Control provider, export, logging, backup and media-copy policies. | PrivacySettingsView | ProviderPolicyService, SettingsService | app_setting, provider_policy | no-network harness | P0/P8 | Providers disabled by default and covered by zero-network test. |
| Backups/sync | Metadata-only local backup first; media copy/cloud sync opt-in only. | BackupRestoreView | BackupService, SyncDesignGate | backup_snapshot, export_manifest_item | SQLite backup/export archive | P8 | Backup/restore roundtrip passes; media copy policy explicit. |

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
