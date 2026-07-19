import * as fs from 'fs';
import * as path from 'path';
import { getFileChecksum } from '../../../../src/shared/hash';
import { ErrorAnalysis } from '../../src/evaluation/error_analysis';
import { computeBootstrapCI } from '../../src/evaluation/bootstrap';

function parseArgs() {
  const args = process.argv.slice(2);
  let appendOnlyRun = '';
  let recencyRun = '';
  let proposedOracleRun = '';
  let proposedPredictedRun = '';
  let detectorReportPath = '';
  let outputDir = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--appendOnlyRun' && i + 1 < args.length) {
      appendOnlyRun = args[i + 1];
      i++;
    } else if (args[i] === '--recencyRun' && i + 1 < args.length) {
      recencyRun = args[i + 1];
      i++;
    } else if (args[i] === '--proposedOracleRun' && i + 1 < args.length) {
      proposedOracleRun = args[i + 1];
      i++;
    } else if (args[i] === '--proposedPredictedRun' && i + 1 < args.length) {
      proposedPredictedRun = args[i + 1];
      i++;
    } else if (args[i] === '--detectorReport' && i + 1 < args.length) {
      detectorReportPath = args[i + 1];
      i++;
    } else if (args[i] === '--outputDir' && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    }
  }

  return { appendOnlyRun, recencyRun, proposedOracleRun, proposedPredictedRun, detectorReportPath, outputDir };
}

function loadJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function findLatestRun(v3Dir: string, pattern: string): string | null {
  if (!fs.existsSync(v3Dir)) return null;
  const dirs = fs.readdirSync(v3Dir)
    .filter(d => fs.statSync(path.join(v3Dir, d)).isDirectory() && d.includes(pattern))
    .sort()
    .reverse();
  return dirs.length > 0 ? path.join(v3Dir, dirs[0]) : null;
}

function computeRunStats(resultsRaw: any[]) {
  if (!resultsRaw || resultsRaw.length === 0) {
    return {
      recall: 0,
      recallCI: { mean: 0, ciLow: 0, ciHigh: 0 },
      precision: 0,
      mrr: 0,
      ndcg: 0,
      staleHitRate: 0,
      unsafeCount: 0
    };
  }

  const recalls = resultsRaw.map(x => x.metrics.recall || 0);
  const precisions = resultsRaw.map(x => x.metrics.precision || 0);
  const mrrs = resultsRaw.map(x => x.metrics.mrr || 0);
  const ndcgs = resultsRaw.map(x => x.metrics.ndcg || 0);
  const staleHits = resultsRaw.map(x => x.metrics.stale_hit ? 1 : 0);
  const unsafeCounts = resultsRaw.map(x => x.metrics.stale_unsafe_chunks_retrieved || 0);

  const recallCI = computeBootstrapCI(recalls);
  const meanRecall = recalls.reduce((a, b) => a + b, 0) / recalls.length;
  const meanPrecision = precisions.reduce((a, b) => a + b, 0) / precisions.length;
  const meanMrr = mrrs.reduce((a, b) => a + b, 0) / mrrs.length;
  const meanNdcg = ndcgs.reduce((a, b) => a + b, 0) / ndcgs.length;
  const staleHitRate = staleHits.reduce((a, b) => a + b, 0) / staleHits.length;
  const avgUnsafe = unsafeCounts.reduce((a, b) => a + b, 0) / unsafeCounts.length;

  return {
    recall: parseFloat(meanRecall.toFixed(4)),
    recallCI,
    precision: parseFloat(meanPrecision.toFixed(4)),
    mrr: parseFloat(meanMrr.toFixed(4)),
    ndcg: parseFloat(meanNdcg.toFixed(4)),
    staleHitRate: parseFloat(staleHitRate.toFixed(4)),
    unsafeCount: parseFloat(avgUnsafe.toFixed(2))
  };
}

function main() {
  const args = parseArgs();
  const rootDir = process.cwd();
  const v3ResultsDir = path.resolve(rootDir, 'experiments/version_aware_rag/results/v3');
  const targetPaperDir = args.outputDir
    ? path.resolve(rootDir, args.outputDir)
    : path.resolve(v3ResultsDir, 'paper');

  if (!fs.existsSync(targetPaperDir)) {
    fs.mkdirSync(targetPaperDir, { recursive: true });
  }

  console.log(`Dynamically generating publication paper tables in ${targetPaperDir}...`);

  // 1. Dataset metadata & Checksums
  const chunksPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const queriesPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/queries.jsonl');
  const relationsPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl');

  const chunks = loadJsonl<any>(chunksPath);
  const queries = loadJsonl<any>(queriesPath);
  const relations = loadJsonl<any>(relationsPath);

  const totalChunks = chunks.length;
  const totalWords = chunks.reduce((acc, c) => acc + (c.text ? c.text.split(/\s+/).length : 0), 0);
  const avgWords = totalChunks > 0 ? (totalWords / totalChunks).toFixed(2) : '0';
  const nullLineageChunks = chunks.filter(c => !c.lineage_id).length;
  const nullLineageRate = totalChunks > 0 ? ((nullLineageChunks / totalChunks) * 100).toFixed(1) : '0';

  const corpusChecksum = fs.existsSync(chunksPath) ? getFileChecksum(chunksPath) : 'unknown';
  const devSplitPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/splits_v3/development.json');
  const valSplitPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/splits_v3/validation.json');
  const testSplitPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/splits_v3/test.json');

  const devChecksum = fs.existsSync(devSplitPath) ? getFileChecksum(devSplitPath) : 'unknown';
  const valChecksum = fs.existsSync(valSplitPath) ? getFileChecksum(valSplitPath) : 'unknown';
  const testChecksum = fs.existsSync(testSplitPath) ? getFileChecksum(testSplitPath) : 'unknown';

  const datasetHeaderMd = `
### Corpus & Annotation Dataset Metadata (v3)

| Metric / Checksum | Value |
| :--- | :---: |
| Total Document Chunks | ${totalChunks} |
| Average Word Length per Chunk | ${avgWords} words |
| Null Lineage Chunks Rate | ${nullLineageRate}% |
| Total Evaluation Queries | ${queries.length} |
| Adjudicated Relation Pairs | ${relations.length} |
| Corpus Checksum (SHA-256) | \`${corpusChecksum.substring(0, 16)}...\` |
| Dev Split Checksum | \`${devChecksum.substring(0, 16)}...\` |
| Val Split Checksum | \`${valChecksum.substring(0, 16)}...\` |
| Test Split Checksum | \`${testChecksum.substring(0, 16)}...\` |
`;

  // Dynamic Retrieval Runs
  const appendOnlyPath = args.appendOnlyRun ? path.resolve(rootDir, args.appendOnlyRun) : findLatestRun(v3ResultsDir, 'baseline_append_only');
  const recencyPath = args.recencyRun ? path.resolve(rootDir, args.recencyRun) : findLatestRun(v3ResultsDir, 'baseline_recency_only');
  const proposedOraclePath = args.proposedOracleRun ? path.resolve(rootDir, args.proposedOracleRun) : findLatestRun(v3ResultsDir, 'proposed_full_version_aware');
  const proposedPredictedPath = args.proposedPredictedRun ? path.resolve(rootDir, args.proposedPredictedRun) : findLatestRun(v3ResultsDir, 'proposed_predicted_relations');

  const rawAppend = appendOnlyPath && fs.existsSync(path.join(appendOnlyPath, 'results_raw.json')) ? JSON.parse(fs.readFileSync(path.join(appendOnlyPath, 'results_raw.json'), 'utf8')) : [];
  const rawRecency = recencyPath && fs.existsSync(path.join(recencyPath, 'results_raw.json')) ? JSON.parse(fs.readFileSync(path.join(recencyPath, 'results_raw.json'), 'utf8')) : [];
  const rawProposedOracle = proposedOraclePath && fs.existsSync(path.join(proposedOraclePath, 'results_raw.json')) ? JSON.parse(fs.readFileSync(path.join(proposedOraclePath, 'results_raw.json'), 'utf8')) : [];
  const rawProposedPredicted = proposedPredictedPath && fs.existsSync(path.join(proposedPredictedPath, 'results_raw.json')) ? JSON.parse(fs.readFileSync(path.join(proposedPredictedPath, 'results_raw.json'), 'utf8')) : [];

  const statsAppend = computeRunStats(rawAppend);
  const statsRecency = computeRunStats(rawRecency);
  const statsOracle = computeRunStats(rawProposedOracle);
  const statsPredicted = computeRunStats(rawProposedPredicted);

  // SECTION 1: Retrieval Evaluation (Automatic)
  const section1Md = `
## Section 1: Retrieval Evaluation (Automatic)

| System Configuration | Recall@3 (95% CI) | Precision@3 | MRR | nDCG@3 | Stale Hit Rate | Avg Unsafe Chunks |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Append-Only RAG** | ${(statsAppend.recall * 100).toFixed(1)}% [${(statsAppend.recallCI.ciLow * 100).toFixed(1)}%, ${(statsAppend.recallCI.ciHigh * 100).toFixed(1)}%] | ${(statsAppend.precision * 100).toFixed(1)}% | ${statsAppend.mrr.toFixed(3)} | ${statsAppend.ndcg.toFixed(3)} | ${(statsAppend.staleHitRate * 100).toFixed(1)}% | ${statsAppend.unsafeCount.toFixed(2)} |
| **Recency-Only RAG** | ${(statsRecency.recall * 100).toFixed(1)}% [${(statsRecency.recallCI.ciLow * 100).toFixed(1)}%, ${(statsRecency.recallCI.ciHigh * 100).toFixed(1)}%] | ${(statsRecency.precision * 100).toFixed(1)}% | ${statsRecency.mrr.toFixed(3)} | ${statsRecency.ndcg.toFixed(3)} | ${(statsRecency.staleHitRate * 100).toFixed(1)}% | ${statsRecency.unsafeCount.toFixed(2)} |
| **Proposed Oracle Graph** | ${(statsOracle.recall * 100).toFixed(1)}% [${(statsOracle.recallCI.ciLow * 100).toFixed(1)}%, ${(statsOracle.recallCI.ciHigh * 100).toFixed(1)}%] | ${(statsOracle.precision * 100).toFixed(1)}% | ${statsOracle.mrr.toFixed(3)} | ${statsOracle.ndcg.toFixed(3)} | ${(statsOracle.staleHitRate * 100).toFixed(1)}% | ${statsOracle.unsafeCount.toFixed(2)} |
| **Proposed Predicted Graph** | ${(statsPredicted.recall * 100).toFixed(1)}% [${(statsPredicted.recallCI.ciLow * 100).toFixed(1)}%, ${(statsPredicted.recallCI.ciHigh * 100).toFixed(1)}%] | ${(statsPredicted.precision * 100).toFixed(1)}% | ${statsPredicted.mrr.toFixed(3)} | ${statsPredicted.ndcg.toFixed(3)} | ${(statsPredicted.staleHitRate * 100).toFixed(1)}% | ${statsPredicted.unsafeCount.toFixed(2)} |
`;

  // SECTION 2: Automatic Citation-Grounded Proxy Metrics (Automatic)
  const autoProxySummaryPath = path.join(targetPaperDir, 'answer_automatic_proxy_metrics_summary.json');
  let section2Md = `\n## Section 2: Automatic Citation-Grounded Proxy Metrics (Automatic)\n\n`;
  section2Md += `> *Note: These are deterministic rule-based proxy metrics computed from gold chunk sets, NOT human evaluation.*\n\n`;

  if (fs.existsSync(autoProxySummaryPath)) {
    const autoSummary: Record<string, any> = JSON.parse(fs.readFileSync(autoProxySummaryPath, 'utf8'));
    section2Md += `| System Alias | Correctness (Proxy) | Completeness (Proxy) | Version Correctness (Proxy) | Boundary Preservation (Proxy) | Unsupported Claim Rate (Proxy) | Citation Entailment (Proxy) |\n`;
    section2Md += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    for (const [alias, s] of Object.entries<any>(autoSummary)) {
      section2Md += `| **${alias}** | ${s.meanCorrectness.toFixed(3)} | ${s.meanCompleteness.toFixed(3)} | ${s.meanVersionCorrectness.toFixed(3)} | ${s.meanBoundaryPreservation.toFixed(3)} | ${s.unsupportedClaimRate.toFixed(3)} | ${s.meanCitationEntailment.toFixed(3)} |\n`;
    }
  } else {
    section2Md += `*Automatic citation proxy metrics summary not found at ${autoProxySummaryPath}.*\n`;
  }

  // SECTION 3: Blinded Human Answer Evaluation (Human)
  const humanAdjudicatedSummaryPath = path.join(targetPaperDir, 'answer_human_adjudicated_summary.json');
  const humanAdjudicatedItemsPath = path.join(targetPaperDir, 'answers_human_adjudicated.json');
  let section3Md = `\n## Section 3: Blinded Human Answer Evaluation (Human)\n\n`;

  if (fs.existsSync(humanAdjudicatedItemsPath) && fs.existsSync(humanAdjudicatedSummaryPath)) {
    const humanSummary: Record<string, any> = JSON.parse(fs.readFileSync(humanAdjudicatedSummaryPath, 'utf8'));
    section3Md += `| System Alias | Correctness (Human) | Completeness (Human) | Version Correctness (Human) | Boundary Preservation (Human) | Unsupported Claim Rate (Human) | Citation Entailment (Human) |\n`;
    section3Md += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    for (const [alias, s] of Object.entries<any>(humanSummary)) {
      section3Md += `| **${alias}** | ${s.meanCorrectness.toFixed(3)} | ${s.meanCompleteness.toFixed(3)} | ${s.meanVersionCorrectness.toFixed(3)} | ${s.meanBoundaryPreservation.toFixed(3)} | ${s.unsupportedClaimRate.toFixed(3)} | ${s.meanCitationEntailment.toFixed(3)} |\n`;
    }
  } else {
    section3Md += `**Status: [Pending - Human Blind Evaluation]**\n\n`;
    section3Md += `*(Human blind annotations and adjudication have not been completed yet. Automatic proxy metrics are NOT displayed in this section.)*\n`;
  }

  // Full Combined Markdown Output
  const fullMd = [
    "# Version-Aware RAG Evaluation Tables",
    datasetHeaderMd,
    section1Md,
    section2Md,
    section3Md
  ].join('\n---\n');

  // LaTeX Output
  const latexOutput = `
% LaTeX Source Tables for Version-Aware RAG Paper
\\begin{table}[htbp]
\\centering
\\caption{Section 1: Downstream Retrieval Performance Comparison (Automatic)}
\\label{tab:retrieval_comparison}
\\begin{tabular}{lcccccc}
\\hline
\\textbf{System Configuration} & \\textbf{Recall@3} & \\textbf{Precision@3} & \\textbf{MRR} & \\textbf{nDCG@3} & \\textbf{Stale Hit Rate} & \\textbf{Unsafe Count} \\\\ \\hline
Append-Only RAG & ${(statsAppend.recall * 100).toFixed(1)}\\% & ${(statsAppend.precision * 100).toFixed(1)}\\% & ${statsAppend.mrr.toFixed(3)} & ${statsAppend.ndcg.toFixed(3)} & ${(statsAppend.staleHitRate * 100).toFixed(1)}\\% & ${statsAppend.unsafeCount.toFixed(2)} \\\\
Recency-Only RAG & ${(statsRecency.recall * 100).toFixed(1)}\\% & ${(statsRecency.precision * 100).toFixed(1)}\\% & ${statsRecency.mrr.toFixed(3)} & ${statsRecency.ndcg.toFixed(3)} & ${(statsRecency.staleHitRate * 100).toFixed(1)}\\% & ${statsRecency.unsafeCount.toFixed(2)} \\\\
Proposed Oracle Graph & ${(statsOracle.recall * 100).toFixed(1)}\\% & ${(statsOracle.precision * 100).toFixed(1)}\\% & ${statsOracle.mrr.toFixed(3)} & ${statsOracle.ndcg.toFixed(3)} & ${(statsOracle.staleHitRate * 100).toFixed(1)}\\% & ${statsOracle.unsafeCount.toFixed(2)} \\\\
Proposed Predicted Graph & ${(statsPredicted.recall * 100).toFixed(1)}\\% & ${(statsPredicted.precision * 100).toFixed(1)}\\% & ${statsPredicted.mrr.toFixed(3)} & ${statsPredicted.ndcg.toFixed(3)} & ${(statsPredicted.staleHitRate * 100).toFixed(1)}\\% & ${statsPredicted.unsafeCount.toFixed(2)} \\\\ \\hline
\\end{tabular}
\\end{table}
`;

  // Error Analysis Output
  const activeQueries = rawProposedOracle.length > 0
    ? rawProposedOracle.map((x: any) => ({ query_id: x.query_id, question: x.question }))
    : queries.map((x: any) => ({ query_id: x.query_id, question: x.question }));

  const proposedMetricsMap: Record<string, any> = {};
  for (const item of rawProposedOracle) {
    proposedMetricsMap[item.query_id] = item.metrics;
  }

  const recencyMetricsMap: Record<string, any> = {};
  for (const item of rawRecency) {
    recencyMetricsMap[item.query_id] = item.metrics;
  }

  const errorCases = ErrorAnalysis.analyze(activeQueries, proposedMetricsMap, recencyMetricsMap);
  const errorCsv = ErrorAnalysis.toCsv(errorCases);

  fs.writeFileSync(path.join(targetPaperDir, 'tables.md'), fullMd, 'utf8');
  fs.writeFileSync(path.join(targetPaperDir, 'tables.tex'), latexOutput, 'utf8');
  fs.writeFileSync(path.join(targetPaperDir, 'error_analysis.json'), JSON.stringify(errorCases, null, 2), 'utf8');
  fs.writeFileSync(path.join(targetPaperDir, 'error_analysis.csv'), errorCsv, 'utf8');

  console.log(`Paper tables and error analysis successfully compiled to ${targetPaperDir}`);
}

if (require.main === module) {
  main();
}
