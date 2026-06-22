# Lingotorte Product Behavior Specification

**Status:** planning/documentation artifact  
**Scope:** local/private Lingopie-like product behavior for owned/local media and explicit subtitle/transcript inputs  
**Evidence rule:** every normative product claim below is prefixed with an evidence label:

- **[OBSERVED-LIVE]** sanitized Lingopie UI mechanic observed in `../research/live-ui-inventory.md`.
- **[PRELIM]** preliminary synthesis or architecture direction from `../research/preliminary-grounding-research.md`.
- **[PROJECT]** local project boundary/default from `../../AGENTS.md`, `../../README.md`, or mission docs.
- **[INFERENCE]** design inferred from observed/reference behavior and local-first constraints.
- **[RECOMMENDATION]** proposed Lingotorte behavior that goes beyond current evidence and should be accepted, changed, or tested by Janusz/implementers.

## Source map and stable cross-references

- `../../AGENTS.md#core-framing` — local-first artifact-centered framing.
- `../../AGENTS.md#operating-boundaries` — no proprietary copying, no DRM/circumvention, privacy by default, evidence labels.
- `../../README.md#boundary-reminder` — reference UX only; no private/proprietary data extraction.
- `../mission/hermes-war-room-mission-statement.md#hard-boundaries` — hard boundaries for future work.
- `../mission/hermes-war-room-mission-statement.md#defaults-if-not-otherwise-decided` — default shell/storage/SRS/language assumptions.
- `../mission/lingopie-war-room-brief.md#initial-hypothesis-to-test` — candidate product hypothesis.
- `../research/preliminary-grounding-research.md#product-shape-artifact-centered-player` — artifact-centered player model.
- `../research/preliminary-grounding-research.md#ingestion-pipeline` — proposed ingestion pipeline.
- `../research/preliminary-grounding-research.md#typed-data-model-sketch` — seed typed model.
- `../research/preliminary-grounding-research.md#mvp-cut` — MVP/V1/V2 feature cuts.
- `../research/live-ui-inventory.md#player-inventory` — sanitized reference player observations.
- `../research/live-ui-inventory.md#practice-route-inventory` — sanitized reference practice/review observations.

## Global behavior principles

1. **[PROJECT]** Lingotorte must target Janusz-owned/local videos and explicit subtitle/transcript files or locally generated transcripts; it must not copy proprietary media, subtitles, catalog data, branding, private API payloads, account data, or assets. See `../../AGENTS.md#operating-boundaries` and `../../README.md#boundary-reminder`.
2. **[PROJECT]** Local/offline processing and local storage are defaults; online translation, online LLM, cloud sync, or third-party ASR are opt-in feature gates with visible privacy warnings. See `../../AGENTS.md#operating-boundaries` and `../mission/hermes-war-room-mission-statement.md#hard-boundaries`.
3. **[PRELIM]** The core artifact is the video segment plus aligned transcript/subtitle cue; saved vocabulary, grammar, review, and analytics orbit that artifact. See `../research/preliminary-grounding-research.md#product-shape-artifact-centered-player`.
4. **[RECOMMENDATION]** User-visible data should be modeled with typed domain objects rather than loose unstructured blobs; adapter-specific payloads may be versioned extension records when necessary. See `../research/preliminary-grounding-research.md#typed-data-model-sketch`.
5. **[RECOMMENDATION]** MVP behavior should be useful without account creation, cloud login, proprietary catalog integration, or browser-extension permissions.
6. **[INFERENCE]** Every feature that changes learner state should be reversible or auditable where practical: user can delete saved items, remove media from library without deleting original files, and export/back up local learner state.
7. **[RECOMMENDATION]** Implementation agents should treat this document as a behavior contract: if a feature is too large, split by the acceptance criteria here rather than changing semantics silently.

## Shared domain objects

**[PRELIM]** The following names align with the typed model seed in `../research/preliminary-grounding-research.md#typed-data-model-sketch` and are used throughout this specification.

- `MediaFile`: local media reference, metadata, fingerprint/hash, duration, library title, created/imported timestamps.
- `SubtitleTrack`: parsed subtitle/transcript source tied to a media file; has language, role (`target`, `native`, `other`), format, provenance, and cues.
- `Cue`: timed subtitle/transcript unit with start/end milliseconds, text, track id, optional aligned native/target cue id, and optional derived token ids.
- `TokenOccurrence`: token instance within a cue; stores surface text, normalized text, lemma/POS/morphology when available, token index/span, and cue link.
- `SavedItem`: learner-saved lexeme, phrase, or sentence with display text, meaning/notes, source cue/time range/media, and occurrence token ids where applicable.
- `ReviewCard`: FSRS/practice card derived from a saved item.
- `ReviewEvent`: append-only learner review event with rating, timestamp, card id, and optional response telemetry.
- `LanguageAnalysis`: adapter output for tokenization, lemmatization, POS, morphology, translation, dictionary, sentence explanation, ASR, or alignment, with adapter id/version.
- `Settings`: privacy, storage, language, lookup provider, backup/sync, accessibility, and playback defaults.

## Feature specifications

### 1. Media import

#### User story

**[RECOMMENDATION]** As a learner, I can add a local video/audio file to my Lingotorte library so I can study from media I own without uploading it to a cloud service.

#### UI states

- **[INFERENCE] Empty library:** show a primary `Import media` action, supported file examples, and a privacy note that files remain local.
- **[INFERENCE] File picker / drag-over:** accept one or more files; show which files will be imported as references, not copied, unless the user chooses copy-to-library.
- **[RECOMMENDATION] Import preview:** display filename, detected duration, container, audio/video tracks, embedded subtitle tracks if discovered, and initial title suggestion.
- **[RECOMMENDATION] Import in progress:** show ffprobe/metadata scanning status and cancellable progress.
- **[RECOMMENDATION] Import success:** show media detail with subtitle/transcript import next steps.
- **[RECOMMENDATION] Import error:** show actionable reason: unreadable file, unsupported codec/container, missing file permission, duplicate media, or metadata probe failure.

#### Inputs

- **[PRELIM]** Local media files such as `.mp4`, `.mkv`, `.webm`, and audio files are expected inputs. See `../research/preliminary-grounding-research.md#ingestion-pipeline`.
- **[RECOMMENDATION]** Optional user overrides: display title, source language, target study language, copy-vs-reference mode, collection/folder tags.

#### Outputs

- **[RECOMMENDATION]** A `MediaFile` record with local path or copied-library path, duration, imported timestamp, detected media metadata, optional fingerprint/hash, and library display metadata.
- **[RECOMMENDATION]** A media detail page ready for subtitle/transcript import or local transcript generation.

#### Edge cases

- **[RECOMMENDATION]** Duplicate file detected by path and/or content fingerprint: offer `Open existing`, `Import as separate copy`, or `Update file path`.
- **[RECOMMENDATION]** File moved after import: show missing-file state and allow relinking without losing learner data.
- **[RECOMMENDATION]** Network/cloud-synced filesystem path: warn that Lingotorte does not control external sync privacy.
- **[RECOMMENDATION]** Unsupported or DRM-protected media: refuse circumvention and show a boundary-respecting explanation.
- **[RECOMMENDATION]** Very large media: support reference mode and lazy asset generation to avoid unnecessary copies.

#### Persistence needs

- `MediaFile` metadata and file reference/copy mode.
- Optional content hash/fingerprint and last-seen file stat.
- User metadata: title, collection, language hints, thumbnail selection.
- Import log record for diagnostics without storing private external tokens or cloud credentials.

#### Acceptance criteria

- Given a readable local `.mp4`, importing creates one `MediaFile` and shows a media detail page with duration.
- Given the same file imported twice, the UI identifies a likely duplicate and requires an explicit user choice.
- Given a moved file, the library shows a missing-file state and relinking restores playback without deleting saved learner items.
- Given an unsupported/DRM-protected source, Lingotorte fails safely and does not attempt DRM bypass or stream capture.
- Importing does not upload media or metadata unless a separate opt-in sync/provider feature is explicitly enabled.

### 2. Subtitle/transcript import

#### User story

**[RECOMMENDATION]** As a learner, I can attach target-language and optional native-language subtitle/transcript files to a media item so Lingotorte can render dual subtitles, a synchronized transcript, and cue-backed saved items.

#### UI states

- **[INFERENCE] No tracks:** media detail prompts for target subtitle import, native subtitle import, embedded-track extraction, or generated transcript.
- **[RECOMMENDATION] Track import dialog:** user selects file, language, role (`target`, `native`, `other`), format if not auto-detected, encoding, and timing offset if known.
- **[RECOMMENDATION] Parse preview:** show first/last cues, cue count, detected encoding, language confidence if available, and warnings.
- **[RECOMMENDATION] Alignment preview:** if target/native tracks both exist, show sample paired cues and allow offset adjustment.
- **[RECOMMENDATION] Error state:** malformed subtitle, empty transcript, encoding failure, overlapping cues, missing timestamps, or unsupported format.

#### Inputs

- **[PRELIM]** External subtitle formats include `.srt`, `.vtt`, `.ass/.ssa`; embedded subtitle tracks may come from MKV/MP4. See `../research/preliminary-grounding-research.md#ingestion-pipeline`.
- **[RECOMMENDATION]** Plain text transcripts may be imported only if the user accepts that timing must be generated or manually aligned before synchronized features work.

#### Outputs

- `SubtitleTrack` records with normalized `Cue` records.
- Optional `CueAlignment`/aligned cue references between target and native tracks.
- Parse warnings and provenance stored for troubleshooting.

#### Edge cases

- Subtitle file has wrong encoding: offer encoding retry and preview.
- Subtitle timing shifted: allow global offset and save adjusted derived track rather than mutating source file.
- Native and target subtitles have different segmentation: allow many-to-one and one-to-many cue alignment display.
- Duplicate track: detect same file/hash/role/language and ask whether to replace or keep both.
- Missing language metadata: require user selection before using as target/native role.

#### Persistence needs

- Original source file path or copied subtitle content, depending on import mode.
- Parsed cue text/timing and parser version.
- Track role/language/provenance.
- Alignment settings, offset edits, and non-destructive corrections.

#### Acceptance criteria

- Given valid target `.srt`, import creates a target `SubtitleTrack` and cue list ordered by start time.
- Given target and native subtitle tracks, the player can render both at the current video time.
- Given a malformed subtitle, import fails with line/format diagnostics and no partial active track unless user chooses a recoverable import.
- Given an offset correction, the adjusted timing persists and is used for playback/transcript synchronization.
- Imported subtitle provenance remains distinguishable from generated transcripts.

### 3. Optional transcript generation and alignment

#### User story

**[RECOMMENDATION]** As a learner with media lacking usable subtitles, I can optionally generate a draft transcript and align it to the media so I can still study with synchronized cues after correction/approval.

#### UI states

- **[RECOMMENDATION] Generation unavailable:** show that ElevenLabs Scribe v2 provider configuration/consent is missing, or that the future local opt-out engine is not installed/configured; offer setup guidance without silently falling back to another provider.
- **[RECOMMENDATION] Generation settings:** select provider/engine, language hint, diarization/word-timing options where available, output role, and privacy mode.
- **[RECOMMENDATION] Running:** show progress by media duration processed; allow cancellation; keep partial output disabled until accepted.
- **[RECOMMENDATION] Review generated transcript:** show confidence/warnings, cue timing samples, and action buttons `Accept as generated track`, `Discard`, `Regenerate`, or `Export`.
- **[RECOMMENDATION] Alignment editor:** when aligning generated transcript or plain text to existing subtitles, show waveform/video time, cue list, and offset/segment tools.

#### Inputs

- Local media audio.
- Optional language hint and target/native role.
- Optional existing transcript/subtitle to align against.
- ElevenLabs Scribe v2 provider configuration/consent for the first real STT path, or future local ASR/forced-alignment engine configuration.

#### Outputs

- Draft generated `SubtitleTrack` with provenance, engine id/version, language, confidence/warning metadata, cues, and first-class word-timing rows where available.
- Alignment metadata if generated output is aligned to a reference track.

#### Edge cases

- Long media: support background jobs, pause/resume, and clear disk usage estimates.
- Low-confidence transcript: visibly mark generated cues as lower confidence.
- Wrong language hint: allow discarding/regenerating without contaminating saved learner state.
- Overlapping speakers/music/noise: preserve warnings; do not imply transcript accuracy.
- User cancels: delete or quarantine partial artifacts unless user explicitly saves them.

#### Persistence needs

- Job metadata, engine/model version, settings, created artifacts, and accepted/discarded status.
- Generated track separated from imported human subtitle tracks.
- Non-destructive alignment edits.

#### Acceptance criteria

- Generation is disabled unless the target provider/engine is configured and explicitly enabled; ElevenLabs Scribe v2 is the first real target for Janusz's personal deployment, while local models remain a future opt-out lane.
- Accepted generated transcript appears as a selectable subtitle/transcript track and is labeled as generated.
- Discarded generated transcript is not used in player, lookup, saved occurrences, or progress analytics.
- Alignment edits change displayed cue timing without modifying the original media file.
- Privacy copy states whether audio leaves the machine; fresh installs/tests keep providers disabled and must make zero network calls.

### 4. Interactive dual subtitles

#### User story

**[OBSERVED-LIVE]** The reference player displays target-language and English/native subtitle lines together. See `../research/live-ui-inventory.md#player-inventory`.  
**[RECOMMENDATION]** Lingotorte should let the learner watch local media with synchronized target and optional native subtitles, where target subtitle text can expose token/phrase interactions.

#### UI states

- **[RECOMMENDATION] Both tracks active:** video overlay shows target line and native line; current cue is highlighted in transcript.
- **[RECOMMENDATION] Target-only:** show target line with native line hidden/empty; lookup and save still work.
- **[RECOMMENDATION] Native-only:** allow comprehension mode but warn that target-language learning features need a target track.
- **[RECOMMENDATION] No active cue:** hide subtitle text or show `No subtitle at current time`; controls remain usable.
- **[RECOMMENDATION] Track selector:** choose target/native roles independently; show language, provenance, and cue count.
- **[RECOMMENDATION] Styling controls:** size, position, contrast, font, line wrapping, and hide/show native translation.

#### Inputs

- Current playback time.
- Active target/native `SubtitleTrack` selection.
- User display settings and optional grammar/POS coloring settings.

#### Outputs

- Current cue overlay with accessible text.
- Active cue id emitted to transcript, lookup, save, and progress systems.

#### Edge cases

- Overlapping target cues: show deterministic merge or stacked display with clear ordering.
- Target/native track timing mismatch: display closest aligned native cue and expose offset/alignment adjustment.
- Very long subtitle lines: wrap without covering controls; preserve full text in transcript panel.
- Fullscreen mode: retain subtitle and keyboard accessibility.
- No tokenization available: subtitle remains clickable at cue/sentence level; token lookup disabled with explanation.

#### Persistence needs

- Per-media active track roles and offset/alignment settings.
- Global and per-media subtitle style preferences.
- Last playback position and hide/show native preference.

#### Acceptance criteria

- At a time within a target cue, target subtitle text appears on the video overlay.
- If a native track is selected and aligned, native text appears in the configured secondary subtitle position.
- Switching subtitle tracks updates overlay and transcript without losing saved items tied to other tracks.
- Fullscreen and keyboard-only playback preserve subtitle visibility and controls.
- No proprietary branding, copy, colors, or assets are required to implement this behavior.

### 5. Synchronized clickable transcript

#### User story

**[OBSERVED-LIVE]** The reference player exposes a `Read Along` side panel with tokenized transcript rows that track playback. See `../research/live-ui-inventory.md#player-inventory`.  
**[RECOMMENDATION]** Lingotorte should provide a synchronized transcript where selecting a cue seeks the video and playback highlights the current cue.

#### UI states

- Transcript closed/collapsed.
- Transcript open with current cue auto-scrolled and highlighted.
- Search/filter mode showing matching cues.
- Cue selected/active/focused state.
- Token hover/focus/click state inside a cue.
- Missing transcript state.

#### Inputs

- Current playback time.
- Active target/native track and alignment.
- User scroll/search/focus actions.
- Tokenization output if available.

#### Outputs

- Cue seek event when user clicks a transcript row or timestamp.
- Token/phrase selection events for lookup/save.
- Search result list tied to cue ids and times.

#### Edge cases

- Auto-scroll should pause while user manually scrolls and resume via explicit `Follow playback` control.
- Searching while video plays should not steal focus unexpectedly.
- Cue with no tokens still supports sentence-level selection and seek.
- Multiple tracks may produce parallel transcript columns; MVP may show target cue plus native aligned text.
- Very long transcripts require virtualization without breaking current-cue highlighting.

#### Persistence needs

- Per-media transcript panel open/closed state and follow-playback preference.
- Search history need not persist by default.
- Cue-level derived indexes for fast search.

#### Acceptance criteria

- Clicking transcript cue seeks video to cue start time.
- During playback, current cue is visually and programmatically identified.
- Keyboard focus can navigate cue rows and activate seek without mouse.
- Transcript search returns cue/time matches and selecting a result seeks correctly.
- Transcript rendering scales to long media without freezing the UI.

### 6. Token/word lookup

#### User story

**[OBSERVED-LIVE]** Reference UI supports clickable tokenized transcript cells and vocabulary rows with POS/morphology labels. See `../research/live-ui-inventory.md#player-inventory` and `../research/live-ui-inventory.md#practice-route-inventory`.  
**[RECOMMENDATION]** Lingotorte should let the learner click or keyboard-select a word/token and inspect dictionary, lemma, POS, morphology, translation, and source context.

#### UI states

- Token hover/focus affordance.
- Lookup loading state.
- Lookup result panel with surface, lemma, language, POS/morphology, candidate meanings, examples/context, and save action.
- Ambiguous result state with multiple lemmas/analyses.
- Not-found state with manual meaning entry.
- Provider disabled/unavailable state.

#### Inputs

- Token occurrence id or text span, cue text, active language, media/cue context.
- Language adapter outputs: tokenizer, lemma/POS/morphology, dictionary/translation provider.
- Optional user-selected provider and privacy settings.

#### Outputs

- `LanguageAnalysis` lookup result.
- User-selected meaning/notes for saving.
- Optional cache entry keyed by language/token/lemma/provider/version.

#### Edge cases

- Punctuation/clitics/contractions/multi-word tokens: adapter should expose normalized form and span mapping.
- Inflected languages such as Polish: show lemma and morph tags when available; do not collapse inflected occurrence context into bare dictionary entry.
- Multiple candidate translations: user can choose/edit before save.
- Offline dictionary missing: show manual save path and adapter configuration guidance.
- Online provider disabled: do not call it silently.

#### Persistence needs

- Token occurrence records and cached analysis results with provider/version.
- User edits to meanings/notes attached to `SavedItem`, not necessarily global dictionary truth.
- Privacy settings for provider use.

#### Acceptance criteria

- Clicking a token opens lookup panel without pausing playback unless user has enabled pause-on-lookup.
- Lookup panel always shows source media, cue time, and sentence context.
- If no lookup provider succeeds, user can still save a manual item tied to the occurrence.
- Online lookup is never invoked unless explicitly enabled.
- POS/morphology display degrades gracefully when the adapter lacks those fields.

### 7. Phrase selection

#### User story

**[PRELIM]** Public/reference feature inventory includes click/hover words and phrases for instant translation/context. See `../research/preliminary-grounding-research.md#public-doc-feature-inventory`.  
**[RECOMMENDATION]** Lingotorte should let the learner select a phrase within one cue, inspect phrase-level translation/explanation, and save it as a contextual phrase occurrence.

#### UI states

- Drag selection across tokens in current cue.
- Keyboard selection mode from focused token.
- Selection toolbar: `Lookup phrase`, `Save phrase`, `Explain`, `Clear`.
- Cross-cue selection warning or advanced mode.
- Phrase lookup loading/result/not-found states.

#### Inputs

- Ordered token occurrence ids or character span inside a cue.
- Cue text, language, optional native aligned text.
- Phrase lookup/translation adapter.

#### Outputs

- Phrase lookup result or manual phrase entry.
- `SavedItem` of kind `phrase` with occurrence token ids and cue/time range.

#### Edge cases

- Selection includes punctuation: preserve display text but normalize lookup span.
- Selection crosses cues: MVP should reject or ask to save as sentence/note; V1 may support multi-cue clips.
- Overlapping saved phrases: allow multiple saved items with different spans.
- Text selection conflicts with video dragging: transcript and overlay should have predictable selection behavior.

#### Persistence needs

- Exact phrase surface span, token ids, cue id, media id, meaning/notes, analysis provider output.
- Optional phrase-level audio clip cache boundaries.

#### Acceptance criteria

- User can select a contiguous token span in a cue and save it as a phrase.
- Saved phrase remains tied to source cue/time even if dictionary meaning is later edited.
- Phrase lookup respects offline/online provider settings.
- Keyboard-only selection path exists.
- Phrase selection does not mutate subtitle source files.

### 8. Saved vocabulary, phrases, and sentences

#### User story

**[OBSERVED-LIVE]** Reference practice UI has `My Vocab` and `My Sentences`, review states, contextual last occurrence, source links, appearance counts, POS/morphology, and SRS indicators. See `../research/live-ui-inventory.md#practice-route-inventory`.  
**[RECOMMENDATION]** Lingotorte should let learners save vocabulary, phrases, and sentences from media context and manage them in local collections.

#### UI states

- Save action idle/hover/focus.
- Save editor with item kind, display text, meaning, notes, tags, source context, and review-card options.
- Already-saved indicator for same lexeme/phrase/sentence in current cue.
- My Vocab list with filters: learning state, due, mastered, media, language, tag, search.
- My Sentences list with sentence text, translation/native aligned cue, source media/time, saved date, review state.
- Delete/archive confirmation with impact on review cards.

#### Inputs

- Token, phrase, or cue/sentence selection.
- Lookup/analysis results.
- User meaning edits, notes, tags, and review preferences.

#### Outputs

- `SavedItem` for `lexeme`, `phrase`, or `sentence`.
- Optional `ReviewCard` records generated according to user defaults.
- Saved marker on transcript/player and item in library/review screens.

#### Edge cases

- Same lexeme appears in multiple cues: support one canonical saved item with multiple occurrence records, or separate occurrence-specific saves; UI must show which model is used.
- User saves inflected form and later lemma: preserve occurrence form and optional lemma grouping.
- Deleting a saved item with review history: archive by default; hard delete requires explicit confirmation.
- Media removed/missing: saved item remains visible with missing-media warning and text context.
- Meaning conflict across contexts: allow context-specific meanings/notes.

#### Persistence needs

- Saved item core fields, source occurrence/time/media, user edits, tags, created/updated timestamps.
- Occurrence count and list of linked occurrences.
- Review card generation state and archive/delete status.
- Append-only review events retained unless user hard-deletes local data.

#### Acceptance criteria

- Saving a word/phrase/sentence creates a local saved item visible in the appropriate collection.
- Saved item shows source media, cue text, cue start/end, and display text.
- Reopening the same media shows saved markers for relevant cues/tokens.
- My Vocab/My Sentences can filter by learning/due/mastered state once review data exists.
- User can edit meaning/notes without losing the original source occurrence.

### 9. Contextual occurrence saving tied to source media and cue

#### User story

**[PRELIM]** Saved learning items should be tied to exact video time ranges and transcript cues. See `../research/preliminary-grounding-research.md#executive-summary` and `../research/preliminary-grounding-research.md#srspractice`.  
**[RECOMMENDATION]** Every saved learning item should retain inspectable source context so review and later rewatching can return to the exact media moment.

#### UI states

- Source context preview in save editor.
- Saved item details panel with `Open at source`, `Play cue`, `Loop cue`, and `Show in transcript`.
- Missing media/source warning.
- Multiple occurrences tab/list for a saved lexeme/phrase.

#### Inputs

- Media id, cue id, cue start/end, active track id, token ids/span, current playback time, aligned native cue id if available.

#### Outputs

- `SavedOccurrence` or equivalent fields on `SavedItem`: media id, track id, cue id, start/end, token ids/span, source text, aligned native text snapshot or reference.
- Optional cue-level clip/audio cache request.

#### Edge cases

- Subtitle track replaced after saving: saved occurrence should keep a stable cue reference or text/time snapshot; UI should flag stale source if cue no longer exists.
- Media relinked: occurrence remains valid if media identity/fingerprint matches or user confirms relink.
- User edits cue timing: occurrence follows cue id but stores original timing for audit/recovery.
- Generated transcript later regenerated: saved occurrences tied to old generated track require migration/confirmation.

#### Persistence needs

- Stable source references and snapshots sufficient for review even if derived analysis changes.
- Source provenance and version of subtitle/generation/alignment data.

#### Acceptance criteria

- From any saved item, `Open at source` seeks the original media to the saved cue/time.
- Saved item detail displays source text and native aligned text if available.
- If source media is missing, saved item still shows text context and a relink action.
- Replacing or regenerating subtitle tracks does not silently retarget existing saved occurrences.
- Occurrence metadata is exportable for backup/Anki-like use.

### 10. Sentence explanations

#### User story

**[OBSERVED-LIVE]** Reference transcript context exposes sentence-level `Explain` and grammar/POS features. See `../research/live-ui-inventory.md#player-inventory`.  
**[RECOMMENDATION]** Lingotorte should provide sentence/cue explanations that summarize grammar, vocabulary, and meaning using local adapters by default, with optional LLM/provider gates.

#### UI states

- Explain action on current cue/selected sentence.
- Explanation loading state with provider label.
- Explanation result with sections: literal meaning, natural meaning, grammar/POS notes, difficult words, source context.
- Low-confidence/provider-error state.
- Manual note mode when no provider is available.

#### Inputs

- Cue text, aligned native cue text, token/POS/morph analysis, media language, user proficiency setting if any.
- Explanation adapter: rule-based, local LLM, or opt-in online provider.

#### Outputs

- `LanguageAnalysis` explanation result tied to cue id and adapter version.
- Optional user note saved on sentence or saved item.

#### Edge cases

- Generated/low-confidence transcript: explanation should show source confidence warning.
- Missing POS/morphology: explanation may be translation-only or manual.
- Online LLM provider: require explicit opt-in and show what text is sent.
- Hallucination risk: label explanation as generated assistance, not authoritative grammar truth.
- Sensitive local media text: privacy warning before sending to external service.

#### Persistence needs

- Cached explanations with provider/version/time and invalidation when source cue or analysis changes.
- User notes distinct from generated explanation.
- Privacy consent settings and per-request audit log if external provider used.

#### Acceptance criteria

- Explain current cue produces a visible result or actionable unavailable state.
- Explanation shows provider/provenance and whether it is local or external.
- External provider is never used without explicit opt-in.
- User can save a sentence with explanation/notes tied to source cue.
- Cached explanation invalidates or warns when underlying cue text changes.

### 11. Listen, loop, speed, and cue-seek controls

#### User story

**[OBSERVED-LIVE]** Reference player has `Listen`, `Loop`, playback speed, previous/next/play/volume, and transcript/cue interaction controls. See `../research/live-ui-inventory.md#player-inventory`.  
**[RECOMMENDATION]** Lingotorte should let learners repeatedly listen to precise cues, slow playback, and move between cues without losing transcript context.

#### UI states

- Normal playback controls.
- Current cue loop enabled/disabled.
- Listen/replay current cue action.
- Speed menu: e.g. 0.5x, 0.75x, 1.0x, 1.25x, custom if feasible.
- Previous/next cue controls.
- A-B loop or phrase loop can be V1/V2; MVP current-cue loop is required.

#### Inputs

- Current playback time, current cue id/start/end, user speed setting, loop mode, keyboard shortcuts.

#### Outputs

- Seek/play/pause/speed events to media player.
- Loop boundary enforcement between cue start and end.
- Progress events for tracking.

#### Edge cases

- Cue duration extremely short: enforce minimum loop padding or replay behavior.
- User seeks outside loop while loop enabled: disable loop or move loop to new cue based on explicit setting.
- Track with gaps: next/previous cue jumps to nearest cue, not arbitrary seconds.
- Playback rate unsupported by backend/browser: show unavailable rates.
- Mobile/screen reader users: controls must have labels and keyboard equivalents.

#### Persistence needs

- Global default playback speed and per-media last speed if desired.
- Per-media loop setting should not persist across sessions unless user opts in.
- Keyboard shortcut preferences.

#### Acceptance criteria

- `Listen` replays current cue from start without losing current transcript highlight.
- `Loop` repeats the current cue until disabled or user navigates away according to defined behavior.
- Speed changes affect playback and are reflected in UI.
- Previous/next cue controls seek to adjacent cue boundaries.
- Keyboard shortcuts exist for play/pause, cue replay, previous/next cue, and speed where feasible.

### 12. Progress tracking

#### User story

**[OBSERVED-LIVE]** Reference catalog/practice surfaces progress widgets, streaks, watching counts, words due, SRS states, and mastered/learning/due categories. See `../research/live-ui-inventory.md#catalog-route-inventory` and `../research/live-ui-inventory.md#practice-route-inventory`.  
**[RECOMMENDATION]** Lingotorte should track local learning progress enough to resume media, show due reviews, and summarize practice without requiring service sync.

#### UI states

- Library cards show last watched position, completion percent, active subtitle language, saved item count.
- Dashboard widgets: due reviews, saved items, watched minutes, recent media, optional streak.
- Practice lists show Learning, Due, Mastered states.
- Privacy/settings area explains locally stored telemetry and lets user reset/export.

#### Inputs

- Playback events, media duration, cue completion, saved item creation, review events, user goals/settings.

#### Outputs

- Local progress records per media.
- Aggregated dashboard metrics.
- Review due counts from FSRS card state.

#### Edge cases

- User scrubs through media: do not overcount watch time as attentive learning; distinguish playback time from completed cue exposure if possible.
- Multiple devices without sync: show device-local progress only.
- Deleted/archived media: progress can be archived or deleted by user choice.
- Private mode: allow a media session not to update history/progress.
- Streak pressure: optional; do not make streaks required for learning state.

#### Persistence needs

- Media progress: last position, watched intervals or coarse completion, last opened.
- Review card state and append-only review events.
- Aggregates can be derived/cacheable; source events are authoritative.

#### Acceptance criteria

- Reopening a media item offers resume at last position.
- Dashboard due count matches cards due from review state.
- My Vocab/My Sentences state filters reflect review card state.
- User can export and reset local progress data.
- No progress data leaves the machine unless explicit sync/backup provider is enabled.

### 13. Privacy and settings

#### User story

**[PROJECT]** Local-first privacy is a hard boundary. See `../../AGENTS.md#operating-boundaries` and `../mission/hermes-war-room-mission-statement.md#hard-boundaries`.  
**[RECOMMENDATION]** Users should be able to see and control where media references, learner data, generated artifacts, and provider calls live.

#### UI states

- Settings overview with storage location, database path, media cache path, backup status, provider status.
- Privacy mode toggles: local-only default, external lookup disabled, external LLM disabled, telemetry disabled.
- Provider configuration with explicit opt-in, test connection, data-sent explanation, and revoke/disable.
- Data management: export backup, import backup, clear cache, delete all learner data, relink media roots.
- Per-feature consent prompt before first external provider use.

#### Inputs

- User preferences, provider credentials/endpoint settings, storage paths, backup/sync choices.

#### Outputs

- `Settings` records and local config files.
- Provider opt-in audit entries.
- Backup/export artifacts when requested.

#### Edge cases

- Provider credentials missing/invalid: feature remains local/manual; do not silently fail over to another external provider.
- User disables provider after cached results exist: cached data remains local but new calls stop; UI should explain cache status.
- Storage path unavailable: enter safe degraded mode and avoid corrupting database.
- Shared computer: support app lock/profile separation as future consideration; MVP at least documents local data location.
- Logs: avoid storing raw sensitive text in diagnostic logs unless user opts in to verbose local logs.

#### Persistence needs

- Settings versioning/migration.
- Provider enabled/disabled state and endpoints; secrets should use OS/keychain or protected config, not plain docs.
- Data export manifest and backup metadata.

#### Acceptance criteria

- Fresh install defaults to local-only behavior.
- Any external provider call requires prior explicit enablement and visible provider label.
- Settings page shows database/cache/media-reference locations.
- User can export a local backup and clear generated cache without deleting original media.
- Disabling a provider prevents future outbound calls from lookup/explanation/transcription features.

### 14. Backups and sync

#### User story

**[PRELIM]** Local storage plus optional cache and optional LAN/encrypted backup are part of the product direction. See `../research/preliminary-grounding-research.md#proposed-architecture` and `../research/preliminary-grounding-research.md#v2-additions`.  
**[RECOMMENDATION]** Lingotorte should support local backups early and treat sync as an explicit later opt-in, not a hidden default.

#### UI states

- Backup settings: backup now, schedule local backup, choose location, include/exclude cache, include/exclude copied media.
- Backup progress and result with manifest path, size, checksum, timestamp.
- Restore/import flow with preview: database version, media references, saved item counts, review events, conflicts.
- Sync disabled/default state with explanation.
- Future sync provider state: disconnected, connected, conflict, paused, error.

#### Inputs

- SQLite database, settings, generated analysis/cache metadata, copied subtitle/transcript files, optional copied media, user-chosen destination.

#### Outputs

- Versioned backup archive or folder with manifest.
- Restore report and conflict resolution choices.
- Optional future encrypted sync package.

#### Edge cases

- Original media referenced but not copied: backup manifest must say media is referenced externally and may need relinking on restore.
- Backup location inside app cache: warn against circular/fragile backup.
- Restore into existing database: require merge/replace choice and preview conflicts.
- Database schema version mismatch: run migration or refuse with safe error.
- Interrupted backup: leave incomplete artifact marked invalid.

#### Persistence needs

- Backup manifest with schema version, created timestamp, app version, included components, checksums.
- Last backup metadata and schedule settings.
- Restore log.

#### Acceptance criteria

- User can create a local backup containing learner state, settings, subtitle/transcript imports, and manifest.
- Backup manifest distinguishes referenced media from included copied media.
- Restore preview shows what will change before mutation.
- Sync features are disabled unless explicitly configured.
- Backup/restore never requires Lingopie or any proprietary service account.

### 15. Accessibility expectations

#### User story

**[RECOMMENDATION]** As a learner, I can use core player, transcript, lookup, and review workflows with keyboard, screen reader labels, adequate contrast, and subtitle readability controls.

#### UI states

- Keyboard focus visible for player controls, transcript cues, tokens, lookup actions, save editor, review controls.
- Screen reader labels and live-region behavior for current cue changes where appropriate.
- Subtitle display settings: font size, background opacity, contrast, position, native subtitle visibility.
- Reduced motion and no-autoscroll modes.
- Captions/transcript available as text, not only pixels.

#### Inputs

- Keyboard shortcuts, assistive technology focus events, user accessibility settings, OS reduced-motion/high-contrast preferences.

#### Outputs

- Accessible DOM/control state, ARIA labels where needed, persisted display preferences.
- Non-pointer alternatives for token/phrase selection and cue seeking.

#### Edge cases

- Auto-scrolling transcript can disorient screen readers: provide pause/follow toggle.
- Token-level click targets too small: ensure adequate hit areas and keyboard selection.
- Color-coded POS cannot be the only information channel; include text labels/patterns.
- Playback shortcuts conflict with browser/screen-reader shortcuts: allow remapping/disable.
- Fullscreen can trap focus: ensure escape/exit and control navigation work.

#### Persistence needs

- Accessibility/display preferences.
- Keyboard shortcut mapping.
- Per-user reduced-motion/autoscroll settings.

#### Acceptance criteria

- All MVP actions are reachable without a mouse: import, open media, play/pause, seek transcript cue, lookup token, save item, review card.
- Current cue and saved markers are exposed programmatically, not only by color.
- POS coloring includes textual labels or legends.
- Subtitle font/contrast settings persist across sessions.
- Automated accessibility tests plus manual keyboard smoke tests are part of implementation acceptance gates.

## Cross-feature workflow contracts

### Import-to-study workflow

1. **[RECOMMENDATION]** User imports local media.
2. **[RECOMMENDATION]** User imports or generates target subtitle/transcript.
3. **[RECOMMENDATION]** User optionally imports native subtitle track.
4. **[RECOMMENDATION]** User opens player; current cue drives subtitle overlay and transcript highlight.
5. **[RECOMMENDATION]** User clicks token or selects phrase/sentence.
6. **[RECOMMENDATION]** Lookup/explanation panel shows source context and local/offline provider provenance.
7. **[RECOMMENDATION]** User saves item; saved item records exact source media/cue/time/span.
8. **[RECOMMENDATION]** User reviews saved item later with a cue-backed card and can return to source media.

### Save-to-review workflow

1. **[PRELIM]** Saved items should become video/context-backed flashcards using FSRS scheduling. See `../research/preliminary-grounding-research.md#srspractice`.
2. **[RECOMMENDATION]** Creating a saved item may create one or more review cards according to defaults: recognition first, production/clip/sentence modes later.
3. **[RECOMMENDATION]** Review always preserves source occurrence access; a card is not just a free-floating dictionary prompt.
4. **[RECOMMENDATION]** Review events are append-only and update card scheduling state.

### Privacy/provider workflow

1. **[PROJECT]** Local-only is the default.
2. **[RECOMMENDATION]** If a feature needs an external provider, UI must show provider name, data to be sent, retention risk if known, and a `Cancel` path.
3. **[RECOMMENDATION]** External provider results must be tagged by provider/version and cache status.
4. **[RECOMMENDATION]** Provider disablement stops future calls across lookup, explanation, transcription, and sync.
5. **[PROJECT/RECOMMENDATION]** For Janusz's explicitly configured personal deployment, the first real STT target is ElevenLabs Scribe v2; fresh installs/tests still keep providers disabled and local/offline unavailable states must remain usable.

## MVP vs later cuts

### MVP-1 required behavior

- Media import by local file reference/copy choice.
- Target subtitle/transcript import with parsed cues.
- Optional native subtitle import and basic timestamp alignment/offset.
- Dual subtitle player.
- Synchronized transcript with cue seek/highlight.
- Token click lookup with manual fallback.
- Phrase selection within a cue.
- Save word/phrase/sentence with source occurrence context.
- Listen/replay current cue, loop current cue, playback speed.
- My Vocab/My Sentences lists with basic filters.
- Local progress/resume and due review count if review cards exist.
- Local-only privacy settings and backup export.
- Keyboard-accessible core flow.

### V1/V2 candidates

- Embedded subtitle extraction and richer subtitle alignment tools.
- ElevenLabs Scribe v2 transcript generation with word-level timestamps, plus future local WhisperX/faster-whisper-style opt-out and forced alignment.
- POS/grammar color index and sentence explanations.
- FSRS-backed full practice modes beyond basic flashcards.
- Clip/audio/thumb asset generation for cards.
- Optional Anki export.
- Optional pronunciation/shadowing.
- Optional encrypted LAN/cloud sync.
- Browser extension for non-DRM web videos only after separate safety review.

## Open product decisions for Janusz

- **[PROJECT]** Primary target languages are still open in preliminary research. See `../research/preliminary-grounding-research.md#open-questions-for-janusz`.
- **[PROJECT]** Desired shell remains a default rather than a final decision: local web app with Tauri path considered. See `../mission/hermes-war-room-mission-statement.md#defaults-if-not-otherwise-decided`.
- **[PROJECT]** Anki integration vs fully owned internal SRS remains open. See `../research/preliminary-grounding-research.md#open-questions-for-janusz`.
- **[PROJECT]** STT provider direction is resolved for Janusz's personal deployment: target ElevenLabs Scribe v2 behind explicit configuration/consent. Other online providers remain explicit opt-in decisions, and local/offline opt-out remains a future lane.

## Implementation-readiness checklist

- Each feature has user story, UI states, inputs/outputs, edge cases, persistence needs, and acceptance criteria.
- Cross-references point to existing repository documents or anchors in this document.
- Proprietary copying and DRM/account-mutation boundaries are repeated where behavior could otherwise drift.
- Saved learner state is artifact-centered: media + cue + time + token/span context.
- Privacy defaults are local/offline, with external providers modeled as opt-in gates.
- Accessibility is not postponed beyond MVP core interactions.
