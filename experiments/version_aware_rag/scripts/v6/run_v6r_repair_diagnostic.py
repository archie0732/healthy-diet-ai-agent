#!/usr/bin/env python3
"""Build overlap-aware labels and run the opened V6 data as V6-R development."""

from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path

from v6r_retrieval_core import BM25Index, RelationEnrichedCandidateGenerator, explicit_history_router, rank_systems

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
SOURCE = DATA / "v6_confirmatory"
OUT_DATA = DATA / "v6_repair_diagnostic"
OUT = ROOT / "results" / "v6_repair_diagnostic"
QUERIES = SOURCE / "V6_QUERIES_SEALED.jsonl"
GOLD = SOURCE / "V6_GOLD_CONTRACTS_CHUNK_LEVEL_SEALED.jsonl"
RELATIONS = SOURCE / "V6_RUNTIME_CHUNK_RELATIONS_SEALED.jsonl"
CHUNKS = DATA / "v6_corpus_frozen" / "chunks.jsonl"
BOOSTS = (0.0, 0.25, 0.5, 0.75, 1.0, 1.5)
POOL_SIZES = (20, 50, 100)


def read_rows(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def write_rows(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in records), encoding="utf-8", newline="\n")


def norm(text: str) -> str:
    return " ".join("".join(c.lower() if c.isalnum() else " " for c in text).split())


def aliases(source_ref: dict, canonical: str, by_id: dict, by_page: dict) -> list[str]:
    """Include only adjacent, same-page chunks repeating the exact anchor."""
    rid = source_ref.get("recommendation_id")
    if not rid:
        return [canonical]
    base, anchor = by_id[canonical], norm(str(rid))
    answer = {canonical}
    for item in by_page[(base["document_id"], base["pdf_page_number"])]:
        if abs(item["passage_index"] - base["passage_index"]) <= 1 and anchor in norm(item["text"]):
            answer.add(item["chunk_id"])
    return sorted(answer)


def expand_gold(gold: list[dict], by_id: dict, by_page: dict) -> tuple[list[dict], dict]:
    expanded, changed_groups, added = [], 0, 0
    labels = ("required_evidence_chunk_groups", "compatible_evidence_chunk_groups",
              "deprecated_evidence_chunk_groups", "forbidden_evidence_chunk_groups",
              "citation_safe_evidence_chunk_groups")
    for original in gold:
        record = copy.deepcopy(original)
        record["schema_version"] = "v6r-overlap-aware-gold-1"
        record["status"] = "post_hoc_diagnostic_not_confirmatory"
        for label in labels:
            for group in record[label]:
                before = list(group["acceptable_chunk_ids"])
                union = set(before)
                for cid in before:
                    union.update(aliases(group["source_ref"], cid, by_id, by_page))
                group["acceptable_chunk_ids"] = sorted(union)
                if len(union) > len(before):
                    changed_groups += 1; added += len(union) - len(before)
        expanded.append(record)
    return expanded, {"changed_groups": changed_groups, "added_alias_memberships": added}


def expand_relations(relations: list[dict], by_id: dict, by_page: dict) -> tuple[list[dict], dict]:
    out, endpoints, added = [], 0, 0
    for original in relations:
        record = copy.deepcopy(original)
        record["schema_version"] = "v6r-runtime-relation-1"
        record["status"] = "post_hoc_diagnostic_not_confirmatory"
        for role in ("older", "current"):
            if not record.get(role) or not record[role].get("chunk_id"):
                continue
            ids = aliases(record[role]["source_ref"], record[role]["chunk_id"], by_id, by_page)
            record[role]["chunk_ids"] = ids
            if len(ids) > 1: endpoints += 1; added += len(ids) - 1
        out.append(record)
    return out, {"expanded_endpoints": endpoints, "added_alias_memberships": added}


def groups(contract: dict, label: str) -> list[set[str]]:
    return [set(x["acceptable_chunk_ids"]) for x in contract[label]]


def hits(group_list: list[set[str]], ids: list[str], k: int) -> int:
    selected = set(ids[:k])
    return sum(bool(g & selected) for g in group_list)


def evaluate_run(queries: list[dict], gold: dict, chunks: list[dict], relations: list[dict], pool_size: int, boost: float,
                 generator_kind: str = "bm25") -> tuple[dict, list[dict]]:
    index = BM25Index(chunks) if generator_kind == "bm25" else RelationEnrichedCandidateGenerator(chunks, relations)
    records, rows = [], []
    for query in queries:
        qid = query["query_id"]
        candidates = index.candidates(query["query_text"], pool_size)
        systems, selected_pair = rank_systems(query["query_text"], candidates, relations, boost)
        contract = gold[qid]
        required = groups(contract, "required_evidence_chunk_groups")
        unsafe_groups = groups(contract, "deprecated_evidence_chunk_groups") + groups(contract, "forbidden_evidence_chunk_groups")
        unsafe = set().union(*unsafe_groups) if unsafe_groups else set()
        candidate_ids = [x["chunk_id"] for x in candidates]
        for system in "ABCDEF":
            ranked = [x["chunk_id"] for x in systems[system]]
            rows.append({"query_id": qid, "stratum": contract["stratum"], "lineage_id": contract["lineage_id"],
                         "system": system, "required_count": len(required),
                         "recall3": hits(required, ranked, 3) / len(required),
                         "candidate_recall": hits(required, candidate_ids, pool_size) / len(required),
                         "unsafe3": int(bool(set(ranked[:3]) & unsafe)), "ranked_ids": ranked,
                         "router": explicit_history_router(query["query_text"]),
                         "pair_activated": bool(selected_pair),
                         "selected_pair_id": selected_pair["candidate_id"] if selected_pair else None,
                         "selected_pair_ids": selected_pair["chunk_ids"] if selected_pair else []})
        records.append({"query_id": qid, "candidate_ids": candidate_ids, "selected_pair": selected_pair,
                        "systems": {s: [x["chunk_id"] for x in systems[s]] for s in "ABCDEF"}})
    explicit = [r for r in rows if r["stratum"] == "explicit_history"]
    by = {(r["query_id"], r["system"]): r for r in rows}
    diffs = [by[(r["query_id"], "E")]["recall3"] - by[(r["query_id"], "B")]["recall3"]
             for r in explicit if r["system"] == "B"]
    safety_qids = {r["query_id"] for r in rows if r["stratum"] in ("current_only", "hard_negative_current")}
    b_unsafe = sum(by[(q, "B")]["unsafe3"] for q in safety_qids) / len(safety_qids)
    e_unsafe = sum(by[(q, "E")]["unsafe3"] for q in safety_qids) / len(safety_qids)
    candidate = [r for r in rows if r["system"] == "A"]
    exact_pair = 0
    for r in explicit:
        if r["system"] != "E" or not r["pair_activated"]: continue
        # Endpoint chunks can be shared by multiple recommendations on a coarse
        # page, so chunk-subset matching overstates lineage correctness.
        exact_pair += int(r["selected_pair_id"] == gold[r["query_id"]]["candidate_id"])
    summary = {"candidate_generator": generator_kind, "pool_size": pool_size, "pair_boost": boost,
               "E_minus_B_explicit_mean_recall_at_3": sum(diffs) / len(diffs),
               "improved_tied_regressed": [sum(x > 0 for x in diffs), sum(x == 0 for x in diffs), sum(x < 0 for x in diffs)],
               "candidate_required_macro_recall": sum(r["candidate_recall"] for r in candidate) / len(candidate),
               "router": {"tp": sum(explicit_history_router(q["query_text"]) and gold[q["query_id"]]["stratum"] == "explicit_history" for q in queries),
                          "fp": sum(explicit_history_router(q["query_text"]) and gold[q["query_id"]]["stratum"] != "explicit_history" for q in queries)},
               "explicit_pair_activation": sum(r["pair_activated"] for r in explicit if r["system"] == "E"),
               "explicit_selected_pair_matches_gold_lineage": exact_pair,
               "B_unsafe_query_hit_rate_at_3": b_unsafe, "E_unsafe_query_hit_rate_at_3": e_unsafe,
               "E_minus_B_unsafe": e_unsafe - b_unsafe,
               "invariants": {"E_equals_B_untriggered": all(by[(q, "E")]["ranked_ids"] == by[(q, "B")]["ranked_ids"] for q in gold if not by[(q, "E")]["router"]),
                              "C_equals_F": all(by[(q, "C")]["ranked_ids"] == by[(q, "F")]["ranked_ids"] for q in gold)}}
    return summary, records


def main() -> None:
    queries, chunks = read_rows(QUERIES), read_rows(CHUNKS)
    original_gold, original_relations = read_rows(GOLD), read_rows(RELATIONS)
    by_id = {x["chunk_id"]: x for x in chunks}
    by_page = {}
    for chunk in chunks:
        by_page.setdefault((chunk["document_id"], chunk["pdf_page_number"]), []).append(chunk)
    expanded_gold, gold_audit = expand_gold(original_gold, by_id, by_page)
    expanded_relations, relation_audit = expand_relations(original_relations, by_id, by_page)
    write_rows(OUT_DATA / "V6R_GOLD_CONTRACTS_OVERLAP_AWARE.jsonl", expanded_gold)
    write_rows(OUT_DATA / "V6R_RUNTIME_RELATIONS.jsonl", expanded_relations)
    gold = {x["query_id"]: x for x in expanded_gold}
    sensitivity, all_records = [], {}
    for pool in POOL_SIZES:
        for boost in BOOSTS:
            summary, records = evaluate_run(queries, gold, chunks, expanded_relations, pool, boost)
            sensitivity.append(summary)
            all_records[f"bm25_k{pool}_b{boost}"] = records
    # The actual complete repair: relation-enriched shared Top-20.  Keep the
    # pre-V6 boost fixed; this is a mechanism check, not another tuning grid.
    enriched, enriched_records = evaluate_run(queries, gold, chunks, expanded_relations, 20, 0.5, "relation_enriched")
    sensitivity.append(enriched)
    all_records["relation_enriched_k20_b0.5"] = enriched_records
    # The repair's reference configuration preserves V6's frozen Top-20 and the
    # pre-V6 selected 0.5 boost.  Larger pools/boosts are diagnostic ceilings,
    # not post-hoc parameter selections.
    selected = enriched
    result = {"schema_version": "v6r-post-hoc-diagnostic-1", "status": "development_only_not_confirmatory",
              "original_v6_artifacts_modified": False,
              "repairs": ["overlap-aware evidence membership", "best complete in-pool relation pair seed", "shared relation-enriched Top-20 candidate generation", "former router pattern", "V5-aligned stopwords", "corpus-global fixed recency normalization"],
              "gold_expansion_audit": gold_audit, "relation_expansion_audit": relation_audit,
              "sensitivity": sensitivity, "reference_repair_configuration": selected,
              "selection_rule": "Use shared relation-enriched Top-20 and preserve the pre-V6 0.5 boost; do not optimize boost on opened V6 outcomes.",
              "warning": "All V6-R outcomes are opened-data diagnostics. The reference setting was transported rather than optimized here, but a fresh V7 test is still required for confirmatory inference."}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "V6R_DIAGNOSTIC_RESULTS.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    key = "relation_enriched_k20_b0.5"
    write_rows(OUT / "V6R_SELECTED_RAW_DIAGNOSTIC.jsonl", all_records[key])
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
