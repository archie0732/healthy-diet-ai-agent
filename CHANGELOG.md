# CHANGELOG_CODEX

## 2026-07-01 12:55 Asia/Taipei

- Summary: Hardened RAG admin route authentication and prevent failed chat turns from leaving `__PENDING__` rows behind.
- Author: Codex
- Scope:
  - RAG admin auth
  - chat failure persistence
  - repository documentation
- Files:
  - `src/server/ragDocuments.ts`
  - `src/server/ragDocuments.test.ts`
  - `src/serverHandlers.ts`
  - `src/server/serverHandlers.test.ts`
  - `README.md`
  - `README_zh.md`
  - `CHANGELOG_CODEX.md`
- API:
  - Added: `none`
  - Changed: `RAG document admin routes now require forwarded admin identity headers`
  - Removed: `none`
- Env:
  - Added: `none`
  - Changed: `none`
  - Removed: `none`
- Notes:
  - `/api/chat` now rewrites failed placeholder replies from `__PENDING__` to `[FAILED] ...` when the model run errors after persistence starts.
  - Bare `Authorization` headers no longer grant admin access to RAG document routes.

## 2026-06-22 22:10 Asia/Taipei

- Summary: Reworked conversation memory so `chat_rooms.summary` stores a traceable summary index before falling back to raw `diet_chat_history` turns.
- Author: Codex
- Scope:
  - conversation memory persistence
  - summary retrieval formatting
  - repository documentation
- Files:
  - `src/serverHandlers.ts`
  - `src/server/roomSummaryIndex.ts`
  - `src/server/roomSummaryIndex.test.ts`
  - `agent_skills/db_tools.ts`
  - `src/server/serverHandlers.test.ts`
  - `src/server/dbTools.test.ts`
  - `Doc/supabase/2026-06-22-chat-room-summary-index-migration.sql`
  - `README.md`
  - `README_zh.md`
  - `CHANGELOG_CODEX.md`
- API:
  - Added: `none`
  - Changed: `chat_rooms.summary` payload shape now supports structured summary index entries
  - Removed: `none`
- Env:
  - Added: `none`
  - Changed: `none`
  - Removed: `none`
- Notes:
  - Runtime context now feeds a room summary index first, and each summary entry can point back to raw chat rows and archival summary rows.
  - Added a Supabase backfill migration that converts legacy `chat_rooms.summary` text into JSONB summary index arrays.

## 2026-06-16 16:40 Asia/Taipei

- Summary: Changed the default Google chat model from Gemma 3 31B to Gemma 4 31B and synchronized the related documentation.
- Author: Codex
- Scope:
  - model routing
  - repository documentation
- Files:
  - `src/server/modelRouting.ts`
  - `.env.example`
  - `README.md`
  - `README_zh.md`
  - `CHANGELOG_CODEX.md`
- API:
  - Added: `none`
  - Changed: `none`
  - Removed: `none`
- Env:
  - Added: `none`
  - Changed: `GOOGLE_CHAT_MODEL`
  - Removed: `none`
- Notes:
  - Default Google chat model is now `gemma-4-31b-it`; `.env` can still override it explicitly.

## 2026-06-16 16:30 Asia/Taipei

- Summary: Rewrote the project documentation in English and Chinese, and added explicit Codex maintenance rules for future versioned updates.
- Author: Codex
- Scope:
  - repository documentation
  - agent maintenance workflow
- Files:
  - `README.md`
  - `README_zh.md`
  - `AGENT.md`
  - `CHANGELOG_CODEX.md`
- API:
  - Added: `none`
  - Changed: `none`
  - Removed: `none`
- Env:
  - Added: `none`
  - Changed: `none`
  - Removed: `none`
- Notes:
  - Future feature work must update both READMEs and append a new change entry here when behavior changes.
## 2026-07-01 12:00 CST

- Summary: Added standalone SQLite mode, shared storage adapters, terminal CLI support, and rewritten multilingual deployment docs.
- Author: Codex
- Scope:
  - storage
  - cli
  - docker
  - docs
- Files:
  - `src/storage/runtime.ts`
  - `src/storage/sqlite/adapter.ts`
  - `src/storage/supabase/adapter.ts`
  - `src/cli.ts`
  - `src/serverHandlers.ts`
  - `src/server/ragDocuments.ts`
  - `src/server/knowledgeIngestion.ts`
  - `README.md`
  - `README_zh.md`
  - `README_jp.md`
- API:
  - Added: `none`
  - Changed: `startup and deployment behavior`
  - Removed: `none`
- Env:
  - Added: `STORAGE_BACKEND`, `SQLITE_DB_PATH`, `CLI_USER_ID`, `CLI_THREAD_ID`
  - Changed: `none`
  - Removed: `none`
- Notes:
  - Standalone deployments now default to SQLite.
  - Supabase mode remains available for existing integrations.
  - Added standalone SQLite schema and sample seed references under `docs/sqlite/`.

## 2026-07-01 12:20 CST

- Summary: Added project-background notes to the English, Chinese, and Japanese READMEs explaining the move from stack-coupled usage to an independent service direction.
- Author: Codex
- Scope:
  - repository documentation
- Files:
  - `README.md`
  - `README_zh.md`
  - `README_jp.md`
  - `CHANGELOG_CODEX.md`
- API:
  - Added: `none`
  - Changed: `none`
  - Removed: `none`
- Env:
  - Added: `none`
  - Changed: `none`
  - Removed: `none`
- Notes:
  - Documented the original relationship with `PU-Hub/healthy-diet` and `healthy-diet-web`.
  - Clarified why this repository is now being presented as an independent deployable project.

## 2026-07-01 15:40 Asia/Taipei

- Summary: Added `agent_config.json` driven role, prompt, RAG, and MOHW defaults so forks can repurpose the project into other advisor agents with less code editing.
- Author: Codex
- Scope:
  - config
  - runtime
  - rag
  - docs
- Files:
  - `agent_config.json`
  - `src/config/agentConfig.ts`
  - `src/server/agentRuntime.ts`
  - `agent_skills/file_tools.ts`
  - `src/server/ragSearch.ts`
  - `src/server/mohwConfig.ts`
  - `README.md`
  - `README_zh.md`
  - `README_jp.md`
  - `.env.example`
- API:
  - Added: `none`
  - Changed: `runtime configuration and RAG search behavior`
  - Removed: `none`
- Env:
  - Added: `none`
  - Changed: `MOHW_NEWS_SYNC_ENABLED`
  - Removed: `none`
- Notes:
  - Prompt file locations now resolve from `agent_config.json`.
  - RAG enabled sources and search tuning now resolve from `agent_config.json`.
  - `MOHW_NEWS_SYNC_ENABLED` now overrides the repo default from `agent_config.json` when explicitly set.
