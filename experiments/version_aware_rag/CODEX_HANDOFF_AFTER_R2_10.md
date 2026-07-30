# Codex Handoff：Version-Aware RAG after R2.10

更新日期：2026-07-24  
工作目錄：`experiments/version_aware_rag`

## 1. 新對話的任務

從已封存的 R2.10 結果繼續研究，但不得修改或重跑 R2.10 fresh
test。下一個 development cycle 應專門改善：

1. implicit `conditional_merge`；
2. retained compatible history；
3. 在不增加 stale／forbidden evidence 的前提下，讓 Version-Aware
   在上述 strata 優於 Recency。

新對話開始時，請先讀本文件及第 3 節列出的主要 artifacts，再提出並執行
新的 Development-only 計畫。

## 2. 目前可以與不可以宣稱的結論

### 可以宣稱

在目前的 atomic-claim、共享 BM25 Top-20、Top-3 retrieval 設定下，
凍結的 Version-Aware policy 對「明確要求歷史與目前證據」的問題優於
Recency baseline。

R2.10 fresh-test 結果：

| Endpoint | Recency | Version-Aware |
|---|---:|---:|
| Overall required micro Recall@3 | 0.6250 | 0.8333 |
| Explicit-history required micro Recall@3 | 0.3750 | 1.0000 |
| Explicit-history both-evidence coverage | 0.0000 | 1.0000 |
| Conditional-merge required micro Recall@3 | 0.5000 | 0.5000 |
| Current-only required micro Recall@3 | 1.0000 | 1.0000 |
| Hard-negative-current required micro Recall@3 | 1.0000 | 1.0000 |
| Deprecated-OLD hit rate | 0.0000 | 0.0000 |
| Required candidate micro Recall@20 | 1.0000 | 1.0000 |

### 仍不可宣稱

- Version-Aware 對所有 query types 整體優於 Recency；
- Version-Aware 已能辨識 implicit conditional merge；
- answer-level 品質優於 Recency；
- 結果已經過獨立、盲測或臨床審核；
- explicit-history 結果達傳統統計顯著。

Fresh explicit-history stratum 只有 4 題，四題均改善，但 two-sided exact
sign-test `p = 0.125`。

## 3. 必讀 artifacts

1. `V5_R2_10_FRESH_TEST_RESULT.md`
   - R2.10 結果、claim boundary 與限制。
2. `results/v5/r2_10_fresh_test/FRESH_TEST_RESULT.json`
   - 正式 machine-readable metrics 與 gate。
3. `results/v5/r2_10_fresh_test/INDEPENDENT_AUDIT.json`
   - 從 raw rows 獨立重算的結果。
4. `results/v5/r2_10_fresh_test/raw_retrieval_results.jsonl`
   - 每題、每系統的共享 candidate pool、分數及 Top-3。
5. `data/configs/v5_r2_10_frozen_policy/FROZEN_POLICY_PACKAGE.json`
   - R2.10 frozen policy。
6. `data/configs/v5_r2_10_frozen_policy/FRESH_TEST_GUARD.json`
   - fresh-test execution count 已鎖定為 `1`。
7. `V5_R2_8_SHARED_POOL_RETRIEVAL_RESULT.md`
   - Development retrieval 結果。
8. `V5_R2_9_RETRIEVAL_VALIDATION_RESULT.md`
   - one-shot Validation 結果。
9. `SOURCE_CATALOG.md`
   - 所有官方來源、URL 與本地 provenance。
10. `results/v5/r2_10_fresh_test_cycle/ARTIFACT_CHECKSUMS.sha256`
    - R2.10 最終 22 個 artifacts 的 checksums。

## 4. 不可變更與禁止事項

### R2.10 已封存

- Review packet content SHA-256：
  `b3923d62ba18fed6ed70b21cfe80819885768c378ce5afa0e1846c54c7d69ca3`
- Frozen policy SHA-256：
  `4491f19fd3de101022c81e1f5cde8669a4a82ed0d172b11e5627f853a4fd5835`
- Fresh-test execution count：`1`
- R2.10 不得重跑、補跑、刪題、換 endpoint 或調參。

### 新 development cycle 的限制

- 不得把 R2.10 fresh outcomes 用作訓練特徵或逐題規則；
- 不得使用 judgments 作 retrieval／reranking 特徵；
- 不得針對 query ID、topic、lineage ID 寫 hard-coded fallback；
- 必須維持 Recency `lambda = 0.75`；
- 所有比較系統必須取得 byte-identical ordered candidate pool；
- 必須保存 raw retrieval scores、Top-20、Top-3、latency、config 與 checksums；
- 模型選擇與權重調整只能在新 Development split 進行；
- Validation 只能在 policy freeze 後執行一次；
- 未重新 freeze 前不得建立下一份 fresh test；
- 暫不使用 Gemini／Gemma API；若採用模型，優先使用本地或使用者明確允許的
  GPT 服務，並完整保存 model ID、版本與 config。

## 5. 下一階段建議：R2.11 Development-only

### 5.1 先建立新資料，不修改舊 test

建立 lineage-disjoint 的新 Development dataset：

- `conditional_merge`：至少 16 個 lineage groups；
- `compatible_history`：至少 16 個 lineage groups；
- `current_only` control：至少 12 個 lineage groups；
- `hard_negative_current` control：至少 12 個 lineage groups。

每題必須明確標示：

- `required_current_evidence`；
- `required_retained_evidence`；
- `deprecated_evidence`；
- 為何 query 在沒有年份關鍵字時仍需要 retained evidence；
- 官方 URL、PDF URL、頁碼或 chunk ID、source SHA-256。

資料建立時不得查看 R2.10 retrieval outcomes 來挑選容易成功的題目。

### 5.2 建立 implicit merge detector

Development-only 比較至少以下方法：

1. Recency baseline；
2. R2.10 explicit-history router；
3. deterministic implicit-merge feature baseline；
4. embedding reranker；
5. cross-encoder reranker（若有可重現模型）。

Detector／reranker 可以使用 query 與 candidate text，但不可讀：

- required／deprecated labels；
- query ID；
- lineage gold label；
- test split；
- R2.10 per-query outcome。

### 5.3 Candidate-pool 與 policy 分開診斷

每題先判定失敗階段：

1. required evidence 是否進入共享 Top-20；
2. 若未進入：candidate-recall failure；
3. 若已進入但未進 Top-3：reranking／policy failure；
4. 是否錯誤提升 deprecated／forbidden history。

Candidate-recall 與 reranking endpoints 不得混為同一個 Recall 指標。

### 5.4 預先註冊 Development promotion gate

建議在執行前寫入 protocol：

- conditional-merge required micro Recall@3 `>` Recency；
- compatible-history required micro Recall@3 `>` Recency；
- both-evidence coverage `>` Recency；
- current-only required micro Recall@3 `>=` Recency；
- hard-negative-current required micro Recall@3 `>=` Recency；
- stale／deprecated／forbidden hit rate `<=` Recency；
- required candidate micro Recall@20 `>= 0.90`；
- 100% shared-pool ID、順序與 hash 相同；
- 至少報告 paired bootstrap CI 或 paired exact test，不只報平均值。

若 Development gate 不通過，繼續留在 Development，不可開 Validation。

### 5.5 通過 Development 後

依序執行：

1. freeze detector、policy、模型、權重、prompt、data、endpoints；
2. 建立全新 lineage-disjoint Validation；
3. 在看不到 judgments 的情況下執行一次 retrieval；
4. 完成 raw-artifact recomputation 與 checksum audit；
5. Validation 通過才規劃下一個 fresh held-out test。

## 6. 建議的第一個實作任務

新 Codex 對話應先：

1. 建立 `R2_11_IMPLICIT_MERGE_DEVELOPMENT_PROTOCOL.md`；
2. 盤點現有 sources 是否能支援第 5.1 節的樣本數；
3. 列出不足的 topic／lineage 與需要新增的官方文件；
4. 更新 `SOURCE_CATALOG.md`；
5. 建立 annotations schema 與 validator tests；
6. 在任何 retrieval 實驗前 freeze Development ledger checksum。

## 7. 驗證指令

目前完整測試：

```powershell
bun test experiments/version_aware_rag/tests
```

R2.10 封存時結果為：

```text
129 pass
0 fail
```

核對 R2.10 checksums 時，應以
`results/v5/r2_10_fresh_test_cycle/ARTIFACT_CHECKSUMS.sha256`
逐檔執行 SHA-256 重算。

## 8. 新對話可直接使用的指令

將以下文字貼給新的 Codex：

> 請先完整閱讀
> `experiments/version_aware_rag/CODEX_HANDOFF_AFTER_R2_10.md`，
> 接續執行其中的 R2.11 Development-only 工作。先檢查現有 artifacts、
> git 狀態與 guard，不得重跑或調整 R2.10 fresh test。請先建立詳細 protocol，
> 再依序實作、測試、保存 raw artifacts 與 checksums。
