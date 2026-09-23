use crate::api::model::DietRecordResponse;
use axum::{Json, extract::State, http::StatusCode};
use std::sync::Arc;
use tracing::error;

use crate::{api::model::ErrorResponse, model::AppState, utils::jwt::AuthUser};

pub async fn diet_records_handler(
    auth_user: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<DietRecordResponse>>, (StatusCode, Json<ErrorResponse>)> {
    let records = sqlx::query!(
        r#"
        SELECT
            id, created_at, total_calories,
            grain_calories, grain_area,
            protein_meat_calories, protein_meat_area,
            protein_bean_calories, protein_bean_area,
            vegetable_calories, vegetable_area,
            fruit_calories, fruit_area,
            dairy_calories, dairy_area,
            nuts_calories, nuts_area,
            ai_health_score, ai_evaluation
        FROM diet_records
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 30
        "#,
        auth_user.user_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Get Diet Records): {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "無法取得飲食紀錄".to_string(),
            }),
        )
    })?;

    let response: Vec<DietRecordResponse> = records
        .into_iter()
        .map(|r| DietRecordResponse {
            id: r.id.to_string(),                 // UUID 轉成字串
            created_at: r.created_at.to_string(), // TIMESTAMPTZ 轉成標準時間字串
            total_calories: r.total_calories,
            grain_calories: r.grain_calories,
            grain_area: r.grain_area,
            protein_meat_calories: r.protein_meat_calories,
            protein_meat_area: r.protein_meat_area,
            protein_bean_calories: r.protein_bean_calories,
            protein_bean_area: r.protein_bean_area,
            vegetable_calories: r.vegetable_calories,
            vegetable_area: r.vegetable_area,
            fruit_calories: r.fruit_calories,
            fruit_area: r.fruit_area,
            dairy_calories: r.dairy_calories,
            dairy_area: r.dairy_area,
            nuts_calories: r.nuts_calories,
            nuts_area: r.nuts_area,
            ai_health_score: r.ai_health_score,
            ai_evaluation: r.ai_evaluation,
        })
        .collect();

    Ok(Json(response))
}
