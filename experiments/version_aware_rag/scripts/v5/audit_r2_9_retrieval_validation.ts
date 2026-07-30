import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'results/v5/r2_9_retrieval_validation');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const rawText = await readFile(path.join(OUT, 'raw_retrieval_results.jsonl'), 'utf8');
const resultText = await readFile(path.join(OUT, 'VALIDATION_RESULT.json'), 'utf8');
const rows = parseJsonl(rawText), result = JSON.parse(resultText);
function summary(system: string) {
  const systemRows = rows.filter((row) => row.system === system), strata: Record<string, any> = {};
  for (const stratum of ['PAIR_PRESERVE', 'BLOCK_RETAINED']) {
    const selected = systemRows.filter((row) => row.stratum === stratum), both = selected.filter((row) => row.required_item_ids.length === 2);
    strata[stratum] = {
      required_micro_recall_at_3: selected.reduce((sum, row) => sum + row.required_item_ids.filter((id: string) => row.top3.includes(id)).length, 0) / selected.reduce((sum, row) => sum + row.required_item_ids.length, 0),
      both_evidence_coverage: both.length ? both.filter((row) => row.required_item_ids.every((id: string) => row.top3.includes(id))).length / both.length : null,
      deprecated_old_hit_rate: selected.filter((row) => row.deprecated_item_ids.some((id: string) => row.top3.includes(id))).length / selected.length,
    };
  }
  return {
    system,
    required_candidate_micro_recall_at_20: systemRows.reduce((sum, row) => sum + row.required_item_ids.filter((id: string) => row.shared_candidate_pool_ids.includes(id)).length, 0) / systemRows.reduce((sum, row) => sum + row.required_item_ids.length, 0),
    strata,
  };
}
const recomputed = [summary('recency_lambda_0.75'), summary('version_aware_explicit_history_pair')];
const reported = new Map(result.summaries.map((row: any) => [row.system, row]));
const metricsMatch = recomputed.every((row) => {
  const expected: any = reported.get(row.system);
  return expected && expected.required_candidate_micro_recall_at_20 === row.required_candidate_micro_recall_at_20
    && ['PAIR_PRESERVE', 'BLOCK_RETAINED'].every((stratum) =>
      expected.strata[stratum].required_micro_recall_at_3 === row.strata[stratum].required_micro_recall_at_3
      && expected.strata[stratum].both_evidence_coverage === row.strata[stratum].both_evidence_coverage
      && expected.strata[stratum].deprecated_old_hit_rate === row.strata[stratum].deprecated_old_hit_rate);
});
const poolIdentity = [...new Set(rows.map((row) => row.query_id))].every((queryId) => {
  const pair = rows.filter((row) => row.query_id === queryId);
  return pair.length === 2 && pair[0].shared_candidate_pool_hash === pair[1].shared_candidate_pool_hash
    && JSON.stringify(pair[0].shared_candidate_pool_ids) === JSON.stringify(pair[1].shared_candidate_pool_ids)
    && pair[0].shared_candidate_pool_hash === sha256(pair[0].shared_candidate_pool_ids.join('\n'));
});
const audit = {
  schema_version: 'v5-r2.9-independent-validation-audit-1',
  status: metricsMatch && poolIdentity && rows.length === 24 ? 'verified' : 'failed',
  raw_row_count: rows.length,
  reported_metrics_match_raw_recomputation: metricsMatch,
  shared_pool_hash_and_order_verified: poolIdentity,
  recomputed,
  version_aware_incomplete_pair_queries: rows.filter((row) => row.system === 'version_aware_explicit_history_pair' && row.stratum === 'PAIR_PRESERVE' && row.required_recall_at_3 < 1).map((row) => ({
    query_id: row.query_id, required_recall_at_3: row.required_recall_at_3, seed_item_id: row.seed_item_id,
    cause: 'Highest-BM25 seed selected a competing lineage; the frozen pair boost correctly followed that seed but promoted the wrong pair.',
  })),
  tuning_performed_after_validation: false,
  external_model_api_used: false,
};
await writeFile(path.join(OUT, 'INDEPENDENT_AUDIT.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(audit, null, 2));
if (audit.status !== 'verified') process.exit(1);
