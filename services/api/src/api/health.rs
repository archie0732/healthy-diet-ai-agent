use axum::{Json, http::StatusCode};

#[derive(serde::Serialize)]
pub struct HealthResponse {
    pub status: String,
}

pub async fn healthy_server_handler() -> Result<Json<HealthResponse>, (StatusCode, String)> {
    Ok(Json(HealthResponse {
        status: "ok".to_string(),
    }))
}
