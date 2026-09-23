use crate::{api::model::ErrorResponse, model::ENVKey, utils::jwt::AuthUser};
use axum::{
    Json,
    body::Body,
    extract::{Path, Query},
    http::{
        HeaderMap, StatusCode,
        header::{AUTHORIZATION, CONTENT_DISPOSITION, CONTENT_TYPE},
    },
    response::Response,
};
use axum_extra::extract::Multipart;
use reqwest::{
    Client, Method, Url,
    multipart::{Form, Part},
};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::env;
use tracing::error;
use uuid::Uuid;

const ADMIN_USER_ID_HEADER: &str = "X-Admin-User-Id";
const ADMIN_ROLE_HEADER: &str = "X-Admin-Role";

#[derive(Debug, Deserialize)]
pub struct RagDocumentsQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

fn internal_server_error() -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            error: "Server error".to_string(),
        }),
    )
}

fn build_downstream_url(path: &str) -> Result<Url, (StatusCode, Json<ErrorResponse>)> {
    let node_api_base_url = env::var(ENVKey::AGENT_API_URL).map_err(|e| {
        error!("cannot get env value {:?}", e);
        internal_server_error()
    })?;

    let mut url = Url::parse(&node_api_base_url).map_err(|e| {
        error!("invalid AGENT_API_URL: {}", e);
        internal_server_error()
    })?;
    url.set_path(path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn with_forward_headers(
    mut request: reqwest::RequestBuilder,
    headers: &HeaderMap,
    admin_user: Option<&AuthUser>,
) -> reqwest::RequestBuilder {
    if let Some(auth_value) = headers.get(AUTHORIZATION) {
        if let Ok(auth_str) = auth_value.to_str() {
            request = request.header(AUTHORIZATION.as_str(), auth_str);
        }
    }

    if let Some(admin_user) = admin_user {
        request = request
            .header(ADMIN_USER_ID_HEADER, admin_user.user_id.to_string())
            .header(ADMIN_ROLE_HEADER, admin_user.role.as_str());
    }

    request
}

async fn read_json_response(
    response: reqwest::Response,
) -> Result<(StatusCode, Value), (StatusCode, Json<ErrorResponse>)> {
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

    if response_text.trim().is_empty() {
        return Ok((status, Value::Object(Map::new())));
    }

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

    Ok((status, response_json))
}

pub(crate) async fn send_json_request(
    headers: &HeaderMap,
    admin_user: Option<&AuthUser>,
    method: Method,
    path: &str,
    query: Option<Vec<(&str, String)>>,
    body: Option<Value>,
) -> Result<(StatusCode, Value), (StatusCode, Json<ErrorResponse>)> {
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
    request = with_forward_headers(request, headers, admin_user);

    let response = request.send().await.map_err(|e| {
        error!("downstream request failed: {:?}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: "Downstream service request failed".to_string(),
            }),
        )
    })?;

    read_json_response(response).await
}

async fn send_multipart_request(
    headers: &HeaderMap,
    admin_user: &AuthUser,
    path: &str,
    form: Form,
) -> Result<(StatusCode, Value), (StatusCode, Json<ErrorResponse>)> {
    let client = Client::new();
    let url = build_downstream_url(path)?;

    let request = with_forward_headers(client.post(url).multipart(form), headers, Some(admin_user));

    let response = request.send().await.map_err(|e| {
        error!("downstream multipart request failed: {:?}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: "Downstream service request failed".to_string(),
            }),
        )
    })?;

    read_json_response(response).await
}

async fn send_binary_request(
    headers: &HeaderMap,
    admin_user: Option<&AuthUser>,
    path: &str,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    let client = Client::new();
    let url = build_downstream_url(path)?;
    let request = with_forward_headers(client.get(url), headers, admin_user);

    let response = request.send().await.map_err(|e| {
        error!("downstream binary request failed: {:?}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: "Downstream service request failed".to_string(),
            }),
        )
    })?;

    let status = response.status();
    let downstream_headers = response.headers().clone();
    let body = response.bytes().await.map_err(|e| {
        error!("read downstream binary response failed: {:?}", e);
        (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: "Cannot read downstream response".to_string(),
            }),
        )
    })?;

    let mut proxied_response = Response::new(Body::from(body));
    *proxied_response.status_mut() = status;

    if let Some(content_type) = downstream_headers.get(CONTENT_TYPE).cloned() {
        proxied_response
            .headers_mut()
            .insert(CONTENT_TYPE, content_type);
    }
    if let Some(content_disposition) = downstream_headers.get(CONTENT_DISPOSITION).cloned() {
        proxied_response
            .headers_mut()
            .insert(CONTENT_DISPOSITION, content_disposition);
    }

    Ok(proxied_response)
}

fn extract_document_id(value: &Value) -> Option<&str> {
    value
        .get("id")
        .and_then(Value::as_str)
        .or_else(|| value.get("documentId").and_then(Value::as_str))
}

fn rewrite_admin_document_urls(value: &mut Value) {
    let Some(document_id) = extract_document_id(value).map(str::to_string) else {
        return;
    };
    let Some(object) = value.as_object_mut() else {
        return;
    };

    object.insert(
        "fileUrl".to_string(),
        Value::String(format!("/admin/rag/documents/{document_id}/file")),
    );
    object.insert(
        "previewUrl".to_string(),
        Value::String(format!("/admin/rag/documents/{document_id}/preview")),
    );
}

fn rewrite_public_source_urls(value: &mut Value) {
    let Some(document_id) = extract_document_id(value).map(str::to_string) else {
        return;
    };
    let Some(object) = value.as_object_mut() else {
        return;
    };

    object.insert(
        "fileUrl".to_string(),
        Value::String(format!("/rag/sources/{document_id}/file")),
    );
    object.insert(
        "previewUrl".to_string(),
        Value::String(format!("/rag/sources/{document_id}/preview")),
    );
}

fn normalize_item_response(mut value: Value) -> Value {
    if let Some(item) = value.get("item").cloned() {
        value = item;
    }
    rewrite_admin_document_urls(&mut value);
    value
}

fn normalize_list_response(mut value: Value) -> Value {
    if let Some(items) = value.get("items").cloned() {
        value = items;
    }

    if let Some(items) = value.as_array_mut() {
        for item in items {
            rewrite_admin_document_urls(item);
        }
    }

    value
}

fn normalize_preview_response(mut value: Value, is_public: bool) -> Value {
    if let Some(item) = value.get("item").cloned() {
        value = item;
    }

    if is_public {
        rewrite_public_source_urls(&mut value);
    } else {
        rewrite_admin_document_urls(&mut value);
    }

    value
}

pub async fn admin_rag_documents_handler(
    admin_user: AuthUser,
    headers: HeaderMap,
    Query(params): Query<RagDocumentsQuery>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    let mut query_pairs = Vec::new();
    if let Some(limit) = params.limit {
        query_pairs.push(("limit", limit.clamp(1, 200).to_string()));
    }
    if let Some(offset) = params.offset {
        query_pairs.push(("offset", offset.max(0).to_string()));
    }

    let (status, payload) = send_json_request(
        &headers,
        Some(&admin_user),
        Method::GET,
        "/api/rag/documents",
        Some(query_pairs),
        None,
    )
    .await?;

    Ok((status, Json(normalize_list_response(payload))))
}

pub async fn admin_rag_document_detail_handler(
    admin_user: AuthUser,
    headers: HeaderMap,
    Path(document_id): Path<Uuid>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    let (status, payload) = send_json_request(
        &headers,
        Some(&admin_user),
        Method::GET,
        &format!("/api/rag/documents/{document_id}"),
        None,
        None,
    )
    .await?;

    Ok((status, Json(normalize_item_response(payload))))
}

pub async fn admin_rag_upload_handler(
    admin_user: AuthUser,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    let mut form = Form::new();
    let mut has_file = false;
    let mut has_uploaded_by = false;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Invalid multipart payload: {}", e),
            }),
        )
    })? {
        let field_name = field.name().unwrap_or_default().to_string();
        if field_name.is_empty() {
            continue;
        }

        if field_name == "uploadedBy" {
            has_uploaded_by = true;
        }

        if let Some(file_name) = field.file_name().map(|name| name.to_string()) {
            let content_type = field.content_type().map(|mime| mime.to_string());
            let bytes = field.bytes().await.map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("Unable to read upload file: {}", e),
                    }),
                )
            })?;

            let mut part = Part::bytes(bytes.to_vec()).file_name(file_name);
            if let Some(mime) = content_type {
                part = part.mime_str(&mime).map_err(|e| {
                    (
                        StatusCode::BAD_REQUEST,
                        Json(ErrorResponse {
                            error: format!("Invalid upload content type: {}", e),
                        }),
                    )
                })?;
            }

            form = form.part(field_name, part);
            has_file = true;
        } else {
            let text = field.text().await.map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("Invalid multipart field: {}", e),
                    }),
                )
            })?;

            form = form.text(field_name, text);
        }
    }

    if !has_file {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Missing file field".to_string(),
            }),
        ));
    }

    if !has_uploaded_by {
        form = form.text("uploadedBy", admin_user.user_id.to_string());
    }

    let (status, payload) =
        send_multipart_request(&headers, &admin_user, "/api/rag/documents", form).await?;

    Ok((status, Json(normalize_item_response(payload))))
}

pub async fn admin_rag_reindex_handler(
    admin_user: AuthUser,
    headers: HeaderMap,
    Path(document_id): Path<Uuid>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    let (status, payload) = send_json_request(
        &headers,
        Some(&admin_user),
        Method::POST,
        &format!("/api/rag/documents/{document_id}/reindex"),
        None,
        None,
    )
    .await?;

    Ok((status, Json(normalize_item_response(payload))))
}

pub async fn admin_rag_delete_handler(
    admin_user: AuthUser,
    headers: HeaderMap,
    Path(document_id): Path<Uuid>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    let (status, payload) = send_json_request(
        &headers,
        Some(&admin_user),
        Method::DELETE,
        &format!("/api/rag/documents/{document_id}"),
        None,
        None,
    )
    .await?;

    Ok((status, Json(normalize_item_response(payload))))
}

pub async fn admin_rag_document_file_handler(
    admin_user: AuthUser,
    headers: HeaderMap,
    Path(document_id): Path<Uuid>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    send_binary_request(
        &headers,
        Some(&admin_user),
        &format!("/api/rag/documents/{document_id}/file"),
    )
    .await
}

pub async fn public_rag_document_file_handler(
    headers: HeaderMap,
    Path(document_id): Path<Uuid>,
) -> Result<Response, (StatusCode, Json<ErrorResponse>)> {
    send_binary_request(
        &headers,
        None,
        &format!("/api/rag/sources/{document_id}/file"),
    )
    .await
}

pub async fn admin_rag_document_preview_handler(
    admin_user: AuthUser,
    headers: HeaderMap,
    Path(document_id): Path<Uuid>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    let (status, payload) = send_json_request(
        &headers,
        Some(&admin_user),
        Method::GET,
        &format!("/api/rag/documents/{document_id}/preview"),
        None,
        None,
    )
    .await?;

    Ok((status, Json(normalize_preview_response(payload, false))))
}

pub async fn public_rag_document_preview_handler(
    headers: HeaderMap,
    Path(document_id): Path<Uuid>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<ErrorResponse>)> {
    let (status, payload) = send_json_request(
        &headers,
        None,
        Method::GET,
        &format!("/api/rag/sources/{document_id}/preview"),
        None,
        None,
    )
    .await?;

    Ok((status, Json(normalize_preview_response(payload, true))))
}
