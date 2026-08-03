#!/usr/bin/env python3
"""Search the deterministic V6 PDF page index and print page-local snippets."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
INDEX_PATH = EXPERIMENT_ROOT / "data" / "v6_source_mining" / "V6_PDF_PAGE_INDEX.jsonl"


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("pattern", help="Python regular expression")
    parser.add_argument("--document", help="Optional document_id filter")
    parser.add_argument("--context", type=int, default=240)
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()

    expression = re.compile(args.pattern, re.IGNORECASE)
    matches = 0
    with INDEX_PATH.open(encoding="utf-8") as stream:
        for line in stream:
            record = json.loads(line)
            if args.document and record["document_id"] != args.document:
                continue
            match = expression.search(record["text"])
            if not match:
                continue
            start = max(0, match.start() - args.context)
            end = min(len(record["text"]), match.end() + args.context)
            snippet = re.sub(r"\s+", " ", record["text"][start:end]).strip()
            print(
                f'{record["document_id"]}\tPDF_PAGE={record["pdf_page_number"]}\t{snippet}'
            )
            matches += 1
            if matches >= args.limit:
                break


if __name__ == "__main__":
    main()
