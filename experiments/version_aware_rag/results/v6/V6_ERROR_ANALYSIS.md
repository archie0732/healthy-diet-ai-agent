# V6 Failure Attribution

此分析在正式 single-use retrieval 後進行，只能解釋失敗，不得用來調參或重跑 V6。

- Router false negatives：4 題（v6q-eh-005, v6q-eh-011, v6q-eh-017, v6q-eh-023）
- E 實際啟用 pair boost：0 / 96 題
- Explicit-history 退步：2 題
- Candidate pool 遺漏 required groups：69 組

主要結論：Top-20 candidate recall 明顯不足，且 canonical relation endpoint 很少成為最高 BM25 seed，因此版本政策幾乎沒有可作用的正確 pair。這是 candidate-limited negative result，不得在本次 confirmatory test 修正後重跑。
