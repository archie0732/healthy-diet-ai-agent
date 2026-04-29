import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export const updateUserProfileTool = tool(
  async ({ user_id, taboo_to_add, disease_to_add }) => {
    try {
      const { data: user, error: fetchErr } = await supabase
        .from('users')
        .select('taboo, disease')
        .eq('id', user_id)
        .single();

      if (fetchErr) return `讀取使用者資料失敗: ${fetchErr.message}`;

      let currentTaboo = user.taboo || [];
      let currentDisease = user.disease || [];

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

      return `✅ 成功更新使用者個人檔案！目前忌口: ${currentTaboo.join(', ')} / 疾病史: ${currentDisease.join(', ')}`;
    } catch (error: any) {
      return `系統錯誤: ${error.message}`;
    }
  },
  {
    name: "update_user_profile",
    description: "當在對話中發現使用者提到了新的飲食禁忌 (如過敏原、吃素) 或新的疾病史時，立刻呼叫此工具更新資料庫，以便未來的建議更精準。",
    schema: z.object({
      user_id: z.string().describe("使用者的 UUID"),
      taboo_to_add: z.string().optional().describe("要新增的忌口項目，例如 '花生', '全素'"),
      disease_to_add: z.string().optional().describe("要新增的疾病或體徵，例如 '高血壓', '糖尿病'")
    })
  }
);
