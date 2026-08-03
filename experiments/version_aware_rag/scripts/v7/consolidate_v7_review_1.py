#!/usr/bin/env python3
"""Replace the failed initial EH-001 judgment with its reviewed revision."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEWS = ROOT / "data" / "v7_pilot" / "reviews"


def rows(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def main() -> None:
    initial = {x["query_id"]: x for x in rows(REVIEWS / "gemini_review_1_initial_RAW_REVIEW.jsonl")}
    delta = rows(REVIEWS / "gemini_review_1_delta.jsonl")
    if len(delta) != 1 or delta[0]["query_id"] != "v7q-eh-001" or not delta[0]["eligible"]:
        raise RuntimeError("Expected one eligible EH-001 delta judgment")
    initial["v7q-eh-001"] = delta[0]
    ordered = [initial[qid] for qid in sorted(initial)]
    if len(ordered) != 40 or not all(x["eligible"] for x in ordered):
        raise RuntimeError("Review 1 consolidation did not yield 40 eligible records")
    target = REVIEWS / "gemini_review_1_CONSOLIDATED.jsonl"
    target.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in ordered), encoding="utf-8", newline="\n")
    print(json.dumps({"review": 1, "reviewer": "Gemini 3.6 Flash (Medium)",
                      "eligible": 40, "revised_records": ["v7q-eh-001"]}, indent=2))


if __name__ == "__main__":
    main()
