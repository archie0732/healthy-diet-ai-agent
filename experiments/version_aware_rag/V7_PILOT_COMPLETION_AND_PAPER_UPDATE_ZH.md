# V7 Fresh Pilot 完成報告與論文修改建議

## 一、結論先行

V7 已依預先凍結的方法完成唯一一次 fresh held-out retrieval run。40 題均先通過三次隔離 AI 審查，正式 runner 未讀取 gold labels，也未呼叫任何外部模型。

主要比較為 conditional Version-Aware retrieval（E）相對 BM25 + Recency（B），在 20 題 `explicit_history` 的 Recall@3：

- 平均配對差異（E − B）：`+0.425`
- 95% lineage-clustered bootstrap CI：`[0.275, 0.575]`
- exact paired sign-flip two-sided p：`0.000244140625`
- 改善／持平／退步：`13 / 7 / 0`
- 路由 TP/FN/FP：`20 / 0 / 0`
- lineage pair 啟用：`20/20`
- 選中正確 gold lineage：`15/20`
- 全體 candidate Recall@20：`0.933333`
- B 與 E 在 20 題 current/safety queries 的 unsafe hit@3：均為 `0`
- 所有未觸發歷史路由的題目皆有 `E = B`，符合設計 invariant。

結果支持「在這個受控、小型、retrieval-stage fresh pilot 中，條件式 lineage pairing 能改善明示歷史查詢的必要證據覆蓋」，但不應外推為大型知識庫、生成答案品質或臨床安全已獲證明。

## 二、原計畫與目前計畫的差異

| 項目 | 原始想法 | 實際完成的修正版 | 修改原因 |
|---|---|---|---|
| 題數 | 直接擴充到約 100 題 | 先做 40 題 V7 fresh pilot：20 explicit-history、10 current-only、10 hard-negative-current | 先驗證修正後方法是否真的可運作，避免一次製造 100 題後才發現設計錯誤 |
| V6 定位 | 可能作為主要驗證 | 改列 opened-data development diagnostic | V6 曾出現 pair activation 0/32、標籤重疊與 router/runtime 不一致，不能再當獨立 confirmatory test |
| conditional-merge | 原本列為主要情境 | V7 移除 | 來源顯示 current 文件本身已足以回答，硬要求舊版會人為製造 cross-version necessity；可在論文中保留為 V6 邊界／負向能力結果 |
| 證據呈現 | 曾使用表格擷取或頁面文字 | 改為可稽核的 structured textual descriptions | 避免 AI 無法可靠解讀表格、或因抽取遺失欄位而錯判 answerability |
| 題目審查 | AI 輔助 | 三次隔離 AI 審查；有問題只修改題目後做 delta re-review，最後合併成三份 40/40 帳本 | 降低單一模型偏誤，保留完整審查軌跡；不得稱為營養師或專家共識 |
| 方法調整 | 邊做題邊修 | V7 題目撰寫前凍結 core、relations、chunks、Top‑20、reserve=2、boost=0.5、recency=0.75 | 避免依 fresh-test 結果調參 |
| 正式執行 | 一般重跑式實驗 | sealed query/gold、hash manifest、runner 不讀 gold、single-use guard | 建立可稽核的 held-out 流程，防止 outcome-aware rerun |
| 人工評估 | 舊 16 題已有營養師 | 新 40 題使用 AI triangulation；舊營養師資料不與 V7 假裝成同一標註流程 | 誠實區分 human-reviewed legacy set 與 AI-reviewed fresh set |

## 三、這次結果回答了哪些評審問題

### 1. Lineage pairing 是否只是恢復 BM25？

不是。在 explicit-history 題中，A（BM25）、B（BM25 + Recency）、C/F（偵測歷史意圖後關閉 recency、但沒有 pair boost）的 macro Recall@3 都是 `0.100`；E 為 `0.525`。因此 E 相對 B 的 `+0.425` 並非只靠移除 recency，而是本次資料中由條件式 lineage pairing 帶來的增量。

### 2. 沒有傷害其他情境是否為經驗結果？

主要是設計 invariant。未觸發 explicit-history 時，E 按定義沿用 B；V7 的作用是確認實作確實達成 `E = B`，不能把這件事描述為額外的經驗性優勢。

### 3. Always-on pairing 為何不採用？

D（always-on lineage pairing）在 current-only 與 hard-negative-current 的 recall 較高，但 hard-negative-current unsafe hit@3 為 `0.10`，而 B/E 為 `0`。這說明無條件加入版本配對可能提高覆蓋，同時帶入舊版錯誤證據；條件路由的目的在控制這項風險。

### 4. 候選池是否仍是瓶頸？

是。全體 candidate Recall@20 為 `0.9333`，explicit-history 為 `0.90`；`v7q-eh-015` 與 `v7q-eh-016` 的必要證據皆未進候選池。這兩題不可能由後續 reranker 補救，應列為 candidate-generation failure，而不是 Version-Aware policy failure。

### 5. Lineage 選擇是否已完全解決？

否。20 題均啟用 pairing，但只有 15 題選到 gold lineage。錯誤題為 `v7q-eh-002`、`015`、`016`、`019`、`020`。其中 `v7q-eh-020` 雖選錯 lineage，Recall@3 仍由 0 提升至 0.5，顯示「retrieval 指標改善」與「pair identity 正確」必須分開報告。

## 四、論文建議修改

### 題目與研究範圍

若保留 Version-Aware RAG 題名，請在摘要、前言與方法開頭明寫：

> 本研究聚焦 RAG pipeline 的 retrieval stage。版本錯誤首先發生於證據選擇，因此刻意隔離生成模型，以避免不同 LLM 的生成差異混淆檢索政策效果。本研究不評估最終答案品質，生成端評估列為後續工作。

更保守的題名可改成「Version-Aware Retrieval for RAG」或在副標題加入「A Retrieval-Stage Study」。

### 方法與創新主張

明寫本研究不解決自動 lineage discovery：

> 本研究假設知識庫已有可稽核的版本關係，研究問題是何時啟用版本配對，以及如何在共用候選池內選擇性保留跨版本證據。

系統表至少保留 A、B、C/F、D、E，以呈現：BM25、Recency、只關閉 recency、always-on pairing、conditional pairing。這能直接回答「E 是否只是回到 BM25」及「為何不能 always-on」。

### 實驗敘述

將 V7 稱為 `fresh held-out pilot`，不要稱為完整 benchmark。建議主要報告：

- E−B explicit-history paired Recall@3 difference、CI、exact p-value及 13/7/0。
- candidate Recall@20 與兩個 candidate miss cases。
- pair activation 與 correct-lineage rate 分開呈現。
- current-only/hard-negative-current 的 unsafe hit@3。
- `E = B` 是演算法 invariant，實驗僅確認實作。

`safety noninferiority pass` 不宜寫成臨床安全已證明。20 題中 B/E 均為零且 E=B 是由政策邏輯保證；較準確的文字是「在預設 margin 下點估計符合非劣性條件，並確認未觸發查詢的實作 invariant」，同時承認樣本小且沒有生成端安全評估。

### 題目與標註來源

方法段應列出時間順序：方法凍結 → 題目與 gold draft → structured textual evidence → 三次隔離 AI 審查 → delta 修訂與重審 → sealed hashes → runner 不讀 gold 的唯一一次執行 → 解封評估。

標籤稱為 `AI-triangulated, source-grounded annotations`。舊 16 題可另外描述為 nutritionist-reviewed legacy feasibility set，但不可和 V7 合併後宣稱全部由營養師驗證，也不建議直接合併計算一個 p-value。

### 限制與後續工作

- 語料僅 32 個 chunks、Top‑20 候選池很寬，主要用於隔離候選召回與 Top‑3 重排序，不代表大規模部署效率。
- 40 題仍是小型、來源受控的 pilot；三次 AI 審查不能替代領域專家驗證。
- 5/20 lineage selection 錯誤與 2/20 candidate miss 顯示自動 relation selection/candidate generation 仍需改善。
- 尚未評估生成答案的 correctness、citation entailment、版本比較完整性與使用者風險。
- boost 0.5 來自 V6-R development，不得稱為普遍最佳值；V7 執行後不可用同一批題目重新調參並再宣稱 confirmatory。

## 五、是否還要擴到 100 題

V7 已證明「修正版有訊號」，因此 40 題不是白做，也不需要為了湊數立即把同類模板複製成 100 題。若投稿篇幅與時間有限，可把 V7 作為 fresh pilot，搭配完整 protocol、逐題附錄與限制聲明。

若要把證據強度提升到 benchmark validation，下一步應建立新的 V8，而不是重跑 V7：先固定新的樣本數與 lineage 分層，加入更多文件、更多版本鏈（含三個以上版本）、中文查詢與 paraphrase groups，並再次先封存再執行。新增題目應增加獨立 lineage／來源覆蓋，而非只把同一數值改寫成多個近重複問句。

