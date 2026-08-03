#!/usr/bin/env python3
"""Build the direct TXT handoff for the 23 contracts revised after GPT-5.6 adjudication."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CONFIRM = DATA / "v6_confirmatory"
ARCHIVE = CONFIRM / "archive_pre_gpt56_adjudication"
FULL_PACKET = DATA / "v6_query_review_v3" / "BLIND_QUERY_REVIEW_PACKET.jsonl"
OUT = DATA / "v6_query_review_delta_23"

PROMPT = """You are performing an isolated, source-grounded review of 23 revised V6 retrieval query contracts.

Please refer only to the attached material. Do not browse the web, inspect any repository, inspect router rules or retrieval results, infer system identity or boost values, or use another reviewer's output.

For every record, independently judge the following fields as \"pass\", \"fail\", or \"uncertain\":

- answerability
- stratum_validity
- required_evidence_necessity
- unsafe_evidence_labels
- non_triviality
- leakage_safety
- wording_safety

Use these stratum definitions:

- explicit_history: The wording explicitly requests an earlier rule or a cross-version comparison, and the labeled answer-bearing evidence from both versions is necessary. A separately labeled relation-evidence excerpt may establish lineage but is not required retrieval evidence unless it independently contains an answer-bearing claim.
- current_only: Only operative evidence is required. Displaced older evidence may be deprecated, but it is not required.
- hard_negative_current: Operative evidence is required, and the labeled older evidence is a plausible but incorrect answer for a current-only query.

Set \"eligible\" to true only when all seven judgments are \"pass\". Do not repair a record, rewrite a query, or infer missing clinical applicability.

Return exactly 23 JSON objects, one object per line and in the same order as the attached material. Each object must contain exactly these fields:

query_id, answerability, stratum_validity, required_evidence_necessity, unsafe_evidence_labels, non_triviality, leakage_safety, wording_safety, eligible, notes

Do not use Markdown fences. Do not add introductions, headings, summaries, or any other prose. After the 23 JSON objects, add exactly one final line beginning with \"MODEL_METADATA:\" followed by the exact model/version and the session or run identifier if visible.
"""


def load(path: Path) -> dict[str, dict]:
    return {record["query_id"]: record for record in (json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip())}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    old_queries = load(ARCHIVE / "V6_QUERY_DRAFTS.jsonl")
    old_gold = load(ARCHIVE / "V6_GOLD_CONTRACT_DRAFTS.jsonl")
    new_queries = load(CONFIRM / "V6_QUERY_DRAFTS.jsonl")
    new_gold = load(CONFIRM / "V6_GOLD_CONTRACT_DRAFTS.jsonl")
    impacted = {
        query_id for query_id in new_queries
        if old_queries[query_id] != new_queries[query_id] or old_gold[query_id] != new_gold[query_id]
    }
    packet = [json.loads(line) for line in FULL_PACKET.read_text(encoding="utf-8").splitlines() if line.strip()]
    delta = [record for record in packet if record["query_id"] in impacted]
    if len(impacted) != 23 or len(delta) != 23 or {record["query_id"] for record in delta} != impacted:
        raise RuntimeError("Expected exactly 23 revised contracts")

    OUT.mkdir(parents=True, exist_ok=True)
    attachment = OUT / "QUERY_REVIEW_ATTACHMENT.txt"
    prompt = OUT / "QUERY_REVIEW_PROMPT.txt"
    attachment.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in delta), encoding="utf-8", newline="\n")
    prompt.write_text(PROMPT, encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-query-review-delta-manifest-2",
        "record_count": len(delta),
        "impacted_query_ids": [record["query_id"] for record in delta],
        "query_text_change_count": sum(old_queries[i] != new_queries[i] for i in impacted),
        "gold_contract_change_count": sum(old_gold[i] != new_gold[i] for i in impacted),
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
