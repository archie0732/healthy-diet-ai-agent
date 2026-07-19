import { QueryJudgment } from '../annotation/schema';

export interface QueryMetrics {
  recall: number | null;
  precision: number | null;
  mrr: number;
  ndcg: number;
  preferred_hit: number;
  required_recall: number | null;
  both_evidence_coverage: number | null;
  stale_hit: number;
  compatible_recall: number | null;
  conditional_completeness: number | null;
  top1_safety: number | null;
  unsafe_chunks_count: number;
}

function log2(x: number): number {
  return Math.log(x) / Math.log(2);
}

/**
 * Calculates all retrieval metrics for a single query.
 */
export function calculateQueryMetrics(
  retrievedIds: string[],
  j: QueryJudgment,
  k: number
): QueryMetrics {
  const kSlice = retrievedIds.slice(0, k);
  
  const reqSet = new Set(j.required_chunk_ids);
  const compSet = new Set(j.compatible_chunk_ids);
  const prefSet = new Set(j.preferred_chunk_ids);
  const depSet = new Set(j.deprecated_chunk_ids);
  const forbSet = new Set(j.forbidden_chunk_ids);
  const safeSet = new Set(j.citation_safe_chunk_ids);

  // Acceptable is union of required and compatible
  const accSet = new Set([...j.required_chunk_ids, ...j.compatible_chunk_ids]);

  // 1. Recall & Precision
  const accHits = kSlice.filter(id => accSet.has(id)).length;
  const recall = accSet.size > 0 ? accHits / accSet.size : null;
  const precision = kSlice.length > 0 ? accHits / kSlice.length : null;

  // 2. MRR
  let mrr = 0;
  for (let i = 0; i < kSlice.length; i++) {
    if (accSet.has(kSlice[i])) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  // 3. nDCG
  // Relevance: preferred = 2, acceptable = 1, others = 0
  const getRelevance = (id: string): number => {
    if (prefSet.has(id)) return 2;
    if (accSet.has(id)) return 1;
    return 0;
  };

  let dcg = 0;
  for (let i = 0; i < kSlice.length; i++) {
    const rel = getRelevance(kSlice[i]);
    dcg += rel / log2(i + 2); // rank index 1-based is i+1, so log2(rank + 1) is log2(i+2)
  }

  // Ideal Relevance sorted descending
  const idealRelevance = Array.from(accSet)
    .map(id => getRelevance(id))
    .sort((a, b) => b - a);

  let idcg = 0;
  const idcgLimit = Math.min(kSlice.length, idealRelevance.length);
  for (let i = 0; i < idcgLimit; i++) {
    idcg += idealRelevance[i] / log2(i + 2);
  }

  const ndcg = idcg > 0 ? dcg / idcg : 0;

  // 4. Preferred Hit
  const preferred_hit = kSlice.some(id => prefSet.has(id)) ? 1 : 0;

  // 5. Required Recall
  const reqHits = kSlice.filter(id => reqSet.has(id)).length;
  const required_recall = reqSet.size > 0 ? reqHits / reqSet.size : null;

  // 6. Both-Evidence Coverage
  let both_evidence_coverage: number | null = null;
  if (reqSet.size >= 2) {
    both_evidence_coverage = reqHits === reqSet.size ? 1 : 0;
  }

  // 7. Stale/Deprecated/Forbidden Hit
  const stale_hit = kSlice.some(id => depSet.has(id) || forbSet.has(id)) ? 1 : 0;

  // 8. Compatible History Recall
  const compHits = kSlice.filter(id => compSet.has(id)).length;
  const compatible_recall = compSet.size > 0 ? compHits / compSet.size : null;

  // 9. Conditional Completeness
  const conditional_completeness = required_recall;

  // 10. Top-1 Safety
  const top1_safety = kSlice.length > 0 ? (safeSet.has(kSlice[0]) ? 1 : 0) : null;

  // 11. Unsafe Chunks Count
  const unsafe_chunks_count = kSlice.filter(id => !safeSet.has(id)).length;

  return {
    recall,
    precision,
    mrr,
    ndcg,
    preferred_hit,
    required_recall,
    both_evidence_coverage,
    stale_hit,
    compatible_recall,
    conditional_completeness,
    top1_safety,
    unsafe_chunks_count
  };
}
