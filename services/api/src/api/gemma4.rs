use axum::{Json, http::StatusCode};
use reqwest::Client;
use serde::Serialize;
use std::time::Duration;

const DEFAULT_GEMMA4_TARGET_URL: &str = "http://host.docker.internal:8080";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gemma4HealthResponse {
    pub target_url: String,
    pub model: String,
    pub running: bool,
    pub http_status_code: Option<u16>,
    pub message: String,
}

fn gemma4_target_url() -> &'static str {
    DEFAULT_GEMMA4_TARGET_URL
}

pub async fn gemma4_health_handler() -> (StatusCode, Json<Gemma4HealthResponse>) {
    let target_url = gemma4_target_url();
    let client = Client::new();

    match client
        .get(target_url)
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        Ok(response) => (
            StatusCode::OK,
            Json(Gemma4HealthResponse {
                target_url: target_url.to_string(),
                model: "gemma4".to_string(),
                running: true,
                http_status_code: Some(response.status().as_u16()),
                message: "gemma4 service is reachable on host.docker.internal:8080".to_string(),
            }),
        ),
        Err(error) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(Gemma4HealthResponse {
                target_url: target_url.to_string(),
                model: "gemma4".to_string(),
                running: false,
                http_status_code: None,
                message: format!(
                    "cannot reach gemma4 service on host.docker.internal:8080: {}",
                    error
                ),
            }),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn health_handler_uses_docker_host_default_url() {
        let (_, Json(response)) = gemma4_health_handler().await;

        assert_eq!(response.target_url, DEFAULT_GEMMA4_TARGET_URL);
    }
}
