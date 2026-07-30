import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = process.env.V5_LOCAL_ACTION_CONFIG_DIR ? path.resolve(process.env.V5_LOCAL_ACTION_CONFIG_DIR) : path.join(EXP, 'data/configs/v5_r2_3_codex_audited_action_detector');
const OUT = process.env.V5_LOCAL_ACTION_OUT_DIR ? path.resolve(process.env.V5_LOCAL_ACTION_OUT_DIR) : path.join(EXP, 'results/v5/r2_3_local_action_detector_development');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

const STOP = new Set('a an and are as at be been being by for from had has have in into is it its of on or that the their them there these they this those to was were when where which while who with'.split(' '));
const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9%<>.-]+/g, ' ').trim().split(/\s+/).filter((token) => token && !STOP.has(token));
const unique = (items: string[]) => new Set(items);
const countMatches = (value: string, patterns: RegExp[]) => patterns.reduce((sum, pattern) => sum + (value.match(pattern)?.length || 0), 0);
const numbers = (value: string) => new Set((value.toLowerCase().match(/\b\d+(?:\.\d+)?(?:\s*(?:%|mg|g|iu|mmol|ounces?|servings?|years?|months?|day))?/g) || []).map((x) => x.replace(/\s+/g, '')));
const intersectionSize = <T>(a: Set<T>, b: Set<T>) => [...a].filter((item) => b.has(item)).length;

export const FEATURE_NAMES = [
  'bias', 'token_jaccard', 'old_token_coverage', 'current_length_ratio',
  'numeric_overlap', 'old_only_numeric', 'current_only_numeric',
  'current_scope_cues', 'current_exception_cues', 'current_replacement_cues',
  'current_detail_cues', 'old_general_rule_cues', 'old_quantitative_cues',
  'current_quantitative_cues', 'modal_overlap', 'lexical_conflict_cues',
] as const;

function features(oldText: string, currentText: string) {
  const oldLower = oldText.toLowerCase(), currentLower = currentText.toLowerCase();
  const oldTokens = unique(words(oldText)), currentTokens = unique(words(currentText));
  const overlap = intersectionSize(oldTokens, currentTokens);
  const union = new Set([...oldTokens, ...currentTokens]).size || 1;
  const oldNums = numbers(oldText), currentNums = numbers(currentText), numericIntersection = intersectionSize(oldNums, currentNums);
  const scope = [/\bstarting at\b/g, /\byounger than\b/g, /\bolder than\b/g, /\bage[s]?\b/g, /\badults?\b/g, /\bchildren\b/g, /\binfants?\b/g, /\bpregnan\w*\b/g];
  const exceptions = [/\bexcept\w*\b/g, /\bif\b/g, /\bunless\b/g, /\bhighly active\b/g, /\bmedical condition\b/g, /\bhealth care professional\b/g, /\brisk\b/g, /\bmutually desired\b/g];
  const replacement = [/\breplace\w*\b/g, /\binstead\b/g, /\bno amount\b/g, /\bnot recommended\b/g, /\bavoid\b/g, /\bfull-fat\b/g, /\blow-fat\b/g];
  const detail = [/\bserving goals?\b/g, /\bper kilogram\b/g, /\bingredient\w*\b/g, /\bexamples?\b/g, /\bincluding\b/g, /\bconsult\b/g, /\bidentify\b/g, /\btextures?\b/g, /\bprepar\w*\b/g];
  const general = [/\ball individuals\b/g, /\bregardless\b/g, /\bonly by\b/g, /\bshould not begin\b/g, /\bcustomiz\w*\b/g, /\bvariety\b/g, /\bat least half\b/g];
  const quantitative = [/\bpercent\b/g, /%/g, /\bper day\b/g, /\bmg\b/g, /\bgrams?\b/g, /\biu\b/g, /\bservings?\b/g, /\bounces?\b/g, /\bkilogram\b/g];
  const modals = ['should', 'recommend', 'limit', 'avoid', 'consume', 'provide', 'introduce', 'continue', 'prioritize'];
  const modalOverlap = modals.filter((word) => oldLower.includes(word) && currentLower.includes(word)).length / modals.length;
  const conflictPairs = [['low-fat', 'full-fat'], ['less than', 'increased'], ['avoid', 'consume'], ['unavailable', 'available']];
  const lexicalConflict = conflictPairs.filter(([a, b]) => (oldLower.includes(a) && currentLower.includes(b)) || (oldLower.includes(b) && currentLower.includes(a))).length;
  return [
    1,
    overlap / union,
    overlap / Math.max(1, oldTokens.size),
    Math.min(4, currentTokens.size / Math.max(1, oldTokens.size)),
    numericIntersection / Math.max(1, new Set([...oldNums, ...currentNums]).size),
    [...oldNums].filter((x) => !currentNums.has(x)).length,
    [...currentNums].filter((x) => !oldNums.has(x)).length,
    countMatches(currentLower, scope), countMatches(currentLower, exceptions), countMatches(currentLower, replacement),
    countMatches(currentLower, detail), countMatches(oldLower, general), countMatches(oldLower, quantitative),
    countMatches(currentLower, quantitative), modalOverlap, lexicalConflict,
  ];
}

type Model = { means: number[]; scales: number[]; weights: number[]; l2: number; positiveWeight: number };
function train(xs: number[][], ys: number[], l2: number, positiveWeight: number): Model {
  const width = xs[0].length, means = Array(width).fill(0), scales = Array(width).fill(1);
  for (let j = 1; j < width; j++) {
    means[j] = xs.reduce((sum, row) => sum + row[j], 0) / xs.length;
    scales[j] = Math.sqrt(xs.reduce((sum, row) => sum + (row[j] - means[j]) ** 2, 0) / xs.length) || 1;
  }
  const standardized = xs.map((row) => row.map((value, j) => j === 0 ? 1 : (value - means[j]) / scales[j]));
  const weights = Array(width).fill(0);
  for (let step = 0; step < 2500; step++) {
    const gradient = Array(width).fill(0);
    for (let i = 0; i < standardized.length; i++) {
      const probability = sigmoid(standardized[i].reduce((sum, value, j) => sum + value * weights[j], 0));
      const sampleWeight = ys[i] ? positiveWeight : 1;
      for (let j = 0; j < width; j++) gradient[j] += sampleWeight * (probability - ys[i]) * standardized[i][j];
    }
    const rate = 0.03 / (1 + step / 1200);
    for (let j = 0; j < width; j++) weights[j] -= rate * (gradient[j] / standardized.length + (j === 0 ? 0 : l2 * weights[j] / standardized.length));
  }
  return { means, scales, weights, l2, positiveWeight };
}
function predict(model: Model, row: number[]) {
  const standardized = row.map((value, j) => j === 0 ? 1 : (value - model.means[j]) / model.scales[j]);
  return sigmoid(standardized.reduce((sum, value, j) => sum + value * model.weights[j], 0));
}
function metrics(ys: number[], scores: number[], threshold: number) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  ys.forEach((gold, i) => { const pred = scores[i] >= threshold ? 1 : 0; if (gold && pred) tp++; else if (!gold && pred) fp++; else if (!gold) tn++; else fn++; });
  return { true_preserve: tp, false_preserve_count: fp, true_block: tn, missed_preserve: fn, accuracy: (tp + tn) / ys.length, pair_preserve_precision: tp + fp ? tp / (tp + fp) : 0, pair_preserve_recall: tp + fn ? tp / (tp + fn) : 0 };
}

const [devText, manifestText, guardText] = await Promise.all([
  readFile(path.join(CONFIG, 'development.jsonl'), 'utf8'), readFile(path.join(CONFIG, 'SPLIT_MANIFEST.json'), 'utf8'), readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8'),
]);
const manifest = JSON.parse(manifestText), guard = JSON.parse(guardText);
if (guard.status !== 'development_unlocked_local_detector_only' || guard.development_selection_complete || guard.external_gemini_or_gemma_calls_allowed || sha256(devText) !== manifest.development_sha256) throw new Error('R2.3 local Development guard failed');
const rows = parseJsonl(devText), xs = rows.map((row: any) => features(row.old_evidence.atomic_claim_text || row.old_evidence.text, row.current_evidence.atomic_claim_text || row.current_evidence.text)), ys = rows.map((row: any) => row.action_label === 'PAIR_PRESERVE' ? 1 : 0);
const candidates: any[] = [];
for (const l2 of [0.01, 0.1, 0.5, 1, 2]) for (const positiveWeight of [1, 1.5, 2, 3]) {
  const scores = rows.map((row: any, heldOut: number) => {
    const heldOutGroup = row.lineage_group || row.source_pair_id || row.pair_id;
    const trainIndexes = rows.map((candidate: any, i: number) => ({ i, group: candidate.lineage_group || candidate.source_pair_id || candidate.pair_id })).filter((item: any) => item.group !== heldOutGroup).map((item: any) => item.i);
    const trainXs = trainIndexes.map((i: number) => xs[i]), trainYs = trainIndexes.map((i: number) => ys[i]);
    return predict(train(trainXs, trainYs, l2, positiveWeight), xs[heldOut]);
  });
  const thresholds = [...new Set([0.5, ...scores.map((score) => Math.max(0, Math.min(1, score + 1e-9)))])].sort((a, b) => a - b);
  for (const threshold of thresholds) candidates.push({ l2, positive_weight: positiveWeight, threshold, metrics: metrics(ys, scores, threshold), scores });
}
const eligible = candidates.filter((candidate) => candidate.metrics.false_preserve_count === 0 && candidate.metrics.pair_preserve_precision === 1 && candidate.metrics.pair_preserve_recall >= 0.5);
eligible.sort((a, b) => b.metrics.pair_preserve_recall - a.metrics.pair_preserve_recall || b.metrics.accuracy - a.metrics.accuracy || a.l2 - b.l2 || a.positive_weight - b.positive_weight);
const selected = eligible[0] || null;
const bestSafe = candidates.filter((candidate) => candidate.metrics.false_preserve_count === 0).sort((a, b) => b.metrics.pair_preserve_recall - a.metrics.pair_preserve_recall || b.metrics.accuracy - a.metrics.accuracy)[0];
const frozenModel = selected ? train(xs, ys, selected.l2, selected.positive_weight) : null;
const report = {
  status: selected ? 'local_detector_selected_validation_unlock_eligible' : 'blocked_no_safe_local_detector',
  development_only: true, validation_file_read: false, external_model_api_used: false,
  feature_contract: 'old_text_and_current_text_only', forbidden_runtime_features: ['pair_id', 'topic', 'relation_type', 'action_label', 'judgments', 'validation_data'],
  evaluation: 'leave_one_lineage_group_out_out_of_fold', development_count: rows.length, lineage_group_count: new Set(rows.map((row: any) => row.lineage_group || row.source_pair_id || row.pair_id)).size, positive_count: ys.filter(Boolean).length, negative_count: ys.filter((x) => !x).length,
  gate: 'false_preserve_count=0, precision=1, recall>=0.5', selected_config: selected ? { l2: selected.l2, positive_weight: selected.positive_weight, threshold: selected.threshold, metrics: selected.metrics } : null,
  best_zero_false_preserve_config: { l2: bestSafe.l2, positive_weight: bestSafe.positive_weight, threshold: bestSafe.threshold, metrics: bestSafe.metrics },
  feature_names: FEATURE_NAMES, frozen_model: frozenModel,
  out_of_fold_predictions: rows.map((row: any, i: number) => ({ pair_id: row.pair_id, gold: row.action_label, score: (selected || bestSafe).scores[i], predicted: (selected || bestSafe).scores[i] >= (selected || bestSafe).threshold ? 'PAIR_PRESERVE' : 'BLOCK_RETAINED' })),
};
await mkdir(OUT, { recursive: true });
const reportText = JSON.stringify(report, null, 2) + '\n';
await writeFile(path.join(OUT, 'DEVELOPMENT_SELECTION.json'), reportText, 'utf8');
await writeFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), JSON.stringify({ ...guard,
  status: selected ? 'local_development_selection_frozen_validation_unlocked' : 'blocked_no_safe_local_detector',
  development_selection_complete: true, selected_config: selected ? 'local_logistic_text_features' : null,
  development_selection_sha256: sha256(reportText), validation_execution_count: 0,
}, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ status: report.status, selected_config: report.selected_config, best_zero_false_preserve_config: report.best_zero_false_preserve_config }, null, 2));
