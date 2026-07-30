import { SearchResult } from './types';
import { RelationGraph } from '../versioning/relation_graph';

export function diversifyResults(
  candidates: SearchResult[],
  graph: RelationGraph,
  penaltyParam = 0.9,
  trackMetrics?: { penalties: number }
): SearchResult[] {
  const diversified: SearchResult[] = [];
  const selectedIds = new Set<string>();

  for (const c of candidates) {
    let penalty = 0;

    const relations = graph.getRelationsForChunk(c.chunkId);

    for (const edge of relations) {
      if (edge.relationType === 'duplicate') {
        const neighborId = edge.sourceChunkId === c.chunkId ? edge.targetChunkId : edge.sourceChunkId;
        if (selectedIds.has(neighborId)) {
          penalty = penaltyParam;
          if (trackMetrics && penalty > 0) {
            trackMetrics.penalties++;
          }
          break;
        }
      }
    }

    const finalScore = c.finalScore - penalty;

    diversified.push({
      ...c,
      finalScore,
      scoreComponents: {
        ...c.scoreComponents,
        diversification_penalty: penalty
      }
    });

    selectedIds.add(c.chunkId);
  }

  diversified.sort((a, b) => b.finalScore - a.finalScore);
  return diversified;
}
