# Plan 08B-R1: Evaluation Pipeline Repair and Oracle Policy Revalidation Report

## Executive Summary
Oracle remains behind Recency-Only on development retrieval recall, so the policy requires another development repair.

- **Gate Decision**: `requires_another_development_repair` (this stage never freezes Oracle policy)
- **V3 Input Checksums Verified**: `true`
- **Test Split Retriever Invocations**: `0` (Fresh V4 test split remains unopened)

## 1. Aggregate Retrieval Metrics (Development & Validation)

### Development Split (24 Queries)
| System / Mode | Mean Query Recall@3 | Required Micro Recall@3 | Mean nDCG@3 | Stale Hit Rate | Unsafe Chunk Count |
|---|---:|---:|---:|---:|---:|
| Append-Only (Base) | 0.4583 | 0.4333 | 0.3847 | 0.0417 | 58 |
| Recency-Only Baseline | 0.6667 | 0.6667 | 0.5899 | 0.1667 | 47 |
| Oracle Version-Aware | 0.4583 | 0.4333 | 0.3591 | 0.0417 | 52 |
| Ablation: filter_only | 0.4167 | 0.4 | 0.3638 | 0.0417 | 54 |
| Ablation: no_filter | 0.5 | 0.4667 | 0.38 | 0.0417 | 56 |
| Ablation: no_boosts | 0.375 | 0.3667 | 0.3068 | 0.0417 | 55 |

### Validation Split (8 Queries)
| System / Mode | Mean Query Recall@3 | Required Micro Recall@3 | Mean nDCG@3 | Stale Hit Rate | Unsafe Chunk Count |
|---|---:|---:|---:|---:|---:|
| Append-Only (Base) | 0.625 | 0.6 | 0.615 | 0.125 | 18 |
| Recency-Only Baseline | 0.625 | 0.6 | 0.6533 | 0.125 | 15 |
| Oracle Version-Aware | 0.75 | 0.8 | 0.5733 | 0.125 | 16 |

## 2. Macro vs. Micro Metric Clarification
- **Macro Query Recall@3**: The unweighted mean of per-query recall scores across all queries in the split.
- **Required Micro Recall@3**: The proportion of total required chunks retrieved across the entire split ($ \sum \text{hits} / \sum \text{required} $).

## 3. Validation Per-Stratum Breakdown

### Stratum: `current_only`
- Recency-Only Recall@3: 1 (Micro: 1)
- Oracle Version-Aware Recall@3: 1 (Micro: 1)

### Stratum: `compatible_history`
- Recency-Only Recall@3: 1 (Micro: 1)
- Oracle Version-Aware Recall@3: 1 (Micro: 1)

### Stratum: `conditional_merge`
- Recency-Only Recall@3: 0.5 (Micro: 0.5)
- Oracle Version-Aware Recall@3: 1 (Micro: 1)

### Stratum: `newer_irrelevant`
- Recency-Only Recall@3: 0 (Micro: 0)
- Oracle Version-Aware Recall@3: 0 (Micro: 0)


## 4. Focused Failure Case Analysis (q-030, q-031, q-037)

- **q-030**: "What is the recommended ratio of whole grains to total grains?"
  - Observed First Failure Stage: `None (all required chunks retrieved)`
  - Oracle / Recency Recall@3: `1 / 0.5`
  - Improved over Recency: `true`

- **q-031**: "What was the 2015 guidance on grain servings at the 2,000 calorie level?"
  - Observed First Failure Stage: `base_candidate_recall_failure`
  - Oracle / Recency Recall@3: `0 / 0`
  - Improved over Recency: `false`

- **q-037**: "What was the 2015 association of processed meats with cardiovascular disease?"
  - Observed First Failure Stage: `reranking_failed_to_promote`
  - Oracle / Recency Recall@3: `0 / 0`
  - Improved over Recency: `false`


## 5. Experimental Integrity Verification
- **File Read Order**: Judgments loaded only after all retrieval steps completed.
- **Candidate Pool Matching**: Hash verification confirmed identical pools across all ablations for every query.
- **Checksum File**: `ARTIFACT_CHECKSUMS.sha256` generated last, containing hashes for all listed result artifacts.
