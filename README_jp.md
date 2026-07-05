# Healthy Diet AI Agent

![Bun](https://img.shields.io/badge/Bun-1.2%2B-f9f1e1?style=flat-square&logo=bun&logoColor=000000)
![TypeScript](https://img.shields.io/badge/TypeScript-6-blue?style=flat-square&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-222222?style=flat-square&logo=express&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-Agent-green?style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-Standalone-0f80cc?style=flat-square&logo=sqlite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Integration-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=flat-square&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

[English](README.md) | 日本語 | [繁體中文](README_zh.md)

Healthy Diet AI Agent は、Bun + TypeScript で構築された栄養・食事支援バックエンドです。チャット、食事画像解析、RAG ドキュメント知識検索、知識グラフ、および台湾衛生福利部 (MOHW) のデータ同期機能を提供します。

このリポジトリは現在、2 つのデプロイ（運用）モードをサポートしています。

- Standalone モード: SQLite を使用し、Docker、HTTP API、またはターミナル CLI を介して単独で動作可能
- Integration モード: Supabase を使用し、既存の `health-diet-api` エコシステムとの統合機能を維持

## 技術スタック

- ランタイム: `Bun`
- 言語: `TypeScript`
- HTTP サーバー: `Express`
- エージェントフレームワーク: `LangChain`, `LangGraph`, `DeepAgents`
- ストレージ: `SQLite` または `Supabase`
- AI 連携: OpenAI 互換の API ルーティング、およびオプションの Google Gemini ルーティング
- デプロイ: `Docker Compose`

## 主な機能

- 栄養チャットアシスタント: 食事のアドバイス、献立計画、栄養に関するQ&Aに対応
- 食事画像解析ワークフロー: メニューの理解と栄養指向のインタラクションをサポート
- RAG ドキュメント検索と管理: 栄養知識ドキュメントの整理と検索に対応
- 知識グラフの抽出と検索: 健康と食事に関する構造化された関連性の構築に対応
- 台湾衛生福利部 (MOHW) 同期: 公開されている事実確認データや参考情報のインポートに対応
- 柔軟なデプロイモード: SQLite、Supabase、HTTP API、CLI への対応

## 今後の予定機能 (ロードマップ)

- ユーザープロファイル、好み、履歴に基づいた、よりパーソナライズされた食事アドバイス
- マルチモーダル食事解析の強化による、より詳細なコンテキスト理解と信頼性の高い回答の提供
- 知識管理とインジェストのためのバックエンドおよび運用ツールの拡張
- retrieval (検索)、reasoning (推理)、タスク自動化能力を高めるための複数ステップのエージェントワークフローの改善

## プロジェクト背景

このプロジェクトは、もともと次の 2 つのプロジェクトと組み合わせて使用するために作成されました。

- [`PU-Hub/healthy-diet`](https://github.com/PU-Hub/healthy-diet) (API側プロジェクト)
- [`archie0732/healthy-diet-web`](https://github.com/archie0732/healthy-diet-web) (フロントエンドWebプロジェクト)

その後、このリポジトリ自体に多くの注目と閲覧が集まるようになったため、プロジェクトの方向性を調整しました。元のシステムと統合する機能を維持しつつ、単独でデプロイして独立して使用できる AI エージェントサービスとして本リポジトリの整備を進めています。

## 特徴

- 切り替え可能なストレージバックエンド: `sqlite` または `supabase`
- `health-diet-api` に依存せず、直接単独でデプロイ可能
- HTTP API とターミナル CLI の両方を提供
- Docker 既定では standalone SQLite モードを使用
- ローカルナレッジベースおよびアップロードファイルのインジェストに対応
- Supabase 統合機能を維持し、元のプロジェクトへの再接続も容易

## プロジェクト構成

```
.
├── .agents/                    # エージェントのカスタムルール / 設定ファイル
├── agent_skills/               # エージェントのカスタムツール/スキルモジュール
├── data/                       # ローカルデータベースディレクトリ (Standalone モードの SQLite DB 保存先)
├── docs/                       # DB スキーマおよび補足ドキュメント
│   ├── sqlite/                 # SQLite データベーススキーマおよびサンプルデータ
│   └── supabase/               # Supabase データベース設定およびスクリプト
├── knowledge_base/             # インジェストされたドキュメントおよび RAG データソースディレクトリ
│   ├── ingested_markdown/      # 解析済みの RAG 用 Markdown ドキュメント
│   ├── mohw_clarifications/    # 台湾衛生福利部 (MOHW) の同期データ格納先
│   ├── uploads/                # アップロードされたソースファイルのテンポラリディレクトリ
│   └── NUTRITION_RULES.md      # 食事分析の基準となるガイドライン (Ground-truth)
├── raw_data/                   # 生データファイルまたはスクリプト
├── scripts/                    # ユーティリティスクリプト (データ前処理、バックアップなど)
├── src/                        # メインソースコードディレクトリ
│   ├── config/                 # アプリケーション設定 (ロガー、環境変数バリデータ)
│   ├── server/                 # ビジネスロジックハンドラーおよびエージェントの実装
│   │   ├── agentRuntime.ts     # コア LangChain/LangGraph エージェントランタイム設定
│   │   ├── httpRuntime.ts      # HTTP サーバーランタイムの起動処理 (Bootstrap)
│   │   ├── knowledgeGraph.ts   # 知識グラフの抽出および検索エンジン
│   │   ├── knowledgeIngestion.ts # ファイルアップロード、解析、埋め込みインジェスト処理
│   │   ├── mohwNews.ts         # MOHW データ同期タスク
│   │   └── ragDocuments.ts     # ドキュメントデータベースの CRUD およびインデクサーのルーティング
│   ├── storage/                # データベース抽象化レイヤー (SQLite および Supabase アダプター)
│   │   ├── sqlite/             # SQLite 接続およびアダプターロジック
│   │   └── supabase/           # Supabase クライアントおよびアダプターロジック
│   ├── cli.ts                  # コマンドラインインターフェース (CLI) のエントリポイント
│   ├── index.ts                # HTTP Express サーバーのエントリポイント
│   └── serverHandlers.ts       # サーバーエンドポイントのルーティングコントローラーハンドラー
├── technical_docs/             # アーキテクチャ設計書、変更履歴 (Changelog)
├── agent_config.json           # エージェントの宣言的な動作制御およびデフォルトパラメータ設定
├── compose.yml                 # Docker Compose 設定ファイル
└── package.json                # プロジェクト依存関係および実行スクリプト設定
```

## デプロイモード

### 1. Standalone SQLite モード

以下のような用途に適しています：
- ローカル環境でのセルフホスト
- Docker を使用した直接起動
- ターミナルから直接プロンプトを実行したい場合
- 事前に Supabase を準備したくない場合

特徴：
- `SUPABASE_URL` および `SUPABASE_SERVICE_KEY` は不要
- 起動時に SQLite スキーマを自動初期化 (bootstrap)
- DB ファイルのパスは `SQLITE_DB_PATH` で制御

### 2. Supabase Integration モード

以下のような用途に適しています：
- 既存の Supabase スキーマがある場合
- 元のシステムとの統合方法を維持したい場合
- このエージェントを既存システム内の 1 つのサービスとして動作させたい場合

特徴：
- 既存の API ルーティングを維持
- チャット履歴、ユーザープロファイル、ドキュメントのメタデータを Supabase で永続化可能

## インストール

### 前提条件

- Bun 1.2+
- Bun と互換性のある Node 環境
- オプション: Docker / Docker Compose
- オプション: 統合モード用の Supabase プロジェクト
- 現在のエージェント設定と互換性のあるモデルエンドポイント

### インストール手順

```bash
bun install
```

### 環境変数ファイルの作成

```bash
cp .env.example .env
```

## 重要な環境変数

コアランタイム変数：

- `PORT`
- `AI_API_URL`
- `STORAGE_BACKEND=sqlite|supabase`
- `SQLITE_DB_PATH`
- `CLI_USER_ID`
- `CLI_THREAD_ID`

Supabase 統合モード用変数：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

Google モデルルーティング用変数：

- `GEMINI_AI_API`
- `GEMINI_API_KEY`
- `GOOGLE_CHAT_MODEL`
- `GOOGLE_BASE_URL`

プロジェクトレベルのエージェント動作設定（プロジェクトのルートディレクトリ）：

- `agent_config.json`

バックグラウンド同期変数：

- `MOHW_NEWS_SYNC_ENABLED`
- `MOHW_NEWS_SYNC_INTERVAL_MINUTES`
- `MOHW_NEWS_SYNC_RUN_ON_START`

設定の優先順位：

- `agent_config.json` はプロジェクト全体のデフォルトの動作を提供します。
- 環境変数（`.env`）は、特定のデプロイにおいてデフォルト設定を上書きします。
- `MOHW_NEWS_SYNC_ENABLED` が明示的に設定されている場合、`agent_config.json` 内の `features.mohw_enabled` を上書きします。

## Standalone ローカル利用

推奨される `.env` 設定：

```env
PORT=8001
AI_API_URL=http://127.0.0.1:8080/v1/
STORAGE_BACKEND=sqlite
SQLITE_DB_PATH=./data/healthy-diet-agent.db
CLI_USER_ID=local-user
CLI_THREAD_ID=local-thread
```

HTTP サーバーの起動：

```bash
bun run start
```

デフォルトの URL とエンドポイント：

- `http://localhost:8001`
- チャット用エンドポイント: `POST /api/chat`
- ヘルスチェック: `GET /ping`

## ターミナル CLI の利用

ターミナルから直接プロンプトを送信します：

```bash
bun run cli -- --message "Analyze my lunch"
```

ユーザーID、スレッドID、モデルソースを指定することも可能です：

```bash
bun run cli -- --message "Give me a low sugar dinner idea" --user-id demo-user --thread-id demo-thread --model-source auto
```

## 任意: SQLite の手動初期化

通常、アプリ起動時に SQLite スキーマが自動的に初期化（bootstrap）されるため、手動でのテーブル作成は不要です。

事前にテーブルを作成したり、ローカルのテストデータをインポートしたりしたい場合は、以下を使用できます：

- スキーマ：`docs/sqlite/schema.sql`
- サンプルシード：`docs/sqlite/seed.sample.sql`

お使いの環境に `sqlite3` がインストールされている場合：

```bash
sqlite3 ./data/healthy-diet-agent.db < docs/sqlite/schema.sql
sqlite3 ./data/healthy-diet-agent.db < docs/sqlite/seed.sample.sql
```

`seed.sample.sql` はローカル開発用のサンプルです。インポートする前に、ファイル内のユーザー、チャットルーム、対話データを編集できます。

## Docker デプロイ

Docker は既定で standalone SQLite モードで動作します。

```bash
docker compose up --build
```

デフォルトの挙動：
- `STORAGE_BACKEND=sqlite`
- `SQLITE_DB_PATH=/app/data/healthy-diet-agent.db`
- `./data:/app/data` ボリュームを介して SQLite データを永続化

一般的なマウントディレクトリ：
- `./data`
- `./knowledge_base`
- `./users_images`

GitHub Actions、GHCR、およびセルフホストランナー（self-hosted runner）を使用した自動化された本番環境へのデプロイについては、以下を参照してください：

- [docs/deployment-self-hosted-ghcr.md](docs/deployment-self-hosted-ghcr.md)

## 既存プロジェクト / Supabase との統合

既存のシステムと接続する場合は、以下を設定します：

```env
STORAGE_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

説明：
- 既存の API ルーティングは維持されます
- 実際のストレージ書き込みは、統合された共有ストレージレイヤーを経由します
- 既存の `health-diet-api` やその他の Supabase ベースのアーキテクチャへの組み込みに適しています

## フォークして他の個別アドバイザーにカスタマイズする

エージェントの役割（ペルソナ）や検索（RAG）の一般的なカスタマイズであれば、コアランタイムコードを編集することなく実施できます。

推奨されるカスタマイズ手順：

1. `agent_config.json` を編集する
2. `knowledge_base/AGENT.md` を差し替える
3. `knowledge_base/NUTRITION_RULES.md` を差し替えるか、または削除する
4. `agent_config.json` で `mohw_news` の有効/無効を切り替える
5. 独自のカスタム知識ドキュメントを追加する

`agent_config.json` で制御可能な項目：

- エージェントのプロンプトファイルの場所
- 応答スタイルのデフォルト値
- 有効にする RAG のデータソース
- RAG 検索の調整パラメータ
- 衛生福利部 (MOHW) の同期機能のデフォルト有効化設定

設定の優先順位：

- `agent_config.json` はプロジェクト全体のデフォルトの動作を提供します。
- 環境変数（`.env`）は、特定のデプロイにおいてデフォルト設定を上書きします。
- `MOHW_NEWS_SYNC_ENABLED` が明示的に設定されている場合、`agent_config.json` 内の `features.mohw_enabled` を上書きします。

## API 概要

### チャット (Chat)

- `POST /api/chat`
- `POST /api/approve`
- `POST /api/generate_title`
- `GET /ping`

### RAG およびナレッジ文書 (RAG and Knowledge)

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

### ナレッジインジェスト (Knowledge Ingestion)

- `POST /api/admin/knowledge/upload`
- `POST /api/admin/knowledge/ingest/:id`
- `GET /api/admin/knowledge/jobs/:jobId`

### 知識グラフ (Knowledge Graph)

- `POST /api/graph/extract-all`
- `GET /api/graph/status`
- `POST /api/graph/documents/:document_id/extract`
- `GET /api/graph/documents/:document_id`
- `POST /api/graph/search`
- `GET /api/graph/nodes`
- `GET /api/graph/nodes/:node_id`
- `GET /api/graph/relations/:relation_id/evidence`

### 衛生福利部同期 (MOHW Sync)

- `POST /api/news/sync`
- `GET /api/news`
- `GET /api/news/:id`
- `GET /api/news-files`

## ローカルデータとナレッジの保存先パス

- SQLite データベースファイル: `data/healthy-diet-agent.db` または `SQLITE_DB_PATH`
- アップロードされたユーザー画像: `users_images/`
- アップロードされたソースファイル: `knowledge_base/uploads/`
- 解析済み markdown: `knowledge_base/ingested_markdown/`
- 栄養ガイドラインルール: `knowledge_base/NUTRITION_RULES.md`
- 衛生福利部 (MOHW) の同期データ: `knowledge_base/mohw_clarifications/`

## テスト

主要なテストの実行：

```bash
bun test src/server/httpRuntime.test.ts src/storage/runtime.test.ts src/server/serverHandlers.test.ts src/server/dbTools.test.ts src/server/ragDocuments.test.ts src/cli.test.ts
```

すべてのテストの実行：

```bash
bun test
```

## 備考

- セルフホストで使用する場合は、SQLite standalone モードを優先して使用することを推奨します。
- 既存システムと統合する場合は、Supabase モードへ切り替えて使用します。
- Standalone モードでは `health-diet-api` は不要です。
- いずれのモードであっても、`AI_API_URL` または設定された Google 接続先を介して、有効なモデルエンドポイントが利用可能である必要があります。

## セキュリティおよび障害に関する注意点

- RAG ドキュメント管理 API には、`X-Admin-User-Id` および `X-Admin-Role` (`admin` または `nutritionist`) ヘッダーの指定が必須となりました。
- 単一の `Authorization` ヘッダーのみでは、管理者権限として認識されなくなりました。
- `/api/chat` で初期チャット履歴を作成した後に処理が失敗した場合、プレースホルダーの返信は `__PENDING__` から `[FAILED] ...` というマーカーに書き換えられます。

## 関連ドキュメント

- 英語 README: [README.md](README.md)
- 中国語 README: [README_zh.md](README_zh.md)
- 技術ドキュメントフォルダ: [technical_docs/](technical_docs/)
- 変更履歴 (Changelog): [technical_docs/CHANGELOG.md](technical_docs/CHANGELOG.md)
- 日次計画ログ: [technical_docs/DAILY_PLANNING_LOG.md](technical_docs/DAILY_PLANNING_LOG.md)
- RAG 分析ドキュメント (繁體中文): [technical_docs/RAG_AGENT_ANALYSIS_ZH.md](technical_docs/RAG_AGENT_ANALYSIS_ZH.md)

## ライセンス

本プロジェクトは `MIT` ライセンスのもとで公開されています。詳細は [LICENSE](LICENSE) を参照してください。
