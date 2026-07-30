import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = path.join(EXP, 'data/configs/v5_r2_10_fresh_test');
const OUT = path.join(EXP, 'results/v5/r2_10_fresh_test');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

describe('V5 R2.10 one-shot fresh held-out test', () => {
  test('binds execution to the owner-approved review packet and frozen policy', async () => {
    const [manifestText, signoffText, policyText] = await Promise.all([
      readFile(path.join(CONFIG, 'MANIFEST.json'), 'utf8'),
      readFile(path.join(CONFIG, 'PROJECT_OWNER_SIGNOFF.json'), 'utf8'),
      readFile(path.join(EXP, 'data/configs/v5_r2_10_frozen_policy/FROZEN_POLICY_PACKAGE.json'), 'utf8'),
    ]);
    const manifest = JSON.parse(manifestText);
    const signoff = JSON.parse(signoffText);
    expect(signoff.review_packet_content_sha256).toBe('b3923d62ba18fed6ed70b21cfe80819885768c378ce5afa0e1846c54c7d69ca3');
    expect(manifest.owner_signoff_sha256).toBe(sha256(signoffText));
    expect(manifest.frozen_policy_sha256).toBe(sha256(policyText));
    expect(manifest.query_count).toBe(16);
  });

  test('uses byte-identical ordered Top-20 pools for both systems', async () => {
    const rows = parseJsonl(await readFile(path.join(OUT, 'raw_retrieval_results.jsonl'), 'utf8'));
    expect(rows).toHaveLength(32);
    for (const queryId of new Set(rows.map((row) => row.query_id))) {
      const pair = rows.filter((row) => row.query_id === queryId);
      expect(pair).toHaveLength(2);
      expect(pair[0].shared_candidate_pool_ids).toEqual(pair[1].shared_candidate_pool_ids);
      expect(pair[0].shared_candidate_pool_hash).toBe(pair[1].shared_candidate_pool_hash);
      expect(pair[0].shared_candidate_pool_hash).toBe(sha256(pair[0].shared_candidate_pool_ids.join('\n')));
    }
  });

  test('passes the preregistered scope-limited gate and locks after one execution', async () => {
    const [resultText, auditText, guardText] = await Promise.all([
      readFile(path.join(OUT, 'FRESH_TEST_RESULT.json'), 'utf8'),
      readFile(path.join(OUT, 'INDEPENDENT_AUDIT.json'), 'utf8'),
      readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8'),
    ]);
    const result = JSON.parse(resultText);
    const audit = JSON.parse(auditText);
    const guard = JSON.parse(guardText);
    expect(result.gate_passed).toBe(true);
    expect(Object.values(result.gate_checks).every(Boolean)).toBe(true);
    expect(result.promotion_scope).toBe('fresh_held_out_explicit_historical_intent_retrieval_advantage');
    expect(audit.status).toBe('verified');
    expect(audit.reported_metrics_match_raw_recomputation).toBe(true);
    expect(guard.fresh_test_execution_count).toBe(1);
    expect(guard.tuning_after_fresh_test_allowed).toBe(false);
  });
});
