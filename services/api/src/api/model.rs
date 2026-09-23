use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

pub const ROLE_USER: &str = "user";
pub const ROLE_OPERATOR: &str = "operator";
pub const ROLE_SUPER_ADMIN: &str = "super_admin";

pub fn is_admin_role(role: &str) -> bool {
    matches!(role, ROLE_OPERATOR | ROLE_SUPER_ADMIN)
}

pub fn is_super_admin(role: &str) -> bool {
    role == ROLE_SUPER_ADMIN
}

#[derive(Debug, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterPayload {
    #[validate(email(message = "Email formate not correct"))]
    pub email: String,

    #[validate(length(min = 6, message = "paasword must great than 6 characters"))]
    pub password: String,

    #[validate(length(
        min = 2,
        max = 20,
        message = "length of nicname must between 2 and 20 characters"
    ))]
    pub nickname: Option<String>,

    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginPayload {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
    #[serde(rename = "expiresIn")]
    pub expires_in: usize,
    pub user: UserProfile,
}

#[derive(Debug, Serialize)]
pub struct UserProfile {
    pub id: String,
    pub email: String,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Deserialize)]
pub struct RefreshTokenPayload {
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
}

#[derive(Deserialize)]
pub struct UpdateProfilePayload {
    pub nickname: Option<String>,
    pub height: Option<f64>,
    pub weight: Option<f64>,
    pub age: Option<f64>,
    pub gender: Option<String>,
    pub taboo: Option<Vec<String>>,
    pub disease: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDetailResponse {
    pub id: String,
    pub email: String,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
    pub height: Option<f64>,
    pub weight: Option<f64>,
    pub age: Option<f64>,
    pub gender: Option<String>,
    pub taboo: Option<Vec<String>>,
    pub disease: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct DietRecordResponse {
    pub id: String,
    pub created_at: String,
    pub total_calories: f64,
    pub grain_calories: Option<f64>,
    pub grain_area: Option<f64>,
    pub protein_meat_calories: Option<f64>,
    pub protein_meat_area: Option<f64>,
    pub protein_bean_calories: Option<f64>,
    pub protein_bean_area: Option<f64>,
    pub vegetable_calories: Option<f64>,
    pub vegetable_area: Option<f64>,
    pub fruit_calories: Option<f64>,
    pub fruit_area: Option<f64>,
    pub dairy_calories: Option<f64>,
    pub dairy_area: Option<f64>,
    pub nuts_calories: Option<f64>,
    pub nuts_area: Option<f64>,
    pub ai_health_score: Option<i32>,
    pub ai_evaluation: Option<String>,
}
