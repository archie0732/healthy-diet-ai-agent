#!/usr/bin/env python3
"""Build one plain-text, input-only file for the V3 delta Gemini review."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
REVIEW_DIR = (
    EXPERIMENT_ROOT
    / "data"
    / "v6_source_mining"
    / "relation_review_v3_delta"
)
PROMPT_PATH = REVIEW_DIR / "FROZEN_REVIEW_PROMPT.md"
SCHEMA_PATH = REVIEW_DIR / "REVIEW_OUTPUT_SCHEMA.json"
PACKET_PATH = REVIEW_DIR / "BLIND_RELATION_REVIEW_PACKET.jsonl"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=("gemini", "chatgpt"), default="gemini")
    args = parser.parse_args()
    provider_upper = args.provider.upper()
    output_path = REVIEW_DIR / f"{provider_upper}_V3_DELTA_SINGLE_INPUT.txt"
    manifest_path = REVIEW_DIR / f"{provider_upper}_V3_DELTA_SINGLE_INPUT_MANIFEST.json"
    prompt = PROMPT_PATH.read_text(encoding="utf-8").strip()
    schema = SCHEMA_PATH.read_text(encoding="utf-8").strip()
    packet_lines = [
        line
        for line in PACKET_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    records = [json.loads(line) for line in packet_lines]
    if len(records) != 6:
        raise RuntimeError(f"Expected 6 records, found {len(records)}")
    if not all(record["candidate_id"].startswith("v6rel-hb-") for record in records):
        raise RuntimeError("A non-haemoglobin candidate is present")

    instructions = """GEMINI V3 DELTA — SINGLE ISOLATED INPUT

Everything needed for this review is contained in this one file. Do not open, list, search, or inspect any other file, directory, repository, prior review, or web page.

Perform the review using the frozen instructions, output schema, and six packet records below. Return exactly six JSON objects, one per line and in packet order. Do not include Markdown fences or commentary. After the six JSON objects, add exactly one line beginning `MODEL_METADATA:` with the exact Gemini model/version and Antigravity run ID.

Before reviewing, verify internally that there are exactly six packet records and every `candidate_id` begins with `v6rel-hb-`. If not, stop and report an input error.
"""
    content = (
        instructions
        + "\n===== FROZEN REVIEW INSTRUCTIONS =====\n\n"
        + prompt
        + "\n\n===== OUTPUT SCHEMA =====\n\n"
        + schema
        + "\n\n===== SIX PACKET RECORDS (JSONL) =====\n\n"
        + "\n".join(packet_lines)
        + "\n"
    )
    if args.provider == "chatgpt":
        content = content.replace("GEMINI V3 DELTA", "CHATGPT V3 DELTA")
        content = content.replace(
            "the exact Gemini model/version and Antigravity run ID",
            "the exact ChatGPT model/version and session identifier if visible",
        )
    output_path.write_text(content, encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-single-input-manifest-1",
        "provider": args.provider,
        "record_count": len(records),
        "candidate_ids": [record["candidate_id"] for record in records],
        "source_packet_sha256": sha256(PACKET_PATH),
        "single_input_sha256": sha256(output_path),
        "contains_prior_reviewer_outputs": False,
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
