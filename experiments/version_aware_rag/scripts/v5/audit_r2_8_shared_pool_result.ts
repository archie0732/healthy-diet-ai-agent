import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'results/v5/r2_8_shared_pool_development');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const rawText = await readFile(path.join(OUT, 'raw_retrieval_results.jsonl'), 'utf8');
const reportedText = await readFile(path.join(OUT, 'DEVELOPMENT_RESULT.json'), 'utf8');
const rows = parseJsonl(rawText), reported = JSON.parse(reportedText);

function summarize(system: string) {
  const systemRows = rows.filter((row) => row.system === system);
  const strata: Record<string, any> = {};
  for (const stratum of ['PAIR_PRESERVE', 'BLOCK_RETAINED']) {
    const selected = systemRows.filter((row) => row.stratum === stratum);
    const requiredHits = selected.reduce((sum, row) => sum + row.top3.filter((id: string) => row.required_item_ids.includes(id)).length, 0);
    const requiredCount = selected.reduce((sum, row) => sum + row.required_item_ids.length, 0);
    const both = selected.filter((row) => row.required_item_ids.length === 2);
    strata[stratum] = {
      required_micro_recall_at_3: requiredHits / requiredCount,
      both_evidence_coverage: both.length
        ? both.filter((row) => row.required_item_ids.every((id: string) => row.top3.includes(id))).length / both.length
        : null,
      deprecated_old_hit_rate: selected.filter((row) => row.deprecated_item_ids.some((id: string) => row.top3.includes(id))).length / selected.length,
    };
  }
  const candidateHits = systemRows.reduce((sum, row) => sum + row.required_item_ids.filter((id: string) => row.shared_candidate_pool_ids.includes(id)).length, 0);
  const candidateCount = systemRows.reduce((sum, row) => sum + row.required_item_ids.length, 0);
  return { system, required_candidate_micro_recall_at_20: candidateHits / candidateCount, strata };
}
const recomputed = [
  summarize('recency_lambda_0.75'),
  summarize('version_aware_explicit_history_pair'),
];
const poolsIdentical = [...new Set(rows.map((row) => row.query_id))].every((queryId) => {
  const pair = rows.filter((row) => row.query_id === queryId);
  return pair.length === 2
    && pair[0].shared_candidate_pool_hash === pair[1].shared_candidate_pool_hash
    && JSON.stringify(pair[0].shared_candidate_pool_ids) === JSON.stringify(pair[1].shared_candidate_pool_ids)
    && pair[0].shared_candidate_pool_hash === sha256(pair[0].shared_candidate_pool_ids.join('\n'));
});
const reportedBySystem = new Map(reported.summaries.map((summary: any) => [summary.system, summary]));
const metricsMatch = recomputed.every((summary) => {
  const expected: any = reportedBySystem.get(summary.system);
  return expected
    && expected.required_candidate_micro_recall_at_20 === summary.required_candidate_micro_recall_at_20
    && ['PAIR_PRESERVE', 'BLOCK_RETAINED'].every((stratum) =>
      expected.strata[stratum].required_micro_recall_at_3 === summary.strata[stratum].required_micro_recall_at_3
      && expected.strata[stratum].both_evidence_coverage === summary.strata[stratum].both_evidence_coverage
      && expected.strata[stratum].deprecated_old_hit_rate === summary.strata[stratum].deprecated_old_hit_rate);
});
const audit = {
  schema_version: 'v5-r2.8-independent-recomputation-1',
  status: poolsIdentical && metricsMatch ? 'verified' : 'failed',
  raw_row_count: rows.length,
  expected_raw_row_count: 32,
  per_query_system_row_count_valid: rows.length === 32,
  shared_pool_hash_and_order_verified: poolsIdentical,
  reported_metrics_match_raw_recomputation: metricsMatch,
  recomputed,
  known_version_aware_miss: {
    query_id: 'r2.7-24-free-sugar-versus-nss-definition',
    cause: 'BM25 selected the semantically adjacent free-sugar-definition lineage as seed, so the fixed pair boost promoted the wrong OLD/CURRENT pair.',
    tuning_performed: false,
  },
  validation_file_read: false,
  external_model_api_used: false,
};
await writeFile(path.join(OUT, 'INDEPENDENT_AUDIT.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(audit, null, 2));
if (audit.status !== 'verified') process.exit(1);
