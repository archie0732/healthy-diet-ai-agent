import { describe, expect, test } from 'bun:test';
import { buildRelationAwareCandidateSet, selectRelationAwareTopK, type RelationAwareEdge } from '../../src/retrieval/relation_aware_pair_policy';

const score = (chunk_id: string, final_score: number) => ({ chunk_id, final_score });

describe('V5 relation-aware pair policy', () => {
  test('superseded retained evidence cannot be expanded or pair-forced from current evidence', () => {
    const edge: RelationAwareEdge = { edge_id: 'e1', relation_type: 'superseded', current_chunk_id: 'new', retained_chunk_id: 'old' };
    const built = buildRelationAwareCandidateSet(['new', 'other'], [edge]);
    expect(built.candidateIds).not.toContain('old');
    expect(built.unsafeIds.has('old')).toBe(true);
    expect(selectRelationAwareTopK([score('new', 1), score('old', .99), score('other', .5)], built.pairCoverageEdges, built.unsafeIds, 2).map(x => x.chunk_id)).toEqual(['new', 'other']);
  });

  test('conflicting retained evidence is removed even when it was in the base pool', () => {
    const edge: RelationAwareEdge = { edge_id: 'e2', relation_type: 'conflicting', current_chunk_id: 'new', retained_chunk_id: 'old' };
    const built = buildRelationAwareCandidateSet(['old', 'other'], [edge]);
    expect(built.candidateIds).toContain('new');
    expect(selectRelationAwareTopK([score('old', 1), score('new', .7), score('other', .6)], built.pairCoverageEdges, built.unsafeIds, 2).map(x => x.chunk_id)).toEqual(['new', 'other']);
  });

  test('complementary evidence keeps bidirectional expansion and pair coverage', () => {
    const edge: RelationAwareEdge = { edge_id: 'e3', relation_type: 'complementary', current_chunk_id: 'current', retained_chunk_id: 'history' };
    const built = buildRelationAwareCandidateSet(['current', 'other'], [edge]);
    expect(built.candidateIds).toContain('history');
    expect(selectRelationAwareTopK([score('current', 1), score('other', .9), score('history', .2)], built.pairCoverageEdges, built.unsafeIds, 3).map(x => x.chunk_id)).toEqual(['current', 'history', 'other']);
  });

  test('conditional evidence requires an explicit applicability decision', () => {
    const base = { edge_id: 'e4', relation_type: 'conditional_difference' as const, current_chunk_id: 'current', retained_chunk_id: 'history' };
    expect(buildRelationAwareCandidateSet(['current'], [base]).candidateIds).not.toContain('history');
    expect(buildRelationAwareCandidateSet(['current'], [{ ...base, conditional_applicable: true }]).candidateIds).toContain('history');
  });

  test('relation type changes retrieval behavior for identical endpoints', () => {
    const common = { edge_id: 'e5', current_chunk_id: 'current', retained_chunk_id: 'history' };
    const complementary = buildRelationAwareCandidateSet(['current'], [{ ...common, relation_type: 'complementary' }]);
    const superseded = buildRelationAwareCandidateSet(['current'], [{ ...common, relation_type: 'superseded' }]);
    expect(complementary.candidateIds).not.toEqual(superseded.candidateIds);
  });
});
