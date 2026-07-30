import { describe, expect, test } from 'bun:test';
import { buildCitationSafeFallback, validateAnswerCitations } from '../../src/generation/citation_validator';
import type { CorpusChunk } from '../../src/corpus/types';

const chunk = { chunk_id: 'chunk-2025-a', document_id: 'doc', edition: '2025', published_at: '2025-01-01', source_url: '', source_checksum: '', page_number: 1, passage_index: 0, char_start: 0, char_end: 20, text: 'Choose a varied dietary pattern.', topic_ids: [], lineage_id: null, population_tags: [], condition_tags: [], numeric_claims: [] } as CorpusChunk;

describe('answer citation contract', () => {
  test('accepts exact retrieved chunk IDs', () => {
    expect(validateAnswerCitations('Choose a varied dietary pattern [chunk-2025-a].', [chunk.chunk_id]).valid).toBe(true);
  });

  test('rejects ordinal, evidence-label, and unknown citations', () => {
    for (const answer of ['Choose varied foods [1].', 'Choose varied foods [Evidence 1].', 'Choose varied foods [unknown].']) {
      expect(validateAnswerCitations(answer, [chunk.chunk_id]).valid).toBe(false);
    }
  });

  test('rejects uncited material claims', () => {
    expect(validateAnswerCitations('Choose a varied dietary pattern.', [chunk.chunk_id]).uncitedMaterialSegments.length).toBe(1);
  });

  test('safe fallback uses only supplied exact IDs and passes validation', () => {
    const answer = buildCitationSafeFallback([chunk]);
    const result = validateAnswerCitations(answer, [chunk.chunk_id]);
    expect(result.valid).toBe(true);
    expect(result.validCitationIds).toEqual([chunk.chunk_id]);
  });
});
