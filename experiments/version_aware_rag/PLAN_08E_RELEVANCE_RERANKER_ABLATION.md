# Plan 08E: Query–Passage Relevance Reranker Ablation

This is development-only policy selection. The shared BM25 Top-20 pool and the
08D Oracle lineage expansion remain fixed. A query–passage TF-IDF character
n-gram cosine score is evaluated as a reproducible relevance signal; it is not
called an embedding model or a semantic neural model.

For each alpha in `{0, 0.25, 0.5, 0.75}`, rerank the Oracle's policy-expanded
candidates using `(1-alpha) * normalized_policy_score + alpha * normalized_relevance_score`.
Select only on development, and only if both conditional-merge and
compatible-history required micro recall@3 are at least Recency's values with
no stale-rate increase. Validation is reported after selection and cannot
choose alpha. The test split is never read.
