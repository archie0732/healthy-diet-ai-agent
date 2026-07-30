import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = path.join(EXP, 'data/configs/v5_r2_8_shared_pool_development');
const RESULT = path.join(EXP, 'results/v5/r2_8_shared_pool_development');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

describe('V5 R2.8 shared-pool retrieval protocol', () => {
  test('physically separates retrieval inputs from sealed judgments', async () => {
    const manifest = JSON.parse(await readFile(path.join(CONFIG, 'MANIFEST.json'), 'utf8'));
    const inputsText = await readFile(path.join(CONFIG, 'retrieval_inputs.jsonl'), 'utf8');
    const judgmentsText = await readFile(path.join(CONFIG, 'judgments.sealed.jsonl'), 'utf8');
    expect(sha256(inputsText)).toBe(manifest.retrieval_inputs_sha256);
    expect(sha256(judgmentsText)).toBe(manifest.judgments_sealed_sha256);
    expect(inputsText).not.toContain('action_label');
    expect(inputsText).not.toContain('required_item_ids');
    expect(inputsText).not.toContain('deprecated_item_ids');
    expect(inputsText).not.toContain('reviewer');
    expect(manifest.validation_file_read).toBe(false);
  });

  test('uses byte-identical ordered Top-20 pools for both systems', async () => {
    const rows = parseJsonl(await readFile(path.join(RESULT, 'raw_retrieval_results.jsonl'), 'utf8'));
    const queryIds = [...new Set(rows.map((row) => row.query_id))];
    expect(queryIds).toHaveLength(16);
    for (const queryId of queryIds) {
      const pair = rows.filter((row) => row.query_id === queryId);
      expect(pair).toHaveLength(2);
      expect(pair[0].shared_candidate_pool_ids).toEqual(pair[1].shared_candidate_pool_ids);
      expect(pair[0].shared_candidate_pool_hash).toBe(pair[1].shared_candidate_pool_hash);
      expect(pair[0].shared_candidate_pool_hash).toBe(sha256(pair[0].shared_candidate_pool_ids.join('\n')));
      expect(pair[0].shared_candidate_pool_size).toBe(20);
    }
  });

  test('passes every preregistered Development gate without Validation access', async () => {
    const result = JSON.parse(await readFile(path.join(RESULT, 'DEVELOPMENT_RESULT.json'), 'utf8'));
    const audit = JSON.parse(await readFile(path.join(RESULT, 'INDEPENDENT_AUDIT.json'), 'utf8'));
    const guard = JSON.parse(await readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8'));
    expect(result.gate_passed).toBe(true);
    expect(Object.values(result.gate_checks).every(Boolean)).toBe(true);
    expect(result.retrieval_calls_completed_before_judgment_read).toBe(true);
    expect(result.judgment_file_read_count).toBe(1);
    expect(result.validation_file_read).toBe(false);
    expect(result.external_model_api_used).toBe(false);
    expect(audit.status).toBe('verified');
    expect(audit.reported_metrics_match_raw_recomputation).toBe(true);
    expect(audit.known_version_aware_miss.tuning_performed).toBe(false);
    expect(guard.status).toBe('r2_8_development_passed_locked_new_validation_construction_allowed');
    expect(guard.validation_execution_count).toBe(0);
    expect(guard.fresh_v5_test_created).toBe(false);
  });
});
