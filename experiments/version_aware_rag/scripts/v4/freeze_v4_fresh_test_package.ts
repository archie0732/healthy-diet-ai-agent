import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'data/configs/v4_fresh_test_frozen');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const rel = (value: string) => path.join(EXP, value);
const files = {
  validation_config: 'data/configs/v4_validation_frozen/FROZEN_VALIDATION_CONFIG.json',
  validation_manifest: 'data/configs/v4_validation_frozen/FREEZE_MANIFEST.json',
  validation_result: 'results/v4/validation_confirmation/VALIDATION_CONFIRMATION.json',
  validation_audit: 'results/v4/validation_confirmation/VALIDATION_CONFIRMATION_AUDIT.json',
  model_registry: 'results/v4/dev_model_selection/model_registry.gemma-4-31b-it.json',
  candidate_inventory: 'data/annotations_v4/candidate_relation_pairs_v4.jsonl',
  corpus_v3: 'data/corpus_v3/chunks.jsonl',
  corpus_devval: 'data/corpus_v4_devval_draft/chunks.jsonl',
  bm25_source: 'src/retrieval/bm25.ts',
  recency_source: 'src/retrieval/recency.ts',
  fixed_pool_source: 'src/retrieval/fixed_candidate_pool.ts',
  reranker_client_source: 'src/retrieval/gemini_rerank_client.ts',
  answer_prompt_source: 'src/generation/v4_frozen_prompt.ts',
  protocol: 'V4_FRESH_TEST_PROTOCOL.md',
};
const content = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(rel(file))])));
const validationResult = JSON.parse(content.validation_result.toString());
const validationAudit = JSON.parse(content.validation_audit.toString());
const validationManifest = JSON.parse(content.validation_manifest.toString());
const modelRegistry = JSON.parse(content.model_registry.toString());
if (!validationResult.full_validation_promotion_gate_passed || validationAudit.status !== 'verified_validation_confirmation') throw new Error('Verified validation promotion is required.');
if (validationManifest.validation_rerun_allowed !== false || validationManifest.fresh_test_read_allowed !== false) throw new Error('Expected closed pre-test guards.');
if (modelRegistry.cross_encoder.model_id !== 'gemma-4-31b-it') throw new Error('Unexpected frozen reranker model.');

const frozen = {
  status: 'frozen_before_fresh_test_creation', frozen_at: '2026-07-22',
  retrieval: { systems: ['recency', 'oracle_cross_0.5'], candidate_budget: 20, top_k: 3, recency_lambda: 0.75, relation_boost: 0.35, propagation_factor: 0.9, pair_coverage_selection: true, semantic_alpha: 0.5 },
  reranker: { model_id: 'gemma-4-31b-it', descriptor_sha256: modelRegistry.cross_encoder.descriptor_sha256, api_version: 'v1beta', temperature: 0, thinking_level: 'not_applicable', output_schema: 'scores_only_v1', max_output_tokens: 2048 },
  answer_generator: { model_id: 'gemma-4-31b-it', temperature: 0, max_output_tokens: 1024, prompt_version: 'v4.0.0-frozen-2026-07-22', prompt_source_sha256: sha256(content.answer_prompt_source) },
  test_construction: { record_count: 40, strata: ['current_only', 'conditional_merge', 'compatible_history', 'hard_negative'], records_per_stratum: 10, selection: 'Lexicographically first ten test-eligible v4_new candidate pairs with unique leakage_group_id per stratum.', v3_held_out_query_reuse_allowed: false },
  retrieval_endpoints: ['conditional_merge_required_micro_recall_at_3', 'compatible_history_required_micro_recall_at_3', 'retained_required_micro_recall_at_3', 'current_only_deprecated_or_forbidden_hit_rate_at_3', 'hard_negative_forbidden_hit_rate_at_3'],
  answer_endpoints: ['version_grounded_answer_correctness', 'conditional_boundary_preservation', 'completeness', 'citation_entailment', 'unsupported_claim', 'appropriate_abstention'],
  claim_boundary: 'Oracle retrieval results measure attainable policy value, not deployability. Publication-grade answer claims require independent blinded human evaluation.',
  input_checksums: Object.fromEntries(Object.entries(content).map(([key, value]) => [key, { path: files[key as keyof typeof files], sha256: sha256(value) }])),
};
const frozenText = `${JSON.stringify(frozen, null, 2)}\n`;
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'FROZEN_FRESH_TEST_PACKAGE.json'), frozenText, 'utf8');
const manifest = { status: 'fresh_test_construction_unlocked', frozen_package_sha256: sha256(frozenText), test_inventory_read_count: 0, final_test_created: false, test_retrieval_execution_count_completed: 0, predicted_graph_created: false, answer_generation_completed: false, tuning_allowed: false };
await writeFile(path.join(OUT, 'FRESH_TEST_GUARD.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
