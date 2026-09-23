use crate::{api::model::ErrorResponse, model::AppState};
use axum::{Json, extract::State, http::StatusCode};
use serde::Serialize;
use serde_json::json;
use std::sync::Arc;
use tracing::error;

#[derive(Serialize)]
pub struct DailyStatsResponse {
    pub date: String,
    pub visit_count: i32,
}

pub async fn record_visit_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    sqlx::query!(
        r#"
        INSERT INTO daily_stats (record_date, visit_count)
        VALUES (CURRENT_DATE, 1)
        ON CONFLICT (record_date)
        DO UPDATE SET visit_count = daily_stats.visit_count + 1
        "#
    )
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("更新每日人數失敗: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "伺服器紀錄錯誤".into(),
            }),
        )
    })?;

    Ok(Json(json!({ "message": "Visit recorded successfully" })))
}

pub async fn weekly_stats_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<DailyStatsResponse>>, (StatusCode, Json<ErrorResponse>)> {
    let records = sqlx::query!(
        r#"
        SELECT record_date::TEXT as date_str, visit_count
        FROM daily_stats
        WHERE record_date >= CURRENT_DATE - INTERVAL '29 days'
        ORDER BY record_date ASC
        "#
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("查詢近期造訪人數失敗: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "資料庫查詢失敗".into(),
            }),
        )
    })?;

    let stats: Vec<DailyStatsResponse> = records
        .into_iter()
        .map(|row| DailyStatsResponse {
            date: row.date_str.unwrap_or_default(),
            visit_count: row.visit_count,
        })
        .collect();

    Ok(Json(stats))
}
