import { CorpusChunk } from '../corpus/types';
import { Retriever, RetrievalContext, SearchResult } from './types';

export interface HistoricalPoolEvent {
  query_id: string;
  target_year: number;
  applied: boolean;
  inserted_chunk_id: string | null;
  displaced_chunk_id: string | null;
  reason: string;
}

/**
 * Creates a fair, query-only candidate pool for explicit historical requests.
 * The policy never sees judgments: it reserves one tail position for the
 * highest lexical-scoring chunk from the requested publication year.
 */
export async function buildHistoricalCoveragePool(
  baseRetriever: Retriever,
  chunks: CorpusChunk[],
  query: RetrievalContext,
  budget: number
): Promise<{ pool: SearchResult[]; event: HistoricalPoolEvent }> {
  const pool = await baseRetriever.retrieve(query, budget);
  if (query.temporalIntent?.type !== 'historical') {
    return { pool, event: { query_id: query.queryId, target_year: 0, applied: false, inserted_chunk_id: null, displaced_chunk_id: null, reason: 'not_an_explicit_historical_query' } };
  }

  const targetYear = query.temporalIntent.targetYear;
  const years = new Map(chunks.map(chunk => [
    chunk.chunk_id,
    chunk.published_year ?? Number.parseInt(chunk.published_at?.slice(0, 4) || '', 10)
  ]));
  if (pool.some(item => years.get(item.chunkId) === targetYear)) {
    return { pool, event: { query_id: query.queryId, target_year: targetYear, applied: false, inserted_chunk_id: null, displaced_chunk_id: null, reason: 'target_year_already_covered' } };
  }

  const all = await baseRetriever.retrieve(query, chunks.length);
  const targetYearCandidate = all.find(item => years.get(item.chunkId) === targetYear);
  if (!targetYearCandidate || pool.length === 0) {
    return { pool, event: { query_id: query.queryId, target_year: targetYear, applied: false, inserted_chunk_id: null, displaced_chunk_id: null, reason: 'no_target_year_candidate' } };
  }

  const displaced = pool[pool.length - 1];
  return {
    pool: [...pool.slice(0, -1), targetYearCandidate],
    event: {
      query_id: query.queryId,
      target_year: targetYear,
      applied: true,
      inserted_chunk_id: targetYearCandidate.chunkId,
      displaced_chunk_id: displaced.chunkId,
      reason: 'reserved_tail_slot_for_explicit_historical_year'
    }
  };
}
