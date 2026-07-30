export type VersionRelationType =
  | 'duplicate'
  | 'superseded'
  | 'conflicting'
  | 'conditional_difference'
  | 'complementary';

export interface RelationAwareEdge {
  edge_id: string;
  relation_type: VersionRelationType;
  current_chunk_id: string;
  retained_chunk_id: string;
  policy_label?: 'retain' | 'deprecated' | 'forbidden' | string;
  conditional_applicable?: boolean;
}

export interface RelationPolicyTrace {
  edge_id: string;
  relation_type: VersionRelationType;
  action: 'expand_pair' | 'expand_current_only' | 'block_retained' | 'no_expansion';
  reason: string;
}

export interface RelationAwareCandidateSet {
  candidateIds: string[];
  unsafeIds: Set<string>;
  pairCoverageEdges: RelationAwareEdge[];
  trace: RelationPolicyTrace[];
}

function isPairPreserving(edge: RelationAwareEdge): boolean {
  return edge.relation_type === 'complementary'
    || (edge.relation_type === 'conditional_difference' && edge.conditional_applicable === true);
}

function isRetainedUnsafe(edge: RelationAwareEdge): boolean {
  return edge.relation_type === 'superseded'
    || edge.relation_type === 'conflicting'
    || edge.policy_label === 'deprecated'
    || edge.policy_label === 'forbidden';
}

/**
 * Builds V5 Oracle candidates without treating edge existence as permission for
 * bidirectional expansion. Conditional edges require an explicit applicability
 * decision; replacement/conflict edges can recover the current endpoint only.
 */
export function buildRelationAwareCandidateSet(
  baseCandidateIds: string[],
  edges: RelationAwareEdge[]
): RelationAwareCandidateSet {
  const candidateIds = [...baseCandidateIds];
  const candidateSet = new Set(candidateIds);
  const unsafeIds = new Set<string>();
  const pairCoverageEdges: RelationAwareEdge[] = [];
  const trace: RelationPolicyTrace[] = [];

  const add = (id: string) => {
    if (!candidateSet.has(id)) {
      candidateSet.add(id);
      candidateIds.push(id);
    }
  };

  for (const edge of edges) {
    const currentPresent = candidateSet.has(edge.current_chunk_id);
    const retainedPresent = candidateSet.has(edge.retained_chunk_id);
    if (!currentPresent && !retainedPresent) {
      trace.push({ edge_id: edge.edge_id, relation_type: edge.relation_type, action: 'no_expansion', reason: 'neither_endpoint_in_base_pool' });
      continue;
    }

    if (isPairPreserving(edge)) {
      add(edge.current_chunk_id);
      add(edge.retained_chunk_id);
      pairCoverageEdges.push(edge);
      trace.push({ edge_id: edge.edge_id, relation_type: edge.relation_type, action: 'expand_pair', reason: 'relation_preserves_both_applicable_evidence_endpoints' });
      continue;
    }

    if (isRetainedUnsafe(edge)) unsafeIds.add(edge.retained_chunk_id);
    if (retainedPresent) add(edge.current_chunk_id);
    trace.push({
      edge_id: edge.edge_id,
      relation_type: edge.relation_type,
      action: retainedPresent ? 'expand_current_only' : 'block_retained',
      reason: edge.relation_type === 'conditional_difference'
        ? 'conditional_applicability_not_established'
        : 'relation_does_not_authorize_retained_pair_coverage'
    });
  }

  return { candidateIds, unsafeIds, pairCoverageEdges, trace };
}

export function selectRelationAwareTopK<T extends { chunk_id: string; final_score: number }>(
  scores: T[],
  pairCoverageEdges: RelationAwareEdge[],
  unsafeIds: ReadonlySet<string>,
  topK: number
): T[] {
  const sorted = scores
    .filter((item) => !unsafeIds.has(item.chunk_id))
    .sort((a, b) => b.final_score - a.final_score || a.chunk_id.localeCompare(b.chunk_id));
  if (topK <= 0 || sorted.length === 0) return [];

  const chosen = [sorted[0]];
  const chosenIds = new Set([sorted[0].chunk_id]);
  const counterparts = new Set<string>();
  for (const edge of pairCoverageEdges) {
    if (!isPairPreserving(edge)) continue;
    if (edge.current_chunk_id === sorted[0].chunk_id) counterparts.add(edge.retained_chunk_id);
    if (edge.retained_chunk_id === sorted[0].chunk_id) counterparts.add(edge.current_chunk_id);
  }
  const paired = sorted.find((item) => counterparts.has(item.chunk_id) && !chosenIds.has(item.chunk_id));
  if (paired && chosen.length < topK) {
    chosen.push(paired);
    chosenIds.add(paired.chunk_id);
  }
  for (const item of sorted) {
    if (chosen.length >= topK) break;
    if (!chosenIds.has(item.chunk_id)) {
      chosen.push(item);
      chosenIds.add(item.chunk_id);
    }
  }
  return chosen;
}
