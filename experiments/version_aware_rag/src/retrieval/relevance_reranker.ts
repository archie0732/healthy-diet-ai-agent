import { CorpusChunk } from '../corpus/types';
import { DenseRetriever } from './dense';
import { RetrievalContext, SearchResult } from './types';

export async function rerankByRelevance(
  dense: DenseRetriever,
  query: RetrievalContext,
  candidates: SearchResult[],
  alpha: number,
  topK: number
): Promise<SearchResult[]> {
  const denseScores = new Map((await dense.retrieve(query, Number.MAX_SAFE_INTEGER)).map(item => [item.chunkId, item.finalScore]));
  const policyValues = candidates.map(item => item.finalScore);
  const relevanceValues = candidates.map(item => denseScores.get(item.chunkId) || 0);
  const policyMin = Math.min(...policyValues), policyMax = Math.max(...policyValues);
  const relevanceMin = Math.min(...relevanceValues), relevanceMax = Math.max(...relevanceValues);
  return candidates.map(item => {
    const policy = policyMax > policyMin ? (item.finalScore - policyMin) / (policyMax - policyMin) : 0;
    const rawRelevance = denseScores.get(item.chunkId) || 0;
    const relevance = relevanceMax > relevanceMin ? (rawRelevance - relevanceMin) / (relevanceMax - relevanceMin) : 0;
    const finalScore = (1 - alpha) * policy + alpha * relevance;
    return { ...item, finalScore, scoreComponents: { ...item.scoreComponents, relevance_score: relevance, relevance_alpha: alpha } };
  }).sort((a, b) => b.finalScore - a.finalScore || a.chunkId.localeCompare(b.chunkId)).slice(0, topK).map((item, index) => ({ ...item, rank: index + 1 }));
}
