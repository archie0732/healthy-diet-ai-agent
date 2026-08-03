#!/usr/bin/env python3
"""Build a deterministic page-level text index for validated V6 source PDFs."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = EXPERIMENT_ROOT / "data" / "sources_v6" / "tier_a"
MANIFEST_PATH = SOURCE_DIR / "MANIFEST.json"
OUTPUT_DIR = EXPERIMENT_ROOT / "data" / "v6_source_mining"
INDEX_PATH = OUTPUT_DIR / "V6_PDF_PAGE_INDEX.jsonl"
SUMMARY_PATH = OUTPUT_DIR / "V6_PDF_PAGE_INDEX_SUMMARY.json"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def normalize_text(text: str) -> str:
    text = text.replace("\u00ad", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    records: list[dict] = []
    document_summaries: list[dict] = []

    for document in manifest["documents"]:
        source_path = SOURCE_DIR / document["file"]
        raw = source_path.read_bytes()
        if not raw.startswith(b"%PDF-"):
            raise ValueError(f"Not a PDF: {source_path}")
        if len(raw) != document["bytes"]:
            raise ValueError(f"Byte-size mismatch: {source_path}")
        if sha256_bytes(raw) != document["sha256"]:
            raise ValueError(f"SHA-256 mismatch: {source_path}")

        reader = PdfReader(source_path)
        if len(reader.pages) != document["pages"]:
            raise ValueError(f"Page-count mismatch: {source_path}")

        nonempty_pages = 0
        character_count = 0
        for page_index, page in enumerate(reader.pages):
            text = normalize_text(page.extract_text() or "")
            if text:
                nonempty_pages += 1
            character_count += len(text)
            records.append(
                {
                    "schema_version": "v6-pdf-page-index-1",
                    "document_id": Path(document["file"]).stem,
                    "source_file": document["file"],
                    "source_sha256": document["sha256"],
                    "family": document["family"],
                    "year": document["year"],
                    "role": document["role"],
                    "pdf_page_index": page_index,
                    "pdf_page_number": page_index + 1,
                    "text_sha256": sha256_bytes(text.encode("utf-8")),
                    "text": text,
                }
            )

        document_summaries.append(
            {
                "document_id": Path(document["file"]).stem,
                "source_file": document["file"],
                "page_count": len(reader.pages),
                "nonempty_page_count": nonempty_pages,
                "extracted_character_count": character_count,
            }
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    index_text = "".join(
        json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"
        for record in records
    )
    INDEX_PATH.write_text(index_text, encoding="utf-8", newline="\n")

    summary = {
        "schema_version": "v6-pdf-page-index-summary-1",
        "manifest_sha256": sha256_bytes(MANIFEST_PATH.read_bytes()),
        "index_sha256": sha256_bytes(index_text.encode("utf-8")),
        "document_count": len(document_summaries),
        "page_record_count": len(records),
        "nonempty_page_record_count": sum(
            item["nonempty_page_count"] for item in document_summaries
        ),
        "documents": document_summaries,
    }
    SUMMARY_PATH.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
