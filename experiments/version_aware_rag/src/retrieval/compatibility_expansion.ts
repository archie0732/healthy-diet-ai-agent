import { SearchResult, RetrievalContext } from './types';
import { RelationGraph } from '../versioning/relation_graph';

export function expandCompatibleChunks(
  candidates: SearchResult[],
  baseScoresMap: Map<string, number>,
  graph: RelationGraph,
  query: RetrievalContext,
  threshold = 0.1,
  minBaseScore = 0.01
): SearchResult[] {
  const expandedMap = new Map<string, SearchResult>();
  for (const c of candidates) {
    expandedMap.set(c.chunkId, { ...c });
  }

  const seedCandidates = candidates.filter(c => c.baseScore > threshold);
  const visited = new Set<string>();

  for (const seed of seedCandidates) {
    const neighbors = graph.getCompatibleNeighbors(seed.chunkId, query.targetPopulation, query.conditions);
    
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);

      const baseScore = baseScoresMap.get(neighborId) || 0;
      if (baseScore < minBaseScore) continue;

      const parentScore = seed.finalScore;
      const expansionScore = parentScore * 0.9;

      const existing = expandedMap.get(neighborId);
      if (existing) {
        if (expansionScore > existing.finalScore) {
          existing.finalScore = expansionScore;
          existing.scoreComponents = {
            ...existing.scoreComponents,
            expanded: 1,
            parent_id: seed.chunkId,
            parent_score: parentScore,
            expansion_score: expansionScore
          };
          existing.relationReason = (existing.relationReason || '') + `; Expanded from parent chunk ${seed.chunkId}`;
        }
      } else {
        expandedMap.set(neighborId, {
          chunkId: neighborId,
          baseScore,
          finalScore: expansionScore,
          rank: 0,
          relationReason: `Expanded from active parent chunk ${seed.chunkId} via complementary/conditional edge`,
          scoreComponents: {
            expanded: 1,
            parent_id: seed.chunkId,
            parent_score: parentScore,
            expansion_score: expansionScore
          }
        });
      }
    }
  }

  return Array.from(expandedMap.values());
}
