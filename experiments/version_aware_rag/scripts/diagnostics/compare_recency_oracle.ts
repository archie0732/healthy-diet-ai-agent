import * as fs from 'fs';
import * as path from 'path';
import { selectFrozenV3Runs } from './select_frozen_v3_runs';
import { BM25Retriever } from '../../src/retrieval/bm25';
import { RecencyBoostRetriever } from '../../src/retrieval/recency';
import { VersionAwareRetriever } from '../../src/retrieval/version_aware';
import { FixedCandidatePoolRetriever } from '../../src/retrieval/fixed_candidate_pool';
import { RelationGraph } from '../../src/versioning/relation_graph';
import { CorpusChunk } from '../../src/corpus/types';
import { PairedQueryComparisonRecord, QueryClassification } from '../../src/diagnostics/diagnostic_types';

interface QueryItem {
  query_id: string;
  question: string;
  target_population: string[];
  conditions: string[];
  stratum: string;
}

interface JudgmentItem {
  query_id: string;
  required_chunk_ids: string[];
  preferred_chunk_ids: string[];
  deprecated_chunk_ids: string[];
  forbidden_chunk_ids: string[];
}

export async function compareRecencyAndOracle() {
  const corpusPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const queriesPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/queries.jsonl');
  const judgmentsPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/judgments.adjudicated.jsonl');
  const pairsPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl');
  const relationsPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl');

  const devSplitPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/splits_v3/development.json');
  const valSplitPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/splits_v3/validation.json');
  const testSplitPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/splits_v3/test.json');

  const parseSplitQueries = (p: string): string[] => {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(parsed) ? parsed : (parsed.queries || []);
  };

  const devQueryIds = parseSplitQueries(devSplitPath);
  const valQueryIds = parseSplitQueries(valSplitPath);
  const testQueryIds = parseSplitQueries(testSplitPath);

  const devSet = new Set(devQueryIds);
  const valSet = new Set(valQueryIds);
  const testSet = new Set(testQueryIds);

  const chunks: CorpusChunk[] = fs.readFileSync(corpusPath, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const queries: Map<string, QueryItem> = new Map();
  for (const line of fs.readFileSync(queriesPath, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    const q: QueryItem = JSON.parse(line);
    queries.set(q.query_id, q);
  }

  const judgments: Map<string, JudgmentItem> = new Map();
  for (const line of fs.readFileSync(judgmentsPath, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    const j: JudgmentItem = JSON.parse(line);
    judgments.set(j.query_id, j);
  }

  const bm25Retriever = new BM25Retriever(chunks);
  const graph = new RelationGraph(pairsPath, relationsPath, 0.7);

  const selectedRuns = selectFrozenV3Runs();
  const recencyRaw: Array<{ query_id: string; retrieved: Array<{ chunk_id?: string; chunkId?: string; score?: number; finalScore?: number }> }> = JSON.parse(fs.readFileSync(path.join(selectedRuns.recency_only.dir_path, 'results_raw.json'), 'utf-8'));
  const oracleRaw: Array<{ query_id: string; retrieved: Array<{ chunk_id?: string; chunkId?: string; score?: number; finalScore?: number }> }> = JSON.parse(fs.readFileSync(path.join(selectedRuns.oracle_version_aware.dir_path, 'results_raw.json'), 'utf-8'));

  const testRecencyMap = new Map(recencyRaw.map(r => [r.query_id, r]));
  const testOracleMap = new Map(oracleRaw.map(r => [r.query_id, r]));

  const allRecords: PairedQueryComparisonRecord[] = [];
  const devRecords: PairedQueryComparisonRecord[] = [];
  const valRecords: PairedQueryComparisonRecord[] = [];

  for (const [queryId, query] of queries.entries()) {
    const judgment = judgments.get(queryId);
    if (!judgment) continue;

    const isTest = testSet.has(queryId);
    let recencyTop3: string[] = [];
    let recencyScores: number[] = [];
    let oracleTop3: string[] = [];
    let oracleScores: number[] = [];

    if (isTest) {
      // Test split read-only post-hoc from frozen files
      const recRes = testRecencyMap.get(queryId);
      const oraRes = testOracleMap.get(queryId);
      if (!recRes || !oraRes) continue;
      recencyTop3 = (recRes.retrieved || []).slice(0, 3).map(c => c.chunk_id || c.chunkId || '');
      recencyScores = (recRes.retrieved || []).slice(0, 3).map(c => c.score ?? c.finalScore ?? 0);
      oracleTop3 = (oraRes.retrieved || []).slice(0, 3).map(c => c.chunk_id || c.chunkId || '');
      oracleScores = (oraRes.retrieved || []).slice(0, 3).map(c => c.score ?? c.finalScore ?? 0);
    } else {
      // Dev and Val splits MUST use FixedCandidatePoolRetriever (top-20 BM25 candidate pool) for fair comparison!
      const ctx = { queryId, question: query.question, targetPopulation: query.target_population || ['general'], conditions: query.conditions || [] };
      const pool = await bm25Retriever.retrieve(ctx, 20);
      const fixedPoolRetriever = new FixedCandidatePoolRetriever(pool);

      const recencyRetriever = new RecencyBoostRetriever(fixedPoolRetriever, chunks, 0.75);
      const oracleRetriever = new VersionAwareRetriever(fixedPoolRetriever, chunks, graph, { full_version_aware: true });

      const recRes = await recencyRetriever.retrieve(ctx, 3);
      const oraRes = await oracleRetriever.retrieve(ctx, 3);

      recencyTop3 = recRes.map(r => r.chunkId);
      recencyScores = recRes.map(r => r.finalScore);
      oracleTop3 = oraRes.map(r => r.chunkId);
      oracleScores = oraRes.map(r => r.finalScore);
    }

    const requiredSet = new Set(judgment.required_chunk_ids);
    const deprecatedSet = new Set([...judgment.deprecated_chunk_ids, ...judgment.forbidden_chunk_ids]);

    const recencyRequiredHits = recencyTop3.filter(id => requiredSet.has(id));
    const oracleRequiredHits = oracleTop3.filter(id => requiredSet.has(id));

    const recencyRecall = requiredSet.size > 0 ? recencyRequiredHits.length / requiredSet.size : 0;
    const oracleRecall = requiredSet.size > 0 ? oracleRequiredHits.length / requiredSet.size : 0;

    const calcNdcg = (top3: string[]) => {
      let dcg = 0;
      top3.forEach((id, idx) => {
        const rel = requiredSet.has(id) ? 1 : 0;
        dcg += rel / Math.log2(idx + 2);
      });
      let idcg = 0;
      const idealRels = Math.min(requiredSet.size, 3);
      for (let i = 0; i < idealRels; i++) {
        idcg += 1 / Math.log2(i + 2);
      }
      return idcg > 0 ? dcg / idcg : 0;
    };

    const recencyNdcg = calcNdcg(recencyTop3);
    const oracleNdcg = calcNdcg(oracleTop3);

    const recencyStale = recencyTop3.some(id => deprecatedSet.has(id));
    const oracleStale = oracleTop3.some(id => deprecatedSet.has(id));

    const absoluteMissingRequired = (judgment.required_chunk_ids || []).filter(id => !oracleTop3.includes(id));
    const lostRequired = recencyRequiredHits.filter(id => !oracleRequiredHits.includes(id));
    const gainedRequired = oracleRequiredHits.filter(id => !recencyRequiredHits.includes(id));

    let classification: QueryClassification = 'tie_failure';
    if (oracleRecall > recencyRecall || (oracleRecall === recencyRecall && oracleNdcg > recencyNdcg)) {
      classification = 'oracle_win';
    } else if (recencyRecall > oracleRecall || (recencyRecall === oracleRecall && recencyNdcg > oracleNdcg)) {
      classification = 'recency_win';
    } else if (oracleRecall === 1.0 && recencyRecall === 1.0) {
      classification = 'tie_success';
    } else {
      classification = 'tie_failure';
    }

    const record: PairedQueryComparisonRecord = {
      query_id: queryId,
      stratum: query.stratum,
      question: query.question,
      required_chunk_ids: judgment.required_chunk_ids,
      preferred_chunk_ids: judgment.preferred_chunk_ids,
      deprecated_chunk_ids: judgment.deprecated_chunk_ids,
      forbidden_chunk_ids: judgment.forbidden_chunk_ids,
      recency: {
        retrieved_chunk_ids: recencyTop3,
        scores: recencyScores,
        recall_at_3: recencyRecall,
        ndcg_at_3: recencyNdcg,
        stale_hit: recencyStale
      },
      oracle: {
        retrieved_chunk_ids: oracleTop3,
        scores: oracleScores,
        recall_at_3: oracleRecall,
        ndcg_at_3: oracleNdcg,
        stale_hit: oracleStale
      },
      difference: {
        absolute_missing_required_chunks: absoluteMissingRequired,
        lost_required_chunks: lostRequired,
        gained_required_chunks: gainedRequired,
        recall_delta: oracleRecall - recencyRecall,
        ndcg_delta: oracleNdcg - recencyNdcg,
        stale_delta: (oracleStale ? 1 : 0) - (recencyStale ? 1 : 0)
      },
      requires_stage_trace: !isTest && (classification === 'recency_win' || oracleRecall < 1.0),
      classification
    };

    allRecords.push(record);
    if (devSet.has(queryId)) devRecords.push(record);
    if (valSet.has(queryId)) valRecords.push(record);
  }

  const outDir = path.resolve(process.cwd(), 'experiments/version_aware_rag/results/v3/oracle_failure_diagnosis');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outDir, 'paired_query_comparison.jsonl'), allRecords.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  fs.writeFileSync(path.join(outDir, 'paired_comparison_dev.jsonl'), devRecords.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  fs.writeFileSync(path.join(outDir, 'paired_comparison_val.jsonl'), valRecords.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');

  return { allRecords, devRecords, valRecords };
}

if (import.meta.main) {
  compareRecencyAndOracle().then(res => {
    console.log(`Paired comparisons built on Fixed Candidate Pool: All=${res.allRecords.length}, Dev=${res.devRecords.length}, Val=${res.valRecords.length}`);
  });
}
