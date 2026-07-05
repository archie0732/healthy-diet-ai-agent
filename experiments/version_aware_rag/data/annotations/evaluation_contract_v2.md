# Evaluation Contract v2

## Known defects in v1

1. Stale detection is based on incomplete `stale_chunk_ids`, so retrieval of other old-version chunks from the same deprecated lineage can be missed.
2. Retrieval scoring consumes oracle metadata (`target_lineage_id`) during ranking.
3. Stale citation rate is simulated instead of measured from generated answers or extractable citations.
4. `acceptable_chunk_ids` and `stale_chunk_ids` are mixed with version semantics and answer semantics, which makes edge cases hard to audit.

## evaluation_queries_v2.json schema

- `query_id`: stable query identifier
- `question`: user-facing query text
- `expected_answer_scope`: one of `current_only`, `current_plus_compatible_history`, `conditional_merge`
- `notes`: short rationale for the expected answer behavior

## evaluation_query_judgments_v2.json schema

- `query_id`: joins to evaluation query
- `acceptable_chunk_ids`: chunks that may appear in a correct top-k set
- `preferred_chunk_ids`: chunks that best answer the query
- `stale_chunk_ids`: chunks whose retrieval counts as stale for this query
- `forbidden_chunk_ids`: chunks that should never appear in a correct top-k set
- `citation_safe_chunk_ids`: chunks that may be cited in a final answer
