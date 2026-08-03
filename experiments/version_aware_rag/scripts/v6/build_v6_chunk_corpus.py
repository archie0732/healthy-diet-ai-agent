#!/usr/bin/env python3
"""Build and audit the deterministic V6 page-bounded chunk corpus.

This is a construction/freeze step only. It never executes retrieval.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
SOURCE_DIR = DATA / "sources_v6" / "tier_a"
SOURCE_MANIFEST = SOURCE_DIR / "MANIFEST.json"
PAGE_INDEX = DATA / "v6_source_mining" / "V6_PDF_PAGE_INDEX.jsonl"
PAGE_INDEX_SUMMARY = DATA / "v6_source_mining" / "V6_PDF_PAGE_INDEX_SUMMARY.json"
OUT = DATA / "v6_corpus_draft"

MAX_WORDS = 220
OVERLAP_WORDS = 40
MIN_FINAL_WORDS = 60
WORD_RE = re.compile(r"\S+")


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha(path: Path) -> str:
    return sha_bytes(path.read_bytes())


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8", newline="\n")


def chunk_spans(text: str) -> list[tuple[int, int, int]]:
    tokens = list(WORD_RE.finditer(text))
    if not tokens:
        return []
    if len(tokens) <= MAX_WORDS:
        return [(0, len(text), len(tokens))]
    spans: list[tuple[int, int, int]] = []
    start_word = 0
    while start_word < len(tokens):
        end_word = min(start_word + MAX_WORDS, len(tokens))
        if len(tokens) - end_word < MIN_FINAL_WORDS and end_word < len(tokens):
            end_word = len(tokens)
        char_start = tokens[start_word].start()
        char_end = tokens[end_word - 1].end()
        spans.append((char_start, char_end, end_word - start_word))
        if end_word == len(tokens):
            break
        start_word = end_word - OVERLAP_WORDS
    return spans


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source_manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    index_summary = json.loads(PAGE_INDEX_SUMMARY.read_text(encoding="utf-8"))
    pages = read_jsonl(PAGE_INDEX)
    documents = {Path(record["file"]).stem: record for record in source_manifest["documents"]}

    errors: list[str] = []
    source_records: list[dict] = []
    for document_id, record in documents.items():
        pdf_path = SOURCE_DIR / record["file"]
        if not pdf_path.exists():
            errors.append(f"missing source PDF: {record['file']}")
            continue
        actual_sha = sha(pdf_path)
        actual_bytes = pdf_path.stat().st_size
        if actual_sha != record["sha256"]:
            errors.append(f"source SHA mismatch: {record['file']}")
        if actual_bytes != record["bytes"]:
            errors.append(f"source byte-size mismatch: {record['file']}")
        source_records.append({
            "document_id": document_id,
            "source_file": record["file"],
            "title": record["title"],
            "year": record["year"],
            "role": record["role"],
            "family": record["family"],
            "publisher": record["publisher"],
            "publication_url": record["publication_url"],
            "bytes": actual_bytes,
            "sha256": actual_sha,
        })

    page_counts = Counter(page["document_id"] for page in pages)
    for document_id, record in documents.items():
        if page_counts[document_id] != record["pages"]:
            errors.append(f"page count mismatch for {document_id}: index={page_counts[document_id]} manifest={record['pages']}")
    for page in pages:
        if sha_bytes(page["text"].encode("utf-8")) != page["text_sha256"]:
            errors.append(f"page text SHA mismatch: {page['document_id']} page {page['pdf_page_number']}")
        if page["source_sha256"] != documents[page["document_id"]]["sha256"]:
            errors.append(f"page source SHA mismatch: {page['document_id']} page {page['pdf_page_number']}")

    chunks: list[dict] = []
    page_map: list[dict] = []
    for page in pages:
        page_chunk_ids: list[str] = []
        for passage_index, (start, end, word_count) in enumerate(chunk_spans(page["text"])):
            chunk_text = page["text"][start:end]
            digest = sha_bytes(
                f"{page['document_id']}\n{page['pdf_page_number']}\n{start}\n{end}\n{chunk_text}".encode("utf-8")
            )
            chunk_id = f"v6c-{digest[:20]}"
            page_chunk_ids.append(chunk_id)
            chunks.append({
                "schema_version": "v6-corpus-chunk-1",
                "chunk_id": chunk_id,
                "document_id": page["document_id"],
                "source_file": page["source_file"],
                "source_sha256": page["source_sha256"],
                "family": page["family"],
                "document_role": page["role"],
                "published_year": page["year"],
                "pdf_page_number": page["pdf_page_number"],
                "passage_index": passage_index,
                "page_char_start": start,
                "page_char_end": end,
                "word_count": word_count,
                "text": chunk_text,
                "text_sha256": sha_bytes(chunk_text.encode("utf-8")),
            })
        page_map.append({
            "schema_version": "v6-page-to-chunks-1",
            "document_id": page["document_id"],
            "pdf_page_number": page["pdf_page_number"],
            "page_text_sha256": page["text_sha256"],
            "chunk_ids": page_chunk_ids,
        })

    chunk_ids = [record["chunk_id"] for record in chunks]
    if len(chunk_ids) != len(set(chunk_ids)):
        errors.append("duplicate chunk IDs")
    if any(record["word_count"] > MAX_WORDS + MIN_FINAL_WORDS for record in chunks):
        errors.append("unexpected oversized chunk")

    source_output = {
        "schema_version": "v6-corpus-source-manifest-1",
        "built_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_collection_id": source_manifest["collection_id"],
        "source_manifest_sha256": sha(SOURCE_MANIFEST),
        "page_index_sha256": sha(PAGE_INDEX),
        "page_index_summary_sha256": sha(PAGE_INDEX_SUMMARY),
        "documents": source_records,
        "document_count": len(source_records),
    }
    spec = {
        "schema_version": "v6-chunking-spec-1",
        "boundary": "within_each_pdf_page_only",
        "token_unit": "unicode_non_whitespace_regex_\\S+",
        "max_words": MAX_WORDS,
        "overlap_words": OVERLAP_WORDS,
        "minimum_final_window_words": MIN_FINAL_WORDS,
        "final_window_policy": "extend_previous_window_to_page_end_if_remainder_below_minimum",
        "chunk_id_policy": "sha256(document_id,page_number,page_char_start,page_char_end,exact_text) first 20 hex",
        "empty_page_policy": "retain_page_map_record_with_zero_chunks",
    }
    (OUT / "source_manifest.json").write_text(json.dumps(source_output, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    (OUT / "chunking_spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    write_jsonl(OUT / "chunks.jsonl", chunks)
    write_jsonl(OUT / "page_to_chunks.jsonl", page_map)

    word_counts = [record["word_count"] for record in chunks]
    audit = {
        "schema_version": "v6-corpus-draft-audit-1",
        "status": "pass" if not errors else "fail",
        "errors": errors,
        "document_count": len(source_records),
        "page_count": len(pages),
        "nonempty_page_count": sum(bool(record["chunk_ids"]) for record in page_map),
        "empty_page_count": sum(not record["chunk_ids"] for record in page_map),
        "chunk_count": len(chunks),
        "minimum_chunk_words": min(word_counts) if word_counts else 0,
        "maximum_chunk_words": max(word_counts) if word_counts else 0,
        "source_manifest_sha256": sha(OUT / "source_manifest.json"),
        "chunking_spec_sha256": sha(OUT / "chunking_spec.json"),
        "chunks_sha256": sha(OUT / "chunks.jsonl"),
        "page_to_chunks_sha256": sha(OUT / "page_to_chunks.jsonl"),
        "upstream_index_sha256_matches_summary": sha(PAGE_INDEX) == index_summary["index_sha256"],
        "fresh_retrieval_allowed": False,
    }
    if not audit["upstream_index_sha256_matches_summary"]:
        audit["status"] = "fail"
        audit["errors"].append("page index SHA does not match its upstream summary")
    (OUT / "corpus_audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(audit, ensure_ascii=False, indent=2, sort_keys=True))
    if audit["status"] != "pass":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
