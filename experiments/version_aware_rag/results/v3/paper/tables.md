
### Table 1: Corpus & Annotation Dataset Statistics (v3)

| Metric | Value |
| :--- | :---: |
| Total Document Chunks | 583 |
| Average Word Length per Chunk | 216.58 words |
| Null Lineage Chunks Rate | 82.0% |
| Adjudicated Evaluation Queries | 10 |
| Adjudicated Relation Pairs | 11 |
| Inter-Annotator Agreement (Relation Type Cohen's Kappa) | 0.861 |
| Inter-Annotator Agreement (Policy Label Cohen's Kappa) | 0.744 |



### Table 2: Downstream Retrieval Comparison (development split)

| System Configuration | Recall | Precision | MRR | nDCG | Stale Hit Rate | Avg Unsafe Chunks |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Append-Only RAG** | 28.9% | 22.2% | 0.500 | 0.360 | 50.0% | 2.33 |
| **Recency-Only RAG** | 63.3% | 61.1% | 1.000 | 0.800 | 16.7% | 1.17 |
| **Proposed Full Version-Aware** | 31.1% | 22.2% | 0.556 | 0.380 | 0.0% | 2.33 |
