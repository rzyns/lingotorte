# Preliminary Grounding Research — Lingopie-like Local App

**Workspace:** `<local-workspace>/lingotorte`
**Source artifact:** `<local-home>/lingopie-local-clone-investigation.md`
**Captured through:** 2026-06-19T15:42:20-04:00  
**Scope:** preliminary grounding for a future `hermes-war-room` deep-dive mission.

## Executive summary

A local private Lingopie-like system is feasible if the product is scoped around **owned local video + subtitle-based learning**, not around reproducing Lingopie’s commercial catalog, mobile apps, live lessons, proprietary data, or DRM streaming integrations.

The clean product decomposition is:

1. **Local media ingestion** — video files, embedded/external subtitles, generated subtitles when missing.
2. **Artifact-centered player** — video/transcript as central artifact; dual subtitles, cue list, looping, speed controls, click/hover word lookup, phrase selection.
3. **Language analysis** — tokenization, lemma/POS/morphology, dictionary/translation, grammar explanation.
4. **Saved learning items** — words/phrases/sentences tied to exact video time ranges and transcript cues.
5. **SRS/practice** — FSRS scheduling, video-backed flashcards, quiz modes, sentence reconstruction.
6. **Optional speaking** — listen/repeat and local pronunciation scoring via ASR/forced alignment.

Recommended first build target:

> A local web/Tauri app with SQLite + local file references. It should import local files, parse/align subtitles, display video + transcript as the central artifact, let the learner save word/phrase/sentence occurrences, and review them through FSRS flashcards with optional Anki export.

## Boundary and provenance

Lingopie should be treated as a **reference product/UX** only.

Allowed:

- public documentation review;
- visual/live UI inventory of interaction mechanics;
- high-level product decomposition;
- comparison with OSS tools;
- planning for local-owned-media workflows.

Disallowed unless Janusz explicitly authorizes a different legal/safety posture:

- copying proprietary Lingopie code/assets/media/subtitles/catalog data;
- scraping private APIs or private account data;
- credential/token/storage extraction;
- DRM circumvention or stream capture;
- account mutations such as saving words or submitting reviews.

## Public-doc feature inventory

Public Lingopie docs/blogs describe these relevant feature families.

### Video-player learning features

- Dual/target/native subtitles.
- Click/hover words and phrases for instant translation/context.
- Grammar Coach / color-coded grammar index with parts of speech.
- Sentence explanations / contextual grammar explanations.
- Listen and Repeat.
- Pronunciation recording/feedback features.
- Auto-loop subtitles / loop sentence.
- Slow playback / speed adjustment.
- Subtitle-language selection.

### Study/practice features

- Clicked words/phrases are saved to vocabulary.
- Saved items become video/context-backed flashcards.
- Flashcards use spaced repetition.
- Practice modes map to concepts like flashcards, pop quiz, word matching, and sentence reconstruction.
- `My Vocab` and `My Sentences` style sections.
- Progress tracking/dashboard.

### Extension behavior

- Public docs describe a browser extension overlaying learning features on supported video content.
- Extension/sync/catalog behavior should be **out of scope** for the first local-private clone unless a later non-DRM local/browser extension becomes valuable.

## Live CDP inspection findings

A logged-in Polish Lingopie catalog/player/practice session was inspected through Edge/CDP after the debug port was fixed. See `docs/research/live-ui-inventory.md` for the sanitized inventory.

High-signal observed mechanics:

- Catalog has app shell, progress widgets, content rails, filters, and continue-watching personalization.
- Episode route pattern: `/app/show/<showId>/episode/<episodeId>`.
- Episode interstitial exposes guided mode and `Skip & Start Watching` before player mode.
- Player uses custom learning chrome over embedded video.
- Player has dual captions, transcript side panel, tokenized transcript cells, Listen/Loop controls, sentence Explain/Save actions, and Grammar Index/POS coloring.
- Practice route is `/app/education/review`.
- Practice page is centered on contextual vocabulary review with game entrypoints, `My Vocab`, `My Sentences`, Learning/Due-to-Review/Mastered states, contextual last occurrence, morphology/POS, appearance counts, and SRS step indicators.

Privacy note: raw private vocabulary examples and account-specific data were intentionally not copied into durable project docs.

## Product shape: artifact-centered player

The core artifact is not a generic dashboard; it is the **video segment + aligned subtitle/transcript cue**. Every workflow should orbit that artifact:

```text
┌──────────────────────┬────────────────────────────────────┬──────────────────────┐
│ Library / episode    │ Video canvas + dual subtitles      │ Lookup / grammar     │
│ Media metadata       │ Current cue highlighted            │ Saved item details   │
│ Subtitle tracks      │ Loop/speed/shadow controls         │ Questions / notes    │
├──────────────────────┴────────────────────────────────────┴──────────────────────┤
│ Transcript cue strip/list: searchable, clickable, current cue, saved markers      │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Primary interaction loop:

1. Open a local video.
2. Select target-language subtitle track and optional native-language subtitle track.
3. Watch with dual subtitles and transcript sidebar.
4. Click/hover a word or drag/select phrase.
5. See dictionary/translation/POS/grammar/context.
6. Save word/phrase/sentence occurrence.
7. Review later as a video-backed card or quiz.

## Proposed architecture

### Deployment model

Recommended: **local-first desktop/web hybrid**.

- **Frontend:** Vite + TypeScript UI, wrapped in Tauri or served by a local web server.
- **Backend:** Python FastAPI or lightweight TypeScript service; Python is attractive for ASR/NLP pipelines and Janusz prefers `uv` workflows.
- **Storage:** SQLite for metadata/review state; filesystem references for media and generated assets; optional cache directory for clips/thumbnails/audio.
- **Media:** ffmpeg/ffprobe for metadata, subtitle extraction, clip/audio/image generation.
- **Privacy:** all media and progress local by default; online/LLM providers must be explicit and per-feature.

### Ingestion pipeline

Inputs:

- local video/audio files: `.mp4`, `.mkv`, `.webm`, etc.;
- external subtitles: `.srt`, `.vtt`, `.ass/.ssa`;
- embedded subtitle tracks from MKV/MP4;
- optional generated transcript via faster-whisper/whisper.cpp;
- optional translated subtitles via local translation model or explicit provider.

Pipeline:

1. Compute media fingerprint/hash and duration with `ffprobe`.
2. Extract subtitle track metadata.
3. Parse subtitle cues into normalized internal cue objects.
4. Align target/native tracks by timestamps and/or text similarity.
5. Tokenize cues and attach linguistic analysis.
6. Cache cue-level thumbnails/audio snippets lazily, not eagerly.

### Language analysis

Use replaceable language adapters:

- Generic European-language path: spaCy/Stanza/UDPipe for tokenization, lemma, POS, morph features.
- Japanese/Korean/Chinese path: language-specific tokenizers/dictionaries.
- Translation/definition:
  - local dictionaries where available;
  - optional Argos/NLLB/Marian/Ollama/local LLM for phrase translation;
  - optional online APIs only behind explicit opt-in.
- Grammar Coach:
  - v1: Universal POS color index + lemma/morph tags;
  - v2: sentence-level explanation from local LLM using cue text + POS parse;
  - v3: language-specific grammar rule cards.

### SRS/practice

Use FSRS for internal scheduling.

Keep linguistic state separate from review state:

- lexical/cue analysis is source-derived and recomputable;
- saved items/reviews are learner state and should be append-only/auditable.

Practice mode mapping:

- **Flashcard:** cue/word/phrase → reveal meaning; grade Again/Hard/Good/Easy.
- **Pop Quiz:** show video/cue context; choose translation/lemma/meaning from distractors.
- **Word Master:** play clip/audio; choose heard/saved word.
- **Sentence Wizard:** scramble target cue tokens/phrases; reconstruct sentence.
- **Shadowing:** loop cue; record learner; compare ASR text/timing.

## Typed data model sketch

Avoid loose untyped blobs except for explicitly versioned adapter payloads.

```ts
type UUID = string;
type ISODateTime = string;
type LanguageCode = string; // BCP-47, e.g. "es", "pl", "ja-JP"

type MediaFile = {
  id: UUID;
  path: string;
  sha256?: string;
  title: string;
  durationMs: number;
  createdAt: ISODateTime;
};

type SubtitleTrack = {
  id: UUID;
  mediaId: UUID;
  language: LanguageCode;
  role: "target" | "native" | "other";
  format: "srt" | "vtt" | "ass" | "embedded" | "generated";
  sourcePath?: string;
};

type Cue = {
  id: UUID;
  trackId: UUID;
  startMs: number;
  endMs: number;
  text: string;
  alignedCueId?: UUID;
};

type TokenOccurrence = {
  id: UUID;
  cueId: UUID;
  tokenIndex: number;
  surface: string;
  normalized: string;
  lemma?: string;
  upos?: "ADJ" | "ADP" | "ADV" | "AUX" | "CCONJ" | "DET" | "INTJ" | "NOUN" | "NUM" | "PART" | "PRON" | "PROPN" | "PUNCT" | "SCONJ" | "SYM" | "VERB" | "X";
  morph?: MorphFeature[];
};

type MorphFeature = {
  key: string;
  value: string;
};

type SavedItem = {
  id: UUID;
  kind: "lexeme" | "phrase" | "sentence";
  language: LanguageCode;
  displayText: string;
  occurrenceCueId: UUID;
  occurrenceTokenIds: UUID[];
  meaning?: string;
  notes?: string;
  createdAt: ISODateTime;
};

type ReviewCard = {
  id: UUID;
  savedItemId: UUID;
  cardType: "recognition" | "production" | "clip-to-word" | "sentence-order";
  dueAt: ISODateTime;
  fsrsState: "new" | "learning" | "review" | "relearning";
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
};

type ReviewEvent = {
  id: UUID;
  cardId: UUID;
  reviewedAt: ISODateTime;
  rating: "again" | "hard" | "good" | "easy";
  responseMs?: number;
};
```

## MVP cut

### MVP-0 feasibility spikes

Before full build, spike the riskiest pieces:

1. **Local player + dual subtitles** — Given a video and two subtitle files, display target/native cues in sync and seek from transcript.
2. **Click-to-token lookup** — Given target subtitle text, click a word/phrase and resolve token/lemma/POS plus dictionary/translation candidate.
3. **Video-backed FSRS flashcards** — Given a saved occurrence, replay exact cue clip, store a review event, and compute next due time via FSRS.
4. **Generated subtitles and alignment** — Given video without subtitles, run faster-whisper/whisper.cpp and assess cue timing quality.
5. **Pronunciation/shadowing** — optional later spike with local ASR/forced alignment.

### MVP-1 useful local product

- Media library with local file references.
- Import video + SRT/VTT/ASS subtitles.
- Dual-subtitle player.
- Transcript list with seek/current cue highlight.
- Cue auto-loop and playback speed controls.
- Click/drag word/phrase selection.
- Dictionary/translation side panel.
- Save word/phrase/sentence occurrence.
- `My Vocab` / `My Sentences`.
- FSRS flashcards.
- Optional Anki export/AnkiConnect.

### V1 additions

- Embedded subtitle extraction.
- Whisper/faster-whisper transcription.
- Subtitle sync/alignment tools.
- POS/grammar color index.
- Sentence/phrase grammar explanations via local LLM.
- Pop Quiz / Word Master / Sentence Wizard.
- Clip thumbnails/audio extraction.

### V2 additions

- Higher-quality pronunciation scoring.
- Mobile/PWA review client.
- Local LAN sync or explicit encrypted backup.
- Browser extension for non-DRM web videos.
- Rich progress analytics.

## Existing OSS substrate assessment seeds

| Project/tool | Preliminary fit | Notes |
|---|---:|---|
| asbplayer | Very high | MIT; browser player/extension; local files; selectable subtitles; subtitle seeking; Anki card creation. Best first deep comparison target. |
| subs2srs | High for pipeline | Proven video/subtitle → clips/cards workflow; useful ffmpeg/card-generation reference. |
| FSRS / ts-fsrs | High | Modern SRS scheduler; use internally instead of inventing scheduling. |
| Y’ALL MP | Medium/high reference | Language-learning media player with subtitle editing, dictionary lookup, Anki. |
| LLPlayer | Medium reference | Local ASR, dual subtitles, translation; investigate license/platform constraints. |
| Mirumoji | Medium if Japanese | Self-hosted Japanese immersion toolkit with Whisper, clickable subtitles, Anki. |
| Memento/SubMiner/jidoujisho | Medium, Japanese-heavy | Strong sentence-mining/dictionary/Anki patterns. |
| mLearn | Medium | Broad immersion app concept; investigate license/quality before using as substrate. |

## Current recommendation

Build Lingotorte around a narrow first milestone:

> Drag in a local video and target/native subtitles, watch with interactive dual subtitles, click words/phrases for lookup, save them as video-backed learning items, and review them with FSRS/Anki-style cards.

Study `asbplayer` first as a candidate substrate/reference. The fastest honest path may be:

1. Try asbplayer with one local video/subtitle pair.
2. Identify exact gaps versus the desired local Lingopie-like product.
3. Build a thin local app around gaps: vocabulary store, FSRS, grammar/POS, local media library, games.
4. Only build a full custom player if asbplayer’s extension/app architecture fights the local-private direction.

## Open questions for Janusz

1. Primary target language(s)? This heavily affects dictionary/tokenizer choices.
2. Are source videos already subtitled? If yes, which formats/languages?
3. Preferred product shell: browser app, Tauri desktop app, or integration with an existing player like mpv/asbplayer?
4. Is Anki integration desirable, or should Lingotorte own the SRS entirely?
5. How strict is offline/local-only? Are local LLMs acceptable? Are online translation APIs acceptable behind explicit opt-in?
