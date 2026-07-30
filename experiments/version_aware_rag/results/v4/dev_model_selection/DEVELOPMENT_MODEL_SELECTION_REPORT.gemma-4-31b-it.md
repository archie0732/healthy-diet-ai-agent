# V4 Expanded Development-Only Model Selection

This run used only the 16-record development split (SHA-256 `dbc90de18d95ee757e3941305868d133ec7b4233d5ee0386b341ad7eb885a378`). Validation and fresh-test read counts are zero.

Embedding model: `gemini-embedding-001`. Cross-encoder model: `gemma-4-31b-it` with not_applicable thinking and scores-only output.

## Available endpoint result

- Recency conditional-merge required micro Recall@3: 0.125
- Recency compatible-history required micro Recall@3: 0.25
- Recency retained-history required micro Recall@3: 0
- Oracle modes meeting both target-stratum gates and strict retained-history improvement: oracle_cross_0.5, oracle_cross_0.75, oracle_cross_0.25, oracle_embedding_0.75, oracle_embedding_0.5, oracle_embedding_0.25, oracle_embedding_1, oracle_lineage, oracle_cross_1
- Development-selected candidate on available endpoints: oracle_cross_0.5

## Gate

Full promotion is **blocked**. The approved expanded labels do not yet contain query-level stale/forbidden chunk labels, so the preregistered safety non-increase endpoint is not evaluable. Validation remains sealed.
