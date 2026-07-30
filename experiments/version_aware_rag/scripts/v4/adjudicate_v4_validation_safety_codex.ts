import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const SOURCE = path.join(EXP, 'data/annotations_v4/validation_safety_review/safety_review_ledger.jsonl');
const OUT_DIR = path.join(EXP, 'data/annotations_v4/validation_safety_codex_provisional');
const RESULT_DIR = path.join(EXP, 'results/v4/validation_confirmation');
const RAW = path.join(RESULT_DIR, 'raw_retrieval_results.jsonl');
const RESULT = path.join(RESULT_DIR, 'VALIDATION_CONFIRMATION.json');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const neither = new Set([
  'v4dv-cm-011\0who-potassium-2012-page-25-pass-1-3f0bde22f5',
  'v4dv-cm-011\0who-sat-trans-fat-2023-page-11-pass-0-241c79aa0a',
  'v4dv-cm-011\0who-sat-trans-fat-2023-page-46-pass-0-36ec9de23d',
  'v4dv-ch-009\0who-carbohydrate-2023-page-92-pass-0-445b1fdb0e',
  'v4dv-ch-010\0who-potassium-2012-page-24-pass-2-13b8318d9d',
  'v4dv-ch-012\0who-total-fat-2023-page-32-pass-0-faab747099',
  'v4dv-ch-012\0who-total-fat-2023-page-30-pass-0-fa6fc58d51',
]);

const [sourceText, rawText, resultText] = await Promise.all([readFile(SOURCE, 'utf8'), readFile(RAW, 'utf8'), readFile(RESULT, 'utf8')]);
const source = parseJsonl(sourceText), raw = parseJsonl(rawText), result = JSON.parse(resultText);
const reviewed = source.map((row) => {
  const key = `${row.query_id}\0${row.chunk_id}`;
  const label = row.required_role === 'not_required' && neither.has(key) ? 'neither' : 'citation_safe';
  return { ...row, proposed_safety_label: label, reviewer_label: label, reviewer_notes: label === 'neither' ? 'The passage is not materially responsive to this query, but it is not superseded or unsafe.' : row.required_role === 'not_required' ? 'Compatible WHO guidance that is safe as context, although not required evidence.' : row.reviewer_notes, review_status: 'codex_reviewed_provisional', reviewer_id: 'codex-gpt5-primary-review', reviewer_type: 'ai_primary_reviewer_not_independent_human', reviewed_at: '2026-07-22' };
});
if (reviewed.filter((row) => row.reviewer_label === 'neither').length !== neither.size) throw new Error('A planned neither decision did not match the ledger.');
const reviewedText = reviewed.map((row) => JSON.stringify(row)).join('\n') + '\n';
const labels = new Map<string, Map<string, string>>();
for (const row of reviewed) { const query = labels.get(row.query_id) || new Map(); query.set(row.chunk_id, row.reviewer_label); labels.set(row.query_id, query); }
function safety(system: string) {
  const rows = raw.filter((row) => row.system === system); let stale = 0, forbidden = 0, unsafeQueries = 0;
  for (const row of rows) { const q = labels.get(row.query_id)!; const s = row.retrieved_chunk_ids.filter((id: string) => q.get(id) === 'stale').length; const f = row.retrieved_chunk_ids.filter((id: string) => q.get(id) === 'forbidden').length; stale += s; forbidden += f; if (s + f) unsafeQueries += 1; }
  return { query_count: rows.length, stale_chunk_hit_rate_at_3: stale / (rows.length * 3), forbidden_chunk_hit_rate_at_3: forbidden / (rows.length * 3), stale_or_forbidden_hit_rate_at_3: (stale + forbidden) / (rows.length * 3), stale_or_forbidden_query_rate_at_3: unsafeQueries / rows.length };
}
const recency = safety('recency'), selected = safety('oracle_cross_0.5');
const provisionalPass = selected.stale_or_forbidden_hit_rate_at_3 <= recency.stale_or_forbidden_hit_rate_at_3;
const report = { status: 'codex_validation_safety_review_complete_provisional', reviewer_type: 'ai_primary_reviewer_not_independent_human', counts: Object.fromEntries(['citation_safe', 'neither', 'stale', 'forbidden'].map((label) => [label, reviewed.filter((row) => row.reviewer_label === label).length])), source_ledger_sha256: sha256(sourceText), reviewed_ledger_sha256: sha256(reviewedText), provisional_safety_metrics: { recency, oracle_cross_0_5: selected }, provisional_safety_gate_passed: provisionalPass, owner_signoff_required: true };
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, 'safety_review_ledger.jsonl'), reviewedText, 'utf8');
await writeFile(path.join(RESULT_DIR, 'CODEX_SAFETY_REVIEW.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(path.join(RESULT_DIR, 'CODEX_SAFETY_REVIEW.md'), `# Codex Validation Safety Review (Provisional)\n\n- Citation-safe: ${report.counts.citation_safe}\n- Neither: ${report.counts.neither}\n- Stale: ${report.counts.stale}\n- Forbidden: ${report.counts.forbidden}\n- Provisional safety non-increase: ${provisionalPass ? 'PASS' : 'FAIL'}\n\nThis is not independent blinded or clinical review. Project-owner signoff is required.\n`, 'utf8');
const confirmation = `# Validation Safety Label Confirmation\n\nPlease review the seven non-required candidates classified as \`neither\`. All other 33 candidates are proposed \`citation_safe\`; none are proposed stale or forbidden.\n\n` + reviewed.filter((row) => row.reviewer_label === 'neither').map((row) => `- **${row.query_id} / ${row.candidate_alias}** — \`${row.chunk_id}\`: ${row.reviewer_notes}`).join('\n') + '\n';
await writeFile(path.join(RESULT_DIR, 'SAFETY_LABEL_CONFIRMATION.md'), confirmation, 'utf8');
result.safety_gate_status = 'provisional_pass_pending_project_owner_signoff';
result.provisional_safety_metrics = report.provisional_safety_metrics;
result.full_validation_promotion_gate_passed = false;
await writeFile(RESULT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
