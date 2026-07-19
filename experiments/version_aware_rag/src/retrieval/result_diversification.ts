import { SearchResult } from './types';
import { RelationGraph } from '../versioning/relation_graph';

export function diversifyResults(
  candidates: SearchResult[],
  graph: RelationGraph,
  penaltyParam = 0.9
): SearchResult[] {
  const diversified: SearchResult[] = [];
  const selectedIds = new Set<string>();

  for (const c of candidates) {
    let penalty = 0;

    const outgoing = graph['sourceIndex'].get(c.chunkId) || [];
    const incoming = graph['targetIndex'].get(c.chunkId) || [];

    for (const edge of [...outgoing, ...incoming]) {
      if (edge.relationType === 'duplicate') {
        const neighborId = edge.sourceChunkId === c.chunkId ? edge.targetChunkId : edge.sourceChunkId;
        if (selectedIds.has(neighborId)) {
          penalty = penaltyParam;
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
        diversification_penalty: penalty,
        diversification: finalScore
      }
    });

    selectedIds.add(c.chunkId);
  }

  diversified.sort((a, b) => b.finalScore - a.finalScore);
  return diversified;
}
