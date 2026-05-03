import { tool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { load } from 'cheerio';

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_CHARS = 18000;
const DEFAULT_CHUNK_SIZE = 3000;
const DEFAULT_MAX_CHUNKS = 6;
const DEFAULT_SUMMARY_MAX_TOKENS = 280;
const DEFAULT_FINAL_MAX_TOKENS = 520;

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const toContentText = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join(' ')
      .trim();
  }
  return String(content ?? '');
};

const splitIntoChunks = (
  text: string,
  chunkSize: number,
  maxChunks: number
): string[] => {
  if (!text) return [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length && chunks.length < maxChunks; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
};

const buildSummarizer = (summaryMaxTokens: number): ChatOpenAI =>
  new ChatOpenAI({
    modelName: process.env.FETCH_SUMMARY_MODEL || 'gemma-4-e4b',
    temperature: 0.1,
    maxTokens: summaryMaxTokens,
    apiKey: process.env.AI_API_KEY || 'dummy',
    configuration: { baseURL: process.env.AI_API_URL || 'http://localhost:8080/v1' }
  });

const summarizeChunk = async (
  llm: ChatOpenAI,
  chunk: string,
  chunkIndex: number,
  totalChunks: number
): Promise<string> => {
  const response = await llm.invoke([
    new SystemMessage(
      'You are a compression worker. Summarize only key facts, numbers, claims, and actionable points. Keep output concise.'
    ),
    new HumanMessage(
      [
        `Chunk ${chunkIndex}/${totalChunks}.`,
        'Return 4-8 bullet points, no prose intro.',
        '',
        chunk
      ].join('\n')
    )
  ]);

  return normalizeWhitespace(toContentText(response.content));
};

const summarizeFinal = async (
  llm: ChatOpenAI,
  title: string,
  url: string,
  chunkSummaries: string[]
): Promise<string> => {
  const response = await llm.invoke([
    new SystemMessage(
      'You are a merger worker. Combine worker outputs into a single compact summary for a parent agent.'
    ),
    new HumanMessage(
      [
        `URL: ${url}`,
        `Title: ${title || '(untitled)'}`,
        'Produce JSON with fields:',
        '- summary (string, <= 180 words)',
        '- key_points (array, max 8)',
        '- numbers (array of important numeric facts, max 8)',
        '- caveats (array, max 5)',
        '',
        chunkSummaries.join('\n')
      ].join('\n')
    )
  ]);

  return toContentText(response.content).trim();
};

export const fetchWebPageTool = tool(
  async ({
    url,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxChars = DEFAULT_MAX_CHARS,
    chunkSize = DEFAULT_CHUNK_SIZE,
    maxChunks = DEFAULT_MAX_CHUNKS,
    summaryMaxTokens = DEFAULT_SUMMARY_MAX_TOKENS,
    finalMaxTokens = DEFAULT_FINAL_MAX_TOKENS
  }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        return `Fetch failed: ${response.status} ${response.statusText} (${url})`;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('text/html')) {
        return `Unsupported content-type: ${contentType || 'unknown'} (${url})`;
      }

      const html = await response.text();
      const $ = load(html);
      const pageTitle = normalizeWhitespace($('title').text());
      const bodyText = normalizeWhitespace($('body').text());
      const clippedText = bodyText.slice(0, maxChars);

      if (!clippedText) {
        return JSON.stringify(
          {
            url,
            title: pageTitle || null,
            status: 'empty_body',
            final_summary: null
          },
          null,
          2
        );
      }

      const chunks = splitIntoChunks(clippedText, chunkSize, maxChunks);
      const childLlm = buildSummarizer(summaryMaxTokens);
      const finalLlm = buildSummarizer(finalMaxTokens);

      const chunkSummaries: string[] = [];
      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        if (!chunk) continue;
        const chunkSummary = await summarizeChunk(childLlm, chunk, i + 1, chunks.length);
        chunkSummaries.push(chunkSummary);
      }

      const mergedSummary = await summarizeFinal(finalLlm, pageTitle, url, chunkSummaries);

      return JSON.stringify(
        {
          url,
          title: pageTitle || null,
          pipeline: {
            mode: 'parent-child-compression',
            max_chars: maxChars,
            chunk_size: chunkSize,
            max_chunks: maxChunks,
            chunks_used: chunks.length
          },
          final_summary: mergedSummary,
          debug: {
            source_chars: bodyText.length,
            clipped_chars: clippedText.length
          }
        },
        null,
        2
      );
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return `Fetch timeout after ${timeoutMs}ms (${url})`;
      }
      return `Fetch pipeline error: ${error?.message ?? String(error)}`;
    } finally {
      clearTimeout(timeoutId);
    }
  },
  {
    name: 'fetch_web_page',
    description:
      'Fetch a webpage, clip text size, run child chunk summaries, then return only a merged compact summary for parent-agent use.',
    schema: z.object({
      url: z.string().url().describe('Target webpage URL'),
      timeoutMs: z.number().int().min(1000).max(20000).optional().default(DEFAULT_TIMEOUT_MS),
      maxChars: z.number().int().min(1000).max(60000).optional().default(DEFAULT_MAX_CHARS),
      chunkSize: z.number().int().min(500).max(12000).optional().default(DEFAULT_CHUNK_SIZE),
      maxChunks: z.number().int().min(1).max(20).optional().default(DEFAULT_MAX_CHUNKS),
      summaryMaxTokens: z
        .number()
        .int()
        .min(64)
        .max(1200)
        .optional()
        .default(DEFAULT_SUMMARY_MAX_TOKENS),
      finalMaxTokens: z
        .number()
        .int()
        .min(128)
        .max(2000)
        .optional()
        .default(DEFAULT_FINAL_MAX_TOKENS)
    })
  }
);
