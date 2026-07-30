import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const DRAFT = path.join(EXP, 'data/annotations_v4/fresh_test_draft/fresh_test_ledger.jsonl');
const MANIFEST = path.join(EXP, 'data/annotations_v4/fresh_test_draft/fresh_test_manifest.json');
const CORPUS = path.join(EXP, 'data/corpus_v4_fresh_frozen/chunks.jsonl');
const GUARD = path.join(EXP, 'data/configs/v4_fresh_test_frozen/FRESH_TEST_GUARD.json');
const AMENDMENT = path.join(EXP, 'FRESH_TEST_DESIGN_AMENDMENT_03.md');
const OUT = path.join(EXP, 'data/annotations_v4/fresh_test_codex_reviewed');
const REPORT = path.join(EXP, 'results/v4/fresh_test_construction');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

const [draftText, manifestText, corpusText, guardText, amendmentText] = await Promise.all([readFile(DRAFT, 'utf8'), readFile(MANIFEST, 'utf8'), readFile(CORPUS, 'utf8'), readFile(GUARD, 'utf8'), readFile(AMENDMENT, 'utf8')]);
const draft = parseJsonl(draftText), manifest = JSON.parse(manifestText), guard = JSON.parse(guardText), chunks = new Set(parseJsonl(corpusText).map((row) => row.chunk_id));
if (sha256(draftText) !== manifest.draft_ledger_sha256 || sha256(draftText) !== guard.draft_ledger_sha256) throw new Error('Fresh draft checksum mismatch.');
if (guard.final_test_created || guard.test_retrieval_execution_count_completed !== 0) throw new Error('Review must precede final test creation and retrieval.');
const failures: string[] = [];
for (const row of draft) {
  const required = row.judgment.required_chunk_ids;
  if (!required.every((id: string) => chunks.has(id))) failures.push(`${row.query_id}: missing required chunk`);
  if (row.stratum === 'conditional_merge' || row.stratum === 'compatible_history') {
    if (row.required_current_chunk_ids.length !== 1 || row.required_retained_chunk_ids.length !== 1 || required.length !== 2) failures.push(`${row.query_id}: two-passage stratum requires current and retained evidence`);
  } else if (row.required_retained_chunk_ids.length || required.length !== 1) failures.push(`${row.query_id}: one-passage stratum has invalid required evidence`);
  if (row.stratum === 'hard_negative' && (row.judgment.forbidden_chunk_ids.length !== 1 || row.judgment.deprecated_chunk_ids.length !== 1)) failures.push(`${row.query_id}: hard negative needs one forbidden/deprecated old passage`);
  if (row.retrieval_executed) failures.push(`${row.query_id}: retrieval was already executed`);
}
if (failures.length) throw new Error(failures.join('\n'));
const reviewed = draft.map((row) => ({ ...row, review_status: 'codex_reviewed_pending_project_owner', reviewer_id: 'codex-gpt5-primary-review', reviewer_type: 'ai_primary_reviewer_not_independent_human', reviewed_at: '2026-07-22', reviewer_decision: 'accept_after_pretest_semantic_curation', reviewer_notes: 'Evidence roles and query wording were reviewed after weak generic retained candidates were replaced under recorded pre-outcome amendments.', human_signoff_required: true }));
const reviewedText = reviewed.map((row) => JSON.stringify(row)).join('\n') + '\n';
const amendmentRecord = { status: 'frozen_pretest_duplicate_replacement', amendment_id: 'FRESH_TEST_DESIGN_AMENDMENT_03', amendment_sha256: sha256(amendmentText), outcome_data_available_when_recorded: false, policy_model_prompt_or_endpoint_change: false };
const amendmentRecordText = `${JSON.stringify(amendmentRecord, null, 2)}\n`;
await mkdir(OUT, { recursive: true }); await mkdir(REPORT, { recursive: true });
await writeFile(path.join(OUT, 'fresh_test_ledger.jsonl'), reviewedText, 'utf8');
await writeFile(path.join(OUT, 'codex_review_manifest.json'), `${JSON.stringify({ status: 'codex_review_complete_project_owner_required', record_count: reviewed.length, reviewed_ledger_sha256: sha256(reviewedText), source_draft_sha256: sha256(draftText), amendments: ['01', '02', '03'], retrieval_execution_count: 0, limitation: 'Not independent blinded or clinical review.' }, null, 2)}\n`, 'utf8');
await writeFile(path.join(EXP, 'data/configs/v4_fresh_test_frozen/FRESH_TEST_DESIGN_AMENDMENT_03.json'), amendmentRecordText, 'utf8');
const summary = `# Fresh-Test Project-Owner Review Summary\n\nForty Codex-reviewed records are ready for project-owner review. No retrieval has run. Full evidence excerpts are in \`FRESH_TEST_REVIEW_PACKET.md\`.\n\n| Query | Stratum | Pair | Question |\n|---|---|---|---|\n${reviewed.map((row) => `| ${row.query_id} | ${row.stratum} | ${row.candidate_pair_id} | ${row.query_text.replace(/\|/g, '\\|')} |`).join('\n')}\n`;
await writeFile(path.join(REPORT, 'FRESH_TEST_OWNER_REVIEW_SUMMARY.md'), summary, 'utf8');
await writeFile(GUARD, `${JSON.stringify({ ...guard, status: 'fresh_test_codex_reviewed_project_owner_required', design_amendment_03_sha256: sha256(amendmentRecordText), codex_reviewed_ledger_sha256: sha256(reviewedText), final_test_created: false, test_retrieval_execution_count_completed: 0 }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'codex_review_complete_project_owner_required', records: reviewed.length, reviewed_ledger_sha256: sha256(reviewedText), failures }, null, 2));
