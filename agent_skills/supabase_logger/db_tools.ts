import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

type HistoryRow = {
  id: string;
  created_at: string;
  title: string | null;
  user_message: string | null;
  ai_analysis_report: string | null;
  summary: string | null;
  diet_report: unknown;
};

const shorten = (text: string, max = 120): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
};

export const logDietTool = tool(
  async ({
    room_id,
    user_message,
    image_path,
    title,
    ai_analysis_report = "",
    diet_report,
    user_id,
    record_type = "chat",
    summary_text
  }) => {
    try {
      const summaryColumnEnabled = process.env.ENABLE_SUMMARY_COLUMN === "true";

      if (record_type === "summary") {
        if (!summaryColumnEnabled) {
          return "⚠️ 已阻擋 summary 寫入對話紀錄欄位。請先建立專用 summary 欄位後再儲存。";
        }
        if (!summary_text) {
          return "⚠️ 缺少 summary_text，無法儲存摘要。";
        }

        const summaryInsertData: any = {
          room_id,
          user_message,
          title: title || user_message.slice(0, 60),
          summary: summary_text,
          ai_analysis_report: "",
        };
        if (user_id) summaryInsertData.user_id = user_id;

        const { error: summaryInsertError } = await supabase
          .from('diet_chat_history')
          .insert([summaryInsertData]);

        if (summaryInsertError) {
          console.error("Supabase 摘要寫入錯誤:", summaryInsertError);
          return `摘要寫入失敗: ${summaryInsertError.message}`;
        }
        return "✅ 摘要已寫入 summary 欄位。";
      }

      if (!ai_analysis_report) {
        return "⚠️ 缺少 ai_analysis_report，已取消寫入。";
      }

      const insertData: any = {
        room_id,
        user_message,
        title: title || user_message.slice(0, 60),
        ai_analysis_report,
        diet_report,
      };

      if (image_path) insertData.image_path = image_path;
      if (user_id) insertData.user_id = user_id;
      if (summary_text && summaryColumnEnabled) {
        insertData.summary = summary_text;
      }

      const { error } = await supabase
        .from('diet_chat_history')
        .insert([insertData]);

      if (error) {
        console.error("Supabase 寫入錯誤:", error);
        return `資料寫入失敗: ${error.message}`;
      }

      return "✅ 飲食紀錄已成功儲存至雲端資料庫！";
    } catch (error: any) {
      return `系統執行錯誤: ${error.message}`;
    }
  },
  {
    name: "log_diet_history",
    description: "當你完成對話或分析後，『必須』呼叫此工具將所有結果寫入資料庫永久保存。",
    schema: z.object({
      room_id: z.string().describe("目前的對話群組 ID (通常對應 thread_id)"),
      user_message: z.string().describe("使用者最初的詢問內容"),
      image_path: z.string().optional().describe("使用者上傳的圖片路徑 (若有)"),
      title: z.string().optional().describe("本次對話標題，建議 60 字內。"),
      ai_analysis_report: z.string().optional().describe("你給予使用者的白話文結語與專業建議 (不要包含 Markdown 表格，純文字建議即可)"),
      diet_report: z.any().optional().describe("由 calculate_nutrition 工具算出來的 JSON 結構化數據 (包含各食材熱量與總和)"),
      user_id: z.string().optional().describe("使用者的 UUID (若系統目前未提供可忽略)"),
      record_type: z.enum(["chat", "summary"]).optional().describe("寫入類型。一般對話用 chat。摘要內容必須用 summary，且不會寫入對話紀錄欄位。"),
      summary_text: z.string().optional().describe("若未來已建立 summary 專用欄位，可放摘要文字。")
    })
  }
);

export const getChatHistoryTool = tool(
  async ({ room_id, limit = 8, format = 'compact', include_diet_report = false }) => {
    const { data, error } = await supabase
      .from('diet_chat_history')
      .select('id, created_at, title, user_message, ai_analysis_report, summary, diet_report')
      .eq('room_id', room_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return `讀取歷史失敗: ${error.message}`;

    const rows = ((data ?? []) as HistoryRow[]).slice().reverse();

    if (format === 'raw') {
      return JSON.stringify(rows);
    }

    if (rows.length === 0) {
      return '此聊天室目前沒有歷史紀錄。';
    }

    const lines: string[] = [];
    for (const row of rows) {
      const time = row.created_at ? new Date(row.created_at).toISOString() : 'unknown_time';
      const header = row.title?.trim() ? `[${time}] ${row.title.trim()}` : `[${time}] 對話紀錄`;
      lines.push(header);

      if (row.summary?.trim()) {
        lines.push(`- 摘要: ${shorten(row.summary, 260)}`);
      } else {
        if (row.user_message?.trim()) {
          lines.push(`- 使用者: ${shorten(row.user_message, 140)}`);
        }
        if (row.ai_analysis_report?.trim()) {
          lines.push(`- 助理: ${shorten(row.ai_analysis_report, 200)}`);
        }
      }

      if (include_diet_report && row.diet_report != null) {
        lines.push(`- diet_report: ${shorten(JSON.stringify(row.diet_report), 180)}`);
      }

      lines.push('');
    }

    return lines.join('\n').trim();
  },
  {
    name: "get_chat_history",
    description: "讀取聊天室近期紀錄。預設回傳 compact 文本摘要，方便快速理解上下文；需要原始資料時可切到 raw。",
    schema: z.object({
      room_id: z.string().describe('聊天室 ID'),
      limit: z.number().int().min(1).max(50).optional().default(8).describe('最多讀取幾筆紀錄'),
      format: z.enum(['compact', 'raw']).optional().default('compact').describe('compact=文字摘要, raw=原始 JSON 字串'),
      include_diet_report: z.boolean().optional().default(false).describe('是否在 compact 模式附帶 diet_report 的短摘要')
    })
  }
);

export const getUserProfileTool = tool(
  async ({ user_id }) => {
    const { data, error } = await supabase
      .from('users')
      .select('nickname, height, weight, age, gender, taboo, disease')
      .eq('id', user_id)
      .single();

    if (error) return `讀取使用者資料失敗: ${error.message}`;
    return JSON.stringify(data);
  },
  {
    name: "get_user_profile",
    description: "讀取使用者的健康背景，包含體徵、忌口項目 (taboo) 與疾病史 (disease)。",
    schema: z.object({
      user_id: z.string()
    })
  }
);

export const updateUserProfileTool = tool(
  async ({ user_id, taboo_to_add, disease_to_add }) => {
    try {
      const { data: user, error: fetchErr } = await supabase
        .from('users')
        .select('taboo, disease')
        .eq('id', user_id)
        .single();

      if (fetchErr) return `讀取使用者資料失敗: ${fetchErr.message}`;

      const currentTaboo = Array.isArray(user.taboo) ? [...user.taboo] : [];
      const currentDisease = Array.isArray(user.disease) ? [...user.disease] : [];

      if (taboo_to_add && !currentTaboo.includes(taboo_to_add)) {
        currentTaboo.push(taboo_to_add);
      }
      if (disease_to_add && !currentDisease.includes(disease_to_add)) {
        currentDisease.push(disease_to_add);
      }

      const { error: updateErr } = await supabase
        .from('users')
        .update({ taboo: currentTaboo, disease: currentDisease })
        .eq('id', user_id);

      if (updateErr) return `更新失敗: ${updateErr.message}`;

      return `✅ 成功更新使用者個人檔案！目前忌口: ${currentTaboo.join(', ') || '無'} / 疾病史: ${currentDisease.join(', ') || '無'}`;
    } catch (error: any) {
      return `系統錯誤: ${error.message}`;
    }
  },
  {
    name: "update_user_profile",
    description: "當在對話中發現使用者提到新的飲食禁忌或疾病史時，立刻呼叫此工具更新資料庫，讓後續建議更精準。",
    schema: z.object({
      user_id: z.string().describe("使用者的 UUID"),
      taboo_to_add: z.string().optional().describe("要新增的忌口項目，例如 '花生', '全素'"),
      disease_to_add: z.string().optional().describe("要新增的疾病或體徵，例如 '高血壓', '糖尿病'")
    })
  }
);
