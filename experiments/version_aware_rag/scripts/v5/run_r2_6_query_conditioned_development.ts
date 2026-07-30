import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = path.join(EXP, 'data/configs/v5_r2_6_query_conditioned_action_detector');
const OUT = path.join(EXP, 'results/v5/r2_6_query_conditioned_development');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

const STOP = new Set(
  'a an and are as at be been being by can do does for from had has have how if in into is it its of on or should that the their them there these they this those to was were what when where which while who with'.split(' '),
);
const normalizeToken = (token: string) => {
  let value = token.toLowerCase();
  const aliases: Record<string, string> = {
    fatty: 'fat', fats: 'fat', sugars: 'sugar', grains: 'grain', foods: 'food',
    children: 'child', adults: 'adult', people: 'person', persons: 'person',
    recommendations: 'recommend', recommended: 'recommend', recommendation: 'recommend',
    limitations: 'limit', limiting: 'limit', limits: 'limit',
    applies: 'apply', applied: 'apply', applying: 'apply',
    servings: 'serving', beverages: 'beverage', vegetables: 'vegetable',
    fruits: 'fruit', carbohydrates: 'carbohydrate', conditions: 'condition',
  };
  if (aliases[value]) return aliases[value];
  if (value.length > 5 && value.endsWith('ies')) value = `${value.slice(0, -3)}y`;
  else if (value.length > 5 && value.endsWith('ing')) value = value.slice(0, -3);
  else if (value.length > 4 && value.endsWith('ed')) value = value.slice(0, -2);
  else if (value.length > 4 && value.endsWith('s')) value = value.slice(0, -1);
  return value;
};
const tokens = (value: string) => new Set(
  value.toLowerCase().replace(/[^a-z0-9%<>.-]+/g, ' ').trim().split(/\s+/)
    .filter((token) => token && !STOP.has(token)).map(normalizeToken),
);
const charNgrams = (value: string, n = 4) => {
  const compact = ` ${value.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  return new Set(Array.from({ length: Math.max(0, compact.length - n + 1) }, (_, index) => compact.slice(index, index + n)));
};
const numbers = (value: string) => new Set(
  (value.toLowerCase().match(/\b\d+(?:\.\d+)?(?:\s*(?:%|percent|mg|milligrams?|g|grams?|years?|months?|day))?/g) || [])
    .map((item) => item.replace(/\s+/g, '').replace('milligrams', 'mg').replace('milligram', 'mg').replace('grams', 'g').replace('gram', 'g').replace('percent', '%')),
);
const intersectionSize = <T>(a: Set<T>, b: Set<T>) => [...a].filter((item) => b.has(item)).length;
const difference = <T>(a: Set<T>, b: Set<T>) => new Set([...a].filter((item) => !b.has(item)));
const overlap = <T>(a: Set<T>, b: Set<T>) => intersectionSize(a, b) / Math.max(1, new Set([...a, ...b]).size);
const coverage = <T>(needles: Set<T>, haystack: Set<T>) => intersectionSize(needles, haystack) / Math.max(1, needles.size);
const countMatches = (value: string, patterns: RegExp[]) => patterns.reduce((sum, pattern) => sum + (value.match(pattern)?.length || 0), 0);

export const FEATURE_NAMES = [
  'bias',
  'query_old_token_jaccard', 'query_current_token_jaccard',
  'query_old_coverage', 'query_current_coverage',
  'query_old_minus_current_relevance', 'query_current_minus_old_relevance',
  'query_old_unique_coverage', 'query_current_unique_coverage',
  'query_old_unique_count', 'query_current_unique_count',
  'query_relevant_old_unique_fraction', 'query_relevant_current_unique_fraction',
  'query_old_char4_jaccard', 'query_current_char4_jaccard',
  'query_old_char_advantage', 'query_current_char_advantage',
  'query_old_numeric_coverage', 'query_current_numeric_coverage',
  'old_current_token_jaccard', 'old_covered_by_current', 'current_covered_by_old',
  'old_unique_fraction', 'current_unique_fraction',
  'query_two_part_cues', 'query_exception_scope_cues', 'query_history_cues',
  'old_exception_scope_cues', 'current_exception_scope_cues',
  'current_covers_all_query_relevant_old_tokens',
] as const;

export function extractFeatures(queryText: string, oldText: string, currentText: string) {
  const query = tokens(queryText), old = tokens(oldText), current = tokens(currentText);
  const oldOnly = difference(old, current), currentOnly = difference(current, old);
  const queryOldUnique = intersectionSize(query, oldOnly), queryCurrentUnique = intersectionSize(query, currentOnly);
  const queryOldJaccard = overlap(query, old), queryCurrentJaccard = overlap(query, current);
  const queryOldCoverage = coverage(query, old), queryCurrentCoverage = coverage(query, current);
  const query4 = charNgrams(queryText), old4 = charNgrams(oldText), current4 = charNgrams(currentText);
  const queryOldChar = overlap(query4, old4), queryCurrentChar = overlap(query4, current4);
  const queryNumbers = numbers(queryText), oldNumbers = numbers(oldText), currentNumbers = numbers(currentText);
  const exceptionScope = [
    /\bexcept\w*\b/g, /\bunless\b/g, /\bwho\b/g, /\bwhich (?:people|person|group|population|condition)/g,
    /\bcondition\w*\b/g, /\bclinical\b/g, /\bsafe\w*\b/g, /\bapplicab\w*\b/g,
    /\bpregnan\w*\b/g, /\btherapeutic\b/g, /\bchronic\b/g, /\bhighly active\b/g,
    /\bage[- ]specific\b/g, /\bchildren\b/g, /\badults?\b/g,
  ];
  const twoPart = [/\band\b/g, /\balso\b/g, /\bboth\b/g, /\bwhile\b/g, /,/g, /;/g];
  const history = [/\bprevious\w*\b/g, /\bhistor\w*\b/g, /\bolder\b/g, /\bretained\b/g, /\bchanged\b/g, /\bused to\b/g];
  const queryRelevantOld = intersectionSize(query, old);
  return [
    1,
    queryOldJaccard, queryCurrentJaccard,
    queryOldCoverage, queryCurrentCoverage,
    Math.max(0, queryOldJaccard - queryCurrentJaccard), Math.max(0, queryCurrentJaccard - queryOldJaccard),
    coverage(query, oldOnly), coverage(query, currentOnly),
    queryOldUnique, queryCurrentUnique,
    queryOldUnique / Math.max(1, queryRelevantOld), queryCurrentUnique / Math.max(1, intersectionSize(query, current)),
    queryOldChar, queryCurrentChar,
    Math.max(0, queryOldChar - queryCurrentChar), Math.max(0, queryCurrentChar - queryOldChar),
    coverage(queryNumbers, oldNumbers), coverage(queryNumbers, currentNumbers),
    overlap(old, current), coverage(old, current), coverage(current, old),
    oldOnly.size / Math.max(1, old.size), currentOnly.size / Math.max(1, current.size),
    countMatches(queryText.toLowerCase(), twoPart), countMatches(queryText.toLowerCase(), exceptionScope), countMatches(queryText.toLowerCase(), history),
    countMatches(oldText.toLowerCase(), exceptionScope), countMatches(currentText.toLowerCase(), exceptionScope),
    queryOldUnique === 0 ? 1 : 0,
  ];
}

type LogisticModel = { kind: 'logistic'; means: number[]; scales: number[]; weights: number[]; l2: number; positive_weight: number };
function trainLogistic(xs: number[][], ys: number[], l2: number, positiveWeight: number): LogisticModel {
  const width = xs[0].length;
  const means = Array(width).fill(0), scales = Array(width).fill(1);
  for (let column = 1; column < width; column++) {
    means[column] = xs.reduce((sum, row) => sum + row[column], 0) / xs.length;
    scales[column] = Math.sqrt(xs.reduce((sum, row) => sum + (row[column] - means[column]) ** 2, 0) / xs.length) || 1;
  }
  const standardized = xs.map((row) => row.map((value, column) => column === 0 ? 1 : (value - means[column]) / scales[column]));
  const weights = Array(width).fill(0);
  for (let step = 0; step < 3000; step++) {
    const gradient = Array(width).fill(0);
    for (let rowIndex = 0; rowIndex < standardized.length; rowIndex++) {
      const probability = sigmoid(standardized[rowIndex].reduce((sum, value, column) => sum + value * weights[column], 0));
      const sampleWeight = ys[rowIndex] ? positiveWeight : 1;
      for (let column = 0; column < width; column++) gradient[column] += sampleWeight * (probability - ys[rowIndex]) * standardized[rowIndex][column];
    }
    const rate = 0.025 / (1 + step / 1400);
    for (let column = 0; column < width; column++) {
      weights[column] -= rate * (gradient[column] / standardized.length + (column === 0 ? 0 : l2 * weights[column] / standardized.length));
    }
  }
  return { kind: 'logistic', means, scales, weights, l2, positive_weight: positiveWeight };
}
function predictLogistic(model: LogisticModel, row: number[]) {
  const standardized = row.map((value, column) => column === 0 ? 1 : (value - model.means[column]) / model.scales[column]);
  return sigmoid(standardized.reduce((sum, value, column) => sum + value * model.weights[column], 0));
}

type Tree = { probability: number; count: number; feature?: number; threshold?: number; left?: Tree; right?: Tree };
const gini = (ys: number[]) => {
  if (!ys.length) return 0;
  const positive = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  return 2 * positive * (1 - positive);
};
function trainTree(xs: number[][], ys: number[], depth: number, minLeaf: number): Tree {
  const node: Tree = { probability: ys.reduce((sum, value) => sum + value, 0) / ys.length, count: ys.length };
  if (depth === 0 || gini(ys) === 0 || ys.length < minLeaf * 2) return node;
  let best: { feature: number; threshold: number; left: number[]; right: number[]; loss: number } | null = null;
  for (let feature = 1; feature < xs[0].length; feature++) {
    const values = [...new Set(xs.map((row) => row[feature]))].sort((a, b) => a - b);
    for (let index = 0; index < values.length - 1; index++) {
      const threshold = (values[index] + values[index + 1]) / 2;
      const left = xs.map((row, rowIndex) => row[feature] <= threshold ? rowIndex : -1).filter((rowIndex) => rowIndex >= 0);
      const right = xs.map((row, rowIndex) => row[feature] > threshold ? rowIndex : -1).filter((rowIndex) => rowIndex >= 0);
      if (left.length < minLeaf || right.length < minLeaf) continue;
      const loss = (left.length * gini(left.map((rowIndex) => ys[rowIndex])) + right.length * gini(right.map((rowIndex) => ys[rowIndex]))) / ys.length;
      if (!best || loss < best.loss || (loss === best.loss && feature < best.feature)) best = { feature, threshold, left, right, loss };
    }
  }
  if (!best) return node;
  node.feature = best.feature;
  node.threshold = best.threshold;
  node.left = trainTree(best.left.map((index) => xs[index]), best.left.map((index) => ys[index]), depth - 1, minLeaf);
  node.right = trainTree(best.right.map((index) => xs[index]), best.right.map((index) => ys[index]), depth - 1, minLeaf);
  return node;
}
function predictTree(tree: Tree, row: number[]): number {
  if (tree.feature === undefined) return tree.probability;
  return predictTree(row[tree.feature] <= tree.threshold! ? tree.left! : tree.right!, row);
}

function metrics(ys: number[], scores: number[], threshold: number) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  ys.forEach((gold, index) => {
    const predicted = scores[index] >= threshold ? 1 : 0;
    if (gold && predicted) tp++;
    else if (!gold && predicted) fp++;
    else if (!gold) tn++;
    else fn++;
  });
  return {
    true_preserve: tp, false_preserve_count: fp, true_block: tn, missed_preserve: fn,
    accuracy: (tp + tn) / ys.length,
    pair_preserve_precision: tp + fp ? tp / (tp + fp) : 0,
    pair_preserve_recall: tp + fn ? tp / (tp + fn) : 0,
  };
}

const devText = await readFile(path.join(CONFIG, 'development.jsonl'), 'utf8');
const manifestText = await readFile(path.join(CONFIG, 'SPLIT_MANIFEST.json'), 'utf8');
const guardText = await readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8');
const manifest = JSON.parse(manifestText), guard = JSON.parse(guardText);
if (
  guard.status !== 'query_conditioned_development_unlocked_local_only'
  || guard.development_selection_complete
  || guard.validation_execution_count !== 0
  || guard.external_model_api_allowed
  || sha256(devText) !== manifest.development_sha256
) throw new Error('R2.6 query-conditioned Development guard failed');

// Deliberately do not open validation.jsonl anywhere in this Development program.
const rows = parseJsonl(devText);
const xs = rows.map((row: any) => extractFeatures(
  row.query.text,
  row.old_evidence.atomic_claim_text || row.old_evidence.text,
  row.current_evidence.atomic_claim_text || row.current_evidence.text,
));
const ys = rows.map((row: any) => row.action_label === 'PAIR_PRESERVE' ? 1 : 0);
const groups = rows.map((row: any) => row.lineage_group);
const candidates: any[] = [];
const trainingIndexesFor = (heldOut: number) => groups.map((group: string, index: number) => group !== groups[heldOut] ? index : -1).filter((index: number) => index >= 0);

for (const l2 of [0.01, 0.1, 0.5, 1, 2, 5]) for (const positiveWeight of [0.75, 1, 1.5, 2, 3]) {
  const scores = rows.map((_: any, heldOut: number) => {
    const indexes = trainingIndexesFor(heldOut);
    return predictLogistic(trainLogistic(indexes.map((index: number) => xs[index]), indexes.map((index: number) => ys[index]), l2, positiveWeight), xs[heldOut]);
  });
  const thresholds = [...new Set([0.5, ...scores.map((score: number) => Math.min(1, score + 1e-9))])].sort((a, b) => a - b);
  for (const threshold of thresholds) candidates.push({
    family: 'logistic', config: { l2, positive_weight: positiveWeight }, threshold,
    metrics: metrics(ys, scores, threshold), scores,
  });
}
for (const maxDepth of [1, 2, 3, 4]) for (const minLeaf of [2, 3, 4, 5]) {
  const scores = rows.map((_: any, heldOut: number) => {
    const indexes = trainingIndexesFor(heldOut);
    return predictTree(trainTree(indexes.map((index: number) => xs[index]), indexes.map((index: number) => ys[index]), maxDepth, minLeaf), xs[heldOut]);
  });
  const thresholds = [...new Set([0.5, ...scores.map((score: number) => Math.min(1, score + 1e-9))])].sort((a, b) => a - b);
  for (const threshold of thresholds) candidates.push({
    family: 'bounded_tree', config: { max_depth: maxDepth, min_leaf: minLeaf }, threshold,
    metrics: metrics(ys, scores, threshold), scores,
  });
}
// Transparent, training-free query-necessity scores. These test the endpoint's
// central hypothesis directly: OLD is useful only when QUERY mentions content
// carried uniquely by OLD. Thresholds are still selected on Development only.
const queryNecessityScores = [
  {
    name: 'old_unique_query_coverage',
    scores: xs.map((row) => row[7]),
  },
  {
    name: 'old_unique_query_fraction',
    scores: xs.map((row) => row[11]),
  },
  {
    name: 'old_unique_coverage_times_current_relevance',
    scores: xs.map((row) => row[7] * row[4]),
  },
  {
    name: 'old_unique_fraction_times_current_relevance',
    scores: xs.map((row) => row[11] * row[4]),
  },
  {
    name: 'old_unique_coverage_plus_lexical_advantage',
    scores: xs.map((row) => row[7] + row[5] + row[15]),
  },
];
for (const rule of queryNecessityScores) {
  const thresholds = [...new Set([0.05, 0.1, 0.15, 0.2, 0.25, 0.33, 0.5, ...rule.scores.map((score) => score + 1e-9)])].sort((a, b) => a - b);
  for (const threshold of thresholds) candidates.push({
    family: 'query_necessity_rule',
    config: { score: rule.name },
    threshold,
    metrics: metrics(ys, rule.scores, threshold),
    scores: rule.scores,
  });
}

const rank = (a: any, b: any) =>
  b.metrics.pair_preserve_recall - a.metrics.pair_preserve_recall
  || b.metrics.accuracy - a.metrics.accuracy
  || (a.family === 'logistic' ? -1 : 1);
const eligible = candidates.filter((candidate) =>
  candidate.metrics.false_preserve_count === 0
  && candidate.metrics.pair_preserve_precision === 1
  && candidate.metrics.pair_preserve_recall >= 0.5,
).sort(rank);
const safe = candidates.filter((candidate) => candidate.metrics.false_preserve_count === 0).sort(rank);
const selected = eligible[0] || null;
const diagnostic = selected || safe[0];
const frozenModel = selected?.family === 'logistic'
  ? trainLogistic(xs, ys, selected.config.l2, selected.config.positive_weight)
  : selected?.family === 'bounded_tree'
    ? { kind: 'bounded_tree', tree: trainTree(xs, ys, selected.config.max_depth, selected.config.min_leaf) }
    : null;
const selectedSummary = selected ? { family: selected.family, ...selected.config, threshold: selected.threshold, metrics: selected.metrics } : null;
const diagnosticSummary = { family: diagnostic.family, ...diagnostic.config, threshold: diagnostic.threshold, metrics: diagnostic.metrics };
const report = {
  schema_version: 'v5-r2.6-query-conditioned-development-1',
  status: selected ? 'query_conditioned_detector_selected_validation_unlock_eligible' : 'blocked_no_safe_query_conditioned_detector',
  endpoint: manifest.endpoint,
  development_only: true,
  validation_file_read: false,
  validation_execution_count: 0,
  external_model_api_used: false,
  feature_contract: 'query_text_plus_atomic_old_text_plus_atomic_current_text_only',
  forbidden_runtime_features: ['pair_id', 'source_pair_id', 'lineage_group', 'topic', 'scope_tags', 'relation_type', 'action_label', 'judgments', 'reviewer_rationale', 'validation_data'],
  evaluation: 'leave_one_lineage_group_out_out_of_fold',
  development_count: rows.length,
  lineage_group_count: new Set(groups).size,
  positive_count: ys.filter(Boolean).length,
  negative_count: ys.filter((value: number) => !value).length,
  gate: { false_preserve_count: 0, pair_preserve_precision: 1, minimum_pair_preserve_recall: 0.5 },
  candidate_families: ['logistic', 'bounded_tree', 'query_necessity_rule'],
  selected_config: selectedSummary,
  best_zero_false_preserve_config: diagnosticSummary,
  feature_names: FEATURE_NAMES,
  frozen_model: frozenModel,
  out_of_fold_predictions: rows.map((row: any, index: number) => ({
    pair_id: row.pair_id,
    lineage_group: row.lineage_group,
    gold: row.action_label,
    score: diagnostic.scores[index],
    predicted: diagnostic.scores[index] >= diagnostic.threshold ? 'PAIR_PRESERVE' : 'BLOCK_RETAINED',
  })),
};
await mkdir(OUT, { recursive: true });
const reportText = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(path.join(OUT, 'DEVELOPMENT_SELECTION.json'), reportText, 'utf8');
await writeFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), `${JSON.stringify({
  ...guard,
  status: selected ? 'query_conditioned_development_frozen_validation_unlocked' : 'blocked_no_safe_query_conditioned_detector',
  development_selection_complete: true,
  selected_config: selected ? `query_conditioned_${selected.family}` : null,
  development_selection_sha256: sha256(reportText),
  validation_execution_count: 0,
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  selected_config: selectedSummary,
  best_zero_false_preserve_config: diagnosticSummary,
  validation_file_read: false,
  external_model_api_used: false,
}, null, 2));
