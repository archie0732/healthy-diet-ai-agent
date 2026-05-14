# Healthy Diet AI Agent - 專案導覽（給 Codex 與開發者）

最後更新：2026-05-14

## 1. 專案在做什麼

這是一個以 `Express + LangGraph + 工具鏈` 組成的飲食 AI Agent 後端，核心能力：

- 接收使用者文字/圖片，進行餐點辨識與營養估算
- 以多工具協作生成回覆
- 串接 Supabase 儲存聊天資料、個人資料與摘要
- 支援個資更新核准流程（提案 -> 使用者核准 -> 寫入）

## 2. 主要程式入口

- 伺服器入口：`src/index.ts`
- 核心路由與流程：`src/serverHandlers.ts`
- Agent 規則來源：
  - `knowledge_base/AGENT.md`
  - `knowledge_base/SKILLS_INDEX.md`
  - `knowledge_base/NUTRITION_RULES.md`

## 3. 路由地圖

- `POST /api/chat` -> `chatHandler`
- `POST /api/approve` -> `approveHandler`
- `POST /api/generate_title` -> `generateTitleHandler`
- `GET /ping` -> `pingHandler`
- `GET /images/*` -> `imagesStaticMiddleware`

路由完整規格文件：`Doc/api_route_input_output_spec.md`

## 4. 目前功能與檔案位置

- Request logging / body 限制：`src/serverHandlers.ts`
- 圖片解析與落地：`src/serverHandlers.ts` (`saveIncomingImageToWorkspace`)
- Agent workflow：`src/serverHandlers.ts` (`agentTools`, `workflow`, `runAgentStream`)
- 影像辨識：`agent_skills/vision_analyzer/vision_model.ts`
- 營養估算：`agent_skills/calorie_calculator/calc_tools.ts`
- 知識庫讀寫：`agent_skills/admin_knowledge/file_tools.ts`
- 聊天摘要：`agent_skills/memory_summarizer/summarizer_tools.ts`
- Supabase 操作：`agent_skills/supabase_logger/db_tools.ts`

## 5. Agent 工具註冊現況

目前在 `agentTools` 註冊：

1. `readKnowledgeTool`
2. `updateKnowledgeTool`
3. `visionAnalyzerTool`
4. `calculateNutritionTool`
5. `getChatHistoryTool`
6. `proposeProfileUpdateTool`
7. `compressChatHistoryTool`

注意：`updateUserProfileTool` 只在 `/api/approve` 使用，不讓模型直接寫入 profile。

## 6. 環境變數

- `PORT`
- `AI_API_URL`
- `MAX_REQUEST_BODY_MB`
- `MAX_IMAGE_BYTES`
- `LLM_TIMEOUT_MS`
- `PROFILE_LOOKUP_TIMEOUT_MS`
- `AGENT_STREAM_TIMEOUT_MS`
- `USER_PROFILE_CACHE_TTL_MS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

## 7. 維護規則

1. 新增路由：掛載在 `src/index.ts`，實作放 `src/serverHandlers.ts`（或拆新模組）。
2. 路由 contract 變更：同步更新 `Doc/api_route_input_output_spec.md`。
3. 新增 Agent 能力：實作於 `agent_skills/<feature>/`，並在 `agentTools` 註冊。
4. 個資寫入不可繞過核准流程。

## 8. 編碼與亂碼避免（重要）

### 這次亂碼的主要原因

- 檔案若是 UTF-8，卻被 Windows Big5 (`CP950`) 方式讀取，中文就會變亂碼。

### 固定做法

1. 文件一律存 `UTF-8`（Windows 建議 `UTF-8 with BOM`）。
2. 終端先確認編碼：`chcp`，必要時切換：`chcp 65001`。
3. VS Code 固定 `"files.encoding": "utf8"`。
4. 改完中文文件，用編輯器與終端 `Get-Content` 各檢查一次。

### 快速檢查

```powershell
chcp
Get-Content AGENT.md
```
