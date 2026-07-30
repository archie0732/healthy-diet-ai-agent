import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = path.join(EXP, 'data/configs/v5_r2_7_preaudited_cross_version');
const OUT = path.join(EXP, 'results/v5/r2_7_temporal_intent_development');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

export const DETECTOR_ID = 'explicit_temporal_history_intent_v1';
export const HISTORY_PATTERNS = [
  '\\b2003\\b',
  '\\bhistorical(?:ly)?\\b',
  '\\bprevious(?:ly)?\\b',
  '\\bearlier\\b',
  '\\bformerly\\b',
  '\\bhow did\\b.{0,100}\\bchange\\b',
  '\\bfrom\\b.{0,100}\\bto (?:the )?current\\b',
] as const;
const compiledPatterns = HISTORY_PATTERNS.map((pattern) => new RegExp(pattern, 'i'));
export const predictAction = (query: string) =>
  compiledPatterns.some((pattern) => pattern.test(query)) ? 'PAIR_PRESERVE' : 'BLOCK_RETAINED';

function metrics(rows: any[]) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  const predictions = rows.map((row) => {
    const predicted = predictAction(row.query.text);
    if (row.action_label === 'PAIR_PRESERVE' && predicted === 'PAIR_PRESERVE') tp++;
    else if (row.action_label === 'BLOCK_RETAINED' && predicted === 'PAIR_PRESERVE') fp++;
    else if (row.action_label === 'BLOCK_RETAINED') tn++;
    else fn++;
    return { pair_id: row.pair_id, lineage_group: row.lineage_group, query: row.query.text, gold: row.action_label, predicted };
  });
  return {
    predictions,
    summary: {
      true_preserve: tp, false_preserve_count: fp, true_block: tn, missed_preserve: fn,
      accuracy: (tp + tn) / rows.length,
      pair_preserve_precision: tp + fp ? tp / (tp + fp) : 0,
      pair_preserve_recall: tp + fn ? tp / (tp + fn) : 0,
    },
  };
}

const devText = await readFile(path.join(CONFIG, 'development.jsonl'), 'utf8');
const manifestText = await readFile(path.join(CONFIG, 'SPLIT_MANIFEST.json'), 'utf8');
const guardText = await readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8');
const manifest = JSON.parse(manifestText), guard = JSON.parse(guardText);
if (
  guard.status !== 'r2_7_development_unlocked_local_only'
  || !guard.pre_model_gold_audit_complete
  || guard.development_selection_complete
  || guard.validation_execution_count !== 0
  || guard.external_model_api_allowed
  || sha256(devText) !== manifest.development_sha256
) throw new Error('R2.7 Development guard failed');

// This program deliberately never opens validation.sealed.jsonl.
const rows = parseJsonl(devText);
const evaluation = metrics(rows);
const passed =
  evaluation.summary.false_preserve_count === 0
  && evaluation.summary.pair_preserve_precision === 1
  && evaluation.summary.pair_preserve_recall >= 0.5;
const positiveHasCue = rows.filter((row: any) => row.action_label === 'PAIR_PRESERVE').every((row: any) => predictAction(row.query.text) === 'PAIR_PRESERVE');
const negativeHasNoCue = rows.filter((row: any) => row.action_label === 'BLOCK_RETAINED').every((row: any) => predictAction(row.query.text) === 'BLOCK_RETAINED');
const report = {
  schema_version: 'v5-r2.7-temporal-intent-development-1',
  status: passed ? 'development_gate_passed_validation_unlock_eligible' : 'blocked_development_gate_failed',
  development_only: true,
  validation_file_read: false,
  validation_execution_count: 0,
  external_model_api_used: false,
  detector_id: DETECTOR_ID,
  detector_type: 'deterministic_explicit_temporal_intent_router',
  runtime_feature_contract: 'query_text_only',
  forbidden_runtime_features: ['pair_id', 'lineage_group', 'topic', 'relation_type', 'action_label', 'judgments', 'old_evidence', 'current_evidence', 'validation_data'],
  frozen_patterns: HISTORY_PATTERNS,
  gate: { false_preserve_count: 0, pair_preserve_precision: 1, minimum_pair_preserve_recall: 0.5 },
  metrics: evaluation.summary,
  predictions: evaluation.predictions,
  lexical_separation_audit: {
    every_development_positive_has_explicit_history_cue: positiveHasCue,
    every_development_negative_lacks_explicit_history_cue: negativeHasNoCue,
    perfect_temporal_cue_label_separation: positiveHasCue && negativeHasNoCue,
    limitation: 'This cycle tests explicit historical-intent routing, not general semantic conditional-merge detection.',
  },
};
await mkdir(OUT, { recursive: true });
const reportText = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(path.join(OUT, 'DEVELOPMENT_SELECTION.json'), reportText, 'utf8');
await writeFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), `${JSON.stringify({
  ...guard,
  status: passed ? 'r2_7_temporal_intent_frozen_validation_unlocked' : 'r2_7_blocked_development_gate_failed',
  development_selection_complete: true,
  selected_config: passed ? DETECTOR_ID : null,
  development_selection_sha256: sha256(reportText),
  validation_execution_count: 0,
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, metrics: report.metrics, lexical_separation_audit: report.lexical_separation_audit }, null, 2));
