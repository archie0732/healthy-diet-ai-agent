#!/usr/bin/env python3
"""Build a router-blind, source-grounded V6 relation-review batch."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
MINING_DIR = EXPERIMENT_ROOT / "data" / "v6_source_mining"
CANDIDATE_PATH = MINING_DIR / "V6_RELATION_CANDIDATES.jsonl"
PAGE_INDEX_PATH = MINING_DIR / "V6_PDF_PAGE_INDEX.jsonl"
AUDIT_PATH = MINING_DIR / "V6_RELATION_CANDIDATE_AUDIT.json"
DEFAULT_OUTPUT_DIR = MINING_DIR / "relation_review_v2"


PROMPT = """# V6 blind relation review — frozen instructions

You are reviewing proposed evidence relationships for a retrieval-stage benchmark. Work only from the supplied source excerpts. Do not infer facts from general knowledge, search the web, inspect retrieval results, or guess how a router works.

For every packet record, independently decide:

1. whether the older excerpt supports the identified older recommendation or category;
2. whether the current excerpt supports the identified current recommendation or category;
3. whether the relation-evidence excerpt directly supports the proposed relation type;
4. whether each proposed query stratum is semantically usable:
   - `explicit_history`: a query can explicitly request the older rule or an old-versus-current comparison;
   - `conditional_merge`: a query without explicit year/history wording can genuinely require both versions to answer a change/comparison need;
   - `current_only`: a query can ask only for the current rule without needing old evidence;
   - `hard_negative_current`: an identified older or otherwise forbidden evidence item would be a plausible but wrong/unsafe answer to a current-only query; this must be `fail` or `uncertain` when the packet supplies no auditable negative evidence;
   - `compatible_history`: both versions remain substantively compatible and retaining both can be justified.
5. whether the candidate is precise enough to construct source-grounded questions without inventing applicability, clinical, or policy claims.

Use `pass`, `fail`, or `uncertain` for the evidence/relation judgments and every proposed stratum. Use `not_applicable` for `older_support` only when `older_excerpt` is null and the proposed relation is `current_only`. A candidate is `eligible` only when current and relation support are `pass`, older support is `pass` or legitimately `not_applicable`, at least one proposed stratum is `pass`, and no unsupported material claim is required. Do not repair records. Explain failures or uncertainty concisely.

Return exactly one JSON object per input record, in the same order, conforming to `REVIEW_OUTPUT_SCHEMA.json`. Do not include Markdown fences or commentary outside JSONL.
"""


SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "V6 isolated AI relation review judgment",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "candidate_id",
        "older_support",
        "current_support",
        "relation_support",
        "stratum_judgments",
        "unsupported_material_claim",
        "eligible",
        "notes",
    ],
    "properties": {
        "candidate_id": {"type": "string"},
        "older_support": {
            "enum": ["pass", "fail", "uncertain", "not_applicable"]
        },
        "current_support": {"enum": ["pass", "fail", "uncertain"]},
        "relation_support": {"enum": ["pass", "fail", "uncertain"]},
        "stratum_judgments": {
            "type": "object",
            "additionalProperties": {"enum": ["pass", "fail", "uncertain"]},
        },
        "unsupported_material_claim": {"type": "boolean"},
        "eligible": {"type": "boolean"},
        "notes": {"type": "string"},
    },
}


def load_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def excerpt(
    page_lookup: dict[tuple[str, int], dict], reference: dict | None
) -> dict | None:
    if reference is None:
        return None
    key = (reference["document_id"], reference["pdf_page_number"])
    page = page_lookup[key]
    return {
        "document_id": reference["document_id"],
        "pdf_page_number": reference["pdf_page_number"],
        "recommendation_id": reference.get("recommendation_id"),
        "page_text": page["text"],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Review-batch directory (default preserves the original v2 path).",
    )
    parser.add_argument(
        "--candidate-id-prefix",
        help="Freeze only candidates whose candidate_id starts with this prefix.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    candidates = load_jsonl(CANDIDATE_PATH)
    if args.candidate_id_prefix:
        candidates = [
            record
            for record in candidates
            if record["candidate_id"].startswith(args.candidate_id_prefix)
        ]
        if not candidates:
            raise RuntimeError("Candidate filter selected zero records")
    pages = load_jsonl(PAGE_INDEX_PATH)
    audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    if not audit["gate_pass"]:
        raise RuntimeError("Relation candidate structural/capacity gate has not passed")

    page_lookup = {
        (record["document_id"], record["pdf_page_number"]): record
        for record in pages
    }
    packet = []
    for candidate in candidates:
        packet.append(
            {
                "schema_version": "v6-blind-relation-review-packet-1",
                "candidate_id": candidate["candidate_id"],
                "family": candidate["family"],
                "proposed_relation_type": candidate["relation_type"],
                "proposed_relation_facets": candidate["relation_facets"],
                "proposed_strata": candidate["candidate_strata"],
                "older_excerpt": excerpt(page_lookup, candidate["older"]),
                "additional_older_excerpts": [
                    excerpt(page_lookup, reference)
                    for reference in candidate.get("additional_older", [])
                ],
                "current_excerpt": excerpt(page_lookup, candidate["current"]),
                "relation_evidence_excerpt": excerpt(
                    page_lookup, candidate["relation_evidence"]
                ),
                "proposed_relation_basis": candidate["relation_evidence"]["basis"],
            }
        )

    output_dir = args.output_dir.resolve()
    packet_path = output_dir / "BLIND_RELATION_REVIEW_PACKET.jsonl"
    prompt_path = output_dir / "FROZEN_REVIEW_PROMPT.md"
    schema_path = output_dir / "REVIEW_OUTPUT_SCHEMA.json"
    manifest_path = output_dir / "FROZEN_MANIFEST.json"
    output_dir.mkdir(parents=True, exist_ok=True)
    packet_path.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in packet),
        encoding="utf-8",
        newline="\n",
    )
    prompt_path.write_text(PROMPT, encoding="utf-8", newline="\n")
    schema_path.write_text(
        json.dumps(SCHEMA, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    manifest = {
        "schema_version": "v6-blind-relation-review-manifest-1",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "candidate_count": len(packet),
        "candidate_source_sha256": sha256(CANDIDATE_PATH),
        "audit_sha256": sha256(AUDIT_PATH),
        "candidate_id_prefix": args.candidate_id_prefix,
        "packet_sha256": sha256(packet_path),
        "prompt_sha256": sha256(prompt_path),
        "output_schema_sha256": sha256(schema_path),
        "prohibited_inputs": [
            "router code",
            "retrieval scores or rankings",
            "system identity",
            "other reviewer judgments",
            "test outcomes",
        ],
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
