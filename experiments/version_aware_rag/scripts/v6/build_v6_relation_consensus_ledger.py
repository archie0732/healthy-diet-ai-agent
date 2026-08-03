#!/usr/bin/env python3
"""Build the unanimous three-model V6 relation eligibility ledger."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
MINING_DIR = EXPERIMENT_ROOT / "data" / "v6_source_mining"
REVIEW_DIR = MINING_DIR / "relation_review_v2"
DELTA_REVIEW_DIR = MINING_DIR / "relation_review_v3_delta"
CONFIRMATORY_DIR = EXPERIMENT_ROOT / "data" / "v6_confirmatory"
CANDIDATE_PATH = MINING_DIR / "V6_RELATION_CANDIDATES.jsonl"
OUTPUT_PATH = CONFIRMATORY_DIR / "V6_RELATION_CONSENSUS_LEDGER.jsonl"
MANIFEST_PATH = CONFIRMATORY_DIR / "V6_RELATION_CONSENSUS_MANIFEST.json"
REVIEW_PATHS = {
    "codex": (
        REVIEW_DIR / "CODEX_RAW_REVIEW.jsonl",
        DELTA_REVIEW_DIR / "CODEX_RAW_REVIEW.jsonl",
    ),
    "gemini": (
        REVIEW_DIR / "GEMINI_CLEAN_RAW_REVIEW.jsonl",
        DELTA_REVIEW_DIR / "GEMINI_CLEAN_RAW_REVIEW.jsonl",
    ),
    "chatgpt": (
        REVIEW_DIR / "CHATGPT_RAW_REVIEW.jsonl",
        DELTA_REVIEW_DIR / "CHATGPT_CLEAN_RAW_REVIEW.jsonl",
    ),
}
NEAR_DUPLICATE_EXCLUSIONS = {
    "v6rel-food-marketing-policy-design-2010-2023": (
        "Broad multi-facet record overlaps the four atomic food-marketing facets; "
        "retain the atomic records for independent required-evidence signatures."
    )
}


def load_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    candidates = load_jsonl(CANDIDATE_PATH)
    expected_ids = {candidate["candidate_id"] for candidate in candidates}
    reviews = {}
    for reviewer, paths in REVIEW_PATHS.items():
        records = [record for path in paths for record in load_jsonl(path)]
        record_ids = [record["candidate_id"] for record in records]
        if len(record_ids) != len(set(record_ids)):
            raise ValueError(f"{reviewer} has duplicate candidate judgments")
        if set(record_ids) != expected_ids:
            raise ValueError(
                f"{reviewer} review coverage mismatch: "
                f"missing={sorted(expected_ids - set(record_ids))}, "
                f"extra={sorted(set(record_ids) - expected_ids)}"
            )
        reviews[reviewer] = {record["candidate_id"]: record for record in records}

    agreement_paths = (
        REVIEW_DIR / "INTERIM_AGREEMENT.json",
        DELTA_REVIEW_DIR / "INTERIM_AGREEMENT.json",
    )
    for path in agreement_paths:
        agreement = json.loads(path.read_text(encoding="utf-8"))
        if agreement["status"] != "complete":
            raise RuntimeError(f"Agreement batch is not complete: {path}")

    ledger = []
    for candidate in candidates:
        candidate_id = candidate["candidate_id"]
        judgments = {
            reviewer: records[candidate_id] for reviewer, records in reviews.items()
        }
        evidence_unanimous = all(
            judgment["current_support"] == "pass"
            and judgment["relation_support"] == "pass"
            and judgment["older_support"] in {"pass", "not_applicable"}
            and not judgment["unsupported_material_claim"]
            for judgment in judgments.values()
        )
        approved_strata = [
            stratum
            for stratum in candidate["candidate_strata"]
            if all(
                judgment["stratum_judgments"][stratum] == "pass"
                for judgment in judgments.values()
            )
        ]
        exclusion_reason = NEAR_DUPLICATE_EXCLUSIONS.get(candidate["candidate_id"])
        status = (
            "approved"
            if evidence_unanimous and approved_strata and exclusion_reason is None
            else "excluded"
        )
        ledger.append(
            {
                "schema_version": "v6-relation-consensus-ledger-1",
                "candidate_id": candidate["candidate_id"],
                "lineage_id": candidate["lineage_id"],
                "family": candidate["family"],
                "relation_type": candidate["relation_type"],
                "status": status,
                "evidence_unanimous_pass": evidence_unanimous,
                "approved_strata": approved_strata,
                "rejected_strata": [
                    stratum
                    for stratum in candidate["candidate_strata"]
                    if stratum not in approved_strata
                ],
                "exclusion_reason": exclusion_reason,
                "reviewer_judgments": {
                    reviewer: {
                        "older_support": judgment["older_support"],
                        "current_support": judgment["current_support"],
                        "relation_support": judgment["relation_support"],
                        "stratum_judgments": judgment["stratum_judgments"],
                        "unsupported_material_claim": judgment[
                            "unsupported_material_claim"
                        ],
                        "eligible": judgment["eligible"],
                    }
                    for reviewer, judgment in judgments.items()
                },
            }
        )

    CONFIRMATORY_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in ledger),
        encoding="utf-8",
        newline="\n",
    )
    manifest = {
        "schema_version": "v6-relation-consensus-manifest-1",
        "candidate_count": len(ledger),
        "approved_candidate_count": sum(item["status"] == "approved" for item in ledger),
        "excluded_candidate_count": sum(item["status"] == "excluded" for item in ledger),
        "candidate_source_sha256": sha256(CANDIDATE_PATH),
        "review_hashes_by_batch": {
            reviewer: {path.parent.name: sha256(path) for path in paths}
            for reviewer, paths in REVIEW_PATHS.items()
        },
        "agreement_hashes": {
            path.parent.name: sha256(path) for path in agreement_paths
        },
        "consensus_ledger_sha256": sha256(OUTPUT_PATH),
        "decision_rule": "All three reviewers must pass evidence and a stratum; no majority vote.",
        "annotation_label": "AI-triangulated, source-grounded annotation",
        "human_or_expert_consensus": False,
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
