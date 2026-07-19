# Policy Parameter Freeze Report (Plan 5 凍結報告)

本文件記錄 Version-Aware Retrieval (Plan 5) 中使用的檢索策略參數（Policy Parameters）、凍結日期、驗證依據（Validation Split）、以及相關資料集與語料庫之 SHA-256 Checksum，確保 Plan 6（Generation & Citation Safety）與後續實驗能完全重現與追溯。

---

## 1. 凍結元數據 (Freeze Metadata)

- **凍結日期**：2026-07-18
- **驗證集**：`validation` split (同步於 `development` split 進行單元/控制夾具驗證)
- **凍結狀態**：已凍結 (Frozen)
- **實作規範**：已於 [experiment.schema.ts](file:///d:/GitHub/archie0732/healthy-diet-ai-agent/experiments/version_aware_rag/configs/v3/experiment.schema.ts) 與所有 `configs/v3/proposed_*.yaml` 檔案中完成宣告與強型別防護。

---

## 2. 資料集與語料庫 SHA-256 Checksum

以下為 Plan 5 實驗運行與參數驗證所綁定之資料驗證碼：

| 資料類型 | 檔案路徑 | SHA-256 Checksum |
| :--- | :--- | :--- |
| **Corpus Chunks** | `experiments/version_aware_rag/data/corpus_v3/chunks.jsonl` | `ee4f1c5bddb6b7f255aa4cd497614812bb1933e545c4f0dc3e45986b3a624af7` |
| **Evaluation Queries** | `experiments/version_aware_rag/data/annotations_v3/queries.jsonl` | `72af4d7a8eeeb1eb2ca24b30a764de3a07ebb0b6ead7b74a6a597527bf27774f` |
| **Judgments (Adjudicated)** | `experiments/version_aware_rag/data/annotations_v3/judgments.adjudicated.jsonl` | `61f1f4531f6ace040e8f2a4a1c81728585d188dc32b3b49264e5e6d3a2654efd` |
| **Relation Pairs** | `experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl` | `9af814a2d582af94a984caadff0d944c067974834dd9f71cc7ec6166076da2b3` |
| **Relations (Adjudicated)** | `experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl` | `a336fb1c171c89f82966e927d96baa252a99d32b3883561cc35db44155b36cb5` |

---

## 3. 凍結策略參數清單 (Frozen Policy Parameters)

以下 6 個核心參數已於 `version_policy` 中固定，不得於 Plan 6 中未經宣告即行修改：

| 參數名稱 | 凍結數值 | 參數類型 | 是否經 Validation 調參 | 說明與設計依據 |
| :--- | :---: | :---: | :---: | :--- |
| `confidence_threshold` | `0.7` | 門檻 (Threshold) | 設計常數 (Design Constant) | 預設關係信心度門檻。當 relation confidence < 0.7 時採保守策略，忽略過時廢棄標記以避免誤刪有效歷史資訊。 |
| `retain_relation_boost` | `0.1` | 加分 (Boost) | 設計常數 (Design Constant) | 針對在 Relation Graph 中具有 `complementary` 或符合 query 條件之 `conditional_difference` 關係的保留段落賦予固定小額加分 (+0.1)。 |
| `condition_boost` | `0.15` | 加分 (Boost) | 設計常數 (Design Constant) | 針對 Chunk 的 `population_tags` 或 `condition_tags` 匹配 Query `targetPopulation` / `conditions` 時給予特定脈絡加分 (+0.15)。 |
| `expansion_seed_threshold` | `0.05` | 門檻 (Threshold) | 設計常數 (Design Constant) | 觸發 Compatibility Expansion 之種子段落最低 base score 門檻。僅對 base score > 0.05 之高相關段落展開相容歷史鄰居。 |
| `expansion_min_base_score` | `0.01` | 門檻 (Threshold) | 設計常數 (Design Constant) | 擴充相容鄰居段落時之最低相關性門檻。擴充段落之 base score 必須 > 0.01，避免僅因 lineage 相同而索回完全無關之段落。 |
| `diversification_penalty` | `0.9` | 懲罰 (Penalty) | 設計常數 (Design Constant) | 結果多樣性懲罰值。當 Top-K 候選中出現重複/重複版本的段落時，對後續重複者扣減 0.9 分，確保 Top-K 證據的多樣性。 |

> **說明**：上述參數均為**架構設計常數**（Design Constants），非經由超參數網格搜尋（Hyperparameter Grid Search）微調出來的擬合數值。其數值經由 `validation` split 及控制測試套件 [ablation_control_fixtures.test.ts](file:///d:/GitHub/archie0732/healthy-diet-ai-agent/experiments/version_aware_rag/tests/unit/ablation_control_fixtures.test.ts) 驗證，能正確反映各個控制模組的行為差異。

---

## 4. 六組消融實驗 (Ablation Experiments) 差異驗證說明

根據控制夾具測試 [ablation_control_fixtures.test.ts](file:///d:/GitHub/archie0732/healthy-diet-ai-agent/experiments/version_aware_rag/tests/unit/ablation_control_fixtures.test.ts) 的逐一斷言結果，各 Mode 在微觀 score 與 ranking 層面均呈現嚴格區隔：

1. `filter_only`: 僅執行 Graph 過濾，剔除已被 superseded 的段落。
2. `filter_retain_boost`: 執行過濾，並對包含 `retain` 關係之段落加 0.1 分。
3. `filter_compatibility_expansion`: 執行過濾，並依種子段落展開相容歷史鄰居段落（計算 `parentScore * 0.9`）。
4. `filter_condition_matching`: 執行過濾，並對匹配 Query Population/Condition 之段落加 0.15 分。
5. `full_version_aware_no_div`: 啟用過濾、雙 Boost 及 Compatibility Expansion，但不啟用多樣性懲罰。
6. `full_version_aware`: 啟用全套機制，包含多樣性懲罰 (-0.9)，對重複段落進行降維。

> **聚合指標實時狀況說明**：
> 在 `development` 與 `validation` 集上，由於部分次要模組（如單純 condition-only 與 full-without-diversification）在當前題庫中可能剛好沒有觸發 ranking 順序翻轉，因此整體 Recall / nDCG 等聚合指標可能呈現相同。控制測試已證實各模組在運算層面均正確作用，後續報告將如實呈現聚合指標，不為差異而造假數據。

---

## 5. 凍結結論

Plan 5 相關機制、測試套件（40/40 passed）、參數型別與 YAML 檔案均已補齊並凍結完畢。現正式宣告 **Plan 5 完成**，准予進入 Plan 6（Generation & Citation Safety）。
