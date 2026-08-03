#!/usr/bin/env python3
"""Write final checksums and a compact V6 core-study completion manifest."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FILES = [
    "V6_PROTOCOL.md", "V6_PHASE_3_PROGRESS_AND_PAPER_UPDATE_ZH.md", "V6_POLICY_FREEZE_REPORT.md", "V6_REVIEWER_QA_ZH.md",
    "data/v6_confirmatory/V6_QUERIES_SEALED.jsonl",
    "data/v6_confirmatory/V6_GOLD_CONTRACTS_CHUNK_LEVEL_SEALED.jsonl",
    "data/v6_confirmatory/V6_RUNTIME_CHUNK_RELATIONS_SEALED.jsonl",
    "data/v6_corpus_frozen/chunks.jsonl", "data/v6_corpus_frozen/FREEZE_MANIFEST.json",
    "configs/v6/FROZEN_POLICY_PACKAGE.json", "configs/v6/FRESH_TEST_GUARD.json", "configs/v6/PREFLIGHT_AUDIT.json",
    "results/v6/development/V6_PAIR_BOOST_SENSITIVITY.json",
    "results/v6/raw/V6_RAW_RETRIEVAL_RESULTS.jsonl", "results/v6/raw/V6_RAW_RETRIEVAL_RUN_MANIFEST.json",
    "results/v6/V6_RETRIEVAL_RESULTS.json", "results/v6/V6_RETRIEVAL_RESULTS.md", "results/v6/V6_PER_QUERY_RESULTS.csv",
    "results/v6/V6_INDEPENDENT_RECOMPUTATION.json", "results/v6/V6_FAILURE_ATTRIBUTION.json", "results/v6/V6_ERROR_ANALYSIS.md",
]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    missing = [name for name in FILES if not (ROOT / name).exists()]
    if missing:
        raise RuntimeError(f"Missing final artifacts: {missing}")
    checksums = [(sha(ROOT / name), name.replace("\\", "/")) for name in FILES]
    checksum_path = ROOT / "ARTIFACT_CHECKSUMS.sha256"
    checksum_path.write_text("".join(f"{digest}  {name}\n" for digest, name in checksums), encoding="utf-8", newline="\n")
    result = json.loads((ROOT / "results/v6/V6_RETRIEVAL_RESULTS.json").read_text(encoding="utf-8"))
    guard = json.loads((ROOT / "configs/v6/FRESH_TEST_GUARD.json").read_text(encoding="utf-8"))
    verification = json.loads((ROOT / "results/v6/V6_INDEPENDENT_RECOMPUTATION.json").read_text(encoding="utf-8"))
    manifest = {
        "schema_version": "v6-core-study-completion-manifest-1",
        "finalized_at_utc": datetime.now(timezone.utc).isoformat(),
        "status": "core_retrieval_complete_negative_candidate_limited_result",
        "fresh_test_execution_count": guard["fresh_test_execution_count"],
        "tuning_or_rerun_allowed": False,
        "query_count": 96, "system_count": 6, "raw_record_count": 576,
        "primary_mean_E_minus_B": result["primary_effectiveness"]["mean_paired_difference"],
        "primary_p_value": result["primary_effectiveness"]["exact_paired_sign_flip_p_value_two_sided"],
        "candidate_required_micro_recall_at_20": result["summaries"]["A"]["overall"]["candidate_required_micro_recall_at_20"],
        "independent_recomputation_status": verification["status"],
        "answer_bridge_executed": False,
        "answer_bridge_reason": "No positive retrieval gain to bridge; AI-only answer evaluation would not rescue the confirmatory retrieval claim.",
        "artifact_checksums_sha256": sha(checksum_path),
    }
    path = ROOT / "V6_COMPLETION_MANIFEST.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
