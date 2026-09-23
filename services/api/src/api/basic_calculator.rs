use crate::utils::calculator::{BasicCalorieResponse, ExtractedFoodItem, calculate_basic_calories};
use axum::Json;

pub async fn basic_calculate_handler(
    Json(payload): Json<Vec<ExtractedFoodItem>>,
) -> Json<BasicCalorieResponse> {
    let result = calculate_basic_calories(payload);

    Json(result)
}
