import { RelationDetector } from './types';
import { CorpusChunk } from '../../corpus/types';
import { RelationType } from '../types';
import { ResponseCache } from './cache';
import { SYSTEM_PROMPT, getZeroShotPrompt, getFewShotPrompt } from './prompt';
import { RuleBaselineDetector } from './rule_baseline';

export class LLMDetector implements RelationDetector {
  private cache: ResponseCache;
  private mode: 'zero-shot' | 'few-shot';
  private modelName: string;
  private fallback: RuleBaselineDetector;

  constructor(mode: 'zero-shot' | 'few-shot' = 'zero-shot', modelName = 'gemini-1.5-flash') {
    this.cache = new ResponseCache();
    this.mode = mode;
    this.modelName = modelName;
    this.fallback = new RuleBaselineDetector();
  }

  public async classify(input: {
    oldChunk: CorpusChunk;
    newChunk: CorpusChunk;
  }): Promise<{
    relationType: RelationType;
    confidence: number;
    rationale: string;
    modelInfo: Record<string, string | number>;
  }> {
    const prompt = this.mode === 'zero-shot'
      ? getZeroShotPrompt(input.oldChunk.text, input.newChunk.text)
      : getFewShotPrompt(input.oldChunk.text, input.newChunk.text);

    const hashKey = this.cache.getHashKey(this.modelName, prompt, input.oldChunk.text, input.newChunk.text);
    const cached = this.cache.get(hashKey);
    if (cached) {
      return cached;
    }

    let result: any = null;
    const hasApiKey = !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);

    if (hasApiKey) {
      try {
        const responseText = await callLLMApi(this.modelName, SYSTEM_PROMPT, prompt);
        const parsed = JSON.parse(responseText.trim().replace(/^```json\s*|```$/g, ''));
        result = {
          relationType: parsed.relationType as RelationType,
          confidence: parsed.confidence || 0.8,
          rationale: parsed.rationale || '',
          modelInfo: { detector: `llm_${this.mode}`, model: this.modelName }
        };
      } catch (err: any) {
        console.warn(`LLM invocation failed, falling back to rule baseline: ${err.message}`);
      }
    }

    if (!result) {
      result = await this.fallback.classify(input);
      result.modelInfo = {
        detector: `llm_${this.mode}_fallback`,
        reason: 'API key missing or request failed'
      };
    }

    this.cache.set(hashKey, result);

    return result;
  }
}

async function callLLMApi(model: string, systemInstruction: string, prompt: string): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const payload = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Gemini API returned status ${res.status}`);
    const data: any = await res.json();
    return data.candidates[0].content.parts[0].text;
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
        temperature: 0.1
      })
    });
    if (!res.ok) throw new Error(`OpenAI API returned status ${res.status}`);
    const data: any = await res.json();
    return data.choices[0].message.content;
  }
  throw new Error('No API Key configured');
}
