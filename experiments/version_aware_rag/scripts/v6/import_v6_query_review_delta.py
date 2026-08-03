#!/usr/bin/env python3
"""Validate and import an isolated V6 delta query-review response."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIELDS = (
    "answerability",
    "stratum_validity",
    "required_evidence_necessity",
    "unsafe_evidence_labels",
    "non_triviality",
    "leakage_safety",
    "wording_safety",
)
REQUIRED = {"query_id", *FIELDS, "eligible", "notes"}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("response", type=Path)
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--delta-name", default="v6_query_review_delta_26")
    args = parser.parse_args()
    delta = ROOT / "data" / args.delta_name
    packet = delta / "QUERY_REVIEW_ATTACHMENT.txt"

    expected = [json.loads(line)["query_id"] for line in packet.read_text(encoding="utf-8").splitlines() if line.strip()]
    text = args.response.read_text(encoding="utf-8")
    marker = text.find("MODEL_METADATA:")
    metadata = [text[marker:].strip().splitlines()[0]] if marker >= 0 else []
    payload = text[:marker] if marker >= 0 else text
    decoder = json.JSONDecoder()
    records = []
    cursor = 0
    while cursor < len(payload):
        while cursor < len(payload) and payload[cursor].isspace():
            cursor += 1
        if cursor >= len(payload):
            break
        record, cursor = decoder.raw_decode(payload, cursor)
        records.append(record)

    actual = [record.get("query_id") for record in records]
    if actual != expected:
        raise RuntimeError(f"Query IDs/order mismatch: expected {len(expected)}, got {len(actual)}")
    if len(metadata) != 1:
        raise RuntimeError("Exactly one MODEL_METADATA line is required")
    for record in records:
        if set(record) != REQUIRED:
            raise RuntimeError(f"Schema mismatch for {record.get('query_id')}: {sorted(set(record) ^ REQUIRED)}")
        if any(record[field] not in {"pass", "fail", "uncertain"} for field in FIELDS):
            raise RuntimeError(f"Invalid judgment value for {record['query_id']}")
        should_be_eligible = all(record[field] == "pass" for field in FIELDS)
        if record["eligible"] is not should_be_eligible:
            raise RuntimeError(f"Inconsistent eligible flag for {record['query_id']}")

    slug = args.reviewer.lower().replace(" ", "_")
    raw = delta / f"{slug.upper()}_RAW_RESPONSE.txt"
    normalized = delta / f"{slug.upper()}_QUERY_REVIEW.jsonl"
    shutil.copyfile(args.response, raw)
    normalized.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-query-review-delta-import-manifest-1",
        "reviewer_label": args.reviewer,
        "imported_at_utc": datetime.now(timezone.utc).isoformat(),
        "packet_sha256": sha(packet),
        "source_response_sha256": sha(args.response),
        "preserved_raw_sha256": sha(raw),
        "normalized_review_sha256": sha(normalized),
        "record_count": len(records),
        "eligible_count": sum(record["eligible"] for record in records),
        "metadata": metadata[0],
        "query_ids_in_exact_packet_order": True,
        "schema_valid": True,
        "eligible_flags_consistent": True,
        "fresh_retrieval_allowed": False,
    }
    manifest_path = delta / f"{slug.upper()}_IMPORT_MANIFEST.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
