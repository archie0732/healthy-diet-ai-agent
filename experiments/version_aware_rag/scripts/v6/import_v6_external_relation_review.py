#!/usr/bin/env python3
"""Validate and import an untouched external V6 relation-review response."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REVIEW_DIR = (
    EXPERIMENT_ROOT / "data" / "v6_source_mining" / "relation_review_v2"
)
ALLOWED_JUDGMENTS = {"pass", "fail", "uncertain"}
ALLOWED_OLDER_JUDGMENTS = ALLOWED_JUDGMENTS | {"not_applicable"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def validate_judgment(judgment: dict, packet_record: dict, line_number: int) -> None:
    required = {
        "candidate_id",
        "older_support",
        "current_support",
        "relation_support",
        "stratum_judgments",
        "unsupported_material_claim",
        "eligible",
        "notes",
    }
    if set(judgment) != required:
        raise ValueError(
            f"Line {line_number}: fields differ from frozen schema: "
            f"missing={sorted(required - set(judgment))}, "
            f"extra={sorted(set(judgment) - required)}"
        )
    if judgment["candidate_id"] != packet_record["candidate_id"]:
        raise ValueError(
            f"Line {line_number}: candidate order/id mismatch; expected "
            f"{packet_record['candidate_id']!r}"
        )
    if judgment["older_support"] not in ALLOWED_OLDER_JUDGMENTS:
        raise ValueError(f"Line {line_number}: invalid older_support")
    for field in ("current_support", "relation_support"):
        if judgment[field] not in ALLOWED_JUDGMENTS:
            raise ValueError(f"Line {line_number}: invalid {field}")
    expected_strata = set(packet_record["proposed_strata"])
    actual_strata = set(judgment["stratum_judgments"])
    if actual_strata != expected_strata:
        raise ValueError(
            f"Line {line_number}: stratum keys mismatch; "
            f"expected={sorted(expected_strata)}, actual={sorted(actual_strata)}"
        )
    if any(
        value not in ALLOWED_JUDGMENTS
        for value in judgment["stratum_judgments"].values()
    ):
        raise ValueError(f"Line {line_number}: invalid stratum judgment")
    if not isinstance(judgment["unsupported_material_claim"], bool):
        raise ValueError(f"Line {line_number}: unsupported_material_claim is not boolean")
    if not isinstance(judgment["eligible"], bool):
        raise ValueError(f"Line {line_number}: eligible is not boolean")
    if not isinstance(judgment["notes"], str):
        raise ValueError(f"Line {line_number}: notes is not a string")


def parse_raw_response(path: Path) -> tuple[list[dict], str]:
    lines = [line.strip() for line in path.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    metadata_lines = [line for line in lines if line.startswith("MODEL_METADATA:")]
    if len(metadata_lines) != 1 or lines[-1] != metadata_lines[0]:
        raise ValueError("Exactly one MODEL_METADATA line must appear last")
    json_lines = lines[:-1]
    judgments = []
    for index, line in enumerate(json_lines, start=1):
        if line.startswith("```"):
            raise ValueError(f"Line {index}: Markdown fences are not allowed")
        try:
            judgments.append(json.loads(line))
        except json.JSONDecodeError as error:
            raise ValueError(f"Line {index}: invalid JSON: {error}") from error
    return judgments, metadata_lines[0].removeprefix("MODEL_METADATA:").strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=("gemini", "chatgpt"), required=True)
    parser.add_argument("--raw-response", type=Path, required=True)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--output-prefix")
    parser.add_argument("--review-dir", type=Path, default=DEFAULT_REVIEW_DIR)
    args = parser.parse_args()

    review_dir = args.review_dir.resolve()
    packet_path = review_dir / "BLIND_RELATION_REVIEW_PACKET.jsonl"
    frozen_manifest_path = review_dir / "FROZEN_MANIFEST.json"
    raw_path = args.raw_response.resolve()
    if not raw_path.is_file():
        raise FileNotFoundError(raw_path)
    packet = load_jsonl(packet_path)
    frozen_manifest = json.loads(frozen_manifest_path.read_text(encoding="utf-8"))
    if sha256(packet_path) != frozen_manifest["packet_sha256"]:
        raise RuntimeError("Frozen packet hash mismatch")

    judgments, model_metadata = parse_raw_response(raw_path)
    if len(judgments) != len(packet):
        raise ValueError(
            f"Expected {len(packet)} judgments, received {len(judgments)}"
        )
    for index, (judgment, packet_record) in enumerate(
        zip(judgments, packet, strict=True), start=1
    ):
        validate_judgment(judgment, packet_record, index)

    if args.validate_only:
        print(
            json.dumps(
                {
                    "provider": args.provider,
                    "model_metadata_raw": model_metadata,
                    "judgment_count": len(judgments),
                    "packet_sha256": sha256(packet_path),
                    "candidate_order_valid": True,
                    "schema_valid": True,
                    "imported": False,
                },
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
        )
        return

    prefix = args.output_prefix or args.provider.upper()
    if not prefix.replace("_", "").isalnum():
        raise ValueError("output prefix must contain only letters, digits, or underscores")
    preserved_raw_path = review_dir / f"{prefix}_RAW_RESPONSE.txt"
    normalized_path = review_dir / f"{prefix}_RAW_REVIEW.jsonl"
    manifest_path = review_dir / f"{prefix}_REVIEW_MANIFEST.json"
    if preserved_raw_path.exists() or normalized_path.exists() or manifest_path.exists():
        raise FileExistsError(
            f"Refusing to overwrite an existing {args.provider} review import"
        )
    shutil.copyfile(raw_path, preserved_raw_path)
    normalized_path.write_text(
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in judgments),
        encoding="utf-8",
        newline="\n",
    )
    manifest = {
        "schema_version": "v6-external-relation-review-manifest-1",
        "provider": args.provider,
        "model_metadata_raw": model_metadata,
        "imported_at_utc": datetime.now(timezone.utc).isoformat(),
        "packet_sha256": sha256(packet_path),
        "source_raw_response_sha256": sha256(raw_path),
        "preserved_raw_response_sha256": sha256(preserved_raw_path),
        "normalized_review_sha256": sha256(normalized_path),
        "judgment_count": len(judgments),
        "candidate_order_valid": True,
        "schema_valid": True,
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
