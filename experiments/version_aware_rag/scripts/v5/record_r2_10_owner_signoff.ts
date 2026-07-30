import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const DRAFT = path.join(EXP, 'data/annotations_v5/r2_10_fresh_test_draft');
const FROZEN = path.join(EXP, 'data/configs/v5_r2_10_frozen_policy');
const OUT = path.join(EXP, 'data/configs/v5_r2_10_fresh_test');
const REVIEW_PACKET = path.join(EXP, 'results/v5/r2_10_fresh_test_construction/R2_10_FRESH_TEST_REVIEW_PACKET.md');
const APPROVED_PACKET_CONTENT_SHA256 = 'b3923d62ba18fed6ed70b21cfe80819885768c378ce5afa0e1846c54c7d69ca3';
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const [draftText, draftManifestText, frozenText, frozenGuardText, packetText] = await Promise.all([
  readFile(path.join(DRAFT, 'fresh_test_draft.jsonl'), 'utf8'),
  readFile(path.join(DRAFT, 'DRAFT_MANIFEST.json'), 'utf8'),
  readFile(path.join(FROZEN, 'FROZEN_POLICY_PACKAGE.json'), 'utf8'),
  readFile(path.join(FROZEN, 'FRESH_TEST_GUARD.json'), 'utf8'),
  readFile(REVIEW_PACKET, 'utf8'),
]);
const draftManifest = JSON.parse(draftManifestText);
const frozenGuard = JSON.parse(frozenGuardText);
if (
  draftManifest.review_packet_content_sha256 !== APPROVED_PACKET_CONTENT_SHA256
  || !packetText.includes(`Review packet content SHA-256: \`${APPROVED_PACKET_CONTENT_SHA256}\``)
  || sha256(packetText) !== draftManifest.review_packet_file_sha256
  || sha256(draftText) !== draftManifest.draft_ledger_sha256
  || sha256(frozenText) !== draftManifest.frozen_policy_sha256
  || frozenGuard.owner_signoff_recorded
  || frozenGuard.fresh_test_execution_count !== 0
) throw new Error('R2.10 checksum-bound owner signoff guard failed');

const records = parseJsonl(draftText);
const approved = records.map((record) => ({
  ...record,
  review: {
    ...record.review,
    decision: 'project_owner_approved',
    owner_reviewer_id: 'project_owner_user',
    owner_reviewer_type: 'human_project_owner',
    owner_signoff_statement: `同意全部，checksum ${APPROVED_PACKET_CONTENT_SHA256}`,
    owner_signoff_date: '2026-07-24',
    independent_blinded_review: false,
  },
}));
const retrievalInputs = approved.map((record) => ({
  query_id: record.query_id,
  stratum: record.stratum,
  query: record.query,
  lineage_group: record.lineage_group,
  evidence_items: [
    {
      item_id: record.old_evidence.item_id,
      lineage_group: record.lineage_group,
      role: record.old_evidence.role,
      year: record.old_evidence.year,
      text: record.old_evidence.atomic_claim_text,
      source: record.old_evidence,
    },
    {
      item_id: record.current_evidence.item_id,
      lineage_group: record.lineage_group,
      role: record.current_evidence.role,
      year: record.current_evidence.year,
      text: record.current_evidence.atomic_claim_text,
      source: record.current_evidence,
    },
  ],
}));
const judgments = approved.map((record) => ({
  query_id: record.query_id,
  stratum: record.stratum,
  required_item_ids: record.judgment.required_item_ids,
  deprecated_item_ids: record.judgment.deprecated_item_ids,
}));
const approvedText = `${approved.map((record) => JSON.stringify(record)).join('\n')}\n`;
const inputsText = `${retrievalInputs.map((record) => JSON.stringify(record)).join('\n')}\n`;
const judgmentsText = `${judgments.map((record) => JSON.stringify(record)).join('\n')}\n`;
const signoff = {
  schema_version: 'v5-r2.10-owner-signoff-1',
  status: 'checksum_bound_project_owner_approved',
  owner_statement: `同意全部，checksum ${APPROVED_PACKET_CONTENT_SHA256}`,
  owner_signoff_date: '2026-07-24',
  review_packet_content_sha256: APPROVED_PACKET_CONTENT_SHA256,
  review_packet_file_sha256: sha256(packetText),
  draft_ledger_sha256: sha256(draftText),
  approved_ledger_sha256: sha256(approvedText),
  record_count: approved.length,
  limitation: 'Project-owner review is not independent blinded or clinical review.',
};
const signoffText = `${JSON.stringify(signoff, null, 2)}\n`;
const manifest = {
  schema_version: 'v5-r2.10-fresh-test-manifest-1',
  status: 'fresh_test_frozen_after_checksum_bound_owner_signoff',
  frozen_policy_sha256: sha256(frozenText),
  owner_signoff_sha256: sha256(signoffText),
  approved_ledger_sha256: sha256(approvedText),
  retrieval_inputs_sha256: sha256(inputsText),
  judgments_sealed_sha256: sha256(judgmentsText),
  query_count: retrievalInputs.length,
  corpus_item_count: new Set(retrievalInputs.flatMap((row) => row.evidence_items.map((item) => item.item_id))).size,
  strata_counts: Object.fromEntries(['explicit_history', 'conditional_merge', 'current_only', 'hard_negative_current']
    .map((stratum) => [stratum, retrievalInputs.filter((row) => row.stratum === stratum).length])),
  external_model_api_used: false,
  fresh_test_execution_count: 0,
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const executionGuard = {
  status: 'r2_10_one_shot_fresh_test_unlocked',
  manifest_sha256: sha256(manifestText),
  owner_signoff_sha256: sha256(signoffText),
  approved_review_packet_content_sha256: APPROVED_PACKET_CONTENT_SHA256,
  fresh_test_execution_count: 0,
  judgments_may_be_read_only_after_all_retrieval_calls: true,
  tuning_after_fresh_test_allowed: false,
  external_model_api_allowed: false,
};

await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, 'approved_review_ledger.jsonl'), approvedText, 'utf8'),
  writeFile(path.join(OUT, 'retrieval_inputs.jsonl'), inputsText, 'utf8'),
  writeFile(path.join(OUT, 'judgments.sealed.jsonl'), judgmentsText, 'utf8'),
  writeFile(path.join(OUT, 'PROJECT_OWNER_SIGNOFF.json'), signoffText, 'utf8'),
  writeFile(path.join(OUT, 'MANIFEST.json'), manifestText, 'utf8'),
  writeFile(path.join(OUT, 'EXECUTION_GUARD.json'), `${JSON.stringify(executionGuard, null, 2)}\n`, 'utf8'),
  writeFile(path.join(FROZEN, 'FRESH_TEST_GUARD.json'), `${JSON.stringify({
    ...frozenGuard,
    status: 'checksum_bound_owner_signoff_recorded_execution_delegated',
    owner_signoff_recorded: true,
    owner_signoff_statement: signoff.owner_statement,
    owner_signoff_sha256: sha256(signoffText),
    fresh_test_execution_count: 0,
  }, null, 2)}\n`, 'utf8'),
]);
console.log(JSON.stringify(signoff, null, 2));
