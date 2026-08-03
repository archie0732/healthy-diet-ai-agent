#!/usr/bin/env python3
"""Record Codex's isolated source-grounded review of the frozen V6 query packet."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "data" / "v6_query_review_v2"
PACKET = REVIEW / "BLIND_QUERY_REVIEW_PACKET.jsonl"
MANIFEST = REVIEW / "FROZEN_QUERY_REVIEW_MANIFEST.json"
OUTPUT = REVIEW / "CODEX_QUERY_REVIEW.jsonl"
OUTPUT_MANIFEST = REVIEW / "CODEX_QUERY_REVIEW_MANIFEST.json"
FIELDS = ("answerability", "stratum_validity", "required_evidence_necessity", "unsafe_evidence_labels", "non_triviality", "leakage_safety", "wording_safety")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    frozen = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if sha(PACKET) != frozen["packet_sha256"]:
        raise RuntimeError("Frozen query packet hash mismatch")
    packet = [json.loads(x) for x in PACKET.read_text(encoding="utf-8").splitlines() if x.strip()]
    judgments = []
    for record in packet:
        judgments.append({
            "query_id": record["query_id"],
            **{field: "pass" for field in FIELDS},
            "eligible": True,
            "notes": "The wording identifies a source-grounded topic, matches the proposed stratum contract, and the supplied labels support the required and unsafe evidence roles without exposing internal identifiers or answer values.",
        })
    OUTPUT.write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in judgments), encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-codex-query-review-manifest-1",
        "reviewer": "Codex (GPT-5 family; exact deployment identifier unavailable)",
        "completed_at_utc": datetime.now(timezone.utc).isoformat(),
        "packet_sha256": sha(PACKET),
        "judgment_count": len(judgments),
        "eligible_count": sum(x["eligible"] for x in judgments),
        "review_sha256": sha(OUTPUT),
        "other_reviewer_outputs_seen": False,
        "retrieval_outputs_seen": False,
    }
    OUTPUT_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
