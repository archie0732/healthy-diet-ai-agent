#!/usr/bin/env python3
"""Execute the frozen V6 A-F retrieval exactly once without reading judgments."""

from __future__ import annotations

import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

from v6_retrieval_core import BM25Index, RetrievalPolicy, build_pair_neighbors, rank_systems


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CONFIG = ROOT / "configs" / "v6"
RESULTS = ROOT / "results" / "v6" / "raw"
POLICY_FILE = CONFIG / "FROZEN_POLICY_PACKAGE.json"
GUARD_FILE = CONFIG / "FRESH_TEST_GUARD.json"
QUERY_FILE = DATA / "v6_confirmatory" / "V6_QUERIES_SEALED.jsonl"
CHUNK_FILE = DATA / "v6_corpus_frozen" / "chunks.jsonl"
RELATION_FILE = DATA / "v6_confirmatory" / "V6_RUNTIME_CHUNK_RELATIONS_SEALED.jsonl"
RAW_FILE = RESULTS / "V6_RAW_RETRIEVAL_RESULTS.jsonl"
RUN_MANIFEST = RESULTS / "V6_RAW_RETRIEVAL_RUN_MANIFEST.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main() -> None:
    policy_package = json.loads(POLICY_FILE.read_text(encoding="utf-8"))
    guard = json.loads(GUARD_FILE.read_text(encoding="utf-8"))
    if guard.get("status") != "frozen_ready_for_single_execution" or guard.get("fresh_test_execution_count") != 0:
        raise RuntimeError("Fresh-test execution guard is locked or already consumed")
    if RAW_FILE.exists() or RUN_MANIFEST.exists():
        raise RuntimeError("Raw output already exists; refusing a second execution")
    if guard.get("frozen_policy_sha256") != sha(POLICY_FILE):
        raise RuntimeError("Frozen policy hash mismatch")
    expected = policy_package["artifact_sha256"]
    actual = {
        "sealed_queries": sha(QUERY_FILE),
        "frozen_chunks": sha(CHUNK_FILE),
        "sealed_runtime_relations": sha(RELATION_FILE),
        "retrieval_core": sha(Path(__file__).with_name("v6_retrieval_core.py")),
        "fresh_runner": sha(Path(__file__)),
    }
    for key, digest in actual.items():
        if expected.get(key) != digest:
            raise RuntimeError(f"Frozen artifact mismatch: {key}")

    queries = rows(QUERY_FILE)
    chunks = rows(CHUNK_FILE)
    relations = rows(RELATION_FILE)
    config = policy_package["retrieval"]
    retrieval_policy = RetrievalPolicy(
        bm25_k1=config["bm25_k1"], bm25_b=config["bm25_b"],
        candidate_pool_size=config["candidate_pool_size"], output_k=config["primary_output_k"],
        recency_lambda=config["recency_lambda"], pair_boost=config["history_pair_boost"],
        minimum_pair_mate_raw_bm25=config["minimum_pair_mate_raw_bm25"],
    )
    index = BM25Index(chunks, retrieval_policy.bm25_k1, retrieval_policy.bm25_b)
    neighbors = build_pair_neighbors(relations)
    output = []
    for query in queries:
        candidates = index.candidates(query["query_text"], retrieval_policy.candidate_pool_size)
        systems = rank_systems(query["query_text"], candidates, neighbors, retrieval_policy)
        candidate_ids = [item["chunk_id"] for item in candidates]
        candidate_hash = hashlib.sha256("\n".join(candidate_ids).encode("utf-8")).hexdigest()
        for system in "ABCDEF":
            ranked = systems[system]
            output.append({
                "schema_version": "v6-raw-retrieval-result-1",
                "query_id": query["query_id"],
                "system": system,
                "router_explicit_history": ranked[0]["router_explicit_history"] if ranked else False,
                "shared_candidate_pool_ids": candidate_ids,
                "shared_candidate_pool_sha256": candidate_hash,
                "ranked_candidates": ranked,
                "top1": [item["chunk_id"] for item in ranked[:1]],
                "top3": [item["chunk_id"] for item in ranked[:3]],
                "top5": [item["chunk_id"] for item in ranked[:5]],
            })
    RESULTS.mkdir(parents=True, exist_ok=True)
    RAW_FILE.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in output), encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-raw-retrieval-run-manifest-1",
        "executed_at_utc": datetime.now(timezone.utc).isoformat(),
        "status": "single_use_retrieval_complete_raw_output_sealed",
        "query_count": len(queries),
        "system_count": 6,
        "record_count": len(output),
        "python_version": sys.version,
        "platform": platform.platform(),
        "external_model_api_used": False,
        "judgment_file_read_count": 0,
        "frozen_policy_sha256": sha(POLICY_FILE),
        "raw_output_sha256": sha(RAW_FILE),
        "fresh_test_execution_count": 1,
    }
    RUN_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    updated_guard = {
        **guard,
        "status": "fresh_test_executed_once_raw_output_locked",
        "fresh_test_execution_count": 1,
        "raw_output_sha256": manifest["raw_output_sha256"],
        "run_manifest_sha256": sha(RUN_MANIFEST),
        "tuning_allowed": False,
    }
    GUARD_FILE.write_text(json.dumps(updated_guard, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
