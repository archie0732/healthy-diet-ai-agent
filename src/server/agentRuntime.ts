import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { MemorySaver, StateGraph, START, END, MessagesAnnotation, Annotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';

import { readKnowledgeTool, searchKnowledgeTool, updateKnowledgeTool } from '../../agent_skills/file_tools';
import { visionAnalyzerTool } from '../../agent_skills/vision_model';
import { calculateNutritionTool } from '../../agent_skills/calc_tools';
import { getChatHistoryTool } from '../../agent_skills/db_tools';
import { compressChatHistoryTool } from '../../agent_skills/summarizer_tools';
import {
  parseConversationSummaryToolOutput,
  summarizeConversationTurnTool,
  type ConversationSummaryToolResult,
} from '../../agent_skills/conversation_summary_tool';
import { loadDefaultAgentConfig, type AgentConfig } from '../config/agentConfig';
import { checkWebPageTool, fetchWebPageTool } from '../../agent_skills/fetch_web';
import { toStatusText } from './httpRuntime';
import type { ChatModelSource } from './chatPayload';
import { formatSSEMessage, sendSSE as writeSSE } from './sse';
import {
  buildPreferredProviderOrder,
  createGoogleChatModel,
  createLocalChatModel,
  isRetryableGoogleFailure,
  pickGoogleApiKey,
  preserveToolCallExtraContent,
  type ChatProvider,
} from './modelRouting';
import {
  hasAnyProfileField,
  parseProfileUpdateProposalOutput,
  sanitizeProfileUpdateFields,
  type ProfileUpdateFields,
} from './profileApproval';

export { formatSSEMessage };

const sendSSE = (res: Response, data: object) => {
  const eventName =
    typeof (data as { type?: unknown }).type === 'string'
      ? (data as { type: string }).type
      : undefined;
  writeSSE(res, data, eventName);
};

export const appendStreamChunk = (
  existing: string,
  incoming: string
): { nextText: string; deltaText: string } => {
  if (!incoming) {
    return { nextText: existing, deltaText: '' };
  }

  if (!existing) {
    return { nextText: incoming, deltaText: incoming };
  }

  if (incoming.startsWith(existing)) {
    return {
      nextText: incoming,
      deltaText: incoming.slice(existing.length),
    };
  }

  return {
    nextText: `${existing}${incoming}`,
    deltaText: incoming,
  };
};

const runtimeStatusEmitters = new Map<string, (message: string) => void>();

const emitRuntimeStatus = (runtimeStreamId: string | undefined, message: string) => {
  if (!runtimeStreamId) return;
  runtimeStatusEmitters.get(runtimeStreamId)?.(message);
};

export const getRuntimeStatusEmitterCount = (): number => runtimeStatusEmitters.size;

export const withRuntimeStatusEmitter = async <T>({
  runtimeStreamId,
  res,
  work,
}: {
  runtimeStreamId: string;
  res: Pick<Response, 'write'>;
  work: () => Promise<T> | T;
}): Promise<T> => {
  const sentRuntimeStatuses = new Set<string>();
  runtimeStatusEmitters.set(runtimeStreamId, (message) => {
    if (sentRuntimeStatuses.has(message)) return;
    sentRuntimeStatuses.add(message);
    sendSSE(res as Response, { type: 'status', content: message });
  });

  try {
    return await work();
  } finally {
    runtimeStatusEmitters.delete(runtimeStreamId);
  }
};

const getChunkText = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (
        part &&
        typeof part === 'object' &&
        'text' in part &&
        typeof (part as { text?: unknown }).text === 'string'
      ) {
        return (part as { text: string }).text;
      }
      return '';
    })
    .join('');
};

const getLatestAiTextFromState = (messages: unknown[] | undefined): string => {
  if (!Array.isArray(messages)) return '';

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (!item || typeof item !== 'object') continue;

    const role = (item as { role?: unknown }).role;
    if (role !== 'assistant') continue;

    const content = (item as { content?: unknown }).content;
    const text = getChunkText(content).trim();
    if (text.length > 0) return text;
  }

  return '';
};

export const sanitizeAssistantVisibleText = (message: string): string => {
  if (!message) return '';

  const withoutThoughtBlocks = message.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  const withoutSelfClosingThoughts = withoutThoughtBlocks.replace(/<thought\s*\/>/gi, '');

  return withoutSelfClosingThoughts
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const sanitizeAssistantStreamingText = (message: string): string => {
  if (!message) return '';

  const lowerMessage = message.toLowerCase();
  const openTag = '<thought>';
  const closeTag = '</thought>';
  let output = '';
  let index = 0;
  let insideThought = false;

  while (index < message.length) {
    const remainingLower = lowerMessage.slice(index);

    if (!insideThought) {
      if (remainingLower.startsWith(openTag)) {
        insideThought = true;
        index += openTag.length;
        continue;
      }

      if (openTag.startsWith(remainingLower)) {
        break;
      }

      output += message[index] || '';
      index += 1;
      continue;
    }

    if (remainingLower.startsWith(closeTag)) {
      insideThought = false;
      index += closeTag.length;
      continue;
    }

    if (closeTag.startsWith(remainingLower)) {
      break;
    }

    index += 1;
  }

  return output;
};

const getLanguageInstruction = (language: AgentConfig['responseStyle']['language']): string => {
  if (language === 'zh-TW') {
    return 'Use Traditional Chinese.';
  }

  return `Use ${language}.`;
};

const getParagraphStyleInstruction = (
  paragraphStyle: AgentConfig['responseStyle']['paragraphStyle']
): string => {
  if (paragraphStyle === 'short') {
    return 'Use short paragraphs.';
  }

  if (paragraphStyle === 'medium') {
    return 'Use medium-length paragraphs.';
  }

  return 'Use longer paragraphs when needed.';
};

const getToolJsonInstruction = (language: AgentConfig['responseStyle']['language']): string => {
  if (language === 'zh-TW') {
    return 'If tool outputs JSON, convert it into concise Traditional Chinese explanation.';
  }

  return `If tool outputs JSON, convert it into concise explanation in ${language}.`;
};

export const buildResponseFormatInstructions = (
  responseStyle: AgentConfig['responseStyle']
): string => {
  const lines = [
    'Match this response format exactly:',
    `- ${getLanguageInstruction(responseStyle.language)}`,
    `- ${getParagraphStyleInstruction(responseStyle.paragraphStyle)}`,
    responseStyle.useNumberedListsForAdvice
      ? '- When listing concrete advice, use numbered lists.'
      : '- When listing concrete advice, prefer plain paragraphs or simple bullets.',
    '- Keep headings minimal; only add one short heading when it helps.',
    responseStyle.allowMarkdownTables
      ? '- Markdown tables are allowed only when they make the answer clearer.'
      : '- Do not output markdown tables.',
    responseStyle.allowRawJson
      ? '- Raw JSON is allowed only when the user explicitly asks for it.'
      : '- Do not output raw JSON.',
    `- ${getToolJsonInstruction(responseStyle.language)}`,
    '- End cleanly without meta commentary about formatting or model choice.',
  ];

  return lines.join('\n');
};

export const buildResponseStylePromptSection = (
  responseStyle: AgentConfig['responseStyle']
): string[] => ['--- Response Style ---', buildResponseFormatInstructions(responseStyle)];

export const buildCallModelResponseStylePromptLines = (
  responseStyle: AgentConfig['responseStyle']
): string[] => buildResponseStylePromptSection(responseStyle);

const getCompatibleSkillsIndexCandidates = (skillsIndexFile: string): string[] => {
  const directory = path.dirname(skillsIndexFile);
  const baseName = path.basename(skillsIndexFile);

  const candidates = [skillsIndexFile];
  if (baseName === 'SKILL_INDEX.md') {
    candidates.push(path.join(directory, 'SKILLS_INDEX.md'));
  } else if (baseName === 'SKILLS_INDEX.md') {
    candidates.push(path.join(directory, 'SKILL_INDEX.md'));
  }

  return Array.from(new Set(candidates));
};

export const resolveAgentRuntimePromptPaths = (
  config: Pick<AgentConfig, 'agent'>
): {
  systemPromptFile: string;
  skillsIndexCandidates: string[];
  rulesFile: string;
} => ({
  systemPromptFile: config.agent.systemPromptFile,
  skillsIndexCandidates: getCompatibleSkillsIndexCandidates(config.agent.skillsIndexFile),
  rulesFile: config.agent.rulesFile,
});

export const loadAgentRuntimeSkillsIndexText = (config: Pick<AgentConfig, 'agent'>): string => {
  const promptPaths = resolveAgentRuntimePromptPaths(config);
  return readOptionalFile(...promptPaths.skillsIndexCandidates);
};

const hasAnalyzeFoodToolResult = (messages: unknown[] | undefined): boolean => {
  if (!Array.isArray(messages)) return false;

  return messages.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const role = (item as { role?: unknown }).role;
    const name = (item as { name?: unknown }).name;
    if (role === 'tool' && name === 'analyze_food_image') return true;

    const lcKwargsName = (item as { lc_kwargs?: { name?: unknown } }).lc_kwargs?.name;
    if (lcKwargsName === 'analyze_food_image') return true;

    return false;
  });
};

const getLatestUserTextFromState = (messages: unknown[] | undefined): string => {
  if (!Array.isArray(messages)) return '';

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (!item || typeof item !== 'object') continue;

    const role = (item as { role?: unknown }).role;
    if (role !== 'user') continue;

    const content = (item as { content?: unknown }).content;
    const text = getChunkText(content).trim();
    if (text.length > 0) return text;
  }

  return '';
};

export const isCapabilityQuestion = (message: string): boolean => {
  const normalized = message.toLowerCase().replace(/\s+/g, '');
  if (!normalized) return false;

  const capabilityPatterns = [
    '你有什麼功能',
    '你有什麼能力',
    '你會什麼',
    '你會做什麼',
    '你能做什麼',
    '有哪些功能',
    '有哪些能力',
    '可以做什麼',
    '支援什麼',
    'help',
    'capabilities',
    'features',
    'whatcanyoudo',
  ];

  return capabilityPatterns.some((pattern) => normalized.includes(pattern));
};

const hasToolResult = (messages: unknown[] | undefined, toolName: string): boolean => {
  if (!Array.isArray(messages)) return false;

  return messages.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const role = (item as { role?: unknown }).role;
    const name = (item as { name?: unknown }).name;
    if (role === 'tool' && name === toolName) return true;

    const lcKwargsName = (item as { lc_kwargs?: { name?: unknown } }).lc_kwargs?.name;
    return lcKwargsName === toolName;
  });
};

const readOptionalFile = (...filePaths: string[]): string => {
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    return fs.readFileSync(filePath, 'utf-8');
  }
  return '';
};

const extractSkillDescriptions = (skillsIndex: string): Map<string, string> => {
  const descriptions = new Map<string, string>();
  const matches = skillsIndex.matchAll(/`([^`]+)`\s*[:：]\s*([^\r\n]+)/g);

  for (const match of matches) {
    const toolName = match[1]?.trim();
    const description = match[2]?.trim();
    if (!toolName || !description) continue;
    descriptions.set(toolName, description);
  }

  return descriptions;
};

export const buildCapabilitiesSummary = ({
  toolNames,
  skillsIndex,
}: {
  toolNames: string[];
  skillsIndex: string;
}): string => {
  const descriptions = extractSkillDescriptions(skillsIndex);
  const lines = toolNames.map((toolName) => {
    const description = descriptions.get(toolName) || '已註冊可用工具';
    return `- ${toolName}: ${description}`;
  });

  return [
    '請只根據以下已註冊能力回答，不要補充未列出的外部能力。',
    ...lines,
  ].join('\n');
};

const REGISTERED_CAPABILITY_TOOL_NAMES = [
  'search_knowledge_tool',
  'read_knowledge_tool',
  'update_knowledge_tool',
  'analyze_food_image',
  'calculate_nutrition',
  'check_web_page',
  'fetch_web_page',
  'get_chat_history',
  'propose_profile_update',
  'compress_chat_history',
  'summarize_conversation_turn',
  'list_capabilities_tool',
];

const proposeProfileUpdateTool = tool(
  async ({
    nickname_to_set,
    avatar_url_to_set,
    height_to_set,
    weight_to_set,
    age_to_set,
    gender_to_set,
    taboo_to_add,
    disease_to_add,
    taboo_to_remove,
    disease_to_remove,
    reason,
  }) => {
    const fields = sanitizeProfileUpdateFields({
      nickname_to_set,
      avatar_url_to_set,
      height_to_set,
      weight_to_set,
      age_to_set,
      gender_to_set,
      taboo_to_add,
      disease_to_add,
      taboo_to_remove,
      disease_to_remove,
    });

    return JSON.stringify({
      should_request_approval: hasAnyProfileField(fields),
      reason: typeof reason === 'string' ? reason.trim() : '',
      fields,
    });
  },
  {
    name: 'propose_profile_update',
    description:
      'Propose profile fields that require explicit user approval before writing to database. Only use when user clearly provided concrete new profile info.',
    schema: z.object({
      nickname_to_set: z.string().trim().optional(),
      avatar_url_to_set: z.string().trim().optional(),
      height_to_set: z.number().positive().optional(),
      weight_to_set: z.number().positive().optional(),
      age_to_set: z.number().positive().optional(),
      gender_to_set: z.string().trim().optional(),
      taboo_to_add: z.string().trim().optional(),
      disease_to_add: z.string().trim().optional(),
      taboo_to_remove: z.string().trim().optional(),
      disease_to_remove: z.string().trim().optional(),
      reason: z.string().trim().optional(),
    }),
  }
);

const listCapabilitiesTool = tool(
  async () => {
    const agentConfig = await loadDefaultAgentConfig();
    const skillsIndex = loadAgentRuntimeSkillsIndexText(agentConfig);

    return buildCapabilitiesSummary({
      toolNames: REGISTERED_CAPABILITY_TOOL_NAMES,
      skillsIndex,
    });
  },
  {
    name: 'list_capabilities_tool',
    description:
      'List the assistant capabilities strictly from currently registered tools and the local skills index. Use this before answering questions about what the assistant can do.',
    schema: z.object({}),
  }
);

const agentTools = [
  searchKnowledgeTool,
  readKnowledgeTool,
  updateKnowledgeTool,
  visionAnalyzerTool,
  calculateNutritionTool,
  checkWebPageTool,
  fetchWebPageTool,
  getChatHistoryTool,
  proposeProfileUpdateTool,
  compressChatHistoryTool,
  summarizeConversationTurnTool,
  listCapabilitiesTool,
];
const toolNode = new ToolNode(agentTools);

export const llm = createLocalChatModel();

export type AgentModelAttempt = {
  provider: ChatProvider;
  reason: 'selected' | 'fallback';
};

type StructuredOutputModel = {
  withStructuredOutput: <TSchema extends z.ZodTypeAny>(schema: TSchema) => {
    invoke: (input: unknown) => Promise<z.infer<TSchema>>;
  };
};

export const buildAgentModelAttemptPlan = (
  modelSource: ChatModelSource,
  hasGoogleKey: boolean
): AgentModelAttempt[] => {
  return buildPreferredProviderOrder(modelSource, hasGoogleKey).map((provider, index) => ({
    provider,
    reason: index === 0 ? 'selected' : 'fallback',
  }));
};

export const createLocalOnlyStructuredOutputBinder = (
  model: StructuredOutputModel = llm as unknown as StructuredOutputModel
) => ({
  withStructuredOutput: <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
    model.withStructuredOutput(schema),
});

export const invokeStructuredOutputWithRouting = async <TSchema extends z.ZodTypeAny>({
  modelSource,
  googleApiKey,
  schema,
  prompt,
  onStatus,
  createStructuredInvoker,
}: {
  modelSource: ChatModelSource;
  googleApiKey?: string;
  schema: TSchema;
  prompt: unknown;
  onStatus?: (message: string) => void;
  createStructuredInvoker?: (
    provider: ChatProvider
  ) => { invoke: (input: unknown) => Promise<z.infer<TSchema>> };
}): Promise<{ provider: ChatProvider; value: z.infer<TSchema> }> => {
  return invokeWithModelRouting({
    modelSource,
    googleApiKey,
    onStatus,
    invokeProvider: async (provider) => {
      const invoker =
        createStructuredInvoker?.(provider) ||
        (((provider === 'google' && googleApiKey ? createGoogleChatModel(googleApiKey) : llm) as
          unknown as StructuredOutputModel).withStructuredOutput(schema));

      return invoker.invoke(prompt);
    },
  });
};

export const invokeWithModelRouting = async <T>({
  modelSource,
  googleApiKey,
  onStatus,
  invokeProvider,
}: {
  modelSource: ChatModelSource;
  googleApiKey?: string;
  onStatus?: (message: string) => void;
  invokeProvider: (provider: ChatProvider) => Promise<T>;
}): Promise<{ provider: ChatProvider; value: T }> => {
  const attempts = buildAgentModelAttemptPlan(modelSource, Boolean(googleApiKey));
  const selectedProvider = attempts[0]?.provider;

  if (!selectedProvider) {
    if (modelSource === 'google') {
      throw new Error('Google model requested but GEMINI_AI_API/GEMINI_API_KEY is not configured.');
    }
    throw new Error('No chat model provider available.');
  }

  onStatus?.(`Model selected: ${selectedProvider}`);

  for (let index = 0; index < attempts.length; index += 1) {
    const currentAttempt = attempts[index];
    const nextAttempt = attempts[index + 1];
    if (!currentAttempt) continue;

    try {
      onStatus?.(`Provider ${currentAttempt.provider}: requesting model response`);
      const value = await invokeProvider(currentAttempt.provider);
      onStatus?.(`Provider ${currentAttempt.provider}: response received`);
      return { provider: currentAttempt.provider, value };
    } catch (error) {
      const shouldFallback =
        currentAttempt.provider === 'google' &&
        nextAttempt?.provider === 'local' &&
        isRetryableGoogleFailure(error);

      if (shouldFallback) {
        onStatus?.('Google upstream failed, falling back to local model.');
        continue;
      }

      throw error;
    }
  }

  throw new Error('No chat model provider completed successfully.');
};

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  user_id: Annotation<string>(),
  room_id: Annotation<string>(),
  user_profile_context: Annotation<string>(),
  image_path: Annotation<string>(),
  model_source: Annotation<ChatModelSource>(),
  runtime_stream_id: Annotation<string>(),
});

const callModel = async (state: typeof AgentState.State) => {
  const agentConfig = await loadDefaultAgentConfig();
  const promptPaths = resolveAgentRuntimePromptPaths(agentConfig);
  const agentInstructions = readOptionalFile(promptPaths.systemPromptFile);
  const skillsIndex = loadAgentRuntimeSkillsIndexText(agentConfig);
  const nutritionRules = readOptionalFile(promptPaths.rulesFile);

  const userInfo = state.user_id
    ? `Current user id: ${state.user_id}`
    : 'Current user id is missing.';
  const roomInfo = state.room_id
    ? `Current room id: ${state.room_id}`
    : 'Current room id is missing.';
  const userProfileContext = state.user_profile_context || 'No extra user context provided.';
  const imagePath = state.image_path || '';
  const latestUserText = getLatestUserTextFromState(state.messages as unknown[]);
  const needsImageToolCall = Boolean(imagePath) && !hasAnalyzeFoodToolResult(state.messages as unknown[]);
  const needsCapabilityToolCall =
    isCapabilityQuestion(latestUserText) &&
    !hasToolResult(state.messages as unknown[], 'list_capabilities_tool');

  const prompt = [
    agentInstructions,
    '',
    '--- Runtime Context ---',
    userInfo,
    roomInfo,
    '',
    '--- Skills Index ---',
    skillsIndex,
    '',
    '--- Nutrition Rules ---',
    nutritionRules,
    '',
    '--- User Profile + Conversation Summary Context ---',
    userProfileContext,
    '',
    '--- Image Context ---',
    imagePath
      ? [
          `Attached image path: ${imagePath}`,
          needsImageToolCall
            ? 'You MUST call tool analyze_food_image exactly once with this exact imagePath before your final answer.'
            : 'Image tool result is already available in message history. Use it for your final answer.',
        ].join('\n')
      : 'No image attached in this request.',
    '',
    ...buildCallModelResponseStylePromptLines(agentConfig.responseStyle),
    'If the user asks what you can do, what features you have, or what capabilities are available, call list_capabilities_tool first and answer strictly from that result.',
    'When describing your capabilities, do not claim any feature that is not present in list_capabilities_tool output or explicit runtime instructions.',
    'For factual health/nutrition/food-safety claims, call search_knowledge_tool first, then answer with cited source_path values.',
    'When search_knowledge_tool returns relevant hits, prioritize those sources and mention uncertainty if evidence is weak.',
    'When dish_name and ingredients exist, summarize dish and estimated calories in plain text.',
    'If user asks whether a URL/page is valid/correct/reachable (e.g., 這個網頁是對的嗎), call check_web_page first, then answer based on status/final_url/title.',
    'If user message contains multiple URLs, verify only the first URL and clearly state that other URLs were ignored in this turn.',
    'If user message contains one or more URLs and asks whether claims are reasonable/correct/trustworthy, call fetch_web_page for the most relevant URL before giving a conclusion.',
    'When URL content cannot be fetched, clearly say verification is limited and ask the user for a clearer source page.',
    'Treat the room summary index as the primary lightweight memory for prior conversation.',
    'If the room summary index is enough to answer a recap question, do not fetch raw chat history.',
    'If the user asks for a specific day, meal, person, or missing detail, call get_chat_history with chat_history_ids or date_from/date_to to expand only the relevant raw turns.',
    'If a user question is unclear, missing key context, or based on an unspecified source, ask the user to provide the source website URL in the input box before giving a definitive answer.',
    'When asking for clarification, explicitly request: 請在輸入框貼上來源網站連結（URL）。',
    '',
    '--- Profile Update Policy ---',
    'Decide autonomously whether profile update is needed; do not force updates every turn.',
    'If user clearly provides NEW self-profile information, state the suggested changes briefly.',
    'When you detect concrete new profile fields, call tool propose_profile_update exactly once before final answer.',
    'Food dislikes / cannot eat / religion restrictions / wants to reduce specific foods should be treated as taboo_to_add when concrete items are provided.',
    'If user clearly says a previous taboo/disease should be removed, use taboo_to_remove or disease_to_remove with a concrete item.',
    'Do NOT call propose_profile_update for ambiguous questions without concrete values (e.g., 我不喜歡吃什麼？, 我要少吃什麼？).',
    'Actual database update requires user approval and is handled by backend approval flow.',
    'Supported profile fields: nickname, avatar_url, height, weight, age, gender, taboo, disease.',
    'Do not update profile for guesses, hypotheticals, or unclear statements.',
    'If information is ambiguous, ask a short confirmation question.',
    'When no new profile info is provided, continue normal conversation.',
    'Call summarize_conversation_turn only after you have already formed the final assistant answer and only when the completed turn has durable future value.',
    'Do not call summarize_conversation_turn for greetings, retries, temporary failures, or low-information exchanges.',
  ].join('\n');

  const systemMessage = { role: 'system', content: prompt };

  const MAX_HISTORY_MESSAGES = 10;
  let recentMessages = state.messages;
  if (state.messages.length > MAX_HISTORY_MESSAGES) {
    recentMessages = state.messages.slice(-MAX_HISTORY_MESSAGES);
  }

  const googleApiKey = pickGoogleApiKey();
  const { value: response } = await invokeWithModelRouting({
    modelSource: state.model_source || 'auto',
    googleApiKey,
    onStatus: (message) => emitRuntimeStatus(state.runtime_stream_id, message),
    invokeProvider: async (provider) => {
      const baseModel =
        provider === 'google' && googleApiKey ? createGoogleChatModel(googleApiKey) : llm;
      const toolChoice = needsImageToolCall
        ? 'analyze_food_image'
        : needsCapabilityToolCall
          ? 'list_capabilities_tool'
          : undefined;
      const modelWithTools = toolChoice
        ? baseModel.bindTools(agentTools, { tool_choice: toolChoice })
        : baseModel.bindTools(agentTools);

      emitRuntimeStatus(state.runtime_stream_id, `Provider ${provider}: stream opened`);
      return modelWithTools.invoke([systemMessage, ...preserveToolCallExtraContent(recentMessages)]);
    },
  });
  return { messages: [response] };
};

const workflow = new StateGraph(AgentState)
  .addNode('agent', callModel)
  .addNode('tools', toolNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', (state) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const toolCalls = (lastMessage as { tool_calls?: unknown[] } | undefined)?.tool_calls;
    if (!toolCalls?.length) return END;
    return 'tools';
  })
  .addEdge('tools', 'agent');

const checkpointer = new MemorySaver();
const agentApp = workflow.compile({
  checkpointer,
});

export const runAgentStream = async (
  res: Response,
  config: { configurable: { thread_id: string } },
  input: {
    messages: Array<{ role: 'user'; content: string }>;
    user_id: string;
    room_id: string;
    user_profile_context: string;
    image_path: string;
    model_source: ChatModelSource;
  }
): Promise<{
  finalText: string;
  streamedTextDelivered: boolean;
  toolTraces: Array<{ name: string; status: 'running' | 'success' | 'error'; result?: string }>;
  approvalProposals: ProfileUpdateFields[];
  summaryProposals: ConversationSummaryToolResult[];
}> => {
  const runtimeStreamId = `${config.configurable.thread_id}:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const textByMessageId = new Map<string, string>();
  const visibleTextByMessageId = new Map<string, string>();
  const toolTraces: Array<{ name: string; status: 'running' | 'success' | 'error'; result?: string }> = [];
  const approvalProposals: ProfileUpdateFields[] = [];
  const summaryProposals: ConversationSummaryToolResult[] = [];
  let latestMessageId: string | null = null;
  let fallbackRawText = '';
  let fallbackVisibleText = '';
  let streamedTextDelivered = false;

  return withRuntimeStatusEmitter({
    runtimeStreamId,
    res,
    work: async () => {
      const stream = agentApp.streamEvents(
        {
          ...input,
          runtime_stream_id: runtimeStreamId,
        },
        { ...config, version: 'v2' }
      );

    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream') {
        const content = getChunkText(event.data.chunk?.content);
        if (!content) continue;

        let deltaText = '';
        const chunkId = event.data.chunk?.id;
        if (typeof chunkId === 'string' && chunkId.length > 0) {
          const prev = textByMessageId.get(chunkId) || '';
          const updated = appendStreamChunk(prev, content);
          textByMessageId.set(chunkId, updated.nextText);
          const nextVisibleText = sanitizeAssistantStreamingText(updated.nextText);
          const prevVisibleText = visibleTextByMessageId.get(chunkId) || '';
          const visibleUpdate = appendStreamChunk(prevVisibleText, nextVisibleText);
          visibleTextByMessageId.set(chunkId, nextVisibleText);
          deltaText = visibleUpdate.deltaText;
          latestMessageId = chunkId;
        } else {
          const updated = appendStreamChunk(fallbackRawText, content);
          fallbackRawText = updated.nextText;
          const nextVisibleText = sanitizeAssistantStreamingText(fallbackRawText);
          const visibleUpdate = appendStreamChunk(fallbackVisibleText, nextVisibleText);
          fallbackVisibleText = nextVisibleText;
          deltaText = visibleUpdate.deltaText;
        }

        if (deltaText) {
          streamedTextDelivered = true;
          sendSSE(res, { type: 'text', content: deltaText });
        }
      } else if (event.event === 'on_tool_start') {
        const toolName = event.name || 'unknown_tool';
        toolTraces.push({ name: toolName, status: 'running' });
        sendSSE(res, { type: 'status', content: `Tool ${toolName}: running` });
      } else if (event.event === 'on_tool_end') {
        const toolName = event.name || 'unknown_tool';
        const toolOutput = (event.data as { output?: unknown } | undefined)?.output;
        const resultPreview = toStatusText(toolOutput);
        const traceIndex = [...toolTraces]
          .reverse()
          .findIndex((trace) => trace.name === toolName && trace.status === 'running');

        if (traceIndex >= 0) {
          const actualIndex = toolTraces.length - 1 - traceIndex;
          toolTraces[actualIndex] = { name: toolName, status: 'success', result: resultPreview };
        } else {
          toolTraces.push({ name: toolName, status: 'success', result: resultPreview });
        }

        sendSSE(res, { type: 'status', content: `Tool ${toolName}: success` });
        if (resultPreview) {
          sendSSE(res, { type: 'status', content: `Tool ${toolName} result: ${resultPreview}` });
        }
        if (toolName === 'propose_profile_update') {
          const proposal = parseProfileUpdateProposalOutput(toolOutput);
          if (proposal) {
            approvalProposals.push(proposal);
            sendSSE(res, { type: 'status', content: 'Profile update proposal detected.' });
          } else {
            console.warn(
              `Failed to parse propose_profile_update output: ${toStatusText(toolOutput, 600)}`
            );
          }
        } else if (toolName === 'summarize_conversation_turn') {
          const summaryProposal = parseConversationSummaryToolOutput(toolOutput);
          if (summaryProposal) {
            summaryProposals.push(summaryProposal);
            sendSSE(res, {
              type: 'status',
              content: `Conversation summary proposal: ${summaryProposal.reason}`,
            });
          } else {
            console.warn(
              `Failed to parse summarize_conversation_turn output: ${toStatusText(toolOutput, 600)}`
            );
          }
        }
      } else if (event.event === 'on_tool_error') {
        const toolName = event.name || 'unknown_tool';
        const errorPreview = toStatusText((event.data as { error?: unknown } | undefined)?.error);
        const traceIndex = [...toolTraces]
          .reverse()
          .findIndex((trace) => trace.name === toolName && trace.status === 'running');

        if (traceIndex >= 0) {
          const actualIndex = toolTraces.length - 1 - traceIndex;
          toolTraces[actualIndex] = { name: toolName, status: 'error', result: errorPreview };
        } else {
          toolTraces.push({ name: toolName, status: 'error', result: errorPreview });
        }

        sendSSE(res, { type: 'status', content: `Tool ${toolName}: error` });
        if (errorPreview) {
          sendSSE(res, { type: 'status', content: `Tool ${toolName} error: ${errorPreview}` });
        }
      }
    }

    const streamedText = latestMessageId
      ? textByMessageId.get(latestMessageId) || ''
      : fallbackRawText;
    const sanitizedStreamedText = sanitizeAssistantVisibleText(streamedText);

    if (sanitizedStreamedText.length > 0) {
      return {
        finalText: sanitizedStreamedText,
        streamedTextDelivered,
        toolTraces,
        approvalProposals,
        summaryProposals,
      };
    }

    try {
      const snapshot = await agentApp.getState(config);
      const stateMessages = (snapshot?.values as { messages?: unknown[] } | undefined)?.messages;
      const recoveredText = sanitizeAssistantVisibleText(getLatestAiTextFromState(stateMessages));
      if (recoveredText.length > 0) {
        return {
          finalText: recoveredText,
          streamedTextDelivered,
          toolTraces,
          approvalProposals,
          summaryProposals,
        };
      }
    } catch (stateError) {
      console.error('Failed to recover final assistant text from state:', stateError);
    }
    return { finalText: '', streamedTextDelivered, toolTraces, approvalProposals, summaryProposals };
    },
  });
};
