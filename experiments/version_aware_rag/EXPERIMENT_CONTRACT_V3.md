# Version-Aware RAG 實驗契約 (EXPERIMENT_CONTRACT_V3)

## 1. 系統定義與可用資訊範圍

本實驗公平比較三種檢索（Retrieval）模式。為確保比較的公正性，各模式在檢索階段能使用的資訊定義如下：

| 檢索模式 | 基礎相關性得分 | 可用版本與政策資訊 | 禁用資訊 |
| :--- | :--- | :--- | :--- |
| **Append-Only** | 僅依據查詢與 Chunks 的 text/topic 相似度算分 | 無 | 任何版本、時間、關係或政策狀態 |
| **Recency-Only** | 與 Append-Only 相同 | 僅 Document / Chunk 的發表年份 (`published_year`)，用於加權或衰減 | 任何版本關係、衝突狀態、政策狀態或 Query Judgment |
| **Version-Aware** | 與 Append-Only 相同 | Ingestion 階段產面的版本關係、政策狀態、適用條件等 Metadata (詳見下述) | Query Judgment (金標)、Oracle Lineage ID、Test Labels |

### Version-Aware Ingestion Metadata 允許使用欄位：
在 Ingestion 階段（Query 出現前），可對 Corpus 進行預處理並產出以下資訊供檢索時使用：
- `relation_type`: `duplicate`, `superseded`, `conflicting`, `conditional_difference`, `complementary`
- `policy_state`: `active`, `retain`, `down_rank`, `deprecated`, `evicted`
- `valid_from`, `valid_to`
- `applicable_population`, `condition`
- `supersedes_chunk_ids`, `compatible_chunk_ids`

---

## 2. 嚴格禁用之 Oracle 資訊 (Oracle-Free Rule)

為防止 Version-Aware 方法「反向對齊」測試集，檢索器在處理單一 Query 時，**絕對禁止**讀取或利用以下任何資訊：
1. 該 Query 的人工標註結果（如 `acceptable_chunk_ids`、`preferred_chunk_ids`、`deprecated_chunk_ids`、`citation_safe_chunk_ids`）。
2. 由人工指定的「正確 Lineage ID」。檢索器必須僅透過查詢文字進行檢索，不得事先知曉該 query 對應哪一個 lineage。
3. 任何由 test label 反推的 query-specific boost。

---

## 3. 資料集切分與盲測規範 (Split Lock Rules)

實驗資料集切分為三：
- **Development Split**: 用於 Prompt 設計、啟發式規則開發與錯誤分析。
- **Validation Split**: 用於超參數調優、模型選擇。
- **Held-out Test Split**: 用於最終效能衡量。

### 盲測守則：
1. 開發與調優階段**僅允許**使用 `development` 與 `validation` 切分集。
2. `test` 切分集在所有系統實作與參數凍結前必須保持 Blind（盲測狀態）。
3. 只有在 Plan 6 完成且系統完全凍結後，才能以 `--split test` 執行 held-out 評估。
4. 嚴禁在看過 test 結果後回頭調整 Ingestion rules 或 Prompt。
