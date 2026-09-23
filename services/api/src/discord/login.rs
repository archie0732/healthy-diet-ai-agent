use std::env;

use axum::{
    Json,
    extract::Query,
    response::{IntoResponse, Redirect},
};
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, RedirectUrl, Scope,
    TokenResponse, TokenUrl, basic::BasicClient, reqwest::async_http_client,
};
use reqwest::Client as ReqwestClient;
use serde::{Deserialize, Serialize};

const AUTH_URL: &str = "https://discord.com/api/oauth2/authorize";
const TOKEN_URL: &str = "https://discord.com/api/oauth2/token";

#[derive(Debug, Deserialize, Serialize)]
pub struct DiscordUser {
    id: String,
    username: String,
    discriminator: String,
    avatar: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AuthRequest {
    code: String,
    #[allow(dead_code)]
    state: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub message: String,
    pub data: DiscordUser,
}

fn make_client() -> BasicClient {
    let client_id = ClientId::new(
        env::var("DISCORD_CLIENT_ID").expect("[discord login]Missing DISCORD_CLIENT_ID"),
    );
    let client_secret = ClientSecret::new(
        env::var("DISCORD_CLIENT_SECRET").expect("[discord login]Missing DISCORD_CLIENT_SECRET"),
    );
    let auth_url = AuthUrl::new(AUTH_URL.to_string()).expect("[discord login]Invalid AuthUrl");
    let token_url = TokenUrl::new(TOKEN_URL.to_string()).expect("[discord login]Invalid TokenUrl");
    let redirect_url = RedirectUrl::new(
        env::var("DISCORD_REDIRECT_URL").expect("[discord login]Missing DISCORD_REDIRECT_URL"),
    )
    .expect("[discord login]Invalid RedirectUrl");

    BasicClient::new(client_id, Some(client_secret), auth_url, Some(token_url))
        .set_redirect_uri(redirect_url)
}

pub async fn login_discord() -> Redirect {
    let client = make_client();

    let (auth_url, _csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("identify".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .url();

    Redirect::to(auth_url.as_str())
}

pub async fn discord_callback(Query(query): Query<AuthRequest>) -> impl IntoResponse {
    let client = make_client();
    let token_result = client
        .exchange_code(AuthorizationCode::new(query.code))
        .request_async(async_http_client)
        .await;

    let token = match token_result {
        Ok(t) => t,
        Err(e) => {
            return Json(LoginResponse {
                message: format!("[discord login]Login Failed: {:?}", e),
                data: DiscordUser {
                    id: "".to_string(),
                    username: "".to_string(),
                    discriminator: "".to_string(),
                    avatar: None,
                },
            });
        }
    };

    let access_token = token.access_token().secret();

    let http_client = ReqwestClient::new();
    let user_data: DiscordUser = match http_client
        .get("https://discord.com/api/users/@me")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
    {
        Ok(res) => res.json().await.unwrap(),
        Err(e) => {
            return Json(LoginResponse {
                message: format!("[discord login]Login Failed: {:?}", e),
                data: DiscordUser {
                    id: "".to_string(),
                    username: "".to_string(),
                    discriminator: "".to_string(),
                    avatar: None,
                },
            });
        }
    };

    Json(LoginResponse {
        message: format!("{} Login Success!", user_data.username),
        data: user_data,
    })
}
