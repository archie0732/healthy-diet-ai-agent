# Healthy Diet AI Agent

![Bun](https://img.shields.io/badge/Bun-1.2%2B-f9f1e1?style=flat-square&logo=bun&logoColor=000000)
![TypeScript](https://img.shields.io/badge/TypeScript-6-blue?style=flat-square&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-222222?style=flat-square&logo=express&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-Agent-green?style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-Standalone-0f80cc?style=flat-square&logo=sqlite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Integration-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=flat-square&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

Healthy Diet AI Agent は、Bun + TypeScript で構築された栄養・食事支援バックエンドです。チャット、食事画像解析、RAG ドキュメント管理、知識グラフ、台湾 MOHW データ同期を提供します。

このリポジトリは現在、2 つの運用モードをサポートします。

- Standalone mode: SQLite を使って単独で動作し、Docker、HTTP API、CLI から利用可能
- Integration mode: Supabase を使い、既存の `health-diet-api` 周辺構成と接続可能

## Tech Stack

- Runtime: `Bun`
- Language: `TypeScript`
- HTTP server: `Express`
- Agent framework: `LangChain`, `LangGraph`, `DeepAgents`
- Storage: `SQLite` or `Supabase`
- AI integration: OpenAI-compatible API routing with optional Google Gemini routing
- Deployment: `Docker Compose`

## プロジェクト背景

このプロジェクトは、もともと次の 2 つのプロジェクトと組み合わせて使うことを想定して作られました。

- [`PU-Hub/healthy-diet`](https://github.com/PU-Hub/healthy-diet) の API 側プロジェクト
- [`archie0732/healthy-diet-web`](https://github.com/archie0732/healthy-diet-web) の Web フロントエンド

その後、このリポジトリ自体を直接見る人や利用を検討する人が増えてきたため、方針を見直しました。現在は、元のプロジェクト群と統合できる構成を残しつつ、この repo 単体でもデプロイ・利用できる独立した agent サービスとして整備を進めています。

## 主な特徴

- `sqlite` / `supabase` の切り替え可能な storage backend
- `health-diet-api` に依存しない単独デプロイ
- HTTP API と terminal CLI の両対応
- Docker では standalone SQLite を既定値として利用
- ローカル knowledge base とアップロード文書の ingestion をサポート
- 既存 Supabase ベースのプロジェクトとの統合も維持

## 主要ファイル

- Server entry: `src/index.ts`
- CLI entry: `src/cli.ts`
- Chat handlers: `src/serverHandlers.ts`
- Agent runtime: `src/server/agentRuntime.ts`
- Storage facade: `src/storage/runtime.ts`
- SQLite backend: `src/storage/sqlite/adapter.ts`
- Supabase backend: `src/storage/supabase/adapter.ts`
- RAG document API: `src/server/ragDocuments.ts`
- Knowledge ingestion API: `src/server/knowledgeIngestion.ts`

## デプロイモード

### 1. Standalone SQLite モード

向いている用途:

- ローカル PC での自己ホスト
- Docker での単体デプロイ
- ターミナルから直接プロンプトを投げたい場合
- Supabase を先に用意したくない場合

特徴:

- `SUPABASE_URL` と `SUPABASE_SERVICE_KEY` は不要
- 起動時に SQLite schema を自動作成
- DB パスは `SQLITE_DB_PATH` で指定

### 2. Supabase Integration モード

向いている用途:

- 既存の Supabase schema がある場合
- 元のプロジェクト構成との互換性を保ちたい場合
- この agent を既存システム内の 1 サービスとして使いたい場合

特徴:

- 既存 API ルートを維持
- チャット履歴、ユーザープロフィール、文書 metadata を Supabase に保存可能

## インストール

```bash
bun install
cp .env.example .env
```

## 主要環境変数

基本:

- `PORT`
- `AI_API_URL`
- `STORAGE_BACKEND=sqlite|supabase`
- `SQLITE_DB_PATH`
- `CLI_USER_ID`
- `CLI_THREAD_ID`

Supabase 統合用:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Google モデルルーティング:

- `GEMINI_AI_API`
- `GEMINI_API_KEY`
- `GOOGLE_CHAT_MODEL`
- `GOOGLE_BASE_URL`

## Standalone ローカル利用

推奨 `.env`:

```env
PORT=8001
AI_API_URL=http://127.0.0.1:8080/v1/
STORAGE_BACKEND=sqlite
SQLITE_DB_PATH=./data/healthy-diet-agent.db
CLI_USER_ID=local-user
CLI_THREAD_ID=local-thread
```

HTTP サーバー起動:

```bash
bun run start
```

デフォルト URL:

- `http://localhost:8001`
- chat endpoint: `POST /api/chat`
- health check: `GET /ping`

## Terminal CLI 利用

ターミナルから直接実行:

```bash
bun run cli -- --message "Analyze my lunch"
```

追加オプション:

```bash
bun run cli -- --message "Give me a low sodium dinner idea" --user-id demo-user --thread-id demo-thread --model-source auto
```

## 任意: SQLite の手動初期化

通常は手動初期化は不要です。アプリ起動時に SQLite schema が自動作成されます。

ただし、ローカル DB を自分で確認したい場合や sample data を先に入れたい場合は、次のファイルを使えます。

- schema: `docs/sqlite/schema.sql`
- sample seed: `docs/sqlite/seed.sample.sql`

`sqlite3` が使える場合の例:

```bash
sqlite3 ./data/healthy-diet-agent.db < docs/sqlite/schema.sql
sqlite3 ./data/healthy-diet-agent.db < docs/sqlite/seed.sample.sql
```

`seed.sample.sql` はローカル開発用の例です。必要に応じてユーザー、ルーム、チャット内容を編集してから投入してください。

## Docker デプロイ

Docker の既定値は standalone SQLite モードです。

```bash
docker compose up --build
```

既定動作:

- `STORAGE_BACKEND=sqlite`
- `SQLITE_DB_PATH=/app/data/healthy-diet-agent.db`
- `./data:/app/data` で SQLite データを永続化

主なマウント先:

- `./data`
- `./knowledge_base`
- `./users_images`

## 既存プロジェクト / Supabase との統合

既存環境に接続する場合:

```env
STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

補足:

- 現在の API ルートはそのまま利用可能
- storage 書き込みは shared storage layer 経由に統一
- 既存の `health-diet-api` 周辺構成と接続したい場合に適しています

## API 概要

### Chat

- `POST /api/chat`
- `POST /api/approve`
- `POST /api/generate_title`
- `GET /ping`

### RAG / ナレッジ文書

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

### MOHW 同期

- `POST /api/news/sync`
- `GET /api/news`
- `GET /api/news/:id`
- `GET /api/news-files`

## ローカルデータと知識パス

- SQLite ファイル: `data/healthy-diet-agent.db` または `SQLITE_DB_PATH`
- ユーザー画像: `users_images/`
- アップロード原本: `knowledge_base/uploads/`
- 解析済み markdown: `knowledge_base/ingested_markdown/`
- 栄養ルール: `knowledge_base/NUTRITION_RULES.md`
- MOHW データ: `knowledge_base/mohw_clarifications/`

## テスト

主要テスト:

```bash
bun test src/server/httpRuntime.test.ts src/storage/runtime.test.ts src/server/serverHandlers.test.ts src/server/dbTools.test.ts src/server/ragDocuments.test.ts src/cli.test.ts
```

全 Bun テスト:

```bash
bun test
```

## メモ

- 自己ホスト用途では SQLite standalone モードを推奨
- 既存システム統合時は Supabase モードへ切り替え

## Fork 後に別のアドバイザーへ転用する

現在は、よくある役割変更や検索設定の変更なら、core runtime を直接編集しなくても進めやすくなっています。

おすすめの順番:

1. `agent_config.json` を編集する
2. `knowledge_base/AGENT.md` を差し替える
3. `knowledge_base/NUTRITION_RULES.md` を差し替える、または削除する
4. `agent_config.json` で `mohw_news` を有効化または無効化する
5. 独自の知識ドキュメントを追加する

`agent_config.json` で管理できる内容:

- agent prompt ファイルの場所
- 応答スタイルの既定値
- RAG の有効ソース
- RAG 検索チューニング
- MOHW の既定有効状態

優先順位:

- `agent_config.json` はリポジトリ既定値
- `.env` はデプロイ時の上書き値
- `MOHW_NEWS_SYNC_ENABLED` が設定されている場合は `agent_config.json` の `features.mohw_enabled` より優先されます
- standalone mode では `health-diet-api` は不要
- どのモードでも、`AI_API_URL` などの有効なモデル接続先は必要

## 関連ドキュメント

- English README: `README.md`
- Chinese README: `README_zh.md`
- changelog: `CHANGELOG.md`

## License

This project is licensed under the terms of the `MIT` license. See `LICENSE`.
