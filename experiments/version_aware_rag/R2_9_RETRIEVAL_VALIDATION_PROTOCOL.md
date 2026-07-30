# R2.9 Retrieval-Specific Validation Protocol

Date frozen: 2026-07-23

R2.9 is a one-shot confirmation of the frozen R2.8 policy on 12 newly authored,
pre-audited cross-version lineages: six explicit-history `PAIR_PRESERVE` and six
current-only `BLOCK_RETAINED`.

The frozen retrieval contract is unchanged:

- atomic OLD/CURRENT evidence corpus;
- BM25 shared Top-20 candidate pool;
- Top-3 evaluation;
- Recency `lambda = 0.75`;
- `explicit_temporal_history_intent_v1`;
- for explicit history, disable Recency and add `0.75` to the highest-BM25
  in-pool seed and its lineage mate;
- for current-only queries, Version-Aware equals Recency;
- no out-of-pool expansion, model API, parameter search, or judgment feature.

Retrieval inputs and sealed judgments must be separate files. All retrieval
calls must finish before judgments are read.

The one-shot Validation passes only if:

1. Version-Aware `PAIR_PRESERVE` required micro Recall@3 is strictly greater
   than Recency.
2. Version-Aware both-evidence coverage is strictly greater than Recency.
3. `BLOCK_RETAINED` required micro Recall@3 is not lower.
4. `BLOCK_RETAINED` deprecated-OLD hit rate does not increase.
5. Required candidate micro Recall@20 is at least 0.90.
6. Shared candidate-pool identity is 100%.

No retuning is permitted after execution. Passing supports only explicit
historical-intent retrieval advantage; it does not establish overall
Version-Aware superiority or authorize a fresh test.

