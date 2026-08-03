#!/usr/bin/env python3
"""Non-retrieval V6 preflight: hashes, runner isolation, tests, and guard."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "configs" / "v6"
POLICY = CONFIG / "FROZEN_POLICY_PACKAGE.json"
GUARD = CONFIG / "FRESH_TEST_GUARD.json"
REPORT = CONFIG / "PREFLIGHT_AUDIT.json"
RUNNER = ROOT / "scripts" / "v6" / "run_v6_fresh_retrieval.py"
RAW = ROOT / "results" / "v6" / "raw" / "V6_RAW_RETRIEVAL_RESULTS.jsonl"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    policy = json.loads(POLICY.read_text(encoding="utf-8"))
    guard = json.loads(GUARD.read_text(encoding="utf-8"))
    mapping = {
        "sealed_queries": ROOT / "data" / "v6_confirmatory" / "V6_QUERIES_SEALED.jsonl",
        "sealed_chunk_gold": ROOT / "data" / "v6_confirmatory" / "V6_GOLD_CONTRACTS_CHUNK_LEVEL_SEALED.jsonl",
        "frozen_chunks": ROOT / "data" / "v6_corpus_frozen" / "chunks.jsonl",
        "corpus_freeze_manifest": ROOT / "data" / "v6_corpus_frozen" / "FREEZE_MANIFEST.json",
        "sealed_runtime_relations": ROOT / "data" / "v6_confirmatory" / "V6_RUNTIME_CHUNK_RELATIONS_SEALED.jsonl",
        "runtime_relation_manifest": ROOT / "data" / "v6_confirmatory" / "V6_RUNTIME_CHUNK_RELATIONS_SEAL_MANIFEST.json",
        "pair_boost_sensitivity": ROOT / "results" / "v6" / "development" / "V6_PAIR_BOOST_SENSITIVITY.json",
        "retrieval_core": ROOT / "scripts" / "v6" / "v6_retrieval_core.py",
        "fresh_runner": RUNNER,
        "evaluator": ROOT / "scripts" / "v6" / "evaluate_v6_fresh_retrieval.py",
        "invariant_tests": ROOT / "tests" / "unit" / "test_v6_retrieval_invariants.py",
    }
    hash_checks = {key: sha(path) == policy["artifact_sha256"][key] for key, path in mapping.items()}
    runner_text = RUNNER.read_text(encoding="utf-8").lower()
    isolation_pass = "v6_gold_contracts" not in runner_text and "sealed_chunk_gold" not in runner_text
    test = subprocess.run([sys.executable, "-m", "unittest", "experiments/version_aware_rag/tests/unit/test_v6_retrieval_invariants.py", "-v"], cwd=ROOT.parents[1], capture_output=True, text=True)
    checks = {
        "all_frozen_hashes_match": all(hash_checks.values()),
        "policy_matches_guard": sha(POLICY) == guard.get("frozen_policy_sha256"),
        "guard_ready_and_unused": guard.get("status") == "frozen_ready_for_single_execution" and guard.get("fresh_test_execution_count") == 0,
        "raw_output_absent": not RAW.exists(),
        "runner_has_no_gold_path_reference": isolation_pass,
        "seven_invariant_tests_pass": test.returncode == 0 and "Ran 7 tests" in (test.stdout + test.stderr),
    }
    report = {
        "schema_version": "v6-fresh-preflight-audit-1", "status": "pass" if all(checks.values()) else "fail",
        "checks": checks, "hash_checks": hash_checks, "test_output": test.stdout + test.stderr,
        "fresh_retrieval_allowed": all(checks.values()),
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if report["status"] != "pass":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
