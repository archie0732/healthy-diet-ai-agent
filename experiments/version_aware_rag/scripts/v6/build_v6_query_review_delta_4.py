#!/usr/bin/env python3
"""Build the direct TXT handoff for four answer-bearing relation-page corrections."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
FULL_PACKET = DATA / "v6_query_review_v3" / "BLIND_QUERY_REVIEW_PACKET.jsonl"
OUT = DATA / "v6_query_review_delta_4"
IMPACTED = {"v6q-eh-009", "v6q-eh-010", "v6q-eh-013", "v6q-eh-014"}

PROMPT = """You are performing an isolated, source-grounded review of four revised V6 retrieval query contracts.

Please refer only to the attached material. Do not browse the web, inspect any repository, inspect router rules or retrieval results, infer system identity or boost values, or use another reviewer's output.

For every record, independently judge the following fields as \"pass\", \"fail\", or \"uncertain\":

- answerability
- stratum_validity
- required_evidence_necessity
- unsafe_evidence_labels
- non_triviality
- leakage_safety
- wording_safety

For explicit_history, the wording must request a cross-version comparison and all labeled required evidence must contribute answer-bearing information. A rationale or relation excerpt may be required when it independently states substantive changes, retained criteria, incorporated recommendations, or population expansion rather than merely establishing lineage.

Set \"eligible\" to true only when all seven judgments are \"pass\". Do not repair a record, rewrite a query, or infer missing clinical applicability.

Return exactly four JSON objects, one object per line and in the same order as the attached material. Each object must contain exactly these fields:

query_id, answerability, stratum_validity, required_evidence_necessity, unsafe_evidence_labels, non_triviality, leakage_safety, wording_safety, eligible, notes

Do not use Markdown fences. Do not add introductions, headings, summaries, or any other prose. After the four JSON objects, add exactly one final line beginning with \"MODEL_METADATA:\" followed by the exact model/version and the session or run identifier if visible.
"""


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    packet = [json.loads(line) for line in FULL_PACKET.read_text(encoding="utf-8").splitlines() if line.strip()]
    delta = [record for record in packet if record["query_id"] in IMPACTED]
    if len(delta) != 4 or {record["query_id"] for record in delta} != IMPACTED:
        raise RuntimeError("Expected the four frozen corrected contracts")
    OUT.mkdir(parents=True, exist_ok=True)
    attachment = OUT / "QUERY_REVIEW_ATTACHMENT.txt"
    prompt = OUT / "QUERY_REVIEW_PROMPT.txt"
    attachment.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in delta), encoding="utf-8", newline="\n")
    prompt.write_text(PROMPT, encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-query-review-delta-manifest-3",
        "record_count": len(delta),
        "impacted_query_ids": [record["query_id"] for record in delta],
        "full_packet_sha256": sha(FULL_PACKET),
        "attachment_sha256": sha(attachment),
        "prompt_sha256": sha(prompt),
        "prompt_mentions_filename_or_path": False,
        "fresh_retrieval_allowed": False,
    }
    (OUT / "MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
