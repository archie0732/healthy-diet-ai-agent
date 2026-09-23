use axum::{Json, http::StatusCode};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json;
use std::env;
use tracing::{error, info, warn};

use crate::{api::model::ErrorResponse, model::ENVKey, utils::jwt::AuthUser};

#[derive(Deserialize, Serialize)]
pub struct AgentApproveRequest {
    pub approval_id: String,
    pub action: String, // approve or reject
}

pub async fn approve_agent(
    auth_user: AuthUser,
    Json(payload): Json<AgentApproveRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let client = Client::new();
    info!(
        user_id = %auth_user.user_id,
        approval_id = %payload.approval_id,
        action = %payload.action,
        "agent_approve request received"
    );

    let node_api_base_url = env::var(ENVKey::AGENT_API_URL).map_err(|e| {
        error!("cannot get env value {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Server error".to_string(),
            }),
        )
    })?;
    info!(
        agent_api_base_url = %node_api_base_url,
        "agent_approve loaded AGENT_API_URL"
    );

    let mut node_api_url = Url::parse(&node_api_base_url).map_err(|e| {
        error!("invalid AGENT_API_URL: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Server error".to_string(),
            }),
        )
    })?;
    node_api_url.set_path("/api/approve");
    node_api_url.set_query(None);
    node_api_url.set_fragment(None);
    info!(
        downstream_url = %node_api_url,
        "agent_approve forwarding request to downstream"
    );

    let response = client
        .post(node_api_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            error!("AI server connect error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "AI server connect error".to_string(),
                }),
            );
        })?;
    let status = response.status();
    if !status.is_success() {
        warn!(
            status = %status,
            "agent_approve downstream returned non-success status"
        );
    } else {
        info!(status = %status, "agent_approve downstream returned success status");
    }

    let json_data: serde_json::Value = match response.json().await {
        Ok(data) => data,
        Err(e) => {
            warn!(
                status = %status,
                error = %e,
                "agent_approve downstream response is not valid JSON, returning empty object"
            );
            serde_json::Value::Object(Default::default())
        }
    };

    Ok(Json(json_data))
}
