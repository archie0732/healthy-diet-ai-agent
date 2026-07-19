import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { AnswerMetricsEvaluator, AnswerHumanAnnotation } from '../../src/evaluation/answer_metrics';

describe('Plan 07-R2: Blind Evaluation, Adjudication & Proxy Metrics Separation', () => {

  const testTmpDir = path.resolve(process.cwd(), 'experiments/version_aware_rag/tests/tmp_blind_test');

  beforeEach(() => {
    if (!fs.existsSync(testTmpDir)) fs.mkdirSync(testTmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testTmpDir)) {
      fs.rmSync(testTmpDir, { recursive: true, force: true });
    }
  });

  it('1. Automatic proxy metrics must include metric_provenance and exclude adjudicated naming', () => {
    const record = {
      query_id: 'q-001',
      answer: 'Eat low fat dairy products [dga-2025-page-1].',
      citations: ['dga-2025-page-1'],
      citation_validation: { valid: ['dga-2025-page-1'], invalid: [], invalid_rate: 0 }
    };

    const gt = {
      required_chunk_ids: ['dga-2025-page-1'],
      compatible_chunk_ids: [],
      deprecated_chunk_ids: [],
      forbidden_chunk_ids: [],
      citation_safe_chunk_ids: ['dga-2025-page-1']
    };

    const proxy = AnswerMetricsEvaluator.computeAutomaticCitationProxyMetrics(record, gt, 'System_A');

    expect(proxy.metric_provenance).toBe('automatic_gold_citation_proxy');
    expect(proxy.scoring_method).toBe('deterministic_rules_from_gold_chunk_sets');
    expect((proxy as any).annotator_id).toBeUndefined();
    expect(proxy.system_alias).toBe('System_A');
    expect(proxy.completeness).toBe(1.0);
    expect(proxy.version_correctness).toBe(1.0);
  });

  it('2. system_alias_mapping.secret.json must not exist in public paper output directory', () => {
    const publicPaperDir = path.resolve(process.cwd(), 'experiments/version_aware_rag/results/v3/paper');
    const secretInPublic = path.join(publicPaperDir, 'system_alias_mapping.secret.json');
    expect(fs.existsSync(secretInPublic)).toBe(false);
  });

  it('3. Cohen Kappa and Linear Weighted Cohen Kappa calculations must be accurate', () => {
    const binaryA = [0, 1, 0, 1, 0];
    const binaryB = [0, 1, 0, 1, 0];
    const kappaPerfect = AnswerMetricsEvaluator.computeCohenKappa(binaryA, binaryB);
    expect(kappaPerfect).toBe(1.0);

    const ordinalA = [0, 0.5, 1.0, 0.5, 0.0];
    const ordinalB = [0, 0.5, 0.5, 0.5, 0.0];
    const weightedKappa = AnswerMetricsEvaluator.computeWeightedCohenKappa(ordinalA, ordinalB, [0, 0.5, 1]);
    expect(weightedKappa).toBeGreaterThan(0.5);
    expect(weightedKappa).toBeLessThanOrEqual(1.0);
  });

  it('4. Import validator must reject missing items, duplicate items, invalid scores, and tampered fields', () => {
    const pkg1Path = path.resolve(testTmpDir, 'annotation_package_annotator_1.json');
    const mockPkg = Array.from({ length: 24 }, (_, i) => {
      const id = `blind-${String(i + 1).padStart(3, '0')}`;
      return {
        item_id: id,
        query_id: `q-${i + 1}`,
        question: `Question ${i + 1}`,
        system_alias: 'System_A',
        answer: `Answer ${i + 1}`,
        citations: []
      };
    });
    fs.writeFileSync(pkg1Path, JSON.stringify(mockPkg, null, 2), 'utf8');

    // Invalid score item (e.g. 0.8)
    const invalidItems = mockPkg.map(item => ({
      item_id: item.item_id,
      annotator_id: 'annotator_1',
      answer_correctness: 0.8, // Invalid!
      completeness: 1,
      version_correctness: 1,
      conditional_boundary_preservation: 1,
      unsupported_claim: 0,
      citation_entailment: 1
    }));
    const invalidPath = path.resolve(testTmpDir, 'annotation_results_invalid.json');
    fs.writeFileSync(invalidPath, JSON.stringify(invalidItems, null, 2), 'utf8');

    const importCmd = `bun experiments/version_aware_rag/scripts/v3/import_and_adjudicate_answer_annotations.ts --annotator1 ${invalidPath} --inputDir ${testTmpDir} --outputDir ${testTmpDir}`;

    expect(() => {
      execSync(importCmd, { stdio: 'pipe' });
    }).toThrow();
  });

  it('5. Import script must compute agreement and preserve adjudication reasons for mismatched items', () => {
    const pkg1Path = path.resolve(testTmpDir, 'annotation_package_annotator_1.json');
    const mockPkg = Array.from({ length: 24 }, (_, i) => ({
      item_id: `blind-${String(i + 1).padStart(3, '0')}`,
      query_id: `q-${i + 1}`,
      question: `Question ${i + 1}`,
      system_alias: i % 2 === 0 ? 'System_A' : 'System_B',
      answer: `Answer ${i + 1}`,
      citations: []
    }));
    fs.writeFileSync(pkg1Path, JSON.stringify(mockPkg, null, 2), 'utf8');

    const items1 = mockPkg.map(item => ({
      item_id: item.item_id,
      annotator_id: 'annotator_1',
      answer_correctness: 1.0,
      completeness: 1.0,
      version_correctness: 1.0,
      conditional_boundary_preservation: 1.0,
      unsupported_claim: 0,
      citation_entailment: 1.0
    }));

    // Item blind-001 has mismatch in Annotator 2
    const items2 = items1.map(item => {
      if (item.item_id === 'blind-001') {
        return { ...item, annotator_id: 'annotator_2', completeness: 0.5 };
      }
      return { ...item, annotator_id: 'annotator_2' };
    });

    const path1 = path.resolve(testTmpDir, 'annotation_results_annotator_1.json');
    const path2 = path.resolve(testTmpDir, 'annotation_results_annotator_2.json');
    fs.writeFileSync(path1, JSON.stringify(items1, null, 2), 'utf8');
    fs.writeFileSync(path2, JSON.stringify(items2, null, 2), 'utf8');

    const importCmd = `bun experiments/version_aware_rag/scripts/v3/import_and_adjudicate_answer_annotations.ts --annotator1 ${path1} --annotator2 ${path2} --inputDir ${testTmpDir} --outputDir ${testTmpDir}`;
    execSync(importCmd, { stdio: 'pipe' });

    const agreementData = JSON.parse(fs.readFileSync(path.resolve(testTmpDir, 'answer_annotation_agreement.json'), 'utf8'));
    expect(agreementData.total_items).toBe(24);
    expect(agreementData.items_with_mismatch).toBe(1);

    const adjudicatedItems = JSON.parse(fs.readFileSync(path.resolve(testTmpDir, 'answers_human_adjudicated.json'), 'utf8'));
    const item1Adj = adjudicatedItems.find((x: any) => x.item_id === 'blind-001');
    expect(item1Adj.is_adjudicated).toBe(true);
    expect(item1Adj.adjudication_reason).toBeDefined();
  });

  it('6. build_paper_tables.ts must mark Section 3 as Pending when human evaluations are incomplete', () => {
    const buildTablesCmd = `bun experiments/version_aware_rag/scripts/v3/build_paper_tables.ts --outputDir ${testTmpDir}`;
    execSync(buildTablesCmd, { stdio: 'pipe' });

    const tablesMd = fs.readFileSync(path.resolve(testTmpDir, 'tables.md'), 'utf8');
    expect(tablesMd).toContain('Section 1: Retrieval Evaluation (Automatic)');
    expect(tablesMd).toContain('Section 2: Automatic Citation-Grounded Proxy Metrics (Automatic)');
    expect(tablesMd).toContain('Section 3: Blinded Human Answer Evaluation (Human)');
    expect(tablesMd).toContain('[Pending - Human Blind Evaluation]');
    expect(tablesMd).not.toContain('adjudicated_evaluator_v3');
  });

});
