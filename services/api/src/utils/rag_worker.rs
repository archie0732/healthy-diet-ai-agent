use crate::model::{AppState, ENVKey};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use std::{env, path::PathBuf, sync::Arc, time::Duration};
use tracing::{error, info, warn};
use uuid::Uuid;

const STATUS_UPLOADED: &str = "uploaded";
const STATUS_PROCESSING: &str = "processing";
const STATUS_READY: &str = "ready";
const STATUS_FAILED: &str = "failed";

#[derive(Clone, Copy)]
struct WorkerConfig {
    poll_secs: u64,
    batch_size: u32,
    max_retries: u32,
    retry_base_secs: u64,
    max_backoff_secs: u64,
    processing_timeout_secs: u64,
    stuck_batch_size: u32,
}

#[derive(Debug, FromRow)]
struct ClaimedRagJob {
    id: Uuid,
    filename: String,
    storage_path: String,
    mime_type: String,
    size_bytes: i64,
    embedding_model: Option<String>,
}

#[derive(Debug, FromRow)]
struct StuckRagJob {
    id: Uuid,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RagProcessRequest {
    document_id: String,
    filename: String,
    mime_type: String,
    size_bytes: i64,
    storage_path: String,
    absolute_path: String,
    embedding_model: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RagProcessResponse {
    status: Option<String>,
    chunk_count: Option<i32>,
    embedding_model: Option<String>,
    error_message: Option<String>,
}

fn resolve_rag_root() -> PathBuf {
    env::var(ENVKey::RAG_DOCS_ROOT)
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("uploads"))
}

fn resolve_rag_process_url() -> String {
    if let Ok(url) = env::var("RAG_AGENT_PROCESS_URL") {
        return url;
    }

    let base = env::var(ENVKey::AGENT_API_URL).unwrap_or_else(|_| "http://127.0.0.1:8001".into());
    format!("{}/api/rag/process", base.trim_end_matches('/'))
}

fn normalize_status(status: Option<String>) -> &'static str {
    let lower = status.unwrap_or_default().trim().to_lowercase();
    match lower.as_str() {
        STATUS_READY => STATUS_READY,
        STATUS_FAILED => STATUS_FAILED,
        _ => STATUS_FAILED,
    }
}

fn retry_delay_secs(retry_count: i32, base_secs: u64, max_backoff_secs: u64) -> i64 {
    let exp = (retry_count - 1).max(0).min(20) as u32;
    let multiplier = 2_u64.saturating_pow(exp);
    let computed = base_secs.saturating_mul(multiplier);
    computed.min(max_backoff_secs) as i64
}

async fn claim_one_uploaded_job(pool: &PgPool) -> Result<Option<ClaimedRagJob>, sqlx::Error> {
    sqlx::query_as::<_, ClaimedRagJob>(
        r#"
        WITH candidate AS (
            SELECT id
            FROM rag_documents
            WHERE status = 'uploaded'
              AND (next_retry_at IS NULL OR next_retry_at <= now())
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        UPDATE rag_documents r
        SET status = $1,
            processing_started_at = now(),
            next_retry_at = NULL,
            updated_at = now()
        FROM candidate
        WHERE r.id = candidate.id
        RETURNING r.id, r.filename, r.storage_path, r.mime_type, r.size_bytes, r.embedding_model
        "#,
    )
    .bind(STATUS_PROCESSING)
    .fetch_optional(pool)
    .await
}

async fn claim_stuck_jobs(
    pool: &PgPool,
    processing_timeout_secs: u64,
    limit: u32,
) -> Result<Vec<StuckRagJob>, sqlx::Error> {
    sqlx::query_as::<_, StuckRagJob>(
        r#"
        WITH candidate AS (
            SELECT id
            FROM rag_documents
            WHERE status = 'processing'
              AND processing_started_at IS NOT NULL
              AND processing_started_at < now() - make_interval(secs => $1::double precision)
            ORDER BY processing_started_at ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        )
        UPDATE rag_documents r
        SET updated_at = now()
        FROM candidate
        WHERE r.id = candidate.id
        RETURNING r.id
        "#,
    )
    .bind(processing_timeout_secs as f64)
    .bind(limit as i64)
    .fetch_all(pool)
    .await
}

async fn mark_job_ready(
    pool: &PgPool,
    id: Uuid,
    chunk_count: Option<i32>,
    embedding_model: Option<String>,
) {
    if let Err(e) = sqlx::query(
        r#"
        UPDATE rag_documents
        SET status = $1,
            chunk_count = $2,
            embedding_model = COALESCE($3, embedding_model),
            retry_count = 0,
            next_retry_at = NULL,
            processing_started_at = NULL,
            error_message = NULL,
            last_error_at = NULL,
            updated_at = now()
        WHERE id = $4
        "#,
    )
    .bind(STATUS_READY)
    .bind(chunk_count)
    .bind(embedding_model)
    .bind(id)
    .execute(pool)
    .await
    {
        error!("Failed to mark RAG job ready {}: {:?}", id, e);
    }
}

async fn mark_job_failed(pool: &PgPool, id: Uuid, error_message: &str) {
    if let Err(e) = sqlx::query(
        r#"
        UPDATE rag_documents
        SET status = $1,
            next_retry_at = NULL,
            processing_started_at = NULL,
            last_error_at = now(),
            error_message = $2,
            updated_at = now()
        WHERE id = $3
        "#,
    )
    .bind(STATUS_FAILED)
    .bind(error_message)
    .bind(id)
    .execute(pool)
    .await
    {
        error!("Failed to mark RAG job {} as failed: {:?}", id, e);
    }
}

async fn schedule_retry_or_fail(pool: &PgPool, id: Uuid, error_message: &str, cfg: WorkerConfig) {
    let retry_count = sqlx::query_scalar::<_, i32>(
        r#"
        UPDATE rag_documents
        SET retry_count = COALESCE(retry_count, 0) + 1,
            last_error_at = now(),
            error_message = $1,
            processing_started_at = NULL,
            updated_at = now()
        WHERE id = $2
        RETURNING retry_count
        "#,
    )
    .bind(error_message)
    .bind(id)
    .fetch_optional(pool)
    .await;

    let retry_count = match retry_count {
        Ok(Some(v)) => v,
        Ok(None) => return,
        Err(e) => {
            error!("Failed to increase retry_count for RAG job {}: {:?}", id, e);
            return;
        }
    };

    if retry_count <= cfg.max_retries as i32 {
        let delay_secs = retry_delay_secs(retry_count, cfg.retry_base_secs, cfg.max_backoff_secs);
        if let Err(e) = sqlx::query(
            r#"
            UPDATE rag_documents
            SET status = $1,
                next_retry_at = now() + make_interval(secs => $2::double precision),
                updated_at = now()
            WHERE id = $3
            "#,
        )
        .bind(STATUS_UPLOADED)
        .bind(delay_secs as f64)
        .bind(id)
        .execute(pool)
        .await
        {
            error!("Failed to requeue RAG job {}: {:?}", id, e);
            return;
        }
        warn!(
            "RAG job {} failed, scheduled retry #{}/{} in {}s: {}",
            id, retry_count, cfg.max_retries, delay_secs, error_message
        );
    } else {
        mark_job_failed(pool, id, error_message).await;
        warn!(
            "RAG job {} reached max retries ({}) and is marked failed: {}",
            id, cfg.max_retries, error_message
        );
    }
}

async fn process_job(
    pool: &PgPool,
    client: &Client,
    process_url: &str,
    job: ClaimedRagJob,
    cfg: WorkerConfig,
) {
    let full_path = resolve_rag_root().join(&job.storage_path);
    let full_path_exists = tokio::fs::try_exists(&full_path).await.unwrap_or(false);
    if !full_path_exists {
        schedule_retry_or_fail(
            pool,
            job.id,
            &format!("Source file not found: {}", full_path.to_string_lossy()),
            cfg,
        )
        .await;
        return;
    }

    let payload = RagProcessRequest {
        document_id: job.id.to_string(),
        filename: job.filename,
        mime_type: job.mime_type,
        size_bytes: job.size_bytes,
        storage_path: job.storage_path,
        absolute_path: full_path.to_string_lossy().to_string(),
        embedding_model: job.embedding_model,
    };

    info!(
        "RAG worker sending job {} to agent endpoint {}",
        job.id, process_url
    );

    let resp = client
        .post(process_url)
        .timeout(Duration::from_secs(300))
        .json(&payload)
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            schedule_retry_or_fail(
                pool,
                job.id,
                &format!("Request to agent failed: {}", e),
                cfg,
            )
            .await;
            return;
        }
    };

    let http_status = resp.status();
    let resp_text = match resp.text().await {
        Ok(text) => text,
        Err(e) => {
            schedule_retry_or_fail(
                pool,
                job.id,
                &format!("Read agent response failed: {}", e),
                cfg,
            )
            .await;
            return;
        }
    };

    if !http_status.is_success() {
        let error_message = format!("Agent returned {}: {}", http_status.as_u16(), resp_text);
        error!(
            "RAG agent non-success for job {} endpoint {}: {}",
            job.id, process_url, error_message
        );

        if http_status.is_client_error()
            && http_status.as_u16() != 408
            && http_status.as_u16() != 429
        {
            mark_job_failed(pool, job.id, &error_message).await;
        } else {
            schedule_retry_or_fail(pool, job.id, &error_message, cfg).await;
        }
        return;
    }

    let parsed: RagProcessResponse = match serde_json::from_str(&resp_text) {
        Ok(v) => v,
        Err(e) => {
            schedule_retry_or_fail(
                pool,
                job.id,
                &format!("Invalid agent JSON response: {} | body: {}", e, resp_text),
                cfg,
            )
            .await;
            return;
        }
    };

    let status = normalize_status(parsed.status);
    if status == STATUS_READY {
        mark_job_ready(pool, job.id, parsed.chunk_count, parsed.embedding_model).await;
    } else {
        let error_message = parsed
            .error_message
            .unwrap_or_else(|| "Agent returned failed status".to_string());
        schedule_retry_or_fail(pool, job.id, &error_message, cfg).await;
    }
}

async fn recover_stuck_processing_jobs(pool: &PgPool, cfg: WorkerConfig) {
    let stuck_jobs =
        claim_stuck_jobs(pool, cfg.processing_timeout_secs, cfg.stuck_batch_size).await;
    let stuck_jobs = match stuck_jobs {
        Ok(jobs) => jobs,
        Err(e) => {
            error!("RAG worker stuck-jobs claim error: {:?}", e);
            return;
        }
    };

    for job in stuck_jobs {
        schedule_retry_or_fail(
            pool,
            job.id,
            "Processing timeout exceeded. Job requeued.",
            cfg,
        )
        .await;
    }
}

pub fn start_rag_worker(state: Arc<AppState>) {
    let enabled = env::var("RAG_WORKER_ENABLED")
        .map(|v| v != "false" && v != "0")
        .unwrap_or(true);
    if !enabled {
        info!("RAG worker is disabled via RAG_WORKER_ENABLED");
        return;
    }

    let cfg = WorkerConfig {
        poll_secs: env::var("RAG_WORKER_POLL_SECONDS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(5)
            .clamp(1, 60),
        batch_size: env::var("RAG_WORKER_BATCH_SIZE")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(3)
            .clamp(1, 20),
        max_retries: env::var("RAG_WORKER_MAX_RETRIES")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(3)
            .clamp(0, 20),
        retry_base_secs: env::var("RAG_WORKER_RETRY_BASE_SECONDS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(30)
            .clamp(1, 3600),
        max_backoff_secs: env::var("RAG_WORKER_MAX_BACKOFF_SECONDS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(1800)
            .clamp(1, 86400),
        processing_timeout_secs: env::var("RAG_WORKER_PROCESSING_TIMEOUT_SECONDS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(900)
            .clamp(30, 86400),
        stuck_batch_size: env::var("RAG_WORKER_STUCK_BATCH_SIZE")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(20)
            .clamp(1, 100),
    };

    let process_url = resolve_rag_process_url();
    let pool = state.db.clone();

    info!(
        "RAG worker started. poll={}s batch={} max_retries={} retry_base={}s timeout={}s endpoint={}",
        cfg.poll_secs,
        cfg.batch_size,
        cfg.max_retries,
        cfg.retry_base_secs,
        cfg.processing_timeout_secs,
        process_url
    );

    tokio::spawn(async move {
        let client = Client::new();
        loop {
            recover_stuck_processing_jobs(&pool, cfg).await;

            for _ in 0..cfg.batch_size {
                let claimed = claim_one_uploaded_job(&pool).await;
                let Some(job) = (match claimed {
                    Ok(job) => job,
                    Err(e) => {
                        error!("RAG worker claim job DB error: {:?}", e);
                        None
                    }
                }) else {
                    break;
                };

                info!("RAG worker processing job {}", job.id);
                process_job(&pool, &client, &process_url, job, cfg).await;
            }

            tokio::time::sleep(Duration::from_secs(cfg.poll_secs)).await;
        }
    });
}

pub async fn enqueue_rag_document(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        UPDATE rag_documents
        SET status = $1,
            error_message = NULL,
            next_retry_at = NULL,
            processing_started_at = NULL,
            updated_at = now()
        WHERE id = $2
        "#,
    )
    .bind(STATUS_UPLOADED)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}
