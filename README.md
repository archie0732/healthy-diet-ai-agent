# Healthy Diet AI Agent

![Bun](https://img.shields.io/badge/Bun-1.2%2B-f9f1e1?style=flat-square&logo=bun&logoColor=000000)
![TypeScript](https://img.shields.io/badge/TypeScript-6-blue?style=flat-square&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-222222?style=flat-square&logo=express&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-Agent-green?style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-Standalone-0f80cc?style=flat-square&logo=sqlite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Integration-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=flat-square&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

English | [日本語](README_jp.md) | [繁體中文](README_zh.md)

Healthy Diet AI Agent is a Bun + TypeScript backend for nutrition and healthy diet support. It features chat, food image analysis, RAG document knowledge retrieval, knowledge graph, and MOHW (Ministry of Health and Welfare) data synchronization.

This repository now supports two deployment modes:

- Standalone mode: uses SQLite, runs independently via Docker, HTTP API, or terminal CLI
- Integration mode: uses Supabase, maintaining the ability to integrate with the existing `health-diet-api` ecosystem

## Tech Stack

- Runtime: `Bun`
- Language: `TypeScript`
- HTTP Server: `Express`
- Agent Framework: `LangChain`, `LangGraph`, `DeepAgents`
- Storage: `SQLite` or `Supabase`
- AI Integration: OpenAI-compatible API routing, with optional Google Gemini routing
- Deployment: `Docker Compose`

## Core Features

- Nutrition chat assistant for dietary advice, meal planning, and nutrition Q&A
- Food image analysis workflow supporting meal understanding and nutrition-guided interactions
- RAG document search and document management to organize and query nutrition knowledge documents
- Version-Aware & Policy-Aware RAG evaluation engine for resolving multi-version dietary guideline temporal conflicts
- PDF processing tool (`src/rag_clean/pdf_to_clean_markdown.py`) for converting official guideline PDFs into structured Markdown with prose tables
- Knowledge graph extraction and search to establish structured health and diet knowledge relations
- MOHW data sync pipeline for importing public clarification and reference content
- Flexible deployment modes supporting SQLite, Supabase, HTTP API, and CLI

## Planned Features

- Personalized dietary suggestions based on user profiles, preferences, and historical records
- Enhanced multimodal meal analysis for richer food context understanding and grounded responses
- Expanded admin and ingestion tooling for knowledge curation, review, and operations
- Advanced multi-step agent workflows to improve retrieval, reasoning, and task automation

## Project Background

This project was originally built to complement the following two projects:

- [`PU-Hub/healthy-diet`](https://github.com/PU-Hub/healthy-diet) as the API-side project
- [`archie0732/healthy-diet-web`](https://github.com/archie0732/healthy-diet-web) as the frontend Web project

As this repository started receiving more attention and views, the project's direction was adjusted. While keeping the ability to integrate with the original stack, we are gradually refactoring this repository into a standalone, independently deployable AI agent service.

## Highlights

- Switchable storage backend: `sqlite` or `supabase`
- Policy-Aware & Version-Aware RAG framework with parameterizable retrieval rules
- Automated PDF-to-Markdown conversion tool preserving table prose descriptions
- Directly deployable independently, without relying on `health-diet-api`
- Provides both HTTP API and terminal CLI
- Docker default is standalone SQLite mode
- Supports local knowledge base and uploaded document ingestion
- Retains Supabase integration, suitable for reconnecting to the original project

## Project Structure

```
.
├── .agents/                    # Custom agent behavior rules / agent configuration
├── agent_skills/               # Customized tool/skill modules for the agent
├── data/                       # Local database files (SQLite DB stored here in Standalone mode)
├── docs/                       # DB schemas and supplementary documents
│   ├── sqlite/                 # SQLite database schema and sample data
│   └── supabase/               # Supabase database configuration and scripts
├── experiments/                # Experimental frameworks and benchmark suites
│   └── version_aware_rag/      # Version-Aware & Policy-Aware RAG evaluation & config frozen suites
├── knowledge_base/             # Ingested documents and RAG data source directories
│   ├── ingested_markdown/      # Parsed markdown documents used for RAG
│   ├── mohw_clarifications/    # Sync target for MOHW (Ministry of Health and Welfare) data
│   ├── uploads/                # Temporary directory for uploaded source files
│   └── NUTRITION_RULES.md      # Ground-truth guidelines for dietary analysis
├── plans/                      # Research and execution planning documents
├── raw_data/                   # Raw data files or scripts
├── scripts/                    # Utility scripts (e.g. data preprocessing, backup)
├── src/                        # Main source code directory
│   ├── config/                 # App configurations (logger, env validators)
│   ├── rag_clean/              # PDF processing & Markdown sanitization tools
│   ├── server/                 # Business logic handlers and Agent implementation
│   │   ├── agentRuntime.ts     # Core LangChain/LangGraph agent runtime setup
│   │   ├── httpRuntime.ts      # HTTP server runtime bootstrap
│   │   ├── knowledgeGraph.ts   # Knowledge Graph extraction and search engine
│   │   ├── knowledgeIngestion.ts # Handles files uploading, parsing and embedding ingestion
│   │   ├── mohwNews.ts         # MOHW data synchronization task
│   │   └── ragDocuments.ts     # Document database crud and indexer routes
│   ├── shared/                 # Shared configuration, hashing, and manifest modules
│   ├── storage/                # Database abstraction layer (SQLite and Supabase adapters)
│   │   ├── sqlite/             # SQLite connection and adapter logic
│   │   └── supabase/           # Supabase client and database adapter logic
│   ├── cli.ts                  # Entry point for the Command Line Interface
│   ├── index.ts                # Entry point for the HTTP Express Server
│   └── serverHandlers.ts       # Router controller handlers for server endpoints
├── technical_docs/             # Architectural, design, and changelog documents
├── agent_config.json           # Declarative behavior controls and default parameters for the agent
├── compose.yml                 # Docker Compose configuration file
└── package.json                # Project dependencies and runner script configurations
```

## Deployment Modes

### 1. Standalone SQLite Mode

Suitable for:
- Self-hosting locally
- Running directly with Docker
- Using terminal prompts
- Avoiding setting up Supabase upfront

Characteristics:
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are not required
- SQLite schema is automatically bootstrapped on startup
- Database path is configured via `SQLITE_DB_PATH`

### 2. Supabase Integration Mode

Suitable for:
- Having an existing Supabase schema
- Keeping the integration path with the original system
- Using this agent as a service inside the existing system

Characteristics:
- Preserves existing API routes
- Chat history, user profiles, and document metadata are stored in Supabase

## Installation

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
- Environment variables override those defaults for a specific deployment
- `MOHW_NEWS_SYNC_ENABLED` overrides `agent_config.json` `features.mohw_enabled` when explicitly set

## Standalone Local Usage

Recommended `.env` configuration:

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

Default URLs:

- `http://localhost:8001`
- Chat endpoint: `POST /api/chat`
- Health check: `GET /ping`

## Terminal CLI Usage

Send a prompt directly in the terminal:

```bash
bun run cli -- --message "Analyze my lunch"
```

You can also specify user, thread, and model source:

```bash
bun run cli -- --message "Give me a low sugar dinner idea" --user-id demo-user --thread-id demo-thread --model-source auto
```

## Optional: Manual SQLite Initialization

In general, manual schema setup is not required because the app automatically bootstraps the SQLite schema upon startup.

If you want to manually create the database or pre-seed local testing data, you can use:

- Schema: `docs/sqlite/schema.sql`
- Sample Seed: `docs/sqlite/seed.sample.sql`

If you have `sqlite3` installed in your environment:

```bash
sqlite3 ./data/healthy-diet-agent.db < docs/sqlite/schema.sql
sqlite3 ./data/healthy-diet-agent.db < docs/sqlite/seed.sample.sql
```

`seed.sample.sql` is only a local development example. You can modify the user, chatroom, and dialogue data inside it before importing.

## Docker Deployment

The default Docker setup runs in standalone SQLite mode.

```bash
docker compose up --build
```

Default behavior:
- `STORAGE_BACKEND=sqlite`
- `SQLITE_DB_PATH=/app/data/healthy-diet-agent.db`
- Persists SQLite data via `./data:/app/data`

Common mounts:
- `./data`
- `./knowledge_base`
- `./users_images`

For automated production deployment using GitHub Actions, GHCR, and a self-hosted runner, see:

- [docs/deployment-self-hosted-ghcr.md](docs/deployment-self-hosted-ghcr.md)

## Integration with Supabase or Existing Projects

To connect to an existing system, set:

```env
STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

Notes:
- Existing API routes are preserved
- Actual storage writes are routed through the shared storage layer
- Suitable for integration with the existing `health-diet-api` or other Supabase-based architectures

## Forking and Customizing for Other Advisors

For common customization of agent roles and retrieval behaviors, you can do so without modifying the core runtime code.

Recommended customization steps:

1. Edit `agent_config.json`
2. Replace `knowledge_base/AGENT.md`
3. Replace or remove `knowledge_base/NUTRITION_RULES.md`
4. Enable or disable `mohw_news` in `agent_config.json`
5. Add your own custom knowledge files

`agent_config.json` currently controls:

- Agent prompt file locations
- Default response styles
- Enabled RAG sources
- RAG search parameters
- Default enablement of MOHW sync features

Config precedence:

- `agent_config.json` provides the repository default behavior
- Environment variables override those defaults for a specific deployment
- `MOHW_NEWS_SYNC_ENABLED` overrides `agent_config.json` `features.mohw_enabled` when explicitly set

## API Overview

### Chat

- `POST /api/chat`
- `POST /api/approve`
- `POST /api/generate_title`
- `GET /ping`

### RAG and Knowledge

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

### Knowledge Ingestion

- `POST /api/admin/knowledge/upload`
- `POST /api/admin/knowledge/ingest/:id`
- `GET /api/admin/knowledge/jobs/:jobId`

### Knowledge Graph

- `POST /api/graph/extract-all`
- `GET /api/graph/status`
- `POST /api/graph/documents/:document_id/extract`
- `GET /api/graph/documents/:document_id`
- `POST /api/graph/search`
- `GET /api/graph/nodes`
- `GET /api/graph/nodes/:node_id`
- `GET /api/graph/relations/:relation_id/evidence`

### MOHW Sync

- `POST /api/news/sync`
- `GET /api/news`
- `GET /api/news/:id`
- `GET /api/news-files`

## Local Data and Knowledge Paths

- SQLite file: `data/healthy-diet-agent.db` or `SQLITE_DB_PATH`
- User uploaded images: `users_images/`
- Uploaded source files: `knowledge_base/uploads/`
- Parsed markdown: `knowledge_base/ingested_markdown/`
- Nutrition rules: `knowledge_base/NUTRITION_RULES.md`
- MOHW data: `knowledge_base/mohw_clarifications/`

## Testing

Run focused tests:

```bash
bun test src/server/httpRuntime.test.ts src/storage/runtime.test.ts src/server/serverHandlers.test.ts src/server/dbTools.test.ts src/server/ragDocuments.test.ts src/cli.test.ts
```

Run all tests:

```bash
bun test
```

## Notes

- SQLite mode is the recommended default for self-hosting.
- Supabase mode remains supported for integration scenarios.
- Standalone mode does not require `health-diet-api`.
- Regardless of the mode, the app still expects a working model endpoint through `AI_API_URL` or the configured Google route.

## Security and Failure Notes

- The RAG document management API now requires `X-Admin-User-Id` and `X-Admin-Role` (`admin` or `nutritionist`) headers.
- A bare `Authorization` header is no longer considered sufficient for administrator privileges.
- If `/api/chat` fails after creating the initial chat history row, the placeholder reply will be updated from `__PENDING__` to a `[FAILED] ...` marker.

## Related Docs

- Chinese README: [README_zh.md](README_zh.md)
- Japanese README: [README_jp.md](README_jp.md)
- Technical Docs Directory: [technical_docs/](technical_docs/)
- Change Log: [technical_docs/CHANGELOG.md](technical_docs/CHANGELOG.md)
- Daily Planning Log: [technical_docs/DAILY_PLANNING_LOG.md](technical_docs/DAILY_PLANNING_LOG.md)
- RAG Analysis Document (ZH): [technical_docs/RAG_AGENT_ANALYSIS_ZH.md](technical_docs/RAG_AGENT_ANALYSIS_ZH.md)

## Version-Aware RAG R2.19

The Development-only R2.19 experiment adds four checksum-verified WHO source
documents and an offline MiniLM q8 candidate retriever. On outcome-exposed
R2.16 data, the frozen BM25-MiniLM reciprocal-rank fusion reached required
Recall@20 of `0.9615`. This is diagnostic model selection only; a new
lineage-disjoint, owner-approved confirmation is still required. See
`experiments/version_aware_rag/V5_R2_19_NEURAL_HYBRID_DIAGNOSTIC_RESULT.md`.

## Version-Aware RAG R2.20

R2.20 executed one new 32-record, lineage-disjoint Development confirmation for
the R2.19-selected BM25-MiniLM RRF candidate generator and the R2.16
Top-6-anchored pair reranker. Candidate Recall@20 reached `0.9808`, and all
three strict improvements passed, but current-only Recall@3 decreased from
`1.0000` to `0.8333`. The gate therefore failed and is locked at one
execution. See
`experiments/version_aware_rag/V5_R2_20_NEURAL_HYBRID_CONFIRMATION_RESULT.md`.

## Version-Aware RAG R2.21

R2.21 tested lexical:dense RRF weights of 1:1, 2:1, and 3:1 on the
outcome-exposed R2.20 Development data. None recovered the current-only
noninferiority failure, so no repair was selected. Experimental work should
now be reported as a bounded Development ablation rather than a promoted
system. See `experiments/version_aware_rag/PAPER_HANDOFF_AFTER_R2_21.md`.

## Version-Aware RAG R2.22

R2.22 adds a checksum-frozen, A/B-order-blinded independent-context GPT-5.6
review of all 32 R2.20 questions. It completed 32/32 judgments with no schema
errors: 31/32 pairs were fully answerable, exact evidence-contract agreement
was 19/32, and role-compatible agreement was 21/32. Agreement was perfect for
the `current_only` and `hard_negative_current` contract strata but weaker for
the two implicit dual-evidence strata. This is supplemental AI triangulation,
not independent human or clinical review. See
`experiments/version_aware_rag/V5_R2_22_GPT56_BLIND_REVIEW_RESULT.md`.

## License

This project is licensed under the MIT license. See [LICENSE](LICENSE) for details.
