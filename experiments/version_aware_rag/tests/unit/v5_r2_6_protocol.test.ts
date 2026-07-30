import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = path.join(EXP, 'data/configs/v5_r2_6_query_conditioned_action_detector');
const RESULTS = path.join(EXP, 'results/v5/r2_6_query_conditioned_development');
const AUDIT = path.join(EXP, 'data/annotations_v5/r2_6_query_conditioned_development_audit');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

describe('V5 R2.6 query-conditioned protocol', () => {
  test('keeps the frozen split byte-identifiable', async () => {
    const manifest = JSON.parse(await readFile(path.join(CONFIG, 'SPLIT_MANIFEST.json'), 'utf8'));
    const development = await readFile(path.join(CONFIG, 'development.jsonl'));
    const validation = await readFile(path.join(CONFIG, 'validation.sealed.jsonl'));
    expect(sha256(development)).toBe(manifest.development_sha256);
    expect(sha256(validation)).toBe(manifest.validation_sealed_sha256);
    expect(manifest.lineage_overlap_count).toBe(0);
  });

  test('blocks Validation when the Development gate fails', async () => {
    const guard = JSON.parse(await readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8'));
    const selection = JSON.parse(await readFile(path.join(RESULTS, 'DEVELOPMENT_SELECTION.json'), 'utf8'));
    expect(guard.status).toBe('blocked_no_safe_query_conditioned_detector');
    expect(guard.validation_execution_count).toBe(0);
    expect(guard.external_model_api_allowed).toBe(false);
    expect(selection.selected_config).toBeNull();
    expect(selection.validation_file_read).toBe(false);
    expect(selection.external_model_api_used).toBe(false);
    expect(selection.best_zero_false_preserve_config.metrics.false_preserve_count).toBe(0);
    expect(selection.best_zero_false_preserve_config.metrics.pair_preserve_recall).toBeLessThan(0.5);
  });

  test('records post-prediction label defects without retroactive promotion', async () => {
    const audit = JSON.parse(await readFile(path.join(AUDIT, 'AUDIT_SUMMARY.json'), 'utf8'));
    expect(audit.status).toBe('r2_6_invalid_for_promotion_requires_pre_model_gold_rebuild');
    expect(audit.revised_pair_ids).toEqual(['r2.6-v5claim-013', 'r2.6-v5claim-016']);
    expect(audit.validation_file_read).toBe(false);
    expect(audit.consequence).toContain('Do not relabel and reuse');
  });
});
