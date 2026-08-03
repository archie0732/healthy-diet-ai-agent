#!/usr/bin/env python3
"""Build one plain-text input containing the frozen V6 query-review batch."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "data" / "v6_query_review_v2"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=("gemini", "chatgpt"), required=True)
    args = parser.parse_args()
    provider = args.provider.upper()
    prompt = (REVIEW / "FROZEN_QUERY_REVIEW_PROMPT.md").read_text(encoding="utf-8").strip()
    schema = (REVIEW / "QUERY_REVIEW_OUTPUT_SCHEMA.json").read_text(encoding="utf-8").strip()
    packet = (REVIEW / "BLIND_QUERY_REVIEW_PACKET.jsonl").read_text(encoding="utf-8").strip()
    records = [json.loads(x) for x in packet.splitlines() if x.strip()]
    if len(records) != 96:
        raise RuntimeError(f"Expected 96 records, found {len(records)}")
    output = REVIEW / f"{provider}_QUERY_REVIEW_SINGLE_INPUT.txt"
    header = f"""{provider} V6 QUERY-CONTRACT REVIEW — SINGLE ISOLATED INPUT

Use only this file. Do not inspect any repository, router, retrieval output, system configuration, prior reviewer output, or web source.

There are exactly 96 records. Return exactly 96 JSON objects in input order, one per line, followed by one `MODEL_METADATA:` line containing the exact {provider} model/version and session or run identifier if visible. Do not add Markdown fences or other prose.
"""
    output.write_text(
        header
        + "\n===== FROZEN INSTRUCTIONS =====\n\n"
        + prompt
        + "\n\n===== OUTPUT SCHEMA =====\n\n"
        + schema
        + "\n\n===== 96 REVIEW RECORDS (JSONL) =====\n\n"
        + packet
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    manifest = {
        "schema_version": "v6-query-review-single-input-manifest-1",
        "provider": args.provider,
        "record_count": len(records),
        "single_input_sha256": sha(output),
        "frozen_packet_sha256": sha(REVIEW / "BLIND_QUERY_REVIEW_PACKET.jsonl"),
        "contains_other_reviewer_outputs": False,
    }
    (REVIEW / f"{provider}_QUERY_REVIEW_SINGLE_INPUT_MANIFEST.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
