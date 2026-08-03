#!/usr/bin/env python3
"""Seal final V7 queries/gold after three complete isolated reviews."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "v7_pilot"
CONFIG = ROOT / "configs" / "v7_pilot"
REVIEWS = DATA / "reviews"
QUERY_DRAFT = DATA / "V7_QUERIES_DRAFT.jsonl"
GOLD_DRAFT = DATA / "V7_GOLD_CONTRACTS_DRAFT.jsonl"
QUERY_SEALED = DATA / "V7_QUERIES_SEALED.jsonl"
GOLD_SEALED = DATA / "V7_GOLD_CONTRACTS_SEALED.jsonl"
MANIFEST = CONFIG / "FINAL_SEAL_MANIFEST.json"
GUARD = CONFIG / "FRESH_TEST_GUARD.json"
REVIEW_FILES = [
    REVIEWS / "gemini_structured_review_1_CONSOLIDATED_FINAL.jsonl",
    REVIEWS / "gpt_structured_review_2_CONSOLIDATED_FINAL.jsonl",
    REVIEWS / "gpt_structured_review_3_CONSOLIDATED_FINAL.jsonl",
]
CHUNKS = ROOT / "data" / "v6_corpus_frozen" / "chunks.jsonl"
RELATIONS = ROOT / "data" / "v6_repair_diagnostic" / "V6R_RUNTIME_RELATIONS.jsonl"
CORE = ROOT / "scripts" / "v6" / "v6r_retrieval_core.py"
RUNNER = ROOT / "scripts" / "v7" / "run_v7_fresh_retrieval.py"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def write_rows(path: Path, records: list[dict]) -> None:
    path.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in records), encoding="utf-8", newline="\n")


def main() -> None:
    if QUERY_SEALED.exists() or GOLD_SEALED.exists() or MANIFEST.exists():
        raise RuntimeError("Final seal already exists; refusing overwrite")
    queries, gold = rows(QUERY_DRAFT), rows(GOLD_DRAFT)
    expected = {x["query_id"] for x in queries}
    if len(queries) != 40 or len(gold) != 40 or {x["query_id"] for x in gold} != expected:
        raise RuntimeError("Draft query/gold coverage invalid")
    for review_file in REVIEW_FILES:
        review = rows(review_file)
        if len(review) != 40 or {x["query_id"] for x in review} != expected or not all(x["eligible"] for x in review):
            raise RuntimeError(f"Review coverage invalid: {review_file.name}")
    sealed_queries = [{**x, "schema_version": "v7-pilot-query-sealed-1",
                       "status": "sealed_after_three_complete_isolated_reviews"} for x in queries]
    sealed_gold = [{**x, "schema_version": "v7-pilot-gold-contract-sealed-1",
                    "review_status": "sealed_after_three_complete_isolated_reviews"} for x in gold]
    write_rows(QUERY_SEALED, sealed_queries)
    write_rows(GOLD_SEALED, sealed_gold)
    manifest = {
        "schema_version": "v7-pilot-final-seal-1", "status": "sealed_ready_for_single_execution",
        "query_count": 40, "review_count": 3, "all_reviews_complete": True,
        "retrieval": {"candidate_generator": "shared_relation_enriched", "candidate_pool_size": 20,
                      "reserved_relation_pairs": 2, "output_k": 3, "pair_boost": 0.5,
                      "recency_lambda": 0.75, "recency_year_range": [2005, 2026]},
        "artifact_sha256": {"sealed_queries": sha(QUERY_SEALED), "sealed_gold": sha(GOLD_SEALED),
                            "frozen_chunks": sha(CHUNKS), "runtime_relations": sha(RELATIONS),
                            "retrieval_core": sha(CORE), "fresh_runner": sha(RUNNER),
                            "review_1": sha(REVIEW_FILES[0]), "review_2": sha(REVIEW_FILES[1]),
                            "review_3": sha(REVIEW_FILES[2])}}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    guard = {"schema_version": "v7-pilot-fresh-test-guard-2", "status": "sealed_ready_for_single_execution",
             "fresh_test_execution_count": 0, "retrieval_allowed": True,
             "gold_read_by_runner_allowed": False, "final_seal_manifest_sha256": sha(MANIFEST)}
    GUARD.write_text(json.dumps(guard, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
