# RAG Retrieval Evaluation Results Summary

| Retrieval Mode | Stale Retrieval Rate | Current Hit Rate | Top-1 Citation Unsafe Rate | Avg Unsafe Chunks@3 |
| :--- | :---: | :---: | :---: | :---: |
| Baseline A (Append-Only) | 80% | 80% | 20% | 1.6 |
| Baseline B (Recency-Only) | 0% | 100% | 0% | 0.4 |
| Proposed (Version-Aware RAG) | 10% | 100% | 0% | 0.4 |


*Evaluation queries count: 10 queries across 10 distinct guideline lineages.*
