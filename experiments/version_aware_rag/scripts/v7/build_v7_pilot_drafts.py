#!/usr/bin/env python3
"""Create the 40-query V7 pilot drafts from the pre-frozen relation graph.

This script does not execute retrieval.  Query text and allocation are fixed in
source so the draft set is reproducible and reviewable.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RELATIONS = ROOT / "data" / "v6_repair_diagnostic" / "V6R_RUNTIME_RELATIONS.jsonl"
OUT = ROOT / "data" / "v7_pilot"

SLOTS = [
    # Explicit-history: first 17 lineages were not used in V6 explicit-history.
    ("v7q-eh-001", "explicit_history", "v6rel-wasting-b5-2013-2023", "Compare WHO's earlier and operative criteria for children with wasting or nutritional oedema to exit nutritional treatment."),
    ("v7q-eh-002", "explicit_history", "v6rel-food-marketing-comprehensive-2010-2023", "How did the scope and design of WHO's food-marketing policy recommendation change from the earlier version to the operative guideline?"),
    ("v7q-eh-003", "explicit_history", "v6rel-hb-child-6-23-any-2011-2024", "Compare the earlier and operative WHO haemoglobin cutoffs used to define any anaemia in children aged 6-23 months."),
    ("v7q-eh-004", "explicit_history", "v6rel-hb-child-6-23-mild-2011-2024", "How did WHO's mild-anaemia haemoglobin range for children aged 6-23 months change between versions?"),
    ("v7q-eh-005", "explicit_history", "v6rel-hb-child-6-23-moderate-2011-2024", "Contrast WHO's earlier and operative moderate-anaemia haemoglobin ranges for children aged 6-23 months."),
    ("v7q-eh-006", "explicit_history", "v6rel-hb-pregnancy-t2-moderate-2011-2024", "What changed between WHO's earlier and operative moderate-anaemia haemoglobin ranges for the second trimester of pregnancy?"),
    ("v7q-eh-007", "explicit_history", "v6rel-anc-mms-2016-2020", "How did WHO's recommendation on multiple micronutrient supplements in pregnancy change from the earlier guideline to the operative update?"),
    ("v7q-eh-008", "explicit_history", "v6rel-anc-vitamin-d-2016-2020", "Compare WHO's earlier and operative positions on vitamin D supplementation during pregnancy."),
    ("v7q-eh-009", "explicit_history", "v6rel-anc-zinc-2016-2021", "Did WHO's position on zinc supplementation during pregnancy change between the earlier and operative guidance?"),
    ("v7q-eh-010", "explicit_history", "v6rel-food-marketing-all-ages-2010-2023", "How did the protected age range in WHO food-marketing guidance change from the earlier to the operative version?"),
    ("v7q-eh-011", "explicit_history", "v6rel-food-marketing-government-npm-2010-2023", "Compare the earlier and operative WHO requirements for developing the nutrient-profile model used in food-marketing restrictions."),
    ("v7q-eh-012", "explicit_history", "v6rel-food-marketing-mandatory-2010-2023", "How did WHO's position on voluntary versus mandatory food-marketing restrictions change between versions?"),
    ("v7q-eh-013", "explicit_history", "v6rel-hiv-breastfeeding-duration-2010-2016", "Compare the earlier and operative WHO recommendations on breastfeeding duration for mothers living with HIV."),
    ("v7q-eh-014", "explicit_history", "v6rel-hiv-feeding-support-2010-2016", "How did WHO's recommendation on feeding support for mothers living with HIV change between the earlier and operative guidance?"),
    ("v7q-eh-015", "explicit_history", "v6rel-wasting-a2-2013-2023", "How does the operative WHO recommendation for admitting infants under 6 months with wasting or nutritional oedema differ from the earlier recommendation?"),
    ("v7q-eh-016", "explicit_history", "v6rel-wasting-a3-2013-2023", "Compare WHO's earlier and operative criteria for transferring infants under 6 months from inpatient to outpatient care."),
    ("v7q-eh-017", "explicit_history", "v6rel-wasting-a4-2013-2023", "How did WHO's follow-up recommendation for infants under 6 months with wasting or nutritional oedema change between versions?"),
    ("v7q-eh-018", "explicit_history", "v6rel-wasting-a7-2013-2023", "Compare the earlier and operative WHO recommendations on supplemental milk for infants under 6 months with wasting or nutritional oedema."),
    ("v7q-eh-019", "explicit_history", "v6rel-wasting-b2-2013-2023", "How did WHO's admission criteria for children aged 6-59 months with wasting or nutritional oedema change between versions?"),
    ("v7q-eh-020", "explicit_history", "v6rel-wasting-b3-2013-2023", "Compare WHO's earlier and operative criteria for transferring children aged 6-59 months from inpatient to outpatient care."),

    # Current-only: no request for historical evidence.
    ("v7q-co-001", "current_only", "v6rel-anc-vitamin-d-2016-2020", "What does WHO recommend regarding vitamin D supplementation during pregnancy?"),
    ("v7q-co-002", "current_only", "v6rel-anc-zinc-2016-2021", "What is WHO's recommendation on routine zinc supplementation during pregnancy?"),
    ("v7q-co-003", "current_only", "v6rel-food-marketing-mandatory-2010-2023", "What implementation status does WHO require for policies restricting food marketing to children?"),
    ("v7q-co-004", "current_only", "v6rel-food-marketing-all-ages-2010-2023", "Which child age groups should be protected by WHO-recommended food-marketing restrictions?"),
    ("v7q-co-005", "current_only", "v6rel-food-marketing-government-npm-2010-2023", "Who should lead development of the nutrient-profile model used in food-marketing restrictions?"),
    ("v7q-co-006", "current_only", "v6rel-food-marketing-comprehensive-2010-2023", "What policy scope and design does WHO recommend for restricting food marketing to children?"),
    ("v7q-co-007", "current_only", "v6rel-anc-vitamin-d-2016-2020", "Does WHO recommend routine vitamin D supplementation for all pregnant women?"),
    ("v7q-co-008", "current_only", "v6rel-anc-zinc-2016-2021", "In what context does WHO recommend zinc supplementation during pregnancy?"),
    ("v7q-co-009", "current_only", "v6rel-food-marketing-mandatory-2010-2023", "What implementation status does WHO prescribe for policies restricting food marketing to children?"),
    ("v7q-co-010", "current_only", "v6rel-food-marketing-all-ages-2010-2023", "What age coverage does WHO prescribe for policies restricting food marketing to children?"),

    # Hard negatives: current answer required; the paired older endpoint is unsafe.
    ("v7q-hn-001", "hard_negative_current", "v6rel-wasting-a2-2013-2023", "Under WHO guidance now in force, when should infants under 6 months with wasting or nutritional oedema be admitted for inpatient care?"),
    ("v7q-hn-002", "hard_negative_current", "v6rel-anc-mms-2016-2020", "What is WHO's operative position on multiple micronutrient supplementation during pregnancy?"),
    ("v7q-hn-003", "hard_negative_current", "v6rel-food-marketing-mandatory-2010-2023", "Under operative WHO guidance, what implementation status applies to policies restricting food marketing to children?"),
    ("v7q-hn-004", "hard_negative_current", "v6rel-food-marketing-all-ages-2010-2023", "Under the operative WHO guideline, what ages must food-marketing policies protect?"),
    ("v7q-hn-005", "hard_negative_current", "v6rel-wasting-a3-2013-2023", "Under operative WHO guidance, when can an infant under 6 months be transferred from inpatient to outpatient care?"),
    ("v7q-hn-006", "hard_negative_current", "v6rel-wasting-a4-2013-2023", "What follow-up does operative WHO guidance recommend for infants under 6 months with wasting or nutritional oedema?"),
    ("v7q-hn-007", "hard_negative_current", "v6rel-hb-child-6-23-any-2011-2024", "What haemoglobin cutoff currently defines anaemia in children aged 6-23 months?"),
    ("v7q-hn-008", "hard_negative_current", "v6rel-hb-child-6-23-mild-2011-2024", "What haemoglobin range currently defines mild anaemia in children aged 6-23 months?"),
    ("v7q-hn-009", "hard_negative_current", "v6rel-wasting-b3-2013-2023", "Under operative WHO guidance, when can children aged 6-59 months transfer from inpatient to outpatient care?"),
    ("v7q-hn-010", "hard_negative_current", "v6rel-wasting-b5-2013-2023", "Under operative WHO guidance, when may children aged 6-59 months exit nutritional treatment?"),
]


def rows(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def write(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in records), encoding="utf-8", newline="\n")


def group(endpoint: dict) -> dict:
    return {"source_ref": endpoint["source_ref"], "acceptable_chunk_ids": endpoint["chunk_ids"],
            "group_scoring_rule": "hit_if_any_acceptable_chunk_is_retrieved"}


def main() -> None:
    relation_map = {r["candidate_id"]: r for r in rows(RELATIONS)}
    if len(SLOTS) != 40 or len({x[0] for x in SLOTS}) != 40:
        raise RuntimeError("V7 allocation must contain 40 unique query IDs")
    queries, contracts, allocation = [], [], []
    for qid, stratum, candidate_id, text in SLOTS:
        relation = relation_map[candidate_id]
        if not relation.get("pairing_eligible") or stratum not in relation.get("approved_strata", []):
            raise RuntimeError(f"Ineligible allocation: {qid} {candidate_id} {stratum}")
        old_group, current_group = group(relation["older"]), group(relation["current"])
        required = [old_group, current_group] if stratum == "explicit_history" else [current_group]
        unsafe = [old_group] if stratum == "hard_negative_current" else []
        queries.append({"schema_version": "v7-pilot-query-draft-1", "query_id": qid,
                        "query_text": text, "language": "en", "status": "draft_pending_three_isolated_reviews"})
        contracts.append({"schema_version": "v7-pilot-gold-contract-draft-1", "query_id": qid,
                          "stratum": stratum, "candidate_id": candidate_id,
                          "lineage_id": relation["lineage_id"], "family": relation["family"],
                          "relation_type": relation["relation_type"],
                          "required_evidence_chunk_groups": required,
                          "compatible_evidence_chunk_groups": [],
                          "deprecated_evidence_chunk_groups": unsafe,
                          "forbidden_evidence_chunk_groups": unsafe,
                          "citation_safe_evidence_chunk_groups": required,
                          "review_status": "draft_pending_three_isolated_reviews"})
        allocation.append({"query_id": qid, "stratum": stratum, "candidate_id": candidate_id,
                           "lineage_id": relation["lineage_id"],
                           "holdout_unit": "fresh_query_wording; lineage may have appeared in V6 development"})
    write(OUT / "V7_QUERIES_DRAFT.jsonl", queries)
    write(OUT / "V7_GOLD_CONTRACTS_DRAFT.jsonl", contracts)
    write(OUT / "V7_QUERY_ALLOCATION.jsonl", allocation)
    print(json.dumps({"query_count": len(queries), "strata": {s: sum(x[1] == s for x in SLOTS) for s in ("explicit_history", "current_only", "hard_negative_current")},
                      "unique_lineages": len({x[2] for x in SLOTS}), "retrieval_executed": False}, indent=2))


if __name__ == "__main__":
    main()
