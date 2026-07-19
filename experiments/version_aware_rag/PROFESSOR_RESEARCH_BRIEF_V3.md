# Version-Aware RAG for Evolving Nutrition Guidelines

## 研究說明

**研究階段：** 實驗系統與凍結資料集已完成；held-out answer blind evaluation 正在徵求兩位獨立評分者。  
**研究領域：** Information Retrieval、RAG、Knowledge Graph、可信任 AI、健康資訊系統。  
**研究性質：** 可重現的實證研究；目前結果採取負結果與 trade-off 分析的誠實定位，不宣稱已證明方法優於所有 baseline。

---

## 1. 一頁摘要

大型語言模型結合 RAG 後，能從文件中擷取資訊回答問題；但在營養、醫療政策、法規與技術規格等**會隨版本更新的知識領域**，舊文件即使文字相似、檢索分數很高，也可能已被新版本取代或只適用於特定族群。傳統 RAG 容易因此回覆過時、條件不完整，甚至相互衝突的建議。

本研究提出並實作一個 **Version-Aware RAG** 實驗框架：

- 將 2015 與 2025 年版美國 Dietary Guidelines 文件切成可追溯的 evidence chunks。
- 為版本間的段落建立 `superseded`、`deprecated`、`compatible`、`conditional_difference` 等關係與適用條件。
- 在檢索階段使用 policy-aware filtering、保留關係加權與 compatibility expansion，嘗試避免過時證據被優先採用。
- 以 append-only、recency-only、oracle-relation graph、predicted-relation graph 比較檢索與答案品質。
- 以 checksum、config freeze、no-oracle execution order、held-out split 和 blind human evaluation 維持可重現性與研究誠信。

目前的 held-out test split 有 8 題。結果顯示：本研究的 proposed policy 在這個小型測試集上**尚未優於 Recency-Only baseline**；兩者 stale hit rate 同為 12.5%，但 Proposed 的 Recall@3 與 nDCG@3 較低。因此研究目前最有價值的主張不是「已經勝過 baseline」，而是系統性展示：**當 version policy 與 relation detector 尚不夠準確時，安全約束可能帶來 relevance/completeness 損失；這個 safety–relevance trade-off 必須被量化與誠實報告。**

這個研究適合作為資訊工程推甄或與教授討論的作品，因為它不只完成 RAG 原型，也處理了實驗設計、資料版本、評估洩漏、統計檢定、負結果分析與人工評測設計。

---

## 2. 研究問題與目的

### 2.1 研究問題

當同一主題有多個發布版本，且建議會因族群、健康狀態或條件不同而改變時：

1. 傳統 lexical RAG 是否會檢索到已被取代或不適用的段落？
2. 將版本關係與適用條件放入 retrieval policy，是否能降低 stale / unsafe evidence？
3. relation detector 的誤差如何傳播到 retrieval 與 final answer？
4. 在小樣本、真實 frozen held-out data 上，安全性限制與廣泛相關性之間的 trade-off 是什麼？

### 2.2 研究目的

- 建立一個可重現、可稽核的 version-aware RAG benchmark。
- 將「文件新舊」提升為可運算的 version relation 與 policy，而非僅以年份排序。
- 比較 append-only、recency-only 和 policy-aware retrieval 的 evidence quality。
- 區分 oracle relation graph 與 predicted relation graph，避免把理想標註關係誤當成可部署能力。
- 將自動 citation proxy metrics 與真人盲評嚴格區隔，避免自動規則被誤稱為人工品質評估。

### 2.3 非目標與研究界線

- 本系統**不是**臨床決策支援工具，不提供個人化醫療或營養處方。
- 文件內容、關係標註與 test split 均為研究資料；不能將目前結果外推為臨床安全性證據。
- 目前 held-out test 僅有 8 題，故統計結果應視為探索性證據，不能提出過度強的 superiority claim。
- 若使用 LLM 產生答案，模型輸出仍可能有 hallucination；citation presence 不等於語意必然正確。

---

## 3. 系統方法

### 3.1 整體流程

```text
Frozen corpus + frozen queries + frozen judgments
                    │
                    ▼
          Retrieval phase (no oracle)
          ├─ Append-Only baseline
          ├─ Recency-Only baseline
          ├─ Proposed + oracle relations
          └─ Proposed + predicted relations
                    │
                    ▼
          Scoring phase (loads judgments only after retrieval)
                    │
                    ▼
     Answer generation + citation parsing / automatic proxy metrics
                    │
                    ├─ Retrieval/statistical report
                    └─ Anonymized package for human blind review
```

### 3.2 資料與版本關係

語料來自 Dietary Guidelines for Americans 的跨版本文件。每個 chunk 保留來源、頁碼、版本、lineage 與適用條件等 metadata。relation pairs 以人工標註／仲裁資料記錄版本關係，包含：

- `superseded`：舊段落被新段落取代。
- `deprecated`：舊段落不應再作為可採用建議。
- `compatible`：可與新版本共同使用。
- `complementary`：補充關係。
- `conditional_difference`：差異由族群、情境或條件決定。

Policy engine 的輸出包含 policy state、適用族群、適用條件、有效時間範圍與決策理由。實作特別避免以特定 `lineage_id` 硬編碼規則，所有判斷應由 annotation 與 chunk metadata 驅動。

### 3.3 四種比較系統

| 系統 | 用途 | 關係資訊 |
|---|---|---|
| Append-Only RAG | 基本檢索 baseline | 不使用版本 policy |
| Recency-Only RAG | 強化 baseline | 以 recency lambda 調整排序 |
| Proposed Oracle Graph | policy 方法的能力上界 | 使用人工仲裁 relation graph |
| Proposed Predicted Graph | 接近可部署情境 | 使用 detector 預測關係 |

Oracle 系統只用於回答「若關係辨識正確，policy 本身的行為會如何」，不能被包裝成實務部署效能。

### 3.4 No-oracle 防線

Runner 嚴格採兩階段程序：

1. **Retrieval phase：** 只讀 corpus 與 queries，對全部 query 完成檢索。
2. **Scoring phase：** 檢索完全結束後，才讀取 judgments checksum 和 judgments，計算指標。

整合測試會驗證 event order：`START_RETRIEVAL → END_RETRIEVAL → READ_JUDGMENT_CHECKSUM → LOAD_JUDGMENTS → START_SCORING`。因此 gold judgment 不能影響 candidate selection 或 ranking。

---

## 4. 已凍結資料、結果與誠實解讀

### 4.1 資料規模

| 項目 | 數量／狀態 |
|---|---|
| Corpus chunks | 583 |
| Evaluation queries | 40 |
| Relation pairs | 51 |
| Split | development 24 / validation 8 / test 8 |
| Corpus checksum | `ee4f1c5bddb6b7f255aa4cd497614812bb1933e545c4f0dc3e45986b3a624af7` |

Corpus、dataset、policy parameters 均有 freeze report 與 SHA-256 checksum；詳見第 6 節。

### 4.2 目前 held-out retrieval 結果（test, n=8）

| 系統 | Recall@3 | nDCG@3 | Stale Hit Rate |
|---|---:|---:|---:|
| Append-Only | 20.8% | 0.350 | 12.5% |
| Recency-Only | 58.3% | 0.670 | 12.5% |
| Proposed Oracle Graph | 20.8% | 0.350 | 12.5% |
| Proposed Predicted Graph | 20.8% | 0.350 | 12.5% |

Oracle 與 predicted 的 held-out retrieval outputs 目前完全相同。因此這次的 relevance 降低不能歸因為 detector propagation error；較合理的暫定歸因是 policy/filtering 或 base ranker 的失敗。與 Recency-Only 的差異經 Holm-Bonferroni 後未達顯著（既有統計報告中的 p = 0.7021），且樣本小，不能宣稱 safety improvement 已被證實。

### 4.3 建議採用的論文結論語句

> On the independently frozen held-out set (n=8), the proposed Version-Aware policy did not demonstrate statistical evidence of superiority over the Recency-Only baseline. We observed lower relevance/completeness proxies and no observed stale-hit reduction in this sample. These findings motivate a safety–relevance trade-off analysis and identify relation-policy calibration as a primary direction for future work.

此為保守、可被資料支持的表述。不可寫成「Proposed 已提高安全性」或「方法優於 baseline」。

---

## 5. 人工盲評：教授可協助的範圍

### 5.1 為什麼需要人工盲評

目前已有 deterministic automatic proxy metrics，它們依 gold chunk sets、citation validity、deprecated/forbidden chunks 計算。這些數字可量化 evidence alignment，但不能完整判斷：

- 答案是否真正回應了問題；
- 引用是否在語意上支持整句主張；
- 是否遺漏重要的族群或條件限制；
- 內容是否看似完整卻造成誤導。

因此需要至少兩位彼此獨立、看不到真實系統身分的評分者進行 answer-level blind evaluation。

### 5.2 對評分者的工作量

- 題數：24 個答案（3 個匿名系統 × 8 個 held-out queries）。
- 每題工作：閱讀問題、答案、citation，依 rubric 給六個簡短分數，可補充一句註記。
- 預估時間：若熟悉 rubric，約 45–75 分鐘；建議可分兩次完成。
- 不需要執行程式、不需要理解內部 code、不需要知道 System_A/B/C 的真實身分。

### 5.3 評分指標

| 指標 | 分數 | 核心問題 |
|---|---|---|
| Answer correctness | 0 / 0.5 / 1 | 回覆是否正確回答問題？ |
| Completeness | 0 / 0.5 / 1 | 是否涵蓋必要資訊？ |
| Version correctness | 0 / 0.5 / 1 | 是否避免採用已取代／不適用版本？ |
| Conditional-boundary preservation | 0 / 0.5 / 1 | 是否保留族群、情境與限制條件？ |
| Unsupported claim | 0 / 1 | 是否出現無證據支持的主張？ |
| Citation entailment | 0 / 0.5 / 1 | 引用是否支持其所附主張？ |

完整 operational definition 請見 blind review package 的 `annotation_rubric.md`。

### 5.4 建議評審組成

最佳搭配為：

- 一位具健康資訊、營養、公共衛生或醫療文件解讀經驗者，協助審查版本、條件與安全性語意；及
- 一位具資訊檢索、NLP、RAG 或軟體工程背景者，協助審查引用支持、answer completeness 與 evaluation consistency。

若僅能找到資工背景評分者，也可以完成系統比較；論文應稱為「依明確 rubric 訓練的 independent evaluators」，而不是「臨床專家驗證」，並且不作臨床安全宣稱。

### 5.5 盲評與仲裁保護

- 評分包只顯示 `System_A`、`System_B`、`System_C`。
- 不包含真實系統名稱、run ID、prompt、模型資訊、latency、retrieval score/rank、gold label 或自動分數。
- mapping 檔置於 git-ignored private directory；評分者與論文公開產物均不可取得。
- 兩位評分者先獨立評分，再計算 agreement。
- 不一致項目再交由仲裁者處理，並保留 adjudication reason。
- 自動 proxy metrics 不得用來替代或影響人工評分。

---

## 6. 重要檔案與可重現性地圖

### 6.1 研究規格與凍結紀錄

| 用途 | 路徑 |
|---|---|
| 實驗資訊與 no-oracle 契約 | `experiments/version_aware_rag/EXPERIMENT_CONTRACT_V3.md` |
| Corpus freeze 與 checksum | `experiments/version_aware_rag/CORPUS_FREEZE_REPORT_V3.md` |
| Dataset freeze 與 split checksum | `experiments/version_aware_rag/DATASET_FREEZE_REPORT_V3.md` |
| Retrieval policy parameter freeze | `experiments/version_aware_rag/POLICY_PARAMETER_FREEZE_REPORT_V3.md` |
| 開發與驗證紀錄 | `experiments/version_aware_rag/WALKTHROUGH_V3.md` |
| 本研究說明 | `experiments/version_aware_rag/PROFESSOR_RESEARCH_BRIEF_V3.md` |

### 6.2 資料與設定

| 用途 | 路徑 |
|---|---|
| Frozen corpus | `experiments/version_aware_rag/data/corpus_v3/chunks.jsonl` |
| Queries / judgments / relations | `experiments/version_aware_rag/data/annotations_v3/` |
| 四種系統 config | `experiments/version_aware_rag/configs/v3/` |
| Core implementation | `experiments/version_aware_rag/src/` |
| Unit / integration tests | `experiments/version_aware_rag/tests/` |

### 6.3 結果與論文產物

| 用途 | 路徑 |
|---|---|
| Held-out runs 與 manifests | `experiments/version_aware_rag/results/v3/<run-id>/` |
| Paper tables / stats / error analysis | `experiments/version_aware_rag/results/v3/paper/` |
| 真人盲評 package | `experiments/version_aware_rag/results/v3/paper/blind_review/` |
| 私有 system alias mapping（不可公開） | `experiments/version_aware_rag/results/v3/private/system_alias_mapping.secret.json` |

---

## 7. 操作指南

以下命令應在 repository root 執行。建議在乾淨的 git working tree、且不更動 frozen configs 的情況下操作。

### 7.1 驗證程式與研究防線

```powershell
bun test experiments/version_aware_rag/tests/unit experiments/version_aware_rag/tests/integration
```

目前預期基準為 62 passing tests、0 failures。測試包括 no-oracle event order、lineage independence、policy ablations、blind-package leakage、annotation import validation 與統計 guard。

### 7.2 重新輸出盲評包

僅在 answer artifacts 已存在、且不調整任何 test-driven 參數時執行：

```powershell
bun experiments/version_aware_rag/scripts/v3/export_blind_answer_annotation_package.ts
```

輸出位置：

```text
experiments/version_aware_rag/results/v3/paper/blind_review/
```

將 `annotation_package_annotator_1.json`、`annotation_package_annotator_2.json` 與 `annotation_rubric.md` 分別提供給兩位評分者。不得提供 private mapping 或 automatic proxy metrics。

### 7.3 匯入兩位評分者的結果並仲裁

評分者回傳 JSON 後，放在受控目錄，再執行：

```powershell
bun experiments/version_aware_rag/scripts/v3/import_and_adjudicate_answer_annotations.ts `
  --annotator1 <annotator-1-result.json> `
  --annotator2 <annotator-2-result.json> `
  --adjudication <adjudication-result.json>
```

匯入器會拒絕缺題、重複 item、非法分數、被修改的 item identity，以及混入 automatic proxy metadata 的資料。輸出將包括 raw human annotations、agreement report、adjudicated results 和 final summary。

### 7.4 重新產生論文表格

```powershell
bun experiments/version_aware_rag/scripts/v3/build_paper_tables.ts
```

在未完成真人盲評前，tables 的 Human section 必須顯示 `Pending`。完成且匯入人工仲裁資料後，才可呈現 human answer-level 統計。

### 7.5 Held-out 的嚴格規則

Test split 已經打開並產生結果。後續只允許：

- 以完全相同的 frozen config 進行重現；
- 修正不改變 retrieval/generation 決策的輸出、文件或評估 plumbing 問題；
- 補上盲評與報告。

後續**不得**根據 test 結果調整 lambda、policy weights、detector prompt、generation prompt 或任何系統參數，再重新挑選最佳結果。若有新的改良想法，應回到 development/validation 或建立一個全新的、未開封的 evaluation split。

---

## 8. 預期論文結構

1. **Introduction**：版本演進資料對 RAG 的挑戰，以及過時知識的風險。
2. **Related Work**：Temporal RAG、knowledge graph RAG、citation-grounded generation、safety-aware retrieval。
3. **Method**：corpus lineage、relation schema、policy engine、oracle/predicted setup、no-oracle contract。
4. **Experimental Design**：資料凍結、split、baselines、metrics、統計檢定與盲評協定。
5. **Results**：retrieval 結果、自動 proxy metrics、完成後的人類盲評結果。
6. **Error Analysis**：policy/retrieval failures、條件過濾過度、oracle/predicted equality 的含義。
7. **Discussion and Limitations**：n=8 held-out、小樣本、relation detector 限制、領域泛化與臨床外推限制。
8. **Conclusion**：將 version-aware RAG 定位為可審計的研究框架與 trade-off 分析，而非未被資料支持的 superiority claim。

---

## 9. 對教授／潛在合作方的具體邀請

可使用下列精簡說明作為聯絡信附件的摘要：

> 我正在進行一項 Version-Aware RAG 研究，探討當健康指南跨版本更新時，RAG 如何避免引用過時或條件不適用的段落。系統已完成可重現的 corpus freeze、relation graph、policy-aware retrieval、no-oracle evaluation、held-out statistical analysis 與 blind-review pipeline。初步 held-out 結果未顯示 proposed policy 優於較強的 Recency-Only baseline，因此目前以 safety–relevance trade-off 與負結果分析為研究定位。若您願意，我希望請教研究設計、資訊檢索評估，或邀請您／研究生協助一份約 45–75 分鐘的匿名答案盲評，以提升最終論文的評估可信度。

---

## 10. 目前狀態與下一步

### 已完成

- [x] Corpus、queries、judgments、relation pairs 與 policy parameters 的凍結與 checksum。
- [x] Append-only、recency-only、oracle graph、predicted graph 系統與 ablation controls。
- [x] no-oracle retrieval/scoring ordering 防線。
- [x] Held-out retrieval、paired statistics、error analysis 與 paper table pipeline。
- [x] Automatic proxy metrics 與真人盲評流程的嚴格分離。
- [x] 匿名 blind package、private alias mapping、匯入驗證、agreement 與仲裁工具。

### 待完成

- [ ] 兩位獨立評分者完成 24 份匿名答案評分。
- [ ] 執行 inter-annotator agreement 與第三方仲裁。
- [ ] 產出 final human answer evaluation 表格與論文版本。

在上述人工評分完成前，研究可開始撰寫方法、資料集、檢索結果、統計與負結果討論；但不得宣稱已完成 human answer evaluation，也不得將 automatic proxy metrics 稱為人工品質評估。
