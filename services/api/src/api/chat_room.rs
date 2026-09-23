use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use base64::{Engine as _, engine::general_purpose};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::json;
use sqlx::Row;
use std::sync::Arc;
use tokio::fs;
use tracing::error;

use crate::{api::model::ErrorResponse, model::AppState, utils::jwt::AuthUser};

#[derive(Serialize)]
pub struct RoomResponse {
    pub id: String,
    pub title: String,
    pub last_updated: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_base64: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRoomTitleItem {
    pub room_id: String,
    pub title: String,
    pub summary: serde_json::Value,
    pub last_message_at: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomHistoryDetailResponse {
    pub id: String,
    pub room_id: String,
    pub user_id: String,
    pub index: i64,
    pub user_message: Option<String>,
    pub image_path: Option<String>,
    pub image_base64: Option<String>,
    pub ai_analysis_report: Option<String>,
    pub diet_report: Option<serde_json::Value>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub summary_updated_at: Option<DateTime<Utc>>,
    pub created_at: Option<DateTime<Utc>>,
}

pub async fn get_chat_rooms_handler(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let rows = sqlx::query(
        r#"
        SELECT
            room_id,
            title,
            last_message_at as last_updated
        FROM chat_rooms
        WHERE user_id = $1
        ORDER BY last_message_at DESC NULLS LAST, created_at DESC
        "#,
    )
    .bind(auth_user.user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("查詢聊天室列表失敗: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "資料庫查詢失敗".into(),
            }),
        )
    })?;

    let room_responses: Vec<RoomResponse> = rows
        .into_iter()
        .map(|row| {
            let title: Option<String> = row.try_get("title").ok().flatten();
            let last_updated: Option<DateTime<Utc>> = row.try_get("last_updated").ok().flatten();

            let display_title = title
                .map(|t| {
                    if t.chars().count() > 20 {
                        format!("{}...", t.chars().take(20).collect::<String>())
                    } else {
                        t
                    }
                })
                .unwrap_or_else(|| "新對話".to_string());

            RoomResponse {
                id: row.try_get::<String, _>("room_id").unwrap_or_default(),
                title: display_title,
                last_updated,
            }
        })
        .collect();

    Ok((StatusCode::OK, Json(json!({ "rooms": room_responses }))))
}

pub async fn get_chat_room_titles_handler(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let rows = sqlx::query(
        r#"
        SELECT room_id, title, summary, last_message_at
        FROM chat_rooms
        WHERE user_id = $1
        ORDER BY last_message_at DESC NULLS LAST, created_at DESC
        "#,
    )
    .bind(auth_user.user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("failed to get chat room titles: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch chat room titles".into(),
            }),
        )
    })?;

    let rooms: Vec<ChatRoomTitleItem> = rows
        .into_iter()
        .map(|row| ChatRoomTitleItem {
            room_id: row.try_get::<String, _>("room_id").unwrap_or_default(),
            title: row.try_get::<String, _>("title").unwrap_or_default(),
            summary: row
                .try_get::<serde_json::Value, _>("summary")
                .unwrap_or_else(|_| json!([])),
            last_message_at: row
                .try_get::<Option<DateTime<Utc>>, _>("last_message_at")
                .ok()
                .flatten(),
        })
        .collect();

    Ok((StatusCode::OK, Json(json!({ "rooms": rooms }))))
}

pub async fn get_room_history_handler(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(room_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    let records = sqlx::query(
        r#"
        SELECT user_message, ai_analysis_report, image_path
        FROM diet_chat_history
        WHERE room_id = $1 AND user_id = $2
        ORDER BY created_at ASC
        "#,
    )
    .bind(&room_id)
    .bind(auth_user.user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("查詢歷史紀錄失敗: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "資料庫查詢失敗".into(),
            }),
        )
    })?;

    let mut history: Vec<ChatMessage> = Vec::new();

    for record in records {
        let user_message: Option<String> = record.try_get("user_message").ok().flatten();
        let ai_analysis_report: Option<String> =
            record.try_get("ai_analysis_report").ok().flatten();
        let image_path: Option<String> = record.try_get("image_path").ok().flatten();
        let image_base64 = load_image_base64(image_path.as_deref()).await;

        if let Some(msg) = user_message {
            history.push(ChatMessage {
                role: "user".to_string(),
                content: msg,
                image_path,
                image_base64,
            });
        }

        if let Some(ai_msg) = ai_analysis_report {
            history.push(ChatMessage {
                role: "ai".to_string(),
                content: ai_msg,
                image_path: None,
                image_base64: None,
            });
        }
    }

    Ok((StatusCode::OK, Json(json!({ "history": history }))))
}

pub async fn get_room_history_by_index_handler(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((room_id, index)): Path<(String, i64)>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    if index < 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "index must be >= 0".into(),
            }),
        ));
    }

    let record = sqlx::query(
        r#"
        SELECT
            id,
            room_id,
            user_id,
            user_message,
            image_path,
            ai_analysis_report,
            diet_report,
            title,
            summary,
            summary_updated_at,
            created_at
        FROM diet_chat_history
        WHERE room_id = $1 AND user_id = $2
        ORDER BY created_at ASC
        OFFSET $3
        LIMIT 1
        "#,
    )
    .bind(&room_id)
    .bind(auth_user.user_id)
    .bind(index)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("failed to get room history by index: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch room history detail".into(),
            }),
        )
    })?
    .ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "History index out of range".into(),
        }),
    ))?;

    let image_path: Option<String> = record.try_get("image_path").ok().flatten();
    let image_base64 = load_image_base64(image_path.as_deref()).await;

    let detail = RoomHistoryDetailResponse {
        id: record
            .try_get::<uuid::Uuid, _>("id")
            .map(|v| v.to_string())
            .unwrap_or_default(),
        room_id: record.try_get::<String, _>("room_id").unwrap_or_default(),
        user_id: record
            .try_get::<uuid::Uuid, _>("user_id")
            .map(|v| v.to_string())
            .unwrap_or_default(),
        index,
        user_message: record.try_get("user_message").ok().flatten(),
        image_path,
        image_base64,
        ai_analysis_report: record.try_get("ai_analysis_report").ok().flatten(),
        diet_report: record.try_get("diet_report").ok().flatten(),
        title: record.try_get("title").ok().flatten(),
        summary: record.try_get("summary").ok().flatten(),
        summary_updated_at: record.try_get("summary_updated_at").ok().flatten(),
        created_at: record.try_get("created_at").ok().flatten(),
    };

    Ok((StatusCode::OK, Json(json!({ "detail": detail }))))
}

fn guess_mime_from_path(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else {
        "application/octet-stream"
    }
}

async fn load_image_base64(image_path: Option<&str>) -> Option<String> {
    let path = image_path?;
    let bytes = fs::read(path).await.ok()?;
    let base64_data = general_purpose::STANDARD.encode(bytes);
    let mime = guess_mime_from_path(path);
    Some(format!("data:{};base64,{}", mime, base64_data))
}
