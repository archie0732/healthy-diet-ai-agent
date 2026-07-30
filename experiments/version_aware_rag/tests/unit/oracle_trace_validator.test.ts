import { describe, test, expect } from 'bun:test';
import { validateCandidateTrace } from '../../src/diagnostics/trace_validator';
import { CandidateStageRecord } from '../../src/diagnostics/diagnostic_types';

describe('Oracle Trace Validator Unit Tests', () => {
  test('valid trace passes with zero violations', () => {
    const record: CandidateStageRecord = {
      query_id: 'q-1',
      split: 'development',
      candidate_pool_id: 'hash1',
      chunk_id: 'c-1',
      gold_status: { required: true, preferred: false, deprecated: false, forbidden: false, citation_safe: true },
      stages: {
        base: { present: true, rank: 1, score: 0.5 },
        relation_lookup: { matched_relation_ids: [], relation_types: [], policy_labels: [] },
        scope: { query_population: [], query_conditions: [], relation_populations: [], relation_conditions: [], matched: true, reason: '' },
        filter: { retained: true, reason: '' },
        boost: { retain_relation_boost: 0.1, condition_boost: 0.0 },
        expansion: { was_seed: false, was_added: false, parent_chunk_id: null, reason: null },
        diversification: { penalty: 1.0, reason: null },
        final: { present: true, rank: 1, score: 0.6 }
      }
    };

    const violations = validateCandidateTrace(record);
    expect(violations.length).toBe(0);
  });

  test('detects filtered candidate in final output', () => {
    const record: CandidateStageRecord = {
      query_id: 'q-1',
      split: 'development',
      candidate_pool_id: 'hash1',
      chunk_id: 'c-1',
      gold_status: { required: true, preferred: false, deprecated: false, forbidden: false, citation_safe: true },
      stages: {
        base: { present: true, rank: 1, score: 0.5 },
        relation_lookup: { matched_relation_ids: [], relation_types: [], policy_labels: [] },
        scope: { query_population: [], query_conditions: [], relation_populations: [], relation_conditions: [], matched: true, reason: '' },
        filter: { retained: false, reason: 'Filtered out' },
        boost: { retain_relation_boost: 0.0, condition_boost: 0.0 },
        expansion: { was_seed: false, was_added: false, parent_chunk_id: null, reason: null },
        diversification: { penalty: 1.0, reason: null },
        final: { present: true, rank: 1, score: 0.5 }
      }
    };

    const violations = validateCandidateTrace(record);
    expect(violations.length).toBe(1);
    expect(violations[0].rule).toBe('FILTERED_CANDIDATE_IN_FINAL_OUTPUT');
  });

  test('detects added expansion chunk missing parent_chunk_id', () => {
    const record: CandidateStageRecord = {
      query_id: 'q-1',
      split: 'development',
      candidate_pool_id: 'hash1',
      chunk_id: 'c-1',
      gold_status: { required: true, preferred: false, deprecated: false, forbidden: false, citation_safe: true },
      stages: {
        base: { present: false, rank: null, score: 0.0 },
        relation_lookup: { matched_relation_ids: [], relation_types: [], policy_labels: [] },
        scope: { query_population: [], query_conditions: [], relation_populations: [], relation_conditions: [], matched: true, reason: '' },
        filter: { retained: true, reason: '' },
        boost: { retain_relation_boost: 0.0, condition_boost: 0.0 },
        expansion: { was_seed: false, was_added: true, parent_chunk_id: null, reason: 'Expanded' },
        diversification: { penalty: 1.0, reason: null },
        final: { present: true, rank: 3, score: 0.0 }
      }
    };

    const violations = validateCandidateTrace(record);
    expect(violations.length).toBe(1);
    expect(violations[0].rule).toBe('EXPANDED_CANDIDATE_MISSING_PARENT');
  });
});
