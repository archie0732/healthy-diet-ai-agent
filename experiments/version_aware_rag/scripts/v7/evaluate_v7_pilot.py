#!/usr/bin/env python3
"""Evaluate sealed V7 raw results after the one-time blind run."""

from __future__ import annotations

import hashlib
import json
import math
import random
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "v7_pilot"
CONFIG = ROOT / "configs" / "v7_pilot"
RAW_DIR = ROOT / "results" / "v7_pilot" / "raw"
OUT = ROOT / "results" / "v7_pilot"
RAW = RAW_DIR / "V7_RAW_RETRIEVAL_RESULTS.jsonl"
RUN = RAW_DIR / "V7_RAW_RETRIEVAL_RUN_MANIFEST.json"
GOLD = DATA / "V7_GOLD_CONTRACTS_SEALED.jsonl"
SEAL = CONFIG / "FINAL_SEAL_MANIFEST.json"
GUARD = CONFIG / "FRESH_TEST_GUARD.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def groups(contract: dict, label: str) -> list[set[str]]:
    return [set(x["acceptable_chunk_ids"]) for x in contract[label]]


def hits(gs: list[set[str]], ids: list[str], k: int) -> int:
    selected = set(ids[:k])
    return sum(bool(g & selected) for g in gs)


def sign_flip(values: list[Fraction]) -> float:
    scale = math.lcm(*(x.denominator for x in values)) if values else 1
    ints = [abs(x.numerator * (scale // x.denominator)) for x in values]
    observed = abs(sum(x.numerator * (scale // x.denominator) for x in values))
    dist = Counter({0: 1})
    for delta in ints:
        nxt = Counter()
        for total, count in dist.items():
            nxt[total + delta] += count; nxt[total - delta] += count
        dist = nxt
    return sum(count for total, count in dist.items() if abs(total) >= observed) / (2 ** len(ints))


def bootstrap(records: list[dict], reps: int = 10000, seed: int = 20260802) -> list[float]:
    clusters = defaultdict(list)
    for record in records: clusters[record["lineage_id"]].append(record["difference"])
    keys, rng, values = sorted(clusters), random.Random(seed), []
    for _ in range(reps):
        sampled = [rng.choice(keys) for _ in keys]
        observations = [x for key in sampled for x in clusters[key]]
        values.append(sum(observations) / len(observations))
    values.sort()
    return [values[int(.025 * reps)], values[int(.975 * reps) - 1]]


def main() -> None:
    guard, run, seal = [json.loads(p.read_text(encoding="utf-8")) for p in (GUARD, RUN, SEAL)]
    if guard.get("fresh_test_execution_count") != 1 or guard.get("raw_output_sha256") != sha(RAW):
        raise RuntimeError("Raw output guard mismatch")
    if run.get("judgment_file_read_count") != 0 or run.get("raw_output_sha256") != sha(RAW):
        raise RuntimeError("Run manifest mismatch")
    if seal["artifact_sha256"]["sealed_gold"] != sha(GOLD):
        raise RuntimeError("Sealed gold mismatch")
    raw, gold = rows(RAW), {x["query_id"]: x for x in rows(GOLD)}
    if len(raw) != 240 or len(gold) != 40:
        raise RuntimeError("Unexpected record count")
    pool_hashes = defaultdict(set)
    for x in raw: pool_hashes[x["query_id"]].add(x["shared_candidate_pool_sha256"])
    if any(len(v) != 1 for v in pool_hashes.values()):
        raise RuntimeError("Candidate pool differs across systems")
    evaluated = []
    for record in raw:
        contract = gold[record["query_id"]]
        required = groups(contract, "required_evidence_chunk_groups")
        unsafe_groups = groups(contract, "deprecated_evidence_chunk_groups") + groups(contract, "forbidden_evidence_chunk_groups")
        unsafe = set().union(*unsafe_groups) if unsafe_groups else set()
        ranked = [x["chunk_id"] for x in record["ranked_candidates"]]
        candidate = record["shared_candidate_pool_ids"]
        h3 = hits(required, ranked, 3)
        evaluated.append({"query_id": record["query_id"], "system": record["system"],
                          "stratum": contract["stratum"], "lineage_id": contract["lineage_id"],
                          "required_count": len(required), "required_hits_at_3": h3,
                          "recall_at_3": h3 / len(required),
                          "candidate_hits_at_20": hits(required, candidate, 20),
                          "unsafe_at_3": int(bool(set(ranked[:3]) & unsafe)),
                          "router": record["router_explicit_history"], "ranked_ids": ranked,
                          "pair_activated": bool(record["selected_pair"]),
                          "selected_pair_id": record["selected_pair"]["candidate_id"] if record["selected_pair"] else None})
    by = {(x["query_id"], x["system"]): x for x in evaluated}
    def summary(system: str, stratum: str | None = None) -> dict:
        rs = [x for x in evaluated if x["system"] == system and (stratum is None or x["stratum"] == stratum)]
        total = sum(x["required_count"] for x in rs)
        return {"query_count": len(rs), "macro_recall_at_3": sum(x["recall_at_3"] for x in rs) / len(rs),
                "micro_recall_at_3": sum(x["required_hits_at_3"] for x in rs) / total,
                "candidate_micro_recall_at_20": sum(x["candidate_hits_at_20"] for x in rs) / total,
                "unsafe_query_hit_rate_at_3": sum(x["unsafe_at_3"] for x in rs) / len(rs)}
    summaries = {s: {"overall": summary(s), "strata": {t: summary(s, t) for t in ("explicit_history", "current_only", "hard_negative_current")}} for s in "ABCDEF"}
    paired, fractions = [], []
    for qid, contract in gold.items():
        if contract["stratum"] != "explicit_history": continue
        b, e = by[(qid, "B")], by[(qid, "E")]
        diff = e["recall_at_3"] - b["recall_at_3"]
        paired.append({"query_id": qid, "lineage_id": contract["lineage_id"], "difference": diff})
        fractions.append(Fraction(e["required_hits_at_3"], e["required_count"]) - Fraction(b["required_hits_at_3"], b["required_count"]))
    mean = sum(x["difference"] for x in paired) / len(paired)
    safety_qids = [qid for qid, c in gold.items() if c["stratum"] in ("current_only", "hard_negative_current")]
    b_unsafe = sum(by[(q, "B")]["unsafe_at_3"] for q in safety_qids) / len(safety_qids)
    e_unsafe = sum(by[(q, "E")]["unsafe_at_3"] for q in safety_qids) / len(safety_qids)
    explicit_qids = [qid for qid, c in gold.items() if c["stratum"] == "explicit_history"]
    result = {"schema_version": "v7-pilot-evaluation-1", "status": "fresh_held_out_pilot_evaluated",
              "summaries": summaries,
              "primary_effectiveness": {"comparison": "E_minus_B_explicit_history_macro_recall_at_3",
                  "query_count": len(paired), "mean_paired_difference": mean,
                  "improved_tied_regressed": [sum(x["difference"] > 0 for x in paired), sum(x["difference"] == 0 for x in paired), sum(x["difference"] < 0 for x in paired)],
                  "lineage_clustered_bootstrap_95_ci": bootstrap(paired),
                  "exact_paired_sign_flip_p_value_two_sided": sign_flip(fractions)},
              "safety": {"query_count": len(safety_qids), "B_unsafe_query_hit_rate_at_3": b_unsafe,
                         "E_unsafe_query_hit_rate_at_3": e_unsafe, "E_minus_B_unsafe": e_unsafe - b_unsafe,
                         "noninferiority_margin": .05, "noninferiority_pass": e_unsafe - b_unsafe <= .05},
              "router": {"tp": sum(by[(q, "E")]["router"] for q in explicit_qids),
                         "fn": sum(not by[(q, "E")]["router"] for q in explicit_qids),
                         "fp": sum(by[(q, "E")]["router"] for q in safety_qids)},
              "treatment_delivery": {"explicit_pair_activation": sum(by[(q, "E")]["pair_activated"] for q in explicit_qids),
                                     "explicit_pair_matches_gold_lineage": sum(by[(q, "E")]["selected_pair_id"] == gold[q]["candidate_id"] for q in explicit_qids)},
              "invariants": {"shared_candidate_pool": True,
                             "E_equals_B_untriggered": all(by[(q, "E")]["ranked_ids"] == by[(q, "B")]["ranked_ids"] for q in safety_qids),
                             "C_equals_F": all(by[(q, "C")]["ranked_ids"] == by[(q, "F")]["ranked_ids"] for q in gold)},
              "input_sha256": {"raw": sha(RAW), "gold": sha(GOLD), "seal": sha(SEAL)}}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "V7_PILOT_RESULTS.json").write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md = ["# V7 Pilot Results", "", "Fresh held-out retrieval-stage evaluation; no answer-generation claim.", "",
          f"- E-B explicit-history Recall@3: `{mean:.6f}`",
          f"- 95% lineage bootstrap CI: `{result['primary_effectiveness']['lineage_clustered_bootstrap_95_ci']}`",
          f"- Exact sign-flip p-value: `{result['primary_effectiveness']['exact_paired_sign_flip_p_value_two_sided']:.6f}`",
          f"- Improved / tied / regressed: `{result['primary_effectiveness']['improved_tied_regressed']}`",
          f"- Pair activation / correct lineage: `{result['treatment_delivery']['explicit_pair_activation']}/20` / `{result['treatment_delivery']['explicit_pair_matches_gold_lineage']}/20`",
          f"- Candidate Recall@20: `{summaries['A']['overall']['candidate_micro_recall_at_20']:.6f}`",
          f"- B / E unsafe hit@3: `{b_unsafe:.6f}` / `{e_unsafe:.6f}`",
          f"- Safety noninferiority: `{result['safety']['noninferiority_pass']}`"]
    (OUT / "V7_PILOT_RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
