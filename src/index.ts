import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver, StateGraph, START, END, MessagesAnnotation, Annotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage } from '@langchain/core/messages';

import { readKnowledgeTool, updateKnowledgeTool } from '../agent_skills/admin_knowledge/file_tools';
import { visionAnalyzerTool } from '../agent_skills/vision_analyzer/vision_model';
import { calculateNutritionTool } from '../agent_skills/calorie_calculator/calc_tools';
import { logDietTool, getChatHistoryTool, getUserProfileTool } from '../agent_skills/supabase_logger/db_tools';
import { updateUserProfileTool } from '../agent_skills/memory_summarizer/summarizer_tools';

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

// 引入工具
const tools = [readKnowledgeTool, updateKnowledgeTool, visionAnalyzerTool, calculateNutritionTool, logDietTool, getChatHistoryTool, getUserProfileTool, updateUserProfileTool];
const toolNode = new ToolNode(tools);

const llm = new ChatOpenAI({
  modelName: "gemma",
  temperature: 0,
  configuration: { baseURL: AI_API_URL },
  apiKey: "dummy",
});

// 🌟 移除了 user_context，保持乾淨
const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  user_id: Annotation<string>(),
  room_id: Annotation<string>(),
});

const callModel = async (state: typeof AgentState.State) => {
  const agentInstructions = fs.existsSync(AGENT_FILE) ? fs.readFileSync(AGENT_FILE, 'utf-8') : '';
  const skillsIndex = fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf-8') : '';
  const nutritionRules = fs.existsSync(RULES_FILE) ? fs.readFileSync(RULES_FILE, 'utf-8') : '';

  const currentUser = state.user_id ? `\n目前服務的使用者 ID: ${state.user_id}` : '';

  // 🌟 加入絕對指令，逼迫 Agent 自己用工具查資料和寫資料
  const prompt = `
  ${agentInstructions}
  ${currentUser}

  ⚠️ 系統核心指令：
  1. 你具備讀取與寫入資料庫的能力。
  2. 絕對不要告訴使用者「我不知道你的名字或資料」。當你需要了解使用者的基本資料、目標或習慣時，請主動呼叫對應的工具 (例如 readKnowledgeTool) 並傳入 user_id 進行查詢。
  3. 結束指令時，請自動整理好熱量與營養素，並呼叫 logDietTool 將資料寫入資料庫。

  --- 系統技能與工具索引 ---
  ${skillsIndex}

  --- 目前的營養學指導原則 (知識庫) ---
  ${nutritionRules}
  `;

  const systemMessage = { role: "system", content: prompt };

  const MAX_HISTORY_MESSAGES = 10;

  let recentMessages = state.messages;
  if (state.messages.length > MAX_HISTORY_MESSAGES) {
    recentMessages = state.messages.slice(-MAX_HISTORY_MESSAGES);
  }
  const response = await llm.bindTools(tools).invoke([systemMessage, ...recentMessages]);

  return { messages: [response] };
};

const workflow = new StateGraph(AgentState)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", (state) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || !(lastMessage as AIMessage).tool_calls?.length) return END;
    return "tools";
  })
  .addEdge("tools", "agent");

const checkpointer = new MemorySaver();
const agentApp = workflow.compile({
  checkpointer,
  interruptBefore: ["tools"]
});

const sendSSE = (res: Response, data: object) => {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

// --- API Router ---
app.post('/api/chat', async (req: Request, res: Response) => {
  // 🌟 這裡修正了：乾淨的解構，不再依賴前端的 user_context
  const { message, thread_id, user_id } = req.body;
  if (!thread_id) return res.status(400).send("Missing thread_id");

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const config = { configurable: { thread_id } };

  try {
    const runAgentStream = async (input: any) => {
      const stream = agentApp.streamEvents(input, { ...config, version: "v2" });
      for await (const event of stream) {
        if (event.event === "on_chat_model_stream") {
          const content = event.data.chunk?.content;
          if (content) sendSSE(res, { type: "text", content });
        } else if (event.event === "on_tool_start") {
          sendSSE(res, { type: "status", content: `AI 正在執行工具: ${event.name}...` });
        }
      }
    };

    await runAgentStream({
      messages: [{ role: "user", content: message }],
      user_id: user_id || "guest_user",
      room_id: thread_id
    });

    let state = await agentApp.getState(config);

    let stepCount = 0;
    const MAX_STEPS = 3;

    while (state.next.length > 0 && stepCount < MAX_STEPS) {
      stepCount++;

      const lastMsg = state.values.messages[state.values.messages.length - 1] as AIMessage;
      const isKnowledgeUpdate = lastMsg.tool_calls?.some(tc => tc.name === "update_knowledge_tool");
      const isProfileUpdate = lastMsg.tool_calls?.some(tc => tc.name === "update_user_profile");

      if (isKnowledgeUpdate || isProfileUpdate) {
        const alertMessage = isKnowledgeUpdate ? '寫入系統知識庫' : '更新用戶資料';
        sendSSE(res, {
          type: "interrupt",
          content: alertMessage,
          pending_tools: state.next
        });
        break;
      } else {
        sendSSE(res, { type: "status", content: "AI 正在思考中..." });
        await runAgentStream(null);
        state = await agentApp.getState(config);
      }
    }

    sendSSE(res, { type: "done" });
    res.end();

  } catch (error) {
    console.error("Agent Error:", error);
    res.end();
  }
});

app.post('/api/approve', async (req: Request, res: Response) => {
  const { thread_id, action } = req.body;
  const config = { configurable: { thread_id } };

  if (action === "approve") {
    await agentApp.updateState(config, null);
    const result = await agentApp.invoke(null, config);

    const finalMessage = result.messages[result.messages.length - 1];
    const finalContent = finalMessage?.content || "任務已繼續執行";
    res.json({ status: "approved", result: finalContent });
  } else {
    res.json({ status: "rejected", message: "操作已取消" });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🥦 Diet Manager Agent Server 啟動`);
  console.log(`📍 Thread-based Memory: 啟用 (Supabase Ready)`);
  console.log(`📍 Breakpoints: 啟用 (write_file)`);
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