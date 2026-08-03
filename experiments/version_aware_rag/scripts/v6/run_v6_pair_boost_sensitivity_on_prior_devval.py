#!/usr/bin/env python3
"""Read-only V6 policy sensitivity using already-opened V5 dev/validation data."""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "configs"
OUT = ROOT / "results" / "v6" / "development"
BOOSTS = (0.0, 0.25, 0.5, 0.75, 1.0, 1.5)
STOP = set("what are the and for daily serving goals consuming recommendation intake limit limitations rule should with this that from about how many of is a in or to current historical historically was were which does do did it its".split())
PATTERNS = (
    re.compile(r"\b2003\b", re.I), re.compile(r"\bhistorical(?:ly)?\b", re.I),
    re.compile(r"\bprevious(?:ly)?\b", re.I), re.compile(r"\bearlier\b", re.I),
    re.compile(r"\bformerly\b", re.I), re.compile(r"\bhow did\b.{0,100}\bchange\b", re.I),
    re.compile(r"\bfrom\b.{0,100}\bto (?:the )?current\b", re.I),
)
SPLITS = {
    "development": DATA / "v5_r2_8_shared_pool_development",
    "validation": DATA / "v5_r2_9_retrieval_validation",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def tokenize(text: str) -> list[str]:
    return [word for word in re.split(r"\W+", text.lower()) if len(word) > 2 and word not in STOP]


def historical(query: str) -> bool:
    return any(pattern.search(query) for pattern in PATTERNS)


def bm25(query: str, corpus: list[dict]) -> list[tuple[dict, float]]:
    documents = [tokenize(item["text"]) for item in corpus]
    lengths = [len(document) for document in documents]
    avg = sum(lengths) / max(1, len(lengths))
    df = Counter(token for document in documents for token in set(document))
    query_terms = tokenize(query)
    output = []
    for item, document, length in zip(corpus, documents, lengths):
        tf = Counter(document)
        score = 0.0
        for term in query_terms:
            frequency = tf[term]
            if not frequency:
                continue
            idf = math.log((len(corpus) - df[term] + 0.5) / (df[term] + 0.5) + 1)
            score += idf * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * length / max(1, avg)))
        output.append((item, score))
    return sorted(output, key=lambda value: (-value[1], value[0]["item_id"]))


def evaluate(folder: Path, boost: float) -> dict:
    inputs = rows(folder / "retrieval_inputs.jsonl")
    judgments = {record["query_id"]: record for record in rows(folder / "judgments.sealed.jsonl")}
    corpus_map = {}
    for record in inputs:
        for item in record["evidence_items"]:
            corpus_map[item["item_id"]] = item
    corpus = list(corpus_map.values())
    evaluated = []
    for record in inputs:
        pool = bm25(record["query"], corpus)[:20]
        values = [score for _, score in pool]
        maximum, minimum = max(values), min(values)
        normalized = []
        for item, score in pool:
            normalized.append({**item, "bm25": score, "base_norm": (score - minimum) / (maximum - minimum) if maximum > minimum else 0.0, "recency_norm": (item["year"] - 2015) / 11})
        seed = normalized[0]
        explicit = historical(record["query"])
        scored = []
        for item in normalized:
            pair = explicit and (item["item_id"] == seed["item_id"] or (item["lineage_group"] == seed["lineage_group"] and item["role"] != seed["role"]))
            recency_score = item["base_norm"] + 0.75 * item["recency_norm"]
            proposed = item["base_norm"] + (boost if pair else 0.0) if explicit else recency_score
            scored.append({**item, "recency_score": recency_score, "proposed_score": proposed})
        baseline = sorted(scored, key=lambda item: (-item["recency_score"], item["item_id"]))[:3]
        proposed = sorted(scored, key=lambda item: (-item["proposed_score"], item["item_id"]))[:3]
        judgment = judgments[record["query_id"]]
        required = set(judgment["required_item_ids"])
        deprecated = set(judgment["deprecated_item_ids"])
        evaluated.append({
            "stratum": judgment["stratum"],
            "required_count": len(required),
            "baseline_hits": sum(item["item_id"] in required for item in baseline),
            "proposed_hits": sum(item["item_id"] in required for item in proposed),
            "baseline_both": int(len(required) == 2 and all(item in {x["item_id"] for x in baseline} for item in required)),
            "proposed_both": int(len(required) == 2 and all(item in {x["item_id"] for x in proposed} for item in required)),
            "baseline_deprecated": int(any(item["item_id"] in deprecated for item in baseline)),
            "proposed_deprecated": int(any(item["item_id"] in deprecated for item in proposed)),
        })
    summary = {}
    for stratum in ("PAIR_PRESERVE", "BLOCK_RETAINED"):
        selected = [record for record in evaluated if record["stratum"] == stratum]
        denominator = sum(record["required_count"] for record in selected)
        summary[stratum] = {
            "query_count": len(selected),
            "baseline_required_micro_recall_at_3": sum(record["baseline_hits"] for record in selected) / denominator,
            "proposed_required_micro_recall_at_3": sum(record["proposed_hits"] for record in selected) / denominator,
            "baseline_both_evidence_coverage": sum(record["baseline_both"] for record in selected) / len(selected),
            "proposed_both_evidence_coverage": sum(record["proposed_both"] for record in selected) / len(selected),
            "baseline_deprecated_hit_rate": sum(record["baseline_deprecated"] for record in selected) / len(selected),
            "proposed_deprecated_hit_rate": sum(record["proposed_deprecated"] for record in selected) / len(selected),
        }
    return summary


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    for boost in BOOSTS:
        split_results = {name: evaluate(folder, boost) for name, folder in SPLITS.items()}
        eligible = all(
            summary["BLOCK_RETAINED"]["proposed_required_micro_recall_at_3"] >= summary["BLOCK_RETAINED"]["baseline_required_micro_recall_at_3"]
            and summary["BLOCK_RETAINED"]["proposed_deprecated_hit_rate"] <= summary["BLOCK_RETAINED"]["baseline_deprecated_hit_rate"]
            for summary in split_results.values()
        )
        effectiveness = sum(
            summary["PAIR_PRESERVE"]["proposed_required_micro_recall_at_3"] + summary["PAIR_PRESERVE"]["proposed_both_evidence_coverage"]
            for summary in split_results.values()
        )
        results.append({"pair_boost": boost, "eligible_under_safety_constraints": eligible, "effectiveness_selection_score": effectiveness, "splits": split_results})
    eligible = [record for record in results if record["eligible_under_safety_constraints"]]
    best_score = max(record["effectiveness_selection_score"] for record in eligible)
    selected = min(record["pair_boost"] for record in eligible if record["effectiveness_selection_score"] == best_score)
    report = {
        "schema_version": "v6-prior-devval-pair-boost-sensitivity-1",
        "development_validation_only": True,
        "v6_confirmatory_queries_or_gold_read": False,
        "candidate_values": list(BOOSTS),
        "selection_rule": "maximize summed PAIR_PRESERVE required micro Recall@3 plus both-evidence coverage across prior development and validation, subject to BLOCK_RETAINED recall noninferiority and no deprecated-hit increase; ties choose smallest boost",
        "results": results,
        "selected_pair_boost": selected,
        "input_sha256": {f"{name}_{file}": sha(folder / file) for name, folder in SPLITS.items() for file in ("retrieval_inputs.jsonl", "judgments.sealed.jsonl", "MANIFEST.json")},
        "fresh_retrieval_allowed": False,
    }
    path = OUT / "V6_PAIR_BOOST_SENSITIVITY.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
