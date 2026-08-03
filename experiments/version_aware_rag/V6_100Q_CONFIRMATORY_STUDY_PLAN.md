# V6 約 100 題確認性研究計畫（Codex 執行版）

狀態：`CORE PHASES 0–7 COMPLETED / NEGATIVE CANDIDATE-LIMITED RESULT`  
建立日期：2026-08-01  
研究目標：補強 TANET 論文目前在研究範圍、樣本數、資料建置偏誤、基線公平性、參數依據、候選池規模與答案層級證據上的缺口。

> 執行後更新：本文件保留原始預註冊計畫。實際 benchmark 在 retrieval 前移除 `conditional_merge`，改為三層各 32 題；理由與完整結果見 `V6_PHASE_3_PROGRESS_AND_PAPER_UPDATE_ZH.md`。V6 fresh test 已執行一次，不得調參或重跑。

## 0. 給執行 Codex 的最高優先規則

1. 不得修改、覆寫或重新解釋既有 V3、V4、V5、R2.10 與 R2.11 的 frozen artifacts。
2. 原 16 題 R2.10 fresh test 必須保留為 pilot／feasibility evidence，不得併入新的主要確認性統計。
3. R2.11 的 56 題已執行過 Development retrieval，只能用於開發、消融、參數敏感度與錯誤分析，不得改稱 fresh test。
4. 新確認性測試在正式執行前，只能檢查格式、雜湊、資料洩漏與程式完整性；不得先看任何正式系統輸出。
5. 正式測試只執行一次。若因基礎設施失敗而中止，須保存失敗紀錄、判定是否有任何結果外洩，並由專案負責人決定是否仍可重啟。
6. Gemini、ChatGPT、Codex 可以協助找題、改寫及審查；任何單一 AI 產出一律只是候選資料，只有通過第 3 節的來源驗證、三模型一致與封存程序後，才能成為 AI-adjudicated gold label。Gemini 審查固定由使用者透過 Antigravity 執行；Codex 不得自行呼叫 Gemini。
7. 找不到足夠獨立題目時，先增加官方來源與版本譜系；禁止用近義改寫灌高樣本數。
8. 每一階段完成後才進入下一 gate。Gate 未通過時，先記錄負面結果，不得為了通過正式測試而事後改門檻。
9. 新 96–100 題預定不送營養師或其他人工專家逐題裁決，改採來源約束的 AI-only 多模型共識流程。論文必須明確揭露這一點。
10. 已送交一位營養師審查的舊題，須先確認其實際審查範圍（題目品質、gold evidence、檢索結果或生成答案）；該審查不得外推為新題的專家驗證。

## 1. 研究定位與預定論文主張

### 1.1 建議題目

> 查詢意圖驅動之版本感知檢索：面向演進式營養與健康指引的 RAG 證據選擇

英文可使用：

> Query-Intent-Driven Version-Aware Retrieval for Evidence Selection in RAG over Evolving Nutrition and Health Guidelines

### 1.2 範圍聲明

論文主要研究 RAG pipeline 的 retrieval stage。版本錯誤首先發生於證據選擇，因此主要實驗固定並隔離生成模型，以辨識檢索政策的因果影響。答案生成實驗作為次要、橋接性驗證，不宣稱臨床效益。

### 1.3 核心創新邊界

本研究不宣稱解決自動證據譜系建構。主要研究問題是：

- 何時應啟用 OLD–CURRENT／跨版本配對；
- 如何避免所有查詢無條件加入歷史證據；
- 如何在相同候選來源下區分候選召回與 Top-k 重排序效果；
- 如何分開衡量跨版本完整性與版本安全性。

### 1.4 允許與禁止的結論

允許：

- 在新的封存 benchmark 上，Version-Aware 是否改善 explicit-history evidence retrieval。
- Conditional-merge 是否仍為目前規則式路由器的能力邊界。
- 改善主要來自關閉 recency、lineage pairing，或兩者共同作用。
- 固定生成器下，檢索差異是否能傳遞至答案正確性、完整性及引用品質。

禁止：

- 宣稱已證明整體 RAG、臨床安全或醫療決策效益。
- 將人工建立的 lineage graph 說成自動發現能力。
- 將控制情境完全相同包裝成額外的經驗性提升；若由程式 invariant 保證，必須明說。
- 將 AI reviewer 當作獨立人類或臨床專家。
- 將舊題的單一營養師審查外推成新題的營養專家驗證。

## 2. 研究資料設計

### 2.1 樣本數

正式目標為 96 題，接近 100 題且便於平衡：

| Stratum | 題數 | 角色 |
|---|---:|---|
| `explicit_history` | 24 | 主要效果檢驗 |
| `conditional_merge` | 24 | 預先設定的邊界／負向能力測試 |
| `current_only` | 24 | 現行查詢控制 |
| `hard_negative_current` | 24 | 版本安全與高相似干擾控制 |
| **總計** | **96** | 新的 sealed confirmatory test |

最低可接受方案為 80 題、每類 20 題。低於 80 題時不得將研究描述為完整 benchmark validation，須維持 feasibility／targeted validation 定位。

### 2.2 獨立性要求

- 理想目標：96 題來自 96 個不同 evidence lineages。
- 可接受下限：至少 60 個不同 lineages，每個 lineage 最多 2 題。
- 同 lineage 多題時，主要信賴區間與統計檢定必須以 lineage 為 cluster。
- 每個 stratum 中，單一主題家族不得超過 25%。
- 至少涵蓋 8 個主題家族；目標為 10–12 個。
- 查詢文字改寫不得視為新的獨立樣本；可作 robustness set，但須另表報告。
- 新 test 必須排除所有既有 Development、Validation、V3/V4 fresh、R2.10 fresh 與 R2.11 lineages，以及重複 required-evidence signatures。

### 2.3 語料規模

正式檢索不得只在 32 筆原子證據中執行。應使用可稽核的完整 corpus，納入所有合格官方來源 chunks 與合理干擾證據。

每題至少紀錄：

- corpus chunk count；
- 所屬來源文件及版本；
- lineage ID；
- required、compatible、deprecated、forbidden、citation-safe IDs；
- candidate ranks at 5/10/20；
- final ranks at 1/3/5。

### 2.4 正式版本關係

資料層至少區分：

- `supersedes`
- `updates`
- `compatible_with`
- `narrows_scope`
- `expands_scope`
- `conditional_difference`
- `unrelated_or_forbidden`

`OLD`／`CURRENT` 只是版本角色，不等於 `deprecated`／`safe`。每個 gold judgment 必須依內容與適用範圍判定，不能只依年份判定。

## 3. AI 協作找題流程

### 3.1 AI-only 角色分離

| 角色 | 可使用工具 | 可看到的資料 | 不可做的事 |
|---|---|---|---|
| Candidate Miner | Gemini 或 ChatGPT | 官方 evidence pairs、來源頁面、stratum 定義 | 不可看 router code、boost、正式結果 |
| Query Challenger | 另一個模型或另一個 session | 候選題、來源證據 | 不可直接核准 gold label |
| Codex Orchestrator | Codex | manifest、validator、去重與 freeze 工具 | 不可用 test outcome 回頭改題 |
| AI Judge A | ChatGPT 獨立 session | 題目、來源原文、頁碼、rubric | 不可看 router、system identity、排名或分數 |
| AI Judge B | 使用者透過 Antigravity 執行 Gemini 獨立 session | 同上 | Codex 只準備封存 handoff package；不可自行執行 Gemini，且 Gemini 不可看 Judge A 結果或正式檢索結果 |
| AI Judge C | Codex 獨立審查 pass | 同上及結構 validator 結果 | 不可用多數決掩蓋來源不支持 |
| Process Owner | 專案負責人 | 模型分歧、來源與 audit trail | 只能處理流程／來源錯誤，不可看 test outcome 後刪題 |

新題 gold contract 採三個互不共享審查輸出的 AI passes。正式納入 test 的最低要求是三者對下列項目一致：題目可回答、stratum 正確、每筆 required evidence 必要、deprecated／forbidden 判定有來源依據。若不一致，題目退回 candidate pool 修改或排除；不得在看過 retrieval outcome 後重新裁決。

這是 `AI-triangulated, source-grounded annotation`，不是獨立人類共識。模型可能具有共同訓練資料與相似偏誤，因此「三模型一致」只能提高程序穩定性，不能宣稱等同三位獨立專家。

Gemini pass 的操作交接規則：Codex 準備凍結 prompt、來源摘錄、候選資料、輸出 schema、batch hash 與匯入說明後必須暫停並通知使用者。使用者以 Antigravity 完成 Gemini 審查，再將未修改的 raw output 與可取得的模型版本資訊交回。Codex 只驗證與匯入，不得用其他模型補做、模擬或冒充 Gemini 結果。

舊題的營養師審查另建 `LEGACY_NUTRITIONIST_REVIEW_SCOPE.md`，記錄審查者資格、審查日期、看到的材料、評分 rubric、原始結果及適用 query IDs。若只有一位營養師，報告為 single-expert review，不計 inter-rater agreement。

### 3.2 找題提示原則

給 Gemini／ChatGPT 的提示只包含：

- stratum 的自然語言定義；
- OLD、CURRENT 來源段落與頁碼；
- 要求產生自然、可回答、非模板化的查詢；
- 要求列出每題為何需要指定證據；
- 禁止猜測來源未陳述的醫療建議。

提示不得包含：

- router keyword list 或 regex；
- `history_pair_boost = 0.75` 等政策參數；
- BM25 結果、排名、gold IDs；
- 既有失敗題的答案或 test outcome。

### 3.3 題目品質 gate

每題必須通過：

1. Source entailment：來源確實支持 gold statement。
2. Necessity：required evidence 是回答題目不可缺少的內容。
3. Stratum validity：題型符合分層定義。
4. Non-triviality：不能只靠題目中的文件標題直接定位答案。
5. Leakage check：不包含 chunk ID、lineage ID、內部標籤或刻意迎合規則的語句。
6. Deduplication：與所有既有題目及新題沒有相同 required-evidence signature 或高度模板化重複。
7. Clinical wording check：不得把研究代理指標改寫成臨床安全結論。
8. AI consensus：三個隔離審查 pass 全數通過；任一模型指出來源不支持時，必須回到來源查核，不採簡單 2/3 多數決。

## 4. 實驗系統與必要消融

所有系統必須使用完全相同的 corpus、tokenization、BM25 參數、query text、candidate budget 與 tie-breaking。系統差異只能來自預先定義的排序／版本政策。

| ID | 系統 | 用途 |
|---|---|---|
| A | BM25 | 回答 Recency 是否傷害歷史證據 |
| B | BM25 + Recency | 主要 baseline |
| C | Intent + disable Recency only | 分離「關閉新近性」效果 |
| D | Always-on Lineage Pairing | 驗證無條件加入歷史證據的代價 |
| E | Conditional Version-Aware | 主要 proposed method |
| F | Conditional Version-Aware without pair boost | 分離 lineage boost 的邊際貢獻 |

若程式架構允許，可增加強基線：BM25+dense hybrid 或 frozen cross-encoder reranker；但不得因其加入而改變 A–F 的正式定義。

## 5. 參數與 Top-k 計畫

### 5.1 Boost 參數

只能在既有 Development／Validation 上比較：

`0、0.25、0.5、0.75、1.0、1.5`

選擇規則須在 test 前固定，至少同時考慮：

- explicit-history required Recall@3；
- both-evidence coverage；
- current/control deprecated or forbidden hit rate；
- conditional-merge 與 hard-negative 的損失。

若多個值同分，選擇最小 boost，以降低過度重排。正式 test 只執行已凍結值，不得在 test 上選參數。

### 5.2 Candidate 與 output k

- Candidate diagnostics：Recall@5、Recall@10、Recall@20。
- Primary output：Recall@3。
- Robustness：Recall@1、Recall@5、MRR、nDCG@3。
- Top-20 的定位是隔離候選召回與重排序，不得宣稱它模擬大型部署效率。

## 6. 指標與統計分析

### 6.1 唯一主要檢驗

主要比較：E（Conditional Version-Aware）對 B（Recency）在 `explicit_history` 的 per-query required-evidence Recall@3 差值。

必須報告：

- 平均差與絕對命中數；
- lineage-clustered paired bootstrap 95% CI；
- exact paired permutation 或適當的 paired test；
- improved／tied／regressed query counts。

### 6.2 共同主要安全 gate

在 `current_only` 與 `hard_negative_current`：

- deprecated/forbidden evidence query-hit rate 不得高於 Recency 的預設非劣界值；
- 非劣界值必須在 freeze 前以絕對差定義，不得看 test 後決定；
- 分母須同時報 query-level 與 retrieved-slot-level，避免「hit rate」定義不清。

### 6.3 次要指標

- explicit-history both-evidence coverage；
- conditional-merge required Recall@3 與 both-evidence coverage；
- current required Recall@3；
- candidate Recall@5/10/20；
- MRR、nDCG@3；
- router precision、recall、F1 與 confusion matrix；
- 每個 stratum 與 topic family 的分層結果。

多個次要假設須標記 exploratory，或採 Holm correction。Micro-Recall 必須搭配 macro per-query Recall，避免兩證據題具有較高權重而不透明。

## 7. 答案生成橋接實驗（AI-only exploratory）

此階段只能探索「evidence coverage 是否可能傳遞至最終答案」。由於新題不做人類或營養專家評估，無論使用多少 AI judges，都不能把結果寫成已驗證的答案品質提升。論文主要題目與結論應維持 retrieval-stage framing。

### 7.1 執行方式

- 對全部 96 題產生 B 與 E 的答案，固定同一模型、prompt、temperature、token limit 與 citation format。
- 可對全部 96 題進行三模型盲化 AI 評估，或預先分層抽定 48 題以控制成本。
- AI judges 只看到匿名系統代碼、query、answer、citations 與來源片段，不得看到 retrieval scores、system name、router decision 或其他 judge 的評分。

### 7.2 AI 評估指標

- answer correctness：0／0.5／1；
- version correctness：0／0.5／1；
- required-evidence completeness：0／0.5／1；
- citation entailment：0／0.5／1；
- applicability-boundary preservation：0／0.5／1；
- unsupported material claim：0／1。

三個 AI judges 的一致度、原始分歧與最終規則都必須保存。可報 Krippendorff's alpha 或 pairwise weighted kappa 作為「模型間一致度」描述，但不得稱為 human inter-rater reliability。答案結果必須標記 `AI-only exploratory evaluation`。

## 8. 執行階段、時間與 gates

以下時間為 Codex＋研究者的有效工作估計；AI API 回應與專案負責人抽查可平行進行。

| 階段 | 工作 | 預估有效工時 | 建議日曆時間 | Gate／交付物 |
|---|---|---:|---:|---|
| 0 | 論文定位、目標、主要指標與非劣界值定案 | 4–6 小時 | 0.5–1 天 | V6 protocol v1 |
| 1 | 舊資料 exclusion ledger 與來源容量 audit | 6–10 小時 | 1–2 天 | 至少能支撐 80 題，否則擴來源 |
| 2 | 官方來源補充、lineage mining、版本關係初審 | 20–35 小時 | 3–5 天 | 至少 60 個新 lineage、關係 validator 通過 |
| 3 | 96 題候選生成、去重、證據契約、三模型 AI 共識 | 18–30 小時 | 3–5 天 | 96 題 AI-triangulated sealed ledger |
| 4 | A–F baseline／ablation runner 與 metric audit | 12–18 小時 | 2–3 天 | 所有系統共享候選與 deterministic replay |
| 5 | Development／Validation 參數與 Top-k 敏感度 | 10–16 小時 | 1–3 天 | policy、參數、門檻全部 freeze |
| 6 | Fresh package freeze、hash、dry validation、一次執行 | 4–8 小時 | 1 天 | immutable raw outputs＋execution guard |
| 7 | 獨立重算、統計、錯誤分析與表格 | 8–14 小時 | 1–2 天 | reproducible statistical report |
| 8 | 96 題生成＋48–96 題三模型盲評 | 10–20 小時 | 1–3 天 | AI-only exploratory answer report |
| 9 | 修改論文、補圖表、limitations 與 rebuttal Q&A | 12–20 小時 | 2–4 天 | TANET submission draft |

### 8.1 總工時

- Retrieval 核心研究（階段 0–7）：約 82–137 小時。
- 加入 AI-only 答案評估與論文更新（階段 8–9）：總計約 104–177 小時。
- 集中全職執行：約 3–4.5 週。
- 每週投入 15–20 小時：約 5–9 週。

最大不確定性是新官方來源取得、96 題的獨立 lineage 容量、AI API 成本／速率限制與模型輸出一致性。AI-only 流程會縮短日曆時間，但不會消除 benchmark construction bias，論文必須保留此限制。

## 9. 逐階段執行細節

### Phase 0：Protocol freeze 前置決策

- [ ] 確認論文題目採 retrieval-stage framing。
- [ ] 確認主要比較為 E vs B、主要 stratum 為 explicit-history。
- [ ] 預先寫出安全非劣界值。
- [ ] 決定答案生成模型與 AI-only answer evaluation 要做 48 或 96 題。
- [ ] 建立 `LEGACY_NUTRITIONIST_REVIEW_SCOPE.md`，界定舊題營養師審查可支持的範圍。
- [ ] 建立 `data/v6_confirmatory/`、`configs/v6/`、`results/v6/`，不得混入舊版目錄。

### Phase 1：Capacity 與 exclusion audit

- [ ] 合併所有舊 split／annotation ledger 的 query、lineage、source page、required signature。
- [ ] 建立 `V6_EXCLUSION_LEDGER.jsonl` 與 SHA-256。
- [ ] 列出尚未使用的官方版本文件與可建立的 relation pairs。
- [ ] 估計每個 stratum 的可用題數與 topic distribution。
- [ ] 若不足 80 題，先停止建題並提出新增來源清單。

### Phase 2：Lineage 與版本關係

- [ ] 從官方文件抽取原子 evidence，保留頁碼、URL、年份與 source hash。
- [ ] AI miner 提出 candidate relation；三個隔離 AI judge passes 做來源約束語意審查，Codex 執行結構驗證。
- [ ] 明確區分 role、relation type、policy label 與 query-specific applicability。
- [ ] 檢查三版本以上 lineage，避免永遠假設只有一 OLD、一 CURRENT。
- [ ] 產出 source capacity report 與 reviewer packet。

### Phase 3：Query 與 sealed judgments

- [ ] Gemini／ChatGPT 在看不到 router 的情況下生成候選題。
- [ ] 第二模型做 ambiguity、answerability、template leakage challenge。
- [ ] Codex 檢查 exact／semantic duplication、topic cap 與 evidence signature。
- [ ] AI Judge A/B/C 分別審查 query contract；保存 prompt、model ID、版本、原始輸出與時間戳。
- [ ] 三者一致後才建立 sealed gold file；不一致題退回修改或排除。
- [ ] Query file 與 gold file 分離；runner 無權讀取 gold。

### Phase 4：Baseline、消融與 invariant tests

- [ ] A–F 六系統均從相同 ordered candidate pool 開始。
- [ ] 為每題儲存 raw BM25、recency component、intent decision、pair boost 與 final score。
- [ ] 自動驗證未觸發時 E 與 B 是否依設計完全一致。
- [ ] 若相同是 invariant，結果表明確標記為 implementation verification。
- [ ] 加入 wrong-seed failure test：最高 BM25 種子為干擾證據時，不應無條件提升錯誤 lineage。

### Phase 5：Development／Validation only

- [ ] 使用既有已開封資料做 boost sensitivity。
- [ ] 報告 BM25、Recency、disable-recency、always-on、conditional pairing。
- [ ] 完成 Top-k／candidate-k sensitivity。
- [ ] 寫出 policy selection rationale。
- [ ] Freeze code、config、corpus、query、router、relation graph、statistics plan 與 execution count。

### Phase 6：Fresh test

- [ ] 執行前驗證所有 hashes 與 exclusions。
- [ ] 只開啟 query text，不開啟 gold judgments。
- [ ] A–F 全部檢索完成並封存 raw output 後，才允許 evaluator 讀取 gold。
- [ ] 記錄一次性執行狀態、環境、Git commit、runtime 與軟體版本。
- [ ] 任何負面結果都保留，不移除「難題」或不利 topic。

### Phase 7：Independent recomputation

- [ ] 使用獨立 script 從 raw output 重算所有指標。
- [ ] 驗證共享候選池 ID、順序與 hash。
- [ ] 同時報 micro、macro、query-level、slot-level 指標。
- [ ] 建立逐題表與 failure taxonomy。
- [ ] 輸出 Markdown、JSON、CSV 三種結果，數值必須一致。

### Phase 8：AI-only answer bridge

- [ ] 在看結果前決定評估全部 96 題或抽定 48 題 AI-eval subset。
- [ ] 固定 B/E 的 answer generator。
- [ ] 建立 randomized blind package。
- [ ] 完成三模型 AI 評分、一致度與分歧分析。
- [ ] 檢驗 retrieval gain 是否能傳遞至 answer completeness／version correctness。
- [ ] 所有結果標記為 exploratory，不得宣稱人類或營養專家驗證。

### Phase 9：論文與評審問答

- [ ] 把 conditional-merge 稱為預先設定的 boundary test。
- [ ] 明說 lineage graph 是知識庫前置條件，不是本研究自動發現成果。
- [ ] 說明 `0.75` 或最後選定 boost 的 development/validation 過程。
- [ ] 主表至少呈現 BM25、Recency、disable-recency 與 Proposed。
- [ ] 將控制情境不變區分為 design invariant 與 empirical safety observation。
- [ ] 正式定義 deprecated-OLD hit rate 的兩種分母。
- [ ] 加入逐題或 repository appendix，保留可稽核路徑。

## 10. 對目前十項評審疑問的完成條件

| 疑問 | V6 解法 | 完成判準 |
|---|---|---|
| 是 RAG 還是 retrieval？ | 改題目與 scope；增加 answer bridge | Methods 有明確範圍段落，答案結果不過度外推 |
| 是否只是查表 pairing？ | C/F ablation、wrong-seed tests、創新邊界 | 能量化 disable-recency 與 lineage boost 各自貢獻 |
| conditional-merge 為何存在？ | 預註冊為 boundary test | 不將其 tie/failure 包裝成預期改善 |
| 16 題太少？ | 新的 80–96 題 sealed test | 原 16 題只列 pilot，新 test 獨立統計 |
| 建題偏向規則？ | router-blind AI candidate generation＋三模型隔離審查 | 保存提示、模型版本、時間順序、原始輸出、review ledger 與 hashes |
| 32 筆取 Top-20 太寬？ | 完整 corpus＋Recall@5/10/20 | 明確區分 candidate recall 與 reranking |
| boost 0.75 從哪來？ | dev/val sensitivity＋freeze | Test 前已有選擇規則與 checksum |
| Recency baseline 不夠？ | A–F baseline／ablation | 主表含 BM25 與 disable-recency condition |
| 控制情境不下降是否保證？ | invariant test＋安全結果分開寫 | 論文不把程式保證宣稱為新效果 |
| OLD 是否等於 deprecated？ | 正式 relation taxonomy | role、relation、policy、applicability 欄位分離 |

## 11. 停止條件與降級方案

立即停止正式 freeze 的情況：

- 新獨立 lineages 少於 60；
- 正式題數少於 80；
- 任一 stratum 少於 20 題；
- 單一 topic 超過該 stratum 25%；
- gold judgments 尚未完成審查；
- query builder 已看過 router 或正式 outcome，且無法替換污染題目；
- corpus、policy、query 或 split hashes 不完整；
- evaluator 能在 retrieval 完成前讀到 gold file。

降級方案：

1. 若只有 40–79 題：定位為 targeted replication，不稱完整 benchmark。
2. 新題固定採 AI triangulation，明列無獨立人類／營養專家驗證限制。
3. 答案評估只能列 AI-only exploratory evidence；若要宣稱答案品質提升，必須另開未來研究並取得人類盲評。
4. 若新來源不足：優先增加 WHO、FAO 或其他官方 guideline version pairs，不用 paraphrase 擴樣本。

## 12. 最終交付物清單

- `V6_PROTOCOL.md`
- `V6_EXCLUSION_LEDGER.jsonl`
- `V6_SOURCE_CAPACITY_AUDIT.md`
- `data/v6_confirmatory/corpus_manifest.json`
- `data/v6_confirmatory/queries.jsonl`
- `data/v6_confirmatory/judgments.sealed.jsonl`
- `data/v6_confirmatory/relations.jsonl`
- `configs/v6/*.yaml`
- `V6_POLICY_FREEZE_REPORT.md`
- `LEGACY_NUTRITIONIST_REVIEW_SCOPE.md`
- `V6_AI_ANNOTATION_METHOD.md`
- `V6_AI_JUDGE_AGREEMENT_REPORT.md`
- `V6_FRESH_TEST_MANIFEST.json`
- `results/v6/raw/*.jsonl`
- `results/v6/V6_RETRIEVAL_RESULTS.md`
- `results/v6/V6_STATISTICS_REPORT.json`
- `results/v6/V6_ERROR_ANALYSIS.md`
- `results/v6/answer_eval/*`（若執行答案橋接）
- `V6_PAPER_UPDATE_NOTES_ZH.md`
- `V6_REVIEWER_QA_ZH.md`
- `ARTIFACT_CHECKSUMS.sha256`

## 13. 整體完成定義

只有在下列條件全部成立時，Codex 才能把 V6 標為完成：

- 新 sealed test 至少 80 題，目標 96 題；
- 舊資料 exclusion 與新資料獨立性通過 validator；
- A–F 系統可重現且共享候選輸入；
- 參數在 test 前凍結；
- fresh retrieval 只執行一次；
- 原始結果可由獨立程式重算；
- 主要效果、CI、paired test、安全 gate 與負面結果完整報告；
- 論文主張沒有超出 retrieval／answer evidence；
- 新 96–100 題不得標示為人類或營養專家驗證。
- AI-only answer evaluation 僅作 exploratory；V6 不宣稱已由人類確認 RAG answer improvement。

## 14. 下一個 Codex 的起始指令

> 請依 `experiments/version_aware_rag/V6_100Q_CONFIRMATORY_STUDY_PLAN.md` 執行 Phase 0 與 Phase 1。先讀取所有相關 frozen manifest、split、annotation 與 result ledger，建立唯讀的 exclusion inventory 與新來源容量報告。不得產生或執行任何 fresh-test retrieval，不得修改舊 frozen artifacts。完成後回報可支撐的獨立 lineage 數量、四個 strata 的預估容量、缺少的官方版本來源，以及是否通過進入 Phase 2 的 gate。
