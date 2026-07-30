import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { BM25Retriever } from '../../src/retrieval/bm25';
import { RelationGraph } from '../../src/versioning/relation_graph';
import { CorpusChunk } from '../../src/corpus/types';
import { VersionAwareRetriever } from '../../src/retrieval/version_aware';
import { FixedCandidatePoolRetriever } from '../../src/retrieval/fixed_candidate_pool';
import { CandidateStageRecord, CandidateGoldStatus } from '../../src/diagnostics/diagnostic_types';
import { TracedCandidateEvent } from '../../src/retrieval/types';
import { selectFrozenV3Runs } from './select_frozen_v3_runs';

interface QueryItem {
  query_id: string;
  question: string;
  target_population: string[];
  conditions: string[];
}

interface JudgmentItem {
  query_id: string;
  required_chunk_ids: string[];
  preferred_chunk_ids: string[];
  deprecated_chunk_ids: string[];
  forbidden_chunk_ids: string[];
  citation_safe_chunk_ids?: string[];
}

export async function traceOracleRetrieval() {
  const corpusPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const queriesPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/queries.jsonl');
  const judgmentsPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/judgments.adjudicated.jsonl');
  const pairsPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl');
  const relationsPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl');

  const devSplitPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/splits_v3/development.json');
  const valSplitPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/splits_v3/validation.json');
  const testSplitPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/splits_v3/test.json');

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
  const testQueryIds = parseSplitQueries(testSplitPath);

  const bm25Retriever = new BM25Retriever(chunks);
  const graph = new RelationGraph(pairsPath, relationsPath, 0.7);

  const traceSplitWithFixedPool = async (splitName: string, queryIds: string[]): Promise<CandidateStageRecord[]> => {
    const records: CandidateStageRecord[] = [];

    for (const qid of queryIds) {
      const query = queriesMap.get(qid);
      const judgment = judgmentsMap.get(qid);
      if (!query || !judgment) continue;

      const retrievalContext = {
        queryId: qid,
        question: query.question,
        targetPopulation: query.target_population || ['general'],
        conditions: query.conditions || []
      };

      // 1. Retrieve BM25 candidate pool ONCE (top-20)
      const initialPool = await bm25Retriever.retrieve(retrievalContext, 20);
      const fixedPoolRetriever = new FixedCandidatePoolRetriever(initialPool);

      const candidateIds = initialPool.map(c => c.chunkId).sort();
      const poolHash = crypto.createHash('sha256').update(candidateIds.join(',')).digest('hex').slice(0, 16);

      const tracedEventsMap = new Map<string, TracedCandidateEvent>();

      const traceContext = {
        ...retrievalContext,
        onTraceEvent: (event: TracedCandidateEvent) => {
          tracedEventsMap.set(event.chunkId, event);
        }
      };

      // 2. Full Version-Aware Retrieval on fixed pool (Retriever sees ZERO gold judgments during retrieval!)
      const vaRetriever = new VersionAwareRetriever(fixedPoolRetriever, chunks, graph, { full_version_aware: true });
      await vaRetriever.retrieve(traceContext, 3);

      // Decoupled Gold Judgments: Attached STRICTLY AFTER retrieval completes
      const reqSet = new Set(judgment.required_chunk_ids || []);
      const prefSet = new Set(judgment.preferred_chunk_ids || []);
      const depSet = new Set(judgment.deprecated_chunk_ids || []);
      const forbSet = new Set(judgment.forbidden_chunk_ids || []);
      const safeSet = new Set(judgment.citation_safe_chunk_ids || []);

      const poolChunkIds = new Set(initialPool.map(c => c.chunkId));

      // Trace ALL S1 candidates (including filtered-out candidates)
      for (const cand of initialPool) {
        const event = tracedEventsMap.get(cand.chunkId);
        const goldStatus: CandidateGoldStatus = {
          required: reqSet.has(cand.chunkId),
          preferred: prefSet.has(cand.chunkId),
          deprecated: depSet.has(cand.chunkId),
          forbidden: forbSet.has(cand.chunkId),
          citation_safe: safeSet.has(cand.chunkId)
        };

        const isRetained = graph.isChunkActive(cand.chunkId, retrievalContext.targetPopulation, retrievalContext.conditions);
        const relations = graph.getRelationsForChunk(cand.chunkId);

        records.push({
          query_id: qid,
          split: splitName,
          candidate_pool_id: poolHash,
          chunk_id: cand.chunkId,
          gold_status: goldStatus,
          stages: {
            base: {
              present: true,
              rank: cand.rank,
              score: cand.baseScore
            },
            relation_lookup: {
              matched_relation_ids: event?.matchedRelationIds || relations.map(r => r.relationId),
              relation_types: event?.relationTypes || relations.map(r => r.relationType),
              policy_labels: event?.policyLabels || relations.map(r => r.policyState)
            },
            scope: {
              query_population: retrievalContext.targetPopulation,
              query_conditions: retrievalContext.conditions,
              relation_populations: [],
              relation_conditions: [],
              matched: isRetained,
              reason: isRetained ? 'Valid scope' : 'Filtered by scope'
            },
            filter: {
              retained: isRetained,
              reason: isRetained ? 'Passed policy filter' : 'Filtered out by policy'
            },
            boost: {
              retain_relation_boost: event?.retainRelationBoost ?? 0,
              condition_boost: event?.conditionBoost ?? 0
            },
            expansion: {
              was_seed: cand.baseScore >= 0.05,
              was_added: event?.wasExpansionAdded ?? false,
              parent_chunk_id: event?.expansionParentId ?? null,
              reason: null
            },
            diversification: {
              penalty: event?.diversificationPenalty ?? 1.0,
              reason: null
            },
            final: {
              present: (event?.finalRank ?? 99) <= 3 && isRetained,
              rank: event?.finalRank ?? null,
              score: event?.finalScore ?? cand.baseScore
            }
          }
        });
      }

      // Check missing gold required chunks NOT in S1 candidate pool
      for (const reqChunkId of judgment.required_chunk_ids || []) {
        if (!poolChunkIds.has(reqChunkId)) {
          records.push({
            query_id: qid,
            split: splitName,
            candidate_pool_id: poolHash,
            chunk_id: reqChunkId,
            gold_status: {
              required: true,
              preferred: prefSet.has(reqChunkId),
              deprecated: depSet.has(reqChunkId),
              forbidden: forbSet.has(reqChunkId),
              citation_safe: safeSet.has(reqChunkId)
            },
            stages: {
              base: { present: false, rank: null, score: 0 },
              relation_lookup: { matched_relation_ids: [], relation_types: [], policy_labels: [] },
              scope: { query_population: retrievalContext.targetPopulation, query_conditions: retrievalContext.conditions, relation_populations: [], relation_conditions: [], matched: false, reason: 'Not in S1 candidate pool' },
              filter: { retained: false, reason: 'Not in S1 candidate pool' },
              boost: { retain_relation_boost: 0, condition_boost: 0 },
              expansion: { was_seed: false, was_added: false, parent_chunk_id: null, reason: null },
              diversification: { penalty: 1.0, reason: null },
              final: { present: false, rank: null, score: 0 }
            }
          });
        }
      }
    }
    return records;
  };

  // Test split post-hoc observation: Read ONLY frozen results_raw.json (DO NOT invoke retriever!)
  const traceTestSplitPosthoc = (): CandidateStageRecord[] => {
    const selectedRuns = selectFrozenV3Runs();
    const oracleRunDir = selectedRuns.oracle_version_aware.dir_path;
    const rawResultsPath = path.join(oracleRunDir, 'results_raw.json');
    const rawResults: Array<{ query_id: string; retrieved: Array<{ chunk_id?: string; chunkId?: string; score?: number; finalScore?: number }> }> = JSON.parse(fs.readFileSync(rawResultsPath, 'utf-8'));

    const records: CandidateStageRecord[] = [];

    for (const res of rawResults) {
      if (!testQueryIds.includes(res.query_id)) continue;
      const judgment = judgmentsMap.get(res.query_id);
      if (!judgment) continue;

      const reqSet = new Set(judgment.required_chunk_ids || []);
      const prefSet = new Set(judgment.preferred_chunk_ids || []);
      const depSet = new Set(judgment.deprecated_chunk_ids || []);
      const forbSet = new Set(judgment.forbidden_chunk_ids || []);
      const safeSet = new Set(judgment.citation_safe_chunk_ids || []);

      (res.retrieved || []).forEach((c, idx) => {
        const chunkId = c.chunk_id || c.chunkId || '';
        const score = c.score ?? c.finalScore ?? 0;

        records.push({
          query_id: res.query_id,
          split: 'test',
          candidate_pool_id: 'frozen_artifact_hash',
          chunk_id: chunkId,
          gold_status: {
            required: reqSet.has(chunkId),
            preferred: prefSet.has(chunkId),
            deprecated: depSet.has(chunkId),
            forbidden: forbSet.has(chunkId),
            citation_safe: safeSet.has(chunkId)
          },
          stages: {
            base: { present: false, rank: null, score: 0 },
            relation_lookup: { matched_relation_ids: [], relation_types: [], policy_labels: [] },
            scope: { query_population: [], query_conditions: [], relation_populations: [], relation_conditions: [], matched: true, reason: 'not_observable_from_frozen_artifact' },
            filter: { retained: true, reason: 'not_observable_from_frozen_artifact' },
            boost: { retain_relation_boost: 0, condition_boost: 0 },
            expansion: { was_seed: false, was_added: false, parent_chunk_id: null, reason: 'not_observable_from_frozen_artifact' },
            diversification: { penalty: 1.0, reason: null },
            final: { present: idx < 3, rank: idx + 1, score }
          }
        });
      });
    }

    return records;
  };

  const devRecords = await traceSplitWithFixedPool('development', devQueryIds);
  const valRecords = await traceSplitWithFixedPool('validation', valQueryIds);
  const testRecords = traceTestSplitPosthoc();

  const outDir = path.resolve(process.cwd(), 'experiments/version_aware_rag/results/v3/oracle_failure_diagnosis');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outDir, 'development_stage_traces.jsonl'), devRecords.map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, 'validation_stage_traces.jsonl'), valRecords.map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, 'test_posthoc_traces.jsonl'), testRecords.map(r => JSON.stringify(r)).join('\n') + '\n');

  console.log(`Traced ${devRecords.length} dev records, ${valRecords.length} val records, ${testRecords.length} test posthoc records.`);
}

if (import.meta.main) {
  traceOracleRetrieval();
}
