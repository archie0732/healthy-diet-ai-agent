use crate::{
    api::model::{AuthResponse, ErrorResponse, RefreshTokenPayload, User, UserProfile},
    model::AppState,
    utils::jwt::{decode_jwt, sign_jwt},
};
use axum::{Json, extract::State, http::status::StatusCode};
use std::sync::Arc;
use tracing::{error, warn};

pub async fn refresh_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RefreshTokenPayload>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    let claims = decode_jwt(&payload.refresh_token).map_err(|e| {
        warn!("Invalid refresh token: {:?}", e);
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Invalid or expired refresh token".to_string(),
            }),
        )
    })?;

    if &claims.token_type != "refresh" {
        warn!("Invalid token type use for refresh: {}", &claims.token_type);

        return Err((
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Invalid or expired refresh token".to_string(),
            }),
        ));
    }

    let user_id = uuid::Uuid::parse_str(&claims.sub).map_err(|e| {
        error!("Invalid UUID in token claims, {:?}", e);
        (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "Invalid token format".to_string(),
            }),
        )
    })?;

    let user = sqlx::query_as::<_, User>(
        "SELECT id, email, password_hash, nickname, avatar_url, role FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("Database error during {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Internal server error".to_string(),
            }),
        )
    })?;

    let user = match user {
        Some(u) => u,
        None => {
            warn!("User not found during refresh: {}", claims.sub);
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: ("User no longer exists".to_string()),
                }),
            ));
        }
    };

    let (new_token, new_refresh_token, expires_in) =
        sign_jwt(&user.id.to_string(), &user.email, &user.role).map_err(|e| {
            error!("JWT generation error: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Interal server error".to_string(),
                }),
            )
        })?;

    Ok(Json(AuthResponse {
        token: new_token,
        refresh_token: new_refresh_token,
        expires_in,
        user: UserProfile {
            id: user.id.to_string(),
            avatar_url: user.avatar_url,
            email: user.email,
            nickname: user.nickname,
            role: user.role,
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::{
        jwt::sign_jwt,
        test::{register_test_account, setup_db},
    };

    #[tokio::test]
    async fn test_refresh_token_success() {
        let state = setup_db().await;

        let (email, _) = register_test_account(state.clone(), "test_refresh".to_string()).await;

        let user = sqlx::query!("SELECT id FROM users WHERE email = $1", email)
            .fetch_one(&state.db)
            .await
            .unwrap();

        let (_, refresh_token, _) = sign_jwt(&user.id.to_string(), &email, "user").unwrap();

        let payload = RefreshTokenPayload { refresh_token };
        let result = refresh_handler(State(state.clone()), Json(payload)).await;

        assert!(result.is_ok());
        let res = result.unwrap().0;
        assert!(!res.token.is_empty());
        assert_ne!(res.token, res.refresh_token);

        sqlx::query!("DELETE FROM users WHERE email = $1", email)
            .execute(&state.db)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn test_refresh_with_bad_token() {
        let state = setup_db().await;

        let payload = RefreshTokenPayload {
            refresh_token: "bad.token.value".to_string(),
        };

        let result = refresh_handler(State(state), Json(payload)).await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().0, StatusCode::UNAUTHORIZED);
    }
}
