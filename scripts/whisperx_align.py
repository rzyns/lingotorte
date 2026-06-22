#!/usr/bin/env python3
"""Local WhisperX-style forced-alignment entrypoint for Lingotorte.

The whisperx import is intentionally delayed until after argparse handles --help,
allowing dependency-free CLI smoke tests in normal development installs.
"""

from __future__ import annotations

import argparse
import json
import sys
from importlib.metadata import PackageNotFoundError, version
from typing import Any


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Align existing transcript segments to a local audio file with WhisperX and emit Lingotorte JSON.",
    )
    parser.add_argument("--audio", required=True, help="Absolute path to mono 16 kHz WAV/audio input.")
    parser.add_argument("--transcript-json", required=True, help="Path to JSON containing segments with start/end/text fields.")
    parser.add_argument("--language", required=True, help="BCP-47/Whisper language code such as pl or es.")
    parser.add_argument("--device", default="cpu", help="WhisperX alignment device, e.g. cpu or cuda.")
    return parser


def package_version(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def load_segments(path: str) -> list[dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if isinstance(payload, dict):
        raw_segments = payload.get("segments")
    elif isinstance(payload, list):
        raw_segments = payload
    else:
        raw_segments = None
    if not isinstance(raw_segments, list):
        raise TypeError("transcript JSON must be a list of segments or an object with a segments list")
    segments: list[dict[str, Any]] = []
    for index, segment in enumerate(raw_segments):
        if not isinstance(segment, dict):
            raise TypeError(f"segment {index + 1} must be an object")
        text = str(segment.get("text", "")).strip()
        if not text:
            raise TypeError(f"segment {index + 1} text is empty")
        start = segment.get("start", segment.get("startMs"))
        end = segment.get("end", segment.get("endMs"))
        if start is None or end is None:
            raise TypeError(f"segment {index + 1} requires start/end or startMs/endMs")
        start_f = float(start) / 1000 if float(start) > 100 else float(start)
        end_f = float(end) / 1000 if float(end) > 100 else float(end)
        segments.append({"start": start_f, "end": end_f, "text": text})
    return segments


def word_to_json(word: dict[str, Any]) -> dict[str, Any] | None:
    text = str(word.get("word", "")).strip()
    start = word.get("start")
    end = word.get("end")
    if not text or start is None or end is None:
        return None
    item: dict[str, Any] = {
        "word": text,
        "start": float(start),
        "end": float(end),
    }
    score = word.get("score")
    if score is not None:
        item["score"] = float(score)
    speaker = word.get("speaker")
    if speaker is not None:
        item["speaker"] = str(speaker)
    return item


def segment_to_json(segment: dict[str, Any]) -> dict[str, Any]:
    words = [item for word in segment.get("words", []) if (item := word_to_json(word)) is not None]
    item: dict[str, Any] = {
        "start": float(segment["start"]),
        "end": float(segment["end"]),
        "text": str(segment["text"]).strip(),
    }
    if words:
        item["words"] = words
    return item


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        import whisperx
    except Exception as exc:  # pragma: no cover - exercised only when dependency is absent in live use.
        print(
            "whisperx is not installed; run with a Python environment that provides the whisperx package.",
            file=sys.stderr,
        )
        print(str(exc), file=sys.stderr)
        return 2

    try:
        segments = load_segments(args.transcript_json)
        audio = whisperx.load_audio(args.audio)
        align_model, metadata = whisperx.load_align_model(language_code=args.language, device=args.device)
        aligned = whisperx.align(
            segments,
            align_model,
            metadata,
            audio,
            args.device,
            return_char_alignments=False,
        )
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    aligned_segments = aligned.get("segments", []) if isinstance(aligned, dict) else []
    payload = {
        "engine": "whisperx",
        "model_name": f"whisperx-align-{args.language}",
        "model_version": package_version("whisperx"),
        "language": args.language,
        "segments": [segment_to_json(segment) for segment in aligned_segments],
    }
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
