# Healthy Diet AI Agent

![Bun](https://img.shields.io/badge/Bun-1.2%2B-f9f1e1?style=flat-square&logo=bun&logoColor=000000)
![TypeScript](https://img.shields.io/badge/TypeScript-6-blue?style=flat-square&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-222222?style=flat-square&logo=express&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-Agent-green?style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-Standalone-0f80cc?style=flat-square&logo=sqlite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Integration-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=flat-square&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

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

## 主要路徑

- Server 入口：`src/index.ts`
- CLI 入口：`src/cli.ts`
- Chat handler：`src/serverHandlers.ts`
- Agent runtime：`src/server/agentRuntime.ts`
- Storage facade：`src/storage/runtime.ts`
- SQLite backend：`src/storage/sqlite/adapter.ts`
- Supabase backend：`src/storage/supabase/adapter.ts`
- 文件管理 API：`src/server/ragDocuments.ts`
- 知識 ingestion API：`src/server/knowledgeIngestion.ts`

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

```bash
bun install
cp .env.example .env
```

## 重要環境變數

核心：

- `PORT`
- `AI_API_URL`
- `STORAGE_BACKEND=sqlite|supabase`
- `SQLITE_DB_PATH`
- `CLI_USER_ID`
- `CLI_THREAD_ID`

Supabase 整合模式：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Google 模型路由：

- `GEMINI_AI_API`
- `GEMINI_API_KEY`
- `GOOGLE_CHAT_MODEL`
- `GOOGLE_BASE_URL`

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

## 相關文件

- English README：`README.md`
- Japanese README：`README_jp.md`
- 變更紀錄：`CHANGELOG.md`

## License

本專案採用 `MIT` license，詳見 `LICENSE`。
## Security And Failure Notes

- RAG 文件管理 API 現在必須帶 `X-Admin-User-Id` 與 `X-Admin-Role`（`admin` 或 `nutritionist`）
- 只有 `Authorization` header 已不再視為管理員權限
- 如果 `/api/chat` 在建立初始聊天紀錄後失敗，原本的 `__PENDING__` 會改寫成 `[FAILED] ...`
