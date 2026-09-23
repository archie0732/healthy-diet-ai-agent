use axum::{
    Json,
    extract::{Path, Query},
    http::{HeaderMap, StatusCode, header::AUTHORIZATION},
};
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use tracing::error;

use crate::{api::model::ErrorResponse, model::ENVKey};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsListQuery {
    pub page: Option<usize>,
    pub page_size: Option<usize>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RagSearchGetQuery {
    pub query: String,
    pub top_k: Option<usize>,
    pub force_refresh: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RagSearchRequest {
    pub query: String,
    pub top_k: Option<usize>,
    pub source_types: Option<Vec<String>>,
    pub force_refresh: Option<bool>,
}

fn build_downstream_url(path: &str) -> Result<Url, (StatusCode, Json<ErrorResponse>)> {
    let node_api_base_url = env::var(ENVKey::AGENT_API_URL).map_err(|e| {
        error!("cannot get env value {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Server error".to_string(),
            }),
        )
    })?;

    let mut url = Url::parse(&node_api_base_url).map_err(|e| {
        error!("invalid AGENT_API_URL: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Server error".to_string(),
            }),
        )
    })?;
    url.set_path(path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn with_authorization(
    mut request: reqwest::RequestBuilder,
    headers: &HeaderMap,
) -> reqwest::RequestBuilder {
    if let Some(auth_value) = headers.get(AUTHORIZATION) {
        if let Ok(auth_str) = auth_value.to_str() {
            request = request.header(AUTHORIZATION.as_str(), auth_str);
        }
    }
    request
}

async fn send_json_request(
    headers: &HeaderMap,
    method: Method,
    path: &str,
    query: Option<Vec<(&str, String)>>,
    body: Option<Value>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    let client = Client::new();
    let mut url = build_downstream_url(path)?;

    if let Some(query_pairs) = query {
        let mut serializer = url.query_pairs_mut();
        for (key, value) in query_pairs {
            serializer.append_pair(key, &value);
        }
        drop(serializer);
    }

    let mut request = client.request(method, url);
    if let Some(payload) = body {
        request = request.json(&payload);
    }
    request = with_authorization(request, headers);

    let response = request.send().await.map_err(|e| {
        error!("downstream request failed: {:?}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: "Downstream service request failed".to_string(),
            }),
        )
    })?;

    let status = response.status();
    let response_text = response.text().await.map_err(|e| {
        error!("read downstream response failed: {:?}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: "Cannot read downstream response".to_string(),
            }),
        )
    })?;

    let response_json = serde_json::from_str::<Value>(&response_text).map_err(|e| {
        error!(
            "downstream response is not valid JSON: {:?}, body: {}",
            e, response_text
        );
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: "Downstream service returned invalid JSON".to_string(),
            }),
        )
    })?;

    Ok((status, Json(response_json)))
}

pub async fn news_sync_handler(
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    send_json_request(&headers, Method::POST, "/api/news/sync", None, None).await
}

pub async fn news_list_handler(
    headers: HeaderMap,
    Query(query): Query<NewsListQuery>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    let mut query_pairs = Vec::new();
    if let Some(page) = query.page {
        query_pairs.push(("page", page.to_string()));
    }
    if let Some(page_size) = query.page_size {
        query_pairs.push(("pageSize", page_size.to_string()));
    }

    send_json_request(&headers, Method::GET, "/api/news", Some(query_pairs), None).await
}

pub async fn news_detail_handler(
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    send_json_request(
        &headers,
        Method::GET,
        &format!("/api/news/{id}"),
        None,
        None,
    )
    .await
}

pub async fn news_files_handler(
    headers: HeaderMap,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    send_json_request(&headers, Method::GET, "/api/news-files", None, None).await
}

pub async fn rag_search_get_handler(
    headers: HeaderMap,
    Query(query): Query<RagSearchGetQuery>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    let mut query_pairs = vec![("query", query.query)];
    if let Some(top_k) = query.top_k {
        query_pairs.push(("top_k", top_k.to_string()));
    }
    if let Some(force_refresh) = query.force_refresh {
        query_pairs.push(("force_refresh", force_refresh.to_string()));
    }

    send_json_request(
        &headers,
        Method::GET,
        "/api/rag/search",
        Some(query_pairs),
        None,
    )
    .await
}

pub async fn rag_search_post_handler(
    headers: HeaderMap,
    Json(payload): Json<RagSearchRequest>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    let body = serde_json::to_value(payload).map_err(|e| {
        error!("serialize rag search payload failed: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Server error".to_string(),
            }),
        )
    })?;

    send_json_request(&headers, Method::POST, "/api/rag/search", None, Some(body)).await
}
