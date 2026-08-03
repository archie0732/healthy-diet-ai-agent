#!/usr/bin/env python3
"""Build the 25-record corrected Gemini query-review delta."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CONFIRM = DATA / "v6_confirmatory"
MINING = DATA / "v6_source_mining"
OUT = DATA / "v6_query_review_delta_25"
FAILED_IDS = {
    "v6q-eh-001", "v6q-eh-002", "v6q-eh-003", "v6q-eh-007", "v6q-eh-011", "v6q-eh-012",
    "v6q-eh-019", "v6q-eh-020", "v6q-eh-021", "v6q-eh-022", "v6q-eh-023", "v6q-eh-024",
    "v6q-cm-002", "v6q-cm-003", "v6q-cm-004", "v6q-cm-005", "v6q-cm-006", "v6q-cm-008",
    "v6q-cm-009", "v6q-cm-019", "v6q-cm-020", "v6q-cm-021", "v6q-cm-022", "v6q-cm-023",
    "v6q-cm-024",
}

PROMPT = """You are performing an isolated source-grounded re-review of 25 corrected V6 query contracts. The first Gemini pass rejected only these records because the same PDF page appeared twice in `required_evidence`. That serialization defect has been corrected by deduplicating evidence at `(document_id, pdf_page_number)` level. Query wording and source text are otherwise unchanged.

Use only `GEMINI_QUERY_REVIEW_DELTA_25.jsonl`. Do not inspect the repository, prior reviewer output, router rules, retrieval results, boost values, or the web.

For every record independently judge these fields as `pass`, `fail`, or `uncertain`:

- `answerability`
- `stratum_validity`
- `required_evidence_necessity`
- `unsafe_evidence_labels`
- `non_triviality`
- `leakage_safety`
- `wording_safety`

`explicit_history` must explicitly request an earlier rule or cross-version comparison and require the supplied distinct cross-version evidence. `conditional_merge` must avoid explicit year/history/version wording but genuinely need the supplied distinct evidence to state the complete rule.

Set `eligible` to true only if all seven judgments pass. Return exactly 25 JSON objects, one per line and in input order, with exactly these fields: `query_id`, the seven judgment fields above, `eligible`, and `notes`. Do not use Markdown fences or add prose. After the 25 JSON objects, add one line beginning `MODEL_METADATA:` with the exact Gemini model/version and Antigravity run ID.
"""


def load(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    queries = {x["query_id"]: x for x in load(CONFIRM / "V6_QUERY_DRAFTS.jsonl")}
    contracts = {x["query_id"]: x for x in load(CONFIRM / "V6_GOLD_CONTRACT_DRAFTS.jsonl")}
    pages = {(x["document_id"], x["pdf_page_number"]): x["text"] for x in load(MINING / "V6_PDF_PAGE_INDEX.jsonl")}
    ordered_ids = [x["query_id"] for x in load(CONFIRM / "V6_QUERY_DRAFTS.jsonl") if x["query_id"] in FAILED_IDS]
    if len(ordered_ids) != 25:
        raise RuntimeError(f"Expected 25 delta IDs, found {len(ordered_ids)}")
    packet = []
    for query_id in ordered_ids:
        query = queries[query_id]
        contract = contracts[query_id]
        required = contract["required_evidence_refs"]
        page_keys = [(ref["document_id"], ref["pdf_page_number"]) for ref in required]
        if len(page_keys) != len(set(page_keys)):
            raise RuntimeError(f"Duplicate required page remains in {query_id}")
        packet.append({
            "schema_version": "v6-query-review-delta-1",
            "query_id": query_id,
            "query_text": query["query_text"],
            "proposed_stratum": contract["stratum"],
            "family": contract["family"],
            "relation_type": contract["relation_type"],
            "construction_basis": contract["construction_basis"],
            "required_evidence": [
                {**ref, "page_text": pages[(ref["document_id"], ref["pdf_page_number"])]}
                for ref in required
            ],
            "forbidden_evidence": contract["forbidden_evidence_refs"],
        })
    OUT.mkdir(parents=True, exist_ok=True)
    packet_path = OUT / "GEMINI_QUERY_REVIEW_DELTA_25.jsonl"
    prompt_path = OUT / "GEMINI_QUERY_REVIEW_DELTA_PROMPT.md"
    packet_path.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in packet), encoding="utf-8", newline="\n")
    prompt_path.write_text(PROMPT, encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-query-review-delta-manifest-1",
        "record_count": 25,
        "packet_sha256": sha(packet_path),
        "prompt_sha256": sha(prompt_path),
        "query_sha256": sha(CONFIRM / "V6_QUERY_DRAFTS.jsonl"),
        "gold_sha256": sha(CONFIRM / "V6_GOLD_CONTRACT_DRAFTS.jsonl"),
        "correction": "Deduplicate required evidence by document_id and pdf_page_number.",
    }
    (OUT / "MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
