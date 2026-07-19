# Dataset V3 Verification and Freeze Report (Plan 3 收尾與凍結報告)

本文件記錄了 Version-Aware RAG 評估資料集 V3 的完整校驗結果、分區隔離檢驗、雙人標註一致性報告，以及正式的資料集 Checksum 凍結宣告。

---

## 1. 資料集版本與凍結資訊 (Dataset Version & Freeze Metadata)

- **資料集版本 (Dataset Version)**: `v3.0.0`
- **凍結日期 (Freeze Date)**: `2026-07-18`
- **對應 Corpus 版本**: `v3.0` (Corpus Checksum: `ee4f1c5bddb6b7f255aa4cd497614812bb1933e545c4f0dc3e45986b3a624af7`)

---

## 2. 測試分區凍結 Checksum 宣告 (Split Checksums)

為確保評估的公平性與不可篡改性（防止 test split 泄露或被訓練集污染），在此正式凍結 `splits_v3` 之 SHA-256 Checksums：

| 分區檔名 | 本地路徑 | SHA-256 Checksum |
| --- | --- | --- |
| **`development.json`** | [development.json](file:///d:/GitHub/archie0732/healthy-diet-ai-agent/experiments/version_aware_rag/data/splits_v3/development.json) | `E1634DD483F6E76361E993489A888B87FE63872F070ABE6565FFCE23D45C6F91` |
| **`validation.json`** | [validation.json](file:///d:/GitHub/archie0732/healthy-diet-ai-agent/experiments/version_aware_rag/data/splits_v3/validation.json) | `886F872BDD56C0719274DA6412F9D0F813731033132D991AD5B1DD201EF7467D` |
| **`test.json`** | [test.json](file:///d:/GitHub/archie0732/healthy-diet-ai-agent/experiments/version_aware_rag/data/splits_v3/test.json) | `8913631312D1B48387F88A74772686DC3FA2567806D9571C71021BE7A79A8E86` |

任何對 splits 的未來修改都必須遞增 dataset version 並重新進行人工核備。

---

## 3. 資料規模與分層平衡統計 (Data Volume & Stratum Distribution)

我們在 V3 中將題庫擴充了 30 題，達到了 Plan 3 設定的 **40 題評估資料集**。各維度統計如下：

### 評估題目數量統計 (Total Evaluation Queries)
- **總題數**: 40 題
- **分區題數**: Dev (`24` 題), Val (`8` 題), Test (`8` 題)
- **分層分佈 (Stratum Distribution)**:
  - `current_only`: 10 題 (25%)
  - `compatible_history`: 10 題 (25%)
  - `conditional_merge`: 10 題 (25%)
  - `newer_irrelevant`: 10 題 (25%)
  - **平衡狀態**: **完美平衡 (各佔 25%)**

### 關係對數量統計 (Relation Pairs)
- **總關係對**: 51 對
- **關係類型分佈 (Relation Type Distribution)**:
  - `duplicate`: 3 對 (5.9%)
  - `superseded`: 15 對 (29.4%)
  - `conflicting`: 11 對 (21.6%)
  - `conditional_difference`: 5 對 (9.8%)
  - `complementary`: 17 對 (33.3%)
  - **平衡狀態**: 覆蓋所有 5 種關係類型，滿足 validator 設定之每種關係 >= 3 對的下限。

---

## 4. 雙人標註一致性報告 (Inter-Annotator Agreement Report)

本報告包含論文附錄所需的一致性指標數據，計算自 `annotator_a` 與 `annotator_b` 的獨立標註結果：

- **平均 Jaccard 相似度 (證據集合 - Evidence Sets)**: **`93.4%`**
  - *解釋*: 兩位標註者在哪些 chunks 與 query 相關的判斷上具備極高的一致性。
- **精確一致率 (必要證據集合 - Required Sets)**: **`100.0%`**
  - *解釋*: 判定回答該問題「絕對必要」的核心證據上，雙方完全達成共識。
- **Cohen's Kappa (版本關係 - Relation Type)**: **`0.810`**
  - *解釋*: 對於同一 Lineage 中新舊 chunk 關係的判定，Kappa 值達到 `0.80` 以上的「幾乎完美一致 (Almost Perfect Agreement)」。
- **Cohen's Kappa (政策標籤 - Policy Label)**: **`0.805`**
  - *解釋*: 對於舊版 chunk 是否保留、降權或失效的判定，展現出高度一致的政策判斷標準。

---

## 5. 仲裁與衝突決策日誌 (Adjudication Log Summary)

標註歧異經雙方討論並經第三仲裁人 Adjudicator 核定後，最終決策如下：

1. **版本關係歧異 (Relation Type Disagreement)**:
   - *現象*: 標註者 A 將 `pair-v3-012` (Dairy serving goals) 標記為 `superseded`，而標註者 B 標記為 `conflicting`。
   - *決策*: 仲裁人判定為 `superseded`。原因為：2025 年的 3 servings/day 指南在實質上覆蓋了 2020 年的 low-fat 指南，其為覆蓋與數值更新，而非本質矛盾，因此應套用 `deprecated` 的 Ingestion 政策標籤。
2. **證據邊界歧異 (Jaccard Noise)**:
   - *現象*: 標註者 A 漏標了一部分相容的歷史證據 chunk (例如 `dga-2020-page-7-pass-0-f9b0e522`)。
   - *決策*: 仲裁人判定該 chunk 仍具有高度相容性，可作為補充歷史資訊，因此將其列入 `compatible_chunk_ids` 的最終 adjudicated 基準。

---

## 6. 專案已驗證狀態確認

- [x] 40 queries 完美分層與 topic 隔離。
- [x] Leakage Validator 全數通過（無 split 間 leakage 或 lineage 混雜）。
- [x] 標註一致性高於 κ > 0.80 發表門檻。
- [x] Checksum 正式凍結至 repository 中。
