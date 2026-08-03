#!/usr/bin/env python3
"""Audit per-record review coverage against the exact final query/gold contract signature."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
FINAL_PACKET = DATA / "v6_query_review_v3" / "BLIND_QUERY_REVIEW_PACKET.jsonl"
OUTPUT = DATA / "v6_confirmatory" / "V6_FINAL_REVIEW_COVERAGE_AUDIT.json"
GAPS = DATA / "v6_confirmatory" / "V6_FINAL_REVIEW_GAPS.jsonl"
LEDGER = DATA / "v6_confirmatory" / "V6_FINAL_REVIEW_COVERAGE_LEDGER.jsonl"
FIELDS = (
    "answerability", "stratum_validity", "required_evidence_necessity",
    "unsafe_evidence_labels", "non_triviality", "leakage_safety", "wording_safety",
)

RUNS = (
    ("codex_initial", "v6_query_review_v2", "CODEX_QUERY_REVIEW.jsonl"),
    ("gemini_v2_merged", "v6_query_review_v2", "GEMINI_QUERY_REVIEW_MERGED.jsonl"),
    ("codex_session_019fbd29", "v6_query_review_v2", "CODEX_GPT5_ADJUDICATOR_QUERY_REVIEW.jsonl"),
    ("gemini_delta26", "v6_query_review_delta_26", "GEMINI_QUERY_REVIEW.jsonl"),
    ("gpt56_delta26", "v6_query_review_delta_26", "GPT_5_6_THINKING_QUERY_REVIEW.jsonl"),
    ("gemini_delta23", "v6_query_review_delta_23", "GEMINI_QUERY_REVIEW.jsonl"),
    ("gpt56_delta23", "v6_query_review_delta_23", "GPT_5_6_THINKING_QUERY_REVIEW.jsonl"),
    ("gemini_delta4", "v6_query_review_delta_4", "GEMINI_QUERY_REVIEW.jsonl"),
    ("codex_session_019fbd29", "v6_query_review_delta_4", "CODEX_GPT5_QUERY_REVIEW.jsonl"),
    ("gpt56_final", "v6_query_review_delta_4", "GPT_5_6_FINAL_QUERY_REVIEW.jsonl"),
    ("gpt56_gap_final", "v6_query_review_final_gap_33", "GPT_5_6_GAP_FINAL_QUERY_REVIEW.jsonl"),
)


def load(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def signature(record: dict) -> str:
    # Review-only relation excerpts are ignored unless they are labeled as an
    # answer/safety contract. This signature therefore tracks the exact query,
    # stratum, and retrieval-relevant gold labels.
    evidence = []
    for item in record["evidence_excerpts"]:
        if item["proposed_label"] == "relation_evidence_ref":
            continue
        evidence.append({
            "document_id": item["document_id"],
            "pdf_page_number": item["pdf_page_number"],
            "recommendation_id": item.get("recommendation_id"),
            "proposed_label": item["proposed_label"],
        })
    canonical = {
        "query_text": record["query_text"],
        "proposed_stratum": record["proposed_stratum"],
        "family": record["family"],
        "relation_type": record["relation_type"],
        "evidence": evidence,
    }
    return hashlib.sha256(json.dumps(canonical, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def main() -> None:
    final_records = load(FINAL_PACKET)
    final = {record["query_id"]: record for record in final_records}
    coverage: dict[str, set[str]] = {query_id: set() for query_id in final}
    run_report = []
    for identity, directory, review_name in RUNS:
        folder = DATA / directory
        packet_name = "QUERY_REVIEW_ATTACHMENT.txt"
        packet_path = folder / packet_name
        review_path = folder / review_name
        if not packet_path.exists() or not review_path.exists():
            raise RuntimeError(f"Missing review artifact: {packet_path} or {review_path}")
        packet = {record["query_id"]: record for record in load(packet_path)}
        review = {record["query_id"]: record for record in load(review_path)}
        matching = 0
        passing = 0
        for query_id, final_record in final.items():
            if query_id not in packet or query_id not in review:
                continue
            if signature(packet[query_id]) != signature(final_record):
                continue
            matching += 1
            judgment = review[query_id]
            if judgment["eligible"] is True and all(judgment[field] == "pass" for field in FIELDS):
                coverage[query_id].add(identity)
                passing += 1
        run_report.append({
            "review_identity": identity,
            "directory": directory,
            "review_file": review_name,
            "matching_final_contract_count": matching,
            "passing_final_contract_count": passing,
            "packet_sha256": sha(packet_path),
            "review_sha256": sha(review_path),
        })

    coverage_records = [
        {
            "query_id": query_id,
            "passing_review_count": len(identities),
            "passing_review_identities": sorted(identities),
            "final_contract_signature": signature(final[query_id]),
            "status": "covered" if len(identities) >= 3 else "review_gap",
        }
        for query_id, identities in coverage.items()
    ]
    LEDGER.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in coverage_records), encoding="utf-8", newline="\n")
    gap_records = [record for record in coverage_records if record["status"] == "review_gap"]
    GAPS.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in gap_records), encoding="utf-8", newline="\n")
    distribution: dict[str, int] = {}
    for identities in coverage.values():
        distribution[str(len(identities))] = distribution.get(str(len(identities)), 0) + 1
    report = {
        "schema_version": "v6-final-review-coverage-audit-1",
        "final_packet_sha256": sha(FINAL_PACKET),
        "query_count": len(final),
        "required_passing_reviews_per_query": 3,
        "passing_review_count_distribution": dict(sorted(distribution.items())),
        "fully_covered_query_count": len(final) - len(gap_records),
        "review_gap_query_count": len(gap_records),
        "review_gap_query_ids": [record["query_id"] for record in gap_records],
        "coverage_ledger_sha256": sha(LEDGER),
        "runs": run_report,
        "query_contracts_sealable": not gap_records,
        "fresh_retrieval_allowed": False,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
