#!/usr/bin/env python3
"""Resolve reviewed V6 document relations to frozen-corpus chunk endpoints."""

from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CANDIDATES = DATA / "v6_source_mining" / "V6_RELATION_CANDIDATES.jsonl"
CONSENSUS = DATA / "v6_confirmatory" / "V6_RELATION_CONSENSUS_LEDGER.jsonl"
CHUNKS = DATA / "v6_corpus_frozen" / "chunks.jsonl"
OUT = DATA / "v6_confirmatory" / "V6_RUNTIME_CHUNK_RELATIONS_DRAFT.jsonl"
AUDIT = DATA / "v6_confirmatory" / "V6_RUNTIME_CHUNK_RELATIONS_AUDIT.json"
STOP = {"the", "and", "for", "with", "from", "that", "this", "recommendation", "table", "current", "earlier", "update", "updated"}


def rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def norm(text: str) -> str:
    value = unicodedata.normalize("NFKD", text).lower().replace("_", " ")
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", value))


def toks(text: str) -> list[str]:
    return [token for token in norm(text).split() if len(token) > 2 and token not in STOP]


def select(ref: dict, basis: str, page_chunks: list[dict]) -> tuple[dict, str, float]:
    if not page_chunks:
        raise RuntimeError(f"no chunks on endpoint page: {ref}")
    rid = str(ref.get("recommendation_id") or "")
    phrase = norm(rid)
    anchors = set(toks(rid))
    context = Counter(toks(rid + " " + basis))
    chunk_sets = [set(toks(chunk["text"])) for chunk in page_chunks]
    df = Counter(token for token_set in chunk_sets for token in token_set)
    scored = []
    for index, token_set in enumerate(chunk_sets):
        normalized_chunk = norm(page_chunks[index]["text"])
        anchor_position = normalized_chunk.find(phrase) if phrase else -1
        exact = anchor_position >= 0
        position_ratio = anchor_position / max(1, len(normalized_chunk)) if exact else None
        coverage = len(anchors & token_set) / len(anchors) if anchors else 0.0
        semantic = sum((1 + math.log(count)) * math.log((len(page_chunks) + 1) / (df[token] + 0.5)) for token, count in context.items() if token in token_set)
        position_bonus = 30 * (1 - position_ratio) if position_ratio is not None else 0
        score = (100 if exact else 0) + position_bonus + 20 * coverage + semantic / math.sqrt(max(1, len(token_set)))
        scored.append((score, page_chunks[index]["chunk_id"], index, exact, coverage))
    scored.sort(key=lambda item: (-item[0], item[1]))
    _, _, index, exact, coverage = scored[0]
    method = "exact_normalized_anchor" if exact else "fuzzy_anchor_and_relation_basis"
    return page_chunks[index], method, coverage


def main() -> None:
    candidates = {record["candidate_id"]: record for record in rows(CANDIDATES)}
    approved = [record for record in rows(CONSENSUS) if record["status"] == "approved" and record["evidence_unanimous_pass"]]
    chunks = rows(CHUNKS)
    by_page: dict[tuple[str, int], list[dict]] = {}
    for chunk in chunks:
        by_page.setdefault((chunk["document_id"], chunk["pdf_page_number"]), []).append(chunk)
    for value in by_page.values():
        value.sort(key=lambda record: record["passage_index"])

    output = []
    endpoint_methods = Counter()
    low = []
    for consensus in approved:
        candidate = candidates[consensus["candidate_id"]]
        endpoints = {}
        for role in ("older", "current"):
            ref = candidate[role]
            if ref is None:
                endpoints[role] = None
                continue
            chunk, method, coverage = select(ref, candidate["relation_evidence"]["basis"], by_page.get((ref["document_id"], ref["pdf_page_number"]), []))
            endpoint_methods[method] += 1
            if method != "exact_normalized_anchor" and coverage < 0.6:
                low.append({"candidate_id": candidate["candidate_id"], "role": role, "ref": ref, "coverage": coverage})
            endpoints[role] = {
                "source_ref": ref,
                "chunk_id": chunk["chunk_id"],
                "passage_index": chunk["passage_index"],
                "resolution_method": method,
                "anchor_token_coverage": round(coverage, 6),
            }
        output.append({
            "schema_version": "v6-runtime-chunk-relation-draft-1",
            "candidate_id": candidate["candidate_id"],
            "lineage_id": candidate["lineage_id"],
            "family": candidate["family"],
            "relation_type": candidate["relation_type"],
            "relation_facets": candidate["relation_facets"],
            "older": endpoints["older"],
            "current": endpoints["current"],
            "relation_evidence": candidate["relation_evidence"],
            "approved_strata": consensus["approved_strata"],
            "pairing_eligible": endpoints["older"] is not None and endpoints["current"] is not None,
            "status": "draft_pending_runtime_graph_audit",
        })
    OUT.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in output), encoding="utf-8", newline="\n")
    report = {
        "schema_version": "v6-runtime-chunk-relations-audit-1",
        "status": "pass" if not low else "review_required",
        "approved_relation_count": len(output),
        "pairing_relation_count": sum(record["pairing_eligible"] for record in output),
        "current_only_node_count": sum(not record["pairing_eligible"] for record in output),
        "resolved_endpoint_count": sum((record["older"] is not None) + (record["current"] is not None) for record in output),
        "endpoint_method_distribution": dict(sorted(endpoint_methods.items())),
        "low_confidence_count": len(low),
        "low_confidence_items": low,
        "input_sha256": {"relation_candidates": sha(CANDIDATES), "relation_consensus": sha(CONSENSUS), "frozen_chunks": sha(CHUNKS)},
        "output_sha256": sha(OUT),
        "fresh_retrieval_allowed": False,
    }
    AUDIT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
