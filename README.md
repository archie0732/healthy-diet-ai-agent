# Healthy Diet AI Agent

Healthy Diet AI Agent is a Bun + TypeScript backend for nutrition chat, food-image analysis, RAG document ingestion, and knowledge-grounded diet guidance.

This repository now supports two deployment modes:

- Standalone mode: runs independently with SQLite, Docker, HTTP API, and terminal CLI
- Integration mode: connects to Supabase and can stay compatible with the existing `health-diet-api` ecosystem

- [日本語の技術文書](/README_jp.md)
- [中文文檔](/README_zh.md)

## Project Background

This project was originally built to work with:

- [`PU-Hub/healthy-diet`](https://github.com/PU-Hub/healthy-diet) as the API-side project
- [`archie0732/healthy-diet-web`](https://github.com/archie0732/healthy-diet-web) as the web frontend

As more people started watching and using this repository directly, the project direction changed. Instead of keeping it only as an internal backend tied to the original stack, this repository is now being shaped as an independent deployable agent service that can still integrate with the original projects when needed.

## Highlights

- Dual storage backend: `sqlite` or `supabase`
- HTTP API for chat, RAG search, document management, knowledge ingestion, and MOHW sync
- Terminal CLI for direct local usage
- Docker-first standalone deployment
- Local knowledge base plus uploaded knowledge documents
- Optional Supabase-backed persistence for chat history, user profiles, and document metadata

## Project Structure

- Server entry: `src/index.ts`
- CLI entry: `src/cli.ts`
- Chat handlers: `src/serverHandlers.ts`
- Agent runtime: `src/server/agentRuntime.ts`
- Storage facade: `src/storage/runtime.ts`
- SQLite backend: `src/storage/sqlite/adapter.ts`
- Supabase backend: `src/storage/supabase/adapter.ts`
- RAG document routes: `src/server/ragDocuments.ts`
- Knowledge ingestion routes: `src/server/knowledgeIngestion.ts`
- Knowledge graph routes: `src/server/knowledgeGraph.ts`
- MOHW sync logic: `src/server/mohwNews.ts`

## Deployment Modes

### 1. Standalone mode with SQLite

Use this when you want to run the agent by itself on your own machine or inside Docker.

Characteristics:

- no Supabase credentials required
- automatic SQLite schema bootstrap on startup
- local DB file path controlled by `SQLITE_DB_PATH`
- suitable for single-host deployment, local demos, and terminal usage

### 2. Integration mode with Supabase

Use this when you want to connect the agent to an existing Supabase-backed stack or keep compatibility with the original project flow around `health-diet-api`.

Characteristics:

- keeps current API routes
- uses Supabase for chat history, user profile, knowledge documents, and ingestion jobs
- useful when this agent is one service inside a larger application

## Quick Start

### Prerequisites

- Bun 1.2+
- Node-compatible environment for Bun
- Optional: Docker / Docker Compose
- Optional: Supabase project for integration mode
- Model endpoint compatible with the current agent configuration

### Install

```bash
bun install
```

### Create env file

```bash
cp .env.example .env
```

## Environment Variables

Core runtime variables:

- `PORT`
- `AI_API_URL`
- `STORAGE_BACKEND=sqlite|supabase`
- `SQLITE_DB_PATH`
- `CLI_USER_ID`
- `CLI_THREAD_ID`

Supabase variables for integration mode:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Google routing variables:

- `GEMINI_AI_API`
- `GEMINI_API_KEY`
- `GOOGLE_CHAT_MODEL`
- `GOOGLE_BASE_URL`

Project-level agent behavior now lives in:

- `agent_config.json`

Background sync variables:

- `MOHW_NEWS_SYNC_ENABLED`
- `MOHW_NEWS_SYNC_INTERVAL_MINUTES`
- `MOHW_NEWS_SYNC_RUN_ON_START`

Config precedence:

- `agent_config.json` provides the repository default behavior
- environment variables override those defaults for a specific deployment
- `MOHW_NEWS_SYNC_ENABLED` overrides `agent_config.json` `features.mohw_enabled` when explicitly set

## Standalone Local Usage

Recommended `.env` values:

```env
PORT=8001
AI_API_URL=http://127.0.0.1:8080/v1/
STORAGE_BACKEND=sqlite
SQLITE_DB_PATH=./data/healthy-diet-agent.db
CLI_USER_ID=local-user
CLI_THREAD_ID=local-thread
```

Start the HTTP server:

```bash
bun run start
```

The server listens on:

- `http://localhost:8001`
- chat endpoint: `POST /api/chat`
- health check: `GET /ping`

### Terminal CLI

Run a direct prompt in the terminal:

```bash
bun run cli -- --message "Analyze my lunch"
```

Optional CLI arguments:

```bash
bun run cli -- --message "Give me a low sodium dinner idea" --user-id demo-user --thread-id demo-thread --model-source auto
```

### Optional manual SQLite initialization

The app auto-bootstraps the SQLite schema on startup, so manual setup is usually not required.

If you want to inspect or pre-seed a local database yourself, use:

- schema: `docs/sqlite/schema.sql`
- sample seed: `docs/sqlite/seed.sample.sql`

Example with `sqlite3`:

```bash
sqlite3 ./data/healthy-diet-agent.db < docs/sqlite/schema.sql
sqlite3 ./data/healthy-diet-agent.db < docs/sqlite/seed.sample.sql
```

The seed file is only an example for local development. You can edit the sample user, room, and chat rows before importing it.

## Docker Deployment

The default Docker setup is designed for standalone SQLite mode.

Build and run:

```bash
docker compose up --build
```

Default container behavior:

- `STORAGE_BACKEND=sqlite`
- `SQLITE_DB_PATH=/app/data/healthy-diet-agent.db`
- database files persisted through `./data:/app/data`

Useful mounted directories:

- `./data`
- `./knowledge_base`
- `./users_images`

For automated production deployment with GitHub Actions, GHCR, and a self-hosted runner, see:

- `docs/deployment-self-hosted-ghcr.md`

## Integration with Supabase or Existing Projects

Set:

```env
STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

Notes:

- existing HTTP routes remain available
- storage writes are routed through the shared storage layer
- this mode is intended for existing stacks that already use Supabase tables for chat and knowledge metadata

## Repurpose This Repo Into Another Advisor

Fork authors can now customize the agent without editing core runtime code for the common role and retrieval cases.

Start here:

1. Edit `agent_config.json`
2. Replace `knowledge_base/AGENT.md`
3. Replace or remove `knowledge_base/NUTRITION_RULES.md`
4. Enable or disable `mohw_news` in `agent_config.json`
5. Add your own uploaded or curated knowledge files

What `agent_config.json` controls:

- agent prompt file locations
- response style defaults
- RAG enabled sources
- RAG search tuning
- MOHW default enablement

Practical note:

- use `agent_config.json` for repo-level defaults
- use `.env` only for deployment-specific overrides

## API Overview

### Chat

- `POST /api/chat`
- `POST /api/approve`
- `POST /api/generate_title`
- `GET /ping`

### RAG and knowledge

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

### MOHW sync

- `POST /api/news/sync`
- `GET /api/news`
- `GET /api/news/:id`
- `GET /api/news-files`

## Local Data and Knowledge Paths

- SQLite file: `data/healthy-diet-agent.db` or `SQLITE_DB_PATH`
- Uploaded images: `users_images/`
- Uploaded source files: `knowledge_base/uploads/`
- Parsed markdown: `knowledge_base/ingested_markdown/`
- Nutrition rules: `knowledge_base/NUTRITION_RULES.md`
- MOHW knowledge: `knowledge_base/mohw_clarifications/`

## Testing

Run focused tests:

```bash
bun test src/server/httpRuntime.test.ts src/storage/runtime.test.ts src/server/serverHandlers.test.ts src/server/dbTools.test.ts src/server/ragDocuments.test.ts src/cli.test.ts
```

Run the whole Bun test suite:

```bash
bun test
```

## Notes

- SQLite mode is the recommended default for self-hosting
- Supabase mode remains supported for integration scenarios
- standalone mode does not require `health-diet-api`
- the app still expects a working model endpoint through `AI_API_URL` or the configured Google route
- RAG document admin routes now require forwarded admin headers: `X-Admin-User-Id` and `X-Admin-Role` (`admin` or `nutritionist`)
- A bare `Authorization` header is no longer treated as admin access for document management routes
- When `/api/chat` fails after creating the initial history row, the placeholder reply is rewritten from `__PENDING__` to a `[FAILED] ...` marker

## Related Docs

- Chinese README: `README_zh.md`
- Japanese README: `README_jp.md`
- Change log: `CHANGELOG_CODEX.md`
