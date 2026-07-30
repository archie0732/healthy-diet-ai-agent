import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const INPUT = path.join(EXP, 'data/configs/v5_r2_6_query_conditioned_action_detector/development.jsonl');
const OUT = path.join(EXP, 'data/annotations_v5/r2_6_query_conditioned_development_audit');
const rows = (await readFile(INPUT, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const revisions: Record<string, { revised_action_label: string; rationale: string }> = {
  'r2.6-v5claim-013': {
    revised_action_label: 'BLOCK_RETAINED',
    rationale: 'CURRENT independently supplies both parts of QUERY: the general 2300 mg sodium ceiling and the highly-active exception. OLD adds only a child qualifier not requested by QUERY.',
  },
  'r2.6-v5claim-016': {
    revised_action_label: 'BLOCK_RETAINED',
    rationale: 'QUERY asks how to adapt guidance for chronic disease, which CURRENT answers directly by requiring work with a health-care professional. OLD adds general individual/cultural customization but no operative chronic-disease requirement needed by QUERY.',
  },
};

const auditedAt = '2026-07-23T00:00:00.000+08:00';
const ledger = rows.map((row: any) => {
  const revision = revisions[row.pair_id];
  return {
    pair_id: row.pair_id,
    lineage_group: row.lineage_group,
    query: row.query.text,
    prior_action_label: row.action_label,
    audit_decision: revision ? 'revise' : 'accept',
    revised_action_label: revision?.revised_action_label || row.action_label,
    rationale: revision?.rationale || 'The prior action label is consistent with whether OLD supplies a query-required operative claim not fully supplied, displaced, or contradicted by CURRENT.',
    reviewer_id: 'codex-gpt5-primary-reviewer',
    reviewer_type: 'ai_primary_reviewer_not_independent_human',
    audit_timing: 'post_development_iteration_2_error_analysis',
    audit_contamination_warning: 'This audit occurred after Development predictions were observed and cannot be used to retroactively promote R2.6.',
    validation_data_read: false,
    external_model_api_used: false,
    audited_at: auditedAt,
  };
});
const summary = {
  schema_version: 'v5-r2.6-query-conditioned-development-label-audit-1',
  status: 'r2_6_invalid_for_promotion_requires_pre_model_gold_rebuild',
  input_count: rows.length,
  accepted_count: ledger.filter((row) => row.audit_decision === 'accept').length,
  revised_count: ledger.filter((row) => row.audit_decision === 'revise').length,
  revised_pair_ids: ledger.filter((row) => row.audit_decision === 'revise').map((row) => row.pair_id),
  endpoint: 'Preserve OLD only when it contains an operative claim needed to answer QUERY that is not fully supplied, displaced, or contradicted by CURRENT.',
  timing: 'post_development_iteration_2_error_analysis',
  consequence: 'Do not relabel and reuse the observed R2.6 predictions for promotion. Build a pre-audited replacement Development set before any further detector selection.',
  validation_file_read: false,
  validation_execution_count: 0,
  external_model_api_used: false,
};
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'audit_ledger.jsonl'), `${ledger.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
await writeFile(path.join(OUT, 'AUDIT_SUMMARY.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
