import * as fs from 'fs';
import * as path from 'path';
import { AnswerMetricsEvaluator, AnswerHumanAnnotation, AnswerHumanAdjudication } from '../../src/evaluation/answer_metrics';

function parseArgs() {
  const args = process.argv.slice(2);
  let annotator1Path = '';
  let annotator2Path = '';
  let adjudicationPath = '';
  let inputDir = '';
  let outputDir = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--annotator1' && i + 1 < args.length) {
      annotator1Path = args[i + 1];
      i++;
    } else if (args[i] === '--annotator2' && i + 1 < args.length) {
      annotator2Path = args[i + 1];
      i++;
    } else if (args[i] === '--adjudication' && i + 1 < args.length) {
      adjudicationPath = args[i + 1];
      i++;
    } else if (args[i] === '--inputDir' && i + 1 < args.length) {
      inputDir = args[i + 1];
      i++;
    } else if (args[i] === '--outputDir' && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    }
  }

  return { annotator1Path, annotator2Path, adjudicationPath, inputDir, outputDir };
}

const VALID_ORDINAL_VALUES = [0, 0.5, 1];
const VALID_BINARY_VALUES = [0, 1];

function validateAnnotationItem(item: any, expectedBase: Map<string, any>, annotatorLabel: string) {
  if (!item.item_id || typeof item.item_id !== 'string') {
    throw new Error(`[${annotatorLabel}] Invalid or missing item_id in record: ${JSON.stringify(item)}`);
  }

  const base = expectedBase.get(item.item_id);
  if (!base) {
    throw new Error(`[${annotatorLabel}] Unknown item_id: ${item.item_id}`);
  }

  // Reject automatic proxy metrics masquerading as human input
  if (item.metric_provenance || item.scoring_method) {
    throw new Error(`[${annotatorLabel}] Item ${item.item_id} contains automatic proxy metric tags. Rejection: Automatic metrics cannot be submitted as human annotations.`);
  }

  // Check valid values
  const ordinalFields = ['answer_correctness', 'completeness', 'version_correctness', 'conditional_boundary_preservation', 'citation_entailment'];
  for (const field of ordinalFields) {
    const val = item[field];
    if (typeof val !== 'number' || !VALID_ORDINAL_VALUES.includes(val)) {
      throw new Error(`[${annotatorLabel}] Item ${item.item_id} field '${field}' has invalid value ${val}. Must be 0, 0.5, or 1.`);
    }
  }

  const unsupVal = item.unsupported_claim;
  if (typeof unsupVal !== 'number' || !VALID_BINARY_VALUES.includes(unsupVal)) {
    throw new Error(`[${annotatorLabel}] Item ${item.item_id} field 'unsupported_claim' has invalid value ${unsupVal}. Must be 0 or 1.`);
  }

  // If alias/query/answer are included in item, verify immutability against base
  if (item.system_alias && item.system_alias !== base.system_alias) {
    throw new Error(`[${annotatorLabel}] Item ${item.item_id} system_alias tampered: ${item.system_alias} vs expected ${base.system_alias}`);
  }
  if (item.query_id && item.query_id !== base.query_id) {
    throw new Error(`[${annotatorLabel}] Item ${item.item_id} query_id tampered: ${item.query_id} vs expected ${base.query_id}`);
  }
}

function main() {
  const { annotator1Path, annotator2Path, adjudicationPath, inputDir, outputDir } = parseArgs();
  const rootDir = process.cwd();
  const defaultDir = path.resolve(rootDir, 'experiments/version_aware_rag/results/v3/paper/blind_review');
  const searchDir = inputDir ? path.resolve(rootDir, inputDir) : defaultDir;

  const targetOutputDir = outputDir
    ? path.resolve(rootDir, outputDir)
    : path.resolve(rootDir, 'experiments/version_aware_rag/results/v3/paper');

  if (!fs.existsSync(targetOutputDir)) {
    fs.mkdirSync(targetOutputDir, { recursive: true });
  }

  // Load expected base items from export package 1
  const pkg1Path = path.join(searchDir, 'annotation_package_annotator_1.json');
  if (!fs.existsSync(pkg1Path)) {
    console.error(`Error: Base export package not found at ${pkg1Path}`);
    process.exit(1);
  }

  const baseItems: any[] = JSON.parse(fs.readFileSync(pkg1Path, 'utf8'));
  const baseMap = new Map<string, any>(baseItems.map(b => [b.item_id, b]));

  const path1 = annotator1Path
    ? path.resolve(rootDir, annotator1Path)
    : path.join(searchDir, 'annotation_results_annotator_1.json');

  const path2 = annotator2Path
    ? path.resolve(rootDir, annotator2Path)
    : path.join(searchDir, 'annotation_results_annotator_2.json');

  const has1 = fs.existsSync(path1);
  const has2 = fs.existsSync(path2);

  if (!has1 && !has2) {
    console.error(`Error: No human annotation result files found at ${path1} or ${path2}`);
    process.exit(1);
  }

  // Single annotator fallback mode
  if (has1 && !has2) {
    console.warn(`[WARNING] Only Annotator 1 data provided (${path1}). Running exploratory human evaluation.`);
    console.warn(`[NOTICE] Cannot claim inter-annotator agreement or formal adjudication.`);
    
    const items1: any[] = JSON.parse(fs.readFileSync(path1, 'utf8'));
    if (items1.length !== 24) {
      throw new Error(`Annotator 1 data must contain exactly 24 items, found ${items1.length}`);
    }

    items1.forEach(item => validateAnnotationItem(item, baseMap, 'Annotator 1'));

    const exploratorySummary: Record<string, any> = {};
    const itemsByAlias: Record<string, any[]> = {};
    items1.forEach(item => {
      const base = baseMap.get(item.item_id);
      const alias = base.system_alias;
      if (!itemsByAlias[alias]) itemsByAlias[alias] = [];
      itemsByAlias[alias].push(item);
    });

    for (const alias of Object.keys(itemsByAlias)) {
      exploratorySummary[alias] = AnswerMetricsEvaluator.calculateSummary(itemsByAlias[alias]);
    }

    const exploratoryReport = {
      evaluation_type: 'exploratory_single_annotator',
      annotator_count: 1,
      summary_by_system: exploratorySummary,
      raw_annotations: items1
    };

    fs.writeFileSync(path.join(targetOutputDir, 'answers_human_annotations_raw.json'), JSON.stringify([items1], null, 2), 'utf8');
    fs.writeFileSync(path.join(targetOutputDir, 'answer_human_exploratory_summary.json'), JSON.stringify(exploratoryReport, null, 2), 'utf8');
    console.log(`Exploratory single-annotator human evaluation saved to ${targetOutputDir}`);
    process.exit(0);
  }

  // Dual annotator full agreement & adjudication pipeline
  console.log(`Importing human annotations from:\n  - ${path1}\n  - ${path2}`);
  const items1: any[] = JSON.parse(fs.readFileSync(path1, 'utf8'));
  const items2: any[] = JSON.parse(fs.readFileSync(path2, 'utf8'));

  if (items1.length !== 24 || items2.length !== 24) {
    throw new Error(`Both annotators must provide exactly 24 items. Found ${items1.length} and ${items2.length}.`);
  }

  items1.forEach(item => validateAnnotationItem(item, baseMap, 'Annotator 1'));
  items2.forEach(item => validateAnnotationItem(item, baseMap, 'Annotator 2'));

  const map1 = new Map<string, any>(items1.map(i => [i.item_id, i]));
  const map2 = new Map<string, any>(items2.map(i => [i.item_id, i]));

  // Verify item_id set completeness (blind-001 to blind-024)
  for (let i = 1; i <= 24; i++) {
    const id = `blind-${String(i).padStart(3, '0')}`;
    if (!map1.has(id)) throw new Error(`Annotator 1 missing item ${id}`);
    if (!map2.has(id)) throw new Error(`Annotator 2 missing item ${id}`);
  }

  // Load explicit adjudication decisions if provided
  let adjMap = new Map<string, any>();
  if (adjudicationPath && fs.existsSync(path.resolve(rootDir, adjudicationPath))) {
    const adjItems: any[] = JSON.parse(fs.readFileSync(path.resolve(rootDir, adjudicationPath), 'utf8'));
    adjMap = new Map(adjItems.map(a => [a.item_id, a]));
  }

  const metrics = ['answer_correctness', 'completeness', 'version_correctness', 'conditional_boundary_preservation', 'unsupported_claim', 'citation_entailment'];
  
  const agreementStats: Record<string, {
    raw_agreement: number;
    kappa?: number;
    weighted_kappa?: number;
    disagreements: number;
  }> = {};

  const ratings1ByMetric: Record<string, number[]> = {};
  const ratings2ByMetric: Record<string, number[]> = {};
  metrics.forEach(m => {
    ratings1ByMetric[m] = [];
    ratings2ByMetric[m] = [];
  });

  const adjudicatedResults: AnswerHumanAdjudication[] = [];
  let totalDisagreementCount = 0;

  for (let i = 1; i <= 24; i++) {
    const itemId = `blind-${String(i).padStart(3, '0')}`;
    const base = baseMap.get(itemId);
    const a1 = map1.get(itemId);
    const a2 = map2.get(itemId);
    const adj = adjMap.get(itemId);

    const scores1: Record<string, number> = {};
    const scores2: Record<string, number> = {};
    const finalScores: Record<string, number> = {};
    let itemHasMismatch = false;
    let adjudicationReason = '';

    for (const m of metrics) {
      const v1 = a1[m];
      const v2 = a2[m];
      scores1[m] = v1;
      scores2[m] = v2;
      ratings1ByMetric[m].push(v1);
      ratings2ByMetric[m].push(v2);

      if (v1 !== v2) {
        itemHasMismatch = true;
      }

      if (v1 === v2) {
        finalScores[m] = v1;
      } else if (adj && adj.final_score && typeof adj.final_score[m] === 'number') {
        finalScores[m] = adj.final_score[m];
        if (adj.adjudication_reason) adjudicationReason = adj.adjudication_reason;
      } else {
        // Fallback default adjudication rule (average rounded or conservative selection)
        finalScores[m] = (v1 + v2) / 2;
        adjudicationReason = `Automatic mid-point resolution between Annotator 1 (${v1}) and Annotator 2 (${v2}).`;
      }
    }

    if (itemHasMismatch) totalDisagreementCount++;

    adjudicatedResults.push({
      item_id: itemId,
      query_id: base.query_id,
      system_alias: base.system_alias,
      annotator_1_score: scores1,
      annotator_2_score: scores2,
      final_score: finalScores as any,
      is_adjudicated: itemHasMismatch,
      adjudication_reason: itemHasMismatch ? (adjudicationReason || 'Adjudicated by third reviewer.') : undefined
    });
  }

  // Compute Agreement Metrics
  metrics.forEach(m => {
    const r1 = ratings1ByMetric[m];
    const r2 = ratings2ByMetric[m];
    const matches = r1.filter((val, idx) => val === r2[idx]).length;
    const rawAgreement = parseFloat((matches / r1.length).toFixed(4));
    const disagreements = r1.length - matches;

    if (m === 'unsupported_claim') {
      const kappa = AnswerMetricsEvaluator.computeCohenKappa(r1, r2);
      agreementStats[m] = { raw_agreement: rawAgreement, kappa, disagreements };
    } else {
      const weightedKappa = AnswerMetricsEvaluator.computeWeightedCohenKappa(r1, r2, [0, 0.5, 1]);
      agreementStats[m] = { raw_agreement: rawAgreement, weighted_kappa: weightedKappa, disagreements };
    }
  });

  const agreementSummaryData = {
    total_items: 24,
    items_with_mismatch: totalDisagreementCount,
    adjudication_required_count: totalDisagreementCount,
    metric_agreements: agreementStats
  };

  // Build Markdown Agreement Report
  let agreementMd = `# Inter-Annotator Agreement & Adjudication Report (v3)\n\n`;
  agreementMd += `**Total Items Assessed:** 24\n`;
  agreementMd += `**Items Requiring Adjudication:** ${totalDisagreementCount} / 24\n\n`;
  agreementMd += `### Per-Metric Agreement Statistics\n\n`;
  agreementMd += `| Metric | Raw Agreement | Inter-Annotator Agreement (Kappa) | Disagreement Items |\n`;
  agreementMd += `| :--- | :---: | :---: | :---: |\n`;

  for (const m of metrics) {
    const stat = agreementStats[m];
    const kappaStr = m === 'unsupported_claim'
      ? `Cohen's Kappa = ${stat.kappa?.toFixed(4)}`
      : `Weighted Kappa = ${stat.weighted_kappa?.toFixed(4)}`;
    agreementMd += `| **${m}** | ${(stat.raw_agreement * 100).toFixed(1)}% | ${kappaStr} | ${stat.disagreements} |\n`;
  }

  // Compute Adjudicated Summary per System
  const systemAdjudicatedMap: Record<string, any[]> = {};
  adjudicatedResults.forEach(res => {
    if (!systemAdjudicatedMap[res.system_alias]) systemAdjudicatedMap[res.system_alias] = [];
    systemAdjudicatedMap[res.system_alias].push(res.final_score);
  });

  const humanAdjudicatedSummary: Record<string, any> = {};
  for (const alias of Object.keys(systemAdjudicatedMap)) {
    humanAdjudicatedSummary[alias] = AnswerMetricsEvaluator.calculateSummary(systemAdjudicatedMap[alias]);
  }

  // Save Outputs
  const rawAnnotationsOutput = { annotator_1: items1, annotator_2: items2 };
  fs.writeFileSync(path.join(targetOutputDir, 'answers_human_annotations_raw.json'), JSON.stringify(rawAnnotationsOutput, null, 2), 'utf8');
  fs.writeFileSync(path.join(targetOutputDir, 'answer_annotation_agreement.json'), JSON.stringify(agreementSummaryData, null, 2), 'utf8');
  fs.writeFileSync(path.join(targetOutputDir, 'answer_annotation_agreement.md'), agreementMd, 'utf8');
  fs.writeFileSync(path.join(targetOutputDir, 'answers_human_adjudicated.json'), JSON.stringify(adjudicatedResults, null, 2), 'utf8');
  fs.writeFileSync(path.join(targetOutputDir, 'answer_human_adjudicated_summary.json'), JSON.stringify(humanAdjudicatedSummary, null, 2), 'utf8');

  console.log(`Human annotation import & adjudication complete! Outputs saved to ${targetOutputDir}:`);
  console.log(`  - answers_human_annotations_raw.json`);
  console.log(`  - answer_annotation_agreement.json`);
  console.log(`  - answer_annotation_agreement.md`);
  console.log(`  - answers_human_adjudicated.json`);
  console.log(`  - answer_human_adjudicated_summary.json`);
}

if (require.main === module) {
  main();
}
