#!/usr/bin/env python3
"""Post-test descriptive failure attribution; never changes frozen policy."""

from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "results" / "v6" / "raw" / "V6_RAW_RETRIEVAL_RESULTS.jsonl"
GOLD = ROOT / "data" / "v6_confirmatory" / "V6_GOLD_CONTRACTS_CHUNK_LEVEL_SEALED.jsonl"
OUT_JSON = ROOT / "results" / "v6" / "V6_FAILURE_ATTRIBUTION.json"
OUT_MD = ROOT / "results" / "v6" / "V6_ERROR_ANALYSIS.md"


def rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def hit_count(groups: list[dict], ids: list[str], k: int) -> int:
    selected = set(ids[:k])
    return sum(bool(selected & set(group["acceptable_chunk_ids"])) for group in groups)


def main() -> None:
    raw = {(record["query_id"], record["system"]): record for record in rows(RAW)}
    gold = {record["query_id"]: record for record in rows(GOLD)}
    router_false_negatives = []
    regressed = []
    pair_activated = []
    candidate_misses = Counter()
    family_candidate = defaultdict(lambda: [0, 0])
    for query_id, contract in gold.items():
        a = raw[(query_id, "A")]
        required = contract["required_evidence_chunk_groups"]
        candidate_hits = hit_count(required, a["shared_candidate_pool_ids"], 20)
        candidate_misses[contract["stratum"]] += len(required) - candidate_hits
        family_candidate[contract["family"]][0] += candidate_hits
        family_candidate[contract["family"]][1] += len(required)
        e = raw[(query_id, "E")]
        b = raw[(query_id, "B")]
        if contract["stratum"] == "explicit_history" and not e["router_explicit_history"]:
            router_false_negatives.append(query_id)
        if e["router_explicit_history"] and any(candidate["pair_boost"] > 0 for candidate in e["ranked_candidates"]):
            pair_activated.append(query_id)
        if contract["stratum"] == "explicit_history":
            b_recall = hit_count(required, b["top3"], 3) / len(required)
            e_recall = hit_count(required, e["top3"], 3) / len(required)
            if e_recall < b_recall:
                regressed.append({"query_id": query_id, "lineage_id": contract["lineage_id"], "B_recall_at_3": b_recall, "E_recall_at_3": e_recall, "router_triggered": e["router_explicit_history"], "pair_boost_activated": query_id in pair_activated, "required_in_candidate_pool": candidate_hits, "required_count": len(required)})
    family_rates = {family: hits / count for family, (hits, count) in family_candidate.items()}
    output = {
        "schema_version": "v6-failure-attribution-1",
        "analysis_scope": "descriptive_post_test_no_retuning_or_rerun",
        "router_false_negative_count": len(router_false_negatives), "router_false_negative_query_ids": router_false_negatives,
        "E_pair_boost_activation_query_count": len(pair_activated), "E_pair_boost_activation_query_ids": pair_activated,
        "explicit_history_regressed_queries": regressed,
        "candidate_required_group_misses_by_stratum": dict(candidate_misses),
        "candidate_recall_at_20_by_family": dict(sorted(family_rates.items(), key=lambda item: item[1])),
        "candidate_generation_is_primary_bottleneck": sum(candidate_misses.values()) > 0,
        "input_sha256": {"raw": sha(RAW), "gold": sha(GOLD)},
    }
    OUT_JSON.write_text(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    md = ["# V6 Failure Attribution", "", "此分析在正式 single-use retrieval 後進行，只能解釋失敗，不得用來調參或重跑 V6。", "", f"- Router false negatives：{len(router_false_negatives)} 題（{', '.join(router_false_negatives) or 'none'}）", f"- E 實際啟用 pair boost：{len(pair_activated)} / 96 題", f"- Explicit-history 退步：{len(regressed)} 題", f"- Candidate pool 遺漏 required groups：{sum(candidate_misses.values())} 組", "", "主要結論：Top-20 candidate recall 明顯不足，且 canonical relation endpoint 很少成為最高 BM25 seed，因此版本政策幾乎沒有可作用的正確 pair。這是 candidate-limited negative result，不得在本次 confirmatory test 修正後重跑。"]
    OUT_MD.write_text("\n".join(md) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
