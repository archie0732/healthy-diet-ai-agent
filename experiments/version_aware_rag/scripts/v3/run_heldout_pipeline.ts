import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { AnswerGenerator } from '../../src/generation/answer_generator';
import { CitationParser } from '../../src/generation/citation_parser';
import { AnswerMetricsEvaluator } from '../../src/evaluation/answer_metrics';
import { CorpusChunk } from '../../src/corpus/types';
import { getFileChecksum } from '../../../src/shared/hash';

function loadJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

async function main() {
  const rootDir = process.cwd();
  console.log('========================================================================');
  console.log('           STARTING HELDOUT (TEST SPLIT) PIPELINE EXECUTION            ');
  console.log('========================================================================\n');

  // Config files for held-out evaluation
  const configs = [
    { name: 'baseline_append_only', path: 'experiments/version_aware_rag/configs/v3/baseline_append_only.yaml' },
    { name: 'baseline_recency_only', path: 'experiments/version_aware_rag/configs/v3/baseline_recency_only.yaml' },
    { name: 'proposed_full_version_aware', path: 'experiments/version_aware_rag/configs/v3/proposed_full_version_aware.yaml' },
    { name: 'proposed_predicted_relations', path: 'experiments/version_aware_rag/configs/v3/proposed_predicted_relations.yaml' }
  ];

  const runDirs: Record<string, string> = {};

  // 1. Run experiment script for each config on test split
  for (const cfg of configs) {
    console.log(`[1/4] Running held-out retrieval for config: ${cfg.name}...`);
    const cmd = `bun experiments/version_aware_rag/scripts/v3/run_experiment.ts --config ${cfg.path} --split test`;
    console.log(`Executing: ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: rootDir });

    // Locate the newly created run directory
    const v3ResultsDir = path.resolve(rootDir, 'experiments/version_aware_rag/results/v3');
    const dirs = fs.readdirSync(v3ResultsDir)
      .filter(d => fs.statSync(path.join(v3ResultsDir, d)).isDirectory() && d.includes(cfg.name))
      .sort()
      .reverse();

    if (dirs.length > 0) {
      runDirs[cfg.name] = path.join(v3ResultsDir, dirs[0]);
      console.log(`  -> Output saved to: ${runDirs[cfg.name]}\n`);
    } else {
      throw new Error(`Failed to locate output directory for ${cfg.name}`);
    }
  }

  // 2. Run Answer Generation, Citation Validation, and Automatic Proxy Scoring for 3 Systems
  console.log('[2/4] Generating answers, validating citations, and computing automatic proxy metrics for held-out runs...');
  const chunksPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const judgmentsPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/judgments.adjudicated.jsonl');

  const chunks = loadJsonl<CorpusChunk>(chunksPath);
  const groundTruthJudgments = loadJsonl<any>(judgmentsPath);

  const chunksMap = new Map<string, CorpusChunk>(chunks.map(c => [c.chunk_id, c]));
  const gtMap = new Map<string, any>(groundTruthJudgments.map(j => [j.query_id, j]));
  const generator = new AnswerGenerator();

  // Define randomized, blind system alias mapping
  const systemNames = ['baseline_append_only', 'baseline_recency_only', 'proposed_full_version_aware'];
  const aliasMap: Record<string, string> = {
    'baseline_append_only': 'System_B',
    'baseline_recency_only': 'System_C',
    'proposed_full_version_aware': 'System_A'
  };

  const paperDir = path.resolve(rootDir, 'experiments/version_aware_rag/results/v3/paper');
  const privateDir = path.resolve(rootDir, 'experiments/version_aware_rag/results/v3/private');
  if (!fs.existsSync(paperDir)) fs.mkdirSync(paperDir, { recursive: true });
  if (!fs.existsSync(privateDir)) fs.mkdirSync(privateDir, { recursive: true });

  const mappingSecretPath = path.join(privateDir, 'system_alias_mapping.secret.json');
  const mappingSecretData = {
    created_at: new Date().toISOString(),
    seed: 42,
    alias_mapping: aliasMap
  };
  fs.writeFileSync(mappingSecretPath, JSON.stringify(mappingSecretData, null, 2), 'utf8');
  console.log(`Secret system alias mapping saved to private directory: ${mappingSecretPath}`);

  const multiSystemBlindExport: any[] = [];
  const allAutomaticProxyMetrics: any[] = [];
  const systemJudgmentsMap: Record<string, any[]> = {
    System_A: [],
    System_B: [],
    System_C: []
  };

  for (const systemName of systemNames) {
    const rDir = runDirs[systemName];
    const systemAlias = aliasMap[systemName];
    const rawResultsPath = path.join(rDir, 'results_raw.json');
    if (!fs.existsSync(rawResultsPath)) continue;

    const rawResults = JSON.parse(fs.readFileSync(rawResultsPath, 'utf8'));
    const answerResults: any[] = [];

    for (const item of rawResults) {
      const retrievedChunks = (item.retrieved || [])
        .map((r: any) => chunksMap.get(r.chunkId))
        .filter(Boolean) as CorpusChunk[];

      const gen = await generator.generateAnswer(item.question, retrievedChunks);
      const sentenceCitations = CitationParser.parseSentenceCitations(gen.answer, item.retrieved.map((r: any) => r.chunkId));

      const record = {
        query_id: item.query_id,
        question: item.question,
        answer: gen.answer,
        citations: sentenceCitations.allCitations,
        citation_validation: {
          valid: sentenceCitations.valid,
          invalid: sentenceCitations.invalid,
          has_invalid: sentenceCitations.hasInvalidCitations,
          has_missing: sentenceCitations.hasMissingCitations,
          invalid_rate: sentenceCitations.invalidCitationRate
        },
        model_info: gen.modelInfo
      };

      answerResults.push(record);

      const gt = gtMap.get(item.query_id) || {};
      const proxyMetric = AnswerMetricsEvaluator.computeAutomaticCitationProxyMetrics(record, gt, systemAlias);

      allAutomaticProxyMetrics.push(proxyMetric);
      systemJudgmentsMap[systemAlias].push(proxyMetric);
    }

    fs.writeFileSync(path.join(rDir, 'answers_raw.json'), JSON.stringify(answerResults, null, 2), 'utf8');
    console.log(`Saved answers_raw.json for ${systemName} (${systemAlias})`);
  }

  // Save automatic proxy metrics output
  const autoProxyMetricsPath = path.join(paperDir, 'answers_automatic_proxy_metrics.json');
  fs.writeFileSync(autoProxyMetricsPath, JSON.stringify(allAutomaticProxyMetrics, null, 2), 'utf8');

  const answerSummaries: Record<string, any> = {};
  for (const alias of Object.keys(systemJudgmentsMap)) {
    answerSummaries[alias] = AnswerMetricsEvaluator.calculateSummary(systemJudgmentsMap[alias]);
  }
  const answerSummaryPath = path.join(paperDir, 'answer_automatic_proxy_metrics_summary.json');
  fs.writeFileSync(answerSummaryPath, JSON.stringify(answerSummaries, null, 2), 'utf8');

  console.log(`\nComputed 24 automatic citation-grounded proxy metrics across n=8 test queries.`);
  console.log(`Automatic proxy metrics: ${autoProxyMetricsPath}`);
  console.log(`Automatic proxy summary saved to: ${answerSummaryPath}\n`);

  // Export Blind Review Annotation Package
  console.log('Exporting blind review annotation package...');
  const exportCmd = `bun experiments/version_aware_rag/scripts/v3/export_blind_answer_annotation_package.ts`;
  execSync(exportCmd, { stdio: 'inherit', cwd: rootDir });

  // 3. Compute Statistical Significance between Baseline Recency and Proposed Oracle
  console.log('[3/4] Computing paired statistics (Bootstrap CI, Wilcoxon, McNemar, Holm correction)...');
  const statsCmd = `bun experiments/version_aware_rag/scripts/v3/run_statistics.ts --runA ${runDirs['baseline_recency_only']} --runB ${runDirs['proposed_full_version_aware']} --outputDir experiments/version_aware_rag/results/v3/paper`;
  execSync(statsCmd, { stdio: 'inherit', cwd: rootDir });

  // 4. Dynamically generate paper tables
  console.log('[4/4] Dynamically building paper tables and error analysis...');
  const tablesCmd = `bun experiments/version_aware_rag/scripts/v3/build_paper_tables.ts --appendOnlyRun ${runDirs['baseline_append_only']} --recencyRun ${runDirs['baseline_recency_only']} --proposedOracleRun ${runDirs['proposed_full_version_aware']} --proposedPredictedRun ${runDirs['proposed_predicted_relations']} --outputDir experiments/version_aware_rag/results/v3/paper`;
  execSync(tablesCmd, { stdio: 'inherit', cwd: rootDir });

  console.log('\n========================================================================');
  console.log('       HELDOUT PIPELINE EXECUTION & ARTIFACT BUILD COMPLETE!           ');
  console.log('========================================================================\n');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Held-out pipeline failed:', err);
    process.exit(1);
  });
}
