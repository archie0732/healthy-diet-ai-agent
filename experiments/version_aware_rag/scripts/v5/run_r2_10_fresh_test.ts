import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = path.join(EXP, 'data/configs/v5_r2_10_fresh_test');
const POLICY = path.join(EXP, 'data/configs/v5_r2_10_frozen_policy/FROZEN_POLICY_PACKAGE.json');
const OUT = path.join(EXP, 'results/v5/r2_10_fresh_test');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const STOP = new Set('what are the and for daily serving goals consuming recommendation intake limit limitations rule should with this that from about how many of is a in or to current historical historically was were which does do did it its'.split(' '));
const tokenize = (text: string) => text.toLowerCase().split(/\W+/).filter((word) => word.length > 2 && !STOP.has(word));
type Item = { item_id: string; lineage_group: string; role: 'OLD' | 'CURRENT'; year: number; text: string; source: unknown };

function bm25(query: string, corpus: Item[]) {
  const documents = corpus.map((item) => tokenize(item.text));
  const lengths = documents.map((tokens) => tokens.length);
  const averageLength = lengths.reduce((sum, value) => sum + value, 0) / Math.max(1, lengths.length);
  const frequencies = new Map<string, number>();
  for (const document of documents) for (const term of new Set(document)) frequencies.set(term, (frequencies.get(term) || 0) + 1);
  const queryTerms = tokenize(query);
  return corpus.map((item, index) => {
    const tf = new Map<string, number>();
    for (const term of documents[index]) tf.set(term, (tf.get(term) || 0) + 1);
    let score = 0;
    for (const term of queryTerms) {
      const termFrequency = tf.get(term) || 0;
      if (!termFrequency) continue;
      const df = frequencies.get(term) || 0;
      const idf = Math.log((corpus.length - df + 0.5) / (df + 0.5) + 1);
      score += idf * ((termFrequency * 2.2) / (termFrequency + 1.2 * (0.25 + 0.75 * lengths[index] / Math.max(1, averageLength))));
    }
    return { item, score };
  }).sort((a, b) => b.score - a.score || a.item.item_id.localeCompare(b.item.item_id));
}

const [inputsText, manifestText, guardText, policyText, signoffText] = await Promise.all([
  readFile(path.join(CONFIG, 'retrieval_inputs.jsonl'), 'utf8'),
  readFile(path.join(CONFIG, 'MANIFEST.json'), 'utf8'),
  readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8'),
  readFile(POLICY, 'utf8'),
  readFile(path.join(CONFIG, 'PROJECT_OWNER_SIGNOFF.json'), 'utf8'),
]);
const manifest = JSON.parse(manifestText);
const guard = JSON.parse(guardText);
const policy = JSON.parse(policyText);
if (
  guard.status !== 'r2_10_one_shot_fresh_test_unlocked'
  || guard.fresh_test_execution_count !== 0
  || !guard.judgments_may_be_read_only_after_all_retrieval_calls
  || guard.tuning_after_fresh_test_allowed
  || guard.external_model_api_allowed
  || sha256(manifestText) !== guard.manifest_sha256
  || sha256(inputsText) !== manifest.retrieval_inputs_sha256
  || sha256(policyText) !== manifest.frozen_policy_sha256
  || sha256(signoffText) !== manifest.owner_signoff_sha256
  || policy.retrieval.candidate_pool_size !== 20
  || policy.retrieval.top_k !== 3
  || policy.retrieval.recency_lambda !== 0.75
  || policy.retrieval.history_pair_boost !== 0.75
) throw new Error('R2.10 one-shot fresh-test guard failed');

const historyPatterns = policy.detector_patterns.map((pattern: string) => new RegExp(pattern, 'i'));
const isExplicitHistory = (query: string) => historyPatterns.some((pattern: RegExp) => pattern.test(query));
const inputs = parseJsonl(inputsText);
const corpusMap = new Map<string, Item>();
for (const input of inputs) for (const item of input.evidence_items) corpusMap.set(item.item_id, item);
const corpus = [...corpusMap.values()];
if (corpus.length !== manifest.corpus_item_count) throw new Error('R2.10 corpus count mismatch');

const retrievalRows: any[] = [];
for (const input of inputs) {
  const pool = bm25(input.query, corpus).slice(0, policy.retrieval.candidate_pool_size);
  const ids = pool.map((entry) => entry.item.item_id);
  const poolHash = sha256(ids.join('\n'));
  const values = pool.map((entry) => entry.score);
  const maxBase = Math.max(...values), minBase = Math.min(...values);
  const normalized = pool.map((entry) => ({
    ...entry.item,
    bm25: entry.score,
    base_norm: maxBase > minBase ? (entry.score - minBase) / (maxBase - minBase) : 0,
    recency_norm: (entry.item.year - 2015) / 11,
  }));
  const seed = normalized[0];
  const explicitHistory = isExplicitHistory(input.query);
  const scored = normalized.map((item) => {
    const pairBoost = explicitHistory
      && (item.item_id === seed.item_id || (item.lineage_group === seed.lineage_group && item.role !== seed.role))
      ? policy.retrieval.history_pair_boost : 0;
    const recencyScore = item.base_norm + policy.retrieval.recency_lambda * item.recency_norm;
    return {
      ...item,
      recency_score: recencyScore,
      pair_boost: pairBoost,
      version_aware_score: explicitHistory ? item.base_norm + pairBoost : recencyScore,
    };
  });
  const recency = [...scored].sort((a, b) => b.recency_score - a.recency_score || a.item_id.localeCompare(b.item_id));
  const versionAware = [...scored].sort((a, b) => b.version_aware_score - a.version_aware_score || a.item_id.localeCompare(b.item_id));
  const common = {
    query_id: input.query_id,
    stratum: input.stratum,
    query: input.query,
    explicit_historical_intent: explicitHistory,
    shared_candidate_pool_ids: ids,
    shared_candidate_pool_hash: poolHash,
    shared_candidate_pool_size: ids.length,
    seed_item_id: seed.item_id,
    seed_lineage_group: seed.lineage_group,
    full_candidate_scores: scored.map((item) => ({
      item_id: item.item_id,
      lineage_group: item.lineage_group,
      role: item.role,
      year: item.year,
      bm25: item.bm25,
      base_norm: item.base_norm,
      recency_norm: item.recency_norm,
      recency_score: item.recency_score,
      pair_boost: item.pair_boost,
      version_aware_score: item.version_aware_score,
    })),
  };
  retrievalRows.push({ ...common, system: 'recency_lambda_0.75', top3: recency.slice(0, 3).map((item) => item.item_id) });
  retrievalRows.push({ ...common, system: 'version_aware_explicit_history_pair', top3: versionAware.slice(0, 3).map((item) => item.item_id) });
}

const allRetrievalCallsComplete = retrievalRows.length === inputs.length * 2;
if (!allRetrievalCallsComplete) throw new Error('Cannot read judgments before all retrieval calls complete');
const judgmentsText = await readFile(path.join(CONFIG, 'judgments.sealed.jsonl'), 'utf8');
if (sha256(judgmentsText) !== manifest.judgments_sealed_sha256) throw new Error('R2.10 sealed judgment checksum mismatch');
const judgmentMap = new Map(parseJsonl(judgmentsText).map((row: any) => [row.query_id, row]));
const evaluated = retrievalRows.map((row) => {
  const judgment: any = judgmentMap.get(row.query_id);
  const required = new Set<string>(judgment.required_item_ids);
  const deprecated = new Set<string>(judgment.deprecated_item_ids);
  const hits = row.top3.filter((id: string) => required.has(id)).length;
  return {
    ...row,
    required_item_ids: judgment.required_item_ids,
    deprecated_item_ids: judgment.deprecated_item_ids,
    required_hits_at_3: hits,
    required_count: required.size,
    required_recall_at_3: hits / required.size,
    both_evidence_coverage: required.size === 2 ? Number(hits === 2) : null,
    deprecated_old_hit: Number(row.top3.some((id: string) => deprecated.has(id))),
    candidate_required_hits_at_20: row.shared_candidate_pool_ids.filter((id: string) => required.has(id)).length,
    candidate_required_count: required.size,
  };
});

const STRATA = ['explicit_history', 'conditional_merge', 'current_only', 'hard_negative_current'];
function summarize(system: string) {
  const rows = evaluated.filter((row) => row.system === system);
  const strata: Record<string, any> = {};
  for (const stratum of STRATA) {
    const selected = rows.filter((row) => row.stratum === stratum);
    const both = selected.filter((row) => row.both_evidence_coverage !== null);
    strata[stratum] = {
      query_count: selected.length,
      required_micro_recall_at_3: selected.reduce((sum, row) => sum + row.required_hits_at_3, 0)
        / selected.reduce((sum, row) => sum + row.required_count, 0),
      both_evidence_coverage: both.length
        ? both.reduce((sum, row) => sum + row.both_evidence_coverage, 0) / both.length : null,
      deprecated_old_hit_rate: selected.reduce((sum, row) => sum + row.deprecated_old_hit, 0) / selected.length,
      required_candidate_micro_recall_at_20: selected.reduce((sum, row) => sum + row.candidate_required_hits_at_20, 0)
        / selected.reduce((sum, row) => sum + row.candidate_required_count, 0),
    };
  }
  return {
    system,
    overall_required_micro_recall_at_3: rows.reduce((sum, row) => sum + row.required_hits_at_3, 0)
      / rows.reduce((sum, row) => sum + row.required_count, 0),
    overall_deprecated_old_hit_rate: rows.reduce((sum, row) => sum + row.deprecated_old_hit, 0) / rows.length,
    required_candidate_micro_recall_at_20: rows.reduce((sum, row) => sum + row.candidate_required_hits_at_20, 0)
      / rows.reduce((sum, row) => sum + row.candidate_required_count, 0),
    strata,
  };
}
const recency = summarize('recency_lambda_0.75');
const versionAware = summarize('version_aware_explicit_history_pair');
const sharedIdentity = inputs.every((input: any) => {
  const rows = evaluated.filter((row) => row.query_id === input.query_id);
  return rows.length === 2
    && rows[0].shared_candidate_pool_hash === rows[1].shared_candidate_pool_hash
    && JSON.stringify(rows[0].shared_candidate_pool_ids) === JSON.stringify(rows[1].shared_candidate_pool_ids);
});
const gateChecks = {
  explicit_history_required_micro_recall_strictly_improves:
    versionAware.strata.explicit_history.required_micro_recall_at_3 > recency.strata.explicit_history.required_micro_recall_at_3,
  explicit_history_both_evidence_coverage_strictly_improves:
    versionAware.strata.explicit_history.both_evidence_coverage > recency.strata.explicit_history.both_evidence_coverage,
  conditional_merge_required_micro_recall_noninferior:
    versionAware.strata.conditional_merge.required_micro_recall_at_3 >= recency.strata.conditional_merge.required_micro_recall_at_3,
  current_only_required_micro_recall_noninferior:
    versionAware.strata.current_only.required_micro_recall_at_3 >= recency.strata.current_only.required_micro_recall_at_3,
  hard_negative_required_micro_recall_noninferior:
    versionAware.strata.hard_negative_current.required_micro_recall_at_3 >= recency.strata.hard_negative_current.required_micro_recall_at_3,
  deprecated_old_hit_rate_not_increased:
    versionAware.overall_deprecated_old_hit_rate <= recency.overall_deprecated_old_hit_rate,
  required_candidate_micro_recall_at_20_at_least_0_90:
    versionAware.required_candidate_micro_recall_at_20 >= 0.9,
  shared_candidate_pool_identity_100_percent: sharedIdentity,
};
const gatePassed = Object.values(gateChecks).every(Boolean);
const result = {
  schema_version: 'v5-r2.10-one-shot-fresh-test-result-1',
  status: gatePassed ? 'fresh_test_passed_scope_limited' : 'fresh_test_failed_locked_no_retuning',
  fresh_test_execution_count: 1,
  tuning_after_fresh_test_allowed: false,
  external_model_api_used: false,
  all_retrieval_calls_completed_before_judgment_read: allRetrievalCallsComplete,
  judgment_file_read_count: 1,
  frozen_policy_sha256: sha256(policyText),
  owner_signoff_sha256: sha256(signoffText),
  summaries: [recency, versionAware],
  gate_checks: gateChecks,
  gate_passed: gatePassed,
  promotion_scope: gatePassed ? 'fresh_held_out_explicit_historical_intent_retrieval_advantage' : 'none',
  prohibited_claims: [
    'overall Version-Aware superiority across all query types',
    'implicit semantic conditional-merge superiority',
    'answer-level superiority',
  ],
  reviewer_limitation: 'The project owner approved the packet, but review was not independent blinded or clinical review.',
};
await mkdir(OUT, { recursive: true });
const rawText = `${evaluated.map((row) => JSON.stringify(row)).join('\n')}\n`;
const resultText = `${JSON.stringify(result, null, 2)}\n`;
await Promise.all([
  writeFile(path.join(OUT, 'raw_retrieval_results.jsonl'), rawText, 'utf8'),
  writeFile(path.join(OUT, 'FRESH_TEST_RESULT.json'), resultText, 'utf8'),
]);
await writeFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), `${JSON.stringify({
  ...guard,
  status: gatePassed ? 'r2_10_fresh_test_passed_locked_scope_limited' : 'r2_10_fresh_test_failed_locked_no_retuning',
  fresh_test_execution_count: 1,
  fresh_test_result_sha256: sha256(resultText),
  raw_retrieval_sha256: sha256(rawText),
  tuning_after_fresh_test_allowed: false,
}, null, 2)}\n`, 'utf8');
const frozenGuard = JSON.parse(await readFile(path.join(EXP, 'data/configs/v5_r2_10_frozen_policy/FRESH_TEST_GUARD.json'), 'utf8'));
await writeFile(path.join(EXP, 'data/configs/v5_r2_10_frozen_policy/FRESH_TEST_GUARD.json'), `${JSON.stringify({
  ...frozenGuard,
  status: gatePassed ? 'fresh_test_executed_once_passed_locked' : 'fresh_test_executed_once_failed_locked',
  fresh_test_execution_count: 1,
  retrieval_result_exists: true,
  fresh_test_result_sha256: sha256(resultText),
  tuning_allowed: false,
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
