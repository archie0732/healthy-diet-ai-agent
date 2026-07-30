import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const CONFIG = path.join(EXP, 'data/configs/v5_r2_7_preaudited_cross_version');
const AUDIT = path.join(EXP, 'data/annotations_v5/r2_7_preaudited_cross_version/pre_model_audit_ledger.jsonl');
const DEV = path.join(EXP, 'results/v5/r2_7_temporal_intent_development/DEVELOPMENT_SELECTION.json');
const VAL = path.join(EXP, 'results/v5/r2_7_temporal_intent_validation/VALIDATION_RESULT.json');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

describe('V5 R2.7 pre-audited cross-version protocol', () => {
  test('freezes balanced, lineage-disjoint Development and Validation before prediction', async () => {
    const manifest = JSON.parse(await readFile(path.join(CONFIG, 'SPLIT_MANIFEST.json'), 'utf8'));
    const development = await readFile(path.join(CONFIG, 'development.jsonl'), 'utf8');
    const validation = await readFile(path.join(CONFIG, 'validation.sealed.jsonl'), 'utf8');
    expect(sha256(development)).toBe(manifest.development_sha256);
    expect(sha256(validation)).toBe(manifest.validation_sealed_sha256);
    expect(manifest.total_distribution).toEqual({ PAIR_PRESERVE: 12, BLOCK_RETAINED: 12 });
    expect(manifest.development_distribution).toEqual({ PAIR_PRESERVE: 8, BLOCK_RETAINED: 8 });
    expect(manifest.validation_distribution).toEqual({ PAIR_PRESERVE: 4, BLOCK_RETAINED: 4 });
    expect(manifest.lineage_overlap_count).toBe(0);
    expect(manifest.current_chunk_overlap_count).toBe(0);
    expect(manifest.prior_r2_current_chunk_collision_count).toBe(0);
    expect(manifest.gold_audit_completed_before_prediction).toBe(true);
  });

  test('retains official URLs, checksums, and page-level provenance for every pair', async () => {
    const development = parseJsonl(await readFile(path.join(CONFIG, 'development.jsonl'), 'utf8'));
    const validation = parseJsonl(await readFile(path.join(CONFIG, 'validation.sealed.jsonl'), 'utf8'));
    for (const row of [...development, ...validation]) {
      expect(row.old_evidence.official_catalog_url).toStartWith('https://');
      expect(row.old_evidence.official_pdf_url).toStartWith('https://');
      expect(row.old_evidence.source_sha256).toHaveLength(64);
      expect(row.old_evidence.pdf_page_number).toBeGreaterThan(0);
      expect(row.old_evidence.printed_page_number).toBeGreaterThan(0);
      expect(row.old_evidence.extraction_note).toContain('not a byte-offset quotation');
      expect(row.current_evidence.official_url).toStartWith('https://');
      expect(row.current_evidence.official_pdf_url).toStartWith('https://');
      expect(row.current_evidence.source_sha256).toHaveLength(64);
      expect(row.current_evidence.chunk_id).toStartWith('who-');
    }
  });

  test('records all gold decisions as pre-model audits', async () => {
    const manifest = JSON.parse(await readFile(path.join(CONFIG, 'SPLIT_MANIFEST.json'), 'utf8'));
    const auditText = await readFile(AUDIT, 'utf8');
    const rows = parseJsonl(auditText);
    expect(sha256(auditText)).toBe(manifest.audit_ledger_sha256);
    expect(rows).toHaveLength(24);
    expect(rows.every((row) => row.decision === 'accept')).toBe(true);
    expect(rows.every((row) => row.predictions_observed_before_audit === false)).toBe(true);
    expect(rows.every((row) => row.validation_results_observed_before_audit === false)).toBe(true);
    expect(rows.every((row) => row.external_model_api_used === false)).toBe(true);
  });

  test('locks after one Validation and limits the promotion claim', async () => {
    const guard = JSON.parse(await readFile(path.join(CONFIG, 'EXECUTION_GUARD.json'), 'utf8'));
    const development = JSON.parse(await readFile(DEV, 'utf8'));
    const validation = JSON.parse(await readFile(VAL, 'utf8'));
    expect(development.validation_file_read).toBe(false);
    expect(development.metrics.false_preserve_count).toBe(0);
    expect(development.metrics.pair_preserve_recall).toBe(1);
    expect(validation.validation_execution_count).toBe(1);
    expect(validation.metrics.false_preserve_count).toBe(0);
    expect(validation.metrics.pair_preserve_recall).toBe(1);
    expect(validation.promotion_scope).toBe('explicit_historical_intent_routing_only');
    expect(validation.prohibited_claims).toContain('overall Version-Aware retrieval is superior to Recency');
    expect(guard.status).toBe('r2_7_validation_confirmed_scope_limited_locked');
    expect(guard.validation_execution_count).toBe(1);
    expect(guard.tuning_after_validation_allowed).toBe(false);
    expect(guard.fresh_v5_test_created).toBe(false);
  });
});
