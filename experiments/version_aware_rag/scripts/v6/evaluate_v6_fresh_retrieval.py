#!/usr/bin/env python3
"""Evaluate sealed V6 raw retrieval after the single-use run completes."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import random
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "v6_confirmatory"
CONFIG = ROOT / "configs" / "v6"
RAW_DIR = ROOT / "results" / "v6" / "raw"
OUT = ROOT / "results" / "v6"
RAW = RAW_DIR / "V6_RAW_RETRIEVAL_RESULTS.jsonl"
RUN_MANIFEST = RAW_DIR / "V6_RAW_RETRIEVAL_RUN_MANIFEST.json"
GOLD = DATA / "V6_GOLD_CONTRACTS_CHUNK_LEVEL_SEALED.jsonl"
POLICY = CONFIG / "FROZEN_POLICY_PACKAGE.json"
GUARD = CONFIG / "FRESH_TEST_GUARD.json"
JSON_OUT = OUT / "V6_RETRIEVAL_RESULTS.json"
MD_OUT = OUT / "V6_RETRIEVAL_RESULTS.md"
CSV_OUT = OUT / "V6_PER_QUERY_RESULTS.csv"
BOOTSTRAP_REPS = 10000
BOOTSTRAP_SEED = 20260801


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def group_ids(contract: dict, label: str) -> list[set[str]]:
    return [set(group["acceptable_chunk_ids"]) for group in contract[label]]


def group_hits(groups: list[set[str]], ranked: list[str], k: int) -> int:
    selected = set(ranked[:k])
    return sum(bool(group & selected) for group in groups)


def ndcg(groups: list[set[str]], ranked: list[str], k: int) -> float:
    relevance = set().union(*groups) if groups else set()
    dcg = sum((1.0 / math.log2(rank + 1)) for rank, chunk_id in enumerate(ranked[:k], start=1) if chunk_id in relevance)
    ideal = sum(1.0 / math.log2(rank + 1) for rank in range(1, min(len(groups), k) + 1))
    return dcg / ideal if ideal else 0.0


def mrr(groups: list[set[str]], ranked: list[str]) -> float:
    relevance = set().union(*groups) if groups else set()
    for rank, chunk_id in enumerate(ranked, start=1):
        if chunk_id in relevance:
            return 1.0 / rank
    return 0.0


def summarize(records: list[dict]) -> dict:
    required_total = sum(record["required_count"] for record in records)
    unsafe_total_slots = sum(min(3, len(record["ranked_ids"])) for record in records)
    both = [record for record in records if record["required_count"] >= 2]
    return {
        "query_count": len(records),
        "required_micro_recall_at_1": sum(record["required_hits_at_1"] for record in records) / required_total,
        "required_micro_recall_at_3": sum(record["required_hits_at_3"] for record in records) / required_total,
        "required_micro_recall_at_5": sum(record["required_hits_at_5"] for record in records) / required_total,
        "required_macro_query_recall_at_1": sum(record["required_recall_at_1"] for record in records) / len(records),
        "required_macro_query_recall_at_3": sum(record["required_recall_at_3"] for record in records) / len(records),
        "required_macro_query_recall_at_5": sum(record["required_recall_at_5"] for record in records) / len(records),
        "both_evidence_coverage_at_3": sum(record["all_required_hit_at_3"] for record in both) / len(both) if both else None,
        "mean_reciprocal_rank": sum(record["mrr"] for record in records) / len(records),
        "mean_ndcg_at_3": sum(record["ndcg_at_3"] for record in records) / len(records),
        "unsafe_query_hit_rate_at_3": sum(record["unsafe_query_hit_at_3"] for record in records) / len(records),
        "unsafe_slot_hit_rate_at_3": sum(record["unsafe_slot_hits_at_3"] for record in records) / unsafe_total_slots,
        "forbidden_query_hit_rate_at_3": sum(record["forbidden_query_hit_at_3"] for record in records) / len(records),
        "candidate_required_micro_recall_at_5": sum(record["candidate_required_hits_at_5"] for record in records) / required_total,
        "candidate_required_micro_recall_at_10": sum(record["candidate_required_hits_at_10"] for record in records) / required_total,
        "candidate_required_micro_recall_at_20": sum(record["candidate_required_hits_at_20"] for record in records) / required_total,
    }


def permutation_pvalue(differences: list[Fraction]) -> float:
    denominators = [value.denominator for value in differences]
    scale = math.lcm(*denominators) if denominators else 1
    deltas = [abs(value.numerator * (scale // value.denominator)) for value in differences]
    observed = abs(sum(value.numerator * (scale // value.denominator) for value in differences))
    distribution = Counter({0: 1})
    for delta in deltas:
        next_distribution = Counter()
        for total, count in distribution.items():
            next_distribution[total + delta] += count
            next_distribution[total - delta] += count
        distribution = next_distribution
    extreme = sum(count for total, count in distribution.items() if abs(total) >= observed)
    return extreme / (2 ** len(deltas))


def clustered_bootstrap(records: list[dict]) -> tuple[float, float]:
    clusters: dict[str, list[float]] = defaultdict(list)
    for record in records:
        clusters[record["lineage_id"]].append(record["difference"])
    keys = sorted(clusters)
    rng = random.Random(BOOTSTRAP_SEED)
    values = []
    for _ in range(BOOTSTRAP_REPS):
        sampled = [rng.choice(keys) for _ in keys]
        observations = [value for key in sampled for value in clusters[key]]
        values.append(sum(observations) / len(observations))
    values.sort()
    return values[int(0.025 * BOOTSTRAP_REPS)], values[int(0.975 * BOOTSTRAP_REPS) - 1]


def main() -> None:
    guard = json.loads(GUARD.read_text(encoding="utf-8"))
    run_manifest = json.loads(RUN_MANIFEST.read_text(encoding="utf-8"))
    policy = json.loads(POLICY.read_text(encoding="utf-8"))
    if guard.get("fresh_test_execution_count") != 1 or guard.get("raw_output_sha256") != sha(RAW):
        raise RuntimeError("Raw retrieval is not sealed by the execution guard")
    if run_manifest.get("judgment_file_read_count") != 0 or run_manifest.get("raw_output_sha256") != sha(RAW):
        raise RuntimeError("Raw run manifest validation failed")
    if policy["artifact_sha256"]["sealed_chunk_gold"] != sha(GOLD):
        raise RuntimeError("Gold hash differs from frozen policy")

    raw = rows(RAW)
    gold = {record["query_id"]: record for record in rows(GOLD)}
    if len(raw) != len(gold) * 6:
        raise RuntimeError("Expected exactly six system rows per query")
    hashes_by_query = defaultdict(set)
    for record in raw:
        hashes_by_query[record["query_id"]].add(record["shared_candidate_pool_sha256"])
    if any(len(value) != 1 for value in hashes_by_query.values()):
        raise RuntimeError("Systems do not share an identical candidate pool")

    evaluated = []
    for record in raw:
        contract = gold[record["query_id"]]
        required = group_ids(contract, "required_evidence_chunk_groups")
        deprecated = group_ids(contract, "deprecated_evidence_chunk_groups")
        forbidden = group_ids(contract, "forbidden_evidence_chunk_groups")
        unsafe_ids = set().union(*(deprecated + forbidden)) if deprecated or forbidden else set()
        forbidden_ids = set().union(*forbidden) if forbidden else set()
        ranked = [item["chunk_id"] for item in record["ranked_candidates"]]
        candidate = record["shared_candidate_pool_ids"]
        hits = {k: group_hits(required, ranked, k) for k in (1, 3, 5)}
        row = {
            "query_id": record["query_id"], "system": record["system"], "stratum": contract["stratum"],
            "lineage_id": contract["lineage_id"], "family": contract["family"],
            "router_explicit_history": record["router_explicit_history"], "ranked_ids": ranked,
            "required_count": len(required),
            **{f"required_hits_at_{k}": hits[k] for k in (1, 3, 5)},
            **{f"required_recall_at_{k}": hits[k] / len(required) for k in (1, 3, 5)},
            "all_required_hit_at_3": int(hits[3] == len(required)),
            "mrr": mrr(required, ranked), "ndcg_at_3": ndcg(required, ranked, 3),
            "unsafe_query_hit_at_3": int(bool(set(ranked[:3]) & unsafe_ids)),
            "unsafe_slot_hits_at_3": sum(chunk_id in unsafe_ids for chunk_id in ranked[:3]),
            "forbidden_query_hit_at_3": int(bool(set(ranked[:3]) & forbidden_ids)),
            **{f"candidate_required_hits_at_{k}": group_hits(required, candidate, k) for k in (5, 10, 20)},
        }
        evaluated.append(row)

    summaries = {}
    for system in "ABCDEF":
        system_rows = [record for record in evaluated if record["system"] == system]
        summaries[system] = {"overall": summarize(system_rows), "strata": {stratum: summarize([record for record in system_rows if record["stratum"] == stratum]) for stratum in ("explicit_history", "current_only", "hard_negative_current")}}

    by_key = {(record["query_id"], record["system"]): record for record in evaluated}
    explicit_pairs = []
    fractions = []
    for query_id, contract in gold.items():
        if contract["stratum"] != "explicit_history":
            continue
        b = by_key[(query_id, "B")]
        e = by_key[(query_id, "E")]
        difference = e["required_recall_at_3"] - b["required_recall_at_3"]
        explicit_pairs.append({"query_id": query_id, "lineage_id": contract["lineage_id"], "difference": difference})
        fractions.append(Fraction(e["required_hits_at_3"], e["required_count"]) - Fraction(b["required_hits_at_3"], b["required_count"]))
    mean_difference = sum(record["difference"] for record in explicit_pairs) / len(explicit_pairs)
    ci_low, ci_high = clustered_bootstrap(explicit_pairs)
    primary = {
        "comparison": "E_minus_B_on_explicit_history_per_query_required_recall_at_3",
        "query_count": len(explicit_pairs),
        "mean_paired_difference": mean_difference,
        "improved_count": sum(record["difference"] > 0 for record in explicit_pairs),
        "tied_count": sum(record["difference"] == 0 for record in explicit_pairs),
        "regressed_count": sum(record["difference"] < 0 for record in explicit_pairs),
        "lineage_clustered_bootstrap_95_ci": [ci_low, ci_high],
        "bootstrap_repetitions": BOOTSTRAP_REPS,
        "bootstrap_seed": BOOTSTRAP_SEED,
        "exact_paired_sign_flip_p_value_two_sided": permutation_pvalue(fractions),
    }

    safety_rows = [record for record in evaluated if record["stratum"] in ("current_only", "hard_negative_current")]
    b_safety = [record for record in safety_rows if record["system"] == "B"]
    e_safety = [record for record in safety_rows if record["system"] == "E"]
    b_rate = sum(record["unsafe_query_hit_at_3"] for record in b_safety) / len(b_safety)
    e_rate = sum(record["unsafe_query_hit_at_3"] for record in e_safety) / len(e_safety)
    unique_forbidden = [record["query_id"] for record in e_safety if record["forbidden_query_hit_at_3"] and not by_key[(record["query_id"], "B")]["forbidden_query_hit_at_3"]]
    safety = {
        "strata": ["current_only", "hard_negative_current"], "noninferiority_margin_absolute": 0.05,
        "B_unsafe_query_hit_rate_at_3": b_rate, "E_unsafe_query_hit_rate_at_3": e_rate,
        "E_minus_B_unsafe_query_hit_rate": e_rate - b_rate,
        "noninferiority_pass": e_rate - b_rate <= 0.05,
        "unique_forbidden_queries_introduced_by_E": unique_forbidden,
        "zero_unique_forbidden_pass": not unique_forbidden,
    }

    router_by_query = {}
    for record in evaluated:
        router_by_query[record["query_id"]] = record["router_explicit_history"]
    tp = sum(router_by_query[qid] and contract["stratum"] == "explicit_history" for qid, contract in gold.items())
    fp = sum(router_by_query[qid] and contract["stratum"] != "explicit_history" for qid, contract in gold.items())
    fn = sum(not router_by_query[qid] and contract["stratum"] == "explicit_history" for qid, contract in gold.items())
    tn = len(gold) - tp - fp - fn
    router = {"tp": tp, "fp": fp, "fn": fn, "tn": tn, "precision": tp / (tp + fp) if tp + fp else 0, "recall": tp / (tp + fn) if tp + fn else 0, "f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0}

    result = {
        "schema_version": "v6-retrieval-evaluation-1",
        "status": "evaluated_from_sealed_single_use_raw_output",
        "summaries": summaries, "primary_effectiveness": primary, "co_primary_safety": safety,
        "router_metrics": router,
        "candidate_limited": summaries["A"]["overall"]["candidate_required_micro_recall_at_20"] < 0.90,
        "shared_candidate_pool_identity_pass": True,
        "design_invariants": {"E_equals_B_when_router_not_triggered": all(by_key[(qid, "E")]["ranked_ids"] == by_key[(qid, "B")]["ranked_ids"] for qid, triggered in router_by_query.items() if not triggered), "C_equals_F_all_queries": all(by_key[(qid, "C")]["ranked_ids"] == by_key[(qid, "F")]["ranked_ids"] for qid in gold)},
        "input_sha256": {"raw": sha(RAW), "run_manifest": sha(RUN_MANIFEST), "gold": sha(GOLD), "policy": sha(POLICY)},
        "per_query_records_sha256": hashlib.sha256("\n".join(json.dumps(record, sort_keys=True) for record in evaluated).encode("utf-8")).hexdigest(),
    }
    JSON_OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    with CSV_OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[key for key in evaluated[0] if key != "ranked_ids"])
        writer.writeheader()
        writer.writerows({key: value for key, value in record.items() if key != "ranked_ids"} for record in evaluated)
    md = ["# V6 Retrieval Results", "", f"- Primary E−B mean Recall@3 difference: `{mean_difference:.4f}`", f"- 95% lineage-clustered bootstrap CI: `[{ci_low:.4f}, {ci_high:.4f}]`", f"- Exact paired sign-flip p-value: `{primary['exact_paired_sign_flip_p_value_two_sided']:.6f}`", f"- Improved / tied / regressed: `{primary['improved_count']} / {primary['tied_count']} / {primary['regressed_count']}`", f"- Safety E−B unsafe query-hit difference: `{safety['E_minus_B_unsafe_query_hit_rate']:.4f}`", f"- Safety gates passed: `{safety['noninferiority_pass'] and safety['zero_unique_forbidden_pass']}`", f"- Candidate-limited: `{result['candidate_limited']}`", "", "All outcomes are retrieval-stage evidence-selection results; no answer-generation claim is made."]
    MD_OUT.write_text("\n".join(md) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
