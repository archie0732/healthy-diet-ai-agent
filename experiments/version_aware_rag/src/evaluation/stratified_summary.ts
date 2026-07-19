import { QueryMetrics } from './retrieval_metrics';
import { EvaluationQuery } from '../annotation/schema';

export interface StrataSummary {
  recall: number | null;
  precision: number | null;
  mrr: number;
  ndcg: number;
  preferred_hit_rate: number;
  required_recall: number | null;
  both_evidence_coverage: number | null;
  stale_hit_rate: number;
  compatible_recall: number | null;
  conditional_completeness: number | null;
  top1_safety_rate: number | null;
  avg_unsafe_chunks: number;
  query_count: number;
}

export interface FullEvaluationReport {
  overall: StrataSummary;
  by_strata: Record<string, StrataSummary>;
  queries: (QueryMetrics & { query_id: string; question: string; stratum: string })[];
}

function calculateAverage(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  const sum = valid.reduce((a, b) => a + b, 0);
  return parseFloat((sum / valid.length).toFixed(4));
}

function generateStrataSummary(
  items: (QueryMetrics & { query_id: string })[]
): StrataSummary {
  const query_count = items.length;

  return {
    recall: calculateAverage(items.map(i => i.recall)),
    precision: calculateAverage(items.map(i => i.precision)),
    mrr: calculateAverage(items.map(i => i.mrr)) || 0,
    ndcg: calculateAverage(items.map(i => i.ndcg)) || 0,
    preferred_hit_rate: calculateAverage(items.map(i => i.preferred_hit)) || 0,
    required_recall: calculateAverage(items.map(i => i.required_recall)),
    both_evidence_coverage: calculateAverage(items.map(i => i.both_evidence_coverage)),
    stale_hit_rate: calculateAverage(items.map(i => i.stale_hit)) || 0,
    compatible_recall: calculateAverage(items.map(i => i.compatible_recall)),
    conditional_completeness: calculateAverage(items.map(i => i.conditional_completeness)),
    top1_safety_rate: calculateAverage(items.map(i => i.top1_safety)),
    avg_unsafe_chunks: calculateAverage(items.map(i => i.unsafe_chunks_count)) || 0,
    query_count
  };
}

/**
 * Compiles a detailed stratified summary of retrieval evaluation results.
 */
export function compileStratifiedReport(
  queries: EvaluationQuery[],
  queryMetricsMap: Map<string, QueryMetrics>
): FullEvaluationReport {
  const queryList: (QueryMetrics & { query_id: string; question: string; stratum: string })[] = [];

  for (const q of queries) {
    const metrics = queryMetricsMap.get(q.query_id);
    if (metrics) {
      queryList.push({
        query_id: q.query_id,
        question: q.question,
        stratum: q.stratum,
        ...metrics
      });
    }
  }

  const overall = generateStrataSummary(queryList);

  const by_strata: Record<string, StrataSummary> = {};
  const strataTypes = ['current_only', 'compatible_history', 'conditional_merge', 'newer_irrelevant'];
  
  for (const stratum of strataTypes) {
    const stratumItems = queryList.filter(q => q.stratum === stratum);
    if (stratumItems.length > 0) {
      by_strata[stratum] = generateStrataSummary(stratumItems);
    }
  }

  return {
    overall,
    by_strata,
    queries: queryList
  };
}
