import * as fs from 'fs';
import * as path from 'path';
import { computeBootstrapCI, computeBootstrapDifferenceCI } from '../../src/evaluation/bootstrap';
import { computeWilcoxonSignedRank } from '../../src/evaluation/paired_tests';

function parseArgs() {
  const args = process.argv.slice(2);
  let runA = '';
  let runB = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runA' && i + 1 < args.length) {
      runA = args[i + 1];
      i++;
    } else if (args[i] === '--runB' && i + 1 < args.length) {
      runB = args[i + 1];
      i++;
    }
  }
  return { runA, runB };
}

function main() {
  const { runA, runB } = parseArgs();
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

    // Align queries
    const alignedA: any[] = [];
    const alignedB: any[] = [];

    for (const itemB of rawB) {
      const itemA = rawA.find((x: any) => x.query_id === itemB.query_id);
      if (itemA) {
        alignedA.push(itemA);
        alignedB.push(itemB);
      }
    }

    const count = alignedA.length;
    if (count === 0) {
      console.error('Error: No aligned queries found between the two runs.');
      process.exit(1);
    }

    const metricsToTest = ['recall', 'precision', 'mrr', 'ndcg', 'required_recall'];
    const statResults: Record<string, any> = {};

    for (const key of metricsToTest) {
      const valsA = alignedA.map(x => x.metrics[key] !== null ? x.metrics[key] : 0);
      const valsB = alignedB.map(x => x.metrics[key] !== null ? x.metrics[key] : 0);

      // Bootstrap CI
      const ciA = computeBootstrapCI(valsA);
      const ciB = computeBootstrapCI(valsB);
      const ciDiff = computeBootstrapDifferenceCI(valsA, valsB);

      // Wilcoxon Signed Rank test
      const wilcoxon = computeWilcoxonSignedRank(valsA, valsB);

      statResults[key] = {
        baseline: ciA,
        proposed: ciB,
        difference: ciDiff,
        wilcoxon
      };
    }

    // Save statistics report
    const statsReportPath = path.resolve(rootDir, 'experiments/version_aware_rag/results/v3/statistics_report.json');
    fs.writeFileSync(statsReportPath, JSON.stringify(statResults, null, 2), 'utf8');

    console.log('\n=========================================================================================================================');
    console.log('                                         PAIRED SIGNIFICANCE REPORT                                                      ');
    console.log('=========================================================================================================================');
    console.log(`${String('Metric').padEnd(15)} | ${String('Baseline Mean (95% CI)').padEnd(30)} | ${String('Proposed Mean (95% CI)').padEnd(30)} | ${String('Difference (95% CI)').padEnd(25)} | p-value`);
    console.log('-------------------------------------------------------------------------------------------------------------------------');
    
    for (const key of metricsToTest) {
      const stats = statResults[key];
      const baselineStr = `${stats.baseline.mean.toFixed(3)} [${stats.baseline.ciLow.toFixed(3)}, ${stats.baseline.ciHigh.toFixed(3)}]`;
      const proposedStr = `${stats.proposed.mean.toFixed(3)} [${stats.proposed.ciLow.toFixed(3)}, ${stats.proposed.ciHigh.toFixed(3)}]`;
      const diffStr = `${stats.difference.mean.toFixed(3)} [${stats.difference.ciLow.toFixed(3)}, ${stats.difference.ciHigh.toFixed(3)}]`;
      
      console.log(`${key.padEnd(15)} | ${baselineStr.padEnd(30)} | ${proposedStr.padEnd(30)} | ${diffStr.padEnd(25)} | ${stats.wilcoxon.pValue.toFixed(4)}${stats.wilcoxon.isSignificant ? ' *' : ''}`);
    }
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
