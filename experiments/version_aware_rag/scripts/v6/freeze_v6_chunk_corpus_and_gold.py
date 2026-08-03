#!/usr/bin/env python3
"""Freeze the audited V6 corpus and chunk-level gold without running retrieval."""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
DRAFT = DATA / "v6_corpus_draft"
FROZEN = DATA / "v6_corpus_frozen"
CONFIRM = DATA / "v6_confirmatory"
DRAFT_GOLD = CONFIRM / "V6_GOLD_CONTRACTS_CHUNK_LEVEL_DRAFT.jsonl"
SEALED_GOLD = CONFIRM / "V6_GOLD_CONTRACTS_CHUNK_LEVEL_SEALED.jsonl"
RESOLUTION_LEDGER = CONFIRM / "V6_PAGE_TO_CHUNK_RESOLUTION_LEDGER.jsonl"
RESOLUTION_AUDIT = CONFIRM / "V6_PAGE_TO_CHUNK_RESOLUTION_AUDIT.json"
MEDIUM_AUDIT = CONFIRM / "V6_MEDIUM_RESOLUTION_CODEX_AUDIT.jsonl"
MEDIUM_MANIFEST = CONFIRM / "V6_MEDIUM_RESOLUTION_CODEX_AUDIT_MANIFEST.json"
QUERY_SEAL = CONFIRM / "V6_QUERY_GOLD_SEAL_MANIFEST.json"

CORPUS_FILES = ("source_manifest.json", "chunking_spec.json", "chunks.jsonl", "page_to_chunks.jsonl", "corpus_audit.json")
GROUP_LABELS = (
    "required_evidence_chunk_groups", "compatible_evidence_chunk_groups",
    "deprecated_evidence_chunk_groups", "forbidden_evidence_chunk_groups",
    "citation_safe_evidence_chunk_groups",
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8", newline="\n")


def main() -> None:
    corpus_audit = json.loads((DRAFT / "corpus_audit.json").read_text(encoding="utf-8"))
    resolution_audit = json.loads(RESOLUTION_AUDIT.read_text(encoding="utf-8"))
    medium_manifest = json.loads(MEDIUM_MANIFEST.read_text(encoding="utf-8"))
    if corpus_audit.get("status") != "pass":
        raise RuntimeError("Corpus audit failed; refusing to freeze")
    if not resolution_audit.get("chunk_level_gold_sealable") or resolution_audit.get("low_confidence_count") != 0:
        raise RuntimeError("Chunk resolution is not sealable")
    if medium_manifest.get("fail_count") != 0 or medium_manifest.get("pass_count") != medium_manifest.get("unique_medium_mapping_count"):
        raise RuntimeError("Medium-resolution audit is incomplete")
    if medium_manifest.get("input_resolution_ledger_sha256") != sha(RESOLUTION_LEDGER):
        raise RuntimeError("Medium-resolution audit does not match the current resolution ledger")
    if medium_manifest.get("audit_sha256") != sha(MEDIUM_AUDIT):
        raise RuntimeError("Medium-resolution audit hash mismatch")

    chunks = read_jsonl(DRAFT / "chunks.jsonl")
    chunk_by_id = {record["chunk_id"]: record for record in chunks}
    if len(chunk_by_id) != len(chunks):
        raise RuntimeError("Duplicate chunk IDs")
    gold = read_jsonl(DRAFT_GOLD)
    errors: list[str] = []
    for contract in gold:
        label_sets: dict[str, set[str]] = {}
        for label in GROUP_LABELS:
            ids: set[str] = set()
            for group in contract[label]:
                ref = group["source_ref"]
                if not group["acceptable_chunk_ids"]:
                    errors.append(f"{contract['query_id']} empty group in {label}")
                for chunk_id in group["acceptable_chunk_ids"]:
                    chunk = chunk_by_id.get(chunk_id)
                    if not chunk:
                        errors.append(f"{contract['query_id']} unknown chunk {chunk_id}")
                        continue
                    if chunk["document_id"] != ref["document_id"] or chunk["pdf_page_number"] != ref["pdf_page_number"]:
                        errors.append(f"{contract['query_id']} chunk/source-page mismatch {chunk_id}")
                    ids.add(chunk_id)
            label_sets[label] = ids
        unsafe = label_sets["deprecated_evidence_chunk_groups"] | label_sets["forbidden_evidence_chunk_groups"]
        conflict = label_sets["required_evidence_chunk_groups"] & unsafe
        if conflict:
            errors.append(f"{contract['query_id']} required/unsafe conflict: {sorted(conflict)}")
    if errors:
        raise RuntimeError("Freeze validation failed:\n" + "\n".join(errors))

    sealed = []
    for contract in gold:
        record = dict(contract)
        record["schema_version"] = "v6-gold-contract-chunk-level-sealed-1"
        record["review_status"] = "sealed_after_deterministic_resolution_and_codex_construction_audit"
        sealed.append(record)
    write_jsonl(SEALED_GOLD, sealed)

    FROZEN.mkdir(parents=True, exist_ok=True)
    for name in CORPUS_FILES:
        shutil.copyfile(DRAFT / name, FROZEN / name)
    manifest = {
        "schema_version": "v6-chunk-corpus-freeze-manifest-1",
        "frozen_at_utc": datetime.now(timezone.utc).isoformat(),
        "freeze_scope": "official_source_manifest_page_bounded_chunks_page_map_and_chunk_level_gold",
        "document_count": corpus_audit["document_count"],
        "page_count": corpus_audit["page_count"],
        "chunk_count": corpus_audit["chunk_count"],
        "query_count": len(sealed),
        "required_evidence_group_count": resolution_audit["required_evidence_group_count"],
        "input_sha256": {
            "query_page_gold_seal_manifest": sha(QUERY_SEAL),
            "resolution_ledger": sha(RESOLUTION_LEDGER),
            "resolution_audit": sha(RESOLUTION_AUDIT),
            "medium_resolution_audit": sha(MEDIUM_AUDIT),
            "medium_resolution_audit_manifest": sha(MEDIUM_MANIFEST),
            "chunk_level_gold_draft": sha(DRAFT_GOLD),
        },
        "frozen_corpus_sha256": {name: sha(FROZEN / name) for name in CORPUS_FILES},
        "sealed_chunk_level_gold_sha256": sha(SEALED_GOLD),
        "next_required_gate": "systems_A_through_F_router_invariants_devval_and_policy_freeze",
        "fresh_retrieval_allowed": False,
    }
    (FROZEN / "FREEZE_MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
