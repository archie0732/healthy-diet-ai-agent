import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

type CompressableRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  title: string | null;
  user_message: string | null;
  ai_analysis_report: string | null;
  summary: string | null;
};

const compactText = (value: string, max = 120): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
};

const toSummaryLine = (row: CompressableRow): string => {
  const ts = row.created_at ? new Date(row.created_at).toISOString() : 'unknown_time';
  const userText = row.user_message?.trim() ? compactText(row.user_message, 90) : '(無使用者訊息)';
  const aiText = row.ai_analysis_report?.trim() ? compactText(row.ai_analysis_report, 120) : '(無助理回覆)';
  return `- [${ts}] U: ${userText} | A: ${aiText}`;
};

export const compressChatHistoryTool = tool(
  async ({ room_id, keep_recent = 8, max_source_rows = 30, dry_run = false }) => {
    try {
      const summaryColumnEnabled = process.env.ENABLE_SUMMARY_COLUMN === 'true';
      if (!summaryColumnEnabled) {
        return '⚠️ ENABLE_SUMMARY_COLUMN 未開啟，已停止壓縮。';
      }

      const fetchLimit = keep_recent + max_source_rows;
      const { data, error } = await supabase
        .from('diet_chat_history')
        .select('id, created_at, user_id, title, user_message, ai_analysis_report, summary')
        .eq('room_id', room_id)
        .order('created_at', { ascending: false })
        .limit(fetchLimit);

      if (error) {
        return `讀取聊天紀錄失敗: ${error.message}`;
      }

      const rows = (data ?? []) as CompressableRow[];
      const latestSummaryCreatedAt = rows
        .filter((row) => !!row.summary)
        .map((row) => row.created_at)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

      const chatRows = rows.filter((row) => {
        if (row.summary) return false;
        if (!latestSummaryCreatedAt) return true;
        return new Date(row.created_at).getTime() > new Date(latestSummaryCreatedAt).getTime();
      });

      if (chatRows.length <= keep_recent) {
        return `✅ 無需壓縮。目前可壓縮對話筆數 ${chatRows.length}，保留門檻 ${keep_recent}。`;
      }

      const targetRows = chatRows.slice(keep_recent);
      const targetRowsAsc = [...targetRows].reverse();

      const firstCompressed = targetRowsAsc[0];
      const lastCompressed = targetRowsAsc[targetRowsAsc.length - 1];
      const startAt = firstCompressed?.created_at ? new Date(firstCompressed.created_at).toISOString() : 'unknown';
      const endAt = lastCompressed?.created_at
        ? new Date(lastCompressed.created_at).toISOString()
        : 'unknown';

      const summaryTitle = `聊天室歷史摘要 (${targetRows.length}筆)`;
      const summaryText = [
        `壓縮範圍: ${startAt} ~ ${endAt}`,
        `壓縮筆數: ${targetRows.length}`,
        '',
        ...targetRowsAsc.map(toSummaryLine)
      ].join('\n');

      if (dry_run) {
        return JSON.stringify({
          room_id,
          keep_recent,
          compressed_count: targetRows.length,
          source_ids: targetRows.map((row) => row.id),
          summary_title: summaryTitle,
          summary_text_preview: summaryText
        });
      }

      const latestCompressedRow = targetRows[0];
      const summaryUserId = latestCompressedRow?.user_id ?? null;

      const { error: insertErr } = await supabase
        .from('diet_chat_history')
        .insert([
          {
            room_id,
            user_id: summaryUserId,
            title: summaryTitle,
            user_message: '[AUTO_SUMMARY] 壓縮歷史聊天紀錄',
            ai_analysis_report: '',
            summary: summaryText,
          }
        ]);

      if (insertErr) {
        return `摘要寫入失敗: ${insertErr.message}`;
      }

      return `✅ 已建立聊天摘要。壓縮 ${targetRows.length} 筆舊對話，並保留最新 ${keep_recent} 筆原始對話。`;
    } catch (error: any) {
      return `系統錯誤: ${error.message}`;
    }
  },
  {
    name: 'compress_chat_history',
    description: '將舊的聊天室對話壓縮成一筆 summary 記錄，降低後續讀取負擔。預設保留最新 8 筆原始對話。',
    schema: z.object({
      room_id: z.string().describe('聊天室 ID'),
      keep_recent: z.number().int().min(1).max(30).optional().default(8).describe('要保留不壓縮的最新原始對話筆數'),
      max_source_rows: z.number().int().min(5).max(100).optional().default(30).describe('本次最多納入壓縮的舊對話筆數'),
      dry_run: z.boolean().optional().default(false).describe('true 時只預覽壓縮內容，不寫入資料庫')
    })
  }
);
