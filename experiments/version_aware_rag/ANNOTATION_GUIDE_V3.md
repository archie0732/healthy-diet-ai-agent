# Version-Aware RAG 標註指南 (ANNOTATION_GUIDE_V3)

本指南定義了 Version-Aware RAG v3 實驗的 Query 分層、證據標註類型、版本關係分類以及政策標籤。

---

## 1. 查詢分層 (Query Strata)

每道測試查詢（Query）必須歸類於以下四種分層之一，以衡量系統在不同情境下的檢索與推理能力：

1. **`current_only` (最新優先)**
   - 查詢所需知識在新版已被完全更新或取代，舊版知識完全過時。
   - **預期行為**: 排除所有舊版證據，僅取回最新版證據。
2. **`compatible_history` (相容歷史)**
   - 舊版知識依然有效（新版未提及或未衝突），可用於補充回答。
   - **預期行為**: 共同取回新版與有效的舊版證據。
3. **`conditional_merge` (條件式合併)**
   - 新版對特定族群或特定條件新增了例外，但舊版的一般規則依舊適用。
   - **預期行為**: 取回一般規則（舊版）與條件式例外（新版），避免給出扁平化的錯誤回答。
4. **`newer_irrelevant` (新版干擾)**
   - 包含與查詢主題詞極為相似、發表時間較新，但實質上未回答問題的 Chunks（Hard Negatives）。
   - **預期行為**: 辨識並排除無關的新版 Chunks，取回真正相關但時間較舊的 Chunks。

---

## 2. 證據標註類型 (Judgment Types)

對於每道 Query，標註者需將相關 Chunks 分類為以下集合：

- **`required_chunk_ids` (必要證據)**: 回答問題絕對必須包含的 Chunks。
- **`compatible_chunk_ids` (相容證據)**: 依然有效且可提供補充說明的 Chunks。
- **`preferred_chunk_ids` (最佳證據)**: 核心且最推薦引用的證據，必須為 `required` 或 `compatible` 的子集。
- **`deprecated_chunk_ids` (已失效證據)**: 內容已被新版取代、刪除或修改，已無效的 Chunks。
- **`forbidden_chunk_ids` (禁用證據)**: 嚴禁被取回或引用的 Chunks（如已被撤銷的安全政策）。
- **`citation_safe_chunk_ids` (安全引用)**: 適合且安全被最终回答引用的 Chunks，不可包含 `deprecated` 或 `forbidden` 內容。

---

## 3. 版本關係類型 (Relation Types)

定義同一 Lineage 下，舊版 Chunks 與新版 Chunks 的相互關係：

1. **`duplicate` (重複)**: 文字內容幾乎完全一致。
2. **`superseded` (被取代)**: 舊版內容被新版內容直接覆蓋或更改（例如數值上限從 10% 改為 10g）。
3. **`conflicting` (衝突)**: 新舊兩版在核心立場、指引上產生矛盾，且無適用對象之區分。
4. **`conditional_difference` (條件差異)**: 新版針對特定人群或條件提出了與舊版不同的例外。
5. **`complementary` (補充)**: 新版為舊版知識的擴充，兩者皆為正確且互相支持。

---

## 4. 政策標籤 (Policy Labels)

基於版本關係判定，Ingestion 階段應賦予舊版 Chunks 哪種政策狀態：

- **`retain` (保留)**: 維持正常檢索權重（如 complementary / conditional_difference 關係中的舊 Chunk）。
- **`down_rank` (降權)**: 舊 Chunk 仍有參考價值但應優先取回新版。
- **`deprecated` (失效)**: 舊 Chunk 已過時，應在 retrieval 階段被 filter 掉。
- **`evicted` (驅逐)**: 舊 Chunk 具安全隱患，必須強制移除並從 knowledge graph 卸載。
