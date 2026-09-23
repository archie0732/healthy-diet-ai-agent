use axum::{Json, extract::State, http::StatusCode};
use axum_extra::extract::Multipart;
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{env, fs, process::Command, sync::Arc};
use tracing::error;
use uuid::Uuid;

use crate::{
    api::model::ErrorResponse,
    model::{AppState, ENVKey, OutSideURL},
    utils::jwt::AuthUser,
};

#[derive(Deserialize, Debug)]
pub struct YoloScriptOutput {
    pub status: String,
    pub image_path: String,
    pub json_path: String,
    pub detections: Vec<Detection>,
}

#[derive(Deserialize, Debug)]
pub struct Detection {
    #[serde(rename = "class")]
    pub class_name: String,
    pub confidence: f64,
    pub bbox: [f64; 4], // [x_min, y_min, x_max, y_max]
}

#[derive(Serialize)]
pub struct CalorieResponse {
    pub message: String,
    pub total_calories: f64,
    pub detected_items: Vec<FoodItem>,
    pub image_base64: Option<String>,
    pub ai_score: i32,
    pub ai_comment: String,
}

#[derive(Serialize)]
pub struct FoodItem {
    pub class: String,
    pub confidence: f64,
    pub estimated_weight_g: f64,
    pub calories: f64,
}

#[derive(Deserialize, Debug)]
struct AiEvaluationFormat {
    score: i32,
    comment: String,
}

pub async fn yolo_handler(
    auth_user: AuthUser,
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<CalorieResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_profile = sqlx::query!(
        "SELECT nickname, height, weight, age, gender, taboo, disease FROM users WHERE id = $1",
        auth_user.user_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("DB 錯誤: {:?}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "資料庫連線錯誤".into(),
            }),
        )
    })?
    .ok_or((
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "找不到使用者".into(),
        }),
    ))?;

    let mut image_data = None;
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("讀取欄位失敗: {}", e),
            }),
        )
    })? {
        if field.name() == Some("image") {
            image_data = Some(field.bytes().await.map_err(|_| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: "無法讀取圖片數據".into(),
                    }),
                )
            })?);
            break;
        }
    }

    let data = image_data.ok_or((
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            error: "請上傳圖片".into(),
        }),
    ))?;
    let file_id = Uuid::new_v4().to_string();
    let input_path = format!("/app/uploads/{}.jpg", file_id);

    fs::create_dir_all("/app/uploads").ok();
    fs::write(&input_path, data).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "伺服器儲存檔案失敗".into(),
            }),
        )
    })?;

    let yolo_script = env::var("YOLO_SCRIPT_PATH")
        .unwrap_or_else(|_| "../healthy-diet-yolo/predict.py".to_string());
    let output = Command::new("python3")
        .arg(&yolo_script)
        .arg("--input")
        .arg(&input_path)
        .output()
        .map_err(|e| {
            error!("YOLO CLI 執行錯誤: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "辨識引擎啟動失敗".into(),
                }),
            )
        })?;

    if !output.status.success() {
        let stderror = String::from_utf8_lossy(&output.stderr);
        error!("!辨識過程出錯: {:?}", stderror);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "YOLO 辨識過程出現錯誤".into(),
            }),
        ));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let json_start = stdout_str.find('{').unwrap_or(0);
    let json_end = stdout_str
        .rfind('}')
        .unwrap_or(stdout_str.len().saturating_sub(1))
        + 1;
    let clean_json = if json_start < json_end {
        &stdout_str[json_start..json_end]
    } else {
        "{}"
    };

    let yolo_result: YoloScriptOutput = serde_json::from_str(clean_json).map_err(|e| {
        error!("解析 YOLO 失敗: {}, 原始輸出: {}", e, stdout_str);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "解析辨識結果失敗".into(),
            }),
        )
    })?;

    let mut total_calories = 0.0;
    let mut detected_items = Vec::new();
    let mut stats = std::collections::HashMap::new();

    for cat in [
        "grain",
        "protein_meat",
        "protein_bean",
        "vegetable",
        "fruit",
        "dairy",
        "nuts",
        "other",
    ] {
        stats.insert(cat, (0.0_f64, 0.0_f64));
    }

    let total_image_area = 800.0 * 800.0;
    let reference_full_screen_weight_g = 550.0;

    let mut meat_count = 0;
    let mut grain_count = 0;

    for det in yolo_result.detections {
        let x_min = det.bbox[0];
        let y_min = det.bbox[1];
        let x_max = det.bbox[2];
        let y_max = det.bbox[3];

        let bbox_area_pixels = (x_max - x_min) * (y_max - y_min);
        let area_ratio = (bbox_area_pixels / total_image_area).clamp(0.0, 1.0);

        let adjusted_ratio = if area_ratio > 0.15 {
            0.15 + (area_ratio - 0.15) * 0.5
        } else {
            area_ratio
        };

        let (density_modifier, cal_per_gram, max_weight, category_key) =
            match det.class_name.as_str() {
                "grain" => {
                    grain_count += 1;
                    let m = if grain_count > 1 { 0.4 } else { 1.1 };
                    (m, 1.3, 220.0, "grain")
                }
                "protein_meat" => {
                    meat_count += 1;
                    let m = if meat_count > 1 { 0.5 } else { 1.3 };
                    (m, 2.3, 160.0, "protein_meat")
                }
                "protein_bean" => (1.2, 1.4, 150.0, "protein_bean"),
                "vegetable" => (0.5, 0.25, 120.0, "vegetable"),
                "fruit" => (1.0, 0.5, 150.0, "fruit"),
                "dairy" => (1.0, 0.6, 250.0, "dairy"),
                "nuts" => (0.8, 6.0, 30.0, "nuts"),
                _ => (1.0, 1.0, 150.0, "other"),
            };

        let weight_g = (adjusted_ratio * reference_full_screen_weight_g * density_modifier)
            .clamp(5.0, max_weight);
        let item_calories = weight_g * cal_per_gram;

        total_calories += item_calories;

        if let Some(entry) = stats.get_mut(category_key) {
            entry.0 += item_calories;
            entry.1 += area_ratio * 100.0;
        }

        detected_items.push(FoodItem {
            class: det.class_name,
            confidence: (det.confidence * 100.0).round() / 100.0,
            estimated_weight_g: (weight_g * 10.0).round() / 10.0,
            calories: (item_calories * 10.0).round() / 10.0,
        });
    }

    if total_calories > 950.0 {
        total_calories = 850.0 + (total_calories - 850.0) * 0.2;
    }

    let api_key = env::var(ENVKey::GEMINI_API_KEY).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Server error".into(),
            }),
        )
    })?;
    let ai_url = format!("{}{}", OutSideURL::GEMINI_API_URL, api_key);
    let taboo_str = user_profile.taboo.unwrap_or_default().join("、");
    let disease_str = user_profile.disease.unwrap_or_default().join("、");

    let system_instruction = "你是一位熱情且鼓勵為主的專業營養師。請根據資料評估：\n\n\
        1. 給予健康評分(0~100)。評分標準要符合一般人的飲食現況，若有澱粉、肉與蔬菜，即使比例不完美，也應給予 60~75 分的基礎分。\n\
        2. 只有在完全沒有蔬菜或熱量破千時才給予低於 50 分。\n\
        3. 給予一段具建設性且口吻溫暖的建議(45字內)。\n\
        4. 必須回傳 JSON：{\"score\": 70, \"comment\": \"有菜有肉很均衡，如果飯換成五穀飯會更棒喔！\"}";
    let user_prompt = format!(
        "年齡:{} / 性別:{} / 疾病:{} / 禁忌:{} / 總熱量:{:.1}kcal (穀:{:.1}, 豆:{:.1}, 肉:{:.1}, 蔬:{:.1})",
        user_profile
            .age
            .map(|v| v.to_string())
            .unwrap_or_else(|| "未提供".into()),
        user_profile.gender.unwrap_or_else(|| "未提供".into()),
        if disease_str.is_empty() {
            "無".into()
        } else {
            disease_str
        },
        if taboo_str.is_empty() {
            "無".into()
        } else {
            taboo_str
        },
        total_calories,
        stats["grain"].0,
        stats["protein_bean"].0,
        stats["protein_meat"].0,
        stats["vegetable"].0
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&ai_url)
        .json(&json!({
            "system_instruction": { "parts": { "text": system_instruction } },
            "contents": [{ "role": "user", "parts": [{ "text": user_prompt }] }]
        }))
        .send()
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "AI Service Unavailable".into(),
                }),
            )
        })?;

    let res_body: serde_json::Value = response.json().await.unwrap_or_default();
    let text_reply = res_body["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("{}")
        .to_string();

    let clean_json_ai = text_reply
        .replace("```json", "")
        .replace("```", "")
        .trim()
        .to_string();

    let mut ai_score = 60;
    let mut ai_comment = "飲食紀錄已儲存！".to_string();

    if let Ok(evaluation) = serde_json::from_str::<AiEvaluationFormat>(&clean_json_ai) {
        ai_score = evaluation.score.clamp(0, 100);
        ai_comment = evaluation.comment;
    } else {
        if !clean_json_ai.is_empty() && clean_json_ai != "{}" {
            ai_comment = clean_json_ai.clone();
            ai_score = 75;
        }
        error!("AI 解析失敗，顯示原始輸出：{}", clean_json_ai);
    }

    sqlx::query!(
      r#"INSERT INTO diet_records (user_id, total_calories, grain_calories, grain_area, protein_meat_calories, protein_meat_area, vegetable_calories, vegetable_area, ai_health_score, ai_evaluation, result_image_path, original_image_path)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"#,
              auth_user.user_id,
              total_calories,
              stats["grain"].0,
              stats["grain"].1,
              stats["protein_meat"].0,
              stats["protein_meat"].1,
              stats["vegetable"].0,
              stats["vegetable"].1,
              ai_score,
              ai_comment,
              &yolo_result.image_path,
              &input_path
    )
    .execute(&state.db).await.ok();

    let image_base64 = fs::read(&yolo_result.image_path)
        .ok()
        .map(|b| general_purpose::STANDARD.encode(b));

    Ok(Json(CalorieResponse {
        message: "辨識完成".into(),
        image_base64,
        total_calories: (total_calories * 10.0).round() / 10.0,
        detected_items,
        ai_score,
        ai_comment,
    }))
}
