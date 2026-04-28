import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// 模擬食品營養資料庫 (每 100 克的營養素)
// 實務上這裡可以改成串接台灣 FDA API 或 Supabase 資料表
const NUTRITION_DB: Record<string, { kcal: number, protein: number, fat: number, carbs: number }> = {
  "雞肉": { kcal: 165, protein: 31, fat: 3.6, carbs: 0 },
  "白飯": { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  "米飯": { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
  "糙米飯": { kcal: 111, protein: 2.6, fat: 0.9, carbs: 23 },
  "高麗菜": { kcal: 25, protein: 1.3, fat: 0.2, carbs: 5.8 },
  "白菜": { kcal: 25, protein: 1.3, fat: 0.2, carbs: 5.8 },
  "青菜": { kcal: 30, protein: 1.5, fat: 1.0, carbs: 4.0 },
  "綠葉蔬菜": { kcal: 30, protein: 1.5, fat: 1.0, carbs: 4.0 },
  "香菇": { kcal: 22, protein: 3.1, fat: 0.3, carbs: 3.3 },
  "蘑菇": { kcal: 22, protein: 3.1, fat: 0.3, carbs: 3.3 },
  "豬肉": { kcal: 240, protein: 18, fat: 18, carbs: 0 },
  "豆腐": { kcal: 88, protein: 8.5, fat: 5.2, carbs: 2.0 },
  "蛋": { kcal: 140, protein: 12, fat: 10, carbs: 1.5 },
  // 預設值 (如果找不到對應的食材)
  "default": { kcal: 100, protein: 5, fat: 5, carbs: 10 }
};

export const calculateNutritionTool = tool(
  async ({ ingredients }) => {
    let totalKcal = 0;
    let totalProtein = 0;
    let totalFat = 0;
    let totalCarbs = 0;
    const details = [];

    for (const item of ingredients) {
      let dbItem = NUTRITION_DB["default"]!;

      // 簡易模糊比對：看食材名稱有沒有包含資料庫的關鍵字
      for (const key in NUTRITION_DB) {
        if (item.name.includes(key)) {
          dbItem = NUTRITION_DB[key]!;
          break;
        }
      }

      // 依照重量比例計算
      const ratio = item.weight_g / 100;
      const kcal = Math.round(dbItem.kcal * ratio);
      const protein = Math.round(dbItem.protein * ratio * 10) / 10;
      const fat = Math.round(dbItem.fat * ratio * 10) / 10;
      const carbs = Math.round(dbItem.carbs * ratio * 10) / 10;

      totalKcal += kcal;
      totalProtein += protein;
      totalFat += fat;
      totalCarbs += carbs;

      // 為了配合我們在 index.ts 設定的 Markdown 表格，我們把結果格式化
      details.push(`| ${item.name} | ${item.weight_g}g | ${kcal} 大卡 | ${protein}g | ${fat}g | ${carbs}g |`);
    }

    // 將四捨五入的總和回傳給 Agent
    const report = `
以下是精算後的營養數據，請直接使用此數據回答使用者：

| 食材名稱 | 預估重量 | 熱量 (kcal) | 蛋白質 (g) | 脂肪 (g) | 碳水 (g) |
| :--- | :--- | :--- | :--- | :--- | :--- |
${details.join('\n')}
| **總計** | - | **${totalKcal} 大卡** | **${Math.round(totalProtein)}g** | **${Math.round(totalFat)}g** | **${Math.round(totalCarbs)}g** |
`;
    return report;
  },
  {
    name: "calculate_nutrition",
    description: "當你取得視覺辨識的食材與重量 (ingredients) 後，必須立刻呼叫此工具來精準計算熱量與營養素，絕對不要自己算。",
    schema: z.object({
      ingredients: z.array(z.object({
        name: z.string().describe("食材名稱"),
        weight_g: z.number().describe("預估重量(公克)")
      }))
    })
  }
);
