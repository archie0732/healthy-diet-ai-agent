/*
這是一個熱量計算引擎。當需要計算食物的重量與熱量時呼叫此工具。
注意：由於系統限制，請將所有參數打包成一個合法的 JSON 字串，並作為「query」參數傳入。
JSON 必須包含以下四個 key：
- class_name (字串，如 grain, protein_meat 等)
- area_ratio (數字，0~1的比例)
- method (字串，如 boiled, fried 等)
- hasSauce (布林值，true/false)
範例：{"class_name":"protein_meat","area_ratio":0.3,"method":"fried","hasSauce":true}
*/


const rawQuery = $fromAI().query;

let params;
try {

  params = JSON.parse(rawQuery);
} catch (e) {
  return JSON.stringify({ error: "參數解析失敗，請確保傳入有效的 JSON 格式字串。" });
}

const { class_name, area_ratio, method, hasSauce } = params;

const FOOD_CONFIG = {
  grain: { density: 1.0, baseKcal: 1.5 },
  protein_meat: { density: 1.2, baseKcal: 2.0 },
  protein_bean: { density: 1.1, baseKcal: 1.4 },
  vegetable: { density: 0.6, baseKcal: 0.3 },
  fruit: { density: 0.8, baseKcal: 0.5 },
  dairy: { density: 1.0, baseKcal: 0.6 },
  nuts: { density: 0.8, baseKcal: 6.0 }
};

const MULTIPLIERS = {
  boiled: 1.0, steamed: 1.0, stir_fried: 1.3,
  braised: 1.4, fried: 2.2, deep_fried: 2.5, sauce_added: 1.2
};

const config = FOOD_CONFIG[class_name] || { density: 1.0, baseKcal: 1.0 };
let multiplier = MULTIPLIERS[method] || 1.3;
if (hasSauce) multiplier *= MULTIPLIERS.sauce_added;

const weight = 550 * area_ratio * config.density;
const calories = weight * config.baseKcal * multiplier;

return JSON.stringify({
  estimated_weight_g: Math.round(weight * 10) / 10,
  calories: Math.round(calories * 10) / 10,
  message: `計算完成：${class_name} 預估 ${Math.round(weight)}克，熱量為 ${Math.round(calories)}大卡。`
});
