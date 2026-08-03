#!/usr/bin/env python3
"""Structurally audit V6 mined relation candidates against pages and exclusions."""

from __future__ import annotations

import collections
import hashlib
import json
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
MINING_DIR = EXPERIMENT_ROOT / "data" / "v6_source_mining"
CANDIDATE_PATH = MINING_DIR / "V6_RELATION_CANDIDATES.jsonl"
PAGE_INDEX_PATH = MINING_DIR / "V6_PDF_PAGE_INDEX.jsonl"
EXCLUSION_PATH = EXPERIMENT_ROOT / "data" / "v6_confirmatory" / "V6_EXCLUSION_LEDGER.jsonl"
VISUAL_REVIEW_PATH = MINING_DIR / "V6_VISUAL_REVIEW_LEDGER.jsonl"
OUTPUT_PATH = MINING_DIR / "V6_RELATION_CANDIDATE_AUDIT.json"
REPORT_PATH = EXPERIMENT_ROOT / "V6_RELATION_CANDIDATE_AUDIT.md"
MAIN_STRATA = (
    "explicit_history",
    "conditional_merge",
    "current_only",
    "hard_negative_current",
)
TARGET_PER_STRATUM = 24
MINIMUM_PER_STRATUM = 20
MAX_FAMILY_SHARE = 0.25


def load_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    candidates = load_jsonl(CANDIDATE_PATH)
    pages = load_jsonl(PAGE_INDEX_PATH)
    exclusions = load_jsonl(EXCLUSION_PATH)
    visual_reviews = load_jsonl(VISUAL_REVIEW_PATH)
    page_lookup = {
        (record["document_id"], record["pdf_page_number"]): record for record in pages
    }

    candidate_ids = [record["candidate_id"] for record in candidates]
    lineage_ids = [record["lineage_id"] for record in candidates]
    if len(candidate_ids) != len(set(candidate_ids)):
        raise ValueError("Duplicate candidate_id")
    if len(lineage_ids) != len(set(lineage_ids)):
        raise ValueError("Duplicate lineage_id")
    visual_review_ids = [record["candidate_id"] for record in visual_reviews]
    if len(visual_review_ids) != len(set(visual_review_ids)):
        raise ValueError("Duplicate candidate_id in visual review ledger")
    missing_visual_reviews = sorted(set(candidate_ids) - set(visual_review_ids))
    failed_visual_reviews = sorted(
        record["candidate_id"] for record in visual_reviews if record["result"] != "pass"
    )

    excluded_lineages = {
        record.get("lineage_group_id") for record in exclusions if record.get("lineage_group_id")
    }
    excluded_documents = {
        ref.get("document_id")
        for record in exclusions
        for key in ("required_evidence_refs", "exposed_evidence_refs")
        for ref in record.get(key, [])
        if ref.get("document_id")
    }
    direct_lineage_collisions = sorted(set(lineage_ids) & excluded_lineages)

    missing_pages: list[dict] = []
    evidence_token_warnings: list[dict] = []
    referenced_documents: set[str] = set()
    for candidate in candidates:
        references = [(field, candidate.get(field)) for field in ("older", "current", "relation_evidence")]
        references.extend(("additional_older", reference) for reference in candidate.get("additional_older", []))
        for field, reference in references:
            if not reference:
                continue
            key = (reference["document_id"], reference["pdf_page_number"])
            referenced_documents.add(reference["document_id"])
            page = page_lookup.get(key)
            if not page:
                missing_pages.append(
                    {"candidate_id": candidate["candidate_id"], "field": field, "key": key}
                )
                continue
            recommendation_id = reference.get("recommendation_id")
            if recommendation_id:
                tokens = recommendation_id.replace("_", " ").split()
                if not all(token.lower() in page["text"].lower() for token in tokens):
                    evidence_token_warnings.append(
                        {
                            "candidate_id": candidate["candidate_id"],
                            "field": field,
                            "recommendation_id": recommendation_id,
                            "pdf_page_number": reference["pdf_page_number"],
                        }
                    )

    family_counts = collections.Counter(record["family"] for record in candidates)
    relation_counts = collections.Counter(record["relation_type"] for record in candidates)
    review_counts = collections.Counter(record["review_status"] for record in candidates)
    stratum_counts = collections.Counter(
        stratum for record in candidates for stratum in record["candidate_strata"]
    )

    def passes_semantic_preflight(record: dict, stratum: str) -> bool:
        if stratum != "hard_negative_current":
            return True
        return (
            record.get("older") is not None
            and record["relation_type"] in {"updates", "supersedes"}
        )

    family_by_stratum = {
        stratum: collections.Counter(
            record["family"]
            for record in candidates
            if stratum in record["candidate_strata"]
            and passes_semantic_preflight(record, stratum)
        )
        for stratum in MAIN_STRATA
    }
    hard_negative_preflight_rejections = sorted(
        record["candidate_id"]
        for record in candidates
        if "hard_negative_current" in record["candidate_strata"]
        and not passes_semantic_preflight(record, "hard_negative_current")
    )

    def capped_capacity(stratum: str, requested_size: int) -> dict:
        family_cap = int(requested_size * MAX_FAMILY_SHARE)
        counts = family_by_stratum[stratum]
        capacity = sum(min(count, family_cap) for count in counts.values())
        return {
            "requested_size": requested_size,
            "per_family_cap": family_cap,
            "maximum_selectable_under_cap": capacity,
            "feasible": capacity >= requested_size,
        }

    topic_capacity = {
        stratum: {
            "family_counts": dict(sorted(family_by_stratum[stratum].items())),
            "target_24": capped_capacity(stratum, TARGET_PER_STRATUM),
            "minimum_20": capped_capacity(stratum, MINIMUM_PER_STRATUM),
        }
        for stratum in MAIN_STRATA
    }
    topic_capacity_gate_pass = all(
        capacity["target_24"]["feasible"] for capacity in topic_capacity.values()
    )
    base_structural_gate_pass = (
        not missing_pages
        and not direct_lineage_collisions
        and not missing_visual_reviews
        and not failed_visual_reviews
    )

    audit = {
        "schema_version": "v6-relation-candidate-audit-1",
        "candidate_file_sha256": sha256_file(CANDIDATE_PATH),
        "visual_review_ledger_sha256": sha256_file(VISUAL_REVIEW_PATH),
        "page_index_sha256": sha256_file(PAGE_INDEX_PATH),
        "exclusion_ledger_sha256": sha256_file(EXCLUSION_PATH),
        "candidate_count": len(candidates),
        "unique_lineage_count": len(set(lineage_ids)),
        "family_counts": dict(sorted(family_counts.items())),
        "relation_type_counts": dict(sorted(relation_counts.items())),
        "review_status_counts": dict(sorted(review_counts.items())),
        "candidate_stratum_counts_nonexclusive": dict(sorted(stratum_counts.items())),
        "topic_family_capacity": topic_capacity,
        "topic_capacity_gate_pass": topic_capacity_gate_pass,
        "hard_negative_semantic_preflight_rejection_count": len(
            hard_negative_preflight_rejections
        ),
        "hard_negative_semantic_preflight_rejections": (
            hard_negative_preflight_rejections
        ),
        "direct_lineage_collision_count": len(direct_lineage_collisions),
        "direct_lineage_collisions": direct_lineage_collisions,
        "referenced_documents_already_named_in_exclusion_ledger": sorted(
            referenced_documents & excluded_documents
        ),
        "missing_page_reference_count": len(missing_pages),
        "missing_page_references": missing_pages,
        "recommendation_token_warning_count": len(evidence_token_warnings),
        "recommendation_token_warnings": evidence_token_warnings,
        "missing_visual_review_count": len(missing_visual_reviews),
        "missing_visual_reviews": missing_visual_reviews,
        "failed_visual_review_count": len(failed_visual_reviews),
        "failed_visual_reviews": failed_visual_reviews,
        "base_structural_gate_pass": base_structural_gate_pass,
        "gate_pass": base_structural_gate_pass and topic_capacity_gate_pass,
        "eligibility_warning": "Structural gate only. It does not establish semantic novelty, unanimous AI approval, stratum eligibility, or final test eligibility.",
    }
    OUTPUT_PATH.write_text(
        json.dumps(audit, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    report = f"""# V6 relation candidate audit

Status: **{'STRUCTURAL PASS' if audit['gate_pass'] else 'STRUCTURAL FAIL'}**

## Counts

- Candidate relations: {audit['candidate_count']}
- Unique proposed lineages: {audit['unique_lineage_count']}
- Direct lineage collisions with the exclusion ledger: {audit['direct_lineage_collision_count']}
- Missing page references: {audit['missing_page_reference_count']}
- Recommendation-token warnings: {audit['recommendation_token_warning_count']}
- Missing visual reviews: {audit['missing_visual_review_count']}
- Failed visual reviews: {audit['failed_visual_review_count']}
- Topic-family capacity gate (96-question target): {audit['topic_capacity_gate_pass']}

## Families

{chr(10).join(f'- `{key}`: {value}' for key, value in audit['family_counts'].items())}

## Proposed relation types

{chr(10).join(f'- `{key}`: {value}' for key, value in audit['relation_type_counts'].items())}

## Topic-family capacity by main stratum

The target is 24 questions per stratum with no family above 25% (at most 6). The fallback minimum is 20 questions per stratum (at most 5 per family).

{chr(10).join(f"- `{key}`: target capacity {value['target_24']['maximum_selectable_under_cap']}/24 ({'feasible' if value['target_24']['feasible'] else 'not feasible'}); minimum capacity {value['minimum_20']['maximum_selectable_under_cap']}/20 ({'feasible' if value['minimum_20']['feasible'] else 'not feasible'})" for key, value in audit['topic_family_capacity'].items())}

## Important limitation

This pass checks identifiers, duplicate lineages, direct exclusion-ledger collisions, and page existence. It does not certify semantic novelty or medical correctness. Candidates remain ineligible for the sealed test until visual review, isolated AI review, unanimous adjudication, near-duplicate review, and the full capacity gate are complete.
"""
    REPORT_PATH.write_text(report, encoding="utf-8", newline="\n")
    print(json.dumps(audit, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
