import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const PROVISIONAL = path.join(EXP, 'data/annotations_v4/validation_safety_codex_provisional/safety_review_ledger.jsonl');
const APPROVED_DIR = path.join(EXP, 'data/annotations_v4/validation_safety_user_approved');
const RESULT_DIR = path.join(EXP, 'results/v4/validation_confirmation');
const RESULT_PATH = path.join(RESULT_DIR, 'VALIDATION_CONFIRMATION.json');
const MANIFEST_PATH = path.join(EXP, 'data/configs/v4_validation_frozen/FREEZE_MANIFEST.json');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const [provisionalText, resultText, manifestText, rawText] = await Promise.all([
  readFile(PROVISIONAL, 'utf8'), readFile(RESULT_PATH, 'utf8'), readFile(MANIFEST_PATH, 'utf8'),
  readFile(path.join(RESULT_DIR, 'raw_retrieval_results.jsonl'), 'utf8'),
]);
const provisional = parseJsonl(provisionalText), result = JSON.parse(resultText), manifest = JSON.parse(manifestText), raw = parseJsonl(rawText);
if (provisional.length !== 40) throw new Error(`Expected 40 safety rows, found ${provisional.length}.`);
if (manifest.validation_execution_count_completed !== 1 || manifest.validation_execution_status !== 'completed') throw new Error('Validation execution guard is not in the completed state.');
if (raw.length !== 16) throw new Error(`Expected 16 validation result rows, found ${raw.length}.`);
if (!result.effectiveness_gate_passed) throw new Error('Effectiveness gate did not pass.');
if (provisional.some((row) => !['citation_safe', 'neither', 'stale', 'forbidden'].includes(row.reviewer_label))) throw new Error('Invalid provisional label.');

const approved = provisional.map((row) => ({ ...row, review_status: 'user_approved', owner_reviewer_id: 'project_owner_user', owner_reviewer_type: 'human_project_owner', owner_decision: 'accept_current_provisional_label', owner_signoff_date: '2026-07-22', owner_signoff_statement: '全部同意', independent_blinded_or_clinical_review: false }));
const approvedText = approved.map((row) => JSON.stringify(row)).join('\n') + '\n';
await mkdir(APPROVED_DIR, { recursive: true });
await writeFile(path.join(APPROVED_DIR, 'safety_review_ledger.jsonl'), approvedText, 'utf8');
const signoff = {
  status: 'project_owner_approved', owner_statement: '全部同意', owner_signoff_date: '2026-07-22',
  scope: 'All 40 Codex-provisional validation safety labels, including seven neither decisions, without modification.',
  limitation: 'Project-owner confirmation is not independent blinded or clinical review.',
  provisional_ledger_sha256: sha256(provisionalText), approved_ledger_sha256: sha256(approvedText),
  counts: Object.fromEntries(['citation_safe', 'neither', 'stale', 'forbidden'].map((label) => [label, approved.filter((row) => row.reviewer_label === label).length])),
};
await writeFile(path.join(APPROVED_DIR, 'project_owner_signoff.json'), `${JSON.stringify(signoff, null, 2)}\n`, 'utf8');
await writeFile(path.join(RESULT_DIR, 'SAFETY_OWNER_SIGNOFF.md'), `# Validation Safety Owner Signoff\n\nProject owner approved all 40 provisional labels on 2026-07-22 with the statement: **全部同意**.\n\nThis is workflow signoff, not independent blinded or clinical review.\n\nApproved ledger SHA-256: \`${signoff.approved_ledger_sha256}\`.\n`, 'utf8');

const safetyPass = result.provisional_safety_metrics.oracle_cross_0_5.stale_or_forbidden_hit_rate_at_3 <= result.provisional_safety_metrics.recency.stale_or_forbidden_hit_rate_at_3;
result.safety_gate_status = 'project_owner_approved_pass';
result.safety_gate_passed = safetyPass;
result.full_validation_promotion_gate_passed = result.effectiveness_gate_passed && safetyPass;
result.validation_safety_approved_ledger_sha256 = sha256(approvedText);
result.independent_blinded_or_clinical_review = false;
result.fresh_test_execution_allowed = false;
await writeFile(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

const finalManifest = {
  ...manifest,
  validation_safety_status: 'project_owner_approved',
  validation_safety_approved_ledger_sha256: sha256(approvedText),
  full_validation_promotion_gate_passed: result.full_validation_promotion_gate_passed,
  validation_rerun_allowed: false,
  fresh_test_read_allowed: false,
  next_required_action: 'Freeze the broader policy/model/data/endpoints/prompt package before creating a genuinely fresh V4 test.',
};
await writeFile(MANIFEST_PATH, `${JSON.stringify(finalManifest, null, 2)}\n`, 'utf8');

const selectedMetrics = result.metrics['oracle_cross_0.5'];
const report = `# V4 Frozen Validation Confirmation\n\nThe frozen system was executed once with no validation tuning.\n\n- Conditional merge required micro Recall@3: Recency ${result.metrics.recency.conditional_merge.required_micro_recall_at_3}; Version-Aware ${selectedMetrics.conditional_merge.required_micro_recall_at_3}.\n- Compatible history required micro Recall@3: Recency ${result.metrics.recency.compatible_history.required_micro_recall_at_3}; Version-Aware ${selectedMetrics.compatible_history.required_micro_recall_at_3}.\n- Retained-history required micro Recall@3: Recency ${result.metrics.recency.all.retained_required_micro_recall_at_3}; Version-Aware ${selectedMetrics.all.retained_required_micro_recall_at_3}.\n- Effectiveness gate: PASS.\n- Project-owner-approved stale/forbidden hit rate: Recency ${result.provisional_safety_metrics.recency.stale_or_forbidden_hit_rate_at_3}; Version-Aware ${result.provisional_safety_metrics.oracle_cross_0_5.stale_or_forbidden_hit_rate_at_3}.\n- Full validation promotion gate: **${result.full_validation_promotion_gate_passed ? 'PASS' : 'FAIL'}**.\n\nProject-owner signoff is not independent blinded or clinical review.\n\nProtocol deviation: ${result.protocol_deviation}\n`;
await writeFile(path.join(RESULT_DIR, 'VALIDATION_CONFIRMATION.md'), report, 'utf8');

const artifactFiles = [
  'raw_retrieval_results.jsonl', 'VALIDATION_CONFIRMATION.json', 'VALIDATION_CONFIRMATION.md',
  'oracle_global_relation_edges.jsonl', 'CODEX_SAFETY_REVIEW.json', 'CODEX_SAFETY_REVIEW.md',
  'SAFETY_LABEL_REVIEW_PACKET.md', 'SAFETY_LABEL_CONFIRMATION.md', 'SAFETY_OWNER_SIGNOFF.md',
  'VALIDATION_CONFIRMATION_AUDIT.json',
];
const checksumText = (await Promise.all(artifactFiles.map(async (file) => `${sha256(await readFile(path.join(RESULT_DIR, file)))}  ${file}`))).join('\n') + '\n';
await writeFile(path.join(RESULT_DIR, 'ARTIFACT_CHECKSUMS.sha256'), checksumText, 'utf8');
console.log(JSON.stringify({ signoff, full_validation_promotion_gate_passed: result.full_validation_promotion_gate_passed, validation_rerun_allowed: false, fresh_test_read_allowed: false }, null, 2));
