use crate::{
    api::model::{AuthResponse, ErrorResponse, UserDetailResponse, UserProfile, is_super_admin},
    model::AppState,
    utils::{
        jwt::{AuthUser, sign_jwt_with_access_ttl},
        route_control::{MANAGED_ROUTE_KEYS, is_protected_route_key},
    },
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::{collections::HashMap, sync::Arc};
use tracing::{error, warn};

#[derive(Debug, Deserialize)]
pub struct AdminUsersQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AdminUserListItem {
    pub id: uuid::Uuid,
    pub email: String,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RouteControlItem {
    pub route_key: String,
    pub is_enabled: bool,
    pub reason: Option<String>,
    pub is_protected: bool,
    pub updated_by: Option<uuid::Uuid>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRouteControlPayload {
    pub is_enabled: bool,
    pub reason: Option<String>,
}

const ANNOUNCEMENT_STATUS_DRAFT: &str = "draft";
const ANNOUNCEMENT_STATUS_PUBLISHED: &str = "published";
const ANNOUNCEMENT_STATUS_ARCHIVED: &str = "archived";

fn normalize_announcement_status(status: &str) -> Option<&'static str> {
    match status.trim().to_lowercase().as_str() {
        ANNOUNCEMENT_STATUS_DRAFT => Some(ANNOUNCEMENT_STATUS_DRAFT),
        ANNOUNCEMENT_STATUS_PUBLISHED => Some(ANNOUNCEMENT_STATUS_PUBLISHED),
        ANNOUNCEMENT_STATUS_ARCHIVED => Some(ANNOUNCEMENT_STATUS_ARCHIVED),
        _ => None,
    }
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AnnouncementItem {
    pub id: uuid::Uuid,
    pub title: String,
    pub content: String,
    pub status: String,
    pub published_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_by: uuid::Uuid,
    pub updated_by: uuid::Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct AnnouncementListQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAnnouncementPayload {
    pub title: String,
    pub content: String,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAnnouncementPayload {
    pub title: Option<String>,
    pub content: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAgentTokenPayload {
    pub expires_in_seconds: Option<u64>,
}

pub async fn admin_users_handler(
    _admin_user: AuthUser,
    Query(params): Query<AdminUsersQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<AdminUserListItem>>, (StatusCode, Json<ErrorResponse>)> {
    let limit = params.limit.unwrap_or(50).clamp(1, 200);
    let offset = params.offset.unwrap_or(0).max(0);

    let users = sqlx::query_as::<_, AdminUserListItem>(
        r#"
        SELECT id, email, nickname, avatar_url, role
        FROM users
        ORDER BY id DESC
        LIMIT $1 OFFSET $2
        "#,
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Admin Users): {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Internal server error".to_string(),
            }),
        )
    })?;

    Ok(Json(users))
}

pub async fn admin_route_controls_handler(
    _admin_user: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<RouteControlItem>>, (StatusCode, Json<ErrorResponse>)> {
    let controls = sqlx::query_as::<_, RouteControlItem>(
        r#"
        SELECT route_key, is_enabled, reason, FALSE as is_protected, updated_by, updated_at
        FROM route_controls
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Admin Route Controls): {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Internal server error".to_string(),
            }),
        )
    })?;

    let mut control_map: HashMap<String, RouteControlItem> = controls
        .into_iter()
        .map(|item| (item.route_key.clone(), item))
        .collect();

    let mut all_controls = Vec::with_capacity(MANAGED_ROUTE_KEYS.len());
    for route_key in MANAGED_ROUTE_KEYS {
        if let Some(mut item) = control_map.remove(route_key) {
            item.is_protected = is_protected_route_key(route_key);
            all_controls.push(item);
        } else {
            all_controls.push(RouteControlItem {
                route_key: route_key.to_string(),
                is_enabled: true,
                reason: None,
                is_protected: is_protected_route_key(route_key),
                updated_by: None,
                updated_at: None,
            });
        }
    }

    if !control_map.is_empty() {
        let mut extra_controls: Vec<RouteControlItem> = control_map.into_values().collect();
        extra_controls.sort_by(|a, b| a.route_key.cmp(&b.route_key));
        for mut item in extra_controls {
            item.is_protected = is_protected_route_key(&item.route_key);
            all_controls.push(item);
        }
    }

    Ok(Json(all_controls))
}

pub async fn update_route_control_handler(
    admin_user: AuthUser,
    Path(route_key): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UpdateRouteControlPayload>,
) -> Result<Json<RouteControlItem>, (StatusCode, Json<ErrorResponse>)> {
    if is_protected_route_key(&route_key) && !payload.is_enabled {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "This route key cannot be disabled".to_string(),
            }),
        ));
    }

    let reason = payload.reason.map(|r| r.trim().to_string());
    let reason = reason.and_then(|r| if r.is_empty() { None } else { Some(r) });

    let control = sqlx::query_as::<_, RouteControlItem>(
        r#"
        INSERT INTO route_controls (route_key, is_enabled, reason, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (route_key)
        DO UPDATE
            SET is_enabled = EXCLUDED.is_enabled,
                reason = EXCLUDED.reason,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
        RETURNING route_key, is_enabled, reason, FALSE as is_protected, updated_by, updated_at
        "#,
    )
    .bind(&route_key)
    .bind(payload.is_enabled)
    .bind(&reason)
    .bind(admin_user.user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Update Route Control): {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Internal server error".to_string(),
            }),
        )
    })?;

    if let Err(e) = sqlx::query(
        r#"
        INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, metadata, created_at)
        VALUES ($1, $2, 'route', $3, $4, now())
        "#,
    )
    .bind(admin_user.user_id)
    .bind(if payload.is_enabled {
        "ROUTE_ENABLED"
    } else {
        "ROUTE_DISABLED"
    })
    .bind(&route_key)
    .bind(serde_json::json!({
        "isEnabled": payload.is_enabled,
        "reason": reason,
    }))
    .execute(&state.db)
    .await
    {
        warn!("Audit log write failed for route control {}: {:?}", route_key, e);
    }

    Ok(Json(RouteControlItem {
        is_protected: is_protected_route_key(&control.route_key),
        ..control
    }))
}

pub async fn admin_announcements_handler(
    _admin_user: AuthUser,
    Query(params): Query<AnnouncementListQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<AnnouncementItem>>, (StatusCode, Json<ErrorResponse>)> {
    let limit = params.limit.unwrap_or(50).clamp(1, 200);
    let offset = params.offset.unwrap_or(0).max(0);

    let announcements = sqlx::query_as::<_, AnnouncementItem>(
        r#"
        SELECT id, title, content, status, published_at, created_by, updated_by, created_at, updated_at
        FROM announcements
        ORDER BY updated_at DESC
        LIMIT $1 OFFSET $2
        "#,
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Admin Announcements): {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Internal server error".to_string(),
            }),
        )
    })?;

    Ok(Json(announcements))
}

pub async fn create_announcement_handler(
    admin_user: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateAnnouncementPayload>,
) -> Result<Json<AnnouncementItem>, (StatusCode, Json<ErrorResponse>)> {
    let title = payload.title.trim().to_string();
    let content = payload.content.trim().to_string();
    if title.is_empty() || content.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Title and content are required".to_string(),
            }),
        ));
    }

    let status = match payload.status {
        Some(s) => match normalize_announcement_status(&s) {
            Some(valid) => valid.to_string(),
            None => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: "Invalid status. Use draft/published/archived".to_string(),
                    }),
                ));
            }
        },
        None => ANNOUNCEMENT_STATUS_DRAFT.to_string(),
    };

    let published_at = if status == ANNOUNCEMENT_STATUS_PUBLISHED {
        Some(chrono::Utc::now())
    } else {
        None
    };

    let announcement = sqlx::query_as::<_, AnnouncementItem>(
        r#"
        INSERT INTO announcements (
            title, content, status, published_at, created_by, updated_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now(), now())
        RETURNING id, title, content, status, published_at, created_by, updated_by, created_at, updated_at
        "#,
    )
    .bind(&title)
    .bind(&content)
    .bind(&status)
    .bind(published_at)
    .bind(admin_user.user_id)
    .bind(admin_user.user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Create Announcement): {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Internal server error".to_string(),
            }),
        )
    })?;

    Ok(Json(announcement))
}

pub async fn update_announcement_handler(
    admin_user: AuthUser,
    Path(id): Path<uuid::Uuid>,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UpdateAnnouncementPayload>,
) -> Result<Json<AnnouncementItem>, (StatusCode, Json<ErrorResponse>)> {
    let current = sqlx::query_as::<_, AnnouncementItem>(
        r#"
        SELECT id, title, content, status, published_at, created_by, updated_by, created_at, updated_at
        FROM announcements
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Get Announcement): {:?}", e);
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
            error: "Announcement not found".to_string(),
        }),
    ))?;

    let title = payload
        .title
        .as_ref()
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| current.title.clone());
    let content = payload
        .content
        .as_ref()
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| current.content.clone());
    if title.is_empty() || content.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Title and content cannot be empty".to_string(),
            }),
        ));
    }

    let status = match payload.status {
        Some(s) => match normalize_announcement_status(&s) {
            Some(valid) => valid.to_string(),
            None => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: "Invalid status. Use draft/published/archived".to_string(),
                    }),
                ));
            }
        },
        None => current.status.clone(),
    };

    let published_at = match status.as_str() {
        ANNOUNCEMENT_STATUS_PUBLISHED => current.published_at.or_else(|| Some(chrono::Utc::now())),
        _ => None,
    };

    let announcement = sqlx::query_as::<_, AnnouncementItem>(
        r#"
        UPDATE announcements
        SET
            title = $1,
            content = $2,
            status = $3,
            published_at = $4,
            updated_by = $5,
            updated_at = now()
        WHERE id = $6
        RETURNING id, title, content, status, published_at, created_by, updated_by, created_at, updated_at
        "#,
    )
    .bind(&title)
    .bind(&content)
    .bind(&status)
    .bind(published_at)
    .bind(admin_user.user_id)
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Update Announcement): {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Internal server error".to_string(),
            }),
        )
    })?;

    Ok(Json(announcement))
}

pub async fn publish_announcement_handler(
    admin_user: AuthUser,
    Path(id): Path<uuid::Uuid>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<AnnouncementItem>, (StatusCode, Json<ErrorResponse>)> {
    let announcement = sqlx::query_as::<_, AnnouncementItem>(
        r#"
        UPDATE announcements
        SET
            status = 'published',
            published_at = COALESCE(published_at, now()),
            updated_by = $1,
            updated_at = now()
        WHERE id = $2
        RETURNING id, title, content, status, published_at, created_by, updated_by, created_at, updated_at
        "#,
    )
    .bind(admin_user.user_id)
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Publish Announcement): {:?}", e);
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
            error: "Announcement not found".to_string(),
        }),
    ))?;

    Ok(Json(announcement))
}

pub async fn archive_announcement_handler(
    admin_user: AuthUser,
    Path(id): Path<uuid::Uuid>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<AnnouncementItem>, (StatusCode, Json<ErrorResponse>)> {
    let announcement = sqlx::query_as::<_, AnnouncementItem>(
        r#"
        UPDATE announcements
        SET
            status = 'archived',
            published_at = NULL,
            updated_by = $1,
            updated_at = now()
        WHERE id = $2
        RETURNING id, title, content, status, published_at, created_by, updated_by, created_at, updated_at
        "#,
    )
    .bind(admin_user.user_id)
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Archive Announcement): {:?}", e);
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
            error: "Announcement not found".to_string(),
        }),
    ))?;

    Ok(Json(announcement))
}

pub async fn admin_me_handler(
    auth_user: AuthUser,
    State(state): State<Arc<AppState>>,
) -> Result<Json<UserProfile>, (StatusCode, Json<ErrorResponse>)> {
    let user = sqlx::query_as::<_, crate::api::model::User>(
        "SELECT id, email, password_hash, nickname, avatar_url, role FROM users WHERE id = $1",
    )
    .bind(auth_user.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Admin Me): {:?}", e);
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

    Ok(Json(UserProfile {
        id: user.id.to_string(),
        email: user.email,
        nickname: user.nickname,
        avatar_url: user.avatar_url,
        role: user.role,
    }))
}

pub async fn create_agent_admin_token_handler(
    auth_user: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateAgentTokenPayload>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrorResponse>)> {
    if !is_super_admin(&auth_user.role) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Super admin required".to_string(),
            }),
        ));
    }

    let access_ttl = payload
        .expires_in_seconds
        .map(|v| v.clamp(300, 86400) as usize)
        .unwrap_or(3600);

    let user = sqlx::query_as::<_, crate::api::model::User>(
        "SELECT id, email, password_hash, nickname, avatar_url, role FROM users WHERE id = $1",
    )
    .bind(auth_user.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Create Agent Token): {:?}", e);
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

    if !is_super_admin(&user.role) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Super admin required".to_string(),
            }),
        ));
    }

    let (token, refresh_token, expires_in) =
        sign_jwt_with_access_ttl(&user.id.to_string(), &user.email, &user.role, access_ttl)
            .map_err(|e| {
                error!("JWT generation error (agent token): {:?}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Failed to generate token".to_string(),
                    }),
                )
            })?;

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

pub async fn admin_user_detail_handler(
    _admin_user: AuthUser,
    Path(user_id): Path<uuid::Uuid>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<UserDetailResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_row = sqlx::query(
        r#"
        SELECT id, email, nickname, avatar_url, height, weight, age, gender, taboo, disease
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("DB Error (Admin Get User): {:?}", e);
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
        id: user_row.get::<uuid::Uuid, _>("id").to_string(),
        email: user_row.get("email"),
        nickname: user_row.get("nickname"),
        avatar_url: user_row.get("avatar_url"),
        height: user_row.get("height"),
        weight: user_row.get("weight"),
        age: user_row.get("age"),
        gender: user_row.get("gender"),
        taboo: user_row.get("taboo"),
        disease: user_row.get("disease"),
    }))
}
