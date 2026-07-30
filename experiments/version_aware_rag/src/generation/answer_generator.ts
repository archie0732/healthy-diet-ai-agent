import { CorpusChunk } from '../corpus/types';
import { SYSTEM_ANSWER_PROMPT, getAnswerUserPrompt, PROMPT_VERSION_V3 } from './prompt';
import { buildCitationSafeFallback, validateAnswerCitations } from './citation_validator';

export interface GenerationMetadata {
  prompt_version: string;
  model_id: string;
  generator: 'llm' | 'local_template';
  temperature: number;
  max_tokens: number;
  latency_ms: number;
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  estimated_cost_usd: number;
  reason?: string;
}

export interface GenerationResult {
  answer: string;
  modelInfo: GenerationMetadata;
  retrieved_chunk_ids: string[];
}

export class AnswerGenerator {
  private modelName: string;
  private temperature: number;
  private maxTokens: number;

  constructor(modelName = 'gemini-1.5-flash', temperature = 0.1, maxTokens = 500) {
    this.modelName = modelName;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
  }

  public async generateAnswer(
    question: string,
    retrievedChunks: CorpusChunk[]
  ): Promise<GenerationResult> {
    const startTime = Date.now();
    const userPrompt = getAnswerUserPrompt(question, retrievedChunks);
    const retrievedChunkIds = retrievedChunks.map(c => c.chunk_id);
    const hasApiKey = !!(process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
    let fallbackReason = hasApiKey ? 'API request failed' : 'API key missing';

    if (hasApiKey) {
      try {
        const { text, usage } = await callLLMApi(
          this.modelName,
          SYSTEM_ANSWER_PROMPT,
          userPrompt,
          this.temperature,
          this.maxTokens
        );
        const latencyMs = Date.now() - startTime;
        const promptTokens = usage.prompt_tokens || Math.ceil(userPrompt.length / 4);
        const completionTokens = usage.completion_tokens || Math.ceil(text.length / 4);
        const totalTokens = promptTokens + completionTokens;

        const citationValidation = validateAnswerCitations(text, retrievedChunkIds);
        if (!citationValidation.valid) {
          fallbackReason = `invalid_citation_contract: invalid_tokens=${citationValidation.invalidCitationTokens.join(',') || 'none'}; uncited_segments=${citationValidation.uncitedMaterialSegments.length}`;
          throw new Error(fallbackReason);
        }

        // Estimated cost for standard flash tier ($0.075 / 1M prompt, $0.30 / 1M output)
        const estimatedCost = (promptTokens * 0.075 + completionTokens * 0.30) / 1_000_000;

        return {
          answer: text,
          modelInfo: {
            prompt_version: PROMPT_VERSION_V3,
            model_id: this.modelName,
            generator: 'llm',
            temperature: this.temperature,
            max_tokens: this.maxTokens,
            latency_ms: latencyMs,
            token_usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens
            },
            estimated_cost_usd: parseFloat(estimatedCost.toFixed(6))
          },
          retrieved_chunk_ids: retrievedChunkIds
        };
      } catch (err: any) {
        if (!String(err.message).startsWith('invalid_citation_contract:')) fallbackReason = `API request failed: ${err.message}`;
        console.warn(`Answer generation API call failed, falling back to local builder: ${err.message}`);
      }
    }

    // Deterministic, extractive fallback with exact retrieved chunk IDs only.
    const answer = buildCitationSafeFallback(retrievedChunks);
    const latencyMs = Date.now() - startTime;
    const promptTokens = Math.ceil(userPrompt.length / 4);
    const completionTokens = Math.ceil(answer.length / 4);

    return {
      answer,
      modelInfo: {
        prompt_version: PROMPT_VERSION_V3,
        model_id: 'local_template',
        generator: 'local_template',
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        latency_ms: latencyMs,
        token_usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens
        },
        estimated_cost_usd: 0,
        reason: fallbackReason
      },
      retrieved_chunk_ids: retrievedChunkIds
    };
  }
}

async function callLLMApi(
  model: string,
  systemInstruction: string,
  prompt: string,
  temperature: number,
  maxTokens: number
): Promise<{ text: string; usage: { prompt_tokens: number; completion_tokens: number } }> {
  const geminiApiKey = process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
    const payload = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens }
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Gemini API returned status ${res.status}`);
    const data: any = await res.json();
    const text = data.candidates[0].content.parts[0].text;
    const promptTokens = data.usageMetadata?.promptTokenCount || 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
    return { text, usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens } };
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
        temperature,
        max_tokens: maxTokens
      })
    });
    if (!res.ok) throw new Error(`OpenAI API returned status ${res.status}`);
    const data: any = await res.json();
    const text = data.choices[0].message.content;
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    return { text, usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens } };
  }
  throw new Error('No API Key configured');
}
