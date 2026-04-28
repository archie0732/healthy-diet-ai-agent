import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver, StateGraph, START, END, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage } from '@langchain/core/messages';

import { readKnowledgeTool, updateKnowledgeTool } from '../agent_skills/admin_knowledge/file_tools';
import { visionAnalyzerTool } from '../agent_skills/vision_analyzer/vision_model';
import { calculateNutritionTool } from '../agent_skills/calorie_calculator/calc_tools';

const app = express();
app.use(cors());
app.use(express.json());

// --- 📂 路徑修正區 (精確定位根目錄) ---
const ROOT_DIR = path.resolve(__dirname, '..');
const USERS_IMAGES_DIR = path.join(ROOT_DIR, 'users_images');
const KNOWLEDGE_BASE_DIR = path.join(ROOT_DIR, 'knowledge_base'); // 建議將 skill 放在此統一管理

// 這裡是原本的 prompts 路徑，若你也想移到根目錄請比照辦理
const AGENT_FILE = path.join(KNOWLEDGE_BASE_DIR, 'AGENT.md');
const INDEX_FILE = path.join(KNOWLEDGE_BASE_DIR, 'SKILLS_INDEX.md');
const RULES_FILE = path.join(KNOWLEDGE_BASE_DIR, 'NUTRITION_RULES.md');

// 靜態檔案服務：現在前端可以透過 http://localhost:8001/images/user_123/test3.jpg 存取
app.use('/images', express.static(USERS_IMAGES_DIR));



const PORT = process.env.PORT || 8001;
const AI_API_URL = process.env.AI_API_URL || "http://localhost:8080/v1";

// 引入工具
const tools = [readKnowledgeTool, updateKnowledgeTool, visionAnalyzerTool, calculateNutritionTool];
const toolNode = new ToolNode(tools);

const llm = new ChatOpenAI({
  modelName: "gemma",
  temperature: 0,
  configuration: { baseURL: AI_API_URL },
  apiKey: "dummy",
});

const callModel = async (state: typeof MessagesAnnotation.State) => {
  // 讀取最新的指示與技能
  const agentInstructions = fs.existsSync(AGENT_FILE) ? fs.readFileSync(AGENT_FILE, 'utf-8') : '';
  const skillsIndex = fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf-8') : '';
  const nutritionRules = fs.existsSync(RULES_FILE) ? fs.readFileSync(RULES_FILE, 'utf-8') : '';

  const prompt = `
  ${agentInstructions}

  --- 系統技能與工具索引 ---
  ${skillsIndex}

  --- 目前的營養學指導原則 (知識庫) ---
  ${nutritionRules}
    `;
  const systemMessage = { role: "system", content: prompt };

  const response = await llm.bindTools(tools).invoke([systemMessage, ...state.messages]);
  return { messages: [response] };
};

const workflow = new StateGraph(MessagesAnnotation)
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
  const { message, thread_id } = req.body;
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
    await runAgentStream({ messages: [{ role: "user", content: message }] });

    let state = await agentApp.getState(config);

    let stepCount = 0;
    const MAX_STEPS = 3;

    while (state.next.length > 0 && stepCount < MAX_STEPS) {
      stepCount++;

      const lastMsg = state.values.messages[state.values.messages.length - 1] as AIMessage;
      const needsApproval = lastMsg.tool_calls?.some(tc => tc.name === "update_knowledge_tool");

      if (needsApproval) {
        sendSSE(res, {
          type: "interrupt",
          content: "偵測到敏感操作：寫入系統知識庫，請進行審核。",
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
  const { thread_id, action } = req.body; // action: "approve" | "reject"
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

app.listen(PORT, () => {
  console.log(`\n🥦 Diet Manager Agent Server 啟動`);
  console.log(`📍 Thread-based Memory: 啟用 (Supabase Ready)`);
  console.log(`📍 Breakpoints: 啟用 (write_file)`);
  console.log(`🚀 API URL: http://localhost:${PORT}/api/chat`);
});

app.use('/images', express.static(path.resolve('./users_images')));
