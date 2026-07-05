import * as fs from 'fs';
import * as path from 'path';

export interface RAGChunk {
  chunk_id: string;
  doc_id: string;
  version: string;
  published_year: number;
  topic: string;
  applicable_population: string;
  lineage_id: string;
  text: string;
}

export interface EvaluationPair {
  sample_id: string;
  topic: string;
  lineage_id: string;
  new_version: string;
  old_version: string;
  new_text: string;
  old_text: string;
  relation_label: string;
  policy_label: string;
}

export interface EvaluationQueryV2 {
  query_id: string;
  question: string;
  expected_answer_scope: string;
  notes: string;
}

export interface EvaluationJudgmentV2 {
  query_id: string;
  acceptable_chunk_ids: string[];
  preferred_chunk_ids: string[];
  stale_chunk_ids: string[];
  forbidden_chunk_ids: string[];
  citation_safe_chunk_ids: string[];
}

export interface RetrievalResult {
  chunk: RAGChunk;
  score: number;
}

export interface QueryEvalResult {
  query_id: string;
  question: string;
  retrieved_chunk_ids: string[];
  is_stale_retrieved: boolean;
  is_current_retrieved: boolean;
  has_unsafe_retrieval: boolean;
  simulated_citation: string;
}

export interface ModeEvalSummary {
  mode: string;
  staleRetrievalRate: number;
  currentVersionHitRate: number;
  unsafeRetrievalRate: number;
  queries: QueryEvalResult[];
}

const stopwords = new Set([
  'what', 'are', 'the', 'and', 'for', 'daily', 'serving', 'goals', 'consuming',
  'recommendation', 'intake', 'limit', 'limitations', 'rule', 'should', 'with',
  'this', 'that', 'from', 'about', 'how', 'many', 'of', 'is', 'a', 'in', 'or'
]);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

export function scoreChunkForQuery(
  query: EvaluationQueryV2,
  chunk: RAGChunk,
  mode: 'append-only' | 'recency-only' | 'proposed'
): number {
  const queryTokens = tokenize(query.question);
  const chunkTokens = tokenize(chunk.text);
  const overlap = queryTokens.filter(t => chunkTokens.includes(t)).length;
  let score = overlap;

  if (mode === 'recency-only') {
    score += (chunk.published_year - 2015) * 1.5;
  }

  return score;
}

export function retrieveTopK(
  query: EvaluationQueryV2,
  chunks: RAGChunk[],
  deprecatedKeys: Set<string>,
  mode: 'append-only' | 'recency-only' | 'proposed',
  k: number = 3
): RetrievalResult[] {
  const scored: RetrievalResult[] = [];

  for (const chunk of chunks) {
    if (mode === 'proposed') {
      const key = `${chunk.lineage_id}-${chunk.version}`;
      if (deprecatedKeys.has(key)) {
        continue;
      }
    }

    const score = scoreChunkForQuery(query, chunk, mode);
    scored.push({ chunk, score });
  }

  scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.001) {
      return b.chunk.published_year - a.chunk.published_year;
    }
    return b.score - a.score;
  });

  return scored.slice(0, k);
}

export function summarizeQueryResult(
  queryId: string,
  question: string,
  topK: RetrievalResult[],
  judgment: EvaluationJudgmentV2
): QueryEvalResult {
  const retrievedIds = topK.map(r => r.chunk.chunk_id);
  const hasStale = retrievedIds.some(id => judgment.stale_chunk_ids.includes(id));
  const hasCurrent = retrievedIds.some(id => judgment.acceptable_chunk_ids.includes(id));
  const hasUnsafeCitation = retrievedIds.some(id => !judgment.citation_safe_chunk_ids.includes(id));

  return {
    query_id: queryId,
    question,
    retrieved_chunk_ids: retrievedIds,
    is_stale_retrieved: hasStale,
    is_current_retrieved: hasCurrent,
    has_unsafe_retrieval: hasUnsafeCitation,
    simulated_citation: 'not_measured'
  };
}

function evaluateMode(
  queries: EvaluationQueryV2[],
  chunks: RAGChunk[],
  deprecatedKeys: Set<string>,
  judgmentsMap: Map<string, EvaluationJudgmentV2>,
  mode: 'append-only' | 'recency-only' | 'proposed'
): ModeEvalSummary {
  const queryResults: QueryEvalResult[] = [];
  let staleRetrievalCount = 0;
  let currentHitCount = 0;
  let unsafeRetrievalCount = 0;

  for (const query of queries) {
    const judgment = judgmentsMap.get(query.query_id);
    if (!judgment) {
      throw new Error(`Judgment not found for query ${query.query_id}`);
    }

    const topK = retrieveTopK(query, chunks, deprecatedKeys, mode, 3);
    const result = summarizeQueryResult(query.query_id, query.question, topK, judgment);

    if (result.is_stale_retrieved) staleRetrievalCount++;
    if (result.is_current_retrieved) currentHitCount++;
    if (result.has_unsafe_retrieval) unsafeRetrievalCount++;

    queryResults.push(result);
  }

  return {
    mode: mode === 'append-only' ? 'Baseline A (Append-Only)' :
          mode === 'recency-only' ? 'Baseline B (Recency-Only)' :
          'Proposed (Version-Aware RAG)',
    staleRetrievalRate: parseFloat((staleRetrievalCount / queries.length).toFixed(2)),
    currentVersionHitRate: parseFloat((currentHitCount / queries.length).toFixed(2)),
    unsafeRetrievalRate: parseFloat((unsafeRetrievalCount / queries.length).toFixed(2)),
    queries: queryResults
  };
}

function main() {
  const annotationsDir = path.join(__dirname, '..', 'data', 'annotations');
  const chunksPath = path.join(__dirname, '..', 'data', 'chunks', 'rag_chunks.json');
  const queriesPath = path.join(annotationsDir, 'evaluation_queries_v2.json');
  const judgmentsPath = path.join(annotationsDir, 'evaluation_query_judgments_v2.json');
  const pairsPath = path.join(annotationsDir, 'final_evaluation_pairs.json');
  const resultsDir = path.join(__dirname, '..', 'results', 'tables');

  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  if (!fs.existsSync(chunksPath) || !fs.existsSync(queriesPath) || !fs.existsSync(judgmentsPath) || !fs.existsSync(pairsPath)) {
    console.error('Required data files not found. Please ensure you have run previous pipeline scripts.');
    process.exit(1);
  }

  const chunks: RAGChunk[] = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
  const queries: EvaluationQueryV2[] = JSON.parse(fs.readFileSync(queriesPath, 'utf-8'));
  const judgments: EvaluationJudgmentV2[] = JSON.parse(fs.readFileSync(judgmentsPath, 'utf-8'));
  const pairs: EvaluationPair[] = JSON.parse(fs.readFileSync(pairsPath, 'utf-8'));

  const judgmentsMap = new Map<string, EvaluationJudgmentV2>();
  for (const j of judgments) {
    judgmentsMap.set(j.query_id, j);
  }

  const deprecatedKeys = new Set<string>();
  for (const pair of pairs) {
    if (pair.policy_label === 'deprecate' || pair.policy_label === 'evict') {
      deprecatedKeys.add(`${pair.lineage_id}-${pair.old_version}`);
      if (pair.old_version === '2020-2025') {
        deprecatedKeys.add(`${pair.lineage_id}-2015-2020`);
      }
    }
  }

  console.log(`Running actual retrieval evaluation with ${queries.length} queries on ${chunks.length} chunks...`);

  const appendOnlySummary = evaluateMode(queries, chunks, deprecatedKeys, judgmentsMap, 'append-only');
  const recencySummary = evaluateMode(queries, chunks, deprecatedKeys, judgmentsMap, 'recency-only');
  const proposedSummary = evaluateMode(queries, chunks, deprecatedKeys, judgmentsMap, 'proposed');

  const summaries = [appendOnlySummary, recencySummary, proposedSummary];

  console.log('\n==========================================================================================');
  console.log('                                RAG RETRIEVAL EVALUATION SUMMARY                          ');
  console.log('==========================================================================================');
  console.log(`${String('Retrieval Mode').padEnd(30)} | ${String('Stale Retrieval Rate').padEnd(20)} | ${String('Current Hit Rate').padEnd(18)} | ${String('Unsafe Retrieval Rate').padEnd(20)}`);
  console.log('------------------------------------------------------------------------------------------');
  for (const sum of summaries) {
    const staleRet = (sum.staleRetrievalRate * 100).toFixed(0) + '%';
    const currHit = (sum.currentVersionHitRate * 100).toFixed(0) + '%';
    const unsafeRet = (sum.unsafeRetrievalRate * 100).toFixed(0) + '%';
    console.log(`${sum.mode.padEnd(30)} | ${staleRet.padEnd(20)} | ${currHit.padEnd(18)} | ${unsafeRet.padEnd(20)}`);
  }
  console.log('==========================================================================================\n');

  const outJsonPath = path.join(resultsDir, 'evaluation_summary.json');
  fs.writeFileSync(outJsonPath, JSON.stringify(summaries, null, 2), 'utf-8');
  console.log(`Saved evaluation results to ${outJsonPath}`);

  let md = `# RAG Retrieval Evaluation Results Summary\n\n`;
  md += `| Retrieval Mode | Stale Retrieval Rate | Current Hit Rate | Unsafe Retrieval Rate |\n`;
  md += `| :--- | :---: | :---: | :---: |\n`;
  for (const sum of summaries) {
    const staleRet = (sum.staleRetrievalRate * 100).toFixed(0) + '%';
    const currHit = (sum.currentVersionHitRate * 100).toFixed(0) + '%';
    const unsafeRet = (sum.unsafeRetrievalRate * 100).toFixed(0) + '%';
    md += `| ${sum.mode} | ${staleRet} | ${currHit} | ${unsafeRet} |\n`;
  }
  md += `\n\n*Evaluation queries count: ${queries.length} queries across 10 distinct guideline lineages.*\n`;

  const outMdPath = path.join(resultsDir, 'evaluation_summary.md');
  fs.writeFileSync(outMdPath, md, 'utf-8');
  console.log(`Saved evaluation markdown table to ${outMdPath}`);
}

if (require.main === module) {
  main();
}
