import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = path.join(EXP, 'data/configs/v5_r2_7_preaudited_cross_version');
const DEV = path.join(EXP, 'results/v5/r2_7_temporal_intent_development/DEVELOPMENT_SELECTION.json');
const OUT = path.join(EXP, 'results/v5/r2_7_temporal_intent_validation');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const DETECTOR_ID = 'explicit_temporal_history_intent_v1';
const patterns = [
  /\b2003\b/i,
  /\bhistorical(?:ly)?\b/i,
  /\bprevious(?:ly)?\b/i,
  /\bearlier\b/i,
  /\bformerly\b/i,
  /\bhow did\b.{0,100}\bchange\b/i,
  /\bfrom\b.{0,100}\bto (?:the )?current\b/i,
];
const predictAction = (query: string) => patterns.some((pattern) => pattern.test(query)) ? 'PAIR_PRESERVE' : 'BLOCK_RETAINED';

// Read and validate the guard and frozen Development selection before opening Validation.
const guardText = await readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8');
const manifestText = await readFile(path.join(CONFIG, 'SPLIT_MANIFEST.json'), 'utf8');
const devText = await readFile(DEV, 'utf8');
const guard = JSON.parse(guardText), manifest = JSON.parse(manifestText), dev = JSON.parse(devText);
if (
  guard.status !== 'r2_7_temporal_intent_frozen_validation_unlocked'
  || !guard.development_selection_complete
  || guard.validation_execution_count !== 0
  || guard.selected_config !== DETECTOR_ID
  || guard.development_selection_sha256 !== sha256(devText)
  || dev.status !== 'development_gate_passed_validation_unlock_eligible'
  || dev.detector_id !== DETECTOR_ID
) throw new Error('R2.7 Validation remains locked');

const validationText = await readFile(path.join(CONFIG, 'validation.sealed.jsonl'), 'utf8');
if (sha256(validationText) !== manifest.validation_sealed_sha256) throw new Error('R2.7 sealed Validation checksum mismatch');
const rows = parseJsonl(validationText);
let tp = 0, fp = 0, tn = 0, fn = 0;
const predictions = rows.map((row: any) => {
  const predicted = predictAction(row.query.text);
  if (row.action_label === 'PAIR_PRESERVE' && predicted === 'PAIR_PRESERVE') tp++;
  else if (row.action_label === 'BLOCK_RETAINED' && predicted === 'PAIR_PRESERVE') fp++;
  else if (row.action_label === 'BLOCK_RETAINED') tn++;
  else fn++;
  return { pair_id: row.pair_id, lineage_group: row.lineage_group, query: row.query.text, gold: row.action_label, predicted };
});
const metrics = {
  true_preserve: tp, false_preserve_count: fp, true_block: tn, missed_preserve: fn,
  accuracy: (tp + tn) / rows.length,
  pair_preserve_precision: tp + fp ? tp / (tp + fp) : 0,
  pair_preserve_recall: tp + fn ? tp / (tp + fn) : 0,
};
const passed = metrics.false_preserve_count === 0 && metrics.pair_preserve_precision === 1 && metrics.pair_preserve_recall >= 0.5;
const report = {
  schema_version: 'v5-r2.7-temporal-intent-validation-1',
  status: passed ? 'validation_confirmed_for_explicit_historical_intent_only' : 'validation_failed_locked_no_retuning',
  one_shot_validation: true,
  validation_execution_count: 1,
  external_model_api_used: false,
  detector_id: DETECTOR_ID,
  metrics,
  predictions,
  promotion_scope: passed ? 'explicit_historical_intent_routing_only' : 'none',
  prohibited_claims: [
    'general semantic conditional-merge detector is validated',
    'overall Version-Aware retrieval is superior to Recency',
    'fresh held-out V5 test evidence',
  ],
  limitation: 'The Validation set was authored and pre-audited by the same Codex reviewer as Development; it is lineage-disjoint but not independently authored or blinded.',
};
await mkdir(OUT, { recursive: true });
const reportText = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(path.join(OUT, 'VALIDATION_RESULT.json'), reportText, 'utf8');
await writeFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), `${JSON.stringify({
  ...guard,
  status: passed ? 'r2_7_validation_confirmed_scope_limited_locked' : 'r2_7_validation_failed_locked_no_retuning',
  validation_execution_count: 1,
  validation_result_sha256: sha256(reportText),
  tuning_after_validation_allowed: false,
  fresh_v5_test_created: false,
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, metrics: report.metrics, promotion_scope: report.promotion_scope }, null, 2));
