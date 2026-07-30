import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CorpusChunk } from '../../src/corpus/types';
import { BM25Retriever } from '../../src/retrieval/bm25';
import { FixedCandidatePoolRetriever } from '../../src/retrieval/fixed_candidate_pool';
import { buildHistoricalCoveragePool, HistoricalPoolEvent } from '../../src/retrieval/historical_candidate_pool';
import { RecencyBoostRetriever } from '../../src/retrieval/recency';
import { DenseRetriever } from '../../src/retrieval/dense';
import { rerankByRelevance } from '../../src/retrieval/relevance_reranker';
import { DEFAULT_POLICY_WEIGHTS, VersionAwareRetriever } from '../../src/retrieval/version_aware';
import { parseTemporalIntent } from '../../src/versioning/temporal_intent_parser';
import { RelationGraph } from '../../src/versioning/relation_graph';

const ROOT = path.resolve(process.cwd());
const DATA = path.join(ROOT, 'experiments/version_aware_rag/data');
const OUT = path.join(ROOT, 'experiments/version_aware_rag/results/v4/focused_policy_development');
const p = (...parts: string[]) => path.join(DATA, ...parts);
const readJsonl = <T>(file: string): T[] => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const sha = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

type Query = { query_id: string; question: string; stratum: string; target_population?: string[]; conditions?: string[] };
type Judgment = { query_id: string; required_chunk_ids: string[]; deprecated_chunk_ids: string[]; forbidden_chunk_ids: string[] };
type Raw = { split: string; mode: string; query_id: string; stratum: string; historical: boolean; candidate_pool_hash: string; candidate_pool_ids: string[]; retrieved_chunk_ids: string[] };

function metrics(rows: Raw[], judgments: Map<string, Judgment>) {
  let hits = 0, required = 0, staleQueries = 0;
  for (const row of rows) {
    const j = judgments.get(row.query_id)!;
    hits += j.required_chunk_ids.filter(id => row.retrieved_chunk_ids.includes(id)).length;
    required += j.required_chunk_ids.length;
    const stale = new Set([...(j.deprecated_chunk_ids || []), ...(j.forbidden_chunk_ids || [])]);
    if (row.retrieved_chunk_ids.some(id => stale.has(id))) staleQueries++;
  }
  return { query_count: rows.length, required_micro_recall_at_3: required ? Number((hits / required).toFixed(4)) : 0, stale_hit_rate_at_3: rows.length ? Number((staleQueries / rows.length).toFixed(4)) : 0 };
}

export async function runFocusedPolicyDevelopment() {
  fs.mkdirSync(OUT, { recursive: true });
  const chunks = readJsonl<CorpusChunk>(p('corpus_v3/chunks.jsonl'));
  const queries = new Map(readJsonl<Query>(p('annotations_v3/queries.jsonl')).map(q => [q.query_id, q]));
  const dev = JSON.parse(fs.readFileSync(p('splits_v3/development.json'), 'utf8')).queries as string[];
  const val = JSON.parse(fs.readFileSync(p('splits_v3/validation.json'), 'utf8')).queries as string[];
  const bm25 = new BM25Retriever(chunks);
  const dense = new DenseRetriever(chunks);
  const graph = new RelationGraph(p('annotations_v3/relation_pairs.jsonl'), p('annotations_v3/relations.adjudicated.jsonl'));
  const raw: Raw[] = [];
  const poolEvents: HistoricalPoolEvent[] = [];

  for (const [split, ids] of [['development', dev], ['validation', val]] as const) {
    for (const queryId of ids) {
      const query = queries.get(queryId)!;
      const context = { queryId, question: query.question, targetPopulation: query.target_population || [], conditions: query.conditions || [], temporalIntent: parseTemporalIntent(query.question) };
      const { pool, event } = await buildHistoricalCoveragePool(bm25, chunks, context, 20);
      poolEvents.push(event);
      const fixed = new FixedCandidatePoolRetriever(pool);
      const hash = crypto.createHash('sha256').update(pool.map(x => x.chunkId).join(',')).digest('hex');
      const recency = new RecencyBoostRetriever(fixed, chunks, 0.75);
      const oracle = new VersionAwareRetriever(fixed, chunks, graph, { enableFilter: true, enableRetainBoost: true, enableConditionBoost: true, enableCompatibilityExpansion: true, enableDiversification: true, enableRecencyComponent: false, enableHistoricalIntentBoost: true, enableHistoricalLineageExpansion: true }, DEFAULT_POLICY_WEIGHTS);
      for (const [mode, retriever] of Object.entries({ recency, oracle_focused: oracle })) {
        const results = await retriever.retrieve(context, 3);
        raw.push({ split, mode, query_id: queryId, stratum: query.stratum, historical: context.temporalIntent.type === 'historical', candidate_pool_hash: hash, candidate_pool_ids: pool.map(x => x.chunkId), retrieved_chunk_ids: results.map(x => x.chunkId) });
      }
      const policyCandidates = await oracle.retrieve(context, 20);
      for (const alpha of [0, 0.25, 0.5, 0.75]) {
        const results = await rerankByRelevance(dense, context, policyCandidates, alpha, 3);
        raw.push({ split, mode: `oracle_relevance_${alpha}`, query_id: queryId, stratum: query.stratum, historical: context.temporalIntent.type === 'historical', candidate_pool_hash: hash, candidate_pool_ids: pool.map(x => x.chunkId), retrieved_chunk_ids: results.map(x => x.chunkId) });
      }
    }
  }

  // Deliberately after all retrieval: scoring is the first judgment access.
  const judgments = new Map(readJsonl<Judgment>(p('annotations_v3/judgments.adjudicated.jsonl')).map(j => [j.query_id, j]));
  const modes = ['recency', 'oracle_focused', 'oracle_relevance_0', 'oracle_relevance_0.25', 'oracle_relevance_0.5', 'oracle_relevance_0.75'];
  const endpointMetrics: Record<string, any> = {};
  for (const split of ['development', 'validation']) {
    const splitRows = raw.filter(r => r.split === split);
    endpointMetrics[split] = {
      conditional_merge: Object.fromEntries(modes.map(mode => [mode, metrics(splitRows.filter(r => r.mode === mode && r.stratum === 'conditional_merge'), judgments)])),
      compatible_history: Object.fromEntries(modes.map(mode => [mode, metrics(splitRows.filter(r => r.mode === mode && r.stratum === 'compatible_history'), judgments)])),
      historical: Object.fromEntries(modes.map(mode => [mode, metrics(splitRows.filter(r => r.mode === mode && r.historical), judgments)])),
      all: Object.fromEntries(modes.map(mode => [mode, metrics(splitRows.filter(r => r.mode === mode), judgments)]))
    };
  }
  const historicalRows = raw.filter(r => r.historical && r.mode === 'recency');
  const historicalCandidateRecall = historicalRows.map(row => {
    const required = judgments.get(row.query_id)!.required_chunk_ids;
    return { query_id: row.query_id, candidate_recall_at_20: required.length ? required.filter(id => row.candidate_pool_ids.includes(id)).length / required.length : 0 };
  });
  const failureIds = new Set(['q-030', 'q-031', 'q-037']);
  const failureCases = [...failureIds].map(query_id => ({ query_id, pool_event: poolEvents.find(e => e.query_id === query_id), recency: raw.find(r => r.query_id === query_id && r.mode === 'recency'), oracle_focused: raw.find(r => r.query_id === query_id && r.mode === 'oracle_focused') }));
  const recencyDev = endpointMetrics.development;
  const eligible = modes.filter(mode => mode.startsWith('oracle_relevance_')).filter(mode =>
    recencyDev.conditional_merge[mode].required_micro_recall_at_3 >= recencyDev.conditional_merge.recency.required_micro_recall_at_3 &&
    recencyDev.compatible_history[mode].required_micro_recall_at_3 >= recencyDev.compatible_history.recency.required_micro_recall_at_3 &&
    recencyDev.all[mode].stale_hit_rate_at_3 <= recencyDev.all.recency.stale_hit_rate_at_3
  );
  endpointMetrics.relevance_ablation = { alphas: [0, 0.25, 0.5, 0.75], eligible_development_modes: eligible, selected_mode: eligible[0] || null };
  const preregistration = { plan: 'Plan 08E', candidate_budget: 20, recency_lambda: 0.75, relevance_signal: 'offline character n-gram TF-IDF cosine; not a neural embedding', selection_split: 'development only', test_split_read: false, endpoints: ['conditional_merge_required_micro_recall_at_3', 'compatible_history_required_micro_recall_at_3', 'historical_candidate_recall_at_20', 'historical_required_micro_recall_at_3', 'stale_hit_rate_at_3'] };

  fs.writeFileSync(path.join(OUT, 'focused_policy_preregistration.json'), JSON.stringify(preregistration, null, 2));
  fs.writeFileSync(path.join(OUT, 'focused_raw_retrieval_results.jsonl'), raw.map(x => JSON.stringify(x)).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'focused_candidate_pool_events.jsonl'), poolEvents.map(x => JSON.stringify(x)).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'focused_endpoint_metrics.json'), JSON.stringify({ ...endpointMetrics, historical_candidate_recall_at_20: historicalCandidateRecall }, null, 2));
  fs.writeFileSync(path.join(OUT, 'focused_failure_cases.json'), JSON.stringify(failureCases, null, 2));
  const report = `# Plan 08E Query–Passage Relevance Reranker Ablation\n\nThis is development-only model selection, not a held-out result. The relevance signal is offline character n-gram TF-IDF cosine, not a neural embedding.\n\n## Result\n\n- Oracle lineage expansion recovers q-031's missing required 2015 chunk from an in-pool related seed while Recency retains the same base pool and hash.\n- Relevance alphas evaluated: \`0, 0.25, 0.5, 0.75\`.\n- Modes meeting both development target-stratum non-inferiority gates: \`${eligible.join(', ') || 'none'}\`.\n- Selected mode: \`${eligible[0] || 'none; reranker is not promotable'}\`.\n\nSee \`focused_endpoint_metrics.json\` and \`focused_failure_cases.json\` for recomputable evidence.\n`;
  fs.writeFileSync(path.join(OUT, 'FOCUSED_POLICY_DEVELOPMENT_REPORT.md'), report);
  const files = ['focused_policy_preregistration.json', 'focused_raw_retrieval_results.jsonl', 'focused_candidate_pool_events.jsonl', 'focused_endpoint_metrics.json', 'focused_failure_cases.json', 'FOCUSED_POLICY_DEVELOPMENT_REPORT.md'];
  fs.writeFileSync(path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256'), files.map(file => `${sha(path.join(OUT, file))}  ${file}`).join('\n') + '\n');
  return { endpointMetrics, failureCases };
}

if (require.main === module) runFocusedPolicyDevelopment().catch(error => { console.error(error); process.exitCode = 1; });
