import { Retriever, RetrievalContext, SearchResult } from './types';
import { CorpusChunk } from '../corpus/types';

const stopwords = new Set([
  'what', 'are', 'the', 'and', 'for', 'daily', 'serving', 'goals', 'consuming',
  'recommendation', 'intake', 'limit', 'limitations', 'rule', 'should', 'with',
  'this', 'that', 'from', 'about', 'how', 'many', 'of', 'is', 'a', 'in', 'or', 'to'
]);

export function tokenize(text: string): string[] {
  return text.toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

export class BM25Retriever implements Retriever {
  private chunks: CorpusChunk[];
  private k1: number;
  private b: number;

  private avgdl: number = 0;
  private chunkLengths: Map<string, number> = new Map();
  private docFrequencies: Map<string, number> = new Map();
  private idfs: Map<string, number> = new Map();
  private termFrequencies: Map<string, Map<string, number>> = new Map();

  constructor(chunks: CorpusChunk[], k1 = 1.2, b = 0.75) {
    this.chunks = chunks;
    this.k1 = k1;
    this.b = b;
    this.initializeIndex();
  }

  private initializeIndex() {
    let totalLen = 0;
    const N = this.chunks.length;

    for (const chunk of this.chunks) {
      const tokens = tokenize(chunk.text);
      const len = tokens.length;
      totalLen += len;
      this.chunkLengths.set(chunk.chunk_id, len);

      const tfMap = new Map<string, number>();
      const uniqueTerms = new Set(tokens);
      
      for (const term of tokens) {
        tfMap.set(term, (tfMap.get(term) || 0) + 1);
      }
      this.termFrequencies.set(chunk.chunk_id, tfMap);

      for (const term of uniqueTerms) {
        this.docFrequencies.set(term, (this.docFrequencies.get(term) || 0) + 1);
      }
    }

    this.avgdl = N > 0 ? totalLen / N : 0;

    for (const [term, df] of this.docFrequencies.entries()) {
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      this.idfs.set(term, idf);
    }
  }

  public async retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]> {
    const queryTerms = tokenize(query.question);
    const results: SearchResult[] = [];

    for (const chunk of this.chunks) {
      let score = 0;
      const tfMap = this.termFrequencies.get(chunk.chunk_id);
      const dl = this.chunkLengths.get(chunk.chunk_id) || 0;

      if (tfMap && dl > 0) {
        for (const term of queryTerms) {
          const tf = tfMap.get(term) || 0;
          if (tf > 0) {
            const idf = this.idfs.get(term) || 0;
            const numerator = tf * (this.k1 + 1);
            const denominator = tf + this.k1 * (1 - this.b + this.b * (dl / this.avgdl));
            score += idf * (numerator / denominator);
          }
        }
      }

      results.push({
        chunkId: chunk.chunk_id,
        baseScore: score,
        finalScore: score,
        rank: 0,
        scoreComponents: { bm25: score }
      });
    }

    results.sort((a, b) => {
      if (Math.abs(a.finalScore - b.finalScore) < 1e-6) {
        return a.chunkId.localeCompare(b.chunkId);
      }
      return b.finalScore - a.finalScore;
    });

    return results.slice(0, topK).map((res, index) => ({
      ...res,
      rank: index + 1
    }));
  }
}
