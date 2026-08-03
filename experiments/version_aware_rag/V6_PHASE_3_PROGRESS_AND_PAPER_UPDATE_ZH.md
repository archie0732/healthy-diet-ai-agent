# V6 核心實驗完成報告

更新日期：2026-08-01  
狀態：`PHASES 0–7 COMPLETE — NEGATIVE CANDIDATE-LIMITED RESULT`

## 完成內容

- 96 題完成三次隔離 AI 契約審查：92 題有三份合格審查，4 題有五份，缺口為 0。
- 三個 strata 各 32 題，涵蓋 67 個 lineage。
- 20 份官方 PDF、1,601 頁、3,535 個 deterministic page-bounded chunks 已封存。
- 133 個 required page-level evidence units 已解析為 chunk groups；重疊 chunk 不會增加指標分母。
- A–F、舊 V5 router、BM25、recency、pairing、tie-break、指標與統計規則均在 test 前凍結。
- 7/7 synthetic invariants 與 gold-isolation preflight 通過。
- Pair boost 經既有 V5 Development/Validation 比較後選為 `0.5`；0.5 以上四個值同分，因此依規則取最小值。
- 唯一一次 fresh retrieval 已完成：96 題 × 6 系統，共 576 筆 raw rows；retrieval 時 gold read count 為 0。
- 評估結果已由第二支獨立程式重算，所有 headline metrics 完全一致。

## 正式結果

| 項目 | 結果 |
|---|---:|
| E−B explicit-history mean Recall@3 | **−0.03125** |
| 95% lineage-clustered bootstrap CI | **[−0.078125, 0]** |
| Exact paired sign-flip p-value | **0.5** |
| Improved / tied / regressed | **0 / 30 / 2** |
| Candidate required micro Recall@20 | **0.4812** |
| Router precision / recall / F1 | **1.000 / 0.875 / 0.933** |
| E−B unsafe query-hit difference | **0** |
| E 新增 forbidden query | **0** |
| E explicit-history pair activation | **0 / 32** |

因此 V6 不支持「Conditional Version-Aware 優於 Recency」的 confirmatory claim。結果同時通過安全 gate，但因未觸發時 E≡B，且 explicit-history 中 pairing 完全沒有實際啟用，安全結果主要是實作不變量與低 activation 的確認，不能包裝成額外效能。

## Failure attribution

1. Explicit-history 的 69 個 required evidence groups 中，有 43 個未進入 Top‑20。
2. Router 漏掉 `v6q-eh-005`、`011`、`017`、`023`，共 4 題。
3. 最高 BM25 passage 沒有成為同時具備正分 mate 的 canonical relation endpoint，因此 E 在 explicit-history 的 pair boost activation 為 0。
4. E 實際退化為 C（明示歷史時只關閉 recency）；`eh-015`、`eh-016` 因此由 B 的 0.5 Recall 降為 0。
5. Candidate Recall@20 的 family 差異很大：school food 1.0、antenatal 0.846、haemoglobin 0.769，但 fiscal policy 為 0，infant NPPM 僅 0.32。

## 相較原計畫的關鍵更新

| 原計畫 | 實際更新 | 原因 |
|---|---|---|
| 四層 96 題 | 三層各 32 題 | conditional-merge 的舊證據不具必要性，保留會人為製造 gold。 |
| 約 100 題即可提高證據力 | 96 題確實提高了檢驗力，但推翻原正向預期 | 樣本增加的價值是更可靠地揭露候選召回與 endpoint activation 問題，而不是保證正結果。 |
| Boost 0.75 | Boost 0.5 | 0.5、0.75、1.0、1.5 在 prior Dev/Val 同分，依凍結規則取最小值。 |
| Pairing 預期改善歷史題 | Pairing 在正式歷史題零啟用 | Passage-level seed 與 canonical relation endpoint 的表示不一致。 |
| 可進行答案橋接實驗 | 暫不執行 V6 answer bridge | Retrieval 沒有正向增益，答案實驗無法作為改善傳遞證據；且沒有人工評估。 |

## 現在應如何修改論文

### 若仍以目前 V6 投稿

- 把 V6 寫成嚴格的 confirmatory falsification／negative validation，而非成功證明。
- 明確報告 candidate-limited：Top‑20 Recall 只有 0.4812，不能把 reranking 結果解讀成方法本身無條件無效。
- 同時承認方法在 passage-level corpus 的 operationalization 失敗：pair boost 零啟用，因此 V6 主要比較到的是 disable-recency，而不是有效 pairing。
- 原 16 題正向結果只能稱 pilot／feasibility evidence；96 題結果與其不一致，不能只呈現舊結果。
- 安全結果寫成 invariant verification，不寫成新的 empirical superiority。
- 論文核心貢獻可轉向：版本感知檢索的 benchmark construction、證據必要性審查，以及 passage-to-lineage alignment 對政策能否生效的必要條件。

### 若仍希望主張方法有效

不能修改 V6 後重跑並繼續稱 fresh confirmatory test。正確做法是：

1. 將 V6 96 題與結果轉為已開封 Development／diagnostic set。
2. 重新設計 chunk-to-lineage membership，使同一原子 recommendation 的所有合理重疊 chunks 都能映射到 lineage，而不是只靠單一 canonical endpoint。
3. 改善 candidate generator，例如 document/section-aware lexical retrieval、hybrid retrieval 或先做 lineage candidate retrieval。
4. 在 V6 上只做明確標示的 post-hoc development，確認 candidate Recall 與 activation。
5. 另建完全未使用的 V7 fresh test，再做一次新的 confirmatory validation。

這會增加工作量，但它是唯一能維持研究誠信、又重新取得正向主張機會的路徑。
