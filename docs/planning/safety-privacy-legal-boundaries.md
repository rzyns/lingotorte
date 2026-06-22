# Safety, Privacy, and Legal Boundaries

Status: authoritative planning gate for Lingotorte implementation tasks. Planning only; not legal advice and not permission to implement, scrape, publish, deploy, or mutate accounts.

This document repairs the independent challenge review's safety/privacy/legal block by collecting the hard boundaries into one implementation-facing gate.

## Non-negotiable project boundaries

| Boundary | Label | Rule for downstream work |
|---|---|---|
| No proprietary copying | `PROJECT-CONSTRAINT` | Do not copy Lingopie source code, private API payloads, media, subtitles, assets, catalog data, branding, or private account data. |
| No DRM/circumvention | `PROJECT-CONSTRAINT` | Do not download, decrypt, bypass, capture, or proxy protected streams. Lingotorte targets owned/local files only. |
| Read-only product inspection | `PROJECT-CONSTRAINT` | Logged-in UI inspection, if ever resumed, is visible mechanics only. No saving words, running reviews, submitting recordings, changing settings, dumping storage/tokens, or scraping private vocab. |
| Own/local media only | `PROJECT-CONSTRAINT` | Fixtures and product workflows use Janusz-owned/local videos, explicit subtitle files, or locally generated transcripts. |
| Privacy by default | `PROJECT-CONSTRAINT` | Local storage and local processing are default. Online providers are disabled until explicit opt-in. |
| Evidence labels | `PROJECT-CONSTRAINT` | Claims must state whether they are project constraints, mission requirements, sanitized live UI, public docs, OSS evidence, preliminary research, recommendations, or open decisions. |
| Planning-only current scope | `MISSION-REQUIREMENT` | This bundle is documentation for a future implementation fleet; it does not implement the app. |

## Allowed vs disallowed actions

| Action | Default status | Notes |
|---|---:|---|
| Read public docs/blog/help pages | Allowed | Cite URLs/quotes with retrieval date for decisions. These are planning evidence references, not runtime app network dependencies. |
| Read local workspace docs | Allowed | Preserve relative cross-links and evidence labels. |
| Inspect visible Lingopie UI mechanics | Gated | Requires Janusz approval for scope; use a test account for mutation-prone flows. |
| Use Lingopie screenshots as private evidence references | Gated | Local non-distributable only unless Janusz approves sanitization/copy policy. |
| Copy Lingopie UI copy, branding, images, subtitle/media files, catalog data, or private examples | Disallowed | Reference generic mechanics instead. |
| Access private APIs, cookies, localStorage, tokens, account exports, or hidden payloads | Disallowed | No credential/token/storage dumps. |
| Save words, submit reviews, record pronunciation, or change account settings in Lingopie | Disallowed unless explicitly authorized | Prefer throwaway/test account if ever needed. |
| Download/capture/decrypt/proxy DRM or protected streams | Disallowed | Out of scope. |
| Use local media/subtitle fixtures | Allowed | Fixtures must be owned, synthetic, or explicitly licensed. |
| Import YouTube-provided captions/transcripts | Gated public read | User-initiated caption metadata/text retrieval may be allowed for public/authorized videos, but imported captions start as draft/untrusted tracks and must be corrected/approved before default study use. |
| Download YouTube or other online video media | Gated | Allowed only for owned, explicitly permitted, public-domain, or otherwise licensably safe media; no DRM/circumvention, no credential/cookie scraping, and not the default caption-import path. |
| Use loopback/local dev-server reads | Allowed | Local browser development may read app assets over `127.0.0.1`/`localhost`, `data:`, and `blob:` URLs. |
| Write to public-internet services | Gated | No public-internet writes, provider calls, public sharing, or account mutations without explicit opt-in/approval. |
| Use online translation/LLM/ASR/dictionary providers | Disabled by default; opt-in only | Requires data-class disclosure and no-network tests for disabled state. |
| Export to Anki package | Allowed as local export plan | Warn that AnkiWeb sync can upload text/media if the user imports/syncs. |
| Mutate Anki via AnkiConnect | Gated | Treat as external/local app mutation; require explicit user decision. |
| Publish/share generated decks, clips, screenshots, logs, or reports | Gated | Check private media paths, cue text, notes, voice, and copyright. |

## Data classes and privacy posture

| Data class | Examples | Default storage | External sharing default | Special notes |
|---|---|---|---|---|
| Media file references | `/path/video.mkv`, hash, duration | SQLite + local path reference | Never | Do not copy media into backups unless enabled. |
| Subtitle/cue text | target/native cues, generated transcripts, provider captions, corrected tracks | SQLite/local cache | Never | May contain copyrighted/private text; provider/ASR captions are draft until corrected/approved; redact from logs by default. |
| Token/language analysis | tokens, lemma, POS, morphology | Recomputable local tables | Never unless adapter opted in | Adapter payloads must be versioned. |
| Saved learning objects | saved word/phrase/sentence plus cue/time/media context | Local learner-state tables | Never | Occurrence-first; preserve source context. |
| Review history | FSRS state, ratings, due dates, lapses | Local append-only review events | Never | Sensitive learning profile. |
| Notes/meanings | learner notes, translations, examples | Local | Never | Online translation/LLM use needs explicit consent. |
| Audio/voice recordings | shadowing/pronunciation clips | Local temp or opted-in cache | Never by default | Treat as high sensitivity; delete temp recordings unless saved intentionally. |
| Diagnostics/logs | errors, adapter status, ids | Local logs | Never by default | Avoid raw cue text, media paths, notes, provider payloads unless verbose local debug is enabled. |
| Backups/exports | DB backups, `.apkg`, JSON export | User-chosen local path | Never by default | Include warnings about media/text exposure and sync destinations. |

## Online provider policy

Default: all online providers are off.

Any online adapter must have:

1. explicit provider selection by Janusz/user;
2. per-feature data-class disclosure, especially cue text, surrounding context, media snippets, voice recordings, and learner notes;
3. local/offline fallback or a clear disabled state;
4. no-network tests proving disabled providers make zero network calls;
5. request logging that records provider name/status/error code, not raw payloads by default;
6. credential storage outside project docs and no credential commits;
7. a revocation/deletion path for cached provider outputs.

Provider classes:

| Adapter type | Default | Opt-in warning |
|---|---|---|
| Dictionary lookup | Local/offline dictionary preferred | Online lookup sends selected text and maybe language pair. |
| Phrase translation | Local model or disabled | Online translation sends phrase/cue context. |
| Sentence explanation | Local LLM or disabled | Online LLM sends sentence and possibly surrounding context/notes. |
| ASR/transcription | Local faster-whisper/whisper.cpp-style pipeline | Online ASR sends audio/media snippets. |
| YouTube caption import | Disabled unless user initiates URL import | Public caption reads send the URL/video ID to YouTube or transcript tooling; downloaded media remains separately gated. |
| Pronunciation scoring | Local ASR/alignment or disabled | Online scoring sends learner voice recordings. |
| Backup/sync | Manual local backup | Cloud sync may upload DB, cue text, notes, paths, and exported media. |

## Anki/export boundary

Default role: local export only.

- Lingotorte should own canonical SRS state unless Janusz chooses otherwise.
- `.apkg` exports may contain cue text, translations, media snippets, images, and source references.
- If the user imports an export into Anki and enables AnkiWeb sync, that data may leave the local machine.
- AnkiConnect mutation is not the default; treat it as a separate explicit integration decision.
- Exports should include a privacy warning and an option to exclude media snippets.

## Backup and sync boundary

Default: local database/config backup without media copies.

Recommended backup modes:

1. Metadata-only backup: DB, settings, review state, saved items, adapter versions.
2. Portable study backup: metadata plus generated clips/thumbnails/transcripts where rights/privacy allow.
3. Full media copy: disabled unless Janusz explicitly opts in; may duplicate copyrighted/private media.
4. Future sync: encrypted/user-controlled only after conflict and privacy model are designed.

## Live inspection gate

Future Lingopie inspection is not part of implementation. If Janusz requests more reference inspection:

- use public docs first;
- prefer a throwaway/test account for mutation-prone flows;
- document exact scope before starting;
- avoid private API/storage/token inspection;
- do not save/review/record/change settings unless that mutation is explicitly approved;
- capture sanitized notes, not raw private examples;
- treat screenshots as local non-distributable evidence unless separately approved.

## Design-copy boundary

Lingotorte should implement generic learning mechanics, not Lingopie branding.

Allowed: dual captions, transcript sync, cue loop, speed controls, word/phrase lookup, saved occurrences, SRS review, grammar/POS visualization, sentence reconstruction, progress widgets.

Avoid: Lingopie names/logos/assets, proprietary marketing copy, exact colors/layout pixel reproduction, catalog artwork, course/show metadata, private vocabulary examples, or product-specific route naming in implementation.

Provisional naming rule: implementation tasks may use generic internal names such as `FlashcardReview`, `MeaningQuiz`, `ContextMatch`, and `SentenceBuilder`; references to Lingopie feature names should remain in docs as evidence labels only.

## Required implementation safety tests

Every implementation feature that touches privacy-sensitive boundaries should include tests or checks for:

| Gate | Required check |
|---|---|
| No-network default | With providers disabled, run feature tests under mocked/blocked network and verify no HTTP requests. |
| No Lingopie runtime dependency | Runtime code must not contact or encode Lingopie URLs except in documentation/reference tooling. |
| Local fixture use | Tests use synthetic/owned fixture media/subtitles, not Lingopie media/subtitles/screenshots. |
| Transcript approval | Provider captions and ASR outputs must be marked draft/untrusted until corrected or explicitly approved for study use. |
| Logging redaction | Logs include ids/status/error codes, not raw cue text/media paths/voice snippets by default. |
| Export warnings | Any export containing text/media/review history includes local/privacy warning. |
| Account mutation | No test or app code mutates Lingopie or any external account. |
| Provider consent | Online adapter cannot run without explicit stored opt-in and visible data-class disclosure. |

## Open human decisions

| Decision | Safe default for implementation tasks | Why it remains open |
|---|---|---|
| Online provider strictness | Disabled by default; local adapters only. | Janusz may later approve selected online providers. |
| Anki role | Export-only; no AnkiConnect mutation. | Sync/mutation changes privacy and source-of-truth semantics. |
| Screenshot evidence handling | Use sanitized text only. | Moving/sharing screenshots needs privacy/IP review. |
| Design-copy tolerance | Generic naming/reskinning. | Janusz may choose how closely product labels may reference Lingopie-like names. |
| Backup media policy | Metadata-only backups. | Full media backup can duplicate copyrighted/private media. |
