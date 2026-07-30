import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const PARENT = path.join(EXP, 'data/configs/v5_r2_action_detector');
const OUT = path.join(EXP, 'data/configs/v5_r2_3_codex_audited_action_detector');
const AUDIT = path.join(EXP, 'data/annotations_v5/r2_codex_action_audit');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const revised = new Map<string, { action: 'PAIR_PRESERVE' | 'BLOCK_RETAINED'; rationale: string }>([
  ['v5claim-006', { action: 'BLOCK_RETAINED', rationale: 'CURRENT repeats the same saturated-fat ceiling and adds the age boundary. OLD contributes no distinct operative constraint and would duplicate a retrieval slot.' }],
  ['v5claim-014', { action: 'BLOCK_RETAINED', rationale: 'CURRENT contains the same added-sugar ceiling and adds explicit guidance for children under age two. OLD is fully subsumed.' }],
  ['v5claim-017', { action: 'BLOCK_RETAINED', rationale: 'CURRENT already supplies the animal/plant protein variety and adds a quantitative target. The older list is materially subsumed; its lean-meat wording may also conflict with the newer red-meat wording.' }],
  ['v5claim-020', { action: 'BLOCK_RETAINED', rationale: 'For the vitamin-D claim, CURRENT supplies timing, dose, and formula-intake scope. The generic OLD instruction adds no independent vitamin-D requirement.' }],
  ['v5claim-022', { action: 'BLOCK_RETAINED', rationale: 'For allergen introduction, CURRENT restates introduction at about six months and adds examples and professional-risk consultation. The OLD allergen instruction is subsumed.' }],
]);

const acceptedRationales: Record<string, string> = {
  'v5claim-001': 'Same whole-grain proportion and scope; OLD is duplicate.',
  'v5claim-002': 'CURRENT restates low-fat dairy and fortified-soy alternatives with extra examples; OLD is subsumed.',
  'v5claim-003': 'CURRENT restates the same animal and plant protein categories; OLD is duplicate.',
  'v5claim-004': 'Same sex-specific alcohol moderation ceilings; OLD is duplicate.',
  'v5claim-005': 'CURRENT contains the same added-sugar ceiling and adds age scope; OLD is subsumed.',
  'v5claim-007': 'CURRENT changes the operative added-sugar metric; OLD should not be presented as current.',
  'v5claim-008': 'CURRENT replaces the vague child sodium statement with age-band thresholds.',
  'v5claim-009': 'CURRENT changes the breastfeeding continuation target; OLD is superseded.',
  'v5claim-010': 'CURRENT removes the older numeric moderation framing and expands avoidance guidance.',
  'v5claim-011': 'Low-fat and full-fat dairy instructions conflict for the same choice.',
  'v5claim-012': 'The passages give incompatible guidance on non-nutritive sweeteners.',
  'v5claim-013': 'OLD supplies the general/child sodium ceiling while CURRENT adds a high-activity exception; both constraints are needed.',
  'v5claim-015': 'OLD retains legal-age/no-initiation constraints while CURRENT adds clinical and behavioural avoidance groups.',
  'v5claim-016': 'OLD supplies the general customizable healthy-pattern baseline while CURRENT adds condition-specific clinical adaptation.',
  'v5claim-018': 'OLD supplies concrete vegetable subgroup diversity while CURRENT adds compatible serving and preparation guidance.',
  'v5claim-019': 'OLD supplies a whole-grain proportion while CURRENT adds a compatible servings target.',
  'v5claim-021': 'OLD supplies an intake ceiling while CURRENT supplies ingredient-identification guidance; neither subsumes the other.',
};

const [devText, validationText, parentManifestText] = await Promise.all([
  readFile(path.join(PARENT, 'development.jsonl'), 'utf8'),
  readFile(path.join(PARENT, 'validation.sealed.jsonl'), 'utf8'),
  readFile(path.join(PARENT, 'SPLIT_MANIFEST.json'), 'utf8'),
]);
const rows = parseJsonl(devText), parentManifest = JSON.parse(parentManifestText);
const ledger = rows.map((row: any) => {
  const sourceId = row.source_pair_id;
  const change = revised.get(sourceId);
  const auditedAction = change?.action || row.action_label;
  const rationale = change?.rationale || acceptedRationales[sourceId];
  if (!rationale) throw new Error(`Missing audit rationale for ${sourceId}`);
  return {
    audit_id: `r2-action-audit-${sourceId}`,
    source_pair_id: sourceId,
    original_r2_action_label: row.action_label,
    audited_action_label: auditedAction,
    decision: change ? 'revise' : 'accept',
    rationale,
    endpoint_question: 'Does OLD contain query-relevant operative evidence not fully stated, displaced, or contradicted by CURRENT?',
    relation_label_not_equivalent_to_action_label: true,
    reviewer_id: 'codex-gpt5-primary-reviewer',
    reviewer_type: 'ai_primary_reviewer_not_independent_human',
    model_api_used: false,
    validation_predictions_read: false,
    fresh_test_read: false,
  };
});
const ledgerById = new Map(ledger.map((row) => [row.source_pair_id, row]));
const audited = rows.map((row: any) => ({
  ...row,
  pair_id: `r2.3dev-${row.source_pair_id}`,
  parent_pair_id: row.pair_id,
  parent_action_label: row.action_label,
  action_label: ledgerById.get(row.source_pair_id)!.audited_action_label,
  codex_action_audit_decision: ledgerById.get(row.source_pair_id)!.decision,
  detector_development_eligible: true,
  validation_only: false,
  fresh_v5_test_eligible: false,
}));

await Promise.all([mkdir(OUT, { recursive: true }), mkdir(AUDIT, { recursive: true })]);
const auditedText = audited.map((row: any) => JSON.stringify(row)).join('\n') + '\n';
const ledgerText = ledger.map((row) => JSON.stringify(row)).join('\n') + '\n';
await writeFile(path.join(OUT, 'development.jsonl'), auditedText, 'utf8');
await writeFile(path.join(OUT, 'validation.sealed.jsonl'), validationText, 'utf8');
await writeFile(path.join(AUDIT, 'audit_ledger.jsonl'), ledgerText, 'utf8');
const manifest = {
  schema_version: 'v5-r2.3-codex-audited-action-1',
  status: 'development_audit_complete_validation_still_sealed',
  parent_manifest_sha256: sha256(parentManifestText),
  parent_development_sha256: sha256(devText),
  audit_ledger_sha256: sha256(ledgerText),
  development_sha256: sha256(auditedText),
  validation_sealed_sha256: sha256(validationText),
  validation_artifact_changed: false,
  validation_execution_count: 0,
  development_count: audited.length,
  development_distribution: Object.fromEntries(['PAIR_PRESERVE', 'BLOCK_RETAINED'].map((label) => [label, audited.filter((row: any) => row.action_label === label).length])),
  revised_count: ledger.filter((row) => row.decision === 'revise').length,
  accepted_count: ledger.filter((row) => row.decision === 'accept').length,
  evidence_hash_overlap_count: parentManifest.evidence_hash_overlap_count,
  endpoint_change: 'Relation identity no longer implies retrieval-slot preservation; CURRENT subsumption blocks OLD even when the semantic relation was previously called complementary or conditional.',
  reviewer_provenance: 'codex-gpt5-primary-reviewer_not_independent_human',
  external_model_api_used: false,
  fresh_v5_test_created: false,
};
const manifestText = JSON.stringify(manifest, null, 2) + '\n';
await writeFile(path.join(OUT, 'SPLIT_MANIFEST.json'), manifestText, 'utf8');
await writeFile(path.join(OUT, 'EXECUTION_GUARD.json'), JSON.stringify({
  status: 'development_unlocked_local_detector_only',
  split_manifest_sha256: sha256(manifestText),
  development_selection_complete: false,
  validation_execution_count: 0,
  external_gemini_or_gemma_calls_allowed: false,
  tuning_after_validation_allowed: false,
  fresh_v5_test_created: false,
}, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(manifest, null, 2));
