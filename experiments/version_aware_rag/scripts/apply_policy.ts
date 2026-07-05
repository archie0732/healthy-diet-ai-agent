import * as fs from 'fs';
import * as path from 'path';

interface EvaluationPair {
  sample_id: string;
  topic: string;
  lineage_id: string;
  new_version: string;
  old_version: string;
  new_text: string;
  old_text: string;
  relation_label?: string;
  policy_label?: string;
  notes?: string;
}

export function determinePolicyFromRelation(relationLabel: string): string {
  switch (relationLabel) {
    case 'duplicate':
      return 'down-rank';
    case 'superseded':
      return 'deprecate';
    case 'conflicting':
      return 'deprecate';
    case 'conditional_difference':
      return 'retain';
    case 'complementary':
      return 'retain';
    default:
      return 'retain';
  }
}

function main() {
  const annotationsDir = path.join(__dirname, '..', 'data', 'annotations');
  const inputPath = path.join(annotationsDir, 'classified_evaluation_pairs.json');
  const resultsDir = path.join(__dirname, '..', 'results', 'tables');

  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Classified pairs file not found: ${inputPath}`);
    process.exit(1);
  }

  const pairs: EvaluationPair[] = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  console.log(`Applying policies to ${pairs.length} pairs...`);

  let correctCount = 0;
  const policyDetails = [];

  for (const pair of pairs) {
    const goldPolicy = pair.policy_label || 'retain';
    let predictedPolicy = 'retain';

    if (pair.relation_label) {
      predictedPolicy = determinePolicyFromRelation(pair.relation_label);
    } else {
      console.warn(`  Pair ${pair.sample_id} lacks relation label! Defaulting to 'retain'.`);
    }

    const isCorrect = predictedPolicy === goldPolicy;
    if (isCorrect) correctCount++;

    policyDetails.push({
      sample_id: pair.sample_id,
      topic: pair.topic,
      relation_label: pair.relation_label,
      gold_policy_label: goldPolicy,
      predicted_policy_label: predictedPolicy,
      is_correct: isCorrect
    });

    pair.policy_label = predictedPolicy;
    console.log(`  Pair ${pair.sample_id}: Relation [${pair.relation_label}] -> Predicted [${predictedPolicy}], Gold [${goldPolicy}] -> ${isCorrect ? 'SUCCESS' : 'FAIL'}`);
  }

  const accuracy = parseFloat((correctCount / pairs.length).toFixed(2));
  const report = {
    total_pairs: pairs.length,
    correct_policies: correctCount,
    accuracy: accuracy,
    details: policyDetails
  };

  const outputPath = path.join(annotationsDir, 'final_evaluation_pairs.json');
  fs.writeFileSync(outputPath, JSON.stringify(pairs, null, 2), 'utf-8');
  console.log(`Successfully saved finalized pairs with policies to ${outputPath}`);

  const reportPath = path.join(resultsDir, 'policy_decision_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Saved policy decision accuracy report to ${reportPath}`);

  const deprecatedKeys: string[] = [];
  for (const pair of pairs) {
    if (pair.policy_label === 'deprecate' || pair.policy_label === 'evict') {
      deprecatedKeys.push(`${pair.lineage_id}-${pair.old_version}`);
    }
  }
  const deprecatedKeysPath = path.join(annotationsDir, 'deprecated_keys.json');
  fs.writeFileSync(deprecatedKeysPath, JSON.stringify({ deprecated_keys: deprecatedKeys }, null, 2), 'utf-8');
  console.log(`Saved deprecated keys artifact to ${deprecatedKeysPath}`);
}

if (require.main === module) {
  main();
}
