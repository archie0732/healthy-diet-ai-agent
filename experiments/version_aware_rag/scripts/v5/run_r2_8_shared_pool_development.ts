import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = path.join(EXP, 'data/configs/v5_r2_8_shared_pool_development');
const OUT = path.join(EXP, 'results/v5/r2_8_shared_pool_development');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const STOP = new Set('what are the and for daily serving goals consuming recommendation intake limit limitations rule should with this that from about how many of is a in or to current historical historically was were which does do did it its'.split(' '));
const tokenize = (text: string) => text.toLowerCase().split(/\W+/).filter((word) => word.length > 2 && !STOP.has(word));
const historyPatterns = [
  /\b2003\b/i, /\bhistorical(?:ly)?\b/i, /\bprevious(?:ly)?\b/i, /\bearlier\b/i, /\bformerly\b/i,
  /\bhow did\b.{0,100}\bchange\b/i, /\bfrom\b.{0,100}\bto (?:the )?current\b/i,
];
const isExplicitHistory = (query: string) => historyPatterns.some((pattern) => pattern.test(query));

type Item = { item_id: string; lineage_group: string; role: 'OLD' | 'CURRENT'; year: number; text: string; source: any };
type Scored = Item & { bm25: number; base_norm: number; recency_norm: number; recency_score: number; version_aware_score: number; pair_boost: number };
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
      const documentFrequency = frequencies.get(term) || 0;
      const idf = Math.log((corpus.length - documentFrequency + 0.5) / (documentFrequency + 0.5) + 1);
      score += idf * ((termFrequency * 2.2) / (termFrequency + 1.2 * (0.25 + 0.75 * lengths[index] / Math.max(1, averageLength))));
    }
    return { item, score };
  }).sort((a, b) => b.score - a.score || a.item.item_id.localeCompare(b.item.item_id));
}

const [inputsText, manifestText, guardText] = await Promise.all([
  readFile(path.join(CONFIG, 'retrieval_inputs.jsonl'), 'utf8'),
  readFile(path.join(CONFIG, 'MANIFEST.json'), 'utf8'),
  readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8'),
]);
const manifest = JSON.parse(manifestText), guard = JSON.parse(guardText);
if (
  guard.status !== 'r2_8_development_retrieval_unlocked'
  || guard.retrieval_execution_count !== 0
  || !guard.judgments_may_be_read_only_after_all_retrieval_calls
  || guard.external_model_api_allowed
  || sha256(inputsText) !== manifest.retrieval_inputs_sha256
) throw new Error('R2.8 retrieval guard failed');

const inputs = parseJsonl(inputsText);
const corpusMap = new Map<string, Item>();
for (const input of inputs) for (const item of input.evidence_items) corpusMap.set(item.item_id, item);
const corpus = [...corpusMap.values()];
if (corpus.length !== manifest.corpus_item_count) throw new Error('R2.8 corpus item count mismatch');

let retrievalCallsComplete = false;
let judgmentFileReadCount = 0;
const retrievalRows: any[] = [];
for (const input of inputs) {
  const ranked = bm25(input.query, corpus);
  const pool = ranked.slice(0, manifest.candidate_pool_size);
  const poolIds = pool.map((entry) => entry.item.item_id);
  const poolHash = sha256(poolIds.join('\n'));
  const scores = pool.map((entry) => entry.score);
  const maxBase = Math.max(...scores), minBase = Math.min(...scores);
  const normalized = pool.map((entry) => ({
    ...entry.item,
    bm25: entry.score,
    base_norm: maxBase > minBase ? (entry.score - minBase) / (maxBase - minBase) : 0,
    recency_norm: (entry.item.year - 2015) / (2026 - 2015),
  }));
  const seed = normalized[0];
  const explicitHistory = isExplicitHistory(input.query);
  const scored: Scored[] = normalized.map((item) => {
    const isSeedOrMate = item.item_id === seed.item_id || (item.lineage_group === seed.lineage_group && item.role !== seed.role);
    const pairBoost = explicitHistory && isSeedOrMate ? manifest.history_pair_boost : 0;
    const recencyScore = item.base_norm + manifest.recency_lambda * item.recency_norm;
    const versionAwareScore = explicitHistory ? item.base_norm + pairBoost : recencyScore;
    return { ...item, recency_score: recencyScore, version_aware_score: versionAwareScore, pair_boost: pairBoost };
  });
  const recency = [...scored].sort((a, b) => b.recency_score - a.recency_score || a.item_id.localeCompare(b.item_id));
  const versionAware = [...scored].sort((a, b) => b.version_aware_score - a.version_aware_score || a.item_id.localeCompare(b.item_id));
  const common = {
    query_id: input.query_id,
    query: input.query,
    explicit_historical_intent: explicitHistory,
    shared_candidate_pool_ids: poolIds,
    shared_candidate_pool_hash: poolHash,
    shared_candidate_pool_size: poolIds.length,
    seed_item_id: seed.item_id,
    seed_lineage_group: seed.lineage_group,
    full_candidate_scores: scored.map((item) => ({
      item_id: item.item_id, lineage_group: item.lineage_group, role: item.role, year: item.year,
      bm25: item.bm25, base_norm: item.base_norm, recency_norm: item.recency_norm,
      recency_score: item.recency_score, pair_boost: item.pair_boost, version_aware_score: item.version_aware_score,
    })),
  };
  retrievalRows.push({ ...common, system: 'recency_lambda_0.75', top3: recency.slice(0, 3).map((item) => item.item_id) });
  retrievalRows.push({ ...common, system: 'version_aware_explicit_history_pair', top3: versionAware.slice(0, 3).map((item) => item.item_id) });
}
retrievalCallsComplete = true;

if (!retrievalCallsComplete) throw new Error('Judgments cannot be read before retrieval completion');
const judgmentsText = await readFile(path.join(CONFIG, 'judgments.sealed.jsonl'), 'utf8');
judgmentFileReadCount++;
if (sha256(judgmentsText) !== manifest.judgments_sealed_sha256) throw new Error('R2.8 judgment checksum mismatch');
const judgments = parseJsonl(judgmentsText);
const judgmentMap = new Map(judgments.map((judgment: any) => [judgment.query_id, judgment]));

const evaluatedRows = retrievalRows.map((row) => {
  const judgment: any = judgmentMap.get(row.query_id);
  if (!judgment) throw new Error(`Missing judgment ${row.query_id}`);
  const required = new Set<string>(judgment.required_item_ids);
  const deprecated = new Set<string>(judgment.deprecated_item_ids);
  const requiredHits = row.top3.filter((id: string) => required.has(id)).length;
  const candidateRequiredHits = row.shared_candidate_pool_ids.filter((id: string) => required.has(id)).length;
  return {
    ...row,
    stratum: judgment.stratum,
    required_item_ids: judgment.required_item_ids,
    deprecated_item_ids: judgment.deprecated_item_ids,
    required_hits_at_3: requiredHits,
    required_count: required.size,
    required_recall_at_3: requiredHits / required.size,
    both_evidence_coverage: required.size === 2 ? Number(requiredHits === 2) : null,
    deprecated_old_hit: Number(row.top3.some((id: string) => deprecated.has(id))),
    candidate_required_hits_at_20: candidateRequiredHits,
    candidate_required_count: required.size,
  };
});
function summarize(system: string) {
  const rows = evaluatedRows.filter((row) => row.system === system);
  const byStratum: Record<string, any> = {};
  for (const stratum of ['PAIR_PRESERVE', 'BLOCK_RETAINED']) {
    const selected = rows.filter((row) => row.stratum === stratum);
    const requiredHits = selected.reduce((sum, row) => sum + row.required_hits_at_3, 0);
    const requiredCount = selected.reduce((sum, row) => sum + row.required_count, 0);
    const bothRows = selected.filter((row) => row.both_evidence_coverage !== null);
    byStratum[stratum] = {
      query_count: selected.length,
      required_micro_recall_at_3: requiredHits / requiredCount,
      mean_query_recall_at_3: selected.reduce((sum, row) => sum + row.required_recall_at_3, 0) / selected.length,
      both_evidence_coverage: bothRows.length ? bothRows.reduce((sum, row) => sum + row.both_evidence_coverage, 0) / bothRows.length : null,
      deprecated_old_hit_rate: selected.reduce((sum, row) => sum + row.deprecated_old_hit, 0) / selected.length,
    };
  }
  const candidateHits = rows.reduce((sum, row) => sum + row.candidate_required_hits_at_20, 0);
  const candidateCount = rows.reduce((sum, row) => sum + row.candidate_required_count, 0);
  return {
    system,
    overall_mean_query_recall_at_3: rows.reduce((sum, row) => sum + row.required_recall_at_3, 0) / rows.length,
    required_candidate_micro_recall_at_20: candidateHits / candidateCount,
    strata: byStratum,
  };
}
const recencySummary = summarize('recency_lambda_0.75');
const versionSummary = summarize('version_aware_explicit_history_pair');
const sharedPoolIdentity = inputs.every((input: any) => {
  const rows = evaluatedRows.filter((row) => row.query_id === input.query_id);
  return rows.length === 2 && rows[0].shared_candidate_pool_hash === rows[1].shared_candidate_pool_hash
    && JSON.stringify(rows[0].shared_candidate_pool_ids) === JSON.stringify(rows[1].shared_candidate_pool_ids);
});
const gateChecks = {
  pair_required_micro_recall_strictly_improves:
    versionSummary.strata.PAIR_PRESERVE.required_micro_recall_at_3 > recencySummary.strata.PAIR_PRESERVE.required_micro_recall_at_3,
  pair_both_evidence_coverage_strictly_improves:
    versionSummary.strata.PAIR_PRESERVE.both_evidence_coverage > recencySummary.strata.PAIR_PRESERVE.both_evidence_coverage,
  block_required_micro_recall_noninferior:
    versionSummary.strata.BLOCK_RETAINED.required_micro_recall_at_3 >= recencySummary.strata.BLOCK_RETAINED.required_micro_recall_at_3,
  block_deprecated_old_hit_rate_not_increased:
    versionSummary.strata.BLOCK_RETAINED.deprecated_old_hit_rate <= recencySummary.strata.BLOCK_RETAINED.deprecated_old_hit_rate,
  required_candidate_micro_recall_at_20_at_least_0_90:
    versionSummary.required_candidate_micro_recall_at_20 >= 0.9,
  shared_candidate_pool_identity_100_percent: sharedPoolIdentity,
};
const passed = Object.values(gateChecks).every(Boolean);
const report = {
  schema_version: 'v5-r2.8-shared-pool-development-result-1',
  status: passed ? 'development_gate_passed_new_retrieval_validation_may_be_constructed' : 'development_gate_failed_no_retrieval_validation',
  development_only: true,
  validation_file_read: false,
  external_model_api_used: false,
  retrieval_calls_completed_before_judgment_read: retrievalCallsComplete,
  judgment_file_read_count: judgmentFileReadCount,
  candidate_pool_size: manifest.candidate_pool_size,
  top_k: manifest.top_k,
  recency_lambda: manifest.recency_lambda,
  history_pair_boost: manifest.history_pair_boost,
  summaries: [recencySummary, versionSummary],
  gate_checks: gateChecks,
  gate_passed: passed,
  claim_boundary: passed
    ? 'Development evidence for explicit historical-intent retrieval advantage only.'
    : 'No retrieval advantage promotion.',
  prohibited_claims: ['overall Version-Aware superiority', 'fresh held-out V5 test evidence', 'general semantic conditional-merge superiority'],
};
await mkdir(OUT, { recursive: true });
const rawText = `${evaluatedRows.map((row) => JSON.stringify(row)).join('\n')}\n`;
const reportText = `${JSON.stringify(report, null, 2)}\n`;
await Promise.all([
  writeFile(path.join(OUT, 'raw_retrieval_results.jsonl'), rawText, 'utf8'),
  writeFile(path.join(OUT, 'DEVELOPMENT_RESULT.json'), reportText, 'utf8'),
]);
await writeFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), `${JSON.stringify({
  ...guard,
  status: passed ? 'r2_8_development_passed_locked_new_validation_construction_allowed' : 'r2_8_development_failed_locked',
  retrieval_execution_count: 1,
  development_result_sha256: sha256(reportText),
  raw_retrieval_sha256: sha256(rawText),
  validation_execution_count: 0,
  fresh_v5_test_created: false,
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
