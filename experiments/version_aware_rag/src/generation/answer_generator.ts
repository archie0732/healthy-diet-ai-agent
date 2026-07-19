import { CorpusChunk } from '../corpus/types';
import { SYSTEM_ANSWER_PROMPT, getAnswerUserPrompt } from './prompt';

export class AnswerGenerator {
  private modelName: string;

  constructor(modelName = 'gemini-1.5-flash') {
    this.modelName = modelName;
  }

  public async generateAnswer(
    question: string,
    retrievedChunks: CorpusChunk[]
  ): Promise<{
    answer: string;
    modelInfo: Record<string, string | number>;
  }> {
    const userPrompt = getAnswerUserPrompt(question, retrievedChunks);
    const hasApiKey = !!(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);

    if (hasApiKey) {
      try {
        const answer = await callLLMApi(this.modelName, SYSTEM_ANSWER_PROMPT, userPrompt);
        return {
          answer,
          modelInfo: { generator: 'llm', model: this.modelName }
        };
      } catch (err: any) {
        console.warn(`Answer generation API call failed, falling back to local builder: ${err.message}`);
      }
    }

    // Deterministic offline summary builder fallback
    const summaryLines = retrievedChunks.map(c => 
      `According to the guideline [${c.chunk_id}], it states that: ${c.text.trim().substring(0, 150)}...`
    );
    const answer = `Based on the provided evidence:\n${summaryLines.join('\n')}\n(Exceptions apply for specific target groups if mentioned in the context).`;

    return {
      answer,
      modelInfo: {
        generator: 'local_template',
        reason: 'API key missing or request failed'
      }
    };
  }
}

async function callLLMApi(model: string, systemInstruction: string, prompt: string): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const payload = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
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
        temperature: 0.1,
        max_tokens: 500
      })
    });
    if (!res.ok) throw new Error(`OpenAI API returned status ${res.status}`);
    const data: any = await res.json();
    return data.choices[0].message.content;
  }
  throw new Error('No API Key configured');
}
