import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const OUT = path.join(EXP, 'data/configs/v5_r2_10_frozen_policy');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const files = [
  'R2_8_SHARED_POOL_RETRIEVAL_PROTOCOL.md',
  'R2_9_RETRIEVAL_VALIDATION_PROTOCOL.md',
  'results/v5/r2_8_shared_pool_development/DEVELOPMENT_RESULT.json',
  'results/v5/r2_9_retrieval_validation/VALIDATION_RESULT.json',
  'scripts/v5/run_r2_8_shared_pool_development.ts',
  'scripts/v5/run_r2_9_retrieval_validation.ts',
];
const contents = new Map<string, Buffer>();
for (const file of files) contents.set(file, await readFile(path.join(EXP, file)));
const validation = JSON.parse(contents.get('results/v5/r2_9_retrieval_validation/VALIDATION_RESULT.json')!.toString('utf8'));
if (!validation.gate_passed || validation.validation_execution_count !== 1 || validation.promotion_scope !== 'explicit_historical_intent_retrieval_advantage') {
  throw new Error('R2.9 did not authorize policy freeze');
}
const frozen = {
  schema_version: 'v5-r2.10-frozen-policy-1',
  status: 'policy_frozen_before_fresh_test_construction',
  frozen_at: '2026-07-24T00:00:00.000+08:00',
  detector_id: 'explicit_temporal_history_intent_v1',
  detector_patterns: [
    '\\b2003\\b', '\\bhistorical(?:ly)?\\b', '\\bprevious(?:ly)?\\b', '\\bearlier\\b',
    '\\bformerly\\b', '\\bhow did\\b.{0,100}\\bchange\\b', '\\bfrom\\b.{0,100}\\bto (?:the )?current\\b',
  ],
  retrieval: {
    corpus_representation: 'atomic OLD and CURRENT claims',
    base_retriever: 'BM25 k1=1.2 b=0.75',
    candidate_pool_size: 20,
    top_k: 3,
    recency_lambda: 0.75,
    recency_year_normalization: '(year-2015)/(2026-2015)',
    explicit_history_behavior: 'disable recency; add 0.75 to highest-BM25 in-pool seed and its declared lineage mate',
    history_pair_boost: 0.75,
    current_only_behavior: 'identical to Recency',
    out_of_pool_expansion: false,
  },
  primary_endpoints: [
    'explicit_history required micro Recall@3',
    'explicit_history both-evidence coverage',
    'conditional_merge required micro Recall@3',
    'current_only required micro Recall@3',
    'deprecated OLD hit rate',
    'required candidate micro Recall@20',
  ],
  claim_scope: 'explicit_historical_intent_retrieval_advantage',
  prohibited_claims: ['overall Version-Aware superiority', 'implicit semantic conditional-merge superiority'],
  external_model_api_allowed: false,
  tuning_after_fresh_test_allowed: false,
  fresh_test_execution_count: 0,
  artifact_sha256: Object.fromEntries(files.map((file) => [file, sha256(contents.get(file)!)])),
};
const frozenText = `${JSON.stringify(frozen, null, 2)}\n`;
const guard = {
  status: 'fresh_test_construction_allowed_execution_locked',
  frozen_policy_sha256: sha256(frozenText),
  fresh_test_constructed: false,
  owner_signoff_recorded: false,
  fresh_test_execution_count: 0,
  tuning_allowed: false,
  external_model_api_allowed: false,
};
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, 'FROZEN_POLICY_PACKAGE.json'), frozenText, 'utf8'),
  writeFile(path.join(OUT, 'FRESH_TEST_GUARD.json'), `${JSON.stringify(guard, null, 2)}\n`, 'utf8'),
]);
console.log(JSON.stringify({ status: frozen.status, frozen_policy_sha256: sha256(frozenText), fresh_test_execution_count: 0 }, null, 2));
