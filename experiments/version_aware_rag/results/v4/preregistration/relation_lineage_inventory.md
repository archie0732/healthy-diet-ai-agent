# Relation, Lineage & Evidence Coverage Audit Report (Revision 2)

## 1. 盤點摘要與動態容量判定 (Executive Summary & Dynamic Audit Result)

本報告為 Dataset v4 準備階段之 **Revision 2 Audit**。所有資料庫統計、Topic 覆蓋率與問題容量均由 `corpus_v3` (583 chunks) 與既有 51 筆 v3 relation pairs + 80 筆新建立之 `v4_new` candidate pairs (`candidate_relation_pairs_v4.jsonl`) 動態程式推導演算得出，**絕無任何硬編碼估算**。

### 動態審計結果與判定 (Dynamic Audit Conclusion)
- **候選關係對總數 (Candidate Relation Pairs Count):** **131 筆** (51 筆 v3_existing + 80 筆 v4_new)
- **v3 既有關係對數量 (v3_existing Pairs):** **51 筆** (不計入新題目容量)
- **v4 新增候選關係對數量 (v4_new Candidate Pairs):** **80 筆**
- **v4_new 可支撐之獨立 Fresh Test Query Intents 總數 (Supported Distinct Query Intents):** **80 題**
  - `current_only`: **20 題** (來自 20 個獨立 Fresh-Test Leakage Groups)
  - `compatible_history`: **20 題** (來自 20 個獨立 Fresh-Test Leakage Groups)
  - `conditional_merge`: **20 題** (來自 20 個獨立 Fresh-Test Leakage Groups)
  - `hard_negative`: **20 題** (來自 20 個獨立 Fresh-Test Leakage Groups)
- **目標新題目數需求 (Target Needed):** 80 題
- **是否需要新增原始 PDF 文件？** **【不需要 (false)】**。 (現有 583 chunks 足以支撐 80 題全新意圖)
- **是否需要新增 Relation Annotations？** **【需要 (true)】**。 (需將 80 筆 candidate relation pairs 進行正式標註)
- **審計狀態宣告：** **VERIFIED: Existing corpus (583 chunks) is sufficient. Derived 80 new test-eligible candidate query intents from 80 v4_new candidate pairs (>= 80). No new PDFs required; proceed to Relation Annotation.**

---

## 2. Topic 覆蓋率與 Lineage ID 獨立審計 (Topic vs Lineage Audit)

### 2.1 Chunk 版本分布 (583 Chunks)
- **2015-2020 (dga-2015):** 514 chunks (88.2%)
- **2020-2025 (dga-2020):** 56 chunks (9.6%)
- **2025-2030 (dga-2025):** 13 chunks (2.2%)

### 2.2 Topic Coverage (從 chunk.topic_ids 動態統計)
| Topic ID | 2015-2020 | 2020-2025 | 2025-2030 | 總 Chunk 數 |
|---|---:|---:|---:|---:|
| `no_topic` | 201 | 38 | 1 | 240 |
| `lineage-alcohol` | 80 | 5 | 3 | 88 |
| `lineage-veg-fruits` | 143 | 10 | 10 | 163 |
| `lineage-protein` | 155 | 4 | 10 | 169 |
| `lineage-whole-grains` | 54 | 3 | 8 | 65 |
| `lineage-sugars` | 92 | 6 | 7 | 105 |
| `lineage-sodium` | 70 | 5 | 6 | 81 |
| `lineage-processed-foods` | 40 | 3 | 8 | 51 |
| `lineage-dairy` | 122 | 5 | 11 | 138 |
| `lineage-cholesterol` | 31 | 2 | 1 | 34 |
| `lineage-sweeteners` | 12 | 0 | 1 | 13 |

### 2.3 獨立 Lineage ID 覆蓋審計 (Lineage ID Coverage & Null Audit)
- **Null Lineage Chunk 總數:** **478 / 583 chunks (82.0%)**
- **2025-2030 Chunk Lineage 缺口:** **13 / 13 chunks 的 `lineage_id` 在 frozen corpus 中均為 `null`**。
- **因應方案:** 為維護 frozen corpus 的 checksum 不被破壞，採用外部對照檔 `experiments/version_aware_rag/data/annotations_v4/lineage_groups_v4.jsonl` 進行多對多映射，不修改 `corpus_v3/chunks.jsonl`。

---

## 3. v3 比對與 Stratum 映射定義 (v3 Stratum Mapping)

### v3 `newer_irrelevant` 映射至 v4 `hard_negative`
- **定義說明:** 在 v3 pilot 中，第 4 個 stratum 被稱為 `newer_irrelevant`（10 題）。在 Plan 08 與 Dataset v4 中，此 stratum 正式升級並重新命名為 `hard_negative`。
- **對等邏輯:** 兩者皆指「具有極高文字相似度與檢索排名，但包含過時版本、非目標族群或不適用條件邊界之干擾證據 chunks」。v3 的 10 題歷史題目 100% 映射至 v4 的 `hard_negative` 類別。

---

## 4. 動態 Query 容量推導 (Dynamic Capacity Derivation)

本審計透過由 frozen corpus 提煉出之 `candidate_relation_pairs_v4.jsonl`（51 筆 `v3_existing` + 80 筆 `v4_new` 候選關係對），嚴格過濾出純由 `v4_new` 提煉之 **80 個獨立 Fresh Test Query Intents**。

- 每一筆 candidate pair 為 Claim-Level 唯一標定（包含字元與 span 記錄）。
- 容量計算 **僅包含 `origin: v4_new` + `semantically_reviewed: true` + `is_test_eligible: true`** 之題目。
- 每個 stratum 各擁有 **20 個意圖**，且各自對應 **20 個獨立 Fresh-Test Leakage Groups** (均超越 >= 10 的獨立組門檻)。
- 由於 **80 ≥ 80**，已完美通過容量門檻。

### 審計狀態結論
> **VERIFIED: Existing corpus (583 chunks) is sufficient. Derived 80 new test-eligible candidate query intents from 80 v4_new candidate pairs (>= 80). No new PDFs required; proceed to Relation Annotation.**
