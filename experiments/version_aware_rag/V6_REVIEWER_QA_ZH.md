# V6 評審問答重點

## 這是在研究 RAG 還是 retrieval？

研究 endpoint 是 RAG pipeline 中的 evidence retrieval stage。V6 沒有證明生成答案改善，也不宣稱臨床效益。

## 96 題是否支持方法有效？

不支持。E−B 為 −0.03125，CI 包含 0，p=0.5，且沒有任何改善題。96 題提高了負面結果與 failure diagnosis 的可信度。

## 為何不能修好 candidate generator 後重跑？

V6 已執行唯一一次 fresh test。任何修正都已知悉正式結果，只能作 post-hoc development；要重新確認有效性必須建立新的 V7 fresh test。

## 0.5 boost 如何決定？

在既有已開封 V5 Development/Validation 比較六個預先列值。0.5、0.75、1.0、1.5 同分，因此依 tie-break 規則選最小的 0.5。

## Pairing 實際增加了什麼？

在 V6 explicit-history 中沒有增加任何東西，因 pair activation 為 0。這揭露了 canonical chunk endpoint 與最高 BM25 passage 不一致的架構問題。

## 為何安全 gate 通過仍不能說安全？

未觸發時 E 由定義保證等於 B，而歷史題 pairing 又未啟用。零新增 unsafe hit 是重要的實作確認，但不足以證明廣泛臨床安全。

## Top‑20 的意義是什麼？

用於隔離 candidate generation 與 reranking。V6 Recall@20 只有 0.4812，因此結果必須標示 candidate-limited，不能宣稱完整評估大型部署召回能力。

## AI 三重審查是否等同專家驗證？

不是。它是 source-grounded AI triangulation；模型可能共享訓練資料與偏誤。舊 16 題的單一營養師審查也不能外推到新 96 題。
