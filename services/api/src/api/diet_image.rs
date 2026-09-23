use crate::{api::model::ErrorResponse, model::AppState, utils::jwt::AuthUser};
use axum::{Json, extract::State, http::StatusCode};
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::error;
use uuid::Uuid;

#[derive(Serialize)]
pub struct ImageResponse {
    pub message: String,
    pub image_base64: Option<String>,
    pub original_image_base64: Option<String>,
}

#[derive(Deserialize)]
pub struct ImageRequest {
    pub record_id: Uuid,
}

#[axum::debug_handler]
pub async fn diet_image_handler(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<ImageRequest>,
) -> Result<Json<ImageResponse>, (StatusCode, Json<ErrorResponse>)> {
    let record = sqlx::query!(
        "SELECT result_image_path, original_image_path FROM diet_records WHERE id = $1 AND user_id = $2",
        payload.record_id,
        auth_user.user_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("DB error on diet_image query: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?
    .ok_or((
        StatusCode::FORBIDDEN,
        Json(ErrorResponse {
            error: "Permission denied".to_string(),
        }),
    ))?;

    let result_image_path = record.result_image_path.ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "Result image path not found".to_string(),
        }),
    ))?;

    let result_path = std::path::Path::new(&result_image_path);
    if !result_path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Result image file not found".to_string(),
            }),
        ));
    }

    let result_bytes = tokio::fs::read(result_path).await.map_err(|e| {
        error!("Read result image failed: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to read result image".to_string(),
            }),
        )
    })?;
    let image_base64 = Some(general_purpose::STANDARD.encode(result_bytes));

    let original_image_base64 = if let Some(original_path_str) = record.original_image_path {
        let original_path = std::path::Path::new(&original_path_str);
        if original_path.exists() {
            match tokio::fs::read(original_path).await {
                Ok(bytes) => Some(general_purpose::STANDARD.encode(bytes)),
                Err(e) => {
                    error!(
                        "Read original image failed ({}): {:?}",
                        original_path_str, e
                    );
                    None
                }
            }
        } else {
            None
        }
    } else {
        None
    };

    Ok(Json(ImageResponse {
        message: "Image loaded successfully".to_string(),
        image_base64,
        original_image_base64,
    }))
}
