# Healthy Diet API

![Rust](https://img.shields.io/badge/rust-v1.75%2B-orange)
![Axum](https://img.shields.io/badge/framework-Axum-red)
![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL-blue)
![License](https://img.shields.io/badge/license-MIT-green)

一款基於 Rust 與 Axum 框架構建的健康飲食 App 後端 API Server。
提供使用者認證、飲食記錄管理，並整合 Google Gemini AI 進行營養分析與建議。

> [!NOTE]
> 本項目目前處於 **開發中** 階段。

## 功能特色

- **使用者認證**：支援 Email/Password 註冊登入，以及 Discord OAuth 第三方登入。
- **JWT 授權**：實作 Access Token 與 Refresh Token 雙重機制，確保安全性與使用者體驗。
- **飲食記錄**：CRUD 操作，記錄每日餐點攝取。
- **AI 營養分析**：整合 Google Gemini API，針對飲食內容提供個人化建議。
- **API 文件**：符合 OpenAPI 3.0 規範。

## 技術棧

- **語言**：Rust (2021/2024 Edition)
- **Web 框架**：[Axum](https://github.com/tokio-rs/axum)
- **資料庫 ORM**：[SQLx](https://github.com/launchbadge/sqlx) (PostgreSQL)
- **非同步 Runtime**：Tokio
- **日誌追蹤**：Tracing
- **AI 整合**：Google Gemini API

## 環境變數 (Environment Variables)

請在專案根目錄建立 `.env` 檔案，並填入以下設定：

| Key | Type | 說明 |
| :--- | :--- | :--- |
| `PORT` | `number` | API 伺服器監聽的 Port (預設 3000) |
| `DATABASE_URL` | `string` | Supabase Transaction Pool 連線字串 (給應用程式用) |
| `DATABASE_URL_2` | `string` | Supabase Session Pool/Direct 連線字串 (給 Migration 用) |
| `JWT_SECRET` | `string` | 用於簽署 JWT 的密鑰 (請設定長一點的亂數) |
| `GEMINI_API_KEY` | `string` | Google Gemini API Key |
| `DISCORD_CLIENT_ID` | `string` | Discord Developer Portal 提供的 Client ID |
| `DISCORD_CLIENT_SECRET` | `string` | Discord Developer Portal 提供的 Client Secret |
| `DISCORD_REDIRECT_URL` | `string` | Discord OAuth 回調網址 (例: `http://localhost:3000/api/auth/discord/callback`) |
| `RUST_LOG` | `string` | 日誌等級 (例: `info`, `debug`, `sqlx=warn`；未設定時預設為 `info,sqlx=warn`) |

## 安裝與建制 (Installation & Build)

### 1. 安裝 Rust 環境

確保你的電腦已安裝 Rust 工具鏈 (Rustc, Cargo)。

```bash
curl --proto '=https' --tlsv1.2 -sSf [https://sh.rustup.rs](https://sh.rustup.rs) | sh
```

### 2. 安裝 SQLx CLI

本專案使用 SQLx 進行資料庫遷移，需要安裝 CLI 工具。

```bash
cargo install sqlx-cli --no-default-features --features postgres
```

### 3. 下載專案

```bash
git clone [git@github.com:PU-Hub/healthy-diet.git](git@github.com:PU-Hub/healthy-diet.git)
cd healthy-diet-api
```

### 4. 設定資料庫

確保 `.env` 中的 `DATABASE_URL` 已正確設定，然後執行：

```bash
# 建立資料庫 (如果尚未建立)
sqlx database create

# 執行資料庫遷移 (建立 Table)
sqlx migrate run
```

### 5. 執行開發伺服器

```bash
# 直接執行
cargo run

# 或者使用 watch 模式 (存檔自動重啟，需安裝 cargo-watch)
cargo watch -x run
```

伺服器啟動後，預設將運行於： <http://localhost:3000>

## 測試 (Testing)

專案包含單元測試與整合測試。

>注意：執行測試時會連線到真實的資料庫，請確保 .env 設定正確。

```bash
# 執行所有測試
cargo test

# 執行特定測試 (例如只測登入)
cargo test login
```

## API 文件

本專案提供 openapi.yml 文件。 啟動伺服器後，你可以將 openapi.yml 匯入 Swagger Editor 或 Postman 查看完整接口定義。
