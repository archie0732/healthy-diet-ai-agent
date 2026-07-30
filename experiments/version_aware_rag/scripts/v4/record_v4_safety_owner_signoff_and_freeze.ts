import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const PROVISIONAL = path.join(EXP, 'data/annotations_v4/dev_safety_codex_provisional/safety_review_ledger.jsonl');
const APPROVED_DIR = path.join(EXP, 'data/annotations_v4/dev_safety_user_approved');
const DEV_OUT = path.join(EXP, 'results/v4/dev_model_selection');
const FREEZE_DIR = path.join(EXP, 'data/configs/v4_validation_frozen');
const SPLIT_MANIFEST = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits/split_manifest.json');
const METRICS = path.join(DEV_OUT, 'development_metrics.gemma-4-31b-it.json');
const RAW = path.join(DEV_OUT, 'raw_retrieval_results.gemma-4-31b-it.jsonl');
const REGISTRY = path.join(DEV_OUT, 'model_registry.gemma-4-31b-it.json');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const stableLines = (rows: unknown[]) => `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;

const [provisionalText, metricsText, rawText, registryText, splitText] = await Promise.all([
  readFile(PROVISIONAL, 'utf8'), readFile(METRICS, 'utf8'), readFile(RAW, 'utf8'),
  readFile(REGISTRY, 'utf8'), readFile(SPLIT_MANIFEST, 'utf8'),
]);
const provisional = parseJsonl(provisionalText);
const metrics = JSON.parse(metricsText);
const raw = parseJsonl(rawText);
const registry = JSON.parse(registryText);
const split = JSON.parse(splitText);
if (provisional.length !== 78) throw new Error(`Expected 78 safety rows, found ${provisional.length}.`);
if (provisional.some((row) => !['citation_safe', 'neither', 'stale', 'forbidden'].includes(row.reviewer_label))) {
  throw new Error('Safety ledger contains an invalid or missing reviewer label.');
}
if (metrics.gate.development_selected_candidate !== 'oracle_cross_0.5') throw new Error('Unexpected development selection.');
if (registry.cross_encoder.model_id !== 'gemma-4-31b-it') throw new Error('Unexpected cross-encoder model.');

const signedAt = '2026-07-22';
const approved = provisional.map((row) => ({
  ...row,
  review_status: 'user_approved',
  owner_reviewer_id: 'project_owner_user',
  owner_reviewer_type: 'human_project_owner',
  owner_decision: 'accept_current_provisional_label',
  owner_signoff_date: signedAt,
  owner_signoff_statement: '全部同意',
  independent_blinded_or_clinical_review: false,
}));
const approvedText = stableLines(approved);
await mkdir(APPROVED_DIR, { recursive: true });
await writeFile(path.join(APPROVED_DIR, 'safety_review_ledger.jsonl'), approvedText, 'utf8');

const labelsByQuery = new Map<string, { stale: Set<string>; forbidden: Set<string> }>();
for (const row of approved) {
  const labels = labelsByQuery.get(row.query_id) || { stale: new Set<string>(), forbidden: new Set<string>() };
  if (row.reviewer_label === 'stale') labels.stale.add(row.chunk_id);
  if (row.reviewer_label === 'forbidden') labels.forbidden.add(row.chunk_id);
  labelsByQuery.set(row.query_id, labels);
}
function safety(system: string) {
  const rows = raw.filter((row) => row.system === system);
  let staleHits = 0, forbiddenHits = 0, unsafeQueries = 0;
  for (const row of rows) {
    const labels = labelsByQuery.get(row.query_id);
    if (!labels) throw new Error(`Missing safety labels for ${row.query_id}.`);
    const stale = row.retrieved_chunk_ids.filter((id: string) => labels.stale.has(id)).length;
    const forbidden = row.retrieved_chunk_ids.filter((id: string) => labels.forbidden.has(id)).length;
    staleHits += stale; forbiddenHits += forbidden;
    if (stale + forbidden > 0) unsafeQueries += 1;
  }
  const denominator = rows.length * 3;
  return {
    query_count: rows.length,
    stale_chunk_hit_rate_at_3: denominator ? staleHits / denominator : 0,
    forbidden_chunk_hit_rate_at_3: denominator ? forbiddenHits / denominator : 0,
    stale_or_forbidden_hit_rate_at_3: denominator ? (staleHits + forbiddenHits) / denominator : 0,
    stale_or_forbidden_query_rate_at_3: rows.length ? unsafeQueries / rows.length : 0,
  };
}
const recencySafety = safety('recency');
const selectedSafety = safety('oracle_cross_0.5');
const selected = metrics.metrics['oracle_cross_0.5'];
const recency = metrics.metrics.recency;
const gate = {
  conditional_merge_noninferiority: selected.conditional_merge.required_micro_recall_at_3 >= recency.conditional_merge.required_micro_recall_at_3,
  compatible_history_noninferiority: selected.compatible_history.required_micro_recall_at_3 >= recency.compatible_history.required_micro_recall_at_3,
  retained_history_strict_improvement: selected.all.retained_required_micro_recall_at_3 > recency.all.retained_required_micro_recall_at_3,
  stale_forbidden_nonincrease: selectedSafety.stale_or_forbidden_hit_rate_at_3 <= recencySafety.stale_or_forbidden_hit_rate_at_3,
};
const fullGate = Object.values(gate).every(Boolean);
if (!fullGate) throw new Error('Development promotion gate did not pass; validation must remain sealed.');

const signoff = {
  status: 'project_owner_approved', owner_statement: '全部同意', owner_signoff_date: signedAt,
  scope: 'All 78 Codex-provisional development safety labels without modification.',
  limitation: 'Project-owner confirmation is not independent blinded or clinical review.',
  provisional_ledger_sha256: sha256(provisionalText), approved_ledger_sha256: sha256(approvedText),
  counts: Object.fromEntries(['citation_safe', 'neither', 'stale', 'forbidden'].map((label) => [label, approved.filter((row) => row.reviewer_label === label).length])),
};
await writeFile(path.join(APPROVED_DIR, 'project_owner_signoff.json'), `${JSON.stringify(signoff, null, 2)}\n`, 'utf8');
await writeFile(path.join(DEV_OUT, 'SAFETY_OWNER_SIGNOFF.md'), `# Development Safety Owner Signoff\n\nProject owner approved all 78 provisional labels on ${signedAt} with the statement: **全部同意**.\n\nThis is workflow signoff, not independent blinded or clinical review.\n\nApproved ledger SHA-256: \`${signoff.approved_ledger_sha256}\`.\n`, 'utf8');

const gateResult = {
  status: 'development_promotion_gate_passed', selected_candidate: 'oracle_cross_0.5',
  effectiveness: {
    conditional_merge: { recency: recency.conditional_merge.required_micro_recall_at_3, selected: selected.conditional_merge.required_micro_recall_at_3 },
    compatible_history: { recency: recency.compatible_history.required_micro_recall_at_3, selected: selected.compatible_history.required_micro_recall_at_3 },
    retained_history: { recency: recency.all.retained_required_micro_recall_at_3, selected: selected.all.retained_required_micro_recall_at_3 },
  },
  safety: { recency: recencySafety, selected: selectedSafety }, gate,
  full_promotion_gate_passed: fullGate, validation_execution_allowed: fullGate,
};
await writeFile(path.join(DEV_OUT, 'DEVELOPMENT_PROMOTION_GATE.json'), `${JSON.stringify(gateResult, null, 2)}\n`, 'utf8');

await mkdir(FREEZE_DIR, { recursive: true });
const frozen = {
  status: 'frozen_for_single_validation_confirmation', frozen_at: signedAt,
  selected_system: 'oracle_cross_0.5', top_k: 3, candidate_budget: 20, recency_lambda: 0.75,
  policy: { relation_boost: 0.35, propagation_factor: 0.9, pair_coverage_selection: true, semantic_alpha: 0.5 },
  cross_encoder: {
    model_id: registry.cross_encoder.model_id, descriptor_sha256: registry.cross_encoder.descriptor_sha256,
    api_version: registry.api_version, temperature: 0, thinking_level: 'not_applicable',
    output_schema: 'scores_only_v1', max_output_tokens: 2048,
  },
  prompt_contract: 'GeminiRerankClient.crossEncode scores_only_v1 as frozen in source code.',
  relation_source: 'Global oracle edges constructed from all project-owner-approved dev/validation current-retained pairs; no query-ID lookup is permitted during retrieval.',
  endpoints: ['conditional_merge_required_micro_recall_at_3', 'compatible_history_required_micro_recall_at_3', 'retained_required_micro_recall_at_3', 'stale_forbidden_hit_rate_at_3'],
  validation_rule: 'Run once with no grid search or parameter changes. Validation failure cannot trigger retuning.',
  checksums: {
    development_split_sha256: split.development.sha256, sealed_validation_split_sha256: split.validation.sha256,
    development_metrics_sha256: sha256(metricsText), development_raw_sha256: sha256(rawText),
    model_registry_sha256: sha256(registryText), approved_safety_ledger_sha256: sha256(approvedText),
  },
  development_gate: gateResult,
};
const frozenText = `${JSON.stringify(frozen, null, 2)}\n`;
await writeFile(path.join(FREEZE_DIR, 'FROZEN_VALIDATION_CONFIG.json'), frozenText, 'utf8');
const freezeManifest = {
  status: 'validation_unlocked_by_verified_freeze', frozen_config_sha256: sha256(frozenText),
  sealed_validation_sha256: split.validation.sha256, validation_execution_count_allowed: 1,
  validation_execution_count_completed: 0, fresh_test_read_allowed: false,
};
await writeFile(path.join(FREEZE_DIR, 'FREEZE_MANIFEST.json'), `${JSON.stringify(freezeManifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ signoff, gate: gateResult, freeze: freezeManifest }, null, 2));
