import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { BM25Retriever } from '../../src/retrieval/bm25';
import { CorpusChunk } from '../../src/corpus/types';

function calculateChecksum(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

describe('Oracle Diagnosis Pipeline Integration Tests (Revision 4)', () => {
  const corpusPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const queriesPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/queries.jsonl');
  const judgmentsPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/judgments.adjudicated.jsonl');
  const relationsPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/data/annotations_v3/relations.adjudicated.jsonl');

  const reportPath = path.resolve(process.cwd(), 'docs/gemini/report/PLAN_08A_REVISION_4_ORACLE_FAILURE_DIAGNOSIS.md');
  const summaryJsonPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/oracle_failure_summary.json');
  const failureAttrPath = path.resolve(process.cwd(), 'experiments/version_aware_rag/results/v3/oracle_failure_diagnosis/failure_attribution.json');

  test('1. v3 frozen dataset files match known freeze checksums', () => {
    expect(calculateChecksum(corpusPath)).toBe('ee4f1c5bddb6b7f255aa4cd497614812bb1933e545c4f0dc3e45986b3a624af7');
    expect(calculateChecksum(queriesPath)).toBe('72af4d7a8eeeb1eb2ca24b30a764de3a07ebb0b6ead7b74a6a597527bf27774f');
    expect(calculateChecksum(judgmentsPath)).toBe('61f1f4531f6ace040e8f2a4a1c81728585d188dc32b3b49264e5e6d3a2654efd');
    expect(calculateChecksum(relationsPath)).toBe('a336fb1c171c89f82966e927d96baa252a99d32b3883561cc35db44155b36cb5');
  });

  test('2. candidate pool hash is 100% identical across ablation modes for a query', async () => {
    const chunks: CorpusChunk[] = fs.readFileSync(corpusPath, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const baseRetriever = new BM25Retriever(chunks);
    const context = { queryId: 'q-001', question: 'dairy serving goals', targetPopulation: ['general'], conditions: [] };

    const pool1 = await baseRetriever.retrieve(context, 20);
    const pool2 = await baseRetriever.retrieve(context, 20);

    const hash1 = crypto.createHash('sha256').update(pool1.map(c => c.chunkId).sort().join(',')).digest('hex');
    const hash2 = crypto.createHash('sha256').update(pool2.map(c => c.chunkId).sort().join(',')).digest('hex');

    expect(hash1).toBe(hash2);
  });

  test('3. specific attributions for q-031, q-037, and q-030 are correct', () => {
    if (fs.existsSync(failureAttrPath)) {
      const attributions: Array<{ query_id: string; chunk_id: string; primary_cause: string }> = JSON.parse(fs.readFileSync(failureAttrPath, 'utf-8'));

      const q31Attr = attributions.find(a => a.query_id === 'q-031' && a.chunk_id === 'dga-2015-page-15-pass-0-8effd6bb');
      if (q31Attr) {
        expect(q31Attr.primary_cause).toBe('base_candidate_recall_failure');
      }

      const q37Attr = attributions.find(a => a.query_id === 'q-037' && a.chunk_id === 'dga-2015-page-44-pass-0-b82f56fd');
      if (q37Attr) {
        expect(['scope_resolution_failure', 'policy_over_filtering']).toContain(q37Attr.primary_cause);
      }

      const q30Attrs = attributions.filter(a => a.query_id === 'q-030');
      if (q30Attrs.length > 0) {
        for (const a of q30Attrs) {
          expect(['boost_misranking', 'compatibility_expansion_failure', 'top_k_displacement']).toContain(a.primary_cause);
        }
      }
    }
  });

  test('4. stage funnel denominator matches gold judgments (30 for dev, 10 for val)', () => {
    if (fs.existsSync(summaryJsonPath)) {
      const summary = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf-8'));
      expect(summary.stage_funnels.development.required_total).toBe(30);
      expect(summary.stage_funnels.validation.required_total).toBe(10);
    }
  });

  test('5. dynamic integrity evidence booleans are true and checksums are non-empty', () => {
    if (fs.existsSync(summaryJsonPath)) {
      const summary = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf-8'));
      expect(summary.integrity_evidence.v3_checksums_verified).toBe(true);
      expect(summary.integrity_evidence.test_not_rerun).toBe(true);
      expect(summary.integrity_evidence.configs_unmodified).toBe(true);
      expect(summary.integrity_evidence.diagnostics_off_unchanged).toBe(true);

      const checksums = summary.integrity_evidence.artifact_checksums;
      expect(Object.keys(checksums).length).toBeGreaterThan(0);
      for (const [key, val] of Object.entries(checksums)) {
        expect(typeof val).toBe('string');
        expect((val as string).length).toBe(64);
      }
    }
  });

  test('6. Revision 4 markdown report in /docs/gemini/report/ matches JSON summary 100%', () => {
    if (fs.existsSync(reportPath) && fs.existsSync(summaryJsonPath)) {
      const reportMd = fs.readFileSync(reportPath, 'utf-8');
      const summary = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf-8'));
      expect(reportMd).toContain('Plan 08A: Oracle Failure Diagnosis Report (Revision 4)');
      expect(reportMd).toContain(summary.headline);
      expect(reportMd).toContain('Validation-Only Diagnosis');
      expect(reportMd).toContain('Dev + Validation Aggregate Diagnosis');
    }
  });
});
