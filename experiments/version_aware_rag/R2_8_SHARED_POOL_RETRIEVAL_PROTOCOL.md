# R2.8 Shared-Pool Retrieval Ablation Protocol

Date frozen: 2026-07-23

## Scope

R2.8 is a Development-only retrieval ablation over the 16 records in the frozen
R2.7 Development split. The sealed R2.7 Validation file must not be opened.
This is not a fresh held-out test and cannot establish overall Version-Aware
superiority.

## Corpus and judgments

Each Development lineage contributes two retrieval items:

- `OLD`: the normalized atomic WHO/FAO 2003 claim;
- `CURRENT`: the normalized atomic claim from the 2012-2025 WHO guideline.

For `PAIR_PRESERVE`, both OLD and CURRENT are required. For `BLOCK_RETAINED`,
CURRENT is required and OLD is deprecated. These action labels are used only
after all retrieval calls complete to calculate metrics.

## Shared candidate pool

For each query, BM25 ranks all 32 Development evidence items. The ordered
Top-20 is frozen as the candidate pool for both systems. Candidate IDs, order,
BM25 scores, and SHA-256 pool hash must be identical between systems.

Runtime retrieval and reranking must not read action labels, required IDs,
deprecated IDs, rationales, or Validation data.

## Systems

### Recency

- BM25 scores normalized within the shared Top-20.
- Frozen `lambda = 0.75`.
- Year normalization follows the existing baseline contract:
  `(year - 2015) / (2026 - 2015)`.
- Final score: `base_norm + 0.75 * recency_norm`.

### Version-Aware explicit-history router

- Uses the frozen `explicit_temporal_history_intent_v1` query detector.
- For an explicit historical query, select the highest-BM25 in-pool seed and
  disable the Recency component, then give both the seed and its declared
  lineage mate a fixed `0.75` pair boost:
  `base_norm + 0.75 * is_seed_or_mate`.
- For a current-only query, use the identical Recency scoring rule.
- No out-of-pool expansion, judgment feature, query-ID rule, topic rule, model
  API, or parameter search is allowed.

## Primary stratified endpoints at Top-3

1. `PAIR_PRESERVE` required micro Recall@3.
2. `PAIR_PRESERVE` both-evidence coverage.
3. `BLOCK_RETAINED` required micro Recall@3.
4. `BLOCK_RETAINED` deprecated-OLD hit rate.
5. Required candidate Recall@20.

Overall mean Recall is descriptive only.

## Promotion gate

R2.8 passes only if all conditions hold:

1. Version-Aware `PAIR_PRESERVE` required micro Recall@3 is strictly greater
   than Recency.
2. Version-Aware both-evidence coverage is strictly greater than Recency.
3. Version-Aware `BLOCK_RETAINED` required micro Recall@3 is not lower.
4. Version-Aware deprecated-OLD hit rate on `BLOCK_RETAINED` does not increase.
5. Required candidate micro Recall@20 is at least 0.90.
6. Shared candidate-pool identity is 100%.

Passing this gate permits construction of a new retrieval-specific Validation
set. It does not permit opening an existing test, freezing the overall policy,
or claiming overall superiority.
