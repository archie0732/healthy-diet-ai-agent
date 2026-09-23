use axum::{
    extract::Json,
    http::{HeaderMap, StatusCode, header::AUTHORIZATION},
    response::sse::{Event, Sse},
};
use futures::stream::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;
use std::{convert::Infallible, time::Duration};
use tracing::error;
use uuid::Uuid;

use crate::{api::model::ErrorResponse, model::ENVKey, utils::jwt::AuthUser};

#[derive(Deserialize)]
pub struct AgentChatRequest {
    pub message: String,
    pub room_id: Option<Uuid>,
    pub thread_id: Option<String>,
    pub is_new_conversation: Option<bool>,
    pub user_context: Option<serde_json::Value>,
    pub image: Option<String>,
}

#[derive(Serialize)]
struct NodeAgentPayload {
    pub message: String,
    pub thread_id: String,
    pub is_new_conversation: bool,
    pub user_id: String,
    pub user_context: Option<serde_json::Value>,
    pub image: Option<String>,
}

struct ResolvedThreadContext {
    thread_id: String,
    is_new_conversation: bool,
}

fn normalize_agent_sse_chunk(chunk: &str) -> Vec<Event> {
    chunk
        .split("\n\n")
        .filter_map(|frame| {
            let frame = frame.trim();
            if frame.is_empty() {
                return None;
            }

            let mut event_name: Option<String> = None;
            let mut data_lines: Vec<String> = Vec::new();

            for line in frame.lines() {
                if let Some(value) = line.strip_prefix("event:") {
                    let value = value.trim();
                    if !value.is_empty() {
                        event_name = Some(value.to_string());
                    }
                } else if let Some(value) = line.strip_prefix("data:") {
                    data_lines.push(value.trim_start().to_string());
                } else if !line.trim().is_empty() {
                    data_lines.push(line.to_string());
                }
            }

            if event_name.is_none() && data_lines.is_empty() {
                return None;
            }

            let mut event = Event::default();
            if let Some(name) = event_name {
                event = event.event(name);
            }

            Some(event.data(data_lines.join("\n")))
        })
        .collect()
}

fn resolve_thread_context(
    request: &AgentChatRequest,
) -> Result<ResolvedThreadContext, (StatusCode, Json<ErrorResponse>)> {
    if let Some(thread_id) = request.thread_id.as_deref().map(str::trim) {
        if !thread_id.is_empty() {
            return Ok(ResolvedThreadContext {
                thread_id: thread_id.to_string(),
                is_new_conversation: request.is_new_conversation.unwrap_or(false),
            });
        }
    }

    if let Some(room_id) = request.room_id {
        return Ok(ResolvedThreadContext {
            thread_id: room_id.to_string(),
            is_new_conversation: request.is_new_conversation.unwrap_or(false),
        });
    }

    Err((
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            error: "thread_id is required".to_string(),
        }),
    ))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyChatCheckResponse {
    pub ping_url: String,
    pub ping_ok: bool,
    pub proxy_chat_available: bool,
    pub ping_status_code: Option<u16>,
    pub ping_response: Option<String>,
}

pub async fn chat_check_handler() -> (StatusCode, Json<ProxyChatCheckResponse>) {
    let node_api_url = match env::var(ENVKey::AGENT_API_URL) {
        Ok(url) => url,
        Err(e) => {
            error!("cannot get env value {:?}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ProxyChatCheckResponse {
                    ping_url: "a".to_string(),
                    ping_ok: false,
                    proxy_chat_available: false,
                    ping_status_code: None,
                    ping_response: Some(format!("lost environment variable: {}", e)),
                }),
            );
        }
    };

    let ping_url = format!("{}/ping", node_api_url);
    let client = Client::new();

    match client
        .get(&ping_url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            let ping_ok = status.is_success();
            let ping_status_code = Some(status.as_u16());
            let ping_response = response.text().await.ok();

            let response_status = if ping_ok {
                StatusCode::OK
            } else {
                StatusCode::SERVICE_UNAVAILABLE
            };

            (
                response_status,
                Json(ProxyChatCheckResponse {
                    ping_url: ping_url.to_string(),
                    ping_ok,
                    proxy_chat_available: ping_ok,
                    ping_status_code,
                    ping_response,
                }),
            )
        }
        Err(e) => {
            error!("proxy_chat_check ping failed: {:?}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ProxyChatCheckResponse {
                    ping_url: ping_url.to_string(),
                    ping_ok: false,
                    proxy_chat_available: false,
                    ping_status_code: None,
                    ping_response: Some(format!("ping request error: {}", e)),
                }),
            )
        }
    }
}

pub async fn chat_handler(
    headers: HeaderMap,
    auth_user: AuthUser,
    Json(request): Json<AgentChatRequest>,
) -> Result<
    Sse<impl futures::stream::Stream<Item = Result<Event, Infallible>>>,
    (StatusCode, Json<ErrorResponse>),
> {
    let client = Client::new();
    let resolved_thread = resolve_thread_context(&request)?;

    let payload = NodeAgentPayload {
        message: request.message,
        thread_id: resolved_thread.thread_id,
        is_new_conversation: resolved_thread.is_new_conversation,
        user_id: auth_user.user_id.to_string(),
        user_context: request.user_context,
        image: request.image,
    };

    let node_api_base_url = env::var(ENVKey::AGENT_API_URL).map_err(|e| {
        error!("cannot get env value {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Server error".to_string(),
            }),
        )
    })?;

    let node_api_url = format!("{}/api/chat", node_api_base_url);

    let mut agent_request = client.post(node_api_url).json(&payload);
    if let Some(auth_value) = headers.get(AUTHORIZATION) {
        if let Ok(auth_str) = auth_value.to_str() {
            agent_request = agent_request.header(AUTHORIZATION.as_str(), auth_str);
        }
    }

    let res = agent_request.send().await.map_err(|e| {
        error!("forward to Node.js Agent failed: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "AI request failed".into(),
            }),
        )
    })?;

    let stream = res
        .bytes_stream()
        .map(|chunk| match chunk {
            Ok(bytes) => normalize_agent_sse_chunk(&String::from_utf8_lossy(&bytes))
                .into_iter()
                .map(Ok)
                .collect::<Vec<_>>(),
            Err(e) => {
                error!("stream read failed: {:?}", e);
                vec![Ok(Event::default()
                    .event("error")
                    .data(r#"{"type":"error","content":"Stream read failed"}"#))]
            }
        })
        .flat_map(futures::stream::iter);

    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive-text"),
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        AgentChatRequest, NodeAgentPayload, normalize_agent_sse_chunk, resolve_thread_context,
    };
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn node_agent_payload_only_contains_proxy_fields() {
        let payload = NodeAgentPayload {
            message: "hello".to_string(),
            thread_id: Uuid::nil().to_string(),
            is_new_conversation: true,
            user_id: Uuid::nil().to_string(),
            user_context: None,
            image: Some("data:image/png;base64,abc".to_string()),
        };

        let json = serde_json::to_value(payload).expect("payload should serialize");

        assert_eq!(json.get("message").and_then(|v| v.as_str()), Some("hello"));
        assert_eq!(
            json.get("thread_id").and_then(|v| v.as_str()),
            Some(Uuid::nil().to_string().as_str())
        );
        assert_eq!(
            json.get("is_new_conversation").and_then(|v| v.as_bool()),
            Some(true)
        );
        assert_eq!(
            json.get("image").and_then(|v| v.as_str()),
            Some("data:image/png;base64,abc")
        );
        assert!(
            json.get("chat_history_id").is_none(),
            "proxy payload should not pre-allocate chat history ids in Rust"
        );
    }

    #[test]
    fn resolve_thread_context_prefers_frontend_thread_fields() {
        let request = AgentChatRequest {
            message: "hello".to_string(),
            room_id: None,
            thread_id: Some("frontend-thread-123".to_string()),
            is_new_conversation: Some(true),
            user_context: Some(json!({ "locale": "zh-TW" })),
            image: None,
        };

        let resolved = resolve_thread_context(&request).expect("thread context should resolve");

        assert_eq!(resolved.thread_id, "frontend-thread-123");
        assert!(resolved.is_new_conversation);
    }

    #[test]
    fn resolve_thread_context_falls_back_to_legacy_room_id() {
        let room_id = Uuid::new_v4();
        let request = AgentChatRequest {
            message: "hello".to_string(),
            room_id: Some(room_id),
            thread_id: None,
            is_new_conversation: None,
            user_context: None,
            image: None,
        };

        let resolved = resolve_thread_context(&request).expect("thread context should resolve");

        assert_eq!(resolved.thread_id, room_id.to_string());
        assert!(!resolved.is_new_conversation);
    }

    #[test]
    fn resolve_thread_context_requires_thread_or_room_id() {
        let request = AgentChatRequest {
            message: "hello".to_string(),
            room_id: None,
            thread_id: None,
            is_new_conversation: Some(true),
            user_context: None,
            image: None,
        };

        assert!(resolve_thread_context(&request).is_err());
    }

    #[test]
    fn normalize_agent_sse_chunk_preserves_existing_event_and_data_lines() {
        let normalized = normalize_agent_sse_chunk(
            "event: status\ndata: {\"type\":\"status\",\"content\":\"ok\"}\n\n",
        );

        assert_eq!(normalized.len(), 1);
        let debug = format!("{:?}", normalized[0]);
        assert!(debug.contains("event: status"));
        assert!(debug.contains("data: {\\\"type\\\":\\\"status\\\",\\\"content\\\":\\\"ok\\\"}"));
        assert!(!debug.contains("data: event: status"));
    }
}
