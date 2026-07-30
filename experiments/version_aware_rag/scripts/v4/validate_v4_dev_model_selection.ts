import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const DEV = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits/development.jsonl');
const SEALED = path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl');
const OUT = path.join(EXP, 'results/v4/dev_model_selection');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const failures: string[] = [];
const check = (condition: unknown, message: string) => { if (!condition) failures.push(message); };

const [devText, sealedText, rawText, metricsText, preregText, checksumText] = await Promise.all([
  readFile(DEV, 'utf8'), readFile(SEALED, 'utf8'), readFile(path.join(OUT, 'raw_retrieval_results.jsonl'), 'utf8'),
  readFile(path.join(OUT, 'development_metrics.json'), 'utf8'), readFile(path.join(OUT, 'preregistration.json'), 'utf8'),
  readFile(path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256'), 'utf8'),
]);
const dev = parseJsonl(devText);
const sealedIds = new Set(parseJsonl(sealedText).map((record) => record.draft_id));
const raw = parseJsonl(rawText);
const report = JSON.parse(metricsText);
const prereg = JSON.parse(preregText);
const records = new Map(dev.map((record) => [record.draft_id, record]));

check(dev.length === 16, `expected 16 development records, found ${dev.length}`);
check(raw.every((row) => records.has(row.query_id)), 'raw results contain a non-development query');
check(raw.every((row) => !sealedIds.has(row.query_id)), 'raw results leaked a sealed validation query');
check(prereg.validation_split_read_count === 0, 'validation read count is not zero');
check(prereg.fresh_test_read_count === 0, 'fresh-test read count is not zero');
check(prereg.cross_encoder_execution_status === 'complete', 'cross-encoder status is not complete');
check(report.gate.full_promotion_gate_passed === false, 'full promotion gate was incorrectly passed');
check(report.gate.validation_execution_allowed === false, 'validation was incorrectly unlocked');

const systems = [...new Set(raw.map((row) => row.system))];
check(systems.some((system) => system.startsWith('oracle_cross_')), 'cross-encoder systems are missing');
for (const system of systems) check(raw.filter((row) => row.system === system).length === 16, `${system}: expected 16 rows`);
for (const queryId of records.keys()) {
  const rows = raw.filter((row) => row.query_id === queryId);
  check(new Set(rows.map((row) => row.shared_base_candidate_hash)).size === 1, `${queryId}: shared base hash differs across systems`);
  check(rows.every((row) => row.shared_base_candidate_ids.length === 20), `${queryId}: base candidate budget is not 20`);
  check(new Set(rows.map((row) => JSON.stringify(row.shared_base_candidate_ids))).size === 1, `${queryId}: base candidate IDs differ across systems`);
  const oracleRows = rows.filter((row) => row.system !== 'recency');
  check(new Set(oracleRows.map((row) => row.oracle_candidate_hash)).size === 1, `${queryId}: Oracle candidate hashes differ`);
}

function recompute(system: string, stratum?: string) {
  const rows = raw.filter((row) => row.system === system && (!stratum || row.stratum === stratum));
  let required = 0, hits = 0, retained = 0, retainedHits = 0;
  for (const row of rows) {
    const record = records.get(row.query_id)!;
    const requiredIds = [...record.required_current_chunk_ids, ...record.required_retained_chunk_ids];
    required += requiredIds.length;
    hits += requiredIds.filter((id: string) => row.retrieved_chunk_ids.includes(id)).length;
    retained += record.required_retained_chunk_ids.length;
    retainedHits += record.required_retained_chunk_ids.filter((id: string) => row.retrieved_chunk_ids.includes(id)).length;
  }
  return { requiredRecall: required ? Number((hits / required).toFixed(6)) : 0, retainedRecall: retained ? Number((retainedHits / retained).toFixed(6)) : 0 };
}
for (const system of systems) {
  for (const stratum of ['all', 'conditional_merge', 'compatible_history']) {
    const value = recompute(system, stratum === 'all' ? undefined : stratum);
    check(value.requiredRecall === report.metrics[system][stratum].required_micro_recall_at_3, `${system}/${stratum}: required recall mismatch`);
    check(value.retainedRecall === report.metrics[system][stratum].retained_required_micro_recall_at_3, `${system}/${stratum}: retained recall mismatch`);
  }
}

for (const line of checksumText.trim().split('\n')) {
  const [expected, ...nameParts] = line.trim().split(/\s+/);
  const name = nameParts.join(' ');
  const content = await readFile(path.join(OUT, name));
  check(sha256(content) === expected, `${name}: artifact checksum mismatch`);
}

const audit = {
  status: failures.length === 0 ? 'verified_development_cross_complete' : 'invalid',
  development_records: dev.length,
  systems,
  raw_rows: raw.length,
  validation_query_overlap: raw.filter((row) => sealedIds.has(row.query_id)).length,
  shared_candidate_pool_checks_passed: !failures.some((failure) => failure.includes('base candidate')),
  independently_recomputed_metrics: true,
  selected_candidate: report.gate.development_selected_candidate,
  full_promotion_gate_passed: false,
  blockers: ['missing_query_level_stale_and_forbidden_labels'],
  failures,
};
await writeFile(path.join(OUT, 'DEVELOPMENT_MODEL_SELECTION_AUDIT.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(audit, null, 2));
if (failures.length) process.exitCode = 1;
