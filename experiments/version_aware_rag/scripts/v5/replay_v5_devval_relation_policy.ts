import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildRelationAwareCandidateSet, selectRelationAwareTopK, type RelationAwareEdge } from '../../src/retrieval/relation_aware_pair_policy';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'results/v5/relation_policy_repair');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const round = (value: number) => Number(value.toFixed(6));

const inputs = {
  development: {
    records: path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits/development.jsonl'),
    raw: path.join(EXP, 'results/v4/dev_model_selection/raw_retrieval_results.gemma-4-31b-it.jsonl'),
    edges: path.join(EXP, 'results/v4/dev_model_selection/oracle_development_relation_edges.jsonl')
  },
  validation: {
    records: path.join(EXP, 'data/annotations_v4/devval_expansion_user_approved/splits/validation.sealed.jsonl'),
    raw: path.join(EXP, 'results/v4/validation_confirmation/raw_retrieval_results.jsonl'),
    edges: path.join(EXP, 'results/v4/validation_confirmation/oracle_global_relation_edges.jsonl')
  }
} as const;

function mapEdge(edge: any): RelationAwareEdge {
  const relationType = edge.relation_type === 'conditional_merge' ? 'conditional_difference'
    : edge.relation_type === 'compatible_history' ? 'complementary'
      : edge.relation_type;
  return {
    ...edge,
    relation_type: relationType,
    // These approved conditional-merge questions explicitly state the target
    // population/condition, so applicability is established by construction.
    conditional_applicable: relationType === 'conditional_difference' ? true : undefined
  };
}

function micro(rows: any[], records: Map<string, any>, field: 'required_current_chunk_ids' | 'required_retained_chunk_ids' | 'required_all'): number {
  let hits = 0;
  let total = 0;
  for (const row of rows) {
    const record = records.get(row.query_id);
    const required = field === 'required_all'
      ? [...record.required_current_chunk_ids, ...record.required_retained_chunk_ids]
      : record[field];
    total += required.length;
    hits += required.filter((id: string) => row.retrieved_chunk_ids.includes(id)).length;
  }
  return total ? round(hits / total) : 0;
}

await mkdir(OUT, { recursive: true });
const result: any = {
  status: 'v5_devval_replay_complete',
  scope: 'development_and_validation_only',
  fresh_test_read_or_rerun: false,
  new_model_calls: 0,
  parameter_tuning: false,
  relation_semantics: {
    conditional_merge: 'conditional_difference_with_explicit_applicability',
    compatible_history: 'complementary',
    superseded_or_conflicting: 'current_only_expansion_retained_blocked',
    pair_coverage: 'complementary_or_applicable_conditional_only'
  },
  splits: {},
  input_checksums: {}
};

for (const [split, paths] of Object.entries(inputs)) {
  const [recordsText, rawText, edgesText] = await Promise.all([readFile(paths.records, 'utf8'), readFile(paths.raw, 'utf8'), readFile(paths.edges, 'utf8')]);
  result.input_checksums[split] = { records_sha256: sha256(recordsText), raw_sha256: sha256(rawText), edges_sha256: sha256(edgesText) };
  const records = parseJsonl(recordsText);
  const recordById = new Map(records.map((row: any) => [row.draft_id, row]));
  const raw = parseJsonl(rawText);
  const edges = parseJsonl(edgesText).map(mapEdge);
  const recency = raw.filter((row: any) => row.system === 'recency' && recordById.has(row.query_id));
  const oracle = raw.filter((row: any) => row.system === 'oracle_cross_0.5' && recordById.has(row.query_id));
  const replay = oracle.map((row: any) => {
    const base = new Set(row.shared_base_candidate_ids);
    const activeEdges = edges.filter((edge: RelationAwareEdge) => base.has(edge.current_chunk_id) || base.has(edge.retained_chunk_id));
    const built = buildRelationAwareCandidateSet(row.shared_base_candidate_ids, activeEdges);
    const scoreById = new Map(row.scores.map((item: any) => [item.chunk_id, item]));
    const missingScores = built.candidateIds.filter((id) => !scoreById.has(id));
    if (missingScores.length) throw new Error(`${split}/${row.query_id}: cached V4 score missing for ${missingScores.join(',')}`);
    const selected = selectRelationAwareTopK(built.candidateIds.map((id) => scoreById.get(id)), built.pairCoverageEdges, built.unsafeIds, 3);
    return {
      query_id: row.query_id,
      stratum: row.stratum,
      retrieved_chunk_ids: selected.map((item: any) => item.chunk_id),
      v4_retrieved_chunk_ids: row.retrieved_chunk_ids,
      selection_unchanged: selected.map((item: any) => item.chunk_id).join('\n') === row.retrieved_chunk_ids.join('\n'),
      policy_trace: built.trace
    };
  });
  const byStratum = (rows: any[], stratum: string) => rows.filter((row) => row.stratum === stratum);
  const metrics = (rows: any[]) => ({
    conditional_merge_required_micro_recall_at_3: micro(byStratum(rows, 'conditional_merge'), recordById, 'required_all'),
    compatible_history_required_micro_recall_at_3: micro(byStratum(rows, 'compatible_history'), recordById, 'required_all'),
    retained_required_micro_recall_at_3: micro(rows, recordById, 'required_retained_chunk_ids')
  });
  const recencyMetrics = metrics(recency);
  const v5Metrics = metrics(replay);
  result.splits[split] = {
    query_count: replay.length,
    v4_selection_unchanged_count: replay.filter((row: any) => row.selection_unchanged).length,
    recency: recencyMetrics,
    v5_oracle_replay: v5Metrics,
    target_gate: {
      conditional_merge_noninferiority: v5Metrics.conditional_merge_required_micro_recall_at_3 >= recencyMetrics.conditional_merge_required_micro_recall_at_3,
      compatible_history_noninferiority: v5Metrics.compatible_history_required_micro_recall_at_3 >= recencyMetrics.compatible_history_required_micro_recall_at_3,
      retained_history_strict_improvement: v5Metrics.retained_required_micro_recall_at_3 > recencyMetrics.retained_required_micro_recall_at_3
    }
  };
  await writeFile(path.join(OUT, `${split}_replay.jsonl`), replay.map((row: any) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}

result.full_devval_coverage_gate_passed = Object.values(result.splits).every((split: any) => Object.values(split.target_gate).every(Boolean));
result.safety_claim = 'Synthetic relation-type safety regressions pass; empirical fresh-test safety is not re-estimated because frozen V4 fresh data was not read or rerun.';
await writeFile(path.join(OUT, 'V5_DEVVAL_REPLAY.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
const d = result.splits.development, v = result.splits.validation;
const report = `# V5 Relation-Aware Policy Repair — Development/Validation Replay\n\nThis replay uses only cached V4 development and validation scores. It makes zero model calls, performs no tuning, and does not read or rerun the frozen V4 fresh test.\n\n| Split / endpoint | Recency | V5 Oracle replay |\n|---|---:|---:|\n| Development conditional merge required micro Recall@3 | ${d.recency.conditional_merge_required_micro_recall_at_3} | ${d.v5_oracle_replay.conditional_merge_required_micro_recall_at_3} |\n| Development compatible history required micro Recall@3 | ${d.recency.compatible_history_required_micro_recall_at_3} | ${d.v5_oracle_replay.compatible_history_required_micro_recall_at_3} |\n| Development retained required micro Recall@3 | ${d.recency.retained_required_micro_recall_at_3} | ${d.v5_oracle_replay.retained_required_micro_recall_at_3} |\n| Validation conditional merge required micro Recall@3 | ${v.recency.conditional_merge_required_micro_recall_at_3} | ${v.v5_oracle_replay.conditional_merge_required_micro_recall_at_3} |\n| Validation compatible history required micro Recall@3 | ${v.recency.compatible_history_required_micro_recall_at_3} | ${v.v5_oracle_replay.compatible_history_required_micro_recall_at_3} |\n| Validation retained required micro Recall@3 | ${v.recency.retained_required_micro_recall_at_3} | ${v.v5_oracle_replay.retained_required_micro_recall_at_3} |\n\nCoverage gate: **${result.full_devval_coverage_gate_passed ? 'PASS' : 'FAIL'}**. V4 selected Top-3 was preserved for ${d.v4_selection_unchanged_count}/${d.query_count} development and ${v.v4_selection_unchanged_count}/${v.query_count} validation queries.\n\nSafety repair is established by unit fixtures for superseded/conflicting edges. It is not a new held-out estimate. A future V5 test must be constructed and sealed only after this policy and citation contract are frozen.\n`;
await writeFile(path.join(OUT, 'V5_DEVVAL_REPLAY.md'), report, 'utf8');
const artifacts = ['development_replay.jsonl', 'validation_replay.jsonl', 'V5_DEVVAL_REPLAY.json', 'V5_DEVVAL_REPLAY.md'];
await writeFile(path.join(OUT, 'ARTIFACT_CHECKSUMS.sha256'), (await Promise.all(artifacts.map(async (file) => `${sha256(await readFile(path.join(OUT, file)))}  ${file}`))).join('\n') + '\n', 'utf8');
console.log(JSON.stringify(result, null, 2));
