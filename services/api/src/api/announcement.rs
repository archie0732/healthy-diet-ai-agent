use crate::{api::model::ErrorResponse, model::AppState};
use axum::{Json, extract::State, http::StatusCode};
use serde::Serialize;
use std::sync::Arc;
use tracing::error;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CurrentAnnouncementResponse {
    pub id: uuid::Uuid,
    pub title: String,
    pub content: String,
    pub published_at: chrono::DateTime<chrono::Utc>,
}

pub async fn current_announcement_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<CurrentAnnouncementResponse>, (StatusCode, Json<ErrorResponse>)> {
    let announcement = sqlx::query_as::<_, CurrentAnnouncementResponse>(
        r#"
        SELECT id, title, content, published_at
        FROM announcements
        WHERE status = 'published' AND published_at IS NOT NULL AND published_at <= now()
        ORDER BY published_at DESC NULLS LAST, updated_at DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Current Announcement): {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Internal server error".to_string(),
            }),
        )
    })?
    .ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "No published announcement".to_string(),
        }),
    ))?;

    Ok(Json(announcement))
}
