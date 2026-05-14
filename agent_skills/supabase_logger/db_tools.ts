import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;
const SUPABASE_QUERY_TIMEOUT_MS = Number(process.env.SUPABASE_QUERY_TIMEOUT_MS || 8000);

const withTimeout = async <T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

const getSupabaseOrError = (): { client: typeof supabase; error: string | null } => {
  if (!supabase) {
    return {
      client: null,
      error: 'Supabase is not configured. Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.',
    };
  }
  return { client: supabase, error: null };
};

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
    ai_analysis_report = '',
    diet_report,
    user_id,
    record_type = 'chat',
    summary_text,
  }) => {
    try {
      const { client, error: configError } = getSupabaseOrError();
      if (configError || !client) return configError || 'Supabase is not configured.';

      const summaryColumnEnabled = process.env.ENABLE_SUMMARY_COLUMN === 'true';

      if (record_type === 'summary') {
        if (!summaryColumnEnabled) {
          return 'Summary column is disabled. Set ENABLE_SUMMARY_COLUMN=true to store summary rows.';
        }
        if (!summary_text || summary_text.trim().length === 0) {
          return 'summary_text is required for record_type=summary.';
        }

        const summaryInsertData: Record<string, unknown> = {
          room_id,
          user_message,
          title: title || user_message.slice(0, 60),
          summary: summary_text,
          ai_analysis_report: '',
        };
        if (user_id) summaryInsertData.user_id = user_id;

        const { error } = await withTimeout(
          client.from('diet_chat_history').insert([summaryInsertData]),
          SUPABASE_QUERY_TIMEOUT_MS,
          'insert summary row'
        );
        if (error) return `Failed to insert summary row: ${error.message}`;
        return 'Summary row inserted.';
      }

      if (!ai_analysis_report || ai_analysis_report.trim().length === 0) {
        return 'ai_analysis_report is required for chat record.';
      }

      const insertData: Record<string, unknown> = {
        room_id,
        user_message,
        title: title || user_message.slice(0, 60),
        ai_analysis_report,
        diet_report,
      };

      if (image_path) insertData.image_path = image_path;
      if (user_id) insertData.user_id = user_id;
      if (summary_text && summaryColumnEnabled) insertData.summary = summary_text;

      const { error } = await withTimeout(
        client.from('diet_chat_history').insert([insertData]),
        SUPABASE_QUERY_TIMEOUT_MS,
        'insert chat row'
      );
      if (error) return `Failed to insert chat row: ${error.message}`;

      return 'Chat row inserted.';
    } catch (error: any) {
      return `log_diet_history exception: ${error.message}`;
    }
  },
  {
    name: 'log_diet_history',
    description:
      'Insert diet_chat_history record. Use record_type=chat for normal response, record_type=summary for summary row.',
    schema: z.object({
      room_id: z.string().describe('Conversation room id (thread id).'),
      user_message: z.string().describe('Original user message.'),
      image_path: z.string().optional().describe('Optional relative image path.'),
      title: z.string().optional().describe('Optional title.'),
      ai_analysis_report: z.string().optional().describe('Assistant plain-text response.'),
      diet_report: z.any().optional().describe('Optional structured nutrition result.'),
      user_id: z.string().optional().describe('Optional user UUID.'),
      record_type: z.enum(['chat', 'summary']).optional().default('chat'),
      summary_text: z.string().optional().describe('Summary text for summary row.'),
    }),
  }
);

export const getChatHistoryTool = tool(
  async ({ room_id, limit = 8, format = 'compact', include_diet_report = false }) => {
    const { client, error: configError } = getSupabaseOrError();
    if (configError || !client) return configError || 'Supabase is not configured.';

    const { data, error } = await withTimeout(
      client
        .from('diet_chat_history')
        .select('id, created_at, title, user_message, ai_analysis_report, summary, diet_report')
        .eq('room_id', room_id)
        .order('created_at', { ascending: false })
        .limit(limit),
      SUPABASE_QUERY_TIMEOUT_MS,
      'get chat history'
    );

    if (error) return `Failed to read history: ${error.message}`;

    const rows = ((data ?? []) as HistoryRow[]).slice().reverse();

    if (format === 'raw') return JSON.stringify(rows);
    if (rows.length === 0) return 'No history found for this room.';

    const lines: string[] = [];
    for (const row of rows) {
      const time = row.created_at ? new Date(row.created_at).toISOString() : 'unknown_time';
      const header = row.title?.trim() ? `[${time}] ${row.title.trim()}` : `[${time}] conversation`;
      lines.push(header);

      if (row.summary?.trim()) {
        lines.push(`- summary: ${shorten(row.summary, 260)}`);
      } else {
        if (row.user_message?.trim()) lines.push(`- user: ${shorten(row.user_message, 140)}`);
        if (row.ai_analysis_report?.trim()) lines.push(`- assistant: ${shorten(row.ai_analysis_report, 200)}`);
      }

      if (include_diet_report && row.diet_report != null) {
        lines.push(`- diet_report: ${shorten(JSON.stringify(row.diet_report), 180)}`);
      }

      lines.push('');
    }

    return lines.join('\n').trim();
  },
  {
    name: 'get_chat_history',
    description: 'Read chat history by room id. format=compact returns readable summary, format=raw returns JSON string.',
    schema: z.object({
      room_id: z.string().describe('Room id'),
      limit: z.number().int().min(1).max(50).optional().default(8),
      format: z.enum(['compact', 'raw']).optional().default('compact'),
      include_diet_report: z.boolean().optional().default(false),
    }),
  }
);

export const getUserProfileTool = tool(
  async ({ user_id }) => {
    const { client, error: configError } = getSupabaseOrError();
    if (configError || !client) return configError || 'Supabase is not configured.';

    const { data, error } = await withTimeout(
      client
        .from('users')
        .select('nickname, height, weight, age, gender, taboo, disease')
        .eq('id', user_id)
        .single(),
      SUPABASE_QUERY_TIMEOUT_MS,
      'get user profile'
    );

    if (error) return `Failed to read user profile: ${error.message}`;
    return JSON.stringify(data);
  },
  {
    name: 'get_user_profile',
    description: 'Read user profile by user id.',
    schema: z.object({
      user_id: z.string(),
    }),
  }
);

export const updateUserProfileTool = tool(
  async ({
    user_id,
    nickname_to_set,
    avatar_url_to_set,
    height_to_set,
    weight_to_set,
    age_to_set,
    gender_to_set,
    taboo_to_add,
    disease_to_add,
  }) => {
    try {
      const { client, error: configError } = getSupabaseOrError();
      if (configError || !client) return configError || 'Supabase is not configured.';

      const { data: user, error: fetchErr } = await withTimeout(
        client
          .from('users')
          .select('nickname, avatar_url, height, weight, age, gender, taboo, disease')
          .eq('id', user_id)
          .single(),
        SUPABASE_QUERY_TIMEOUT_MS,
        'fetch user profile for update'
      );

      if (fetchErr) return `Failed to fetch user profile: ${fetchErr.message}`;

      const currentTaboo = Array.isArray(user.taboo) ? [...user.taboo] : [];
      const currentDisease = Array.isArray(user.disease) ? [...user.disease] : [];

      if (taboo_to_add && !currentTaboo.includes(taboo_to_add)) currentTaboo.push(taboo_to_add);
      if (disease_to_add && !currentDisease.includes(disease_to_add)) currentDisease.push(disease_to_add);

      const updatePayload: Record<string, unknown> = {};

      if (nickname_to_set && nickname_to_set.trim().length > 0) updatePayload.nickname = nickname_to_set.trim();
      if (avatar_url_to_set && avatar_url_to_set.trim().length > 0) {
        updatePayload.avatar_url = avatar_url_to_set.trim();
      }
      if (typeof height_to_set === 'number') updatePayload.height = height_to_set;
      if (typeof weight_to_set === 'number') updatePayload.weight = weight_to_set;
      if (typeof age_to_set === 'number') updatePayload.age = age_to_set;
      if (gender_to_set && gender_to_set.trim().length > 0) updatePayload.gender = gender_to_set.trim();

      if (taboo_to_add || disease_to_add) {
        updatePayload.taboo = currentTaboo;
        updatePayload.disease = currentDisease;
      }

      if (Object.keys(updatePayload).length === 0) return 'No profile fields provided to update.';

      const { error: updateErr } = await withTimeout(
        client.from('users').update(updatePayload).eq('id', user_id),
        SUPABASE_QUERY_TIMEOUT_MS,
        'update user profile'
      );
      if (updateErr) return `Failed to update profile: ${updateErr.message}`;

      const nextNickname = (updatePayload.nickname as string | undefined) ?? user.nickname ?? 'unknown';
      const nextAvatarUrl = (updatePayload.avatar_url as string | undefined) ?? user.avatar_url ?? 'unknown';
      const nextHeight = (updatePayload.height as number | undefined) ?? user.height ?? 'unknown';
      const nextWeight = (updatePayload.weight as number | undefined) ?? user.weight ?? 'unknown';
      const nextAge = (updatePayload.age as number | undefined) ?? user.age ?? 'unknown';
      const nextGender = (updatePayload.gender as string | undefined) ?? user.gender ?? 'unknown';
      const nextTaboo = (updatePayload.taboo as string[] | undefined) ?? currentTaboo;
      const nextDisease = (updatePayload.disease as string[] | undefined) ?? currentDisease;

      return [
        'User profile updated.',
        `nickname: ${nextNickname}`,
        `avatar_url: ${nextAvatarUrl}`,
        `height: ${nextHeight}`,
        `weight: ${nextWeight}`,
        `age: ${nextAge}`,
        `gender: ${nextGender}`,
        `taboo: ${nextTaboo.join(', ') || 'none'}`,
        `disease: ${nextDisease.join(', ') || 'none'}`,
      ].join('\n');
    } catch (error: any) {
      return `Profile update exception: ${error.message}`;
    }
  },
  {
    name: 'update_user_profile',
    description:
      'Update user profile fields. Supports nickname/avatar_url/height/weight/age/gender set, and taboo/disease append.',
    schema: z.object({
      user_id: z.string().describe('User UUID'),
      nickname_to_set: z.string().optional().describe('Set user nickname'),
      avatar_url_to_set: z.string().optional().describe('Set avatar image URL'),
      height_to_set: z.number().positive().optional().describe('Set height in cm'),
      weight_to_set: z.number().positive().optional().describe('Set weight in kg'),
      age_to_set: z.number().positive().optional().describe('Set age in years (float8 compatible)'),
      gender_to_set: z.string().optional().describe('Set gender text'),
      taboo_to_add: z.string().optional().describe('Append one taboo item if not exists'),
      disease_to_add: z.string().optional().describe('Append one disease item if not exists'),
    }),
  }
);
