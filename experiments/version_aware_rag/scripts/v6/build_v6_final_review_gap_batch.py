#!/usr/bin/env python3
"""Build one final isolated-review batch for contracts with only two matching passes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
FINAL_PACKET = DATA / "v6_query_review_v3" / "BLIND_QUERY_REVIEW_PACKET.jsonl"
GAPS = DATA / "v6_confirmatory" / "V6_FINAL_REVIEW_GAPS.jsonl"
OUT = DATA / "v6_query_review_final_gap_33"

PROMPT = """You are performing an isolated, source-grounded review of 33 V6 retrieval query contracts.

Use only the review material included below. Do not browse the web, inspect any repository, inspect router rules or retrieval results, infer system identity or boost values, or use another reviewer's output.

For every record, independently judge the following fields as \"pass\", \"fail\", or \"uncertain\":

- answerability
- stratum_validity
- required_evidence_necessity
- unsafe_evidence_labels
- non_triviality
- leakage_safety
- wording_safety

Stratum definitions:

- explicit_history: The wording explicitly requests an earlier rule or a cross-version comparison, and all labeled required evidence contributes answer-bearing information. A rationale may be required when it independently states substantive changes, retained criteria, incorporated recommendations, or population expansion.
- current_only: Only operative evidence is required. Displaced older evidence may be deprecated, but it is not required.
- hard_negative_current: Operative evidence is required, and the labeled older evidence is a plausible but incorrect answer for a current-only query.

Set \"eligible\" to true only when all seven judgments are \"pass\". Do not repair a record, rewrite a query, or infer missing clinical applicability.

Return exactly 33 JSON objects, one object per line and in the same order as the review material. Each object must contain exactly these fields:

query_id, answerability, stratum_validity, required_evidence_necessity, unsafe_evidence_labels, non_triviality, leakage_safety, wording_safety, eligible, notes

Do not use Markdown fences. Do not add introductions, headings, summaries, or any other prose. After the 33 JSON objects, add exactly one final line beginning with \"MODEL_METADATA:\" followed by the exact model/version and the session or run identifier if visible.
"""


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    gap_ids = [json.loads(line)["query_id"] for line in GAPS.read_text(encoding="utf-8").splitlines() if line.strip()]
    packet = [json.loads(line) for line in FINAL_PACKET.read_text(encoding="utf-8").splitlines() if line.strip()]
    gap_set = set(gap_ids)
    records = [record for record in packet if record["query_id"] in gap_set]
    if len(gap_ids) != 33 or len(records) != 33 or {record["query_id"] for record in records} != gap_set:
        raise RuntimeError("Coverage audit must identify exactly 33 final-review gaps")

    OUT.mkdir(parents=True, exist_ok=True)
    attachment = OUT / "QUERY_REVIEW_ATTACHMENT.txt"
    prompt = OUT / "QUERY_REVIEW_PROMPT.txt"
    single = OUT / "SINGLE_REVIEW_INPUT.txt"
    attachment.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8", newline="\n")
    prompt.write_text(PROMPT, encoding="utf-8", newline="\n")
    single.write_text(
        PROMPT.rstrip() + "\n\n--- BEGIN REVIEW MATERIAL ---\n"
        + attachment.read_text(encoding="utf-8").strip()
        + "\n--- END REVIEW MATERIAL ---\n",
        encoding="utf-8",
        newline="\n",
    )
    manifest = {
        "schema_version": "v6-final-review-gap-manifest-1",
        "record_count": len(records),
        "query_ids": [record["query_id"] for record in records],
        "final_packet_sha256": sha(FINAL_PACKET),
        "coverage_gap_sha256": sha(GAPS),
        "attachment_sha256": sha(attachment),
        "prompt_sha256": sha(prompt),
        "single_input_sha256": sha(single),
        "fresh_retrieval_allowed": False,
    }
    (OUT / "MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
