import * as fs from 'fs';
import * as path from 'path';
import { loadExperimentConfig } from '../../../../src/shared/config';
import { BM25Retriever } from '../../src/retrieval/bm25';
import { RecencyBoostRetriever } from '../../src/retrieval/recency';
import { RetrievalContext } from '../../src/retrieval/types';
import { calculateQueryMetrics, QueryMetrics } from '../../src/evaluation/retrieval_metrics';
import { compileStratifiedReport } from '../../src/evaluation/stratified_summary';
import { EvaluationQuery, QueryJudgment } from '../../src/annotation/schema';
import { CorpusChunk } from '../../src/corpus/types';

function loadJsonOrJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (content.startsWith('[')) {
    return JSON.parse(content);
  }
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function main() {
  const rootDir = process.cwd();
  const configPath = path.resolve(rootDir, 'experiments/version_aware_rag/configs/v3/baseline_recency_only.yaml');

  console.log('--------------------------------------------------');
  console.log('Recency Lambda Hyperparameter Tuning (Validation Split)');
  console.log('--------------------------------------------------');

  // 1. Load configuration
  let config: any;
  try {
    config = loadExperimentConfig(configPath);
  } catch (error: any) {
    console.error(`Failed to load config: ${error.message}`);
    process.exit(1);
  }

  // Set split to validation
  const splitName = 'validation';
  config.experiment.split = splitName;

  // 2. Load Data
  let chunks: CorpusChunk[];
  let allQueries: EvaluationQuery[];
  let allJudgments: QueryJudgment[];
  let splitQueryIds: Set<string>;

  try {
    chunks = loadJsonOrJsonl<CorpusChunk>(path.resolve(rootDir, config.corpus.path));
    allQueries = loadJsonOrJsonl<EvaluationQuery>(path.resolve(rootDir, config.evaluation.query_path));
    allJudgments = loadJsonOrJsonl<QueryJudgment>(path.resolve(rootDir, config.evaluation.judgment_path));

    const splitFilePath = path.resolve(rootDir, `experiments/version_aware_rag/data/splits_v3/${splitName}.json`);
    const splitData = JSON.parse(fs.readFileSync(splitFilePath, 'utf-8'));
    splitQueryIds = new Set<string>(splitData.queries || []);
  } catch (error: any) {
    console.error(`Failed to load experiment data:\n${error.message}`);
    process.exit(1);
  }

  const queries = allQueries.filter(q => splitQueryIds.has(q.query_id));
  const judgmentsMap = new Map<string, QueryJudgment>();
  for (const j of allJudgments) {
    if (splitQueryIds.has(j.query_id)) {
      const normalizedJudgment: QueryJudgment = {
        query_id: j.query_id,
        required_chunk_ids: j.required_chunk_ids || (j as any).acceptable_chunk_ids || [],
        compatible_chunk_ids: j.compatible_chunk_ids || [],
        preferred_chunk_ids: j.preferred_chunk_ids || [],
        deprecated_chunk_ids: j.deprecated_chunk_ids || (j as any).stale_chunk_ids || [],
        forbidden_chunk_ids: j.forbidden_chunk_ids || [],
        citation_safe_chunk_ids: j.citation_safe_chunk_ids || []
      };
      judgmentsMap.set(j.query_id, normalizedJudgment);
    }
  }

  console.log(`Loaded ${chunks.length} chunks.`);
  console.log(`Loaded ${queries.length} queries for validation split.`);

  // 3. Initialize Base BM25 Retriever
  const baseRetriever = new BM25Retriever(chunks);

  // 4. Grid search lambda
  const lambdaValues = [0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0];
  
  // We can write it async properly
  runTuning(queries, judgmentsMap, chunks, baseRetriever, lambdaValues, config.retrieval.top_k);
}

async function runTuning(
  queries: EvaluationQuery[],
  judgmentsMap: Map<string, QueryJudgment>,
  chunks: CorpusChunk[],
  baseRetriever: BM25Retriever,
  lambdaValues: number[],
  topK: number
) {
  const resultsTable: {
    lambda: number;
    recall: number | null;
    precision: number | null;
    mrr: number;
    ndcg: number;
    stale_hit: number;
    unsafe_count: number;
  }[] = [];

  for (const lambda of lambdaValues) {
    const retriever = new RecencyBoostRetriever(baseRetriever, chunks, lambda);
    const metricsMap = new Map<string, QueryMetrics>();

    for (const q of queries) {
      const judgment = judgmentsMap.get(q.query_id);
      if (!judgment) continue;

      const context: RetrievalContext = {
        queryId: q.query_id,
        question: q.question,
        targetPopulation: q.target_population,
        conditions: q.conditions
      };

      const results = await retriever.retrieve(context, topK);
      const retrievedIds = results.map(r => r.chunkId);
      const metrics = calculateQueryMetrics(retrievedIds, judgment, topK);
      metricsMap.set(q.query_id, metrics);
    }

    const report = compileStratifiedReport(queries, metricsMap);
    resultsTable.push({
      lambda,
      recall: report.overall.recall,
      precision: report.overall.precision,
      mrr: report.overall.mrr,
      ndcg: report.overall.ndcg,
      stale_hit: report.overall.stale_hit_rate,
      unsafe_count: report.overall.avg_unsafe_chunks
    });
  }

  // Sort/Find best lambda (maximizing nDCG)
  let best = resultsTable[0];
  for (const r of resultsTable) {
    if (r.ndcg > best.ndcg) {
      best = r;
    } else if (Math.abs(r.ndcg - best.ndcg) < 1e-4 && r.stale_hit < best.stale_hit) {
      best = r;
    }
  }

  // Print markdown-style table
  console.log('\n### Recency Lambda Sensitivity Analysis\n');
  console.log('| Lambda | Recall | Precision | MRR | nDCG | Stale Hit Rate | Avg Unsafe Chunks |');
  console.log('| :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
  for (const r of resultsTable) {
    const isBestMarker = r.lambda === best.lambda ? ' *' : '';
    console.log(
      `| ${r.lambda.toFixed(2)}${isBestMarker} | ` +
      `${r.recall !== null ? (r.recall * 100).toFixed(1) + '%' : 'N/A'} | ` +
      `${r.precision !== null ? (r.precision * 100).toFixed(1) + '%' : 'N/A'} | ` +
      `${r.mrr.toFixed(3)} | ` +
      `${r.ndcg.toFixed(3)} | ` +
      `${(r.stale_hit * 100).toFixed(1)}% | ` +
      `${r.unsafe_count.toFixed(2)} |`
    );
  }

  console.log(`\nOptimal Lambda Selected: ${best.lambda.toFixed(2)} (nDCG: ${best.ndcg.toFixed(3)})\n`);

  // Write results to a markdown log file in experiments/version_aware_rag/results/v3
  const resultsDir = path.resolve(process.cwd(), 'experiments/version_aware_rag/results/v3');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  let md = `# Recency Lambda Sensitivity Tuning Report\n\n`;
  md += `- **Date**: ${new Date().toISOString()}\n`;
  md += `- **Split**: Validation (8 queries)\n`;
  md += `- **Base Retriever**: BM25\n`;
  md += `- **Top K**: ${topK}\n\n`;
  md += `## Sensitivity Table\n\n`;
  md += `| Lambda | Recall | Precision | MRR | nDCG | Stale Hit Rate | Avg Unsafe Chunks |\n`;
  md += `| :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
  for (const r of resultsTable) {
    const isBestMarker = r.lambda === best.lambda ? ' (Optimal)' : '';
    md += `| ${r.lambda.toFixed(2)}${isBestMarker} | ${r.recall !== null ? (r.recall * 100).toFixed(1) + '%' : 'N/A'} | ${r.precision !== null ? (r.precision * 100).toFixed(1) + '%' : 'N/A'} | ${r.mrr.toFixed(3)} | ${r.ndcg.toFixed(3)} | ${(r.stale_hit * 100).toFixed(1)}% | ${r.unsafe_count.toFixed(2)} |\n`;
  }
  md += `\n**Optimal Lambda chosen on validation split**: ${best.lambda.toFixed(2)}\n`;

  const reportPath = path.join(resultsDir, 'recency_lambda_tuning_report.md');
  fs.writeFileSync(reportPath, md, 'utf-8');
  console.log(`Saved tuning report to: ${reportPath}`);
}

main();
