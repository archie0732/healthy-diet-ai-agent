import * as fs from 'fs';
import * as path from 'path';
import { RuleBaselineDetector } from '../../src/versioning/detectors/rule_baseline';
import { LLMDetector } from '../../src/versioning/detectors/llm_detector';
import { computeClassificationMetrics, PerformanceStats } from '../../src/evaluation/classification_metrics';
import { CorpusChunk } from '../../src/corpus/types';

function parseArgs() {
  const args = process.argv.slice(2);
  let model = 'rule_baseline';
  let split = 'all';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && i + 1 < args.length) {
      model = args[i + 1];
      i++;
    } else if (args[i] === '--split' && i + 1 < args.length) {
      split = args[i + 1];
      i++;
    }
  }
  return { model, split };
}

function loadJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

async function main() {
  const { model, split } = parseArgs();
  const rootDir = process.cwd();

  const chunksPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const pairsPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relation_pairs.jsonl');
  const goldPath = path.resolve(rootDir, 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl');

  console.log(`Running relation classification using model: ${model} on split: ${split}...`);

  try {
    const chunks = loadJsonl<CorpusChunk>(chunksPath);
    const pairs = loadJsonl<any>(pairsPath);
    const goldRelations = loadJsonl<any>(goldPath);

    const chunksMap = new Map<string, CorpusChunk>();
    for (const c of chunks) {
      chunksMap.set(c.chunk_id, c);
    }

    const goldMap = new Map<string, string>();
    for (const g of goldRelations) {
      goldMap.set(g.pair_id, g.relation_type);
    }

    let detector: any;
    if (model === 'rule_baseline') {
      detector = new RuleBaselineDetector();
    } else if (model === 'llm_zero_shot') {
      detector = new LLMDetector('zero-shot');
    } else if (model === 'llm_few_shot') {
      detector = new LLMDetector('few-shot');
    } else {
      console.error(`Error: Unknown model "${model}"`);
      process.exit(1);
    }

    const predictions: string[] = [];
    const groundTruth: string[] = [];
    const perfStatsList: PerformanceStats[] = [];
    const results: any[] = [];

    for (const pair of pairs) {
      if (split !== 'all' && pair.split && pair.split !== split) {
        continue;
      }

      const oldChunk = chunksMap.get(pair.old_chunk_id);
      const newChunk = chunksMap.get(pair.new_chunk_id);
      const goldLabel = goldMap.get(pair.pair_id);

      if (!oldChunk || !newChunk || !goldLabel) {
        continue;
      }

      const prediction = await detector.classify({ oldChunk, newChunk });
      predictions.push(prediction.relationType);
      groundTruth.push(goldLabel);
      perfStatsList.push({
        latencyMs: prediction.latencyMs,
        promptTokens: prediction.promptTokens,
        completionTokens: prediction.completionTokens,
        isError: prediction.isError
      });

      results.push({
        pair_id: pair.pair_id,
        gold: goldLabel,
        predicted: prediction.relationType,
        confidence: prediction.confidence,
        rationale: prediction.rationale,
        isError: prediction.isError || false
      });
    }

    const report = computeClassificationMetrics(predictions, groundTruth, perfStatsList);

    console.log('\n=========================================================================================================================');
    console.log(`                                   RELATION CLASSIFICATION REPORT: ${model} (${split})`);
    console.log('=========================================================================================================================');
    console.log(`Accuracy:             ${(report.accuracy * 100).toFixed(2)}%`);
    console.log(`Macro-F1:             ${report.macroF1.toFixed(4)}`);
    console.log(`Invalid Output Rate:  ${(report.invalidRate * 100).toFixed(2)}% (${report.errorCount}/${report.totalEvaluated})`);
    console.log(`Avg Latency:          ${report.avgLatencyMs || 0} ms`);
    console.log(`Token Usage:          ${report.totalPromptTokens || 0} prompt / ${report.totalCompletionTokens || 0} completion`);
    console.log(`Est. API Cost:        $${report.estimatedCostUSD || 0}`);
    console.log('-------------------------------------------------------------------------------------------------------------------------');
    console.log(`${String('Class').padEnd(25)} | ${String('Precision').padEnd(10)} | ${String('Recall').padEnd(10)} | ${String('F1-Score').padEnd(10)} | Support`);
    console.log('-------------------------------------------------------------------------------------------------------------------------');
    for (const [cls, stats] of Object.entries(report.perClass)) {
      console.log(`${cls.padEnd(25)} | ${stats.precision.toFixed(4).padEnd(10)} | ${stats.recall.toFixed(4).padEnd(10)} | ${stats.f1.toFixed(4).padEnd(10)} | ${stats.support}`);
    }
    console.log('=========================================================================================================================');
    
    console.log('\nConfusion Matrix (Rows=Gold, Columns=Predicted):');
    const classes = Object.keys(report.confusionMatrix);
    console.log(''.padEnd(25) + ' | ' + classes.map(c => c.slice(0, 10).padEnd(10)).join(' | '));
    for (const gold of classes) {
      const row = report.confusionMatrix[gold];
      const vals = classes.map(pred => String(row[pred] || 0).padEnd(10));
      console.log(`${gold.padEnd(25)} | ${vals.join(' | ')}`);
    }
    console.log('=========================================================================================================================\n');

    // Save traceable artifacts to results/v3
    const resultsDir = path.resolve(rootDir, 'experiments/version_aware_rag/results/v3');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const jsonPath = path.join(resultsDir, `classification_report_${model}_${split}.json`);
    const mdPath = path.join(resultsDir, `classification_report_${model}_${split}.md`);

    const jsonReportData = {
      model,
      split,
      timestamp: new Date().toISOString(),
      metrics: report,
      predictions: results
    };
    fs.writeFileSync(jsonPath, JSON.stringify(jsonReportData, null, 2), 'utf8');

    let mdContent = `# Relation Classification Report: ${model} (${split})

- **Timestamp**: ${jsonReportData.timestamp}
- **Accuracy**: ${(report.accuracy * 100).toFixed(2)}%
- **Macro-F1**: ${report.macroF1.toFixed(4)}
- **Invalid Output Rate**: ${(report.invalidRate * 100).toFixed(2)}% (${report.errorCount}/${report.totalEvaluated})
- **Average Latency**: ${report.avgLatencyMs || 0} ms
- **Token Usage**: ${report.totalPromptTokens || 0} prompt / ${report.totalCompletionTokens || 0} completion
- **Estimated Cost**: $${report.estimatedCostUSD || 0}

## Per-Class Metrics

| Class | Precision | Recall | F1-Score | Support |
| --- | --- | --- | --- | --- |
`;
    for (const [cls, stats] of Object.entries(report.perClass)) {
      mdContent += `| ${cls} | ${stats.precision.toFixed(4)} | ${stats.recall.toFixed(4)} | ${stats.f1.toFixed(4)} | ${stats.support} |\n`;
    }

    mdContent += `\n## Confusion Matrix\n\n| Gold \\ Pred | ${classes.join(' | ')} |\n| --- | ${classes.map(() => '---').join(' | ')} |\n`;
    for (const gold of classes) {
      const row = report.confusionMatrix[gold];
      const vals = classes.map(pred => String(row[pred] || 0));
      mdContent += `| ${gold} | ${vals.join(' | ')} |\n`;
    }

    fs.writeFileSync(mdPath, mdContent, 'utf8');
    console.log(`Traceable classification artifacts saved:\n- ${jsonPath}\n- ${mdPath}\n`);


    process.exit(0);
  } catch (error: any) {
    console.error(`Relation classification failed:\n${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

