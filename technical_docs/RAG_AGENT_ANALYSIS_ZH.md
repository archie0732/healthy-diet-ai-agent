# Healthy Diet AI Agent 專案 RAG / Agent 技術解析

更新日期：2026-06-22

本文根據目前 repo 內的實作整理，重點檔案包含：

- `src/server/ragSearch.ts`
- `agent_skills/file_tools.ts`
- `src/server/ragDocuments.ts`
- `src/server/knowledgeIngestion.ts`
- `src/server/knowledgeGraph.ts`
- `src/server/agentRuntime.ts`
- `src/serverHandlers.ts`
- `agent_skills/db_tools.ts`
- `agent_skills/conversation_summary_tool.ts`
- `src/server/modelRouting.ts`
- `src/server/mohwNews.ts`

---

## 1. 一句話結論

這個專案目前的主問答 RAG 不是 Vector RAG，也不是 GraphRAG。

它的主體是：

1. 把本地 Markdown 知識庫切成段落 chunk。
2. 用關鍵字與簡單分數規則做檢索。
3. 把搜尋結果交給 LangGraph Agent 使用。
4. 再疊加使用者資料、聊天室摘要索引、圖片分析、網頁抓取等工具，形成一個「以工具驅動的知識型 agent」。

另外，專案裡確實有「知識圖譜」能力，但它目前比較像獨立的圖譜探索 API，不是聊天主流程中的 GraphRAG。

---

## 2. 目前專案裡到底有哪些「像 RAG」的東西

我會把它拆成四層來看。

### 2.1 主 RAG：本地 Markdown 關鍵字檢索

主 RAG 來自 `agent_skills/file_tools.ts` 的 `search_knowledge_tool`，也就是：

- 本地知識檔讀取
- 切 chunk
- query 關鍵字抽取
- 關鍵字打分
- 取 top-k

這是目前真正被 `/api/rag/search` 與 agent 問答共用的檢索器。

### 2.2 文件 ingestion 管線

`src/server/ragDocuments.ts` 與 `src/server/knowledgeIngestion.ts` 會把：

- PDF
- DOCX
- TXT
- MD

轉成可搜尋的 Markdown，放進 `knowledge_base/ingested_markdown/...`。

所以這個專案的「索引」本質上不是向量索引，而是「先抽文字，再轉成 Markdown，最後讓 keyword search 去搜」。

### 2.3 圖譜能力

`src/server/knowledgeGraph.ts` 會建立：

- node
- edge
- evidence
- document cache

並把結果存在 `knowledge_base/graph/graph-cache.json`。

但它目前主要服務：

- `/api/graph/search`
- `/api/graph/nodes`
- `/api/graph/nodes/:node_id`
- `/api/graph/relations/:relation_id/evidence`

也就是圖譜探索 / 關係瀏覽，不是聊天主流程中自動查圖再回答。

### 2.4 記憶檢索

`src/serverHandlers.ts`、`src/server/roomSummaryIndex.ts`、`agent_skills/db_tools.ts` 提供另一種「conversation retrieval」：

- `chat_rooms.summary` 保存摘要索引
- `diet_chat_history` 保存完整對話與 summary row
- agent 先看摘要索引
- 必要時再用 `get_chat_history` 拉指定時間或指定 id 的原始對話

這不是典型 RAG，但實際上是 agent 記憶檢索的一部分。

---

## 3. 這個專案目前比較準確的分類

如果要精準命名，我會這樣描述：

### 3.1 問答主流程

「基於本地 Markdown chunk 的關鍵字檢索式 RAG + 工具型 agent」

### 3.2 不是什麼

- 不是向量資料庫 RAG
- 不是 embedding similarity search
- 不是 BM25 搜尋引擎
- 不是 hybrid search
- 不是 reranker + retriever pipeline
- 不是 GraphRAG 主流程

### 3.3 但它有什麼延伸能力

- 文件 ingestion
- 會話記憶摘要檢索
- 圖譜探索 API
- 圖片理解工具
- 網頁驗證 / 抓取工具
- 使用者 profile 寫入審批流程

所以它比較像「RAG 能力嵌在 agent 裡」，而不是「只有一條 retriever -> generator pipeline 的純 RAG 專案」。

---

## 4. 聊天主流程中的實際資料流

## 4.1 `/api/chat` 入口

`src/serverHandlers.ts` 的 `chatHandler` 負責：

1. 驗證 payload
2. 儲存圖片到 workspace
3. 讀取 user profile
4. 讀取聊天室摘要索引
5. 組合 context
6. 呼叫 `runAgentStream(...)`
7. SSE 串流回覆
8. 背景持久化對話、標題、摘要

### 4.2 進到 agent 前，已經先組好的 context

真正送進 agent 的 `user_profile_context` 並不是只有 profile，而是拼接過的複合上下文，包括：

- `user_context`
- 使用者 profile
- `Room summary index`
- `Current room summary`

也就是說，聊天模型在開始回答前，已經先收到：

- 近端會話記憶
- 個人化資料
- 歷史摘要索引

### 4.3 agent 內的 system prompt 還會再注入

`src/server/agentRuntime.ts` 的 `callModel` 會額外把以下內容直接放進 system prompt：

- `knowledge_base/AGENT.md`
- `knowledge_base/SKILL_INDEX.md`
- `knowledge_base/NUTRITION_RULES.md`
- runtime context
- image context

這很重要，因為它代表：

- `NUTRITION_RULES.md` 不只是可被搜尋，還是「全量直接塞進 prompt」的靜態知識
- 這個專案的知識 grounding 其實是「靜態 prompt grounding + 動態 RAG」混合

### 4.4 聊天主流程的 RAG 觸發方式

在 `agentRuntime.ts` 的 prompt 裡，有明確規則：

- 對健康 / 營養 / 食安這類 factual claim，先呼叫 `search_knowledge_tool`
- 搜到結果後，要優先用這些來源回答
- 盡量附上 `source_path`

所以主問答流程不是「每次自動先 retrieve 再生成」，而是：

- 由 agent 根據 prompt 規則自主判斷何時呼叫 `search_knowledge_tool`

這是 tool-using agent 的典型型態。

---

## 5. 主 RAG：`search_knowledge_tool` 的實作細節

核心檔案：`agent_skills/file_tools.ts`

## 5.1 來源語料有哪些

目前 build corpus 時只吃三類來源：

- `knowledge_base/NUTRITION_RULES.md`
- `knowledge_base/mohw_clarifications/articles/*.md`
- `knowledge_base/ingested_markdown/**/*.md`

對應的 `source_type` 為：

- `nutrition_rules`
- `mohw_news`
- `uploaded_knowledge`

### 目前 repo 實際狀態

截至 2026-06-22，我直接掃 repo 的結果：

- `knowledge_base/NUTRITION_RULES.md`：1 份
- `knowledge_base/mohw_clarifications/articles/*.md`：30 份
- `knowledge_base/ingested_markdown/**/*.md`：0 份
- `knowledge_base/graph/graph-cache.json`：目前不存在，表示圖譜快取尚未建立

所以現在這個 repo 真正會被主 RAG 搜到的內容，主要是：

- 1 份營養規則檔
- 30 份 MOHW 澄清 / 新聞 markdown
- 暫時沒有已 ingestion 的上傳文件

## 5.2 chunking 策略

`splitIntoParagraphChunks(text, maxChunkChars = 1000)` 的實際使用方式是：

- 先用 `\n{2,}` 依照空白段落切開
- 每個 block 先做 `normalizeWhitespace`
  - 把連續空白折疊
  - trim
- 再把多個 block 盡量合併到一個 chunk
- 實際 build corpus 時傳入 `900`，所以常用 chunk 上限是 900 字元，不是 1000

也就是說，這個專案的 chunk 單位偏向：

- 段落級
- 字元長度限制
- 無 token-aware split
- 無語意切分

### chunk fallback

如果整篇文字無法正常切出段落，fallback 是：

- 取 normalize 後的前 `maxChunkChars` 字元

## 5.3 查詢前處理

`extractQueryKeywords(query)` 的規則很值得注意。

### 英文 / 數字 token

- regex：`[a-z0-9]{2,}`
- 會轉成 lowercase
- 至少 2 字元

### 中文 token

- regex：`[\u4e00-\u9fff]{2,}`
- 對每個連續 CJK 字串：
  - 先加入整段詞
  - 再產生 2-gram bigram

例如：

- `高血壓飲食`

可能會拆出：

- `高血`
- `血壓`
- `壓飲`
- `飲食`
- `高血壓飲食`

### keyword 上限

- 最多只取前 `48` 個 token

這是一種非常輕量的中文 query tokenization 強化技巧。它不是斷詞器，但能讓中文 keyword search 至少比單純 `includes(query)` 好一點。

## 5.4 scoring 規則

`scoreChunk(...)` 的分數規則如下。

### 基本 keyword match

- keyword 出現在 content：`+2`
- keyword 出現在 title：`+3`

### 原始 query 整串 match

當原始 query 長度大於 3 時：

- query 整串出現在 content：`+6`
- query 整串出現在 title：`+8`

### MOHW 新聞時效加權

若 `source_type === 'mohw_news'` 且能解析出 `publishedDate`：

- 7 天內：`+3`
- 30 天內：`+2`
- 90 天內：`+1`

### 排序與過濾

- 只保留 `score > 0`
- 依分數高到低排序
- 取前 `top_k`

## 5.5 top-k 與 filter 參數

`search_knowledge_tool` 及 `/api/rag/search` 支援：

| 參數 | 型別 | 預設值 | 範圍 / 說明 |
|---|---|---:|---|
| `query` | string | 無 | 必填 |
| `top_k` | int | `5` | `1 ~ 12` |
| `source_types` | array | 無 | 可選：`nutrition_rules` / `mohw_news` / `uploaded_knowledge` |
| `force_refresh` | boolean | `false` | 強制重建 corpus cache |

## 5.6 cache 機制

搜尋 corpus 會被快取在記憶體中。

### 相關參數

- `KNOWLEDGE_SEARCH_CACHE_TTL_MS`
- 預設：`120000 ms`，也就是 2 分鐘

### 何時失效

以下動作會呼叫 `invalidateKnowledgeSearchCache()`：

- `update_knowledge_tool`
- 新文件 upload / reindex 完成
- 刪除文件

這代表 corpus 是 lazy rebuild，不是常駐重新索引。

## 5.7 回傳內容格式

每個 hit 包含：

- `id`
- `source_type`
- `title`
- `source_path`
- `published_date`
- `score`
- `snippet`

其中 snippet 會截到前 `450` 字元。

---

## 6. 文件 ingestion / indexing 管線

這部分有兩條路徑：

- 新版 unified route：`src/server/ragDocuments.ts`
- 舊版 legacy admin route：`src/server/knowledgeIngestion.ts`

## 6.1 新版：`/api/rag/documents`

### 支援格式

- `pdf`
- `docx`
- `txt`
- `md`

### 大小與文字上限

| 參數 | 預設值 |
|---|---:|
| `RAG_DOCUMENT_MAX_UPLOAD_BYTES` | `20 * 1024 * 1024` = 20 MB |
| `RAG_DOCUMENT_MAX_EXTRACTED_TEXT_CHARS` | `350000` |
| `RAG_DOCUMENT_MAX_PREVIEW_CHARS` | `4000` |

### 上傳流程

1. 接收 `multipart/form-data`
2. 支援欄位：
   - `file`
   - `embeddingModel`
   - `uploadedBy`
3. 用檔案內容算 `SHA-256`
4. 如果 hash 重複，直接回既有 document
5. 寫入 `knowledge_base/uploads/YYYY/MM/...`
6. 建 `knowledge_documents` metadata
7. 立刻做 reindex
8. 轉出 Markdown 到 `knowledge_base/ingested_markdown/YYYY/MM/...`

### 檔名策略

原始文件：

- `knowledge_base/uploads/YYYY/MM/{shortHash}_{safeName}.{ext}`

生成 Markdown：

- `knowledge_base/ingested_markdown/YYYY/MM/{documentId}_{safeName}.md`

### 文字抽取方法

| 格式 | 方法 | library / parse_method |
|---|---|---|
| `txt` / `md` | 直接 UTF-8 讀檔 | `plain_text` |
| `docx` | `mammoth.extractRawText(...)` | `docx_text_layer` |
| `pdf` | `pdf-parse` | `pdf_text_layer` |

### 前處理

- `\r\n` 轉 `\n`
- 連續 3 個以上換行壓成 2 個
- trim
- 只保留前 `350000` 字元

### 生成 Markdown 結構

它不只是抽文字，而是會包一層 metadata front matter 風格內容：

- `document_id`
- `filename`
- `mime_type`
- `source_type: uploaded_knowledge`
- `source_path`
- `uploaded_by`
- `uploader_role`
- `parse_method`
- `generated_at_utc`
- `## Content`

這個設計有兩個效果：

1. `search_knowledge_tool` 可以直接把它當一般 Markdown corpus 搜索。
2. `readFrontMatterValue(markdown, 'source_path')` 可以讓 hit 指回原始文件位置，而不是指向生成後的 markdown 檔。

### 重要觀察：`embeddingModel` 目前只是 metadata

雖然 upload API 支援 `embeddingModel`，例如測試中有 `text-embedding-3-large`，但目前 repo 內：

- 沒有真正計算 embedding
- 沒有向量索引
- 沒有向量資料庫
- 沒有 similarity retrieval

所以 `embeddingModel` 現在只是被存到 `knowledge_documents.embedding_model`，尚未參與檢索。

這是很關鍵的結論。

## 6.2 失敗與限制

如果抽出的文字長度是 0，document 會被標成 `failed`，錯誤訊息會直接寫：

- `This document may require OCR preprocessing.`

也就是說：

- 目前沒有 OCR fallback
- 掃描版 PDF 很可能無法被有效 ingestion

## 6.3 preview 行為

preview 不是讀已經生成好的 markdown，而是：

- 重新從原始文件抽一次文字
- 截前 `4000` 字

這有好處也有代價：

- 好處：preview 比較貼近原始文件內容
- 代價：每次 preview 都要重跑 parse

## 6.4 舊版：`/api/admin/knowledge/*`

`src/server/knowledgeIngestion.ts` 是舊路徑，還保留著。

### 它的特徵

- 上傳用 JSON + base64，不是 multipart
- 大小上限預設 12 MB
- 會寫 `knowledge_ingestion_jobs`
- 會產生 `parsed_md_path`
- 會保存 `extracted_text_excerpt`
- 會更新 `knowledge_documents.status`

### 相關參數

| 參數 | 預設值 |
|---|---:|
| `KNOWLEDGE_MAX_UPLOAD_BYTES` | `12 * 1024 * 1024` = 12 MB |
| `KNOWLEDGE_MAX_EXTRACTED_TEXT_CHARS` | `350000` |

### 差異點

新版 `/api/rag/documents` 比較像正式 document API。

舊版 `/api/admin/knowledge/*` 比較像早期 ingestion job API。

目前兩者並存。

---

## 7. 知識圖譜能力：它有，但目前不是聊天主流程的 GraphRAG

核心檔案：`src/server/knowledgeGraph.ts`

## 7.1 它能做什麼

提供：

- 全量 rebuild
- 單一 document 抽 graph
- graph 狀態查詢
- subgraph 搜尋
- node detail
- relation evidence

### 主要 API 參數

#### `/api/graph/search`

| 參數 | 預設值 | 範圍 / 說明 |
|---|---:|---|
| `query` | 無 | 必填 |
| `max_nodes` | `12` | `1 ~ 30` |
| `source_types` | 無 | 可選 |
| `document_ids` | 無 | 可選 |

#### `/api/graph/nodes`

| 參數 | 預設值 | 範圍 / 說明 |
|---|---:|---|
| `limit` | `100` | `1 ~ 500` |
| `node_type` | 無 | 可選 |
| `query` | 無 | 可選 substring filter |

## 7.2 graph source 來源

圖譜 rebuild 會合併兩種來源：

### A. uploaded source

來自 `repository.listDocuments()`，每筆 document 讀的是：

- `record.storagePath`

也就是原始上傳檔案路徑。

### B. local markdown source

`discoverLocalKnowledgeSources(...)` 會遞迴掃描整個 `knowledge_base/` 下的 `.md`，但排除：

- `knowledge_base/uploads/`
- `knowledge_base/graph/`

## 7.3 一個非常重要的現況觀察

`discoverLocalKnowledgeSources(...)` 的分類規則是：

- 若路徑包含 `mohw_clarifications/articles/` -> `mohw_news`
- 否則一律 -> `nutrition_rules`

這代表目前圖譜本地來源其實不只會吃到：

- `NUTRITION_RULES.md`
- `mohw_clarifications/articles/*.md`

也會吃到：

- `knowledge_base/AGENT.md`
- `knowledge_base/SKILL_INDEX.md`
- `knowledge_base/ingested_markdown/**/*.md`

而且除了 MOHW 文章以外，這些都會被標成 `nutrition_rules`。

所以如果從「實際程式行為」來看，圖譜來源比 README 描述得更寬，而且有 source type 粗分類問題。

## 7.4 uploaded document 在 graph 裡的另一個限制

對 uploaded file，圖譜模組目前直接：

- `readFile(absolutePath, 'utf8')`

也就是把原始 `storagePath` 當 UTF-8 文字讀。

這對：

- `txt`
- `md`

還有機會正常。

但對：

- `pdf`
- `docx`

通常不合理，因為它沒有去讀 `parsed_md_path`，也沒有重用 ingestion 後的純文字 Markdown。

因此：

- 上傳的 PDF / DOCX 在主 keyword RAG 可能能搜
- 但在知識圖譜抽取這條路上，品質很可能不穩定

## 7.5 抽圖譜的方式

這個圖譜不是 LLM 抽取，也不是 embedding graph，它是 deterministic rule-based extraction。

### 內建 term dictionary

它有幾組硬編碼詞表：

- `FOOD_TERMS`
- `NUTRIENT_TERMS`
- `CONDITION_TERMS`
- `POPULATION_TERMS`
- `GUIDELINE_TERMS`

而且裡面除了英文，還混了一些看起來已經有編碼亂碼的中文詞。

這表示：

- 圖譜抽取可解釋
- 但 coverage 很有限
- 中文品質可能受 repo 文字編碼問題影響

## 7.6 sentence splitting

圖譜會先把文件切成 sentence，再在 sentence 裡找 term 與 pattern。

然後建立：

- `document` node
- term nodes
- evidence snippets

## 7.7 目前會建立的 relation 類型

定義上有：

- `contains`
- `affects`
- `recommended_for`
- `not_recommended_for`
- `supports`
- `mentions`

但從目前 `extractDocumentGraph(...)` 真正會建出的 relation 來看，主要是：

- `mentions`
- `contains`
- `affects`
- `recommended_for`
- `not_recommended_for`

`supports` 雖然型別有定義，但目前沒有看到實際建立它的邏輯。

## 7.8 relation 判斷規則與 confidence

### `mentions`

- 文件句子裡出現 term 就連到 document node
- `confidence = 0.5`

### `contains`

條件：

- sentence 同時有 food + nutrient
- 並匹配 `(contain|contains|rich in|...)`

`confidence = 0.9`

### `affects`

條件：

- sentence 同時有 nutrient + condition
- 並匹配 `(support|supports|help|helps|reduce|...)`

`confidence = 0.8`

### `recommended_for`

條件：

- sentence 有 food 或 nutrient
- 並有 population
- 並匹配 `(recommended|recommend|should|...)`

`confidence = 0.75`

### `not_recommended_for`

條件：

- sentence 有 condition + nutrient
- 並匹配 `(avoid|limit|reduce|...)`

`confidence = 0.8`

## 7.9 graph search 其實也不是 GraphRAG

`buildSubgraph(...)` 的搜尋方式是：

1. 先在 node label / aliases 上做 substring match
2. 找到命中的 nodes
3. 把相鄰 edges / nodes 補進來
4. 回傳一個可視化用的 subgraph

也就是：

- 沒有圖路徑推理
- 沒有多跳 reasoning
- 沒有 semantic graph retrieval
- 沒有把 graph 融進聊天回答流程

所以最準確的說法是：

「這是 knowledge graph exploration，不是主流程 GraphRAG。」

## 7.10 graph cache

圖譜快取存在：

- `knowledge_base/graph/graph-cache.json`

更新策略：

- `force=true`：全重建
- 否則用 `content_hash` 比較是否需要重抽
- hash 用的是 `sha1`

目前 repo 中還沒有這個檔，表示尚未做過 build 或沒被提交進來。

---

## 8. Conversation memory：這個專案另一種很重要的「檢索」

這部分不是知識庫 RAG，但對 agent 很重要。

## 8.1 `chat_rooms.summary` 現在不是單純文字

`src/server/roomSummaryIndex.ts` 把它設計成 summary index array，每筆包括：

- `summary_id`
- `summary`
- `source_chat_history_ids`
- `source_summary_history_id`
- `created_at`
- `start_at`
- `end_at`

這代表 summary 不只是摘要文字，而是「可回指原始對話 / 歷史 summary row」的索引。

## 8.2 聊天時如何用

agent prompt 有明確規則：

- 先把 room summary index 當成 primary lightweight memory
- 如果回答 recap 類問題夠用了，就不要抓 raw history
- 如果要查特定日期 / meal / 細節，再呼叫 `get_chat_history`

## 8.3 `get_chat_history` 參數

| 參數 | 預設值 | 說明 |
|---|---:|---|
| `room_id` | 無 | 必填 |
| `limit` | `8` | `1 ~ 50` |
| `format` | `compact` | `compact` / `raw` |
| `include_diet_report` | `false` | 是否附 diet_report |
| `record_type` | `all` | `all` / `chat` / `summary` |
| `chat_history_ids` | 無 | 精準拉指定 row |
| `date_from` | 無 | created_at 下界 |
| `date_to` | 無 | created_at 上界 |

## 8.4 這意味著什麼

這個專案其實已經有一個不錯的 memory retrieval 雛形：

- summary index 做便宜的長期記憶
- raw rows 做精準追溯

這跟一般只把整段歷史硬塞進 prompt 的做法相比，更接近「可查詢的記憶系統」。

---

## 9. Agent orchestration 的設計

核心檔案：`src/server/agentRuntime.ts`

## 9.1 使用框架

- `LangGraph`
- `LangChain`
- `ToolNode`
- `MemorySaver`

workflow 很單純：

- `agent` -> `tools` -> `agent`

直到最後一個 message 沒有 tool call 為止。

## 9.2 註冊的工具

目前 agent 主要工具有：

- `search_knowledge_tool`
- `read_knowledge_tool`
- `update_knowledge_tool`
- `analyze_food_image`
- `calculate_nutrition`
- `check_web_page`
- `fetch_web_page`
- `get_chat_history`
- `propose_profile_update`
- `compress_chat_history`
- `summarize_conversation_turn`
- `list_capabilities_tool`

## 9.3 工具與 RAG 的關係

這些工具裡，和知識檢索直接相關的有三類：

### 知識庫檢索

- `search_knowledge_tool`
- `read_knowledge_tool`
- `update_knowledge_tool`

### 記憶檢索

- `get_chat_history`
- `summarize_conversation_turn`
- `compress_chat_history`

### 外部補充證據

- `check_web_page`
- `fetch_web_page`

所以這個 agent 的 evidence source 不只一種：

- 本地知識庫
- 會話記憶
- 網頁內容
- 圖片理解

## 9.4 prompt 內的關鍵決策規則

系統 prompt 對 agent 下了幾個很重要的行為約束：

### factual nutrition claim

- 先用 `search_knowledge_tool`

### capability question

- 先用 `list_capabilities_tool`

### image attached

- 若有圖片，必須呼叫 `analyze_food_image` 一次

### URL 合理性 / 可達性問題

- 先用 `check_web_page`

### URL 內容是否可信 / 正確

- 先用 `fetch_web_page`

### profile 更新

- 先用 `propose_profile_update`
- 真正寫 DB 要等 approval flow

### conversation summary

- 只在有長期價值的 turn 才呼叫 `summarize_conversation_turn`

這讓它比較像規則化的 task-oriented agent，而不是完全自由生成。

## 9.5 模型路由與參數

`src/server/modelRouting.ts`：

### provider

- `local`
- `google`

### chat model

- local：`gemma`
- google：`gemma-4-31b-it`

### 共同設定

- `temperature: 0`
- `timeout: LLM_TIMEOUT_MS`，預設 `45000 ms`
- `maxRetries: 0`

### routing 規則

- `model_source=local` -> 只用 local
- `model_source=google` -> 只用 google
- `model_source=auto`
  - 有 key 時：`google -> local fallback`
  - 無 key 時：`local`

### 何時 fallback 到 local

只對 google upstream 的 retryable failure：

- 500 / 502 / 503 / 504
- 429
- quota / rate limit
- timeout
- connection reset
- fetch failed

## 9.6 其他重要 runtime 參數

| 參數 | 預設值 |
|---|---:|
| `MAX_REQUEST_BODY_MB` | `15` |
| `PROFILE_LOOKUP_TIMEOUT_MS` | `4000` |
| `AGENT_STREAM_TIMEOUT_MS` | `60000` |
| `USER_PROFILE_CACHE_TTL_MS` | `120000` |
| `MAX_HISTORY_MESSAGES` | `10` |

注意 `MAX_HISTORY_MESSAGES = 10` 只保留最近 10 則 message 進 agent，較長期記憶則依靠：

- summary index
- `get_chat_history`

---

## 10. 這個專案目前已經用了哪些「強化方式」

如果把「強化方式」理解成讓 RAG / agent 表現更穩的工程手段，這個專案其實已經做了不少，但不是走向量化那條路。

## 10.1 在檢索上的強化

### 1. 中文 query bigram 化

不是只搜整句，也會拆 CJK 2-gram。

### 2. title 權重高於 content

讓標題命中更容易被排前面。

### 3. MOHW 時效加權

讓較新的食安 / 衛教資訊更容易上來。

### 4. source type filter

可限制只搜：

- 規則檔
- MOHW
- 上傳文件

### 5. in-memory corpus cache

降低每次都重新掃描檔案的成本。

## 10.2 在資料前處理上的強化

### 1. 文件統一轉 Markdown

這讓不同格式最終回到一致的檢索介面。

### 2. metadata 包進 markdown

例如：

- `source_path`
- `parse_method`
- `uploaded_by`

這讓搜尋結果可以保留溯源能力。

### 3. SHA-256 重複檔檢查

避免重複 ingestion。

### 4. 長文本截斷

避免：

- 極大 PDF
- 過度長的 preview
- prompt / memory 膨脹

## 10.3 在 agent 上的強化

### 1. prompt 規則把工具使用明確化

不是讓模型完全自由決定，而是對特定任務指定優先工具。

### 2. room summary index

把長期記憶做成可追溯的摘要索引，而不是每次帶整串聊天記錄。

### 3. approval flow

對 profile update 做 human approval，降低 agent 直接誤改個資的風險。

### 4. tool trace + SSE status

方便前端觀察 agent 到底用了哪些工具。

### 5. local-only summary/title

摘要與標題萃取不跟主聊天路由綁死，讓行為更穩定。

---

## 11. 這個專案目前沒有做的東西

這段很重要，因為很多名詞容易被誤會。

### 11.1 沒有真正的 embedding retrieval

雖然有 `embeddingModel` 欄位，但沒有：

- embedding 計算
- 向量索引
- 向量相似度搜尋

### 11.2 沒有 vector database

沒有看到以下任何實際使用：

- Pinecone
- Qdrant
- Weaviate
- Milvus
- FAISS
- Chroma

### 11.3 沒有 reranker

沒有 cross-encoder rerank，也沒有第二階段重排。

### 11.4 沒有真正 hybrid search

沒有 keyword + vector 混排。

### 11.5 沒有 OCR fallback

掃描 PDF 會是弱點。

### 11.6 沒有把 graph 接進聊天主流程

目前 graph 是旁路 API，不是 agent 問答必經檢索。

---

## 12. 我認為目前實作上的幾個關鍵限制

這一段是我看完 code 後最值得注意的地方。

## 12.1 主 RAG 能用，但還偏「輕量」

優點是：

- 簡單
- 成本低
- 可解釋
- 方便維護

但缺點是：

- query 一旦換句話說，召回可能不穩
- 同義詞 / 近義詞能力有限
- 長文件跨段語意整合能力弱

## 12.2 `NUTRITION_RULES.md` 既是 prompt 常駐知識，也是搜尋語料

這是實用但有點混合式的設計。

好處：

- 基本營養規則不必每次都 retrieve 才看得到

代價：

- 知識更新會同時影響靜態 prompt 與動態檢索
- 之後若檔案變大，prompt token 壓力會上升

## 12.3 knowledge graph 的 source 發現有過寬問題

如前面分析，graph 本地來源會把：

- `AGENT.md`
- `SKILL_INDEX.md`
- `ingested_markdown/*.md`

也一併吃進去。

這可能導致：

- agent 操作說明也被圖譜化
- 上傳文件可能在圖譜中重複出現兩次
- source type 被錯分成 `nutrition_rules`

## 12.4 graph 對 binary upload 的處理目前不理想

主 RAG 的 ingestion 會把 PDF / DOCX 轉成文字 markdown，但 graph 抽取卻還在讀原始 `storagePath`。

如果未來要讓 graph 真正好用，我認為應該優先改成：

- uploaded source 讀 `parsed_md_path`
- 若沒有 `parsed_md_path` 再 fallback 原始路徑

## 12.5 中文編碼品質會影響 term-based graph extraction

repo 目前有些中文檔案與字串出現亂碼痕跡，這對：

- term dictionary
- rule regex
- 圖譜抽取 recall / precision

都會有影響。

---

## 13. 這套 RAG 現在適合拿來做什麼

以下是以「不大改架構」為前提，我認為它現在就能做好的方向。

## 13.1 營養衛教 QA

最直接的用途。

因為它已經具備：

- 營養規則檔
- MOHW 澄清文章
- 上傳衛教文件 ingestion

很適合回答：

- 某食物能不能吃
- 某族群的飲食注意事項
- 網路流言是否和 MOHW 說法一致

## 13.2 內部知識庫問答

只要把診所 / 團隊自己的：

- 衛教單
- SOP
- FAQ
- 醫師 / 營養師整理文件

丟進 `uploaded_knowledge`，就可以變成內部問答系統。

## 13.3 食安 / 新聞澄清助手

MOHW 同步 + recency boost 這個設計很適合做：

- 最近食安新聞解讀
- 謠言查核輔助
- 公衛澄清摘要

## 13.4 有記憶的個人化飲食助理

因為有：

- user profile
- taboo / disease
- room summary index
- raw history retrieval

它很適合做連續型 coaching，而不只是單回合問答。

## 13.5 圖譜式知識探索介面

即使它還不是 GraphRAG，現在也已經能拿來做：

- 某營養素與哪些食物有關
- 某疾病在知識庫裡和哪些建議有關
- 某關係的證據片段來自哪些文件

這對前台查詢頁或後台知識 QA 都很有價值。

---

## 14. 我認為這套 RAG 下一步最值得做什麼

如果你問我「最有投資報酬率的升級順序」，我會這樣排。

## 14.1 第一優先：把主 RAG 升成真正的 hybrid retrieval

建議做法：

1. 保留現在的 keyword 搜尋
2. 加入 embedding 建庫
3. 做 hybrid merge
4. 視需要再加 reranker

原因：

- 你現在的 chunk / metadata / ingestion 其實都已經有了
- 差的是 retrieval 引擎，不是資料管線

## 14.2 第二優先：讓 graph 真正接進聊天主流程

目前 graph 是旁路功能。

若要走向 GraphRAG，我會建議：

1. 先用一般 RAG 召回 document / chunk
2. 再用 graph 找相鄰 node / relation / evidence
3. 把 graph evidence 當作 second-stage context 注入回答

這會比直接拿 graph 當唯一檢索器更穩。

## 14.3 第三優先：修正 graph source 與 uploaded file 讀取

我認為這是目前 knowledge graph 最該修的工程點：

- local markdown source 範圍要更精準
- uploaded document 應讀 `parsed_md_path`
- source type 要明確區分

## 14.4 第四優先：補 OCR

如果未來知識文件很多來自掃描 PDF，OCR 幾乎是必要的。

## 14.5 第五優先：更好的 citation 輸出

目前 prompt 會要求 agent 提 `source_path`，但如果之後想讓結果更可信，我會建議：

- answer 中明確列出引用片段
- 讓前端可點 source preview
- 統一 citation 格式

---

## 15. 我認為這個 agent 還可以拿來做什麼

這部分我會比 RAG 再放大一點看，因為這個 repo 的價值其實不只在檢索。

## 15.1 餐點照片到飲食紀錄助手

你現在已經有：

- 圖片上傳
- `analyze_food_image`
- `calculate_nutrition`
- chat persistence

很適合往下做成：

- 拍照估熱量
- 自動生成 diet log
- 自動提醒今日蛋白質 / 熱量是否不足

## 15.2 慢性病 / 禁忌個人化建議 agent

因為 profile 裡已經有：

- height
- weight
- age
- gender
- taboo
- disease

再配合 knowledge search，很適合做：

- 糖尿病飲食建議
- 高血壓低鈉提醒
- 痛風 / 腎臟病飲食避雷

當然前提是把醫療責任邊界寫清楚。

## 15.3 營養師工作台

你可以把它做成 nutritionist copilot，例如：

- 上傳病患衛教文件
- 根據病況自動找相關衛教片段
- 快速生成個人化建議草稿
- 查證某網頁說法是否合理

## 15.4 食安 / 公衛監測助手

因為已有 MOHW 同步與 web fetch，你可以延伸做：

- 新聞 / 社群貼文查核
- 食安事件 FAQ 生成
- 最新公告摘要

## 15.5 結合圖譜的探索式前端

如果前端做好，這個 agent 可以不只是聊天框，而是：

- 左邊聊天
- 中間知識圖譜
- 右邊證據來源

讓使用者不只拿答案，還能看知識關係與來源證據。

## 15.6 長期陪伴型健康 agent

這個方向其實是目前架構最有潛力的：

- 摘要索引記憶
- profile 更新審批
- 歷史對話追溯

只要再加上：

- 定期追蹤目標
- 飲食習慣趨勢分析
- 週報 / 月報

它就能從「問答助手」升級成「持續型健康管理 agent」。

---

## 16. 最後的總結

如果要用一句比較專業、又不會誤導人的方式介紹這個 repo，我會建議這樣說：

> 這是一個以 LangGraph 為核心的健康飲食 agent 後端，主知識檢索採用本地 Markdown chunk 的 keyword-scored RAG，並結合文件 ingestion、聊天室摘要記憶、圖片分析、網頁驗證與獨立知識圖譜 API；目前知識圖譜屬於探索型能力，尚未接入聊天主流程成為真正的 GraphRAG。

如果再更直白一點：

- 主 RAG：有，而且能用
- graph：有，但目前不是主問答 GraphRAG
- agent：比單純 RAG 更完整，因為已經有記憶、工具、圖片、網頁與 profile workflow
- 下一步最值得做：hybrid retrieval、graph 接入主流程、OCR、citation 強化

