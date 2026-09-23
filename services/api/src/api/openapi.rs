use axum::{
    http::{HeaderValue, StatusCode, header::CONTENT_TYPE},
    response::{IntoResponse, Response},
};

const OPENAPI_YAML: &str = include_str!("../../openapi.yml");

pub async fn openapi_yaml_handler() -> Response {
    (
        StatusCode::OK,
        [(
            CONTENT_TYPE,
            HeaderValue::from_static("application/yaml; charset=utf-8"),
        )],
        OPENAPI_YAML,
    )
        .into_response()
}
