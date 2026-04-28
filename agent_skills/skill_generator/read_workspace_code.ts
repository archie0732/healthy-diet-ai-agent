import fs from 'fs';
import path from 'path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const PROJECT_ROOT = path.resolve(__dirname, '../../../');

export const readCodeTool = tool(
  async ({ filePath }) => {
    try {
      const targetPath = path.join(PROJECT_ROOT, filePath);

      if (!targetPath.startsWith(PROJECT_ROOT)) {
        return "錯誤：越權讀取！只能讀取專案內的檔案。";
      }
      if (!fs.existsSync(targetPath)) {
        return `找不到檔案：${filePath}。請確認路徑是否正確（例如 src/index.ts）。`;
      }

      const ext = path.extname(targetPath);
      if (!['.ts', '.js', '.md', '.json', '.env'].includes(ext)) {
        return "錯誤：不支援的檔案格式，僅能讀取程式碼或文字檔。";
      }

      const content = fs.readFileSync(targetPath, 'utf-8');
      return `--- ${filePath} 的內容 ---\n${content}\n--- 結束 ---`;
    } catch (error: any) {
      return `讀取失敗: ${error.message}`;
    }
  },
  {
    name: "read_workspace_code",
    description: "讀取專案內的程式碼或 Markdown 檔案，幫助你理解系統現有架構與邏輯。傳入相對路徑即可。",
    schema: z.object({
      filePath: z.string().describe("相對於專案根目錄的檔案路徑，例如: src/agent_skills/vision_analyzer/draw_bbox.ts"),
    }),
  }
);
