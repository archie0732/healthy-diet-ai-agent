#!/usr/bin/env python3
"""Build four self-contained plain-text packets for isolated V7 review."""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "v7_pilot"
RELATIONS = ROOT / "data" / "v6_repair_diagnostic" / "V6R_RUNTIME_RELATIONS.jsonl"
STRUCTURED = DATA / "V7_STRUCTURED_EVIDENCE_DESCRIPTIONS.json"
OUT = DATA / "review_packets"
VISUAL_LEDGER = ROOT / "data" / "v6_source_mining" / "V6_VISUAL_REVIEW_LEDGER.jsonl"


def rows(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def ascii_clean(text: str) -> str:
    replacements = {"\u2264": "<=", "\u2265": ">=", "\u2013": "-", "\u2014": "-", "\u2212": "-",
                    "\u00d7": "x", "\u00a0": " ", "\u2019": "'", "\u201c": '"', "\u201d": '"'}
    for old, new in replacements.items():
        text = text.replace(old, new)
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def main() -> None:
    queries = rows(DATA / "V7_QUERIES_DRAFT.jsonl")
    contracts = {x["query_id"]: x for x in rows(DATA / "V7_GOLD_CONTRACTS_DRAFT.jsonl")}
    relations = {x["candidate_id"]: x for x in rows(RELATIONS)}
    structured = json.loads(STRUCTURED.read_text(encoding="utf-8"))
    visual_reviews = {x["candidate_id"]: x for x in rows(VISUAL_LEDGER)}
    records = []
    for query in queries:
        contract = contracts[query["query_id"]]
        relation = relations[contract["candidate_id"]]
        descriptions = structured[contract["candidate_id"]]
        def evidence(label: str) -> list[dict]:
            answer = []
            for group in contract[label]:
                ref = group["source_ref"]
                role = "older_excerpt" if ref["document_id"] == relation["older"]["source_ref"]["document_id"] else "current_excerpt"
                description_role = "older" if role == "older_excerpt" else "current"
                answer.append({"source_ref": ref,
                               "structured_text_description": ascii_clean(descriptions[description_role]),
                               "description_provenance": "human-readable transcription of the cited source table or recommendation; source pages visually verified before query construction"})
            return answer
        records.append({"query_id": query["query_id"], "query_text": ascii_clean(query["query_text"]),
                        "proposed_stratum": contract["stratum"], "candidate_id": contract["candidate_id"],
                        "lineage_id": contract["lineage_id"], "relation_type": contract["relation_type"],
                        "required_evidence": evidence("required_evidence_chunk_groups"),
                        "deprecated_or_forbidden_evidence": evidence("forbidden_evidence_chunk_groups"),
                        "structured_relation_support": ascii_clean(relation.get("relation_evidence", {}).get("basis", "")),
                        "visual_source_verification": ascii_clean(visual_reviews[contract["candidate_id"]]["note"]),
                        "review_packet_revision": "v3_structured_text_descriptions_no_flattened_tables"})
    OUT.mkdir(parents=True, exist_ok=True)
    for i in range(4):
        batch = records[i * 10:(i + 1) * 10]
        text = "V7 ISOLATED QUERY-CONTRACT REVIEW PACKET\n\n" + "\n\n".join(
            f"RECORD {j + 1}\n" + json.dumps(record, ensure_ascii=False, indent=2)
            for j, record in enumerate(batch)
        ) + "\n"
        (OUT / f"V7_REVIEW_BATCH_{i + 1}.txt").write_text(text, encoding="utf-8", newline="\n")
    combined = "V7 ISOLATED QUERY-CONTRACT REVIEW PACKET\n\n" + "\n\n".join(
        f"RECORD {j + 1}\n" + json.dumps(record, ensure_ascii=False, indent=2)
        for j, record in enumerate(records)
    ) + "\n"
    (OUT / "V7_REVIEW_ALL_40.txt").write_text(combined, encoding="utf-8", newline="\n")
    delta = "V7 ISOLATED QUERY-CONTRACT DELTA REVIEW\n\nRECORD 1\n" + json.dumps(records[0], ensure_ascii=False, indent=2) + "\n"
    (OUT / "V7_REVIEW_DELTA_EH001.txt").write_text(delta, encoding="utf-8", newline="\n")
    leakage_ids = {"v7q-co-008", "v7q-co-009", "v7q-co-010", "v7q-hn-003"}
    leakage_records = [record for record in records if record["query_id"] in leakage_ids]
    leakage_delta = "V7 ISOLATED QUERY-CONTRACT DELTA REVIEW\n\n" + "\n\n".join(
        f"RECORD {j + 1}\n" + json.dumps(record, ensure_ascii=False, indent=2)
        for j, record in enumerate(leakage_records)
    ) + "\n"
    (OUT / "V7_REVIEW_DELTA_LEAKAGE_4.txt").write_text(leakage_delta, encoding="utf-8", newline="\n")
    hard_negative_ids = {"v7q-hn-007", "v7q-hn-008"}
    hard_negative_records = [record for record in records if record["query_id"] in hard_negative_ids]
    hard_negative_delta = "V7 ISOLATED QUERY-CONTRACT DELTA REVIEW\n\n" + "\n\n".join(
        f"RECORD {j + 1}\n" + json.dumps(record, ensure_ascii=False, indent=2)
        for j, record in enumerate(hard_negative_records)
    ) + "\n"
    (OUT / "V7_REVIEW_DELTA_HARD_NEGATIVE_2.txt").write_text(hard_negative_delta, encoding="utf-8", newline="\n")
    print(json.dumps({"packet_count": 4, "records_per_packet": 10, "combined_packet_records": 40,
                      "total_records": len(records)}, indent=2))


if __name__ == "__main__":
    main()
