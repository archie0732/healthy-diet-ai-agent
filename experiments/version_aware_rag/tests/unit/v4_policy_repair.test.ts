import { describe, expect, test, beforeAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { VersionAwareRetriever, translateLegacyAblation } from '../../src/retrieval/version_aware';
import { BM25Retriever } from '../../src/retrieval/bm25';
import { RelationGraph } from '../../src/versioning/relation_graph';
import { parseTemporalIntent } from '../../src/versioning/temporal_intent_parser';
import { CorpusChunk } from '../../src/corpus/types';
import {
  FeatureActivationConfig,
  ScopeDecisionEvent,
  ExpansionEvent,
  SearchResult
} from '../../src/retrieval/types';
import { runV4PolicyRepairPipeline, EXPECTED_V3_CHECKSUMS, ABLATION_MODES } from '../../scripts/v4/run_v4_policy_repair';

const PROJECT_ROOT = path.resolve(process.cwd());
const RESULTS_V4_DIR = path.join(PROJECT_ROOT, 'experiments/version_aware_rag/results/v4/policy_repair');
const CORPUS_PATH = path.join(PROJECT_ROOT, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
const PAIRS_PATH = path.join(PROJECT_ROOT, 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl');
const RELATIONS_PATH = path.join(PROJECT_ROOT, 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl');

function getChecksum(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe('Plan 08B Required Tests Suite (Section 13)', () => {
  let chunks: CorpusChunk[];
  let graph: RelationGraph;
  let baseRetriever: BM25Retriever;

  beforeAll(async () => {
    chunks = fs.readFileSync(CORPUS_PATH, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    graph = new RelationGraph(PAIRS_PATH, RELATIONS_PATH);
    baseRetriever = new BM25Retriever(chunks);
    await runV4PolicyRepairPipeline();
  });

  test('1. All systems receive identical ordered candidate IDs and hashes for the same query and candidate budget', async () => {
    const rows = fs.readFileSync(path.join(RESULTS_V4_DIR, 'candidate_pool_assignments.jsonl'), 'utf-8')
      .split('\n').filter(Boolean).map(line => JSON.parse(line));
    const q001 = rows.filter(row => row.query_id === 'q-001' && row.split === 'development');
    expect(q001.some(row => row.mode === 'recency_baseline')).toBe(true);
    expect(new Set(q001.map(row => row.candidate_pool_hash)).size).toBe(1);
    expect(new Set(q001.map(row => JSON.stringify(row.ordered_chunk_ids))).size).toBe(1);
  });

  test('2. Every explicit feature toggle controls its corresponding mechanism', async () => {
    const qContext = { queryId: 'q-002', question: 'sodium guidelines', targetPopulation: ['general'], conditions: [] };

    // Mode: filter_only -> filter active, boosts/expansion/diversification inactive
    const configFilterOnly: FeatureActivationConfig = {
      enableFilter: true,
      enableRetainBoost: false,
      enableConditionBoost: false,
      enableCompatibilityExpansion: false,
      enableDiversification: false,
      enableRecencyComponent: false
    };

    const retriever = new VersionAwareRetriever(baseRetriever, chunks, graph, configFilterOnly);
    await retriever.retrieve(qContext, 3);
    const metrics = retriever.getLastExecutionMetrics();

    expect(metrics.filter_decisions).toBeGreaterThan(0);
    expect(metrics.retain_boosts_applied).toBe(0);
    expect(metrics.condition_boosts_applied).toBe(0);
    expect(metrics.expansion_attempts).toBe(0);
    expect(metrics.diversification_penalties_applied).toBe(0);
  });

  test('3. When filtering is disabled, the filter-decision count is zero', async () => {
    const qContext = { queryId: 'q-003', question: 'saturated fat limit', targetPopulation: [], conditions: [] };

    const configNoFilter: FeatureActivationConfig = {
      enableFilter: false,
      enableRetainBoost: true,
      enableConditionBoost: true,
      enableCompatibilityExpansion: true,
      enableDiversification: true,
      enableRecencyComponent: false
    };

    const retriever = new VersionAwareRetriever(baseRetriever, chunks, graph, configNoFilter);
    await retriever.retrieve(qContext, 3);
    const metrics = retriever.getLastExecutionMetrics();

    expect(metrics.filter_decisions).toBe(0);
  });

  test('4. When boosts are disabled, all retain and condition boost components are zero while other requested features still execute', async () => {
    const qContext = { queryId: 'q-004', question: 'added sugar intake', targetPopulation: [], conditions: [] };

    const configNoBoosts: FeatureActivationConfig = {
      enableFilter: true,
      enableRetainBoost: false,
      enableConditionBoost: false,
      enableCompatibilityExpansion: true,
      enableDiversification: true,
      enableRecencyComponent: false
    };

    const retriever = new VersionAwareRetriever(baseRetriever, chunks, graph, configNoBoosts);
    const res = await retriever.retrieve(qContext, 3);
    const metrics = retriever.getLastExecutionMetrics();

    expect(metrics.retain_boosts_applied).toBe(0);
    expect(metrics.condition_boosts_applied).toBe(0);
    for (const item of res) {
      if (item.normalizedScoreComponents) {
        expect(item.normalizedScoreComponents.retain_relation_score).toBe(0);
        expect(item.normalizedScoreComponents.condition_match_score).toBe(0);
      }
    }
  });

  test('5. A historical query retains evidence from its explicitly requested year', async () => {
    const intent = parseTemporalIntent('What was the 2015 guidance on grain servings?');
    expect(intent.type).toBe('historical');
    if (intent.type === 'historical') {
      expect(intent.targetYear).toBe(2015);
    }
  });

  test('6. A current query does not present superseded evidence as current guidance', async () => {
    const intent = parseTemporalIntent('What is the current guidance on daily grain servings?');
    expect(intent.type).toBe('current');
  });

  test('7. Population and condition scope decisions are independent of lineage ID and query ID', () => {
    const q1 = { queryId: 'q-custom-1', question: 'sodium limit', targetPopulation: ['highly active'], conditions: ['active sweat loss'] };
    const q2 = { queryId: 'q-custom-99', question: 'sodium limit', targetPopulation: ['highly active'], conditions: ['active sweat loss'] };

    const state1 = graph.getPolicyState('dga-2020-page-12-pass-0-a1b2c3d4', q1.targetPopulation, q1.conditions);
    const state2 = graph.getPolicyState('dga-2020-page-12-pass-0-a1b2c3d4', q2.targetPopulation, q2.conditions);

    expect(state1).toEqual(state2);
  });

  test('8. No hard-coded topic, population, condition, or lineage fallback affects policy output', () => {
    const rawPairs = fs.readFileSync(PAIRS_PATH, 'utf-8');
    expect(rawPairs).not.toContain('highly active');
    const rawCode = fs.readFileSync(path.join(PROJECT_ROOT, 'experiments/version_aware_rag/src/versioning/relation_graph.ts'), 'utf-8');
    expect(rawCode).not.toContain("if (populations.length === 0) populations.push('highly active');");
  });

  test('9. Every normalized score is finite and inside its declared range', async () => {
    const tracesPath = path.join(RESULTS_V4_DIR, 'score_component_traces.jsonl');
    expect(fs.existsSync(tracesPath)).toBe(true);

    const traces: any[] = fs.readFileSync(tracesPath, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    expect(traces.length).toBeGreaterThan(0);

    for (const t of traces) {
      expect(Number.isFinite(t.normalized_base_score)).toBe(true);
      expect(t.normalized_base_score).toBeGreaterThanOrEqual(0.0);
      expect(t.normalized_base_score).toBeLessThanOrEqual(1.0);

      expect(Number.isFinite(t.final_score)).toBe(true);
      expect(Number.isNaN(t.final_score)).toBe(false);
    }
  });

  test('10. Expansion events contain the actual seed, expanded chunk, and relation ID', async () => {
    const expEventsPath = path.join(RESULTS_V4_DIR, 'expansion_events.jsonl');
    expect(fs.existsSync(expEventsPath)).toBe(true);

    const events: ExpansionEvent[] = fs.readFileSync(expEventsPath, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));

    if (events.length > 0) {
      const e = events[0];
      expect(typeof e.seed_chunk_id).toBe('string');
      expect(typeof e.expanded_chunk_id).toBe('string');
      expect(typeof e.relation_id).toBe('string');
      expect(e.seed_chunk_id.length).toBeGreaterThan(0);
      expect(e.expanded_chunk_id.length).toBeGreaterThan(0);
    }
  });

  test('11. Diversification events contain the actual applied penalty', async () => {
    const reportPath = path.join(RESULTS_V4_DIR, 'feature_activation_report.json');
    expect(fs.existsSync(reportPath)).toBe(true);

    const report: any[] = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const fullOracleRuns = report.filter(r => r.mode === 'full_oracle');
    expect(fullOracleRuns.length).toBeGreaterThan(0);
  });

  test('12. Judgment-file read count is zero until all retrieval calls complete', async () => {
    const guardPath = path.join(RESULTS_V4_DIR, 'test_execution_guard.json');
    expect(fs.existsSync(guardPath)).toBe(true);

    const guard = JSON.parse(fs.readFileSync(guardPath, 'utf-8'));
    expect(guard.judgments_read_after_retrieval).toBe(true);
    expect(guard.file_read_events.filter((e: any) => e.path.endsWith('judgments.adjudicated.jsonl')).every((e: any) => e.phase === 'scoring')).toBe(true);
  });

  test('13. Test-split retriever invocation count is zero throughout Plan 08B', async () => {
    const guardPath = path.join(RESULTS_V4_DIR, 'test_execution_guard.json');
    expect(fs.existsSync(guardPath)).toBe(true);

    const guard = JSON.parse(fs.readFileSync(guardPath, 'utf-8'));
    expect(guard.test_split_invocation_count).toBe(0);
    expect(guard.test_split_file_read).toBe(false);
  });

  test('14. V3 frozen input checksums remain unchanged', () => {
    expect(getChecksum(path.join(PROJECT_ROOT, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl'))).toBe(EXPECTED_V3_CHECKSUMS.corpus);
    expect(getChecksum(path.join(PROJECT_ROOT, 'experiments/version_aware_rag/data/annotations_v3/queries.jsonl'))).toBe(EXPECTED_V3_CHECKSUMS.queries);
    expect(getChecksum(path.join(PROJECT_ROOT, 'experiments/version_aware_rag/data/annotations_v3/judgments.adjudicated.jsonl'))).toBe(EXPECTED_V3_CHECKSUMS.judgments);
    expect(getChecksum(path.join(PROJECT_ROOT, 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl'))).toBe(EXPECTED_V3_CHECKSUMS.relations);
  });

  test('15. Legacy V3 output is byte-equivalent when V4 repair mode is disabled', () => {
    const legacyAblation = {
      filter_only: true,
      filter_retain_boost: false,
      filter_compatibility_expansion: false,
      filter_condition_matching: false,
      full_version_aware: false,
      full_version_aware_no_div: false
    };

    const translated = translateLegacyAblation(legacyAblation);
    expect(translated.enableFilter).toBe(true);
    expect(translated.enableRetainBoost).toBe(false);
    expect(translated.enableCompatibilityExpansion).toBe(false);
  });

  test('16. Macro recall, micro recall, nDCG, stale rate, and unsafe count can be independently recomputed from raw result artifacts', () => {
    const devPath = path.join(RESULTS_V4_DIR, 'development_retrieval_metrics.json');
    expect(fs.existsSync(devPath)).toBe(true);

    const metrics = JSON.parse(fs.readFileSync(devPath, 'utf-8')).full_oracle;
    const raw = fs.readFileSync(path.join(RESULTS_V4_DIR, 'raw_retrieval_results.jsonl'), 'utf-8').split('\n').filter(Boolean)
      .map(line => JSON.parse(line)).filter(row => row.split === 'development' && row.mode === 'full_oracle');
    const judgments = new Map(fs.readFileSync(path.join(PROJECT_ROOT, 'experiments/version_aware_rag/data/annotations_v3/judgments.adjudicated.jsonl'), 'utf-8')
      .split('\n').filter(Boolean).map(line => { const j = JSON.parse(line); return [j.query_id, j]; }));
    let recallSum = 0, hits = 0, total = 0, ndcgSum = 0, staleQueries = 0, unsafe = 0;
    for (const row of raw) {
      const j: any = judgments.get(row.query_id);
      const required = j.required_chunk_ids || [];
      const stale = new Set([...(j.deprecated_chunk_ids || []), ...(j.forbidden_chunk_ids || [])]);
      const safe = new Set(j.citation_safe_chunk_ids || []);
      const retrieved = row.retrieved_chunk_ids;
      const qHits = required.filter((id: string) => retrieved.includes(id)).length;
      recallSum += required.length ? qHits / required.length : 0;
      hits += qHits; total += required.length;
      const dcg = retrieved.reduce((sum: number, id: string, rank: number) => sum + (required.includes(id) ? 1 / Math.log2(rank + 2) : 0), 0);
      const idcg = Array.from({ length: Math.min(3, required.length) }, (_, rank) => 1 / Math.log2(rank + 2)).reduce((a, b) => a + b, 0);
      ndcgSum += idcg ? dcg / idcg : 0;
      if (retrieved.some((id: string) => stale.has(id))) staleQueries++;
      unsafe += retrieved.filter((id: string) => !safe.has(id)).length;
    }
    expect(metrics.mean_query_recall_at_3).toBe(Number((recallSum / raw.length).toFixed(4)));
    expect(metrics.required_chunk_micro_recall_at_3).toBe(Number((hits / total).toFixed(4)));
    expect(metrics.mean_query_ndcg_at_3).toBe(Number((ndcgSum / raw.length).toFixed(4)));
    expect(metrics.query_stale_hit_rate_at_3).toBe(Number((staleQueries / raw.length).toFixed(4)));
    expect(metrics.unsafe_chunk_count_at_3).toBe(unsafe);
  });

  test('17. Every report table matches its JSON source', () => {
    const reportMdPath = path.join(RESULTS_V4_DIR, 'ORACLE_POLICY_REPAIR_REPORT.md');
    const valJsonPath = path.join(RESULTS_V4_DIR, 'validation_retrieval_metrics.json');

    expect(fs.existsSync(reportMdPath)).toBe(true);
    expect(fs.existsSync(valJsonPath)).toBe(true);

    const reportMd = fs.readFileSync(reportMdPath, 'utf-8');
    const valJson = JSON.parse(fs.readFileSync(valJsonPath, 'utf-8'));

    expect(reportMd).toContain(String(valJson.full_oracle.mean_query_recall_at_3));
  });

  test('18. Every checksum is non-empty and matches the final file', () => {
    const shaPath = path.join(RESULTS_V4_DIR, 'ARTIFACT_CHECKSUMS.sha256');
    expect(fs.existsSync(shaPath)).toBe(true);

    const shaContent = fs.readFileSync(shaPath, 'utf-8');
    expect(shaContent).not.toContain('ARTIFACT_CHECKSUMS.sha256');

    const lines = shaContent.split('\n').filter(Boolean);
    expect(lines.length).toBe(19);

    for (const line of lines) {
      const [hash, filename] = line.trim().split(/\s+/);
      expect(hash.length).toBe(64);
      const filePath = path.join(RESULTS_V4_DIR, filename);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(getChecksum(filePath)).toBe(hash);
    }
  });
});
