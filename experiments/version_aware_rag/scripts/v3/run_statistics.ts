import * as fs from 'fs';
import * as path from 'path';
import { computeBootstrapCI, computeBootstrapDifferenceCI } from '../../src/evaluation/bootstrap';
import {
  computeWilcoxonSignedRank,
  computeMcNemarTest,
  applyHolmCorrection,
  testNonInferiority,
  validateQueryAlignment
} from '../../src/evaluation/paired_tests';

function parseArgs() {
  const args = process.argv.slice(2);
  let runA = '';
  let runB = '';
  let outputDir = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runA' && i + 1 < args.length) {
      runA = args[i + 1];
      i++;
    } else if (args[i] === '--runB' && i + 1 < args.length) {
      runB = args[i + 1];
      i++;
    } else if (args[i] === '--outputDir' && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    }
  }
  return { runA, runB, outputDir };
}

function main() {
  const { runA, runB, outputDir } = parseArgs();
  const rootDir = process.cwd();

  if (!runA || !runB) {
    console.error('Error: Please provide both runs via --runA <path> --runB <path>');
    process.exit(1);
  }

  const pathA = path.resolve(rootDir, runA, 'results_raw.json');
  const pathB = path.resolve(rootDir, runB, 'results_raw.json');

  if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) {
    console.error('Error: results_raw.json not found in one or both of the runs.');
    process.exit(1);
  }

  console.log('Computing paired statistical significance and confidence intervals...');

  try {
    const rawA = JSON.parse(fs.readFileSync(pathA, 'utf8'));
    const rawB = JSON.parse(fs.readFileSync(pathB, 'utf8'));

    const queryIdsA = rawA.map((x: any) => x.query_id);
    const queryIdsB = rawB.map((x: any) => x.query_id);

    // Validate query alignment guard (throws if count or order mismatch)
    validateQueryAlignment(queryIdsA, queryIdsB);

    const continuousMetrics = ['recall', 'precision', 'mrr', 'ndcg', 'required_recall'];
    const binaryMetrics = ['stale_hit', 'exact_match_success'];
    const statResults: Record<string, any> = {};
    const pValuesForHolm: { name: string; pValue: number }[] = [];

    // Continuous metrics: Bootstrap CI + Wilcoxon signed-rank
    for (const key of continuousMetrics) {
      const valsA = rawA.map((x: any) => x.metrics[key] !== null ? x.metrics[key] : 0);
      const valsB = rawB.map((x: any) => x.metrics[key] !== null ? x.metrics[key] : 0);

      const ciA = computeBootstrapCI(valsA);
      const ciB = computeBootstrapCI(valsB);
      const ciDiff = computeBootstrapDifferenceCI(valsA, valsB);
      const wilcoxon = computeWilcoxonSignedRank(valsA, valsB);

      statResults[key] = {
        type: 'continuous',
        baseline: ciA,
        proposed: ciB,
        difference: ciDiff,
        wilcoxon
      };

      pValuesForHolm.push({ name: key, pValue: wilcoxon.pValue });
    }

    // Binary rate metrics: McNemar test
    for (const key of binaryMetrics) {
      const valsA = rawA.map((x: any) => {
        if (key === 'stale_hit') return x.metrics.stale_hit ? 1 : 0;
        if (key === 'exact_match_success') return (x.metrics.recall === 1.0) ? 1 : 0;
        return 0;
      });
      const valsB = rawB.map((x: any) => {
        if (key === 'stale_hit') return x.metrics.stale_hit ? 1 : 0;
        if (key === 'exact_match_success') return (x.metrics.recall === 1.0) ? 1 : 0;
        return 0;
      });

      const ciA = computeBootstrapCI(valsA);
      const ciB = computeBootstrapCI(valsB);
      const ciDiff = computeBootstrapDifferenceCI(valsA, valsB);
      const mcNemar = computeMcNemarTest(valsA, valsB);

      statResults[key] = {
        type: 'binary_rate',
        baseline: ciA,
        proposed: ciB,
        difference: ciDiff,
        mcNemar
      };

      pValuesForHolm.push({ name: key, pValue: mcNemar.pValue });
    }


    // Apply Holm-Bonferroni correction
    const holmAdjusted = applyHolmCorrection(pValuesForHolm);
    for (const item of holmAdjusted) {
      if (statResults[item.name]) {
        statResults[item.name].holmAdjustedPValue = item.adjustedPValue;
        statResults[item.name].isSignificantHolm = item.isSignificant;
      }
    }

    // Non-inferiority test for stale retrieval rate
    const staleA = rawA.map((x: any) => x.metrics.stale_hit ? 1 : 0);
    const staleB = rawB.map((x: any) => x.metrics.stale_hit ? 1 : 0);
    const staleRateA = staleA.reduce((a: number, b: number) => a + b, 0) / staleA.length;
    const staleRateB = staleB.reduce((a: number, b: number) => a + b, 0) / staleB.length;
    const nonInferiority = testNonInferiority(staleRateA, staleRateB, 0.05);
    statResults['stale_safety_non_inferiority'] = nonInferiority;

    // Save statistics report
    const targetPaperDir = outputDir
      ? path.resolve(rootDir, outputDir)
      : path.resolve(rootDir, 'experiments/version_aware_rag/results/v3/paper');

    if (!fs.existsSync(targetPaperDir)) {
      fs.mkdirSync(targetPaperDir, { recursive: true });
    }

    const statsReportPath = path.join(targetPaperDir, 'statistics_report.json');
    fs.writeFileSync(statsReportPath, JSON.stringify(statResults, null, 2), 'utf8');

    console.log('\n=========================================================================================================================');
    console.log('                                         PAIRED SIGNIFICANCE REPORT                                                      ');
    console.log('=========================================================================================================================');
    console.log(`${String('Metric').padEnd(20)} | ${String('Baseline Mean (95% CI)').padEnd(30)} | ${String('Proposed Mean (95% CI)').padEnd(30)} | ${String('Difference (95% CI)').padEnd(25)} | Test (p-val Holm)`);
    console.log('-------------------------------------------------------------------------------------------------------------------------');
    
    for (const key of [...continuousMetrics, ...binaryMetrics]) {
      const stats = statResults[key];
      const baselineStr = `${stats.baseline.mean.toFixed(3)} [${stats.baseline.ciLow.toFixed(3)}, ${stats.baseline.ciHigh.toFixed(3)}]`;
      const proposedStr = `${stats.proposed.mean.toFixed(3)} [${stats.proposed.ciLow.toFixed(3)}, ${stats.proposed.ciHigh.toFixed(3)}]`;
      const diffStr = `${stats.difference.mean.toFixed(3)} [${stats.difference.ciLow.toFixed(3)}, ${stats.difference.ciHigh.toFixed(3)}]`;
      const pValRaw = stats.type === 'continuous' ? stats.wilcoxon.pValue : stats.mcNemar.pValue;
      const testName = stats.type === 'continuous' ? 'Wilcoxon' : 'McNemar';
      const holmStr = `${testName} p=${pValRaw.toFixed(4)} (${stats.holmAdjustedPValue.toFixed(4)})`;

      console.log(`${key.padEnd(20)} | ${baselineStr.padEnd(30)} | ${proposedStr.padEnd(30)} | ${diffStr.padEnd(25)} | ${holmStr}${stats.isSignificantHolm ? ' *' : ''}`);
    }
    console.log('-------------------------------------------------------------------------------------------------------------------------');
    console.log(`Stale Safety Non-Inferiority Margin (0.05): ${nonInferiority.passedNonInferiority ? 'PASSED' : 'FAILED'} (diff: ${nonInferiority.difference})`);
    console.log('=========================================================================================================================\n');

    console.log(`Statistical report saved to ${statsReportPath}`);
    process.exit(0);
  } catch (error: any) {
    console.error(`Significance testing failed:\n${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

