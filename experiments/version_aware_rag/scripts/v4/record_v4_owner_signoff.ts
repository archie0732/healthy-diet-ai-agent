import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const EXP = path.join(ROOT, 'experiments/version_aware_rag');
const REVIEWED = path.join(EXP, 'data/annotations_v4/devval_expansion_codex_reviewed/review_ledger.jsonl');
const APPROVED_DIR = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved');
const APPROVED = path.join(APPROVED_DIR, 'review_ledger.jsonl');
const SIGNOFF = path.join(APPROVED_DIR, 'project_owner_signoff.json');
const OUT = path.join(EXP, 'results/v4/devval_expansion');

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const reviewedText = await readFile(REVIEWED, 'utf8');
const reviewed = reviewedText.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

if (reviewed.length !== 24) throw new Error(`Expected 24 reviewed records, found ${reviewed.length}`);
if (reviewed.some((record) => record.review_status !== 'codex_reviewed_provisional')) {
  throw new Error('Owner signoff source must be the immutable Codex-reviewed provisional ledger.');
}

const ownerStatement = '我剛剛已經審核過了；我覺得可以。';
const signedAt = '2026-07-21';
const approved = reviewed.map((record) => ({
  ...record,
  review_status: 'user_approved',
  owner_reviewer_id: 'project_owner_user',
  owner_reviewer_type: 'human_project_owner',
  owner_decision: 'accept_current_reviewed_record',
  owner_signoff_date: signedAt,
  owner_signoff_scope: 'accepts all 24 current records, including the 12 documented Codex revisions',
  eligible_for_development_exploratory_evaluation: true,
  eligible_for_validation_confirmation: true,
  validation_data_sealed_until_development_selection: record.split === 'validation',
  human_signoff_required_before_promotion: false,
  promotion_allowed: false,
}));
const approvedText = `${approved.map((record) => JSON.stringify(record)).join('\n')}\n`;

const signoff = {
  signoff_id: 'v4-devval-project-owner-2026-07-21',
  signed_at: signedAt,
  reviewer_id: 'project_owner_user',
  reviewer_type: 'human_project_owner',
  statement: ownerStatement,
  interpretation: 'The project owner reviewed the Codex report and accepted the current 24-record reviewed ledger without requesting further edits.',
  scope: {
    record_count: 24,
    accepted_codex_revisions: true,
    development_records: approved.filter((record) => record.split === 'development').length,
    validation_records: approved.filter((record) => record.split === 'validation').length,
  },
  source_reviewed_ledger_sha256: sha256(reviewedText),
  approved_ledger_sha256: sha256(approvedText),
  gates: {
    development_evaluation_allowed: true,
    validation_labels_eligible: true,
    validation_execution_allowed_now: false,
    validation_execution_condition: 'Select and freeze the model, prompt, policy, and weights using development only; then run validation once.',
    promotion_allowed: false,
    fresh_test_allowed: false,
  },
  provenance_note: 'This records project-owner signoff, not independent blinded adjudication or clinical expert review.',
};

await mkdir(APPROVED_DIR, { recursive: true });
await mkdir(OUT, { recursive: true });
await writeFile(APPROVED, approvedText, 'utf8');
await writeFile(SIGNOFF, `${JSON.stringify(signoff, null, 2)}\n`, 'utf8');
await writeFile(path.join(OUT, 'PROJECT_OWNER_SIGNOFF.md'), `# V4 Development/Validation Project-Owner Signoff\n\n` +
  `Status: **user_approved**\n\n` +
  `On ${signedAt}, the project owner stated: “${ownerStatement}”\n\n` +
  `This accepts the current 24-record reviewed ledger, including all documented Codex revisions. ` +
  `Development evaluation is allowed. Validation labels are eligible but the validation split remains sealed until development-only model selection is frozen; it may then be executed once. ` +
  `Promotion and fresh-test execution remain blocked.\n\n` +
  `Reviewed-ledger SHA-256: \`${signoff.source_reviewed_ledger_sha256}\`\n\n` +
  `Approved-ledger SHA-256: \`${signoff.approved_ledger_sha256}\`\n`, 'utf8');

console.log(JSON.stringify(signoff, null, 2));
