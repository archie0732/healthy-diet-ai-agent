import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatModelSource } from './chatPayload';
import { AI_API_URL } from './supabaseRuntime';
import { LLM_TIMEOUT_MS } from './httpRuntime';

export type ChatProvider = 'google' | 'local';

export const GOOGLE_BASE_URL =
  process.env.GOOGLE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
export const GOOGLE_CHAT_MODEL = process.env.GOOGLE_CHAT_MODEL || 'gemma-4-31b-it';
export const LOCAL_CHAT_MODEL = 'gemma';

export const pickGoogleApiKey = (): string | undefined => {
  return process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY || undefined;
};

export const buildPreferredProviderOrder = (
  modelSource: ChatModelSource,
  hasGoogleKey: boolean
): ChatProvider[] => {
  if (modelSource === 'local') {
    return ['local'];
  }

  if (modelSource === 'google') {
    return hasGoogleKey ? ['google'] : [];
  }

  if (hasGoogleKey) {
    return ['google', 'local'];
  }

  return ['local'];
};

const collectErrorText = (error: unknown): string => {
  if (!error || typeof error !== 'object') {
    return String(error).toLowerCase();
  }

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
    code?: unknown;
    response?: { status?: unknown };
  };

  const pieces = [
    candidate.name,
    candidate.message,
    candidate.status,
    candidate.response?.status,
    candidate.code,
  ]
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .map((value) => String(value).toLowerCase());

  return pieces.join(' ');
};

const hasStandaloneStatusCode = (text: string, codes: number[]): boolean => {
  return codes.some((code) => new RegExp(`(?:^|[^0-9])${code}(?:[^0-9]|$)`).test(text));
};

export const isRetryableGoogleFailure = (error: unknown): boolean => {
  const text = collectErrorText(error);
  const hasRetryableServerStatus = hasStandaloneStatusCode(text, [500, 502, 503, 504]);
  const hasNonRetryableClientStatus = hasStandaloneStatusCode(text, [400, 401, 403]);

  if (hasNonRetryableClientStatus || text.includes('invalid api key')) {
    return false;
  }

  return (
    hasRetryableServerStatus ||
    text.includes('service unavailable') ||
    text.includes('internal error') ||
    text.includes('429') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('rate-limit') ||
    text.includes('too many requests') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('temporary connection') ||
    text.includes('temporarily unavailable') ||
    text.includes('connection reset') ||
    text.includes('econnreset') ||
    text.includes('fetch failed')
  );
};

type RawToolCall = {
  id?: string;
  index?: number;
  extra_content?: unknown;
  [key: string]: unknown;
};

/**
 * Gemini 3 models (e.g. gemini-flash-latest) return a thought_signature in
 * tool_calls[].extra_content and reject the follow-up request with a bare 400
 * if it is not echoed back. ChatOpenAI rebuilds tool_calls from
 * AIMessage.tool_calls and drops extra_content, but it sends
 * additional_kwargs.tool_calls verbatim when tool_calls is empty — so hand it
 * a copy shaped that way. Graph state is left untouched.
 */
export const preserveToolCallExtraContent = <T>(messages: T[]): T[] =>
  messages.map((message) => {
    if (!AIMessage.isInstance(message)) return message;
    const rawToolCalls = message.additional_kwargs?.tool_calls as RawToolCall[] | undefined;
    if (!message.tool_calls?.length || !rawToolCalls?.some((call) => call.extra_content)) {
      return message;
    }

    return new AIMessage({
      content: message.content,
      id: message.id,
      name: message.name,
      tool_calls: [],
      additional_kwargs: {
        ...message.additional_kwargs,
        // `index` only exists on streamed chunks and is not a request field.
        tool_calls: rawToolCalls.map(({ index: _index, ...call }) => call) as NonNullable<
          AIMessage['additional_kwargs']['tool_calls']
        >,
      },
      response_metadata: message.response_metadata,
    }) as BaseMessage as T;
  });

export const createLocalChatModel = () =>
  new ChatOpenAI({
    modelName: LOCAL_CHAT_MODEL,
    temperature: 0,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 0,
    configuration: { baseURL: AI_API_URL },
    apiKey: 'dummy',
  });

export const createGoogleChatModel = (apiKey: string) =>
  new ChatOpenAI({
    modelName: GOOGLE_CHAT_MODEL,
    temperature: 0,
    timeout: LLM_TIMEOUT_MS,
    maxRetries: 0,
    configuration: { baseURL: GOOGLE_BASE_URL },
    apiKey,
  });
