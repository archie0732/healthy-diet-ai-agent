# Healthy Diet AI Agent

![Bun](https://img.shields.io/badge/Bun-1.2%2B-f9f1e1?style=flat-square&logo=bun&logoColor=000000)
![TypeScript](https://img.shields.io/badge/TypeScript-6-blue?style=flat-square&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-222222?style=flat-square&logo=express&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-Agent-green?style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-Standalone-0f80cc?style=flat-square&logo=sqlite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Integration-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=flat-square&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

[English](README.md) | [日本語](README_jp.md) | 繁體中文

Healthy Diet AI Agent 是一個以 Bun + TypeScript 建立的營養與健康飲食後端，支援聊天、食物圖片分析、RAG 文件知識檢索、知識圖譜與衛福部資料同步。

目前這個 repo 已經支援兩種部署模式：

- Standalone mode：使用 SQLite，能獨立透過 Docker、HTTP API 或 terminal CLI 使用
- Integration mode：使用 Supabase，保留與既有 `health-diet-api` 生態整合的能力

## 技術棧

- Runtime：`Bun`
- 語言：`TypeScript`
- HTTP server：`Express`
- Agent 框架：`LangChain`、`LangGraph`、`DeepAgents`
- Storage：`SQLite` 或 `Supabase`
- AI 串接：OpenAI 相容 API 路由，並可選用 Google Gemini 路由
- 部署：`Docker Compose`

## 核心功能

- 營養聊天助理，可用於飲食建議、餐點規劃與營養問答
- 食物圖片分析流程，可支援餐點理解與營養導向互動
- RAG 文件搜尋與文件管理，可整理與查詢營養知識文件
- 知識圖譜抽取與搜尋，可建立較結構化的健康與飲食知識關聯
- 衛福部資料同步流程，可匯入公開澄清資料與參考內容
- 支援 `SQLite`、`Supabase`、HTTP API 與 CLI 的彈性部署模式

## 預計推出功能

- 根據使用者 profile、偏好與歷史紀錄，提供更個人化的飲食建議
- 強化多模態餐點分析能力，提供更完整的食物情境理解與回覆依據
- 擴充知識管理與 ingestion 的後台與營運工具
- 提升多步驟 agent workflow，強化檢索、推理與任務自動化能力

## 專案背景

這個專案原本是為了搭配以下兩個專案而建立：

- [`PU-Hub/healthy-diet`](https://github.com/PU-Hub/healthy-diet) 作為 API 端專案
- [`archie0732/healthy-diet-web`](https://github.com/archie0732/healthy-diet-web) 作為前端 Web 專案

後來因為這個 repo 本身開始有更多人關注與查看，所以專案方向做了調整。現在除了保留和原本專案整合的能力，也把這個 repo 逐步整理成可以獨立部署、獨立使用的 AI agent 服務。

## 特色

- 可切換 storage backend：`sqlite` 或 `supabase`
- 可直接獨立部署，不必依賴 `health-diet-api`
- 提供 HTTP API 與 terminal CLI
- Docker 預設走 standalone SQLite 模式
- 支援本地 knowledge base 與上傳文件 ingestion
- 保留 Supabase 整合能力，適合接回原本專案

## 專案結構

```
.
├── .agents/                    # 代理自訂規則 / 代理設定檔
├── agent_skills/               # 代理自訂工具/技能模組
├── data/                       # 本地資料庫目錄 (Standalone 模式下 SQLite DB 存放於此)
├── docs/                       # 資料庫 Schema 與補充說明文件
│   ├── sqlite/                 # SQLite 資料庫 Schema 及範例測試資料
│   └── supabase/               # Supabase 資料庫設定與腳本
├── knowledge_base/             # 已匯入文件與 RAG 資料來源目錄
│   ├── ingested_markdown/      # 已解析的 RAG 專用 Markdown 文件
│   ├── mohw_clarifications/    # 衛福部 (MOHW) 同步資料存放目錄
│   ├── uploads/                # 上傳原始檔案的暫存目錄
│   └── NUTRITION_RULES.md      # 飲食分析的核心導引規則 (Ground-truth)
├── raw_data/                   # 原始資料檔案或腳本
├── scripts/                    # 工具腳本 (如資料預處理、備份等)
├── src/                        # 主要原始碼目錄
│   ├── config/                 # 應用程式設定 (Logger、環境變數驗證)
│   ├── server/                 # 業務邏輯處理與 Agent 實作
│   │   ├── agentRuntime.ts     # 核心 LangChain/LangGraph 代理執行期設定
│   │   ├── httpRuntime.ts      # HTTP 伺服器執行期引導 (Bootstrap)
│   │   ├── knowledgeGraph.ts   # 知識圖譜抽取與搜尋引擎
│   │   ├── knowledgeIngestion.ts # 處理檔案上傳、解析與向量嵌入匯入
│   │   ├── mohwNews.ts         # 衛福部資料同步任務
│   │   └── ragDocuments.ts     # 文件資料庫 CRUD 與索引器路由
│   ├── storage/                # 資料庫抽象層 (SQLite 與 Supabase 配接器)
│   │   ├── sqlite/             # SQLite 連線與配接器邏輯
│   │   └── supabase/           # Supabase 客戶端與配接器邏輯
│   ├── cli.ts                  # 命令列介面 (CLI) 入口點
│   ├── index.ts                # HTTP Express 伺服器入口點
│   └── serverHandlers.ts       # 伺服器端點的路由控制器處理器
├── technical_docs/             # 架構設計文件與變更紀錄 (Changelog)
├── agent_config.json           # 代理的宣告式行為控制與預設參數
├── compose.yml                 # Docker Compose 設定檔
└── package.json                # 專案依賴與執行指令腳本設定
```

## 部署模式

### 1. Standalone SQLite 模式

適合：

- 自己在本機部署
- 直接用 Docker 跑
- 想用 terminal 下 prompt
- 不想先準備 Supabase

特性：

- 不需要 `SUPABASE_URL` 與 `SUPABASE_SERVICE_KEY`
- 啟動時自動建立 SQLite schema
- DB 路徑由 `SQLITE_DB_PATH` 控制

### 2. Supabase Integration 模式

適合：

- 已經有既有 Supabase schema
- 想保留與原本系統的整合方式
- 想讓這個 agent 作為既有系統中的一個服務

特性：

- 維持既有 API 路由
- 聊天記錄、使用者資料、文件 metadata 可走 Supabase

## 安裝

### 先決條件

- Bun 1.2+
- 與 Bun 相容之 Node 環境
- 可選：Docker / Docker Compose
- 可選：用於整合模式的 Supabase 專案
- 與目前 Agent 設定相容的模型端點

### 安裝步驟

```bash
bun install
```

### 建立環境變數設定檔

```bash
cp .env.example .env
```

## 重要環境變數

核心執行期變數：

- `PORT`
- `AI_API_URL`
- `STORAGE_BACKEND=sqlite|supabase`
- `SQLITE_DB_PATH`
- `CLI_USER_ID`
- `CLI_THREAD_ID`

Supabase 整合模式變數：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Google 模型路由變數：

- `GEMINI_AI_API`
- `GEMINI_API_KEY`
- `GOOGLE_CHAT_MODEL`
- `GOOGLE_BASE_URL`

專案級代理行為設定（位於專案根目錄）：

- `agent_config.json`

背景同步變數：

- `MOHW_NEWS_SYNC_ENABLED`
- `MOHW_NEWS_SYNC_INTERVAL_MINUTES`
- `MOHW_NEWS_SYNC_RUN_ON_START`

設定優先權優先順序：

- `agent_config.json` 提供整個專案的預設行為
- 環境變數（`.env`）會覆蓋特定部署的預設值
- 當明確設定 `MOHW_NEWS_SYNC_ENABLED` 時，會覆蓋 `agent_config.json` 中的 `features.mohw_enabled`

## Standalone 本地使用

建議 `.env`：

```env
PORT=8001
AI_API_URL=http://127.0.0.1:8080/v1/
STORAGE_BACKEND=sqlite
SQLITE_DB_PATH=./data/healthy-diet-agent.db
CLI_USER_ID=local-user
CLI_THREAD_ID=local-thread
```

啟動 HTTP server：

```bash
bun run start
```

預設網址：

- `http://localhost:8001`
- chat endpoint：`POST /api/chat`
- health check：`GET /ping`

## Terminal CLI 使用

直接在 terminal 下 prompt：

```bash
bun run cli -- --message "Analyze my lunch"
```

也可以指定使用者、thread 與 model source：

```bash
bun run cli -- --message "Give me a low sugar dinner idea" --user-id demo-user --thread-id demo-thread --model-source auto
```

## 可選：手動初始化 SQLite

一般情況下不需要手動建表，因為 app 啟動時會自動 bootstrap SQLite schema。

如果你想自己先建立或匯入本地測試資料，可以使用：

- schema：`docs/sqlite/schema.sql`
- sample seed：`docs/sqlite/seed.sample.sql`

如果你的環境有 `sqlite3`：

```bash
sqlite3 ./data/healthy-diet-agent.db < docs/sqlite/schema.sql
sqlite3 ./data/healthy-diet-agent.db < docs/sqlite/seed.sample.sql
```

`seed.sample.sql` 只是本地開發示例，你可以先修改裡面的使用者、聊天室與對話資料再匯入。

## Docker 部署

Docker 預設就是 standalone SQLite 模式。

```bash
docker compose up --build
```

預設行為：

- `STORAGE_BACKEND=sqlite`
- `SQLITE_DB_PATH=/app/data/healthy-diet-agent.db`
- 透過 `./data:/app/data` 持久化 SQLite 資料

常用掛載：

- `./data`
- `./knowledge_base`
- `./users_images`

關於使用 GitHub Actions、GHCR 和自我託管執行器（self-hosted runner）進行自動化生產環境部署，請參閱：

- [docs/deployment-self-hosted-ghcr.md](docs/deployment-self-hosted-ghcr.md)

## 與原專案 / Supabase 整合

如果你要接回既有系統，設定：

```env
STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

說明：

- 現有 API 路由仍保留
- 真正的 storage 寫入已統一經過 shared storage layer
- 適合接回既有 `health-diet-api` 或其他 Supabase 架構

## Fork 後改造成其他顧問

現在常見的角色與檢索客製化，可以先不改核心 runtime 程式碼。

建議修改順序：

1. 編輯 `agent_config.json`
2. 替換 `knowledge_base/AGENT.md`
3. 替換或移除 `knowledge_base/NUTRITION_RULES.md`
4. 在 `agent_config.json` 開啟或關閉 `mohw_news`
5. 加入你自己的知識文件

`agent_config.json` 目前可控制：

- agent prompt 檔案位置
- 回覆風格預設值
- RAG 啟用來源
- RAG 搜尋參數
- MOHW 預設是否啟用

設定優先序：

- `agent_config.json` 是專案預設值
- `.env` 是部署時覆蓋值
- `MOHW_NEWS_SYNC_ENABLED` 會在有設定時覆蓋 `agent_config.json` 的 `features.mohw_enabled`

## API 概覽

### Chat

- `POST /api/chat`
- `POST /api/approve`
- `POST /api/generate_title`
- `GET /ping`

### RAG 與知識文件

- `GET /api/rag/search`
- `POST /api/rag/search`
- `GET /api/rag/documents`
- `POST /api/rag/documents`
- `GET /api/rag/documents/:document_id`
- `DELETE /api/rag/documents/:document_id`
- `POST /api/rag/documents/:document_id/reindex`
- `GET /api/rag/documents/:document_id/file`
- `GET /api/rag/documents/:document_id/preview`
- `GET /api/rag/sources/:document_id/file`
- `GET /api/rag/sources/:document_id/preview`

### Knowledge ingestion

- `POST /api/admin/knowledge/upload`
- `POST /api/admin/knowledge/ingest/:id`
- `GET /api/admin/knowledge/jobs/:jobId`

### Knowledge graph

- `POST /api/graph/extract-all`
- `GET /api/graph/status`
- `POST /api/graph/documents/:document_id/extract`
- `GET /api/graph/documents/:document_id`
- `POST /api/graph/search`
- `GET /api/graph/nodes`
- `GET /api/graph/nodes/:node_id`
- `GET /api/graph/relations/:relation_id/evidence`

### 衛福部同步

- `POST /api/news/sync`
- `GET /api/news`
- `GET /api/news/:id`
- `GET /api/news-files`

## 本地資料與知識路徑

- SQLite 檔案：`data/healthy-diet-agent.db` 或 `SQLITE_DB_PATH`
- 使用者圖片：`users_images/`
- 上傳原始文件：`knowledge_base/uploads/`
- 解析後 markdown：`knowledge_base/ingested_markdown/`
- 營養規則：`knowledge_base/NUTRITION_RULES.md`
- 衛福部資料：`knowledge_base/mohw_clarifications/`

## 測試

重點測試：

```bash
bun test src/server/httpRuntime.test.ts src/storage/runtime.test.ts src/server/serverHandlers.test.ts src/server/dbTools.test.ts src/server/ragDocuments.test.ts src/cli.test.ts
```

全部 Bun 測試：

```bash
bun test
```

## 備註

- 如果你要自己架設，建議優先用 SQLite standalone 模式
- 如果你要接既有系統，再切到 Supabase mode
- standalone mode 不需要 `health-diet-api`
- 不論哪種模式，都仍需要可用的模型端點，例如 `AI_API_URL`

## 安全與失敗處理說明

- RAG 文件管理 API 現在必須帶 `X-Admin-User-Id` 與 `X-Admin-Role`（`admin` 或 `nutritionist`）
- 只有 `Authorization` header 已不再視為管理員權限
- 如果 `/api/chat` 在建立初始聊天紀錄後失敗，原本的 `__PENDING__` 會改寫成 `[FAILED] ...`

## 相關文件

- 英文 README：[README.md](README.md)
- 日文 README：[README_jp.md](README_jp.md)
- 技術文件資料夾：[technical_docs/](technical_docs/)
- 變更紀錄：[technical_docs/CHANGELOG.md](technical_docs/CHANGELOG.md)
- 每日計劃日誌: [technical_docs/DAILY_PLANNING_LOG.md](technical_docs/DAILY_PLANNING_LOG.md)
- RAG 分析文件：[technical_docs/RAG_AGENT_ANALYSIS_ZH.md](technical_docs/RAG_AGENT_ANALYSIS_ZH.md)

## License

本專案採用 `MIT` license，詳見 `LICENSE`。
