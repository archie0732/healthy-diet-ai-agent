#!/usr/bin/env python3
"""Seal V6 query and page-level gold contracts after review coverage passes."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "v6_confirmatory"
QUERIES = DATA / "V6_QUERY_DRAFTS.jsonl"
GOLD = DATA / "V6_GOLD_CONTRACT_DRAFTS.jsonl"
STRUCTURAL_AUDIT = DATA / "V6_QUERY_DRAFT_AUDIT.json"
COVERAGE_AUDIT = DATA / "V6_FINAL_REVIEW_COVERAGE_AUDIT.json"
COVERAGE_LEDGER = DATA / "V6_FINAL_REVIEW_COVERAGE_LEDGER.jsonl"
ALLOCATION_PLAN = DATA / "V6_QUERY_ALLOCATION_PLAN.jsonl"
ALLOCATION_MANIFEST = DATA / "V6_QUERY_ALLOCATION_MANIFEST.json"
FINAL_PACKET = ROOT / "data" / "v6_query_review_v3" / "BLIND_QUERY_REVIEW_PACKET.jsonl"

SEALED_QUERIES = DATA / "V6_QUERIES_SEALED.jsonl"
SEALED_GOLD = DATA / "V6_GOLD_CONTRACTS_PAGE_LEVEL_SEALED.jsonl"
CONSENSUS = DATA / "V6_QUERY_CONSENSUS_LEDGER.jsonl"
MANIFEST = DATA / "V6_QUERY_GOLD_SEAL_MANIFEST.json"


def load_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8", newline="\n")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    structural = json.loads(STRUCTURAL_AUDIT.read_text(encoding="utf-8"))
    coverage = json.loads(COVERAGE_AUDIT.read_text(encoding="utf-8"))
    if structural.get("status") != "structural_pass":
        raise RuntimeError("Structural audit has not passed; refusing to seal")
    if not coverage.get("query_contracts_sealable") or coverage.get("review_gap_query_count") != 0:
        raise RuntimeError("Final-version three-review coverage has not passed; refusing to seal")

    queries = load_jsonl(QUERIES)
    gold = load_jsonl(GOLD)
    ledger = load_jsonl(COVERAGE_LEDGER)
    query_ids = [record["query_id"] for record in queries]
    if query_ids != [record["query_id"] for record in gold] or query_ids != [record["query_id"] for record in ledger]:
        raise RuntimeError("Query, gold, and review-ledger IDs/order differ; refusing to seal")
    if any(record["passing_review_count"] < 3 or record["status"] != "covered" for record in ledger):
        raise RuntimeError("Coverage ledger contains an unreviewed contract; refusing to seal")

    sealed_queries = []
    sealed_gold = []
    consensus = []
    gold_by_id = {record["query_id"]: record for record in gold}
    for query, gold_record, review in zip(queries, gold, ledger):
        q = dict(query)
        q["schema_version"] = "v6-query-sealed-1"
        q["status"] = "sealed_after_three_matching_isolated_reviews"
        sealed_queries.append(q)

        g = dict(gold_record)
        g["schema_version"] = "v6-gold-contract-page-level-sealed-1"
        g["review_status"] = "sealed_page_level_pending_chunk_resolution"
        sealed_gold.append(g)

        consensus.append({
            "schema_version": "v6-query-consensus-ledger-1",
            "query_id": query["query_id"],
            "stratum": gold_by_id[query["query_id"]]["stratum"],
            "final_contract_signature": review["final_contract_signature"],
            "passing_review_count": review["passing_review_count"],
            "passing_review_identities": review["passing_review_identities"],
            "status": "unanimous_final_version_pass",
        })

    write_jsonl(SEALED_QUERIES, sealed_queries)
    write_jsonl(SEALED_GOLD, sealed_gold)
    write_jsonl(CONSENSUS, consensus)
    stratum_counts: dict[str, int] = {}
    for record in gold:
        stratum_counts[record["stratum"]] = stratum_counts.get(record["stratum"], 0) + 1

    manifest = {
        "schema_version": "v6-query-gold-seal-manifest-1",
        "sealed_at_utc": datetime.now(timezone.utc).isoformat(),
        "seal_scope": "query_text_and_page_level_gold_contracts_only",
        "query_count": len(queries),
        "gold_contract_count": len(gold),
        "stratum_counts": dict(sorted(stratum_counts.items())),
        "minimum_matching_isolated_passes_per_query": min(record["passing_review_count"] for record in ledger),
        "input_sha256": {
            "query_drafts": sha(QUERIES),
            "gold_contract_drafts": sha(GOLD),
            "structural_audit": sha(STRUCTURAL_AUDIT),
            "final_review_coverage_audit": sha(COVERAGE_AUDIT),
            "final_review_coverage_ledger": sha(COVERAGE_LEDGER),
            "allocation_plan": sha(ALLOCATION_PLAN),
            "allocation_manifest": sha(ALLOCATION_MANIFEST),
            "final_review_packet": sha(FINAL_PACKET),
        },
        "output_sha256": {
            "sealed_queries": sha(SEALED_QUERIES),
            "sealed_page_level_gold_contracts": sha(SEALED_GOLD),
            "query_consensus_ledger": sha(CONSENSUS),
        },
        "next_required_gate": "corpus_and_chunk_freeze_then_page_to_chunk_gold_resolution",
        "fresh_retrieval_allowed": False,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
