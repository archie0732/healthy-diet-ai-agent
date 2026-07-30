import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'results/v4/validation_confirmation');
const VALIDATION = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl');
const APPROVED = path.join(EXP, 'data/annotations_v4/validation_safety_user_approved/safety_review_ledger.jsonl');
const MANIFEST = path.join(EXP, 'data/configs/v4_validation_frozen/FREEZE_MANIFEST.json');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const round = (value: number) => Number(value.toFixed(6));
const failures: string[] = [];
const check = (condition: unknown, message: string) => { if (!condition) failures.push(message); };

const [validationText, rawText, resultText, approvedText, manifestText, checksumText] = await Promise.all([
  readFile(VALIDATION, 'utf8'), readFile(path.join(OUT, 'raw_retrieval_results.jsonl'), 'utf8'),
  readFile(path.join(OUT, 'VALIDATION_CONFIRMATION.json'), 'utf8'), readFile(APPROVED, 'utf8'),
  readFile(MANIFEST, 'utf8'), readFile(path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256'), 'utf8'),
]);
const records = parseJsonl(validationText), raw = parseJsonl(rawText), approved = parseJsonl(approvedText);
const result = JSON.parse(resultText), manifest = JSON.parse(manifestText);
const byId = new Map(records.map((row) => [row.draft_id, row]));
check(records.length === 8, `expected 8 validation records, found ${records.length}`);
check(raw.length === 16, `expected 16 raw rows, found ${raw.length}`);
check(approved.length === 40, `expected 40 approved safety rows, found ${approved.length}`);
check(manifest.validation_execution_count_completed === 1, 'validation completion count is not one');
check(manifest.validation_rerun_allowed === false, 'validation rerun guard is not closed');
check(manifest.fresh_test_read_allowed === false, 'fresh test is not sealed');
check(result.full_validation_promotion_gate_passed === true, 'full validation promotion gate did not pass');
for (const record of records) {
  const rows = raw.filter((row) => row.query_id === record.draft_id);
  check(rows.length === 2, `${record.draft_id}: expected two system rows`);
  check(new Set(rows.map((row) => row.shared_base_candidate_hash)).size === 1, `${record.draft_id}: base hashes differ`);
  check(rows.every((row) => row.shared_base_candidate_ids.length === 20), `${record.draft_id}: candidate budget is not 20`);
  check(new Set(rows.map((row) => JSON.stringify(row.shared_base_candidate_ids))).size === 1, `${record.draft_id}: candidate IDs differ`);
}
function metric(system: string, stratum?: string) {
  const rows = raw.filter((row) => row.system === system && (!stratum || row.stratum === stratum));
  let required = 0, hits = 0, current = 0, currentHits = 0, retained = 0, retainedHits = 0;
  for (const row of rows) {
    const record = byId.get(row.query_id)!;
    const req = [...record.required_current_chunk_ids, ...record.required_retained_chunk_ids];
    required += req.length; hits += req.filter((id: string) => row.retrieved_chunk_ids.includes(id)).length;
    current += record.required_current_chunk_ids.length; currentHits += record.required_current_chunk_ids.filter((id: string) => row.retrieved_chunk_ids.includes(id)).length;
    retained += record.required_retained_chunk_ids.length; retainedHits += record.required_retained_chunk_ids.filter((id: string) => row.retrieved_chunk_ids.includes(id)).length;
  }
  return { query_count: rows.length, required_micro_recall_at_3: round(hits / required), current_required_micro_recall_at_3: round(currentHits / current), retained_required_micro_recall_at_3: round(retainedHits / retained) };
}
for (const system of ['recency', 'oracle_cross_0.5']) for (const stratum of ['all', 'conditional_merge', 'compatible_history']) {
  const actual = metric(system, stratum === 'all' ? undefined : stratum);
  check(JSON.stringify(actual) === JSON.stringify(result.metrics[system][stratum]), `${system}/${stratum}: independently recomputed metric mismatch`);
}
for (const line of checksumText.trim().split('\n')) {
  const [expected, ...parts] = line.trim().split(/\s+/), file = parts.join(' ');
  check(sha256(await readFile(path.join(OUT, file))) === expected, `${file}: checksum mismatch`);
}
const audit = {
  status: failures.length ? 'invalid' : 'verified_validation_confirmation',
  validation_records: records.length, raw_rows: raw.length, approved_safety_rows: approved.length,
  candidate_pool_equality_verified: !failures.some((item) => item.includes('candidate') || item.includes('base hash')),
  metrics_independently_recomputed: true, artifact_checksums_verified: !failures.some((item) => item.includes('checksum')),
  full_validation_promotion_gate_passed: result.full_validation_promotion_gate_passed,
  validation_rerun_allowed: manifest.validation_rerun_allowed, fresh_test_read_allowed: manifest.fresh_test_read_allowed,
  protocol_deviation: result.protocol_deviation, failures,
};
await writeFile(path.join(OUT, 'VALIDATION_CONFIRMATION_AUDIT.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(audit, null, 2));
if (failures.length) process.exitCode = 1;
