#!/usr/bin/env python3
"""Combine a frozen review prompt and attachment into one uploadable TXT file."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    prompt = args.directory / "QUERY_REVIEW_PROMPT.txt"
    attachment = args.directory / "QUERY_REVIEW_ATTACHMENT.txt"
    output = args.directory / "SINGLE_REVIEW_INPUT.txt"
    content = (
        prompt.read_text(encoding="utf-8").rstrip()
        + "\n\n--- BEGIN ATTACHED REVIEW MATERIAL ---\n"
        + attachment.read_text(encoding="utf-8").strip()
        + "\n--- END ATTACHED REVIEW MATERIAL ---\n"
    )
    output.write_text(content, encoding="utf-8", newline="\n")
    report = {
        "output": str(output),
        "prompt_sha256": sha(prompt),
        "attachment_sha256": sha(attachment),
        "single_input_sha256": sha(output),
        "record_count": sum(1 for line in attachment.read_text(encoding="utf-8").splitlines() if line.strip()),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
