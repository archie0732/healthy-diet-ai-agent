import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const EXP = path.join(ROOT, 'experiments/version_aware_rag');
const CORPUS = path.join(EXP, 'data/corpus_v4_devval_draft/chunks.jsonl');
const RAW_LEDGER = path.join(EXP, 'data/annotations_v4/devval_expansion_draft/review_ledger.jsonl');
const REVIEWED_LEDGER = path.join(EXP, 'data/annotations_v4/devval_expansion_codex_reviewed/review_ledger.jsonl');
const FRESH = path.join(EXP, 'data/annotations_v4/candidate_relation_pairs_v4.jsonl');
const REVIEW_REPORT = path.join(EXP, 'results/v4/devval_expansion/CODEX_REVIEW_REPORT.json');
const OUT = path.join(EXP, 'results/v4/devval_expansion');

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (text: string) => text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const evidenceSignature = (record: any) => JSON.stringify({
  current: [...record.required_current_chunk_ids].sort(),
  retained: [...record.required_retained_chunk_ids].sort(),
});

const [corpusText, rawLedgerText, reviewedLedgerText, freshText, reviewReportText] = await Promise.all([
  readFile(CORPUS, 'utf8'),
  readFile(RAW_LEDGER, 'utf8'),
  readFile(REVIEWED_LEDGER, 'utf8'),
  readFile(FRESH, 'utf8'),
  readFile(REVIEW_REPORT, 'utf8'),
]);

const chunks = parseJsonl(corpusText);
const ledger = parseJsonl(reviewedLedgerText);
const fresh = parseJsonl(freshText).filter((record) => record.origin === 'v4_new');
const reviewReport = JSON.parse(reviewReportText);
const chunkIds = new Set(chunks.map((chunk) => chunk.chunk_id));
const freshChunkIds = new Set(fresh.flatMap((record) => [record.old_chunk_id, record.new_chunk_id]));
const failures: string[] = [];
const assert = (condition: unknown, message: string) => { if (!condition) failures.push(message); };

assert(ledger.length === 24, `expected 24 reviewed records, found ${ledger.length}`);
assert(new Set(ledger.map((record) => record.draft_id)).size === 24, 'draft_id values are not unique');
assert(new Set(ledger.map((record) => record.lineage_group_id)).size === 24, 'lineage_group_id values are not unique');
assert(new Set(ledger.map(evidenceSignature)).size === 24, 'current/retained evidence signatures are not unique');
assert(ledger.filter((record) => record.split === 'development').length === 16, 'development must contain 16 records');
assert(ledger.filter((record) => record.split === 'validation').length === 8, 'validation must contain 8 sealed records');
assert(ledger.filter((record) => record.stratum === 'conditional_merge').length === 12, 'conditional_merge must contain 12 groups');
assert(ledger.filter((record) => record.stratum === 'compatible_history').length === 12, 'compatible_history must contain 12 groups');
assert(ledger.filter((record) => record.reviewer_decision === 'accept').length === 12, 'expected 12 records accepted without change');
assert(ledger.filter((record) => record.reviewer_decision === 'revise').length === 12, 'expected 12 records revised then accepted');
assert(reviewReport.source_ledger_sha256 === sha256(rawLedgerText), 'raw ledger checksum does not match review report');
assert(reviewReport.reviewed_ledger_sha256 === sha256(reviewedLedgerText), 'reviewed ledger checksum does not match review report');
assert(reviewReport.validation_confirmation_allowed === false, 'review report must keep validation confirmation blocked');
assert(reviewReport.promotion_allowed === false, 'review report must keep promotion blocked');

for (const record of ledger) {
  assert(record.review_status === 'codex_reviewed_provisional', `${record.draft_id}: incorrect review status`);
  assert(['accept', 'revise'].includes(record.reviewer_decision), `${record.draft_id}: invalid reviewer decision`);
  assert(record.reviewer_type === 'ai_primary_reviewer_not_independent_human', `${record.draft_id}: reviewer independence is misstated`);
  assert(record.eligible_for_development_exploratory_evaluation === true, `${record.draft_id}: development eligibility missing`);
  assert(record.eligible_for_validation_confirmation === false, `${record.draft_id}: validation must remain sealed`);
  assert(record.human_signoff_required_before_promotion === true, `${record.draft_id}: human signoff flag missing`);
  assert(record.fresh_test_leakage_check === 'passed_no_v4_fresh_inventory_used', `${record.draft_id}: leakage flag not passed`);
  assert(record.required_current_chunk_ids.length > 0, `${record.draft_id}: missing current evidence`);
  assert(record.required_retained_chunk_ids.length > 0, `${record.draft_id}: missing retained evidence`);
  for (const id of [...record.required_current_chunk_ids, ...record.required_retained_chunk_ids]) {
    assert(chunkIds.has(id), `${record.draft_id}: missing corpus chunk ${id}`);
    assert(!freshChunkIds.has(id), `${record.draft_id}: leaked fresh-test chunk ${id}`);
    assert(id.startsWith('who-'), `${record.draft_id}: non-WHO source used: ${id}`);
  }
}

const audit = {
  status: failures.length === 0 ? 'codex_review_verified_for_development_only' : 'invalid',
  generated_at: new Date().toISOString(),
  counts: {
    records: ledger.length,
    accepted_without_change: ledger.filter((record) => record.reviewer_decision === 'accept').length,
    revised_then_accepted: ledger.filter((record) => record.reviewer_decision === 'revise').length,
    unique_lineage_groups: new Set(ledger.map((record) => record.lineage_group_id)).size,
    unique_evidence_signatures: new Set(ledger.map(evidenceSignature)).size,
    fresh_test_overlap_chunks: ledger.flatMap((record) => [...record.required_current_chunk_ids, ...record.required_retained_chunk_ids])
      .filter((id) => freshChunkIds.has(id)).length,
  },
  checksums: {
    corpus_sha256: sha256(corpusText),
    raw_ledger_sha256: sha256(rawLedgerText),
    reviewed_ledger_sha256: sha256(reviewedLedgerText),
    review_report_sha256: sha256(reviewReportText),
  },
  development_exploratory_evaluation_allowed: failures.length === 0,
  validation_confirmation_allowed: false,
  promotion_allowed: false,
  gate_reason: 'Codex review is not independent human adjudication; validation confirmation and promotion remain blocked pending user or independent human signoff.',
  failures,
};

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'CODEX_REVIEW_AUDIT.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
await writeFile(path.join(OUT, 'CODEX_REVIEW_AUDIT.md'), `# Codex Review Audit\n\n` +
  `Status: **${audit.status}**\n\n` +
  `- Reviewed records: ${audit.counts.records}\n` +
  `- Accepted without change: ${audit.counts.accepted_without_change}\n` +
  `- Revised then accepted: ${audit.counts.revised_then_accepted}\n` +
  `- Unique lineage groups: ${audit.counts.unique_lineage_groups}\n` +
  `- Unique evidence signatures: ${audit.counts.unique_evidence_signatures}\n` +
  `- Fresh-test overlap chunks: ${audit.counts.fresh_test_overlap_chunks}\n\n` +
  `Development-only exploratory evaluation is allowed. Validation confirmation and promotion remain blocked.\n`, 'utf8');

console.log(JSON.stringify(audit, null, 2));
if (failures.length > 0) process.exitCode = 1;
