use crate::{
    api::model::{ErrorResponse, UpdateProfilePayload, UserDetailResponse},
    model::AppState,
    utils::jwt::AuthUser,
};
use axum::{Json, extract::State, http::StatusCode};
use std::sync::Arc;
use tracing::error;

pub async fn get_profile_handler(
    auth_user: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<Json<UserDetailResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user = sqlx::query!(
        r#"
        SELECT id, email, nickname, avatar_url, height, weight, age, gender, taboo, disease
        FROM users WHERE id = $1
        "#,
        auth_user.user_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Get Profile): {:?}", e);
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
            error: "User not found".to_string(),
        }),
    ))?;

    Ok(Json(UserDetailResponse {
        id: user.id.to_string(),
        email: user.email,
        nickname: user.nickname,
        avatar_url: user.avatar_url,
        height: user.height,
        weight: user.weight,
        age: user.age,
        gender: user.gender,
        taboo: user.taboo,
        disease: user.disease,
    }))
}

pub async fn update_user_profile_handler(
    auth_user: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UpdateProfilePayload>,
) -> Result<Json<UserDetailResponse>, (StatusCode, Json<ErrorResponse>)> {
    let updated_user = sqlx::query!(
        r#"
        UPDATE users
        SET
            nickname = COALESCE($1, nickname),
            height = COALESCE($2, height),
            weight = COALESCE($3, weight),
            age = COALESCE($4, age),
            gender = COALESCE($5, gender),
            taboo = COALESCE($6, taboo),
            disease = COALESCE($7, disease)
        WHERE id = $8
        RETURNING id, email, nickname, avatar_url, height, weight, age, gender, taboo, disease
        "#,
        payload.nickname,
        payload.height,
        payload.weight,
        payload.age,
        payload.gender,
        payload.taboo.as_deref(),
        payload.disease.as_deref(),
        auth_user.user_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to update profile: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to update profile".to_string(),
            }),
        )
    })?;

    Ok(Json(UserDetailResponse {
        id: updated_user.id.to_string(),
        email: updated_user.email,
        nickname: updated_user.nickname,
        avatar_url: updated_user.avatar_url,
        height: updated_user.height,
        weight: updated_user.weight,
        age: updated_user.age,
        gender: updated_user.gender,
        taboo: updated_user.taboo,
        disease: updated_user.disease,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test::{register_test_account, setup_db};

    #[tokio::test]
    async fn test_get_profile_success() {
        let state = setup_db().await;

        let (email, _) = register_test_account(state.clone(), "profile_get".to_string()).await;

        let user = sqlx::query!("SELECT id FROM users WHERE email = $1", email)
            .fetch_one(&state.db)
            .await
            .expect("Failed to fetch user");

        let auth_user = AuthUser {
            user_id: user.id,
            email: email.clone(),
            role: "user".to_string(),
        };

        let result = get_profile_handler(auth_user, State(state.clone())).await;

        assert!(result.is_ok());
        let response = result.unwrap().0;
        assert_eq!(response.email, email);

        sqlx::query!("DELETE FROM users WHERE email = $1", email)
            .execute(&state.db)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn test_update_profile_success() {
        let state = setup_db().await;

        let (email, _) = register_test_account(state.clone(), "profile_update".to_string()).await;
        let user = sqlx::query!("SELECT id FROM users WHERE email = $1", email)
            .fetch_one(&state.db)
            .await
            .unwrap();

        let auth_user = AuthUser {
            user_id: user.id,
            email: email.clone(),
            role: "user".to_string(),
        };

        let payload = UpdateProfilePayload {
            nickname: Some("BigMuscle".to_string()),
            height: Some(180.5),
            weight: None,
            age: Some(28.0),
            gender: Some("Male".to_string()),
            taboo: Some(vec!["花生".to_string(), "海鮮".to_string()]),
            disease: Some(vec!["高血壓".to_string()]),
        };

        let result =
            update_user_profile_handler(auth_user, State(state.clone()), Json(payload)).await;

        assert!(result.is_ok());
        let response = result.unwrap().0;
        assert_eq!(response.nickname, Some("BigMuscle".to_string()));
        assert_eq!(response.height, Some(180.5));
        assert_eq!(response.age, Some(28.0));
        assert_eq!(
            response.taboo,
            Some(vec!["花生".to_string(), "海鮮".to_string()])
        );

        let db_user = sqlx::query!(
            "SELECT nickname, age, taboo FROM users WHERE id = $1",
            user.id
        )
        .fetch_one(&state.db)
        .await
        .unwrap();

        assert_eq!(db_user.nickname, Some("BigMuscle".to_string()));
        assert_eq!(db_user.age, Some(28.0));
        assert_eq!(
            db_user.taboo,
            Some(vec!["花生".to_string(), "海鮮".to_string()])
        );

        sqlx::query!("DELETE FROM users WHERE email = $1", email)
            .execute(&state.db)
            .await
            .unwrap();
    }
}
