import { Retriever, RetrievalContext, SearchResult } from './types';
import { CorpusChunk } from '../corpus/types';

function getTrigrams(text: string): string[] {
  const clean = text.toLowerCase().replace(/\s+/g, ' ');
  const trigrams: string[] = [];
  for (let i = 0; i < clean.length - 2; i++) {
    trigrams.push(clean.substring(i, i + 3));
  }
  return trigrams;
}

export class DenseRetriever implements Retriever {
  private chunks: CorpusChunk[];
  private chunkVectors: Map<string, Map<string, number>> = new Map();
  private vocabulary: Set<string> = new Set();
  private idfs: Map<string, number> = new Map();

  constructor(chunks: CorpusChunk[]) {
    this.chunks = chunks;
    this.initializeIndex();
  }

  private initializeIndex() {
    const N = this.chunks.length;
    const dfMap = new Map<string, number>();

    for (const chunk of this.chunks) {
      const trigrams = getTrigrams(chunk.text);
      const tfMap = new Map<string, number>();
      const uniqueTrigrams = new Set(trigrams);

      for (const tri of trigrams) {
        tfMap.set(tri, (tfMap.get(tri) || 0) + 1);
        this.vocabulary.add(tri);
      }

      this.chunkVectors.set(chunk.chunk_id, tfMap);

      for (const tri of uniqueTrigrams) {
        dfMap.set(tri, (dfMap.get(tri) || 0) + 1);
      }
    }

    for (const [tri, df] of dfMap.entries()) {
      const idf = Math.log((N + 1) / (df + 1)) + 1;
      this.idfs.set(tri, idf);
    }

    for (const chunk of this.chunks) {
      const tfMap = this.chunkVectors.get(chunk.chunk_id);
      if (tfMap) {
        let sumSq = 0;
        for (const [tri, tf] of tfMap.entries()) {
          const tfIdf = tf * (this.idfs.get(tri) || 0);
          sumSq += tfIdf * tfIdf;
        }
        const magnitude = Math.sqrt(sumSq);
        if (magnitude > 0) {
          const normMap = new Map<string, number>();
          for (const [tri, tf] of tfMap.entries()) {
            normMap.set(tri, (tf * (this.idfs.get(tri) || 0)) / magnitude);
          }
          this.chunkVectors.set(chunk.chunk_id, normMap);
        }
      }
    }
  }

  public async retrieve(query: RetrievalContext, topK: number): Promise<SearchResult[]> {
    const queryTrigrams = getTrigrams(query.question);
    const queryTfMap = new Map<string, number>();
    for (const tri of queryTrigrams) {
      queryTfMap.set(tri, (queryTfMap.get(tri) || 0) + 1);
    }

    let querySumSq = 0;
    const queryNormMap = new Map<string, number>();
    for (const [tri, tf] of queryTfMap.entries()) {
      const tfIdf = tf * (this.idfs.get(tri) || 0);
      querySumSq += tfIdf * tfIdf;
    }
    const queryMagnitude = Math.sqrt(querySumSq);
    if (queryMagnitude > 0) {
      for (const [tri, tf] of queryTfMap.entries()) {
        queryNormMap.set(tri, (tf * (this.idfs.get(tri) || 0)) / queryMagnitude);
      }
    }

    const results: SearchResult[] = [];

    for (const chunk of this.chunks) {
      let cosineSim = 0;
      const chunkNormMap = this.chunkVectors.get(chunk.chunk_id);

      if (chunkNormMap && queryMagnitude > 0) {
        for (const [tri, qVal] of queryNormMap.entries()) {
          const cVal = chunkNormMap.get(tri) || 0;
          cosineSim += qVal * cVal;
        }
      }

      results.push({
        chunkId: chunk.chunk_id,
        baseScore: cosineSim,
        finalScore: cosineSim,
        rank: 0,
        scoreComponents: { dense: cosineSim }
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
