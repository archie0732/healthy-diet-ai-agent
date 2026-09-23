use crate::{api::model::ErrorResponse, model::AppState};
use axum::{
    Json,
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use sqlx::FromRow;
use std::sync::Arc;
use tracing::error;

pub const PROTECTED_ROUTE_KEYS: [&str; 5] = [
    "health",
    "ping",
    "auth_login",
    "auth_refresh",
    "admin_login",
];

pub const MANAGED_ROUTE_KEYS: [&str; 8] = [
    "health",
    "ping",
    "auth_login",
    "auth_refresh",
    "admin_login",
    "diet",
    "diet_image",
    "proxy_chat",
];

pub fn is_protected_route_key(route_key: &str) -> bool {
    PROTECTED_ROUTE_KEYS.contains(&route_key)
}

#[derive(Clone)]
pub struct RouteControlGuardState {
    pub app_state: Arc<AppState>,
    pub route_key: &'static str,
}

#[derive(FromRow)]
struct RouteControlRow {
    is_enabled: bool,
    reason: Option<String>,
}

fn error_response(status: StatusCode, message: String) -> Response {
    (
        status,
        Json(ErrorResponse {
            error: message.to_string(),
        }),
    )
        .into_response()
}

pub async fn require_route_enabled_middleware(
    State(guard): State<RouteControlGuardState>,
    request: Request,
    next: Next,
) -> Response {
    let route_control = sqlx::query_as::<_, RouteControlRow>(
        "SELECT is_enabled, reason FROM route_controls WHERE route_key = $1",
    )
    .bind(guard.route_key)
    .fetch_optional(&guard.app_state.db)
    .await;

    let route_control = match route_control {
        Ok(control) => control,
        Err(e) => {
            error!("DB Error (Route Control {}): {:?}", guard.route_key, e);
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal server error".to_string(),
            );
        }
    };

    if let Some(control) = route_control {
        if !control.is_enabled {
            let reason = control.reason.unwrap_or_else(|| "maintenance".to_string());
            return error_response(
                StatusCode::SERVICE_UNAVAILABLE,
                format!("Route is temporarily disabled: {}", reason),
            );
        }
    }

    next.run(request).await
}
