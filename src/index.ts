import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver, StateGraph, START, END, MessagesAnnotation, Annotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';

import { readKnowledgeTool, updateKnowledgeTool } from '../agent_skills/admin_knowledge/file_tools';
import { visionAnalyzerTool } from '../agent_skills/vision_analyzer/vision_model';
import { calculateNutritionTool } from '../agent_skills/calorie_calculator/calc_tools';
import { logDietTool, getChatHistoryTool, getUserProfileTool, updateUserProfileTool } from '../agent_skills/supabase_logger/db_tools';
import { compressChatHistoryTool } from '../agent_skills/memory_summarizer/summarizer_tools';

const app = express();
app.use(cors());
app.use(express.json());

const ROOT_DIR = path.resolve(__dirname, '..');
const USERS_IMAGES_DIR = path.join(ROOT_DIR, 'users_images');
const KNOWLEDGE_BASE_DIR = path.join(ROOT_DIR, 'knowledge_base');

const AGENT_FILE = path.join(KNOWLEDGE_BASE_DIR, 'AGENT.md');
const INDEX_FILE = path.join(KNOWLEDGE_BASE_DIR, 'SKILLS_INDEX.md');
const RULES_FILE = path.join(KNOWLEDGE_BASE_DIR, 'NUTRITION_RULES.md');

app.use('/images', express.static(USERS_IMAGES_DIR));

const PORT = Number(process.env.PORT) || 8001;
const AI_API_URL = process.env.AI_API_URL || "http://localhost:8080/v1";

// Agent 可用工具（不包含直接寫 DB 的 log_diet_history）
const agentTools = [
  readKnowledgeTool,
  updateKnowledgeTool,
  visionAnalyzerTool,
  calculateNutritionTool,
  getChatHistoryTool,
  updateUserProfileTool,
  compressChatHistoryTool
];
const toolNode = new ToolNode(agentTools);

const llm = new ChatOpenAI({
  modelName: "gemma",
  temperature: 0,
  configuration: { baseURL: AI_API_URL },
  apiKey: "dummy",
});

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  user_id: Annotation<string>(),
  room_id: Annotation<string>(),
  user_profile_context: Annotation<string>(),
});

const callModel = async (state: typeof AgentState.State) => {
  const agentInstructions = fs.existsSync(AGENT_FILE) ? fs.readFileSync(AGENT_FILE, 'utf-8') : '';
  const skillsIndex = fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf-8') : '';
  const nutritionRules = fs.existsSync(RULES_FILE) ? fs.readFileSync(RULES_FILE, 'utf-8') : '';

  const userInfo = state.user_id ? `目前服務的使用者 ID (user_id): ${state.user_id}` : '目前使用者: 訪客 (無 user_id)';
  const roomInfo = state.room_id ? `目前的對話群組 ID (room_id): ${state.room_id}` : '';
  const userProfileContext = state.user_profile_context || "尚未載入使用者資料";

  const prompt = `
  ${agentInstructions}

  --- 系統環境變數 (呼叫工具時請使用) ---
  ${userInfo}
  ${roomInfo}

  --- 系統技能與工具索引 ---
  ${skillsIndex}

  --- 目前的營養學指導原則 (知識庫) ---
  ${nutritionRules}

  --- 使用者檔案 (後端強制載入，請優先依據此資訊回覆) ---
  ${userProfileContext}

  --- 個人化回覆規則 ---
  1) 若有 nickname，請優先以 nickname 稱呼使用者。
  2) 若有身高/體重/年齡/性別，請把建議明確客製化。
  3) 若有 taboo/disease，請避免推薦衝突食物並主動提醒風險。
  4) 若欄位缺漏，先說明「目前缺少哪些資料」，再給保守建議。
  `;


  const systemMessage = { role: "system", content: prompt };

  const MAX_HISTORY_MESSAGES = 10;

  let recentMessages = state.messages;
  if (state.messages.length > MAX_HISTORY_MESSAGES) {
    recentMessages = state.messages.slice(-MAX_HISTORY_MESSAGES);
  }
  const response = await llm.bindTools(agentTools).invoke([systemMessage, ...recentMessages]);

  return { messages: [response] };
};

const workflow = new StateGraph(AgentState)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", (state) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const toolCalls = (lastMessage as { tool_calls?: unknown[] } | undefined)?.tool_calls;
    if (!toolCalls?.length) return END;
    return "tools";
  })
  .addEdge("tools", "agent");

const checkpointer = new MemorySaver();
const agentApp = workflow.compile({
  checkpointer
});

const sendSSE = (res: Response, data: object) => {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const getChunkText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
      return "";
    })
    .join("");
};

const PersistRecordSchema = z.object({
  record_type: z.enum(["chat", "summary"]).default("chat"),
  title: z.string().default("新對話"),
  ai_analysis_report: z.string().default(""),
  summary_text: z.string().optional(),
  diet_report: z.any().optional(),
});

type PersistRecord = z.infer<typeof PersistRecordSchema>;

const recordExtractor = llm.withStructuredOutput(PersistRecordSchema);

const normalizeTitle = (value: string, fallbackText: string): string => {
  const trimmed = value.trim();
  if (trimmed.length > 0) return trimmed.slice(0, 60);
  return fallbackText.trim().slice(0, 60) || "新對話";
};

const fallbackRecord = (userMessage: string, aiResponse: string): PersistRecord => ({
  record_type: "chat",
  title: normalizeTitle(userMessage, userMessage),
  ai_analysis_report: aiResponse.trim(),
});

const extractPersistRecord = async (
  userMessage: string,
  aiResponse: string
): Promise<PersistRecord> => {
  try {
    const structured = await recordExtractor.invoke([
      {
        role: "system",
        content:
          "請將內容轉成資料庫儲存物件。record_type 只能是 chat 或 summary。" +
          "若是摘要，請放在 summary_text，且 ai_analysis_report 必須為空字串。" +
          "若是一般回覆，請放在 ai_analysis_report。title 請精簡在 60 字內。"
      },
      {
        role: "user",
        content:
          `使用者訊息：${userMessage}\n` +
          `AI 最終回覆：${aiResponse}`
      }
    ]);

    return {
      ...structured,
      record_type: structured.record_type ?? "chat",
      title: normalizeTitle(structured.title || "", userMessage),
      ai_analysis_report: (structured.ai_analysis_report || "").trim(),
      summary_text: structured.summary_text?.trim(),
    };
  } catch (error) {
    console.error("Record extraction failed, use fallback:", error);
    return fallbackRecord(userMessage, aiResponse);
  }
};

const persistRecord = async (
  record: PersistRecord,
  context: { thread_id: string; user_id?: string; user_message: string }
) => {
  if (record.record_type === "summary") {
    const summaryPayload = {
      room_id: context.thread_id,
      user_id: context.user_id,
      user_message: context.user_message,
      title: record.title,
      record_type: "summary" as const,
      summary_text: record.summary_text || record.ai_analysis_report || "",
    };
    const result = await logDietTool.invoke(summaryPayload);
    console.log("[persistRecord] summary result:", result);
    return result;
  }

  const chatPayload = {
    room_id: context.thread_id,
    user_id: context.user_id,
    user_message: context.user_message,
    title: record.title,
    ai_analysis_report: record.ai_analysis_report,
    diet_report: record.diet_report ?? null,
    record_type: "chat" as const,
  };
  const result = await logDietTool.invoke(chatPayload);
  console.log("[persistRecord] chat result:", result);
  return result;
};

const formatUserProfileContext = (raw: string, userId?: string): string => {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const nickname = typeof parsed.nickname === "string" && parsed.nickname.trim().length > 0
      ? parsed.nickname.trim()
      : "未提供";
    const height = parsed.height ?? "未提供";
    const weight = parsed.weight ?? "未提供";
    const age = parsed.age ?? "未提供";
    const gender = parsed.gender ?? "未提供";
    const taboo = Array.isArray(parsed.taboo) ? parsed.taboo.join(", ") || "無" : "未提供";
    const disease = Array.isArray(parsed.disease) ? parsed.disease.join(", ") || "無" : "未提供";

    return [
      `user_id: ${userId || "未提供"}`,
      `nickname: ${nickname}`,
      `height: ${height}`,
      `weight: ${weight}`,
      `age: ${age}`,
      `gender: ${gender}`,
      `taboo: ${taboo}`,
      `disease: ${disease}`,
    ].join("\n");
  } catch {
    return `user_id: ${userId || "未提供"}\nprofile_raw: ${raw}`;
  }
};

const fetchUserProfileContext = async (userId?: string): Promise<string> => {
  if (!userId) {
    return "未提供 user_id，無法載入個人資料。請使用中性稱呼並先詢問基本資料。";
  }

  try {
    const result = await getUserProfileTool.invoke({ user_id: userId });
    if (typeof result !== "string") {
      return `user_id: ${userId}\n載入結果格式非字串，請保守回覆。`;
    }
    if (result.includes("讀取使用者資料失敗")) {
      return `user_id: ${userId}\n查無完整個人資料，請先詢問暱稱、身高、體重。`;
    }
    return formatUserProfileContext(result, userId);
  } catch (error) {
    console.error("Fetch profile failed:", error);
    return `user_id: ${userId}\n載入個人資料時發生錯誤，請先詢問關鍵資訊後再客製化。`;
  }
};

// --- API Router ---
app.post('/api/chat', async (req: Request, res: Response) => {
  const { message, thread_id, user_id } = req.body;
  if (!thread_id) return res.status(400).send("Missing thread_id");
  if (!message) return res.status(400).send("Missing message");
  const normalizedUserId = typeof user_id === "string" && user_id.trim().length > 0 ? user_id : undefined;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const config = { configurable: { thread_id } };

  try {
    sendSSE(res, { type: "status", content: "AI 正在載入使用者資料..." });
    const userProfileContext = await fetchUserProfileContext(normalizedUserId);

    const runAgentStream = async (input: any) => {
      const stream = agentApp.streamEvents(input, { ...config, version: "v2" });
      const textByMessageId = new Map<string, string>();
      let latestMessageId: string | null = null;
      let fallbackText = "";

      for await (const event of stream) {
        if (event.event === "on_chat_model_stream") {
          const content = getChunkText(event.data.chunk?.content);
          if (!content) continue;

          const chunkId = event.data.chunk?.id;
          if (typeof chunkId === "string" && chunkId.length > 0) {
            const prev = textByMessageId.get(chunkId) || "";
            // Handle both delta chunks ("你", "好") and cumulative chunks ("你", "你好")
            const next = content.startsWith(prev) ? content : `${prev}${content}`;
            const delta = next.slice(prev.length);
            textByMessageId.set(chunkId, next);
            latestMessageId = chunkId;
            if (delta) {
              sendSSE(res, { type: "text", content: delta });
            }
          } else {
            const next = content.startsWith(fallbackText) ? content : `${fallbackText}${content}`;
            const delta = next.slice(fallbackText.length);
            fallbackText = next;
            if (delta) {
              sendSSE(res, { type: "text", content: delta });
            }
          }
        } else if (event.event === "on_tool_start") {
          sendSSE(res, { type: "status", content: `AI 正在執行工具: ${event.name}...` });
        }
      }

      if (latestMessageId) {
        return textByMessageId.get(latestMessageId) || "";
      }
      return fallbackText;
    };

    const finalVisibleText = await runAgentStream({
      messages: [{ role: "user", content: message }],
      user_id: normalizedUserId || "guest_user",
      room_id: thread_id,
      user_profile_context: userProfileContext,
    });

    sendSSE(res, { type: "done" });
    res.end();

    if (finalVisibleText) {
      void (async () => {
        try {
          const record = await extractPersistRecord(message, finalVisibleText);
          console.log("[persistRecord] extracted record_type:", record.record_type);
          await persistRecord(record, {
            thread_id,
            user_id: normalizedUserId,
            user_message: message
          });
        } catch (persistError) {
          console.error("Background persistence failed:", persistError);
        }
      })();
    }

  } catch (error) {
    console.error("Agent Error:", error);
    res.end();
  }
});

app.post('/api/approve', async (req: Request, res: Response) => {
  res.json({
    status: "not_required",
    message: "目前流程已改為自動執行，不需要 approve。"
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🥦 Diet Manager Agent Server 啟動`);
  console.log(`📍 Thread-based Memory: 啟用 (Supabase Ready)`);
  console.log(`📍 Breakpoints: 停用 (自動工具流程)`);
  console.log(`🚀 API URL: http://localhost:${PORT}/api/chat`);
});

app.use('/images', express.static(path.resolve('./users_images')));

app.post("/api/generate_title", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "No message provided" });

    const response = await llm.invoke([
      {
        role: "system",
        content: "你是一個專業的標題生成器。請將使用者的提問，濃縮成一個代表核心意圖的簡短標題。規則：最長不可超過 8 個字，不需要標點符號，不需要任何解釋。例如使用者輸入『推薦重訓完的宵夜』，你只需回傳『重訓宵夜推薦』。"
      },
      {
        role: "user",
        content: message
      }
    ]);

    res.json({ title: response.content });
  } catch (error) {
    console.error("標題生成失敗:", error);
    res.status(500).json({ title: "新對話" });
  }
});

app.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Pong! Node.js Agent 大腦運作中 🧠',
    timestamp: new Date().toISOString()
  });
});
