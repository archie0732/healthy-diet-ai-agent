import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = path.join(EXP, 'data/configs/v5_r2_9_retrieval_validation');
const RESULT = path.join(EXP, 'results/v5/r2_9_retrieval_validation');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

describe('V5 R2.9 retrieval Validation protocol', () => {
  test('freezes new balanced records before one-shot retrieval', async () => {
    const manifest = JSON.parse(await readFile(path.join(CONFIG, 'MANIFEST.json'), 'utf8'));
    const inputs = await readFile(path.join(CONFIG, 'retrieval_inputs.jsonl'), 'utf8');
    const judgments = await readFile(path.join(CONFIG, 'judgments.sealed.jsonl'), 'utf8');
    expect(manifest.query_count).toBe(12);
    expect(manifest.distribution).toEqual({ PAIR_PRESERVE: 6, BLOCK_RETAINED: 6 });
    expect(manifest.prior_current_chunk_collision_count).toBe(0);
    expect(sha256(inputs)).toBe(manifest.retrieval_inputs_sha256);
    expect(sha256(judgments)).toBe(manifest.judgments_sealed_sha256);
    expect(inputs).not.toContain('required_item_ids');
    expect(inputs).not.toContain('action_label');
  });

  test('uses identical shared Top-20 pools', async () => {
    const rows = parseJsonl(await readFile(path.join(RESULT, 'raw_retrieval_results.jsonl'), 'utf8'));
    expect(rows).toHaveLength(24);
    for (const queryId of [...new Set(rows.map((row) => row.query_id))]) {
      const pair = rows.filter((row) => row.query_id === queryId);
      expect(pair).toHaveLength(2);
      expect(pair[0].shared_candidate_pool_ids).toEqual(pair[1].shared_candidate_pool_ids);
      expect(pair[0].shared_candidate_pool_hash).toBe(sha256(pair[0].shared_candidate_pool_ids.join('\n')));
    }
  });

  test('passes once, locks, and preserves narrow claim boundaries', async () => {
    const result = JSON.parse(await readFile(path.join(RESULT, 'VALIDATION_RESULT.json'), 'utf8'));
    const audit = JSON.parse(await readFile(path.join(RESULT, 'INDEPENDENT_AUDIT.json'), 'utf8'));
    const guard = JSON.parse(await readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8'));
    expect(result.validation_execution_count).toBe(1);
    expect(result.gate_passed).toBe(true);
    expect(Object.values(result.gate_checks).every(Boolean)).toBe(true);
    expect(result.all_retrieval_calls_completed_before_judgment_read).toBe(true);
    expect(result.promotion_scope).toBe('explicit_historical_intent_retrieval_advantage');
    expect(result.prohibited_claims).toContain('overall Version-Aware superiority');
    expect(audit.status).toBe('verified');
    expect(audit.tuning_performed_after_validation).toBe(false);
    expect(guard.status).toBe('r2_9_validation_passed_locked_scope_limited');
    expect(guard.validation_execution_count).toBe(1);
    expect(guard.tuning_after_validation_allowed).toBe(false);
    expect(guard.fresh_v5_test_created).toBe(false);
  });
});
