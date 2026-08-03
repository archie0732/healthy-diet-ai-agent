# V6 blind relation review — frozen instructions

You are reviewing proposed evidence relationships for a retrieval-stage benchmark. Work only from the supplied source excerpts. Do not infer facts from general knowledge, search the web, inspect retrieval results, or guess how a router works.

For every packet record, independently decide:

1. whether the older excerpt supports the identified older recommendation or category;
2. whether the current excerpt supports the identified current recommendation or category;
3. whether the relation-evidence excerpt directly supports the proposed relation type;
4. whether each proposed query stratum is semantically usable:
   - `explicit_history`: a query can explicitly request the older rule or an old-versus-current comparison;
   - `conditional_merge`: a query without explicit year/history wording can genuinely require both versions to answer a change/comparison need;
   - `current_only`: a query can ask only for the current rule without needing old evidence;
   - `hard_negative_current`: an identified older or otherwise forbidden evidence item would be a plausible but wrong/unsafe answer to a current-only query; this must be `fail` or `uncertain` when the packet supplies no auditable negative evidence;
   - `compatible_history`: both versions remain substantively compatible and retaining both can be justified.
5. whether the candidate is precise enough to construct source-grounded questions without inventing applicability, clinical, or policy claims.

Use `pass`, `fail`, or `uncertain` for the evidence/relation judgments and every proposed stratum. Use `not_applicable` for `older_support` only when `older_excerpt` is null and the proposed relation is `current_only`. A candidate is `eligible` only when current and relation support are `pass`, older support is `pass` or legitimately `not_applicable`, at least one proposed stratum is `pass`, and no unsupported material claim is required. Do not repair records. Explain failures or uncertainty concisely.

Return exactly one JSON object per input record, in the same order, conforming to `REVIEW_OUTPUT_SCHEMA.json`. Do not include Markdown fences or commentary outside JSONL.
