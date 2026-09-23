use crate::{
    api::{
        admin::{
            admin_announcements_handler, admin_me_handler, admin_route_controls_handler,
            admin_user_detail_handler, admin_users_handler, archive_announcement_handler,
            create_agent_admin_token_handler, create_announcement_handler,
            publish_announcement_handler, update_announcement_handler,
            update_route_control_handler,
        },
        agent_approve::approve_agent,
        agent_content::{
            news_detail_handler, news_files_handler, news_list_handler, news_sync_handler,
            rag_search_get_handler, rag_search_post_handler,
        },
        announcement::current_announcement_handler,
        chat::{chat_check_handler, chat_handler},
        chat_room::{
            get_chat_room_titles_handler, get_chat_rooms_handler,
            get_room_history_by_index_handler, get_room_history_handler,
        },
        diet::yolo_handler,
        diet_image::diet_image_handler,
        diet_record::diet_records_handler,
        gemma4::gemma4_health_handler,
        health::healthy_server_handler,
        knowledge_graph::{
            admin_knowledge_graph_document_detail_handler, admin_knowledge_graph_extract_handler,
            admin_knowledge_graph_rebuild_handler, knowledge_graph_node_detail_handler,
            knowledge_graph_nodes_handler, knowledge_graph_query_handler,
            knowledge_graph_relation_evidence_handler, knowledge_graph_status_handler,
        },
        login::{admin_login_handler, login_handler},
        openapi::openapi_yaml_handler,
        ping::ping_handler,
        rag_document::{
            admin_rag_delete_handler, admin_rag_document_detail_handler,
            admin_rag_document_file_handler, admin_rag_document_preview_handler,
            admin_rag_documents_handler, admin_rag_reindex_handler, admin_rag_upload_handler,
            public_rag_document_file_handler, public_rag_document_preview_handler,
        },
        record::{record_visit_handler, weekly_stats_handler},
        refresh::refresh_handler,
        register::register_handler,
        user::{get_profile_handler, update_user_profile_handler},
    },
    discord::login::{discord_callback, login_discord},
    model::{APIRouter, AppState, ENVKey},
    utils::jwt::require_admin_middleware,
    utils::route_control::{RouteControlGuardState, require_route_enabled_middleware},
};
use axum::{
    Router,
    extract::{DefaultBodyLimit, MatchedPath},
    http::{HeaderValue, Method, Request, header},
    middleware,
    response::Response,
    routing::{get, post},
};
use std::{env, sync::Arc, time::Duration};
use tower_http::{
    cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer},
    trace::TraceLayer,
};
use tracing::{Span, field::Empty};

pub fn create_app(state: Arc<AppState>) -> Router {
    let admin_router = Router::new()
        .route(APIRouter::ADMIN_ME, get(admin_me_handler))
        .route(
            APIRouter::ADMIN_AGENT_TOKEN,
            post(create_agent_admin_token_handler),
        )
        .route(APIRouter::ADMIN_USERS, get(admin_users_handler))
        .route(APIRouter::ADMIN_USER_DETAIL, get(admin_user_detail_handler))
        .route(
            APIRouter::ADMIN_ROUTE_CONTROLS,
            get(admin_route_controls_handler),
        )
        .route(
            APIRouter::ADMIN_ROUTE_CONTROL_DETAIL,
            axum::routing::patch(update_route_control_handler),
        )
        .route(
            APIRouter::ADMIN_ANNOUNCEMENTS,
            get(admin_announcements_handler).post(create_announcement_handler),
        )
        .route(
            APIRouter::ADMIN_ANNOUNCEMENT_DETAIL,
            axum::routing::patch(update_announcement_handler),
        )
        .route(
            APIRouter::ADMIN_ANNOUNCEMENT_PUBLISH,
            post(publish_announcement_handler),
        )
        .route(
            APIRouter::ADMIN_ANNOUNCEMENT_ARCHIVE,
            post(archive_announcement_handler),
        )
        .route_layer(middleware::from_fn(require_admin_middleware));

    let rag_admin_router = Router::new()
        .route(
            APIRouter::ADMIN_RAG_DOCUMENTS,
            get(admin_rag_documents_handler).post(admin_rag_upload_handler),
        )
        .route(
            APIRouter::ADMIN_RAG_DOCUMENT_DETAIL,
            get(admin_rag_document_detail_handler).delete(admin_rag_delete_handler),
        )
        .route(
            APIRouter::ADMIN_RAG_DOCUMENT_REINDEX,
            post(admin_rag_reindex_handler),
        )
        .route(
            APIRouter::ADMIN_RAG_DOCUMENT_FILE,
            get(admin_rag_document_file_handler),
        )
        .route(
            APIRouter::ADMIN_RAG_DOCUMENT_PREVIEW,
            get(admin_rag_document_preview_handler),
        )
        .route(
            APIRouter::ADMIN_KNOWLEDGE_GRAPH_REBUILD,
            post(admin_knowledge_graph_rebuild_handler),
        )
        .route(
            APIRouter::ADMIN_KNOWLEDGE_GRAPH_DOCUMENT_DETAIL,
            get(admin_knowledge_graph_document_detail_handler),
        )
        .route(
            APIRouter::ADMIN_KNOWLEDGE_GRAPH_DOCUMENT_EXTRACT,
            post(admin_knowledge_graph_extract_handler),
        )
        .route_layer(middleware::from_fn(require_admin_middleware));

    Router::new()
        .route("/", get(async || "Connect Success!"))
        .route("/openapi.yml", get(openapi_yaml_handler))
        .route("/ping", get(ping_handler))
        .route(APIRouter::HEALTH, get(healthy_server_handler))
        .route(APIRouter::DISOCRD_LOGIN, get(login_discord))
        .route(APIRouter::DISOCRD_CALLBACK, get(discord_callback))
        .route(APIRouter::REGISTER, post(register_handler))
        .route(APIRouter::LOGIN, post(login_handler))
        .route(APIRouter::ADMIN_LOGIN, post(admin_login_handler))
        .route(APIRouter::REFRESH_TOKEN, post(refresh_handler))
        .route(
            APIRouter::PROFILE,
            get(get_profile_handler).put(update_user_profile_handler),
        )
        .route(
            APIRouter::DIET,
            post(yolo_handler).route_layer(middleware::from_fn_with_state(
                RouteControlGuardState {
                    app_state: state.clone(),
                    route_key: "diet",
                },
                require_route_enabled_middleware,
            )),
        )
        .route(APIRouter::DIET_RECORD, get(diet_records_handler))
        .route(
            APIRouter::DIET_IMAGE,
            post(diet_image_handler).route_layer(middleware::from_fn_with_state(
                RouteControlGuardState {
                    app_state: state.clone(),
                    route_key: "diet_image",
                },
                require_route_enabled_middleware,
            )),
        )
        .route(APIRouter::MONTH_STATS, get(weekly_stats_handler))
        .route(APIRouter::GEMMA4_HEALTH, get(gemma4_health_handler))
        .route(APIRouter::RECORD, post(record_visit_handler))
        .route(APIRouter::NEWS_SYNC, post(news_sync_handler))
        .route(APIRouter::NEWS, get(news_list_handler))
        .route(APIRouter::NEWS_DETAIL, get(news_detail_handler))
        .route(APIRouter::NEWS_FILES, get(news_files_handler))
        .route(
            APIRouter::RAG_SEARCH,
            get(rag_search_get_handler).post(rag_search_post_handler),
        )
        .route(
            APIRouter::KNOWLEDGE_GRAPH_STATUS,
            get(knowledge_graph_status_handler),
        )
        .route(
            APIRouter::KNOWLEDGE_GRAPH_NODES,
            get(knowledge_graph_nodes_handler),
        )
        .route(
            APIRouter::KNOWLEDGE_GRAPH_QUERY,
            post(knowledge_graph_query_handler),
        )
        .route(
            APIRouter::KNOWLEDGE_GRAPH_NODE_DETAIL,
            get(knowledge_graph_node_detail_handler),
        )
        .route(
            APIRouter::KNOWLEDGE_GRAPH_RELATION_EVIDENCE,
            get(knowledge_graph_relation_evidence_handler),
        )
        .route(
            APIRouter::CHAT,
            post(chat_handler).route_layer(middleware::from_fn_with_state(
                RouteControlGuardState {
                    app_state: state.clone(),
                    route_key: "proxy_chat",
                },
                require_route_enabled_middleware,
            )),
        )
        .route(APIRouter::CHAT_CHECK, get(chat_check_handler))
        .route(
            APIRouter::RAG_SOURCE_FILE,
            get(public_rag_document_file_handler),
        )
        .route(
            APIRouter::RAG_SOURCE_PREVIEW,
            get(public_rag_document_preview_handler),
        )
        .route(
            APIRouter::ANNOUNCEMENTS_CURRENT,
            get(current_announcement_handler),
        )
        .route(APIRouter::AGENT_APPROVE, post(approve_agent))
        .route(APIRouter::CHAT_ROOM, get(get_chat_rooms_handler))
        .route(
            APIRouter::CHAT_ROOM_TITLES,
            get(get_chat_room_titles_handler),
        )
        .route(APIRouter::ROOM_HOSTROY, get(get_room_history_handler))
        .route(
            APIRouter::ROOM_HISTORY_BY_INDEX,
            get(get_room_history_by_index_handler),
        )
        .merge(rag_admin_router)
        .nest(APIRouter::ADMIN, admin_router)
        .layer(DefaultBodyLimit::max(25 * 1024 * 1024))
        .layer(build_cors_layer())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &Request<_>| {
                    let matched_path = request
                        .extensions()
                        .get::<MatchedPath>()
                        .map(MatchedPath::as_str)
                        .unwrap_or("-");

                    tracing::info_span!(
                        "http_request",
                        method = %request.method(),
                        route = matched_path,
                        path = %request.uri().path(),
                        status = Empty,
                    )
                })
                .on_request(|_request: &Request<_>, span: &Span| {
                    tracing::info!(parent: span, "request started");
                })
                .on_response(|response: &Response, latency: Duration, span: &Span| {
                    let status = response.status().as_u16();
                    span.record("status", status);

                    let latency_ms = latency.as_millis();

                    if response.status().is_server_error() {
                        tracing::error!(
                            parent: span,
                            latency_ms,
                            "request completed with server error"
                        );
                    } else if response.status().is_client_error() {
                        tracing::warn!(
                            parent: span,
                            latency_ms,
                            "request completed with client error"
                        );
                    } else {
                        tracing::info!(parent: span, latency_ms, "request completed");
                    }
                })
                .on_failure(|failure_class, latency: Duration, span: &Span| {
                    tracing::error!(
                        parent: span,
                        latency_ms = latency.as_millis(),
                        error = %failure_class,
                        "request failed"
                    );
                }),
        )
        .with_state(state)
}

fn build_cors_layer() -> CorsLayer {
    let allowed_origins = env::var(ENVKey::CORS_ALLOWED_ORIGINS)
        .ok()
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|origin| !origin.is_empty())
                .map(|origin| {
                    HeaderValue::from_str(origin)
                        .unwrap_or_else(|_| panic!("invalid CORS origin configured: {origin}"))
                })
                .collect::<Vec<_>>()
        })
        .filter(|origins| !origins.is_empty())
        .unwrap_or_else(|| {
            vec![
                HeaderValue::from_static("https://healthy-diet-web.vercel.app"),
                HeaderValue::from_static("http://localhost:5173"),
                HeaderValue::from_static("http://127.0.0.1:5173"),
            ]
        });

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_methods(AllowMethods::list([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ]))
        .allow_headers(AllowHeaders::list([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::ACCEPT,
        ]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Method, Request, StatusCode, header},
    };
    use serde_json::json;
    use sqlx::postgres::PgPoolOptions;
    use std::fs;
    use tower::util::ServiceExt;

    fn test_app() -> Router {
        let db = PgPoolOptions::new()
            .connect_lazy("postgres://postgres:postgres@127.0.0.1:5432/healthy_diet_test")
            .expect("lazy pool should be created");

        let state = Arc::new(AppState {
            db,
            ai_prompt_config: json!({}),
        });

        create_app(state)
    }

    #[tokio::test]
    async fn documented_runtime_routes_exist() {
        let app = test_app();

        let chat_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/chat")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(chat_response.status(), StatusCode::METHOD_NOT_ALLOWED);

        let consult_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/consult")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(consult_response.status(), StatusCode::NOT_FOUND);

        let approve_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/approve")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(approve_response.status(), StatusCode::METHOD_NOT_ALLOWED);

        let chat_check_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/chat_check")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(chat_check_response.status(), StatusCode::METHOD_NOT_ALLOWED);

        let announcements_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/announcements/current")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            announcements_response.status(),
            StatusCode::METHOD_NOT_ALLOWED
        );

        let admin_login_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/auth/admin/login")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            admin_login_response.status(),
            StatusCode::METHOD_NOT_ALLOWED
        );

        let admin_me_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/admin/me")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_ne!(admin_me_response.status(), StatusCode::NOT_FOUND);

        let gemma_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/gemma4/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(gemma_response.status(), StatusCode::METHOD_NOT_ALLOWED);

        let openapi_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/openapi.yml")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(openapi_response.status(), StatusCode::OK);
        assert_eq!(
            openapi_response
                .headers()
                .get(axum::http::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("application/yaml; charset=utf-8")
        );

        let knowledge_graph_status_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/knowledge-graph/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            knowledge_graph_status_response.status(),
            StatusCode::METHOD_NOT_ALLOWED
        );

        let knowledge_graph_nodes_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/knowledge-graph/nodes")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            knowledge_graph_nodes_response.status(),
            StatusCode::METHOD_NOT_ALLOWED
        );

        let admin_knowledge_graph_rebuild_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/admin/knowledge-graph/rebuild")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            admin_knowledge_graph_rebuild_response.status(),
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn cors_preflight_allows_frontend_origin_for_login() {
        let app = test_app();

        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::OPTIONS)
                    .uri("/auth/login")
                    .header(header::ORIGIN, "https://healthy-diet-web.vercel.app")
                    .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
                    .header(
                        header::ACCESS_CONTROL_REQUEST_HEADERS,
                        "content-type,authorization,accept",
                    )
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .and_then(|value| value.to_str().ok()),
            Some("https://healthy-diet-web.vercel.app")
        );
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_METHODS)
                .and_then(|value| value.to_str().ok()),
            Some("GET,POST,PUT,PATCH,DELETE,OPTIONS")
        );

        let allow_headers = response
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_HEADERS)
            .and_then(|value| value.to_str().ok())
            .expect("preflight should include allow headers");
        assert!(allow_headers.contains("content-type"));
        assert!(allow_headers.contains("authorization"));
        assert!(allow_headers.contains("accept"));
    }

    #[test]
    fn openapi_documents_actual_runtime_routes() {
        let openapi = fs::read_to_string("openapi.yml").expect("openapi.yml should be readable");

        for path in [
            "/auth/admin/login",
            "/api/auth/refresh",
            "/admin/me",
            "/api/gemma4/health",
            "/openapi.yml",
            "/api/chat",
            "/api/chat_check",
            "/api/approve",
            "/api/announcements/current",
            "/api/news",
            "/api/news/sync",
            "/api/rag/search",
            "/admin/rag/documents",
            "/api/rag/sources/{document_id}/file",
            "/api/knowledge-graph/status",
            "/api/knowledge-graph/nodes",
            "/api/knowledge-graph/query",
            "/api/admin/knowledge-graph/rebuild",
            "/api/admin/knowledge-graph/documents/{document_id}",
        ] {
            assert!(
                openapi.contains(path),
                "expected openapi.yml to document {path}"
            );
        }

        assert!(
            openapi.contains("name: document_id"),
            "expected openapi.yml to use document_id path parameters"
        );

        for stale_path in [
            "/api/consult",
            "/chat",
            "/chat_check",
            "/approve",
            "/announcements/current",
            "/auth/refresh",
            "/gemma4/health",
            "/news",
            "/news/sync",
            "/rag/search",
            "/api/admin/rag/documents",
            "/rag/sources/{document_id}/file",
        ] {
            assert!(
                !openapi.contains(stale_path),
                "did not expect openapi.yml to document stale alias {stale_path}"
            );
        }
    }

    #[test]
    fn knowledge_graph_routes_are_documented_in_route_matrix() {
        let route_matrix = fs::read_to_string("docs/api_route_matrix.md")
            .expect("docs/api_route_matrix.md should be readable");

        for path in [
            "/api/knowledge-graph/status",
            "/api/knowledge-graph/nodes",
            "/api/knowledge-graph/query",
            "/api/admin/knowledge-graph/rebuild",
            "/api/admin/knowledge-graph/documents/{document_id}",
            "/api/admin/knowledge-graph/documents/{document_id}/extract",
        ] {
            assert!(
                route_matrix.contains(path),
                "expected docs/api_route_matrix.md to document {path}"
            );
        }
    }
}
