import { describe, test, expect } from 'bun:test';
import { attributeFailure } from '../../src/diagnostics/stage_attribution';
import { CandidateStageRecord } from '../../src/diagnostics/diagnostic_types';

function createMockTraceRecord(overrides?: Partial<CandidateStageRecord['stages']>): CandidateStageRecord {
  return {
    query_id: 'q-test-1',
    split: 'development',
    candidate_pool_id: 'hash123',
    chunk_id: 'chunk-101',
    gold_status: {
      required: true,
      preferred: false,
      deprecated: false,
      forbidden: false,
      citation_safe: true
    },
    stages: {
      base: { present: true, rank: 1, score: 0.8 },
      relation_lookup: { matched_relation_ids: ['rel-1'], relation_types: ['superseded'], policy_labels: ['deprecated'] },
      scope: { query_population: [], query_conditions: [], relation_populations: [], relation_conditions: [], matched: true, reason: 'Matched' },
      filter: { retained: true, reason: 'Retained' },
      boost: { retain_relation_boost: 0.0, condition_boost: 0.0 },
      expansion: { was_seed: false, was_added: false, parent_chunk_id: null, reason: null },
      diversification: { penalty: 1.0, reason: null },
      final: { present: true, rank: 1, score: 0.8 },
      ...overrides
    }
  };
}

describe('Oracle Stage Attribution Unit Tests', () => {
  test('1. required chunk missing in corpus -> judgment_or_alignment_issue', () => {
    const result = attributeFailure('q-1', 'chunk-missing', undefined, { goldChunkExists: false });
    expect(result.primary_cause).toBe('judgment_or_alignment_issue');
    expect(result.first_failure_stage).toBe('S0');
  });

  test('2. required chunk missing in base candidate pool S1 -> base_candidate_recall_failure', () => {
    const result = attributeFailure('q-1', 'chunk-101', undefined);
    expect(result.primary_cause).toBe('base_candidate_recall_failure');
    expect(result.first_failure_stage).toBe('S1');
  });

  test('3. NaN base score -> normalization_or_score_failure', () => {
    const trace = createMockTraceRecord({ base: { present: true, rank: 1, score: NaN } });
    const result = attributeFailure('q-1', 'chunk-101', trace);
    expect(result.primary_cause).toBe('normalization_or_score_failure');
    expect(result.first_failure_stage).toBe('S2');
  });

  test('4. relation lookup failure when relation exists in dataset -> relation_lookup_failure', () => {
    const trace = createMockTraceRecord({
      relation_lookup: { matched_relation_ids: [], relation_types: [], policy_labels: [] },
      filter: { retained: false, reason: 'No active relation' }
    });
    const result = attributeFailure('q-1', 'chunk-101', trace, { relationInDatasetExists: true });
    expect(result.primary_cause).toBe('relation_lookup_failure');
    expect(result.first_failure_stage).toBe('S3');
  });

  test('5. relation coverage gap when relation missing in dataset -> relation_coverage_gap', () => {
    const trace = createMockTraceRecord({
      relation_lookup: { matched_relation_ids: [], relation_types: [], policy_labels: [] },
      filter: { retained: false, reason: 'No active relation' }
    });
    const result = attributeFailure('q-1', 'chunk-101', trace, { relationInDatasetExists: false });
    expect(result.primary_cause).toBe('relation_coverage_gap');
    expect(result.first_failure_stage).toBe('S3');
  });

  test('6. scope mismatch -> scope_resolution_failure', () => {
    const trace = createMockTraceRecord({
      scope: { query_population: ['p1'], query_conditions: [], relation_populations: ['p2'], relation_conditions: [], matched: false, reason: 'Population mismatch' },
      filter: { retained: false, reason: 'Scope filter' }
    });
    const result = attributeFailure('q-1', 'chunk-101', trace);
    expect(result.primary_cause).toBe('scope_resolution_failure');
    expect(result.first_failure_stage).toBe('S4');
  });

  test('7. policy filter drop -> policy_over_filtering', () => {
    const trace = createMockTraceRecord({
      filter: { retained: false, reason: 'Filtered out' }
    });
    const result = attributeFailure('q-1', 'chunk-101', trace);
    expect(result.primary_cause).toBe('policy_over_filtering');
    expect(result.first_failure_stage).toBe('S5');
  });

  test('8. stale chunk retained into top-3 -> policy_under_filtering', () => {
    const trace = createMockTraceRecord({
      filter: { retained: true, reason: 'Retained' },
      final: { present: true, rank: 2, score: 0.8 }
    });
    trace.gold_status = { required: false, preferred: false, deprecated: true, forbidden: false, citation_safe: false };
    const result = attributeFailure('q-1', 'chunk-101', trace);
    expect(result.primary_cause).toBe('policy_under_filtering');
    expect(result.first_failure_stage).toBe('S5');
  });

  test('9. boost misranking -> boost_misranking', () => {
    const trace = createMockTraceRecord({
      base: { present: true, rank: 2, score: 0.7 },
      boost: { retain_relation_boost: 0.1, condition_boost: 0.0 },
      final: { present: true, rank: 5, score: 0.8 }
    });
    const result = attributeFailure('q-1', 'chunk-101', trace);
    expect(result.primary_cause).toBe('boost_misranking');
    expect(result.first_failure_stage).toBe('S6');
  });

  test('10. expansion added chunk missing top-3 -> compatibility_expansion_failure', () => {
    const trace = createMockTraceRecord({
      expansion: { was_seed: false, was_added: true, parent_chunk_id: 'chunk-seed', reason: 'Expanded' },
      final: { present: true, rank: 6, score: 0.4 }
    });
    const result = attributeFailure('q-1', 'chunk-101', trace);
    expect(result.primary_cause).toBe('compatibility_expansion_failure');
    expect(result.first_failure_stage).toBe('S7');
  });

  test('11. diversification penalty -> diversification_failure', () => {
    const trace = createMockTraceRecord({
      diversification: { penalty: 0.1, reason: 'Duplication penalty' },
      final: { present: true, rank: 4, score: 0.08 }
    });
    const result = attributeFailure('q-1', 'chunk-101', trace);
    expect(result.primary_cause).toBe('diversification_failure');
    expect(result.first_failure_stage).toBe('S8');
  });

  test('12. top-k displacement -> top_k_displacement', () => {
    const trace = createMockTraceRecord({
      final: { present: true, rank: 4, score: 0.75 }
    });
    const result = attributeFailure('q-1', 'chunk-101', trace);
    expect(result.primary_cause).toBe('top_k_displacement');
    expect(result.first_failure_stage).toBe('S9');
  });

  test('13. posthoc test split without trace -> unresolved', () => {
    const result = attributeFailure('q-1', 'chunk-101', undefined, { isTestSplitPosthoc: true });
    expect(result.primary_cause).toBe('unresolved');
    expect(result.confidence).toBe('medium');
  });
});
