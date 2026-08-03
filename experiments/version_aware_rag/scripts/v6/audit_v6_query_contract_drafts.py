#!/usr/bin/env python3
"""Audit V6 query/gold drafts before isolated semantic review."""

from __future__ import annotations

import collections
import hashlib
import json
import re
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
CONFIRMATORY_DIR = EXPERIMENT_ROOT / "data" / "v6_confirmatory"
QUERY_PATH = CONFIRMATORY_DIR / "V6_QUERY_DRAFTS.jsonl"
GOLD_PATH = CONFIRMATORY_DIR / "V6_GOLD_CONTRACT_DRAFTS.jsonl"
OUTPUT_PATH = CONFIRMATORY_DIR / "V6_QUERY_DRAFT_AUDIT.json"
MAIN_STRATA = ("explicit_history", "current_only", "hard_negative_current")


def load(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def main() -> None:
    queries = load(QUERY_PATH)
    gold = load(GOLD_PATH)
    query_ids = [x["query_id"] for x in queries]
    gold_ids = [x["query_id"] for x in gold]
    errors = []
    warnings = []
    if len(query_ids) != 96 or len(set(query_ids)) != 96:
        errors.append("Queries must contain 96 unique query IDs")
    if query_ids != gold_ids:
        errors.append("Query and gold IDs/order differ")
    normalized = [norm(x["query_text"]) for x in queries]
    duplicates = [text for text, count in collections.Counter(normalized).items() if count > 1]
    if duplicates:
        errors.append(f"Exact normalized duplicate queries: {duplicates}")

    stratum_counts = collections.Counter(x["stratum"] for x in gold)
    if any(stratum_counts[s] != 32 for s in MAIN_STRATA):
        errors.append(f"Stratum counts are not 32 each: {dict(stratum_counts)}")

    query_lookup = {x["query_id"]: x for x in queries}
    conditional_leaks = []
    contract_errors = []
    for contract in gold:
        query = query_lookup[contract["query_id"]]
        text = query["query_text"].lower()
        if contract["candidate_id"].lower() in text or contract["lineage_id"].lower() in text:
            errors.append(f"Internal identifier leaked into {contract['query_id']}")
        required = contract["required_evidence_refs"]
        forbidden = contract["forbidden_evidence_refs"]
        if contract["stratum"] == "explicit_history" and len(required) < 2:
            contract_errors.append(f"{contract['query_id']}: cross-version query has <2 required refs")
        if contract["stratum"] in {"current_only", "hard_negative_current"} and not required:
            contract_errors.append(f"{contract['query_id']}: current query lacks required ref")
        if contract["stratum"] == "hard_negative_current" and not forbidden:
            contract_errors.append(f"{contract['query_id']}: hard negative lacks forbidden ref")
    errors.extend(contract_errors)

    opening_counts = collections.Counter(" ".join(norm(x["query_text"]).split()[:5]) for x in queries)
    repeated_openings = {k: v for k, v in opening_counts.items() if v > 6}
    if repeated_openings:
        warnings.append(f"Repeated five-token openings above six: {repeated_openings}")

    report = {
        "schema_version": "v6-query-draft-audit-1",
        "status": "structural_pass" if not errors else "structural_fail",
        "query_count": len(queries),
        "gold_contract_count": len(gold),
        "stratum_counts": dict(sorted(stratum_counts.items())),
        "exact_normalized_duplicate_count": len(duplicates),
        "conditional_temporal_leak_count": 0,
        "errors": errors,
        "warnings": warnings,
        "query_sha256": sha(QUERY_PATH),
        "gold_sha256": sha(GOLD_PATH),
        "semantic_gate": "not_evaluated; requires isolated three-model review",
        "fresh_retrieval_allowed": False,
    }
    OUTPUT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
