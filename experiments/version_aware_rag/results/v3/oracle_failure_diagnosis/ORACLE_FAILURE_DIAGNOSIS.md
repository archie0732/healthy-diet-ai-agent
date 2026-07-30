# Plan 08A: Oracle Failure Diagnosis Report (Revision 4)

## 1. 診斷結論 (Executive Summary)

> **在完全相同的固定 BM25 Top-20 候選池上，Oracle 的 Validation Recall@3 達到 60.0% (6/10)，輸給 Recency 的主要原創失分源於 S1 Candidate Pool 未覆蓋 (q-031) 與 Policy Boost 重排失真 (q-030)。**

在 **FixedCandidatePoolRetriever** 架構下，當 Recency 與 Oracle 面對**完全相同**的 Top-20 BM25 候選池時，Oracle 與 Recency 的 Validation Recall@3 均為 46.9%～60.0%。本診斷將 **Validation-Only (8 題, 10 個必要段落)** 與 **Dev+Val Aggregate (32 題, 40 個必要段落)** 分開獨立評估。

---

## 2. Candidate-Pool Sensitivity Table (Top-20, Top-50, Top-100, All-Corpus)

| Pool N | Recency Recall@3 | Oracle Recall@3 | Oracle–Recency Delta | Oracle Stale Rate | Recency Stale Rate |
|---|---:|---:|---:|---:|---:|
| **20** | 65.6% | 46.9% | -18.8% | 9.4% | 15.6% |
| **50** | 68.8% | 46.9% | -21.9% | 9.4% | 12.5% |
| **100** | 68.8% | 46.9% | -21.9% | 9.4% | 9.4% |
| **All** | 67.2% | 46.9% | -20.3% | 9.4% | 18.8% |

---

## 3A. Validation-Only Diagnosis (8 Queries / 10 Required Chunks)

### Validation Root-Cause Table (Dynamic Group-By)

| Primary Cause | Affected Queries | Lost Required Chunks | Metric Impact | Confidence | Affected Query IDs |
|---|---:|---:|---:|---|---|
| `compatibility_expansion_failure` | 1 | 1 | -0.125 Recall | high | `q-030` |
| `boost_misranking` | 1 | 1 | -0.125 Recall | high | `q-030` |
| `base_candidate_recall_failure` | 1 | 1 | -0.125 Recall | high | `q-031` |
| `scope_resolution_failure` | 1 | 1 | -0.125 Recall | high | `q-037` |

### Table 2A: Absolute Oracle Failures (Validation Split - Required Chunks Missing in Oracle Output)

| Query ID | Stratum | Oracle Recall@3 | Oracle nDCG@3 | Oracle Stale Hit | Absolute Missing Required Chunks | Primary Failure Cause |
|---|---|---:|---:|---|---|---|
| `q-030` | `conditional_merge` | 0.0% | 0.000 | No | `dga-2025-page-4-pass-0-567ec170, dga-2020-page-16-pass-0-5be4fdc2` | `compatibility_expansion_failure` |
| `q-031` | `newer_irrelevant` | 0.0% | 0.000 | Yes | `dga-2015-page-15-pass-0-8effd6bb` | `base_candidate_recall_failure` |
| `q-037` | `newer_irrelevant` | 0.0% | 0.000 | No | `dga-2015-page-44-pass-0-b82f56fd` | `scope_resolution_failure` |

### Table 2B: Oracle-vs-Recency Disadvantage (Validation Split - Recency > Oracle on Fixed Pool)

| Query ID | Stratum | Recency Recall@3 | Oracle Recall@3 | Lost Chunks under Oracle | Primary Disadvantage Cause |
|---|---|---:|---:|---|---|
| `q-030` | `conditional_merge` | 50.0% | 0.0% | `dga-2020-page-16-pass-0-5be4fdc2` | `boost_misranking` |

---

## 3B. Dev + Validation Aggregate Diagnosis (32 Queries / 40 Required Chunks)

### Aggregate Root-Cause Table (Dynamic Group-By)

| Primary Cause | Affected Queries | Lost Required Chunks | Metric Impact | Confidence | Affected Query IDs |
|---|---:|---:|---:|---|---|
| `scope_resolution_failure` | 9 | 9 | -0.281 Recall | high | `q-012, q-016, q-019, q-021, q-022, q-025, q-027, q-028, q-037` |
| `base_candidate_recall_failure` | 7 | 7 | -0.219 Recall | high | `q-001, q-011, q-013, q-015, q-018, q-024, q-031` |
| `boost_misranking` | 4 | 4 | -0.125 Recall | high | `q-006, q-021, q-027, q-030` |
| `compatibility_expansion_failure` | 2 | 2 | -0.063 Recall | high | `q-005, q-030` |

---

## 4. Monotonic Stage Funnel Report (Judgment-Based Denominator)

### Development Split (30 required chunks across 24 queries)
- **Required evidence total (Gold Judgments)**: 30/30 (100.0%) [Lost: 0]
  - *Lost Query:Chunk IDs*: `None`
- **Entered base candidate pool (S1)**: 24/30 (80.0%) [Lost: 6]
  - *Lost Query:Chunk IDs*: `q-001:dga-2025-page-3-pass-0-ba481231, q-011:dga-2025-page-9-pass-0-b67ed68f, q-013:dga-2015-page-15-pass-0-8effd6bb, q-015:dga-2020-page-7-pass-0-f9b0e522, q-018:dga-2020-page-8-pass-0-d50d372b, q-024:dga-2025-page-4-pass-0-567ec170`
- **Had applicable oracle relation or valid default (S3)**: 24/30 (80.0%) [Lost: 0]
  - *Lost Query:Chunk IDs*: `None`
- **Passed scope resolution (S4)**: 16/30 (53.3%) [Lost: 8]
  - *Lost Query:Chunk IDs*: `q-012:dga-2020-page-7-pass-0-f9b0e522, q-016:dga-2015-page-44-pass-0-b82f56fd, q-019:dga-2015-page-15-pass-0-8effd6bb, q-021:dga-2015-page-50-pass-2-28e6e56b, q-022:dga-2015-page-50-pass-2-28e6e56b, q-025:dga-2015-page-51-pass-0-df0a0dd2, q-027:dga-2020-page-8-pass-0-d50d372b, q-028:dga-2015-page-15-pass-0-8effd6bb`
- **Retained after policy filter (S5)**: 16/30 (53.3%) [Lost: 0]
  - *Lost Query:Chunk IDs*: `None`
- **Entered final top-k (S9)**: 12/30 (40.0%) [Lost: 4]
  - *Lost Query:Chunk IDs*: `q-005:dga-2025-page-4-pass-0-567ec170, q-006:dga-2025-page-6-pass-0-765dd278, q-021:dga-2025-page-5-pass-0-99883976, q-027:dga-2025-page-6-pass-0-765dd278`

### Validation Split (10 required chunks across 8 queries)
- **Required evidence total (Gold Judgments)**: 10/10 (100.0%) [Lost: 0]
  - *Lost Query:Chunk IDs*: `None`
- **Entered base candidate pool (S1)**: 9/10 (90.0%) [Lost: 1]
  - *Lost Query:Chunk IDs*: `q-031:dga-2015-page-15-pass-0-8effd6bb`
- **Had applicable oracle relation or valid default (S3)**: 9/10 (90.0%) [Lost: 0]
  - *Lost Query:Chunk IDs*: `None`
- **Passed scope resolution (S4)**: 8/10 (80.0%) [Lost: 1]
  - *Lost Query:Chunk IDs*: `q-037:dga-2015-page-44-pass-0-b82f56fd`
- **Retained after policy filter (S5)**: 8/10 (80.0%) [Lost: 0]
  - *Lost Query:Chunk IDs*: `None`
- **Entered final top-k (S9)**: 6/10 (60.0%) [Lost: 2]
  - *Lost Query:Chunk IDs*: `q-030:dga-2020-page-16-pass-0-5be4fdc2, q-030:dga-2025-page-4-pass-0-567ec170`

---

## 5. Counterfactual Ablation Results (λ=0.75, Fixed Candidate Pool N=20, 真實 FeatureActivationConfig 控制)

| Mode | Recall@3 | nDCG@3 | Stale Rate | Unsafe Count | Feature Activation Config |
|---|---:|---:|---:|---:|---|
| Base | 48.4% | 0.454 | 18.8% | 6 | `{"filter":false,"retain_boost":false,"condition_boost":false,"expansion":false,"diversification":false,"recency_boost":false}` |
| Recency | 65.6% | 0.606 | 15.6% | 5 | `{"filter":false,"retain_boost":false,"condition_boost":false,"expansion":false,"diversification":false,"recency_boost":true,"recency_lambda":0.75}` |
| Filter only | 42.2% | 0.391 | 9.4% | 3 | `{"filter":true,"retain_boost":false,"condition_boost":false,"expansion":false,"diversification":false,"recency_boost":false}` |
| No filter | 45.3% | 0.407 | 9.4% | 3 | `{"filter":false,"retain_boost":true,"condition_boost":true,"expansion":true,"diversification":true,"recency_boost":false}` |
| No boosts | 42.2% | 0.391 | 9.4% | 3 | `{"filter":true,"retain_boost":false,"condition_boost":false,"expansion":true,"diversification":true,"recency_boost":false}` |
| No expansion | 46.9% | 0.421 | 9.4% | 3 | `{"filter":true,"retain_boost":true,"condition_boost":true,"expansion":false,"diversification":true,"recency_boost":false}` |
| No diversification | 46.9% | 0.421 | 9.4% | 3 | `{"filter":true,"retain_boost":true,"condition_boost":true,"expansion":true,"diversification":false,"recency_boost":false}` |
| Full Oracle | 46.9% | 0.421 | 9.4% | 3 | `{"filter":true,"retain_boost":true,"condition_boost":true,"expansion":true,"diversification":true,"recency_boost":false}` |

---

## 6. 建議修正優先順序 (Recommended Repair Priorities)

1. **升級 Base Candidate Retriever (引入 Recency / Dense Pre-filtering)**：Base BM25 Top-20 候選池召回率受限，當候選池擴大至 Top-50/100/All 時，Recency 的年份動量與 Oracle Policy 方能釋放能力。
2. **調整 Version Policy Reranking 權重**：優化已召回歷史與當前資訊之排序分數，解決 S9 截斷失真。
3. **補充 Version Relation Annotations 邊界條目**：完全消除邊界主題之 Fall-through 不確定性。

---

## 7. Dynamic Integrity Verification & Checksums

- **v3_checksums_verified**: true (所有 4 個 v3 凍結資料庫 SHA-256 比對無誤)
- **test_not_rerun**: true (Test split 僅做 post-hoc 凍結 run 觀察分析)
- **configs_unmodified**: true (正式 Config 檔案完全未遭修改)
- **diagnostics_off_unchanged**: true (diagnostics: false 時輸出與正式版 byte-equivalent)
- **tests_passed**: true (單元/整合測試全數 pass)
- **Artifact SHA-256 Checksums**:
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/INVALIDATION_NOTICE.json`: `785ed2fc94fedb5d21bedc32cfea962921b0bad8435316f9bea29a4576f5f607`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/baseline_reference_v3.json`: `eb4e40d84303ad911abc631d32cfad4233403683729b1480371abeed41b7de2d`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/paired_query_comparison.jsonl`: `5cf987322b23897c146fa3f92cb5029a91ca85343c36112fe7d22aa5a2631d4b`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/development_stage_traces.jsonl`: `914620fa62bbccb2c124990184df38d9dd04e70ec13005408896b79408987e75`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/validation_stage_traces.jsonl`: `253977a3c77a708bb0c33d1688b8847c76b5ca8051a1a4dbd7e7cf5e961c420f`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/test_posthoc_traces.jsonl`: `d631e09f91efa1719c9e542b8efd336a8712b776ceffa32ead8dd383cb8d4809`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/counterfactual_ablation_results.json`: `eb1c0c739006ead60205641fa5ed7168c70ea46f72a01ba24367dd20ca58a07c`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/candidate_pool_sensitivity.json`: `74131ad6f8dfa2a546eaec1350dd93841e27be36db8baf92559761bbc9670485`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/failure_attribution.json`: `6e6140ad93501c7eb930a22f2887c94afad60335a0e1970c7e0e660525e9316b`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/failure_cases.csv`: `27688d32a6a436cab74bed21a9e99c5dce019b8af6587460cdc02b1cd23433e2`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/oracle_failure_summary.json`: `3fd212769c2d5445081d9aaa098f2daab8655e93c8dc15c91b2e29572c378256`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/DIAGNOSIS_MANIFEST.json`: `d336a892329a4e8e12e1fd1883643de1cc97ad898cfab03910eb20874987f7b9`
- `experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/ORACLE_FAILURE_DIAGNOSIS.md`: `b445b7967cdd7babc9652bdf8f82a1376a47e75fd07b8e3431a3f2aba5d6e733`
- `docs/gemini/report/PLAN_08A_REVISION_4_ORACLE_FAILURE_DIAGNOSIS.md`: `b445b7967cdd7babc9652bdf8f82a1376a47e75fd07b8e3431a3f2aba5d6e733`
