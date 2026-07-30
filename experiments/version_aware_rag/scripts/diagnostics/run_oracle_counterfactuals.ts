import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { BM25Retriever } from '../../src/retrieval/bm25';
import { RelationGraph } from '../../src/versioning/relation_graph';
import { CorpusChunk } from '../../src/corpus/types';
import { VersionAwareRetriever } from '../../src/retrieval/version_aware';
import { RecencyBoostRetriever } from '../../src/retrieval/recency';
import { FixedCandidatePoolRetriever } from '../../src/retrieval/fixed_candidate_pool';
import { CounterfactualModeResult, SensitivityResult, FeatureActivationConfig } from '../../src/diagnostics/diagnostic_types';

interface QueryItem {
  query_id: string;
  question: string;
  target_population: string[];
  conditions: string[];
}

interface JudgmentItem {
  query_id: string;
  required_chunk_ids: string[];
  deprecated_chunk_ids: string[];
  forbidden_chunk_ids: string[];
}

export async function runOracleCounterfactuals() {
  const corpusPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const queriesPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/queries.jsonl');
  const judgmentsPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/judgments.adjudicated.jsonl');
  const pairsPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl');
  const relationsPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl');

  const devSplitPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/splits_v3/development.json');
  const valSplitPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/splits_v3/validation.json');

  const chunks: CorpusChunk[] = fs.readFileSync(corpusPath, 'utf-8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const queriesMap = new Map<string, QueryItem>();
  fs.readFileSync(queriesPath, 'utf-8').split('\n').filter(Boolean).forEach(line => {
    const q: QueryItem = JSON.parse(line);
    queriesMap.set(q.query_id, q);
  });

  const judgmentsMap = new Map<string, JudgmentItem>();
  fs.readFileSync(judgmentsPath, 'utf-8').split('\n').filter(Boolean).forEach(line => {
    const j: JudgmentItem = JSON.parse(line);
    judgmentsMap.set(j.query_id, j);
  });

  const parseSplitQueries = (p: string): string[] => {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(parsed) ? parsed : (parsed.queries || []);
  };

  const devQueryIds = parseSplitQueries(devSplitPath);
  const valQueryIds = parseSplitQueries(valSplitPath);
  const evalQueryIds = [...devQueryIds, ...valQueryIds];

  const bm25Retriever = new BM25Retriever(chunks);
  const graph = new RelationGraph(pairsPath, relationsPath, 0.7);

  // 8 distinct non-identical ablation modes with explicit FeatureActivationConfig
  const modeConfigs: Array<{ mode: string; feature: FeatureActivationConfig; ablation?: any; isBase?: boolean; isRecency?: boolean }> = [
    {
      mode: 'Base',
      isBase: true,
      feature: { filter: false, retain_boost: false, condition_boost: false, expansion: false, diversification: false, recency_boost: false }
    },
    {
      mode: 'Recency',
      isRecency: true,
      feature: { filter: false, retain_boost: false, condition_boost: false, expansion: false, diversification: false, recency_boost: true, recency_lambda: 0.75 }
    },
    {
      mode: 'Filter only',
      ablation: { filter_only: true },
      feature: { filter: true, retain_boost: false, condition_boost: false, expansion: false, diversification: false, recency_boost: false }
    },
    {
      mode: 'No filter',
      ablation: { filter_only: false, filter_retain_boost: true, filter_condition_matching: true },
      feature: { filter: false, retain_boost: true, condition_boost: true, expansion: true, diversification: true, recency_boost: false }
    },
    {
      mode: 'No boosts',
      ablation: { filter_only: true, retain_relation_boost: 0.0, condition_boost: 0.0 },
      feature: { filter: true, retain_boost: false, condition_boost: false, expansion: true, diversification: true, recency_boost: false }
    },
    {
      mode: 'No expansion',
      ablation: { full_version_aware_no_div: true, compatibility_expansion: false },
      feature: { filter: true, retain_boost: true, condition_boost: true, expansion: false, diversification: true, recency_boost: false }
    },
    {
      mode: 'No diversification',
      ablation: { full_version_aware_no_div: true, diversification_penalty: 1.0 },
      feature: { filter: true, retain_boost: true, condition_boost: true, expansion: true, diversification: false, recency_boost: false }
    },
    {
      mode: 'Full Oracle',
      ablation: { full_version_aware: true },
      feature: { filter: true, retain_boost: true, condition_boost: true, expansion: true, diversification: true, recency_boost: false }
    }
  ];

  // Pre-fetch BM25 candidate pools for N=20 (standard ablation)
  const candidatePoolsMap = new Map<string, { pool: any[]; hash: string }>();

  for (const qid of evalQueryIds) {
    const query = queriesMap.get(qid);
    if (!query) continue;
    const retrievalContext = { queryId: qid, question: query.question, targetPopulation: query.target_population || ['general'], conditions: query.conditions || [] };

    const candidates = await bm25Retriever.retrieve(retrievalContext, 20);
    const sortedIds = candidates.map(c => c.chunkId).sort();
    const hash = crypto.createHash('sha256').update(sortedIds.join(',')).digest('hex').slice(0, 16);

    candidatePoolsMap.set(qid, { pool: candidates, hash });
  }

  const ablationResults: CounterfactualModeResult[] = [];

  for (const config of modeConfigs) {
    let totalRecall = 0;
    let totalNdcg = 0;
    let staleCount = 0;
    let unsafeCount = 0;
    const nQueries = evalQueryIds.length;
    let sampleHash = '';

    for (const qid of evalQueryIds) {
      const query = queriesMap.get(qid);
      const judgment = judgmentsMap.get(qid);
      const poolEntry = candidatePoolsMap.get(qid);
      if (!query || !judgment || !poolEntry) continue;

      sampleHash = poolEntry.hash;

      const retrievalContext = { queryId: qid, question: query.question, targetPopulation: query.target_population || ['general'], conditions: query.conditions || [] };
      const fixedPoolRetriever = new FixedCandidatePoolRetriever(poolEntry.pool);

      let retrieved: Array<{ chunkId: string }>;

      if (config.isBase) {
        retrieved = await fixedPoolRetriever.retrieve(retrievalContext, 3);
      } else if (config.isRecency) {
        const recencyRetriever = new RecencyBoostRetriever(fixedPoolRetriever, chunks, 0.75);
        retrieved = await recencyRetriever.retrieve(retrievalContext, 3);
      } else {
        const vaRetriever = new VersionAwareRetriever(fixedPoolRetriever, chunks, graph, config.ablation as any);
        retrieved = await vaRetriever.retrieve(retrievalContext, 3);
      }

      const top3Ids = retrieved.slice(0, 3).map(r => r.chunkId);
      const reqSet = new Set(judgment.required_chunk_ids);
      const depSet = new Set([...judgment.deprecated_chunk_ids, ...judgment.forbidden_chunk_ids]);

      const reqHits = top3Ids.filter(id => reqSet.has(id));
      const recall = reqSet.size > 0 ? reqHits.length / reqSet.size : 0;

      let dcg = 0;
      top3Ids.forEach((id, idx) => {
        if (reqSet.has(id)) dcg += 1 / Math.log2(idx + 2);
      });
      let idcg = 0;
      for (let i = 0; i < Math.min(reqSet.size, 3); i++) idcg += 1 / Math.log2(i + 2);
      const ndcg = idcg > 0 ? dcg / idcg : 0;

      const staleHits = top3Ids.filter(id => depSet.has(id));
      if (staleHits.length > 0) {
        staleCount++;
        unsafeCount += staleHits.length;
      }

      totalRecall += recall;
      totalNdcg += ndcg;
    }

    ablationResults.push({
      mode: config.mode,
      recall_at_3: totalRecall / nQueries,
      ndcg_at_3: totalNdcg / nQueries,
      stale_rate: staleCount / nQueries,
      unsafe_count: unsafeCount,
      feature_activation: config.feature,
      candidate_pool_hash_sample: sampleHash
    });
  }

  // Candidate-Pool Sensitivity Analysis (N = 20, 50, 100, All)
  const poolSizes: Array<{ name: string; size: number }> = [
    { name: '20', size: 20 },
    { name: '50', size: 50 },
    { name: '100', size: 100 },
    { name: 'All', size: chunks.length }
  ];

  const sensitivityResults: SensitivityResult[] = [];

  for (const poolSpec of poolSizes) {
    let recencyTotalRecall = 0;
    let oracleTotalRecall = 0;
    let recencyStaleCount = 0;
    let oracleStaleCount = 0;
    const nQueries = evalQueryIds.length;

    for (const qid of evalQueryIds) {
      const query = queriesMap.get(qid);
      const judgment = judgmentsMap.get(qid);
      if (!query || !judgment) continue;

      const retrievalContext = { queryId: qid, question: query.question, targetPopulation: query.target_population || ['general'], conditions: query.conditions || [] };

      // Pre-fetch pool of size poolSpec.size
      const pool = await bm25Retriever.retrieve(retrievalContext, poolSpec.size);
      const fixedPoolRetriever = new FixedCandidatePoolRetriever(pool);

      // Recency on fixed pool
      const recencyRetriever = new RecencyBoostRetriever(fixedPoolRetriever, chunks, 0.75);
      const recencyRes = await recencyRetriever.retrieve(retrievalContext, 3);
      const recencyTop3 = recencyRes.map(r => r.chunkId);

      // Full Oracle on fixed pool
      const oracleRetriever = new VersionAwareRetriever(fixedPoolRetriever, chunks, graph, { full_version_aware: true });
      const oracleRes = await oracleRetriever.retrieve(retrievalContext, 3);
      const oracleTop3 = oracleRes.map(r => r.chunkId);

      const reqSet = new Set(judgment.required_chunk_ids);
      const depSet = new Set([...judgment.deprecated_chunk_ids, ...judgment.forbidden_chunk_ids]);

      const recHits = recencyTop3.filter(id => reqSet.has(id)).length;
      const oraHits = oracleTop3.filter(id => reqSet.has(id)).length;

      recencyTotalRecall += reqSet.size > 0 ? recHits / reqSet.size : 0;
      oracleTotalRecall += reqSet.size > 0 ? oraHits / reqSet.size : 0;

      if (recencyTop3.some(id => depSet.has(id))) recencyStaleCount++;
      if (oracleTop3.some(id => depSet.has(id))) oracleStaleCount++;
    }

    const recencyRecallAvg = recencyTotalRecall / nQueries;
    const oracleRecallAvg = oracleTotalRecall / nQueries;

    sensitivityResults.push({
      pool_n: poolSpec.name,
      recency_recall_at_3: recencyRecallAvg,
      oracle_recall_at_3: oracleRecallAvg,
      delta_recall_at_3: oracleRecallAvg - recencyRecallAvg,
      oracle_stale_rate: oracleStaleCount / nQueries,
      recency_stale_rate: recencyStaleCount / nQueries
    });
  }

  const outDir = path.resolve(process.cwd(), 'experiments/version_aware_rag/results/v3/oracle_failure_diagnosis');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outDir, 'counterfactual_ablation_results.json'), JSON.stringify(ablationResults, null, 2), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'candidate_pool_sensitivity.json'), JSON.stringify(sensitivityResults, null, 2), 'utf-8');

  return { ablationResults, sensitivityResults };
}

if (import.meta.main) {
  runOracleCounterfactuals().then(res => {
    console.log('Ablation Results:', res.ablationResults);
    console.log('Sensitivity Results:', res.sensitivityResults);
  });
}
