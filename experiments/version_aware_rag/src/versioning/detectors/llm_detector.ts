import { RelationDetector, RelationDetectorOutput, RelationDetectionSchema } from './types';
import { CorpusChunk } from '../../corpus/types';
import { RelationType } from '../types';
import { ResponseCache } from './cache';
import { SYSTEM_PROMPT, PROMPT_VERSION, getZeroShotPrompt, getFewShotPrompt } from './prompt';
import { RuleBaselineDetector } from './rule_baseline';

export class LLMDetector implements RelationDetector {
  private cache: ResponseCache;
  private mode: 'zero-shot' | 'few-shot';
  private modelName: string;
  private fallback: RuleBaselineDetector;
  private temperature: number;
  private maxRetries: number;

  constructor(
    mode: 'zero-shot' | 'few-shot' = 'zero-shot',
    modelName = 'gemini-1.5-flash',
    options?: {
      temperature?: number;
      maxRetries?: number;
      cachePath?: string;
    }
  ) {
    this.cache = new ResponseCache(options?.cachePath);
    this.mode = mode;
    this.modelName = modelName;
    this.fallback = new RuleBaselineDetector();
    this.temperature = options?.temperature ?? 0.1;
    this.maxRetries = options?.maxRetries ?? 2;
  }

  public async classify(input: {
    oldChunk: CorpusChunk;
    newChunk: CorpusChunk;
  }): Promise<RelationDetectorOutput> {
    const startTime = Date.now();
    const prompt = this.mode === 'zero-shot'
      ? getZeroShotPrompt(input.oldChunk.text, input.newChunk.text)
      : getFewShotPrompt(input.oldChunk.text, input.newChunk.text);

    const hashKey = this.cache.getHashKey(this.modelName, prompt, input.oldChunk.text, input.newChunk.text);
    const cached = this.cache.get(hashKey);
    if (cached) {
      return cached;
    }

    const hasApiKey = !!(process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);

    if (!hasApiKey) {
      const fallbackRes = await this.fallback.classify(input);
      const result: RelationDetectorOutput = {
        ...fallbackRes,
        modelInfo: {
          detector: `llm_${this.mode}_fallback`,
          model: this.modelName,
          promptVersion: PROMPT_VERSION,
          reason: 'No API key configured'
        }
      };
      this.cache.set(hashKey, result);
      return result;
    }

    let rawResponseText = '';
    let callError: string | null = null;
    let attempts = 0;
    let promptTokens = 0;
    let completionTokens = 0;

    while (attempts <= this.maxRetries) {
      attempts++;
      try {
        const res = await callLLMApi(this.modelName, SYSTEM_PROMPT, prompt, this.temperature);
        rawResponseText = res.text;
        promptTokens = res.promptTokens || 0;
        completionTokens = res.completionTokens || 0;
        callError = null;
        break;
      } catch (err: any) {
        callError = err.message || 'LLM API Call Failed';
      }
    }

    const latencyMs = Date.now() - startTime;

    if (callError || !rawResponseText) {
      const errorResult: RelationDetectorOutput = {
        relationType: 'conflicting',
        confidence: 0.0,
        rationale: `LLM execution error: ${callError}`,
        modelInfo: {
          detector: `llm_${this.mode}`,
          model: this.modelName,
          promptVersion: PROMPT_VERSION,
          temperature: this.temperature
        },
        isError: true,
        errorReason: callError || 'Empty LLM response',
        latencyMs,
        promptTokens,
        completionTokens
      };
      this.cache.set(hashKey, errorResult);
      return errorResult;
    }

    try {
      const cleanJsonStr = rawResponseText.trim().replace(/^```json\s*|```$/g, '');
      const parsedObj = JSON.parse(cleanJsonStr);
      const validation = RelationDetectionSchema.safeParse(parsedObj);

      if (!validation.success) {
        const validationErrorStr = validation.error.issues.map(i => i.message).join('; ');
        const schemaErrorResult: RelationDetectorOutput = {
          relationType: 'conflicting',
          confidence: 0.0,
          rationale: `Zod schema validation failed: ${validationErrorStr}`,
          modelInfo: {
            detector: `llm_${this.mode}`,
            model: this.modelName,
            promptVersion: PROMPT_VERSION,
            temperature: this.temperature
          },
          isError: true,
          errorReason: `Schema Validation Failed: ${validationErrorStr}`,
          latencyMs,
          promptTokens,
          completionTokens
        };
        this.cache.set(hashKey, schemaErrorResult);
        return schemaErrorResult;
      }

      const validResult: RelationDetectorOutput = {
        relationType: validation.data.relationType as RelationType,
        confidence: validation.data.confidence,
        rationale: validation.data.rationale,
        modelInfo: {
          detector: `llm_${this.mode}`,
          model: this.modelName,
          promptVersion: PROMPT_VERSION,
          temperature: this.temperature
        },
        isError: false,
        latencyMs,
        promptTokens,
        completionTokens
      };

      this.cache.set(hashKey, validResult);
      return validResult;
    } catch (parseErr: any) {
      const jsonParseErrorResult: RelationDetectorOutput = {
        relationType: 'conflicting',
        confidence: 0.0,
        rationale: `Invalid JSON response: ${parseErr.message}`,
        modelInfo: {
          detector: `llm_${this.mode}`,
          model: this.modelName,
          promptVersion: PROMPT_VERSION,
          temperature: this.temperature
        },
        isError: true,
        errorReason: `JSON Parse Error: ${parseErr.message}`,
        latencyMs,
        promptTokens,
        completionTokens
      };
      this.cache.set(hashKey, jsonParseErrorResult);
      return jsonParseErrorResult;
    }
  }
}

async function callLLMApi(
  model: string,
  systemInstruction: string,
  prompt: string,
  temperature: number
): Promise<{ text: string; promptTokens?: number; completionTokens?: number }> {
  const geminiApiKey = process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
    const payload = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature }
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Gemini API returned status ${res.status}`);
    const data: any = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = data.usageMetadata;
    return {
      text,
      promptTokens: usage?.promptTokenCount,
      completionTokens: usage?.candidatesTokenCount
    };
  } else if (process.env.OPENAI_API_KEY) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ],
        temperature
      })
    });
    if (!res.ok) throw new Error(`OpenAI API returned status ${res.status}`);
    const data: any = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const usage = data.usage;
    return {
      text,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens
    };
  }
  throw new Error('No API Key configured');
}
