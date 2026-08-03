#!/usr/bin/env python3
"""Resolve sealed V6 page-level evidence contracts to deterministic chunk groups.

Resolution uses only sealed annotation text and chunks from the referenced page;
it does not search the corpus or execute a retrieval system.
"""

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
CONFIRM = DATA / "v6_confirmatory"
CORPUS = DATA / "v6_corpus_draft"
GOLD = CONFIRM / "V6_GOLD_CONTRACTS_PAGE_LEVEL_SEALED.jsonl"
QUERIES = CONFIRM / "V6_QUERIES_SEALED.jsonl"
PACKET = DATA / "v6_query_review_v3" / "BLIND_QUERY_REVIEW_PACKET.jsonl"
CHUNKS = CORPUS / "chunks.jsonl"
CORPUS_AUDIT = CORPUS / "corpus_audit.json"
OUT_GOLD = CONFIRM / "V6_GOLD_CONTRACTS_CHUNK_LEVEL_DRAFT.jsonl"
LEDGER = CONFIRM / "V6_PAGE_TO_CHUNK_RESOLUTION_LEDGER.jsonl"
AUDIT = CONFIRM / "V6_PAGE_TO_CHUNK_RESOLUTION_AUDIT.json"

LABELS = (
    "required_evidence_refs", "compatible_evidence_refs", "deprecated_evidence_refs",
    "forbidden_evidence_refs", "citation_safe_evidence_refs",
)
STOP = {
    "the", "and", "for", "with", "from", "that", "this", "what", "which", "who",
    "was", "were", "are", "does", "did", "its", "into", "than", "then", "only",
    "recommendation", "recommendations", "guidance", "stated", "state", "current",
    "earlier", "operative", "compare", "change", "changed", "retained", "page", "table",
}


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8", newline="\n")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize(text: str) -> str:
    value = unicodedata.normalize("NFKD", text).lower().replace("_", " ")
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", value))


def tokens(text: str) -> list[str]:
    return [token for token in normalize(text).split() if len(token) > 2 and token not in STOP]


def resolve(ref: dict, query: dict, packet: dict, page_chunks: list[dict]) -> tuple[dict, dict]:
    if not page_chunks:
        raise RuntimeError(f"Referenced page has no chunks: {ref}")
    rec_id = ref.get("recommendation_id")
    normalized_rec = normalize(rec_id or "")
    anchor_tokens = set(tokens(rec_id or ""))
    context_tokens = tokens(" ".join((query["query_text"], packet["construction_basis"], rec_id or "")))
    context_counts = Counter(context_tokens)
    chunk_token_sets = [set(tokens(chunk["text"])) for chunk in page_chunks]
    df = Counter(token for token_set in chunk_token_sets for token in token_set)
    n = len(page_chunks)

    scored: list[tuple[float, int, float, bool, float | None]] = []
    for index, (chunk, token_set) in enumerate(zip(page_chunks, chunk_token_sets)):
        normalized_chunk = normalize(chunk["text"])
        anchor_position = normalized_chunk.find(normalized_rec) if normalized_rec else -1
        exact = anchor_position >= 0
        anchor_position_ratio = anchor_position / max(1, len(normalized_chunk)) if exact else None
        anchor_coverage = len(anchor_tokens & token_set) / len(anchor_tokens) if anchor_tokens else 0.0
        semantic = 0.0
        for token, count in context_counts.items():
            if token in token_set:
                semantic += (1.0 + math.log(count)) * math.log((n + 1) / (df[token] + 0.5))
        length_norm = math.sqrt(max(1, len(token_set)))
        semantic /= length_norm
        # When overlapping windows both contain the label, prefer the window
        # where the label occurs earlier so the answer-bearing continuation is
        # retained instead of selecting a window that ends at the label.
        position_bonus = 30.0 * (1.0 - anchor_position_ratio) if anchor_position_ratio is not None else 0.0
        score = (100.0 if exact else 0.0) + position_bonus + 20.0 * anchor_coverage + semantic
        scored.append((score, index, anchor_coverage, exact, anchor_position_ratio))
    scored.sort(key=lambda item: (-item[0], page_chunks[item[1]]["chunk_id"]))
    best_score, best_index, anchor_coverage, exact, anchor_position_ratio = scored[0]
    second_score = scored[1][0] if len(scored) > 1 else None
    best = page_chunks[best_index]
    if exact:
        method = "normalized_recommendation_anchor_plus_context"
        confidence = "high"
    elif rec_id and anchor_coverage >= 0.6:
        method = "fuzzy_recommendation_tokens_plus_context"
        confidence = "medium"
    elif rec_id:
        method = "contextual_fallback_for_unmatched_recommendation_label"
        confidence = "low"
    else:
        method = "query_and_construction_basis_context_for_unlabeled_rationale_page"
        confidence = "medium"
    group = {
        "source_ref": ref,
        "acceptable_chunk_ids": [best["chunk_id"]],
        "group_scoring_rule": "hit_if_any_acceptable_chunk_is_retrieved",
    }
    ledger = {
        "schema_version": "v6-page-to-chunk-resolution-ledger-1",
        "query_id": query["query_id"],
        "source_ref": ref,
        "selected_chunk_id": best["chunk_id"],
        "selected_passage_index": best["passage_index"],
        "selected_text": best["text"],
        "resolution_method": method,
        "resolution_confidence": confidence,
        "normalized_anchor_exact": exact,
        "normalized_anchor_position_ratio": round(anchor_position_ratio, 6) if anchor_position_ratio is not None else None,
        "anchor_token_coverage": round(anchor_coverage, 6),
        "best_score": round(best_score, 6),
        "second_score": round(second_score, 6) if second_score is not None else None,
        "candidate_chunk_count_on_page": len(page_chunks),
    }
    return group, ledger


def main() -> None:
    corpus_audit = json.loads(CORPUS_AUDIT.read_text(encoding="utf-8"))
    if corpus_audit.get("status") != "pass":
        raise RuntimeError("Corpus audit has not passed")
    gold = read_jsonl(GOLD)
    queries = {record["query_id"]: record for record in read_jsonl(QUERIES)}
    packets = {record["query_id"]: record for record in read_jsonl(PACKET)}
    chunks = read_jsonl(CHUNKS)
    by_page: dict[tuple[str, int], list[dict]] = {}
    for chunk in chunks:
        by_page.setdefault((chunk["document_id"], chunk["pdf_page_number"]), []).append(chunk)
    for page_chunks in by_page.values():
        page_chunks.sort(key=lambda record: record["passage_index"])

    output: list[dict] = []
    ledger_records: list[dict] = []
    errors: list[str] = []
    for contract in gold:
        query_id = contract["query_id"]
        query = queries[query_id]
        packet = packets[query_id]
        resolved = dict(contract)
        resolved["schema_version"] = "v6-gold-contract-chunk-level-draft-1"
        resolved["review_status"] = "chunk_resolution_draft_requires_audit"
        for label in LABELS:
            group_label = label.replace("_refs", "_chunk_groups")
            groups = []
            for ref in contract[label]:
                page_key = (ref["document_id"], ref["pdf_page_number"])
                try:
                    group, ledger = resolve(ref, query, packet, by_page.get(page_key, []))
                    ledger["source_label"] = label
                    groups.append(group)
                    ledger_records.append(ledger)
                except Exception as error:
                    errors.append(f"{query_id} {label} {ref}: {error}")
            resolved[group_label] = groups
        output.append(resolved)

    write_jsonl(OUT_GOLD, output)
    write_jsonl(LEDGER, ledger_records)
    confidence = Counter(record["resolution_confidence"] for record in ledger_records)
    method = Counter(record["resolution_method"] for record in ledger_records)
    low = [record for record in ledger_records if record["resolution_confidence"] == "low"]
    required_groups = sum(len(record["required_evidence_chunk_groups"]) for record in output)
    report = {
        "schema_version": "v6-page-to-chunk-resolution-audit-1",
        "status": "pass_with_review_required" if not errors else "fail",
        "errors": errors,
        "query_count": len(output),
        "resolution_record_count": len(ledger_records),
        "required_evidence_group_count": required_groups,
        "confidence_distribution": dict(sorted(confidence.items())),
        "method_distribution": dict(sorted(method.items())),
        "low_confidence_count": len(low),
        "low_confidence_items": [
            {"query_id": record["query_id"], "source_label": record["source_label"], "source_ref": record["source_ref"]}
            for record in low
        ],
        "input_sha256": {"page_level_gold": sha(GOLD), "sealed_queries": sha(QUERIES), "review_packet": sha(PACKET), "chunks": sha(CHUNKS)},
        "output_sha256": {"chunk_level_gold_draft": sha(OUT_GOLD), "resolution_ledger": sha(LEDGER)},
        "chunk_level_gold_sealable": not errors and not low,
        "fresh_retrieval_allowed": False,
    }
    AUDIT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
