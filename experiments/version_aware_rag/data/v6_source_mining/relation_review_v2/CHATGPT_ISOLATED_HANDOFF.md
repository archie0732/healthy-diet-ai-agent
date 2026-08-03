# ChatGPT isolated handoff — V6 relation review v2

Run this in a new ChatGPT conversation that has not seen this project. Do not provide Codex or Gemini judgments, router code, retrieval results, system names, scores, or prior benchmark outcomes. Do not enable web browsing.

Attach `FROZEN_REVIEW_PROMPT.md`, `BLIND_RELATION_REVIEW_PACKET.jsonl`, and `REVIEW_OUTPUT_SCHEMA.json`. The frozen packet SHA-256 is `a84952b4054d8a476cc06abe243b3f015ebe4b732fe86ab0abc17ad930701e29`.

Send exactly:

> Follow `FROZEN_REVIEW_PROMPT.md` exactly. Review every record in `BLIND_RELATION_REVIEW_PACKET.jsonl` using only the supplied excerpts and return exactly one JSON object per input record, in the same order, conforming to `REVIEW_OUTPUT_SCHEMA.json`. Do not browse, do not use prior reviewer outputs, and do not add Markdown fences or prose outside the JSONL. Also state the exact ChatGPT model/version in a separate final metadata line prefixed `MODEL_METADATA:` after all 66 JSON objects.

Save the untouched response as `CHATGPT_RAW_RESPONSE.txt` and return it to Codex. Do not repair JSON, reorder records, or remove the metadata line.
