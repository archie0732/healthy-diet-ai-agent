import { Retriever, RetrievalContext, SearchResult } from './types';

export class HybridRetriever implements Retriever {
  private bm25Retriever: Retriever;
  private denseRetriever: Retriever;
  private weight: number; // weight of BM25 (between 0 and 1)

  constructor(bm25Retriever: Retriever, denseRetriever: Retriever, weight = 0.5) {
    this.bm25Retriever = bm25Retriever;
    this.denseRetriever = denseRetriever;
    this.weight = weight;
  }

  public async retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]> {
    // Run retrieve on all items by querying a large topK
    const allCount = 10000;
    const bm25Results = await this.bm25Retriever.retrieve(query, allCount);
    const denseResults = await this.denseRetriever.retrieve(query, allCount);

    if (bm25Results.length === 0) return [];

    // Find min and max for normalization
    const bm25Scores = bm25Results.map(r => r.baseScore);
    const denseScores = denseResults.map(r => r.baseScore);

    const maxBM25 = Math.max(...bm25Scores);
    const minBM25 = Math.min(...bm25Scores);
    const maxDense = Math.max(...denseScores);
    const minDense = Math.min(...denseScores);

    const bm25Map = new Map<string, number>();
    for (const r of bm25Results) {
      bm25Map.set(r.chunkId, r.baseScore);
    }

    const denseMap = new Map<string, number>();
    for (const r of denseResults) {
      denseMap.set(r.chunkId, r.baseScore);
    }

    const results: SearchResult[] = [];
    const allChunkIds = Array.from(new Set([...bm25Map.keys(), ...denseMap.keys()]));

    for (const chunkId of allChunkIds) {
      const bm25Val = bm25Map.get(chunkId) || 0;
      const denseVal = denseMap.get(chunkId) || 0;

      // Min-Max Normalize
      const normBM25 = maxBM25 > minBM25 ? (bm25Val - minBM25) / (maxBM25 - minBM25) : 0;
      const normDense = maxDense > minDense ? (denseVal - minDense) / (maxDense - minDense) : 0;

      const finalScore = this.weight * normBM25 + (1 - this.weight) * normDense;

      results.push({
        chunkId,
        baseScore: finalScore,
        finalScore,
        rank: 0,
        scoreComponents: {
          bm25_raw: bm25Val,
          bm25_norm: normBM25,
          dense_raw: denseVal,
          dense_norm: normDense,
          hybrid: finalScore
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
