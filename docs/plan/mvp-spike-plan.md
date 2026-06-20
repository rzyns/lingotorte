# MVP Spike Plan

Status: concrete spike plan for the future implementation repo. Planning only; commands are expected shapes to instantiate once the repo skeleton exists.

## Fixture plan

Future implementation should create a fixture directory similar to:

```text
fixtures/
  README.md
  media/
    sample-owned.mp4
  subtitles/
    sample.target.srt
    sample.native.srt
    sample.bad-format.srt
    sample.overlap.srt
  expected/
    cues.sample.json
    tokens.polish.sample.json
    review-schedule.sample.json
```

Fixture rules:

- no Lingopie media, subtitles, screenshots, catalog data, or private vocab;
- prefer synthetic or explicitly owned short media;
- include at least one target/native pair with simple timing;
- include malformed and overlapping subtitles for failure tests;
- record fixture provenance in `fixtures/README.md`.



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

| Milestone | Minimum acceptance gate |
|---|---|
| P0 skeleton | Test runner works; no-network harness exists; fixture provenance documented. |
| P1 ingestion | Media/subtitle fixtures import into typed records; malformed input fails safely. |
| P2 player/transcript | Video, dual captions, transcript highlight, seek, loop, and speed controls work against fixtures. |
| P3 adapters | Token/lemma/POS/dictionary adapters return typed versioned results or graceful unavailable states; online disabled state makes no network calls. |
| P4 saved objects | Saved word/phrase/sentence preserves media/cue/token/time context and handles duplicates. |
| P5 FSRS | Review events update card state deterministically through a verified FSRS library. |
| P6 practice/export | Practice modes grade correctly from local data; Anki/export warns about privacy and does not mutate external apps by default. |
| P7 optional ASR/shadowing | Local-only spike reports quality/latency limits; microphone/audio lifecycle is privacy-safe. |
| P8 backup/sync | Backup/restore roundtrip passes; media-copy/sync remains opt-in. |



## No-network and no-account-mutation pattern

Each provider-capable feature should have a test that:

1. configures all online providers as disabled;
2. runs the feature flow with local fixtures;
3. fails the test on any HTTP request or DNS/network call, using a mock/fake transport appropriate to the stack;
4. verifies no Lingopie URL is present in runtime code paths;
5. verifies no external account mutation API is called.
