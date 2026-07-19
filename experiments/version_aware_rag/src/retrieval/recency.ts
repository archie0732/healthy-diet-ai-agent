import { Retriever, RetrievalContext, SearchResult } from './types';
import { CorpusChunk } from '../corpus/types';

export class RecencyBoostRetriever implements Retriever {
  private baseRetriever: Retriever;
  private lambda: number;
  private chunkYears: Map<string, number> = new Map();

  constructor(baseRetriever: Retriever, chunks: CorpusChunk[], lambda = 0.5) {
    this.baseRetriever = baseRetriever;
    this.lambda = lambda;
    for (const c of chunks) {
      // Resolve publication year from published_at (e.g. 2015-12-01 -> 2015) or chunk fields
      // In CorpusChunk we have published_at. Let's parse year:
      const year = parseInt(c.published_at.split('-')[0], 10) || 2015;
      this.chunkYears.set(c.chunk_id, year);
    }
  }

  public async retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]> {
    // Run retrieve on all items by querying a large topK
    const allCount = 10000;
    const baseResults = await this.baseRetriever.retrieve(query, allCount);

    if (baseResults.length === 0) return [];

    const baseScores = baseResults.map(r => r.baseScore);
    const maxBase = Math.max(...baseScores);
    const minBase = Math.min(...baseScores);

    const results: SearchResult[] = [];

    for (const r of baseResults) {
      const year = this.chunkYears.get(r.chunkId) || 2015;
      
      // Normalize base score to [0, 1]
      const normBase = maxBase > minBase ? (r.baseScore - minBase) / (maxBase - minBase) : 0;
      
      // Normalize year to [0, 1] relative to [2015, 2026]
      const minYear = 2015;
      const maxYear = 2026;
      const normYear = (year - minYear) / (maxYear - minYear);

      const finalScore = normBase + this.lambda * normYear;

      results.push({
        chunkId: r.chunkId,
        baseScore: r.baseScore,
        finalScore,
        rank: 0,
        scoreComponents: {
          ...r.scoreComponents,
          base_norm: normBase,
          recency_norm: normYear,
          recency_boost: this.lambda * normYear,
          recency: finalScore
        }
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
