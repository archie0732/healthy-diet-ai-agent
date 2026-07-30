import { createHash } from 'node:crypto';

export type PassageForRerank = {
  chunkId: string;
  documentId: string;
  publishedAt: string;
  text: string;
};

export type ApiTrace = {
  modelId: string;
  endpoint: string;
  requestSha256: string;
  responseSha256: string;
  latencyMs: number;
  usageMetadata?: Record<string, unknown>;
  rawResponse: unknown;
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const stableJson = (value: unknown) => JSON.stringify(value);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class GeminiRerankClient {
  readonly embeddingModel: string;
  readonly crossEncoderModel: string;
  readonly apiVersion: string;
  readonly embeddingDimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: {
    embeddingModel?: string;
    crossEncoderModel?: string;
    apiVersion?: string;
    embeddingDimensions?: number;
  } = {}) {
    const apiKey = process.env.GEMINI_AI_API || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_AI_API or GEMINI_API_KEY is required.');
    this.apiKey = apiKey;
    this.embeddingModel = options.embeddingModel || 'gemini-embedding-001';
    this.crossEncoderModel = options.crossEncoderModel || 'gemini-3.5-flash';
    this.apiVersion = options.apiVersion || 'v1beta';
    this.embeddingDimensions = options.embeddingDimensions || 768;
    this.baseUrl = `https://generativelanguage.googleapis.com/${this.apiVersion}`;
  }

  private async request(endpoint: string, init: RequestInit): Promise<{ body: any; trace: Omit<ApiTrace, 'modelId'> }> {
    const requestBody = typeof init.body === 'string' ? init.body : '';
    const started = performance.now();
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...init,
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey, ...(init.headers || {}) },
        });
        const responseText = await response.text();
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < 9) {
            const retrySeconds = Number(responseText.match(/retry in\s+([0-9.]+)s/i)?.[1] || 0);
            const retryMs = response.status === 429 && endpoint.includes(':generateContent')
              ? 62_000
              : retrySeconds > 0
                ? Math.max(1_000, Math.ceil(retrySeconds * 1000) + 1_000)
                : Math.min(30_000, 1000 * 2 ** attempt);
            if (retryMs > 55_000) {
              await delay(55_000);
              await delay(retryMs - 55_000);
            } else {
              await delay(retryMs);
            }
            continue;
          }
          throw new Error(`Gemini API ${response.status}: ${responseText.slice(0, 500)}`);
        }
        const body = JSON.parse(responseText);
        return {
          body,
          trace: {
            endpoint: `${this.apiVersion}${endpoint}`,
            requestSha256: sha256(requestBody),
            responseSha256: sha256(responseText),
            latencyMs: Math.round(performance.now() - started),
            usageMetadata: body.usageMetadata,
            rawResponse: body,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < 9) await delay(Math.min(30_000, 1000 * 2 ** attempt));
      }
    }
    throw lastError || new Error('Gemini API request failed.');
  }

  async describeModel(modelId: string): Promise<{ descriptor: unknown; descriptorSha256: string }> {
    const { body } = await this.request(`/models/${modelId}`, { method: 'GET' });
    return { descriptor: body, descriptorSha256: sha256(stableJson(body)) };
  }

  async embed(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'QUESTION_ANSWERING', title?: string): Promise<{ vector: number[]; trace: ApiTrace }> {
    const body = {
      model: `models/${this.embeddingModel}`,
      content: { parts: [{ text }] },
      taskType,
      ...(title ? { title } : {}),
      outputDimensionality: this.embeddingDimensions,
    };
    const response = await this.request(`/models/${this.embeddingModel}:embedContent`, { method: 'POST', body: stableJson(body) });
    const values = response.body?.embedding?.values;
    if (!Array.isArray(values) || values.length !== this.embeddingDimensions) {
      throw new Error(`Invalid embedding response: expected ${this.embeddingDimensions} values.`);
    }
    const norm = Math.sqrt(values.reduce((sum: number, value: number) => sum + value * value, 0)) || 1;
    return {
      vector: values.map((value: number) => value / norm),
      trace: { ...response.trace, modelId: this.embeddingModel },
    };
  }

  async embedBatch(items: Array<{ text: string; taskType: 'RETRIEVAL_DOCUMENT' | 'QUESTION_ANSWERING'; title?: string }>): Promise<{ vectors: number[][]; trace: ApiTrace }> {
    const body = {
      requests: items.map((item) => ({
        model: `models/${this.embeddingModel}`,
        content: { parts: [{ text: item.text }] },
        taskType: item.taskType,
        ...(item.title ? { title: item.title } : {}),
        outputDimensionality: this.embeddingDimensions,
      })),
    };
    const response = await this.request(`/models/${this.embeddingModel}:batchEmbedContents`, { method: 'POST', body: stableJson(body) });
    const embeddings = response.body?.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== items.length) {
      throw new Error(`Invalid batch embedding response: expected ${items.length} embeddings.`);
    }
    const vectors = embeddings.map((embedding: any) => {
      const values = embedding?.values;
      if (!Array.isArray(values) || values.length !== this.embeddingDimensions) {
        throw new Error(`Invalid batch embedding vector: expected ${this.embeddingDimensions} values.`);
      }
      const norm = Math.sqrt(values.reduce((sum: number, value: number) => sum + value * value, 0)) || 1;
      return values.map((value: number) => value / norm);
    });
    return { vectors, trace: { ...response.trace, modelId: this.embeddingModel } };
  }

  async crossEncode(query: string, passages: PassageForRerank[], repairDepth = 0): Promise<{ scores: Map<string, number>; rationales: Map<string, string>; trace: ApiTrace; prompt: string }> {
    const prompt = [
      'You are a query-passage reranker. Score each passage only for whether it contains evidence needed to answer the query.',
      'Account for requested population, health conditions, temporal scope, and whether older evidence remains materially necessary.',
      'Do not assume newer is better. Do not invent relationships. Use only the query and passages below.',
      'Return every chunk_id exactly once with a score from 0 to 100. Return scores only; do not explain and do not select a final answer.',
      `QUERY:\n${query}`,
      'PASSAGES:',
      ...passages.map((passage, index) => `[${index + 1}] chunk_id=${passage.chunkId}\ndocument=${passage.documentId}\npublished_at=${passage.publishedAt}\ntext=${passage.text}`),
    ].join('\n\n');
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        ...(this.crossEncoderModel.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            scores: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  chunk_id: { type: 'STRING' },
                  score: { type: 'NUMBER', minimum: 0, maximum: 100 },
                },
                required: ['chunk_id', 'score'],
              },
            },
          },
          required: ['scores'],
        },
      },
    };
    const response = await this.request(`/models/${this.crossEncoderModel}:generateContent`, { method: 'POST', body: stableJson(body) });
    const responseText = response.body?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
    const parsed = JSON.parse(responseText.replace(/^```json\s*/i, '').replace(/\s*```$/, ''));
    const ids = new Set(passages.map((passage) => passage.chunkId));
    const scores = new Map<string, number>();
    const rationales = new Map<string, string>();
    for (const item of parsed.scores || []) {
      if (ids.has(item.chunk_id) && Number.isFinite(item.score)) {
        scores.set(item.chunk_id, Math.max(0, Math.min(1, Number(item.score) / 100)));
        rationales.set(item.chunk_id, '');
      }
    }
    const missing = passages.filter((passage) => !scores.has(passage.chunkId));
    if (missing.length && repairDepth < 2) {
      const repair = await this.crossEncode(query, missing, repairDepth + 1);
      for (const [id, score] of repair.scores) scores.set(id, score);
      for (const [id, rationale] of repair.rationales) rationales.set(id, rationale);
      const combinedRaw = { primary: response.trace.rawResponse, missing_chunk_ids: missing.map((passage) => passage.chunkId), repair: repair.trace.rawResponse };
      const combinedText = stableJson(combinedRaw);
      return {
        scores,
        rationales,
        trace: {
          ...response.trace,
          modelId: this.crossEncoderModel,
          responseSha256: sha256(combinedText),
          latencyMs: response.trace.latencyMs + repair.trace.latencyMs,
          usageMetadata: { primary: response.trace.usageMetadata, repair: repair.trace.usageMetadata },
          rawResponse: combinedRaw,
        },
        prompt,
      };
    }
    if (scores.size !== passages.length) throw new Error(`Cross-encoder returned ${scores.size}/${passages.length} candidate scores after repair.`);
    return { scores, rationales, trace: { ...response.trace, modelId: this.crossEncoderModel }, prompt };
  }
}

export function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length) throw new Error('Embedding dimensions do not match.');
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}
