#!/usr/bin/env python3
"""Merge Gemini's 71 retained V1 judgments with the corrected 25-record delta."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "data" / "v6_query_review_v2"
DELTA_DIR = ROOT / "data" / "v6_query_review_delta_25"
BASE_ATTACHMENT = Path(r"C:\Users\kille\.codex\attachments\a097d507-5d91-4c4e-a6c1-807dbdf1dec1\pasted-text.txt")
DELTA_ATTACHMENT = Path(r"C:\Users\kille\.codex\attachments\e8a57b52-1d9c-4d23-a860-7399202a4622\pasted-text.txt")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract(path: Path) -> tuple[list[dict], str]:
    lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
    records = [json.loads(line) for line in lines if line.startswith('{"query_id"')]
    metadata = [line for line in lines if line.startswith("MODEL_METADATA:")]
    if len(metadata) != 1:
        raise RuntimeError(f"Expected one metadata line in {path}")
    return records, metadata[0]


def main() -> None:
    base, base_metadata = extract(BASE_ATTACHMENT)
    delta, delta_metadata = extract(DELTA_ATTACHMENT)
    if len(base) != 96 or len(delta) != 25:
        raise RuntimeError(f"Unexpected counts: base={len(base)}, delta={len(delta)}")
    delta_lookup = {record["query_id"]: record for record in delta}
    if len(delta_lookup) != 25 or not all(record["eligible"] for record in delta):
        raise RuntimeError("Delta is incomplete, duplicated, or not unanimously eligible")
    merged = [delta_lookup.get(record["query_id"], record) for record in base]
    if len({record["query_id"] for record in merged}) != 96:
        raise RuntimeError("Merged query IDs are not unique")
    if not all(record["eligible"] for record in merged):
        raise RuntimeError("Merged Gemini review still contains ineligible records")
    REVIEW.mkdir(parents=True, exist_ok=True)
    delta_raw = DELTA_DIR / "GEMINI_DELTA_RAW_RESPONSE.txt"
    delta_raw.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in delta) + delta_metadata + "\n", encoding="utf-8", newline="\n")
    merged_path = REVIEW / "GEMINI_QUERY_REVIEW_MERGED.jsonl"
    merged_path.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in merged), encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-gemini-query-review-merged-manifest-1",
        "base_record_count": 96,
        "delta_record_count": 25,
        "retained_base_record_count": 71,
        "merged_record_count": 96,
        "eligible_count": 96,
        "base_model_metadata": base_metadata.removeprefix("MODEL_METADATA:").strip(),
        "delta_model_metadata": delta_metadata.removeprefix("MODEL_METADATA:").strip(),
        "base_attachment_sha256": sha(BASE_ATTACHMENT),
        "delta_attachment_sha256": sha(DELTA_ATTACHMENT),
        "delta_raw_response_sha256": sha(delta_raw),
        "merged_review_sha256": sha(merged_path),
        "correction": "Replaced only the 25 V1 failures after page-level required-evidence deduplication.",
    }
    (REVIEW / "GEMINI_QUERY_REVIEW_MERGED_MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
