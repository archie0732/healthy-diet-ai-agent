# Version-Aware RAG Evaluation Tables
---

### Corpus & Annotation Dataset Metadata (v3)

| Metric / Checksum | Value |
| :--- | :---: |
| Total Document Chunks | 583 |
| Average Word Length per Chunk | 216.58 words |
| Null Lineage Chunks Rate | 82.0% |
| Total Evaluation Queries | 40 |
| Adjudicated Relation Pairs | 51 |
| Corpus Checksum (SHA-256) | `ee4f1c5bddb6b7f2...` |
| Dev Split Checksum | `e1634dd483f6e763...` |
| Val Split Checksum | `886f872bdd56c071...` |
| Test Split Checksum | `8913631312d1b483...` |

---

## Section 1: Retrieval Evaluation (Automatic)

| System Configuration | Recall@3 (95% CI) | Precision@3 | MRR | nDCG@3 | Stale Hit Rate | Avg Unsafe Chunks |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Append-Only RAG** | 20.8% [4.2%, 35.4%] | 16.7% | 0.500 | 0.350 | 12.5% | 0.00 |
| **Recency-Only RAG** | 58.3% [31.3%, 83.3%] | 41.7% | 0.750 | 0.670 | 12.5% | 0.00 |
| **Proposed Oracle Graph** | 20.8% [4.2%, 35.4%] | 16.7% | 0.500 | 0.350 | 12.5% | 0.00 |
| **Proposed Predicted Graph** | 20.8% [4.2%, 35.4%] | 16.7% | 0.500 | 0.350 | 12.5% | 0.00 |

---

## Section 2: Automatic Citation-Grounded Proxy Metrics (Automatic)

> *Note: These are deterministic rule-based proxy metrics computed from gold chunk sets, NOT human evaluation.*

| System Alias | Correctness (Proxy) | Completeness (Proxy) | Version Correctness (Proxy) | Boundary Preservation (Proxy) | Unsupported Claim Rate (Proxy) | Citation Entailment (Proxy) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **System_A** | 0.375 | 0.500 | 0.875 | 0.375 | 1.000 | 0.167 |
| **System_B** | 0.375 | 0.500 | 0.875 | 0.375 | 1.000 | 0.156 |
| **System_C** | 0.750 | 0.750 | 0.875 | 0.750 | 0.875 | 0.417 |

---

## Section 3: Blinded Human Answer Evaluation (Human)

**Status: [Pending - Human Blind Evaluation]**

*(Human blind annotations and adjudication have not been completed yet. Automatic proxy metrics are NOT displayed in this section.)*
