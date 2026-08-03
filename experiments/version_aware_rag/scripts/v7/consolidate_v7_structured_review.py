#!/usr/bin/env python3
"""Consolidate one 40-record review with the frozen four-query delta."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEWS = ROOT / "data" / "v7_pilot" / "reviews"
DELTA_IDS = {"v7q-co-008", "v7q-co-009", "v7q-co-010", "v7q-hn-003"}


def rows(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--delta", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    base = {x["query_id"]: x for x in rows(REVIEWS / args.base)}
    delta = {x["query_id"]: x for x in rows(REVIEWS / args.delta)}
    if len(base) != 40 or set(delta) != DELTA_IDS or not all(x["eligible"] for x in delta.values()):
        raise RuntimeError("Base/delta validation failed")
    base.update(delta)
    ordered = [base[qid] for qid in sorted(base)]
    if len(ordered) != 40 or not all(x["eligible"] for x in ordered):
        raise RuntimeError("Consolidation did not yield 40 eligible records")
    target = REVIEWS / args.output
    target.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in ordered), encoding="utf-8", newline="\n")
    print(json.dumps({"output": args.output, "record_count": 40, "eligible_count": 40,
                      "delta_query_ids": sorted(DELTA_IDS)}, indent=2))


if __name__ == "__main__":
    main()
