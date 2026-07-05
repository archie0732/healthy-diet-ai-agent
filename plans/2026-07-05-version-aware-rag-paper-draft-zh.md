# Version-Aware RAG for Evolving Nutrition Guidance:
# 降低過時健康知識被檢索與引用之研究

日期：2026-07-05  
語言：中文草稿  
狀態：論文初稿框架 v1

---

## 摘要

大型語言模型結合檢索增強生成（Retrieval-Augmented Generation, RAG）已被廣泛視為解決模型知識過時問題的有效方法。然而，多數 RAG 系統預設知識庫可透過持續新增文件維持有效性，卻較少處理「權威文件本身會持續更新」所造成的新舊知識共存問題。在飲食與營養領域，官方指引、醫院衛教內容與公共健康建議文件常因新研究、政策修訂或適用範圍調整而更新；若知識庫採用 append-only 策略，系統可能同時檢索到舊版與新版內容，進而引用已失效、應降權或不再適用的知識，造成回答時間不一致、引用不可靠，甚至導致錯誤建議。

本研究聚焦於「權威且會更新的健康指南資料」，提出一個以知識生命周期管理為核心的 RAG 架構，整合 `version-aware ingestion`、`semantic conflict detection` 與 `deprecation / eviction policy` 三個模組，以降低過時知識被檢索與引用的機率。首先，系統在知識擷取階段保留來源版本、更新日期、文件 lineage 與適用條件等 metadata；其次，在新文件或新 chunk 進入知識庫時，系統會檢索相似舊內容並判定兩者屬於重複、取代、衝突、條件差異或互補關係；最後，系統根據判定結果對舊知識執行保留、降權、標記失效或驅逐等策略，以維持知識庫的新鮮度與可追溯性。

本研究以飲食與營養 public guidance 為應用場景，並規劃以 append-only RAG 與 trust-aware RAG 作為比較基線。評估指標除一般回答正確性外，亦納入 `stale retrieval rate`、`stale citation rate`、`temporal consistency` 與 `deprecation decision accuracy` 等與知識更新直接相關之指標。預期本研究可為 RAG 在動態權威知識環境中的維護問題提供一個更具實務意義的研究框架，並作為健康衛教型 AI 系統設計的重要參考。

**關鍵詞：** Retrieval-Augmented Generation、Version-Aware Retrieval、Knowledge Lifecycle Management、Nutrition Guidance、Conflict Detection、Deprecation Policy

---

## 一、研究動機

### 1.1 背景

近年來，大型語言模型在問答、摘要、知識助理與健康資訊輔助系統中展現出高度潛力。然而，單純依賴模型參數中既有知識的作法，容易受到訓練資料時間截點限制，無法即時反映最新政策、指南或專業建議。RAG 因此成為一種常見解法，其核心想法是在生成回答前，先從外部知識庫中檢索相關文件，再將其作為上下文提供給模型，以降低幻覺並提升回答可驗證性。

然而，RAG 的有效性高度依賴知識庫品質。對於技術文件、法規文本與健康指引這類會持續修訂的資料而言，「有資料」並不等於「有正確且最新的資料」。在飲食與營養領域，指南更新可能以年度修訂、常見問答補充、特定族群條件澄清或建議攝取量調整等形式發生。若系統只是一味地將新資料加入向量資料庫，而不處理舊資料是否仍有效，則即使 RAG 成功檢索到相關內容，也可能同時將過時與最新版資訊一起交給模型。

### 1.2 問題陳述

現有多數 RAG 系統的知識庫維護方式偏向 append-only，即新資料進入後直接新增索引，舊資料通常保留不動。這種設計雖然簡單，但在動態權威知識情境下可能產生以下問題：

- 舊版與新版內容同時存在，造成檢索結果互相競爭。
- 語意相近但結論不同的 chunk 可能同時被取回，增加回答衝突風險。
- 回答雖附有 citation，但引用來源本身可能已過時。
- 系統可能將條件式修正誤解為普遍性建議，影響安全性與解釋性。

因此，本研究關心的不氣是「如何提升 RAG 檢索品質」，而是更進一步探討：**當權威知識會持續更新時，RAG 系統應如何管理知識的版本、衝突與失效狀態，以降低過時知識被檢索與引用的風險。**

### 1.3 研究目的

基於上述問題，本研究擬提出一個面向健康指南資料的 version-aware RAG 框架，核心目標如下：

- 建立可追蹤來源版本與更新資訊的知識擷取流程。
- 偵測新舊知識之間的語意關係，而不只做單純相似度比對。
- 對已被更新、限制或取代的舊知識進行保留、降權、失效標記或移除。
- 驗證此類知識生命周期管理機制，是否能降低過時知識的檢索與引用比例。

---

## 二、文獻討論

### 2.1 RAG 與外部知識更新問題

Lewis et al.（2020）提出 Retrieval-Augmented Generation，奠定了以外部非參數記憶補充語言模型知識的基本架構。此後大量研究證明，RAG 能改善知識密集型任務的正確性與可驗證性。然而，RAG 的主流研究長期關注於檢索器設計、生成品質與引用能力，較少處理知識庫本身會隨時間演進的問題。

在實務上，RAG 常被當成「解決知識過時」的方法，但這個說法往往隱含一個前提：只要把新資料放進知識庫，系統自然就會更接近最新事實。這個前提在權威文件會被修訂的情境下並不總是成立，因為新文件的加入可能不是補充，而是修正、取代或限制舊文件中的某些結論。

### 2.2 Knowledge Conflict in LLMs and RAG

近年已有研究開始注意到知識衝突問題。`Resolving Knowledge Conflicts in Large Language Models`（Wang et al., 2023）指出，當模型內部知識與外部上下文不一致時，語言模型未必能穩定辨識衝突來源，也未必能妥善處理相互矛盾的資訊。`Knowledge Conflicts for LLMs: A Survey`（Xu et al., 2024）則進一步將知識衝突區分為 context-memory、inter-context 與 intra-memory 等類型，顯示衝突處理已逐漸成為可信 AI 的重要議題。

在 RAG 場景中，衝突問題更為直接。`DRAGged into Conflicts`（Cattan et al., 2025）提出衝突類型 taxonomy 與 benchmark，證明當檢索結果之間存在衝突時，LLM 往往難以給出適當回應。`ConflictRAG`（Wang et al., 2026）更進一步提出 detect-classify-resolve-generate pipeline，顯示 conflict-aware RAG 已成為一條清楚的研究方向。

然而，這些研究多半聚焦於**回答階段如何辨識與處理衝突**，例如要求模型顯式解釋、比較或選擇資訊來源。相較於僅專注於提升 retrieval relevance 或 conflict-aware answering 的既有方法，本文更關心的是**知識庫維護階段**：在新資料進入時，系統能否先處理新舊內容之間的版本與失效關係，進而減少衝突在檢索階段就被帶入回答流程。

### 2.3 Version-Aware Retrieval and Evolving Documents

另一條與本研究密切相關的方向，是針對會演進文件的 version-aware retrieval。`VersionRAG`（Huwiler et al., 2025）指出，傳統 RAG 面對版本敏感型問題時容易混淆不同時期的文件內容，因此提出 version-aware 的文件結構與檢索流程。這類研究說明，「文件版本」不應只是 metadata 附註，而應成為檢索與回答決策的一部分。

然而，version-aware retrieval 主要解決的是「如何找到正確版本」，仍未完全處理當新舊內容語意高度相似、但適用條件不同或部分結論被更新時，知識庫該如何維護的問題。也就是說，version-aware retrieval 有助於後端回答更精準，但未必能單獨解決 append-only 知識庫中舊內容長期殘留所造成的 stale retrieval 問題。

### 2.4 本研究與既有文獻之差異

綜合上述文獻可知，現有研究已逐步涵蓋：

- RAG 作為外部知識補充機制
- LLM 與 RAG 中的知識衝突辨識
- 版本敏感型文件的檢索設計

但仍存在一個尚未被充分處理的缺口：**當權威知識文件會持續更新時，知識庫本身如何進行 lifecycle-aware maintenance。**

因此，本研究的重點不在於提出另一個單純的 conflict-aware answering 方法，而是在 version-aware ingestion 的基礎上，設計一個可處理新舊知識關係的 `semantic conflict detection + deprecation / eviction policy` 架構，將研究焦點前移到知識維護階段，作為 RAG 在動態權威知識環境中的補強機制。

---

## 三、系統架構

### 3.1 整體設計概念

本研究提出的系統可分為四個主要層次：

1. `Version-Aware Ingestion Layer`
2. `Semantic Conflict Detection Layer`
3. `Deprecation / Eviction Policy Layer`
4. `Retrieval and Answering Layer`

系統設計的核心邏輯是：**先在資料進入知識庫時處理版本與失效問題，再進行一般 RAG 檢索與回答。** 這樣的設計與傳統將所有文件一律視為可用知識的做法不同，能更積極地控制 stale knowledge 在下游回答階段的影響。

### 3.2 Version-Aware Ingestion Layer

此層負責從權威來源蒐集資料，並建立與版本演進相關的 metadata。系統將優先納入政府機關、醫學中心、營養學會與公共衛生單位發布之飲食或營養指南，並保留以下資訊：

- `source`
- `url`
- `title`
- `published_at`
- `updated_at`
- `version_id`
- `effective_date`
- `section_title`
- `applicable_population`
- `document_lineage_id`

其目的在於讓後續模組不只看到一段文字內容，而能理解該段內容的來源脈絡與時間位置。

### 3.3 Semantic Conflict Detection Layer

當新的文件或 chunk 被擷取後，系統會先使用向量檢索從既有知識庫中找出語意最相近的舊 chunk，再進行關係判定。與一般 duplicate detection 不同，本研究將關係細分為：

- `duplicate`
- `superseded`
- `conflicting`
- `conditional_difference`
- `complementary`

此設計反映了健康指南更新的實際情況。許多新舊內容看似衝突，但實際上指示對象不同，或是新版在舊版上加入額外限制。若系統只做二元衝突判定，將難以支撐穩健的知識汰換決策。

### 3.4 Deprecation / Eviction Policy Layer

此層為本研究之核心模組。系統會根據 relation label 與 metadata 狀態，決定舊 chunk 的後續處置方式。主要策略包括：

- `retain`：維持正常檢索資格
- `down-rank`：降低排序優先度
- `deprecate`：保留以供追溯，但不再作為優先引用來源
- `evict`：當存在明確版本替代證據時，自主索引中移除

本研究採取保守策略，即預設先 `deprecate`，避免過度激進移除仍可能有歷史價值或條件適用性的內容；僅在同一文件 lineage 中且有明確更新依據時，才考慮 `evict`。

### 3.5 Retrieval and Answering Layer

此層負責一般 RAG 檢索與回答生成，並利用前述上游模組所維護的知識狀態進行更穩定的檢索。其基本流程為：

- 接收問題並轉換為檢索查詢
- 依語意與 metadata 進行檢索排序
- 優先選取未 deprecated 的內容
- 生成附 citation 的回答

本層不是本文的唯一創新來源，但它是驗證 lifecycle-aware knowledge maintenance 是否有效的必要環節。

---

## 四、系統實作與評估資料集

### 4.1 資料來源與預處理

本研究以美國膳食指南（Dietary Guidelines for Americans, DGA）為進化權威知識庫（Evolving Authoritative Corpus）的應用實體。資料集包含三個代表性版本：
- **DGA 2015-2020** (第八版，2015年發布)
- **DGA 2020-2025** (第九版，2020年發布)
- **DGA 2025-2030** (第十版，2026年發布)

資料預處理流程包含將 PDF 指南轉譯為 Clean Markdown 格式，並建立統一的 Page-based Chunking 機制。為了解決單一頁面包含多個核心健康主題導致語意稀釋的問題，系統實作了**多主題關鍵字映射機制**（Multi-topic Keyword Mapping），單一 Page Chunk 若同時提及多種食物或營養素（如 Page 3 同時討論蛋白質與乳製品），會被複製並分類至各自所屬的主題 Lineage 中，以提高 RAG 下游檢索之精準度。

### 4.2 Metadata Schema 與 Document Lineage

每個知識庫中的 Chunk 均富含結構化 metadata：
- `chunk_id` (格式為 `${doc_id}-page-${page_num}-${lineage_id}`)
- `doc_id` / `version`
- `published_year` (如 2015, 2020, 2026)
- `effective_version_start` / `effective_version_end`
- `lineage_id` / `topic`

研究共定義了 10 個核心演進健康主題（Lineages）：
1. `lineage-dairy` (乳製品脂肪建議)
2. `lineage-protein` (蛋白質攝取目標)
3. `lineage-sugars` (添加糖每日限量)
4. `lineage-sweeteners` (非營養性甜味劑政策)
5. `lineage-cholesterol` (膳食膽固醇限制)
6. `lineage-alcohol` (酒精飲用限量)
7. `lineage-whole-grains` (全穀物比例建議)
8. `lineage-sodium` (鈉攝取限量)
9. `lineage-processed-foods` (加工食品政策)
10. `lineage-veg-fruits` (蔬果每日攝取量)

### 4.3 標註資料集 (English Gold Pairs Set)

為了驗證新舊知識的衝突分類器與生命周期決策引擎，本研究建立了一組包含 10 個核心對比點的 **English Gold Pairs Set**，逐筆追溯至膳食指南 Markdown 中的實體頁碼，並標註黃金關係標籤（Relation Label）與政策決策標籤（Policy Label）：
- **分類器準確度（Conflict Detector Accuracy）**：經測試，基於 LLM 語意分析的關係檢測器在 10 組黃金樣本上達到了 **100%** 的分類準確度，成功識別出取代（`superseded`）、衝突（`conflicting`）、條件差異（`conditional_difference`）與互補（`complementary`）關係。
- **決策引擎準確度（Policy Engine Accuracy）**：根據關係標籤，政策決策引擎在黃金樣本上同樣達到了 **100%** 的決策準確度，精確執行了廢棄舊知識（`deprecate`，應用於 superseded/conflicting）與保留舊知識（`retain`，應用於 complementary/conditional_difference）的決策。

---

## 五、實驗結果與分析

本實驗設計了 10 個針對不同膳食主題的 RAG 檢索問答題（Evaluation Queries），並在包含 560 個 DGA 知識分塊的向量資料庫中，對三種檢索模式進行了實際的 Lexical Top-3 檢索評估。

### 5.1 檢索評估定量結果

| 評估指標 | Baseline A (Append-Only) | Baseline B (Recency-Only) | Proposed (Version-Aware RAG) |
| :--- | :---: | :---: | :---: |
| **Stale Retrieval Rate** (過時知識取回率) | 20% | 0% | 0% |
| **Current Hit Rate** (最新知識命中率) | 50% | 60% | 50% |
| **Unsafe Retrieval Rate** (非安全知識取回率) | 100% | 100% | 100% |

- **Baseline A (Append-Only RAG)**：將所有版本的 DGA 文件直接新增至資料庫中。由於新舊版本語意相似，有 **20%** 的查詢會檢索到已過時的舊版指引。同時，所有模式的非安全檢索率均為 100%，反映出在無語意過濾與 oracle 路由加分下，純詞彙重合匹配（Lexical Search）極易取回與主題不完全匹配的無關 Chunks。
- **Baseline B (Recency-Only RAG)**：基於發布年份（`published_year`）給予檢索分數時間加權權重。由於時間加權將最新 2026 年指引強力排前，其最新知識命中率達到了 **60%**，並成功將過時取回率壓低至 **0%**。但此方法為無差別加權，無法針對「條件差異」等細粒度關係進行生命周期管理。
- **Proposed (Version-Aware RAG)**：結合關係檢測與生命周期政策，主動將被標記為 `deprecate` 或 `evict` 的舊知識分塊過濾出主索引。在不依賴任何 evaluation-only 標籤的公平 retrieval 下，Proposed 成功將過時取回率降至 **0%**，並維持 **50%** 的最新知識命中率。

### 5.2 質性案例分析 (Qualitative Case Studies)

#### 案例一：乳製品脂肪建議的演進 (`lineage-dairy`)
- **2020-2025 指引**：建議飲用「無脂或低脂」乳製品，且需限制飽和脂肪。
- **2025-2030 指引**：修正為建議攝取「全脂（full-fat）」乳製品，強調其包含優質蛋白質與健康脂肪。
- **評估表現**：檢測器將其判定為 `superseded`，決策引擎執行 `deprecate` 舊指引。在 Baseline A 中，2015/2020 年的舊版低脂建議被取回（造成過時檢索率上升）；而 Proposed 成功過濾了已廢棄的乳製品 Chunks，阻斷了舊建議的取回。

#### 案例二：非營養性甜味劑政策的衝突 (`lineage-sweeteners`)
- **2015-2020 指引**：指出用甜味劑替代添加糖在短期內可能減少卡路里攝取。
- **2025-2030 指引**：明確指出沒有任何數量的非營養性甜味劑是被推薦或被視為健康飲食的一部分。
- **評估表現**：兩者在語意上存在明確政策衝突（`conflicting`），政策引擎決定對 2015 年甜味劑有利的論點執行 `deprecate`。Proposed 成功阻止了 RAG 系統引用舊指引中對甜味劑短期效用的積極論述，保障健康回答之可信度。

#### 案例三：鈉攝取限量的條件差異 (`lineage-sodium`)
- **2020-2025 指引**：14 歲以上一般大眾每日鈉攝取量應小於 2,300 毫克。
- **2025-2030 指引**：維持一般大眾 <2,300 毫克的限制，但新增例外條件：「高活動量者因汗液流失，可能受益於增加鈉攝取量」。
- **評估表現**：檢測器精準將此判定為 `conditional_difference`（條件差異關係），政策引擎對其執行 `retain`（保留雙方）。當使用者詢問關於高活動量者限制時，Proposed 保留了 2020 年的一般限制與 2025 年的特殊例外，為使用者提供更具上下文一致性與完整度的答案。

---

## 六、結論

本研究處理了健康諮詢 RAG 系統中極具實務價值的「進化權威文件新舊事實共存」之核心難題。相較於僅專注於檢索器演算法優化或下游 LLM 衝突調解的既有研究，本研究將主導權前置於知識庫生命周期維護階段，藉由 `version-aware ingestion`、`semantic conflict detection` 與 `deprecation / eviction policy`，主動淨化知識庫。

實驗證明，在以膳食指南（DGA）為場景的實作中，本研究電框架在公平的 Lexical 檢索設定下，成功消明了 **20%** 的過時健康知識檢索風險，同時保留了具有適用對象差異的歷史修正。本研究為未來動態法規、醫療指引與健康百科型 RAG 助理的工程實踐提供了一個高度可行的標準架構。

---

## 參考文獻

- Lewis, P. et al. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.
- Wang, Y. et al. (2023). Resolving Knowledge Conflicts in Large Language Models.
- Xu, R. et al. (2024). Knowledge Conflicts for LLMs: A Survey.
- Cattan, A. et al. (2025). DRAGged into Conflicts: Detecting and Addressing Conflicting Sources in Search-Augmented LLMs.
- Huwiler, D. et al. (2025). VersionRAG: Version-Aware Retrieval-Augmented Generation for Evolving Documents.
- Wang, C. et al. (2026). ConflictRAG: Detecting and Resolving Knowledge Conflicts in Retrieval-Augmented Generation.
