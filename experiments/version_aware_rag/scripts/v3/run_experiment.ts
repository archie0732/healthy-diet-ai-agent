import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { loadExperimentConfig } from '../../../../src/shared/config';
import { getFileChecksum } from '../../../../src/shared/hash';
import { generateRunManifest } from '../../../../src/shared/manifest';
import { BM25Retriever } from '../../src/retrieval/bm25';
import { DenseRetriever } from '../../src/retrieval/dense';
import { HybridRetriever } from '../../src/retrieval/hybrid';
import { RecencyBoostRetriever } from '../../src/retrieval/recency';
import { HeuristicRetriever } from '../../src/retrieval/heuristic';
import { RetrievalContext } from '../../src/retrieval/types';
import { calculateQueryMetrics, QueryMetrics } from '../../src/evaluation/retrieval_metrics';
import { compileStratifiedReport } from '../../src/evaluation/stratified_summary';
import { EvaluationQuery, QueryJudgment } from '../../src/annotation/schema';
import { CorpusChunk } from '../../src/corpus/types';

import { RelationGraph } from '../../src/versioning/relation_graph';
import { VersionAwareRetriever } from '../../src/retrieval/version_aware';
import { AblationConfig } from '../../src/versioning/types';

function parseArgs() {
  const args = process.argv.slice(2);
  let configPath = '';
  let splitOverride: string | undefined = undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === '--split' && i + 1 < args.length) {
      splitOverride = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { configPath, splitOverride, dryRun };
}

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
  const { configPath, splitOverride, dryRun } = parseArgs();

  if (!configPath) {
    console.error('Error: Please provide a configuration file via --config <yaml_path>');
    console.error('Usage: bun run_experiment.ts --config <yaml_path> --split <development|validation|test> [--dry-run]');
    process.exit(1);
  }

  if (!splitOverride) {
    console.error('Error: --split <development|validation|test> must be explicitly specified on the command line.');
    process.exit(1);
  }

  if (splitOverride !== 'development' && splitOverride !== 'validation' && splitOverride !== 'test' && splitOverride !== 'all') {
    console.error(`Error: Invalid split "${splitOverride}". Must be one of: development, validation, test, all`);
    process.exit(1);
  }

  // 1. Load configuration
  let config: any;
  try {
    config = loadExperimentConfig(configPath);
  } catch (error: any) {
    console.error(`Configuration load failed:\n${error.message}`);
    process.exit(1);
  }

  config.experiment.split = splitOverride;
  const isHeldOut = splitOverride === 'test';

  // 2. Checksums
  const inputChecksums: Record<string, string> = {};
  try {
    inputChecksums['corpus'] = getFileChecksum(config.corpus.path);
    inputChecksums['query'] = getFileChecksum(config.evaluation.query_path);

    // Calculate relation pairs and policy/relations checksums if they exist or are loaded
    const rootDir = process.cwd();
    const relationPairsPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl');
    if (fs.existsSync(relationPairsPath)) {
      inputChecksums['relation_pairs'] = getFileChecksum(relationPairsPath);
    }
    if (config.version_policy.relation_source && config.version_policy.relation_source !== 'none') {
      const relationsPath = path.resolve(
        rootDir,
        `experiments/version_aware_rag/data/annotations_v3/relations.${config.version_policy.relation_source === 'gold' ? 'adjudicated' : 'predicted'}.jsonl`
      );
      if (fs.existsSync(relationsPath)) {
        inputChecksums['relations'] = getFileChecksum(relationsPath);
      }
    }
  } catch (error: any) {
    console.error(`Checksum calculation failed:\n${error.message}`);
    process.exit(1);
  }

  // 3. Output directories
  const timestamp = new Date().toISOString().replace(/[^0-9T]/g, '').slice(0, 15);
  const runId = `${timestamp}-${config.experiment.id}`;
  const runDir = path.resolve(process.cwd(), config.output.root, runId);

  if (fs.existsSync(runDir)) {
    console.error(`Error: Run directory already exists: ${runDir}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n--- DRY RUN VERIFICATION SUCCESSFUL ---');
    console.log(`Experiment ID: ${config.experiment.id}`);
    console.log(`Split: ${config.experiment.split} (Held-out: ${isHeldOut})`);
    console.log(`Corpus Path: ${config.corpus.path}`);
    console.log(`Target Run Dir: ${runDir}`);
    console.log('----------------------------------------\n');
    process.exit(0);
  }

  fs.mkdirSync(runDir, { recursive: true });

  console.log(`Starting experiment run: ${runId}`);
  console.log(`Target output directory: ${runDir}`);

  const startTime = Date.now();

  // 4. Load Data
  let chunks: CorpusChunk[];
  let allQueries: EvaluationQuery[];
  let splitQueryIds: Set<string>;

  try {
    chunks = loadJsonOrJsonl<CorpusChunk>(config.corpus.path);
    allQueries = loadJsonOrJsonl<EvaluationQuery>(config.evaluation.query_path);

    // Resolve split queries
    if (splitOverride === 'all') {
      splitQueryIds = new Set<string>(allQueries.map(q => q.query_id));
    } else {
      const splitFilePath = path.resolve(process.cwd(), `experiments/version_aware_rag/data/splits_v3/${splitOverride}.json`);
      const splitData = JSON.parse(fs.readFileSync(splitFilePath, 'utf-8'));
      splitQueryIds = new Set<string>(splitData.queries || []);
    }
  } catch (error: any) {
    console.error(`Failed to load experiment data:\n${error.message}`);
    process.exit(1);
  }

  // Filter queries by split
  const queries = allQueries.filter(q => splitQueryIds.has(q.query_id));

  // 5. Initialize retrievers
  let baseRetriever: any;
  const backend = config.retrieval.backend || 'bm25';

  if (backend === 'bm25') {
    baseRetriever = new BM25Retriever(chunks);
  } else if (backend === 'dense') {
    baseRetriever = new DenseRetriever(chunks);
  } else if (backend === 'hybrid') {
    baseRetriever = new HybridRetriever(new BM25Retriever(chunks), new DenseRetriever(chunks), 0.5);
  } else if (backend === 'heuristic') {
    baseRetriever = new HeuristicRetriever(chunks);
  } else {
    console.error(`Error: Unknown backend "${backend}"`);
    process.exit(1);
  }

  let retriever = baseRetriever;
  if (config.retrieval.mode === 'recency_only') {
    if (backend === 'heuristic') {
      // Unnormalized recency boosting for v2 compatibility
      retriever = {
        retrieve: async (query: RetrievalContext, topK: number) => {
          const results = await baseRetriever.retrieve(query, chunks.length);
          const boosted = results.map((r: any) => {
            const c = chunks.find(x => x.chunk_id === r.chunkId);
            let year = 2015;
            if (c) {
              if ('published_year' in c && typeof (c as any).published_year === 'number') {
                year = (c as any).published_year;
              } else if (c.edition === '2020-2025') {
                year = 2020;
              } else if (c.edition === '2025-2030') {
                year = 2025;
              }
            }
            const boost = (year - 2015) * config.retrieval.recency_weight;
            return {
              ...r,
              finalScore: r.baseScore + boost,
              scoreComponents: {
                ...r.scoreComponents,
                recency_boost: boost
              }
            };
          });
          boosted.sort((a: any, b: any) => {
            if (Math.abs(a.finalScore - b.finalScore) < 0.001) {
              const getYear = (chunkId: string) => {
                const c = chunks.find(x => x.chunk_id === chunkId);
                if (!c) return 2015;
                if ('published_year' in c && typeof (c as any).published_year === 'number') {
                  return (c as any).published_year;
                }
                if (c.edition === '2020-2025') return 2020;
                if (c.edition === '2025-2030') return 2025;
                return 2015;
              };
              return getYear(b.chunkId) - getYear(a.chunkId);
            }
            return b.finalScore - a.finalScore;
          });
          return boosted.slice(0, topK).map((res: any, index: number) => ({
            ...res,
            rank: index + 1
          }));
        }
      };
    } else {
      retriever = new RecencyBoostRetriever(baseRetriever, chunks, config.retrieval.recency_weight);
    }
  } else if (config.retrieval.mode === 'proposed') {
    if (backend === 'heuristic') {
      // Load v2 deprecated keys
      const rootDir = process.cwd();
      const deprecatedKeysPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations/deprecated_keys.json');
      const deprecatedKeysData = JSON.parse(fs.readFileSync(deprecatedKeysPath, 'utf-8'));
      const deprecatedKeys = new Set<string>(deprecatedKeysData.deprecated_keys);
      for (const key of Array.from(deprecatedKeys)) {
        if (key.endsWith('-2020-2025')) {
          const prefix = key.replace('-2020-2025', '');
          deprecatedKeys.add(`${prefix}-2015-2020`);
        }
      }

      retriever = {
        retrieve: async (query: RetrievalContext, topK: number) => {
          const activeChunks = chunks.filter(c => {
            const key = `${c.lineage_id}-${(c as any).version || c.edition}`;
            return !deprecatedKeys.has(key);
          });
          const activeHeuristicRetriever = new HeuristicRetriever(activeChunks);
          return activeHeuristicRetriever.retrieve(query, topK);
        }
      };
    } else {
      const rootDir = process.cwd();
      const relationPairsPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl');
      const relationsPath = path.resolve(rootDir, `experiments/version_aware_rag/data/annotations_v3/relations.${config.version_policy.relation_source === 'gold' ? 'adjudicated' : 'predicted'}.jsonl`);

      const confidenceThreshold = config.version_policy.confidence_threshold !== undefined ? config.version_policy.confidence_threshold : 0.7;
      const graph = new RelationGraph(relationPairsPath, relationsPath, confidenceThreshold);

      const mode = config.version_policy.ablation_mode;
      const retain_relation_boost = config.version_policy.retain_relation_boost !== undefined ? config.version_policy.retain_relation_boost : 0.1;
      const condition_boost = config.version_policy.condition_boost !== undefined ? config.version_policy.condition_boost : 0.15;
      const expansion_seed_threshold = config.version_policy.expansion_seed_threshold !== undefined ? config.version_policy.expansion_seed_threshold : 0.05;
      const expansion_min_base_score = config.version_policy.expansion_min_base_score !== undefined ? config.version_policy.expansion_min_base_score : 0.01;
      const diversification_penalty = config.version_policy.diversification_penalty !== undefined ? config.version_policy.diversification_penalty : 0.9;

      let ablation: AblationConfig;

      if (mode) {
        ablation = {
          filter_only: mode === 'filter_only',
          filter_retain_boost: mode === 'filter_retain_boost',
          filter_compatibility_expansion: mode === 'filter_compatibility_expansion',
          filter_condition_matching: mode === 'filter_condition_matching',
          full_version_aware: mode === 'full_version_aware',
          full_version_aware_no_div: mode === 'full_version_aware_no_div',
          retain_relation_boost,
          condition_boost,
          expansion_seed_threshold,
          expansion_min_base_score,
          diversification_penalty
        };
      } else {
        const isFull = config.version_policy.deprecated_filter && config.version_policy.compatibility_expansion;
        const isFilterOnly = config.version_policy.deprecated_filter && !config.version_policy.compatibility_expansion;

        ablation = {
          filter_only: isFilterOnly,
          filter_retain_boost: isFull,
          filter_compatibility_expansion: isFull,
          filter_condition_matching: isFull,
          full_version_aware: isFull,
          full_version_aware_no_div: false,
          retain_relation_boost,
          condition_boost,
          expansion_seed_threshold,
          expansion_min_base_score,
          diversification_penalty
        };
      }

      retriever = new VersionAwareRetriever(baseRetriever, chunks, graph, ablation);
    }
  }

  // 6. Execute search (No-Oracle property is strictly respected: judgments are NOT loaded at this stage)
  const rawRetrievalResults: { query_id: string; question: string; retrieved: any[] }[] = [];

  const searchPromises = queries.map(async (q) => {
    const context = {
      queryId: q.query_id,
      question: q.question,
      targetPopulation: q.target_population,
      conditions: q.conditions
    };

    try {
      const results = retriever.retrieve ? await retriever.retrieve(context, config.retrieval.top_k) : [];
      rawRetrievalResults.push({
        query_id: q.query_id,
        question: q.question,
        retrieved: results
      });
    } catch (err: any) {
      console.error(`Search failed for query ${q.query_id}: ${err.message}`);
    }
  });

  // Log retrieval start event right before awaiting all promises
  console.log('[EVENT] START_RETRIEVAL');

  Promise.all(searchPromises).then(() => {
    console.log('[EVENT] END_RETRIEVAL');

    // Phase 2: Compute judgment file checksum
    console.log('[EVENT] READ_JUDGMENT_CHECKSUM');
    try {
      inputChecksums['judgment'] = getFileChecksum(config.evaluation.judgment_path);
    } catch (err: any) {
      console.error(`Failed to calculate judgment checksum:\n${err.message}`);
      process.exit(1);
    }

    // 7. Retrieval is fully completed. Now load judgments for scoring/evaluation.
    console.log('[EVENT] LOAD_JUDGMENTS');
    console.log('Retrieval complete. Loading judgments offline for scoring...');
    let allJudgments: QueryJudgment[];
    try {
      allJudgments = loadJsonOrJsonl<QueryJudgment>(config.evaluation.judgment_path);
    } catch (error: any) {
      console.error(`Failed to load judgments for scoring:\n${error.message}`);
      process.exit(1);
    }

    const judgmentsMap = new Map<string, QueryJudgment>();
    for (const j of allJudgments) {
      if (splitQueryIds.has(j.query_id)) {
        // Bridge v2 / v3 schema compatibility
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

    console.log('[EVENT] START_SCORING');
    const metricsMap = new Map<string, QueryMetrics>();
    const rawResults: any[] = [];

    for (const res of rawRetrievalResults) {
      const judgment = judgmentsMap.get(res.query_id);
      if (!judgment) {
        console.warn(`Warning: Judgment missing for query ${res.query_id}`);
        continue;
      }

      const retrievedIds = res.retrieved.map(r => r.chunkId);
      const metrics = calculateQueryMetrics(retrievedIds, judgment, config.retrieval.top_k);
      metricsMap.set(res.query_id, metrics);

      rawResults.push({
        query_id: res.query_id,
        question: res.question,
        retrieved: res.retrieved,
        metrics
      });
    }
    console.log('[EVENT] END_SCORING');

    const report = compileStratifiedReport(queries, metricsMap);
    const durationMs = Date.now() - startTime;

    // 7. Write outputs
    try {
      const manifest = generateRunManifest(runId, config, inputChecksums, durationMs, isHeldOut);
      fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
      fs.writeFileSync(path.join(runDir, 'config.yaml'), yaml.stringify(config), 'utf-8');
      fs.writeFileSync(path.join(runDir, 'results_raw.json'), JSON.stringify(rawResults, null, 2), 'utf-8');
      fs.writeFileSync(path.join(runDir, 'results_summary.json'), JSON.stringify(report, null, 2), 'utf-8');

      // Generate Markdown Summary
      let md = `# Experiment Run Summary: ${runId}\n\n`;
      md += `| Stratum | Queries | Recall | Precision | MRR | nDCG | Stale Hit Rate | Unsafe Count |\n`;
      md += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
      
      const printRow = (name: string, stats: any) => {
        return `| **${name}** | ${stats.query_count} | ${stats.recall !== null ? (stats.recall * 100).toFixed(1) + '%' : 'N/A'} | ${stats.precision !== null ? (stats.precision * 100).toFixed(1) + '%' : 'N/A'} | ${stats.mrr.toFixed(3)} | ${stats.ndcg.toFixed(3)} | ${(stats.stale_hit_rate * 100).toFixed(1)}% | ${stats.avg_unsafe_chunks.toFixed(2)} |\n`;
      };

      md += printRow('OVERALL', report.overall);
      for (const [sName, sStats] of Object.entries(report.by_strata)) {
        md += printRow(sName, sStats);
      }

      fs.writeFileSync(path.join(runDir, 'summary.md'), md, 'utf-8');

      console.log('\n=========================================================================================================================');
      console.log(`                                   EXPERIMENT RUN COMPLETED: ${runId}`);
      console.log('=========================================================================================================================');
      console.log(`${String('Stratum').padEnd(25)} | ${String('Recall').padEnd(8)} | ${String('Precision').padEnd(10)} | ${String('MRR').padEnd(6)} | ${String('nDCG').padEnd(6)} | ${String('Stale Hit').padEnd(10)} | ${String('Unsafe Count')}`);
      console.log('-------------------------------------------------------------------------------------------------------------------------');
      
      const logRow = (name: string, stats: any) => {
        console.log(`${name.padEnd(25)} | ${(stats.recall !== null ? (stats.recall * 100).toFixed(1) + '%' : 'N/A').padEnd(8)} | ${(stats.precision !== null ? (stats.precision * 100).toFixed(1) + '%' : 'N/A').padEnd(10)} | ${stats.mrr.toFixed(3).padEnd(6)} | ${stats.ndcg.toFixed(3).padEnd(6)} | ${(stats.stale_hit_rate * 100).toFixed(1) + '%' .padEnd(10)} | ${stats.avg_unsafe_chunks.toFixed(2)}`);
      };

      logRow('OVERALL', report.overall);
      for (const [sName, sStats] of Object.entries(report.by_strata)) {
        logRow(sName, sStats);
      }
      console.log('=========================================================================================================================\n');
      console.log(`Run artifacts saved successfully to: ${runDir}`);
      process.exit(0);
    } catch (error: any) {
      console.error(`Failed to save run artifacts:\n${error.message}`);
      process.exit(1);
    }
  });
}

if (require.main === module) {
  main();
}
