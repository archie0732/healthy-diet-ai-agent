#!/usr/bin/env python3
"""Record the construction audit of non-exact V6 page-to-chunk mappings."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "v6_confirmatory"
LEDGER = DATA / "V6_PAGE_TO_CHUNK_RESOLUTION_LEDGER.jsonl"
OUTPUT = DATA / "V6_MEDIUM_RESOLUTION_CODEX_AUDIT.jsonl"
MANIFEST = DATA / "V6_MEDIUM_RESOLUTION_CODEX_AUDIT_MANIFEST.json"

# These are the unique medium-confidence mappings visually inspected against
# the selected exact chunk text on 2026-08-01. Repeated citation-safe mappings
# use the same query/ref/chunk and are intentionally deduplicated here.
APPROVED = {
    ("v6q-eh-009", "who_wasting_nutritional_oedema_2023", 56, None): "Rationale chunk states the 2013 update, population expansion, and added in-depth assessment pathway.",
    ("v6q-eh-010", "who_wasting_nutritional_oedema_2023", 61, None): "Rationale chunk states the transfer update, retained strong status, and harm rationale.",
    ("v6q-eh-013", "who_wasting_nutritional_oedema_2023", 81, None): "Rationale chunk states incorporation of recommendations 1.3/2.1 and the added assessment pathway.",
    ("v6q-eh-014", "who_wasting_nutritional_oedema_2023", 86, None): "Rationale chunk states the transfer update and safeguards against premature transfer.",
    ("v6q-eh-016", "who_europe_infant_food_nppm_2022", 19, "protein source named FIRST"): "Selected table window contains category 4.4 and its full threshold row.",
    ("v6q-eh-017", "who_europe_infant_food_nppm_2022", 19, "protein source NOT named first"): "Selected table window contains category 4.3 and its full threshold row.",
    ("v6q-eh-021", "who_europe_nutrient_profile_2015", 10, "Butter other fats and oils"): "Selected annex window contains category 10, examples, and thresholds.",
    ("v6q-eh-029", "who_europe_infant_food_nppm_2022", 19, "Protein source is ONLY named food"): "Selected table window contains category 4.5 and its full threshold row.",
    ("v6q-co-020", "who_europe_nutrient_profile_2015", 10, "Cakes and sweet biscuits"): "Selected annex window contains category 2 and its not-permitted rule.",
    ("v6q-hn-017", "who_europe_infant_food_nppm_2022", 19, "Protein source is ONLY named food"): "Selected table window contains category 4.5 and its full threshold row.",
    ("v6q-hn-019", "who_europe_nutrient_profile_2015", 10, "Cakes and sweet biscuits"): "Selected annex window contains category 2 and its not-permitted rule.",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    records = [json.loads(line) for line in LEDGER.read_text(encoding="utf-8").splitlines() if line.strip()]
    medium: dict[tuple, dict] = {}
    for record in records:
        if record["resolution_confidence"] != "medium":
            continue
        ref = record["source_ref"]
        key = (record["query_id"], ref["document_id"], ref["pdf_page_number"], ref.get("recommendation_id"))
        prior = medium.get(key)
        if prior and prior["selected_chunk_id"] != record["selected_chunk_id"]:
            raise RuntimeError(f"Repeated mapping resolves to different chunks: {key}")
        medium[key] = record
    if set(medium) != set(APPROVED):
        missing = sorted(set(medium) - set(APPROVED), key=str)
        stale = sorted(set(APPROVED) - set(medium), key=str)
        raise RuntimeError(f"Medium-resolution set changed; missing approvals={missing}, stale approvals={stale}")

    output = []
    for key in sorted(medium, key=str):
        record = medium[key]
        output.append({
            "schema_version": "v6-medium-resolution-codex-audit-1",
            "query_id": record["query_id"],
            "source_ref": record["source_ref"],
            "selected_chunk_id": record["selected_chunk_id"],
            "judgment": "pass",
            "notes": APPROVED[key],
        })
    OUTPUT.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in output), encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-medium-resolution-codex-audit-manifest-1",
        "audited_at_utc": datetime.now(timezone.utc).isoformat(),
        "reviewer": "Codex construction audit; not a clinician",
        "input_resolution_ledger_sha256": sha(LEDGER),
        "unique_medium_mapping_count": len(output),
        "pass_count": len(output),
        "fail_count": 0,
        "audit_sha256": sha(OUTPUT),
        "fresh_retrieval_allowed": False,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
