# Lingotorte fixture provenance

These fixtures are synthetic and were created for the P0 local-first skeleton. They are not derived from Lingopie, any protected stream, private account data, catalog data, screenshots, media, subtitle files, source code, branding, or examples.

## Files

- `media/synthetic-polish-dialogue.webm` — generated locally with ffmpeg from a black color source and silent audio. It contains no third-party audio/video content.
- `subtitles/synthetic-polish-dialogue.target.srt` — synthetic Polish target-language cues authored for this repo.
- `subtitles/synthetic-polish-dialogue.native.srt` — synthetic English native-language cues authored for this repo.
- `subtitles/malformed.srt` — intentionally invalid synthetic subtitle input for later failure tests.
- `subtitles/overlap.target.srt` — intentionally overlapping synthetic cues for later alignment/import tests.
- `transcripts/synthetic-polish-dialogue.transcript.json` — deterministic transcript metadata derived from the synthetic cues.
- `manifest.json` — local fixture catalog with SHA-256 hashes and provenance labels.

## Boundary

Fixture use is local-only. Tests may load these files from disk, but provider-disabled flows must not fetch media, subtitles, transcript text, or lookup data from a network service.
