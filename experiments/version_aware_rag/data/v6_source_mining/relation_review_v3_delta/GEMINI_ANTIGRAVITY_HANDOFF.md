# Gemini Antigravity handoff — V6 relation review v3 delta

## Isolation rule

Run this in a new Gemini/Antigravity task. Do not provide Codex or ChatGPT judgments, router code, retrieval results, system names, scores, or prior benchmark outcomes. Do not ask Gemini to browse the web.

## Frozen inputs

Attach these three files without editing them:

1. `FROZEN_REVIEW_PROMPT.md`
2. `BLIND_RELATION_REVIEW_PACKET.jsonl`
3. `REVIEW_OUTPUT_SCHEMA.json`

Frozen packet SHA-256:

`990bbcbf9efb030f8022eb60d508769a7eccedc4ab901486320149cd7bcfb3c3`

Frozen prompt SHA-256:

`932f60c3516339b4a324ec2cf1c52664b6e1387ed3df489906e55ed60cbf09d7`

## Antigravity message

Use exactly this message after attaching the files:

> Follow `FROZEN_REVIEW_PROMPT.md` exactly. Review every record in `BLIND_RELATION_REVIEW_PACKET.jsonl` using only the supplied excerpts and return exactly one JSON object per input record, in the same order, conforming to `REVIEW_OUTPUT_SCHEMA.json`. Do not browse, do not use prior reviewer outputs, and do not add Markdown fences or prose outside the JSONL. Also state the exact Gemini model/version in a separate final metadata line prefixed `MODEL_METADATA:` after all 6 JSON objects.

## Return to Codex

Save Gemini's untouched complete response as `GEMINI_RAW_RESPONSE.txt`. Do not repair JSON, reorder records, remove the metadata line, or copy only passing cases. Return that file to Codex together with any Antigravity run/model identifier visible in the UI.

Codex will validate record count, candidate order, schema, and the frozen packet hash before importing. Missing or malformed judgments will not be filled by another model.
