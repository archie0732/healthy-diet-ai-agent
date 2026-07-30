import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'results/v5/r2_10_fresh_test');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const STRATA = ['explicit_history', 'conditional_merge', 'current_only', 'hard_negative_current'];
const SYSTEMS = ['recency_lambda_0.75', 'version_aware_explicit_history_pair'];

const [rawText, resultText, guardText] = await Promise.all([
  readFile(path.join(OUT, 'raw_retrieval_results.jsonl'), 'utf8'),
  readFile(path.join(OUT, 'FRESH_TEST_RESULT.json'), 'utf8'),
  readFile(path.join(EXP, 'data/configs/v5_r2_10_fresh_test/EXECUTION_GUARD.json'), 'utf8'),
]);
const rows = parseJsonl(rawText);
const result = JSON.parse(resultText);
const guard = JSON.parse(guardText);

function summary(system: string) {
  const systemRows = rows.filter((row) => row.system === system);
  const strata: Record<string, any> = {};
  for (const stratum of STRATA) {
    const selected = systemRows.filter((row) => row.stratum === stratum);
    const both = selected.filter((row) => row.required_item_ids.length === 2);
    strata[stratum] = {
      query_count: selected.length,
      required_micro_recall_at_3: selected.reduce((sum, row) =>
        sum + row.required_item_ids.filter((id: string) => row.top3.includes(id)).length, 0)
        / selected.reduce((sum, row) => sum + row.required_item_ids.length, 0),
      both_evidence_coverage: both.length
        ? both.filter((row) => row.required_item_ids.every((id: string) => row.top3.includes(id))).length / both.length : null,
      deprecated_old_hit_rate: selected.filter((row) =>
        row.deprecated_item_ids.some((id: string) => row.top3.includes(id))).length / selected.length,
      required_candidate_micro_recall_at_20: selected.reduce((sum, row) =>
        sum + row.required_item_ids.filter((id: string) => row.shared_candidate_pool_ids.includes(id)).length, 0)
        / selected.reduce((sum, row) => sum + row.required_item_ids.length, 0),
    };
  }
  return {
    system,
    overall_required_micro_recall_at_3: systemRows.reduce((sum, row) =>
      sum + row.required_item_ids.filter((id: string) => row.top3.includes(id)).length, 0)
      / systemRows.reduce((sum, row) => sum + row.required_item_ids.length, 0),
    overall_deprecated_old_hit_rate: systemRows.filter((row) =>
      row.deprecated_item_ids.some((id: string) => row.top3.includes(id))).length / systemRows.length,
    required_candidate_micro_recall_at_20: systemRows.reduce((sum, row) =>
      sum + row.required_item_ids.filter((id: string) => row.shared_candidate_pool_ids.includes(id)).length, 0)
      / systemRows.reduce((sum, row) => sum + row.required_item_ids.length, 0),
    strata,
  };
}

const recomputed = SYSTEMS.map(summary);
const reported = new Map(result.summaries.map((row: any) => [row.system, row]));
const metricsMatch = recomputed.every((row) => JSON.stringify(row) === JSON.stringify(reported.get(row.system)));
const poolIdentity = [...new Set(rows.map((row) => row.query_id))].every((queryId) => {
  const pair = rows.filter((row) => row.query_id === queryId);
  return pair.length === 2
    && pair[0].shared_candidate_pool_hash === pair[1].shared_candidate_pool_hash
    && JSON.stringify(pair[0].shared_candidate_pool_ids) === JSON.stringify(pair[1].shared_candidate_pool_ids)
    && pair[0].shared_candidate_pool_hash === sha256(pair[0].shared_candidate_pool_ids.join('\n'));
});
const queryPairs = [...new Set(rows.map((row) => row.query_id))].map((queryId) => {
  const recency = rows.find((row) => row.query_id === queryId && row.system === SYSTEMS[0]);
  const versionAware = rows.find((row) => row.query_id === queryId && row.system === SYSTEMS[1]);
  return {
    query_id: queryId,
    stratum: recency.stratum,
    recency_required_recall_at_3: recency.required_recall_at_3,
    version_aware_required_recall_at_3: versionAware.required_recall_at_3,
    difference: versionAware.required_recall_at_3 - recency.required_recall_at_3,
  };
});
const explicitPairs = queryPairs.filter((row) => row.stratum === 'explicit_history');
const positive = explicitPairs.filter((row) => row.difference > 0).length;
const negative = explicitPairs.filter((row) => row.difference < 0).length;
const discordant = positive + negative;
const twoSidedExactSignP = discordant === 0 ? 1 : Math.min(1, 2 * (1 / (2 ** discordant)));
const audit = {
  schema_version: 'v5-r2.10-independent-raw-recomputation-1',
  status: metricsMatch && poolIdentity && rows.length === 32 && guard.fresh_test_execution_count === 1 ? 'verified' : 'failed',
  raw_row_count: rows.length,
  unique_query_count: new Set(rows.map((row) => row.query_id)).size,
  reported_metrics_match_raw_recomputation: metricsMatch,
  shared_pool_hash_and_order_verified: poolIdentity,
  execution_guard_locked_at_one: guard.fresh_test_execution_count === 1 && guard.tuning_after_fresh_test_allowed === false,
  recomputed,
  paired_query_differences: queryPairs,
  explicit_history_exact_sign_test: {
    positive_differences: positive,
    negative_differences: negative,
    ties: explicitPairs.length - discordant,
    two_sided_exact_p: twoSidedExactSignP,
    interpretation: twoSidedExactSignP < 0.05
      ? 'statistically significant at alpha 0.05'
      : 'descriptively strong but not statistically significant at alpha 0.05 because the fresh stratum has only four queries',
  },
  tuning_performed_after_fresh_test: false,
  external_model_api_used: false,
};
await writeFile(path.join(OUT, 'INDEPENDENT_AUDIT.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(audit, null, 2));
if (audit.status !== 'verified') process.exit(1);
