# B4 local ASR quality benchmark — owned Polish media (2026-07-21)

Status: living receipt. First real owned-media quality benchmark for the B4 local ASR path, closing the "live quality benchmark deferred" item that had been open since 2026-07-04. Authorized by Janusz on 2026-07-21 (Cowork chat) with an exact owned local media path, satisfying the `DECISIONS.md` §5 gate.

## Inputs

- **Media (owned, local):** `~/Videos/lingotorte/qWogfTE27B8/NAJWIĘKSZE Błędy Paleontologów w Historii [qWogfTE27B8].webm`
  - Container/codecs: WebM, AV1 video + Opus audio; full duration `1692.221 s` (~28 min 12 s). Polish-language narration (paleontology).
  - The media path is owned local content; it is not committed and is redacted to a folder reference in any shared artifact.
- **Benchmark slice:** 300 s window `[60 s, 360 s)` extracted to mono 16 kHz PCM WAV via ffmpeg (`-ss 60 -t 300 -vn -ac 1 -ar 16000 -c:a pcm_s16le`). Extraction wall time: ~2.0 s. A mid-file window avoids the intro and gives continuous narrated speech.
- **Machine:** 12th Gen Intel Core i7-12700KF (20 logical CPUs), WSL2 `openclaw`. CPU-only inference (no CUDA in this venv).
- **Harness:** `~/.local/share/lingotorte/asr-venv/bin/python` (Python 3.12.3), faster-whisper 1.2.1, `scripts/faster_whisper_transcribe.py`, models from `~/.cache/huggingface/hub` (`faster-whisper-tiny` 75 MB, `faster-whisper-base` 142 MB). Language forced `pl`, `--word-timestamps`, default beam size 5, compute type int8, device cpu.

## Results

| Dimension | tiny (int8, CPU) | base (int8, CPU) |
|---|---|---|
| Wall clock for 300 s slice (incl. model load) | 22.9 s | 35.4 s |
| Realtime factor (slice ÷ wall) | ~13.1× | ~8.5× |
| Model cache footprint | 75 MB | 142 MB |
| Peak RSS | ~459 MB | ~514 MB |
| Segments / words | 57 / 693 | 36 / 693 |
| Mean segment `avg_logprob` (higher = better) | −0.287 | −0.176 |
| Mean per-word probability | 0.795 | 0.876 |
| Word timings | present, monotonic, plausible | present, monotonic, plausible |

Both models ran comfortably faster than realtime on this CPU, so wall-clock is not a deciding factor for offline draft generation at this hardware tier; both figures include one-time model load, so steady-state throughput on longer media is higher still.

## Transcript quality (qualitative, Polish)

Both models produced fluent, largely correct Polish and are usable as a **draft** for the correction/approval lifecycle. The quality gap is clear and consistent:

- **Proper nouns / domain terms:** base gets them right where tiny mangles them. Examples in this slice — palaeontologist **"Buckland"** (base) vs "Backland"/"baklęd" (tiny); **"Ewa"** vs "ef"; **"chrześcijaństwem"** vs "Krześci Jajnstwe"; **"ogrodzie Eden"** vs "ogrodzie 1"; **"karboński"** vs "karboniski"; **"ptasznik Goliat"** vs "ptaszny góliat".
- **Numerals / units:** base "ponad 12 i 20 metra" vs tiny "12 i 250 metradł"; base "34 cm" both correct.
- **General grammar/inflection:** base makes fewer case/agreement slips and fewer word-boundary splits (tiny e.g. "czterechnokach" vs base "czterych nogach").
- **Confidence corroborates the read:** base's higher mean word probability (0.876 vs 0.795) and higher `avg_logprob` line up with the manual impression.

Neither model is accurate enough to use un-reviewed — both still need the transcript correction/approval pass before learner-state saves — but base's drafts require noticeably fewer corrections.

## Recommendation

- **`base` int8 CPU is the recommended daily-use default** for Polish on this machine: still ~8.5× realtime, ~514 MB RSS, and a materially cleaner draft (proper nouns, numerals, boundaries) that reduces correction effort.
- **`tiny` int8 CPU is a fast smoke/fallback tier** — good for pipeline checks and low-stakes drafts, but its proper-noun/number errors make it worse for serious study.
- Not tested here and left as future options: `small`/`medium`/`large-v3` (cached), VAD filtering, and GPU/CUDA compute. `large-v3` is already in cache if a one-off high-accuracy pass is wanted, at higher latency/RSS. Per `DECISIONS.md` §5, Janusz expects to primarily use cloud models personally, so local ASR remains a convenience/offline tier rather than the primary path.

## Boundaries preserved

Owned local media only; no download, no cloud STT, no model download (both models were already cached). Media/WAV slice/transcripts were kept in scratch (`/tmp/b4-bench`, deleted after) and are not committed. No learner state was written; this was a pure harness/quality measurement. Model cache and venv remain outside git.
