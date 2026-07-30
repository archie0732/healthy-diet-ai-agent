# Plan 08E Query–Passage Relevance Reranker Ablation

This is development-only model selection, not a held-out result. The relevance signal is offline character n-gram TF-IDF cosine, not a neural embedding.

## Result

- Oracle lineage expansion recovers q-031's missing required 2015 chunk from an in-pool related seed while Recency retains the same base pool and hash.
- Relevance alphas evaluated: `0, 0.25, 0.5, 0.75`.
- Modes meeting both development target-stratum non-inferiority gates: `none`.
- Selected mode: `none; reranker is not promotable`.

See `focused_endpoint_metrics.json` and `focused_failure_cases.json` for recomputable evidence.
