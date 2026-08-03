#!/usr/bin/env python3
"""Seal audited V6 runtime chunk relations before confirmatory retrieval."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "v6_confirmatory"
DRAFT = DATA / "V6_RUNTIME_CHUNK_RELATIONS_DRAFT.jsonl"
AUDIT = DATA / "V6_RUNTIME_CHUNK_RELATIONS_AUDIT.json"
SEALED = DATA / "V6_RUNTIME_CHUNK_RELATIONS_SEALED.jsonl"
MANIFEST = DATA / "V6_RUNTIME_CHUNK_RELATIONS_SEAL_MANIFEST.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    if audit.get("status") != "pass" or audit.get("low_confidence_count") != 0 or audit.get("output_sha256") != sha(DRAFT):
        raise RuntimeError("Runtime relation audit is not sealable")
    records = [json.loads(line) for line in DRAFT.read_text(encoding="utf-8").splitlines() if line.strip()]
    sealed = []
    for record in records:
        value = dict(record)
        value["schema_version"] = "v6-runtime-chunk-relation-sealed-1"
        value["status"] = "sealed_before_confirmatory_retrieval"
        sealed.append(value)
    SEALED.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in sealed), encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": "v6-runtime-chunk-relations-seal-manifest-1",
        "sealed_at_utc": datetime.now(timezone.utc).isoformat(),
        "relation_count": len(sealed),
        "pairing_relation_count": sum(record["pairing_eligible"] for record in sealed),
        "current_only_node_count": sum(not record["pairing_eligible"] for record in sealed),
        "input_sha256": {"draft": sha(DRAFT), "audit": sha(AUDIT)},
        "sealed_relations_sha256": sha(SEALED),
        "fresh_retrieval_allowed": False,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
