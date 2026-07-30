import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { performAudit } from './audit_v4_candidate_coverage';

describe('Phase 1 Audit Revision 1 Unit Tests', () => {
  const rootDir = process.cwd();
  const corpusPath = path.join(rootDir, 'experiments/version_aware_rag/data/corpus_v3/chunks.jsonl');
  const candidatePairsPath = path.join(rootDir, 'experiments/version_aware_rag/data/annotations_v4/candidate_relation_pairs_v4.jsonl');
  const auditScriptPath = path.join(rootDir, 'experiments/version_aware_rag/scripts/v4/audit_v4_candidate_coverage.ts');
  const jsonReportPath = path.join(rootDir, 'experiments/version_aware_rag/results/v4/preregistration/relation_lineage_inventory.json');
  const mdReportPath = path.join(rootDir, 'experiments/version_aware_rag/results/v4/preregistration/relation_lineage_inventory.md');

  it('should not contain hardcoded capacity numbers in audit script source code', () => {
    const code = fs.readFileSync(auditScriptPath, 'utf-8');
    expect(code).not.toContain('estimatedQueriesFromExisting51Pairs');
    expect(code).not.toContain('estimatedNewQueriesIfAnnotatingMorePairs');
    expect(code).not.toMatch(/=\s*41\b/);
    expect(code).not.toMatch(/=\s*95\b/);
  });

  it('should verify that all candidate pair chunk IDs exist in frozen corpus and excerpts are verbatim substrings', () => {
    const chunkLines = fs.readFileSync(corpusPath, 'utf-8').trim().split('\n');
    const chunkMap = new Map<string, any>();
    for (const line of chunkLines) {
      if (!line.trim()) continue;
      const c = JSON.parse(line);
      chunkMap.set(c.chunk_id, c);
    }

    const candidateLines = fs.readFileSync(candidatePairsPath, 'utf-8').trim().split('\n');
    expect(candidateLines.length).toBeGreaterThan(0);

    for (const line of candidateLines) {
      if (!line.trim()) continue;
      const pair = JSON.parse(line);

      const oldChunk = chunkMap.get(pair.old_chunk_id);
      const newChunk = chunkMap.get(pair.new_chunk_id);

      expect(oldChunk).toBeDefined();
      expect(newChunk).toBeDefined();

      expect(oldChunk.text).toContain(pair.old_excerpt);
      expect(newChunk.text).toContain(pair.new_excerpt);
    }
  });

  it('should execute performAudit() and produce 100% consistent JSON and Markdown reports with corpus data', () => {
    const auditData = performAudit(rootDir);
    expect(fs.existsSync(jsonReportPath)).toBe(true);
    expect(fs.existsSync(mdReportPath)).toBe(true);

    const jsonContent = JSON.parse(fs.readFileSync(jsonReportPath, 'utf-8'));
    const mdContent = fs.readFileSync(mdReportPath, 'utf-8');

    // Corpus consistency checks
    expect(jsonContent.metadata.total_chunks).toBe(583);
    expect(jsonContent.chunk_inventory.edition_distribution['2015-2020']).toBe(514);
    expect(jsonContent.chunk_inventory.edition_distribution['2020-2025']).toBe(56);
    expect(jsonContent.chunk_inventory.edition_distribution['2025-2030']).toBe(13);
    expect(jsonContent.chunk_inventory.lineage_id_coverage_audit.null_lineage_count).toBe(478);

    // Dynamic capacity calculation checks
    const candPairsCount = jsonContent.dynamic_capacity_analysis.candidate_relation_pairs_count;
    const queryIntentsCount = jsonContent.dynamic_capacity_analysis.total_supported_candidate_query_intents;

    expect(candPairsCount).toBeGreaterThanOrEqual(80);
    expect(queryIntentsCount).toBeGreaterThanOrEqual(80);
    expect(jsonContent.dynamic_capacity_analysis.requires_new_pdfs).toBe(false);
    expect(jsonContent.dynamic_capacity_analysis.requires_new_relation_annotations).toBe(true);

    // Markdown consistency checks
    expect(mdContent).toContain(`${candPairsCount} 筆`);
    expect(mdContent).toContain(`${queryIntentsCount} 題`);
    expect(mdContent).toContain('Topic Coverage');
    expect(mdContent).toContain('478 / 583 chunks');
    expect(mdContent).toContain('hard_negative');
  });
});
