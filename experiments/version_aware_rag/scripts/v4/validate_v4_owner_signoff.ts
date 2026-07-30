import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const REVIEWED = path.join(EXP, 'data/annotations_v4/devval_expansion_codex_reviewed/review_ledger.jsonl');
const APPROVED = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/review_ledger.jsonl');
const SIGNOFF = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/project_owner_signoff.json');
const FRESH = path.join(EXP, 'data/annotations_v4/candidate_relation_pairs_v4.jsonl');
const OUT = path.join(EXP, 'results/v4/devval_expansion/PROJECT_OWNER_SIGNOFF_AUDIT.json');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const [reviewedText, approvedText, signoffText, freshText] = await Promise.all([
  readFile(REVIEWED, 'utf8'), readFile(APPROVED, 'utf8'), readFile(SIGNOFF, 'utf8'), readFile(FRESH, 'utf8'),
]);
const reviewed = parseJsonl(reviewedText);
const approved = parseJsonl(approvedText);
const signoff = JSON.parse(signoffText);
const freshIds = new Set(parseJsonl(freshText).filter((record) => record.origin === 'v4_new')
  .flatMap((record) => [record.old_chunk_id, record.new_chunk_id]));
const failures: string[] = [];
const check = (condition: unknown, message: string) => { if (!condition) failures.push(message); };

check(reviewed.length === 24 && approved.length === 24, 'reviewed and approved ledgers must each contain 24 records');
check(signoff.source_reviewed_ledger_sha256 === sha256(reviewedText), 'source reviewed-ledger checksum mismatch');
check(signoff.approved_ledger_sha256 === sha256(approvedText), 'approved-ledger checksum mismatch');
check(new Set(approved.map((record) => record.draft_id)).size === 24, 'approved draft IDs are not unique');
check(new Set(approved.map((record) => record.lineage_group_id)).size === 24, 'approved lineage groups are not unique');
check(approved.filter((record) => record.split === 'development').length === 16, 'expected 16 development records');
check(approved.filter((record) => record.split === 'validation').length === 8, 'expected 8 validation records');

for (let index = 0; index < approved.length; index += 1) {
  const before = reviewed[index];
  const after = approved[index];
  check(before.draft_id === after.draft_id, `record order changed at index ${index}`);
  for (const field of ['query_text', 'lineage_group_id', 'required_current_chunk_ids', 'required_retained_chunk_ids']) {
    check(JSON.stringify(before[field]) === JSON.stringify(after[field]), `${after.draft_id}: signoff changed adjudicated field ${field}`);
  }
  check(after.review_status === 'user_approved', `${after.draft_id}: missing user-approved status`);
  check(after.owner_reviewer_type === 'human_project_owner', `${after.draft_id}: incorrect owner reviewer type`);
  check(after.eligible_for_development_exploratory_evaluation === true, `${after.draft_id}: development eligibility missing`);
  check(after.eligible_for_validation_confirmation === true, `${after.draft_id}: validation-label eligibility missing`);
  check(after.promotion_allowed === false, `${after.draft_id}: promotion was incorrectly unlocked`);
  check([...after.required_current_chunk_ids, ...after.required_retained_chunk_ids].every((id) => !freshIds.has(id)), `${after.draft_id}: fresh-test leakage`);
  if (after.split === 'validation') check(after.validation_data_sealed_until_development_selection === true, `${after.draft_id}: validation is not sealed`);
}

check(signoff.gates.validation_execution_allowed_now === false, 'validation execution must remain blocked before development selection');
check(signoff.gates.promotion_allowed === false, 'promotion must remain blocked');
check(signoff.gates.fresh_test_allowed === false, 'fresh test must remain blocked');

const audit = {
  status: failures.length === 0 ? 'project_owner_signoff_verified' : 'invalid',
  counts: { records: approved.length, development: 16, validation_sealed: 8 },
  approved_ledger_sha256: sha256(approvedText),
  development_evaluation_allowed: failures.length === 0,
  validation_execution_allowed_now: false,
  promotion_allowed: false,
  fresh_test_allowed: false,
  failures,
};
await writeFile(OUT, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(audit, null, 2));
if (failures.length) process.exitCode = 1;
