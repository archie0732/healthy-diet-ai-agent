import fs from 'fs';
import path from 'path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';


const KNOWLEDGE_BASE_DIR = path.resolve(__dirname, '../../../knowledge_base');
const RULES_FILE_PATH = path.join(KNOWLEDGE_BASE_DIR, 'NUTRITION_RULES.md');

if (!fs.existsSync(KNOWLEDGE_BASE_DIR)) {
  fs.mkdirSync(KNOWLEDGE_BASE_DIR, { recursive: true });
}


export const readKnowledgeTool = tool(
  async () => {
    try {
      if (!fs.existsSync(RULES_FILE_PATH)) {
        return "目前的知識庫為空，你可以直接寫入新規則。";
      }
      const content = fs.readFileSync(RULES_FILE_PATH, 'utf-8');
      return `--- 當前系統知識庫內容 ---\n${content}\n--- 結束 ---`;
    } catch (error: any) {
      return `讀取失敗: ${error.message}`;
    }
  },
  {
    name: "read_knowledge_tool",
    description: "在更新規則前，用來讀取系統現有知識庫內容的工具。不需要傳入任何參數。",
    schema: z.object({}),
  }
);

export const updateKnowledgeTool = tool(
  async ({ newRules, overwrite }) => {
    try {
      if (!RULES_FILE_PATH.startsWith(KNOWLEDGE_BASE_DIR)) {
        return "錯誤：越權操作！";
      }

      if (overwrite) {
        fs.writeFileSync(RULES_FILE_PATH, newRules, 'utf-8');
        return `成功！知識庫已全量更新。`;
      } else {
        const currentContent = fs.existsSync(RULES_FILE_PATH) ? fs.readFileSync(RULES_FILE_PATH, 'utf-8') : '';
        const updatedContent = `${currentContent}\n\n${newRules}`.trim();
        fs.writeFileSync(RULES_FILE_PATH, updatedContent, 'utf-8');
        return `成功！新規則已附加至知識庫中。`;
      }
    } catch (error: any) {
      return `寫入失敗: ${error.message}`;
    }
  },
  {
    name: "update_knowledge_tool",
    description: "將整理好的新規則寫入系統知識庫 NUTRITION_RULES.md 中。",
    schema: z.object({
      newRules: z.string().describe("準備寫入的 Markdown 格式規則文字"),
      overwrite: z.boolean().describe("是否要全量覆寫檔案？如果只是新增一兩條規則，請設為 false；如果是重新整理了所有規則，請設為 true。"),
    }),
  }
);
