#!/usr/bin/env python3
"""Independent minimal recomputation of frozen V6 headline outcomes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "results" / "v6" / "raw" / "V6_RAW_RETRIEVAL_RESULTS.jsonl"
GOLD = ROOT / "data" / "v6_confirmatory" / "V6_GOLD_CONTRACTS_CHUNK_LEVEL_SEALED.jsonl"
RESULT = ROOT / "results" / "v6" / "V6_RETRIEVAL_RESULTS.json"
OUT = ROOT / "results" / "v6" / "V6_INDEPENDENT_RECOMPUTATION.json"


def rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hits(groups: list[dict], ranked: list[str], k: int) -> int:
    selected = set(ranked[:k])
    return sum(bool(selected & set(group["acceptable_chunk_ids"])) for group in groups)


def main() -> None:
    raw = {(record["query_id"], record["system"]): record for record in rows(RAW)}
    gold = {record["query_id"]: record for record in rows(GOLD)}
    published = json.loads(RESULT.read_text(encoding="utf-8"))
    differences = []
    candidate_hits = candidate_count = 0
    b_unsafe = e_unsafe = 0
    safety_count = 0
    for query_id, contract in gold.items():
        required = contract["required_evidence_chunk_groups"]
        candidate = raw[(query_id, "A")]["shared_candidate_pool_ids"]
        candidate_hits += hits(required, candidate, 20)
        candidate_count += len(required)
        if contract["stratum"] == "explicit_history":
            b = hits(required, raw[(query_id, "B")]["top3"], 3) / len(required)
            e = hits(required, raw[(query_id, "E")]["top3"], 3) / len(required)
            differences.append(e - b)
        if contract["stratum"] in ("current_only", "hard_negative_current"):
            unsafe = set()
            for label in ("deprecated_evidence_chunk_groups", "forbidden_evidence_chunk_groups"):
                for group in contract[label]:
                    unsafe.update(group["acceptable_chunk_ids"])
            b_unsafe += bool(set(raw[(query_id, "B")]["top3"]) & unsafe)
            e_unsafe += bool(set(raw[(query_id, "E")]["top3"]) & unsafe)
            safety_count += 1
    recomputed = {
        "primary_mean_E_minus_B": sum(differences) / len(differences),
        "primary_improved": sum(value > 0 for value in differences),
        "primary_tied": sum(value == 0 for value in differences),
        "primary_regressed": sum(value < 0 for value in differences),
        "candidate_required_micro_recall_at_20": candidate_hits / candidate_count,
        "B_safety_unsafe_query_hit_rate": b_unsafe / safety_count,
        "E_safety_unsafe_query_hit_rate": e_unsafe / safety_count,
    }
    checks = {
        "primary_mean_matches": recomputed["primary_mean_E_minus_B"] == published["primary_effectiveness"]["mean_paired_difference"],
        "counts_match": (recomputed["primary_improved"], recomputed["primary_tied"], recomputed["primary_regressed"]) == (published["primary_effectiveness"]["improved_count"], published["primary_effectiveness"]["tied_count"], published["primary_effectiveness"]["regressed_count"]),
        "candidate_recall_matches": recomputed["candidate_required_micro_recall_at_20"] == published["summaries"]["A"]["overall"]["candidate_required_micro_recall_at_20"],
        "safety_rates_match": recomputed["B_safety_unsafe_query_hit_rate"] == published["co_primary_safety"]["B_unsafe_query_hit_rate_at_3"] and recomputed["E_safety_unsafe_query_hit_rate"] == published["co_primary_safety"]["E_unsafe_query_hit_rate_at_3"],
    }
    output = {"schema_version": "v6-independent-recomputation-1", "status": "pass" if all(checks.values()) else "fail", "checks": checks, "recomputed": recomputed, "input_sha256": {"raw": sha(RAW), "gold": sha(GOLD), "published_result": sha(RESULT)}}
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))
    if output["status"] != "pass":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
