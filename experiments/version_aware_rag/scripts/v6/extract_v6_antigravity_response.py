#!/usr/bin/env python3
"""Preserve an Antigravity transcript and extract its exact review JSONL lines."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
REVIEW_DIR = (
    EXPERIMENT_ROOT / "data" / "v6_source_mining" / "relation_review_v2"
)
PACKET_PATH = REVIEW_DIR / "BLIND_RELATION_REVIEW_PACKET.jsonl"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=("gemini",), required=True)
    parser.add_argument("--transcript", type=Path, required=True)
    parser.add_argument("--output-prefix")
    args = parser.parse_args()

    transcript_path = args.transcript.resolve()
    if not transcript_path.is_file():
        raise FileNotFoundError(transcript_path)
    packet = [
        json.loads(line)
        for line in PACKET_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    transcript_lines = transcript_path.read_text(encoding="utf-8-sig").splitlines()
    extracted: list[tuple[int, str, dict]] = []
    metadata: list[tuple[int, str]] = []
    for line_number, line in enumerate(transcript_lines, start=1):
        stripped = line.strip()
        if stripped.startswith("MODEL_METADATA:"):
            metadata.append((line_number, stripped))
            continue
        if not stripped.startswith("{"):
            continue
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and "candidate_id" in parsed:
            extracted.append((line_number, stripped, parsed))

    expected_ids = [record["candidate_id"] for record in packet]
    actual_ids = [record[2]["candidate_id"] for record in extracted]
    if actual_ids != expected_ids:
        raise ValueError(
            "Extracted candidate IDs do not exactly match frozen packet order"
        )
    if len(metadata) != 1:
        raise ValueError("Expected exactly one MODEL_METADATA line")
    if metadata[0][0] <= extracted[-1][0]:
        raise ValueError("MODEL_METADATA must follow all extracted judgments")

    prefix = args.output_prefix or args.provider.upper()
    if not prefix.replace("_", "").isalnum():
        raise ValueError("output prefix must contain only letters, digits, or underscores")
    preserved_path = REVIEW_DIR / f"{prefix}_ANTIGRAVITY_TRANSCRIPT.txt"
    extracted_path = REVIEW_DIR / f"{prefix}_EXTRACTED_RESPONSE.txt"
    manifest_path = REVIEW_DIR / f"{prefix}_EXTRACTION_MANIFEST.json"
    if preserved_path.exists() or extracted_path.exists() or manifest_path.exists():
        raise FileExistsError("Refusing to overwrite an existing extraction")

    shutil.copyfile(transcript_path, preserved_path)
    extracted_path.write_text(
        "\n".join(line for _, line, _ in extracted)
        + "\n"
        + metadata[0][1]
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    manifest = {
        "schema_version": "v6-antigravity-extraction-manifest-1",
        "provider": args.provider,
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_attachment_path": str(transcript_path),
        "source_attachment_sha256": sha256(transcript_path),
        "preserved_transcript_sha256": sha256(preserved_path),
        "extracted_response_sha256": sha256(extracted_path),
        "packet_sha256": sha256(PACKET_PATH),
        "transcript_line_count": len(transcript_lines),
        "judgment_count": len(extracted),
        "first_judgment_source_line": extracted[0][0],
        "last_judgment_source_line": extracted[-1][0],
        "metadata_source_line": metadata[0][0],
        "candidate_order_valid": True,
        "extraction_rule": (
            "Exact stripped source lines that parse as JSON objects containing "
            "candidate_id, followed by the sole MODEL_METADATA line; values unchanged."
        ),
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
