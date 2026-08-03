# ChatGPT isolated handoff — V6 relation review v3 delta

Run this in a new ChatGPT conversation that has not seen this project. Do not provide Codex or Gemini judgments, router code, retrieval results, system names, scores, or prior benchmark outcomes. Do not enable web browsing.

Attach `FROZEN_REVIEW_PROMPT.md`, `BLIND_RELATION_REVIEW_PACKET.jsonl`, and `REVIEW_OUTPUT_SCHEMA.json`. The frozen packet SHA-256 is `990bbcbf9efb030f8022eb60d508769a7eccedc4ab901486320149cd7bcfb3c3`.

Send exactly:

> Follow `FROZEN_REVIEW_PROMPT.md` exactly. Review every record in `BLIND_RELATION_REVIEW_PACKET.jsonl` using only the supplied excerpts and return exactly one JSON object per input record, in the same order, conforming to `REVIEW_OUTPUT_SCHEMA.json`. Do not browse, do not use prior reviewer outputs, and do not add Markdown fences or prose outside the JSONL. Also state the exact ChatGPT model/version in a separate final metadata line prefixed `MODEL_METADATA:` after all 6 JSON objects.

Save the untouched response as `CHATGPT_RAW_RESPONSE.txt` and return it to Codex. Do not repair JSON, reorder records, or remove the metadata line.
