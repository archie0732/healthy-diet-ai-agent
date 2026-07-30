import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const EXP = path.join(process.cwd(), 'experiments/version_aware_rag');
const DRAFT = path.join(EXP, 'data/annotations_v5/r2_10_fresh_test_draft');
const FROZEN = path.join(EXP, 'data/configs/v5_r2_10_frozen_policy');
const PACKET = path.join(EXP, 'results/v5/r2_10_fresh_test_construction/R2_10_FRESH_TEST_REVIEW_PACKET.md');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const parseJsonl = (value: string) => value.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

describe('V5 R2.10 fresh-test construction', () => {
  test('freezes policy before constructing the test draft', async () => {
    const frozenText = await readFile(path.join(FROZEN, 'FROZEN_POLICY_PACKAGE.json'), 'utf8');
    const frozen = JSON.parse(frozenText);
    const manifest = JSON.parse(await readFile(path.join(DRAFT, 'DRAFT_MANIFEST.json'), 'utf8'));
    expect(frozen.status).toBe('policy_frozen_before_fresh_test_construction');
    expect(frozen.fresh_test_execution_count).toBe(0);
    expect(manifest.frozen_policy_sha256).toBe(sha256(frozenText));
    expect(manifest.retrieval_result_exists).toBe(false);
  });

  test('contains four balanced strata with new current chunks', async () => {
    const ledgerText = await readFile(path.join(DRAFT, 'fresh_test_draft.jsonl'), 'utf8');
    const rows = parseJsonl(ledgerText);
    const manifest = JSON.parse(await readFile(path.join(DRAFT, 'DRAFT_MANIFEST.json'), 'utf8'));
    expect(rows).toHaveLength(16);
    expect(manifest.strata_counts).toEqual({ explicit_history: 4, conditional_merge: 4, current_only: 4, hard_negative_current: 4 });
    expect(new Set(rows.map((row) => row.lineage_group)).size).toBe(16);
    expect(new Set(rows.map((row) => row.current_evidence.chunk_id)).size).toBe(16);
    expect(manifest.prior_current_chunk_collision_count).toBe(0);
    expect(sha256(ledgerText)).toBe(manifest.draft_ledger_sha256);
    expect(rows.every((row) => row.review.decision === 'needs_project_owner_review')).toBe(true);
    expect(rows.every((row) => row.review.retrieval_results_observed === false)).toBe(true);
  });

  test('preserves the approved packet checksum and records exactly one guarded execution', async () => {
    const guard = JSON.parse(await readFile(path.join(FROZEN, 'FRESH_TEST_GUARD.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(path.join(DRAFT, 'DRAFT_MANIFEST.json'), 'utf8'));
    const packet = await readFile(PACKET, 'utf8');
    const packetWithoutChecksumLine = packet.replace(`Review packet content SHA-256: \`${manifest.review_packet_content_sha256}\`\n\n`, '');
    expect(sha256(packetWithoutChecksumLine)).toBe(manifest.review_packet_content_sha256);
    expect(sha256(packet)).toBe(manifest.review_packet_file_sha256);
    expect(guard.status).toBe('fresh_test_executed_once_passed_locked');
    expect(guard.owner_signoff_recorded).toBe(true);
    expect(guard.owner_signoff_statement).toBe(`同意全部，checksum ${manifest.review_packet_content_sha256}`);
    expect(guard.fresh_test_execution_count).toBe(1);
    expect(guard.retrieval_result_exists).toBe(true);
    expect(guard.tuning_allowed).toBe(false);
  });
});
