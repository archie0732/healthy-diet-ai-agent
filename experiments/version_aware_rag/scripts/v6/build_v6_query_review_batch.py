#!/usr/bin/env python3
"""Freeze the router-blind V6 query-contract review packet."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CONFIRM = DATA / "v6_confirmatory"
MINING = DATA / "v6_source_mining"
OUT = DATA / "v6_query_review_v3"
QUERY = CONFIRM / "V6_QUERY_DRAFTS.jsonl"
GOLD = CONFIRM / "V6_GOLD_CONTRACT_DRAFTS.jsonl"
AUDIT = CONFIRM / "V6_QUERY_DRAFT_AUDIT.json"
PAGE_INDEX = MINING / "V6_PDF_PAGE_INDEX.jsonl"

PROMPT = """# V6 blind query-contract review — frozen instructions

Review every proposed retrieval query using only its supplied source excerpts and proposed page-level gold contract. Do not browse, inspect router rules, retrieval results, system identity, boost values, or another reviewer's output.

For every record judge `answerability`, `stratum_validity`, `required_evidence_necessity`, `unsafe_evidence_labels`, `non_triviality`, `leakage_safety`, and `wording_safety` as `pass`, `fail`, or `uncertain`.

Strata:
- `explicit_history`: the wording explicitly requests an earlier rule or cross-version comparison and the labeled cross-version evidence is necessary.
- `current_only`: only operative evidence is required; displaced older evidence may be deprecated but is not required.
- `hard_negative_current`: operative evidence is required and the labeled older evidence is a plausible but wrong current answer.

`eligible` is true only if all seven judgments pass. Do not repair the record or infer missing clinical applicability. Return exactly one JSON object per record in input order, followed by one `MODEL_METADATA:` line. No Markdown fences or other prose.
"""

SCHEMA = {
    "required": ["query_id", "answerability", "stratum_validity", "required_evidence_necessity", "unsafe_evidence_labels", "non_triviality", "leakage_safety", "wording_safety", "eligible", "notes"],
    "judgment_values": ["pass", "fail", "uncertain"],
    "additional_fields_allowed": False,
}


def load(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    if audit["status"] != "structural_pass":
        raise RuntimeError("Query draft structural gate has not passed")
    queries = load(QUERY)
    gold = load(GOLD)
    pages = {(x["document_id"], x["pdf_page_number"]): x["text"] for x in load(PAGE_INDEX)}
    packet = []
    for query, contract in zip(queries, gold, strict=True):
        refs = []
        for field in ("required_evidence_refs", "compatible_evidence_refs", "deprecated_evidence_refs", "forbidden_evidence_refs"):
            for ref in contract[field]:
                item = {**ref, "proposed_label": field, "page_text": pages[(ref["document_id"], ref["pdf_page_number"])]}
                if item not in refs:
                    refs.append(item)
        relation_ref = contract["relation_evidence_ref"]
        relation_key = (relation_ref["document_id"], relation_ref["pdf_page_number"])
        represented_pages = {(ref["document_id"], ref["pdf_page_number"]) for ref in refs}
        if relation_key not in represented_pages:
            refs.append({
                **relation_ref,
                "proposed_label": "relation_evidence_ref",
                "page_text": pages[relation_key],
            })
        packet.append({
            "schema_version": "v6-query-review-packet-1",
            "query_id": query["query_id"],
            "query_text": query["query_text"],
            "proposed_stratum": contract["stratum"],
            "family": contract["family"],
            "relation_type": contract["relation_type"],
            "construction_basis": contract["construction_basis"],
            "evidence_excerpts": refs,
        })
    OUT.mkdir(parents=True, exist_ok=True)
    packet_path = OUT / "BLIND_QUERY_REVIEW_PACKET.jsonl"
    prompt_path = OUT / "FROZEN_QUERY_REVIEW_PROMPT.md"
    schema_path = OUT / "QUERY_REVIEW_OUTPUT_SCHEMA.json"
    packet_path.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in packet), encoding="utf-8", newline="\n")
    prompt_path.write_text(PROMPT, encoding="utf-8", newline="\n")
    schema_path.write_text(json.dumps(SCHEMA, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-query-review-manifest-1",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "record_count": len(packet),
        "query_sha256": sha(QUERY),
        "gold_sha256": sha(GOLD),
        "packet_sha256": sha(packet_path),
        "prompt_sha256": sha(prompt_path),
        "schema_sha256": sha(schema_path),
        "prohibited_inputs": ["router rules", "retrieval outputs", "boost values", "system identity", "other reviewer outputs"],
    }
    (OUT / "FROZEN_QUERY_REVIEW_MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
