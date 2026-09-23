use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Debug)]
pub struct ExtractedFoodItem {
    pub class: String,
    pub confidence: f64,
    pub area_ratio: f64,
}

#[derive(Serialize, Debug)]
pub struct CalculatedItem {
    pub class: String,
    pub estimated_weight_g: f64,
    pub calories: f64,
    pub default_cooking_method: String,
}

#[derive(Serialize, Debug)]
pub struct BasicCalorieResponse {
    pub source: String,
    pub total_calories: f64,
    pub items: Vec<CalculatedItem>,
}

struct FoodAttribute {
    density: f64,
    kcal_per_gram: f64,
    default_multiplier: f64,
    default_cooking: &'static str,
}

pub fn calculate_basic_calories(items: Vec<ExtractedFoodItem>) -> BasicCalorieResponse {
    let mut food_dict = HashMap::new();

    food_dict.insert(
        "grain",
        FoodAttribute {
            density: 1.0,
            kcal_per_gram: 1.5,
            default_multiplier: 1.0,
            default_cooking: "一般蒸煮",
        },
    );
    food_dict.insert(
        "protein_meat",
        FoodAttribute {
            density: 1.2,
            kcal_per_gram: 2.0,
            default_multiplier: 1.4,
            default_cooking: "一般煎/滷",
        },
    );
    food_dict.insert(
        "protein_bean",
        FoodAttribute {
            density: 1.1,
            kcal_per_gram: 1.4,
            default_multiplier: 1.2,
            default_cooking: "一般燉/滷",
        },
    );
    food_dict.insert(
        "vegetable",
        FoodAttribute {
            density: 0.6,
            kcal_per_gram: 0.3,
            default_multiplier: 1.5,
            default_cooking: "清炒 (含油)",
        },
    );
    food_dict.insert(
        "fruit",
        FoodAttribute {
            density: 0.8,
            kcal_per_gram: 0.5,
            default_multiplier: 1.0,
            default_cooking: "生食",
        },
    );
    food_dict.insert(
        "dairy",
        FoodAttribute {
            density: 1.0,
            kcal_per_gram: 0.6,
            default_multiplier: 1.0,
            default_cooking: "一般",
        },
    );
    food_dict.insert(
        "nuts",
        FoodAttribute {
            density: 0.8,
            kcal_per_gram: 6.0,
            default_multiplier: 1.0,
            default_cooking: "烘烤",
        },
    );

    let unknown_attr = FoodAttribute {
        density: 1.0,
        kcal_per_gram: 1.0,
        default_multiplier: 1.0,
        default_cooking: "未知",
    };

    let bento_total_weight_g = 550.0;

    let mut total_calories = 0.0;
    let mut calculated_items = Vec::new();

    for item in items {
        let attr = food_dict.get(item.class.as_str()).unwrap_or(&unknown_attr);

        let estimated_weight = bento_total_weight_g * item.area_ratio * attr.density;

        let item_calories = estimated_weight * attr.kcal_per_gram * attr.default_multiplier;

        total_calories += item_calories;

        calculated_items.push(CalculatedItem {
            class: item.class,
            estimated_weight_g: (estimated_weight * 10.0).round() / 10.0,
            calories: (item_calories * 10.0).round() / 10.0,
            default_cooking_method: attr.default_cooking.to_string(),
        });
    }

    BasicCalorieResponse {
        source: "basic_calculator".to_string(),
        total_calories: (total_calories * 10.0).round() / 10.0,
        items: calculated_items,
    }
}
