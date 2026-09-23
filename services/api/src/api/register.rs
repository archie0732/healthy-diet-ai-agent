use crate::{
    api::model::{AuthResponse, ErrorResponse, ROLE_USER, RegisterPayload, User, UserProfile},
    model::AppState,
    utils::{hash::hash_password, jwt::sign_jwt},
};
use axum::{Json, extract::State, http::StatusCode};
use std::sync::Arc;
use tracing::{error, info, instrument, warn};
use validator::Validate;

#[instrument(skip(state, payload), fields(email = %payload.email))]
pub async fn register_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RegisterPayload>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    if let Err(e) = payload.validate() {
        warn!("Registration validation failed: {}", e);
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Validation failed: {}", e),
            }),
        ));
    }

    let email_exists = sqlx::query!("SELECT id FROM users WHERE email = $1", payload.email)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!("Database query error: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Internal server error".to_string(),
                }),
            )
        })?;

    if email_exists.is_some() {
        warn!(
            "Registration failed: Email already exists {}",
            payload.email
        );
        return Err((
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                error: "Email already registered".to_string(),
            }),
        ));
    }

    let password_hash = hash_password(&payload.password).map_err(|e| {
        error!("Password hashing failed: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to process password".to_string(),
            }),
        )
    })?;

    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (email, password_hash, nickname, avatar_url, role) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, email, password_hash, nickname, avatar_url, role",
    )
    .bind(&payload.email)
    .bind(&password_hash)
    .bind(&payload.nickname)
    .bind(&payload.avatar_url)
    .bind(ROLE_USER)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if e.to_string().contains("duplicate key value") {
            warn!("Duplicate key error on insert: {}", payload.email);
            (
                StatusCode::CONFLICT,
                Json(ErrorResponse {
                    error: "Email already registered".to_string(),
                }),
            )
        } else {
            error!("Database insert error: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Registration failed".to_string(),
                }),
            )
        }
    })?;

    let (token, refresh_token, expires_in) =
        sign_jwt(&user.id.to_string(), &user.email, &user.role).map_err(|e| {
            error!("JWT generation error: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to create token".to_string(),
                }),
            )
        })?;

    info!("New user registered: {}", user.id);

    Ok(Json(AuthResponse {
        token,
        refresh_token,
        expires_in,
        user: UserProfile {
            id: user.id.to_string(),
            email: user.email,
            nickname: user.nickname,
            avatar_url: user.avatar_url,
            role: user.role,
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test::setup_db;
    use uuid::Uuid;

    #[tokio::test]
    async fn test_register_success() {
        let state = setup_db().await;

        let random_email = format!("reg_full_{}@example.com", Uuid::new_v4());
        let payload = RegisterPayload {
            email: random_email.clone(),
            password: "password123".to_string(),
            nickname: Some("NewUser".to_string()),
            avatar_url: None,
        };

        let result = register_handler(State(state.clone()), Json(payload)).await;

        assert!(result.is_ok());
        let response = result.unwrap().0;

        assert_eq!(response.user.email, random_email);
        assert_eq!(response.user.role, "user".to_string());
        assert!(!response.token.is_empty());
        assert!(!response.refresh_token.is_empty());
        assert_eq!(response.expires_in, 3600);

        let _ = sqlx::query!("DELETE FROM users WHERE email = $1", random_email)
            .execute(&state.db)
            .await;
    }
}
