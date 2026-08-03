#!/usr/bin/env python3
"""Execute the sealed V7 A-F retrieval once, without reading judgments."""

from __future__ import annotations

import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "v6"))
from v6r_retrieval_core import RelationEnrichedCandidateGenerator, rank_systems

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CONFIG = ROOT / "configs" / "v7_pilot"
OUT = ROOT / "results" / "v7_pilot" / "raw"
QUERY_FILE = DATA / "v7_pilot" / "V7_QUERIES_SEALED.jsonl"
CHUNK_FILE = DATA / "v6_corpus_frozen" / "chunks.jsonl"
RELATION_FILE = DATA / "v6_repair_diagnostic" / "V6R_RUNTIME_RELATIONS.jsonl"
SEAL = CONFIG / "FINAL_SEAL_MANIFEST.json"
GUARD = CONFIG / "FRESH_TEST_GUARD.json"
RAW = OUT / "V7_RAW_RETRIEVAL_RESULTS.jsonl"
RUN_MANIFEST = OUT / "V7_RAW_RETRIEVAL_RUN_MANIFEST.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def main() -> None:
    seal = json.loads(SEAL.read_text(encoding="utf-8"))
    guard = json.loads(GUARD.read_text(encoding="utf-8"))
    if guard.get("status") != "sealed_ready_for_single_execution" or guard.get("fresh_test_execution_count") != 0:
        raise RuntimeError("Fresh-test guard not ready")
    if guard.get("final_seal_manifest_sha256") != sha(SEAL):
        raise RuntimeError("Seal manifest hash mismatch")
    if RAW.exists() or RUN_MANIFEST.exists():
        raise RuntimeError("Output exists; refusing second execution")
    expected = seal["artifact_sha256"]
    actual = {"sealed_queries": sha(QUERY_FILE), "frozen_chunks": sha(CHUNK_FILE),
              "runtime_relations": sha(RELATION_FILE),
              "retrieval_core": sha(ROOT / "scripts" / "v6" / "v6r_retrieval_core.py"),
              "fresh_runner": sha(Path(__file__))}
    for name, digest in actual.items():
        if expected[name] != digest:
            raise RuntimeError(f"Frozen artifact mismatch: {name}")
    queries, chunks, relations = rows(QUERY_FILE), rows(CHUNK_FILE), rows(RELATION_FILE)
    generator = RelationEnrichedCandidateGenerator(chunks, relations, reserve_pairs=2)
    output = []
    for query in queries:
        candidates = generator.candidates(query["query_text"], 20)
        systems, selected_pair = rank_systems(query["query_text"], candidates, relations, .5,
                                              recency_lambda=.75, corpus_min_year=2005, corpus_max_year=2026)
        candidate_ids = [x["chunk_id"] for x in candidates]
        pool_hash = hashlib.sha256("\n".join(candidate_ids).encode()).hexdigest()
        for system in "ABCDEF":
            ranked = systems[system]
            output.append({"schema_version": "v7-pilot-raw-retrieval-1", "query_id": query["query_id"],
                           "system": system, "router_explicit_history": ranked[0]["router_explicit_history"],
                           "shared_candidate_pool_ids": candidate_ids, "shared_candidate_pool_sha256": pool_hash,
                           "selected_pair": selected_pair, "ranked_candidates": ranked,
                           "top1": [x["chunk_id"] for x in ranked[:1]],
                           "top3": [x["chunk_id"] for x in ranked[:3]],
                           "top5": [x["chunk_id"] for x in ranked[:5]]})
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in output), encoding="utf-8", newline="\n")
    run = {"schema_version": "v7-pilot-run-manifest-1", "status": "single_use_raw_output_sealed",
           "executed_at_utc": datetime.now(timezone.utc).isoformat(), "query_count": len(queries),
           "system_count": 6, "record_count": len(output), "judgment_file_read_count": 0,
           "external_model_api_used": False, "fresh_test_execution_count": 1,
           "python_version": sys.version, "platform": platform.platform(), "raw_output_sha256": sha(RAW)}
    RUN_MANIFEST.write_text(json.dumps(run, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    guard.update({"status": "fresh_test_executed_once_raw_output_locked", "fresh_test_execution_count": 1,
                  "retrieval_allowed": False, "raw_output_sha256": sha(RAW), "run_manifest_sha256": sha(RUN_MANIFEST)})
    GUARD.write_text(json.dumps(guard, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(run, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
