import * as fs from 'fs';
import * as path from 'path';
import { CorpusChunk } from './types';

export interface AuditReport {
  total_chunks: number;
  version_distribution: Record<string, number>;
  word_length_stats: {
    min: number;
    max: number;
    avg: number;
  };
  exact_duplicates: number;
  near_duplicates: number;
  null_lineage_count: number;
  null_lineage_rate: number;
  lineage_version_coverage: Record<string, Record<string, number>>;
  page_sequence_audit: Record<string, {
    min_page: number;
    max_page: number;
    missing_pages: number[];
    duplicate_pages: number[];
  }>;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getJaccardSimilarity(text1: string, text2: string): number {
  const set1 = new Set(text1.toLowerCase().split(/\W+/).filter(Boolean));
  const set2 = new Set(text2.toLowerCase().split(/\W+/).filter(Boolean));
  if (set1.size === 0 || set2.size === 0) return 0;
  
  let intersectionSize = 0;
  for (const item of set1) {
    if (set2.has(item)) {
      intersectionSize++;
    }
  }
  const unionSize = set1.size + set2.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Performs corpus validation and generates a detailed quality report.
 */
export function auditCorpus(chunksJsonlPath: string): AuditReport {
  if (!fs.existsSync(chunksJsonlPath)) {
    throw new Error(`Chunks JSONL not found for audit: ${chunksJsonlPath}`);
  }

  const content = fs.readFileSync(chunksJsonlPath, 'utf-8');
  const chunks: CorpusChunk[] = content
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));

  const total_chunks = chunks.length;
  const version_distribution: Record<string, number> = {};
  
  let minWords = Infinity;
  let maxWords = 0;
  let totalWords = 0;
  let null_lineage_count = 0;
  
  const docPages: Record<string, number[]> = {};
  const lineage_version_coverage: Record<string, Record<string, number>> = {};

  for (const chunk of chunks) {
    // Version distribution
    version_distribution[chunk.edition] = (version_distribution[chunk.edition] || 0) + 1;

    // Word counts
    const wc = wordCount(chunk.text);
    if (wc < minWords) minWords = wc;
    if (wc > maxWords) maxWords = wc;
    totalWords += wc;

    // Null lineage
    if (chunk.lineage_id === null) {
      null_lineage_count++;
    }

    // Trace page sequences per document
    if (!docPages[chunk.document_id]) {
      docPages[chunk.document_id] = [];
    }
    if (!docPages[chunk.document_id].includes(chunk.page_number)) {
      docPages[chunk.document_id].push(chunk.page_number);
    }

    // Lineage coverage
    const topics = chunk.topic_ids.length > 0 ? chunk.topic_ids : ['lineage-general'];
    for (const topic of topics) {
      if (!lineage_version_coverage[topic]) {
        lineage_version_coverage[topic] = {};
      }
      lineage_version_coverage[topic][chunk.edition] = (lineage_version_coverage[topic][chunk.edition] || 0) + 1;
    }
  }

  // Find exact and near duplicates
  let exact_duplicates = 0;
  let near_duplicates = 0;

  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const c1 = chunks[i];
      const c2 = chunks[j];
      if (c1.text === c2.text) {
        exact_duplicates++;
      } else {
        const jaccard = getJaccardSimilarity(c1.text, c2.text);
        if (jaccard >= 0.85) {
          near_duplicates++;
        }
      }
    }
  }

  // Page sequence auditing
  const page_sequence_audit: Record<string, any> = {};
  for (const [docId, pages] of Object.entries(docPages)) {
    pages.sort((a, b) => a - b);
    const min_page = pages[0] || 0;
    const max_page = pages[pages.length - 1] || 0;
    const missing_pages: number[] = [];
    const duplicate_pages: number[] = [];
    
    // Find missing pages
    for (let p = min_page; p <= max_page; p++) {
      if (!pages.includes(p)) {
        missing_pages.push(p);
      }
    }

    // Find duplicates (already filtered in docPages, but we can audit from raw chunk pages)
    const rawPages = chunks.filter(c => c.document_id === docId).map(c => c.page_number);
    const seen = new Set<number>();
    for (const p of rawPages) {
      if (seen.has(p)) {
        if (!duplicate_pages.includes(p)) {
          // Note: multiple passages on the same page is normal in passage chunking,
          // but we want to know if there are page number conflicts
        }
      }
      seen.add(p);
    }

    page_sequence_audit[docId] = {
      min_page,
      max_page,
      missing_pages,
      duplicate_pages
    };
  }

  return {
    total_chunks,
    version_distribution,
    word_length_stats: {
      min: minWords === Infinity ? 0 : minWords,
      max: maxWords,
      avg: total_chunks > 0 ? parseFloat((totalWords / total_chunks).toFixed(2)) : 0
    },
    exact_duplicates,
    near_duplicates,
    null_lineage_count,
    null_lineage_rate: total_chunks > 0 ? parseFloat((null_lineage_count / total_chunks).toFixed(2)) : 0,
    lineage_version_coverage,
    page_sequence_audit
  };
}
