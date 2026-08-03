You are performing an isolated source-grounded re-review of 25 corrected V6 query contracts. The first Gemini pass rejected only these records because the same PDF page appeared twice in `required_evidence`. That serialization defect has been corrected by deduplicating evidence at `(document_id, pdf_page_number)` level. Query wording and source text are otherwise unchanged.

Use only `GEMINI_QUERY_REVIEW_DELTA_25.jsonl`. Do not inspect the repository, prior reviewer output, router rules, retrieval results, boost values, or the web.

For every record independently judge these fields as `pass`, `fail`, or `uncertain`:

- `answerability`
- `stratum_validity`
- `required_evidence_necessity`
- `unsafe_evidence_labels`
- `non_triviality`
- `leakage_safety`
- `wording_safety`

`explicit_history` must explicitly request an earlier rule or cross-version comparison and require the supplied distinct cross-version evidence. `conditional_merge` must avoid explicit year/history/version wording but genuinely need the supplied distinct evidence to state the complete rule.

Set `eligible` to true only if all seven judgments pass. Return exactly 25 JSON objects, one per line and in input order, with exactly these fields: `query_id`, the seven judgment fields above, `eligible`, and `notes`. Do not use Markdown fences or add prose. After the 25 JSON objects, add one line beginning `MODEL_METADATA:` with the exact Gemini model/version and Antigravity run ID.
