#!/usr/bin/env python3
"""Analyze isolated V6 relation-review agreement without majority voting."""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
MINING_DIR = EXPERIMENT_ROOT / "data" / "v6_source_mining"
DEFAULT_REVIEW_DIR = MINING_DIR / "relation_review_v2"
CANDIDATE_PATH = MINING_DIR / "V6_RELATION_CANDIDATES.jsonl"
MAIN_STRATA = (
    "explicit_history",
    "conditional_merge",
    "current_only",
    "hard_negative_current",
)


def load_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def capacity(family_counts: collections.Counter, size: int) -> dict:
    family_cap = int(size * 0.25)
    maximum = sum(min(count, family_cap) for count in family_counts.values())
    return {
        "requested_size": size,
        "per_family_cap": family_cap,
        "maximum_selectable_under_cap": maximum,
        "feasible": maximum >= size,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review-dir", type=Path, default=DEFAULT_REVIEW_DIR)
    parser.add_argument("--candidate-id-prefix")
    args = parser.parse_args()
    review_dir = args.review_dir.resolve()
    output_json = review_dir / "INTERIM_AGREEMENT.json"
    output_md = review_dir / "INTERIM_AGREEMENT.md"
    reviewer_paths = {
        "codex": review_dir / "CODEX_RAW_REVIEW.jsonl",
        "gemini": (
            review_dir / "GEMINI_CLEAN_RAW_REVIEW.jsonl"
            if (review_dir / "GEMINI_CLEAN_RAW_REVIEW.jsonl").exists()
            else review_dir / "GEMINI_RAW_REVIEW.jsonl"
        ),
        "chatgpt": (
            review_dir / "CHATGPT_CLEAN_RAW_REVIEW.jsonl"
            if (review_dir / "CHATGPT_CLEAN_RAW_REVIEW.jsonl").exists()
            else review_dir / "CHATGPT_RAW_REVIEW.jsonl"
        ),
    }
    available_paths = {
        reviewer: path for reviewer, path in reviewer_paths.items() if path.exists()
    }
    candidates = load_jsonl(CANDIDATE_PATH)
    if args.candidate_id_prefix:
        candidates = [
            record
            for record in candidates
            if record["candidate_id"].startswith(args.candidate_id_prefix)
        ]
    reviews = {
        reviewer: load_jsonl(path) for reviewer, path in available_paths.items()
    }
    gemini_isolation_audit_path = (
        review_dir / "GEMINI_CLEAN_ISOLATION_AUDIT.json"
        if (review_dir / "GEMINI_CLEAN_ISOLATION_AUDIT.json").exists()
        else review_dir / "GEMINI_ISOLATION_AUDIT.json"
    )
    reviewer_strict_isolation = {reviewer: True for reviewer in reviews}
    if "gemini" in reviews and gemini_isolation_audit_path.exists():
        gemini_audit = json.loads(
            gemini_isolation_audit_path.read_text(encoding="utf-8")
        )
        reviewer_strict_isolation["gemini"] = gemini_audit.get(
            "usable_as_final_isolated_judge", False
        )
    chatgpt_isolation_audit_path = review_dir / "CHATGPT_CLEAN_ISOLATION_AUDIT.json"
    if "chatgpt" in reviews and chatgpt_isolation_audit_path.exists():
        chatgpt_audit = json.loads(
            chatgpt_isolation_audit_path.read_text(encoding="utf-8")
        )
        reviewer_strict_isolation["chatgpt"] = chatgpt_audit.get(
            "usable_as_final_isolated_judge", False
        )
    expected_ids = [record["candidate_id"] for record in candidates]
    for reviewer, records in reviews.items():
        if [record["candidate_id"] for record in records] != expected_ids:
            raise ValueError(f"{reviewer} candidate order mismatch")

    structured_disagreements = []
    unanimously_supported_strata: dict[str, list[str]] = {}
    for index, candidate in enumerate(candidates):
        candidate_reviews = {
            reviewer: records[index] for reviewer, records in reviews.items()
        }
        disagreements = {}
        for field in (
            "older_support",
            "current_support",
            "relation_support",
            "unsupported_material_claim",
            "eligible",
        ):
            values = {
                reviewer: record[field]
                for reviewer, record in candidate_reviews.items()
            }
            if len(set(values.values())) > 1:
                disagreements[field] = values
        for stratum in candidate["candidate_strata"]:
            values = {
                reviewer: record["stratum_judgments"][stratum]
                for reviewer, record in candidate_reviews.items()
            }
            if len(set(values.values())) > 1:
                disagreements[f"stratum:{stratum}"] = values
        if disagreements:
            structured_disagreements.append(
                {"candidate_id": candidate["candidate_id"], "fields": disagreements}
            )
        unanimously_supported_strata[candidate["candidate_id"]] = [
            stratum
            for stratum in candidate["candidate_strata"]
            if all(
                record["stratum_judgments"][stratum] == "pass"
                for record in candidate_reviews.values()
            )
        ]

    family_by_stratum = {}
    for stratum in MAIN_STRATA:
        counts = collections.Counter(
            candidate["family"]
            for candidate in candidates
            if stratum in unanimously_supported_strata[candidate["candidate_id"]]
        )
        family_by_stratum[stratum] = {
            "family_counts": dict(sorted(counts.items())),
            "target_24": capacity(counts, 24),
            "minimum_20": capacity(counts, 20),
        }

    report = {
        "schema_version": "v6-relation-review-agreement-1",
        "status": (
            "complete"
            if len(reviews) == 3 and all(reviewer_strict_isolation.values())
            else "interim_waiting_for_valid_isolated_reviewers"
        ),
        "reviewers_present": sorted(reviews),
        "reviewers_missing": sorted(set(reviewer_paths) - set(reviews)),
        "reviewer_strict_isolation": reviewer_strict_isolation,
        "reviewers_not_strictly_eligible": sorted(
            reviewer
            for reviewer, valid in reviewer_strict_isolation.items()
            if not valid
        ),
        "review_hashes": {
            reviewer: sha256(path) for reviewer, path in available_paths.items()
        },
        "candidate_count": len(candidates),
        "candidate_source_sha256": sha256(CANDIDATE_PATH),
        "structured_disagreement_candidate_count": len(structured_disagreements),
        "structured_disagreements": structured_disagreements,
        "unanimous_pass_capacity": family_by_stratum,
        "all_main_strata_target_24_feasible": all(
            item["target_24"]["feasible"] for item in family_by_stratum.values()
        ),
        "warning": (
            "Final three-model source-grounded consensus; unanimous means ChatGPT, "
            "Gemini, and Codex all pass the item. This is AI triangulation, not human "
            "or expert consensus."
            if len(reviews) == 3 and all(reviewer_strict_isolation.values())
            else "Unanimous means all reviewer files currently loaded. This is not "
            "final three-model consensus until ChatGPT, Gemini, and Codex are all "
            "present and each pass satisfies strict isolation."
        ),
    }
    output_json.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    rows = "\n".join(
        f"- `{stratum}`: {item['target_24']['maximum_selectable_under_cap']}/24 "
        f"({'feasible' if item['target_24']['feasible'] else 'not feasible'})"
        for stratum, item in family_by_stratum.items()
    )
    output_md.write_text(
        "# V6 relation-review agreement\n\n"
        f"Status: **{report['status']}**\n\n"
        f"Reviewers present: {', '.join(report['reviewers_present'])}\n\n"
        f"Reviewers missing: {', '.join(report['reviewers_missing']) or 'none'}\n\n"
        f"Reviewers failing strict isolation: {', '.join(report['reviewers_not_strictly_eligible']) or 'none'}\n\n"
        f"Structured disagreement candidates: {len(structured_disagreements)}\n\n"
        "## Unanimous-pass capacity among reviewers currently present\n\n"
        f"{rows}\n\n"
        "This is not final three-model consensus while any reviewer is missing. "
        "No majority vote is used.\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
