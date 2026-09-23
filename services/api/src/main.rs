use healthy_diet_api_server::{
    model::{AppState, ENVKey},
    router::create_app,
    utils::rag_worker::start_rag_worker,
};
use sqlx::postgres::PgPoolOptions;
use std::fs;
use std::{env, net::SocketAddr, sync::Arc, time::Duration};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

const DEFAULT_LOG_FILTER: &str = "info,sqlx=warn,sqlx::query=off";

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let log_filter = env::var("RUST_LOG")
        .map(|value| format!("{value},sqlx=warn,sqlx::query=off"))
        .unwrap_or_else(|_| DEFAULT_LOG_FILTER.to_string());

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_new(log_filter)
                .unwrap_or_else(|_| DEFAULT_LOG_FILTER.into()),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .compact()
                .with_target(false)
                .with_thread_ids(false)
                .with_thread_names(false)
                .with_file(false)
                .with_line_number(false),
        )
        .init();

    let database_url = env::var(ENVKey::DATABASE_URL).expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(30))
        .idle_timeout(Duration::from_secs(60))
        .max_lifetime(Duration::from_secs(1800))
        .connect(&database_url)
        .await
        .expect("Failed to connect to DB");

    let config_str = fs::read_to_string("AIPrompt.json").expect("Lost AIPrompt.json");
    let ai_prompt_config: serde_json::Value =
        serde_json::from_str(&config_str).expect("JSON Formating Error");
    let app_state = Arc::new(AppState {
        db: pool,
        ai_prompt_config,
    });
    start_rag_worker(app_state.clone());

    let app = create_app(app_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!("[Healthy-Diet-API] Start Server http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("End System...");
}
