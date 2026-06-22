#!/usr/bin/env python3
"""Local faster-whisper transcription entrypoint for Lingotorte.

This script intentionally imports faster_whisper only after argparse has handled
--help, so dependency-free CLI shape tests can run in fresh development installs.
"""

from __future__ import annotations

import argparse
import json
import sys
from importlib.metadata import PackageNotFoundError, version
from typing import Any


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Transcribe a local audio file with faster-whisper and emit Lingotorte JSON.",
    )
    parser.add_argument("--audio", required=True, help="Absolute path to mono 16 kHz WAV/audio input.")
    parser.add_argument("--language", required=True, help="BCP-47/Whisper language code such as pl or es.")
    parser.add_argument("--model", required=True, help="faster-whisper model name or local model path.")
    parser.add_argument("--device", default="cpu", help="faster-whisper device, e.g. cpu or cuda.")
    parser.add_argument("--compute-type", default="int8", help="faster-whisper compute type, e.g. int8 or float16.")
    parser.add_argument("--beam-size", type=int, default=5, help="Beam size for transcription.")
    parser.add_argument("--vad-filter", action="store_true", help="Enable faster-whisper VAD filtering.")
    parser.add_argument("--word-timestamps", action="store_true", help="Request word-level timestamps.")
    return parser


def package_version(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def segment_to_json(segment: Any) -> dict[str, Any]:
    item: dict[str, Any] = {
        "start": float(segment.start),
        "end": float(segment.end),
        "text": str(segment.text).strip(),
    }
    avg_logprob = getattr(segment, "avg_logprob", None)
    if avg_logprob is not None:
        item["avg_logprob"] = float(avg_logprob)
    words = getattr(segment, "words", None)
    if words:
        item["words"] = [
            {
                "word": str(word.word).strip(),
                "start": float(word.start),
                "end": float(word.end),
                "probability": float(word.probability),
            }
            for word in words
        ]
    return item


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # pragma: no cover - exercised only when dependency is absent in live use.
        print(
            "faster-whisper is not installed; run with a Python environment that provides the faster_whisper package.",
            file=sys.stderr,
        )
        print(str(exc), file=sys.stderr)
        return 2

    try:
        model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
        segments_iter, info = model.transcribe(
            args.audio,
            language=args.language,
            beam_size=args.beam_size,
            vad_filter=args.vad_filter,
            word_timestamps=args.word_timestamps,
        )
        payload = {
            "engine": "faster-whisper",
            "model_name": args.model,
            "model_version": package_version("faster-whisper"),
            "language": getattr(info, "language", args.language) or args.language,
            "segments": [segment_to_json(segment) for segment in segments_iter],
        }
    except Exception as exc:
        print(f"faster-whisper transcription failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
