#!/usr/bin/env python3
"""Validate and import one external V7 isolated-review transcript."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
QUERY_FILE = ROOT / "data" / "v7_pilot" / "V7_QUERIES_DRAFT.jsonl"
OUT = ROOT / "data" / "v7_pilot" / "reviews"
FIELDS = ("answerability", "stratum_validity", "required_evidence_necessity",
          "unsafe_evidence_labels", "non_triviality", "leakage_safety", "wording_safety")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--reviewer", required=True)
    args = parser.parse_args()
    lines = Path(args.input).read_text(encoding="utf-8").splitlines()
    metadata = next((x for x in lines if x.startswith("MODEL_METADATA:")), None)
    records = [json.loads(x) for x in lines if x.strip().startswith("{")]
    expected = {json.loads(x)["query_id"] for x in QUERY_FILE.read_text(encoding="utf-8").splitlines() if x.strip()}
    ids = [x.get("query_id") for x in records]
    if len(records) != 40 or set(ids) != expected or len(ids) != len(set(ids)):
        raise RuntimeError("Review must contain exactly one record for each of 40 V7 query IDs")
    for record in records:
        if any(record.get(field) not in {"pass", "fail", "uncertain"} for field in FIELDS):
            raise RuntimeError(f"Invalid judgment value: {record.get('query_id')}")
        should_be_eligible = all(record[field] == "pass" for field in FIELDS)
        if record.get("eligible") is not should_be_eligible:
            raise RuntimeError(f"Inconsistent eligible flag: {record['query_id']}")
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f"{args.reviewer}_RAW_REVIEW.jsonl"
    target.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in records), encoding="utf-8", newline="\n")
    summary = {"reviewer": args.reviewer, "model_metadata": metadata, "record_count": len(records),
               "eligible_count": sum(x["eligible"] for x in records),
               "ineligible_query_ids": [x["query_id"] for x in records if not x["eligible"]]}
    (OUT / f"{args.reviewer}_SUMMARY.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
