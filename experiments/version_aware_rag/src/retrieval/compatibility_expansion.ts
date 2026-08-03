import { SearchResult, RetrievalContext, ExpansionEvent } from './types';
import { RelationGraph } from '../versioning/relation_graph';

export function expandCompatibleChunks(
  candidates: SearchResult[],
  baseScoresMap: Map<string, number>,
  graph: RelationGraph,
  query: RetrievalContext,
  threshold = 0.1,
  minBaseScore = 0.01,
  trackMetrics?: { attempts: number; acceptances: number }
): SearchResult[] {
  const expandedMap = new Map<string, SearchResult>();
  for (const c of candidates) {
    expandedMap.set(c.chunkId, { ...c });
  }

  const initialRankMap = new Map<string, number>();
  candidates.forEach((c, idx) => initialRankMap.set(c.chunkId, idx + 1));

  const seedCandidates = candidates.filter(c => c.baseScore >= threshold);
  const visited = new Set<string>();

  for (const seed of seedCandidates) {
    const relations = graph.getRelationsForChunk(seed.chunkId);
    
    for (const rel of relations) {
      if (rel.confidence < graph.getConfidenceThreshold()) continue;

      if (rel.relationType !== 'complementary' && rel.relationType !== 'conditional_difference') {
        continue;
      }

      const neighborId = rel.sourceChunkId === seed.chunkId ? rel.targetChunkId : rel.sourceChunkId;
      if (!graph.isChunkActive(neighborId, query.targetPopulation, query.conditions)) {
        continue;
      }

      if (visited.has(`${seed.chunkId}->${neighborId}`)) continue;
      visited.add(`${seed.chunkId}->${neighborId}`);

      if (trackMetrics) {
        trackMetrics.attempts++;
      }

      const baseScore = baseScoresMap.get(neighborId) || 0;
      const existed = expandedMap.has(neighborId);
      const existing = expandedMap.get(neighborId);
      const scoreBefore = existing ? existing.finalScore : baseScore;
      const rankBefore = existing ? (initialRankMap.get(neighborId) ?? 0) : 0;

      if (baseScore < minBaseScore && !existed) {
        if (query.onExpansionEvent) {
          query.onExpansionEvent({
            query_id: query.queryId,
            seed_chunk_id: seed.chunkId,
            expanded_chunk_id: neighborId,
            relation_id: rel.relationId,
            relation_type: rel.relationType,
            candidate_existed_before_expansion: false,
            score_before_expansion: scoreBefore,
            compatibility_score_added: 0,
            score_after_expansion: scoreBefore,
            rank_before_expansion: rankBefore,
            rank_after_expansion: rankBefore,
            accepted: false,
            rejection_reason: `Base score ${baseScore} below minBaseScore ${minBaseScore}`
          });
        }
        continue;
      }

      const parentScore = seed.finalScore;
      const compatibilityScoreAdded = parentScore * 0.1;
      const expansionScore = parentScore + compatibilityScoreAdded;

      if (existing) {
        if (expansionScore > existing.finalScore) {
          existing.finalScore = expansionScore;
          existing.scoreComponents = {
            ...existing.scoreComponents,
            expanded: 1,
            compatibility_score: compatibilityScoreAdded,
            parent_id: seed.chunkId,
            expansion_score: expansionScore
          };
          existing.relationReason = (existing.relationReason || '') + `; Expanded via relation ${rel.relationId} from seed ${seed.chunkId}`;

          if (trackMetrics) trackMetrics.acceptances++;

          if (query.onExpansionEvent) {
            query.onExpansionEvent({
              query_id: query.queryId,
              seed_chunk_id: seed.chunkId,
              expanded_chunk_id: neighborId,
              relation_id: rel.relationId,
              relation_type: rel.relationType,
              candidate_existed_before_expansion: true,
              score_before_expansion: scoreBefore,
              compatibility_score_added: compatibilityScoreAdded,
              score_after_expansion: expansionScore,
              rank_before_expansion: rankBefore,
              rank_after_expansion: 0,
              accepted: true,
              rejection_reason: null
            });
          }
        } else {
          if (query.onExpansionEvent) {
            query.onExpansionEvent({
              query_id: query.queryId,
              seed_chunk_id: seed.chunkId,
              expanded_chunk_id: neighborId,
              relation_id: rel.relationId,
              relation_type: rel.relationType,
              candidate_existed_before_expansion: true,
              score_before_expansion: scoreBefore,
              compatibility_score_added: 0,
              score_after_expansion: scoreBefore,
              rank_before_expansion: rankBefore,
              rank_after_expansion: rankBefore,
              accepted: false,
              rejection_reason: `Expansion score ${expansionScore} does not exceed existing final score ${existing.finalScore}`
            });
          }
        }
      } else {
        expandedMap.set(neighborId, {
          chunkId: neighborId,
          baseScore,
          finalScore: expansionScore,
          rank: 0,
          relationReason: `Expanded from active seed chunk ${seed.chunkId} via relation ${rel.relationId}`,
          scoreComponents: {
            expanded: 1,
            compatibility_score: compatibilityScoreAdded,
            parent_id: seed.chunkId,
            expansion_score: expansionScore
          }
        });

        if (trackMetrics) trackMetrics.acceptances++;

        if (query.onExpansionEvent) {
          query.onExpansionEvent({
            query_id: query.queryId,
            seed_chunk_id: seed.chunkId,
            expanded_chunk_id: neighborId,
            relation_id: rel.relationId,
            relation_type: rel.relationType,
            candidate_existed_before_expansion: false,
            score_before_expansion: 0,
            compatibility_score_added: compatibilityScoreAdded,
            score_after_expansion: expansionScore,
            rank_before_expansion: 0,
            rank_after_expansion: 0,
            accepted: true,
            rejection_reason: null
          });
        }
      }
    }
  }

  return Array.from(expandedMap.values());
}
