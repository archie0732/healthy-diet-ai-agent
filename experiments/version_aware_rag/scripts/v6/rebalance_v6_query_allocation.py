#!/usr/bin/env python3
"""Rebalance the adjudicated V6 allocation from four strata to three."""

from __future__ import annotations

import collections
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CONFIRM = ROOT / "data" / "v6_confirmatory"
ARCHIVE = CONFIRM / "archive_4strata_pre_adjudication"
SOURCE = ARCHIVE / "V6_QUERY_ALLOCATION_PLAN.jsonl"
OUTPUT = CONFIRM / "V6_QUERY_ALLOCATION_PLAN.jsonl"
MANIFEST = CONFIRM / "V6_QUERY_ALLOCATION_MANIFEST.json"
STRATA = ("explicit_history", "current_only", "hard_negative_current")
SHORT = {"explicit_history": "eh", "current_only": "co", "hard_negative_current": "hn"}
REALLOCATION = {
    "v6q-cm-001": "current_only",
    "v6q-cm-002": "current_only",
    "v6q-cm-003": "current_only",
    "v6q-cm-004": "current_only",
    "v6q-cm-005": "explicit_history",
    "v6q-cm-006": "explicit_history",
    "v6q-cm-007": "hard_negative_current",
    "v6q-cm-008": "hard_negative_current",
    "v6q-cm-009": "hard_negative_current",
    "v6q-cm-010": "hard_negative_current",
    "v6q-cm-011": "hard_negative_current",
    "v6q-cm-012": "hard_negative_current",
    "v6q-cm-013": "current_only",
    "v6q-cm-014": "current_only",
    "v6q-cm-015": "explicit_history",
    "v6q-cm-016": "explicit_history",
    "v6q-cm-017": "explicit_history",
    "v6q-cm-018": "explicit_history",
    "v6q-cm-019": "current_only",
    "v6q-cm-020": "current_only",
    "v6q-cm-021": "explicit_history",
    "v6q-cm-022": "explicit_history",
    "v6q-cm-023": "hard_negative_current",
    "v6q-cm-024": "hard_negative_current",
}


def load(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    original = load(SOURCE)
    old_conditional = [x for x in original if x["stratum"] == "conditional_merge"]
    if len(original) != 96 or {x["query_id"] for x in old_conditional} != set(REALLOCATION):
        raise RuntimeError("Archived four-stratum allocation does not match the frozen migration map")

    migrated = [dict(x) for x in original if x["stratum"] != "conditional_merge"]
    next_number = collections.Counter({stratum: 24 for stratum in STRATA})
    for record in old_conditional:
        stratum = REALLOCATION[record["query_id"]]
        next_number[stratum] += 1
        migrated.append({
            **record,
            "schema_version": "v6-query-allocation-plan-2",
            "query_id": f"v6q-{SHORT[stratum]}-{next_number[stratum]:03d}",
            "stratum": stratum,
            "status": "reallocated_after_query_contract_adjudication",
            "supersedes_query_id": record["query_id"],
        })

    migrated.sort(key=lambda x: (STRATA.index(x["stratum"]), int(x["query_id"].rsplit("-", 1)[1])))
    counts = collections.Counter(x["stratum"] for x in migrated)
    families = {
        stratum: dict(sorted(collections.Counter(x["family"] for x in migrated if x["stratum"] == stratum).items()))
        for stratum in STRATA
    }
    lineages = collections.Counter(x["lineage_id"] for x in migrated)
    duplicate_candidates = [key for key, count in collections.Counter((x["candidate_id"], x["stratum"]) for x in migrated).items() if count > 1]
    duplicate_lineages = [key for key, count in collections.Counter((x["lineage_id"], x["stratum"]) for x in migrated).items() if count > 1]
    if any(counts[s] != 32 for s in STRATA):
        raise RuntimeError(f"Unbalanced migrated strata: {dict(counts)}")
    if max(lineages.values()) > 2:
        raise RuntimeError("Lineage cap exceeded")
    if any(value > 8 for group in families.values() for value in group.values()):
        raise RuntimeError(f"Family cap exceeded: {families}")
    if duplicate_candidates or duplicate_lineages:
        raise RuntimeError("Within-stratum candidate or lineage duplication detected")

    OUTPUT.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in migrated), encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-query-allocation-manifest-2",
        "design_change": "conditional_merge removed after evidence-necessity adjudication; 24 records redistributed 8/8/8",
        "allocation_count": len(migrated),
        "stratum_counts": dict(sorted(counts.items())),
        "family_counts_by_stratum": families,
        "unique_lineage_count": len(lineages),
        "lineages_used_twice": sum(count == 2 for count in lineages.values()),
        "maximum_queries_per_lineage": max(lineages.values()),
        "maximum_family_count_per_stratum": max(value for group in families.values() for value in group.values()),
        "within_stratum_candidate_duplicates": 0,
        "within_stratum_lineage_duplicates": 0,
        "archived_allocation_sha256": sha(SOURCE),
        "allocation_sha256": sha(OUTPUT),
        "all_constraints_pass": True,
        "fresh_retrieval_allowed": False,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
