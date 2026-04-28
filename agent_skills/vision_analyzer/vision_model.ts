import fs from 'fs';
import path from 'path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import sharp from 'sharp';


const PROJECT_ROOT = path.resolve(__dirname, '../../');

export const visionAnalyzerTool = tool(
  async ({ imagePath }) => {
    try {
      const fullPath = path.join(PROJECT_ROOT, imagePath);
      if (!fullPath.startsWith(PROJECT_ROOT)) return "錯誤：越權存取！";
      if (!fs.existsSync(fullPath)) return `return [Debug] 找不到檔案！
      - 我嘗試讀取的路徑是: ${fullPath}
      - 目前程式運行的目錄(cwd): ${process.cwd()}
      - 你傳給我的相對路徑是: ${imagePath} ; `;

      const imageBuffer = await sharp(fullPath)
        .resize({ width: 800, height: 800, fit: 'inside' })
        .jpeg({ quality: 80 }) // 強制轉為較小的 jpg 格式
        .toBuffer();


      const base64Image = imageBuffer.toString('base64');
      const mimeType = fullPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUrl = `data:image/jpeg;base64,${base64Image}`;
      const visionLlm = new ChatOpenAI({
        modelName: "gemma-4-e4b",
        temperature: 0.1,
        maxTokens: 2048,
        apiKey: process.env.AI_API_KEY || "dummy",
        configuration: { baseURL: process.env.AI_API_URL || "http://localhost:8080/v1" }
      });


      const systemPrompt = `你是一位專業的營養師與影像分析專家。
      請分析圖片中的食物，並盡可能精準地預估每項食材的「實體重量 (公克)」。

      --- 嚴格原則 ---
      1. 【一次執行】：吐出合法的 JSON 後任務即結束，絕對禁止發起 re-analyze 請求。
      2. 【格式要求】：嚴格使用以下 JSON 格式回傳，拔除所有空白字元與 Markdown 標記：
      {
        "dish_name": "料理總稱",
        "ingredients": [
          { "name": "烤雞肉", "estimated_weight_g": 150, "estimated_calories": "100","cooking_method": "主要料理方式 (如：油炸、清蒸)" },
          { "name": "高麗菜", "estimated_weight_g": 50, "estimated_calories": "20","cooking_method": "主要料理方式 (如：油炸、清蒸)" }
        ]
      }`;
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage({
          content: [
            { type: "text", text: "請辨識這張圖片的食物占比、預估大小(重量)與料理方式。" },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        })
      ];

      const response = await visionLlm.invoke(messages);
      let content = response.content.toString();

      content = content.replace(/```json/g, '').replace(/```/g, '').trim();

      return content;

    } catch (error: any) {
      return `視覺辨識失敗: ${error.message}`;
    }
  },
  {
    name: "analyze_food_image",
    description: "當你需要分析使用者的食物圖片以獲取食材清單、預估重量、料理方式與外框座標時，呼叫此工具。",
    schema: z.object({
      imagePath: z.string().describe("本地圖片的相對路徑，例如：users_images/user_123/lunch.jpg"),
    }),
  }
);
