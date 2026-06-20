# OSS Substrate Assessment

Status: planning assessment. Do not adopt, fork, copy, or import code until a future implementation task revalidates version, license, source, privacy/network behavior, and integration fit.

## OSS evidence table

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



## Source inventory and recommendations

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
