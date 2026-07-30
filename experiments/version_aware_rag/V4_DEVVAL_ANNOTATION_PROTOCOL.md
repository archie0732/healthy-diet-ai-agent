# V4 Development/Validation Draft Annotation Protocol

## Status

This protocol creates reviewable drafts, not frozen labels. Every generated
record is `needs_user_review`; no draft may enter a held-out test split.

## Model registry

- Draft annotator / structured relevance judge: `gemini-3.5-flash`
- Existing comparison model: `${GOOGLE_CHAT_MODEL}` from local environment
- API credential: `GEMINI_AI_API` (never written to artifacts)

For each call, record model ID, endpoint version, prompt hash, corpus checksum,
temperature, request/response hashes, latency, and token usage. Store excerpts
only; do not include credentials in a manifest.

## Draft requirements

Each proposed item must contain:

1. `stratum` (`conditional_merge` or `compatible_history`)
2. a query text and population/condition scope
3. exactly identified `required_current_chunk_ids`
4. exactly identified `required_retained_chunk_ids`
5. a rationale explaining why recency alone may omit the retained evidence
6. `lineage_group_id` that is distinct within the proposed split
7. `review_status: needs_user_review`

The reviewer must accept, revise, or reject every relation, required-evidence
set, scope condition, and leakage-group assignment before the item becomes an
adjudicated development/validation judgment.

## Split and test guard

- Development selects prompts, reranker configuration, and policy weights.
- Validation is read once after selection and cannot change a selection.
- V4 fresh-test candidates are kept in a separate inventory and must never be
  used to seed, draft, or review development/validation annotations.
- No test split is created until the review ledger, corpus, relations,
  judgments, prompts, model manifest, and policy configuration are frozen.
