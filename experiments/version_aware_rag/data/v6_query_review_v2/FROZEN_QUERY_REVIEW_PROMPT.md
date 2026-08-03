# V6 blind query-contract review — frozen instructions

Review every proposed retrieval query using only its supplied source excerpts and proposed page-level gold contract. Do not browse, inspect router rules, retrieval results, system identity, boost values, or another reviewer's output.

For every record judge `answerability`, `stratum_validity`, `required_evidence_necessity`, `unsafe_evidence_labels`, `non_triviality`, `leakage_safety`, and `wording_safety` as `pass`, `fail`, or `uncertain`.

Strata:
- `explicit_history`: the wording explicitly requests an earlier rule or cross-version comparison and the labeled cross-version evidence is necessary.
- `conditional_merge`: the wording contains no explicit year/history/version request, but answering the complete rule genuinely needs both supplied versions.
- `current_only`: only operative evidence is required; displaced older evidence may be deprecated but is not required.
- `hard_negative_current`: operative evidence is required and the labeled older evidence is a plausible but wrong current answer.

`eligible` is true only if all seven judgments pass. Do not repair the record or infer missing clinical applicability. Return exactly one JSON object per record in input order, followed by one `MODEL_METADATA:` line. No Markdown fences or other prose.
