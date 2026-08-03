#!/usr/bin/env python3
"""Freeze V6 systems, parameters, metrics, statistics, and execution guard."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT.parents[1]
DATA = ROOT / "data"
CONFIG = ROOT / "configs" / "v6"
RESULTS = ROOT / "results" / "v6"
SCRIPTS = ROOT / "scripts" / "v6"
CONFIRM = DATA / "v6_confirmatory"
CORPUS = DATA / "v6_corpus_frozen"
SENSITIVITY = RESULTS / "development" / "V6_PAIR_BOOST_SENSITIVITY.json"
POLICY = CONFIG / "FROZEN_POLICY_PACKAGE.json"
GUARD = CONFIG / "FRESH_TEST_GUARD.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    sensitivity = json.loads(SENSITIVITY.read_text(encoding="utf-8"))
    if sensitivity.get("selected_pair_boost") != 0.5 or not sensitivity.get("development_validation_only") or sensitivity.get("v6_confirmatory_queries_or_gold_read"):
        raise RuntimeError("Prior dev/validation sensitivity is not eligible for freezing")
    config = {
        "schema_version": "v6-frozen-policy-package-1",
        "status": "frozen_before_confirmatory_retrieval",
        "frozen_at_utc": datetime.now(timezone.utc).isoformat(),
        "research_scope": "retrieval_stage_evidence_selection_only",
        "systems": {
            "A": "BM25 base_norm",
            "B": "BM25 base_norm plus recency",
            "C": "if explicit-history disable recency; otherwise B",
            "D": "always-on in-pool seed-lineage pairing on top of B",
            "E": "if explicit-history disable recency and apply in-pool seed-lineage pairing; otherwise B",
            "F": "E without pair boost; definitionally identical to C",
        },
        "retrieval": {
            "tokenization": "lowercase ASCII alphanumeric regex with frozen stopword set",
            "bm25_k1": 1.2, "bm25_b": 0.75,
            "candidate_pool_size": 20, "primary_output_k": 3, "robustness_output_k": [1, 5],
            "recency_lambda": 0.75,
            "recency_normalization": "min-max publication year within the shared top-20 candidate pool",
            "history_pair_boost": 0.5,
            "pair_boost_selection_source": "prior opened V5 development and validation only",
            "candidate_pairing": "in-pool only; no out-of-pool expansion",
            "pair_seed": "highest raw BM25 candidate",
            "minimum_pair_mate_raw_bm25": 0.0,
            "mate_gate": "strictly positive raw BM25 and present in shared candidate pool",
            "tie_break": "ascending chunk_id",
        },
        "router": {
            "id": "explicit_temporal_history_intent_v1_reused_without_v6_tuning",
            "patterns": [r"\b2003\b", r"\bhistorical(?:ly)?\b", r"\bprevious(?:ly)?\b", r"\bearlier\b", r"\bformerly\b", r"\bhow did\b.{0,100}\bchange\b", r"\bfrom\b.{0,100}\bto (?:the )?current\b"],
        },
        "metrics": {
            "primary": "per-query required-evidence-group Recall@3 E minus B in explicit_history",
            "required_group_rule": "one page-level evidence unit remains one denominator group; hit if any acceptable chunk is retrieved",
            "secondary": ["macro and micro Recall@1/3/5", "both-evidence coverage@3", "candidate Recall@5/10/20", "MRR", "nDCG@3", "router precision/recall/F1", "unsafe query-hit and slot-hit rates"],
            "mrr_definition": "reciprocal rank of first chunk belonging to any required evidence group",
            "ndcg_definition": "binary required-chunk relevance with ideal count equal to number of required groups",
        },
        "statistics": {
            "primary_test": "two-sided exact paired sign-flip permutation using dynamic programming",
            "confidence_interval": "lineage-clustered paired bootstrap percentile 95%",
            "bootstrap_repetitions": 10000, "bootstrap_seed": 20260801,
            "positive_claim_rule": "effect > 0, p < 0.05, and CI lower bound > 0",
            "safety_noninferiority_margin_absolute": 0.05,
            "safety_strata": ["current_only", "hard_negative_current"],
            "unique_forbidden_tolerance": 0,
        },
        "artifact_sha256": {
            "sealed_queries": sha(CONFIRM / "V6_QUERIES_SEALED.jsonl"),
            "sealed_chunk_gold": sha(CONFIRM / "V6_GOLD_CONTRACTS_CHUNK_LEVEL_SEALED.jsonl"),
            "frozen_chunks": sha(CORPUS / "chunks.jsonl"),
            "corpus_freeze_manifest": sha(CORPUS / "FREEZE_MANIFEST.json"),
            "sealed_runtime_relations": sha(CONFIRM / "V6_RUNTIME_CHUNK_RELATIONS_SEALED.jsonl"),
            "runtime_relation_manifest": sha(CONFIRM / "V6_RUNTIME_CHUNK_RELATIONS_SEAL_MANIFEST.json"),
            "pair_boost_sensitivity": sha(SENSITIVITY),
            "retrieval_core": sha(SCRIPTS / "v6_retrieval_core.py"),
            "fresh_runner": sha(SCRIPTS / "run_v6_fresh_retrieval.py"),
            "evaluator": sha(SCRIPTS / "evaluate_v6_fresh_retrieval.py"),
            "invariant_tests": sha(ROOT / "tests" / "unit" / "test_v6_retrieval_invariants.py"),
        },
        "fresh_test_execution_count": 0,
        "tuning_after_freeze_allowed": False,
        "external_model_api_allowed": False,
    }
    CONFIG.mkdir(parents=True, exist_ok=True)
    POLICY.write_text(json.dumps(config, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    guard = {
        "schema_version": "v6-fresh-test-guard-1",
        "status": "frozen_ready_for_single_execution",
        "frozen_policy_sha256": sha(POLICY),
        "fresh_test_execution_count": 0,
        "maximum_fresh_test_execution_count": 1,
        "raw_output_exists": False,
        "judgments_may_be_read_by_runner": False,
        "tuning_allowed": False,
        "external_model_api_allowed": False,
        "owner_continuation_authorization": "User instructed Codex to continue and complete the registered plan on 2026-08-01.",
    }
    GUARD.write_text(json.dumps(guard, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"policy_sha256": sha(POLICY), "guard_sha256": sha(GUARD), "selected_pair_boost": 0.5, "fresh_retrieval_allowed": True}, indent=2))


if __name__ == "__main__":
    main()
