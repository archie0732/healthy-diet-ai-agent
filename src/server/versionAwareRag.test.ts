import path from 'node:path';
import fs from 'node:fs';
import { describe, expect, test } from 'bun:test';

import { loadDefaultAgentConfig } from '../config/agentConfig';
import {
  explicitHistoryRouter,
  loadVersionAwareRetriever,
  rankConditionalVersionAware,
  relationTokenize,
  searchVersionedGuidelines,
} from './versionAwareRag';

const EXPERIMENT_DIR = path.resolve(import.meta.dir, '../../experiments/version_aware_rag');
const CHUNKS_FILE = path.join(EXPERIMENT_DIR, 'data/v6_corpus_frozen/chunks.jsonl');
const RELATIONS_FILE = path.join(EXPERIMENT_DIR, 'data/v6_repair_diagnostic/V6R_RUNTIME_RELATIONS.jsonl');
const V7_QUERIES_FILE = path.join(EXPERIMENT_DIR, 'data/v7_pilot/V7_QUERIES_SEALED.jsonl');
const V7_RAW_FILE = path.join(EXPERIMENT_DIR, 'results/v7_pilot/raw/V7_RAW_RETRIEVAL_RESULTS.jsonl');

const readJsonl = (filePath: string) =>
  fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

describe('version-aware RAG port', () => {
  test('default agent config enables it and points at the frozen corpus', async () => {
    const config = (await loadDefaultAgentConfig()).versionAwareRag;
    expect(config?.enabled).toBe(true);
    expect(config?.chunksFile).toBe(CHUNKS_FILE);
    expect(config?.relationsFile).toBe(RELATIONS_FILE);
  });

  test('history router matches the V7 patterns', () => {
    expect(explicitHistoryRouter('How did the sodium advice change from 2013?')).toBe(true);
    expect(explicitHistoryRouter('What was the previous recommendation?')).toBe(true);
    expect(explicitHistoryRouter('How much vitamin D in pregnancy?')).toBe(false);
  });

  test('relation tokenizer folds plurals, negation and adds bigrams', () => {
    expect(relationTokenize('without supplements')).toEqual(['neg', 'supplement', 'neg_supplement']);
  });

  test('reproduces the sealed V7 system E rankings exactly', () => {
    const retriever = loadVersionAwareRetriever(CHUNKS_FILE, RELATIONS_FILE);
    const queries = new Map(readJsonl(V7_QUERIES_FILE).map((q) => [q.query_id, q.query_text]));
    const expected = readJsonl(V7_RAW_FILE).filter((row) => row.system === 'E');
    expect(expected.length).toBe(40);

    for (const row of expected) {
      const query = queries.get(row.query_id)!;
      const candidates = retriever.generator.candidates(query, 20);
      expect(candidates.map((c) => c.chunk_id)).toEqual(row.shared_candidate_pool_ids);

      const { ranked, selectedPair, routerExplicitHistory } = rankConditionalVersionAware(
        query,
        candidates,
        retriever.relations,
      );
      expect(routerExplicitHistory).toBe(row.router_explicit_history);
      expect(selectedPair?.candidate_id ?? null).toBe(row.selected_pair?.candidate_id ?? null);
      expect(ranked.map((r) => r.chunk_id)).toEqual(row.ranked_candidates.map((r: { chunk_id: string }) => r.chunk_id));
    }
  });

  test('annotates superseded evidence and history pairs in tool output', () => {
    const retriever = loadVersionAwareRetriever(CHUNKS_FILE, RELATIONS_FILE);
    const result = searchVersionedGuidelines(
      retriever,
      "How did WHO's criteria for children with wasting to exit nutritional treatment change from the earlier version?",
      5,
    );
    expect(result.router_explicit_history).toBe(true);
    expect(result.selected_history_pair).not.toBeNull();
    const pairHits = result.hits.filter((hit) => hit.in_selected_history_pair);
    expect(pairHits.length).toBe(2);
    expect(pairHits.some((hit) => hit.newer_version)).toBe(true);
    expect(pairHits.some((hit) => hit.older_version)).toBe(true);
  });

  test('history queries always return both editions; other queries never flag a pair', () => {
    const retriever = loadVersionAwareRetriever(CHUNKS_FILE, RELATIONS_FILE);
    const history = searchVersionedGuidelines(
      retriever,
      'How did the haemoglobin cutoffs for anaemia in pregnant women change from the previous guideline?',
      3,
    );
    const years = history.hits.filter((hit) => hit.in_selected_history_pair).map((hit) => hit.published_year);
    expect(years.sort()).toEqual([2011, 2024]);
    expect(history.hits.length).toBeLessThanOrEqual(4);

    const current = searchVersionedGuidelines(retriever, 'haemoglobin cutoff for anaemia in pregnant women', 3);
    expect(current.router_explicit_history).toBe(false);
    expect(current.hits.every((hit) => !hit.in_selected_history_pair && !hit.appended_pair_mate)).toBe(true);
  });
});
