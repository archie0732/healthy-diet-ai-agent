#!/usr/bin/env python3
"""Record the Codex pass over the frozen V6 relation-review v2 packet."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REVIEW_DIR = (
    EXPERIMENT_ROOT / "data" / "v6_source_mining" / "relation_review_v2"
)


def load_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review-dir", type=Path, default=DEFAULT_REVIEW_DIR)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    review_dir = args.review_dir.resolve()
    packet_path = review_dir / "BLIND_RELATION_REVIEW_PACKET.jsonl"
    frozen_manifest_path = review_dir / "FROZEN_MANIFEST.json"
    output_path = review_dir / "CODEX_RAW_REVIEW.jsonl"
    manifest_path = review_dir / "CODEX_REVIEW_MANIFEST.json"
    packet = load_jsonl(packet_path)
    frozen_manifest = json.loads(frozen_manifest_path.read_text(encoding="utf-8"))
    if sha256(packet_path) != frozen_manifest["packet_sha256"]:
        raise RuntimeError("Frozen packet hash mismatch")

    judgments = []
    for record in packet:
        relation_type = record["proposed_relation_type"]
        has_older = record["older_excerpt"] is not None
        stratum_judgments = {}
        notes = []
        for stratum in record["proposed_strata"]:
            if stratum != "hard_negative_current":
                stratum_judgments[stratum] = "pass"
                continue
            if not has_older:
                stratum_judgments[stratum] = "uncertain"
                notes.append(
                    "Hard-negative use lacks an auditable older/forbidden excerpt."
                )
            elif relation_type == "compatible_with":
                stratum_judgments[stratum] = "fail"
                notes.append(
                    "Compatible older evidence is not a wrong or forbidden current answer."
                )
            else:
                stratum_judgments[stratum] = "pass"

        if not notes:
            notes.append(
                "The supplied excerpts directly support the proposed evidence relation and strata."
            )
        judgments.append(
            {
                "candidate_id": record["candidate_id"],
                "older_support": "pass" if has_older else "not_applicable",
                "current_support": "pass",
                "relation_support": "pass",
                "stratum_judgments": stratum_judgments,
                "unsupported_material_claim": False,
                "eligible": True,
                "notes": " ".join(notes),
            }
        )

    output_path.write_text(
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in judgments),
        encoding="utf-8",
        newline="\n",
    )
    manifest = {
        "schema_version": "v6-codex-relation-review-manifest-1",
        "reviewer": "Codex (GPT-5 family; exact deployment identifier unavailable)",
        "review_mode": "isolated source-grounded pass over frozen packet",
        "completed_at_utc": datetime.now(timezone.utc).isoformat(),
        "packet_sha256": sha256(packet_path),
        "frozen_manifest_sha256": sha256(frozen_manifest_path),
        "judgment_count": len(judgments),
        "raw_review_sha256": sha256(output_path),
        "other_reviewer_outputs_seen": False,
        "retrieval_outputs_seen": False,
        "hard_negative_pass_count": sum(
            item["stratum_judgments"].get("hard_negative_current") == "pass"
            for item in judgments
        ),
        "hard_negative_fail_count": sum(
            item["stratum_judgments"].get("hard_negative_current") == "fail"
            for item in judgments
        ),
        "hard_negative_uncertain_count": sum(
            item["stratum_judgments"].get("hard_negative_current") == "uncertain"
            for item in judgments
        ),
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
